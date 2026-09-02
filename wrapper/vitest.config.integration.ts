import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/orch_kernel.test.ts'],
    // extended timeout for real dsh calls (60-120s wall time)
    testTimeout: 200_000,
    hookTimeout: 30_000,
  },
});
