// Unit tests for the contact-form Lambda (infra/lambda/contact-form).
// Run from infra/: node --test test/contact-form.node-test.mjs
// No npm dependencies: node:test, node:assert and an injected fake sendEmail.
// index.mjs is loaded against an in-process fake of @aws-sdk/client-sesv2.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import * as nodeModule from 'node:module'

import {
  AUDIENCE_LABELS,
  CONTACT_PATH,
  EMAIL_PATTERN,
  FIELDS,
  FIELD_LABELS,
  LIMITS,
  MAX_BODY_BYTES,
  MIN_PHONE_DIGITS,
  SUBJECT,
  createHandler,
  validate,
} from '../lambda/contact-form/contact.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGIN = 'https://www.oseptoledo.org'
const ENV = Object.freeze({
  TO_ADDRESS: 'admin@oseptoledo.org',
  FROM_ADDRESS: 'no-reply@oseptoledo.org',
  ALLOWED_ORIGINS: 'https://www.oseptoledo.org, https://oseptoledo.org',
})

function validPayload(overrides = {}) {
  return {
    name: 'Ana Pérez',
    email: 'ana@example.com',
    phone: '(419) 555-0100',
    preferredLanguage: 'es',
    audience: 'resident',
    message: 'Hello from the Old South End.',
    updates: true,
    pageLanguage: 'en',
    website: '',
    ...overrides,
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * A Lambda function URL event (payload format 2.0) as CloudFront forwards it.
 * `body` is the raw request body string; it defaults to the JSON of `payload`.
 * Passing `contentType: undefined` or `origin: undefined` leaves that header
 * out (a destructuring default would quietly put it back).
 */
function makeEvent(options = {}) {
  const { method = 'POST', path = CONTACT_PATH, payload = validPayload(), base64 = false, headers } = options
  const body = options.body ?? JSON.stringify(payload)
  const contentType = Object.hasOwn(options, 'contentType') ? options.contentType : 'application/json'
  const origin = Object.hasOwn(options, 'origin') ? options.origin : ORIGIN
  const bytes = Buffer.from(body, 'utf8')
  const defaultHeaders = { 'x-amz-content-sha256': sha256(bytes) }
  if (contentType !== undefined) defaultHeaders['content-type'] = contentType
  if (origin !== undefined) defaultHeaders.origin = origin
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: headers ?? defaultHeaders,
    requestContext: {
      requestId: 'url-request-id',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '203.0.113.9', userAgent: 'node-test' },
    },
    body: base64 ? bytes.toString('base64') : body,
    isBase64Encoded: base64,
  }
}

/** A handler wired to fakes, plus everything it sent and logged. */
function setup({ env = ENV, fail, log } = {}) {
  const sent = []
  const logs = []
  const handler = createHandler({
    env,
    log: log ?? ((line) => logs.push(line)),
    sendEmail: async (message) => {
      if (fail) throw fail
      sent.push(message)
      return { MessageId: 'fake' }
    },
  })
  let count = 0
  const call = (event) => handler(event, { awsRequestId: `req-${++count}` })
  return { call, sent, logs, handler }
}

function assertJson(response, statusCode, body) {
  assert.equal(response.statusCode, statusCode)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(response.body), body)
}

const OK = { ok: true }
const invalid = (fields) => ({ ok: false, error: 'invalid', fields })
const SERVER = { ok: false, error: 'server' }

/** JSON of `payload` padded with trailing whitespace (still valid JSON) to exactly `bytes` bytes of UTF-8. */
function bodyOfExactly(bytes, payload = validPayload()) {
  const json = JSON.stringify(payload)
  const size = Buffer.byteLength(json, 'utf8')
  assert.ok(size <= bytes, `payload is already ${size} bytes`)
  return json + ' '.repeat(bytes - size)
}

const lastLog = (logs) => JSON.parse(logs.at(-1))

// ---------------------------------------------------------------------------
// 200: accepted and emailed
// ---------------------------------------------------------------------------

