# Fish Harness PRD v0.6

> **版本**：v0.6（v0.5 复审后修订）
> **日期**：2026-08-29
> **位置**：`/Users/kjonekong/projects/fish-harness/`
> **状态**：**架构方向通过、Stage 1 范围收敛为 read-only research MVP、所有 P0/P1 进入修订清单；待 M0 spike + v0.6 修订关闭**
> **前置**：`ARCHITECT-REVIEW-PRD-v0.5.md`（本轮复审）、`PRD-v0.5.md`

---

## 0. TL;DR

v0.6 = v0.5 修补版，方向正确但实施必须收敛。

| 维度 | v0.5 自评 | v0.5 复审 | **v0.6 自评** |
|------|----------|----------|--------------|
| 架构方向 | 6/10 | 8/10 | **通过** |
| 实施规范 | 4.5/10 | 不通过 | **修订后待 spike** |
| Stage 1 范围 | 12-15 周 | 平台 v1 | **read-only research MVP（6-9 周）** |

### v0.5 → v0.6 关键变化

1. **Stage 1 收敛为 read-only**：不启用 external write + approval reconcile 推到 M2
2. **六个接口保留契约，Stage 1 只实现 Research 用的最小子集**
3. **claim SQL 修正**：用子查询避开 `UPDATE LIMIT RETURNING` 顺序
4. **CancelService 独立**：与 lease reaper 解耦
5. **PolicyEngine 判定顺序修正**：先 deny outside max，再 needs_approval if 高风险
6. **Approval 永不回 pending**：重试用 `supersedes_approval_id` 链
7. **EgressFetcher 改用成熟 HTTP 栈**：httpx + 自定义 pinned resolver
8. **Codex 附录改用真实 `openai_codex` API** 或明确标为伪代码
9. **canonical 自包含**：所有"保留 v0.X"引用全部消除

### v0.6 自评（按 v0.5 复审标准）

| 项数 | 状态 |
|------|------|
| **3/10** | 完整通过（架构方向、6 接口契约、Stage 1 read-only 收敛）|
| **5/10** | 部分通过（待 M0 spike：claim SQL 真实库测试、cancel 不变量测试、policy 单向验证、approval supersede 链、Codex 真实 capability）|
| **2/10** | 待 spike（dsh/Codex 资源实测 + EgressFetcher 网络测试）|

---

## 1. 愿景与设计哲学

### 1.1 核心价值

你（人）→ 手机发指令 → Harness（AI 团队）→ 产出（调研/代码/视频）

**关键特性**：永远在线、能力匹配、弹性扩展、优雅降级。

### 1.2 设计哲学（5 条不可妥协）

| 原则 | 含义 |
|------|------|
| **Harness 是事实来源** | SQLite 是 orchestration state authority；外部系统通过 `ExternalRunRef`/operation ID/artifact hash 对账；无法确认时进入 `unknown` |
| **Kernel 不懂业务** | Durable Kernel 不知道"研究报告怎么做"，由 WorkflowPack 提供 |
| **Driver 不懂权限** | ExecutionDriver 只执行；权限由 PolicyDecisionPoint 决定 |
| **单向权限** | 身份 + 策略 = 最大权限；文本/分类/风险只能收紧 |
| **可替换执行器** | ExecutionDriver SPI 让 cc/codex/dsh 互为替代 |

### 1.3 数字分身的长期闭环

```
Goal → Observation → Proposal → Approval → Action → Outcome
  ↑                                                     │
  └──────────── Evaluation ← Memory / Learning ─────────┘
```

v0.6 不实现所有实体，但**预留稳定 ID、事件类型和 artifact lineage**。

---

## 2. 架构假设与验证状态

### 2.1 dsh / Codex 能力验证矩阵

| 能力 | 置信度 | M0 spike |
|------|--------|----------|
| Codex Python SDK（`openai_codex`）| 中（v0.5 附录 A 是伪代码）| **必须 spike** |
| Codex App Server（本地 stdio / Unix socket）| 中 | **必须 spike** |
| `codex exec --json` | 高 | spike 确认事件稳定性 |
| `codex app-server` 远程 WebSocket | **不推荐生产** | 实验性 |
| dsh 远程 worker / daemon | **未验证** | 视 spike 决定 |
| 弃用 Codex MCP Server | **不推荐** | App Server 替代 |

**v0.6 决策**：主 Driver 候选 = `CodexSdkDriver` / `CodexAppServerDriver` / `CodexExecDriver` 三选一。**M0 spike 之后**才能锁定；v0.6 不写死。

### 2.2 兼容性风险

| 维度 | 风险 |
|------|------|
| Codex SDK | 中（Python SDK 跟随 CLI 版本）|
| Codex App Server | 中（schema 随版本演进）|
| dsh | 高（dev preview，破坏性变更）|
| FastAPI | 低 |
| SQLite | 低（注意 `UPDATE LIMIT RETURNING` 顺序问题） |

---

## 3. Durable Kernel + 六个扩展接口

### 3.1 整体架构

```text
Channels / Schedules / Webhooks / Manual UI
                       │
                       ▼
              Goal / Task / Workflow API
                       │
                       ▼
 ┌──────────────── Durable Kernel ────────────────┐
 │ state · lease · approval · policy · budget    │
 │ event · artifact · provenance · audit         │
 └──────────────────────┬─────────────────────────┘
                        ▼
               Versioned WorkflowPack
                        ▼
                ExecutionDriver SPI
       ┌────────────────┼──────────────────┐
       ▼                ▼                  ▼
 CodexSdkDriver  CodexAppServerDriver  CodexExecDriver
                        ▼
          ToolProvider / Skills / MCP / APIs
```

### 3.2 关键边界

- **Durable Kernel** 不知道"研究报告怎么做"
- **WorkflowPack** 不知道"线程如何由 Codex 运行"
- **ExecutionDriver** 不决定权限

### 3.3 六个稳定扩展接口（v0.6 契约）

#### 3.3.1 ExecutionDriver SPI

```python
class ExecutionDriver(Protocol):
    """Durable Kernel 与执行后端的解耦层。
    
    Capabilities 必须报告实测通过的能力；不能静默降级。
    """
    
    def capabilities(self) -> DriverCapabilities:
        """声明 driver 能力。
        
        返回的 DriverCapabilities 只能包含实测验证过的能力；
        未验证能力必须返回 UnsupportedCapability。
        """
        ...
    
    async def start(self, execution: ExecutionRequest) -> ExternalRunRef:
        """启动新 execution。返回 ExternalRunRef（持久化）。"""
        ...
    
    async def resume(self, ref: ExternalRunRef, input: TurnInput) -> ExternalRunRef:
        """继续已有 execution。"""
        ...
    
    async def interrupt(self, ref: ExternalRunRef) -> None:
        """请求中断（不保证立即停止）。"""
        ...
    
    async def stream_events(self, ref: ExternalRunRef) -> AsyncIterator[DriverEvent]:
        """事件流（含 structured output、approval 请求、错误等）。
        
        必须保证：单一完成信号（terminal result）+ event cursor/replay + dedupe。
        """
        ...
    
    async def collect_artifacts(self, ref: ExternalRunRef) -> list[ArtifactRef]:
        """收集产物引用。"""
        ...
```

**ExternalRunRef 必须持久化**：
```python
@dataclass
class ExternalRunRef:
    driver_id: str               # "codex_sdk" / "codex_app_server" / "codex_exec"
    driver_version: str          # "0.1.0"
    protocol_version: int        # driver 协议版本
    external_thread_id: str      # driver 管理的 thread ID
    external_turn_id: Optional[str]  # driver 管理的 turn ID
    source_protocol: str         # "exec_jsonl" / "app_server_jsonrpc" / "sdk_python"
    metadata: dict               # driver-specific 字段
```

**禁止**：在同一 external thread 中跨 Driver resume。fallback 只能从新 attempt 开始，并记录 lineage。

#### 3.3.2 WorkflowPack

```yaml
id: research.v1
version: 1.0.0
description: "Research a topic, fetch sources, summarize"

input_schema:
  type: object
  properties:
    topic: {type: string}
    max_sources: {type: integer, default: 5}
  required: [topic]

output_schema:
  type: object
  properties:
    report_artifact_id: {type: string}
    sources: {type: array, items: {type: string}}

# 关键：capability 不绑定 driver ID（v0.6 修复 P1-3）
capability_requirements:
  - kind: driver
    required_capabilities: [structured_output, streaming, sandbox_workspace_read]
  - kind: tool
    tool_id: web.fetch
  - kind: tool
    tool_id: audio.transcribe

steps:
  - name: fetch_sources
    uses: [tool: web.search]
    outputs: [source_list]
  - name: fetch_content
    uses: [tool: web.fetch]
    inputs: [source_list]
    outputs: [content_list]
  - name: transcribe_if_audio
    uses: [tool: audio.transcribe]
    inputs: [content_list]
    outputs: [transcripts]
  - name: summarize_and_cite
    uses: [driver: structured_output]
    inputs: [content_list, transcripts]
    outputs: [summary]
  - name: write_artifact
    uses: [tool: artifact.write]
    inputs: [summary, source_list]
    outputs: [report_artifact_id]

retry_policy:
  max_attempts: 3
  backoff: exponential

cancel_policy:
  graceful_timeout: 30

policy_profile: research.default

# eval fixtures 与最低质量门槛
eval_suite: research.eval.v1

# UI schema（v0.6 仅文字表单，不含通用 schema-driven）
ui_schema:
  form:
    - {key: topic, type: text, label: "研究主题"}
    - {key: max_sources, type: number, label: "最大来源数"}

# 版本迁移策略
migration_strategy: forward_only

# 关键：pack_id/version/schema_hash 在 task 创建时固定
schema_hash: sha256:...
```

**Stage 1 简化**（v0.6 修复 P1-1）：
- 每 task/attempt 只调用**一次** Driver
- steps 只是 Driver 输入计划
- 不实现 `workflow_run`/`step_run` 持久化状态机
- 第二实现出现时再引入真正的 Workflow Runtime

#### 3.3.3 ToolProvider manifest

```yaml
id: web.fetch
version: 1.0.0
description: "Fetch URL with SSRF protection"

# 关键：返回 ArtifactRef + metadata（v0.6 修复 P1-4）
input_schema:
  type: object
  properties:
    url: {type: string, format: uri}
    max_bytes: {type: integer, max: 10000000}
  required: [url]

output_schema:
  type: object
  properties:
    artifact_id: {type: string}      # 大内容走 ArtifactStore
    content_hash: {type: string}
    media_type: {type: string}
    bytes: {type: integer}
    source_url: {type: string}

# 关键元数据
network_class: public
side_effect_class: read              # v0.6 Stage 1 只允许 read
approval_requirement: none
idempotency_capability: none
timeout_ms: 10000
max_input_bytes: 1024
max_output_bytes: 10000000
secrets_scope: []
compatible_runtime_versions: ["^1.0.0"]

# v0.6 新增
schema_version: 1
egress_policy: default_public
data_classification: unclassified
rate_limit: {rps: 5, burst: 10}
cost_hint: {tokens_per_call: 0}
redaction_policy: strip_secrets

implementation: harness.tools.web_fetch:safe_fetch
```

**Stage 1 只读工具集**（v0.6 收敛）：
- `web.search`：只读，公网
- `web.fetch`：只读，公网（EgressFetcher 防护）
- `audio.transcribe`：只读，本地文件
- `note.read`：只读，本地 vault
- `artifact.write`：**写本地 ArtifactStore**（不属于 external write）

