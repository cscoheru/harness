# Codex v0.9.3 复审 — 回应与执行证据

> **File**: `RESPONSE-TO-CODEX-v0.9.3-REVIEW.md`
> **Version**: v0.9.4
> **Date**: 2026-08-30
> **Source**: `notes/ARCHITECT-REVIEW-PRD-v0.9.3.md`（Codex v0.9.3 复审 CHANGES REQUIRED / 14/20 PASS / 6 FAIL）
> **Status**: 13/13 spike 全绿 / 17 reverse-DROP 因果链全 PASS / 12 event schema 全 meta-valid / conformance 10/10

---

## §A 修复摘要

Codex v0.9.3 复审返回 **CHANGES REQUIRED / 14/20 PASS / 6 FAIL**。v0.9.4 修复:

| Codex 编号 | 类别 | 修复位置 | 状态 |
|----------|------|---------|------|
| **P0-M2-2** (attempt-side) | attempt-side ownership 缺位 — UPDATE task_attempts.worker_id 可让 worker.current_attempt_id 留下 dangling pointer | `spec/kernel-schema.sql:trg_attempt_owner_consistent_update` (NEW v0.9.4 — bidirectional backstop) + `worker-dispatch-test.py:case_27d_worker_ownership_nullsafe` (4-sub-case 真并发 + INSERT 路径) + `mutation-test.py:M16` (反向 DROP causal chain) | ✅ |
| **P1-2** (event semantics) | `worker.dispatched` 事件实际是注册事件 — payload 混淆 | `spec/kernel-schema.sql:trg_worker_dispatched_event_emit` 重命名为 `trg_worker_registered_event_emit` (event_type 改 `worker.registered`) + 新增 `trg_attempt_dispatched_event_emit_insert/_update` (真派单事件) + `spec/events/worker.registered.json` (NEW) + `spec/events/worker.dispatched.json` (重写 payload: task_id+worker_id+attempt_id+strategy+dispatched_at) + `worker-dispatch-test.py:case_34` (验证 worker.registered 而非 dispatched) + `case_36_worker_dispatched_event_on_claim` (NEW) + `mutation-test.py:M17/M18` (反向 DROP) | ✅ |
| **P1-3** (dispatch race) | dispatch_worker() 真并发丢更新 — read-then-write 窗口无写锁 | `spikes/m0/_helpers.py:dispatch_worker` 改用 `BEGIN IMMEDIATE` (SQLite write lock 序列化并发 connection) + UPSERT via `INSERT ... ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1` + `worker-dispatch-test.py:case_35_concurrent_dispatch_atomic_count` (NEW — 2 真并发 threads × 2 distinct tasks → 2 distinct winners + total count = 2) | ✅ |
| **Case 27d** (completeness) | 只有 2 sub-case (UPDATE × wrong/NULL-attempt)，缺 INSERT 路径 | `worker-dispatch-test.py:case_27d_worker_ownership_nullsafe` 扩展到 4 sub-case (UPDATE/INSERT × wrong-owner/NULL-attempt)，Barrier(4) | ✅ |
| **Case 33** (misleading comment) | `w_bypass` 名实不符 — 实际是 IDLE 不是 bypass | `worker-dispatch-test.py:case_33` `w_bypass` → `w_idle` + docstring 修正 | ✅ |
| **trg_attempt_worker_exists_update** (三值逻辑) | `NEW.worker_id != OLD.worker_id` 遇 NULL 返回 UNKNOWN → silent skip | `spec/kernel-schema.sql:trg_attempt_worker_exists_update` `!=` → `IS NOT` | ✅ |
| **Codex 旧项保持 PASS** | (v0.9.3 修复的 14 PASS 项保持) | (无变化) | ✅ |
| **CI 计数同步** | trigger 数 24→27 + event schema 数 11→12 | `.github/workflows/m0-contract-tests.yml` schema-applies job line 44 (24→27) + json-schema-validate job line 232 (加 12 显式断言) + 新增 `spike-py-fence-missing-task` job | ✅ |

---

## §B 修复方式详述

### §B.1 Schema 修复 (24 → 27 triggers, 1 rename + 3 new)

**1. `trg_attempt_owner_consistent_update` (NEW v0.9.4, line ~472)**：attempt-side
ownership backstop. 当 `NEW.worker_id IS NOT OLD.worker_id` (NULL-safe)
且 EXISTS 其他 worker 持有 NEW.attempt_id 时，RAISE ABORT — 防止 UPDATE
task_attempts.worker_id 留下 dangling pointer。

