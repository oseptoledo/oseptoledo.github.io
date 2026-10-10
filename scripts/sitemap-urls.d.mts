/**
 * Hand-written declarations for scripts/sitemap-urls.mjs.
 *
 * The .mjs file itself is not type-checked, so these declarations are an
 * unchecked promise about its shape. src/__tests__/site-dates.test.ts asserts
 * `typeof readSitemapUrls === 'function'` at runtime so a drift between this
 * file and the implementation fails a test rather than passing silently.
 */

/** Text of every <loc> element in the given sitemap XML, document order, trimmed. */
export declare function readSitemapUrls(xml: string): string[];

/** Absolute path of public/sitemap.xml. Resolved lazily; safe to import under jsdom. */
export declare function sitemapPath(): string;
