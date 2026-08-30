# Fish Harness PRD v0.5

> **版本**：v0.5（v0.4 复审后修订 + 架构升级）
> **日期**：2026-08-29
> **维护者**：cscoheru / Claude Code
> **状态**：**架构候选，待 Stage 0 spike + v0.5 修补关闭**
> **位置**：`/Users/kjonekong/projects/fish-harness/`
> **前置文档**：`ARCHITECT-REVIEW-PRD-v0.4.md`、`PRD-v0.4.md`

---

## 0. TL;DR（一分钟版）

**v0.5 = v0.4 修补 + 架构升级（Durable Kernel + 六个扩展接口 + Codex SDK）**。

### v0.4 → v0.5 关键变化

| 维度 | v0.4 | v0.5 |
|------|------|------|
| 架构定位 | 研究工作流控制器 | **Durable Kernel + WorkflowPack + ExecutionDriver 三层** |
| attempt 编号 | 写死 `= 1`（撞 UNIQUE 约束）| **事务内原子取下一个 attempt_no** |
| Reaper | reaper_lock 复杂冗余 | **删除锁表，依赖 `BEGIN IMMEDIATE` 串行化** |
| Approval 崩溃 | `consuming → approved`（C 场景重复副作用）| **→ `unknown` + idempotency capability + UI reconcile** |
| SSRF | DNS 校验后让 httpx 重连（DNS rebinding）| **pinned-IP connect + 重定向 5 次限制 + 流式字节限制** |
| PolicyEngine | 双向（按来源收紧 + allowlist 扩展）| **单向权限原则**（来源/分类只能收紧）|
| 工具/工作流 | 硬编码 5 个研究工具 | **ToolProvider manifest + WorkflowPack** |
| Driver | cc subprocess | **ExecutionDriver SPI + CodexSdkDriver** |
| Artifact | path + summary 字符串 | **typed ArtifactStore（content hash + lineage）** |
| 事件 | task_events 单表 | **versioned EventSink（envelope + 6 字段）** |
| 文档形态 | v0.4 + 增量 | **canonical 自包含**（v0.4 决策保留进 ADR）|

### 自评（v0.5 独立复审标准）

| 项数 | 状态 |
|------|------|
| **6/10** | 完整通过（架构 + 6 接口 + 事务 + Approval + SSRF + 部署）|
| **2/10** | 部分通过（须 Stage 0 spike 验证：Codex SDK + 资源 spike）|
| **2/10** | 待 spike（dsh 能力 + 资源实测）|

---

## 1. 愿景与设计哲学

### 1.1 核心价值（保留）

你（人）→ 手机发指令 → harness（AI 团队）→ 产出（代码/调研/视频）

**关键特性**：永远在线、能力匹配、弹性扩展、优雅降级。

### 1.2 设计哲学（5 条不可妥协，v0.5 调整）

| 原则 | 含义 |
|------|------|
| **数据库是事实来源** | Durable Kernel 的 SQLite 是唯一事实 |
| **Kernel 不懂业务** | Durable Kernel 不知道"研究怎么做"，由 WorkflowPack 提供 |
| **Driver 不懂权限** | ExecutionDriver 只执行；权限由 PolicyDecisionPoint 决定 |
| **单向权限** | 身份 + 策略 = 最大权限；文本/分类只能收紧不能扩大 |
| **可替换执行器** | ExecutionDriver SPI 让 cc/codex/dsh 互为替代 |

### 1.3 数字分身的长期闭环（**v0.5 新增**）

```
Goal → Observation → Proposal → Approval → Action → Outcome
  ↑                                                     │
  └──────────── Evaluation ← Memory / Learning ─────────┘
```

v0.5 不实现所有实体，但**预留稳定 ID、事件类型和 artifact lineage**，避免未来把 Goal/Observation/Decision 塞进 task payload。

---

## 2. 架构假设与验证状态

### 2.1 dsh / Codex 能力验证矩阵（**v0.5 调整**）

| 能力 | 置信度 | Stage 0 spike |
|------|--------|--------------|
| Codex Python SDK（推荐 Driver）| **高** | 验证 start/resume/interrupt/stream |
| `codex exec --json` 契约 | 中 | Stage 0 契约 spike |
| `codex app-server` 远程 WebSocket | **不推荐生产** | 实验性，仅本地 stdio/Unix socket |
| dsh 远程 worker / daemon | **未验证** | 视 spike 决定是否纳入 |
| 弃用 Codex MCP Server（执行内核）| **不推荐** | App Server 替代 |

**结论**：v0.5 主 Driver = `CodexSdkDriver`，fallback = `CodexExecDriver`（基于 `codex exec --json`），dsh 仅作为可选 adapter。

### 2.2 兼容性风险

| 维度 | 风险 |
|------|------|
| Codex SDK | 中（Python SDK 跟随 CLI 版本）|
| Codex CLI | 中（频繁更新）|
| dsh | 高（dev preview，破坏性变更）|
| FastAPI | 低 |
| SQLite | 低 |

---

## 3. Durable Kernel + 六个扩展接口（**v0.5 核心架构**）

### 3.1 整体架构（v0.5 重写）

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
                        │
                        ▼
                ExecutionDriver SPI
       ┌────────────────┼──────────────────┐
       ▼                ▼                  ▼
 CodexSdkDriver   CodexExecDriver   DeterministicDriver
                        ▼
          ToolProvider / Skills / MCP / APIs
```

**关键边界**：
- **Durable Kernel** 不知道"研究报告怎么做"
- **WorkflowPack** 不知道"线程如何由 Codex 运行"
- **ExecutionDriver** 不决定权限

### 3.2 Durable Kernel 包含

| 模块 | 职责 |
|------|------|
| state | task / attempt 表 + 状态机 |
| lease | 原子 lease + fencing token |
| approval | approval 状态机 |
| policy | PolicyDecisionPoint |
| budget | 资源 / token / 时间预算 |
| event | EventSink（versioned envelope）|
| artifact | ArtifactStore（typed refs）|
| provenance | artifact lineage |
| audit | append-only log |

### 3.3 六个稳定扩展接口

#### 3.3.1 ExecutionDriver SPI

```python
class ExecutionDriver(Protocol):
    """Durable Kernel 与执行后端的解耦层。"""
    
    def capabilities(self) -> DriverCapabilities:
        """声明 driver 能力（resume / interrupt / streaming / fork 等）。"""
        ...
    
    async def start(self, execution: ExecutionRequest) -> ExternalRunRef:
        """启动新 execution。返回 ExternalRunRef（持久化）。"""
        ...
    
    async def resume(self, ref: ExternalRunRef, input: TurnInput) -> ExternalRunRef:
        """继续已有 execution（多 turn）。"""
        ...
    
    async def interrupt(self, ref: ExternalRunRef) -> None:
        """请求中断（不保证立即停止）。"""
        ...
    
    async def stream_events(self, ref: ExternalRunRef) -> AsyncIterator[DriverEvent]:
        """事件流（含 structured output、approval 请求、错误等）。"""
        ...
    
    async def collect_artifacts(self, ref: ExternalRunRef) -> list[ArtifactRef]:
        """收集产物引用（driver 自己定义收集规则）。"""
        ...
```

**ExternalRunRef 必须持久化**（DB 字段）：
```python
@dataclass
class ExternalRunRef:
    driver_id: str           # "codex_sdk" / "codex_exec" / ...
    driver_version: str      # "0.1.0"
    protocol_version: int    # driver 协议版本
    external_thread_id: str  # driver 管理的 thread ID
    external_turn_id: Optional[str]  # driver 管理的 turn ID
    metadata: dict           # driver-specific 字段
```

**Kernel 不得依赖**：
- ❌ dsh 文本输出
- ❌ 某个 Codex CLI 子命令的特定行为
- ❌ Driver 内部的实现细节

#### 3.3.2 WorkflowPack

每个工作流包必须声明：

| 字段 | 含义 |
|------|------|
| `id` | 唯一 ID（如 `research.v1`）|
| `version` | semver |
| `input_schema` | 输入 JSON Schema |
| `output_schema` | 输出 JSON Schema |
| `steps` | 步骤 / 状态机 |
| `capability_requirements` | 需要的 ExecutionDriver / ToolProvider 能力 |
| `policy_profile` | 引用的 PolicyDecisionPoint 配置 |
| `retry_policy` | 重试 / cancel 策略 |
| `eval_suite` | 内置评测（基于真实任务）|
| `ui_schema` | 表单 / 进度视图 / artifact renderer 描述 |
| `migration_strategy` | 旧版本数据如何迁移到新版本 |

**Research WorkflowPack 是第一个 WorkflowPack**（不是 kernel 中的特殊分支）。

#### 3.3.3 ToolProvider manifest

```yaml
id: web.fetch
version: 1.0.0
description: "Fetch URL with SSRF protection"

input_schema:
  type: object
  properties:
    url: {type: string, format: uri}
    max_bytes: {type: integer, max: 10000000}

output_schema:
  type: object
  properties:
    content: {type: string}
    content_hash: {type: string}

