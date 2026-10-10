import { StrictMode, type ErrorInfo } from 'react'
import { createRoot, hydrateRoot, type Root as ReactRoot } from 'react-dom/client'
import Root from './Root'
import ErrorBoundary from './components/ErrorBoundary'

type RecoverableErrorHandler = (error: unknown, errorInfo: ErrorInfo) => void

/**
 * Hydrate the prerendered page: adopt the markup scripts/prerender.mjs baked
 * into #root instead of discarding it and building a new tree. Rebuilding would
 * repaint the hero heading and photo after load, and on phones the browser then
 * counts that late repaint, not the served HTML, as the Largest Contentful Paint.
 *
 * That holds only while hydration succeeds. If the first client render differs
 * from the served HTML (a clock read, a locale-dependent string, a route Root
 * and the prerender registry disagree on), React throws the server markup away
 * and client-renders the root, on every page, with nothing visibly broken. The
 * render tree must therefore stay deterministic: see the purity note in
 * src/entry-prerender.tsx, and src/__tests__/hydration.test.tsx, which hydrates
 * every built route and fails on any recoverable error or console.error.
 *
 * Exported from here rather than written inline in main.tsx so the hydration
 * test mounts exactly the production tree.
 */
export function hydrateApp(
  container: Element,
  onRecoverableError: RecoverableErrorHandler = reportRecoverableError,
): ReactRoot {
  return hydrateRoot(container, app(), { onRecoverableError })
}

/**
 * What main.tsx calls. Every file a deploy serves has prerendered markup in
 * #root, so production always hydrates. `npm run dev` does not: Vite serves
 * the source index.html, whose #root is empty, and hydrating an empty container
 * is a guaranteed mismatch that would log a false "Hydration failed" on every
 * dev page load. An empty container has nothing to adopt, so it gets a plain
 * client render instead.
 */
export function mountApp(container: Element): ReactRoot {
  if (container.firstElementChild) return hydrateApp(container)
  const root = createRoot(container)
  root.render(app())
  return root
}

function app() {
  return (
    <StrictMode>
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
    </StrictMode>
  )
}

/**
 * React 19 reports a hydration mismatch here, not reliably through
 * console.error, and then recovers by client rendering. Left at React's default
 * it is one minified console line that does not say the prerender was thrown
 * away, so say it plainly. There is no error-tracking service (see
 * ErrorBoundary.tsx).
 */
export function reportRecoverableError(error: unknown, errorInfo: ErrorInfo): void {
  console.error(
    'Hydration failed: React discarded the prerendered HTML and rendered this page on the client instead.',
    error,
    errorInfo.componentStack ?? '',
  )
}
