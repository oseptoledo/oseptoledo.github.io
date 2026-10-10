#!/usr/bin/env node
/**
 * Turns a finished production build in dist/ into the temporary GitHub Pages
 * preview at https://oseptoledo.github.io (.github/workflows/pages.yml), which
 * lets people review the site while the AWS hosting (infra/) is being set up.
 *
 * Usage, after `npm run build` (and `npm test`, which must see the production
 * build, not this one):
 *   node scripts/make-preview.mjs [dist]
 *
 * What it changes, and why only this:
 *   - Every page's robots meta tag becomes `noindex, nofollow`, so search and
 *     answer engines do not index the preview and later treat the real launch
 *     at www.oseptoledo.org as a duplicate. The canonical links already point
 *     at www.oseptoledo.org; this makes the preview's status explicit.
 *   - robots.txt asks every crawler to stay out.
 * Only the <head> and robots.txt change. The markup inside #root is untouched,
 * because the browser hydrates it and any difference there would make React
 * throw the prerendered page away (src/entry-prerender.tsx, purity note).
 *
 * Fails, rather than shipping a half-patched preview, if a page does not carry
 * exactly one robots meta tag to replace. Delete this script together with
 * pages.yml once the site is live on AWS.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PREVIEW_ROBOTS_META = '<meta name="robots" content="noindex, nofollow" />';
export const PREVIEW_ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

const ROBOTS_META = /<meta name="robots" content="[^"]*"\s*\/>/g;

/** The page with its one robots meta tag set to noindex, nofollow. */
export function toPreviewHtml(html, label = 'page') {
  const found = html.match(ROBOTS_META) ?? [];
  if (found.length !== 1) {
    throw new Error(`${label}: expected exactly one <meta name="robots"> to replace, found ${found.length}`);
  }
  return html.replace(ROBOTS_META, () => PREVIEW_ROBOTS_META);
}

/** Apply the preview changes to every top-level .html file in `distDir`, and robots.txt. */
export function makePreview(distDir) {
  const pages = readdirSync(distDir).filter((name) => name.endsWith('.html'));
  if (pages.length === 0) throw new Error(`${distDir} has no .html files; run npm run build first`);
  for (const name of pages) {
    const path = join(distDir, name);
    writeFileSync(path, toPreviewHtml(readFileSync(path, 'utf8'), name));
  }
  writeFileSync(join(distDir, 'robots.txt'), PREVIEW_ROBOTS_TXT);
  return pages;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const distDir = resolve(process.argv[2] ?? 'dist');
  const pages = makePreview(distDir);
  console.log(`make-preview: noindex on ${pages.join(', ')}; robots.txt disallows all`);
}
