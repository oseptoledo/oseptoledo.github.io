import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { CONTACT_EMAIL, CONTACT_FORM_ENDPOINT } from '../constants'
import type { AudienceKey } from '../content/copy'
import { LOCALE_NAME, LOCALES, useLocale } from '../i18n/locale'
import { useCopy } from '../i18n/useCopy'
import {
  CONTACT_LIMITS,
  VALIDATED_FIELDS,
  buildMailto,
  initialValues,
  sha256Hex,
  toPayload,
  validate,
  type ContactErrors,
  type ContactValues,
  type ValidatedField,
} from '../lib/contactForm'
import { openUrl } from '../lib/navigate'

type Status = 'idle' | 'invalid' | 'sending' | 'sent' | 'mailto' | 'failed'

const CONTROL =
  'w-full rounded-[10px] border-[1.5px] border-pebble bg-white px-4 text-base text-ink aria-invalid:border-brick'

interface FieldProps {
  id: string
  label: string
  required?: boolean
  hint?: string
  requiredLabel: string
  error?: string
  wide?: boolean
  children: ReactNode
}

function Field({ id, label, required, hint, requiredLabel, error, wide, children }: FieldProps) {
  return (
    <div className={`flex flex-col gap-2 ${wide ? 'md:col-span-2' : ''}`}>
      <label htmlFor={id} className="text-[0.9375rem] font-bold">
        {label}
        {hint && <span className="font-medium text-stone"> {hint}</span>}
        {required && (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> ({requiredLabel})</span>
          </>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="m-0 text-sm font-bold text-brick">
          {error}
        </p>
      )}
    </div>
  )
}

interface ContactFormProps {
  /** Where to POST. Defaults to CONTACT_FORM_ENDPOINT; null falls back to mailto. */
  endpoint?: string | null
}

/**
 * The values the form's controls hold in the DOM right now. Used once, after
 * hydration (see the effect in ContactForm), to adopt what the browser put
 * there before React took over. A select holding something the form never
 * offers keeps the current value. Returns `current` itself when nothing
 * differs, so React skips the re-render.
 */
function valuesInControls(form: HTMLFormElement, current: ContactValues, audiences: readonly AudienceKey[]): ContactValues {
  const control = (name: keyof ContactValues) => {
    const element = form.elements.namedItem(name)
    return element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
      ? element
      : null
  }
  const text = (name: 'name' | 'email' | 'phone' | 'message' | 'website') => control(name)?.value ?? current[name]
  const language = control('language')?.value
  const audience = control('audience')?.value
  const updates = control('updates')
  const next: ContactValues = {
    name: text('name'),
    email: text('email'),
    phone: text('phone'),
    language: LOCALES.find((code) => code === language) ?? current.language,
    audience: audience === '' ? '' : (audiences.find((key) => key === audience) ?? current.audience),
    message: text('message'),
    updates: updates instanceof HTMLInputElement && updates.type === 'checkbox' ? updates.checked : current.updates,
    website: text('website'),
  }
  const changed = (Object.keys(next) as (keyof ContactValues)[]).some((key) => next[key] !== current[key])
  return changed ? next : current
}

/**
 * The contact form from the design: name, email, optional phone, preferred
 * language, who the visitor is, message, and an opt-in for updates.
 *
 * Validation runs on submit, in the page's language, and marks each problem
 * inline (`aria-invalid` plus a described-by message) before moving focus to
 * the first one. A status line announces the outcome politely. Delivery is
 * honest about where the message went: POSTed to the endpoint when there is
 * one, otherwise handed to the visitor's email app, and never reported as sent
 * when it was not. The initial render has no errors and no status, so the
 * prerendered form and the hydrating one are identical.
 *
 * The POST is JSON with an `x-amz-content-sha256` header holding the SHA-256
 * of the exact body string, which CloudFront needs to pass a POST on to the
 * contact Lambda (see sha256Hex). The body is serialized once and that one
 * string is both hashed and sent. Anything but a 2xx answer, a network error,
 * or a browser without Web Crypto reports the failed send and keeps what the
 * visitor typed, so they can try again or copy it into an email.
 *
 * While the POST is in flight the submit button is aria-disabled, not
 * disabled: disabling the focused button would drop keyboard and screen-reader
 * focus to <body>, and a visitor whose send failed would have to find the form
 * again to retry. Focus stays on the button; the `sending` ref ignores a
 * second submit (a click, or Enter in a field) until the first one settles.
 *
 * The served HTML is a working form before the script runs, so the browser
 * may already hold values when React hydrates: what a visitor typed while a
 * slow connection was still loading the script, or what the browser restored
 * on a reload, a back/forward visit or a discarded tab coming back. Hydration
 * leaves those values in the controls but starts the state empty, and the
 * first re-render (the next keystroke anywhere in the form) would wipe them
 * and then report the fields as empty. So an effect, which runs after the
 * hydration commit, reads the controls once and adopts what they hold; the
 * first render still matches the prerendered HTML exactly.
 */
