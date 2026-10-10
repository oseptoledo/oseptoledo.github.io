import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Holds the BUILT pages in dist/ to the Content-Security-Policy that
 * CloudFront sends with every response (the response headers policy in infra/):
 *
 *   default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
 *   font-src 'self'; connect-src 'self'; manifest-src 'self'; object-src 'none';
 *   base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
 *
 * There is no 'unsafe-inline', no nonce and no hash anywhere in it, so a
 * browser silently drops any inline style, inline script, event-handler
 * attribute or `javascript:` URL, and refuses any resource from another
 * origin. None of that shows up in a build, in jsdom, or in Lighthouse run
 * against `vite preview` (which sends no CSP): a `style` attribute added to a
 * component would lay out fine locally and break only in production. These
 * assertions are the local stand-in for that header:
 *
 *   - no `style` attribute on any element, and no `<style>` element;
 *   - no inline `<script>` except the JSON-LD data block, which is not
 *     executed and so is not subject to script-src;
 *   - no `on*` event-handler attributes and no `javascript:` URLs;
 *   - every script, stylesheet, preload, icon and image the page loads, and
 *     every font or image a linked stylesheet loads, is a root-relative URL on
 *     this origin (starts with "/" but not "//"), or a non-font `data:` image
 *     in CSS;
 *   - no `<object>` or `<embed>` (object-src 'none'), no `<base>`, and any
 *     form action is root-relative (form-action 'self').
 *
 * If the policy in infra changes, change this list with it.
 *
 * Requires a prior `npm run build`, like dist-html.test.ts: a missing dist/
 * fails with that instruction rather than skipping.
 */

const DIST = join(process.cwd(), 'dist')
const BUILD_FIRST = 'dist/ not found. These assertions read the built HTML. Run `npm run build` first.'

function builtPages(): string[] {
  if (!existsSync(DIST)) throw new Error(BUILD_FIRST)
  const pages = readdirSync(DIST)
    .filter((name) => name.endsWith('.html'))
    .sort()
  if (pages.length === 0) throw new Error(`dist/ has no .html files. ${BUILD_FIRST}`)
  return pages
}

/**
 * Same-origin and root-relative: "/assets/x.js", not "https://cdn/x.js",
 * "//cdn/x.js" (protocol-relative), "/\cdn/x.js" (browsers read a backslash as
 * a slash there), or a relative "x.js" that changes meaning on /es.
 */
const isRootRelative = (url: string) => url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')

/** The URLs in a srcset or imagesrcset value ("a.webp 360w, b.webp 600w"). */
const srcsetUrls = (value: string) =>
  value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean)

/** `<link rel>` tokens that make the browser fetch something the CSP governs. */
const FETCHING_RELS = new Set(['stylesheet', 'preload', 'modulepreload', 'icon', 'apple-touch-icon', 'manifest'])

const describeElement = (el: Element) => el.outerHTML.slice(0, 160)

describe.each(builtPages())('dist/%s under the site CSP', (page) => {
  const html = readFileSync(join(DIST, page), 'utf8')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const all = [...doc.querySelectorAll('*')]

  it('has no inline styles (style-src without unsafe-inline)', () => {
    expect(doc.querySelectorAll('[style]').length, 'elements with a style attribute').toBe(0)
    expect(doc.querySelectorAll('style').length, '<style> elements').toBe(0)
    // A raw-text backstop for markup the DOM walk would not reach (template contents).
    expect(html).not.toMatch(/<[a-z][^>]*\sstyle\s*=/i)
  })

  it('has no inline executable script, only the JSON-LD data block', () => {
    const scripts = [...doc.querySelectorAll('script')]
    const external = scripts.filter((script) => script.hasAttribute('src'))
    const inline = scripts.filter((script) => !script.hasAttribute('src'))
    expect(external.length, 'the app bundle is loaded from a file').toBeGreaterThan(0)
    for (const script of inline) {
      expect(script.getAttribute('type'), `inline script: ${describeElement(script)}`).toBe('application/ld+json')
    }
  })

  it('has no event-handler attributes and no javascript: URLs', () => {
    for (const el of all) {
      for (const attr of el.attributes) {
        expect(/^on/i.test(attr.name), `${attr.name} on ${describeElement(el)}`).toBe(false)
        // Browsers ignore spaces and control characters around and inside the
        // scheme ("java\tscript:"), so drop every character up to U+0020 first.
        const squeezed = [...attr.value].filter((char) => char.charCodeAt(0) > 0x20).join('')
        expect(/^javascript:/i.test(squeezed), `${attr.name}="${attr.value}" on ${describeElement(el)}`).toBe(false)
      }
    }
  })

  it('loads every script, stylesheet, preload, icon and image from this origin', () => {
    const urls: [string, string][] = []
    for (const script of doc.querySelectorAll('script[src]')) urls.push([script.getAttribute('src')!, 'script src'])

    const stylesheets: string[] = []
    for (const link of doc.querySelectorAll('link[rel]')) {
      const rels = link.getAttribute('rel')!.toLowerCase().split(/\s+/)
      if (!rels.some((rel) => FETCHING_RELS.has(rel))) continue
      const href = link.getAttribute('href')
      const imagesrcset = link.getAttribute('imagesrcset')
      expect(href ?? imagesrcset, `nothing to fetch: ${describeElement(link)}`).toBeTruthy()
      if (href !== null) urls.push([href, `link rel="${rels.join(' ')}" href`])
      if (imagesrcset !== null) for (const url of srcsetUrls(imagesrcset)) urls.push([url, 'link imagesrcset'])
      if (rels.includes('stylesheet') && href !== null) stylesheets.push(href)
    }
    expect(stylesheets.length, 'the built CSS is linked as a file').toBeGreaterThan(0)

    for (const img of doc.querySelectorAll('img, source')) {
      const src = img.getAttribute('src')
      const srcset = img.getAttribute('srcset')
      if (src !== null) urls.push([src, `${img.localName} src`])
      if (srcset !== null) for (const url of srcsetUrls(srcset)) urls.push([url, `${img.localName} srcset`])
    }

    for (const [url, where] of urls) {
      expect(isRootRelative(url), `${where} "${url}" is not a root-relative same-origin URL`).toBe(true)
    }

    // What the linked CSS fetches in turn: fonts (font-src 'self', so no data:
    // fonts either) and images (img-src 'self' data:).
    for (const href of stylesheets) {
      const file = join(DIST, href)
      expect(existsSync(file), `${href} is linked but not in dist/`).toBe(true)
      const css = readFileSync(file, 'utf8')
      for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
        const url = match[2]
        if (url.startsWith('data:')) {
          expect(/^data:(font\/|application\/(x-)?font)/i.test(url), `${href} embeds a data: font`).toBe(false)
        } else {
          expect(isRootRelative(url), `${href} loads "${url}", not a root-relative same-origin URL`).toBe(true)
        }
      }
    }
  })

  it('embeds no plugins, sets no base URL, and posts forms only to this origin', () => {
    expect(doc.querySelectorAll('object, embed').length, 'object-src is none').toBe(0)
    expect(doc.querySelectorAll('base').length, '<base> elements').toBe(0)
    for (const el of doc.querySelectorAll('form[action], [formaction]')) {
      const action = el.getAttribute('action') ?? el.getAttribute('formaction')!
      expect(isRootRelative(action), `form action "${action}"`).toBe(true)
    }
  })
})
