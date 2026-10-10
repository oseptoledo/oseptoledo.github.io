import SiteImg from './SiteImg'
import { IMAGES } from '../content/images'
import { PILOT_ZONE_PROPERTIES } from '../content/stats'
import { useCopy } from '../i18n/useCopy'

/** The Pilot Zone: where the partners started, its property count, and the zone map. */
export default function PilotZone() {
  const t = useCopy().pilot
  return (
    <section id="pilot" aria-labelledby="pilot-heading" className="on-dark bg-ink py-10 text-cream md:py-[72px]">
      <div className="site-container flex flex-col gap-6 md:gap-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <div className="flex max-w-[680px] flex-col gap-3 md:gap-4">
            <p className="eyebrow m-0 text-marigold">{t.eyebrow}</p>
            <h2 id="pilot-heading" className="section-title">
              {t.title}
            </h2>
            <p className="m-0 text-base leading-[1.6] text-sand md:text-lg">{t.body}</p>
          </div>
          <p className="m-0 flex items-baseline gap-3 lg:flex-col lg:items-end lg:gap-0">
            <span className="text-[3.5rem] leading-none font-bold text-marigold md:text-[5.5rem]">
              {PILOT_ZONE_PROPERTIES}
            </span>
            <span className="text-base text-sand md:text-[1.0625rem]">{t.statLabel}</span>
          </p>
        </div>
        <figure className="m-0 flex flex-col gap-2.5">
          <SiteImg
            image={IMAGES.pilotZoneMap}
            sizes="(min-width: 1280px) 1200px, (min-width: 768px) calc(100vw - 80px), calc(100vw - 40px)"
            className="block aspect-[350/240] h-auto w-full rounded-[14px] object-cover md:aspect-[1200/440] md:rounded-[20px]"
          />
          <figcaption className="text-sm text-sand">{t.mapCaption}</figcaption>
        </figure>
      </div>
    </section>
  )
}