**M2 才引入**：`video.publish`、`email.send` 等 external write tools。

#### 3.3.4 typed ArtifactStore

```python
@dataclass
class ArtifactRef:
    artifact_id: str
    type: str                   # "research.report" / "web.snapshot" / ...
    content_hash: str           # SHA-256
    producer_workflow: str
    producer_workflow_version: str
    producer_driver: str
    source_url: Optional[str]
    parent_artifact_ids: list[str]
    visibility: str             # "private" / "shared"
    retention_policy: str       # "permanent" / "30d" / "session"
    sensitivity: str            # "public" / "internal" / "secret"
    preview_type: str
    created_at: int
```

**API**：
```python
class ArtifactStore(Protocol):
    async def put(self, content: bytes, type: str, producer: str, 
                  parent_ids: list[str] = None,
                  retention_policy: str = "permanent") -> ArtifactRef:
        """原子写入：write temp → fsync → hash verify → atomic rename → DB metadata/link。
        
        失败语义：temp 文件保留以便诊断；DB link 失败时 orphan 由 sweeper 清理。
        """
        ...
    
    async def get(self, ref: ArtifactRef) -> bytes:
        ...
    
    async def link_to_task(self, artifact_id: str, task_id: str) -> None:
        ...
    
    async def list_for_task(self, task_id: str) -> list[ArtifactRef]:
        ...
```

**关键**（v0.6 修复 P1-4）：
- atomic write：temp → fsync → hash verify → rename → DB link
- content_hash 唯一性约束（UNIQUE）
- orphan sweeper（DB link 失败时清理 temp 文件）
- async API（FastAPI/Driver 流程都是 async）

**Stage 1 存储**：
- 正文：本地文件系统（`/opt/harness/data/artifacts/`，按 content_hash 前 2 位分桶）
- DB：ArtifactRef 索引（与 task 在同一 SQLite）

#### 3.3.5 PolicyDecisionPoint

**v0.6 修复 P0-3（判定顺序写反）**：

```python
def decide(actor: Identity, requested_action: str, resource: Resource,
           context: Context) -> PolicyDecision:
    """单向权限：身份+项目=最大权限；其他只能收紧。
    
    判定顺序（v0.6 强制）：
    1. 不在最大权限 → deny（不可被 approval 扩权）
    2. 在最大权限但需 approval → needs_approval
    3. 在最大权限且无需 approval → allow
    """
    
    # 1. 计算最大权限集合
    max_permissions = compute_max_permissions(actor, resource)
    # 单向收紧（输入来源、数据分类、风险等级只能收紧）
    max_permissions = apply_restrictions(max_permissions, context)
    
    # 2. 第一判定：不在最大权限 → 直接 deny
    if requested_action not in max_permissions:
        return PolicyDecision(
            decision="deny",
            reason="outside maximum authority",
            policy_version=POLICY_VERSION,
            matched_rules=["max_authority_check"],
            constraints={},
        )
    
    # 3. 第二判定：需要审批 → needs_approval
    if requires_approval(requested_action, context):
        return PolicyDecision(
            decision="needs_approval",
            reason="allowed but consequential",
            policy_version=POLICY_VERSION,
            matched_rules=["approval_required"],
            constraints=get_approval_constraints(requested_action),
        )
    
    # 4. 第三判定：通过
    return PolicyDecision(
        decision="allow",
        reason="within authority and no approval required",
        policy_version=POLICY_VERSION,
        matched_rules=[],
        constraints={},
    )


@dataclass
class PolicyDecision:
    decision: str           # "allow" | "deny" | "needs_approval"
    reason: str
    policy_version: str
    matched_rules: list[str]
    constraints: dict
    expires_at: Optional[int]  # 决策有效期
    decision_id: str        # 执行时可校验"这是同一个决定"
```

**核心原则**（**v0.6 关键修复**）：
- **approval 不能扩权**：deny 永远不能被 approval 变成 allow
- **高风险先在 max 内**：高风险且在 max_permissions → needs_approval；低风险且在 max → allow
- **matched_rules 入审计**：每次决策的 matched rule ID 必须写入 audit_log

#### 3.3.6 versioned EventSink

```python
@dataclass
class EventEnvelope:
    # v0.6 新增（修复 P1-2）
    event_id: str
    event_version: int           # envelope schema version
    source_protocol: str         # "exec_jsonl" / "app_server_jsonrpc" / "sdk_python"
    source_event_id: str         # 驱动层原始 ID
    source_sequence: int         # 驱动层序号
    
    # task 关联
    task_id: str
    attempt_id: Optional[str]
    workflow_run_id: str
    
    # driver 引用
    driver_ref: Optional[ExternalRunRef]
    
    # 事件本身
    event_type: str
    occurred_at: int             # 驱动层报告时间（epoch ms）
    ingested_at: int             # 入库时间（epoch ms）
    actor: str
    
    # 因果（v0.6 新增）
    causation_id: Optional[str]  # 触发此事件的上游事件
    correlation_id: Optional[str]  # 跨 attempt 关联 ID
    
    # 关联信息
    trace_id: str
    
    # payload（v0.6 修复 P1-2 + P1-4）
    payload_schema: str          # payload schema ID
    payload: dict                # 只允许白名单字段 + ArtifactRef
    
    # 去重与脱敏（v0.6 新增）
    dedupe_key: str              # UNIQUE 约束
    redaction_version: str       # 脱敏规则版本
```

**关键**（v0.6 修复 P1-2）：
- payload **不允许**直接放 10MB 内容，必须走 ArtifactStore
- 大内容统一进 ArtifactStore，event 只存 metadata + ArtifactRef
- payload schema validation + recursive redaction + 大小限制
- UNIQUE 约束 on dedupe_key 防重复入库

### 3.4 扩展性验收标准（v0.6 修订）

报告指出 "assert kernel_supports(mock) + grep" 不能证明扩展性。v0.6 改为：

1. **真实扩展性测试**（**M3 验收**）：在独立 package 实现第二 WorkflowPack，不修改 kernel 即通过 conformance suite
2. **接口契约测试**：每个接口有 contract test，模拟第二实现的注册流程
3. **卸载后历史回放**：第二 WorkflowPack 卸载后，历史 task 仍可 replay

**v0.6 Stage 1 不要求实现第二 pack**，但接口契约必须稳定到能容纳第二实现。

---

## 4. 任务状态机与持久化（v0.6 关键修补）

### 4.1 attempt 编号逻辑（v0.6 修复 P0-1）

**v0.5 问题**：用 `UPDATE ... ORDER BY ... LIMIT 1 RETURNING ...`，SQLite 3.51 报语法错误。

**v0.6 修复**：用子查询避开 `UPDATE LIMIT RETURNING` 顺序：

```python
def claim_task(worker_id: str) -> Optional[ClaimedTask]:
    """事务：原子 attempt_count +1 → 创建 attempt + N+1 → 标记 leased。
    
    v0.6 修复：
    1. 用子查询选取候选 task，避开 UPDATE LIMIT RETURNING 顺序问题
    2. 从 RETURNING 的 attempt_count 算退避（不再用未定义变量）
    3. 加 MAX_ATTEMPTS 检查（v0.5 缺失，导致无限重试）
    4. actor 从函数参数读取，不使用未定义全局变量
    """
    attempt_id = str(uuid4())
    lease_token = str(uuid4())
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 子查询选候选 task
        candidate = tx.execute("""
            SELECT task_id, attempt_count
            FROM tasks
            WHERE status = 'queued'
              AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
              AND cancel_requested_at IS NULL
            ORDER BY created_at ASC
            LIMIT 1
        """, (now,)).fetchone()
        
        if candidate is None:
            return None
        
        task_id, current_attempt_count = candidate['task_id'], candidate['attempt_count']
        
        # 2. CAS：原子递增 attempt_count（不在 UPDATE 上用 LIMIT/ORDER BY/RETURNING）
        updated = tx.execute("""
            UPDATE tasks
            SET attempt_count = attempt_count + 1,
                updated_at = ?
            WHERE task_id = ?
              AND status = 'queued'
              AND attempt_count = ?
              AND cancel_requested_at IS NULL
        """, (now, task_id, current_attempt_count)).rowcount
        
        if updated != 1:
            raise TransitionConflict(f"task {task_id} lost CAS at claim")
        
        new_attempt_no = current_attempt_count + 1
        
        # 3. 创建 attempt
        tx.execute("""
            INSERT INTO task_attempts (
                attempt_id, task_id, attempt_no, worker_id,
                fence_version, lease_token, lease_expires_at,
                started_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        """, (attempt_id, task_id, new_attempt_no, worker_id,
              1, lease_token, now + LEASE_TTL_MS, now))
        
        # 4. 条件更新 task 到 leased
        task_updated = tx.execute("""
            UPDATE tasks
            SET status = 'leased',
                worker_id = ?,
                lease_token = ?,
                lease_expires_at = ?,
                current_attempt_id = ?,
                fence_version = fence_version + 1,
                updated_at = ?
            WHERE task_id = ?
              AND attempt_count = ?
              AND current_attempt_id IS NULL
              AND status = 'queued'
        """, (worker_id, lease_token, now + LEASE_TTL_MS,
              attempt_id, now, task_id, new_attempt_no)).rowcount
        
        if task_updated != 1:
            raise TransitionConflict(f"task {task_id} lost CAS at leased transition")
        
        # 5. event
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
            VALUES (?, ?, ?, 'lease_granted', ?, ?)
        """, (task_id, attempt_id, now,
              json.dumps({"attempt_no": new_attempt_no, "fence_version": 1}),
              worker_id))
        
        return ClaimedTask(task_id, attempt_id, new_attempt_no, lease_token, 1)
```

**关键修复**：
- 子查询选取候选 → UPDATE 不再用 LIMIT/ORDER BY/RETURNING 顺序
- 二次校验 `attempt_count = ?` 防 CAS 失败
- 任一更新 rowcount ≠ 1 → ROLLBACK

### 4.2 fail_attempt（v0.6 修复 P0-1：无限重试 + 未定义变量）

```python
def fail_attempt(task_id: str, attempt_id: str, lease_token: str,
                 fence_version: int, error: TaskError,
                 worker_id: str, max_attempts: int = 5) -> bool:
    """失败处理（v0.6 修复 P0-1）。
    
    关键：
    1. attempt_count 从 DB 读取，不使用未定义变量
    2. 检查 MAX_ATTEMPTS，达到上限 → failed（不可重试）
    3. attempt UPDATE 校验 rowcount
    4. actor 从函数参数读取
    """
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 读 attempt_count
        current = tx.execute("""
            SELECT attempt_count FROM tasks WHERE task_id = ?
        """, (task_id,)).fetchone()
        
        if current is None:
            return False
        
        current_attempt_count = current['attempt_count']
        
        # 2. 决定 task 终态
        if not error.retryable or current_attempt_count >= max_attempts:
            # 不可重试 OR 已达上限
            task_status = 'failed'
            next_attempt_at = None
        else:
            # 可重试
            task_status = 'retry_wait'
            backoff_ms = min(BACKOFF_BASE_MS * (2 ** (current_attempt_count - 1)),
                             BACKOFF_MAX_MS)
            next_attempt_at = now + backoff_ms
        
        # 3. 更新 task
        task_updated = tx.execute("""
            UPDATE tasks
            SET status = ?,
                next_attempt_at = ?,
                lease_token = NULL,
                lease_expires_at = NULL,
                current_attempt_id = NULL,
                last_error_code = ?,
                last_error_message = ?,
                updated_at = ?
            WHERE task_id = ?
              AND current_attempt_id = ?
              AND lease_token = ?
              AND fence_version = ?
              AND status IN ('running', 'leased')
        """, (task_status, next_attempt_at, error.code, error.message, now,
              task_id, attempt_id, lease_token, fence_version)).rowcount
        
        if task_updated != 1:
            raise TransitionConflict(f"task {task_id} not in running/leased")
        
        # 4. 更新 attempt
        attempt_status = 'failed' if not error.retryable or current_attempt_count >= max_attempts else 'failed_retryable'
        attempt_updated = tx.execute("""
            UPDATE task_attempts
            SET status = ?, finished_at = ?, error_code = ?, error_message = ?
            WHERE attempt_id = ? AND fence_version = ? AND status = 'active'
        """, (attempt_status, now, error.code, error.message, attempt_id, fence_version)).rowcount
        
        if attempt_updated != 1:
            raise TransitionConflict(f"attempt {attempt_id} not active")
        
        # 5. event（actor 从函数参数）
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
            VALUES (?, ?, ?, 'attempt_failed', ?, ?)
        """, (task_id, attempt_id, now,
              json.dumps({
                  "status": attempt_status,
                  "retryable": error.retryable,
                  "attempt_count": current_attempt_count,
                  "max_attempts": max_attempts,
              }),
              worker_id))
        
        return True
```

