/**
 * dsh_client.ts — legacy dsh CLI wrapper (DEPRECATED v1.2.0d).
 *
 * The spawn-binary path is deprecated. Use `deepseek_client.ts#deepseekInvoke`
 * instead — it calls DeepSeek's OpenAI-compatible HTTP API directly with
 * env-injected DEEPSEEK_API_KEY, bypassing the dsh binary (which 0.1.1-rc.2
 * only ships a web profile, no headless CLI). This file is preserved for
 * backward compatibility via the `callDshHeadless = deepseekInvoke` re-export
 * at the bottom. `resolveModelOverride` is retained as the cost-mode resolver
 * used by deepseek_client.ts.
 *
 * Profile semantics (historical):
 *   headless = CLI single-turn task → answer, print, exit
 *   web      = Web UI server (DO NOT USE in M1c wrapper)
 *
 * v1.2.0d NEW: the legacy spawn-binary path is DEPRECATED.
 *
 * Migration path:
 *   - Replace `import { callDshHeadless } from '../dsh/dsh_client.js'`
 *     with `import { deepseekInvoke } from '../dsh/deepseek_client.js'`
 *   - Rename call sites: callDshHeadless(prompt, opts) → deepseekInvoke(prompt, opts)
 *   - The DshResponse shape is identical — no caller logic changes
 *
 * @file wrapper/dsh/dsh_client.ts
 * @deprecated Since v1.2.0d (D16). Use deepseek_client.ts.
 */

import {
  type ModelClass,
} from './types.js';

/**
 * Role-default models per class (mirrors docs/m0b/profile-override-{orch,commander,worker}.yaml).
 * Used only by the cost-mode resolver to decide when a model override is needed;
 * the authoritative selection stays in the role patch yamls when no override applies.
 */
const ROLE_DEFAULT_MODEL: Record<ModelClass, string> = {
  orch: 'deepseek-v4-pro',        // high-reasoning tier (profile-override-orch.yaml)
  commander: 'deepseek-v4-flash', // mid-context tier (profile-override-commander.yaml)
  worker: 'deepseek-v4-flash',    // low-cost batch tier (profile-override-worker.yaml)
};

/** Target model for DEEPSEEK_COST_MODE=cheap downgrades (cost-optimal text model). */
const CHEAP_MODEL = 'deepseek-v4-flash';

/**
 * Resolve a model override for a model class.
 *
 * Precedence (highest first):
 *   1. DSH_MODEL          — direct override, wins over everything
 *   2. DEEPSEEK_COST_MODE — 'full' keeps role-patch defaults (orch stays v4-pro);
 *                           'cheap' (default) downgrades every class to v4-flash
 *
 * Returns undefined when the role patch already selects the wanted model, so
 * commander/worker args are unchanged in cheap mode (zero behavior drift).
 */
export function resolveModelOverride(modelClass: ModelClass): string | undefined {
  if (process.env.DSH_MODEL) return process.env.DSH_MODEL;
  const mode = process.env.DEEPSEEK_COST_MODE ?? 'cheap';
  if (mode !== 'cheap') return undefined;
  return ROLE_DEFAULT_MODEL[modelClass] === CHEAP_MODEL ? undefined : CHEAP_MODEL;
}

/**
 * @deprecated Since v1.2.0d (D16). Legacy spawn-binary arg builder. No callers
 * after v1.2.0d — deepseek_client.ts handles model override via HTTP request
 * body, not CLI args. Kept exported only for historical import resolution;
 * use `resolveModelOverride` instead for any cost-mode / override decisions.
 */
export function buildArgs(
  _modelClass: ModelClass,
  _prompt: string,
  _extraArgs?: string[],
): string[] {
  return [];
}

// ---------------------------------------------------------------------------
// Public API (DEPRECATED since v1.2.0d D16)
// ---------------------------------------------------------------------------
// All public exports below are legacy shims. New code MUST import from
// `deepseek_client.ts` directly. The re-export at the bottom preserves
// backward compatibility for any code path that still imports `callDshHeadless`.

// ─── Backward-compat re-export (v1.2.0d) ─────────────────────────────────
// v1.2.0d: dsh binary spawn is deprecated (per D16). Existing callers
// that still import callDshHeadless get deepseekInvoke under the same
// name so they compile without changes. New code should import
// deepseekInvoke directly from deepseek_client.ts.
export { deepseekInvoke as callDshHeadless } from './deepseek_client.js';