describe('200: a valid message is emailed', () => {
  it('answers {"ok":true} and sends one email built from every field', async () => {
    const { call, sent, logs } = setup()
    const response = await call(makeEvent())
    assertJson(response, 200, OK)
    assert.equal(sent.length, 1)
    const [email] = sent
    assert.equal(email.from, 'no-reply@oseptoledo.org')
    assert.equal(email.to, 'admin@oseptoledo.org')
    assert.equal(email.replyTo, 'ana@example.com')
    assert.equal(email.subject, 'New message from the OSEP website: Neighbor or resident')
    const lines = email.text.split('\n')
    for (const line of [
      'Name: Ana Pérez',
      'Email: ana@example.com',
      'Phone: (419) 555-0100',
      'Preferred language: Spanish',
      'I am a: Neighbor or resident',
      'Keep me updated: Yes',
      'Page language: English',
      'Message:',
      'Hello from the Old South End.',
      'Reply to this email to answer them.',
      'Reference: req-1',
    ]) {
      assert.ok(lines.includes(line), `email text is missing the line ${JSON.stringify(line)}`)
    }
    assert.deepEqual(lastLog(logs), { requestId: 'req-1', outcome: 'sent' })
  })

  it('puts each audience label in the subject', async () => {
    for (const [audience, label] of Object.entries(AUDIENCE_LABELS)) {
      const { call, sent } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ audience }) })), 200, OK)
      assert.equal(sent[0].subject, `${SUBJECT}: ${label}`)
      assert.ok(sent[0].text.split('\n').includes(`I am a: ${label}`))
    }
  })

  it('reads a left-out phone, updates and website as "", false and ""', async () => {
    const { call, sent } = setup()
    const payload = validPayload()
    delete payload.phone
    delete payload.updates
    delete payload.website
    assertJson(await call(makeEvent({ payload })), 200, OK)
    const lines = sent[0].text.split('\n')
    assert.ok(lines.includes('Phone: -'))
    assert.ok(lines.includes('Keep me updated: No'))
  })

  it('trims every string before checking and sending it', async () => {
    const { call, sent } = setup()
    const payload = validPayload({
      name: '  Ana  ',
      email: '\r\n ana@example.com \t',
      phone: ' 419 555 0100 ',
      audience: ' media ',
      preferredLanguage: ' en',
      pageLanguage: 'es ',
      message: '\n  Hi there.  \n',
    })
    assertJson(await call(makeEvent({ payload })), 200, OK)
    const [email] = sent
    assert.equal(email.replyTo, 'ana@example.com')
    assert.equal(email.subject, `${SUBJECT}: Media`)
    const lines = email.text.split('\n')
    for (const line of ['Name: Ana', 'Phone: 419 555 0100', 'Preferred language: English', 'Page language: Spanish', 'Hi there.']) {
      assert.ok(lines.includes(line), `missing ${JSON.stringify(line)}`)
    }
  })

  it('ignores keys it does not know, and keeps them out of the email', async () => {
    const { call, sent } = setup()
    const payload = validPayload({ extra: 'UNKNOWN-FIELD-VALUE', admin: true })
    assertJson(await call(makeEvent({ payload })), 200, OK)
    assert.ok(!sent[0].text.includes('UNKNOWN-FIELD-VALUE'))
  })

  it('accepts a base64-encoded body', async () => {
    const { call, sent } = setup()
    assertJson(await call(makeEvent({ base64: true })), 200, OK)
    assert.equal(sent.length, 1)
  })

  it('accepts application/json with a UTF-8 charset, in any case', async () => {
    for (const contentType of [
      'application/json',
      'application/json; charset=utf-8',
      'Application/JSON; Charset=UTF-8',
      'application/json;charset="utf-8"',
      'application/json; charset=utf8',
    ]) {
      const { call } = setup()
      assertJson(await call(makeEvent({ contentType })), 200, OK)
    }
  })

  it('round-trips Spanish text, accents, punctuation and emoji, plain and base64', async () => {
    const name = 'José Ñúñez-Peña'
    const message = '¿Pueden ayudarme? Mi casa necesita reparación.\nSegunda línea: “gracias” — muy amable 🏠'
    for (const base64 of [false, true]) {
      const { call, sent } = setup()
      const payload = validPayload({ name, message, audience: 'home-help', preferredLanguage: 'es', pageLanguage: 'es' })
      assertJson(await call(makeEvent({ payload, base64 })), 200, OK)
      const [email] = sent
      assert.ok(email.text.includes(`Name: ${name}\n`))
      assert.ok(email.text.includes(`\nMessage:\n${message}\n`))
      assert.equal(email.subject, `${SUBJECT}: Looking for help with my home`)
    }
  })

  it('fits a 4000-character Spanish message well inside the byte cap', async () => {
    const sentence = 'Necesito ayuda con la reparación del techo de mi casa en el Old South End. ¿Podrían llamarme? '
    const message = sentence.repeat(Math.ceil(LIMITS.message / sentence.length)).slice(0, LIMITS.message).trim()
    const body = JSON.stringify(validPayload({ message }))
    assert.ok(Buffer.byteLength(body) < MAX_BODY_BYTES)
    const { call, sent } = setup()
    assertJson(await call(makeEvent({ body })), 200, OK)
    assert.equal(sent.length, 1)
  })
})

// ---------------------------------------------------------------------------
// Honeypot
// ---------------------------------------------------------------------------

describe('honeypot', () => {
  it('answers {"ok":true} and sends nothing when website is filled', async () => {
    for (const website of ['https://spam.example', ' ']) {
      const { call, sent, logs } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ website }) })), 200, OK)
      assert.equal(sent.length, 0)
      assert.equal(lastLog(logs).outcome, 'honeypot')
    }
  })

  it('answers {"ok":true} even when the bot got the other fields wrong', async () => {
    const { call, sent } = setup()
    const payload = { website: 'https://spam.example', name: 42, email: 'nope' }
    assertJson(await call(makeEvent({ payload })), 200, OK)
    assert.equal(sent.length, 0)
  })
})

// ---------------------------------------------------------------------------
// 405, 403, 415, 413
// ---------------------------------------------------------------------------

describe('405: anything but POST', () => {
  it('refuses other methods with an Allow header and sends nothing', async () => {
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'post']) {
      const { call, sent, logs } = setup()
      const response = await call(makeEvent({ method }))
      assertJson(response, 405, { ok: false, error: 'method' })
      assert.equal(response.headers.allow, 'POST')
      assert.equal(sent.length, 0)
      assert.equal(lastLog(logs).outcome, 'method_not_allowed')
    }
  })

  it('treats an event without a method as not POST', async () => {
    const { call } = setup()
    for (const event of [undefined, null, {}, { requestContext: {} }, { requestContext: { http: {} } }]) {
      assertJson(await call(event), 405, { ok: false, error: 'method' })
    }
  })
})

