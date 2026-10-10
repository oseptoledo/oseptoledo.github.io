import { defineConfig } from 'vitest/config';

// Infra tests only. test/*.node-test.mjs (the contact Lambda's own tests) run
// separately under `node --test`, so they are kept out of Vitest's include.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Synthesizing the stacks (and running cdk-nag over them) takes a few
    // seconds per app; the default 5 s is too tight on a cold machine.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