### 4.3 retry_wait → queued（v0.6 修复 P1-5）

```python
def retry_wait_to_queued() -> int:
    """每个退避到期 task 独立短事务（v0.6 修复 P1-5：避免单事务批量阻塞）。
    
    v0.5 在单 IMMEDIATE 事务中批量处理，长时间占据 SQLite 单写锁。
    """
    now = ms_now()
    requeued = 0
    
    # 第一阶段：短事务选出候选（不持锁）
    with db.transaction("DEFERRED") as tx:
        candidates = tx.execute("""
            SELECT task_id FROM tasks
            WHERE status = 'retry_wait'
              AND next_attempt_at IS NOT NULL
              AND next_attempt_at <= ?
              AND cancel_requested_at IS NULL
            LIMIT 100
        """, (now,)).fetchall()
    
    candidate_ids = [row['task_id'] for row in candidates]
    
    # 第二阶段：每个 task 独立短事务
    for task_id in candidate_ids:
        try:
            if _retry_wait_one_to_queued(task_id, now):
                requeued += 1
        except TransitionConflict:
            continue
    
    return requeued


def _retry_wait_one_to_queued(task_id: str, now: int) -> bool:
    """单个 task 的 retry_wait → queued 转换。"""
    
    with db.transaction("IMMEDIATE") as tx:
        # 条件更新
        updated = tx.execute("""
            UPDATE tasks
            SET status = 'queued',
                next_attempt_at = NULL,
                updated_at = ?
            WHERE task_id = ?
              AND status = 'retry_wait'
              AND next_attempt_at IS NOT NULL
              AND next_attempt_at <= ?
        """, (now, task_id, now)).rowcount
        
        if updated != 1:
            return False
        
        # event
        tx.execute("""
            INSERT INTO task_events (task_id, at, event_type, payload_json, actor)
            VALUES (?, ?, 'retry_wait_to_queued', ?, 'system')
        """, (task_id, now, json.dumps({"task_id": task_id})))
        
        return True
```

### 4.4 CancelService 独立（v0.6 修复 P0-2：不可达状态）

**v0.5 问题**：`cancel_requested` 是不可达状态——reaper 只选 `leased`/`running`。

**v0.6 修复**：定义独立的 `CancelService`，三种取消路径：

```python
# CancelService 显式三路径

def cancel_queued_task(task_id: str, actor: str) -> bool:
    """queued → cancelled（不经过 cancel_requested）。"""
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # 直接 cancel queued
        updated = tx.execute("""
            UPDATE tasks
            SET status = 'cancelled',
                cancel_requested_at = ?,
                updated_at = ?
            WHERE task_id = ?
              AND status = 'queued'
              AND cancel_requested_at IS NULL
        """, (now, now, task_id)).rowcount
        
        if updated != 1:
            return False
        
        tx.execute("""
            INSERT INTO task_events (task_id, at, event_type, payload_json, actor)
            VALUES (?, ?, 'task_cancelled', ?, ?)
        """, (task_id, now, json.dumps({"from_status": "queued"}), actor))
        
        return True


def cancel_leased_or_running(task_id: str, actor: str) -> bool:
    """leased/running → cancel_requested（由 Driver interrupt 处理）。"""
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        current = tx.execute("""
            SELECT current_attempt_id, status FROM tasks WHERE task_id = ?
        """, (task_id,)).fetchone()
        
        if not current:
            return False
        
        if current['status'] not in ('leased', 'running'):
            return False
        
        attempt_id = current['current_attempt_id']
        
        # 设置 cancel_requested
        updated = tx.execute("""
            UPDATE tasks
            SET cancel_requested_at = ?,
                updated_at = ?
            WHERE task_id = ?
              AND status IN ('leased', 'running')
              AND cancel_requested_at IS NULL
        """, (now, now, task_id)).rowcount
        
        if updated != 1:
            return False
        
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
            VALUES (?, ?, ?, 'cancel_requested', ?, ?)
        """, (task_id, attempt_id, now,
              json.dumps({"current_status": current['status']}), actor))
        
        return True


def finalize_cancel_requested(task_id: str, attempt_id: str, actor: str) -> bool:
    """Driver interrupt 完成 → cancel_requested → cancelled。"""
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # task
        task_updated = tx.execute("""
            UPDATE tasks
            SET status = 'cancelled',
                worker_id = NULL,
                lease_token = NULL,
                lease_expires_at = NULL,
                current_attempt_id = NULL,
                updated_at = ?
            WHERE task_id = ?
              AND status IN ('leased', 'running', 'cancel_requested')
              AND cancel_requested_at IS NOT NULL
        """, (now, task_id)).rowcount
        
        if task_updated != 1:
            raise TransitionConflict(f"task {task_id} not in cancel_requested")
        
        # attempt
        attempt_updated = tx.execute("""
            UPDATE task_attempts
            SET status = 'cancelled',
                finished_at = ?
            WHERE attempt_id = ?
              AND status = 'active'
        """, (now, attempt_id)).rowcount
        
        if attempt_updated != 1:
            raise TransitionConflict(f"attempt {attempt_id} not active")
        
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
            VALUES (?, ?, ?, 'cancel_finalized', ?, ?)
        """, (task_id, attempt_id, now, json.dumps({}), actor))
        
        return True
```

**关键**：
- queued 直接 cancel（不需要 cancel_requested 中间态）
- leased/running 才走 cancel_requested，由 Driver interrupt 后调 `finalize_cancel_requested`
- CancelService 与 LeaseReaper 完全解耦

### 4.5 Reaper（v0.6 修复 P0-2：状态过滤 + event typo + 审计值）

```python
def reap_expired_leases() -> int:
    """回收过期 lease。每个 task 独立短事务（依赖 BEGIN IMMEDIATE 串行化）。
    
    v0.6 修复：
    1. 只选 leased/running，不再有 else 兜底误判
    2. event 名修正为 lease_expired_requeued
    3. 审计值记录原 lease_expires_at，而非 now
    4. 同时校验 lease_token 和 fence_version
    """
    now = ms_now()
    reaped = 0
    
    with db.transaction("DEFERRED") as tx:
        candidates = tx.execute("""
            SELECT task_id FROM tasks
            WHERE lease_expires_at IS NOT NULL
              AND lease_expires_at < ?
              AND status IN ('leased', 'running')
              AND cancel_requested_at IS NULL
            LIMIT 100
        """, (now,)).fetchall()
    
    candidate_ids = [row['task_id'] for row in candidates]
    
    for task_id in candidate_ids:
        try:
            if _reap_one(task_id, now):
                reaped += 1
        except TransitionConflict:
            continue  # renew 抢先了，正常
    
    return reaped


def _reap_one(task_id: str, now: int) -> bool:
    """处理单个 task 的过期。"""
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 读当前状态（含原 lease expiry）
        current = tx.execute("""
            SELECT current_attempt_id, status, lease_expires_at, lease_token, fence_version
            FROM tasks
            WHERE task_id = ?
        """, (task_id,)).fetchone()
        
        if not current:
            return False
        
        attempt_id = current['current_attempt_id']
        task_state = current['status']
        old_lease_expiry = current['lease_expires_at']
        lease_token = current['lease_token']
        fence_version = current['fence_version']
        
        if not attempt_id:
            return False
        
        # v0.6 修复：只接受 leased/running，不再有 else 兜底
        if task_state == 'leased':
            new_task_status = 'queued'
            new_attempt_status = 'expired'
        elif task_state == 'running':
            new_task_status = 'interrupted'
            new_attempt_status = 'interrupted'
        else:
            return False  # 其他状态（cancelled、cancel_requested）由 CancelService 处理
        
        # 2. 条件更新 task（v0.6：校验 5 元素）
        task_updated = tx.execute("""
            UPDATE tasks
            SET status = ?,
                worker_id = NULL,
                lease_token = NULL,
                lease_expires_at = NULL,
                current_attempt_id = NULL,
                updated_at = ?
            WHERE task_id = ?
              AND current_attempt_id = ?
              AND lease_token = ?
              AND fence_version = ?
              AND lease_expires_at = ?
              AND status = ?
              AND cancel_requested_at IS NULL
        """, (new_task_status, now, task_id, attempt_id, lease_token,
              fence_version, old_lease_expiry, task_state)).rowcount
        
        if task_updated != 1:
            return False  # renew 抢先了
        
        # 3. 条件更新 attempt
        attempt_updated = tx.execute("""
            UPDATE task_attempts
            SET status = ?, finished_at = ?
            WHERE attempt_id = ? AND status = 'active'
        """, (new_attempt_status, now, attempt_id)).rowcount
        
        if attempt_updated != 1:
            raise TransitionConflict(f"attempt {attempt_id} not active")
        
        # 4. event（v0.6 修复 typo + 审计值）
        event_type = 'lease_expired_requeued' if new_task_status == 'queued' else 'worker_lost_interrupted'
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
            VALUES (?, ?, ?, ?, ?, 'system')
        """, (task_id, attempt_id, now, event_type,
              json.dumps({"lease_expires_at_was": old_lease_expiry}),  # v0.6 修复：原 expiry 而非 now
              ))
        
        return True
```

### 4.6 Transaction Context Manager 契约

```python
class TransitionConflict(Exception):
    """条件更新失败，必须 rollback。"""
    pass


@contextmanager
def db.transaction(mode: str = "DEFERRED"):
    """明确的 rollback 契约：
    
    - 正常退出 → COMMIT
    - raise TransitionConflict → ROLLBACK
    - raise 其他异常 → ROLLBACK
    """
    tx = db.connection()
    tx.execute(f"BEGIN {mode}")
    ctx = _TransactionContext(tx)
    try:
        yield ctx
    except TransitionConflict:
        ctx.rollback()
        raise
    except Exception:
        ctx.rollback()
        raise
    else:
        ctx.commit()


class _TransactionContext:
    def __init__(self, tx):
        self._tx = tx
        self._finalized = False
    
    def execute(self, sql, params=()):
        return self._tx.execute(sql, params)
    
    def rollback(self):
        if not self._finalized:
            self._tx.execute("ROLLBACK")
            self._finalized = True
    
    def commit(self):
        if not self._finalized:
            self._tx.execute("COMMIT")
            self._finalized = True
```