describe('403: Origin', () => {
  it('refuses an Origin outside ALLOWED_ORIGINS', async () => {
    for (const origin of ['https://evil.example', 'null', '', 'http://www.oseptoledo.org', 'https://www.oseptoledo.org.evil.example']) {
      const { call, sent, logs } = setup()
      assertJson(await call(makeEvent({ origin })), 403, { ok: false, error: 'origin' })
      assert.equal(sent.length, 0)
      assert.equal(lastLog(logs).outcome, 'origin_rejected')
    }
  })

  it('accepts every listed origin, ignoring case and a trailing slash', async () => {
    for (const origin of ['https://www.oseptoledo.org', 'https://oseptoledo.org', 'HTTPS://WWW.OSEPTOLEDO.ORG/']) {
      const { call } = setup()
      assertJson(await call(makeEvent({ origin })), 200, OK)
    }
  })

  it('accepts a request with no Origin header', async () => {
    const { call, sent } = setup()
    const event = makeEvent({ origin: undefined })
    assert.ok(!('origin' in event.headers))
    assertJson(await call(event), 200, OK)
    assert.equal(sent.length, 1)
  })

  it('fails closed when ALLOWED_ORIGINS is empty', async () => {
    const { call, sent } = setup({ env: { ...ENV, ALLOWED_ORIGINS: '' } })
    assertJson(await call(makeEvent()), 403, { ok: false, error: 'origin' })
    assertJson(await call(makeEvent({ origin: undefined })), 200, OK)
    assert.equal(sent.length, 1)
  })

  it('finds the Origin header whatever its case', async () => {
    const { call } = setup()
    const headers = { 'Content-Type': 'application/json', Origin: 'https://evil.example' }
    assertJson(await call(makeEvent({ headers })), 403, { ok: false, error: 'origin' })
  })
})

describe('415: Content-Type', () => {
  it('refuses anything that is not JSON in UTF-8', async () => {
    for (const contentType of [
      undefined,
      '',
      'text/plain',
      'text/plain;charset=UTF-8',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
      'application/jsonp',
      'application/json-patch+json',
      'application/json; charset=iso-8859-1',
    ]) {
      const { call, sent, logs } = setup()
      assertJson(await call(makeEvent({ contentType })), 415, { ok: false, error: 'content_type' })
      assert.equal(sent.length, 0)
      assert.equal(lastLog(logs).outcome, 'unsupported_content_type')
    }
  })
})

describe('413: body size', () => {
  it('accepts exactly MAX_BODY_BYTES bytes and refuses one more', async () => {
    assert.equal(MAX_BODY_BYTES, 8192)
    const ok = setup()
    assertJson(await ok.call(makeEvent({ body: bodyOfExactly(8192) })), 200, OK)
    assert.equal(ok.sent.length, 1)

    const big = setup()
    assertJson(await big.call(makeEvent({ body: bodyOfExactly(8193) })), 413, { ok: false, error: 'too_large' })
    assert.equal(big.sent.length, 0)
    assert.equal(lastLog(big.logs).outcome, 'too_large')
  })

  it('measures base64 bodies after decoding', async () => {
    const ok = setup()
    const event = makeEvent({ body: bodyOfExactly(8192), base64: true })
    assert.ok(event.body.length > 8192, 'the base64 text itself is longer than the cap')
    assertJson(await ok.call(event), 200, OK)

    const big = setup()
    assertJson(await big.call(makeEvent({ body: bodyOfExactly(8193), base64: true })), 413, { ok: false, error: 'too_large' })
  })

  it('counts bytes of UTF-8, not characters', async () => {
    // 3000 euro signs: within the 4000-character message limit, but 9000 bytes.
    const body = JSON.stringify(validPayload({ message: '€'.repeat(3000) }))
    assert.ok(body.length < 8192 && Buffer.byteLength(body) > 8192)
    const { call, sent } = setup()
    assertJson(await call(makeEvent({ body })), 413, { ok: false, error: 'too_large' })
    assert.equal(sent.length, 0)
  })

  it('checks the size before parsing, so an oversized non-JSON body is 413', async () => {
    const { call } = setup()
    assertJson(await call(makeEvent({ body: 'x'.repeat(9000) })), 413, { ok: false, error: 'too_large' })
  })
})

// ---------------------------------------------------------------------------
// 400
// ---------------------------------------------------------------------------

describe('400: body that is not a JSON object', () => {
  it('answers fields [] for unparseable or non-object JSON', async () => {
    for (const body of ['', 'not json', '{"name":', '[]', '[{"name":"Ana"}]', 'null', '"text"', '42', 'true']) {
      const { call, sent, logs } = setup()
      assertJson(await call(makeEvent({ body })), 400, invalid([]))
      assert.equal(sent.length, 0)
      assert.equal(lastLog(logs).outcome, 'invalid_json')
    }
  })

  it('answers fields [] for a missing body', async () => {
    const { call } = setup()
    const event = makeEvent()
    delete event.body
    assertJson(await call(event), 400, invalid([]))
  })

  it('refuses bytes that are not valid UTF-8', async () => {
    const { call } = setup()
    const event = makeEvent()
    event.body = Buffer.from([0x7b, 0x22, 0x6e, 0xff, 0xfe, 0x22, 0x7d]).toString('base64')
    event.isBase64Encoded = true
    assertJson(await call(event), 400, invalid([]))
  })
})

