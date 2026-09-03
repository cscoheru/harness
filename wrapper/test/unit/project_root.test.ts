/**
 * project_root.test.ts — Regression test for PROJECT_ROOT path resolution.
 *
 * Verifies that all 4 dsh files resolve PROJECT_ROOT via import.meta.url,
 * not via process.cwd(). The volume mount change in Commit 3 makes
 * process.cwd() = /app/wrapper, so resolve(cwd, '..') would point to /app
 * (wrong) instead of the fish-harness project root.
 *
 * tsc preserves the wrapper/dsh/ → wrapper/build/dsh/ offset, so 2-layer
 * resolution works in src and 3-layer in build. D-5 introduced a conditional
 * pattern (`__dirname.includes('/build/') ? 3-layer : 2-layer`) so the same
 * source code works in both layouts. This test accepts either the simple
 * direct form or the conditional ternary form.
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

      it('uses __dirname-based PROJECT_ROOT (direct OR conditional D-5 ternary)', () => {
        // Direct form: const PROJECT_ROOT = resolve(__dirname, '..' [, '..'] [, '..'])
        const directModuleConst = /const\s+PROJECT_ROOT\s*=\s*resolve\s*\(\s*__dirname\s*(?:,\s*['"]\.\.['"]){1,3}\s*\)/.test(contents);
        const directLocalVar = /(?:const|let)\s+projectRoot\s*=\s*resolve\s*\(\s*__dirname\s*(?:,\s*['"]\.\.['"]){1,3}\s*\)/.test(contents);

        // Conditional D-5 form: __dirname.includes('/build/') ? resolve(..., '..', '..', '..') : resolve(..., '..', '..')
        const conditionalModuleConst = /const\s+PROJECT_ROOT\s*=\s*__dirname\.includes\s*\(\s*['"]\/build\/['"]\s*\)\s*\?\s*resolve\s*\(\s*__dirname\s*(?:,\s*['"]\.\.['"]){1,3}\s*\)\s*:\s*resolve\s*\(\s*__dirname\s*(?:,\s*['"]\.\.['"]){1,3}\s*\)/.test(contents);
        const conditionalLocalVar = /(?:const|let)\s+projectRoot\s*=\s*__dirname\.includes\s*\(\s*['"]\/build\/['"]\s*\)\s*\?\s*resolve\s*\(\s*__dirname\s*(?:,\s*['"]\.\.['"]){1,3}\s*\)\s*:\s*resolve\s*\(\s*__dirname\s*(?:,\s*['"]\.\.['"]){1,3}\s*\)/.test(contents);

        expect(directModuleConst || directLocalVar || conditionalModuleConst || conditionalLocalVar).toBe(true);
      });

      it('D-5 conditional: uses __dirname.includes("/build/") discriminator', () => {
        // After D-5, every file must detect the build layout via __dirname.includes('/build/')
        // so the same source compiles to both src and build without path mismatch.
        expect(contents).toMatch(/__dirname\.includes\s*\(\s*['"]\/build\/['"]\s*\)/);
      });

      it('D-5 conditional: 3-layer resolve branch targets build layout', () => {
        // wrapper/build/dsh/foo.js → wrapper/build/dsh → wrapper/build → wrapper → fish-harness/
        // That's 3 ".." segments. The build branch must use 3 layers.
        const threeLayerBuild = /resolve\s*\(\s*__dirname\s*,\s*['"]\.\.['"]\s*,\s*['"]\.\.['"]\s*,\s*['"]\.\.['"]\s*\)/.test(contents);
        expect(threeLayerBuild).toBe(true);
      });
    });
  }
});