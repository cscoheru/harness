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
   * Mirrors ToolProvider.invoke() — async for dsh CLI calls.
   *
   * @param request - tool invocation request
   * @returns tool result or throws on failure
   */
  invoke(request: ToolInvokeRequest): Promise<ToolInvokeResult>;
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

// ---------------------------------------------------------------------------
// M1c additions: Profile / DshInvokeOptions / DshResponse (enhanced)
// ---------------------------------------------------------------------------

/**
 * Model class — maps to spec/capabilities/{orch,commander,worker}.json.
 * Each class has a distinct `class` field in its capability JSON.
 * The model selection is done via --patch profile YAML, NOT hardcoded here.
 */
export type ModelClass = 'orch' | 'commander' | 'worker';

/**
 * Path to a dsh profile override YAML for each model class.
 * Resolved relative to the project root.
 */
export const PROFILE_YAML_MAP: Record<ModelClass, string> = {
  orch: 'docs/m0b/profile-override-orch.yaml',
  commander: 'docs/m0b/profile-override-commander.yaml',
  worker: 'docs/m0b/profile-override-worker.yaml',
};

/**
 * Resolved dsh profile — built by profile.ts from YAML overrides + base.
 */
export interface Profile {
  /** Model class (orch | commander | worker). */
  modelClass: ModelClass;
  /** Absolute paths to --patch YAML files in evaluation order. */
  patches: string[];
  /** Parsed content of each patch YAML (yaml-ast or plain). */
  patchesRaw: string[];
  /** Timeout in ms for this profile tier. */
  timeoutMs: number;
}

/**
 * YAML-serialisable profile override document.
 * Matches the structure of docs/m0b/profile-override-*.yaml.
 */
export interface ProfileOverride {
  id: string;
  config?: Record<string, unknown>;
  disabled?: boolean;
}

/**
 * Options for dsh invoke — caller-facing API (env-inject DEEPSEEK_API_KEY).
 */
export interface DshInvokeOptions {
  /** Model class determines which profile override to apply (required). */
  modelClass: ModelClass;
  /** Prompt text sent to dsh. */
  prompt: string;
  /** Timeout in ms (default: 300_000 for orch, 180_000 for commander, 60_000 for worker). */
  timeoutMs?: number;
  /** Extra CLI args appended verbatim after --patch flags (rare). */
  extraArgs?: string[];
}

/**
 * Enhanced DshResponse — returned by callDshHeadless().
 * Extends the M0c stub DshResponse with trace/token fields.
 */
export interface DshResponse {
  /** Raw stdout from dsh. */
  stdout: string;
  /** Raw stderr from dsh (may contain warnings / model output). */
  stderr: string;
  /** dsh exit code (0 = success, non-zero = denial / error). */
  exitCode: number;
  /** Wall time in ms (measured by caller). */
  wallMs: number;
  /** dsh trace ID if present in stdout (parsed from JSON wrapper). */
  traceId?: string;
  /** Estimated token usage (input + output) if available from output. */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /**
   * Denial reason string if dsh refused to complete the task.
   * Set when exitCode !== 0 and stderr/stdout contains refusal language.
   */
  denialReason?: string;
}

/**
 * Token usage summary returned by dsh for audit.
 */
export interface DshTokenUsage {
  inputTokens: number;
  outputTokens: number;
}
