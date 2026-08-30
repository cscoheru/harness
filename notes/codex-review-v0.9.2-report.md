## §1 结论

**CHANGES REQUIRED。** Schema 数量符合预期，12/12 spike、11/11 event schema meta-validation、10/10 Protocol conformance 和现有 6/6 mutation 均执行成功；但不满足你定义的 PASS 门槛：P0-M2-2 存在可复现的 INSERT/UPDATE ownership 绕过；P0-9I/K/L/M/N 没有各自的真并发反例；`mutation-test.py` 的 6 个 DROP 没有覆盖 v0.9.2 新增五项修复。因此实际 coverage matrix 为 **17/19 PASS**，不是 19/19。

## §2 v0.9-A P0 清单

所有六项均由同一个真并发框架执行：独立连接在 [context-budget-test.py:106](/Users/kjonekong/projects/fish-harness/spikes/m0/context-budget-test.py:106)，`threading.Barrier(2)` 在 [context-budget-test.py:118](/Users/kjonekong/projects/fish-harness/spikes/m0/context-budget-test.py:118)。

| 编号 | 可复现反例：input → 缺陷时错输出 → 实际 | 拒绝断言 |
|---|---|---|
| P0-9A | 两线程各写 L2=60，budget=100 → 两条均成功、合计 120 → 实际 1 success + 1 `IntegrityError`。[case:208](/Users/kjonekong/projects/fish-harness/spikes/m0/context-budget-test.py:208) | `trg_snapshot_budget_check` / I11，[schema:439](/Users/kjonekong/projects/fish-harness/spec/kernel-schema.sql:439) |
| P0-9B | trusted 与 `L3/untrusted_external` 并发写入 → poison 被接受 → 实际 poison 被拒。[case:231](/Users/kjonekong/projects/fish-harness/spikes/m0/context-budget-test.py:231) | `trg_handoff_trust_label` / I14，[schema:458](/Users/kjonekong/projects/fish-harness/spec/kernel-schema.sql:458) |
| P0-9C | `raw_blob_id=blob-does-not-exist` → dangling reference 入库 → 实际 FK 拒绝。[case:290](/Users/kjonekong/projects/fish-harness/spikes/m0/context-budget-test.py:290) | FK `context_snapshots.raw_blob_id → blobs.blob_id`，[schema:331](/Users/kjonekong/projects/fish-harness/spec/kernel-schema.sql:331) |
| P0-9D | `task_id=NULL` snapshot → 无 task 的跨-attempt snapshot 入库 → 实际 NOT NULL 拒绝。[case:323](/Users/kjonekong/projects/fish-harness/spikes/m0/context-budget-test.py:323) | `context_snapshots.task_id NOT NULL`，[schema:314](/Users/kjonekong/projects/fish-harness/spec/kernel-schema.sql:314) |
| P0-9E | `token_count=-1` → 负 token 入库 → 实际 CHECK 拒绝。[case:376](/Users/kjonekong/projects/fish-harness/spikes/m0/context-budget-test.py:376) | unnamed CHECK `token_count >= 0`，[schema:319](/Users/kjonekong/projects/fish-harness/spec/kernel-schema.sql:319) |
| P0-9F | `level='L9'` → 非法层级入库 → 实际 CHECK 拒绝。[case:422](/Users/kjonekong/projects/fish-harness/spikes/m0/context-budget-test.py:422) | unnamed CHECK `level IN ('L0','L1','L2','L3')`，[schema:316](/Users/kjonekong/projects/fish-harness/spec/kernel-schema.sql:316) |

结论：**P0-9A..F 全部 PASS。**

## §3 v0.9-B P0 清单

| 编号 | 反例及实际结果 | 拒绝机制 | 真并发证据 |
|---|---|---|---|
| P0-9G | 双 worker dispatch 同 task → 重复 active attempt → 实际 1 成功 1 拒绝。[case:85](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:85)；direct INSERT 隔离测试在 [line 142](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:142) | `idx_attempts_one_active` | ✅ Barrier [line 105](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:105)，独立连接 [line 110](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:110) |
| P0-9H | 同 worker 同时持两个 active attempt → 两条成功 → 实际 1 成功 1 拒绝。[case:204](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:204) | `idx_worker_one_active_attempt` | ✅ Barrier [line 223](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:223)，独立连接 [line 228](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:228) |
| P0-9I | active INSERT/UPDATE 保留 `worker_id=NULL` → 无主 attempt 成功 → 两条均被 I15 拒绝。[INSERT:268](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:268)，[UPDATE:286](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:286) | `trg_attempt_active_needs_worker_insert/update` | ❌ 两项均使用 `make_db()` 单连接，无 Barrier |
| P0-9J | equal/backward heartbeat → timestamp 不推进仍成功 → 实际 I16 拒绝。[case:362](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:362) | `trg_worker_heartbeat_renew` | ⚠️ 并发 case 存在于 [line 403](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:403)，但断言只要求“至少一个”拒绝，[line 446](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:446)；它会容忍另一个非法写入成功 |
| P0-9K | drain 指向 terminal attempt → stale pointer 被接受 → 实际 I17 拒绝。[case:459](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:459) | `trg_worker_drain_pause`；另有 no-draining-insert/no-reactivate | ❌ 单连接，无 Barrier |
| P0-9L | `last_heartbeat_at=NULL` → worker 入库 → 实际 NOT NULL 拒绝。[case:522](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:522) | `workers.last_heartbeat_at NOT NULL` | ❌ 单连接，无 Barrier |
| P0-9M | `status='rogue'` → worker 入库 → 实际 CHECK 拒绝。[case:539](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:539) | unnamed CHECK `workers.status IN (...)` | ❌ 单连接，无 Barrier |
| P0-9N | `current_attempt_id='att-fake'` → dangling pointer 入库 → 实际 FK 拒绝。[case:556](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:556) | FK `workers.current_attempt_id → task_attempts.attempt_id` | ❌ 注释称 file-DB/并发，实际仍为 `make_db()` 单连接 |
| P0-9O | 绕过 `claim()` 直接 INSERT 同 task → 两个 active attempt → 实际 partial unique index 拒绝。[case 25b:142](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:142) | `idx_attempts_one_active`；Case 33 另证明 worker 侧 `idx_worker_one_active_attempt` | ✅ Barrier 与独立连接在 [line 160](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:160)、[line 165](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:165) |

