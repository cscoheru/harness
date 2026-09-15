/**
 * workflow_pack.ts — WorkflowPack real implementation (v1.2.0a NEW).
 *
 * Implements the WorkflowPack interface from types.ts:
 *   - loadManifest(packName): read workflow_packs/<name>.json + validate
 *     against PackManifest schema; falls back to a synthetic default manifest
 *     when the file does not exist.
 *   - plan(task): generate a PlanPlan (DAG of PlanSteps) by calling dsh with
 *     the commander profile (docs/m0b/profile-override-commander.yaml,
 *     model = deepseek-v4-flash, 60s timeout). On DeepSeek failure or non-JSON
 *     output, falls back to a deterministic heuristic 1-step plan.
 *
 * The fallback path is critical: it keeps the wrapper usable in unit tests
 * and integration tests without requiring a real DEEPSEEK_API_KEY. Production
 * runs with the key set will use the dsh-generated path.
 *
 * Does NOT lock to a specific model. DeepSeek model param controls selection.
 * DEEPSEEK_API_KEY injected via process.env (never hardcoded).
 *
 * @file wrapper/orchestrator/workflow_pack.ts
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { minimaxInvoke } from '../dsh/minimax_client.js';
import * as commander from './commander.js';
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

  // v1.2.0l NEW: when manifest declares a default_plan, use it directly —
  // closes the "dsh freeforms step names" gap that prompted the user-visible
  // "Python 脚本 in UI" bug on 2026-09-15. A deterministic 3-step DAG from
  // orch.json must beat an LLM-generated 2-step freeform plan. We only skip
  // dsh when default_plan is non-empty; otherwise fall through to the
  // existing dsh path. (plan_metadata.source = "manifest" downstream.)
  if (manifest.default_plan && Array.isArray(manifest.default_plan.steps) && manifest.default_plan.steps.length > 0) {
    return heuristicPlan(task, manifest);
  }

  // v1.2.0k.4 LLM swap (DeepSeek → MiniMax M3): without MINIMAX_API_KEY the
  // dsh call cannot succeed — short-circuit to the heuristic plan instead of
  // burning a 60s spawn+timeout first. This is what makes unit tests
  // deterministic ("unit test 默认场景下 plan() 走 heuristic 1-step plan，不依赖
  // MINIMAX_API_KEY") and keeps production key-less misconfigurations fast-failing
  // instead of hanging each plan for 60s.
  if (!process.env['MINIMAX_API_KEY']) {
    return heuristicPlan(task, manifest);
  }

  // Try dsh-based plan generation first (v1.2.0k.6: routed via 6host_router)
  const prompt = buildPlanPrompt(task, manifest);
  try {
    // v1.2.0k.6 NEW: planner routes via 6host_router so commander-class
    // dispatch hits newvps primary (where the commander LLM profile lives).
    // Falls back to direct minimaxInvoke if router finds no host.
    let dshResp;
    try {
      const { routedDsh } = await import('./6host_router.js');
      dshResp = await routedDsh(prompt, 'commander');
    } catch (routerErr) {
      console.warn(`[workflow_pack] routedDsh failed (${(routerErr as Error).message}); falling back to direct minimaxInvoke`);
      dshResp = await minimaxInvoke(prompt, {
        modelClass: 'commander',
        timeoutMs: PLAN_TIMEOUT_MS,
      });
    }
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

// v1.2.0l.1 NEW: enrichStepWithTask expands ${task.prompt} / ${task.task_id}
// / ${task.workflow_pack} template variables inside step.input_ref so
// orch.json can reference the user-supplied prompt instead of being a
// static literal. Closes the "spawn-workers always says hello from
// spawned worker" hardcoded-output bug reported 2026-09-15.
function enrichStepWithTask(step: PackStep, task: Task): PlanStep {
  const interpolated = expandStepTemplate(step.input_ref, task);
  return enrichStep({ ...step, input_ref: interpolated });
}

/**
 * v1.2.0l.5 NEW: expandStepTemplate resolves two families of template
 * variables inside step.input_ref:
 *
 *   1. ${task.prompt} / ${task.task_id} / ${task.workflow_pack}
 *      - resolved via a small vars dict (same as v1.2.0l.1 expandTemplate)
 *
 *   2. ${step.<name>.stdout | host | wallMs | exit_code}
 *      - resolved at template-expansion time via commander.getStepStatuses()
 *      - permits aggregate-results (and any future "consume upstream output"
 *        step) to read the stdout of a prior step
 *      - if the named step is not found OR has not yet produced the field →
 *        leave the literal ${step.<name>.<field>} in place so bash reports a
 *        clear "unbound variable" error instead of silently inserting ""
 *      - values are POSIX shell-escaped (`"` `\"`, `\` `\\`, `$` `\$`,
 *        backtick `` ` `` ``\` ``) before being interpolated into the
 *        double-quoted bash -c string so an upstream stdout containing
 *        `"` or `; rm -rf /` cannot break out of the quote context
 *
 * Closes the v1.2.0l.4 "aggregate-results hardcodes 19/7" bug: orch authors
 * now write `${step::dispatch-commands::stdout}` instead of `echo "19"`.
 */
