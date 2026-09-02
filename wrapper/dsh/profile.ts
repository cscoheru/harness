/**
 * profile.ts — Load and resolve dsh profile override YAML files.
 *
 * Reads docs/m0b/profile-override-{orch,commander,worker}.yaml for each
 * model class, parses them as YAML, and returns a Profile object.
 *
 * Profile resolution order:
 *   1. docs/m0b/profile-override-base.yaml   — enables A-class tools
 *   2. docs/m0b/profile-override-<role>.yaml — sets model (orch/commander/worker)
 *
 * The base patch is always applied first; the role patch second (last wins).
 *
 * @file wrapper/dsh/profile.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  type Profile,
  type ProfileOverride,
  type ModelClass,
  PROFILE_YAML_MAP,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Absolute path to the project root.
 *
 * Resolution: `process.cwd()` is the wrapper/ directory (vitest default + npm run build),
 * so one `..` reaches the fish-harness project root containing docs/m0b/.
 *
 * This avoids `import.meta.dirname` ambiguity between src (wrapper/dsh/) and build (wrapper/build/dsh/).
 */
const PROJECT_ROOT = resolve(process.cwd(), '..');

/** dsh base profile override — enables A-class tools. */
export const BASE_PATCH_PATH = resolve(PROJECT_ROOT, 'docs', 'm0b', 'profile-override-base.yaml');

/** Per-class default timeouts (ms). */
export const DEFAULT_TIMEOUT_MS: Record<ModelClass, number> = {
  orch: 300_000,
  commander: 180_000,
  worker: 60_000,
};

// ---------------------------------------------------------------------------
// YAML parsing (stdlib — no yaml library dependency)
// ---------------------------------------------------------------------------

/**
 * Minimal YAML parser for the dsh profile override format.
 *
 * dsh profile YAML is a flat list of:
 *   - id: <string>
 *     config:
 *       <key>: <value>
 *     disabled: <bool>
 *
 * We only need the `id` and `config` top-level keys for validation.
 * This parser handles the subset needed by profile-override-*.yaml files.
 *
 * Known limitations (safe for this use case):
 *   - Does not handle anchors/aliases (&foo, *foo)
 *   - Does not handle multi-line strings (| / >)
 *   - Does not handle comments mixed with values on the same line
 *
 * For full YAML 1.2 compliance use js-yaml.
 */
function parseProfileYaml(raw: string): ProfileOverride[] {
  const entries: ProfileOverride[] = [];
  const lines = raw.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    // Top-level key must start with `- id:` (list item)
    const idMatch = line.match(/^(\s*)-\s+id:\s*"?([^"\n]+)"?\s*$/);
    if (idMatch) {
      const entry: ProfileOverride = { id: idMatch[2].trim() };

      // Look ahead for `config:` and `disabled:` blocks
      const baseIndent = idMatch[1].length;
      let j = i + 1;

      while (j < lines.length) {
        const nextLine = lines[j];

        // Less-indented or blank = end of this entry
        const nextIndent = nextLine.match(/^(\s*)/)?.[1].length ?? 0;
        if (nextLine.trim() !== '' && nextIndent <= baseIndent) break;

        const configMatch = nextLine.match(/^\s+config:\s*$/);
        if (configMatch) {
          entry.config = {};
          const configIndent = nextLine.search(/\S/);
          j++;

          while (j < lines.length) {
            const kvLine = lines[j];
            const kvIndent = kvLine.match(/^(\s*)/)?.[1].length ?? 0;
            if (kvLine.trim() === '' || kvIndent <= configIndent) break;

            const keyValMatch = kvLine.match(/^\s+(\w[\w-]*):\s*(.+)$/);
            if (keyValMatch) {
              const [, key, valRaw] = keyValMatch;
              // Strip quotes
              const val = valRaw.replace(/^["']|["']$/g, '').trim();
              entry.config![key] = val;
            }
            j++;
          }
          continue;
        }

        const disabledMatch = nextLine.match(/^\s+disabled:\s*(.+)$/);
        if (disabledMatch) {
          entry.disabled = disabledMatch[1].trim() === 'true';
          j++;
          continue;
        }

        j++;
      }

      entries.push(entry);
      i = j;
      continue;
    }

    // Non-entry top-level line (e.g. blank continuation) — skip
    i++;
  }

  return entries;
}

/**
 * Validate that a profile YAML contains at minimum an `id` field.
 * Logs a warning for entries missing required fields.
 */
function validateProfileOverrides(overrides: ProfileOverride[]): void {
  for (const entry of overrides) {
    if (!entry.id) {
      console.warn(`[profile] Warning: profile override entry missing 'id': ${JSON.stringify(entry)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and resolve the full profile for a given model class.
 *
 * @param modelClass - orch | commander | worker
 * @returns Profile with patches array and raw YAML strings
 *
 * @example
 *   const profile = await loadProfile('orch');
 *   // profile.patches === [base_yaml_path, orch_yaml_path]
 */
export function loadProfile(modelClass: ModelClass): Profile {
  const basePath = BASE_PATCH_PATH;
  const rolePath = resolve(PROJECT_ROOT, PROFILE_YAML_MAP[modelClass]);

  const baseRaw = readFileSync(basePath, 'utf-8');
  const roleRaw = readFileSync(rolePath, 'utf-8');

  const baseOverrides = parseProfileYaml(baseRaw);
  const roleOverrides = parseProfileYaml(roleRaw);

  validateProfileOverrides(baseOverrides);
  validateProfileOverrides(roleOverrides);

  return {
    modelClass,
    patches: [basePath, rolePath],
    patchesRaw: [baseRaw, roleRaw],
    timeoutMs: DEFAULT_TIMEOUT_MS[modelClass],
  };
}

/**
 * Load all three profiles (orch, commander, worker).
 * Useful for tool_provider.ts to pre-load all capabilities.
 */
export function loadAllProfiles(): Record<ModelClass, Profile> {
  return {
    orch: loadProfile('orch'),
    commander: loadProfile('commander'),
    worker: loadProfile('worker'),
  };
}

/**
 * Get the role-specific patch path for a model class.
 */
export function getRolePatchPath(modelClass: ModelClass): string {
  return resolve(PROJECT_ROOT, PROFILE_YAML_MAP[modelClass]);
}
