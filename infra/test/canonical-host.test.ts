/**
 * Runs the real functions/canonical-host.js (after the same placeholder
 * substitution the stack performs) in a Node vm, and holds it to two things:
 * a table of expected redirects and pass-throughs, and parity with
 * normalizePath() in src/paths.ts, the browser-side mirror that decides which
 * page React renders.
 *
 * The vm is plain ECMAScript, not CloudFront's cloudfront-js-2.0 runtime, so
 * this proves behavior, not runtime compatibility; the file's ES5 style is
 * what keeps it inside that runtime (CloudFormation rejects a function that
 * does not compile there), and the curl smoke tests in README step 10 are the
 * check against the real edge.
 */
import * as fs from 'node:fs';
import * as vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { normalizePath } from '../../src/paths';
import {
  CANONICAL_HOST_FUNCTION_FILE,
  CANONICAL_HOST_PLACEHOLDER,
  HSTS_MAX_AGE,
  canonicalHostFunctionCode,
} from '../lib/website-stack';

const CANONICAL = 'www.oseptoledo.org';
const ORIGIN = `https://${CANONICAL}`;

interface QueryValue {
  value: string;
  multiValue?: { value: string }[];
}
interface CloudFrontRequest {
  method: string;
  uri: string;
  querystring: Record<string, QueryValue>;
  headers: Record<string, { value: string }>;
  cookies: Record<string, unknown>;
}
interface CloudFrontRedirect {
  statusCode: number;
  statusDescription: string;
  headers: Record<string, { value: string }>;
}
type Handler = (event: unknown) => CloudFrontRequest | CloudFrontRedirect;

function loadHandler(canonicalHost = CANONICAL): Handler {
  const context = vm.createContext({});
  vm.runInContext(canonicalHostFunctionCode(canonicalHost), context, { filename: 'canonical-host.js' });
  return (context as { handler: Handler }).handler;
}

/**
 * CloudFront's parsed form of a raw query string: values stay percent-encoded
 * exactly as received, and a repeated key carries every value in multiValue.
 */
function parseQuery(raw: string): Record<string, QueryValue> {
  const result: Record<string, QueryValue> = {};
  if (!raw) return result;
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    const value = eq === -1 ? '' : part.slice(eq + 1);
    const existing = result[key];
    if (!existing) {
      result[key] = { value };
    } else {
      existing.multiValue = existing.multiValue ?? [{ value: existing.value }];
      existing.multiValue.push({ value });
    }
  }
  return result;
}

function run(handler: Handler, host: string | undefined, uri: string, query = '') {
  const request: CloudFrontRequest = {
    method: 'GET',
    uri,
    querystring: parseQuery(query),
    headers: host === undefined ? {} : { host: { value: host } },
    cookies: {},
  };
  return handler({ version: '1.0', context: { eventType: 'viewer-request' }, viewer: { ip: '192.0.2.1' }, request });
}

const isRedirect = (result: CloudFrontRequest | CloudFrontRedirect): result is CloudFrontRedirect =>
  'statusCode' in result;

/** The path the visitor ends up on: the redirect target's path, or the URI passed through. */
function landingPath(result: CloudFrontRequest | CloudFrontRedirect, uri: string): string {
  if (!isRedirect(result)) return uri;
  const location = result.headers.location.value;
  expect(location.startsWith(`${ORIGIN}/`), location).toBe(true);
  const rest = location.slice(ORIGIN.length);
  const q = rest.indexOf('?');
  return q === -1 ? rest : rest.slice(0, q);
}

/** normalizePath and the edge differ, by design, only here (see the divergence test). */
const isAssetsNoDot = (uri: string) =>
  uri.startsWith('/assets/') && !uri.slice(uri.lastIndexOf('/') + 1).includes('.');

const handler = loadHandler();

