# PRD v0.9.3 架构审验报告

> **Status**: ⚠️ **SUPERSEDED** — v0.9.3 review → Codex 返回 CHANGES REQUIRED / 14/20 PASS / 6 FAIL；v0.9.4 修复后复审 PASS。正式报告见 `notes/codex-review-v0.9.4-report.md`。
>
> 审验对象：`notes/codex-review-prompt-v0.9.3.md` 指定的 v0.9.3 可执行证据
> 审验日期：2026-08-30
> 证据边界：仅检查 `spec/` 与 `spikes/m0/`；未读取 PRD、ADR、response、旧 review 与 contemplation 文件  
> 方法：反例优先；不以文档中的“已实现”作为证据

## §1 结论

**CHANGES REQUIRED。** 新鲜数据库的 schema 数量符合 `13 project tables / 14 total tables / 24 triggers / 27 named indexes / 39 total indexes`，11 个 event schema 均通过 `check-jsonschema --check-metaschema`，Protocol conformance 为 10/10，目录内实际存在的 **12 个**可执行 spike（不是声明的 13 个）也全部 exit 0；但严格按 22 个反例及 matrix 审验，结果为 **14/20 PASS**。阻断项包括：`task_attempts.worker_id` 更新可从 attempt 侧破坏所谓“双向 ownership”；Case 27d 实际只有 2 个 UPDATE 子例而不是 4 个，且没有覆盖 existing-attempt/NULL-owner；`trg_attempt_worker_exists_update` 仍有 `OLD.worker_id=NULL` 的三值逻辑旁路；Case 33 没有建立“目标 worker 已持有另一个 active attempt”的声明前置状态；`worker.dispatched` 实际是 worker registration 事件而非 dispatch 事件；`dispatch_worker()` 在真并发下会双选同一 worker并丢失计数；M0-19 的 15 个 mutation 也没有覆盖这些路径及 fence NULL bypass。依据“任一反例无 executable spike、反例成功或 matrix 有 FAIL 即 CHANGES REQUIRED”的门槛，本版不能 PASS。

## §2 v0.9-A P0 清单（P0-9A..F）

所有 A–F 均通过同一个真并发基座：`spikes/m0/context-budget-test.py:106-142` 使用 `threading.Barrier(2)` 和两个独立 `connect_with_fk()`。

| 编号 | 可复现反例（input/state → 实际结果） | executable evidence | 拒绝该反例的约束 | 结果 |
|---|---|---|---|---|
| P0-9A | budget=100，两个连接并发写 L2=60+60 → 1 成功、1 `IntegrityError: I11`，总额不越界 | `spikes/m0/context-budget-test.py:208-229` | `trg_snapshot_budget_check`，`spec/kernel-schema.sql:452-466` | ✅ PASS |
| P0-9B | 并发写 trusted L3 与 `untrusted_external` L3 → trusted 成功，poison 被 `I14` 拒绝 | `spikes/m0/context-budget-test.py:231-288` | `trg_handoff_trust_label`，`spec/kernel-schema.sql:471-477` | ✅ PASS |
| P0-9C | L1 引用 `blob-does-not-exist`，对照连接写合法 blob → 非法写被 `FOREIGN KEY` 拒绝 | `spikes/m0/context-budget-test.py:290-321` | `context_snapshots.raw_blob_id → blobs.blob_id` FK，`spec/kernel-schema.sql:331` | ✅ PASS |
| P0-9D | snapshot `task_id=NULL`，并发合法 L2 → NULL 写被 `NOT NULL` 拒绝 | `spikes/m0/context-budget-test.py:323-374` | `context_snapshots.task_id TEXT NOT NULL`，`spec/kernel-schema.sql:314` | ✅ PASS |
| P0-9E | `token_count=-1`，并发 `token_count=10` → 负数被 CHECK 拒绝 | `spikes/m0/context-budget-test.py:376-420` | `CHECK (token_count >= 0)`，`spec/kernel-schema.sql:319` | ✅ PASS |
| P0-9F | `level='L9'`，并发合法 L2 → L9 被 CHECK 拒绝 | `spikes/m0/context-budget-test.py:422-473` | `CHECK (level IN ('L0','L1','L2','L3'))`，`spec/kernel-schema.sql:316` | ✅ PASS |

