import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTES } from '../entry-prerender'

/**
 * dist-ssr/route-manifest.json is how .github/workflows/deploy.yml learns which
 * S3 key each route ships under (see deriveRouteManifest in scripts/prerender.mjs).
 * It must be derivable from ROUTES and nothing else. Requires a prior build.
 */
const MANIFEST = join(process.cwd(), 'dist-ssr', 'route-manifest.json')

describe('route manifest', () => {
  it('exists after a build', () => {
    expect(existsSync(MANIFEST), 'Run `npm run build` first.').toBe(true)
  })

  it('names the shell, the error page and every other route as an extensionless key', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
    expect(manifest).toEqual({
      shell: 'index.html',
      errorPage: '404.html',
      extensionless: ROUTES.filter((route) => route.path !== '/' && !route.errorPage).map((route) =>
        route.path.slice(1),
      ),
    })
    expect(manifest.extensionless).toEqual(['es'])
  })

  it('builds every extensionless key from <key>.html', () => {
    for (const route of ROUTES.filter((r) => r.path !== '/' && !r.errorPage)) {
      expect(route.outFile).toBe(`${route.path.slice(1)}.html`)
    }
  })
})