### 4.7 取消语义统一

| 触发 | task 终态 | attempt 终态 | 处理者 |
|------|----------|-------------|--------|
| 用户取消 queued | `cancelled` | n/a | **CancelService.cancel_queued_task** |
| 用户取消 leased | `cancel_requested` → `cancelled` | `cancelled` | CancelService + Driver interrupt |
| 用户取消 running | `cancel_requested` → `cancelled` | `cancelled` | CancelService + Driver interrupt |
| Worker 失联 leased | `queued`（重试）| `expired` | **LeaseReaper** |
| Worker 失联 running | `interrupted` | `interrupted` | **LeaseReaper** |
| OOM / 不可恢复 | `failed` | `failed` | fail_attempt |
| 可重试错误 | `retry_wait` → `queued` | `failed_retryable` | fail_attempt + scheduler |
| 达 max_attempts | `failed` | `failed` | fail_attempt（v0.6 新增）|

---

## 5. Approval 状态机（v0.6 修复 P0-4）

### 5.1 v0.5 问题回顾

v0.5 三个 P0：
1. reconcile 可把同一 approval 回 pending（违反一次性消费）
2. `consume_approval` 的 WHERE 没绑定 `attempt_id`
3. Schema 移除 `rejected`/`expired`，30 秒固定 timeout

### 5.2 v0.6 新状态机

```
pending → approved → consuming → succeeded
                     │       ├──→ failed_final
                     │       └──→ unknown
                                │
                                ↓ supersedes_approval_id
                                ↓
                  （重试创建新 approval，原 approval 永不回 pending）
```

**恢复状态**（v0.6 新增）：
- `rejected`：用户拒绝
- `expired`：超过 expires_at
- `revoked`：用户主动撤销

### 5.3 idempotency capability

每种外部动作必须声明（**Stage 2 才需要**，Stage 1 read-only 不涉及）：

| capability | 含义 | 恢复策略 |
|------------|------|----------|
| `none` | 不可重放 | 必须人工 reconcile |
| `provider_key` | 供应方按 idempotency_key 去重 | 可重发（同 key）|
| `queryable_operation` | 供应方支持查询 | 可查询后再决定 |

### 5.4 Schema

```sql
CREATE TABLE approvals (
    approval_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,                       -- v0.6 新增：必须绑定 attempt
    
    -- action 元数据
    requested_action TEXT NOT NULL,
    action_params_json TEXT NOT NULL,
    action_params_hash TEXT NOT NULL,
    
    -- 链路
    supersedes_approval_id TEXT,                    -- v0.6 新增：重试链
    
    -- actor
    requested_by TEXT NOT NULL,
    decided_by TEXT,
    
    -- lifecycle
    requested_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    decided_at INTEGER,
    
    -- consumption
    status TEXT NOT NULL CHECK(status IN (
        'pending','approved','consuming',
        'succeeded','failed_final',
        'unknown','rejected','expired','revoked'   -- v0.6 新增 rejected/expired/revoked
    )),
    idempotency_key TEXT,
    idempotency_capability TEXT CHECK(
        idempotency_capability IS NULL OR
        idempotency_capability IN ('none','provider_key','queryable_operation')
    ),
    external_operation_id TEXT,
    consumed_at INTEGER,
    consumed_by_attempt_id TEXT,                    -- v0.6 改名强调绑定 attempt
    
    -- policy 绑定（v0.6 新增）
    policy_version TEXT NOT NULL,
    policy_decision_id TEXT NOT NULL,
    
    -- result
    execution_result TEXT,
    
    -- 防陈旧操作（v0.6 新增）
    status_version INTEGER NOT NULL DEFAULT 1,      -- ETag-like
    
    FOREIGN KEY (task_id) REFERENCES tasks(task_id),
    FOREIGN KEY (attempt_id) REFERENCES task_attempts(attempt_id),
    FOREIGN KEY (supersedes_approval_id) REFERENCES approvals(approval_id)
);

-- v0.6 新增：同一 approval 只能被一个 attempt 消费
CREATE UNIQUE INDEX idx_approvals_one_consume
    ON approvals(approval_id) WHERE consumed_at IS NOT NULL;

-- v0.6 新增：attempt + status 复合唯一（防并发 consume）
CREATE UNIQUE INDEX idx_approvals_attempt_status
    ON approvals(attempt_id, action_params_hash) 
    WHERE status IN ('approved', 'consuming');
```

### 5.5 consume / complete / reconcile / supersede

```python
def consume_approval(approval_id: str, attempt_id: str, idempotency_key: str,
                     worker_id: str) -> ApprovalRef:
    """approved → consuming。v0.6 绑定 attempt_id + policy_version。
    
    v0.6 修复 P0-4：
    1. WHERE 校验 attempt_id
    2. WHERE 校验 policy_version + policy_decision_id
    3. action_params_hash 重新校验
    """
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # 读当前 approval（绑定 attempt_id 校验）
        approval = tx.execute("""
            SELECT approval_id, attempt_id, action_params_hash,
                   policy_version, policy_decision_id, expires_at,
                   idempotency_capability, status, status_version
            FROM approvals
            WHERE approval_id = ?
        """, (approval_id,)).fetchone()
        
        if approval is None:
            raise ApprovalNotFound(approval_id)
        
        # v0.6 修复 P0-4 证据二：attempt_id 必须匹配
        if approval['attempt_id'] != attempt_id:
            raise ApprovalAttemptMismatch(approval_id, attempt_id)
        
        # 原子条件更新
        updated = tx.execute("""
            UPDATE approvals
            SET status = 'consuming',
                consumed_at = ?,
                consumed_by_attempt_id = ?,
                idempotency_key = ?,
                status_version = status_version + 1
            WHERE approval_id = ?
              AND attempt_id = ?
              AND status = 'approved'
              AND expires_at > ?
              AND action_params_hash = ?
              AND policy_version = ?
              AND policy_decision_id = ?
              AND status_version = ?
        """, (now, attempt_id, idempotency_key,
              approval_id, attempt_id, now,
              approval['action_params_hash'],
              approval['policy_version'],
              approval['policy_decision_id'],
              approval['status_version'])).rowcount
        
        if updated != 1:
            raise ApprovalNotAvailable(approval_id)
        
        tx.execute("""
            INSERT INTO audit_log (at, actor, action, target, payload_json, result)
            VALUES (?, ?, 'approval_consuming', ?, ?, 'pending')
        """, (now, worker_id, approval_id,
              json.dumps({"attempt_id": attempt_id, "idempotency_key": idempotency_key})))
        
        return ApprovalRef(approval_id, attempt_id, idempotency_key,
                          approval['idempotency_capability'])


def complete_approval(approval_id: str, attempt_id: str, success: bool,
                     result_msg: str, worker_id: str) -> bool:
    """consuming → succeeded / failed_final。"""
    now = ms_now()
    new_status = 'succeeded' if success else 'failed_final'
    
    with db.transaction("IMMEDIATE") as tx:
        updated = tx.execute("""
            UPDATE approvals
            SET status = ?,
                execution_result = ?,
                decided_at = ?,
                status_version = status_version + 1
            WHERE approval_id = ? AND attempt_id = ? AND status = 'consuming'
        """, (new_status, result_msg, now, approval_id, attempt_id)).rowcount
        
        if updated != 1:
            raise InconsistentState(f"approval {approval_id} not consuming")
        
        tx.execute("""
            INSERT INTO audit_log (at, actor, action, target, payload_json, result)
            VALUES (?, ?, 'approval_completed', ?, ?, ?)
        """, (now, worker_id, approval_id,
              json.dumps({"status": new_status, "result": result_msg}),
              "success"))
        
        return True


def reject_approval(approval_id: str, reason: str, actor: str) -> bool:
    """pending → rejected（v0.6 新增）。"""
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        updated = tx.execute("""
            UPDATE approvals
            SET status = 'rejected',
                decided_at = ?,
                decided_by = ?,
                execution_result = ?,
                status_version = status_version + 1
            WHERE approval_id = ? AND status = 'pending'
        """, (now, actor, reason, approval_id)).rowcount
        
        if updated != 1:
            return False
        
        tx.execute("""
            INSERT INTO audit_log (at, actor, action, target, payload_json, result)
            VALUES (?, ?, 'approval_rejected', ?, ?, 'success')
        """, (now, actor, approval_id, json.dumps({"reason": reason})))
        
        return True


def expire_approvals() -> int:
    """pending 超过 expires_at → expired（v0.6 新增，调度器定期调用）。"""
    now = ms_now()
    expired = 0
    
    with db.transaction("IMMEDIATE") as tx:
        candidates = tx.execute("""
            SELECT approval_id FROM approvals
            WHERE status = 'pending' AND expires_at <= ?
            LIMIT 100
        """, (now,)).fetchall()
        
        for row in candidates:
            aid = row['approval_id']
            updated = tx.execute("""
                UPDATE approvals
                SET status = 'expired',
                    decided_at = ?,
                    execution_result = 'expired by deadline',
                    status_version = status_version + 1
                WHERE approval_id = ? AND status = 'pending'
            """, (now, aid)).rowcount
            
            if updated == 1:
                tx.execute("""
                    INSERT INTO audit_log (at, actor, action, target, payload_json, result)
                    VALUES (?, 'system', 'approval_expired', ?, ?, 'success')
                """, (now, aid, json.dumps({"auto_expired": True})))
                expired += 1
    
    return expired


def reconcile_unknown_approval(approval_id: str, attempt_id: str,
                              new_status: str, reason: str, actor: str,
                              expected_status_version: int) -> bool:
    """unknown → succeeded / failed_final（v0.6 防陈旧）。
    
    v0.6 修复：
    1. 永不回 pending
    2. status_version ETag 防陈旧
    3. UI 必须先 GET 当前 version，再 PUT
    """
    if new_status not in ('succeeded', 'failed_final'):
        raise ValueError(f"reconcile can only target succeeded/failed_final, got {new_status}")
    
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        updated = tx.execute("""
            UPDATE approvals
            SET status = ?,
                execution_result = ?,
                decided_at = ?,
                decided_by = ?,
                status_version = status_version + 1
            WHERE approval_id = ? AND attempt_id = ?
              AND status = 'unknown'
              AND status_version = ?
        """, (new_status, reason, now, actor,
              approval_id, attempt_id, expected_status_version)).rowcount
        
        if updated != 1:
            raise StaleReconcileAttempt(approval_id, expected_status_version)
        
        tx.execute("""
            INSERT INTO audit_log (at, actor, action, target, payload_json, result)
            VALUES (?, ?, 'approval_reconciled', ?, ?, 'success')
        """, (now, actor, approval_id,
              json.dumps({"new_status": new_status, "reason": reason,
                         "expected_status_version": expected_status_version})))
        
        return True


def supersede_approval(old_approval_id: str, new_action_params: dict,
                       actor: str, policy_version: str) -> str:
    """从 unknown 创建重试 approval（v0.6 永不回 pending）。
    
    v0.6 修复 P0-4 证据一：旧 approval 保持 unknown/consuming，
    新 approval 通过 supersedes_approval_id 建立链。
    """
    now = ms_now()
    new_id = str(uuid4())
    new_params_hash = canonical_hash(new_action_params)
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 读旧 approval
        old = tx.execute("""
            SELECT task_id, attempt_id, requested_action, policy_decision_id
            FROM approvals WHERE approval_id = ?
        """, (old_approval_id,)).fetchone()
        
        if not old:
            raise ApprovalNotFound(old_approval_id)
        
        # 2. 创建新 approval
        tx.execute("""
            INSERT INTO approvals (
                approval_id, task_id, attempt_id,
                requested_action, action_params_json, action_params_hash,
                supersedes_approval_id,
                requested_by,
                requested_at, expires_at,
                status,
                policy_version, policy_decision_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        """, (new_id, old['task_id'], old['attempt_id'],
              old['requested_action'],
              json.dumps(new_action_params, sort_keys=True),
              new_params_hash,
              old_approval_id,
              actor, now, now + APPROVAL_TTL_MS,
              policy_version, old['policy_decision_id']))
        
        # 3. audit
        tx.execute("""
            INSERT INTO audit_log (at, actor, action, target, payload_json, result)
            VALUES (?, ?, 'approval_superseded', ?, ?, 'success')
        """, (now, actor, old_approval_id,
              json.dumps({"new_approval_id": new_id, "supersedes": old_approval_id})))
        
        return new_id
```