describe('400: fields', () => {
  it('lists every missing required field, in form order', async () => {
    const { call, sent, logs } = setup()
    const response = await call(makeEvent({ payload: {} }))
    const fields = ['name', 'email', 'preferredLanguage', 'audience', 'message', 'pageLanguage']
    assertJson(response, 400, invalid(fields))
    assert.equal(sent.length, 0)
    assert.deepEqual(lastLog(logs), { requestId: 'req-1', outcome: 'invalid', fields })
  })

  it('lists every field of the wrong type and coerces none', async () => {
    const { call } = setup()
    const payload = {
      name: 42,
      email: ['ana@example.com'],
      phone: null,
      preferredLanguage: 'fr',
      audience: 'robot',
      message: { text: 'hi' },
      updates: 'true',
      pageLanguage: 'EN',
      website: 0,
    }
    assertJson(await call(makeEvent({ payload })), 400, invalid([...FIELDS]))
  })

  it('refuses null for the optional fields rather than defaulting it', async () => {
    for (const field of ['phone', 'updates', 'website']) {
      const { call } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ [field]: null }) })), 400, invalid([field]))
    }
  })

  it('refuses updates that is not a boolean', async () => {
    for (const updates of ['true', 1, 0, 'yes', []]) {
      const { call } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ updates }) })), 400, invalid(['updates']))
    }
  })

  it('refuses blank name and message', async () => {
    const { call } = setup()
    const payload = validPayload({ name: '   ', message: '\n\t ' })
    assertJson(await call(makeEvent({ payload })), 400, invalid(['name', 'message']))
  })

  it('refuses malformed email addresses', async () => {
    for (const email of ['', 'ana', 'ana@example', '@example.com', 'ana example@example.com', 'ana@exa mple.com', 'ana@@example.com']) {
      const { call } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ email }) })), 400, invalid(['email']))
    }
  })

  it('refuses audience and language values outside their lists, including Object.prototype names', async () => {
    for (const audience of ['', 'Resident', 'toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      const { call } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ audience }) })), 400, invalid(['audience']))
    }
    for (const language of ['', 'EN', 'english', 'fr']) {
      const { call } = setup()
      const payload = validPayload({ preferredLanguage: language, pageLanguage: language })
      assertJson(await call(makeEvent({ payload })), 400, invalid(['preferredLanguage', 'pageLanguage']))
    }
  })

  it('reads only own keys, so "__proto__" in the JSON supplies nothing', async () => {
    const { call } = setup()
    const body =
      '{"__proto__":{"name":"Ana","email":"ana@example.com","preferredLanguage":"en","audience":"resident","message":"Hi","pageLanguage":"en"}}'
    const response = await call(makeEvent({ body }))
    assertJson(response, 400, invalid(['name', 'email', 'preferredLanguage', 'audience', 'message', 'pageLanguage']))
  })

  it('answers fields [] for a POST to any path but /api/contact, and never 404', async () => {
    for (const path of ['/api/contact/', '/api/Contact', '/api/other', '/api/%63ontact', '/']) {
      const { call, sent, logs } = setup()
      assertJson(await call(makeEvent({ path })), 400, invalid([]))
      assert.equal(sent.length, 0)
      assert.equal(lastLog(logs).outcome, 'unknown_path')
    }
  })
})

describe('400: limits at the boundary', () => {
  const cases = [
    ['name', 'a'.repeat(LIMITS.name), 'a'.repeat(LIMITS.name + 1)],
    ['email', `${'a'.repeat(LIMITS.email - '@example.com'.length)}@example.com`, `${'a'.repeat(LIMITS.email - '@example.com'.length + 1)}@example.com`],
    ['phone', '1'.repeat(LIMITS.phone), '1'.repeat(LIMITS.phone + 1)],
    ['message', 'a'.repeat(LIMITS.message), 'a'.repeat(LIMITS.message + 1)],
  ]

  it('has the limits the contract names', () => {
    assert.deepEqual({ ...LIMITS }, { name: 200, email: 254, phone: 40, message: 4000 })
    assert.equal(MIN_PHONE_DIGITS, 7)
  })

  for (const [field, atLimit, overLimit] of cases) {
    it(`${field}: ${atLimit.length} characters pass, ${overLimit.length} do not`, async () => {
      assert.equal(atLimit.length, LIMITS[field])
      const ok = setup()
      assertJson(await ok.call(makeEvent({ payload: validPayload({ [field]: atLimit }) })), 200, OK)
      const over = setup()
      assertJson(await over.call(makeEvent({ payload: validPayload({ [field]: overLimit }) })), 400, invalid([field]))
    })
  }

  it('applies the limit to the trimmed value', async () => {
    const { call } = setup()
    const message = `  ${'a'.repeat(LIMITS.message)}  `
    assertJson(await call(makeEvent({ payload: validPayload({ message }) })), 200, OK)
  })

  it('phone: 7 digits pass, 6 do not, and an empty phone is fine', async () => {
    for (const phone of ['555-0123', '+1 419.555.01', '1234567', '']) {
      const { call } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ phone }) })), 200, OK)
    }
    for (const phone of ['555-012', '(419) 55', '123456', 'call me', '+-() ']) {
      const { call } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ phone }) })), 400, invalid(['phone']))
    }
  })
})

