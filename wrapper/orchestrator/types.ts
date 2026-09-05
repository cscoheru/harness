/**
 * TypeScript type contracts — aligned with Python Protocol (spec/interfaces/*.py), NOT 1:1.
 *
 * Python Protocol coverage:
 *   worker_pool.py        -> WorkerPool, WorkerInfo, DispatchResult, worker errors
 *   event_sink.py        -> EventSink, EventEnvelope, SinkKind, SinkResult
 *   context_distiller.py  -> ContextDistiller, ContextBudget, DistilledUnit, HandoffBlob
 *   artifact_store.py     -> ArtifactStore, BlobRef, PutRequest, PutResult
 *   tool_provider.py      -> ToolProvider, ToolInvocationGateway, ToolRequest, ToolResponse,
 *                           CapabilitySpec, CapabilityKind, CapabilityClass, PolicyDecision
 *   policy_decision.py   -> PolicyDecisionPoint, PolicyBundle, PolicyRule
 *   execution_driver.py   -> ExecutionDriver, RunRequest, RunHandle, DriverEvent,
 *                           DriverCapabilities, DriverKind, DriverEventKind
 *   workflow_pack.py      -> WorkflowPack, PackManifest, PackStep, PackPlan
 *
 * Design notes:
 *   - Python enums map to TS string unions (no runtime enum overhead)
 *   - Optional fields map to TS `?` / `| undefined` (no Optional[] wrapper)
 *   - Async methods map to `async function(): Promise<T>`
 *   - frozen=True dataclasses map to `Readonly<T>` / `const` assertions
 *   - No lock-in: class/tier fields from spec/capabilities/*.json (not hardcoded)
 */

// ─── Capability classification ───────────────────────────────────────────────

/** Trust labels for data — aligns with CapabilityClass (spec/interfaces/tool_provider.py) */
export type CapabilityClass =
  | "trusted_user_input"
  | "untrusted_external"
  | "model_generated"
  | "internal_secret";

/** What a tool does — aligns with CapabilityKind (spec/interfaces/tool_provider.py) */
export type CapabilityKind =
  | "read_local"
  | "read_remote"
  | "write_local"
  | "write_remote"
  | "execute"
  | "transcribe";

// ─── Tool provider / gateway ──────────────────────────────────────────────────

export interface CapabilitySpec {
  capability_id: string;
  kind: CapabilityKind;
  description: string;
  data_class_in: CapabilityClass;
  data_class_out: CapabilityClass;
  default_policy: "allow" | "deny" | "needs_approval";
  requires_evidence: boolean;
}

export interface ToolRequest {
  attempt_id: string;
  task_id: string;
  capability_id: string;
  arguments: Record<string, unknown>;
  lease_token: string;
  fence_version: number;
  trust_label_in: CapabilityClass;
}

export interface ToolResponse {
  capability_id: string;
  result: Record<string, unknown> | null;
  artifact_id: string | null;
  denial_reason: string | null;
  policy_decision_id: string | null;
  approval_id: string | null;
}

/** Tool provider stub — real impl deferred to M1+ */
export interface ToolProvider {
  capability(): CapabilitySpec;
  invoke(request: ToolRequest): Promise<ToolResponse>;
}

/** Gateway stub — HTTP/FFI calls to v1.0 runtime kernel (see v1.0-runtime-integration-roadmap.md §5) */
export interface ToolInvocationGateway {
  invoke(request: ToolRequest): Promise<ToolResponse>;
}

// ─── Policy decision point ───────────────────────────────────────────────────

export interface PolicyDecision {
  policy_decision_id: string;
  decision: "allow" | "deny" | "needs_approval";
  reason: string;
  rule_path: string;
}

export interface PolicyRule {
  rule_id: string;
  capability_pattern: string;
  decision: "allow" | "deny" | "needs_approval";
  trust_label_required: CapabilityClass | undefined;
  condition?: string;
}

export interface PolicyBundle {
  bundle_id: string;
  version: string;
  rules: readonly PolicyRule[];
}

/** PDP stub — wrapper must supply one for gateway.invoke to run */
export interface PolicyDecisionPoint {
  bundle(): PolicyBundle;
  evaluate(
    request: ToolRequest,
    bundle: PolicyBundle,
    approval_id?: string,
  ): PolicyDecision;
}

// ─── Worker pool ─────────────────────────────────────────────────────────────

export interface WorkerInfo {
  worker_id: string;
  host: string;
  capabilities_json: string;
  status: string;
  last_heartbeat_at: string;
  current_attempt_id: string | null;
  registered_at: string;
  drained_at: string | null;
}

export interface DispatchResult {
  worker_id: string;
  strategy: "capability_match" | "round_robin";
  task_id: string;
  dispatched_at: string;
}

