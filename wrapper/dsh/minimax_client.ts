/** @file wrapper/dsh/minimax_client.ts */

/**
 * MiniMax HTTP API direct caller — replaces deepseek_client.ts.
 *
 * Per v1.2.0k.4 cycle (planned): swap DeepSeek for MiniMax M3 to
 * reduce per-token cost. MiniMax offers an OpenAI-compatible chat
 * completions API, so the request/response shape is structurally
 * identical to deepseek_client.ts — differences are limited to:
 *   - base URL:   https://api.minimaxi.com/v1  (China region)
 *   - auth:       Bearer ${MINIMAX_API_KEY}    (was DEEPSEEK_API_KEY)
 *   - model:      MiniMax-M3                   (1M context, agentic)
 *   - extra:      response may include a <think>...</think> reasoning
 *                 block BEFORE the actual content (M3 chain-of-thought
 *                 by default). We strip it from stdout so downstream
 *                 consumers see a clean answer.
 *
 * M3 also supports prompt caching (visible in `usage.prompt_tokens_details
 * .cached_tokens`). We log this for cost visibility but do not act on it.
 *
 * Retry-After handling: 429 responses trigger exponential backoff (max 3 retries).
 *
 * Endpoint override: set MINIMAX_ENDPOINT to redirect to a different base URL
 * (useful for global region `https://api.minimax.io/v1` or self-hosted gateway).
 *
 * Security: MINIMAX_API_KEY is read from process.env only (never hardcoded).
 * Key fingerprint logged once at module init (per v1.2.0e.1 D8 pattern).
 */

import type { DshOpts, DshResponse, ModelClass } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default timeouts per model class (ms) — mirror deepseek_client. */
const DEFAULT_TIMEOUT_MS: Record<ModelClass, number> = {
  orch: 300_000,      // 5 min — high-reasoning cross-project decisions
  commander: 180_000, // 3 min — mid-context single-workflow changes
  worker: 60_000,     // 1 min — low-cost batch summaries
};

/**
 * Role-default models (all roles use MiniMax-M3 for v1.2.0k.4+).
 * M3 handles all three tiers (orch / commander / worker) with acceptable
 * latency; the per-role model split from deepseek_client is dropped
 * because M3's quality is uniform across tiers.
 *
 * Override at call time via MINIMAX_MODEL env var.
 */
export const ROLE_DEFAULT_MODEL: Record<ModelClass, string> = {
  orch: 'MiniMax-M3',
  commander: 'MiniMax-M3',
  worker: 'MiniMax-M3',
};

/** Maximum retry attempts for 429 responses. */
const MAX_RETRIES = 3;

/** Regex to strip M3's leading chain-of-thought block from content. */
const THINK_BLOCK_RE = /^<think>[\s\S]*?<\/think>\s*/;

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the model string for a given model class.
 *
 * Precedence (highest first):
 *   1. MINIMAX_MODEL env var — direct override, wins over everything
 *   2. role default           — all three tiers default to MiniMax-M3
 */
export function resolveModelOverride(modelClass: ModelClass): string {
  if (process.env.MINIMAX_MODEL) return process.env.MINIMAX_MODEL!;
  return ROLE_DEFAULT_MODEL[modelClass];
}

// ---------------------------------------------------------------------------
// Core invocation
// ---------------------------------------------------------------------------

/**
 * Call the MiniMax Chat Completions API directly via fetch().
 *
 * @param prompt  - user message content
 * @param opts    - call options (modelClass determines model/timeout)
 * @returns DshResponse-compatible object
 */
export async function minimaxInvoke(
  prompt: string,
  opts?: DshOpts,
): Promise<DshResponse> {
  const modelClass: ModelClass = opts?.modelClass ?? 'commander';
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS[modelClass];
  const apiKey = opts?.apiKey ?? process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    throw new Error('minimaxInvoke: MINIMAX_API_KEY is not set');
  }

  const model = resolveModelOverride(modelClass);
  const baseUrl = process.env.MINIMAX_ENDPOINT ?? 'https://api.minimaxi.com';
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
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          prompt_tokens_details?: { cached_tokens?: number };
        };
        id?: string;
      };

      const wallMs = Date.now() - startMs;
      // Strip M3's leading <think>...</think> block so stdout is clean
      const rawContent = json.choices?.[0]?.message?.content ?? '';
      const stdout = rawContent.replace(THINK_BLOCK_RE, '');

      // Log cache hit for cost visibility (one line per call)
      const cached = json.usage?.prompt_tokens_details?.cached_tokens;
      if (cached && cached > 0) {
        console.log(`[minimax] prompt cache hit: ${cached} tokens (savings ~75%)`);
      }

      return {
        stdout,
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
        throw new Error(`minimaxInvoke: 429 after ${MAX_RETRIES} retries — ${text}`);
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
    throw new Error(`minimaxInvoke: HTTP ${res.status} — ${text}`);
  }

  // Unreachable — MAX_RETRIES loop always throws or returns
  throw new Error('minimaxInvoke: unexpected loop exit');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * v1.2.0k.4 NEW: log a non-secret fingerprint of the MiniMax API key
 * at module init time. Mirrors v1.2.0e.1 D8 deepseek fingerprint
 * pattern (slice(0,7) only exposes vendor prefix + length, not secret).
 *
 * If MINIMAX_API_KEY is missing, log an error (not throw — let the
 * caller decide whether to abort based on context).
 */
export function logMinimaxKeyFingerprint(): void {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) {
    console.error('[minimax] FATAL: MINIMAX_API_KEY missing');
    return;
  }
  const key_prefix = key.slice(0, 7);
  const key_len = key.length;
  console.log(`[minimax] key_prefix=${key_prefix}... key_len=${key_len}`);
}

// Auto-run at module init — runs once when minimax_client is first imported.
// Gated by an idempotent flag so test imports that have already evaluated
// the module don't re-log on each test.
let _keyFingerprintLogged = false;
function _maybeLogKeyFingerprint(): void {
  if (_keyFingerprintLogged) return;
  _keyFingerprintLogged = true;
  logMinimaxKeyFingerprint();
}
_maybeLogKeyFingerprint();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