// ---------------------------------------------------------------------------
// 500
// ---------------------------------------------------------------------------

describe('500: sending fails', () => {
  it('answers {"ok":false,"error":"server"} and leaks nothing of the error', async () => {
    const error = Object.assign(new Error('Email address is not verified: ana@example.com SECRET-SES-DETAIL'), {
      name: 'MessageRejected',
      $metadata: { httpStatusCode: 400 },
    })
    const { call, logs } = setup({ fail: error })
    const response = await call(makeEvent())
    assertJson(response, 500, SERVER)
    assert.ok(!response.body.includes('SECRET'))
    assert.ok(!response.body.includes('MessageRejected'))
    assert.deepEqual(lastLog(logs), { requestId: 'req-1', outcome: 'send_failed', errorName: 'MessageRejected' })
    assert.ok(!logs.join('\n').includes('SECRET-SES-DETAIL'))
  })

  it('logs a generic error name when the thrown value has no usable one', async () => {
    for (const fail of ['a string', { name: 'has spaces and ana@example.com' }, Object.assign(new Error('x'), { name: 42 })]) {
      const { call, logs } = setup({ fail })
      assertJson(await call(makeEvent()), 500, SERVER)
      assert.equal(lastLog(logs).errorName, 'Error')
    }
  })

  it('answers 500 and sends nothing when TO_ADDRESS or FROM_ADDRESS is unusable', async () => {
    for (const env of [
      { ...ENV, TO_ADDRESS: undefined },
      { ...ENV, FROM_ADDRESS: '' },
      { ...ENV, FROM_ADDRESS: 'not-an-address' },
      { ...ENV, FROM_ADDRESS: 'no-reply@oseptoledo.org\r\nBcc: someone@evil.example' },
      { ...ENV, TO_ADDRESS: 'admin@oseptoledo.org\u0000' },
      {},
    ]) {
      const { call, sent, logs } = setup({ env: { ALLOWED_ORIGINS: ENV.ALLOWED_ORIGINS, ...env } })
      assertJson(await call(makeEvent()), 500, SERVER)
      assert.equal(sent.length, 0)
      assert.equal(lastLog(logs).outcome, 'misconfigured')
    }
  })

  it('answers 500 for anything unexpected, as JSON', async () => {
    const { call, sent, logs } = setup()
    const event = makeEvent()
    event.headers = {
      get origin() {
        throw new Error('unexpected ana@example.com')
      },
    }
    assertJson(await call(event), 500, SERVER)
    assert.equal(sent.length, 0)
    assert.deepEqual(lastLog(logs), { requestId: 'req-1', outcome: 'error', errorName: 'Error' })
  })
})

// ---------------------------------------------------------------------------
// Header safety
// ---------------------------------------------------------------------------

