/**
 * project_root.test.ts — Regression test for PROJECT_ROOT path resolution.
 *
 * Verifies that all 4 dsh files resolve PROJECT_ROOT via import.meta.url,
 * not via process.cwd(). The volume mount change in Commit 3 makes
 * process.cwd() = /app/wrapper, so resolve(cwd, '..') would point to /app
 * (wrong) instead of the fish-harness project root.
 *
 * @file wrapper/test/unit/project_root.test.ts
 */

import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WRAPPER_ROOT = resolve(__dirname, '..', '..');
const DSH_DIR = resolve(WRAPPER_ROOT, 'dsh');

const TARGET_FILES = [
  'dsh_client.ts',
  'profile.ts',
  '6host_client.ts',
  'vapid_keys.ts',
] as const;

describe('PROJECT_ROOT path resolution (4 dsh files)', () => {
  for (const fname of TARGET_FILES) {
    describe(`${fname}`, () => {
      const fpath = resolve(DSH_DIR, fname);
      const contents = readFileSync(fpath, 'utf8');

      it('contains fileURLToPath import (ESM __dirname pattern)', () => {
        expect(contents).toMatch(/import\s*\{[^}]*fileURLToPath[^}]*\}\s*from\s*['"]url['"]/);
      });

      it('contains dirname import (for __dirname derivation)', () => {
        expect(contents).toMatch(/import\s*\{[^}]*\bdirname\b[^}]*\}\s*from\s*['"]path['"]/);
      });

      it('contains __filename / __dirname module-level constants', () => {
        expect(contents).toMatch(/const\s+__filename\s*=\s*fileURLToPath/);
        expect(contents).toMatch(/const\s+__dirname\s*=\s*dirname\(__filename\)/);
      });

      it('does NOT use process.cwd() for PROJECT_ROOT resolution', () => {
        // The forbidden pattern: resolve(process.cwd(), '..')
        expect(contents).not.toMatch(/resolve\s*\(\s*process\.cwd\(\)\s*,\s*['"]\.\.['"]\s*\)/);
      });

      it('uses __dirname-based PROJECT_ROOT (either module const or local var)', () => {
        // Module-level PROJECT_ROOT uses __dirname; function-local projectRoot uses __dirname
        const usesModuleConst = /const\s+PROJECT_ROOT\s*=\s*resolve\s*\(\s*__dirname\s*,\s*['"]\.\.['"]\s*(?:,\s*['"]\.\.['"]\s*)?\)/.test(contents);
        const usesLocalVar = /(?:const|let)\s+projectRoot\s*=\s*resolve\s*\(\s*__dirname\s*,\s*['"]\.\.['"]\s*(?:,\s*['"]\.\.['"]\s*)?\)/.test(contents);
        expect(usesModuleConst || usesLocalVar).toBe(true);
      });
    });
  }
});