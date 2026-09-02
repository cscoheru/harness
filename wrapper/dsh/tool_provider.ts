/**
 * tool_provider.ts — DshToolProvider with profile-aware model selection.
 *
 * Maps capabilityId -> modelClass -> profile -> dsh invoke.
 *
 * Profile selection per model class:
 *   orch      → docs/m0b/profile-override-orch.yaml
 *               (deepseek-v4-pro; high-reasoning, cross-project)
 *   commander → docs/m0b/profile-override-commander.yaml
 *               (deepseek-v4-flash; mid-context, single-workflow)
 *   worker    → docs/m0b/profile-override-worker.yaml
 *               (deepseek-v4-flash; low-cost batch summaries)
 *
 * Does NOT hardcode model IDs — model is set by the --patch YAML files.
 * Does NOT lock to a specific model — capability JSON class field governs SKU.
 *
 * @file wrapper/dsh/tool_provider.ts
 */

import { dshInvoke } from './dsh_client.js';
import { loadProfile, getRolePatchPath } from './profile.js';
import type {
  DshInvokeOptions,
  IToolProvider,
  ModelClass,
  Profile,
  ToolInvokeRequest,
  ToolInvokeResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Capability -> modelClass registry
// ---------------------------------------------------------------------------

/**
 * Maps capabilityId prefix to modelClass.
 *
 * M1c coverage (A-class tasks per PRD-v1.1 §3 H-1):
 *   research.*  → orch      (BE-1:调研)
 *   code.*      → commander  (TG-1:改代码)
 *   summary.*   → worker     (DO-1:摘要)
 *   generic.*   → commander  (default fallback)
 */
const CAPABILITY_MODEL_CLASS_MAP: Record<string, ModelClass> = {
  research: 'orch',
  'research.': 'orch',
  code: 'commander',
  'code.': 'commander',
  edit: 'commander',
  'edit.': 'commander',
  summary: 'worker',
  'summary.': 'worker',
  extract: 'worker',
  'extract.': 'worker',
  generic: 'commander',
  'generic.': 'commander',
};

/**
 * Resolve modelClass from a capabilityId string.
 */
export function resolveModelClass(capabilityId: string): ModelClass {
  // Exact prefix match first
  for (const [prefix, modelClass] of Object.entries(CAPABILITY_MODEL_CLASS_MAP)) {
    if (capabilityId.startsWith(prefix)) return modelClass;
  }
  // Fallback: commander
  return 'commander';
}

/**
 * Capability metadata for audit logging.
 */
export interface CapabilityInfo {
  capabilityId: string;
  modelClass: ModelClass;
  profile: Profile;
  description: string;
}

// ---------------------------------------------------------------------------
// DshToolProvider
// ---------------------------------------------------------------------------

/**
 * DshToolProvider — wraps dsh CLI calls as a ToolProvider.
 *
 * In M1c: real implementation with profile-aware model selection.
 *   1. Resolve modelClass from capabilityId
 *   2. Load profile YAML (base + role patch)
 *   3. Serialize ToolInvokeRequest into a dsh prompt
 *   4. Call dsh via dshInvoke()
 *   5. Parse stdout into ToolInvokeResult
 *
 * @implements IToolProvider
 */
export class DshToolProvider implements IToolProvider {
  private readonly _capabilityId: string;
  private readonly _description: string;
  private readonly _modelClass: ModelClass;
  private readonly _profile: Profile;

  /**
   * Create a DshToolProvider.
   *
   * @param opts.capabilityId - the capability being served
   * @param opts.description  - human-readable description
   * @param opts.modelClass  - override model class (auto-resolved from capabilityId if omitted)
   */
  constructor(opts?: {
    capabilityId?: string;
    description?: string;
    modelClass?: ModelClass;
  }) {
    const capabilityId = opts?.capabilityId ?? 'generic.default';
    const modelClass = opts?.modelClass ?? resolveModelClass(capabilityId);

    this._capabilityId = capabilityId;
    this._description = opts?.description ?? `dsh ${modelClass} tool provider`;
    this._modelClass = modelClass;
    this._profile = loadProfile(modelClass);
  }

  capabilityId(): string {
    return this._capabilityId;
  }

  description(): string {
    return this._description;
  }

  /**
   * Get the resolved capability info for this provider.
   */
  getCapabilityInfo(): CapabilityInfo {
    return {
      capabilityId: this._capabilityId,
      modelClass: this._modelClass,
      profile: this._profile,
      description: this._description,
    };
  }

  /**
   * Invoke dsh with the given tool request.
   *
   * @param request - ToolInvokeRequest from the gateway
   * @returns ToolInvokeResult
   */
  async invoke(request: ToolInvokeRequest): Promise<ToolInvokeResult> {
    const prompt = this._buildPrompt(request);

    const response = await dshInvoke({
      modelClass: this._modelClass,
      prompt,
      timeoutMs: this._profile.timeoutMs,
    });

    return this._parseResponse(request, response);
  }

  /**
   * Build a dsh prompt from a ToolInvokeRequest.
   * Serialises request.arguments into the prompt text.
   */
  private _buildPrompt(request: ToolInvokeRequest): string {
    const argsJson = JSON.stringify(request.arguments, null, 2);
    return [
      `[Task ID: ${request.taskId}]`,
      `[Attempt: ${request.attemptId}]`,
      `[Capability: ${request.capabilityId}]`,
      '',
      `Arguments:`,
      argsJson,
      '',
      'Please complete this task and return the result.',
    ].join('\n');
  }

  /**
   * Parse dsh CLI response into ToolInvokeResult.
   */
  private _parseResponse(
    request: ToolInvokeRequest,
    response: Awaited<ReturnType<typeof dshInvoke>>,
  ): ToolInvokeResult {
    const { stdout, stderr, exitCode, wallMs, traceId, tokenUsage, denialReason } = response;

    if (exitCode !== 0 || denialReason) {
      return {
        capabilityId: request.capabilityId,
        result: { stdout, stderr, wallMs },
        denialReason: denialReason ?? `dsh exit code ${exitCode}`,
        artifactId: traceId,
      };
    }

    return {
      capabilityId: request.capabilityId,
      result: {
        stdout,
        stderr,
        wallMs,
        traceId,
        tokenUsage,
      },
      denialReason: undefined,
      artifactId: traceId,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a DshToolProvider for a given capabilityId.
 * modelClass is auto-resolved from capabilityId prefix.
 */
export function createToolProvider(
  capabilityId: string,
  modelClass?: ModelClass,
): IToolProvider {
  return new DshToolProvider({ capabilityId, modelClass });
}

/**
 * Create a DshToolProvider for a specific model class (no capabilityId lookup).
 * Useful for direct orchestrator/commander/worker invocations.
 */
export function createToolProviderForClass(
  modelClass: ModelClass,
  description?: string,
): IToolProvider {
  return new DshToolProvider({ modelClass, description });
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Type guard: verify an object satisfies IToolProvider.
 */
export function isToolProvider(obj: unknown): obj is IToolProvider {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.capabilityId === 'function' &&
    typeof o.description === 'function' &&
    typeof o.invoke === 'function'
  );
}
