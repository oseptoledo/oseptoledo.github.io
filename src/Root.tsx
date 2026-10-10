import { normalizePath } from './paths'
import { HomeEnglish, HomeSpanish } from './pages/Home'
import NotFound from './pages/NotFound'

/**
 * Path-based page selection. Every route is its own prerendered file (`/` is
 * index.html, `/es` is es.html, unknown paths get 404.html), and every file
 * ships the same client bundle, which hydrates the prerendered markup
 * (src/hydrateApp.tsx). So the pathname at load time is what tells React which
 * page it is adopting, and the page chosen here must be the page
 * scripts/prerender.mjs wrote for that path: miss a branch and the route
 * prerenders correctly, fails to hydrate (React discards the server HTML and
 * client-renders) and flips to NotFound the moment React mounts.
 * src/__tests__/route-registry.test.tsx fails if this list and the prerender
 * registry in src/entry-prerender.tsx disagree.
 *
 * There is no client-side router. Navigation between pages, including the
 * language switch, is a full page load through plain anchors.
 *
 * NotFound is the fallback and there is deliberately no '/404' branch: the edge
 * serves /404.html for whatever URL was asked for, so the pathname React reads
 * at /some-typo is still /some-typo.
 */
export default function Root() {
  const path = normalizePath(window.location.pathname)

  // /index.html is a real key a deploy uploads, so it is the homepage too; its canonical stays "/".
  if (path === '/' || path === '/index.html') return <HomeEnglish />
  if (path === '/es') return <HomeSpanish />
  return <NotFound />
}