### 5.6 Policy Engine 与 Approval（v0.6 修复 P0-3）

```python
def decide(actor: Identity, requested_action: str, resource: Resource,
           context: Context) -> PolicyDecision:
    """v0.6 强制判定顺序（修复 P0-3）：
    
    1. 不在 max_permissions → deny（不可被 approval 扩权）
    2. 在 max_permissions 且需 approval → needs_approval
    3. 在 max_permissions 且无需 approval → allow
    """
    
    max_permissions = compute_max_permissions(actor, resource)
    max_permissions = apply_restrictions(max_permissions, context)
    
    if requested_action not in max_permissions:
        # v0.6 修复：deny 永远不能被 approval 扩权
        return PolicyDecision(
            decision="deny",
            reason="outside maximum authority",
            policy_version=POLICY_VERSION,
            matched_rules=["max_authority_check"],
            decision_id=str(uuid4()),
            expires_at=ms_now() + 60000,
            constraints={},
        )
    
    if requires_approval(requested_action, context):
        return PolicyDecision(
            decision="needs_approval",
            reason="allowed but consequential",
            policy_version=POLICY_VERSION,
            matched_rules=["approval_required"] + get_matched_rules(context),
            decision_id=str(uuid4()),
            expires_at=ms_now() + APPROVAL_DECISION_TTL_MS,
            constraints=get_approval_constraints(requested_action),
        )
    
    return PolicyDecision(
        decision="allow",
        reason="within authority and no approval required",
        policy_version=POLICY_VERSION,
        matched_rules=[],
        decision_id=str(uuid4()),
        expires_at=ms_now() + 60000,
        constraints={},
    )
```

**Stage 1 read-only**：所有 allowed action 都不需要 approval（`requires_approval` 在 Stage 1 返回 False）。

### 5.7 Approval Stage 边界

- **Stage 1（read-only research MVP）**：不需要 Approval，Schema 表存在但不写入
- **Stage 2（durable control plane）**：激活 Approval，包括 reconcile UI、supersede 链
- 提前建表是为了 v0.6 已经支持所有 decision 类型

---

## 6. EgressFetcher（v0.6 修复 P0-5）

### 6.1 选型决策（v0.6 修订）

v0.6 **不发明 HTTP 客户端**。选型优先级：

```text
A. 独立 Egress Proxy/Fetcher + 网络策略       推荐长期方案
B. 成熟 HTTP 栈 + 可测试的 pinned resolver    Stage 1 可接受
C. 手写 asyncio HTTP/1.1                      不建议（v0.5 选 C 失败）
```

**Stage 1 选 B**：使用 `httpx` 作为 HTTP 栈，自定义 DNS resolver 实现 pinned-IP。

### 6.2 实现

```python
# harness/egress.py
import socket
import ssl
import ipaddress
import httpx
from urllib.parse import urlparse, urljoin

BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # 包含 169.254.169.254 metadata
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),  # CGNAT
    ipaddress.ip_network("224.0.0.0/4"),    # multicast
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("fc00::/7"),       # IPv6 ULA
    ipaddress.ip_network("::ffff:0:0/96"),  # IPv4-mapped IPv6
]

MAX_REDIRECTS = 5
DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
MAX_BYTES = 10_000_000


def is_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if not ip.is_global:
        return True
    return any(ip in net for net in BLOCKED_NETWORKS)


class PinnedDNSResolver(httpx.AsyncResolver):
    """自定义 DNS resolver：解析后固定 IP，防止 DNS rebinding。
    
    httpx 默认会按 hostname 重解析，本 resolver 把解析结果绑定到 IP。
    """
    
    def __init__(self):
        super().__init__()
    
    async def resolve(self, host, port=0, family=None):
        # 解析所有 IP
        infos = socket.getaddrinfo(host, port or 443,
                                   type=socket.SOCK_STREAM)
        
        # 校验所有 IP
        valid_ips = []
        for family_, _, _, _, sockaddr in infos:
            ip = ipaddress.ip_address(sockaddr[0])
            if is_blocked(ip):
                raise SSRFError(f"blocked IP for {host}: {ip}")
            valid_ips.append(sockaddr[0])
        
        # 返回 SOCK_STREAM addresses
        # httpx 期望的格式：list of (host, port, family, ...)
        return [
            (ip, port or (443 if family == socket.AF_INET6 or "https" else 80),
             family, None, None)
            for ip, family in [(ip, family_) for family_, _, _, _, sockaddr in infos
                                for ip in [sockaddr[0]]]
            if not is_blocked(ipaddress.ip_address(ip))
        ]


class EgressFetcher:
    """Stage 1 read-only Egress 客户端，基于 httpx + pinned resolver。"""
    
    def __init__(self,
                 max_bytes: int = MAX_BYTES,
                 max_redirects: int = MAX_REDIRECTS,
                 blocked_networks: list = BLOCKED_NETWORKS):
        self.max_bytes = max_bytes
        self.max_redirects = max_redirects
        self.blocked_networks = blocked_networks
        
        # httpx transport with pinned resolver
        self._resolver = PinnedDNSResolver()
        self._transport = httpx.AsyncHTTPTransport(
            resolver=self._resolver,
            retries=0,  # EgressFetcher 自己处理重定向
        )
        self._client = httpx.AsyncClient(
            transport=self._transport,
            timeout=DEFAULT_TIMEOUT,
            follow_redirects=False,  # 自己处理重定向
            verify=True,  # 默认校验 TLS
        )
    
    async def fetch(self, url: str, *,
                    original_scheme: str = None,
                    redirect_count: int = 0,
                    audit_chain: list[str] = None) -> FetchResult:
        """SSRF 防护 + 限重定向 + 流式字节限制。"""
        
        if audit_chain is None:
            audit_chain = [url]
        elif len(audit_chain) > self.max_redirects + 1:
            raise SSRFError(f"redirect chain > {self.max_redirects}")
        
        # 1. 解析 URL
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise SSRFError(f"scheme {parsed.scheme} not allowed")
        
        # 2. 防 scheme downgrade
        if original_scheme == "https" and parsed.scheme == "http":
            raise SSRFError("scheme downgrade https→http not allowed")
        
        # 3. 防凭据跨 origin
        if parsed.username or parsed.password:
            raise SSRFError("credentials in URL not allowed")
        
        # 4. 重定向时重新校验 redirect_count
        if redirect_count >= self.max_redirects:
            raise SSRFError(f"max redirects ({self.max_redirects}) exceeded")
        
        try:
            # 5. 流式 GET
            async with self._client.stream("GET", url) as resp:
                # 6. 实际 peer IP 校验
                if resp.extensions and "peer" in resp.extensions:
                    peer_ip = resp.extensions["peer"]["ip"]
                    if is_blocked(ipaddress.ip_address(peer_ip)):
                        raise SSRFError(f"blocked peer IP: {peer_ip}")
                
                # 7. 状态码处理
                if resp.status_code in (301, 302, 303, 307, 308):
                    location = resp.headers.get("location", "")
                    if not location:
                        raise SSRFError("redirect without Location")
                    new_url = urljoin(url, location)  # urljoin 解析相对路径
                    
                    # 凭据跨 origin 拒绝
                    if parsed.username and urlparse(new_url).netloc != parsed.netloc:
                        raise SSRFError("credentials cannot cross origin redirect")
                    
                    await resp.aclose()
                    return await self.fetch(
                        new_url,
                        original_scheme=original_scheme or parsed.scheme,
                        redirect_count=redirect_count + 1,
                        audit_chain=audit_chain + [new_url],
                    )
                
                if resp.status_code >= 400:
                    await resp.aclose()
                    raise FetchError(f"HTTP {resp.status_code}")
                
                # 8. 流式读取 + max+1 检测
                content = bytearray()
                async for chunk in resp.aiter_bytes(chunk_size=8192):
                    content.extend(chunk)
                    if len(content) > self.max_bytes:
                        await resp.aclose()
                        raise SSRFError(f"response > {self.max_bytes}")
                
                content_bytes = bytes(content)
                
                return FetchResult(
                    content=content_bytes,
                    content_hash=sha256(content_bytes).hexdigest(),
                    media_type=resp.headers.get("content-type", ""),
                    bytes=len(content_bytes),
                    source_url=url,
                    redirect_chain=audit_chain,
                )
        
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise SSRFError(f"connection failed: {e}")
        except ssl.SSLError as e:
            raise SSRFError(f"TLS failed: {e}")


@dataclass
class FetchResult:
    content: bytes
    content_hash: str
    media_type: str
    bytes: int
    source_url: str
    redirect_chain: list[str]
```

**关键修复**（v0.6 P0-5）：
- **不发明 HTTP 客户端**，用 `httpx` + 自定义 resolver
- `socket.getaddrinfo` 在自定义 resolver 中调用，不会因 `port or 443` 而把 http:// 连 443（httpx 会按 URL scheme 决定端口）
- `verify=True` 默认校验 TLS
- 流式读取 + max+1 检测
- peer IP 校验
- 重定向 5 次限制 + 链式审计
- 凭据禁止跨 origin

### 6.3 测试覆盖

```python
# tests/test_egress.py

async def test_http_default_port():
    """http://example.com 应连 80，不是 443。"""

async def test_https_default_port():
    """https://example.com 应连 443。"""

async def test_dns_rebinding_blocked():
    """pinned resolver 在 transport 层绑定 IP，httpx 不会重解析。"""

async def test_redirect_loop_blocked():
    """A → B → A → ... > 5 次拒绝。"""

async def test_relative_location_resolved():
    """/path 必须用 urljoin 解析。"""

async def test_https_to_http_downgrade_blocked():
    """https 重定向到 http 拒绝。"""

async def test_credentials_cross_origin_blocked():
    """user:pass@host1 重定向到 host2 拒绝。"""

async def test_ipv4_mapped_ipv6_blocked():
    """::ffff:127.0.0.1 必须拒绝。"""

async def test_metadata_endpoint_blocked():
    """169.254.169.254 必须拒绝。"""

async def test_max_plus_one_truncates():
    """> 10MB 立即断开。"""

async def test_gzip_bomb_blocked():
    """Content-Encoding: gzip 解压后 > 10MB 必须拒绝（httpx 自动解压，需 post-decompress check）。"""

async def test_chunked_encoding_handled():
    """Transfer-Encoding: chunked 必须正确解析。"""

async def test_tls_hostname_verification():
    """证书不匹配 host 必须拒绝。"""
```

---

## 7. Codex SDK 集成（v0.6 修复 P0-6）

### 7.1 v0.5 问题

