import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_ORIGIN } from '../constants'
import { ROUTES, type PrerenderRoute } from '../entry-prerender'
import { LOCALE_HOME_PATH, LOCALES, OG_LOCALE } from '../i18n/locale'
import { intrinsicSize } from './helpers/imageIntrinsicSize'

/**
 * SEO assertions on the BUILT files in dist/, not on the rendered DOM.
 *
 * The Lighthouse gate in `.lighthouserc.json` drives a real Chrome with
 * JavaScript on and audits the DOM after React has mounted, so it stays green
 * even if `scripts/prerender.mjs` stops running or stops patching heads. The
 * bytes asserted here are the bytes a non-JS crawler (GPTBot, ClaudeBot,
 * PerplexityBot, Bing's text-only fetch) receives, in each language, so these
 * fail when the prerender regresses.
 *
 * Requires a prior `npm run build`. CI's `check` job builds before it tests.
 * Locally a missing dist/ fails with that instruction rather than skipping,
 * because a guard that quietly opts out is not a guard.
 */

const DIST = join(process.cwd(), 'dist')
const BUILD_FIRST = 'dist/ not found. These assertions read the built HTML. Run `npm run build` first.'

function readBuilt(outFile: string): string {
  if (!existsSync(DIST)) throw new Error(BUILD_FIRST)
  const path = join(DIST, outFile)
  if (!existsSync(path)) {
    throw new Error(`dist/${outFile} not found. The route is in ROUTES but was not written by scripts/prerender.mjs.`)
  }
  return readFileSync(path, 'utf8')
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

const meta = (doc: Document, selector: string) => doc.head.querySelector(selector)?.getAttribute('content')

describe.each(ROUTES.map((route) => [route.path, route] as const))('dist HTML for %s', (_path, route: PrerenderRoute) => {
  const html = readBuilt(route.outFile)
  const doc = parse(html)
  const canonicalUrl = SITE_ORIGIN + route.head.canonicalPath

  it('starts with a doctype and declares the page language', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(doc.documentElement.getAttribute('lang')).toBe(route.locale)
  })

  it('has its own title and description in the head', () => {
    expect(doc.head.querySelectorAll('title')).toHaveLength(1)
    expect(doc.title).toBe(route.head.title)
    expect(meta(doc, 'meta[name="description"]')).toBe(route.head.description)
  })

  it('carries prerendered content: exactly one <h1>, and it is the page heading', () => {
    const root = doc.getElementById('root')
    expect(root?.children.length, '#root is empty: the prerender did not run').toBeGreaterThan(0)
    const h1s = doc.body.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0].textContent).toBe(route.h1)
  })

  it('has social tags for this route, in its language', () => {
    expect(meta(doc, 'meta[property="og:title"]')).toBe(route.head.title)
    expect(meta(doc, 'meta[property="og:description"]')).toBe(route.head.description)
    expect(meta(doc, 'meta[property="og:url"]')).toBe(canonicalUrl)
    expect(meta(doc, 'meta[property="og:locale"]')).toBe(OG_LOCALE[route.locale])
    expect(meta(doc, 'meta[property="og:image:alt"]')).toBe(route.head.imageAlt)
    expect(meta(doc, 'meta[name="twitter:title"]')).toBe(route.head.title)
    expect(meta(doc, 'meta[name="twitter:description"]')).toBe(route.head.description)
    expect(meta(doc, 'meta[name="twitter:image:alt"]')).toBe(route.head.imageAlt)
    const ogImage = meta(doc, 'meta[property="og:image"]')!
    expect(ogImage.startsWith(`${SITE_ORIGIN}/`)).toBe(true)
    // 1200x630 is the size every major link-preview renderer crops to.
    expect(intrinsicSize(ogImage.slice(SITE_ORIGIN.length))).toEqual({ width: 1200, height: 630 })
    expect(meta(doc, 'meta[property="og:image:width"]')).toBe('1200')
    expect(meta(doc, 'meta[property="og:image:height"]')).toBe('630')
  })

  if (route.noindex) {
    it('is noindex, with no canonical and no language alternates', () => {
      expect(meta(doc, 'meta[name="robots"]')).toBe('noindex')
      expect(doc.querySelectorAll('link[rel="canonical"]')).toHaveLength(0)
      expect(doc.querySelectorAll('link[hreflang]')).toHaveLength(0)
    })
  } else {
    it('is indexable, with one canonical pointing at itself', () => {
      expect(meta(doc, 'meta[name="robots"]')).toMatch(/^index, follow/)
      const canonicals = doc.querySelectorAll('link[rel="canonical"]')
      expect(canonicals).toHaveLength(1)
      expect(canonicals[0].getAttribute('href')).toBe(canonicalUrl)
    })

    it('lists every language version, itself included, plus x-default', () => {
      const alternates = Object.fromEntries(
        [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map((link) => [
          link.getAttribute('hreflang'),
          link.getAttribute('href'),
        ]),
      )
      const expected: Record<string, string> = { 'x-default': `${SITE_ORIGIN}/` }
      for (const locale of LOCALES) expected[locale] = SITE_ORIGIN + LOCALE_HOME_PATH[locale]
      expect(alternates).toEqual(expected)
      expect(Object.values(alternates)).toContain(canonicalUrl)
    })
  }

  it('has exactly one JSON-LD block, and it parses', () => {
    const blocks = doc.querySelectorAll('script[type="application/ld+json"]')
    expect(blocks).toHaveLength(1)
    expect(() => JSON.parse(blocks[0].textContent ?? '')).not.toThrow()
  })

  it('preloads the brand font file the build actually emitted', () => {
    const preload = doc.head.querySelector('link[rel="preload"][as="font"]')
    expect(preload).toBeTruthy()
    // Fonts are always fetched in CORS mode; a preload without crossorigin is wasted.
    expect(preload!.hasAttribute('crossorigin')).toBe(true)
    expect(existsSync(join(DIST, preload!.getAttribute('href')!))).toBe(true)
  })

  it('sizes every image from its own file and gives each an alt attribute', () => {
    const images = [...doc.body.querySelectorAll('img')]
    // The 404 page has no photographs; the homepages must, or this check is vacuous.
    if (!route.noindex) expect(images.length).toBeGreaterThan(0)
    for (const img of images) {
      const src = img.getAttribute('src')!
      expect(img.hasAttribute('alt'), `${src} has no alt attribute`).toBe(true)
      const size = intrinsicSize(src)
      expect(img.getAttribute('width'), `${src} width`).toBe(String(size.width))
      expect(img.getAttribute('height'), `${src} height`).toBe(String(size.height))
    }
  })

  it('has no in-page link pointing at a missing section', () => {
    for (const link of doc.body.querySelectorAll('a[href^="#"]')) {
      const id = link.getAttribute('href')!.slice(1)
      expect(doc.getElementById(id), `#${id} is linked but does not exist on ${route.path}`).toBeTruthy()
    }
  })

  it('gives every element id only once', () => {
    const ids = [...doc.querySelectorAll('[id]')].map((el) => el.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  // Before hydration, or when the script never runs, the browser submits the
  // form itself. Without method="post" that is a GET with every field in the
  // URL: names, emails and messages in CloudFront's access logs and the
  // browser history.
  it('posts every form, so a submit before the script runs never puts what a visitor typed in a URL', () => {
    for (const form of doc.body.querySelectorAll('form')) {
      expect(form.getAttribute('method')?.toLowerCase(), `form method on ${route.path}`).toBe('post')
    }
  })
})

describe('dist HTML forms', () => {
  it('include the contact form on at least one page, so the method check above is not vacuous', () => {
    const forms = ROUTES.map((route) => parse(readBuilt(route.outFile)).body.querySelectorAll('form').length)
    expect(forms.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })
})
