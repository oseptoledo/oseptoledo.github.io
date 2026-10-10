import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import type { Root as ReactRoot } from 'react-dom/client'
import { waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTACT_EMAIL } from '../constants'
import { COPY } from '../content/copy'
import { hydrateApp } from '../hydrateApp'
import { LOCALE_NAME, type Locale } from '../i18n/locale'
import { openUrl } from '../lib/navigate'

vi.mock('../lib/navigate', () => ({ openUrl: vi.fn() }))

/**
 * The endpoint the hydrated ContactForm sees. The production tree takes
 * CONTACT_FORM_ENDPOINT as its default, so these tests pin it per describe
 * block instead of inheriting whatever src/constants/contact.ts ships: the
 * launch flips it from null to '/api/contact' (infra/README.md step 11), and
 * both settings must keep what the browser filled in. A getter, so a change in
 * beforeEach reaches the component's next render.
 */
const shipped = vi.hoisted(() => ({ endpoint: null as string | null }))

vi.mock('../constants/contact', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../constants/contact')>()
  return {
    ...actual,
    get CONTACT_FORM_ENDPOINT() {
      return shipped.endpoint
    },
  }
})

/** Node's own SHA-256, independent of the Web Crypto path under test. */
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

/**
 * The contact form keeps what the browser put in it before hydration.
 *
 * The served HTML is a working form before the script runs: a visitor on a
 * slow connection can type into it, and a browser restores form fields on a
 * reload, a back/forward visit or a discarded tab coming back. React's
 * hydration leaves those DOM values alone while the component's state starts
 * empty, so without ContactForm's post-hydration effect the next re-render
 * (any keystroke in the form) would wipe them and the form would then report
 * the fields as empty. These tests hydrate the built pages with the production
 * tree, values already in the controls, as a browser would leave them, once
 * with the form off (the mailto fallback) and once with it on (the POST).
 * Requires a prior `npm run build`.
 */

const DIST = join(process.cwd(), 'dist')