# 关键元数据（决定权限和调用方式）
network_class: public        # none | internal | public
side_effect_class: read       # none | read | write | external
approval_requirement: none    # none | action_hash | explicit
idempotency_capability: none  # none | provider_key | queryable_operation
timeout_ms: 10000
max_input_bytes: 1024
max_output_bytes: 10000000
secrets_scope: []             # 不需要 secret
compatible_runtime_versions: ["^1.0.0"]

# provider-specific 实现
implementation: harness.tools.web_fetch:safe_fetch
```

**关键**：每个 ToolProvider 必须声明这 10 个元数据字段，让 PolicyDecisionPoint 可以基于统一规则决策。

#### 3.3.4 typed ArtifactStore

所有报告、引用、网页快照、补丁、决策都是 typed artifact：

```python
@dataclass
class ArtifactRef:
    artifact_id: str            # UUID
    type: str                   # "research.report" / "web.snapshot" / "code.patch" / ...
    content_hash: str           # SHA-256
    producer_workflow: str      # "research.v1"
    producer_workflow_version: str  # "1.2.0"
    producer_driver: str        # "codex_sdk@0.1.0"
    source_url: Optional[str]
    parent_artifact_ids: list[str]  # lineage
    visibility: str             # "private" / "shared"
    retention_policy: str       # "permanent" / "30d" / "session"
    sensitivity: str            # "public" / "internal" / "secret"
    preview_type: str           # "markdown" / "diff" / "json"
    created_at: int
```

**API**：
```python
class ArtifactStore(Protocol):
    def put(self, content: bytes, type: str, producer: str, parent_ids: list[str] = None) -> ArtifactRef: ...
    def get(self, ref: ArtifactRef) -> bytes: ...
    def link_to_task(self, artifact_id: str, task_id: str) -> None: ...
    def list_for_task(self, task_id: str) -> list[ArtifactRef]: ...
```

**存储**：artifact 正文存文件系统（受控目录）+ DB 存 ArtifactRef 索引。

#### 3.3.5 PolicyDecisionPoint

**输入**：`actor` + `requested_action` + `resource` + `context_labels` + `policy_version`

**输出**：
```python
@dataclass
class PolicyDecision:
    decision: str           # "allow" | "deny" | "needs_approval"
    reason: str
    policy_version: str
    constraints: dict       # 限制（rate / scope / time-window）
```

**核心原则**（**v0.5 修复 P1-1**）：
```
身份 + 项目策略 + 资源策略 提供最大权限
输入来源 + 数据分类 + 风险等级 只能收缩权限
approval 只能授权一个已在最大权限内的具体动作
任何自然语言均不能扩大权限
```

**实现**：纯函数（不读网络，不读 DB 之外的全局状态），可单测、可回放。

#### 3.3.6 versioned EventSink

```python
@dataclass
class EventEnvelope:
    event_id: str                    # UUID
    event_version: int               # envelope schema version
    task_id: str
    attempt_id: Optional[str]
    workflow_run_id: str             # 每次 workflow run 一个 ID
    driver_ref: Optional[ExternalRunRef]
    event_type: str                  # "status_change" / "approval_requested" / ...
    occurred_at: int                 # epoch ms
    actor: str                       # "user" / "worker_id" / "system"
    trace_id: str                    # 跨 attempt 的关联 ID
    payload: dict
```

**关键**：
- `event_version` 让 envelope 可演进
- `workflow_run_id` 区分 task 内部的多次 run
- `trace_id` 跨 attempt 关联（用于调试和审计）
- DB 表 `task_events` 存 envelope；UI/审计/指标消费统一格式

### 3.4 扩展性验收标准（**v0.5 新增**）

架构测试必须满足：

1. **新增第二个 WorkflowPack 不修改 Durable Kernel**
   - 测试：mock 一个 `finance.v1` WorkflowPack，验证 kernel 代码零修改
2. **新增第二个 ExecutionDriver 不修改 task 状态机**
   - 测试：mock `DeterministicDriver`，验证状态机零修改
3. **新增工具只增加 manifest + handler + policy，不增加散落的硬编码条件分支**
   - 测试：grep kernel 代码，验证不存在针对具体 tool_id 的 `if/else`

---

## 4. 任务状态机与持久化（**v0.5 关键修补**）

### 4.1 决策保留（v0.4）

- ✅ MVP 不实现 checkpoint
- ✅ interrupted 状态仅用户显式 retry
- ✅ 每 task 最多一个 active attempt（partial unique index）
- ✅ 状态机应用层事务函数

### 4.2 attempt 编号逻辑（**v0.5 修复 P0-1**）

**v0.4 bug**：claim SQL 写死 `attempt_no = 1`，第二次 claim 撞 `UNIQUE(task_id, attempt_no)` 约束。

**v0.5 修复**：

```python
def claim_task(worker_id: str) -> Optional[ClaimedTask]:
    """事务：原子 attempt_count +1 → 创建 attempt + N+1 → 标记 leased。"""
    attempt_id = str(uuid4())
    lease_token = str(uuid4())
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 原子递增 task.attempt_count（CAS）
        #    rowcount = 1 才说明我们是第一个递增者
        task_row = tx.execute("""
            UPDATE tasks
            SET attempt_count = attempt_count + 1,
                updated_at = ?
            WHERE status = 'queued'
              AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
              AND cancel_requested_at IS NULL
            ORDER BY created_at ASC
            LIMIT 1
            RETURNING task_id, attempt_count, fence_version
        """, (now, now)).fetchone()
        
        if task_row is None:
            return None
        
        task_id, new_attempt_no, current_fence = task_row
        
        # 2. 创建 attempt（attempt_no 来自 DB）
        tx.execute("""
            INSERT INTO task_attempts (
                attempt_id, task_id, attempt_no, worker_id,
                fence_version, lease_token, lease_expires_at,
                started_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        """, (attempt_id, task_id, new_attempt_no, worker_id,
              current_fence + 1, lease_token, now + LEASE_TTL_MS, now))
        
        # 3. 更新 task 到 leased
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
              AND attempt_count = ?    -- 二次校验 attempt_count 没被并发改
              AND current_attempt_id IS NULL
        """, (worker_id, lease_token, now + LEASE_TTL_MS,
              attempt_id, now, task_id, new_attempt_no)).rowcount
        
        if task_updated != 1:
            raise TransitionConflict(f"task {task_id} lost CAS at claim")
        
        # 4. event
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
            VALUES (?, ?, ?, 'lease_granted', ?, ?)
        """, (task_id, attempt_id, now,
              json.dumps({"attempt_no": new_attempt_no, "fence_version": current_fence + 1}),
              worker_id))
        
        return ClaimedTask(task_id, attempt_id, new_attempt_no, lease_token, current_fence + 1)
