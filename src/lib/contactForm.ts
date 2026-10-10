import type { AudienceKey, ContactFormCopy } from '../content/copy'
import { LOCALE_NAME, type Locale } from '../i18n/locale'

/**
 * Pure logic behind the contact form (src/components/ContactForm.tsx): field
 * values, validation in the page's language, and the two ways a message leaves
 * the page. Kept out of the component so it can be tested without rendering.
 */
export interface ContactValues {
  name: string
  email: string
  phone: string
  language: Locale
  audience: AudienceKey | ''
  message: string
  updates: boolean
  /** Honeypot. Hidden from people; a bot that fills every input fills this too. */
  website: string
}

/** Fields that can carry an error, in the order they appear (and get focused). */
export const VALIDATED_FIELDS = ['name', 'email', 'phone', 'audience', 'message'] as const
export type ValidatedField = (typeof VALIDATED_FIELDS)[number]
export type ContactErrors = Partial<Record<ValidatedField, string>>

export function initialValues(locale: Locale): ContactValues {
  return {
    name: '',
    email: '',
    phone: '',
    language: locale,
    audience: '',
    message: '',
    updates: false,
    website: '',
  }
}

/**
 * The most characters each free-text field may hold, as the contact endpoint
 * (POST /api/contact, infra/lambda/contact-form) enforces them. The form sets
 * these as `maxLength` on its inputs, so a visitor cannot type or paste past
 * them, and validate() checks them too, with the field's usual message, for a
 * value that reached the state some other way (autofill, a script). The limits
 * count UTF-16 code units, as both `maxLength` and JavaScript's `.length` do,
 * and apply to the trimmed values that toPayload() sends.
 *
 * 254 is the longest address SMTP can deliver to (RFC 5321 path limit).
 */
export const CONTACT_LIMITS = {
  name: 200,
  email: 254,
  phone: 40,
  message: 4000,
} as const

/**
 * The endpoint's cap on the whole JSON body, in UTF-8 bytes; it answers 413
 * above it. The character limits keep ordinary English or Spanish inside it,
 * even with every field at its limit (a test holds the two together). Unusual
 * text can still cross it within those limits, because the cap counts bytes of
 * JSON, not characters: a long message made mostly of accented letters,
 * quotes or backslashes (two bytes each once encoded), emoji (four), or a
 * three-byte script. Then the form reports the failed send and keeps the
 * text, as for any other refusal.
 */
export const CONTACT_MAX_BODY_BYTES = 8192

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validates with messages in the page's language. The browser's built-in
 * validation bubbles speak the browser's UI language, which on a shared or
 * library computer may not be the language the visitor chose on this site, so
 * the form sets `noValidate` and uses these instead.
 */
export function validate(values: ContactValues, errors: ContactFormCopy['errors']): ContactErrors {
  const result: ContactErrors = {}
  const name = values.name.trim()
  if (!name || name.length > CONTACT_LIMITS.name) result.name = errors.name
  const email = values.email.trim()
  if (!email) result.email = errors.emailMissing
  else if (email.length > CONTACT_LIMITS.email || !EMAIL.test(email)) result.email = errors.emailInvalid
  const phone = values.phone.trim()
  if (phone && (phone.length > CONTACT_LIMITS.phone || phone.replace(/\D/g, '').length < 7)) result.phone = errors.phone
  if (!values.audience) result.audience = errors.audience
  const message = values.message.trim()
  if (!message || message.length > CONTACT_LIMITS.message) result.message = errors.message
  return result
}

/**
 * The JSON body POSTed to CONTACT_FORM_ENDPOINT, in the shape the contact
 * endpoint accepts. `website` is the honeypot, sent as typed (normally empty):
 * the form already sends nothing when it is filled, and the endpoint applies
 * the same rule to anything that posts to it directly.
 */
export function toPayload(values: ContactValues, pageLanguage: Locale) {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    preferredLanguage: values.language,
    audience: values.audience,
    message: values.message.trim(),
    updates: values.updates,
    pageLanguage,
    website: values.website,
  }
}

/**
 * The lowercase hex SHA-256 of `text` encoded as UTF-8.
 *
 * The form sends this as `x-amz-content-sha256` with every POST. CloudFront
 * reaches the contact Lambda's function URL through Origin Access Control,
 * which signs each origin request with SigV4 but does not hash request bodies
 * itself: for a POST it signs with the hash the viewer supplies in that header.
 * Lambda function URLs accept no unsigned payloads, so a POST without the
 * header, or with the hash of different bytes, is refused before the function
 * runs. The caller must therefore hash the exact string it then sends.
 *
 * Web Crypto's `subtle` exists only in secure contexts (https, or
 * http://localhost), which is everywhere the form posts for real. A jsdom
 * window's own `crypto` may implement `getRandomValues` without `subtle`, so
 * this falls back to `globalThis.crypto.subtle` (Node's Web Crypto under a test
 * runner); in a browser, and under this repo's Vitest, the two are one object.
 * Rejects when neither is available, which the form reports as a failed send.
 */
export async function sha256Hex(text: string): Promise<string> {
  const fromWindow = typeof window === 'undefined' ? undefined : window.crypto?.subtle
  const subtle = fromWindow ?? globalThis.crypto?.subtle
  if (!subtle) throw new Error('Web Crypto (crypto.subtle) is unavailable; it needs a secure context.')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * A mailto: link addressed to `to`, with the subject and a plain-text body
 * listing every field, labeled in the page's language. The fallback while the
 * form has no server endpoint.
 */
export function buildMailto(values: ContactValues, to: string, copy: ContactFormCopy): string {
  const labels = copy.mailFieldLabels
  const lines = [
    `${labels.name}: ${values.name.trim()}`,
    `${labels.email}: ${values.email.trim()}`,
    `${labels.phone}: ${values.phone.trim() || '-'}`,
    `${labels.language}: ${LOCALE_NAME[values.language]}`,
    `${labels.audience}: ${values.audience ? copy.audienceOptions[values.audience] : '-'}`,
    `${labels.updates}: ${values.updates ? labels.yes : labels.no}`,
    '',
    values.message.trim(),
  ]
  const subject = encodeURIComponent(copy.mailSubject)
  const body = encodeURIComponent(lines.join('\n'))
  return `mailto:${to}?subject=${subject}&body=${body}`
}