## §3 v0.9-B P0 清单（P0-9G..O）

| 编号 | 可复现反例（input/state → 实际结果） | executable evidence | 拒绝该反例的约束 | 结果 |
|---|---|---|---|---|
| P0-9G | 两个 worker 并发 claim 同一 task → helper 路径 1/1，直接 INSERT 路径 1/1 | `spikes/m0/worker-dispatch-test.py:91-203`，Barrier 在 `:111`、`:166` | `idx_attempts_one_active`，`spec/kernel-schema.sql:137-139`（helper 路径还可能先被 task rowcount 拒绝） | ✅ PASS |
| P0-9H | 同一 worker 并发持有两个 active attempt → 1 成功、1 UNIQUE 拒绝 | `spikes/m0/worker-dispatch-test.py:210-267`，Barrier 在 `:229` | `idx_worker_one_active_attempt`，`spec/kernel-schema.sql:149-152` | ✅ PASS |
| P0-9I | active INSERT/UPDATE 的 `worker_id=NULL`，及 UPDATE 到 ghost worker → 每组 2/2 拒绝 | `spikes/m0/worker-dispatch-test.py:274-434`，Barrier 在 `:283/:340/:399` | `trg_attempt_active_needs_worker_insert/update`、`task_attempts.worker_id` FK，`spec/kernel-schema.sql:405-444`、`:129` | ✅ PASS |
| P0-9J | equal/backward heartbeat；并发两个 backward heartbeat → 两个均被拒绝 | `spikes/m0/worker-dispatch-test.py:510-603`，并发 Barrier 在 `:564` | `trg_worker_heartbeat_renew`，`spec/kernel-schema.sql:600-607` | ✅ PASS |
| P0-9K | terminal pointer 时 drain、直接 INSERT draining、drained/stale 重新激活 → 各并发组 2/2 拒绝 | `spikes/m0/worker-dispatch-test.py:610-756`，Barrier 在 `:628/:669/:722` | `trg_worker_drain_pause`、`trg_worker_no_draining_insert`、`trg_worker_no_reactivate`，`spec/kernel-schema.sql:613-646` | ✅ PASS |
| P0-9L | 两个连接并发 INSERT `last_heartbeat_at=NULL` → 2/2 `NOT NULL` | `spikes/m0/worker-dispatch-test.py:763-805`，Barrier 在 `:771` | `workers.last_heartbeat_at TEXT NOT NULL`，`spec/kernel-schema.sql:165` | ✅ PASS |
| P0-9M | 两个连接并发 INSERT `status='rogue'` → 2/2 CHECK | `spikes/m0/worker-dispatch-test.py:812-854`，Barrier 在 `:820` | `CHECK status IN (active,draining,drained,stale)`，`spec/kernel-schema.sql:162-164` | ✅ PASS |
| P0-9N | 两个连接并发设置 `current_attempt_id='att-fake'` → 2/2 ownership/FK 拒绝 | `spikes/m0/worker-dispatch-test.py:861-910`，Barrier 在 `:869` | `trg_worker_ownership_insert` + `workers.current_attempt_id` FK，`spec/kernel-schema.sql:657-675`、`:169` | ✅ PASS |
| P0-9O | **声明输入**：`w-bypass` 已持有 task_a，再直接 INSERT task_b；**实际输入**：task_a 由 `w-holder` 持有，`w-bypass` 是 idle；实际输出为对 task_b 的 1 成功/1 拒绝 | `spikes/m0/worker-dispatch-test.py:917-993`；错误前置状态见 `:931-948` | 测到的是两个并发 INSERT 之间的 `idx_worker_one_active_attempt`，没有测到声明的“已持有 task_a 后 bypass” | 🟡 **FAIL / spike-deferred** |