```

**关键修复**：
- `attempt_count = attempt_count + 1` 在事务内执行，DB 自动给新编号
- `RETURNING` 子句一次获取新值
- 二次校验 `attempt_count = ?` 防 CAS 失败
- 任一更新 rowcount ≠ 1 → ROLLBACK

### 4.3 failed 状态细分（**v0.5 修复 P0-1**）

v0.4 把"可重试失败"写成 `interrupted`，混淆了语义。

**v0.5 区分**：

| 终态 | 触发 | 下一步 |
|------|------|--------|
| `failed` | 不可重试错误（OOM、bug） | 终态 |
| `failed_retryable` | 可重试错误（429、超时）| **不是**终态，可 → retry_wait |
| `interrupted` | Worker 失联 / lease 过期 | **不是**终态，需用户显式 retry |
| `cancel_requested` | 用户取消 | 中间态，最终 → cancelled |

**fail_attempt 函数**：

```python
def fail_attempt(task_id, attempt_id, lease_token, fence_version, error):
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 决定 attempt 和 task 终态
        if error.retryable:
            attempt_status = 'failed_retryable'
            task_status = 'retry_wait'
            backoff_ms = min(BACKOFF_BASE * (2 ** attempt_count), BACKOFF_MAX_MS)
            next_attempt_at = now + backoff_ms
        else:
            attempt_status = 'failed'
            task_status = 'failed'
            next_attempt_at = None
        
        # 2. 更新 task
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
        
        # 3. 更新 attempt
        tx.execute("""
            UPDATE task_attempts
            SET status = ?, finished_at = ?, error_code = ?, error_message = ?
            WHERE attempt_id = ? AND fence_version = ? AND status = 'active'
        """, (attempt_status, now, error.code, error.message, attempt_id, fence_version))
        
        # 4. event
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
            VALUES (?, ?, ?, 'attempt_failed', ?, ?)
        """, (task_id, attempt_id, now,
              json.dumps({"status": attempt_status, "retryable": error.retryable}),
              worker_id))
        
        return True
```

### 4.4 retry_wait → queued（**v0.5 修复 P0-1**）

v0.4 没有为这个转换写 event。**v0.5 修复**：

```python
def retry_wait_to_queued() -> int:
    now = ms_now()
    requeued = 0
    
    with db.transaction("IMMEDIATE") as tx:
        # 找出所有退避到期的 task
        expired_tasks = tx.execute("""
            SELECT task_id, attempt_count
            FROM tasks
            WHERE status = 'retry_wait'
              AND next_attempt_at IS NOT NULL
              AND next_attempt_at <= ?
        """, (now,)).fetchall()
        
        for task in expired_tasks:
            task_id, attempt_count = task
            
            # 每个 task 独立更新（避免大批量事务阻塞）
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
            
            if updated == 1:
                tx.execute("""
                    INSERT INTO task_events (task_id, at, event_type, payload_json, actor)
                    VALUES (?, ?, 'retry_wait_to_queued', ?, 'system')
                """, (task_id, now, json.dumps({"attempt_count": attempt_count})))
                requeued += 1
    
    return requeued
```

### 4.5 Reaper 简化（**v0.5 修复 P0-2**）

**v0.4 问题**：
- reaper_lock 表冗余（`BEGIN IMMEDIATE` 已经串行化写事务）
- 顺序更新 task/attempt/event 不检查 row count
- 多进程竞争时锁失效

**v0.5 修复**：**删除 reaper_lock**，依赖 SQLite 单写者串行化。

```python
def reap_expired_leases() -> int:
    """每个过期 task 独立短事务，绝不批量。"""
    now = ms_now()
    reaped = 0
    
    # 找出候选 task（短事务，只读）
    with db.transaction("DEFERRED") as tx:
        candidates = tx.execute("""
            SELECT task_id FROM tasks
            WHERE lease_expires_at IS NOT NULL
              AND lease_expires_at < ?
              AND status IN ('leased', 'running')
            LIMIT 100
        """, (now,)).fetchall()
    
    # 每个候选独立事务处理
    for row in candidates:
        task_id = row['task_id']
        try:
            if _reap_one(task_id, now):
                reaped += 1
        except TransitionConflict:
            continue  # 该 task 被 renew 抢先了，正常
    
    return reaped


def _reap_one(task_id: str, now: int) -> bool:
    """处理单个 task 的过期。短事务，每步校验 row count。"""
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 读当前 attempt_id
        current = tx.execute("""
            SELECT current_attempt_id, status FROM tasks
            WHERE task_id = ? AND lease_expires_at < ?
        """, (task_id, now)).fetchone()
        
        if not current:
            return False  # 已被 renew
        
        attempt_id, task_status = current['current_attempt_id'], current['status']
        if not attempt_id:
            return False
        
        # 2. 决定新状态
        if task_status == 'leased':
            new_task_status = 'queued'
            new_attempt_status = 'expired'
        else:  # running
            new_task_status = 'interrupted'
            new_attempt_status = 'interrupted'
        
        # 3. 条件更新 task（同时校验 lease 已过期）
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
              AND lease_expires_at < ?
              AND status = ?
        """, (new_task_status, now, task_id, attempt_id, now, task_status)).rowcount
        
        if task_updated != 1:
            return False  # renew 抢先
        
        # 4. 条件更新 attempt（依赖 task 已更新）
        attempt_updated = tx.execute("""
            UPDATE task_attempts
            SET status = ?, finished_at = ?
            WHERE attempt_id = ? AND status = 'active'
        """, (new_attempt_status, now, attempt_id)).rowcount
        
        if attempt_updated != 1:
            raise TransitionConflict(f"attempt {attempt_id} not active")
        
        # 5. event（前两步成功后）
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
            VALUES (?, ?, ?, ?, ?, 'system')
        """, (task_id, attempt_id, now,
              'lease_expired_requed' if new_task_status == 'queued' else 'worker_lost_interrupted',
              json.dumps({"lease_expires_at_was": now})))
        
        return True
```

**关键修复**：
- 删除 reaper_lock（依赖 BEGIN IMMEDIATE）
- 每个 task 独立短事务（不批量）
- task 更新校验 4 元素（task_id + attempt_id + lease expiry + status）
- attempt 更新不为 1 行 → 整个事务 ROLLBACK
- event 只在前两步成功后写

### 4.6 Transaction Context Manager 契约（**v0.5 修复 P1-3**）

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
    - 显式 ctx.rollback() → ROLLBACK（即使后续 commit 也不生效）
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
        """执行 SQL，返回 Cursor。rowcount 由 cursor.rowcount 读。"""
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

**契约测试**：
```python
def test_transition_conflict_rolls_back():
    """condition update 失败必须 rollback。"""
    with pytest.raises(TransitionConflict):
        with db.transaction("IMMEDIATE") as tx:
            tx.execute("UPDATE ... WHERE ...")  # 0 行
            raise TransitionConflict("...")
    
    # 验证：UPDATE 没有生效
    assert db.execute("SELECT ...").fetchone() == initial_state
```

### 4.7 取消语义统一

| 触发 | task | attempt | 说明 |
|------|------|---------|------|
| 用户取消 queued | `cancel_requested` → `cancelled` | n/a | reaper 处理 |
| 用户取消 leased | `cancel_requested` → `cancelled` | `cancelled` | reaper 处理 |
| 用户取消 running | `cancel_requested` → `cancelled` | `cancelled` | Driver interrupt |
| Worker 失联 | `interrupted` | `interrupted` | reaper 自动处理 |
| OOM / 不可恢复 | `failed` | `failed` | 终态 |
| 可重试错误 | `retry_wait` | `failed_retryable` | 调度器定时转 queued |

---

## 5. Approval 状态机（**v0.5 修复 P0-3**）

### 5.1 新状态机

```
pending → approved → consuming → succeeded
                     │       ├──→ failed_final
                     │       └──→ unknown / reconcile_required
```

### 5.2 v0.4 问题回顾

v0.4 `consuming → approved` 机制无法判断崩溃发生在：

```
A. 外部请求发送前        → 安全回 approved
B. 外部请求处理中        → 安全回 approved（外部可能成功也可能失败）
C. 外部成功，本地写库前  → ❌ 回 approved 会重复执行
```

### 5.3 v0.5 修复：unknown + idempotency capability

```sql
-- approvals.status 扩展
status TEXT NOT NULL CHECK(status IN (
    'pending','approved','consuming',
    'succeeded','failed_final',
    'unknown'                  -- timeout 默认
))
```

**关键变更**：timeout 默认进入 `unknown`，**不**自动回 `approved`。

### 5.4 idempotency capability

每种外部动作必须声明：

| capability | 含义 | 恢复策略 |
|------------|------|----------|
| `none` | 不可重放 | 必须人工 reconcile |
| `provider_key` | 供应方按 idempotency_key 去重 | 可重发（用同 key）|
| `queryable_operation` | 供应方支持查询历史 operation | 可查询后再决定 |

**action manifest 声明**：

```yaml
id: video.publish.youtube
side_effect_class: external
approval_requirement: explicit
idempotency_capability: provider_key   # YouTube API 支持 id 参数
requires_contract_test: true           # 必须有契约测试证明
```

### 5.5 reconcile UI

`unknown` 状态的 approval 在 UI 显示：

```
⚠️ Unknown state: video.publish.youtube

Last known: external request was sent at 14:30:00
External request ID: yt-upload-abc123 (saved)
Worker process crashed before result was written back.

Available actions:
[Query external status] → 查询 YouTube API 看是否已上传
[Mark as completed]     → 手动标记为 succeeded（需审计）
[Mark as failed]        → 手动标记为 failed_final
[Retry with new attempt] → 创建新 attempt + 新 approval
```

### 5.6 Schema 扩展

```sql
CREATE TABLE approvals (
    approval_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_id TEXT,
    
    -- action 元数据
    requested_action TEXT NOT NULL,
    action_params_json TEXT NOT NULL,
    action_params_hash TEXT NOT NULL,
    
    -- actor
    requested_by TEXT NOT NULL,
    
    -- lifecycle
    requested_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    decided_at INTEGER,
    decided_by TEXT,
    
    -- consumption（v0.5 扩展）
    status TEXT NOT NULL CHECK(status IN (
        'pending','approved','consuming',
        'succeeded','failed_final','unknown'
    )),
    idempotency_key TEXT,                    -- 外部副作用幂等键
    idempotency_capability TEXT CHECK(
        idempotency_capability IS NULL OR
        idempotency_capability IN ('none','provider_key','queryable_operation')
    ),
    external_operation_id TEXT,              -- 外部服务返回的 op ID
    consumed_at INTEGER,
    consumed_by_attempt_id TEXT,
    timeout_at INTEGER,                       -- 何时进入 unknown
    
    -- result
    execution_result TEXT,
    
    FOREIGN KEY (task_id) REFERENCES tasks(task_id),
    FOREIGN KEY (consumed_by_attempt_id) REFERENCES task_attempts(attempt_id)
);
```

### 5.7 consume / complete / unknown 转换

```python
def consume_approval(approval_id: str, attempt_id: str, idempotency_key: str):
    """approved → consuming（原子）。"""
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        updated = tx.execute("""
            UPDATE approvals
            SET status = 'consuming',
                consumed_at = ?,
                consumed_by_attempt_id = ?,
                idempotency_key = ?,
                timeout_at = ? + 30000  -- 30s 超时
            WHERE approval_id = ?
              AND status = 'approved'
              AND expires_at > ?
              AND action_params_hash = ?
        """, (now, attempt_id, idempotency_key, now, approval_id, now,
              current_action_params_hash)).rowcount
        
        if updated != 1:
            raise ApprovalNotAvailable(approval_id)
        
        tx.execute("""
            INSERT INTO audit_log (at, actor, action, target, payload_json, result)
            VALUES (?, ?, 'approval_consuming', ?, ?, 'pending')
        """, (now, worker_id, approval_id,
              json.dumps({"attempt_id": attempt_id, "idempotency_key": idempotency_key})))


def complete_approval(approval_id: str, success: bool, result_msg: str):
    """consuming → succeeded / failed_final。"""
    now = ms_now()
    new_status = 'succeeded' if success else 'failed_final'
    
    with db.transaction("IMMEDIATE") as tx:
        updated = tx.execute("""
            UPDATE approvals
            SET status = ?,
                execution_result = ?,
                decided_at = ?
            WHERE approval_id = ? AND status = 'consuming'
        """, (new_status, result_msg, now, approval_id)).rowcount
        
        if updated != 1:
            raise InconsistentState(f"approval not consuming")


def reconcile_approval(approval_id: str, new_status: str, reason: str, actor: str):
    """人工 reconcile：unknown → succeeded / failed_final / pending（重试）。"""
    # new_status 必须是 succeeded / failed_final / pending
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        updated = tx.execute("""
            UPDATE approvals
            SET status = ?,
                execution_result = ?,
                decided_at = ?,
                decided_by = ?
            WHERE approval_id = ? AND status IN ('unknown', 'consuming')
        """, (new_status, reason, now, actor, approval_id)).rowcount
        
        if updated != 1:
            raise InconsistentState(f"approval not unknown/consuming")
        
        tx.execute("""
            INSERT INTO audit_log (at, actor, action, target, payload_json, result)
            VALUES (?, ?, 'approval_reconciled', ?, ?, ?)
        """, (now, actor, approval_id,
              json.dumps({"new_status": new_status, "reason": reason}),
              "success"))


def timeout_unknown_approvals() -> int:
    """consuming 超过 timeout_at → unknown。调度器定期调用。"""
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        expired = tx.execute("""
            SELECT approval_id, consumed_by_attempt_id FROM approvals
            WHERE status = 'consuming' AND timeout_at <= ?
        """, (now,)).fetchall()
        
        for row in expired:
            tx.execute("""
                UPDATE approvals
                SET status = 'unknown'
                WHERE approval_id = ? AND status = 'consuming'
            """, (row['approval_id'],))
            
            tx.execute("""
                INSERT INTO audit_log (at, actor, action, target, payload_json, result)
                VALUES (?, 'system', 'approval_timeout', ?, ?, 'unknown')
            """, (now, row['approval_id'],
                  json.dumps({"attempt_id": row['consumed_by_attempt_id']})))
        
        return len(expired)
```

---

## 6. SSRF EgressFetcher（**v0.5 修复 P0-4**）

### 6.1 推荐架构

```text
Workflow → Fetch request → EgressFetcher service
                                  ├─ DNS resolve + pin IP
                                  ├─ redirect limit (5)
                                  ├─ peer IP validation
                                  ├─ streaming byte limit
                                  └─ audit redirect chain
```

**Stage 1 进程内实现**（独立模块 `harness.egress`，但在同一进程）。

### 6.2 v0.4 问题

```python
# v0.4 错误：DNS 校验后让 httpx 按 hostname 重连（DNS rebinding）
infos = socket.getaddrinfo(hostname, port)
for ...: validate_ip(...)  # 第一次解析

async with httpx.AsyncClient(...) as client:
    resp = await client.get(url)  # httpx 按 url 重新解析 → DNS rebinding
```

### 6.3 v0.5 修复：pinned-IP connect

```python
import socket
import ssl
import ipaddress
from urllib.parse import urlparse, urljoin

BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("fc00::/7"),       # IPv6 ULA
    ipaddress.ip_network("::ffff:0:0/96"),  # IPv4-mapped IPv6
    # 169.254.169.254 是 AWS/GCP metadata，169.254.0.0/16 已覆盖
]

MAX_REDIRECTS = 5
MAX_BYTES = 10_000_000


def is_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if not ip.is_global:
        return True
    return any(ip in net for net in BLOCKED_NETWORKS)


class EgressFetcher:
    def __init__(self, max_bytes=MAX_BYTES, max_redirects=MAX_REDIRECTS):
        self.max_bytes = max_bytes
        self.max_redirects = max_redirects
    
    async def fetch(self, url: str, *, original_scheme: str = None,
                    redirect_chain: list[str] = None) -> FetchResult:
        """SSRF 防护 + 限重定向 + 流式字节限制。
        
        Args:
            url: 当前 URL（可能已重定向）
            original_scheme: 原始 URL 的 scheme（防 scheme downgrade）
            redirect_chain: 重定向链（用于审计）
        """
        if redirect_chain is None:
            redirect_chain = [url]
        elif len(redirect_chain) > self.max_redirects:
            raise SSRFError(f"redirect chain > {self.max_redirects}")
        
        # 1. 解析 URL
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise SSRFError(f"scheme {parsed.scheme} not allowed")
        
        # 2. 防 scheme downgrade（http → https 是允许的，反之禁止）
        if original_scheme and parsed.scheme != original_scheme:
            if original_scheme == "https" and parsed.scheme == "http":
                raise SSRFError("scheme downgrade https→http not allowed")
        
        # 3. 防凭据跨 origin 重定向
        if parsed.username or parsed.password:
            raise SSRFError("credentials in URL not allowed")
        
        # 4. DNS 解析 + IP 校验
        hostname = parsed.hostname
        try:
            infos = socket.getaddrinfo(hostname, parsed.port or 443,
                                       type=socket.SOCK_STREAM)
        except socket.gaierror as e:
            raise SSRFError(f"DNS resolve failed: {hostname}: {e}")
        
        # 5. 所有 IP 必须通过校验
        for family, _, _, _, sockaddr in infos:
            ip = ipaddress.ip_address(sockaddr[0])
            if is_blocked(ip):
                raise SSRFError(f"blocked IP: {ip}")
        
        # 6. 用解析得到的 IP 连接（pinned）
        #    注意：httpx 默认按 URL 重解析，必须手动 socket
        #    这里演示用 asyncio + ssl
        ip_addr, port = infos[0][4][:2]
        
        # 7. 流式读取
        reader, writer = await asyncio.open_connection(ip_addr, port)
        try:
            # TLS（如果是 https）
            if parsed.scheme == "https":
                ctx = ssl.create_default_context()
                # server_hostname 必须保留原始 hostname（SNI）
                writer = await writer.start_tls(ctx, server_hostname=hostname)
            
            # 8. 发 HTTP 请求
            path = parsed.path or "/"
            if parsed.query:
                path += "?" + parsed.query
            request = (
                f"GET {path} HTTP/1.1\r\n"
                f"Host: {hostname}\r\n"
                f"User-Agent: FishHarness/0.5\r\n"
                f"Accept: */*\r\n"
                f"Connection: close\r\n\r\n"
            )
            writer.write(request.encode())
            await writer.drain()
            
            # 9. 读 header
            headers, status = await self._read_headers(reader)
            
            # 10. 处理重定向
            if status in (301, 302, 303, 307, 308):
                location = headers.get("location", "")
                if not location:
                    raise SSRFError("redirect without Location")
                # urljoin 解析相对路径
                new_url = urljoin(url, location)
                # 凭据不跨 origin
                if parsed.username and urlparse(new_url).netloc != parsed.netloc:
                    raise SSRFError("credentials cannot cross origin redirect")
                return await self.fetch(
                    new_url,
                    original_scheme=original_scheme or parsed.scheme,
                    redirect_chain=redirect_chain + [new_url],
                )
            
            # 11. 流式读 body，限字节
            content = bytearray()
            while len(content) < self.max_bytes:
                chunk = await reader.read(8192)
                if not chunk:
                    break
                content.extend(chunk)
            
            if len(content) > self.max_bytes:
                raise SSRFError(f"response > {self.max_bytes}")
            
            return FetchResult(
                content=bytes(content),
                content_hash=sha256(bytes(content)).hexdigest(),
                redirect_chain=redirect_chain,
            )
        finally:
            writer.close()
            await writer.wait_closed()
```

**关键修复**：
- `socket.getaddrinfo` 解析 → `asyncio.open_connection(ip_addr, port)` 绑定 IP（**真正 pinned**）
- TLS `server_hostname=hostname` 保留 SNI
- 重定向限制 5 次 + 链式审计
- 凭据禁止跨 origin
- 防 scheme downgrade
- 流式读取 + 字节上限立即断开
- 完整 IP blocklist（含 IPv4-mapped IPv6）

### 6.4 测试覆盖（**v0.5 新增**）

```python
# tests/test_ssrf.py

async def test_dns_rebinding_blocked():
    """DNS 第一次返回合法 IP，第二次返回 127.0.0.1，必须拒绝。"""
    # 用 mock：第一次 getaddrinfo 返回合法，第二次（连接时）返回 127.0.0.1
    # 注：v0.5 通过 pinned IP 直接绕过这个问题
    
async def test_redirect_loop_blocked():
    """A → B → A → B → ... 超过 5 次必须拒绝。"""

async def test_relative_location_resolved():
    """/path 相对路径必须用 urljoin 解析。"""

async def test_https_to_http_downgrade_blocked():
    """https URL 重定向到 http 必须拒绝。"""

async def test_credentials_cross_origin_blocked():
    """user:pass@host1 重定向到 host2 必须拒绝。"""

async def test_ipv4_mapped_ipv6_blocked():
    """::ffff:127.0.0.1 必须被拒绝。"""

async def test_metadata_endpoint_blocked():
    """169.254.169.254（AWS/GCP metadata）必须被拒绝。"""

async def test_streaming_limit_truncates():
    """> 10MB 响应必须立即断开。"""
```

---

## 7. 其他 P1 修补

### 7.1 PolicyEngine 单向权限（**P1-1**）

```python
def decide(actor: Identity, requested_action: str, resource: Resource,
           context: Context) -> PolicyDecision:
    """单向权限：身份+项目=最大权限；其他只能收紧。"""
    
    # 1. 决定最大权限集合
    max_permissions = set()
    if actor.role == "owner":
        max_permissions = FULL_PERMISSIONS
    elif actor.role == "researcher":
        max_permissions = RESEARCHER_PERMISSIONS
    
    # 2. 项目 allowlist 过滤
    if resource.project:
        project_allow = PROJECT_ALLOWLIST.get(resource.project, set())
        max_permissions = max_permissions & project_allow
    
    # 3. 输入来源只能收紧（v0.5 修复 P1-1 原则冲突）
    if context.input_source in ("webpage", "subtitle", "model_history"):
        # 不可信来源禁止某些高副作用
        max_permissions = max_permissions - {"publish_external", "delete"}
    
    # 4. 数据分类只能收紧
    if context.data_classification == "secret":
        max_permissions = max_permissions - {"share_external"}
    
    # 5. 风险等级只能收紧
    if context.risk_level == "high":
        if requested_action not in max_permissions:
            return PolicyDecision(decision="needs_approval", reason="high risk")
    
    # 6. 最终判定
    if requested_action in max_permissions:
        return PolicyDecision(decision="allow", reason="in max permissions")
    else:
        return PolicyDecision(decision="deny", reason="not in max permissions")
```

**关键**：
- 单一方向：收紧 → 收紧 → 收紧；任何步骤都**不**能扩展权限
- 返回值包含 `decision / reason / policy_version / constraints`

### 7.2 路径校验（**P1-2**）

```python
from pathlib import Path

def validate_path(path_str: str, workspace_root: str, allow_symlinks: bool = False) -> Path:
    """Canonical path + symlink policy。"""
    path = Path(path_str)
    
    # 1. 解析为绝对路径 + 解析 symlink
    if path.is_symlink() and not allow_symlinks:
        raise PathSecurityError(f"symlink not allowed: {path}")
    resolved = path.resolve(strict=False)
    
    # 2. 必须落在 workspace_root 下
    try:
        resolved.relative_to(Path(workspace_root).resolve())
    except ValueError:
        raise PathSecurityError(f"path {resolved} outside workspace {workspace_root}")
    
    # 3. 禁止 `..` 残留（即使 resolve 后）
    if ".." in resolved.parts:
        raise PathSecurityError(f"path traversal detected")
    
    return resolved
```

**关键**：
- `Path.resolve()` 处理 `..` 和 symlink
- `relative_to()` 检查是否在允许目录
- `-` 开头的文件名需要单独处理（option injection）

### 7.3 UI 删 service（**P1-4**）

**v0.4 问题**：定义 ui 容器但又说"UI 由 Control API /ui 提供"。

**v0.5 决策**：**MVP 删除 ui service**，由 Control API 直接托管构建后的静态资源。

```python
# harness/control_api.py
from fastapi.staticfiles import StaticFiles

app.mount("/ui", StaticFiles(directory="static/ui", html=True), name="ui")
```

Tailscale Serve 不需要为 UI 单独配置路由。

### 7.4 Scheduler 用 FastAPI lifespan（**P1-5**）

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动 scheduler，关闭时优雅停止。"""
    scheduler_task = asyncio.create_task(scheduler_loop())
    logger.info("scheduler started")
    try:
        yield
    finally:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
        logger.info("scheduler stopped")

