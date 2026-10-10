#!/usr/bin/env node
/**
 * Post-build prerender pass: bake real HTML into the served pages so crawlers
 * that don't run JavaScript (GPTBot, ClaudeBot, PerplexityBot, and Bing's
 * text-only fetches) see the actual content, in the right language, instead of
 * an empty <div id="root">.
 *
 * Usage (wired into `npm run build`, after `vite build`):
 *   node scripts/prerender.mjs
 *
 * How it works:
 *   1. Build src/entry-prerender.tsx as an SSR bundle into dist-ssr/.
 *   2. For each route it exports, renderToString the page and splice the
 *      markup into dist/index.html's `<div id="root"></div>`.
 *   3. Patch that copy's head for the route (see patchHead): `<html lang>`,
 *      title, description, canonical, og:locale and the social tags. The 404
 *      page also gets a `noindex` robots tag and loses its canonical and its
 *      hreflang alternates.
 *   4. Add a preload for the Latin subset of the brand font, which every page
 *      uses above the fold (see injectFontPreload).
 *   5. Write dist/index.html (English), dist/es.html (Spanish) and
 *      dist/404.html, and describe how they are *served* in
 *      dist-ssr/route-manifest.json (see deriveRouteManifest), for the deploy
 *      workflow to read.
 *
 * The splice is an exact-token string replacement on `<div id="root"></div>`,
 * and head patching only ever rewrites known tags, never a <script>; the JSON-LD
 * block is identical on every route and nothing touches it.
 *
 * The client HYDRATES this markup (src/hydrateApp.tsx), so the rendered tree
 * must stay deterministic (see the purity note in src/entry-prerender.tsx);
 * src/__tests__/hydration.test.tsx hydrates every file this script writes.
 *
 * This script is self-asserting: if the output doesn't look like a real page
 * it exits 1 and fails the build rather than shipping an empty shell.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(repoRoot, 'dist');
const SSR_DIST = join(repoRoot, 'dist-ssr');
const SSR_ENTRY = 'src/entry-prerender.tsx';
const SSR_BUNDLE = join(SSR_DIST, 'entry-prerender.js');
/**
 * Beside the SSR bundle rather than in dist/: dist/ is what a deploy syncs to
 * S3, and this file is build plumbing for the workflow, not a public object.
 */
const MANIFEST_PATH = join(SSR_DIST, 'route-manifest.json');

const ROOT_TOKEN = '<div id="root"></div>';
/** Must equal SITE_ORIGIN in src/constants/site.ts (dist-html.test.ts checks the output). */
const CANONICAL_ORIGIN = 'https://www.oseptoledo.org';
const OG_LOCALE = { en: 'en_US', es: 'es_US' };

/** The fontsource file for the Latin subset of Bricolage Grotesque (variable, upright). */
const FONT_FILE = /^bricolage-grotesque-latin-wght-normal-[\w-]+\.woff2$/;

/**
 * Copy unique to ErrorFallback. renderToString does NOT run class error
 * boundaries (a throw propagates out of render()), so this is a belt-and-braces
 * check; an actual SSR throw is caught around the render call below.
 */
const ERROR_FALLBACK_MARKER = 'Something went wrong';

const failures = [];
const fail = (message) => failures.push(message);

// ---------------------------------------------------------------------------
// Head patching
// ---------------------------------------------------------------------------

const escapeAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Replace exactly one occurrence of `pattern`, failing the build unless the
 * tag appears precisely once. Zero matches would ship a page carrying another
 * route's head; more than one (template drift) would leave a stale duplicate.
 */
function replaceOne(html, pattern, replacement, label, route) {
  const matches = html.match(new RegExp(pattern.source, `${pattern.flags}g`));
  const count = matches ? matches.length : 0;
  if (count !== 1) {
    fail(`${route}: expected exactly one ${label} in dist/index.html to patch, found ${count}`);
    return html;
  }
  return html.replace(pattern, () => replacement);
}

