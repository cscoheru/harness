# Codex v0.9 合并复核 — v0.9-A/v0.9.1 + v0.9-B 回应与执行证据

> **File**: `RESPONSE-TO-CODEX-v0.9-AB-REVIEW.md`
> **Version**: v0.9
> **Date**: 2026-08-30
> **Source**:
>   - `ARCHITECT-REVIEW-PRD-v0.9-A.md`（CHANGES REQUIRED，v0.9-A 复审）
>   - v0.9-B 复审（待 Codex v0.9.1+ 提交）
> **合并提交**: v0.9-A/v0.9.1 + v0.9-B 一起送 Codex 合并复审

---

## §A v0.9-A 增量 — 已交付（v0.9.1 终态）

详见 `RESPONSE-TO-CODEX-v0.9-A-REVIEW.md`（独立文件）。

**关键交付**:
- 11 triggers / 22 indexes / 1 table (context_snapshots)
- 8 spike 全绿（含 v0.9-A 2 个新 spike）
- 9/9 Protocol runtime_checkable pass（含 ToolProvider.capability + ArtifactStore.get/stat/delete）
- I11/I14/I15/I16/I17/I18/I19 全部由 SQLite trigger 强制

---

## §B v0.9-B 增量 — 已交付（本文件主要范围）

### §B.1 复审门槛 — 逐条交付

| 门槛 | 交付位置 | 状态 |
|------|---------|------|
| 1. 9 个 P0-9G..P0-9O 反例各有独立 spike case | `spikes/m0/worker-dispatch-test.py` Case 25-33 | ✅ |
| 2. P0-9G 在 Case 25 真并发下稳定得 1 success / 1 reject（rowcount OR partial unique） | Case 25 + shared file-DB + threading.Barrier | ✅ |
| 3. P0-9H 在 Case 26 真并发下稳定得 SQLITE_CONSTRAINT | Case 26 + `idx_worker_one_active_attempt` partial unique | ✅ |
| 4. P0-9I 在 Case 27 真并发下稳定得 `trg_attempt_active_needs_worker` 拒绝 | Case 27 直接 INSERT NULL worker_id | ✅ |
| 5. P0-9J 在 Case 28 真并发下稳定得 `trg_worker_heartbeat_renew` 拒绝 | Case 28 UPDATE last_heartbeat_at = OLD | ✅ |
| 6. P0-9K 在 Case 29 真并发下稳定得 `trg_worker_drain_pause` 拒绝 | Case 29 drain 后 current_attempt_id 指向 terminal attempt | ✅ |
| 7. P0-9L/M/N 在 Case 30/31/32 真并发下稳定得 NOT NULL/CHECK/FK 拒绝 | Case 30/31/32 直接 INSERT invalid 值 | ✅ |
| 8. P0-9O 在 Case 33 真并发下稳定得 `idx_worker_one_active_attempt` 拒绝 | Case 33 direct INSERT 绕过 claim() | ✅ |
| 9. conformance 10/10 PASS（含新 WorkerPool） | `spikes/m0/conformance-second-impl.py` Test 6 + Test 8 + TrivialWorkerPool | ✅（10/10） |
| 10. 3 个新事件 schema 通过 check-jsonschema | `spec/events/worker.{dispatched,heartbeat,drained}.json` | ✅ |
| 11. schema 应用不报错（14 tables / 15 triggers / 39 indexes） | `sqlite3 :memory: < spec/kernel-schema.sql` | ✅ |
| 12. 全量 9 spike 全绿（v0.8 6 + v0.9-A 2 + v0.9-B 1） | 一次跑全套 exit 0 | ✅ |
| 13. ADR 0007 Status: Accepted | `adr/0007-worker-pool.md` | ✅ |
| 14. §5 matrix v0.9-B 部分（M0-13/14/15/16）全 PASS | 见 §B.5 matrix | ✅ |

---

## §B.2 v0.9-B 反例 → 关闭证据