// [what, host, uri, raw query, expected Location or null for pass-through]
const CASES: [string, string | undefined, string, string, string | null][] = [
  ['the English home', CANONICAL, '/', '', null],
  ['the Spanish home', CANONICAL, '/es', '', null],
  ['an uppercase Host (hosts are case-insensitive)', 'WWW.OSEPTOLEDO.ORG', '/es', '', null],
  ['a trailing slash', CANONICAL, '/es/', '', `${ORIGIN}/es`],
  ['uppercase', CANONICAL, '/ES', '', `${ORIGIN}/es`],
  ['mixed case and several slashes, in one hop', CANONICAL, '/Es///', '', `${ORIGIN}/es`],
  ['only slashes', CANONICAL, '//', '', `${ORIGIN}/`],
  ['a nested document path', CANONICAL, '/About/Us/', '', `${ORIGIN}/about/us`],
  ['the apex', 'oseptoledo.org', '/', '', `${ORIGIN}/`],
  ['the apex with a messy path and a campaign tag', 'oseptoledo.org', '/ES/', 'utm_campaign=spring+launch', `${ORIGIN}/es?utm_campaign=spring+launch`],
  ['the CloudFront domain', 'd111111abcdef8.cloudfront.net', '/es', '', `${ORIGIN}/es`],
  ['a missing Host header', undefined, '/', '', `${ORIGIN}/`],
  ['a Host with a trailing dot', 'www.oseptoledo.org.', '/', '', `${ORIGIN}/`],
  ['a lookalike host', 'www.oseptoledo.org.evil.example', '/', '', `${ORIGIN}/`],
  ['index.html (a real key)', CANONICAL, '/index.html', '', null],
  ['a dotted file keeps its case', CANONICAL, '/Index.html', '', null],
  ['the 404 page', CANONICAL, '/404.html', '', null],
  ['the sitemap', CANONICAL, '/sitemap.xml', '', null],
  ['llms.txt', CANONICAL, '/llms.txt', '', null],
  ['an image with uppercase', CANONICAL, '/images/Logo-Partner.webp', '', null],
  ['a hashed Vite asset', CANONICAL, '/assets/index-AbC123xY.js', '', null],
  ['a hashed asset on the apex keeps its case', 'oseptoledo.org', '/assets/index-AbC123xY.js', '', `${ORIGIN}/assets/index-AbC123xY.js`],
  ['a dotted directory with a trailing slash is a document path', CANONICAL, '/Foo.Bar/', '', `${ORIGIN}/foo.bar`],
  ['the contact endpoint, were it ever routed here', CANONICAL, '/api/contact', '', null],
  ['a query on a canonical URL passes untouched', CANONICAL, '/es', 'utm_source=Flyer&ref=a%2Fb', null],
  ['encoded values are not re-encoded', 'oseptoledo.org', '/', 'q=caf%C3%A9&x=a%20b&plus=1+2', `${ORIGIN}/?q=caf%C3%A9&x=a%20b&plus=1+2`],
  ['repeated keys keep every value (grouped)', 'oseptoledo.org', '/', 'a=1&b=2&a=3', `${ORIGIN}/?a=1&a=3&b=2`],
  ['a bare flag gains an equals sign', 'oseptoledo.org', '/ES', 'flag', `${ORIGIN}/es?flag=`],
];