describe('email headers', () => {
  const CONTROL = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/

  it('sets Reply-To to the validated, trimmed address', async () => {
    const { call, sent } = setup()
    assertJson(await call(makeEvent({ payload: validPayload({ email: '\r\n maria@example.org \r\n' }) })), 200, OK)
    assert.equal(sent[0].replyTo, 'maria@example.org')
  })

  it('refuses an address that tries to add a header', async () => {
    for (const email of ['ana@example.com\r\nBcc: victim@example.org', 'ana@example.com\nBcc:victim@example.org', 'ana@example.com\rX: y']) {
      const { call, sent } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ email }) })), 400, invalid(['email']))
      assert.equal(sent.length, 0)
    }
  })

  it('leaves Reply-To off rather than send an altered address', async () => {
    const { call, sent } = setup()
    assertJson(await call(makeEvent({ payload: validPayload({ email: 'ana\u0001@example.com' }) })), 200, OK)
    assert.equal(sent.length, 1)
    assert.ok(!('replyTo' in sent[0]))
    assert.ok(sent[0].text.includes('This email has no Reply-To'))
  })

  // SES does not support SMTPUTF8: an address header must be 7-bit ASCII (a
  // non-ASCII domain in Punycode), and SES refuses the whole send otherwise.
  // These addresses pass the form's loose pattern, so they must still be
  // delivered: without Reply-To, with the address in the body.
  it('delivers an address SES cannot carry in a header, without Reply-To', async () => {
    const longLocal = `${'a'.repeat(65)}@example.com`
    for (const email of ['maría@example.com', 'añá@exámple.com', 'josé@gmail.com', '<x@y.z>', 'a,b@example.com', '"ana"@example.com', 'a..b@example.com', longLocal]) {
      assert.ok(EMAIL_PATTERN.test(email), `${email} passes the form's pattern`)
      const { call, sent } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ email }) })), 200, OK)
      assert.equal(sent.length, 1, email)
      assert.ok(!('replyTo' in sent[0]), `${email} must not become a Reply-To`)
      assert.ok(sent[0].text.includes(`${FIELD_LABELS.email}: ${email}\n`), `${email} is in the body`)
      assert.ok(sent[0].text.includes('This email has no Reply-To'))
    }
  })

  it('converts a non-ASCII domain to Punycode for Reply-To, and keeps the typed address in the body', async () => {
    for (const [email, replyTo] of [
      ['ana@españa.es', 'ana@xn--espaa-rta.es'],
      ['Ana.Perez+osep@Exámple.com', 'Ana.Perez+osep@xn--exmple-qta.com'],
    ]) {
      const { call, sent } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ email }) })), 200, OK)
      assert.equal(sent[0].replyTo, replyTo)
      assert.ok(sent[0].text.includes(`${FIELD_LABELS.email}: ${email}\n`))
      assert.ok(sent[0].text.includes('Reply to this email to answer them.'))
    }
  })

  it('keeps Reply-To for ordinary ASCII addresses, including Punycode and subdomains', async () => {
    for (const email of ["o'brien@example.co.uk", 'ana_maria-p@mail.example.org', 'ana@xn--espaa-rta.es', 'x@sub.example.xn--p1ai']) {
      const { call, sent } = setup()
      assertJson(await call(makeEvent({ payload: validPayload({ email }) })), 200, OK)
      assert.equal(sent[0].replyTo, email)
    }
  })

  it('never puts a control character in from, to, reply-to or subject', async () => {
    const { call, sent } = setup()
    const payloads = [
      validPayload(),
      validPayload({ name: 'Ana\r\nBcc: x@evil.example', email: ' ana@example.com\r\n' }),
      ...Object.keys(AUDIENCE_LABELS).map((audience) => validPayload({ audience })),
    ]
    for (const payload of payloads) assertJson(await call(makeEvent({ payload })), 200, OK)
    assert.equal(sent.length, payloads.length)
    for (const email of sent) {
      for (const header of ['from', 'to', 'replyTo', 'subject']) {
        assert.ok(!CONTROL.test(email[header]), `${header} has a control character: ${JSON.stringify(email[header])}`)
      }
    }
  })

  it('keeps a name or phone with line breaks on its own line in the body', async () => {
    const { call, sent } = setup()
    const payload = validPayload({
      name: 'Ana\r\nEmail: attacker@evil.example',
      phone: '419\n555\u2028 0100',
    })
    assertJson(await call(makeEvent({ payload })), 200, OK)
    const lines = sent[0].text.split('\n')
    assert.deepEqual(lines.filter((line) => line.startsWith('Email:')), ['Email: ana@example.com'])
    assert.ok(lines.includes('Name: Ana Email: attacker@evil.example'))
    assert.ok(lines.includes('Phone: 419 555  0100'))
  })
})

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

describe('logging', () => {
  const NAME = 'Zelda Markername'
  const EMAIL = 'zelda.marker@example.net'
  const PHONE = '419-555-7777'
  const MESSAGE = 'MARKER-MESSAGE-TEXT about my roof'
  const WEBSITE = 'https://marker-spam.example'
  const markers = [NAME, 'Markername', EMAIL, 'zelda.marker', PHONE, '5557777', MESSAGE, 'MARKER-MESSAGE', WEBSITE]
  const personal = { name: NAME, email: EMAIL, phone: PHONE, message: MESSAGE }

  it('writes one JSON line per request, with nothing the visitor typed', async () => {
    const all = []
    const scenarios = [
      [{}, makeEvent({ payload: validPayload(personal) })],
      [{}, makeEvent({ payload: validPayload({ ...personal, website: WEBSITE }) })],
      [{}, makeEvent({ payload: validPayload({ ...personal, email: `${EMAIL} oops` }) })],
      [{}, makeEvent({ payload: validPayload({ ...personal, audience: MESSAGE }) })],
      [{}, makeEvent({ body: `{"name":"${NAME}","message":"${MESSAGE}"` })],
      [{}, makeEvent({ body: `${NAME} ${EMAIL} ${MESSAGE}`.repeat(200) })],
      [{}, makeEvent({ payload: validPayload(personal), contentType: 'text/plain' })],
      [{}, makeEvent({ payload: validPayload(personal), origin: 'https://evil.example' })],
      [{}, makeEvent({ payload: validPayload(personal), method: 'GET' })],
      [{}, makeEvent({ payload: validPayload(personal), path: '/api/other' })],
      [{ fail: Object.assign(new Error(`rejected ${EMAIL}: ${MESSAGE}`), { name: 'MessageRejected' }) }, makeEvent({ payload: validPayload(personal) })],
      [{ env: { ...ENV, TO_ADDRESS: '' } }, makeEvent({ payload: validPayload(personal) })],
    ]
    for (const [options, event] of scenarios) {
      const { call, logs } = setup(options)
      await call(event)
      assert.equal(logs.length, 1, 'exactly one line per request')
      all.push(...logs)
    }
    const text = all.join('\n')
    for (const marker of markers) assert.ok(!text.includes(marker), `a log line contains ${JSON.stringify(marker)}`)
    for (const line of all) {
      const entry = JSON.parse(line)
      assert.match(entry.requestId, /^req-\d+$/)
      assert.equal(typeof entry.outcome, 'string')
      for (const key of Object.keys(entry)) assert.ok(['requestId', 'outcome', 'fields', 'errorName'].includes(key), `unexpected log key ${key}`)
      if (entry.fields) for (const field of entry.fields) assert.ok(FIELDS.includes(field))
    }
  })

  it('falls back to the URL request id, then "unknown"', async () => {
    const logs = []
    const handler = createHandler({ env: ENV, log: (line) => logs.push(line), sendEmail: async () => {} })
    await handler(makeEvent())
    await handler({ requestContext: { http: { method: 'GET' } } })
    assert.deepEqual(logs.map((line) => JSON.parse(line).requestId), ['url-request-id', 'unknown'])
  })

  it('still answers 200 when the logger throws', async () => {
    const { call, sent } = setup({
      log: () => {
        throw new Error('log sink down')
      },
    })
    assertJson(await call(makeEvent()), 200, OK)
    assert.equal(sent.length, 1)
  })
})

