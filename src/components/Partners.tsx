import { PARTNERS } from '../content/partners'
import { useLocale } from '../i18n/locale'
import { useCopy } from '../i18n/useCopy'

/**
 * The ten partner cards. Each card links to the partner's own site; the link is
 * the partner's name, stretched over the whole card with a pseudo-element, so
 * the card is one large click target while its accessible name stays the short
 * organization name rather than the entire card's text. The logo is decorative
 * (alt="") because the name is printed directly beneath it.
 */
export default function Partners() {
  const t = useCopy().partners
  const locale = useLocale()
  return (
    <section id="partners" aria-labelledby="partners-heading" className="bg-white py-10 md:py-[72px]">
      <div className="site-container flex flex-col gap-4 md:gap-12">
        <div className="flex max-w-[760px] flex-col gap-3 md:gap-4">
          <p className="eyebrow m-0 text-brick">{t.eyebrow}</p>
          <h2 id="partners-heading" className="section-title">
            {t.title}
          </h2>
          <p className="m-0 text-base leading-[1.6] text-umber md:text-lg">{t.lead}</p>
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-3 lg:gap-5 xl:grid-cols-5">
          {PARTNERS.map((partner) => (
            <li
              key={partner.id}
              className="relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-cream has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-cobalt hover:border-pebble lg:rounded-2xl"
            >
              <div
                className={`flex h-24 items-center justify-center lg:h-[120px] ${partner.logo.boxClass}`}
              >
                <img
                  src={partner.logo.src}
                  width={partner.logo.width}
                  height={partner.logo.height}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={
                    partner.logo.fit === 'cover'
                      ? 'h-full w-full object-cover'
                      : 'h-auto max-h-full w-auto max-w-full object-contain'
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5 p-3 pb-3.5 lg:gap-2.5 lg:px-[18px] lg:pt-[18px] lg:pb-[22px]">
                {partner.founding && (
                  <span className="eyebrow self-start rounded-full bg-marigold px-2 py-[3px] text-[0.625rem] tracking-[0.5px] lg:px-2.5 lg:py-1 lg:text-xs">
                    {t.foundingBadge}
                  </span>
                )}
                <h3 className="m-0 text-[0.9375rem] leading-tight font-extrabold lg:text-[1.0625rem]">
                  <a
                    href={partner.url}
                    className="text-ink no-underline outline-none after:absolute after:inset-0 after:content-[''] hover:text-brick"
                  >
                    {partner.name}
                  </a>
                </h3>
                <p className="m-0 text-[0.8125rem] leading-normal text-stone lg:text-sm">
                  {partner.blurb[locale]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