describe('canonical-host.js', () => {
  it.each(CASES)('%s: %s %s ?%s', (_what, host, uri, query, expected) => {
    const result = run(handler, host, uri, query);
    if (expected === null) {
      expect(isRedirect(result), JSON.stringify(result)).toBe(false);
      expect(result).toMatchObject({ uri });
    } else {
      expect(isRedirect(result)).toBe(true);
      const redirect = result as CloudFrontRedirect;
      expect(redirect.statusCode).toBe(301);
      expect(redirect.statusDescription).toBe('Moved Permanently');
      expect(redirect.headers.location.value).toBe(expected);
    }
  });

  it('every redirect target is a fixed point: following it never redirects again', () => {
    for (const [, host, uri, query, expected] of CASES) {
      if (expected === null) continue;
      const target = run(handler, host, uri, query) as CloudFrontRedirect;
      const url = target.headers.location.value.slice(ORIGIN.length);
      const q = url.indexOf('?');
      const again = run(handler, CANONICAL, q === -1 ? url : url.slice(0, q), q === -1 ? '' : url.slice(q + 1));
      expect(isRedirect(again), `${target.headers.location.value} redirected again`).toBe(false);
    }
  });

  it('puts the same HSTS value on its 301s as the response headers policy sends', () => {
    const redirect = run(handler, 'oseptoledo.org', '/') as CloudFrontRedirect;
    expect(redirect.headers['strict-transport-security'].value).toBe(
      `max-age=${HSTS_MAX_AGE.toSeconds()}; includeSubDomains; preload`,
    );
  });

  it('substitutes the canonical host from config, and nothing else', () => {
    const other = loadHandler('www.example.org');
    expect((run(other, 'example.org', '/') as CloudFrontRedirect).headers.location.value).toBe('https://www.example.org/');
    expect(isRedirect(run(other, 'www.example.org', '/'))).toBe(false);

    const source = fs.readFileSync(CANONICAL_HOST_FUNCTION_FILE, 'utf8');
    expect(source.split(CANONICAL_HOST_PLACEHOLDER)).toHaveLength(2);
    expect(canonicalHostFunctionCode(CANONICAL)).not.toContain(CANONICAL_HOST_PLACEHOLDER);
  });

  it('fits CloudFront Functions limits and stays in the ES5 subset the runtime is written for', () => {
    const code = canonicalHostFunctionCode(CANONICAL);
    expect(Buffer.byteLength(code, 'utf8')).toBeLessThanOrEqual(10 * 1024);
    // Strip comments, then look for syntax this file deliberately avoids.
    const body = code.replace(/\/\/.*$/gm, '');
    expect(body).not.toMatch(/\b(let|const|class|async|await|import|export|require)\b|=>|`|\(\?<[=!]/);
  });
});

describe('parity with src/paths.ts normalizePath()', () => {
  it('lands on the path normalizePath() renders, for every table case', () => {
    for (const [what, host, uri, query] of CASES) {
      if (isAssetsNoDot(uri)) continue;
      expect(landingPath(run(handler, host, uri, query), uri), what).toBe(normalizePath(uri));
    }
  });

  it('agrees on a generated grid of paths (case, dots, trailing slashes, nesting)', () => {
    const segments = ['', 'es', 'ES', 'Es', 'a', 'About', 'a.b', 'Index.HTML', 'index.html', '404.html', 'images', 'assets', 'Assets'];
    const paths = new Set<string>();
    for (const first of segments) {
      for (const second of ['', ...segments]) {
        for (const slashes of ['', '/', '//', '///']) {
          paths.add(`/${first}${second ? `/${second}` : ''}${slashes}`);
        }
      }
    }
    let checked = 0;
    for (const uri of paths) {
      if (isAssetsNoDot(uri)) continue;
      const result = run(handler, CANONICAL, uri);
      expect(landingPath(result, uri), uri).toBe(normalizePath(uri));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('documents the one divergence: /assets/ paths without a dot (no such file exists)', () => {
    // The edge passes /assets/* through untouched because Vite's hashed
    // filenames are mixed-case S3 keys. normalizePath() has no /assets/ rule,
    // so for a dotless /assets/ path it folds where the edge does not. Such a
    // path is never a real file (every Vite asset has an extension) and never a
    // page route, so S3 answers 404, CloudFront serves /404.html, and both
    // sides render NotFound. If src/paths.ts gains the /assets/ rule, this
    // test fails and the exclusion above should go.
    for (const uri of ['/assets/', '/assets/Foo', '/assets/x/']) {
      const result = run(handler, CANONICAL, uri);
      expect(isRedirect(result), uri).toBe(false);
      expect(normalizePath(uri), uri).not.toBe(uri);
      expect(normalizePath(uri).startsWith('/assets'), uri).toBe(true);
    }
  });
});
