import type { Localized } from '../i18n/locale'

/**
 * The ten partner organizations, in the order the design lists them: founding
 * partners first, then the organizations that joined in November 2025.
 *
 * One module feeds every surface that names a partner: the Partners cards, the
 * What's Next cards (by `id`), the Powered By logos (by `id`), the Footer's
 * partner line, the `member` and `funder` nodes in the index.html JSON-LD, and
 * the Partners block in public/llms.txt. src/__tests__/entity-graph.test.ts and
 * src/__tests__/llms.test.ts fail if the JSON-LD or llms.txt copy drifts.
 *
 * The copy says "Ten organizations" / "Diez organizaciones" in several places
 * (hero, partners heading, about body, stats). src/__tests__/content.test.ts
 * pins the count at ten, so adding or removing a partner fails until that copy
 * is updated with it.
 */
export type PartnerId =
  | 'historic-south'
  | 'jhe-foundation'
  | 'ladderup-housing'
  | 'lucas-county-land-bank'
  | 'mv-habitat'
  | 'toledo-lisc'
  | 'believe-center'
  | 'fair-housing-center'
  | 'gtcf'
  | 'sofia-quintero'

export interface PartnerLogo {
  /** Path under public/. Intrinsic size below must match the file (images.test.tsx). */
  src: string
  width: number
  height: number
  /** `cover` fills the logo box edge to edge; `contain` letterboxes inside padding. */
  fit: 'contain' | 'cover'
  /** Tailwind classes for the logo box: background and padding, as in the design. */
  boxClass: string
}

export interface Partner {
  id: PartnerId
  /** Official name, never translated. */
  name: string
  url: string
  /** One of the six organizations that formed the partnership in September 2025. */
  founding: boolean
  logo: PartnerLogo
  blurb: Localized
}