/** Worker pool stub — HTTP/FFI calls to v1.0 SqliteWorkerPool */
export interface WorkerPool {
  register(host: string, capabilities_json: string): Promise<string>;
  dispatch(task_id: string): Promise<DispatchResult>;
  heartbeat(worker_id: string): Promise<string>;
  drain(worker_id: string): Promise<string>;
  reap_stale(now_iso: string, threshold_seconds?: number): Promise<number>;
  claim_via_pool(task_id: string): Promise<[attempt_id: string, worker_id: string]>;
}

// ─── Event sink ───────────────────────────────────────────────────────────────

export type SinkKind = "audit" | "metrics" | "external_webhook" | "notification";

export interface EventEnvelope {
  event_id: string;
  task_id: string;
  attempt_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  source_event_id: string | null;
  source_sequence: number | null;
  causation_id: string | null;
  dedupe_key: string | null;
  redaction_version: number;
  recorded_at: string;
}

export interface SinkResult {
  sink_kind: SinkKind;
  accepted: boolean;
  sink_sequence: number | null;
  error: string | null;
}

/** Event sink stub — v1.0 wires only SinkKind.AUDIT */
export interface EventSink {
  kind(): SinkKind;
  emit(envelope: EventEnvelope): Promise<SinkResult>;
}

// ─── Context distiller / budget ───────────────────────────────────────────────

export interface DistilledUnit {
  distilled_blob_id: string;
  raw_blob_id: string;
  token_count: number;
  trust_label: string;
  distiller_version: string;
}

export interface HandoffBlob {
  handoff_blob_id: string;
  task_id: string;
  attempt_id: string;
  trust_label: string;
  compressed_token_count: number;
  created_at: string;
}

/** Context distiller stub */
export interface ContextDistiller {
  distill(raw_blob_id: string, trust_label: string): Promise<DistilledUnit>;
  charge(
    task_id: string,
    attempt_id: string,
    distilled_blob_id: string,
  ): Promise<number>;
  snapshot_for_handoff(task_id: string, attempt_id: string): Promise<HandoffBlob>;
  restore_handoff(
    task_id: string,
    handoff_blob_id: string,
    new_attempt_id: string,
  ): Promise<number>;
}

/** Context budget stub */
export interface ContextBudget {
  remaining(task_id: string): Promise<number | null>;
  total(task_id: string): Promise<number | null>;
}

// ─── Artifact store ───────────────────────────────────────────────────────────

export interface BlobRef {
  blob_id: string;
  sha256: string;
  byte_size: number;
  storage_uri: string;
  content_type: string | null;
}

export interface PutRequest {
  blob_id: string;
  byte_stream: AsyncIterable<Uint8Array>;
  expected_sha256: string | null;
  content_type: string | null;
}

export interface PutResult {
  blob_id: string;
  sha256: string;
  byte_size: number;
}

/** Artifact store stub — v1.0 uses local_fs (RealArtifactStore) */
export interface ArtifactStore {
  put(request: PutRequest): Promise<PutResult>;
  get(blob_id: string): AsyncIterable<Uint8Array>;
  stat(blob_id: string): Promise<BlobRef>;
  delete(blob_id: string): Promise<void>;
}

// ─── Execution driver ────────────────────────────────────────────────────────

export type DriverKind = "codex_sdk" | "codex_app_server" | "codex_exec";

export type DriverEventKind =
  | "driver.started"
  | "driver.output_chunk"
  | "driver.tool_call_requested"
  | "driver.tool_call_completed"
  | "driver.heartbeat"
  | "driver.interrupted"
  | "driver.finished"
  | "driver.failed";

export interface DriverEvent {
  kind: DriverEventKind;
  attempt_id: string;
  payload: Record<string, unknown>;
  dedupe_key?: string;
  causation_id?: string;
}

export interface DriverCapabilities {
  driver_kind: DriverKind;
  evidence_uri: string;
  max_concurrent_attempts: number;
  supports_streaming: boolean;
  supports_interrupt: boolean;
  supports_heartbeat: boolean;
  supports_tool_gateway: boolean;
  notes?: string;
}

export interface RunRequest {
  attempt_id: string;
  task_id: string;
  workflow_pack: string;
  workflow_version: string;
  input_blob_id: string | null;
  capability_profile: DriverCapabilities;
  lease_token: string;
  fence_version: number;
  metadata: Record<string, unknown>;
}

export interface RunHandle {
  driver_kind: DriverKind;
  attempt_id: string;
  cancel_token: string;
}

/** Execution driver stub — v1.0 CodexSdkDriver / CodexExecDriver are stubs */
export interface ExecutionDriver {
  capability(): DriverCapabilities;
  run(request: RunRequest): AsyncIterable<DriverEvent>;
  interrupt(handle: RunHandle, reason: string): Promise<void>;
  heartbeat(handle: RunHandle): Promise<void>;
}

