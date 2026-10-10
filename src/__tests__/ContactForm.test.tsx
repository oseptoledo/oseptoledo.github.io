import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONTACT_PATH,
  createHandler,
  type ContactEmail,
} from '../../infra/lambda/contact-form/contact.mjs'
import ContactForm from '../components/ContactForm'
import { CONTACT_EMAIL, SITE_ORIGIN } from '../constants'
import { COPY } from '../content/copy'
import { LocaleContext, type Locale } from '../i18n/locale'
import {
  CONTACT_LIMITS,
  CONTACT_MAX_BODY_BYTES,
  buildMailto,
  initialValues,
  sha256Hex,
  toPayload,
  validate,
} from '../lib/contactForm'
import { openUrl } from '../lib/navigate'

vi.mock('../lib/navigate', () => ({ openUrl: vi.fn() }))

/** Node's own SHA-256, independent of the Web Crypto path under test. */
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

function renderForm(locale: Locale, endpoint: string | null = null) {
  return render(
    <LocaleContext.Provider value={locale}>
      <ContactForm endpoint={endpoint} />
    </LocaleContext.Provider>,
  )
}

async function fillValid(user: ReturnType<typeof userEvent.setup>, locale: Locale) {
  const t = COPY[locale].contact.form
  await user.type(screen.getByLabelText(new RegExp(`^${t.name}`)), 'Ana Reyes')
  await user.type(screen.getByLabelText(new RegExp(`^${t.email}`)), 'ana@example.com')
  await user.selectOptions(screen.getByLabelText(new RegExp(`^${t.audience}`)), 'home-help')
  await user.type(screen.getByLabelText(new RegExp(`^${t.message}`)), 'Necesito ayuda con mi techo.')
}