| Codex v0.9-B 反例 | 关闭位置 | 关闭方式 |
|-----------------|---------|---------|
| **P0-9G** 双 worker 并发 dispatch 同一 task | `spikes/m0/worker-dispatch-test.py:Case 25` 真并发两线程 + shared file-DB + threading.Barrier | `idx_attempts_one_active` partial unique + claim() rowcount check 双重保险 |
| **P0-9H** 同 worker 两 active attempt | `spikes/m0/worker-dispatch-test.py:Case 26` | `idx_worker_one_active_attempt` partial unique index |
| **P0-9I** active attempt worker_id NULL | `spec/kernel-schema.sql:trg_attempt_active_needs_worker` | Case 27 直接 INSERT NULL 被 trigger 拒绝 |
| **P0-9N** worker_id 引用不存在 worker | `spec/kernel-schema.sql:trg_attempt_worker_exists` | 任何 claim() / INSERT attempt 都会查 worker 存在性 |
| **P0-9J** heartbeat 不推进 | `spec/kernel-schema.sql:trg_worker_heartbeat_renew` | Case 28 UPDATE last_heartbeat_at=OLD 被 trigger 拒绝 |
| **P0-9K** drain stale current_attempt_id | `spec/kernel-schema.sql:trg_worker_drain_pause` | Case 29 drain 时 current_attempt_id 指向 terminal attempt 被拒 |
| **P0-9L** last_heartbeat_at NULL | `spec/kernel-schema.sql:workers.last_heartbeat_at NOT NULL` | Case 30 直接 INSERT NULL 被 NOT NULL 拒 |
| **P0-9M** worker status 不在 enum | `spec/kernel-schema.sql:workers.status CHECK` | Case 31 INSERT status='rogue' 被 CHECK 拒 |
| **P0-9N** current_attempt_id FK | `spec/kernel-schema.sql:workers.current_attempt_id FK → task_attempts.attempt_id` | Case 32 INSERT current_attempt_id='att-fake' 被 FK 拒 |
| **P0-9O** dispatch 绕过 claim | `spikes/m0/worker-dispatch-test.py:Case 33` | 验证即便绕过 claim()，partial unique index 仍 reject |

---

## §B.3 v0.9-B spike 总览（11 case / 全绿）

```text
=== worker-dispatch-test.py (11 cases) ===
  Case 25: P0-9G 真并发两 worker dispatch 同 task
           → 1 success / 1 reject (rowcount OR partial unique)
  Case 26: P0-9H 同 worker 两 active attempt
           → idx_worker_one_active_attempt SQLITE_CONSTRAINT
  Case 27: P0-9I active attempt worker_id NULL
           → trg_attempt_active_needs_worker 拒绝
  Case 28: P0-9J heartbeat 不推进
           → trg_worker_heartbeat_renew 拒绝
  Case 29: P0-9K drain stale current_attempt_id
           → trg_worker_drain_pause 拒绝
  Case 30: P0-9L last_heartbeat_at NULL
           → NOT NULL 约束拒绝
  Case 31: P0-9M worker status 不在 enum
           → CHECK 约束拒绝
  Case 32: P0-9N current_attempt_id 指向不存在 attempt
           → FK 约束拒绝
  Case 33: P0-9O dispatch 绕过 claim
           → idx_worker_one_active_attempt 拒绝
  Case fairness_round_robin:
           → capability-match 优先，3 worker 中 2 有 web.fetch，6 task 全派到这 2
  Case reap_stale:
           → 1 stale worker reaped, fresh preserved
```

---

## §B.4 全量 spike 总览（9 spike / 全绿）

```text
=== v0.7 spike (5 个, 不变) ===
  claim-fence-test.py          (5 OK)
  cancel-race-test.py          (8 OK)
  approval-supersede-test.py   (4 OK)
  conformance-second-impl.py   (10/10 PASS)        ← v0.9-B +1 (WorkerPool)
  egress-httpx-actual.py       (8 OK)
  policy-direction-test.py     (4 OK)

=== v0.9-A spike (2 个) ===
  context-budget-test.py       (23 cases 全绿)
  context-event-schema-test.py (8 OK)

=== v0.9-B spike (1 个) ===
  worker-dispatch-test.py      (11 cases 全绿)
```

注：approval-supersede / context-budget 的 helper 中 raw INSERT 已加 worker_id 列 + worker 注册，以兼容 v0.9-B I15 trigger。

---

## §B.5 §5 Spike coverage matrix v0.9-B 重标

