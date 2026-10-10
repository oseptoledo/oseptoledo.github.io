import SiteImg from './SiteImg'
import { ROCK_THE_BLOCK_GALLERY } from '../content/images'
import { STATS, STATS_AS_OF, STATS_AS_OF_LABEL } from '../content/stats'
import { MILESTONES } from '../content/timeline'
import { useLocale } from '../i18n/locale'
import { useCopy } from '../i18n/useCopy'

/** Dot color per milestone, cycling, as in the design. */
const DOTS = ['bg-brick', 'bg-marigold', 'bg-lagoon']

/**
 * "Our first year, together": the headline figures with their as-of date, the
 * milestone timeline, and the Rock the Block photos.
 *
 * The timeline is one ordered list, newest first. From md up it is a grid of
 * two columns of five rows that fills column by column (`grid-flow-col`), as
 * in the design: items 1 to 5 down the left, 6 to 10 down the right, each row
 * lined up across both columns, and the visual order matches the DOM order a
 * screen reader follows.
 *
 * The row count (5) is written into the list's grid-rows class, because the
 * site's Content-Security-Policy (infra) allows no inline styles, so it cannot
 * come from a `style` attribute or a CSS variable set on the element
 * (src/__tests__/csp-compat.test.ts fails on any in the built HTML). An 11th
 * milestone would open a third column: change that class to
 * ceil(milestones / 2) rows. content.test.ts fails until the two agree.
 */
export default function Progress() {
  const t = useCopy().progress
  const locale = useLocale()

  return (
    <section id="progress" aria-labelledby="progress-heading" className="site-container flex flex-col gap-5 py-10 md:gap-10 md:py-[72px]">
      <div className="flex max-w-[760px] flex-col gap-3 md:gap-4">
        <p className="eyebrow m-0 text-brick">{t.eyebrow}</p>
        <h2 id="progress-heading" className="section-title">
          {t.title}
        </h2>
      </div>

      <div className="flex flex-col gap-2.5">
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 md:gap-5">
          {STATS.map((stat) => (
            <li
              key={stat.label.en}
              className="flex flex-col gap-1 rounded-xl border border-line bg-white px-2.5 py-3.5 md:gap-1.5 md:rounded-2xl md:p-7"
            >
              <span className="text-[1.875rem] leading-none font-bold text-brick md:text-[3.5rem]">
                {stat.value[locale]}
              </span>
              <span className="text-[0.8125rem] leading-[1.3] md:text-base">{stat.label[locale]}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-sm text-stone">
          <time dateTime={STATS_AS_OF.slice(0, 7)}>{STATS_AS_OF_LABEL[locale]}</time>
        </p>
      </div>

      <ol className="m-0 grid list-none gap-[18px] p-0 md:grid-flow-col md:grid-cols-2 md:grid-rows-[repeat(5,auto)] md:gap-x-[72px] md:gap-y-5">
        {MILESTONES.map((milestone, i) => (
          <li key={`${milestone.datetime}-${milestone.title.en}`} className="flex gap-3.5 md:gap-5">
            <span
              aria-hidden="true"
              className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full md:h-[18px] md:w-[18px] ${DOTS[i % DOTS.length]}`}
            />
            <div className="flex flex-col gap-1 md:gap-1.5">
              <p className="m-0 text-xs font-bold tracking-[2px] text-stone uppercase md:text-sm">
                <time dateTime={milestone.datetime}>{milestone.when[locale]}</time>
              </p>
              <h3 className="m-0 text-[1.0625rem] font-extrabold md:text-xl">{milestone.title[locale]}</h3>
              <p className="m-0 text-[0.9375rem] leading-normal text-umber md:text-base md:leading-[1.55]">
                {milestone.body[locale]}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <figure className="m-0 flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          {ROCK_THE_BLOCK_GALLERY.map((image) => (
            <SiteImg
              key={image.src}
              image={image}
              className="block h-[120px] w-full rounded-xl object-cover md:h-[200px] md:rounded-2xl"
            />
          ))}
        </div>
        <figcaption className="text-sm text-stone">{t.galleryCaption}</figcaption>
      </figure>
    </section>
  )
}
