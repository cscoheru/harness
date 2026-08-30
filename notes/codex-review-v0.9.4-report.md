# Codex v0.9.4 合并复审报告

> **Date**: 2026-08-30
> **Prompt**: `notes/codex-review-prompt-v0.9.4.md`
> **Scope**: 只读 `spec/` + `spikes/m0/`；基于可执行 spike 结果，不基于 PRD 承诺
> **Reviewer**: Cursor Agent（Composer）
> **Model**: gpt-5.6-sol (xhigh reasoning effort)
> **Conclusion**: **PASS** — 28/28 反例 PASS / 17/17 mutation 因果链 PASS / 13/13 spike exit 0 / 12/12 event schema meta-valid / 10/10 conformance

---

## §1 结论

**PASS。**

本轮按 prompt 路径实测：schema 为 `13/14/27/27/39`；13/13 spike exit 0；12/12 event schema meta-valid；conformance `10 Protocols`；mutation 17/17 baseline PASS / DROP FAIL。28 个反例均有可执行 spike 兜底且被拒；v0.9.4 三项（attempt-side ownership、registered/dispatched 事件拆分、`dispatch_worker` BEGIN IMMEDIATE 真并发原子性）均有正向 case + reverse-DROP 因果链。

**说明**：prompt §7 的「`UPDATE task_attempts ... WHERE attempt_id='att-nonexistent'` 必须 RAISE」一行命令会打印 FAIL，但这是 **SQL 0-row UPDATE 不触发 FOR EACH ROW trigger** 的假阴，不是反例成功。真实 attempt-side 不变量（存在 attempt + 他 worker 仍持有 `current_attempt_id` 指针时改 `worker_id`）由 `mutation-test.py` M16 baseline 拒绝，已复现。

---

## §2 v0.9-A P0 清单 (P0-9A..F)

真并发框架：`context-budget-test.py` 独立 `sqlite3.connect` + `threading.Barrier(2)`。