// ─── Workflow pack ───────────────────────────────────────────────────────────

export interface PackManifest {
  name: string;
  version: string;
  description: string;
  required_capabilities: readonly string[];
  optional_capabilities: readonly string[];
  input_schema_ref: string;
  output_kind: string;
}

export interface PackStep {
  name: string;
  capability: string;
  input_ref: string;
  output_kind: string;
  depends_on: readonly string[];
  timeout_seconds: number;
}

export interface PackPlan {
  steps: readonly PackStep[];
}

/** Workflow pack stub — stateless; kernel walks the DAG */
export interface WorkflowPack {
  manifest(): PackManifest;
  plan(
    input_blob_id: string,
    context: Record<string, unknown>,
  ): Promise<PackPlan>;
}

// ─── Orchestrator / Commander / Worker 层共享 ─────────────────────────────────

/** Health response from v1.0 runtime kernel /health endpoint (via HTTP facade) */
export interface HealthResponse {
  status: "ok" | "error";
  version: string;
  runtime?: string;
  error?: string;
}

/** Wrapper-level task status — maps to SQLite tasks.status column */
export type TaskStatus =
  | "pending"
  | "dispatched"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** Wrapper-level task payload */
export interface Task {
  task_id: string;
  status: TaskStatus;
  workflow_pack: string;
  workflow_version: string;
  input_blob_id: string | null;
  created_at: string;
  updated_at: string;
  result_blob_id: string | null;
}

/** Orchestrator-level plan result */
export interface OrchestrationResult {
  task_id: string;
  status: TaskStatus;
  output: Record<string, unknown> | null;
  error: string | null;
}

// ─── v1.2.0a NEW: Commander-side plan enrichment ──────────────────────────────

/**
 * PlanStep — PackStep enriched with commander-side lifecycle state.
 * Inherits PackStep fields (name / capability / input_ref / output_kind /
 * depends_on / timeout_seconds) and adds status / worker_id / timing / result.
 */
export interface PlanStep extends PackStep {
  status: TaskStatus;
  worker_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

/**
 * PlanPlan — commander-side plan returned by commander.planStep().
 * Wraps a list of enriched PlanSteps + plan-level metadata (source: dsh vs
 * heuristic fallback, manifest version, etc.).
 */
export interface PlanPlan {
  steps: readonly PlanStep[];
  plan_metadata: Record<string, unknown>;
}

/**
 * AggregateError — thrown by commander.aggregateResults() when one or more
 * steps failed but the task can still return a partial result.
 * Caller may inspect failed_steps and partial_output to decide retry policy.
 */
export class AggregateError extends Error {
  public readonly task_id: string;
  public readonly failed_steps: readonly string[];
  public readonly partial_output: Record<string, unknown> | null;

  constructor(
    task_id: string,
    failed_steps: readonly string[],
    partial_output: Record<string, unknown> | null,
    message: string,
  ) {
    super(message);
    this.name = "AggregateError";
    this.task_id = task_id;
    this.failed_steps = failed_steps;
    this.partial_output = partial_output;
  }
}

// ─── PWA Dispatch Contract ─────────────────────────────────────────────────────

/** PWA form → orchestrator: POST /api/pwa/dispatch */
export interface DispatchRequest {
  /** User's free-text prompt */
  prompt: string;
  /** Capability class: "orch" | "commander" | "worker". Defaults to "orch". */
  class?: string;
  /** Optional workflow pack name */
  workflowPack?: string;
}

/** PWA form ← orchestrator: POST /api/pwa/dispatch response */
export interface DispatchResponse {
  task_id: string;
  status: TaskStatus;
}

/** PWA status polling: GET /api/pwa/status/{task_id} response */
export interface StatusResponse {
  task_id: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  wallMs?: number;
}

// ─── v1.2.0d NEW: Queue backpressure types (per D8 + F26) ──────────────────

/** QueueOverflowError — thrown when queue exceeds max_in_flight (per D8 + F26). */
export class QueueOverflowError extends Error {
  public readonly task_id: string;
  public readonly retry_after_seconds: number;

  constructor(task_id: string, retry_after_seconds: number = 30) {
    super(
      `queue_store: queue overflow for task_id='${task_id}'; retry after ${retry_after_seconds}s`,
    );
    this.name = "QueueOverflowError";
    this.task_id = task_id;
    this.retry_after_seconds = retry_after_seconds;
  }
}

/** QueueAcceptedResult — returned when task lands in SQLite overflow queue (per F26). */
export interface QueueAcceptedResult {
  task_id: string;
  status: "accepted";
  location: string; // /api/v1/status/{task_id} for client polling
}

/** QueueThrottledResult — returned when 429 Retry-After emitted (per F26). */
export interface QueueThrottledResult {
  task_id: string;
  status: "throttled";
  retry_after: number; // seconds
}
