import { FUNDER_IDS, partnerById } from '../content/partners'
import { useCopy } from '../i18n/useCopy'

/** "Powered by": the two funders' logos, each linking to the funder. */
export default function PoweredBy() {
  const t = useCopy()
  return (
    <section aria-labelledby="powered-by-heading" className="border-t border-line">
      <div className="site-container flex flex-col items-center gap-4 py-7 md:flex-row md:justify-center md:gap-16 md:py-10">
        <h2 id="powered-by-heading" className="eyebrow m-0 text-stone">
          {t.poweredBy}
        </h2>
        <ul className="m-0 flex list-none flex-col items-center gap-4 p-0 md:flex-row md:gap-16">
          {FUNDER_IDS.map((id) => {
            const funder = partnerById(id)
            return (
              <li key={id}>
                <a href={funder.url} className="block rounded-md">
                  <img
                    src={funder.logo.src}
                    width={funder.logo.width}
                    height={funder.logo.height}
                    alt={funder.name}
                    loading="lazy"
                    decoding="async"
                    className="h-[60px] w-auto md:h-[88px]"
                  />
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