/** A detached #root holding exactly the markup the file serves. */
function servedRoot(outFile: string): HTMLElement {
  const path = join(DIST, outFile)
  if (!existsSync(path)) throw new Error(`dist/${outFile} not found. Run \`npm run build\` first.`)
  const doc = new DOMParser().parseFromString(readFileSync(path, 'utf8'), 'text/html')
  const served = doc.getElementById('root')
  if (!served?.firstElementChild) throw new Error(`dist/${outFile} has an empty #root.`)
  const container = document.createElement('div')
  container.id = 'root'
  container.innerHTML = served.innerHTML
  return container
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

function control(form: HTMLFormElement, name: string): Control {
  const element = form.elements.namedItem(name)
  if (
    !(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)
  ) {
    throw new Error(`The served form has no control named ${name}.`)
  }
  return element
}

let mounted: { root: ReactRoot; container: HTMLElement } | undefined

beforeEach(() => {
  vi.mocked(openUrl).mockClear()
})

afterEach(() => {
  if (mounted) {
    act(() => mounted!.root.unmount())
    mounted.container.remove()
    mounted = undefined
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

it('ships CONTACT_FORM_ENDPOINT as null (form off) or the same-origin path /api/contact (form on)', async () => {
  const { CONTACT_FORM_ENDPOINT } = await vi.importActual<typeof import('../constants/contact')>('../constants/contact')
  expect([null, '/api/contact']).toContain(CONTACT_FORM_ENDPOINT)
})

/**
 * Serves `outFile` at `pathname`, lets `prefill` write into the served form as
 * the browser would, then hydrates. Returns the form and any recoverable
 * (hydration) errors.
 */
async function hydrateWithPrefill(outFile: string, pathname: string, prefill: (form: HTMLFormElement) => void) {
  window.history.replaceState({}, '', pathname)
  const container = servedRoot(outFile)
  document.body.appendChild(container)
  const form = container.querySelector('form')
  if (!form) throw new Error(`dist/${outFile} serves no form.`)
  prefill(form)

  const recoverableErrors: string[] = []
  let root: ReactRoot | undefined
  await act(async () => {
    root = hydrateApp(container, (error) => recoverableErrors.push(String(error)))
  })
  mounted = { root: root!, container }
  return { form, recoverableErrors }
}

function mailtoBody(): string {
  expect(openUrl).toHaveBeenCalledTimes(1)
  const url = vi.mocked(openUrl).mock.calls[0][0]
  expect(url.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true)
  return decodeURIComponent(url.split('&body=')[1])
}

describe('the contact form after hydration, while it is off (CONTACT_FORM_ENDPOINT null: the mailto fallback)', () => {
  beforeEach(() => {
    shipped.endpoint = null
  })

  it('keeps every field the browser filled before hydration, through later edits, into the message it sends', async () => {
    const locale: Locale = 'en'
    const t = COPY[locale].contact.form
    const labels = t.mailFieldLabels
    const { form, recoverableErrors } = await hydrateWithPrefill('index.html', '/', (served) => {
      control(served, 'name').value = 'Ana Reyes'
      control(served, 'email').value = 'ana@example.com'
      control(served, 'phone').value = '419 555 0100'
      control(served, 'language').value = 'es'
      control(served, 'audience').value = 'media'
      control(served, 'message').value = 'A question about the pilot zone'
      ;(control(served, 'updates') as HTMLInputElement).checked = true
    })
    expect(recoverableErrors).toEqual([])

    // One edit after hydration re-renders the whole form.
    const user = userEvent.setup()
    await user.type(control(form, 'message'), '?')

    expect(control(form, 'name')).toHaveValue('Ana Reyes')
    expect(control(form, 'email')).toHaveValue('ana@example.com')
    expect(control(form, 'phone')).toHaveValue('419 555 0100')
    expect(control(form, 'language')).toHaveValue('es')
    expect(control(form, 'audience')).toHaveValue('media')
    expect(control(form, 'message')).toHaveValue('A question about the pilot zone?')
    expect(control(form, 'updates')).toBeChecked()

    await user.click(within(form).getByRole('button', { name: t.submit }))

    expect(form.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
    expect(within(form).getByRole('status')).toHaveTextContent(t.status.mailto(CONTACT_EMAIL))
    const body = mailtoBody()
    expect(body).toContain(`${labels.name}: Ana Reyes`)
    expect(body).toContain(`${labels.email}: ana@example.com`)
    expect(body).toContain(`${labels.phone}: 419 555 0100`)
    expect(body).toContain(`${labels.language}: ${LOCALE_NAME.es}`)
    expect(body).toContain(`${labels.audience}: ${t.audienceOptions.media}`)
    expect(body).toContain(`${labels.updates}: ${labels.yes}`)
    expect(body).toContain('A question about the pilot zone?')
  })

  it('on /es, keeps fields typed before hydration when another field changes afterwards', async () => {
    const locale: Locale = 'es'
    const t = COPY[locale].contact.form
    const labels = t.mailFieldLabels
    const { form, recoverableErrors } = await hydrateWithPrefill('es.html', '/es', (served) => {
      control(served, 'name').value = 'María José Peña'
      control(served, 'email').value = 'maria@example.com'
      control(served, 'message').value = 'Necesito ayuda con mi techo.'
    })
    expect(recoverableErrors).toEqual([])

    const user = userEvent.setup()
    await user.selectOptions(control(form, 'audience'), 'home-help')

    expect(control(form, 'name')).toHaveValue('María José Peña')
    expect(control(form, 'email')).toHaveValue('maria@example.com')
    expect(control(form, 'language')).toHaveValue('es')
    expect(control(form, 'updates')).not.toBeChecked()

    await user.click(within(form).getByRole('button', { name: t.submit }))

    expect(form.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
    const body = mailtoBody()
    expect(body).toContain(`${labels.name}: María José Peña`)
    expect(body).toContain(`${labels.email}: maria@example.com`)
    expect(body).toContain(`${labels.language}: ${LOCALE_NAME.es}`)
    expect(body).toContain(`${labels.audience}: ${t.audienceOptions['home-help']}`)
    expect(body).toContain(`${labels.updates}: ${labels.no}`)
    expect(body).toContain('Necesito ayuda con mi techo.')
  })

  it('changes nothing when the served form is untouched', async () => {
    const t = COPY.en.contact.form
    const { form, recoverableErrors } = await hydrateWithPrefill('index.html', '/', () => {})
    expect(recoverableErrors).toEqual([])
    expect(control(form, 'name')).toHaveValue('')
    expect(control(form, 'language')).toHaveValue('en')
    expect(control(form, 'audience')).toHaveValue('')
    expect(control(form, 'updates')).not.toBeChecked()

    const user = userEvent.setup()
    await user.click(within(form).getByRole('button', { name: t.submit }))
    expect(within(form).getByRole('status')).toHaveTextContent(t.errors.summary)
    expect(openUrl).not.toHaveBeenCalled()
  })
})

describe("the contact form after hydration, once it is on (CONTACT_FORM_ENDPOINT '/api/contact', runbook step 11)", () => {
  beforeEach(() => {
    shipped.endpoint = '/api/contact'
  })

  /** Stubs fetch with the endpoint's success answer and returns the one request the form sent. */
  function stubEndpoint() {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    return async () => {
      // fetch waits for the body's SHA-256 (Web Crypto, asynchronous).
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string; headers: Record<string, string> }]
      expect(url).toBe('/api/contact')
      expect(init.method).toBe('POST')
      expect(init.headers['x-amz-content-sha256']).toBe(sha256(init.body))
      return JSON.parse(init.body) as Record<string, unknown>
    }
  }

  it('POSTs every field the browser filled before hydration, through later edits, and thanks the visitor', async () => {
    const t = COPY.en.contact.form
    const sentRequest = stubEndpoint()
    const { form, recoverableErrors } = await hydrateWithPrefill('index.html', '/', (served) => {
      control(served, 'name').value = 'Ana Reyes'
      control(served, 'email').value = 'ana@example.com'
      control(served, 'phone').value = '419 555 0100'
      control(served, 'language').value = 'es'
      control(served, 'audience').value = 'media'
      control(served, 'message').value = 'A question about the pilot zone'
      ;(control(served, 'updates') as HTMLInputElement).checked = true
    })
    expect(recoverableErrors).toEqual([])

    const user = userEvent.setup()
    await user.type(control(form, 'message'), '?')
    await user.click(within(form).getByRole('button', { name: t.submit }))

    expect(await sentRequest()).toEqual({
      name: 'Ana Reyes',
      email: 'ana@example.com',
      phone: '419 555 0100',
      preferredLanguage: 'es',
      audience: 'media',
      message: 'A question about the pilot zone?',
      updates: true,
      pageLanguage: 'en',
      website: '',
    })
    expect(await within(form).findByText(t.status.sent)).toBeInTheDocument()
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('on /es, POSTs fields typed before hydration when another field changes afterwards', async () => {
    const t = COPY.es.contact.form
    const sentRequest = stubEndpoint()
    const { form, recoverableErrors } = await hydrateWithPrefill('es.html', '/es', (served) => {
      control(served, 'name').value = 'María José Peña'
      control(served, 'email').value = 'maria@example.com'
      control(served, 'message').value = 'Necesito ayuda con mi techo.'
    })
    expect(recoverableErrors).toEqual([])

    const user = userEvent.setup()
    await user.selectOptions(control(form, 'audience'), 'home-help')
    await user.click(within(form).getByRole('button', { name: t.submit }))

    expect(await sentRequest()).toEqual({
      name: 'María José Peña',
      email: 'maria@example.com',
      phone: '',
      preferredLanguage: 'es',
      audience: 'home-help',
      message: 'Necesito ayuda con mi techo.',
      updates: false,
      pageLanguage: 'es',
      website: '',
    })
    expect(await within(form).findByText(t.status.sent)).toBeInTheDocument()
    expect(openUrl).not.toHaveBeenCalled()
  })
})
