import type { Localized } from '../i18n/locale'

/**
 * Photographs, from the partnership's design canvas, converted to WebP at the
 * widths each layout needs (README.md, "Images"). `src` is the largest file and
 * `width`/`height` are its intrinsic pixels, which is what lets the browser
 * reserve the right box before the image arrives; src/__tests__/images.test.tsx
 * reads every file and fails if a declared size is wrong.
 *
 * Everything under public/ is served with a one-year immutable cache header
 * once the site is on CloudFront, so a changed photo needs a new filename
 * (`hero-broadway-v2.webp`), never a re-upload under the old one.
 */
export interface SiteImage {
  src: string
  width: number
  height: number
  /** Width-descriptor candidates, smallest first, ending with `src`. */
  srcSet?: string
  alt: Localized
}

export const IMAGES = {
  heroBroadway: {
    src: '/images/hero-broadway.webp',
    width: 1140,
    height: 797,
    srcSet: '/images/hero-broadway-720w.webp 720w, /images/hero-broadway.webp 1140w',
    alt: {
      en: 'Colorful storefronts along Broadway in the Old South End',
      es: 'Fachadas coloridas a lo largo de Broadway en el Old South End',
    },
  },
  heroFolklorico: {
    src: '/images/hero-folklorico.webp',
    width: 600,
    height: 333,
    srcSet: '/images/hero-folklorico-360w.webp 360w, /images/hero-folklorico.webp 600w',
    alt: {
      en: 'Folklórico dancers performing on a neighborhood sidewalk',
      es: 'Bailarines de folklórico en una acera del vecindario',
    },
  },
  aboutPartnerStaff: {
    src: '/images/about-partner-staff.webp',
    width: 880,
    height: 1080,
    srcSet: '/images/about-partner-staff-560w.webp 560w, /images/about-partner-staff.webp 880w',
    alt: {
      en: 'Partner staff in safety vests gathered on an Old South End sidewalk',
      es: 'Personal de los socios con chalecos de seguridad reunido en una acera del Old South End',
    },
  },
  pilotZoneMap: {
    src: '/images/pilot-zone-map.webp',
    width: 1920,
    height: 960,
    srcSet:
      '/images/pilot-zone-map-720w.webp 720w, /images/pilot-zone-map-1200w.webp 1200w, /images/pilot-zone-map.webp 1920w',
    alt: {
      en: 'Aerial map of the Old South End Wedge showing the Pilot Zone and three future zones',
      es: 'Mapa aéreo de la Cuña del Old South End con la Zona Piloto y tres zonas futuras',
    },
  },
  rockTheBlockKickoff: {
    src: '/images/rock-the-block-kickoff.webp',
    width: 515,
    height: 340,
    alt: {
      en: 'Volunteers cheering at the Rock the Block kickoff',
      es: 'Voluntarios celebrando al inicio de Rock the Block',
    },
  },
  rockTheBlockPlanting: {
    src: '/images/rock-the-block-planting.webp',
    width: 515,
    height: 340,
    alt: {
      en: 'Volunteers raking and planting in a yard',
      es: 'Voluntarios rastrillando y plantando en un jardín',
    },
  },
  rockTheBlockMowing: {
    src: '/images/rock-the-block-mowing.webp',
    width: 515,
    height: 339,
    alt: {
      en: 'A volunteer mowing an overgrown lot',
      es: 'Un voluntario cortando el pasto de un lote',
    },
  },
  rockTheBlockSign: {
    src: '/images/rock-the-block-sign.webp',
    width: 515,
    height: 339,
    alt: {
      en: 'A Rock the Block thank-you yard sign',
      es: 'Letrero de agradecimiento de Rock the Block',
    },
  },
  horizonNewHome: {
    src: '/images/horizon-new-home.webp',
    width: 740,
    height: 576,
    srcSet: '/images/horizon-new-home-480w.webp 480w, /images/horizon-new-home.webp 740w',
    alt: {
      en: 'A newly built white home with a front porch',
      es: 'Una casa blanca recién construida con porche',
    },
  },
  horizonNeighbors: {
    src: '/images/horizon-neighbors.webp',
    width: 655,
    height: 655,
    srcSet: '/images/horizon-neighbors-400w.webp 400w, /images/horizon-neighbors.webp 655w',
    alt: {
      en: 'Two neighbors standing in front of their yellow house',
      es: 'Dos vecinos frente a su casa amarilla',
    },
  },
} satisfies Record<string, SiteImage>

/** The Rock the Block gallery under the timeline, in display order. */
export const ROCK_THE_BLOCK_GALLERY: readonly SiteImage[] = [
  IMAGES.rockTheBlockKickoff,
  IMAGES.rockTheBlockPlanting,
  IMAGES.rockTheBlockMowing,
  IMAGES.rockTheBlockSign,
]
