/**
 * workflow_pack.ts — WorkflowPack real implementation (v1.2.0a NEW).
 *
 * Implements the WorkflowPack interface from types.ts:
 *   - loadManifest(packName): read workflow_packs/<name>.json + validate
 *     against PackManifest schema; falls back to a synthetic default manifest
 *     when the file does not exist.
 *   - plan(task): generate a PlanPlan (DAG of PlanSteps) by calling dsh with
 *     the commander profile (docs/m0b/profile-override-commander.yaml,
 *     model = deepseek-v4-flash, 60s timeout). On dsh failure or non-JSON
 *     output, falls back to a deterministic heuristic 1-step plan.
 *
 * The fallback path is critical: it keeps the wrapper usable in unit tests
 * and integration tests without requiring a real DEEPSEEK_API_KEY. Production
 * runs with the key set will use the dsh-generated path.
 *
 * Does NOT lock to a specific model. dsh profile YAML controls model selection.
 * DEEPSEEK_API_KEY injected via process.env (never hardcoded).
 *
 * @file wrapper/orchestrator/workflow_pack.ts
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callDshHeadless } from '../dsh/dsh_client.js';
import type {
  PackManifest,
  PackStep,
  PlanPlan,
  PlanStep,
  Task,
} from './types.js';

// ─── Config ────────────────────────────────────────────────────────────────────

/**
 * Directory containing workflow pack manifests (JSON files).
 *
 * Resolution order (v1.2.0a review M2 fix — matches the v0.7 §4.8
 * import.meta.url pattern used by the 4 dsh files, cwd-independent):
 *   1. WORKFLOW_PACKS_DIR env var (explicit override, e.g. compose)
 *   2. <project root>/workflow_packs derived from THIS FILE's location
 *      (wrapper/orchestrator/ → ../../workflow_packs), which stays correct
 *      regardless of process.cwd() — container working_dir, vitest, or src/build.
 *
 * Previously this was `resolve('workflow_packs')` (cwd-relative): inside the
 * container (working_dir=/app/wrapper) that resolves to
 * /app/wrapper/workflow_packs (nonexistent) → loadManifest silently fell back
 * to the synthetic default manifest on every call, so
 * workflow_packs/default.json was never actually loaded in production.
 */
const PACKS_DIR = resolve(
  process.env['WORKFLOW_PACKS_DIR'] ??
    resolve(dirname(fileURLToPath(import.meta.url)), '../../workflow_packs'),
);

/** Default timeout for dsh plan generation (commander profile: 60s). */
const PLAN_TIMEOUT_MS = 60_000;

/**
 * dsh is asked to output a JSON array of PackStep-shaped objects. We accept
 * either a bare array or an object with a `steps` key for resilience.
 */
const PLAN_JSON_RE = /\{[\s\S]*"steps"\s*:\s*\[[\s\S]*\][\s\S]*\}|\[[\s\S]*\{[\s\S]*"name"\s*:[\s\S]*\][\s\S]*\]/;

// ─── Manifest loading ──────────────────────────────────────────────────────────

/**
 * Load a PackManifest from workflow_packs/<name>.json.
 * Falls back to a synthetic default manifest when the file is missing,
 * so unknown pack names do not crash the dispatcher.
 */