// ---------------------------------------------------------------------------
// Never 404
// ---------------------------------------------------------------------------

describe('never 404', () => {
  it('answers JSON with no-store, never 404, for any request', async () => {
    const events = [
      undefined,
      null,
      {},
      makeEvent({ method: 'GET', path: '/api/nothing' }),
      makeEvent({ path: '/api/nothing' }),
      makeEvent({ path: '' }),
      makeEvent({ body: '' }),
      makeEvent({ contentType: undefined, origin: undefined }),
      makeEvent({ body: 'x'.repeat(100_000) }),
    ]
    for (const event of events) {
      const { call } = setup()
      const response = await call(event)
      assert.notEqual(response.statusCode, 404)
      assert.equal(response.headers['content-type'], 'application/json')
      assert.equal(response.headers['cache-control'], 'no-store')
      assert.equal(typeof JSON.parse(response.body).ok, 'boolean')
    }
  })
})

// ---------------------------------------------------------------------------
// validate() and createHandler() directly
// ---------------------------------------------------------------------------

describe('validate()', () => {
  it('returns trimmed values with defaults for left-out optional fields', () => {
    const result = validate({ name: ' Ana ', email: ' ana@example.com ', preferredLanguage: 'es', audience: 'other', message: ' Hi ', pageLanguage: 'en' })
    assert.deepEqual(result, {
      ok: true,
      value: {
        name: 'Ana',
        email: 'ana@example.com',
        phone: '',
        preferredLanguage: 'es',
        audience: 'other',
        message: 'Hi',
        updates: false,
        pageLanguage: 'en',
        website: '',
      },
    })
  })

  it('answers fields [] for anything that is not a plain JSON object', () => {
    for (const payload of [undefined, null, 'x', 1, true, [], [validPayload()]]) {
      assert.deepEqual(validate(payload), { ok: false, fields: [] })
    }
  })
})

describe('createHandler()', () => {
  it('needs a sendEmail function', () => {
    assert.throws(() => createHandler({ env: ENV }), TypeError)
    assert.throws(() => createHandler(), TypeError)
  })
})

// ---------------------------------------------------------------------------
// The server stays in step with the site's own form code
// ---------------------------------------------------------------------------