P0-9O 的 schema backstop 很可能有效，但当前用例不能证明它：注释 `:918-926` 与真实 setup `:931-948` 相互矛盾。严格门槛按“没有对应 executable counterexample 即 FAIL”处理。

## §4 P0-M2 / P1 清单（含 v0.9.3 NULL bypass）

### P0-M2-1 — actual context payload：✅ PASS（但 mutation 不完整）

实际 INSERT snapshot 后，从 `task_events` 读取 `payload_json` 并验证 `task_id + attempt_id`，见 `spikes/m0/context-event-schema-test.py:109-171`；生产 payload 由 `trg_snapshot_event_emit` 的 `json_object` 生成，见 `spec/kernel-schema.sql:565-589`。反例“真实 payload 缺 task_id/attempt_id → schema validation error”已被当前 spike 拒绝。

不过 M11 (`spikes/m0/mutation-test.py:654-692`) 只 DROP `trg_snapshot_no_update`，没有对 event payload 字段做 mutation，因此该 PASS 不等于 M0-19 因果证据完整。

### P0-M2-2 — 双向 ownership：❌ FAIL（真实不变量破坏）

Case 27d `spikes/m0/worker-dispatch-test.py:437-503` 只启动两个 UPDATE：wrong-owner 与 missing-attempt，见 `:480-489`；它既不是注释声称的 4 sub-case，也没有覆盖“存在的 attempt，其 `worker_id IS NULL`”的 INSERT/UPDATE。

更严重的是，ownership 只在 `workers.current_attempt_id` INSERT/UPDATE 时检查（`spec/kernel-schema.sql:657-696`）。建立合法关系后，执行：

```text
workers['w-own-a'].current_attempt_id = 'att-x'
task_attempts['att-x'].worker_id      = 'w-own-a'
UPDATE task_attempts SET worker_id='w-own-b' WHERE attempt_id='att-x'
→ UPDATE 成功；最终 pointer_owner='w-own-a'，attempt_owner='w-own-b'
```

`trg_attempt_worker_exists_update` (`spec/kernel-schema.sql:436-444`) 只确认 `w-own-b` 存在，不回查是否已有 worker 指向该 attempt。因此所谓“双向 ownership”可以从 attempt 一侧被真实破坏；现有所有 spike 仍会全绿。

### P1-1 — lineage level：✅ PASS

`spikes/m0/lineage-level-test.py:64-220` 覆盖 L2/L3 合法与非法 parent level、缺 parent、cross-task parent；拒绝层为 `trg_lineage_l2_needs_parent`、`trg_lineage_l3_needs_parent`、`trg_lineage_same_task`（`spec/kernel-schema.sql:484-539`）。

### P1-2 — worker events：❌ FAIL（事件语义漂移）

`spikes/m0/worker-events-emit-test.py:47-144` 确实证明 register/heartbeat/drain 会各产生一个符合当前 JSON 文件的事件。但它把 **register** 断言成 `worker.dispatched`（`:56-75`），而 `spec/worker-pool.md:16-20` 将 dispatch 定义为 “task → selected worker”，其事件契约也要求 `task_id + worker_id + strategy`（`spec/worker-pool.md:184-198`）。实际 JSON 则改成 registration payload（`spec/events/worker.dispatched.json:5-29`），实际 trigger 也在 `INSERT INTO workers` 时发出且 `task_id=NULL`（`spec/kernel-schema.sql:701-721`）。

实跑 register 后再调用真正的 `dispatch_worker()`：

```text
worker.dispatched event count: 1 → 1
payload: {worker_id, host, capabilities_json, status, dispatched_at}
→ 真正 dispatch 没有事件；已有事件只是 registration
```

这是测试、JSON 与 trigger 彼此自洽，但共同偏离上位 spec 的“假闭环”。

### P1-3 — round-robin：❌ FAIL（串行通过，并发失效）

