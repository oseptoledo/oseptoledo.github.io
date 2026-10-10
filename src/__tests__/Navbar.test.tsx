import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Navbar from '../components/Navbar'
import { COPY } from '../content/copy'
import { LocaleContext, type Locale } from '../i18n/locale'

function renderNavbar(locale: Locale) {
  return render(
    <LocaleContext.Provider value={locale}>
      <Navbar />
    </LocaleContext.Provider>,
  )
}

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState({}, '', '/')
})

describe('Navbar', () => {
  it.each(['en', 'es'] as const)('links every section in %s', (locale) => {
    renderNavbar(locale)
    const nav = screen.getByRole('navigation', { name: COPY[locale].nav.label })
    for (const item of COPY[locale].nav.items) {
      expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute('href', `#${item.id}`)
    }
  })

  it.each([
    ['en', '/', '/es'],
    ['es', '/es', '/'],
  ] as const)('on the %s page marks its language current and links the other', (locale, here, there) => {
    renderNavbar(locale)
    const group = screen.getByRole('group', { name: COPY[locale].nav.languageLabel })
    const links = within(group).getAllByRole('link')
    const current = links.find((link) => link.getAttribute('aria-current') === 'page')!
    const other = links.find((link) => !link.hasAttribute('aria-current'))!
    expect(current).toHaveAttribute('href', here)
    expect(current).toHaveAttribute('lang', locale)
    expect(other).toHaveAttribute('href', there)
    expect(other).toHaveAttribute('hreflang', other.getAttribute('lang'))
  })

  it('opens the menu as a modal dialog, focuses its close button, and closes on Escape', async () => {
    const user = userEvent.setup()
    renderNavbar('en')
    const open = screen.getByRole('button', { name: 'Open menu' })
    expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(open)
    const dialog = screen.getByRole('dialog', { name: 'Site menu' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(open).toHaveAttribute('aria-expanded', 'true')
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close menu' })).toHaveFocus())
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(open).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('closes the menu before jumping to the section a menu link names', async () => {
    const user = userEvent.setup()
    renderNavbar('es')
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const dialog = screen.getByRole('dialog')

    await user.click(within(dialog).getByRole('link', { name: 'Socios' }))
    // Closed synchronously, scroll lock lifted, and only then the jump.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(window.location.hash).toBe('#partners')
  })
})