export const PARTNERS: readonly Partner[] = [
  {
    id: 'historic-south',
    name: 'Historic South Initiative',
    url: 'https://www.historicsouth.org/',
    founding: true,
    logo: {
      src: '/images/logo-historic-south.webp',
      width: 240,
      height: 240,
      fit: 'contain',
      boxClass: 'bg-white p-3 lg:p-1.5',
    },
    blurb: {
      en: 'Full remodels, new construction, and exterior repair and stabilization in the Old South End.',
      es: 'Remodelaciones completas, construcción nueva y reparación y estabilización de exteriores en el Old South End.',
    },
  },
  {
    id: 'jhe-foundation',
    name: 'John Henry Eldred Jr. Foundation',
    url: 'https://www.jhefoundation.org/',
    founding: true,
    logo: {
      src: '/images/logo-jhe-foundation.webp',
      width: 351,
      height: 240,
      fit: 'contain',
      boxClass: 'bg-white p-3 lg:p-7',
    },
    blurb: {
      en: 'A Northwest Ohio funder that sits alongside partners on the Steering Committee and Pilot Project Team.',
      es: 'Un financiador del noroeste de Ohio que participa junto a los socios en el Comité Directivo y el Equipo del Proyecto Piloto.',
    },
  },
  {
    id: 'ladderup-housing',
    name: 'LadderUp Housing',
    url: 'https://www.ladderuphousing.com/',
    founding: true,
    logo: {
      src: '/images/logo-ladderup-housing.webp',
      width: 375,
      height: 240,
      fit: 'contain',
      boxClass: 'bg-white p-3 lg:p-1',
    },
    blurb: {
      en: 'Building new modular homes in the Old South End.',
      es: 'Construye casas modulares nuevas en el Old South End.',
    },
  },
  {
    id: 'lucas-county-land-bank',
    name: 'Lucas County Land Bank',
    url: 'https://lucascountylandbank.org/',
    founding: true,
    logo: {
      src: '/images/logo-lucas-county-land-bank.webp',
      width: 460,
      height: 242,
      fit: 'cover',
      boxClass: 'bg-landbank p-0',
    },
    blurb: {
      en: 'Demolition, nuisance abatement, home renovation, and move-in-ready homeownership.',
      es: 'Demoliciones, eliminación de molestias públicas, renovación de casas y viviendas listas para habitar.',
    },
  },
  {
    id: 'mv-habitat',
    name: 'Maumee Valley Habitat for Humanity',
    url: 'https://mvhabitat.org/',
    founding: true,
    logo: {
      src: '/images/logo-mv-habitat.webp',
      width: 174,
      height: 240,
      fit: 'contain',
      boxClass: 'bg-white p-3 lg:p-4',
    },
    blurb: {
      en: 'Home preservation and critical repairs, plus a Financial Opportunity Center open to Old South End residents.',
      es: 'Preservación de viviendas y reparaciones críticas, además de un Centro de Oportunidades Financieras abierto a los residentes del Old South End.',
    },
  },
  {
    id: 'toledo-lisc',
    name: 'Toledo LISC',
    url: 'https://www.lisc.org/toledo/',
    founding: true,
    logo: {
      src: '/images/logo-toledo-lisc.webp',
      width: 272,
      height: 240,
      fit: 'contain',
      boxClass: 'bg-white p-3 lg:p-6.5',
    },
    blurb: {
      en: 'Acquisition and rehab funding, development gap grants, and zero-interest recoverable grants for nonprofit partners.',
      es: 'Fondos para adquisición y rehabilitación, subvenciones para cubrir brechas de desarrollo y subvenciones recuperables sin intereses para organizaciones socias.',
    },
  },
  {
    id: 'believe-center',
    name: 'The Believe Center',
    url: 'https://www.believecenter.org/',
    founding: false,
    logo: {
      src: '/images/logo-believe-center.webp',
      width: 420,
      height: 240,
      fit: 'contain',
      boxClass: 'bg-white p-3 lg:p-4.5',
    },
    blurb: {
      en: 'A trusted anchor for youth and families, offering education, mentorship, and enrichment, and helping residents navigate housing needs.',
      es: 'Un centro de confianza para jóvenes y familias, con educación, mentoría y enriquecimiento, que también ayuda a los residentes con sus necesidades de vivienda.',
    },
  },
  {
    id: 'fair-housing-center',
    name: 'The Fair Housing Center',
    url: 'https://toledofhc.org/',
    founding: false,
    logo: {
      src: '/images/logo-fair-housing-center.webp',
      width: 240,
      height: 240,
      fit: 'contain',
      boxClass: 'bg-white p-3 lg:p-4',
    },
    blurb: {
      en: 'Direct legal representation for residents, plus nuisance abatement, receivership, and tangled title cases.',
      es: 'Representación legal directa para residentes, además de eliminación de molestias públicas, administración judicial y casos de títulos de propiedad complicados.',
    },
  },
  {
    id: 'gtcf',
    name: 'Greater Toledo Community Foundation',
    url: 'https://toledocf.org/',
    founding: false,
    logo: {
      src: '/images/logo-gtcf.webp',
      width: 399,
      height: 240,
      fit: 'contain',
      boxClass: 'bg-white p-3 lg:p-6.5',
    },
    blurb: {
      en: 'A regional funder that sits alongside partners on the Steering Committee and Pilot Project Team.',
      es: 'Un financiador regional que participa junto a los socios en el Comité Directivo y el Equipo del Proyecto Piloto.',
    },
  },
  {
    id: 'sofia-quintero',
    name: 'Sofia Quintero Art & Cultural Center',
    url: 'https://sqacc.org/',
    founding: false,
    logo: {
      src: '/images/logo-sofia-quintero.webp',
      width: 440,
      height: 145,
      fit: 'contain',
      boxClass: 'bg-white p-3 lg:p-4',
    },
    blurb: {
      en: 'Home of El Centro Hub and community gardens, offering bilingual, bicultural navigation, referrals, and a meeting space for partners.',
      es: 'Sede de El Centro Hub y de huertos comunitarios, con orientación bilingüe y bicultural, referencias y un espacio de reunión para los socios.',
    },
  },
]

/** The two funders shown under "Powered by" and declared as `funder` in the JSON-LD. */
export const FUNDER_IDS: readonly PartnerId[] = ['jhe-foundation', 'gtcf']

export function partnerById(id: PartnerId): Partner {
  const partner = PARTNERS.find((p) => p.id === id)
  if (!partner) throw new Error(`Unknown partner id "${id}"`)
  return partner
}
