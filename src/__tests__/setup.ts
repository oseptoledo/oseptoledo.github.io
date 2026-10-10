import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library unmounts between tests on its own only when Vitest globals
// are on; they are off here, so unmount explicitly.
afterEach(() => cleanup())

// Tests that drive React directly (hydration.test.tsx) use `act` without
// importing Testing Library, which is what normally sets this flag.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom ships no matchMedia; the Navbar subscribes to one while its menu is open.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}
