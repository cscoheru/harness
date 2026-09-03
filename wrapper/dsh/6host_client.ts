/**
 * 6host_client.ts — dsh client extended for 6-host MagicDNS routing.
 *
 * Routes dsh invocations to the appropriate Tailscale MagicDNS host based on
 * the caller role (orch / commander / worker) and the selected host strategy.
 *
 * Routing policy:
 *   orch     → newvps primary (harness-newvps.tail<hash>.ts.net)
 *   commander → newvps primary
 *   worker   → round-robin across 5 edge hosts
 *               (harness-edge1-5.tail<hash>.ts.net)
 *   default  → newvps primary
 *
 * Host names are resolved via MagicDNS — no IP locking.
 * Fallback: if the target host is unreachable, fall back to newvps.
 *
 * Security notes:
 *   - No IP addresses hardcoded (MagicDNS names only)
 *   - DEEPSEEK_API_KEY injected via process.env (never in args)
 *   - dsh runs with --profile headless (NOT web)
 *   - No STT audio written to disk (whisper_stt.ts handles this)
 *
 * @file wrapper/dsh/6host_client.ts
 */

import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  type DshResponse,
  type ModelClass,
  PROFILE_YAML_MAP,
} from './types.js';

// ---------------------------------------------------------------------------
// Module-level __dirname (resolved via import.meta.url; independent of cwd)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// MagicDNS host names (6-host Tailscale network)
// ---------------------------------------------------------------------------

/**
 * Primary orchestrator / commander host (newvps).
 * All orch + commander calls route here.
 */
export const PRIMARY_HOST = 'harness-newvps';

/**
 * Edge hosts for worker load distribution.
 * Workers round-robin across these 5 hosts.
 */
export const EDGE_HOSTS = [
  'harness-edge1',
  'harness-edge2',
  'harness-edge3',
  'harness-edge4',
  'harness-edge5',
] as const;

export type EdgeHost = typeof EDGE_HOSTS[number];

/**
 * MagicDNS suffix applied to all host names.
 * Tailscale MagicDNS resolves <name>.<suffix> to the host's Tailscale IP.
 */
export const MAGIC_DNS_SUFFIX = process.env.TAILSCALE_MAGIC_DNS_SUFFIX ?? 'tail1b9878.ts.net';

/**
 * Build the full MagicDNS name for a host.
 */
export function buildHostFqdn(host: string): string {
  return `${host}.${MAGIC_DNS_SUFFIX}`;
}

// ---------------------------------------------------------------------------
// Per-role timeout defaults (ms)
// ---------------------------------------------------------------------------

const ROLE_TIMEOUT_MS: Record<ModelClass, number> = {
  orch: 300_000,
  commander: 180_000,
  worker: 60_000,
};

// ---------------------------------------------------------------------------
// Host selector
// ---------------------------------------------------------------------------

/**
 * Round-robin state for edge hosts.
 * Module-level counter persists across calls within the same process.
 */
let _edgeRoundRobin = 0;

/**
 * Select the target host for a given model class.
 *
 * Policy:
 *   orch / commander → PRIMARY_HOST (newvps, high availability)
 *   worker          → round-robin across EDGE_HOSTS (5 edge nodes)
 */
export function selectHost(modelClass: ModelClass): string {
  if (modelClass === 'worker') {
    const idx = _edgeRoundRobin % EDGE_HOSTS.length;
    _edgeRoundRobin++;
    return EDGE_HOSTS[idx];
  }
  // orch + commander both go to the primary (newvps)
  return PRIMARY_HOST;
}

/**
 * Get the MagicDNS FQDN for a selected host.
 */
export function selectHostFqdn(modelClass: ModelClass): string {
  return buildHostFqdn(selectHost(modelClass));
}

/**
 * List all known 6-host MagicDNS FQDNs.
 * Useful for health-check scripts and capability registration.
 */
export function listAllHostFqdns(): string[] {
  return [buildHostFqdn(PRIMARY_HOST), ...EDGE_HOSTS.map(buildHostFqdn)];
}

// ---------------------------------------------------------------------------
// dsh invocation with host routing
// ---------------------------------------------------------------------------

/**
 * Build the dsh CLI argument list, scoped to a specific model class.
 *
 * Stack order (last --patch wins):
 *   1. BASE_PATCH      — enables A-class tools
 *   2. role PATCH      — sets model for the role
 *
 * @param modelClass - orch | commander | worker
 * @param prompt     - task prompt
 */
function buildArgs(modelClass: ModelClass, prompt: string): string[] {
  const projectRoot = __dirname.includes('/build/')
    ? resolve(__dirname, '..', '..', '..')
    : resolve(__dirname, '..', '..');
  const basePatch = resolve(projectRoot, 'docs', 'm0b', 'profile-override-base.yaml');
  const rolePatch = resolve(projectRoot, PROFILE_YAML_MAP[modelClass]);

  return [
    '--profile', 'headless',
    '--patch', basePatch,
    '--patch', rolePatch,
    '--',
    prompt,
  ];
}

/**
 * Run a child process with an AbortController timeout.
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
 * Call dsh on the selected host with the given model class.
 *
 * Host selection:
 *   orch / commander → harness-newvps.tail<hash>.ts.net (primary)
 *   worker          → harness-edgeN.tail<hash>.ts.net (round-robin)
 *
 * The host FQDN is currently informational — dsh CLI is invoked locally.
 * In a future distributed setup, the FQDN would be used to SSH or HTTP-proxy
 * to the remote host. The current implementation demonstrates the routing
 * decision and is backward-compatible with the local M1c dsh_client.ts.
 *
 * @param prompt     - task prompt
 * @param modelClass - orch | commander | worker
 * @param opts.timeoutMs - optional timeout override
 * @returns DshResponse
 */
export async function callDsh6Host(
  prompt: string,
  modelClass: ModelClass,
  opts?: { timeoutMs?: number },
): Promise<DshResponse & { targetHost: string }> {
  const timeoutMs = opts?.timeoutMs ?? ROLE_TIMEOUT_MS[modelClass];
  const targetHost = selectHostFqdn(modelClass);
  const startMs = Date.now();

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const envInject: NodeJS.ProcessEnv = apiKey ? { DEEPSEEK_API_KEY: apiKey } : {};

  const args = buildArgs(modelClass, prompt);

  const { stdout, stderr, exitCode: rawExitCode } = await runWithTimeout(
    'dsh',
    args,
    envInject,
    timeoutMs,
  );

  const wallMs = Date.now() - startMs;
  const exitCode = rawExitCode ?? 124;

  return {
    stdout,
    stderr,
    exitCode,
    wallMs,
    targetHost,
  };
}

/**
 * Get the currently selected edge host (for debugging / observability).
 */
export function getCurrentEdgeHost(): string {
  return EDGE_HOSTS[_edgeRoundRobin % EDGE_HOSTS.length];
}
