import { defineConfig } from 'vitest/config';

// Used by Stryker (npm run test:mutation): plain test runs, no coverage or type tests.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 60_000 },
});
