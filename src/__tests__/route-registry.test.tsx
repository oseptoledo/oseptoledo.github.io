import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import Root from '../Root'
import { render, ROUTES } from '../entry-prerender'

/**
 * The prerender registry (`ROUTES` and `pages` in src/entry-prerender.tsx) and
 * Root's pathname branches (src/Root.tsx) are two hand-kept lists of the same
 * routes: the build renders each page from the first, the browser picks the
 * page from the second. They have to name the same page for every path, or the
 * client's first render disagrees with the served HTML, React discards it, and
 * the page flips to another one on mount.
 *
 * So for every route, Root's markup at that pathname must be byte-identical to
 * the markup the prerender writes for it. No build needed: both sides render
 * from source.
 */

const UNKNOWN_PATH = '/this-page-does-not-exist'

function rootMarkupAt(pathname: string): string {
  window.history.replaceState({}, '', pathname)
  return renderToString(<Root />)
}

afterEach(() => {
  window.history.replaceState({}, '', '/')
})

const errorRoutes = ROUTES.filter((route) => route.errorPage)
const pageRoutes = ROUTES.filter((route) => !route.errorPage)

describe('Root and the prerender registry agree', () => {
  it('there is exactly one error-page route to compare unknown paths against', () => {
    expect(errorRoutes).toHaveLength(1)
  })

  it.each(pageRoutes.map((route) => [route.path]))('Root renders the prerendered page at %s', (path) => {
    expect(rootMarkupAt(path)).toBe(render(path))
  })

  it.each(pageRoutes.map((route) => [route.path]))('%s is not NotFound', (path) => {
    expect(rootMarkupAt(path)).not.toBe(render(errorRoutes[0].path))
  })

  it('the English and Spanish homepages are different pages', () => {
    expect(render('/')).not.toBe(render('/es'))
  })

  it('an unknown path renders the page the error route prerenders (NotFound)', () => {
    expect(rootMarkupAt(UNKNOWN_PATH)).toBe(render(errorRoutes[0].path))
  })

  it('the error route is not reachable by its own registry key', () => {
    expect(rootMarkupAt(errorRoutes[0].path)).toBe(render(errorRoutes[0].path))
  })

  it.each(pageRoutes.filter((route) => route.path !== '/').map((route) => [route.path]))(
    '%s still matches with a trailing slash and in upper case',
    (path) => {
      // A canonical-host edge function would 301 these away; `npm run dev` and
      // `npm run preview` have no edge in front of them.
      expect(rootMarkupAt(`${path.toUpperCase()}/`)).toBe(render(path))
    },
  )

  it('/index.html is the English homepage', () => {
    expect(rootMarkupAt('/index.html')).toBe(render('/'))
  })

  it.each([['/Index.html'], ['/es.html'], ['/ES.html']])(
    '%s renders the error route, as the 404.html the edge would serve for it',
    (path) => {
      expect(rootMarkupAt(path)).toBe(render(errorRoutes[0].path))
    },
  )
})
