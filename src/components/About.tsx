import SiteImg from './SiteImg'
import { IMAGES } from '../content/images'
import { useCopy } from '../i18n/useCopy'

/** Top-border color of the three "How we're organized" cards, in order. */
const GROUP_ACCENTS = ['border-t-lagoon', 'border-t-brick', 'border-t-marigold']

/**
 * Mission and structure. On wide screens the photo sits in a column to the
 * left of all the text; on phones it falls between the mission statement and
 * the body copy, as in the mobile design. One grid with named areas does both,
 * so the DOM order (heading, photo, body) is the reading order everywhere.
 */
export default function About() {
  const t = useCopy().about
  return (
    <section
      id="about"
      aria-labelledby="about-heading"
      className="site-container grid gap-[18px] py-10 [grid-template-areas:'head'_'img'_'body'] md:gap-6 md:py-[72px] lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:[grid-template-areas:'img_head'_'img_body'] xl:grid-cols-[480px_minmax(0,1fr)] xl:gap-x-20"
    >
      <div className="flex flex-col gap-[18px] [grid-area:head] md:gap-6">
        <h2 id="about-heading" className="eyebrow m-0 text-brick">
          {t.eyebrow}
        </h2>
        <p className="m-0 text-[1.375rem] leading-[1.35] font-medium md:text-[1.75rem] md:leading-[1.3]">
          {t.mission}
        </p>
      </div>

      <SiteImg
        image={IMAGES.aboutPartnerStaff}
        sizes="(min-width: 1280px) 480px, (min-width: 1024px) 400px, (min-width: 768px) calc(100vw - 80px), calc(100vw - 40px)"
        className="block h-[260px] w-full rounded-2xl object-cover object-[center_35%] [grid-area:img] md:h-[420px] lg:h-[540px] lg:rounded-[20px] lg:object-center"
      />

      <div className="flex flex-col gap-[18px] [grid-area:body] md:gap-6">
        <p className="m-0 text-base leading-[1.6] text-umber md:text-lg md:leading-[1.65]">{t.body}</p>
        <h3 className="m-0 pt-2 text-xl font-extrabold">{t.structureHeading}</h3>
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3 md:gap-4">
          {t.groups.map((group, i) => (
            <li
              key={group.title}
              className={`flex flex-col gap-1.5 rounded-[14px] border-t-[5px] bg-white p-5 ${GROUP_ACCENTS[i % GROUP_ACCENTS.length]}`}
            >
              <h4 className="m-0 text-[1.0625rem] font-extrabold">{group.title}</h4>
              <p className="m-0 text-[0.9375rem] leading-normal text-stone">{group.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