```sql
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

**2. `trg_worker_dispatched_event_emit` → `trg_worker_registered_event_emit`
(重命名 line ~779)**：event_type 由 `worker.dispatched` 改为
`worker.registered`，payload `dispatched_at` → `registered_at`。

**3. `trg_attempt_dispatched_event_emit_insert` (NEW line ~789)**：在
task_attempts INSERT 时（非 NULL worker_id + active status）发射
`worker.dispatched` 事件，payload 含 task_id+worker_id+attempt_id+
strategy='capability_match'+dispatched_at。

**4. `trg_attempt_dispatched_event_emit_update` (NEW line ~810)**：在
task_attempts UPDATE OF worker_id 时（worker_id change）发射
`worker.dispatched` 事件，strategy='worker_takeover'。

**5. `trg_attempt_worker_exists_update` (line 451 三值逻辑修复)**：`!=` → `IS NOT`，
与 v0.9.3 trg_worker_ownership_update 同样模式。

**trigger 总数**: 24 + 3 (owner_consistent + dispatched_emit_insert + dispatched_emit_update)
- 0 (rename 不计) = **27 triggers**

### §B.2 Event schema 修复 (11 → 12 schemas, 1 rewrite + 1 new)

**1. `spec/events/worker.dispatched.json` (重写)**：payload 从注册风格
(worker_id+host+capabilities_json+status+dispatched_at) 改为真派单风格
(task_id+worker_id+attempt_id+strategy+dispatched_at)，strategy enum:
`capability_match` | `worker_takeover`。

**2. `spec/events/worker.registered.json` (NEW)**：payload
worker_id+host+capabilities_json+status+registered_at。

### §B.3 Spike 修复 (19 → 21 cases + 1 new file)

- `case_35_concurrent_dispatch_atomic_count`: NEW 真并发 2 threads × 2 distinct tasks
  - BEGIN IMMEDIATE 序列化保证 2 distinct winners + harness_meta dispatch:worker:* total = 2
- `case_36_worker_dispatched_event_on_claim`: NEW 验证 task_attempts INSERT 时
  触发 trg_attempt_dispatched_event_emit_insert，payload 含 task_id+worker_id+attempt_id+strategy
- `case_27d_worker_ownership_nullsafe`: 扩展 2 → 4 sub-case (UPDATE/INSERT × wrong-owner/NULL-attempt)
- `case_33_dispatch_bypasses_claim_concurrent`: `w_bypass` → `w_idle` rename + 注释修正
- `case_34_worker_event_emission_concurrent`: 验证 worker.registered (而非 dispatched) 在注册时发射
- `spikes/m0/fence-missing-task-test.py` (NEW file): F1 (NULL-safe) + F2 (mismatched fence) + F3 (causal chain via reverse-DROP + FK=OFF)

### §B.4 Mutation 修复 (15 → 17, M12 移除 + M16/M17/M18 新增)

- **M16 (NEW)**: DROP `trg_attempt_owner_consistent_update` → attempt-side UPDATE succeeds (causal chain)
- **M17 (NEW)**: DROP `trg_worker_registered_event_emit` → no task_events row of type 'worker.registered'
- **M18 (NEW)**: DROP `trg_attempt_dispatched_event_emit_insert` → no task_events row of type 'worker.dispatched'
- **M12 removed**: 旧的 `trg_worker_dispatched_event_emit` 在 v0.9.4 被重命名，M17 替代

### §B.5 dispatch_worker() 修复

**`spikes/m0/_helpers.py:dispatch_worker`**：
- 改用 `BEGIN IMMEDIATE` 在 SELECT counts + UPSERT 之前获取 SQLite write lock
- 删除 `_ts_key` / `_neg_ts_key` (现用 SQL `ORDER BY`)
- 加 `if conn.in_transaction: raise RuntimeError(...)` 守卫
- UPSERT 用 `INSERT ... ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1`

### §B.6 CI 修复

- `.github/workflows/m0-contract-tests.yml`:
  - line 33 title: `v0.9.2` → `v0.9.4`
  - line 44: `test "$TRIGGERS" = "24"` → `test "$TRIGGERS" = "27"`
  - line 47: `match v0.9.2` → `match v0.9.4`
  - line 229-236: 加 event schema 显式计数 (count == 12)
  - line 79-86 (NEW): `spike-py-fence-missing-task` job

---

## §C spike 全绿 evidence

```bash
$ for f in spikes/m0/*.py; do
    [ "$(basename "$f")" = "__init__.py" ] && continue
    [ "$(basename "$f")" = "_helpers.py" ] && continue
    python3 "$f" || { echo "FAIL: $f"; exit 1; }
  done

OK: worker-dispatch-test.py v0.9.4 — 21 cases 全绿
OK: mutation-test.py v0.9.4 — 17 reverse-DROP mutations all causal-chain verified
OK: fence-missing-task-test.py v0.9.4 — 3 cases 全绿
... (其余 10 spike 全绿)
```

## §D 复审门槛满足清单 (Codex §7)

- [x] ownership NULL bypass INSERT path 实测拒绝 (Case 27d-3, 27d-4)
- [x] ownership NULL bypass UPDATE path 实测拒绝 (Case 27d-1, 27d-2)
- [x] attempt-side ownership UPDATE 实测拒绝 (M16 baseline)
- [x] worker.registered 事件在注册时发射 (Case 34 + M17)
- [x] worker.dispatched 事件在 task_attempts INSERT/UPDATE 时发射 (Case 36 + M18)
- [x] dispatch_worker 真并发 2 threads × 2 tasks → 2 distinct winners + total = 2 (Case 35)
- [x] fence NULL bypass INSERT 实测拒绝 (F1)
- [x] fence 反向 DROP + FK=OFF 实测 succeed (F3 causal chain)
- [x] I15 三值逻辑修复: `!=` → `IS NOT` (trg_attempt_worker_exists_update)
- [x] Case 33 注释矛盾修复 (w_idle rename)
- [x] Case 27d 4 sub-case 真并发覆盖完整
- [x] 13/13 spike 全绿
- [x] 17/17 mutation causal chain PASS
- [x] 12/12 event schema meta-valid
- [x] 10 Protocols conformance PASS
- [x] CI trigger 27 + event schema 12 显式断言