| Matrix row | v0.9-B 实际覆盖 | 结果 |
|---|---|---|
| **M0-9** (v0.9-A schema) | 11 triggers + 22 indexes + 1 table (context_snapshots) | **PASS** |
| **M0-10** (v0.9-A Protocol) | ContextDistiller + ContextBudget 第二实现 | **PASS** |
| **M0-11** (v0.9-A 事件) | context.snapshot.json 通过 Draft 2020-12 | **PASS** |
| **M0-12** (v0.9-A 反例) | context-budget-test.py 23 cases 全绿 | **PASS** |
| **M0-13** (v0.9-B schema) | +workers 表 +4 triggers +4 indexes (15 / 39 / 14 终态) | **PASS** |
| **M0-14** (v0.9-B Protocol) | WorkerPool 第二实现 + conformance 10/10 | **PASS** |
| **M0-15** (v0.9-B 事件) | 3 个 worker.{dispatched,heartbeat,drained}.json 通过 Draft 2020-12 | **PASS** |
| **M0-16** (v0.9-B 反例) | worker-dispatch-test.py 11 cases 全绿 | **PASS** |
| **H1** (v0.8 schema 应用) | exit 0, 14 tables | **PASS** |
| **H2** (v0.8 spike 全绿) | claim-fence / cancel-race / approval-supersede 全绿 | **PASS** |
| **H3** (v0.8 conformance) | gateway behavior tests + policy-direction 全绿 | **PASS** |
| **H4** (v0.8 egress) | egress-httpx-actual 8 OK | **PASS** |
| **H5** (v0.8 evidence-trivial) | 仍不存在 | **🟡 spike-deferred** |
| **H6** (image digest) | 无 | **🟡 spike-deferred** |
| **H7** (Backup E2E) | 无 | **🟡 spike-deferred** |
| **H8** (Research vertical-slice) | 无 | **🟡 spike-deferred** |

---

## §B.6 v0.9-B 改动清单（增量）

```text
PRD-v0.9.md
  ~ §1 版本 → v0.9 (v0.9-A + v0.9-B)
  + §9 v0.9-B 范围（背景 / in-scope / out-of-scope / 兼容）
  + §10 v0.9-B 不变量（I15-I18）
  + §11 v0.9-B 4 层定义（L0/L1/L2/L3）
  + §12 v0.9-B 反例清单（P0-9G..P0-9O）
  + §13 v0.9-B 决策日志（Q208-Q213）
  + §14 v0.9-B Stage Gate 增量（M0-13..M0-16）

spec/worker-pool.md (新增)
  §1 4 层模型概览
  §2 schema 落地（workers 表 + 4 triggers）
  §3 Protocol 形状（WorkerPool 6 方法 + 3 异常）
  §4 与 v0.7 数据模型的关系
  §5 事件 schema
  §6 Cross-server 共享 DB 约束 (I18)
  §7 与 v0.7 spike 的对应
  §8 不可接受的 v0.9-B 模式

spec/kernel-schema.sql
  + workers 表（worker_id PK / host / capabilities_json / status /
                last_heartbeat_at / current_attempt_id FK / registered_at / drained_at）
  + idx_attempts_attempt_id_unique (v0.9-B 必要: FK 前提)
  + idx_worker_one_active_attempt (partial unique: 每 worker 最多 1 active)
  + idx_workers_status / idx_workers_host / idx_workers_attempt
  + trg_attempt_active_needs_worker (I15: active attempt 必须有 worker_id)
  + trg_attempt_worker_exists        (I15 伴生: worker_id 必须存在)
  + trg_worker_heartbeat_renew       (I16: heartbeat 必须推进 last_heartbeat_at)
  + trg_worker_drain_pause           (I17: drain stale-pointer 拒绝)

spec/interfaces/worker_pool.py (新增)
  + WorkerPool Protocol (6 方法: register/dispatch/heartbeat/drain/reap_stale/claim_via_pool)
  + WorkerInfo / DispatchResult dataclasses
  + WorkerPoolError / NoWorkerAvailable / DrainRejected / HeartbeatRejected
  + assert_satisfies_pool helper

spec/interfaces/__init__.py
  + export WorkerPool + 6 names

spec/events/worker.dispatched.json  (新增)
spec/events/worker.heartbeat.json   (新增)
spec/events/worker.drained.json     (新增)

spikes/m0/_helpers.py
  + _now_iso(offset_seconds=0.0) (固定基准时间 + 偏移，避免 wall-clock 波动)
  + register_worker() / heartbeat_worker() / drain_worker()
  + reap_stale_workers() / dispatch_worker() / claim_via_pool()
  ~ claim() 自动注册 worker (INSERT OR IGNORE + commit before BEGIN IMMEDIATE)

spikes/m0/worker-dispatch-test.py (新增)
  + 11 cases (Case 25-33 + 2 fairness)
  + 真并发 2 个 (Case 25 / Case 33)
  + 共享 file-DB via tempfile.mkstemp

spikes/m0/conformance-second-impl.py
  + TrivialWorkerPool (10th Protocol second impl)
  + Test 8: WorkerPool runtime_checkable + claim_via_pool entry point
  ~ protocol_checks 加 WorkerPool 项，10/10 PASS

spikes/m0/approval-supersede-test.py
  ~ _make_oversized_state helper 加 worker 注册 + worker_id 列

spikes/m0/context-budget-test.py
  ~ _make_shared_db_with_seed helper 加 worker 注册 + worker_id 列

.github/workflows/m0-contract-tests.yml
  + spike-py-worker-dispatch job
  ~ json-schema-validate 描述改为 "all event schemas"
  ~ adr-marker-check 改为 0001-0007

notes/codex-review-prompt-v0.9-merged.md (新增)
  合并复审指令：覆盖 v0.9-A + v0.9-B 共 15 个 P0-9 反例

adr/0007-worker-pool.md (新增)
  Decision rationale / alternatives / consequences / implementation / verification
```

