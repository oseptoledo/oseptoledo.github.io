/// <reference types="vite/client" />

/**
 * The copyright year, substituted at build time by `define` in vite.config.ts
 * (the HEAD commit's year). A literal number in the client bundle, the SSR
 * prerender and Vitest alike, so the Footer never reads a clock during render.
 */
declare const __BUILD_YEAR__: number
