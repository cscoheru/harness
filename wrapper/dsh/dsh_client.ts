/**
 * dsh_client.ts — dsh CLI wrapper (TypeScript skeleton).
 *
 * Calls dsh via CLI (`dsh --profile headless`, NOT web).
 * Profile headless is the CLI single-turn mode; web is the Web UI server.
 * (Confirmed by BE-1/TG-1/DO-1 three-agent independent discovery.)
 *
 * Does NOT hardcode any API key. Caller must inject:
 *   process.env.DEEPSEEK_API_KEY
 *
 * Does NOT lock to a specific model. Uses model class from DshOpts
 * to select the appropriate profile override.
 *
 * @file wrapper/dsh/dsh_client.ts
 */

import { spawn } from 'child_process';
import type { DshOpts, DshResponse } from './types.js';

/**
 * Stub: calls `dsh --profile headless` with a prompt.
 *
 * @param prompt - user/system prompt string
 * @param opts   - call options (modelClass, timeoutMs, etc.)
 * @returns DshResponse with stdout/stderr/exitCode/wallMs
 *
 * TODO (M0c skeleton — not implemented):
 *   - Load profile override YAML for the given modelClass (orch/commander/worker)
 *   - Pass DEEPSEEK_API_KEY via env (not hardcoded)
 *   - Handle timeout cancellation
 *   - Parse dsh JSON output if --json flag is used
 *   - Map dsh exit codes to DshResponse.denialReason
 */
export async function callDshHeadless(
  prompt: string,
  opts?: DshOpts,
): Promise<DshResponse> {
  const startMs = Date.now();
  const timeoutMs = opts?.timeoutMs ?? 120_000;

  // TODO: Resolve profile override path based on opts.modelClass
  // e.g. profile = opts.modelClass === 'commander'
  //          ? 'docs/m0b/profile-override-commander.yaml'
  //          : 'docs/m0b/profile-override-orch.yaml';

  // TODO: Inject DEEPSEEK_API_KEY via env (placeholder — never hardcode)
  // const env = { ...process.env, DEEPSEEK_API_KEY: opts?.apiKey ?? process.env.DEEPSEEK_API_KEY };

  return new Promise((resolve) => {
    // Stub: spawn dsh --profile headless (NOT web)
    const proc = spawn('dsh', [
      '--profile', 'headless', // CLI mode, not web UI
      '--',                   // prompt separator
      prompt,
    ], {
      // TODO: uncomment when implementing
      // env,
      timeout: timeoutMs,
      signal: undefined as unknown as AbortSignal, // placeholder
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
        wallMs: Date.now() - startMs,
      });
    });

    proc.on('error', (err) => {
      resolve({
        stdout,
        stderr: `${stderr}\n${err.message}`,
        exitCode: 1,
        wallMs: Date.now() - startMs,
      });
    });

    // TODO: implement timeout cancellation via AbortController
  });
}

/**
 * Stub: call dsh via HTTP (alternative to CLI).
 * Not implemented in M0c skeleton.
 */
export async function callDshHttp(
  prompt: string,
  opts?: DshOpts,
): Promise<DshResponse> {
  // TODO (M0c skeleton):
  //   - Build HTTP POST to dsh HTTP endpoint
  //   - Authenticate with DEEPSEEK_API_KEY in Authorization header
  //   - Return parsed JSON response
  throw new Error('callDshHttp: not implemented in M0c skeleton');
}
