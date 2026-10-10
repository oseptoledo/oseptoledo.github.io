/// <reference types="vitest" />
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The Footer's copyright year, fixed at build time instead of read from the
 * visitor's clock during render. `src/main.tsx` hydrates the prerendered HTML,
 * and a render-time clock read makes the client disagree with the served bytes
 * as soon as the visitor's year rolls past the build's. A text mismatch makes
 * React discard the server HTML and client-render the whole root, silently.
 *
 * Taken from the HEAD commit's timestamp rather than from `new Date()`, because
 * three separate evaluations of this file have to agree on it: `vite build`
 * (the client bundle), the `vite build --ssr` that scripts/prerender.mjs runs
 * afterwards in another process (the served HTML), and Vitest (the hydration
 * test that holds the two together). Three clock reads can straddle midnight on
 * 31 December; one commit timestamp cannot. Outside a git checkout, or before
 * the first commit, it reads package.json's modification time instead, never the
 * clock: all three evaluations see the one mtime.
 *
 * The year is taken in the partnership's own time zone (Toledo, OH), not UTC,
 * so a merge on the evening of 31 December does not print next year a day early.
 */
const SITE_TIME_ZONE = 'America/New_York'

function yearInSiteTimeZone(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: SITE_TIME_ZONE, year: 'numeric' }).format(date),
  )
}

function buildYear(): number {
  try {
    const seconds = Number(
      execFileSync('git', ['log', '-1', '--format=%ct'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    )
    if (Number.isInteger(seconds) && seconds > 0) {
      return yearInSiteTimeZone(new Date(seconds * 1000))
    }
  } catch {
    // Not a git checkout, no commits yet, or no git binary: use the file time below.
  }
  return yearInSiteTimeZone(statSync(new URL('./package.json', import.meta.url)).mtime)
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  define: {
    __BUILD_YEAR__: JSON.stringify(buildYear()),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // The site's tests only. infra/ (the AWS CDK app and the contact Lambda) is
    // its own npm package with its own dependencies and runner (`npm test`
    // inside infra/: Vitest in Node plus `node --test`); picked up from here,
    // its tests would run under jsdom without their dependencies installed.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