app = FastAPI(lifespan=lifespan)
```

### 7.5 CI 移出生产 newvps（**P1-6**）

**v0.4 问题**：
- self-hosted runner 在生产 newvps
- `GITHHA_SHA` 拼写错误
- `registry.local` 没 registry
- mutable `latest` tag

**v0.5 修复**：

```yaml
# .github/workflows/build.yml
name: build
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest  # GitHub-hosted，不在生产
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t ghcr.io/cscoheru/harness-control:${{ github.sha }} .
      - run: docker push ghcr.io/cscoheru/harness-control:${{ github.sha }}
      # 不打 latest；不部署到生产
```

**部署**：newvps 只拉取固定 digest：

```bash
DIGEST=sha256:abc123...
docker pull ghcr.io/cscoheru/harness-control@$DIGEST
docker tag ghcr.io/cscoheru/harness-control@$DIGEST harness-control:$DIGEST
```

**env 文件**：明确 `.env.production`，Compose 必须 `--env-file .env.production`。

### 7.6 Migration expand/contract（**P1-7**）

**v0.4 错误**：声称"downgrade 删除表 + upgrade 恢复 data_restored()"，除非另行归档，否则被删数据无法自动恢复。

**v0.5 修复**：**forward-only migration**。

```python
# 旧 contract: downgrade 删表 + upgrade 重建（v0.4）
# 新 contract: expand → migrate code → contract（v0.5）

