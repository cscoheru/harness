# Context Layers — 4 层上下文规范

> **File**: `spec/context-layers.md`
> **Version**: v0.9-A
> **Date**: 2026-08-30
> **Status**: Accepted (M0 scope)
> **Supersedes**: v0.7 blob 流（无层概念）

---

## §1 模型概览

Harness 把 task 运行期间的"上下文"分成 4 层，每层有不同的**生命周期**、**trust_label 语义**和**计费 / 裁剪规则**：

```text
L0 raw_blob       ← ingest 的原始字节（web fetch response, file read, user prompt）
                     trust_label 由 ingest 决策
                     lifecycle: 永久（受 retention 控制）

L1 distilled      ← L0 经 ContextDistiller 后的语义单元
                     例：URL → {title, snippet, canonical_url, trust_label}
                     trust_label 继承自 L0 raw_blob
                     lifecycle: 永久，sha256 idempotent
                     落点：context_snapshots(level='L1')

L2 working_set    ← 当前 attempt 的"活跃上下文"
                     例：本次 task 累计读了哪些 L1 单元
                     例：累计 token 数 / 剩余 budget
                     trust_label = task owner 的 trust_label（trusted_user_input）
                     lifecycle: attempt 期间
                     落点：context_snapshots(level='L2')

L3 handoff        ← task 切换 / cancel / reaper 时压缩的状态
                     例：把 working_set 蒸馏成可恢复的 handoff blob
                     trust_label: 仅 trusted_user_input / model_generated / internal_secret
                                   （**禁止 untrusted_external**，防污染）
                     lifecycle: 跨 attempt 持久化
                     落点：context_snapshots(level='L3') + blobs(trust_label 受限)
```

---

## §2 转换规则

### 2.1 转换图

```text
ingest()
  └─→ L0 raw_blob (blob insert, trust_label=ingest_decision)

distill(raw_blob)
  └─→ L1 distilled blob (context_snapshots INSERT, level='L1')

charge(working_set, l1_unit_id)
  └─→ L2 working_set (context_snapshots INSERT, level='L2', token_count += unit.tokens)

snapshot_for_handoff(working_set)
  └─→ L3 handoff blob (context_snapshots INSERT, level='L3')
       trust_label ∈ {trusted_user_input, model_generated, internal_secret}
       CHECK enforces no untrusted_external
```

### 2.2 规则表

| From | To | 触发器 | 强制位置 |
|------|----|-------|---------|
| L0 → L1 | `distill()` 调用 | kernel (driver / scheduler) | `context_snapshots` INSERT |
| L1 → L2 | `charge()` 调用 | driver / attempt loop | `context_snapshots` INSERT |
| L2 → L3 | `snapshot_for_handoff()` 调用 | cancel / reaper / drain | `context_snapshots` INSERT |
| L3 → L2 | restore handoff to new attempt | next claim on same task | SELECT + INSERT L2 |

### 2.3 禁止的转换

- L0 直接到 L2（必须先 distill 为 L1）—— 保证 trust_label 经过显式赋值
- L3 trust_label = untrusted_external（污染风险）—— CHECK 约束拒绝
- L3 写入时 working_set 状态不一致（snapshot 必须原子化 working_set 状态）—— ContextDistiller.snapshot_for_handoff 必须单事务

---

## §3 Schema 落地

### 3.1 tasks 新增列

```sql
ALTER TABLE tasks ADD COLUMN context_budget_tokens INTEGER;  -- NULL = unlimited
```

含义：task 创建时由 WorkflowPack.manifest.context_requirements 声明；kernel 在每次 `charge()` 时检查不变量 I11。

### 3.2 新表 context_snapshots

```sql
CREATE TABLE context_snapshots (
    snapshot_id      TEXT PRIMARY KEY,
    task_id          TEXT NOT NULL,
    attempt_id       TEXT NOT NULL,
    level            TEXT NOT NULL CHECK (level IN ('L0','L1','L2','L3')),
    raw_blob_id      TEXT,                -- L0/L1 source; nullable for L2/L3 composed
    distilled_blob_id TEXT,               -- L1/L2/L3 composed output; FK to blobs
    token_count      INTEGER NOT NULL CHECK (token_count >= 0),
    trust_label      TEXT NOT NULL CHECK (trust_label IN (
                        'trusted_user_input','untrusted_external','model_generated','internal_secret'
                      )),
    distiller_version TEXT,               -- which ContextDistiller impl produced this
    parent_snapshot_id TEXT,              -- for L2/L3 lineage
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY (task_id, attempt_id) REFERENCES task_attempts(task_id, attempt_id),
    FOREIGN KEY (raw_blob_id) REFERENCES blobs(blob_id),
    FOREIGN KEY (distilled_blob_id) REFERENCES blobs(blob_id),
    FOREIGN KEY (parent_snapshot_id) REFERENCES context_snapshots(snapshot_id)
);
```

