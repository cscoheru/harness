// T-M0c-QA-1: vitest minimal config
// match: wrapper/test/**/*.test.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // match all test files under wrapper/test/
    include: ['test/**/*.test.ts'],
    // minimal config — vitest requires zero config by default
    passWithNoTests: true,
    // allow test.todo() to count as passing
    allowOnly: true,
  },
});