/** A whole line holding one tag, so removing it leaves no blank line behind. */
const line = (tagPattern) => new RegExp(`[^\\S\\n]*${tagPattern.source}\\n?`);

const HREFLANG_LINK = /<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/>/;

/**
 * Rewrite every head tag that differs per route. og:image, og:type,
 * og:site_name and twitter:card stay as the template has them: one share image
 * and one site identity, true on every route.
 */
function patchHead(html, route) {
  const { head, locale } = route;
  const canonicalUrl = CANONICAL_ORIGIN + head.canonicalPath;
  const otherLocale = locale === 'en' ? 'es' : 'en';
  const id = route.path;

  let out = replaceOne(html, /<html lang="[^"]*">/, `<html lang="${locale}">`, '<html lang>', id);
  out = replaceOne(out, /<title>[\s\S]*?<\/title>/, `<title>${escapeText(head.title)}</title>`, '<title>', id);

  const metaTags = [
    [/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeAttr(head.description)}" />`, 'description'],
    [/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`, 'og:url'],
    [/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeAttr(head.title)}" />`, 'og:title'],
    [/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeAttr(head.description)}" />`, 'og:description'],
    [/<meta property="og:image:alt" content="[^"]*"\s*\/>/, `<meta property="og:image:alt" content="${escapeAttr(head.imageAlt)}" />`, 'og:image:alt'],
    [/<meta property="og:locale" content="[^"]*"\s*\/>/, `<meta property="og:locale" content="${OG_LOCALE[locale]}" />`, 'og:locale'],
    [/<meta property="og:locale:alternate" content="[^"]*"\s*\/>/, `<meta property="og:locale:alternate" content="${OG_LOCALE[otherLocale]}" />`, 'og:locale:alternate'],
    [/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeAttr(head.title)}" />`, 'twitter:title'],
    [/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${escapeAttr(head.description)}" />`, 'twitter:description'],
    [/<meta name="twitter:image:alt" content="[^"]*"\s*\/>/, `<meta name="twitter:image:alt" content="${escapeAttr(head.imageAlt)}" />`, 'twitter:image:alt'],
  ];
  for (const [pattern, replacement, label] of metaTags) {
    out = replaceOne(out, pattern, replacement, `<meta ${label}>`, id);
  }

  if (route.noindex) {
    // A page that exists only to say "this URL is wrong" must not be indexed,
    // must not vote for any canonical URL (its own included), and must not
    // claim to be the English or Spanish version of anything.
    out = replaceOne(
      out,
      /<meta name="robots" content="[^"]*"\s*\/>/,
      '<meta name="robots" content="noindex" />',
      '<meta name="robots">',
      id,
    );
    out = replaceOne(out, line(/<link rel="canonical" href="[^"]*"\s*\/>/), '', '<link rel="canonical">', id);
    const hreflangCount = (out.match(new RegExp(HREFLANG_LINK.source, 'g')) ?? []).length;
    if (hreflangCount !== 3) fail(`${id}: expected 3 hreflang links to remove, found ${hreflangCount}`);
    out = out.replace(new RegExp(line(HREFLANG_LINK).source, 'g'), '');
  } else {
    out = replaceOne(
      out,
      /<link rel="canonical" href="[^"]*"\s*\/>/,
      `<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />`,
      '<link rel="canonical">',
      id,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Font preload
// ---------------------------------------------------------------------------

/**
 * Every page sets its headline and body in Bricolage Grotesque, whose woff2
 * Vite emits under a hashed name only the build knows. Preloading the Latin
 * subset (which also covers Spanish: á é í ó ú ñ ¿ ¡ are all Latin-1) lets the
 * font download in parallel with the CSS instead of after it, which shortens
 * the swap from the fallback face. Inserted right after the viewport meta so
 * the preload scanner meets it first.
 */
function findFontFile() {
  const assets = join(DIST, 'assets');
  const hits = existsSync(assets) ? readdirSync(assets).filter((name) => FONT_FILE.test(name)) : [];
  if (hits.length !== 1) {
    fail(`font preload: expected exactly one ${FONT_FILE} in dist/assets, found ${hits.length}`);
    return null;
  }
  return hits[0];
}

const VIEWPORT_LINE = /<meta name="viewport"[^>]*>\n/;

function injectFontPreload(html, fontFile, route) {
  if (!fontFile) return html;
  const viewport = html.match(VIEWPORT_LINE)?.[0] ?? '';
  const tag = `<link rel="preload" as="font" type="font/woff2" href="/assets/${fontFile}" crossorigin />`;
  return replaceOne(html, VIEWPORT_LINE, `${viewport}    ${tag}\n`, '<meta name="viewport">', route);
}

// ---------------------------------------------------------------------------
// Route manifest
// ---------------------------------------------------------------------------

/**
 * Describe how each route is *served*, for .github/workflows/deploy.yml to
 * read, so a route's deployment key lives in one place (the ROUTES registry)
 * instead of hand-written lists in the workflow. The contract it reads:
 *
 *   shell         the '/' route's outFile, served at the bucket root.
 *   errorPage     the outFile CloudFront's errorResponses names (keeps .html).
 *   extensionless every other route, as the S3 key it is served under: its
 *                 path without the leading '/'. Uploaded with
 *                 --content-type "text/html", since S3 would otherwise label an
 *                 extensionless key binary/octet-stream.
 *
 * Every ambiguity is a build failure rather than a best guess, because a wrong
 * key is a 404 that nothing notices until a visitor does.
 */
function deriveRouteManifest(routes) {
  const roots = routes.filter((route) => route.path === '/');
  const errorPages = routes.filter((route) => route.errorPage === true);

  if (roots.length !== 1) {
    fail(`route manifest: expected exactly one route with path "/", found ${roots.length}`);
  }
  if (errorPages.length !== 1) {
    fail(`route manifest: expected exactly one route flagged errorPage, found ${errorPages.length}`);
  }

  const byOutFile = new Map();
  for (const route of routes) {
    const seen = byOutFile.get(route.outFile);
    if (seen) {
      fail(`route manifest: "${route.path}" and "${seen}" both build ${route.outFile}`);
      continue;
    }
    byOutFile.set(route.outFile, route.path);
  }

  const extensionless = [];
  for (const route of routes) {
    if (route.path === '/' || route.errorPage === true) continue;
    // One lowercase kebab-case segment: the edge lowercases document paths
    // while S3 keys are case-sensitive, a nested path needs a directory-shaped
    // key the flat copy loop does not write, and the workflow splits the list
    // on whitespace.
    if (!/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route.path)) {
      fail(`route manifest: "${route.path}" is not a single lowercase kebab-case segment`);
      continue;
    }
    const key = route.path.slice(1);
    if (route.outFile !== `${key}.html`) {
      fail(`route manifest: "${route.path}" builds ${route.outFile}, but the deploy copies dist/${key}.html`);
      continue;
    }
    extensionless.push(key);
  }

  // Contracts with the distribution (defaultRootObject and errorResponses).
  const shell = roots[0]?.outFile;
  const errorPage = errorPages[0]?.outFile;
  if (roots.length === 1 && shell !== 'index.html') {
    fail(`route manifest: the "/" route builds ${shell}, but CloudFront's defaultRootObject is 'index.html'`);
  }
  if (errorPages.length === 1 && errorPage !== '404.html') {
    fail(`route manifest: the error page builds ${errorPage}, but CloudFront's errorResponses names '/404.html'`);
  }

  return { shell, errorPage, extensionless };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

console.log('prerender: building SSR bundle...');
execFileSync(
  process.execPath,
  [join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--ssr', SSR_ENTRY, '--outDir', 'dist-ssr'],
  { cwd: repoRoot, stdio: 'inherit' },
);

if (!existsSync(SSR_BUNDLE)) {
  console.error(`prerender: expected SSR bundle at ${SSR_BUNDLE} but it was not emitted.`);
  process.exit(1);
}

const { ROUTES, render } = await import(pathToFileURL(SSR_BUNDLE).href);

const templatePath = join(DIST, 'index.html');
if (!existsSync(templatePath)) {
  console.error('prerender: dist/index.html not found — run `vite build` first.');
  process.exit(1);
}
const template = readFileSync(templatePath, 'utf8');

if (!template.includes(ROOT_TOKEN)) {
  console.error(
    template.includes('<div id="root">')
      ? 'prerender: dist/index.html is already prerendered. This script must run on a ' +
          'fresh `vite build` output — use `npm run build`, which does both in order.'
      : `prerender: dist/index.html does not contain the exact token ${ROOT_TOKEN}.`,
  );
  process.exit(1);
}

const fontFile = findFontFile();

for (const route of ROUTES) {
  // renderToString rethrows anything a component throws, so catch per route to
  // keep the summary below and know which route failed.
  let rendered;
  try {
    rendered = render(route.path);
  } catch (err) {
    fail(`${route.path}: renderToString threw — ${err?.stack ?? err?.message ?? err}`);
    continue;
  }

  // Checks on the rendered body only: the head already carries some page text.
  const h1s = rendered.match(/<h1[\s>][\s\S]*?<\/h1>/g) ?? [];
  if (h1s.length !== 1) fail(`${route.path}: expected exactly one <h1>, found ${h1s.length}`);
  else if (!h1s[0].includes(`>${escapeText(route.h1)}</h1>`)) {
    fail(`${route.path}: <h1> is not "${route.h1}": ${h1s[0]}`);
  }
  if (rendered.includes(ERROR_FALLBACK_MARKER)) {
    fail(`${route.path}: ErrorFallback copy is in the output instead of page content`);
  }

  let html = template.replace(ROOT_TOKEN, () => `<div id="root">${rendered}</div>`);
  html = patchHead(html, route);
  html = injectFontPreload(html, fontFile, route.path);

  // Assert the head facts that matter most, rather than trusting the patch.
  if (!html.startsWith('<!doctype html>') || !html.includes(`<html lang="${route.locale}">`)) {
    fail(`${route.path}: <html lang="${route.locale}"> missing from the output`);
  }
  if ((html.match(/<script type="application\/ld\+json">/g) ?? []).length !== 1) {
    fail(`${route.path}: expected exactly one JSON-LD block`);
  }
  if (route.noindex) {
    if (!html.includes('<meta name="robots" content="noindex" />')) fail(`${route.path}: robots meta is not noindex`);
    if (html.includes('rel="canonical"')) fail(`${route.path}: a canonical link survived into a noindex route`);
    if (html.includes('hreflang=')) fail(`${route.path}: an hreflang link survived into a noindex route`);
  } else if (!html.includes(`<link rel="canonical" href="${CANONICAL_ORIGIN}${route.head.canonicalPath}" />`)) {
    fail(`${route.path}: canonical is not ${CANONICAL_ORIGIN}${route.head.canonicalPath}`);
  }

  writeFileSync(join(DIST, route.outFile), html);
  console.log(`prerender: ${route.path} → dist/${route.outFile} (${(html.length / 1024).toFixed(1)} kB)`);
}

// Derived after the loop and written only past the failure summary, so a failed
// prerender never leaves a manifest behind for a deploy to trust.
const routeManifest = deriveRouteManifest(ROUTES);

if (failures.length) {
  console.error(`\nprerender: ${failures.length} assertion(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

writeFileSync(MANIFEST_PATH, `${JSON.stringify(routeManifest, null, 2)}\n`);
console.log(
  'prerender: route manifest → dist-ssr/route-manifest.json ' +
    `(shell ${routeManifest.shell}, error page ${routeManifest.errorPage}, ` +
    `extensionless ${routeManifest.extensionless.join(' ')})`,
);
console.log('prerender: all routes prerendered and asserted.');
