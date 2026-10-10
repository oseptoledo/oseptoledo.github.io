import BrandMark from './BrandMark'
import Wordmark from './Wordmark'
import { SITE_SHORT_NAME } from '../constants'
import { PARTNERS } from '../content/partners'
import { LOCALE_HOME_PATH, useLocale, type Locale } from '../i18n/locale'
import { useCopy } from '../i18n/useCopy'

/**
 * Site footer: the mark, the place, every partner by name, the copyright line,
 * and a link to the page in the other language.
 *
 * The year is `__BUILD_YEAR__` (vite.config.ts), never `new Date()`: the page
 * hydrates, and a render-time clock read would make the client disagree with
 * the prerendered HTML the first time a visitor's year differs from the build's.
 */
export default function Footer() {
  const locale = useLocale()
  const t = useCopy().footer
  const other: Locale = locale === 'en' ? 'es' : 'en'
  return (
    <footer className="on-dark bg-ink text-cream">
      <div className="site-container flex flex-col gap-5 py-8 md:gap-8 md:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <BrandMark onDark className="h-10 w-[58px] shrink-0 sm:h-[50px] sm:w-[72px]" />
              <Wordmark large />
            </div>
            <p className="m-0 text-[0.9375rem] text-sand">{t.place}</p>
          </div>
          <div className="max-w-[720px]">
            <h2 className="sr-only">{t.partnersLabel}</h2>
            <p className="m-0 text-sm leading-[1.8] text-sand">
              {PARTNERS.map((partner) => partner.name).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-umber pt-6 text-sm text-sand sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0">
            © {__BUILD_YEAR__} {SITE_SHORT_NAME}
          </p>
          <a
            href={LOCALE_HOME_PATH[other]}
            lang={other}
            hrefLang={other}
            className="text-cream underline underline-offset-4 hover:text-marigold"
          >
            {t.otherLanguage}
          </a>
        </div>
      </div>
    </footer>
  )
}
