// T-M1c-QA-1: vitest config with coverage + integration filter
// match: wrapper/test/**/*.test.ts (unit + integration)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // match unit + integration test files under wrapper/test/
    // Exclude e2e/ — Playwright runs separately via npm run test:e2e:smoke
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    // passWithNoTests: allow empty test files
    passWithNoTests: true,
    // allowOnly: allow test.todo() to count as passing
    allowOnly: true,
    // Load project-root .env.local into process.env before each test
    // (DEEPSEEK_API_KEY, TS_AUTHKEY, etc.)
    setupFiles: ['./test/setup.ts'],
    // Coverage thresholds (M1c QA-1 gate: ≥ 80%)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'orchestrator/**/*.ts',
        'dsh/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        'vitest.config.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
