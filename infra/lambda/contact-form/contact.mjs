/**
 * The contact form's endpoint, POST /api/contact, as a pure module: no AWS SDK,
 * no process.env, no console. index.mjs injects the SES sender, the environment
 * and the logger, so every path here runs under test with fakes
 * (infra/test/contact-form.node-test.mjs).
 *
 * How a request arrives: the page POSTs JSON to its own origin, CloudFront
 * routes /api/* to this function's URL (auth type AWS_IAM) through Origin
 * Access Control, and OAC signs the origin request with the body hash the
 * browser sends as x-amz-content-sha256. The event is a Lambda function URL
 * event, payload format 2.0: the method is in requestContext.http.method,
 * header names are lowercase, and the body may be base64 (isBase64Encoded).
 *
 * Every response is JSON with `cache-control: no-store`, and none is a 404: the
 * distribution maps 404 to the site's HTML error page, which the form could
 * not read.
 *
 *   200 {"ok":true}                                    emailed; also when the honeypot is filled (nothing sent)
 *   400 {"ok":false,"error":"invalid","fields":[...]}  fields missing, too long or of the wrong type, in form
 *                                                      order; [] when the body is not a JSON object, or the
 *                                                      path is not /api/contact
 *   403 {"ok":false,"error":"origin"}                  an Origin header that is not in ALLOWED_ORIGINS
 *   405 {"ok":false,"error":"method"}                  anything but POST
 *   413 {"ok":false,"error":"too_large"}               a body over MAX_BODY_BYTES bytes of UTF-8 (the WAF's core
 *                                                      rule set has an 8 KB body rule too, set to count, not
 *                                                      block, so that this answer reaches the browser)
 *   415 {"ok":false,"error":"content_type"}            not application/json (charset, if given, utf-8)
 *   500 {"ok":false,"error":"server"}                  SES failed, or TO_ADDRESS / FROM_ADDRESS is not set
 *
 * The rules mirror validate() and CONTACT_LIMITS in src/lib/contactForm.ts, and
 * the English labels mirror COPY.en.contact.form in src/content/copy.ts. The
 * test file reads both and fails when they drift apart.
 *
 * Privacy: each request writes exactly one log line, JSON with the request id
 * and an outcome. Nothing a visitor typed is ever logged; the only extras are
 * the names of invalid fields (from FIELDS) and an AWS SDK error class name.
 */

import { domainToASCII } from 'node:url'

/**
 * The one path this function serves, compared with the raw path exactly.
 * CloudFront sends all of /api/* here, but the WAF's contact rate limit is
 * scoped to paths starting /api/contact (URL-decoded, normalized and
 * lowercased first), so serving any other path would let a bot post around
 * that limit.
 */
export const CONTACT_PATH = '/api/contact'

/** Cap on the whole request body, in bytes of UTF-8 after base64 decoding. */
export const MAX_BODY_BYTES = 8192

/**
 * Most characters per free-text field, counted as UTF-16 code units (what
 * `maxLength` and `.length` count) on the trimmed value. 254 is the longest
 * address SMTP delivers to (RFC 5321).
 */
export const LIMITS = Object.freeze({ name: 200, email: 254, phone: 40, message: 4000 })

/** A phone number, when given, needs at least this many ASCII digits. */
export const MIN_PHONE_DIGITS = 7

/** Same pattern as the form's, tested on the trimmed address. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const LANGUAGES = Object.freeze(['en', 'es'])

/** COPY.en.contact.form.audienceOptions: the keys are the payload's `audience` values. */
export const AUDIENCE_LABELS = Object.freeze({
  resident: 'Neighbor or resident',
  'home-help': 'Looking for help with my home',
  supporter: 'Interested in supporting the partnership',
  organization: 'Partner or community organization',
  media: 'Media',
  other: 'Other',
})

/** COPY.en.contact.form.mailFieldLabels, plus `message` (COPY.en.contact.form.message). */
export const FIELD_LABELS = Object.freeze({
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  language: 'Preferred language',
  audience: 'I am a',
  updates: 'Keep me updated',
  yes: 'Yes',
  no: 'No',
  message: 'Message',
})

/** The email's subject is this, a colon, and the audience label. */
export const SUBJECT = 'New message from the OSEP website'

/** Payload keys in the order the form shows them; a 400 lists offenders in this order. */
export const FIELDS = Object.freeze([
  'name',
  'email',
  'phone',
  'preferredLanguage',
  'audience',
  'message',
  'updates',
  'pageLanguage',
  'website',
])

