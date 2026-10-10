import { NEWS, formatDate } from '../content/news'
import { useLocale } from '../i18n/locale'
import { useCopy } from '../i18n/useCopy'

/**
 * Press coverage. The design shows only the "In the news" label above the
 * cards, so that label is the section's `<h2>`, styled as an eyebrow, which
 * keeps the heading outline unbroken. Every story is in English: on the Spanish
 * page the headline is marked `lang="en"` and the link says so.
 */
export default function News() {
  const t = useCopy().news
  const locale = useLocale()
  const foreign = locale !== 'en'
  return (
    <section id="news" aria-labelledby="news-heading" className="site-container flex flex-col gap-3.5 py-10 md:gap-8 md:py-[72px]">
      <h2 id="news-heading" className="eyebrow m-0 text-brick">
        {t.heading}
      </h2>
      <ul className="m-0 grid list-none gap-3.5 p-0 lg:grid-cols-3 lg:gap-6">
        {NEWS.map((item) => (
          <li key={item.url}>
            <article className="flex h-full flex-col gap-3.5 rounded-2xl border border-line bg-white p-6 md:p-8">
              <p className="m-0 text-[0.8125rem] font-bold tracking-[2px] text-stone uppercase">
                {item.outlet} · <time dateTime={item.date}>{formatDate(item.date, locale)}</time>
              </p>
              <h3
                lang={foreign ? 'en' : undefined}
                className="m-0 text-xl leading-[1.25] font-bold md:text-2xl"
              >
                {item.headline}
              </h3>
              <a href={item.url} hrefLang="en" className="text-link mt-auto self-start text-base">
                {t.readMore}
                {t.readMoreNote}
                <span className="sr-only">: {item.headline}</span>
              </a>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}