顺序用例 `spikes/m0/worker-dispatch-test.py:1091-1128` 的 6 次串行 dispatch 为 3/3，M15 也能让旧 heartbeat-first 版本变红。但 `dispatch_worker()` 在 `spikes/m0/_helpers.py:452-483` 先读全部 count，再以普通 UPSERT 写回 `counts[winner] + 1`，没有 `BEGIN IMMEDIATE`、CAS 或原子 allocator。

使用两个独立 SQLite connection、`threading.Barrier(2)`，并在两边完成 count/heartbeat 读取后同时继续，实跑得到：

```text
2 concurrent dispatches
→ results=['w-race-a', 'w-race-a']
→ persisted_counts={'w-race-a': 1}
```

即两次调用选择同一 worker，且发生 lost update（2 次派发只记 1 次）。当前 fairness spike 仅串行，不能证明并发调度公平性。另外 `_neg_ts_key()` 声称 heartbeat DESC，却返回 `(1, ts)` 后按升序排序（`spikes/m0/_helpers.py:469-503`），实际是更早 heartbeat 优先。

### v0.9.3 NULL bypass 两项

| 项 | input/state → 实际结果 | executable evidence | 结果 |
|---|---|---|---|
| NULL-OWN | missing attempt 的 `current_attempt_id` UPDATE → 被 `trg_worker_ownership_update` 拒绝；但 existing attempt/`worker_id=NULL` 的 INSERT/UPDATE 只由审验时临时探针验证，Case 27d 没有这两个子例；attempt 侧 owner 改写还能成功 | Case 27d `spikes/m0/worker-dispatch-test.py:437-503` 仅覆盖 2 个 UPDATE；M7/M8 `spikes/m0/mutation-test.py:471-557` 仅覆盖 non-NULL wrong-owner | ❌ FAIL |
| NULL-FENCE | `task_id='t-nonexistent'` 的 attempt INSERT → `trg_attempt_fence_insert` 抛 `IntegrityError` | 只有 prompt 内联命令；`spikes/m0/claim-fence-test.py` 和 M6 `spikes/m0/mutation-test.py:424-464` 都只测“存在 task 的 fence mismatch”，没有可执行 spike 文件覆盖 missing-task NULL path，也没有对应 mutation | 🟡 **FAIL / spike-deferred** |

另有一个不在 22 项计数中的同源缺陷：`trg_attempt_worker_exists_update` 使用 `NEW.worker_id != OLD.worker_id`（`spec/kernel-schema.sql:436-444`）。当 OLD 为 NULL、NEW 为 ghost worker 时条件结果为 UNKNOWN，trigger 不执行；本次关闭该连接的 FK 后实跑得到 `NULL → w-ghost UPDATE succeeded`。现有 Case 27c 因每连接显式 `PRAGMA foreign_keys=ON` 而由 FK 拒绝，所以 P0-9I 的规定路径仍判 PASS，但 trigger 自称的 defense-in-depth 并未成立。

## §5 Spike coverage matrix（声明覆盖 vs 实际覆盖）

实跑总览：

```text
schema: 13 project tables / 14 total tables / 24 triggers / 27 named indexes / 39 total indexes
spikes: 12 executable files, 12 PASS, 0 FAIL（prompt 声明 13）
event schemas: 11/11 --check-metaschema PASS
conformance: 10/10 Protocols runtime_checkable
mutation-test.py: 15 functions exit 0，但因果覆盖并不等于 15 项完整
```