v0.5 附录 A 用 `import codex_sdk` 等不存在的 API。官方 Python SDK 是 `from openai_codex import AsyncCodex, Codex, Sandbox`。

### 7.2 v0.6 决策：M0 spike 后再锁定

**v0.6 不写死主 Driver**。三个候选：

```text
CodexSdkDriver        简单自动化 API，能力以 stable SDK 实测为准
CodexAppServerDriver  深度生命周期控制，本地 stdio/Unix only
CodexExecDriver       bounded job/fallback，不承担深度 approval lifecycle
```

**M0 spike 任务**：用真实 `openai-codex` 包生成/读取类型与接口，决策主 Driver。

### 7.3 Driver 接口骨架（v0.6）

```python
# harness/drivers/base.py

@dataclass
class DriverCapabilities:
    driver_id: str
    driver_version: str
    protocol_version: int
    supports_resume: bool
    supports_interrupt: bool
    supports_streaming: bool
    supports_fork: bool
    supports_structured_output: bool
    source_protocol: str  # "exec_jsonl" / "app_server_jsonrpc" / "sdk_python"


class UnsupportedCapability(Exception):
    """Driver 显式声明能力不可用。"""
    pass


class ExecutionDriver(Protocol):
    """v0.6 接口骨架。
    
    关键约束：
    1. capabilities() 必须报告实测通过的能力；未验证返回 UnsupportedCapability
    2. start/resume 返回 ExternalRunRef（持久化）
    3. interrupt 是请求已接受，不保证立即停止
    4. terminal result 是唯一完成信号
    5. event cursor/replay 必须支持
    6. 同一 ExternalRunRef 不允许跨 Driver resume
    """
    
    def capabilities(self) -> DriverCapabilities: ...
    
    async def start(self, execution: ExecutionRequest) -> ExternalRunRef: ...
    
    async def resume(self, ref: ExternalRunRef, input: TurnInput) -> ExternalRunRef: ...
    
    async def interrupt(self, ref: ExternalRunRef) -> None: ...
    
    async def stream_events(self, ref: ExternalRunRef, 
                           cursor: Optional[EventCursor] = None) -> AsyncIterator[DriverEvent]: ...
    
    async def collect_artifacts(self, ref: ExternalRunRef) -> list[ArtifactRef]: ...
```

### 7.4 CodexSdkDriver 草案（v0.6：伪代码，待 M0 spike 验证）

```python
# harness/drivers/codex_sdk.py
# v0.6 NOTE: 这是伪代码 + 未验证 capability，必须 M0 spike 验证。
# 实际 API 必须从已安装的 openai_codex 包生成。

from openai_codex import AsyncCodex, Codex, Sandbox  # 官方 API（M0 spike 验证）


class CodexSdkDriver:
    def __init__(self, sdk_version: str = "0.1.0"):
        self._sdk_version = sdk_version
        self._protocol_version = 1
        self._capabilities = DriverCapabilities(
            driver_id="codex_sdk",
            driver_version=sdk_version,
            protocol_version=1,
            supports_resume=True,
            supports_interrupt=True,
            supports_streaming=True,
            supports_fork=True,
            supports_structured_output=True,
            source_protocol="sdk_python",
        )
    
    def capabilities(self) -> DriverCapabilities:
        return self._capabilities
    
    async def start(self, execution: ExecutionRequest) -> ExternalRunRef:
        async with AsyncCodex() as codex:
            thread = await codex.thread_start(
                input=execution.input_text,
                sandbox=Sandbox.workspace_read(),  # Stage 1 只读
            )
            return ExternalRunRef(
                driver_id="codex_sdk",
                driver_version=self._sdk_version,
                protocol_version=self._protocol_version,
                external_thread_id=thread.id,
                external_turn_id=None,
                source_protocol="sdk_python",
                metadata={"model": execution.model_tier},
            )
    
    async def resume(self, ref: ExternalRunRef, input: TurnInput) -> ExternalRunRef:
        async with AsyncCodex() as codex:
            thread = codex.resume_thread(thread_id=ref.external_thread_id)
            new_turn = await thread.run(input=input.text)
            return ExternalRunRef(
                driver_id=ref.driver_id,
                driver_version=ref.driver_version,
                protocol_version=ref.protocol_version,
                external_thread_id=ref.external_thread_id,
                external_turn_id=new_turn.id,
                source_protocol=ref.source_protocol,
                metadata=ref.metadata,
            )
    
    async def interrupt(self, ref: ExternalRunRef) -> None:
        async with AsyncCodex() as codex:
            await codex.interrupt_thread(ref.external_thread_id)
    
    async def stream_events(self, ref: ExternalRunRef,
                           cursor: Optional[EventCursor] = None) -> AsyncIterator[DriverEvent]:
        async with AsyncCodex() as codex:
            thread = codex.resume_thread(thread_id=ref.external_thread_id)
            async for raw_event in thread.events(cursor=cursor):
                yield self._normalize_event(raw_event, ref)
    
    async def collect_artifacts(self, ref: ExternalRunRef) -> list[ArtifactRef]:
        async with AsyncCodex() as codex:
            thread = codex.resume_thread(thread_id=ref.external_thread_id)
            items = await thread.items()
            return [
                ArtifactRef(
                    artifact_id=str(uuid4()),
                    type=item.type,
                    content_hash=item.content_hash,
                    producer_workflow=ref.metadata.get("workflow_id"),
                    producer_workflow_version=ref.metadata.get("workflow_version"),
                    producer_driver=f"{ref.driver_id}@{ref.driver_version}",
                    source_url=item.source_url,
                    parent_artifact_ids=[],
                    visibility="private",
                    retention_policy="permanent",
                    sensitivity="internal",
                    preview_type=item.preview_type,
                    created_at=ms_now(),
                )
                for item in items
                if item.is_artifact
            ]
    
    def _normalize_event(self, raw_event, ref: ExternalRunRef) -> DriverEvent:
        """Codex SDK event → Harness EventEnvelope。
        
        v0.6 修复：事件协议由 source_protocol 决定，避免混用。
        """
        return DriverEvent(
            event_id=str(uuid4()),
            event_version=1,
            source_protocol="sdk_python",
            source_event_id=raw_event.id,
            source_sequence=raw_event.sequence,
            task_id=ref.metadata.get("task_id"),
            attempt_id=ref.metadata.get("attempt_id"),
            workflow_run_id=ref.metadata.get("workflow_run_id"),
            driver_ref=ref,
            event_type=raw_event.type,
            occurred_at=raw_event.timestamp_ms,
            ingested_at=ms_now(),
            actor="codex_sdk",
            causation_id=raw_event.causation_id,
            correlation_id=raw_event.correlation_id,
            trace_id=ref.external_thread_id,
            payload_schema=raw_event.schema_id,
            payload=raw_event.to_whitelisted_dict(),  # v0.6：白名单过滤
            dedupe_key=f"codex_sdk:{ref.external_thread_id}:{raw_event.sequence}",
            redaction_version=REDACTION_RULES_VERSION,
        )
```

**v0.6 关键标注**：以上是伪代码。M0 spike 必须用真实 `openai-codex` 包验证每个 API 的存在性与行为。

### 7.5 Codex App Server 边界

- Stage 1 仅本地 stdio 或 Unix socket
- **不**通过 Tailscale 暴露 App Server
- 远程 WebSocket 仍标记为实验性，不进入生产
- `codex mcp-server` 已被官方弃用，不作为执行内核

---

## 8. Stage 1：Read-only Research MVP（v0.6 收敛）

### 8.1 Stage 1 范围

| 项 | 状态 |
|----|------|
| Durable Kernel（task/attempt/event/approval Schema） | ✅ MVP 必做（approval Schema 建但不写入）|
| PolicyDecisionPoint（Stage 1 allow/deny，无 approval） | ✅ MVP 必做 |
| typed EventSink | ✅ MVP 必做 |
| typed ArtifactStore | ✅ MVP 必做 |
| ExecutionDriver SPI（接口定义） | ✅ MVP 必做 |
| **CodexSdkDriver / CodexAppServerDriver / CodexExecDriver（M0 spike 锁定）** | ✅ MVP 必做 |
| **Research WorkflowPack（read-only）** | ✅ MVP 必做 |
| **5 个只读 ToolProvider**（web.search / web.fetch / audio.transcribe / note.read / artifact.write）| ✅ MVP 必做 |
| **EgressFetcher（httpx + pinned resolver）** | ✅ MVP 必做 |
| Tailscale 入口 | ✅ MVP 必做 |
| 文字 UI（仅表单 + 列表） | ✅ MVP 必做（**不**做 schema-driven 通用 UI）|
| Backup Service（HK03） | ✅ MVP 必做 |
| observability（最小指标）| ✅ MVP 必做 |
| **external write tools** | ⛔ M2 |
| **Approval reconcile UI** | ⛔ M2 |
| **schema-driven UI** | ⛔ M2/M3 |
| **CapabilityRouter** | ⛔ M3 |
| **Workflow Catalog** | ⛔ M3 |
| 语音 / Web Push / PWA | ⛔ Stage 3+ |
| 第二 Driver | ⛔ M3 |

### 8.2 Stage 1 工程量

| 里程碑 | 内容 | 周期 |
|--------|------|------|
| M0 | Integration Proof（Codex spike + 修 6 P0 + 6 接口契约设计）| 2-3 周 |
| M1 | Read-only Research MVP | 6-9 周 |
| M2 | Durable Control Plane | 4-6 周 |
| M3 | 证明扩展性 | 2-3 周 |

**Stage 1 总投入**：**6-9 周（基准）**。

---

## 9. 关键里程碑详细计划

### M0：Integration Proof（v0.6 优先级最高）

**目标**：决策主 Driver，修 P0，建立可复现的契约测试。

任务清单：

- [ ] **Codex 能力 spike**：
  - 安装 `openai-codex`（验证包名）
  - 用 `AsyncCodex` 跑 start / run / resume / interrupt
  - 用 `codex exec --json` 跑一轮 event capture
  - 用 Codex App Server（本地 stdio）跑一轮 event capture
  - 决策主 Driver，记录 decision_id + evidence
- [ ] **claim SQL 真实 SQLite 测试**：
  - 在 `python:3.11-slim` 镜像里跑 10 次连续 claim
  - 验证 attempt_no 单调递增
  - 验证 MAX_ATTEMPTS 后转 failed
- [ ] **CancelService 不变量测试**：
  - queued cancel 直接 cancelled
  - leased cancel → cancel_requested → cancelled
  - cancel + lease 过期竞态
- [ ] **PolicyEngine 单向权限验证**：
  - approve 永远不能把 deny 变 allow
  - 高风险且在 max → needs_approval
- [ ] **Approval supersede 链验证**：
  - old approval 永不回 pending
  - new approval 通过 supersedes_approval_id 建立链
- [ ] **EgressFetcher 网络测试**：
  - httpx + pinned resolver
  - DNS rebinding / IPv4-mapped IPv6 / 重定向环 / gzip bomb / chunked
- [ ] **六个接口契约设计**：
  - 每个接口写 contract test 模板
  - mock 第二 Driver / 第二 Pack，验证 kernel 零修改

**M0 退出标准**：所有 6 P0 + 高优先级 P1 有真实测试通过，决策主 Driver，记录在 `docs/m0-evidence/`。

### M1：Read-only Research MVP

**目标**：手机派一个研究任务，一小时内看到报告，**无外部副作用**。