function expandStepTemplate(inputRef: string, task: Task): string {
  const taskVars: Record<string, string> = {
    'task.prompt': extractPrompt(task),
    'task.task_id': task.task_id,
    'task.workflow_pack': task.workflow_pack,
  };
  // Phase 1: resolve ${task.*} via simple dict lookup (v1.2.0l.1 behavior).
  let out = inputRef.replace(/\$\{([a-zA-Z0-9_.]+)\}/g, (_m, key: string) => taskVars[key] ?? `\${${key}}`);

  // Phase 2: resolve ${step.<name>::<field>} by reading commander._stepTracker.
  // We only touch the pattern if it's present — leaves every other var literal.
  //
  // Note: separator is `::` not `.` because bash interprets `.` inside ${...}
  // as a parameter-modifier prefix (e.g. ${var:-default}, ${var/old/new}) and
  // rejects the substitution with "bad substitution". The colon-double is
  // unambiguous to bash while still reading clearly to humans.
  if (!/\$\{step::[a-zA-Z0-9_-]+::[a-zA-Z_]+\}/.test(out)) {
    return out;
  }
  const steps = commander.getStepStatuses(task.task_id);
  const stepByName = new Map<string, { stdout: string; host: string | null; wallMs: number | null; exit_code: number | null; status: string }>();
  for (const s of steps) {
    stepByName.set(s.name, {
      stdout: s.stdout,
      host: s.host,
      wallMs: s.wallMs,
      exit_code: typeof (s as unknown as { exit_code?: number }).exit_code === "number"
        ? (s as unknown as { exit_code?: number }).exit_code ?? null
        : null,
      status: s.status,
    });
  }

  out = out.replace(/\$\{step::([a-zA-Z0-9_-]+)::([a-zA-Z_]+)\}/g, (_m, name: string, field: string) => {
    const step = stepByName.get(name);
    if (!step) return `\${step::${name}::${field}}`; // unknown step → preserve literal
    // Only resolve fields whose backing step is already completed; otherwise
    // bash would see an empty value and silently produce wrong results.
    if (step.status !== "completed" && step.status !== "failed") {
      return `\${step::${name}::${field}}`;
    }
    let raw: string | null;
    switch (field) {
      case "stdout": raw = step.stdout; break;
      case "host": raw = step.host; break;
      case "wallMs": raw = step.wallMs != null ? String(step.wallMs) : null; break;
      case "exit_code": raw = step.exit_code != null ? String(step.exit_code) : null; break;
      default: return `\${step::${name}::${field}}`; // unknown field → preserve literal
    }
    if (raw === null || raw === undefined) return `\${step::${name}::${field}}`;
    return shellEscape(raw);
  });

  return out;
}

/**
 * v1.2.0l.5 NEW: POSIX shell double-quote escape.
 *
 * Inside a `"..."` bash string these chars need backslash-escaping so the
 * expansion cannot break out of the quote or trigger command substitution:
 *   `"`  → `\"`   (close-quote injection)
 *   `\`  → `\\`   (existing escape char)
 *   `$`  → `\$`   (variable interpolation)
 *   `` ` ``  → `` \` ``   (command substitution)
 * Newlines are kept as-is — bash double-quoted strings allow literal newlines.
 */
function shellEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

function expandTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{([a-zA-Z0-9_.]+)\}/g, (_m, key: string) => vars[key] ?? `\${${key}}`);
}

function heuristicPlan(task: Task, manifest: PackManifest): PlanPlan {
  // v1.2.0l NEW (per F24 deterministic pack): if the pack manifest declares a
  // default_plan.steps array, emit those steps directly (deterministic,
  // LLM-freeform-free) instead of a synthetic 1-step plan. This makes
  // orch.json a real 3-step DAG (spawn-workers → dispatch-commands →
  // aggregate-results) regardless of dsh availability, closing the
  // "freeform 3 step names" gap that user reported on 2026-09-15.
  if (manifest.default_plan && Array.isArray(manifest.default_plan.steps) && manifest.default_plan.steps.length > 0) {
    return {
      steps: manifest.default_plan.steps.map((step) => enrichStepWithTask(step, task)),
      plan_metadata: {
        source: 'manifest',
        manifest_name: manifest.name,
        manifest_version: manifest.version,
        deterministic: true,
        step_count: manifest.default_plan.steps.length,
      },
    };
  }
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