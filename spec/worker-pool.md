# Worker Pool — 4 层负载均衡规范

> **File**: `spec/worker-pool.md`
> **Version**: v0.9.4
> **Date**: 2026-08-30
> **Status**: Accepted (M0 scope)
> **Supersedes**: v0.9-B 的 dispatch / heartbeat / drain 触发器；v0.9.4 修复 Codex v0.9.3 提出的 attempt-side ownership 漏洞 + worker.registered vs worker.dispatched 事件语义混淆 + 真并发 dispatch_worker lost update
> **Inherits**: `spec/state-transitions.md §1.1`（`claim()` 行为不变；v0.9-B 在上层加 dispatch）

---

## §1 模型概览

Harness 把 worker 调度分成 4 层，每层有不同的**生命周期**和**强制语义**：

```text
L0 task_dispatch     task 创建 → 选 worker
                      策略：capability-match 优先，fallback round-robin
                      落点：WorkerPool.dispatch(task_id) → worker_id

L1 worker_lifecycle  worker 注册 / 心跳 / 退役
                      强制：worker 必须周期 renew last_heartbeat_at；超时即被 reaper 标 stale
                      落点：workers 表 + worker.heartbeat 事件

L2 cross_server      跨 host 的 worker 协调
                      例：local-host:5 worker + remote-host:3 worker
                      挑战：fence_version 是 task-local（Q107 决策），跨 host 不冲突
                      答案：partial unique index + SQLite WAL sync（共享 file-DB）

L3 graceful_drain    worker 退役 / 服务器维护
                      触发：worker drain → kernel 暂停派发 → 等 active 完成 → 退出
                      强制：active attempt 持有 lease_token，drain 不强制 kill
```

---

## §2 Schema 落地

### 2.1 新表 `workers`

```sql
CREATE TABLE workers (
    worker_id              TEXT PRIMARY KEY,        -- e.g. 'host01:pid:uuid'
    host                   TEXT NOT NULL,           -- hostname (used for L2 cross-server)
    capabilities_json      TEXT NOT NULL DEFAULT '[]',  -- JSON array of capability ids
    status                 TEXT NOT NULL CHECK (status IN (
                              'active', 'draining', 'drained', 'stale'
                            )),
    last_heartbeat_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    current_attempt_id     TEXT,                    -- nullable; set when worker has active attempt
    registered_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    drained_at             TEXT,                    -- set when status='drained'
    FOREIGN KEY (current_attempt_id) REFERENCES task_attempts(attempt_id)
);

-- A worker holding an active attempt must reference a task_attempts row in
-- the same task — closes P0-9N.
CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_workers_host ON workers(host);
CREATE INDEX idx_workers_attempt ON workers(current_attempt_id)
    WHERE current_attempt_id IS NOT NULL;
```

### 2.2 I15 / I16 / I17 触发器

```sql
-- Invariant I15: an attempt that is claimed/running/cancel_requested MUST
-- reference a non-NULL worker. Closes P0-9I.
CREATE TRIGGER trg_attempt_active_needs_worker
BEFORE INSERT ON task_attempts
FOR EACH ROW
WHEN NEW.status IN ('claimed', 'running', 'cancel_requested') AND NEW.worker_id IS NULL
BEGIN
    SELECT RAISE(ABORT, 'I15: active attempt must reference a worker_id');
END;

-- Invariant I16: heartbeat must advance last_heartbeat_at. Closes P0-9J.
CREATE TRIGGER trg_worker_heartbeat_renew
BEFORE UPDATE ON workers
FOR EACH ROW
WHEN NEW.status = 'active'
     AND OLD.last_heartbeat_at = NEW.last_heartbeat_at
BEGIN
    SELECT RAISE(ABORT, 'I16: worker heartbeat must advance last_heartbeat_at');
END;

-- Invariant I17: when transitioning to 'draining', the worker's
-- current_attempt_id MUST NOT reference an already-terminal attempt
-- (stale-pointer rejection). Closes P0-9K.
CREATE TRIGGER trg_worker_drain_pause
BEFORE UPDATE ON workers
FOR EACH ROW
WHEN OLD.status = 'active' AND NEW.status = 'draining'
     AND NEW.current_attempt_id IS NOT NULL
     AND (SELECT status FROM task_attempts WHERE attempt_id = NEW.current_attempt_id)
         IN ('succeeded','failed','canceled','expired')
BEGIN
    SELECT RAISE(ABORT, 'I17: cannot drain worker with stale current_attempt_id (already terminal)');
END;

-- Invariant I15 (companion): on the task_attempts side, when status transitions
-- to active, the referenced worker MUST exist in the workers table.
CREATE TRIGGER trg_attempt_worker_exists
BEFORE INSERT ON task_attempts
FOR EACH ROW
WHEN NEW.worker_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM workers WHERE worker_id = NEW.worker_id)
BEGIN
    SELECT RAISE(ABORT, 'I15: task_attempts.worker_id must reference an existing workers row');
END;
```