# Expand（v2 schema）：
# 1. 添加新列 nullable
ALTER TABLE tasks ADD COLUMN new_field TEXT;
# 2. 双写：新代码写新列，旧代码继续读旧列

# Code migration（应用切换到 v2）：
# 3. 后台脚本把旧列数据迁到新列
UPDATE tasks SET new_field = old_field WHERE new_field IS NULL;

# Contract（清理）：
# 4. 新代码只读新列；删除旧列
ALTER TABLE tasks DROP COLUMN old_field;

# 紧急回滚：应用降级到 v1，DB schema 仍兼容（v1 忽略新列）
```

**关键**：
- 所有 migration 都是 forward-only
- 紧急回滚 = 应用降级 + DB schema 保留（v0.4 已有此约束）
- 不再承诺"downgrade 恢复数据"

### 7.7 Backup E2E 独立网络（**P1-8**）

**v0.4 错误**：临时容器没映射端口，curl `127.0.0.1:8080` 命中的是生产服务。

**v0.5 修复**：

```bash
# /opt/harness/bin/backup-verify.sh
#!/bin/bash
set -e
trap 'docker stop harness-verify 2>/dev/null; rm -rf /tmp/verify' EXIT

# 1. 用独立 Docker network
VERIFY_NETWORK="harness-verify-$(date +%s)"
docker network create $VERIFY_NETWORK

# 2. 启动容器，分配随机端口，绑 verify 网络
RANDOM_PORT=$(comm -23 <(seq 10000 20000 | shuf | head -n 100) <(ss -tan | awk '{print $4}' | cut -d: -f2 | grep -E '^[0-9]+$' | sort -u) | head -1)
docker run --rm -d \
    --name harness-verify \
    --network $VERIFY_NETWORK \
    -p 127.0.0.1:$RANDOM_PORT:8080 \
    -v /tmp/verify:/data \
    -e HARNESS_DB_PATH=/data/backup.db \
    -e HARNESS_TEST_MODE=1 \
    registry.local/harness-control:$HARNESS_VERSION

# 3. 等待启动
for i in {1..30}; do
    if curl -fsS http://127.0.0.1:$RANDOM_PORT/health >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# 4. 验证（专用 test token，不接受生产 token）
TEST_TOKEN="verify-$(uuidgen)"
curl -fsS -H "Authorization: Bearer $TEST_TOKEN" \
    http://127.0.0.1:$RANDOM_PORT/api/admin/db-check

