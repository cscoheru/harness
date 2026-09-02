/**
 * tool_provider.ts — ToolProvider Protocol implementation (TypeScript skeleton).
 *
 * Mirrors spec/interfaces/tool_provider.py but is NOT 1:1:
 *   - TypeScript has no @runtime_checkable Protocol; we use an interface.
 *   - AsyncToolProvider uses async/await (dsh CLI is async in Node).
 *   - Simplified CapabilitySpec fields (no frozen dataclass equivalent).
 *   - ToolRequest / ToolResponse simplified to plain objects.
 *
 * The TS ToolProvider does NOT enforce policy — that is the gateway's job
 * (mirrors the Python spec: "Providers are NOT trusted to enforce policy").
 *
 * @file wrapper/dsh/tool_provider.ts
 */

import { callDshHeadless } from './dsh_client.js';
import type {
  DshOpts,
  IToolProvider,
  ToolInvokeRequest,
  ToolInvokeResult,
} from './types.js';

/**
 * DshToolProvider — wraps dsh CLI calls as a ToolProvider.
 *
 * In M0c skeleton: stub only. Real implementation will:
 *   1. Map capabilityId to a dsh prompt template.
 *   2. Serialize ToolInvokeRequest.arguments into the prompt.
 *   3. Call dsh via callDshHeadless().
 *   4. Parse stdout into ToolInvokeResult.result.
 *
 * @implements IToolProvider
 */
export class DshToolProvider implements IToolProvider {
  private readonly _capabilityId: string;
  private readonly _description: string;
  private readonly _modelClass: DshOpts['modelClass'];

  constructor(opts?: {
    capabilityId?: string;
    description?: string;
    modelClass?: DshOpts['modelClass'];
  }) {
    this._capabilityId = opts?.capabilityId ?? 'dsh.generic';
    this._description = opts?.description ?? 'Generic dsh tool provider';
    this._modelClass = opts?.modelClass ?? 'commander';
  }

  capabilityId(): string {
    return this._capabilityId;
  }

  description(): string {
    return this._description;
  }

  /**
   * Invoke dsh with the given tool request.
   *
   * @param request - ToolInvokeRequest from the gateway
   * @returns ToolInvokeResult
   *
   * TODO (M0c skeleton):
   *   - Build prompt from request.arguments
   *   - Pass modelClass to callDshHeadless()
   *   - Handle dsh exit codes (denial, timeout, etc.)
   *   - Parse and return result
   */
  invoke(request: ToolInvokeRequest): ToolInvokeResult {
    // TODO: build prompt string from request.arguments
    const prompt = `[stub] invoke ${request.capabilityId} attempt=${request.attemptId}`;

    // TODO: actually call dsh (currently synchronous stub)
    // const response = await callDshHeadless(prompt, { modelClass: this._modelClass });

    return {
      capabilityId: request.capabilityId,
      result: {
        // TODO: populate from dsh response
        stub: true,
        attemptId: request.attemptId,
        taskId: request.taskId,
      },
      denialReason: undefined,
      artifactId: undefined,
    };
  }
}

/**
 * Stub factory: create a DshToolProvider for a given capability.
 *
 * In production, the registry would map capabilityId -> provider instance.
 *
 * TODO (M0c skeleton):
 *   - Register providers for each supported capabilityId
 *   - Return the appropriate provider instance
 */
export function createToolProvider(
  capabilityId: string,
  modelClass?: DshOpts['modelClass'],
): IToolProvider {
  return new DshToolProvider({ capabilityId, modelClass });
}

/**
 * Type guard: verify an object satisfies IToolProvider.
 * (No runtime protocol check in TS; this is a compile-time aid.)
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