const LANGUAGE_NAMES = Object.freeze({ en: 'English', es: 'Spanish' })
const PAGE_LANGUAGE_LABEL = 'Page language'
const AUDIENCE_KEYS = Object.freeze(Object.keys(AUDIENCE_LABELS))

const OK = Object.freeze({ ok: true })
const SERVER_ERROR = Object.freeze({ ok: false, error: 'server' })
const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json', 'cache-control': 'no-store' })

/** Control characters, including CR, LF, NEL and the Unicode line and paragraph separators. */
const HEADER_UNSAFE = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/g
const LINE_BREAKS = /[\r\n\v\f\u0085\u2028\u2029]+/g

/** Removes everything that could end or fold an email header line. */
function headerSafe(value) {
  return String(value).replace(HEADER_UNSAFE, '')
}

/**
 * What SES accepts in an address header. SES does not support SMTPUTF8: every
 * address must be 7-bit ASCII, with a non-ASCII domain in Punycode, and it
 * refuses the whole SendEmail call otherwise. EMAIL_PATTERN (shared with the
 * form) is far looser than that, deliberately: it must accept every address a
 * visitor can really have, accented ones included. So the Reply-To header gets
 * only an address in this stricter shape: a dot-atom local part of at most 64
 * characters (RFC 5321) and a domain of letter-digit-hyphen labels whose last
 * label is alphabetic or Punycode.
 */
const ASCII_LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const ASCII_DOMAIN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/
const ASCII_ONLY = /^[\x20-\x7e]*$/

/**
 * The visitor's address as SES can carry it in Reply-To, or null when it has
 * no such form. A non-ASCII domain is converted to Punycode
 * (ana@españa.es -> ana@xn--espaa-rta.es), which is the same mailbox; a
 * non-ASCII local part (maría@example.com) has no ASCII equivalent, so that
 * email goes out without Reply-To and the address stays in the body.
 */
function replyToAddress(email) {
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length > 64 || !ASCII_LOCAL_PART.test(local)) return null
  const asciiDomain = ASCII_ONLY.test(domain) ? domain : domainToASCII(domain)
  if (asciiDomain.length > 253 || !ASCII_DOMAIN.test(asciiDomain)) return null
  const address = `${local}@${asciiDomain}`
  return address.length <= LIMITS.email ? address : null
}

/** Puts a single-line field on one line, so a pasted newline cannot forge another "Label: value" row. */
function oneLine(value) {
  return String(value).replace(LINE_BREAKS, ' ')
}

function isJsonObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Checks a parsed request body against the form's rules.
 *
 * Strings are trimmed and nothing else is coerced: `updates: "true"` or
 * `phone: null` is a wrong type, not a value to guess at. `phone`, `updates`
 * and `website` may be left out (read as '', false and ''); every other field
 * is required. Keys outside FIELDS are ignored and never reach the email.
 *
 * @param {unknown} payload the result of JSON.parse
 * @returns {{ ok: true, value: {
 *     name: string, email: string, phone: string, preferredLanguage: 'en' | 'es',
 *     audience: keyof typeof AUDIENCE_LABELS, message: string, updates: boolean,
 *     pageLanguage: 'en' | 'es', website: string } }
 *   | { ok: false, fields: string[] }} `fields` is in FIELDS order, and empty
 *   when the payload is not a JSON object at all
 */
export function validate(payload) {
  if (!isJsonObject(payload)) return { ok: false, fields: [] }
  const invalid = new Set()
  // Own keys only: `audience: "toString"` must not find something on Object.prototype.
  const read = (key) => (Object.hasOwn(payload, key) ? payload[key] : undefined)
  const text = (key, { optional = false } = {}) => {
    const raw = read(key)
    if (raw === undefined && optional) return ''
    if (typeof raw !== 'string') {
      invalid.add(key)
      return ''
    }
    return raw.trim()
  }
  const oneOf = (key, allowed) => {
    const value = text(key)
    if (!allowed.includes(value)) invalid.add(key)
    return value
  }

  const name = text('name')
  if (!name || name.length > LIMITS.name) invalid.add('name')

  const email = text('email')
  if (!email || email.length > LIMITS.email || !EMAIL_PATTERN.test(email)) invalid.add('email')

  const phone = text('phone', { optional: true })
  if (phone && (phone.length > LIMITS.phone || phone.replace(/\D/g, '').length < MIN_PHONE_DIGITS)) {
    invalid.add('phone')
  }

  const preferredLanguage = oneOf('preferredLanguage', LANGUAGES)
  const audience = oneOf('audience', AUDIENCE_KEYS)

  const message = text('message')
  if (!message || message.length > LIMITS.message) invalid.add('message')

  // Absent reads as the default; present must be the right type (null is not a boolean).
  const updates = read('updates') === undefined ? false : read('updates')
  if (typeof updates !== 'boolean') invalid.add('updates')

  const pageLanguage = oneOf('pageLanguage', LANGUAGES)

  const website = read('website') === undefined ? '' : read('website')
  if (typeof website !== 'string') invalid.add('website')

  if (invalid.size > 0) return { ok: false, fields: FIELDS.filter((field) => invalid.has(field)) }
  return {
    ok: true,
    value: { name, email, phone, preferredLanguage, audience, message, updates, pageLanguage, website },
  }
}

