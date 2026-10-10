/**
 * Site identity. The single source for the origin and names that the
 * prerender, the JSON-LD in index.html, public/sitemap.xml, public/robots.txt
 * and public/llms.txt all repeat. Those files are static text a crawler reads
 * without running JavaScript, so they carry literal copies; the tests in
 * src/__tests__/ (site-dates, entity-graph, llms, dist-html) fail if a copy
 * drifts from these values.
 *
 * The canonical host is www, and the edge 301s the bare domain to it
 * (infra/functions/canonical-host.js, with primaryDomain in infra/cdk.json).
 * www works with any DNS provider, while the bare domain cannot be pointed at
 * CloudFront from GoDaddy's DNS (infra/README.md, "DNS, external path").
 * infra/lib/config.ts accepts only a primaryDomain below the apex, so moving
 * to the bare domain means changing infra/ too, along with SITE_ORIGIN and
 * every static copy, in one PR.
 */
export const SITE_ORIGIN = 'https://www.oseptoledo.org'

/** Formal name: headings, the JSON-LD Organization name, page titles. */
export const SITE_NAME = 'Old South End Partnership'

/** The short form the design uses for the wordmark and the footer. */
export const SITE_SHORT_NAME = 'OSE Partnership'

/** IANA zone for anything date-shaped. Toledo, Ohio. */
export const SITE_TIME_ZONE = 'America/New_York'