export default function ContactForm({ endpoint = CONTACT_FORM_ENDPOINT }: ContactFormProps) {
  const locale = useLocale()
  const t = useCopy().contact.form
  const uid = useId()
  const fieldId = (name: string) => `${uid}-${name}`

  const [values, setValues] = useState<ContactValues>(() => initialValues(locale))
  const [errors, setErrors] = useState<ContactErrors>({})
  const [status, setStatus] = useState<Status>('idle')
  // True from the POST until its answer. A ref, not state, so a second submit
  // arriving before React re-renders still sees it.
  const sending = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Adopt what the browser put in the controls before hydration (see the
  // docblock). Runs after the first commit, so hydration itself is untouched;
  // `t` never changes on a page, so this runs once.
  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const audiences = Object.keys(t.audienceOptions) as AudienceKey[]
    setValues((current) => valuesInControls(form, current, audiences))
  }, [t])

  const update = (name: keyof ContactValues) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const target = event.target
    const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value
    const next = { ...values, [name]: value } as ContactValues
    setValues(next)
    // Once a field has been flagged, re-check it as the visitor fixes it.
    if (name in errors) {
      const field = name as ValidatedField
      setErrors((current) => ({ ...current, [field]: validate(next, t.errors)[field] }))
    }
  }

  const describedBy = (name: ValidatedField) => (errors[name] ? `${fieldId(name)}-error` : undefined)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The button stays enabled while sending (see above), so refuse here.
    if (sending.current) return
    const found = validate(values, t.errors)
    setErrors(found)
    const first = VALIDATED_FIELDS.find((name) => found[name])
    if (first) {
      setStatus('invalid')
      document.getElementById(fieldId(first))?.focus()
      return
    }

    // A filled honeypot is a bot. Tell it what it wants to hear and send nothing.
    if (values.website) {
      setStatus('sent')
      setValues(initialValues(locale))
      return
    }

    if (!endpoint) {
      openUrl(buildMailto(values, CONTACT_EMAIL, t))
      setStatus('mailto')
      return
    }

    sending.current = true
    setStatus('sending')
    try {
      const body = JSON.stringify(toPayload(values, locale))
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-amz-content-sha256': await sha256Hex(body) },
        body,
      })
      if (!response.ok) throw new Error(`Contact endpoint answered ${response.status}`)
      setStatus('sent')
      setValues(initialValues(locale))
    } catch (error) {
      console.error('Contact form submission failed:', error)
      setStatus('failed')
    } finally {
      sending.current = false
    }
  }

  const statusText: Record<Status, string> = {
    idle: '',
    invalid: t.errors.summary,
    sending: '',
    sent: t.status.sent,
    mailto: t.status.mailto(CONTACT_EMAIL),
    failed: t.status.failed(CONTACT_EMAIL),
  }

  return (
    // method="post" matters only before hydration, or when the script never
    // runs: a form with no method submits as a GET with every field in the
    // URL, which would put names, emails and messages in CloudFront's access
    // logs and the browser history. A POST to a page is refused at the edge
    // (pages allow GET and HEAD only) and request bodies are never logged.
    // Once hydrated, onSubmit prevents the browser submit either way.
    <form
      ref={formRef}
      method="post"
      noValidate
      onSubmit={onSubmit}
      className="grid gap-5 rounded-[20px] border border-line bg-cream p-5 md:grid-cols-2 md:gap-x-6 md:p-10"
    >
      <Field id={fieldId('name')} label={t.name} required requiredLabel={t.required} error={errors.name}>
        <input
          id={fieldId('name')}
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={CONTACT_LIMITS.name}
          value={values.name}
          onChange={update('name')}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy('name')}
          className={`${CONTROL} h-[52px]`}
        />
      </Field>

      <Field id={fieldId('email')} label={t.email} required requiredLabel={t.required} error={errors.email}>
        <input
          id={fieldId('email')}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={CONTACT_LIMITS.email}
          value={values.email}
          onChange={update('email')}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy('email')}
          className={`${CONTROL} h-[52px]`}
        />
      </Field>

      <Field id={fieldId('phone')} label={t.phone} hint={t.phoneHint} requiredLabel={t.required} error={errors.phone}>
        <input
          id={fieldId('phone')}
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={CONTACT_LIMITS.phone}
          value={values.phone}
          onChange={update('phone')}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={describedBy('phone')}
          className={`${CONTROL} h-[52px]`}
        />
      </Field>

      <Field id={fieldId('language')} label={t.language} requiredLabel={t.required}>
        <select
          id={fieldId('language')}
          name="language"
          value={values.language}
          onChange={update('language')}
          className={`${CONTROL} h-[52px]`}
        >
          {/* The page's own language first, as in the design. */}
          {[locale, ...LOCALES.filter((code) => code !== locale)].map((code) => (
            <option key={code} value={code} lang={code}>
              {LOCALE_NAME[code]}
            </option>
          ))}
        </select>
      </Field>

      <Field id={fieldId('audience')} label={t.audience} required requiredLabel={t.required} error={errors.audience} wide>
        <select
          id={fieldId('audience')}
          name="audience"
          required
          value={values.audience}
          onChange={update('audience')}
          aria-invalid={errors.audience ? true : undefined}
          aria-describedby={describedBy('audience')}
          className={`${CONTROL} h-[52px]`}
        >
          <option value="">{t.audiencePlaceholder}</option>
          {(Object.keys(t.audienceOptions) as AudienceKey[]).map((key) => (
            <option key={key} value={key}>
              {t.audienceOptions[key]}
            </option>
          ))}
        </select>
      </Field>

      <Field id={fieldId('message')} label={t.message} required requiredLabel={t.required} error={errors.message} wide>
        <textarea
          id={fieldId('message')}
          name="message"
          rows={4}
          required
          maxLength={CONTACT_LIMITS.message}
          value={values.message}
          onChange={update('message')}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={describedBy('message')}
          className={`${CONTROL} resize-y py-3.5`}
        />
      </Field>

      {/* Honeypot: display:none, so people never see or reach it. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor={fieldId('website')}>Website</label>
        <input
          id={fieldId('website')}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={update('website')}
        />
      </div>

      <div className="flex flex-col gap-5 md:col-span-2 md:flex-row md:items-center md:justify-between md:gap-6">
        <label htmlFor={fieldId('updates')} className="flex items-center gap-2.5 text-[0.9375rem]">
          <input
            id={fieldId('updates')}
            name="updates"
            type="checkbox"
            checked={values.updates}
            onChange={update('updates')}
            className="h-[22px] w-[22px] shrink-0 accent-brick"
          />
          {t.updates}
        </label>
        {/* aria-disabled, never disabled: a disabled button loses focus (see the docblock). */}
        <button
          type="submit"
          aria-disabled={status === 'sending' || undefined}
          className="btn btn-brick shrink-0 px-9 aria-disabled:opacity-70"
        >
          {status === 'sending' ? t.sending : t.submit}
        </button>
      </div>

      <p
        role="status"
        className={`m-0 text-base md:col-span-2 ${status === 'invalid' || status === 'failed' ? 'font-bold text-brick' : 'text-ink'} ${statusText[status] ? '' : 'sr-only'}`}
      >
        {statusText[status]}
      </p>
    </form>
  )
}