| Gate | v0.9.3 声明 | 实际跑过的 spike / 检查 | 判定 |
|---|---|---|---|
| M0-9 context schema | context 表/FK/CHECK/trigger 完整 | schema apply + 数量查询；`context-budget-test.py` | ✅ PASS |
| M0-10 context A–F 真并发 | 6 反例均真并发拒绝 | `context-budget-test.py:106-473` | ✅ PASS |
| M0-11 snapshot event payload | actual payload 含 task_id/attempt_id | `context-event-schema-test.py:109-171` | ✅ PASS |
| M0-12 Context Protocol | ContextBudget/Distiller conformance | `conformance-second-impl.py`，10/10 总体通过 | ✅ PASS |
| M0-13 worker schema | 24 triggers/FK/双向 ownership NULL-safe | 数量通过；attempt 侧 owner 更新可破坏 ownership；`trg_attempt_worker_exists_update` 仍有 OLD=NULL 三值逻辑旁路；`worker-pool.md` trigger 示例仍是旧版 INSERT-only/equality 语义（`:64-111`） | ❌ FAIL |
| M0-14 worker P0-9G–O + Case27d | 19 个真并发 case | `worker-dispatch-test.py` exit 0；Case27d 仅 2/4，Case33 前置状态不成立 | ❌ FAIL |
| M0-15 WorkerPool Protocol | 第二实现满足 Protocol | `conformance-second-impl.py` 10/10 | ✅ PASS（仅结构/行为样例） |
| M0-16 worker event emit | dispatched/heartbeat/drained 实际 emit | `worker-events-emit-test.py`、`context-event-schema-test.py`、Case34；但 dispatched 实为 registered | ❌ FAIL |
| M0-17 lineage level | L2/L3 parent level 强制 | `lineage-level-test.py` | ✅ PASS |
| M0-18 worker events P1-2 | 三类事件 emit + payload | 11 schema meta-valid、实例验证通过，但 dispatch 语义错误且真正 dispatch 不 emit | ❌ FAIL |
| M0-19 mutation evidence | 15 个 reverse-DROP 均有完整因果链 | `mutation-test.py` exit 0；M1 baseline/helper 与 mutated/direct path 不同；M7/M8 无 NULL/attempt-side；M11 无 payload mutation；M15 是 monkey-patch 且无并发；missing-task fence 无 mutation；声明的 restore helper `:86-92` 未被调用 | ❌ FAIL |
| M0-20 NULL bypass | ownership + fence 均有 executable evidence | missing-attempt 与 missing-task 临时验证均拒绝；但 Case27d 缺 existing NULL-owner 子例，fence 无 spike，attempt 侧仍可破坏 ownership，worker-exists UPDATE 仍有 OLD=NULL 旁路 | ❌ FAIL |
| v0.8-1 schema 可应用且不退化 | fresh DB apply | `sqlite3` fresh file apply + object counts | ✅ PASS |
| v0.8-2 claim/fence | strict fence、terminal、double claim | `claim-fence-test.py` | ✅ PASS |
| v0.8-3 cancellation race | cancel/finalize/reaper/heartbeat races | `cancel-race-test.py` | ✅ PASS |
| v0.8-4 approval supersede | single-consumer + concurrent supersede | `approval-supersede-test.py` | ✅ PASS |
| v0.8-5 egress | pinned DNS/private IP/redirect/IPv6/proxy fail-safe | `egress-httpx-actual.py` | ✅ PASS |
| v0.8-6 policy direction | trust label 影响真实决策 | `policy-direction-test.py` | ✅ PASS |
| v0.8-7 behavioral conformance | 第二实现与 gateway 行为 | `conformance-second-impl.py` | ✅ PASS |
| v0.8-8 event contracts | event JSON schema 不退化 | 11/11 `check-jsonschema --check-metaschema` | ✅ PASS |

总计：**14/20 PASS，6 FAIL**。

## §6 最小修复清单（按优先级）

