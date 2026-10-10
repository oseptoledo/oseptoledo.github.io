import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_ORIGIN } from '../constants'
import { ROUTES } from '../entry-prerender'
import { LOCALE_HOME_PATH, LOCALES } from '../i18n/locale'
import { readSitemapUrls } from '../../scripts/sitemap-urls.mjs'

/**
 * The site's indexable routes are written down in three places and its
 * last-changed date in three more. Nothing generates any of them, so this file
 * is what keeps each group equal.
 *
 * Routes: `ROUTES` in src/entry-prerender.tsx (what the build prerenders),
 * public/sitemap.xml (what search engines are told to crawl) and the Key links
 * in public/llms.txt (what an answer engine reads). A route in one and not the
 * others ships invisible rather than broken. /404 is noindex and deliberately
 * absent from the other two.
 *
 * Dates: every sitemap <lastmod>, the "Last updated:" line in llms.txt and
 * `WebSite.dateModified` in the index.html JSON-LD are one fact stated several
 * times. Disagreeing means one was updated and the others forgotten.
 *
 * Also holds the sitemap's hreflang alternates to the same set the pages
 * declare (dist-html.test.ts checks the pages themselves).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const sitemapXml = readFileSync(join(process.cwd(), 'public', 'sitemap.xml'), 'utf8')
const llmsTxt = readFileSync(join(process.cwd(), 'public', 'llms.txt'), 'utf8')
const robotsTxt = readFileSync(join(process.cwd(), 'public', 'robots.txt'), 'utf8')
const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8')

interface SitemapEntry {
  loc: string
  lastmod: string
  alternates: Record<string, string>
}

/** Parsed here, independently of scripts/sitemap-urls.mjs, so comparing the two is a real check. */
function parseSitemap(xml: string): SitemapEntry[] {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((block) => {
    const entry = block[1]
    const loc = entry.match(/<loc>([\s\S]*?)<\/loc>/)?.[1].trim()
    const lastmod = entry.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1].trim()
    expect(loc, `<url> entry has a <loc>: ${entry}`).toBeTruthy()
    expect(lastmod, `<url> entry for ${loc} has a <lastmod>`).toBeTruthy()
    const alternates = Object.fromEntries(
      [...entry.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\s*\/>/g)].map((m) => [m[1], m[2]]),
    )
    return { loc: loc as string, lastmod: lastmod as string, alternates }
  })
}

/** URLs of the markdown bullets under llms.txt's "## Key links" heading. */
function keyLinkUrls(text: string): string[] {
  const section = text.split('## Key links')[1]
  expect(section, 'llms.txt has a "## Key links" section').toBeTruthy()
  const body = section.split('\n## ')[0]
  return [...body.matchAll(/^- \[[^\]]+\]\(([^)]+)\)\s*$/gm)].map((m) => m[1])
}

function websiteDateModified(html: string): string {
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  expect(block, 'index.html has a JSON-LD block').toBeTruthy()
  const graph = (JSON.parse(block![1]) as { '@graph': Record<string, unknown>[] })['@graph']
  const website = graph.find((node) => node['@type'] === 'WebSite')
  expect(website, 'the @graph has a WebSite node').toBeTruthy()
  return website!.dateModified as string
}

function isRealDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false
  const parsed = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso
}

const entries = parseSitemap(sitemapXml)
const sitemapLocs = entries.map((entry) => entry.loc)
const indexableRouteUrls = ROUTES.filter((route) => !route.noindex).map((route) => `${SITE_ORIGIN}${route.path}`)

describe('site route registries', () => {
  it('exposes readSitemapUrls as a function, as scripts/sitemap-urls.d.mts declares', () => {
    expect(typeof readSitemapUrls).toBe('function')
  })

  it('lists every indexable route in the sitemap, and nothing else', () => {
    expect(new Set(sitemapLocs)).toEqual(new Set(indexableRouteUrls))
  })

  it('reads the same URLs through scripts/sitemap-urls.mjs', () => {
    expect(new Set(readSitemapUrls(sitemapXml))).toEqual(new Set(sitemapLocs))
  })

  it('lists the same URLs in the llms.txt Key links, plus the sitemap itself', () => {
    const linked = keyLinkUrls(llmsTxt)
    expect(linked).toContain(`${SITE_ORIGIN}/sitemap.xml`)
    expect(new Set(linked.filter((url) => url !== `${SITE_ORIGIN}/sitemap.xml`))).toEqual(new Set(sitemapLocs))
  })

  it('has a sitemap entry for every language homepage', () => {
    for (const locale of LOCALES) expect(sitemapLocs).toContain(SITE_ORIGIN + LOCALE_HOME_PATH[locale])
  })

  it('gives every sitemap entry the full set of hreflang alternates', () => {
    const expected: Record<string, string> = { 'x-default': `${SITE_ORIGIN}/` }
    for (const locale of LOCALES) expected[locale] = SITE_ORIGIN + LOCALE_HOME_PATH[locale]
    for (const entry of entries) expect(entry.alternates, entry.loc).toEqual(expected)
  })

  it('points robots.txt at the sitemap on the canonical origin', () => {
    expect(robotsTxt).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)
  })
})

describe('site dates', () => {
  const lastUpdated = llmsTxt.match(/^Last updated: (.+)$/m)?.[1].trim()
  const dateModified = websiteDateModified(indexHtml)

  it('dates every sitemap entry with a real calendar date', () => {
    for (const entry of entries) {
      expect(isRealDate(entry.lastmod), `${entry.loc} <lastmod> ${entry.lastmod}`).toBe(true)
    }
  })

  it('states one date in the sitemap, llms.txt and the WebSite node', () => {
    expect(lastUpdated, 'llms.txt has a "Last updated:" line').toBeTruthy()
    expect(isRealDate(dateModified)).toBe(true)
    // Both language versions change together, so they share one date.
    for (const entry of entries) expect(entry.lastmod, entry.loc).toBe(dateModified)
    expect(lastUpdated).toBe(dateModified)
  })
})
