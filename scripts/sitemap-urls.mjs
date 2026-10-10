/**
 * Shared reader for public/sitemap.xml.
 *
 * public/sitemap.xml is the single list of indexable URLs for this site, so
 * anything that needs that list reads it here instead of keeping its own copy:
 * scripts/indexnow-ping.mjs submits it to Bing at deploy time, in place of the
 * hand-kept array it used to carry, and src/__tests__/site-dates.test.ts
 * asserts that the sitemap, the ROUTES registry in src/entry-prerender.tsx and
 * the Key links in public/llms.txt all agree.
 *
 * The sitemap is hand-written and flat, so a global regex over <loc> elements
 * is enough; no XML library is pulled in for it.
 *
 * sitemapPath() resolves lazily, inside the function body, on purpose. Under
 * vitest's jsdom environment import.meta.url is not a file: URL, so resolving
 * it at import time would throw in the test that only wants readSitemapUrls.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOC_RE = /<loc>([\s\S]*?)<\/loc>/g;

/**
 * Return the text of every <loc> element in document order, trimmed.
 *
 * @param {string} xml Raw sitemap XML.
 * @returns {string[]}
 */
export function readSitemapUrls(xml) {
  const urls = [];
  for (const match of String(xml).matchAll(LOC_RE)) {
    urls.push(match[1].trim());
  }
  return urls;
}

/**
 * Absolute path of public/sitemap.xml, resolved from this module's location.
 *
 * @returns {string}
 */
export function sitemapPath() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sitemap.xml');
}