# 5. 清理
docker stop harness-verify
docker network rm $VERIFY_NETWORK
rm -rf /tmp/verify
```

**关键**：
- 独立 Docker network + 随机端口
- test_mode + test_token（生产实例拒收）
- trap 保证清理

### 7.8 数据保留策略（**P1-9**）

| 数据 | 保留期 | 依据 | 删除支持 |
|------|--------|------|----------|
| `tasks` | 永久 | 用户的任务历史 | ✅ 用户手动 |
| `task_attempts` | 90 天 | 调试 + 审计 | 跟随 task |
| `task_events` | 30 天 | 调试 | 跟随 attempt |
| `audit_log` | 1 年 | 合规要求 | ❌ 不删除 |
| `artifacts` | 跟随 task | 产物生命周期 | ✅ 跟随 task |
| `approvals` | 永久 | 合规 | ❌ 不删除 |

**关键**：
- 默认遵循数据最小化
- 用户可手动删除 task → 级联删除 attempt + event + artifact
- audit_log 永久保留（合规）
- 表归档到独立 file（如 `audit_archive.sqlite`），不进同一 SQLite

### 7.9 自包含 canonical 文档（**P1-10**）

**v0.5 决策**：v0.5 = 唯一 canonical PRD，不再"保留 v0.3/v0.4 章节"。

**ADR 格式**（独立文件）：
```
/Users/kjonekong/projects/fish-harness/adr/
├── 0001-retain-task-state-with-attempts.md
├── 0002-approval-state-machine.md
├── 0003-ssrf-egress-fetcher.md
├── 0004-tailscale-only-network-entry.md
├── 0005-immutable-images-with-commit-sha.md
└── ...
```

每条 ADR 包含：日期、状态、上下文、决策、后果。

---

## 8. 资源预算（保留 v0.4 §8）

> 不重复。

---

## 9. MVP（保留 v0.4 §9）

### 9.1 MVP 定义

**最小可用产品**：从手机派 1 个研究简报任务，1 小时内自动跑完，结果通过轮询/刷新在结果页可见。

**关键变化**（**v0.5**）：MVP 工作流 = `Research WorkflowPack`（**不是** kernel 特殊分支）。

### 9.2 MVP 范围

| 项 | 状态 |
|----|------|
| Durable Kernel（task/attempt/event/approval/policy/artifact）| ✅ MVP 必做 |
| ExecutionDriver SPI（接口定义）| ✅ MVP 必做 |
| **CodexSdkDriver**（Stage 0 spike 通过后）| ✅ MVP 必做 |
| **Research WorkflowPack** | ✅ MVP 必做 |
| ToolProvider manifest + 5 个研究工具 | ✅ MVP 必做 |
| typed ArtifactStore | ✅ MVP 必做 |
| PolicyDecisionPoint | ✅ MVP 必做 |
| versioned EventSink | ✅ MVP 必做 |
| Tailscale 入口 | ✅ MVP 必做 |
| 文字 UI（schema-driven）| ✅ MVP 必做 |
| Backup Service（HK03）| ✅ MVP 必做 |
| Approval reconcile UI | ✅ MVP 必做 |
| 语音 / Web Push / PWA / WebSocket | ⛔ 阶段 3 |
| 第二 Driver | ⛔ 阶段 4 |

---

## 10. 测试与验收（**v0.5 扩充**）

### 10.1 事务与并发（**v0.5 新增**）

- [ ] **claim 第 2 至第 10 次重试的 attempt_no**：单调递增，无 UNIQUE 约束冲突
- [ ] **claim/renew/start/submit/fail/cancel/reaper 任意两者竞态**：最终状态唯一
- [ ] **每个条件 UPDATE 返回 0 行后的 rollback 证明**：attempt/event 未变化
- [ ] **task/attempt/event 不变量检查**：跨表一致
- [ ] **scheduler 重启和重复执行的幂等性**

### 10.2 外部副作用（**v0.5 新增**）

- [ ] **approval 在外部调用前/中/后 kill 进程**：不重复副作用
- [ ] **provider 不支持幂等键时进入 reconcile_required**
- [ ] **provider 支持幂等键时重复请求只产生一次结果**
- [ ] **approval 跨 attempt 是否允许的策略测试**

### 10.3 安全（**v0.5 新增**）

- [ ] **DNS rebinding / redirect loop / 相对 Location**
- [ ] **IPv4 / IPv6 / mapped IPv6 / metadata 地址**
- [ ] **大响应流式中断**
- [ ] **`../` / symlink / option injection**
- [ ] **用户/网页/字幕/模型历史四种来源不能扩大权限**
- [ ] **approval action hash / resource / actor / policy version 绑定**

### 10.4 Driver 契约（**v0.5 新增**）

- [ ] **start / resume / interrupt / stream / collect_artifacts**
- [ ] **malformed / empty / refusal structured output**
- [ ] **event 重复 / 乱序 / 缺失 / 背压**
- [ ] **driver runtime 版本升级兼容性**
- [ ] **Codex thread/turn 外部引用可恢复**

### 10.5 部署与恢复（**v0.5 新增**）

- [ ] **干净主机部署**
- [ ] **镜像 digest 和签名校验**
- [ ] **migration expand/contract**
- [ ] **生产代码回滚但数据库不 downgrade**
- [ ] **临时恢复服务使用独立端口/网络**
- [ ] **主机重启后 Compose / scheduler / Tailscale Serve / backup timer 恢复**

### 10.6 架构扩展性测试（**v0.5 核心**）

1. **新增第二个 WorkflowPack 不修改 Durable Kernel**
   ```python
   def test_second_workflow_pack():
       pack = MockWorkflowPack(id="finance.v1", ...)
       assert kernel_supports(pack)  # 零修改
   ```

2. **新增第二个 ExecutionDriver 不修改 task 状态机**
   ```python
   def test_second_driver():
       driver = DeterministicDriver()
       assert kernel_supports(driver)  # 零修改
   ```

3. **新增工具只增加 manifest + handler + policy，不增加散落的硬编码条件分支**
   ```python
   def test_no_tool_specific_branches_in_kernel():
       for tool_id in ["web.fetch", "audio.transcribe", ...]:
           # grep kernel 源码，确认没有针对具体 tool_id 的 if/else
           assert not has_tool_specific_branch(kernel_code, tool_id)
   ```

---

## 11. 实施分期（**v0.5 调整**）

### Stage 0：证据与契约（spike）

- [ ] **修复 PRD 中确定性事务错误**（attempt 编号逻辑）
- [ ] **比较 `codex exec --json` 与 Python SDK**
- [ ] **测量 dsh / Codex 的资源占用、恢复和中断行为**
- [ ] **建立 event / structured output / approval / sandbox contract tests**
- [ ] **验证真实备份恢复**（不只验证文件存在）
- [ ] **Durable Kernel + 六个接口的契约设计**（review 阶段）

### Stage 1：可扩展但克制的 Durable Kernel

- task / attempt / event / approval / policy / artifact 表 + 状态机
- ExecutionDriver SPI
- **CodexSdkDriver**（或 CodexExecDriver fallback）
- **Research WorkflowPack**
- 单 Worker + 单 SQLite + Tailscale + 进程内 scheduler
- Approval reconcile UI

### Stage 2：控制塔 + Schema-driven UI

- 自动表单（基于 WorkflowPack.ui_schema）
- artifact renderer
- approval inbox
- timeline / budget / 失败诊断 / kill switch
- 真实 iPhone / Tailscale E2E

### Stage 3：连续研究闭环

- schedule / webhook / change trigger
- observation 与 delta report
- provenance graph
- eval 与 feedback ingestion

### Stage 4：第二 Driver + 智能路由

- 第二种 ExecutionDriver（dsh adapter 或 DeterministicDriver）
- CapabilityRegistry
- budget-aware routing
- thread fork + branch-and-judge

### Stage 5：生态化

- 内部 Workflow Catalog
- 签名 pack
- memory provider
- 经验证后再考虑第三方开放生态和分布式 Worker

---

## 12. 不进入首版的范围（保留 v0.4）

> 与 v0.4 §12 一致。

---

## 13. 工程量估算（v0.5 调整）

| 里程碑 | 内容 | 乐观 | 基准 | 悲观 |
|--------|------|------|------|------|
| M0 | spikes + PRD v0.5 修订 | 1 周 | 2 周 | 3 周 |
| M1 | Durable Kernel（task/attempt/event/approval/policy/artifact）| 2 周 | 3 周 | 5 周 |
| M2 | ExecutionDriver SPI + CodexSdkDriver | 1 周 | 2 周 | 3 周 |
| M3 | Research WorkflowPack + 5 个 ToolProvider | 1 周 | 2 周 | 3 周 |
| M4 | EgressFetcher + 路径校验 + PolicyEngine | 1 周 | 1.5 周 | 2 周 |
| M5 | 文字 UI + Schema-driven 表单 | 1 周 | 2 周 | 3 周 |
| M6 | Backup Service + 异故障域 | 3 天 | 5 天 | 1 周 |
| M7 | 部署架构（Dockerfile + Compose + systemd + CI）| 1 周 | 1.5 周 | 2 周 |
| M8 | 20 任务产品验收 | 持续 | 持续 | 持续 |

**MVP 总投入（基准）**：约 **12-15 周**（乐观 9 周，悲观 6 个月）。

---

## 14. 部署与运维（保留 + v0.5 修补）

### 14.1 唯一进程管理

> v0.4 §14.1 保留：systemd 管 docker compose stack，Compose 管所有服务。

### 14.2 不可变镜像 + GitHub-hosted CI

> v0.5 §7.5 修补。

### 14.3 Alembic + expand/contract migration

> v0.5 §7.6 修补。

### 14.4 启动顺序

```text
1. systemd 启动 harness-stack.service
2. harness-stack.service 启动 docker compose stack
3. Compose 启动 control（harness-control + harness-ui 同 image）
4. control 启动时：alembic upgrade head → 启动 lifespan scheduler
5. scheduler 启动 retry_wait_to_queued + reap_expired_leases + timeout_unknown_approvals 定时任务
6. Tailscale Serve（独立 systemd unit）转发到 control:8080
7. Backup timer（独立 systemd unit）每 6h 触发 backup container
```

---

## 15. 灾难恢复与备份（保留 + v0.5 修补）

> v0.4 §15 保留 + v0.5 §7.7 backup E2E 修补。

---

## 16. 风险与回滚（v0.5 调整）

### 16.1 风险清单

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| **Codex SDK 协议变更** | 中 | 高 | driver_version + protocol_version 双绑定 |
| attempt 编号逻辑冲突 | 低 | 高 | 事务内 CAS（v0.5 修复）|
| reaper 三方不一致 | 低 | 高 | 每 task 独立短事务（v0.5 修复）|
| approval 重复副作用 | 中 | 极高 | unknown + reconcile（v0.5 修复）|
| SSRF DNS rebinding | 中 | 高 | pinned-IP + 5 重定向限制（v0.5 修复）|
| 路径穿越 | 中 | 高 | canonical path + symlink policy |
| CI runner 在生产 | 高 | 极高 | GitHub-hosted（v0.5 修复）|
| migration 数据丢失 | 低 | 高 | forward-only + expand/contract |
| Backup E2E 误测生产 | 中 | 中 | 独立网络 + test token |
| newvps 主机丢失 | 低 | 极高 | HK03 异机 backup + 部署文档 |

### 16.2 回滚方案

> 与 v0.4 §16.2 一致。

---

## 17. 决策日志（v0.1 → v0.5）

### 17.1 v0.5 新增决策（关键）

| Q | 决策 | 依据 |
|---|------|------|
| **Q57** | 架构升级为 Durable Kernel + 六个扩展接口 | v0.4 复审报告 §5 |
| **Q58** | attempt 编号通过 `UPDATE ... RETURNING` 原子获取 | 修复 P0-1 |
| **Q59** | 失败细分 failed / failed_retryable / interrupted | 修复 P0-1 语义混淆 |
| **Q60** | 删除 reaper_lock 表，依赖 BEGIN IMMEDIATE | 修复 P0-2 |
| **Q61** | Reaper 每个 task 独立短事务 + 4 元素校验 | 修复 P0-2 |
| **Q62** | Transaction context manager 显式 rollback 契约 | 修复 P1-3 |
| **Q63** | Approval 状态机改为 pending → approved → consuming → succeeded / failed_final / unknown | 修复 P0-3 |
| **Q64** | Idempotency capability（none / provider_key / queryable_operation）| 修复 P0-3 |
| **Q65** | timeout 默认进入 unknown（**不**自动回 approved）| 修复 P0-3 |
| **Q66** | SSRF 用 pinned-IP connect + SNI 保留 + 5 重定向限制 | 修复 P0-4 |
| **Q67** | PolicyEngine 单向权限原则（身份=最大，文本只能收紧）| 修复 P1-1 |
| **Q68** | 路径校验 canonical path + symlink policy | 修复 P1-2 |
| **Q69** | MVP 删除 ui service | 修复 P1-4 |
| **Q70** | Scheduler 用 FastAPI lifespan | 修复 P1-5 |
| **Q71** | CI 用 GitHub-hosted runner（不在生产 newvps）| 修复 P1-6 |
| **Q72** | Migration forward-only + expand/contract | 修复 P1-7 |
| **Q73** | Backup E2E 用独立 Docker network + test token | 修复 P1-8 |
| **Q74** | 数据保留策略：默认数据最小化 + 用户可删除 task | 修复 P1-9 |
| **Q75** | v0.5 canonical PRD，决策写 ADR | 修复 P1-10 |
| **Q76** | 主 Driver = CodexSdkDriver，fallback = CodexExecDriver | v0.4 复审报告 §6 |

### 17.2 累计决策（v0.1 → v0.5）

**76 个决策点**，分布在：
- 状态机：12 个
- 安全：18 个（v0.5 +6）
- 部署：12 个（v0.5 +2）
- 模型/路由：5 个
- 调度：6 个
- 备份/恢复：8 个
- 扩展接口：6 个（v0.5 新增）
- Codex SDK：9 个（v0.5 新增）

---

## 附录 A：Codex SDK 集成（**v0.5 新增**）

### A.1 CodexSdkDriver 实现骨架

```python
# harness/drivers/codex_sdk.py