- [ ] Durable Kernel（task/attempt/event）
- [ ] 1 个 Driver（M0 spike 锁定）
- [ ] 1 个 Research WorkflowPack
- [ ] 5 个只读 ToolProvider
- [ ] typed ArtifactStore
- [ ] Tailscale UI
- [ ] Backup（HK03） + 真实恢复 spike
- [ ] 最小 observability

**M1 退出标准**：20 个真实研究任务通过验收（手机派发 → 一小时内报告可见），kill/restart 后 task/attempt/event/driver ref 可恢复。

### M2：Durable Control Plane

- [ ] Approval 状态机激活（含 reconcile UI）
- [ ] external write ToolProvider（video.publish、email.send）
- [ ] observability 完整化（metrics + alerts + runbook）
- [ ] backup/restore 流程化

### M3：证明扩展性

- [ ] 增加第二 WorkflowPack 或 Driver
- [ ] 真实 conformance suite（不依赖 mock/grep）
- [ ] 验证扩展性测试（kernel 零修改）

---

## 10. 状态不变量（v0.6 关键）

### 10.1 不变量集合

```text
I1:  一个 task 最多一个 active attempt
I2:  task.current_attempt_id 非空时指向 active attempt
I3:  terminal task 不持有 lease
I4:  succeeded task 对应唯一 succeeded attempt
I5:  retry_wait 对应最近 failed_retryable attempt
I6:  cancelled task 不再接受 submit/renew
I7:  approval 只能消费一次（consume SQL 绑定 attempt_id）
I8:  deny 永远不能被 approval 扩权
I9:  event dedupe_key 在同一 driver/protocol 内唯一
I10: artifact content_hash 与正文一致
```

### 10.2 不变量测试

为每条不变量写：
1. 数据库 property test（随机生成状态序列，验证不变量）
2. 故障注入测试（kill -9 在每个跨系统写入点）

---

## 11. 测试与验收

### 11.1 规范代码可执行性测试（v0.6 新增）

PRD 中所有 executable example 必须进入 `examples/` 或 `spikes/`，CI 实际执行：

- [ ] SQLite schema + transition SQL integration test
- [ ] Python snippets import/compile
- [ ] Docker/Compose config validation
- [ ] GitHub Actions lint
- [ ] shellcheck
- [ ] generated app-server schema compatibility test

### 11.2 Codex adapter conformance suite

同一套测试运行在 CodexSdkDriver、CodexAppServerDriver、CodexExecDriver：
- start / resume / interrupt / stream / structured output
- event ordering / replay / dedupe
- approval pause/resume
- process crash / runtime upgrade
- malformed/unknown event
- sandbox escalation rejection

不支持的能力必须返回 `UnsupportedCapability`，**不**静默降级。

### 11.3 安全与混沌测试

- [ ] policy deny + approval 绕过
- [ ] stale approval / ETag
- [ ] Driver 事件含 secret / 超大 payload
- [ ] EgressFetcher DNS/peer/redirect/timeout/zip bomb
- [ ] artifact symlink/swap/orphan
- [ ] SQLite lock contention / WAL / disk full
- [ ] kill -9 在每个跨系统写入点
- [ ] backup 成功但 restore 失败
- [ ] GHCR/digest/signature 不匹配

### 11.4 进入 Stage 1 的硬门槛（v0.6 明确）

```text
1. PRD 中所有 executable example 进入 CI 并通过
2. 6 P0 全部有复现测试和修复证据
3. SDK/AppServer/exec 能力矩阵由真实 runtime 产生
4. read-only research vertical slice 从手机到 artifact 跑通
5. kill/restart 后 task/attempt/event/driver ref 可恢复
6. backup 在隔离环境真实 restore 成功
7. deny 无法被 approval 扩权
8. EgressFetcher 通过网络安全测试集
```

---

## 12. 部署与运维（v0.6 canonical）

### 12.1 进程管理

```text
systemd 管理 docker compose stack
└── Compose 管理所有服务（control / worker 同 image）
    └── lifespan 启动 scheduler
```

### 12.2 不可变镜像 + GitHub-hosted CI（v0.6 修复 P1-6）

```yaml
# .github/workflows/build.yml
name: build
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3  # v0.6 新增：GHCR login
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/setup-buildx-action@v3  # v0.6 新增：buildx
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/cscoheru/harness-control:${{ github.sha }}
          # v0.6 不打 latest，只打 commit SHA
      - name: Generate digest
        id: digest
        run: echo "digest=$(docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/cscoheru/harness-control:${{ github.sha }})" >> $GITHUB_OUTPUT
      - name: Sign image (cosign)
        run: |
          echo "${{ steps.digest.outputs.digest }}" > digest.txt
          cosign sign --yes "${{ steps.digest.outputs.digest }}"
      - uses: actions/attest-build-provenance@v1  # v0.6 新增：attestation
        with:
          subject-name: ghcr.io/cscoheru/harness-control
          subject-digest: ${{ steps.digest.outputs.digest }}
          push-to-registry: true
```

**部署**：newvps 只拉取固定 digest + 验证签名：

```bash
DIGEST=sha256:abc123...
cosign verify --certificate-identity-regexp "https://github.com/cscoheru" \
              ghcr.io/cscoheru/harness-control@$DIGEST
docker pull ghcr.io/cscoheru/harness-control@$DIGEST
```

### 12.3 Alembic + expand/contract migration

- 所有 migration forward-only
- 紧急回滚 = 应用降级 + DB schema 保留（v1 忽略新列）
- 不承诺"downgrade 恢复数据"

### 12.4 启动顺序

```text
1. systemd 启动 harness-stack.service
2. harness-stack.service 启动 docker compose stack
3. Compose 启动 control
4. control 启动：alembic upgrade head → lifespan scheduler
5. scheduler 启动 retry_wait_to_queued + reap_expired_leases + cancel_service + expire_approvals
6. Tailscale Serve（独立 systemd unit）转发到 control:8080
7. Backup timer（独立 systemd unit）每 6h 触发 backup container
```

### 12.5 Backup E2E（v0.6 修复 P1-6）

```bash
#!/bin/bash
# /opt/harness/bin/backup-verify.sh
set -euo pipefail

trap 'cleanup' EXIT

# 1. 用独立 Docker network
VERIFY_NETWORK="harness-verify-$(uuidgen)"
docker network create "$VERIFY_NETWORK"

# 2. 启动容器，分配 ephemeral host port
VERIFY_IMAGE="ghcr.io/cscoheru/harness-control@${HARNESS_DIGEST}"
TEST_TOKEN="verify-$(uuidgen)"
docker run --rm -d \
    --name harness-verify \
    --network "$VERIFY_NETWORK" \
    -p 127.0.0.1::8080 \
    -v /tmp/verify:/data \
    -e HARNESS_DB_PATH=/data/backup.db \
    -e HARNESS_TEST_MODE=1 \
    -e HARNESS_TEST_TOKEN="$TEST_TOKEN" \
    "$VERIFY_IMAGE"

# 3. 取实际分配的端口
ACTUAL_PORT=$(docker inspect harness-verify --format='{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}')
echo "Verify container port: $ACTUAL_PORT"

# 4. 等待启动
for i in {1..30}; do
    if curl -fsS -H "Authorization: Bearer $TEST_TOKEN" \
            "http://127.0.0.1:${ACTUAL_PORT}/health" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# 5. 验证
curl -fsS -H "Authorization: Bearer $TEST_TOKEN" \
    "http://127.0.0.1:${ACTUAL_PORT}/api/admin/db-check"

# 6. 清理（trap 自动调用）
cleanup() {
    docker stop harness-verify 2>/dev/null || true
    docker rm -f harness-verify 2>/dev/null || true
    docker network rm "$VERIFY_NETWORK" 2>/dev/null || true
    rm -rf /tmp/verify
}
```

**v0.6 修复**：
- image ref 改为 `ghcr.io/cscoheru/harness-control@${DIGEST}`（v0.5 仍用废弃的 `registry.local`）
- test_token 通过 env 传入容器
- ephemeral host port（`-p 127.0.0.1::8080`）+ `docker inspect` 取实际端口
- trap 清理 container + network + temp

### 12.6 数据保留策略（v0.6 修复 P1-7）

| 数据 | 默认期限 | 用户删除 | 法律保留 |
|------|----------|----------|----------|
| `tasks` | 永久 | ✅ 用户手动 | n/a |
| `task_attempts` | 90 天（自动清理）| 跟随 task | n/a |
| `task_events` | 30 天 | 跟随 attempt | n/a |
| `audit_log` | 1 年（v0.6 明确）| ❌ | ✅ 合规需要 |
| `artifacts` | 跟随 task | ✅ | n/a |
| `approvals` | 1 年 | ❌ | ✅ 合规需要 |

**v0.6 修复 P1-7**：
- audit_log 明确 1 年（v0.5 表里写 1 年，文字写永久，矛盾）
- "默认数据最小化"明确：用户删除 task → 级联清理
- legal hold 字段（`legal_hold BOOLEAN`，合规场景下冻结删除）

---

## 13. 可观测性（v0.6 新增）

### 13.1 核心指标

```text
- queue_age_seconds (queued 任务等待时间)
- queued_count (当前 queued 数)
- lease_expired_count (reaper 触发的次数)
- transition_conflict_count (CAS 失败的次数)
- retry_count / max_attempt_failure_count
- approval_unknown_age_seconds (unknown 状态时长)
- driver_start_resume_interrupt_error_count
- event_ingest_lag_seconds / event_duplicate_count / event_schema_reject_count
- token_cost_runtime_budget (每小时 token 消耗)
- artifact_write_failure_count / artifact_orphan_count / artifact_hash_mismatch_count
- backup_age_hours / restore_verification_age_hours
- sqlite_lock_wait_seconds / wal_size_bytes / disk_free_bytes
```

### 13.2 Runbook（v0.6 新增）

每个异常需要：
- 名称
- 捕获位置（日志 + metric）
- 用户可见状态
- 重试策略
- 告警阈值

---

## 14. 风险与回滚

### 14.1 风险清单

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Codex SDK 协议变更 | 中 | 高 | driver_version + protocol_version 双绑定 |
| attempt 编号逻辑冲突 | 低 | 高 | 子查询 + 二次 CAS（v0.6 修复）|
| cancel_requested 不可达 | 低 | 高 | CancelService 独立（v0.6 修复）|
| approval 扩权 / 重复消费 | 中 | 极高 | supersede 链 + 单向权限（v0.6 修复）|
| EgressFetcher DNS rebinding | 中 | 高 | pinned resolver + 5 重定向限制 |
| PolicyEngine 判定写反 | 中 | 极高 | v0.6 强制顺序（v0.6 修复）|
| 路径穿越 | 中 | 高 | canonical path + symlink policy |
| CI runner 在生产 | 高 | 极高 | GitHub-hosted + cosign（v0.6 修复）|
| migration 数据丢失 | 低 | 高 | forward-only + expand/contract |
| Backup E2E 误测生产 | 中 | 中 | ephemeral port + test_token（v0.6 修复）|
| newvps 主机丢失 | 低 | 极高 | HK03 异机 backup + 部署文档 |

### 14.2 回滚方案

```text
应用回滚：拉取上一 commit SHA 的镜像
DB 回滚：不自动 downgrade；通过 backup 恢复
迁移失败：expand/contract 模式下，新版本代码可降级到老代码
配置回滚：env 文件 + Compose 配置在 git 内
```

---

## 15. 决策日志（v0.1 → v0.6）

### 15.1 v0.6 新增决策（关键）