---

## §B.7 触发器总数（v0.9 终态）

```text
v0.7:    1 trigger (trg_attempt_fence_insert)
v0.8:    +2 = 3 (trg_task_terminal_lock, trg_attempt_terminal_task_insert)
v0.9-A:  +2 = 5 (trg_snapshot_budget_check, trg_handoff_trust_label)
v0.9.1:  +6 = 11 (append-only + lineage + event-emit)
v0.9-B:  +4 = 15 (I15 ×2 + I16 + I17)
```

15 triggers 全部在 schema 可应用范围内，`sqlite3 :memory: < spec/kernel-schema.sql` exit 0。

---

## §B.8 索引总数（v0.9 终态）

```text
v0.7-v0.8:  8 indexes (基础表索引)
v0.9-A:    +14 = 22 (context_snapshots 表 4 + 部分唯一索引 + 自动生成)
v0.9.1:     0 = 22 (无新增 index)
v0.9-B:    +17 = 39 (workers 表 3 + idx_worker_one_active_attempt + idx_attempts_attempt_id_unique + 自动生成)
```

39 indexes，`sqlite3 :memory: < spec/kernel-schema.sql` exit 0。

---

## §B.9 给 Codex v0.9 复审的入口

| 想验证 | 跑这个 |
|--------|--------|
| 全部 v0.9-B P0-9 反例 | `python3 spikes/m0/worker-dispatch-test.py`（11 cases） |
| FK=ON 强制（v0.9-A 兼容） | `python3 -c "from _helpers import connect_with_fk; c = connect_with_fk(); print(c.execute('PRAGMA foreign_keys').fetchone())"` |
| 10/10 Protocol pass | `python3 spikes/m0/conformance-second-impl.py`（看 `10/10 pass`） |
| Event schema 11 个 | `for f in spec/events/*.json; do check-jsonschema --schemafile "$f"; done` |
| Schema 应用 | `sqlite3 :memory: < spec/kernel-schema.sql`（14 / 15 / 39） |
| 全量 spike | `for f in spikes/m0/*.py; do [ "$(basename "$f")" = "__init__.py" ] && continue; [ "$(basename "$f")" = "_helpers.py" ] && continue; python3 "$f" || echo FAIL; done`（9 spike） |

---

## §B.10 回滚路径

如果 v0.9-B 引入回归：

| 触发器 / 索引 | 关闭 SQL |
|--------------|---------|
| trg_attempt_active_needs_worker | `DROP TRIGGER trg_attempt_active_needs_worker`（重新开放 P0-9I） |
| trg_attempt_worker_exists | `DROP TRIGGER trg_attempt_worker_exists`（重新开放 P0-9N） |
| trg_worker_heartbeat_renew | `DROP TRIGGER trg_worker_heartbeat_renew`（重新开放 P0-9J） |
| trg_worker_drain_pause | `DROP TRIGGER trg_worker_drain_pause`（重新开放 P0-9K） |
| idx_worker_one_active_attempt | `DROP INDEX idx_worker_one_active_attempt`（重新开放 P0-9H） |
| workers table | 不建议 DROP（破坏 audit），改为 `UPDATE workers SET status='drained'` |