beforeEach(() => {
  vi.mocked(openUrl).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ContactForm', () => {
  it('mails the inbox the contact Lambda delivers to (infra/cdk.json contactToAddress)', () => {
    // CONTACT_EMAIL is the mailto fallback and the address the failure message
    // shows; contactToAddress is where the Lambda sends. Moving the inbox means
    // changing both in one PR (infra/README.md, Settings). If the public address
    // is ever meant to differ from the delivery inbox, delete this test and say
    // why in src/constants/contact.ts.
    const { context } = JSON.parse(readFileSync(join(process.cwd(), 'infra', 'cdk.json'), 'utf8'))
    expect(CONTACT_EMAIL).toBe(context.contactToAddress)
  })

  it.each(['en', 'es'] as const)('flags every missing field in %s and focuses the first', async (locale) => {
    const user = userEvent.setup()
    const t = COPY[locale].contact.form
    renderForm(locale)

    await user.click(screen.getByRole('button', { name: t.submit }))

    const name = screen.getByLabelText(new RegExp(`^${t.name}`))
    expect(name).toHaveFocus()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription(t.errors.name)
    expect(screen.getByLabelText(new RegExp(`^${t.email}`))).toHaveAccessibleDescription(t.errors.emailMissing)
    expect(screen.getByLabelText(new RegExp(`^${t.audience}`))).toHaveAccessibleDescription(t.errors.audience)
    expect(screen.getByLabelText(new RegExp(`^${t.message}`))).toHaveAccessibleDescription(t.errors.message)
    expect(screen.getByRole('status')).toHaveTextContent(t.errors.summary)
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('clears a flagged field’s error as soon as it is fixed', async () => {
    const user = userEvent.setup()
    renderForm('en')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    const name = screen.getByLabelText(/^Name/)
    await user.type(name, 'Ana')
    expect(name).not.toHaveAttribute('aria-invalid')
  })

  it('defaults the preferred language to the page’s language', () => {
    renderForm('es')
    expect(screen.getByLabelText(/^Idioma preferido/)).toHaveValue('es')
  })

  it('without an endpoint, opens the visitor’s email app with the message and says so', async () => {
    const user = userEvent.setup()
    renderForm('es')
    await fillValid(user, 'es')
    await user.click(screen.getByRole('button', { name: 'Enviar mensaje' }))

    expect(openUrl).toHaveBeenCalledTimes(1)
    const url = vi.mocked(openUrl).mock.calls[0][0]
    expect(url.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true)
    const body = decodeURIComponent(url.split('&body=')[1])
    expect(body).toContain('Nombre: Ana Reyes')
    expect(body).toContain('Soy: Busco ayuda con mi casa')
    expect(body).toContain('Necesito ayuda con mi techo.')
    expect(screen.getByRole('status')).toHaveTextContent(CONTACT_EMAIL)
  })

  it('with an endpoint, POSTs JSON and thanks the visitor only when the server accepts it', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    renderForm('en', '/api/contact')
    await fillValid(user, 'en')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    // fetch waits for the body's SHA-256 (Web Crypto, asynchronous; slowest on
    // a cold start), so it can come after the click has returned.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/contact')
    expect(init.method).toBe('POST')
    expect(typeof init.body).toBe('string')
    expect(JSON.parse(init.body)).toEqual({
      name: 'Ana Reyes',
      email: 'ana@example.com',
      phone: '',
      preferredLanguage: 'en',
      audience: 'home-help',
      message: 'Necesito ayuda con mi techo.',
      updates: false,
      pageLanguage: 'en',
      website: '',
    })
    expect(await screen.findByText(COPY.en.contact.form.status.sent)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toHaveValue('')
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('signs the POST with the SHA-256 of the exact body it sends, as CloudFront needs', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    renderForm('es', '/api/contact')
    await fillValid(user, 'es')
    // Multi-byte UTF-8 (accents, ñ, ¿, an emoji) so a hash of anything but the
    // UTF-8 bytes of the sent string would differ.
    await user.type(screen.getByLabelText(/^Mensaje/), ' ¿Cuándo pueden venir? Año 2026, señora Núñez 🏠')
    await user.click(screen.getByRole('button', { name: 'Enviar mensaje' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-amz-content-sha256': sha256(init.body),
    })
    expect(init.headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.parse(init.body).message).toBe(
      'Necesito ayuda con mi techo. ¿Cuándo pueden venir? Año 2026, señora Núñez 🏠',
    )
  })

  // The two sides of the contract in one test: the exact request the form
  // sends, through the contact Lambda's real handler
  // (infra/lambda/contact-form/contact.mjs, pure, no AWS SDK). CI runs this
  // suite and infra/'s. infra/'s drift test compares key names and limits
  // only; this catches a value whose shape changed (a language name instead
  // of 'es', 'yes' instead of true), which the endpoint would refuse with a
  // 400.
  it('sends a request the contact Lambda itself accepts, and that it emails as one message', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    renderForm('es', '/api/contact')
    const t = COPY.es.contact.form
    await user.type(screen.getByLabelText(new RegExp(`^${t.name}`)), 'María José Peña')
    await user.type(screen.getByLabelText(new RegExp(`^${t.email}`)), 'maria@españa.es')
    await user.type(screen.getByLabelText(/^Teléfono/), '(419) 555-0100')
    await user.selectOptions(screen.getByLabelText(new RegExp(`^${t.audience}`)), 'home-help')
    await user.type(
      screen.getByLabelText(new RegExp(`^${t.message}`)),
      '¿Pueden revisar el “techo”?{Enter}Gracias 🏠',
    )
    await user.click(screen.getByLabelText(/^Quiero recibir noticias/))
    await user.click(screen.getByRole('button', { name: t.submit }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string; headers: Record<string, string> }]
    expect(url).toBe(CONTACT_PATH)

    const sent: ContactEmail[] = []
    const outcomes: string[] = []
    const handler = createHandler({
      env: { TO_ADDRESS: CONTACT_EMAIL, FROM_ADDRESS: 'no-reply@oseptoledo.org', ALLOWED_ORIGINS: SITE_ORIGIN },
      sendEmail: async (message) => {
        sent.push(message)
      },
      log: (line) => outcomes.push(JSON.parse(line).outcome),
    })
    // A Lambda function URL event (payload format 2.0), as CloudFront
    // forwards the browser's request: header names lowercased, plus the Origin
    // a browser adds to every POST.
    const headers = Object.fromEntries(Object.entries(init.headers).map(([key, value]) => [key.toLowerCase(), value]))
    const response = await handler({
      version: '2.0',
      routeKey: '$default',
      rawPath: url,
      rawQueryString: '',
      headers: { ...headers, origin: SITE_ORIGIN },
      requestContext: { requestId: 'round-trip', http: { method: init.method, path: url } },
      body: init.body,
      isBase64Encoded: false,
    })

    expect({ status: response.statusCode, body: JSON.parse(response.body) }).toEqual({ status: 200, body: { ok: true } })
    expect(outcomes).toEqual(['sent'])
    // What OAC signs with: the SHA-256 of these exact bytes.
    expect(headers['x-amz-content-sha256']).toBe(sha256(init.body))
    expect(sent).toHaveLength(1)
    const [email] = sent
    expect(email.to).toBe(CONTACT_EMAIL)
    expect(email.subject).toBe('New message from the OSEP website: Looking for help with my home')
    // The non-ASCII domain goes into Reply-To as Punycode, the same mailbox.
    expect(email.replyTo).toBe('maria@xn--espaa-rta.es')
    for (const line of [
      'Name: María José Peña',
      'Email: maria@españa.es',
      'Phone: (419) 555-0100',
      'Preferred language: Spanish',
      'Keep me updated: Yes',
      'Page language: Spanish',
      '¿Pueden revisar el “techo”?\nGracias 🏠',
    ]) {
      expect(email.text).toContain(line)
    }
  })

  it('reports a failed send with the email fallback and keeps what the visitor wrote', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm('en', '/api/contact')
    await fillValid(user, 'en')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText(COPY.en.contact.form.status.failed(CONTACT_EMAIL))).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Ana Reyes')
  })

  // In a real browser, disabling the focused button drops focus to <body>
  // (jsdom does not), and a screen reader then loses the visitor's place. So
  // the button must stay enabled, marked aria-disabled, while onSubmit itself
  // refuses a second submit.
  it('keeps focus on the submit button through a failed send, and sends only once', async () => {
    const user = userEvent.setup()
    const t = COPY.en.contact.form
    type Answer = { ok: boolean; status: number }
    let answer: (response: Answer) => void = () => {}
    const fetchMock = vi.fn(
      () =>
        new Promise<Answer>((resolve) => {
          answer = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm('en', '/api/contact')
    await fillValid(user, 'en')
    const button = screen.getByRole('button', { name: t.submit })
    button.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(button).toHaveTextContent(t.sending)
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button).toHaveFocus()
    // A second Enter and a click while the first send is in flight do nothing.
    await user.keyboard('{Enter}')
    await user.click(button)

    answer({ ok: false, status: 502 })
    expect(await screen.findByText(t.status.failed(CONTACT_EMAIL))).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(button).toHaveFocus()
    expect(button).not.toHaveAttribute('aria-disabled')
    expect(button).toHaveTextContent(t.submit)
  })

  it.each([
    ['a refusal (400)', () => Promise.resolve({ ok: false, status: 400 })],
    ['a body over the limit (413)', () => Promise.resolve({ ok: false, status: 413 })],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('treats %s as a failed send and keeps every field', async (_label, respond) => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(respond)
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm('es', '/api/contact')
    await fillValid(user, 'es')
    await user.type(screen.getByLabelText(/^Teléfono/), '(419) 555-0100')
    await user.click(screen.getByLabelText(/^Quiero recibir noticias/))
    await user.click(screen.getByRole('button', { name: 'Enviar mensaje' }))

    expect(await screen.findByText(COPY.es.contact.form.status.failed(CONTACT_EMAIL))).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Ana Reyes')
    expect(screen.getByLabelText(/^Correo electrónico/)).toHaveValue('ana@example.com')
    expect(screen.getByLabelText(/^Teléfono/)).toHaveValue('(419) 555-0100')
    expect(screen.getByLabelText(/^Soy/)).toHaveValue('home-help')
    expect(screen.getByLabelText(/^Mensaje/)).toHaveValue('Necesito ayuda con mi techo.')
    expect(screen.getByLabelText(/^Quiero recibir noticias/)).toBeChecked()
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeEnabled()
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('caps each free-text field at the endpoint’s limit', () => {
    renderForm('en')
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('maxlength', String(CONTACT_LIMITS.name))
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('maxlength', String(CONTACT_LIMITS.email))
    expect(screen.getByLabelText(/^Phone/)).toHaveAttribute('maxlength', String(CONTACT_LIMITS.phone))
    expect(screen.getByLabelText(/^Message/)).toHaveAttribute('maxlength', String(CONTACT_LIMITS.message))
  })

  it('sends nothing when the honeypot is filled', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { container } = renderForm('en', 'https://forms.example.test/contact')
    await fillValid(user, 'en')
    await user.type(container.querySelector('input[name="website"]')!, 'http://spam.example')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(openUrl).not.toHaveBeenCalled()
  })
})

describe('contact form logic', () => {
  const errors = COPY.en.contact.form.errors
  const valid = { ...initialValues('en'), name: 'Ana', email: 'ana@example.com', audience: 'media' as const, message: 'Hi' }

  it('accepts a complete message', () => {
    expect(validate(valid, errors)).toEqual({})
  })

  it('rejects a malformed email and a too-short phone, but not a blank phone', () => {
    expect(validate({ ...valid, email: 'ana@' }, errors).email).toBe(errors.emailInvalid)
    expect(validate({ ...valid, phone: '12' }, errors).phone).toBe(errors.phone)
    expect(validate({ ...valid, phone: '(419) 555-0100' }, errors).phone).toBeUndefined()
    expect(validate({ ...valid, phone: '' }, errors).phone).toBeUndefined()
  })

  it('treats whitespace as empty', () => {
    expect(validate({ ...valid, name: '   ', message: '\n' }, errors)).toEqual({
      name: errors.name,
      message: errors.message,
    })
  })

  it('trims what it sends', () => {
    expect(toPayload({ ...valid, name: '  Ana  ' }, 'es')).toMatchObject({ name: 'Ana', pageLanguage: 'es' })
  })

  it('sends the honeypot as website, empty for a person', () => {
    expect(toPayload(valid, 'en').website).toBe('')
    expect(toPayload({ ...valid, website: 'http://spam.example' }, 'en').website).toBe('http://spam.example')
  })

  it('accepts each field at its limit and rejects one character more, with the field’s own message', () => {
    const at = {
      ...valid,
      name: 'A'.repeat(CONTACT_LIMITS.name),
      email: `${'a'.repeat(CONTACT_LIMITS.email - '@example.com'.length)}@example.com`,
      phone: '4'.repeat(CONTACT_LIMITS.phone),
      message: 'm'.repeat(CONTACT_LIMITS.message),
    }
    expect(at.email).toHaveLength(CONTACT_LIMITS.email)
    expect(validate(at, errors)).toEqual({})
    expect(
      validate(
        {
          ...at,
          name: `${at.name}A`,
          email: `a${at.email}`,
          phone: `${at.phone}4`,
          message: `${at.message}m`,
        },
        errors,
      ),
    ).toEqual({
      name: errors.name,
      email: errors.emailInvalid,
      phone: errors.phone,
      message: errors.message,
    })
    // Limits apply to what is sent, which is trimmed.
    expect(validate({ ...at, message: `  ${at.message}\n` }, errors)).toEqual({})
  })

  it('keeps a maximal English or Spanish message inside the endpoint’s body limit', () => {
    // Every field at its character limit, in text heavier in multi-byte UTF-8
    // and JSON escapes (quotes, newlines) than real Spanish.
    const fill = (sample: string, length: number) => sample.repeat(Math.ceil(length / sample.length)).slice(0, length)
    const spanish = '¿Señora Núñez? Él pidió “ayuda” con el baño.\n'
    const body = JSON.stringify(
      toPayload(
        {
          ...valid,
          name: fill('María José Peña Ibáñez ', CONTACT_LIMITS.name),
          email: `${'a'.repeat(CONTACT_LIMITS.email - '@example.com'.length)}@example.com`,
          phone: fill('+1 (419) 555-0100 ', CONTACT_LIMITS.phone).trim(),
          message: fill(spanish, CONTACT_LIMITS.message).trim(),
          updates: true,
        },
        'es',
      ),
    )
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(CONTACT_MAX_BODY_BYTES)
  })

  it('hashes UTF-8 to lowercase hex SHA-256', async () => {
    // FIPS 180-2 test vectors, then multi-byte text checked against Node.
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const text = '{"message":"¿Cuándo? Año 🏠"}'
    expect(await sha256Hex(text)).toBe(sha256(text))
  })

  it('labels the mailto body in the page’s language', () => {
    const body = decodeURIComponent(buildMailto(valid, CONTACT_EMAIL, COPY.en.contact.form).split('&body=')[1])
    expect(body).toContain('Name: Ana')
    expect(body).toContain('I am a: Media')
    expect(body).toContain('Keep me updated: No')
  })
})