| Q | 决策 | 依据 |
|---|------|------|
| Q77 | Stage 1 收敛为 read-only research MVP | v0.5 复审报告 §5 |
| Q78 | external write + approval reconcile 推到 M2 | v0.5 复审报告 §5 |
| Q79 | claim SQL 用子查询避开 UPDATE LIMIT RETURNING | v0.5 复审报告 P0-1 |
| Q80 | fail_attempt 从 DB 读 attempt_count + MAX_ATTEMPTS | v0.5 复审报告 P0-1 |
| Q81 | CancelService 与 LeaseReaper 分离 | v0.5 复审报告 P0-2 |
| Q82 | reaper 只接受 leased/running，无 else 兜底 | v0.5 复审报告 P0-2 |
| Q83 | reaper event 名修正 + 审计值修正 | v0.5 复审报告 P0-2 |
| Q84 | retry_wait 调度器改为逐 task 短事务 | v0.5 复审报告 P1-5 |
| Q85 | PolicyEngine 强制判定顺序（deny → needs_approval → allow） | v0.5 复审报告 P0-3 |
| Q86 | Approval 永不回 pending + supersedes_approval_id 链 | v0.5 复审报告 P0-4 |
| Q87 | Approval 绑定 attempt_id + policy_version | v0.5 复审报告 P0-4 |
| Q88 | Approval Schema 增加 rejected/expired/revoked | v0.5 复审报告 P0-4 |
| Q89 | status_version ETag 防陈旧 reconcile | v0.5 复审报告 P0-4 |
| Q90 | EgressFetcher 用 httpx + pinned resolver | v0.5 复审报告 P0-5 |
| Q91 | Codex 附录标为伪代码 + M0 spike 后锁定主 Driver | v0.5 复审报告 P0-6 |
| Q92 | WorkflowPack capability 不绑定 driver ID | v0.5 复审报告 P1-3 |
| Q93 | ArtifactStore atomic write + async API | v0.5 复审报告 P1-4 |
| Q94 | EventEnvelope 增加 source_event_id/sequence/causation/dedupe | v0.5 复审报告 P1-2 |
| Q95 | EventSink payload 走白名单 + ArtifactRef | v0.5 复审报告 P1-2 |
| Q96 | retry_wait 调度器逐 task 短事务 | v0.5 复审报告 P1-5 |
| Q97 | CI 增加 GHCR login + buildx + cosign + attestation | v0.5 复审报告 P1-6 |
| Q98 | Backup E2E 用 ephemeral port + test_token + 完整 trap | v0.5 复审报告 P1-6 |
| Q99 | 数据保留策略：audit_log 1 年 + legal_hold 字段 | v0.5 复审报告 P1-7 |
| Q100 | 可观测性：核心 12 指标 + runbook | v0.5 复审报告 P1-9 |
| Q101 | "SQLite 是 orchestration authority"，不强求"唯一事实" | v0.5 复审报告 P1-10 |
| Q102 | v0.6 canonical 自包含，删除 v0.4 引用 | v0.5 复审报告 P1-8 |

### 15.2 累计决策数

| 版本 | 决策数 |
|------|--------|
| v0.1 | 12 |
| v0.2 | 18 |
| v0.3 | 24 |
| v0.4 | 76（含 v0.5 增加的 18） |
| v0.5 | 84 |
| **v0.6** | **102** |

---

## 附录 A：Research WorkflowPack（Stage 1）

```yaml
id: research.v1
version: 1.0.0
description: "Read-only research: fetch sources, summarize, write artifact"

input_schema:
  type: object
  properties:
    topic: {type: string}
    max_sources: {type: integer, default: 5, minimum: 1, maximum: 20}
  required: [topic]

output_schema:
  type: object
  properties:
    report_artifact_id: {type: string}
    sources: {type: array, items: {type: string}}

# 不绑定 driver ID（v0.6 修复 P1-3）
capability_requirements:
  - kind: driver
    required_capabilities: [structured_output, streaming, sandbox_workspace_read]
  - kind: tool
    tool_id: web.search
  - kind: tool
    tool_id: web.fetch
  - kind: tool
    tool_id: audio.transcribe
  - kind: tool
    tool_id: artifact.write

steps:
  - name: fetch_sources
    uses: [tool: web.search]
    inputs: {topic: input.topic, max: input.max_sources}
    outputs: [source_list]

  - name: fetch_content
    uses: [tool: web.fetch]
    inputs: {urls: source_list.urls}
    outputs: [content_list]

  - name: transcribe_if_audio
    uses: [tool: audio.transcribe]
    inputs: {urls: content_list.audio_urls}
    outputs: [transcripts]

  - name: summarize_and_cite
    uses: [driver: structured_output]
    inputs:
      topic: input.topic
      content: content_list
      transcripts: transcripts
    outputs: [summary]

  - name: write_artifact
    uses: [tool: artifact.write]
    inputs:
      content: summary
      sources: source_list
    outputs: [report_artifact_id]

retry_policy:
  max_attempts: 3
  backoff: exponential

cancel_policy:
  graceful_timeout: 30

policy_profile: research.default

eval_suite: research.eval.v1

ui_schema:
  form:
    - {key: topic, type: text, label: "研究主题"}
    - {key: max_sources, type: number, label: "最大来源数"}

migration_strategy: forward_only

schema_hash: sha256:PLACEHOLDER_M0_SPIKE
```

**Stage 1 简化**：每 task/attempt 只调用一次 Driver；steps 作为 Driver 输入计划，**不**实现 step 持久化状态机。

---

## 附录 B：6 P0 修补对照（v0.5 复审报告）

| 报告项 | v0.6 处理 | 章节 |
|--------|----------|------|
| P0-1 claim SQL | 子查询避开 UPDATE LIMIT RETURNING | §4.1 |
| P0-1 attempt_count 未定义 | 从 DB 读 attempt_count | §4.2 |
| P0-1 无限重试 | MAX_ATTEMPTS 默认 5 | §4.2 |
| P0-1 actor 未定义 | 函数参数传入 | §4.2 |
| P0-2 cancel_requested 不可达 | CancelService 独立 | §4.4 |
| P0-2 reaper else 兜底 | 只接受 leased/running | §4.5 |
| P0-2 event 名 typo | 修正为 lease_expired_requeued | §4.5 |
| P0-2 审计值错 | 记录原 lease_expires_at | §4.5 |
| P0-3 PolicyEngine 判定写反 | 强制顺序 deny → needs_approval → allow | §5.6 |
| P0-4 reconcile 回 pending | 永不回 pending + supersede 链 | §5.5 |
| P0-4 consume attempt_id 未绑定 | consume SQL 绑定 attempt_id | §5.5 |
| P0-4 缺少 rejected/expired | Schema 新增 + reject_approval/expire_approvals 函数 | §5.5 |
| P0-4 status_version ETag | reconcile 时校验 expected_status_version | §5.5 |
| P0-5 手写 HTTP 客户端失效 | httpx + pinned resolver | §6 |
| P0-5 port or 443 | httpx 按 scheme 决定端口 | §6 |
| P0-5 writer.start_tls 返 None | 用 httpx 自动处理 TLS | §6 |
| P0-5 max+1 检测 | 流式读取 + 立即断开 | §6 |
| P0-6 Codex API 不存在 | 附录标为伪代码 + M0 spike | §7.4 |
| P0-6 事件协议混用 | source_protocol 字段区分 | §7.4 |

---

## 附录 C：10 P1 修补对照

| 报告项 | v0.6 处理 | 章节 |
|--------|----------|------|
| P1-1 无 workflow_run/step_run | Stage 1 简化为单 Driver run，steps 作为输入计划 | §3.3.2 |
| P1-2 EventSink 缺字段 | 增加 source_event_id/sequence/causation/dedupe/redaction | §3.3.6 |
| P1-3 WorkflowPack 锁定 driver ID | capability 不绑定实现 ID | §3.3.2 |
| P1-4 ArtifactStore async + atomic | async API + atomic write + orphan sweeper | §3.3.4 |
| P1-5 retry_wait 批量事务 | 逐 task 短事务 | §4.3 |
| P1-6 CI 没 GHCR login | 加 docker/login-action + buildx + cosign | §12.2 |
| P1-6 backup registry.local | 改用 GHCR digest | §12.5 |
| P1-7 audit 1 年 vs 永久冲突 | 明确 1 年 + legal_hold | §12.6 |
| P1-8 仍引 v0.4 | v0.6 完全 canonical | 本文件 |
| P1-9 无可观测性 | 12 核心指标 + runbook | §13 |
| P1-10 DB 唯一事实过强 | "orchestration authority"，不强求唯一 | §1.2 |

---

## 附录 D：变更历史

| 版本 | 日期 | 关键变化 |
|------|------|----------|
| v0.1 | 2026-08-29 | 初版（已撤销）|
| v0.2 | 2026-08-29 | 架构候选 + 单工作流 MVP |
| v0.3 | 2026-08-29 | attempt + interrupted + Tailscale + Approval 加固 |
| v0.4 | 2026-08-29 | 事务原子化 + 信任模型 + 部署拓扑 + Alembic |
| v0.5 | 2026-08-29 | Durable Kernel + 6 接口 + Codex SDK |
| **v0.6** | **2026-08-29** | **修 6 P0 + 10 P1 + Stage 1 收敛 read-only + canonical 自包含** |

### D.1 v0.5 → v0.6 关键差异

| 维度 | v0.5 | v0.6 |
|------|------|------|
| Stage 1 范围 | 12-15 周平台 v1 | **6-9 周 read-only research MVP** |
| 主 Driver 决策 | 锁定 CodexSdkDriver | **M0 spike 后决策** |
| claim SQL | UPDATE ORDER BY LIMIT 1 RETURNING（语法错误）| **子查询 + 二次 CAS** |
| CancelService | 与 reaper 耦合 | **独立** |
| PolicyEngine | 高风险不在 max → needs_approval（写反）| **强制 deny → needs_approval → allow** |
| Approval 一次性 | 可回 pending | **永不回 pending + supersede 链** |
| EgressFetcher | 手写 HTTP/1.1（失效）| **httpx + pinned resolver** |
| Codex 附录 | 伪代码实现 | **伪代码 + 未验证标注 + M0 spike 必做** |
| 自评 | 6/10 通过 | **3/10 通过 + 5/10 部分待 spike + 2/10 spike** |

---

## 附录 E：术语表（v0.6）

| 术语 | 含义 |
|------|------|
| **Durable Kernel** | orchestration state authority；外部通过 ExternalRunRef/operation ID 对账 |
| **ExternalRunRef** | Driver 返回的外部执行引用（持久化，含 driver_id/version/protocol/source_protocol）|
| **WorkflowPack** | 版本化工作流包，capability 不绑定实现 ID |
| **source_protocol** | "exec_jsonl" / "app_server_jsonrpc" / "sdk_python"，事件协议隔离 |
| **status_version** | Approval ETag-like 字段，防陈旧 reconcile |
| **supersedes_approval_id** | 重试链，旧 approval 永不回 pending |
| **pinned resolver** | EgressFetcher 的 DNS 解析后固定 IP，防 DNS rebinding |
| **CancelService** | 独立服务，与 LeaseReaper 解耦 |
| **legal_hold** | 数据保留合规冻结字段 |
| **canonical 自包含** | 不依赖历史版本，决策写 ADR |

---

> **下一步**：等待 M0 spike 证据（Codex capability、claim SQL 测试、CancelService 不变量、PolicyEngine 单向验证、Approval supersede 链、EgressFetcher 网络测试）+ v0.6 修补关闭。进入 Stage 1 前必须满足 §11.4 的 8 条硬门槛。