### 2.3 I15 partial unique index（task_attempts 侧）

```sql
-- A single worker cannot hold two simultaneously-active attempts. This is
-- the "fairness" backstop: dispatch must NOT issue two claims for the same
-- worker concurrently. Closes P0-9H.
CREATE UNIQUE INDEX idx_worker_one_active_attempt
    ON task_attempts(worker_id)
    WHERE worker_id IS NOT NULL
      AND status IN ('claimed', 'running', 'cancel_requested');
```

> **Note**: `idx_attempts_one_active`（v0.8）继续保留：每 task 最多 1 active attempt。
> 新索引 `idx_worker_one_active_attempt`（v0.9-B）：每 worker 最多 1 active attempt。
> 两条索引配合 → task × worker 二维唯一。

### 2.4 v0.9.4 attempt-side ownership trigger（bidirectional backstop）

```sql
-- Attempt-side backstop (closes Codex v0.9.3 P0-M2-2): UPDATE OF worker_id on
-- task_attempts must not leave a dangling pointer in another worker's
-- current_attempt_id. Together with the worker-side trg_worker_ownership_update,
-- this enforces bidirectional ownership consistency across the two tables.
--
-- NULL-safe via NEW.worker_id IS NOT OLD.worker_id (the only NULL-safe
-- inequality in SQLite; != returns UNKNOWN when either operand is NULL and
-- silently bypasses RAISE).
CREATE TRIGGER trg_attempt_owner_consistent_update
BEFORE UPDATE OF worker_id ON task_attempts
FOR EACH ROW
WHEN NEW.worker_id IS NOT OLD.worker_id
     AND EXISTS (
         SELECT 1 FROM workers
         WHERE current_attempt_id = NEW.attempt_id
           AND (NEW.worker_id IS NULL OR worker_id != NEW.worker_id)
     )
BEGIN
    SELECT RAISE(ABORT,
        'attempt ownership: task_attempts.worker_id UPDATE from ' ||
        COALESCE(OLD.worker_id, '<NULL>') || ' to ' || COALESCE(NEW.worker_id, '<NULL>') ||
        ' for attempt_id=' || NEW.attempt_id ||
        ' would leave a dangling pointer in workers.current_attempt_id'
    );
END;
```

**Why NULL-safe matters**: SQLite 三值逻辑: `NEW.worker_id != OLD.worker_id`
返回 UNKNOWN 当 OLD 为 NULL 时（旧 attempt 还没 worker，触发器会被 RAISE
silently skip）。`IS NOT` 是 SQLite 唯一对 NULL 安全的 inequality（除了
`NOT EXISTS`），必须用 `IS NOT` 显式表达。

---

## §3 Protocol 形状

### 3.1 WorkerPool

```python
class WorkerPool(Protocol):
    """Dispatch tasks to workers; track worker lifecycle; enforce I15-I18."""

    def register(self, host: str, capabilities_json: str) -> str:
        """Register a new worker. Returns worker_id (e.g. '<host>:<pid>:<uuid>')."""

    def dispatch(self, task_id: str) -> str:
        """Pick a worker for the task. Returns worker_id.
        Strategy: capability-match first (workers.capabilities_json contains
        task.required_capabilities), then round-robin among 'active' workers.
        Raises NoWorkerAvailable if no eligible worker exists."""

    def heartbeat(self, worker_id: str) -> None:
        """Advance worker.last_heartbeat_at; emits worker.heartbeat event."""

    def drain(self, worker_id: str) -> None:
        """Move worker to 'draining'; kernel stops dispatching to it."""

    def reap_stale(self, now_iso: str, threshold_seconds: int = 30) -> int:
        """Mark workers with last_heartbeat_at older than threshold as 'stale'.
        Returns count of reaped workers."""

    def claim_via_pool(self, task_id: str) -> str:
        """Composite: dispatch(task_id) -> claim(task_id, worker_id).
        Returns attempt_id. The canonical entry point for v0.9-B+ drivers."""
```

---

## §4 与 v0.7 数据模型的关系

| v0.7/v0.8 | v0.9-B 增量 |
|-----------|-------------|
| `task_attempts.worker_id TEXT` (nullable) | 加 NOT NULL 强制：active attempt 必须有 worker（I15 触发器） |
| `task_attempts` 已有 `idx_attempts_one_active`（每 task 1 active） | + `idx_worker_one_active_attempt`（每 worker 1 active） |
| `claim(task_id, worker_id)` 接口 | 不变；v0.9-B 在上层加 `WorkerPool.claim_via_pool()` |
| 无 worker 注册表 | + `workers` 表 |
| 无 worker 心跳 / drain 协议 | + I16 heartbeat + I17 drain 触发器 + 3 个 worker.* 事件 |