export function loadManifest(packName: string): PackManifest {
  const path = resolve(PACKS_DIR, `${packName}.json`);
  if (!existsSync(path)) {
    console.warn(`[workflow_pack] pack "${packName}" not found at ${path}; using synthetic default manifest`);
    return syntheticManifest(packName);
  }
  const raw = readFileSync(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[workflow_pack] pack "${packName}" JSON parse failed: ${err}; using synthetic default`);
    return syntheticManifest(packName);
  }
  const manifest = parsed as PackManifest;
  if (!manifest.name || !manifest.version || !Array.isArray(manifest.required_capabilities)) {
    console.warn(`[workflow_pack] pack "${packName}" missing required fields; using synthetic default`);
    return syntheticManifest(packName);
  }
  return manifest;
}

function syntheticManifest(name: string): PackManifest {
  return {
    name,
    version: '1.0.0',
    description: `Synthetic default manifest for pack "${name}" (file not found or invalid)`,
    required_capabilities: ['read_local'],
    optional_capabilities: ['execute', 'write_local'],
    input_schema_ref: 'workflow_packs/schemas/default.input.json',
    output_kind: 'text',
  };
}

// ─── Plan generation ───────────────────────────────────────────────────────────

/**
 * Plan a task into a PlanPlan (DAG of enriched PlanSteps).
 *
 * Calls dsh with the commander profile to ask the model for a JSON step DAG.
 * Parses the dsh stdout for JSON (best-effort, tolerates extra text).
 * Falls back to a 1-step heuristic plan on any failure (parse / dsh unreachable).
 *
 * @param task - the user task to plan
 * @returns PlanPlan with steps + plan_metadata
 */
export async function plan(task: Task): Promise<PlanPlan> {
  const manifest = loadManifest(task.workflow_pack);

  // Try dsh-based plan generation first
  const prompt = buildPlanPrompt(task, manifest);
  try {
    const dshResp = await callDshHeadless(prompt, {
      modelClass: 'commander',
      timeoutMs: PLAN_TIMEOUT_MS,
    });
    if (dshResp.exitCode === 0) {
      const steps = parsePlanJson(dshResp.stdout);
      if (steps.length > 0) {
        return {
          steps: steps.map(enrichStep),
          plan_metadata: {
            source: 'dsh',
            manifest_name: manifest.name,
            manifest_version: manifest.version,
            dsh_wallMs: dshResp.wallMs,
            dsh_trace_id: dshResp.traceId ?? null,
          },
        };
      }
      console.warn(`[workflow_pack] dsh plan output not parseable; using heuristic fallback`);
    } else {
      console.warn(`[workflow_pack] dsh plan exit ${dshResp.exitCode}; using heuristic fallback`);
    }
  } catch (err) {
    console.warn(`[workflow_pack] dsh plan call failed: ${err}; using heuristic fallback`);
  }

  // Heuristic fallback: 1-step plan using the manifest's required capabilities
  return heuristicPlan(task, manifest);
}

function buildPlanPrompt(task: Task, manifest: PackManifest): string {
  const userPrompt = extractPrompt(task);
  return [
    `Generate a JSON execution plan for the following user task.`,
    `Pack: ${manifest.name} v${manifest.version}`,
    `Required capabilities: ${manifest.required_capabilities.join(', ')}`,
    `User task: ${userPrompt}`,
    ``,
    `Output ONLY a JSON object of the form:`,
    `{"steps":[{"name":"...","capability":"...","input_ref":"...","output_kind":"...","depends_on":[],"timeout_seconds":60}]}`,
    `Keep the plan to 1-3 steps. No prose, no markdown fences.`,
  ].join('\n');
}

function extractPrompt(task: Task): string {
  const meta = (task as unknown as Record<string, unknown>)['metadata'] as Record<string, unknown> | undefined;
  if (meta?.['prompt'] && typeof meta['prompt'] === 'string') {
    return meta['prompt'];
  }
  return `task:${task.task_id}`;
}

function parsePlanJson(stdout: string): PackStep[] {
  const match = stdout.match(PLAN_JSON_RE);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  // Accept either bare array or { steps: [...] }
  let rawSteps: unknown[];
  if (Array.isArray(parsed)) {
    rawSteps = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['steps'])) {
    rawSteps = (parsed as Record<string, unknown>)['steps'] as unknown[];
  } else {
    return [];
  }
  return rawSteps.map(normalizeStep).filter(isValidStep);
}

function normalizeStep(raw: unknown): PackStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['name'] !== 'string' || typeof r['capability'] !== 'string') return null;
  return {
    name: r['name'],
    capability: r['capability'],
    input_ref: typeof r['input_ref'] === 'string' ? r['input_ref'] : 'inline',
    output_kind: typeof r['output_kind'] === 'string' ? r['output_kind'] : 'text',
    depends_on: Array.isArray(r['depends_on'])
      ? (r['depends_on'] as unknown[]).filter((d): d is string => typeof d === 'string')
      : [],
    timeout_seconds: typeof r['timeout_seconds'] === 'number' && r['timeout_seconds'] > 0
      ? r['timeout_seconds']
      : 60,
  };
}

function isValidStep(s: PackStep | null): s is PackStep {
  return s !== null && s.name.length > 0 && s.capability.length > 0;
}

function enrichStep(step: PackStep): PlanStep {
  return {
    ...step,
    status: 'pending',
    worker_id: null,
    started_at: null,
    finished_at: null,
    result: null,
    error: null,
  };
}

function heuristicPlan(task: Task, manifest: PackManifest): PlanPlan {
  const stepName = task.workflow_pack === 'default' ? 'execute-default' : `execute-${task.workflow_pack}`;
  return {
    steps: [{
      name: stepName,
      capability: manifest.required_capabilities[0] ?? 'read_local',
      input_ref: task.input_blob_id ?? 'inline',
      output_kind: manifest.output_kind,
      depends_on: [],
      timeout_seconds: 60,
      status: 'pending',
      worker_id: null,
      started_at: null,
      finished_at: null,
      result: null,
      error: null,
    }],
    plan_metadata: {
      source: 'heuristic',
      manifest_name: manifest.name,
      manifest_version: manifest.version,
    },
  };
}

// ─── Public WorkflowPack surface ───────────────────────────────────────────────

/** Build a WorkflowPack-shaped object (manifest + plan) for the given pack name. */
export function build(packName: string): {
  manifest(): PackManifest;
  plan(task: Task): Promise<PlanPlan>;
} {
  const cachedManifest = loadManifest(packName);
  return {
    manifest() {
      return cachedManifest;
    },
    plan(task: Task) {
      return plan(task);
    },
  };
}