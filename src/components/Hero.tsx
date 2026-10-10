import SiteImg from './SiteImg'
import { IMAGES } from '../content/images'
import { useLocale } from '../i18n/locale'
import { useCopy } from '../i18n/useCopy'

/**
 * Opening section: eyebrow, the page's single `<h1>`, the lead, two CTAs, and
 * the Broadway storefronts photo with the folklórico dancers overlapping its
 * corner. The storefronts photo is the largest paint on every viewport, so it
 * alone loads at high priority.
 */
export default function Hero() {
  const t = useCopy().hero
  const locale = useLocale()
  return (
    <section
      id="top"
      className="site-container grid items-center gap-6 pt-7 pb-6 md:gap-10 md:py-12 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)] xl:gap-16 xl:pt-14 xl:pb-12"
    >
      <div className="flex flex-col gap-[18px] md:gap-7">
        <p className="eyebrow m-0 text-stone">{t.eyebrow}</p>
        <h1
          className={`m-0 text-[2.25rem] leading-[1.08] max-[359px]:text-[1.75rem] font-bold tracking-[-0.5px] md:text-5xl xl:leading-[1.05] xl:tracking-[-1px] ${
            locale === 'es' ? 'xl:text-[3.25rem]' : 'xl:text-[3.75rem]'
          }`}
        >
          {t.title}
        </h1>
        <p className="m-0 text-[1.0625rem] leading-[1.55] text-umber md:text-xl">{t.lead}</p>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-4">
          <a href="#partners" className="btn btn-ink">
            {t.primaryCta}
          </a>
          <a href="#contact" className="btn btn-outline">
            {t.secondaryCta}
          </a>
        </div>
      </div>

      <div className="relative pb-[16%] xl:pb-[14%]">
        <SiteImg
          image={IMAGES.heroBroadway}
          loading="lcp"
          sizes="(min-width: 1280px) 576px, (min-width: 768px) calc(100vw - 80px), calc(100vw - 40px)"
          className="block aspect-[596/420] h-auto w-full rounded-2xl object-cover xl:rounded-[20px]"
        />
        <SiteImg
          image={IMAGES.heroFolklorico}
          loading="eager"
          sizes="(min-width: 1280px) 300px, 48vw"
          className="absolute right-0 bottom-0 aspect-[300/190] h-auto w-[48%] max-w-[300px] rounded-xl border-[5px] border-cream object-cover xl:-right-4 xl:w-[52%] xl:rounded-2xl xl:border-[6px]"
        />
      </div>
    </section>
  )
}