/**
 * The notification email for a validated submission: plain text, English
 * labels, every field. Reply-To is the visitor's address, so answering the
 * email answers them. It is left off when the address has no form SES accepts
 * in a header (replyToAddress above): a non-ASCII local part, quotes, commas,
 * angle brackets or a control character. SES would refuse the whole send over
 * such a Reply-To, so the message would be lost and the server-error alarm
 * would fire; without it the message arrives, and the address is in the body.
 */
function buildEmail(value, { from, to }, requestId) {
  const labels = FIELD_LABELS
  const audience = AUDIENCE_LABELS[value.audience]
  const replyTo = replyToAddress(value.email)
  const canReply = replyTo !== null
  const text = [
    'Someone wrote to the partnership through the contact form on the OSEP website.',
    '',
    `${labels.name}: ${oneLine(value.name)}`,
    `${labels.email}: ${oneLine(value.email)}`,
    `${labels.phone}: ${oneLine(value.phone) || '-'}`,
    `${labels.language}: ${LANGUAGE_NAMES[value.preferredLanguage]}`,
    `${labels.audience}: ${audience}`,
    `${labels.updates}: ${value.updates ? labels.yes : labels.no}`,
    `${PAGE_LANGUAGE_LABEL}: ${LANGUAGE_NAMES[value.pageLanguage]}`,
    '',
    `${labels.message}:`,
    value.message,
    '',
    '--',
    canReply
      ? 'Reply to this email to answer them.'
      : 'This email has no Reply-To: write to the address above to answer them.',
    `Reference: ${oneLine(requestId)}`,
  ].join('\n')
  return {
    from,
    to,
    ...(canReply ? { replyTo } : {}),
    subject: headerSafe(`${SUBJECT}: ${audience}`),
    text,
  }
}

/** The environment, read once. An address with a control character in it counts as unset. */
function readConfig(env) {
  const address = (raw) => {
    const value = String(raw ?? '').trim()
    return EMAIL_PATTERN.test(value) && headerSafe(value) === value ? value : null
  }
  const from = address(env.FROM_ADDRESS)
  const to = address(env.TO_ADDRESS)
  const allowedOrigins = new Set(
    String(env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map(normalizeOrigin)
      .filter(Boolean),
  )
  return { from, to, allowedOrigins, canSend: from !== null && to !== null }
}

/** `https://WWW.Example.org/` and `https://www.example.org` are the same origin. */
function normalizeOrigin(value) {
  return String(value).trim().toLowerCase().replace(/\/+$/, '')
}

/** Function URL events lowercase header names already; this also copes with a hand-written test event. */
function headerOf(headers, name) {
  if (!isJsonObject(headers)) return undefined
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) return headers[key] == null ? undefined : String(headers[key])
  }
  return undefined
}

/** `application/json`, any case, with no charset or a UTF-8 one. */
function isJsonContentType(value) {
  if (value === undefined) return false
  const [mediaType, ...params] = value.split(';')
  if (mediaType.trim().toLowerCase() !== 'application/json') return false
  return params.every((param) => {
    const [key, raw = ''] = param.split('=')
    if (key.trim().toLowerCase() !== 'charset') return true
    const charset = raw.trim().replace(/^"(.*)"$/, '$1').toLowerCase()
    return charset === 'utf-8' || charset === 'utf8'
  })
}

function bodyBytes(event) {
  const body = typeof event.body === 'string' ? event.body : ''
  return event.isBase64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body, 'utf8')
}

const NOT_JSON = Symbol('not JSON')

