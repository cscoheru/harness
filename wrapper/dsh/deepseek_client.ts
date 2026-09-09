/** @file wrapper/dsh/deepseek_client.ts */

/**
 * DeepSeek HTTP API direct caller — replaces dsh binary spawn.
 *
 * Per v1.2.0d D16/D17 decision: the harness replaces dsh CLI with a direct
 * OpenAI-compatible HTTP call to `https://api.deepseek.com/v1/chat/completions`.
 *
 * Model selection (resolveModelOverride, three role defaults):
 *   orch      → deepseek-v4-pro      (high-reasoning tier)
 *   commander → deepseek-v4-flash    (mid-context tier)
 *   worker    → deepseek-v4-flash    (low-cost batch tier)
 *
 * Cost-mode behavior:
 *   DEEPSEEK_COST_MODE=cheap (default) — all roles use v4-flash
 *   DEEPSEEK_COST_MODE=full          — roles use their yaml defaults (orch → v4-pro)
 *   DSH_MODEL env var overrides everything
 *
 * Retry-After handling: 429 responses trigger exponential backoff (max 3 retries).
 *
 * Endpoint override: set DEEPSEEK_ENDPOINT to redirect to a different base URL.
 *
 * Security: DEEPSEEK_API_KEY is read from process.env only (never hardcoded).
 */

import type { DshOpts, DshResponse, ModelClass } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default timeouts per model class (ms). */
const DEFAULT_TIMEOUT_MS: Record<ModelClass, number> = {
  orch: 300_000,      // 5 min — high-reasoning cross-project decisions
  commander: 180_000, // 3 min — mid-context single-workflow changes
  worker: 60_000,     // 1 min — low-cost batch summaries
};

/**
 * Role-default models (mirrors docs/m0b/profile-override-{orch,commander,worker}.yaml).
 * These are the yaml-patch-selected models; overridden by cost mode / DSH_MODEL.
 */
/**
 * Role-default models (mirrors docs/m0b/profile-override-{orch,commander,worker}.yaml).
 * These are the yaml-patch-selected models; overridden by cost mode / DSH_MODEL.
 * Re-exported for test introspection of the source of truth; callers should use
 * `resolveModelOverride` instead.
 */
export const ROLE_DEFAULT_MODEL: Record<ModelClass, string> = {
  orch: 'deepseek-v4-pro',        // high-reasoning tier
  commander: 'deepseek-v4-flash', // mid-context tier
  worker: 'deepseek-v4-flash',    // low-cost batch tier
};

/** Target model for DEEPSEEK_COST_MODE=cheap downgrades. */
const CHEAP_MODEL = 'deepseek-v4-flash';

/** Maximum retry attempts for 429 responses. */
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the model string for a given model class.
 *
 * Precedence (highest first):
 *   1. DSH_MODEL          — direct override, wins over everything
 *   2. DEEPSEEK_COST_MODE — 'full' keeps role-patch defaults (orch stays v4-pro);
 *                           'cheap' (default) downgrades every class to v4-flash
 */
export function resolveModelOverride(modelClass: ModelClass): string {
  if (process.env.DSH_MODEL) return process.env.DSH_MODEL!;
  const mode = process.env.DEEPSEEK_COST_MODE ?? 'cheap';
  if (mode !== 'cheap') return ROLE_DEFAULT_MODEL[modelClass];
  // cheap: only override if the role default is NOT already the cheap model
  return ROLE_DEFAULT_MODEL[modelClass] === CHEAP_MODEL
    ? CHEAP_MODEL
    : CHEAP_MODEL;
}

// ---------------------------------------------------------------------------
// Core invocation
// ---------------------------------------------------------------------------

/**
 * Call the DeepSeek Chat Completions API directly via fetch().
 *
 * @param prompt  - user message content
 * @param opts    - call options (modelClass determines model/timeout)
 * @returns DshResponse compatible object
 */
export async function deepseekInvoke(
  prompt: string,
  opts?: DshOpts,
): Promise<DshResponse> {
  const modelClass: ModelClass = opts?.modelClass ?? 'commander';
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS[modelClass];
  const apiKey = opts?.apiKey ?? process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('deepseekInvoke: DEEPSEEK_API_KEY is not set');
  }

  const model = resolveModelOverride(modelClass);
  const baseUrl = process.env.DEEPSEEK_ENDPOINT ?? 'https://api.deepseek.com';
  const url = `${baseUrl}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  };

  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    const startMs = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // AbortError from AbortSignal.timeout
      if (err instanceof DOMException && err.name === 'AbortError') {
        return {
          stdout: '',
          stderr: `[timeout after ${timeoutMs}ms]`,
          exitCode: 124,
          wallMs: Date.now() - startMs,
        };
      }
      throw err;
    }

    if (res.ok) {
      const json = await res.json() as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
        id?: string;
      };

      const wallMs = Date.now() - startMs;
      return {
        stdout: json.choices?.[0]?.message?.content ?? '',
        stderr: '',
        exitCode: 0,
        wallMs,
        traceId: json.id,
        tokenUsage: {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
        },
      };
    }

    if (res.status === 429) {
      attempt++;
      if (attempt > MAX_RETRIES) {
        const text = await res.text().catch(() => '');
        throw new Error(`deepseekInvoke: 429 after ${MAX_RETRIES} retries — ${text}`);
      }
      const retryAfter = res.headers.get('Retry-After');
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
      await sleep(delayMs);
      continue;
    }

    // Non-2xx, non-429
    const text = await res.text().catch(() => '');
    throw new Error(`deepseekInvoke: HTTP ${res.status} — ${text}`);
  }

  // Unreachable — MAX_RETRIES loop always throws or returns
  throw new Error('deepseekInvoke: unexpected loop exit');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * v1.2.0e.1 NEW (per D8 + F46): log a non-secret fingerprint of the API key
 * at module init time. Helps triage env drift between compose profiles
 * (e.g., puer-hk container's env showed sk-347b9b09... while the real key
 * is sk-3f55470...; finding this took an env grep across containers).
 *
 * NEVER log the full key or any prefix > 7 chars. `slice(0,7)` only exposes
 * the vendor prefix + first few chars (e.g., "sk-3f55") — not enough to
 * reconstruct the secret. Length is non-sensitive.
 */
export function logDeepseekKeyFingerprint(): void {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    console.error('[deepseek] FATAL: DEEPSEEK_API_KEY missing');
    return;
  }
  const key_prefix = key.slice(0, 7);
  const key_len = key.length;
  console.log(`[deepseek] key_prefix=${key_prefix}... key_len=${key_len}`);
}

// Auto-run at module init — runs once when deepseek_client is first imported.
// Gated by an idempotent flag so test imports that have already evaluated
// the module don't re-log on each test.
let _keyFingerprintLogged = false;
function _maybeLogKeyFingerprint(): void {
  if (_keyFingerprintLogged) return;
  _keyFingerprintLogged = true;
  logDeepseekKeyFingerprint();
}
_maybeLogKeyFingerprint();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
