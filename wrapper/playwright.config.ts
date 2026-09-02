// T-M1c-QA-1: Playwright config — E2E smoke tests with local mock server
// Scope: M1c smoke only (M2+ runs full 4-step E2E)
// Note: harness.rana.asia is not deployed locally; use a local mock PWA server
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: ['**/*.test.ts'],
  timeout: 60_000,
  use: {
    // Use local mock server for smoke test (harness.rana.asia not deployed locally)
    baseURL: 'http://localhost:3847',
  },
  webServer: {
    command: 'node mock-pwa-server.mjs',
    port: 3847,
    reuseExistingServer: true,
    timeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
