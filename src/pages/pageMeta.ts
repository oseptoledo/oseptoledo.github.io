import type { Locale } from '../i18n/locale'

/**
 * Head metadata for every prerendered page, kept out of the components because
 * scripts/prerender.mjs patches these values into each route's copy of
 * index.html (crawlers read the head without running any JavaScript), and
 * src/__tests__/dist-html.test.ts reads them back out of the built files.
 *
 * index.html itself carries the English homepage values so `npm run dev` looks
 * right; the prerender overwrites every route's head from here, so this module
 * is what ships.
 */
export interface PageMeta {
  /** Full `<title>`, also og:title and twitter:title. Aim for 60 characters or fewer. */
  title: string
  /** Meta, og: and twitter: description. Aim for 155 characters or fewer. */
  description: string
  /** Pathname for the canonical URL and og:url. */
  canonicalPath: string
  /** og:image:alt and twitter:image:alt, in the page's language. */
  imageAlt: string
}

export const HOME_META: Record<Locale, PageMeta> = {
  en: {
    title: 'Old South End Partnership | Housing in Toledo’s Old South End',
    description:
      'Ten Toledo organizations working together so Old South End neighbors can find, keep, and strengthen their homes. Meet the partners and see our progress.',
    canonicalPath: '/',
    imageAlt: 'Colorful storefronts along Broadway in the Old South End',
  },
  es: {
    title: 'Old South End Partnership | Vivienda en el Old South End de Toledo',
    description:
      'Diez organizaciones de Toledo trabajan juntas para que los vecinos del Old South End puedan encontrar, conservar y mejorar sus hogares. Conozca a los socios.',
    canonicalPath: '/es',
    imageAlt: 'Fachadas coloridas a lo largo de Broadway en el Old South End',
  },
}

/**
 * The 404 page: what CloudFront will serve, under a real 404 status, for every
 * path that is not a prerendered key. The prerender strips its canonical and
 * hreflang links and marks it noindex; `canonicalPath` only feeds og:url.
 */
export const NOT_FOUND_META: PageMeta = {
  title: 'Page not found | Old South End Partnership',
  description:
    'That page is not on oseptoledo.org. Head back to the homepage to meet the ten organizations of the Old South End Partnership.',
  canonicalPath: '/404',
  imageAlt: 'Colorful storefronts along Broadway in the Old South End',
}
