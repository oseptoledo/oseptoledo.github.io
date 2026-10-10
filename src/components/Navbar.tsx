import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Menu, X } from 'lucide-react'
import BrandMark from './BrandMark'
import LanguageToggle from './LanguageToggle'
import Wordmark from './Wordmark'
import { useCopy } from '../i18n/useCopy'
import useModalA11y from '../hooks/useModalA11y'

/** Below this width the section links collapse into the menu dialog (Tailwind `xl`). */
const DESKTOP_QUERY = '(min-width: 80rem)'

/**
 * Go to an in-page section by changing the hash, which lets the browser do the
 * scrolling (honoring scroll-margin-top and reduced motion) and move its
 * sequential-focus starting point. Same hash twice is not a navigation, so a
 * repeat click scrolls directly.
 */
function jumpTo(id: string) {
  if (window.location.hash === `#${id}`) document.getElementById(id)?.scrollIntoView()
  else window.location.hash = id
}

function HomeLink({ label }: { label: string }) {
  return (
    <a href="#top" aria-label={label} className="flex min-w-0 items-center gap-2 text-ink no-underline xl:gap-3">
      <BrandMark className="h-6 w-[34px] shrink-0 xl:h-8 xl:w-[46px]" />
      <Wordmark />
    </a>
  )
}

/**
 * Sticky site header. At `xl` and up it shows the design's full row: section
 * links, the EN/ES switch and the Get in Touch button. Below that, the links
 * move into a full-screen menu dialog behind a hamburger button, as in the
 * mobile design; the dialog repeats the header row so its close button sits
 * exactly where the open button was.
 *
 * The menu is closed on the server and on first render, so the prerendered
 * markup and the hydrating client agree.
 */
export default function Navbar() {
  const t = useCopy()
  const [menuOpen, setMenuOpen] = useState(false)
  const openRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  // A link inside the menu must not jump while the menu is still open: the
  // scroll lock and the focus hand-back to the menu button both land mid-jump
  // and leave the page short of the section. Close first, then jump once the
  // dialog is gone. React flushes a click's state update and effects
  // synchronously, so the next task already sees the page unlocked. A timeout
  // rather than requestAnimationFrame, which never fires in a hidden tab.
  const closeMenuAndGo = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    closeMenu()
    window.setTimeout(() => jumpTo(id), 0)
  }

  const menuRef = useModalA11y({
    isOpen: menuOpen,
    onClose: closeMenu,
    triggerRef: openRef,
    initialFocusRef: closeRef,
  })

  // The dialog only exists below xl. If the window widens past it while the
  // menu is open, close it so the scroll lock does not outlive the menu.
  useEffect(() => {
    if (!menuOpen) return
    const query = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => {
      if (query.matches) closeMenu()
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [menuOpen, closeMenu])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream">
      <div className="site-container flex h-16 items-center justify-between gap-3 sm:gap-4 xl:h-[88px]">
        <HomeLink label={t.homeLinkLabel} />

        <nav aria-label={t.nav.label} className="hidden xl:block">
          <ul className="m-0 flex list-none items-center gap-8 p-0 text-base font-medium">
            {t.nav.items.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-ink no-underline hover:text-brick">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2 xl:gap-8">
          <LanguageToggle />
          <a href="#contact" className="btn btn-brick hidden min-h-12 px-6 text-base xl:inline-flex">
            {t.nav.cta}
          </a>
          <button
            ref={openRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t.nav.openMenu}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-ink xl:hidden"
          >
            <Menu size={24} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          id="site-menu"
          role="dialog"
          aria-modal="true"
          aria-label={t.nav.menuLabel}
          className="fixed inset-0 z-50 overflow-y-auto bg-cream xl:hidden"
        >
          <div className="border-b border-line">
            <div className="site-container flex h-16 items-center justify-between gap-3 sm:gap-4">
              <HomeLink label={t.homeLinkLabel} />
              <div className="flex shrink-0 items-center gap-2">
                <LanguageToggle />
                <button
                  ref={closeRef}
                  type="button"
                  onClick={closeMenu}
                  aria-label={t.nav.closeMenu}
                  className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-ink"
                >
                  <X size={24} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
          <nav aria-label={t.nav.label} className="site-container py-4">
            <ul className="m-0 list-none p-0">
              {t.nav.items.map((item) => (
                <li key={item.id} className="border-b border-line">
                  <a
                    href={`#${item.id}`}
                    onClick={closeMenuAndGo(item.id)}
                    className="block py-4 text-2xl font-bold text-ink no-underline hover:text-brick"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <a href="#contact" onClick={closeMenuAndGo('contact')} className="btn btn-brick mt-8 w-full">
              {t.nav.cta}
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