describe('matches the site source', () => {
  const contactFormPath = new URL('../../src/lib/contactForm.ts', import.meta.url)
  const copyPath = new URL('../../src/content/copy.ts', import.meta.url)
  const skip = !existsSync(contactFormPath) || !existsSync(copyPath) ? 'site source not found next to infra/' : false

  /** `key: 'value'` pairs inside the first `${name}: { ... }` block of `text`. */
  const block = (text, name) => {
    const start = text.indexOf(`${name}: {`)
    assert.ok(start >= 0, `no ${name} block`)
    const body = text.slice(start, text.indexOf('}', start))
    return Object.fromEntries([...body.matchAll(/^\s*'?([\w-]+)'?:\s*'([^']*)',?\s*$/gm)].map((m) => [m[1], m[2]]))
  }

  it('limits, body cap, email pattern, phone digits and payload keys match src/lib/contactForm.ts', { skip }, () => {
    const source = readFileSync(contactFormPath, 'utf8')

    const limits = source.match(/export const CONTACT_LIMITS = \{([^}]*)\}/)
    assert.ok(limits, 'CONTACT_LIMITS not found')
    const clientLimits = Object.fromEntries([...limits[1].matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]))
    assert.deepEqual(clientLimits, { ...LIMITS })

    assert.equal(Number(source.match(/export const CONTACT_MAX_BODY_BYTES = (\d+)/)?.[1]), MAX_BODY_BYTES)
    assert.equal(source.match(/const EMAIL = (\/.+\/)\s*$/m)?.[1], String(EMAIL_PATTERN))
    assert.equal(Number(source.match(/replace\(\/\\D\/g, ''\)\.length < (\d+)/)?.[1]), MIN_PHONE_DIGITS)

    const toPayload = source.match(/export function toPayload\([^)]*\)[^{]*\{\s*return \{([\s\S]*?)\n {2}\}/)
    assert.ok(toPayload, 'toPayload not found')
    const keys = [...toPayload[1].matchAll(/^\s*(\w+)[:,]/gm)].map((m) => m[1])
    assert.deepEqual([...keys].sort(), [...FIELDS].sort())
  })

  it('audience keys and English labels match src/content/copy.ts', { skip }, () => {
    const source = readFileSync(copyPath, 'utf8')
    const union = source.match(/export type AudienceKey = (.+)/)?.[1] ?? ''
    assert.deepEqual([...union.matchAll(/'([^']+)'/g)].map((m) => m[1]), Object.keys(AUDIENCE_LABELS))

    const english = source.slice(source.indexOf('const en: SiteCopy'), source.indexOf('const es: SiteCopy'))
    assert.ok(english.length > 0, 'English copy block not found')
    assert.deepEqual(block(english, 'audienceOptions'), { ...AUDIENCE_LABELS })

    const { message, ...mailLabels } = FIELD_LABELS
    assert.deepEqual(block(english, 'mailFieldLabels'), mailLabels)
    const form = english.slice(english.indexOf('form: {'))
    assert.equal(form.match(/^\s*message: '([^']*)',/m)?.[1], message)
  })
})

// ---------------------------------------------------------------------------
// index.mjs, against an in-process fake of @aws-sdk/client-sesv2
// ---------------------------------------------------------------------------

const FAKE_SESV2 = `
const state = (globalThis.__fakeSesv2 ??= { clients: [], commands: [], failWith: null })
export class SendEmailCommand {
  constructor(input) { this.input = input }
}
export class SESv2Client {
  constructor(config) { state.clients.push(config) }
  async send(command) {
    if (!(command instanceof SendEmailCommand)) throw new TypeError('unexpected command')
    if (state.failWith) throw state.failWith
    state.commands.push(command.input)
    return { MessageId: 'fake-message-id' }
  }
}
`

describe('index.mjs', { skip: typeof nodeModule.registerHooks !== 'function' && 'needs module.registerHooks (Node 22.15+)' }, () => {
  let handler
  let state
  const stdoutLines = []
  const originalWrite = process.stdout.write
  const savedEnv = {}

  before(async () => {
    nodeModule.registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === '@aws-sdk/client-sesv2') {
          return { url: `data:text/javascript,${encodeURIComponent(FAKE_SESV2)}`, shortCircuit: true }
        }
        return nextResolve(specifier, context)
      },
    })
    for (const [key, value] of Object.entries(ENV)) {
      savedEnv[key] = process.env[key]
      process.env[key] = value
    }
    // Capture only the handler's own log lines; let the test runner's output through.
    process.stdout.write = function (chunk, ...rest) {
      if (typeof chunk === 'string' && chunk.startsWith('{"requestId"')) {
        stdoutLines.push(chunk)
        return true
      }
      return originalWrite.call(this, chunk, ...rest)
    }
    ;({ handler } = await import('../lambda/contact-form/index.mjs'))
    state = globalThis.__fakeSesv2
  })

  after(() => {
    process.stdout.write = originalWrite
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('exports a handler that sends a UTF-8 SendEmailCommand built from the request', async () => {
    const payload = validPayload({ name: 'José Ñúñez', message: '¿Cuándo pueden venir? 🏠', audience: 'supporter' })
    assertJson(await handler(makeEvent({ payload }), { awsRequestId: 'idx-1' }), 200, OK)
    assert.equal(state.clients.length, 1, 'one client, created at module load')
    assert.equal(state.commands.length, 1)
    const input = state.commands[0]
    assert.equal(input.FromEmailAddress, 'no-reply@oseptoledo.org')
    assert.deepEqual(input.Destination, { ToAddresses: ['admin@oseptoledo.org'] })
    assert.deepEqual(input.ReplyToAddresses, ['ana@example.com'])
    assert.deepEqual(input.Content.Simple.Subject, {
      Data: 'New message from the OSEP website: Interested in supporting the partnership',
      Charset: 'UTF-8',
    })
    assert.equal(input.Content.Simple.Body.Text.Charset, 'UTF-8')
    assert.ok(input.Content.Simple.Body.Text.Data.includes('Name: José Ñúñez\n'))
    assert.ok(input.Content.Simple.Body.Text.Data.includes('¿Cuándo pueden venir? 🏠'))
    assert.ok(!('Html' in input.Content.Simple.Body))
    assert.deepEqual(JSON.parse(stdoutLines.at(-1)), { requestId: 'idx-1', outcome: 'sent' })
  })

  it('omits ReplyToAddresses when the message has no Reply-To', async () => {
    const payload = validPayload({ email: 'ana\u0001@example.com' })
    assertJson(await handler(makeEvent({ payload }), { awsRequestId: 'idx-2' }), 200, OK)
    assert.ok(!('ReplyToAddresses' in state.commands.at(-1)))
  })

  it('turns an SES failure into a 500 and logs only the error name', async () => {
    state.failWith = Object.assign(new Error('Email address is not verified. ana@example.com'), { name: 'MessageRejected' })
    try {
      assertJson(await handler(makeEvent(), { awsRequestId: 'idx-3' }), 500, SERVER)
    } finally {
      state.failWith = null
    }
    const line = stdoutLines.at(-1)
    assert.ok(line.endsWith('\n'))
    assert.deepEqual(JSON.parse(line), { requestId: 'idx-3', outcome: 'send_failed', errorName: 'MessageRejected' })
    assert.ok(!line.includes('ana@example.com'))
  })
})