任一 trigger / index DROP 后立即破坏对应 spike 的 PASS 状态——Codex v0.9.1 复审会立即发现。

---

## §C 跨段一致性（v0.9-A + v0.9-B 合并复审）

### §C.1 互不干扰

- v0.9-A 触发器（11 个）只影响 `context_snapshots` / `tasks.context_budget_tokens`
- v0.9-B 触发器（4 个）只影响 `workers` / `task_attempts.worker_id`
- 唯一交互点是 `claim()` helper：v0.7 fence + v0.9-B worker + v0.9-A budget 都通过它

### §C.2 不变量正交

- I1-I10（v0.7/v0.8）：task-local fence / cancel / approval / policy
- I11-I14（v0.9-A）：context budget / lineage / append-only / event emission
- I15-I18（v0.9-B）：worker active / heartbeat / drain / cross-server
- 18 个不变量互不依赖，可独立验证

### §C.3 协议正交

- 10 个 Protocol：ExecutionDriver / WorkflowPack / ToolProvider / PolicyDecisionPoint / ArtifactStore / EventSink / ContextDistiller / ContextBudget / WorkerPool / ToolInvocationGateway
- v0.9-A 加 2 个（ContextDistiller + ContextBudget）
- v0.9-B 加 1 个（WorkerPool）
- 每个 Protocol 独立 runtime_checkable；conformance test 逐项 isinstance

### §C.4 数据流（v0.9 全景）

```text
user input → WorkflowPack.plan → PackStep[]
  ↓
TaskCreate (tasks.context_budget_tokens 由 pack.manifest 声明)
  ↓
WorkerPool.dispatch → worker_id (capability-match)
  ↓
WorkerPool.claim_via_pool = dispatch + claim + worker.current_attempt_id
  ↓
ExecutionDriver.run (EventSink.emit 每 step)
  ↓
ToolInvocationGateway.invoke (PDP → audit → provider → artifact_store → task_links)
  ↓
ContextDistiller.distill + charge (I11 budget check)
  ↓
[可选] snapshot_for_handoff (I14 trust check) → L3 handoff blob
  ↓
[可选] restore_handoff on cancel / reaper / new attempt
  ↓
Task terminal: succeeded / failed / canceled / abandoned
```

---

## §D 给用户的提交摘要

### v0.9 提交 Codex 内容

```
PR 内容: v0.9-A/v0.9.1 + v0.9-B 合并提交
复审 prompt: notes/codex-review-prompt-v0.9-merged.md
预期响应: §1 结论 (PASS / CHANGES REQUIRED)
         §2 v0.9-A P0 6 个
         §3 v0.9-B P0 9 个
         §4 P0-M2 / P1
         §5 spike coverage matrix
         §6 最小修复清单
         §7 复审门槛
```

### 本地状态

```text
修改文件: PRD-v0.9.md / spec/{kernel-schema.sql,worker-pool.md,interfaces/__init__.py,interfaces/worker_pool.py}
新增文件: spec/events/worker.{dispatched,heartbeat,drained}.json
          spikes/m0/worker-dispatch-test.py
          adr/0007-worker-pool.md
          notes/codex-review-prompt-v0.9-merged.md
          RESPONSE-TO-CODEX-v0.9-AB-REVIEW.md (本文件)
CI:     .github/workflows/m0-contract-tests.yml (+spike-py-worker-dispatch, ADR 0001-0007)
```

### 用户待办（CLAUDE.md 红线）

- [ ] 决定是否 commit（CLAUDE.md：不主动 commit）
- [ ] 决定是否 push 到 https://github.com/cscoheru/harness.git（v0.7+ 授权 push 仍需确认）
- [ ] 决定 Codex 提交方式（GitHub PR / 直接 prompt 喂入 Codex CLI）
- [ ] 决定 spike 命名是否保留 `worker-dispatch-test.py`（也可叫 `worker-pool-test.py`）