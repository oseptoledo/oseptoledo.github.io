import SiteImg from './SiteImg'
import { HORIZON } from '../content/horizon'
import { IMAGES } from '../content/images'
import { partnerById } from '../content/partners'
import { useLocale } from '../i18n/locale'
import { useCopy } from '../i18n/useCopy'

/** "Where we're going next": one card per partner's current work. */
export default function Horizon() {
  const t = useCopy().horizon
  const locale = useLocale()
  return (
    <section id="next" aria-labelledby="next-heading" className="on-dark bg-navy py-10 text-cream md:py-[72px]">
      <div className="site-container flex flex-col gap-4 md:gap-12">
        <div className="flex flex-col gap-4 md:gap-8 xl:flex-row xl:items-stretch xl:gap-16">
          <div className="flex flex-col justify-center gap-3 md:gap-4 xl:grow">
            <p className="eyebrow m-0 text-marigold">{t.eyebrow}</p>
            <h2 id="next-heading" className="section-title">
              {t.title}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-[1.29fr_1fr] md:gap-6 xl:flex xl:gap-16">
            <SiteImg
              image={IMAGES.horizonNewHome}
              sizes="(min-width: 1280px) 360px, (min-width: 768px) 56vw, calc(100vw - 40px)"
              className="block h-[190px] w-full rounded-[14px] object-cover md:h-[260px] xl:h-[280px] xl:w-[360px] xl:shrink-0 xl:rounded-[20px]"
            />
            <SiteImg
              image={IMAGES.horizonNeighbors}
              sizes="(min-width: 1280px) 280px, (min-width: 768px) 44vw, calc(100vw - 40px)"
              className="block h-[190px] w-full rounded-[14px] object-cover md:h-[260px] xl:h-[280px] xl:w-[280px] xl:shrink-0 xl:rounded-[20px]"
            />
          </div>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 md:gap-5 xl:grid-cols-4">
          {HORIZON.map((item) => (
            <li key={item.partnerId} className="flex flex-col gap-2.5 rounded-2xl bg-navy-light p-5 md:p-[26px]">
              <h3 className="m-0 text-[0.8125rem] font-bold tracking-[2px] text-marigold uppercase">
                {partnerById(item.partnerId).name}
              </h3>
              <p className="m-0 text-base leading-[1.55]">{item.body[locale]}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
