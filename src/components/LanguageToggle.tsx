import { LOCALE_HOME_PATH, LOCALE_NAME, LOCALES, useLocale } from '../i18n/locale'
import { useCopy } from '../i18n/useCopy'

/**
 * EN | ES pill. Each side is a plain link to that language's prerendered page,
 * a full page load, so the visitor always receives HTML already in the language
 * they picked. The current language is marked `aria-current="page"`; each link
 * carries `lang` and `hrefLang` so assistive tech pronounces it correctly and
 * crawlers see the alternate. The accessible name keeps the visible "EN"/"ES"
 * and adds the language name ("EN, English").
 */
export default function LanguageToggle() {
  const locale = useLocale()
  const t = useCopy()
  return (
    <div
      role="group"
      aria-label={t.nav.languageLabel}
      className="flex overflow-hidden rounded-full border-[1.5px] border-ink"
    >
      {LOCALES.map((code) => {
        const current = code === locale
        return (
          <a
            key={code}
            href={LOCALE_HOME_PATH[code]}
            lang={code}
            hrefLang={code}
            aria-current={current ? 'page' : undefined}
            aria-label={`${code.toUpperCase()}, ${LOCALE_NAME[code]}`}
            className={`flex h-11 items-center px-2.5 text-[0.8125rem] font-bold no-underline xl:px-4 xl:text-sm ${
              current ? 'bg-ink text-cream' : 'text-ink hover:bg-line'
            }`}
          >
            {code.toUpperCase()}
          </a>
        )
      })}
    </div>
  )
}
