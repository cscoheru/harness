// T-M1c-QA-1: vitest config with coverage + integration filter
// match: wrapper/test/**/*.test.ts (unit + integration)
import { defineConfig, type Plugin } from 'vitest/config';
import { dirname, resolve as pathResolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * T-M2-V0.4-GATE-CALIB C6 fix:
 * Resolve relative imports ending in `.js` to their `.ts` source files.
 *
 * Background: TypeScript `module: Node16` requires `.js` extensions in source
 * (because runtime Node ESM needs them), but vitest/vite uses its own resolver
 * that doesn't auto-map `.js` → `.ts`. vite rejects `resolve.alias` regex
 * ("don't have relative aliases"); the supported fix is a resolve plugin.
 *
 * Strategy: when we see a relative `.js` import, resolve it to an absolute
 * filesystem path with `.ts` extension — vite then loads that file directly
 * without going through its own resolver chain.
 */
function stripJsExtensionPlugin(rootDir: string): Plugin {
  return {
    name: 'strip-js-extension',
    enforce: 'pre',
    resolveId(source: string, importer?: string) {
      // Only rewrite relative imports ending in `.js` (Node16 ESM convention)
      if (!/^\.{1,2}\/.+\.js$/.test(source)) return null;
      if (!importer) return null;
      const baseDir = importer.startsWith('/') ? dirname(importer) : rootDir;
      const tsCandidate = pathResolve(baseDir, source.replace(/\.js$/, '.ts'));
      if (existsSync(tsCandidate)) return tsCandidate;
      // Fallback: let default resolver try (may resolve via node_modules / etc.)
      return null;
    },
  };
}

export default defineConfig({
  // T-M2-V0.4-GATE-CALIB C6 fix: resolve plugin strips `.js` from relative imports
  // so vite can map `.js` → `.ts` source under Node16 ESM conventions.
  plugins: [stripJsExtensionPlugin(process.cwd())],
  test: {
    // match unit + integration test files under wrapper/test/
    // Exclude e2e/ — Playwright runs separately via npm run test:e2e:smoke
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    // passWithNoTests: allow empty test files
    passWithNoTests: true,
    // allowOnly: allow test.todo() to count as passing
    allowOnly: true,
    // M1c GATE-REPAIR-2: testTimeout 30s（默认 5s 不足以覆盖真 dsh 调用 1.5-3.5s+ 波动）
    testTimeout: 30000,
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