**关键不变量**：
- v0.9-B **不替换** v0.7-v0.8 的 `claim()` 接口，只在上层叠加 dispatch
- v0.7-v0.8 spike（claim-fence / cancel-race / supersede / conformance / egress / policy-direction）**不需要修改**
- v0.9-A spike（context-budget / context-event-schema）**不需要修改**

---

## §5 事件 schema

### 5.1 `spec/events/worker.registered.json` (v0.9.4 new — replaces v0.9.3 conflated dispatched)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "worker.registered",
  "type": "object",
  "required": ["worker_id", "host", "capabilities_json", "status", "registered_at"],
  "properties": {
    "worker_id":         {"type": "string"},
    "host":              {"type": "string"},
    "capabilities_json": {"type": "string"},
    "status":            {"enum": ["active", "draining", "drained", "stale"]},
    "registered_at":     {"type": "string", "format": "date-time"}
  },
  "additionalProperties": false
}
```

**Trigger source**: `trg_worker_registered_event_emit`（v0.9.4 重命名自
v0.9.3 `trg_worker_dispatched_event_emit`，event_type 由 `worker.dispatched`
改为 `worker.registered`，payload `dispatched_at` 改为 `registered_at`）。

### 5.2 `spec/events/worker.dispatched.json` (v0.9.4 — 真正的派单事件)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "worker.dispatched",
  "type": "object",
  "required": ["task_id", "worker_id", "attempt_id", "strategy", "dispatched_at"],
  "properties": {
    "task_id":       {"type": "string"},
    "worker_id":     {"type": "string"},
    "attempt_id":    {"type": "string"},
    "strategy":      {"enum": ["capability_match", "worker_takeover"]},
    "dispatched_at": {"type": "string", "format": "date-time"}
  },
  "additionalProperties": false
}
```

**Trigger source**:
- `trg_attempt_dispatched_event_emit_insert` — INSERT task_attempts with
  non-NULL worker_id + active status → emit `worker.dispatched` with
  strategy='capability_match'
- `trg_attempt_dispatched_event_emit_update` — UPDATE OF worker_id with
  worker_id change → emit `worker.dispatched` with strategy='worker_takeover'

**v0.9.3 vs v0.9.4 区别**: v0.9.3 的 `worker.dispatched` 事件实际是注册事件
（payload 只有 worker_id + host + capabilities_json），是 schema-vs-runtime
语义混淆的产物。v0.9.4 拆成两个独立事件：worker.registered（注册）
vs worker.dispatched（真正的 task→worker 派单）。

### 5.3 `spec/events/worker.heartbeat.json`

```json
{
  "type": "object",
  "required": ["worker_id", "last_heartbeat_at"],
  "properties": {
    "worker_id": {"type": "string"},
    "last_heartbeat_at": {"type": "string", "format": "date-time"},
    "current_attempt_id": {"type": ["string", "null"]}
  },
  "additionalProperties": false
}
```

### 5.4 `spec/events/worker.drained.json`

```json
{
  "type": "object",
  "required": ["worker_id", "status"],
  "properties": {
    "worker_id": {"type": "string"},
    "status": {"enum": ["draining", "drained", "stale"]},
    "current_attempt_id": {"type": ["string", "null"]},
    "drained_at": {"type": ["string", "null"]}
  },
  "additionalProperties": false
}
```

---

## §6 Cross-server 共享 DB 约束（I18）

SQLite WAL 文件被多个 host 同时 open 时，可能 stale read（除非 explicit fsync）。v0.9-B 要求：

- 跨 server dispatch 之前，所有 host 上的 SQLite 必须 fsync 写入（WAL 已 checkpoint）
- spike 通过 `connect_with_fk(path)` 共享 file-DB + `threading.Barrier` 验证真并发下的 fence / lease 一致性
- 失败模式：跨 server stale read 让 attempt INSERT 在 server-A 成功但 server-B 看不见 → 重复 dispatch
- **缓解**：NFS 共享 + 强一致挂载参数；Litestream follower 在 v0.9-B 不强制

---

## §7 与 v0.7 spike 的对应

| v0.7 spike | v0.9-B 增量 |
|------------|-------------|
| `claim-fence-test.py` | + 双 worker 并发 claim（真并发） |
| `cancel-race-test.py` | + worker drain 期间 cancel |
| `conformance-second-impl.py` | + TrivialWorkerPool（9th Protocol → 10/10 runtime_checkable） |

---

## §8 不可接受的 v0.9-B 模式

- ❌ worker_id 自增 INTEGER（无法跨 host 唯一）→ 必须 TEXT（含 host 段）
- ❌ dispatch 绕过 `claim()` 直接 INSERT attempt → 必须 `WorkerPool.claim_via_pool()`
- ❌ drain 时强制 kill active attempt → drain 只暂停派发
- ❌ heartbeat 不更新 `last_heartbeat_at`（被 I16 trigger 拒）
- ❌ "已修复"但无 executable evidence → 必须列出 spike case 编号