结论：数据库约束的串行反例均被拒，但按“每个 v0.9-B case 必须真并发”的强门槛，**P0-9I/J/K/L/M/N evidence 不合格**。

## §4 P0-M2 / P1 清单

| 编号 | 修复证据 | 判断 |
|---|---|---|
| P0-M2-1 | 实际 `task_events.payload_json` 在 [context-event-schema-test.py:126](/Users/kjonekong/projects/fish-harness/spikes/m0/context-event-schema-test.py:126) 读取；`task_id/attempt_id` 在 [line 145](/Users/kjonekong/projects/fish-harness/spikes/m0/context-event-schema-test.py:145) 断言；实际 payload schema validation 在 [line 165](/Users/kjonekong/projects/fish-harness/spikes/m0/context-event-schema-test.py:165)。append-only UPDATE/DELETE 在 [context-budget-test.py:517](/Users/kjonekong/projects/fish-harness/spikes/m0/context-budget-test.py:517) 验证。 | 🟡 功能 spike PASS，但 mutation-test 没有 DROP `trg_snapshot_event_emit`、`trg_snapshot_no_update/no_delete`，因果证据 deferred |
| P0-M2-2 | Schema 有 `trg_worker_ownership_insert/update`，[schema:640](/Users/kjonekong/projects/fish-harness/spec/kernel-schema.sql:640)。但 spike 在 [worker-dispatch-test.py:335](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:335) 声称由不存在的 Case 27d 覆盖，`main()` 也没有 ownership case，[line 822](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:822)。 | ❌ FAIL。实际运行得到 `OWNERSHIP_INSERT_NULL_BYPASS=YES`、`OWNERSHIP_UPDATE_NULL_BYPASS=YES`。根因是 trigger 的 `attempt.worker_id != NEW.worker_id` 遇到 NULL 得到 UNKNOWN，不触发 RAISE，[schema:645](/Users/kjonekong/projects/fish-harness/spec/kernel-schema.sql:645)、[schema:662](/Users/kjonekong/projects/fish-harness/spec/kernel-schema.sql:662) |
| P1-1 | L2 的 L0/L1 parent、L3 的 L2 parent 正负矩阵在 [lineage-level-test.py:64](/Users/kjonekong/projects/fish-harness/spikes/m0/lineage-level-test.py:64) 起执行，共 11 cases。 | 🟡 功能 PASS；mutation-test 未 DROP lineage triggers |
| P1-2 | register/heartbeat/drain 实际 emit 并逐 payload schema validate：[worker-events-emit-test.py:56](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-events-emit-test.py:56)、[line 77](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-events-emit-test.py:77)、[line 98](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-events-emit-test.py:98)。 | 🟡 功能 PASS；mutation-test 未 DROP 三个 worker event triggers |
| P1-3 | capability filter 与 least-dispatched 排序在 [_helpers.py:433](/Users/kjonekong/projects/fish-harness/spikes/m0/_helpers.py:433)、[_helpers.py:452](/Users/kjonekong/projects/fish-harness/spikes/m0/_helpers.py:452)；6 次派发结果 3:3，在 [worker-dispatch-test.py:748](/Users/kjonekong/projects/fish-harness/spikes/m0/worker-dispatch-test.py:748)。 | 🟡 功能 PASS；没有反向 mutation 证明退回 heartbeat-first 时测试会失败 |

## §5 spike coverage matrix

M0-9..16 的语义名称未在允许读取的文件中显式定义；下表按本次 prompt 声明与可读 spec/spike 的直接对应关系映射。

