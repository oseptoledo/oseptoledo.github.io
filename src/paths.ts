/**
 * The pathname as the site's canonical-host CloudFront Function
 * (infra/functions/canonical-host.js) leaves it: a document path (one whose
 * last segment has no dot) is lowercased and loses its trailing slashes.
 * A last segment with a dot is left exactly as asked, because the edge passes
 * those through and S3 keys are case-sensitive: /Index.html is not the
 * index.html key, so it is served 404.html and has to render NotFound, not the
 * homepage. `npm run dev` and `npm run preview` have no edge in front of them,
 * which is why Root folds these itself.
 *
 * One deliberate difference: the edge also passes every /assets/ path through
 * untouched (Vite's hashed filenames are mixed-case keys). Only a dotless
 * /assets/ path, which no real file or page has, is folded here and not there,
 * and both sides end at NotFound. infra/test/canonical-host.test.ts holds the
 * two together and documents that one case.
 */
export function normalizePath(pathname: string): string {
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1)
  if (lastSegment.includes('.')) return pathname
  return pathname.replace(/\/+$/, '').toLowerCase() || '/'
}
