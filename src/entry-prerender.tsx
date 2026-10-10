import type { ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import ErrorBoundary from './components/ErrorBoundary'
import { COPY } from './content/copy'
import type { Locale } from './i18n/locale'
import { HomeEnglish, HomeSpanish } from './pages/Home'
import NotFound from './pages/NotFound'
import { HOME_META, NOT_FOUND_META, type PageMeta } from './pages/pageMeta'

/**
 * Build-time prerender entry, consumed by scripts/prerender.mjs.
 *
 * This deliberately does not render <Root />: Root picks a page by reading
 * window.location during render, which has no meaning under renderToString.
 * Routes are enumerated here instead, with each page component imported
 * directly, so this list must be kept in sync with Root's pathname branches
 * (src/__tests__/route-registry.test.tsx fails if they disagree).
 *
 * Purity invariant. The client HYDRATES what this file renders (src/main.tsx,
 * src/hydrateApp.tsx), so the first client render must produce the same text
 * and element structure as renderToString did on the build machine, for every
 * visitor, on any day. Anything that differs between the build and a browser,
 * or between two moments, is forbidden during render:
 *
 *   - no clock reads (`new Date()`, `Date.now()`); the Footer's copyright year
 *     is the build-time constant `__BUILD_YEAR__` (vite.config.ts);
 *   - no randomness (`Math.random()`, `crypto.randomUUID()`); `useId` is fine;
 *   - no locale-dependent formatting (`toLocaleString()`, `Intl.*`); dates are
 *     spelled out by hand in src/content/news.ts for this reason, since two ICU
 *     builds need not agree even when given the same locale;
 *   - no window, document, navigator, matchMedia or storage reads during
 *     render. Root's read of window.location.pathname is the one sanctioned
 *     exception: the file a visitor receives is chosen by that same pathname,
 *     so the two agree by construction, and route-registry.test.tsx holds them
 *     together.
 *
 * Reads inside effects and event handlers are fine: they run after hydration.
 * src/__tests__/hydration.test.tsx hydrates every built route, including as a
 * visitor with a clock decades past the build, and fails on any mismatch.
 *
 * This registry is also what tells the deploy how each route is *served*:
 * scripts/prerender.mjs turns the fields below into dist-ssr/route-manifest.json
 * (the shell, the error page, and the extensionless keys), the file
 * .github/workflows/deploy.yml reads instead of naming routes by hand.
 */

export interface PrerenderRoute {
  /** Pathname Root matches at runtime. */
  path: string
  /** Output file written under dist/. */
  outFile: string
  /** The page's language: `<html lang>`, og:locale. */
  locale: Locale
  /** Head values patched into this route's copy of index.html. */
  head: PageMeta
  /** Exact text of the page's single `<h1>`; the prerender asserts it rendered. */
  h1: string
  /**
   * Marks a route that must not be indexed. scripts/prerender.mjs rewrites the
   * robots tag to `noindex` and deletes the canonical and hreflang links.
   */
  noindex?: true
  /**
   * The route CloudFront's errorResponses will point at. It keeps its .html
   * extension because that is the key the distribution names, while every
   * other non-root route ships under an extensionless key. A separate flag
   * from `noindex` on purpose: one is an SEO fact about the markup, the other a
   * deployment fact about the S3 key.
   */
  errorPage?: true
}

/**
 * Every indexable route belongs in public/sitemap.xml, in llms.txt's Key links
 * and here; src/__tests__/site-dates.test.ts enforces that the three agree.
 * /404 is noindex and deliberately absent from the other two.
 */
export const ROUTES: PrerenderRoute[] = [
  { path: '/', outFile: 'index.html', locale: 'en', head: HOME_META.en, h1: COPY.en.hero.title },
  { path: '/es', outFile: 'es.html', locale: 'es', head: HOME_META.es, h1: COPY.es.hero.title },
  {
    path: '/404',
    outFile: '404.html',
    locale: 'en',
    head: NOT_FOUND_META,
    h1: 'Page not found',
    noindex: true,
    errorPage: true,
  },
]

const pages: Record<string, ComponentType> = {
  '/': HomeEnglish,
  '/es': HomeSpanish,
  // Root renders NotFound for every unmatched pathname; '/404' is just the
  // build-time key for the one file that markup is written to.
  '/404': NotFound,
}

export function render(path: string): string {
  const Page = pages[path]
  if (!Page) throw new Error(`No prerender page registered for "${path}"`)

  // ErrorBoundary mirrors the client tree in hydrateApp.tsx. It renders its
  // children without a wrapper element, so it contributes no markup of its own.
  return renderToString(
    <ErrorBoundary>
      <Page />
    </ErrorBoundary>,
  )
}