### 3.3 trigger / CHECK

```sql
-- I11: token 总数不能超过 task.context_budget_tokens
CREATE TRIGGER trg_snapshot_budget_check
BEFORE INSERT ON context_snapshots
FOR EACH ROW
WHEN NEW.level IN ('L2','L3')
     AND (SELECT context_budget_tokens FROM tasks WHERE task_id=NEW.task_id) IS NOT NULL
     AND (
         SELECT COALESCE(SUM(token_count),0)
         FROM context_snapshots
         WHERE task_id=NEW.task_id AND level IN ('L2','L3')
     ) + NEW.token_count > (
         SELECT context_budget_tokens FROM tasks WHERE task_id=NEW.task_id
     )
BEGIN
    SELECT RAISE(ABORT, 'I11: working_set token_count exceeds task.context_budget_tokens');
END;

-- I14: L3 handoff trust_label 不能是 untrusted_external（防污染）
CREATE TRIGGER trg_handoff_trust_label
BEFORE INSERT ON context_snapshots
FOR EACH ROW
WHEN NEW.level='L3' AND NEW.trust_label='untrusted_external'
BEGIN
    SELECT RAISE(ABORT, 'I14: L3 handoff trust_label cannot be untrusted_external');
END;

-- I12 (间接强制): distilled_blob_id 不能引用 raw_blob_id == self (idempotency)
-- 不需要额外约束：靠 blobs.sha256 UNIQUE 在 v0.7 schema 已保证
```

---

## §4 Protocol 形状

### 4.1 ContextDistiller

```python
class ContextDistiller(Protocol):
    """Distill raw blobs into L1/L2/L3 units. Pure / deterministic at level."""

    def distill(self, raw_blob_id: str, trust_label: str) -> tuple[str, int]:
        """L0 -> L1. Returns (distilled_blob_id, token_count)."""

    def charge(self, task_id: str, attempt_id: str, distilled_blob_id: str) -> None:
        """L1 -> L2 working_set entry. Atomic; may raise BudgetExceeded."""

    def snapshot_for_handoff(self, task_id: str, attempt_id: str) -> str:
        """L2 -> L3 handoff blob. Returns handoff_blob_id."""

    def restore_handoff(self, task_id: str, handoff_blob_id: str, new_attempt_id: str) -> None:
        """L3 -> L2 on new attempt. Re-creates working_set entries."""
```

### 4.2 ContextBudget

```python
class ContextBudget(Protocol):
    """Read-side companion to ContextDistiller.

    Used by drivers to decide whether to keep accumulating context or to
    trigger a snapshot_for_handoff() before hitting I11. The Protocol
    surface is intentionally read-only: remaining() and total(); the
    mutating charge() lives on ContextDistiller (closes Codex v0.9-A P1-2
    spec-vs-Protocol drift; canonical surface is in
    spec/interfaces/context_distiller.py).
    """

    def remaining(self, task_id: str) -> Optional[int]:
        """Returns remaining tokens, or None if budget is unset (unlimited)."""
        ...

    def total(self, task_id: str) -> Optional[int]:
        """Returns the configured budget, or None if unset."""
        ...
```

---

## §5 与 v0.7 数据模型的关系

| v0.7 | v0.9-A 增量 |
|------|-------------|
| `blobs` 表（L0 raw bytes） | 不变 |
| `artifacts` 表（命名产物） | 不变 |
| `task_links` 表（task↔artifact） | 不变；可新增 role='handoff' 表示 L3 链接 |
| `task_events` 表（事件流） | 不变；context.snapshot 事件走同一通道 |
| 新增 `context_snapshots` 表 | L1/L2/L3 元数据 |
| 新增 `tasks.context_budget_tokens` 列 | budget 字段 |

**关键不变量**：
- v0.9-A **不替换** v0.7 的三层数据模型，只是叠加第四张表
- v0.7 spike（claim-fence / cancel-race / supersede / conformance / egress / policy-direction）**不需要修改**

---

## §6 事件 schema

`spec/events/context.snapshot.json`：

```json
{
  "type": "object",
  "required": ["snapshot_id", "task_id", "attempt_id", "level", "token_count", "trust_label"],
  "properties": {
    "snapshot_id": {"type": "string"},
    "task_id": {"type": "string"},
    "attempt_id": {"type": "string"},
    "level": {"enum": ["L0", "L1", "L2", "L3"]},
    "raw_blob_id": {"type": ["string", "null"]},
    "distilled_blob_id": {"type": ["string", "null"]},
    "token_count": {"type": "integer", "minimum": 0},
    "trust_label": {"enum": ["trusted_user_input", "untrusted_external", "model_generated", "internal_secret"]},
    "parent_snapshot_id": {"type": ["string", "null"]}
  },
  "additionalProperties": false
}
```