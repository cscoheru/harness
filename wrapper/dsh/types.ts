/**
 * DshOpts — dsh CLI/HTTP call options.
 * Matches the three profile tiers from spec/capabilities/.
 *
 * NOT 1:1 with Python types.ts — simplified for TypeScript.
 */

export interface DshOpts {
  /** Capability class: determines which profile override to apply. */
  modelClass?: 'orch' | 'commander' | 'worker';
  /** Timeout in milliseconds (default: 120000). */
  timeoutMs?: number;
  /** Env-inject API key placeholder (not a real key). */
  apiKey?: string; // process.env.DEEPSEEK_API_KEY injected at call site
  /** Additional CLI args passed verbatim to dsh. */
  extraArgs?: string[];
}

export interface DshResponse {
  /** Raw stdout from dsh. */
  stdout: string;
  /** Raw stderr from dsh (may contain warnings). */
  stderr: string;
  /** dsh exit code. */
  exitCode: number;
  /** Wall time in ms (measured by caller). */
  wallMs: number;
}

export interface IToolProvider {
  /**
   * Human-readable capability description.
   * Mirrors ToolProvider.capability() from spec/interfaces/tool_provider.py.
   */
  capabilityId(): string;
  description(): string;

  /**
   * Invoke the underlying tool.
   * Mirrors ToolProvider.invoke() but synchronous (dsh CLI is sync-ish).
   *
   * @param request - tool invocation request
   * @returns tool result or throws on failure
   */
  invoke(request: ToolInvokeRequest): ToolInvokeResult;
}

/** Simplified ToolRequest for TS-side tool calls. */
export interface ToolInvokeRequest {
  attemptId: string;
  taskId: string;
  capabilityId: string;
  arguments: Record<string, unknown>;
}

/** Simplified ToolResponse for TS-side tool responses. */
export interface ToolInvokeResult {
  capabilityId: string;
  /** JSON-serializable result on success. */
  result: unknown;
  /** Set if the gateway denied the request. */
  denialReason?: string;
  /** Set on success (artifact ID for audit). */
  artifactId?: string;
}