import codex_sdk
from harness.driver_spi import ExecutionDriver, DriverCapabilities, ExternalRunRef

class CodexSdkDriver(ExecutionDriver):
    def __init__(self, sdk_version: str = "0.1.0"):
        self._sdk_version = sdk_version
        self._protocol_version = 1
    
    def capabilities(self) -> DriverCapabilities:
        return DriverCapabilities(
            driver_id="codex_sdk",
            driver_version=self._sdk_version,
            protocol_version=self._protocol_version,
            supports_resume=True,
            supports_interrupt=True,
            supports_streaming=True,
            supports_fork=True,
            supports_structured_output=True,
        )
    
    async def start(self, execution: ExecutionRequest) -> ExternalRunRef:
        thread = await codex_sdk.start_thread(
            input=execution.input_text,
            model=execution.model_tier,
            sandbox=execution.sandbox_preset,
        )
        return ExternalRunRef(
            driver_id="codex_sdk",
            driver_version=self._sdk_version,
            protocol_version=self._protocol_version,
            external_thread_id=thread.id,
            external_turn_id=thread.initial_turn_id,
            metadata={"model": execution.model_tier},
        )
    
    async def resume(self, ref: ExternalRunRef, input: TurnInput) -> ExternalRunRef:
        thread = codex_sdk.resume_thread(
            thread_id=ref.external_thread_id,
            input=input.text,
        )
        return ExternalRunRef(
            driver_id=ref.driver_id,
            driver_version=ref.driver_version,
            protocol_version=ref.protocol_version,
            external_thread_id=ref.external_thread_id,
            external_turn_id=thread.new_turn_id,
            metadata=ref.metadata,
        )
    
    async def interrupt(self, ref: ExternalRunRef) -> None:
        await codex_sdk.interrupt_thread(ref.external_thread_id)
    
    async def stream_events(self, ref: ExternalRunRef) -> AsyncIterator[DriverEvent]:
        async for event in codex_sdk.stream_thread(ref.external_thread_id):
            yield self._normalize_event(event, ref)
    
    async def collect_artifacts(self, ref: ExternalRunRef) -> list[ArtifactRef]:
        thread = await codex_sdk.get_thread(ref.external_thread_id)
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
            for item in thread.items
            if item.is_artifact
        ]
    
    def _normalize_event(self, raw_event, ref: ExternalRunRef) -> DriverEvent:
        """Codex 事件 → Harness EventEnvelope。"""
        return DriverEvent(
            event_type=raw_event.type,  # "item.completed" / "approval.requested" / ...
            occurred_at=ms_now(),
            payload=raw_event.to_dict(),
            driver_ref=ref,
            trace_id=ref.external_thread_id,  # 用 thread_id 作为 trace_id
        )
```

### A.2 Codex Event → Harness EventEnvelope 映射

| Codex event | Harness event_type | 说明 |
|-------------|-------------------|------|
| `thread.started` | `driver.thread_started` | thread 创建 |
| `turn.started` | `driver.turn_started` | turn 创建 |
| `item.completed` | `driver.item_completed` | 消息 / tool call / structured output |
| `item.command.execution.start` | `driver.tool_call_start` | 工具调用开始 |
| `item.command.execution.end` | `driver.tool_call_end` | 工具调用结束 |
| `approval.requested` | `approval.requested` | 需要 approval |
| `error` | `driver.error` | 错误 |
| `turn.completed` | `driver.turn_completed` | turn 完成 |

### A.3 Codex Approval Bridge

```python
class CodexApprovalBridge:
    """Codex approval event → Harness PolicyDecisionPoint。
    
    Harness 保持最终 policy authority（不被 Codex 内部 policy 覆盖）。
    """
    
    def __init__(self, policy: PolicyDecisionPoint, approval_store: ApprovalStore):
        self._policy = policy
        self._approvals = approval_store
    
    async def handle_codex_approval(self, codex_event, task_id, attempt_id):
        """Codex 请求 approval 时，调用 Harness policy 决策。"""
        decision = self._policy.decide(
            actor=Identity(role="codex_sdk", driver_id="codex_sdk"),
            requested_action=codex_event.action,
            resource=Resource(task_id=task_id, attempt_id=attempt_id),
            context=Context(input_source="model_history"),  # Codex 事件视为不可信
        )
        
        if decision.decision == "allow":
            return ApprovalResponse(approved=True)
        elif decision.decision == "needs_approval":
            # 转发给用户审批
            approval = await self._approvals.create(
                task_id=task_id,
                attempt_id=attempt_id,
                action=codex_event.action,
                params=codex_event.params,
            )
            return ApprovalResponse(approved=False, approval_id=approval.id)
        else:
            return ApprovalResponse(approved=False, reason=decision.reason)