| 门槛 | v0.9.2 声明 | 实际跑过的 spike | 结果 |
|---|---|---|---|
| M0-9 | Context budget / I11 | `context-budget-test.py` P0-9A | PASS |
| M0-10 | Handoff trust / I14 | `context-budget-test.py` P0-9B | PASS |
| M0-11 | Context FK/NOT NULL/CHECK | `context-budget-test.py` P0-9C..F | PASS |
| M0-12 | Context event/schema/append-only | `context-event-schema-test.py` + context cases 19–22 | PASS |
| M0-13 | Task/worker active uniqueness | worker cases 25/25b/26/33 | PASS |
| M0-14 | Worker lifecycle与ownership约束 | worker cases 27–32 | **FAIL：ownership NULL 绕过；五项缺真并发** |
| M0-15 | WorkerPool protocol/dispatch | `conformance-second-impl.py` + fairness case | PASS |
| M0-16 | v0.8 schema/spike 不退化 | 六个 legacy spike 全部 exit 0 | PASS |
| v0.8-1 | Fence 严格递增 | `claim-fence-test.py` case 1 | PASS |
| v0.8-2 | terminal claim + fence mismatch 拒绝 | `claim-fence-test.py` cases 2–3 | PASS |
| v0.8-3 | cancel/renew/submit 原子竞争 | `cancel-race-test.py` cases 1–3 | PASS |
| v0.8-4 | finalize credential/cross-task/reaper | `cancel-race-test.py` cases 4–8 | PASS |
| v0.8-5 | approval supersede single-consumer | `approval-supersede-test.py` cases A–D | PASS |
| v0.8-6 | pinned egress / SSRF / rebinding | `egress-httpx-actual.py` | PASS |
| v0.8-7 | Gateway 六步行为链 | `conformance-second-impl.py` | PASS |
| v0.8-8 | trust-label policy direction | `policy-direction-test.py` | PASS |
| M0-17 | Lineage level | `lineage-level-test.py` 11 cases | PASS |
| M0-18 | Worker events emit | `worker-events-emit-test.py` 5 cases | PASS |
| M0-19 | Mutation evidence | `mutation-test.py` M1–M6 | **FAIL：6 个 mutation 未覆盖新增五项修复** |

**汇总：17/19 PASS。**

补充执行结果：

- Schema：13 project tables / 14 total / 24 triggers / 27 named indexes / 39 total indexes，符合预期。
- 12/12 spike exit 0。
- 11/11 event schema 使用正确的 `check-jsonschema --check-metaschema` 通过。
- 用户给出的 `check-jsonschema --schemafile "$f"` 缺少 instance 参数，实际 exit 2：`Missing argument 'INSTANCEFILES...'`。
- 10/10 Protocol conformance。
- 现有 6/6 reverse-DROP mutation 通过，但其覆盖对象见 [mutation-test.py:15](/Users/kjonekong/projects/fish-harness/spikes/m0/mutation-test.py:15)，没有 ownership、lineage、context payload、worker events 或 round-robin。

## §6 最小修复清单

1. **P0：修复 ownership NULL 语义。** 两个 trigger 改用 NULL-safe 判断，例如 `NOT EXISTS (SELECT 1 FROM task_attempts WHERE attempt_id=NEW.current_attempt_id AND worker_id=NEW.worker_id)`；覆盖 INSERT 与 UPDATE。
2. **P0：补 Case 27d。** 分别测试 wrong-owner non-NULL、attempt.worker_id NULL，两种输入均覆盖 workers INSERT/UPDATE。
3. **P0 evidence：为 P0-9I/K/L/M/N 补独立 file-DB、每线程独立 `sqlite3.connect`、`threading.Barrier`；P0-9J 并发断言改成两个非法 heartbeat 都必须被 I16 拒绝。**
4. **P0 evidence：重做/扩充 M0-19。** 六个目标 mutation 至少必须覆盖本次新增五项，而不是只覆盖旧索引、I15、heartbeat、drain 和 fence。
5. **P1：修正文档/CI 命令。** Event schema 自校验应使用 `check-jsonschema --check-metaschema "$f"`；若使用 `--schemafile`，必须提供实际 instance 文件。

## §7 复审门槛

v0.9.2 提交以下 executable evidence 后即可重新判 PASS：

- `worker-dispatch-test.py` 新增并执行 P0-M2-2 INSERT/UPDATE 四个反例：wrong owner ×2、NULL owner ×2，全部由 `trg_worker_ownership_insert/update` 拒绝。
- P0-9G..O 每个编号都有 file-backed DB、独立连接和 Barrier 证据；不得只写在 docstring。
- `mutation-test.py` 的输出逐项列出五个新增修复的 baseline PASS / mutation FAIL，包括 context payload/append-only、ownership、lineage、worker events、round-robin。
- `python3 spikes/m0/mutation-test.py` 不仅 exit 0，而且每个 mutation 的失败对应目标 spike 断言。
- 12/12 spike exit 0、11/11 meta-schema、10/10 Protocol conformance。
- Schema 数量保持 13 project tables / 14 total / 24 triggers / 27 named indexes / 39 total indexes。
- 最终 matrix 达到 **19/19 PASS**，且 ownership NULL 绕过脚本从成功入库变为 INSERT、UPDATE 均 `IntegrityError`。