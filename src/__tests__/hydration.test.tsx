import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import type { Root as ReactRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ROUTES, type PrerenderRoute } from '../entry-prerender'
import { hydrateApp, mountApp } from '../hydrateApp'

/**
 * Hydrates every built page with the production tree (src/hydrateApp.tsx) and
 * fails on any recoverable error or console.error.
 *
 * Why: the client adopts the prerendered markup instead of rebuilding it. If
 * its first render differs from the served HTML by a single text node, React
 * throws the server markup away and client-renders the whole page, silently.
 * The usual causes are a clock read, a locale-dependent format, or Root and the
 * prerender registry disagreeing about a path (see the purity note in
 * src/entry-prerender.tsx). This is the test that sees it.
 *
 * Each route is hydrated twice: as an ordinary visitor, and as one whose clock
 * reads decades past the build, which is what catches a render-time `new Date()`
 * (the Footer's year is the build-time `__BUILD_YEAR__` for exactly this
 * reason). Requires a prior `npm run build`.
 */

const DIST = join(process.cwd(), 'dist')

/** The pathname a visitor would be at when served this file. */
function pathnameFor(route: PrerenderRoute): string {
  // dist/404.html is served for paths that do not exist; /404 is only its build key.
  return route.errorPage ? '/no-such-page' : route.path
}

/** A detached #root holding exactly the markup the file serves. */
function servedRoot(outFile: string): HTMLElement {
  const path = join(DIST, outFile)
  if (!existsSync(path)) throw new Error(`dist/${outFile} not found. Run \`npm run build\` first.`)
  const doc = new DOMParser().parseFromString(readFileSync(path, 'utf8'), 'text/html')
  const served = doc.getElementById('root')
  if (!served?.firstElementChild) throw new Error(`dist/${outFile} has an empty #root.`)
  const container = document.createElement('div')
  container.id = 'root'
  container.innerHTML = served.innerHTML
  return container
}

interface Mounted {
  container: HTMLElement
  root: ReactRoot
  servedH1: Element | null
  recoverableErrors: string[]
  consoleErrors: string[]
}

let mounted: Mounted | undefined

afterEach(() => {
  if (mounted) {
    act(() => mounted!.root.unmount())
    mounted.container.remove()
    mounted = undefined
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

async function hydrateRoute(route: PrerenderRoute): Promise<Mounted> {
  window.history.replaceState({}, '', pathnameFor(route))
  const container = servedRoot(route.outFile)
  document.body.appendChild(container)

  const recoverableErrors: string[] = []
  const consoleErrors: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(' '))
  })

  const servedH1 = container.querySelector('h1')
  let root: ReactRoot | undefined
  await act(async () => {
    root = hydrateApp(container, (error) => recoverableErrors.push(String(error)))
  })
  mounted = { container, root: root!, servedH1, recoverableErrors, consoleErrors }
  return mounted
}

const visitors = [
  { label: 'for an ordinary visitor', arrange: () => {} },
  {
    label: 'for a visitor whose clock reads 2099',
    arrange: () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2099-07-04T12:00:00Z'))
    },
  },
]

describe.each(visitors)('hydrating the built HTML $label', ({ arrange }) => {
  it.each(ROUTES.map((route) => [route.path, route] as const))('%s hydrates without a mismatch', async (_path, route) => {
    arrange()
    const result = await hydrateRoute(route)
    expect(result.recoverableErrors).toEqual([])
    expect(result.consoleErrors).toEqual([])
    // The served <h1> node is still the one in the document: React adopted the
    // markup rather than replacing it.
    expect(result.container.querySelector('h1')).toBe(result.servedH1)
  })
})

describe('mountApp (what main.tsx calls)', () => {
  it('client-renders an empty #root, as `npm run dev` serves it, without reporting a mismatch', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let root: ReactRoot | undefined
    await act(async () => {
      root = mountApp(container)
    })
    expect(container.querySelector('h1')).toBeTruthy()
    expect(errors).not.toHaveBeenCalled()
    act(() => root!.unmount())
    container.remove()
  })
})