1. **P0：补 attempt 侧 ownership 约束。** 对 `task_attempts.worker_id` 的 UPDATE（必要时也包含 DELETE/置 NULL）增加 NULL-safe trigger：若任一 `workers.current_attempt_id=NEW.attempt_id`，则 `NEW.worker_id` 必须非 NULL 且等于该 worker；同时把 `trg_attempt_worker_exists_update` 的 `NEW.worker_id != OLD.worker_id` 改为 NULL-safe 比较。用 `IS NOT`/`NOT EXISTS` 避免三值逻辑，不要只依赖 per-connection FK。
2. **P0：让 dispatch allocator 原子化。** 在同一写事务中选择与递增（SQLite 可用 `BEGIN IMMEDIATE` + select/update，或单 SQL/CAS + retry）；明确并发语义，确保两次成功 dispatch 对应两次持久计数且不会因 lost update 固定投向同一 worker。
3. **P0：修正事件词义。** 把 worker INSERT 事件命名为 `worker.registered`；由真实 `dispatch_worker(task_id, ...)` 发出 `worker.dispatched`，payload 至少包含 `task_id/worker_id/strategy/dispatched_at`，并使 `spec/worker-pool.md`、JSON schema、trigger/helper、spike 同义。
4. **P0：修正反例本身。** Case33 必须先让同一个 `w-bypass` 持有 task_a，再直接 INSERT task_b 并断言 0 成功；Case27d 增补 wrong-owner 与 existing-attempt/NULL-owner 的 INSERT+UPDATE 共 4 个子例，每个使用独立连接和 Barrier。
5. **P0：把 fence missing-task 变成正式 spike。** 不接受 prompt 内联命令替代仓库中的 executable evidence；同时增加 reverse-DROP mutation，证明 `trg_attempt_fence_insert` 是拒绝 missing-task 路径的因果层。
6. **P1：重做 mutation 的可证伪性。** 每个 mutation 必须对同一入口执行 baseline PASS → DROP/patch 后同一断言 FAIL → restore 后同一断言再次 PASS。覆盖 actual payload 字段、ownership NULL/attempt-side、真实并发 round-robin，而不是只 monkey-patch 一个旧选择器。
7. **P1：修正文档与计数。** `spec/worker-pool.md:64-111` 的旧 trigger 示例应与 canonical schema 同步；prompt 的 “13 spike” 应改成实际 12，或确实新增独立 spike 后再声明 13。

## §7 复审门槛（下一版提交以下 executable evidence 即可 PASS）

1. `spikes/m0/worker-dispatch-test.py` 或独立 ownership spike：4 个 NULL-safe INSERT/UPDATE 子例，加上“先合法绑定、再 UPDATE `task_attempts.worker_id` 为另一 worker/NULL”的反例，以及 `OLD.worker_id=NULL → NEW.worker_id=ghost` 的 worker-exists trigger 专项反例；全部使用文件 DB、两个独立 `sqlite3.connect`、`threading.Barrier`。新增/修正 trigger DROP 后，至少一个同一反例必须转红；restore 后再次变绿。
2. Case33 修正 setup，并在断言前直接查询证明 `w-bypass` 已持有 task_a；随后 direct INSERT task_b 必须 **0 success**，错误明确来自 `idx_worker_one_active_attempt`。
3. 将 missing-task fence 用例写入可执行 spike，并增加 `trg_attempt_fence_insert` 的 missing-task 专项 mutation：baseline `IntegrityError` → DROP 后非法 INSERT 成功 → restore 后再次 `IntegrityError`。
4. 增加真并发 dispatch spike：两个独立连接在同一读状态后同时 dispatch，断言两个成功调用不会产生 lost update（持久 count 总和必须为 2）；在两个等价 worker 场景中应为 1/1。当前可复现的 `['w-race-a','w-race-a'] + persisted_count=1` 必须消失。
5. 拆分 `worker.registered` 与 `worker.dispatched`：真实 dispatch 后必须新增恰好一个 task-scoped dispatched event，并以 canonical JSON schema 验证 `task_id/worker_id/strategy`；仅 register 不得产生 dispatched。
6. mutation suite 对 P0-M2-1 payload、P0-M2-2 双向 ownership、P1-2 真实 dispatch 事件、P1-3 真并发 allocator、两处 NULL bypass 均执行“同一测试 baseline/DROP/restore”闭环；不能只以 mutation 函数数量代替覆盖率。
7. 全量复跑并提交原始输出：fresh schema `13/14/24/27/39`；所有 executable spikes 逐文件 exit 0 且实际数量与声明一致；所有 event schema meta-valid；conformance 输出 `10 Protocols satisfy runtime_checkable`；§5 的 20 行全部 PASS。

在以上证据提交前，不能以“现有脚本全部 exit 0”替代反例闭环，也不能将当前 v0.9.3 标记为 PASS。