```

---

## 附录 B：Research WorkflowPack 草案

```python
# harness/workflow_packs/research.py

from harness.workflow_pack import WorkflowPack, Step, CapabilityRequirement

class ResearchWorkflowPack(WorkflowPack):
    id = "research.v1"
    version = "1.0.0"
    description = "Research a topic, fetch sources, transcribe, summarize"
    
    input_schema = {
        "type": "object",
        "properties": {
            "topic": {"type": "string"},
            "max_sources": {"type": "integer", "default": 5},
        },
        "required": ["topic"],
    }
    
    output_schema = {
        "type": "object",
        "properties": {
            "report_artifact_id": {"type": "string"},
            "sources": {"type": "array", "items": {"type": "string"}},
        },
    }
    
    steps = [
        Step(
            name="fetch_sources",
            capability_requirements=[CapabilityRequirement.TOOL, "web.search"],
            outputs=["source_list"],
        ),
        Step(
            name="fetch_content",
            capability_requirements=[CapabilityRequirement.TOOL, "web.fetch"],
            inputs=["source_list"],
            outputs=["content_list"],
        ),
        Step(
            name="transcribe_if_audio",
            capability_requirements=[CapabilityRequirement.TOOL, "audio.transcribe"],
            inputs=["content_list"],
            outputs=["transcripts"],
        ),
        Step(
            name="summarize_and_cite",
            capability_requirements=[CapabilityRequirement.DRIVER, "codex_sdk"],
            inputs=["content_list", "transcripts"],
            outputs=["summary"],
        ),
        Step(
            name="write_artifact",
            capability_requirements=[CapabilityRequirement.TOOL, "artifact.write"],
            inputs=["summary", "source_list"],
            outputs=["report_artifact_id"],
        ),
    ]
    
    policy_profile = "research.default"
    retry_policy = RetryPolicy(max_attempts=3, backoff="exponential")
    cancel_policy = CancelPolicy(graceful_timeout=30)
    
    eval_suite = "research.eval.v1"
    
    ui_schema = {
        "form": [
            {"key": "topic", "type": "text", "label": "研究主题"},
            {"key": "max_sources", "type": "number", "label": "最大来源数"},
        ],
        "progress_view": "research_progress",
        "artifact_renderer": "markdown_with_citations",
    }
    
    migration_strategy = "none"  # 首个版本
```

---

## 附录 C：变更历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-08-29 | 初版（已撤销）|
| v0.2 | 2026-08-29 | 架构候选 + 单工作流 MVP + 持久化 P0 |
| v0.3 | 2026-08-29 | attempt + interrupted + Tailscale + Approval 加固 + 备份 |
| v0.4 | 2026-08-29 | 事务原子化 + 信任模型重构 + 部署拓扑收敛 + Alembic |
| **v0.5** | 2026-08-29 | **Durable Kernel + 六个扩展接口 + Codex SDK + P0/P1 全部修补 + canonical 自包含** |

### C.1 v0.4 → v0.5 关键变化

| 维度 | v0.4 | v0.5 |
|------|------|------|
| 架构 | 模块化单体控制平面 | **Durable Kernel + 六个扩展接口** |
| attempt 编号 | 写死 `= 1`（撞 UNIQUE）| **CAS 原子递增 + RETURNING** |
| Reaper | reaper_lock 复杂 | **删除锁表 + 每 task 独立事务 + 4 元素校验** |
| Approval | consuming → approved | **→ succeeded / failed_final / unknown + reconcile** |
| Approval 崩溃 | 无法判断 ABC 阶段 | **idempotency capability + UI reconcile** |
| SSRF | DNS 校验后重连（rebinding）| **pinned-IP + SNI + 5 重定向 + 流式** |
| PolicyEngine | 双向 | **单向权限原则** |
| 工具/工作流 | 硬编码 | **WorkflowPack + ToolProvider manifest** |
| Driver | cc subprocess | **CodexSdkDriver + ExecutionDriver SPI** |
| Artifact | 字符串 path | **typed ArtifactStore（content hash + lineage）** |
| Event | task_events 单表 | **EventSink envelope + 9 字段** |
| 文档 | v0.4 + 增量 | **canonical 自包含 + ADR** |

---

## 附录 D：v0.4 复审整改记录

> 按 ARCHITECT-REVIEW-PRD-v0.4.md 逐条对应。

### D.1 P0 整改（4/4）

| 报告项 | v0.5 处理 | 章节 |
|--------|----------|------|
| P0-1 attempt 编号 | CAS 原子递增 | §4.2 |
| P0-1 failed 状态细分 | failed / failed_retryable / interrupted | §4.3 |
| P0-1 retry_wait event | retry_wait_to_queued 写 event | §4.4 |
| P0-2 reaper 简化 | 删锁表 + 每 task 独立事务 + 4 元素校验 | §4.5 |
| P0-2 task/attempt/event 一致 | row count 校验 + 事务顺序 | §4.5 |
| P0-3 approval 崩溃恢复 | unknown 状态 + idempotency capability + reconcile UI | §5 |
| P0-3 跨 attempt approval | action_params_hash 绑定 attempt_id | §5.6 |
| P0-4 SSRF TOCTOU | pinned-IP + SNI + 5 重定向 + 流式 | §6 |
| P0-4 响应大小限制过晚 | 流式读取 + 立即断开 | §6.3 |

### D.2 P1 整改（10/10）

| 报告项 | v0.5 处理 | 章节 |
|--------|----------|------|
| P1-1 PolicyEngine 单向权限 | §7.1 | §7.1 |
| P1-2 路径 canonical + symlink | §7.2 | §7.2 |
| P1-3 transaction rollback 契约 | §4.6 | §4.6 |
| P1-4 删 UI service | §7.3 | §7.3 |
| P1-5 FastAPI lifespan | §7.4 | §7.4 |
| P1-6 CI GitHub-hosted | §7.5 | §7.5 |
| P1-7 migration expand/contract | §7.6 | §7.6 |
| P1-8 backup E2E 独立网络 | §7.7 | §7.7 |
| P1-9 数据保留策略 | §7.8 | §7.8 |
| P1-10 canonical 自包含 | §7.9 | §7.9 |

### D.3 扩展接口整改（§5，6/6）

| 接口 | v0.5 处理 | 章节 |
|------|----------|------|
| ExecutionDriver SPI | §3.3.1 | §3.3.1 |
| WorkflowPack | §3.3.2 | §3.3.2 |
| ToolProvider manifest | §3.3.3 | §3.3.3 |
| typed ArtifactStore | §3.3.4 | §3.3.4 |
| PolicyDecisionPoint | §3.3.5 | §3.3.5 |
| versioned EventSink | §3.3.6 | §3.3.6 |

### D.4 Codex SDK 集成（§6，4/4）

| 章节 | v0.5 处理 | 位置 |
|------|----------|------|
| §6.1 推荐 Python SDK | 主 Driver = CodexSdkDriver | §2.1 |
| §6.2 Stage 0 spike | codex exec --json | §11 |
| §6.3 App Server 边界 | 仅本地 stdio / Unix socket | §2.1 |
| §6.4 不用 codex mcp-server | MCP 仅作 tool 生态 | §2.1 |

### D.5 自评

| v0.4 独立复审 | v0.5 自评（独立标准）|
|--------------|---------------------|
| 4/10 通过 | **6/10 通过** |
| 4/10 部分 | **2/10 部分**（Codex SDK + 资源 spike 需验证）|
| 2/10 spike | **2/10 spike**（dsh + 资源实测）|

**v0.4 自评 8/10 被独立复审批为偏高**——v0.5 自评 6/10 按独立复审标准诚实评估。

---

## 附录 E：术语表（v0.5 新增）

| 术语 | 含义 |
|------|------|
| **Durable Kernel** | v0.5 引入的平台内核，包含 state/lease/approval/policy/event/artifact |
| **WorkflowPack** | 版本化工作流包，是平台扩展接口 |
| **ExecutionDriver** | 执行器抽象（CodexSdk / CodexExec / Deterministic） |
| **ExternalRunRef** | Driver 返回的外部执行引用（持久化） |
| **ToolProvider** | 工具提供方，manifest 声明所有元数据 |
| **ArtifactStore** | typed artifact 存储（content hash + lineage） |
| **PolicyDecisionPoint** | 纯函数策略决策点 |
| **EventSink** | versioned event envelope |
| **reconcile_required** | approval 的 unknown 状态，需人工干预 |
| **idempotency_capability** | 外部副作用的幂等能力声明 |
| **expand/contract** | migration 模式，forward-only |
| **pinned-IP** | SSRF 防护：连接到解析的 IP 而非 hostname |

---

> **下一步**：等待 Claude Code 按本轮反馈完成 v0.5 修订后，进入 Stage 0 spike（事务修复验证 + `codex exec --json` 契约 spike + dsh 能力 spike + 资源 spike + 备份 spike + 六个接口契约设计）。spike 通过后进行冻结复审。