/** Strict UTF-8 then JSON. Never surfaces the parser's error, which quotes the body. */
function parseJson(bytes) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return NOT_JSON
  }
}

function requestIdOf(event, context) {
  const raw = context?.awsRequestId ?? event?.requestContext?.requestId ?? ''
  return String(raw).replace(/[^\w-]/g, '').slice(0, 64) || 'unknown'
}

/** An AWS SDK error's class name (MessageRejected, ThrottlingException...): never its message, which can quote addresses. */
function errorNameOf(error) {
  const name = error?.name
  return typeof name === 'string' && /^[A-Za-z][\w.]{0,63}$/.test(name) ? name : 'Error'
}

/**
 * Builds the Lambda handler.
 *
 * @param {object} deps
 * @param {(message: { from: string, to: string, replyTo?: string, subject: string, text: string }) => Promise<unknown>} deps.sendEmail
 *   Sends one plain-text email; rejects on failure.
 * @param {Record<string, string | undefined>} deps.env
 *   TO_ADDRESS (the partnership's inbox), FROM_ADDRESS (an address on the SES
 *   domain identity) and ALLOWED_ORIGINS (comma-separated, e.g.
 *   "https://www.oseptoledo.org,https://oseptoledo.org"). An empty
 *   ALLOWED_ORIGINS refuses every request that carries an Origin header, which
 *   every browser POST does: fail closed, not open.
 * @param {(line: string) => void} [deps.log] receives one JSON line per request
 * @returns {(event: object, context?: { awsRequestId?: string }) => Promise<{
 *   statusCode: number, headers: Record<string, string>, body: string }>}
 */
export function createHandler({ sendEmail, env = {}, log = (line) => console.log(line) } = {}) {
  if (typeof sendEmail !== 'function') throw new TypeError('createHandler: sendEmail must be a function')
  if (typeof log !== 'function') throw new TypeError('createHandler: log must be a function')
  const config = readConfig(env ?? {})

  return async function handler(event, context) {
    const requestId = requestIdOf(event, context)

    const reply = (statusCode, body, outcome, details = {}, headers = {}) => {
      try {
        log(JSON.stringify({ requestId, outcome, ...details }))
      } catch {
        // A broken logger must not turn a delivered message into a reported failure.
      }
      return { statusCode, headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify(body) }
    }
    const invalid = (fields, outcome) =>
      reply(400, { ok: false, error: 'invalid', fields }, outcome, outcome === 'invalid' ? { fields } : {})

    try {
      if (event?.requestContext?.http?.method !== 'POST') {
        return reply(405, { ok: false, error: 'method' }, 'method_not_allowed', {}, { allow: 'POST' })
      }
      if (event.rawPath !== CONTACT_PATH) return invalid([], 'unknown_path')

      // No Origin is fine (curl, server-side callers); a browser always sends one with a POST.
      const origin = headerOf(event.headers, 'origin')
      if (origin !== undefined && !config.allowedOrigins.has(normalizeOrigin(origin))) {
        return reply(403, { ok: false, error: 'origin' }, 'origin_rejected')
      }

      if (!isJsonContentType(headerOf(event.headers, 'content-type'))) {
        return reply(415, { ok: false, error: 'content_type' }, 'unsupported_content_type')
      }

      // Measured as bytes after base64 decoding and before parsing.
      const bytes = bodyBytes(event)
      if (bytes.byteLength > MAX_BODY_BYTES) return reply(413, { ok: false, error: 'too_large' }, 'too_large')

      const payload = parseJson(bytes)
      if (!isJsonObject(payload)) return invalid([], 'invalid_json')

      // Honeypot: a bot that fills every input fills this hidden one too. Same
      // rule as the form (any non-empty value), checked before the other
      // fields so a bot learns nothing from a 400.
      const honeypot = Object.hasOwn(payload, 'website') ? payload.website : ''
      if (typeof honeypot === 'string' && honeypot !== '') return reply(200, OK, 'honeypot')

      const result = validate(payload)
      if (!result.ok) return invalid(result.fields, 'invalid')

      if (!config.canSend) return reply(500, SERVER_ERROR, 'misconfigured')

      try {
        await sendEmail(buildEmail(result.value, config, requestId))
      } catch (error) {
        return reply(500, SERVER_ERROR, 'send_failed', { errorName: errorNameOf(error) })
      }
      return reply(200, OK, 'sent')
    } catch (error) {
      return reply(500, SERVER_ERROR, 'error', { errorName: errorNameOf(error) })
    }
  }
}
