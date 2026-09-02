/**
 * dsh_client.ts — dsh CLI wrapper (M1c real implementation).
 *
 * Calls `dsh --profile headless --patch <base> --patch <role> -- <prompt>`.
 * DEEPSEEK_API_KEY is injected via process.env (NOT hardcoded).
 *
 * Uses model class from DshOpts to select the appropriate profile override.
 * Does NOT lock to a specific model — model is set by the --patch YAML files.
 *
 * Profile semantics (confirmed by BE-1/TG-1/DO-1):
 *   headless = CLI single-turn task → answer, print, exit
 *   web      = Web UI server (DO NOT USE in M1c wrapper)
 *
 * @file wrapper/dsh/dsh_client.ts
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import {
  type DshOpts,
  type DshResponse,
  type DshInvokeOptions,
  type ModelClass,
  PROFILE_YAML_MAP,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute path to the project root. Resolution: `process.cwd()` is the wrapper/ directory (vitest default + npm run build), so one `..` reaches the fish-harness project root containing docs/m0b/. This avoids `import.meta.dirname` ambiguity between src (wrapper/dsh/) and build (wrapper/build/dsh/). */
const PROJECT_ROOT = resolve(process.cwd(), '..');

/** dsh base profile override — enables A-class tools. */
const BASE_PATCH = resolve(PROJECT_ROOT, 'docs', 'm0b', 'profile-override-base.yaml');

/** Default timeouts per model class (ms). */
const DEFAULT_TIMEOUT_MS: Record<ModelClass, number> = {
  orch: 300_000,    // 5 min — high-reasoning cross-project decisions
  commander: 180_000, // 3 min — mid-context single-workflow changes
  worker: 60_000,    // 1 min — low-cost batch summaries
};

/** Known denial patterns from dsh output. */
const DENIAL_PATTERNS = [
  /cannot complete|unable to|not possible|does not contain|error/i,
  /permission denied|forbidden|blocked/i,
  /refused|declined/i,
];

/** JSON wrapper patterns for extracting trace_id / token usage. */
const TRACE_ID_RE = /"trace_id"\s*:\s*"([^"]+)"/;
const TOKEN_USAGE_RE = /token[_\s]?usage.*?(\d+).*?(\d+)/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a denial reason from dsh stdout/stderr.
 * Returns undefined if no denial pattern matches.
 */
function parseDenialReason(stdout: string, stderr: string): string | undefined {
  const combined = `${stdout}\n${stderr}`;
  for (const pat of DENIAL_PATTERNS) {
    const match = combined.match(pat);
    if (match) return match[0].trim();
  }
  return undefined;
}

/**
 * Parse trace_id and token usage from dsh stdout.
 */
function parseDshMetadata(stdout: string): { traceId?: string; tokenUsage?: DshResponse['tokenUsage'] } {
  const traceMatch = stdout.match(TRACE_ID_RE);
  const tokenMatch = stdout.match(TOKEN_USAGE_RE);

  return {
    traceId: traceMatch?.[1],
    tokenUsage: tokenMatch
      ? { inputTokens: parseInt(tokenMatch[1], 10), outputTokens: parseInt(tokenMatch[2], 10) }
      : undefined,
  };
}

/**
 * Resolve a relative path (from PROFILE_YAML_MAP) to an absolute path.
 */
function resolveProfilePath(modelClass: ModelClass): string {
  const rel = PROFILE_YAML_MAP[modelClass];
  return resolve(PROJECT_ROOT, rel);
}

/**
 * Build the dsh CLI argument list for a given model class + prompt.
 *
 * Stack order (last --patch wins):
 *   1. BASE_PATCH       — enables A-class tools (bash/fs/goal/ralph)
 *   2. role PATCH       — sets model (orch → deepseek-v4-pro / commander/worker → deepseek-v4-flash)
 *
 * Env DEEPSEEK_API_KEY is injected at spawn time (NOT in the CLI args).
 */
function buildArgs(
  modelClass: ModelClass,
  prompt: string,
  extraArgs?: string[],
): string[] {
  const rolePatch = resolveProfilePath(modelClass);
  return [
    '--profile', 'headless',
    '--patch', BASE_PATCH,
    '--patch', rolePatch,
    '--',
    prompt,
    ...(extraArgs ?? []),
  ];
}

/**
 * Run a child process with a timeout using AbortController.
 * Returns the exit code (null if killed by timeout).
 */
function runWithTimeout(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      env: { ...process.env, ...env },
      // node 20+ AbortSignal timeout support
      signal: AbortSignal.timeout(timeoutMs),
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    proc.on('error', (err) => {
      // AbortError means SIGKILL from AbortSignal.timeout
      if (err.name === 'AbortError') {
        proc.kill();
        resolve({ stdout, stderr: `${stderr}\n[timeout after ${timeoutMs}ms]`, exitCode: null });
      } else {
        resolve({ stdout, stderr: `${stderr}\n[error: ${err.message}]`, exitCode: 1 });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call dsh CLI with real invocation (env-inject DEEPSEEK_API_KEY).
 *
 * @param prompt   - task prompt sent to dsh
 * @param opts     - call options (modelClass required)
 * @returns DshResponse with stdout/stderr/exitCode/wallMs/traceId/tokenUsage
 *
 * Security notes:
 *   - DEEPSEEK_API_KEY is injected via process.env (never in CLI args)
 *   - No API key is written to any file
 *   - No specific model is hardcoded (model selected by --patch YAML)
 */
export async function callDshHeadless(
  prompt: string,
  opts?: DshOpts,
): Promise<DshResponse> {
  const modelClass: ModelClass = opts?.modelClass ?? 'commander';
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS[modelClass];
  const startMs = Date.now();

  // Read DEEPSEEK_API_KEY from env (never hardcode)
  const apiKey = opts?.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const envInject: NodeJS.ProcessEnv = apiKey
    ? { DEEPSEEK_API_KEY: apiKey }
    : {};

  if (process.env['DEBUG_DSH_SPAWN']) {
    console.log(`[dsh_client] key_len=${(apiKey ?? '').length} modelClass=${modelClass} timeoutMs=${timeoutMs}`);
  }

  const args = buildArgs(modelClass, prompt, opts?.extraArgs);

  const { stdout, stderr, exitCode: rawExitCode } = await runWithTimeout(
    'dsh',
    args,
    envInject,
    timeoutMs,
  );

  const wallMs = Date.now() - startMs;
  const exitCode = rawExitCode ?? 124; // 124 = timeout exit code convention

  const { traceId, tokenUsage } = parseDshMetadata(stdout);
  const denialReason = exitCode !== 0
    ? parseDenialReason(stdout, stderr)
    : undefined;

  return {
    stdout,
    stderr,
    exitCode,
    wallMs,
    traceId,
    tokenUsage,
    denialReason,
  };
}

/**
 * Convenience wrapper: call dsh with explicit DshInvokeOptions.
 * Preferred entry point for tool_provider.ts.
 */
export async function dshInvoke(options: DshInvokeOptions): Promise<DshResponse> {
  return callDshHeadless(options.prompt, {
    modelClass: options.modelClass,
    timeoutMs: options.timeoutMs,
    extraArgs: options.extraArgs,
  });
}

/**
 * Stub: call dsh via HTTP (alternative to CLI).
 * Not implemented in M1c (CLI only).
 */
export async function callDshHttp(
  _prompt: string,
  _opts?: DshOpts,
): Promise<DshResponse> {
  throw new Error('callDshHttp: HTTP mode not implemented in M1c (CLI only)');
}