| 编号 | 反例：input → 缺陷时错输出 → 实际 | 拒绝断言 | 证据 |
|------|----------------------------------|----------|------|
| P0-9A | 两线程各 INSERT L2=60，budget=100 → 合计 120 → 1 ok + 1 reject | `trg_snapshot_budget_check` / I11 | [context-budget-test.py:208](spikes/m0/context-budget-test.py#L208)；schema:497 |
| P0-9B | trusted L3 与 `untrusted_external` L3 并发 → poison 入库 → poison 被拒 | `trg_handoff_trust_label` / I14 | [context-budget-test.py:231](spikes/m0/context-budget-test.py#L231)；schema:516 |
| P0-9C | `raw_blob_id` 指向不存在 blob → dangling ref → FK reject | FK `context_snapshots.raw_blob_id` | [context-budget-test.py:290](spikes/m0/context-budget-test.py#L290) |
| P0-9D | `task_id=NULL` snapshot → 跨 attempt 无 task → NOT NULL reject | `task_id NOT NULL` | [context-budget-test.py:323](spikes/m0/context-budget-test.py#L323) |
| P0-9E | `token_count=-1` → 负 token 入库 → CHECK reject | CHECK `token_count >= 0` | [context-budget-test.py:376](spikes/m0/context-budget-test.py#L376) |
| P0-9F | `level='L9'` → 非法 level 入库 → CHECK reject | CHECK `level IN (L0..L3)` | [context-budget-test.py:422](spikes/m0/context-budget-test.py#L422) |

**P0-9A..F：6/6 PASS。**

---

## §3 v0.9-B P0 清单 (P0-9G..O)

| 编号 | 反例及实际 | 拒绝机制 | 真并发证据 |
|------|-----------|----------|------------|
| P0-9G | 双 worker claim 同 task → 1 success / 1 reject；direct INSERT 同证 | `idx_attempts_one_active`（schema:152）+ claim rowcount | Case 25/25b：[worker-dispatch-test.py:103](spikes/m0/worker-dispatch-test.py#L103) |
| P0-9H | 同 worker 两 active attempt → 1 success / 1 reject | `idx_worker_one_active_attempt`（schema:164） | Case 26：[worker-dispatch-test.py:222](spikes/m0/worker-dispatch-test.py#L222) |
| P0-9I | active INSERT/UPDATE `worker_id=NULL` → 2/2 I15 reject；ghost worker UPDATE 同拒 | `trg_attempt_active_needs_worker_*`（schema:420/429）+ `trg_attempt_worker_exists_*` | Case 27a/b/c：[L286](spikes/m0/worker-dispatch-test.py#L286)/[L334](spikes/m0/worker-dispatch-test.py#L334)/[L389](spikes/m0/worker-dispatch-test.py#L389)；Barrier + 独立连接 |
| P0-9J | equal/backward heartbeat → I16 reject；真并发 backward 2/2 reject | `trg_worker_heartbeat_renew`（schema:645） | Case 28a/b/c：[L547](spikes/m0/worker-dispatch-test.py#L547)/[L566](spikes/m0/worker-dispatch-test.py#L566)/[L588](spikes/m0/worker-dispatch-test.py#L588) |
| P0-9K | drain+terminal / INSERT draining / drained→active → 2/2 I17 reject | `trg_worker_drain_pause` 等（schema:658+） | Case 29a/b/c：[L647](spikes/m0/worker-dispatch-test.py#L647)/[L698](spikes/m0/worker-dispatch-test.py#L698)/[L746](spikes/m0/worker-dispatch-test.py#L746) |
| P0-9L | `last_heartbeat_at=NULL` → 2/2 NOT NULL reject | `workers.last_heartbeat_at NOT NULL` | Case 30：[L800](spikes/m0/worker-dispatch-test.py#L800) |
| P0-9M | `status='rogue'` → 2/2 CHECK reject | CHECK status enum | Case 31：[L849](spikes/m0/worker-dispatch-test.py#L849) |
| P0-9N | `current_attempt_id='att-fake'` → ownership/FK 2/2 reject | ownership trigger + FK | Case 32：[L898](spikes/m0/worker-dispatch-test.py#L898) |
| P0-9O | bypass `claim()` 直接 INSERT；同 idle worker 竞态 → 1 success / 1 reject | `idx_worker_one_active_attempt` | Case 33（`w_idle` 注释已修正）：[L954](spikes/m0/worker-dispatch-test.py#L954) |

**P0-9G..O：9/9 PASS（含真并发）。**

---

## §4 P0-M2 / P1 清单

| 编号 | 修复证据 | 判断 |
|------|----------|------|
| **P0-M2-1** | snapshot event payload 含 `task_id`+`attempt_id` 且 schema validate：[context-event-schema-test.py:171](spikes/m0/context-event-schema-test.py#L171)；append-only UPDATE/DELETE 拒 I11/I14 bypass：[context-budget-test.py:517](spikes/m0/context-budget-test.py#L517)；mutation M11 DROP `trg_snapshot_no_update` | ✅ PASS |
| **P0-M2-2-bid** | **Worker-side**：Case 27d 四路径（wrong-owner UPDATE / NULL-attempt UPDATE / wrong-owner INSERT / NULL-attempt INSERT）全拒：[worker-dispatch-test.py:456](spikes/m0/worker-dispatch-test.py#L456)；triggers `trg_worker_ownership_insert/update`（schema:702/722）；mutation M7/M8。<br>**Attempt-side**：`trg_attempt_owner_consistent_update`（schema:472）；M16 baseline 拒绝 dangling pointer reassign，DROP 后成功：[mutation-test.py:834](spikes/m0/mutation-test.py#L834)。本轮独立复现：`UPDATE task_attempts SET worker_id=w-b`（在 `w-a.current_attempt_id` 仍指向该 attempt 时）→ `IntegrityError: attempt ownership... dangling pointer`。<br>`trg_attempt_worker_exists_update` 使用 `IS NOT OLD.worker_id`（schema:455）。 | ✅ PASS |
| **P1-1** | L2 parent∈{L0,L1}、L3 parent=L2、cross-task 拒：`lineage-level-test.py` 11 cases；mutation M9/M10 | ✅ PASS |
| **P1-2-split** | register → `worker.registered` 且 **不** emit `worker.dispatched`：[worker-events-emit-test.py:91](spikes/m0/worker-events-emit-test.py#L91)–[L104](spikes/m0/worker-events-emit-test.py#L104)；claim → `worker.dispatched` 含 task_id+worker_id+attempt_id+strategy+dispatched_at：[L173](spikes/m0/worker-events-emit-test.py#L173)；Case 36：[worker-dispatch-test.py:1243](spikes/m0/worker-dispatch-test.py#L1243)；schema rename `trg_worker_registered_event_emit`（751）+ `trg_attempt_dispatched_event_emit_insert/update`（776/802）；mutation M17/M18 | ✅ PASS |
| **P1-3-race** | `dispatch_worker()` `BEGIN IMMEDIATE`（[_helpers.py:471](spikes/m0/_helpers.py#L471)）；Case 35：2 threads × 2 tasks → 2 distinct winners + total count=2：[worker-dispatch-test.py:1141](spikes/m0/worker-dispatch-test.py#L1141)；Fairness 3:3；mutation M15 回退 heartbeat-first 则 funnel | ✅ PASS |

---

## §5 spike coverage matrix

| 门槛 | v0.9.4 声明 | 实际跑过的 spike | 结果 |
|------|-------------|------------------|------|
| M0-9 | Context budget / I11 | `context-budget-test.py` P0-9A | PASS |
| M0-10 | Handoff trust / I14 | `context-budget-test.py` P0-9B | PASS |
| M0-11 | Context FK/NOT NULL/CHECK | `context-budget-test.py` P0-9C..F | PASS |
| M0-12 | Context event/schema/append-only | `context-event-schema-test.py` + budget cases 19–22 | PASS |
| M0-13 | Task/worker active uniqueness | worker Cases 25/25b/26/33 | PASS |
| M0-14 | Worker lifecycle + ownership | Cases 27–32 + 27d | PASS |
| M0-15 | WorkerPool / dispatch | `conformance-second-impl.py` + Fairness | PASS |
| M0-16 | v0.8 schema/spike 不退化 | 见下 v0.8 八条 | PASS |
| v0.8-1 | Fence 严格递增 | `claim-fence-test.py` | PASS |
| v0.8-2 | terminal claim + fence mismatch | `claim-fence-test.py` | PASS |
| v0.8-3 | cancel/renew/submit 竞态 | `cancel-race-test.py` | PASS |
| v0.8-4 | finalize / reaper / cross-task | `cancel-race-test.py` | PASS |
| v0.8-5 | approval supersede | `approval-supersede-test.py` | PASS |
| v0.8-6 | egress SSRF / rebinding | `egress-httpx-actual.py` | PASS |
| v0.8-7 | Gateway 六步链 | `conformance-second-impl.py` | PASS |
| v0.8-8 | policy direction | `policy-direction-test.py` | PASS |
| M0-17 | Lineage level | `lineage-level-test.py` 11 cases | PASS |
| M0-18 | Worker events emit | `worker-events-emit-test.py` + Case 34/36 | PASS |
| M0-19 | Mutation evidence | `mutation-test.py` M1–M11,M13–M18（17） | PASS |
| M0-20 | NULL bypass（ownership + fence） | Case 27d + `fence-missing-task-test.py` F1/F2/F3 | PASS |
| M0-21 | Attempt-side ownership | `trg_attempt_owner_consistent_update` + M16 | PASS |
| M0-22 | registered rename + dispatched split | worker-events Case 1/1b/6 + M17/M18 | PASS |
| M0-23 | dispatch_worker 真并发 atomicity | Case 35 + `_helpers.dispatch_worker` BEGIN IMMEDIATE + M15 | PASS |

**汇总：28/28 PASS（matrix 行全 PASS）。**

### 本轮执行摘要

```
schema:     tables_project=13  tables_total=14  triggers=27  indexes_named=27  indexes_total=39
spikes:     13/13 exit 0
events:     12/12 check-jsonschema --check-metaschema OK
conformance: OK: 10 Protocols satisfy runtime_checkable
mutations:  17/17 causal-chain verified (M12 superseded by M17)
```

---

## §6 最小修复清单

无。本轮无满足「可复现 FAIL」判定标准的项。

（非 FAIL 备注，不计入门槛：prompt §7 步骤 7 的 nonexistent-attempt UPDATE 一行命令应按「0-row UPDATE ≠ 反例成功」理解；若需文档澄清，可在后续 prompt 改写为 M16 同构 setup。）

---

## §7 复审门槛（v0.9.4 已满足的 executable evidence）

| # | 证据 | 本轮结果 |
|---|------|---------|
| 1 | `sqlite3 < spec/kernel-schema.sql` → 13/14/27/27/39 | ✅ |
| 2 | `spikes/m0/*.py`（除 `__init__`/`_helpers`）13/13 exit 0 | ✅ |
| 3 | `spec/events/*.json` × 12 `--check-metaschema` | ✅ |
| 4 | `conformance-second-impl.py` → 10 Protocols | ✅ |
| 5 | `mutation-test.py` → 17 mutations（含 M16/M17/M18） | ✅ |
| 6 | Case 27d 四路径 ownership NULL-safe | ✅ |
| 7 | Case 35 BEGIN IMMEDIATE 真并发无 lost update | ✅ |
| 8 | Case 36 + worker-events：registered / dispatched 语义拆分 | ✅ |
| 9 | M16：attempt-side dangling pointer 被拒 + DROP 后可写 | ✅ |
| 10 | fence F1/F2/F3：fence NULL-safe + 因果链 | ✅ |

**判定：v0.9.4 合并复审 PASS。**
