# PRD v0.9-A + v0.9-B 合并架构审验

> 审验日期：2026-08-30  
> 审验范围：仅 `spec/` 与 `spikes/m0/`  
> 审验方法：全新 SQLite 文件库、独立 `sqlite3.connect` + `threading.Barrier`、反例直写、关键约束移除实验  
> 未读取：PRD、ADR、旧 response/review、contemplations

## §1 结论

**CHANGES REQUIRED。** 原始 9 个可执行 spike 均以 exit 0 结束，schema 也确有 15 个 trigger、39 个 index，A 侧 P0-9A～F 的真并发反例均被正确拒绝；但这还不满足合并审验的 PASS 门槛：P0-9G 的 Case 25 实际由 `claim()` 的 task 状态/rowcount 拦截，移除 `idx_attempts_one_active` 后仍然全绿；P0-9I 可通过 `pending + worker_id=NULL → UPDATE status='claimed'` 绕过；P0-9J 只拒绝“相等”心跳，倒退时间会成功；P0-9K 可由初始 `status='draining'` 绕过；H～O 除 G 外没有按强约束提供真并发 spike；数据库实际生成的 `context.snapshot` payload 缺少两个必填字段；v0.8 fence spike 又被新 I15 trigger 抢先拦截，移除 fence trigger 后仍全绿。因此 coverage matrix 存在 FAIL，不能判 PASS。

## §2 v0.9-A P0 清单

并发公共基线：`spikes/m0/context-budget-test.py:106-142` 创建 `threading.Barrier(2)`，每个线程在 barrier 后通过 `connect_with_fk()` 打开独立连接；`spikes/m0/_helpers.py:49-79` 明确为每条连接启用 FK。

| 编号 | 复现反例（input/state → output） | 可执行证据与拒绝点 | 结论 |
|---|---|---|---|
| P0-9A | `budget=100；两个独立连接同时 INSERT L2(token_count=60)` → `1 ok + 1 IntegrityError(I11)` | `spikes/m0/context-budget-test.py:208-229`；`trg_snapshot_budget_check`，`spec/kernel-schema.sql:394-408`。移除 trigger 后 spike 在 P0-9A 处转红。 | ✅ PASS |
| P0-9B | `trusted L3` 与 `untrusted_external L3` 同时 INSERT → trusted 成功、poison 被 `I14` 拒绝 | `spikes/m0/context-budget-test.py:231-288`；`trg_handoff_trust_label`，`spec/kernel-schema.sql:413-419`。移除 trigger 后两个写入都成功，spike 转红。 | ✅ PASS |
| P0-9C | 合法 `raw_blob_id` 与不存在的 `blob-does-not-exist` 同时写 L1 → bad 写入报 `FOREIGN KEY constraint failed` | `spikes/m0/context-budget-test.py:290-321`；`context_snapshots(raw_blob_id) → blobs(blob_id)` FK，`spec/kernel-schema.sql:310`；每连接 FK=ON。 | ✅ PASS |
| P0-9D | 合法 L2 与 `task_id=NULL` 同时 INSERT → NULL 写入报 `NOT NULL constraint failed: context_snapshots.task_id` | `spikes/m0/context-budget-test.py:323-374`；`context_snapshots.task_id NOT NULL`，`spec/kernel-schema.sql:293`。 | ✅ PASS |
| P0-9E | `token_count=10` 与 `token_count=-1` 同时 INSERT → negative 写入报 `CHECK constraint failed: token_count >= 0` | `spikes/m0/context-budget-test.py:376-420`；`CHECK (token_count >= 0)`，`spec/kernel-schema.sql:298`。 | ✅ PASS |
| P0-9F | `level='L2'` 与 `level='L9'` 同时 INSERT → L9 写入报 level CHECK | `spikes/m0/context-budget-test.py:422-473`；`CHECK (level IN ('L0','L1','L2','L3'))`，`spec/kernel-schema.sql:295`。 | ✅ PASS |

## §3 v0.9-B P0 清单

| 编号 | 复现反例（input/state → output） | 可执行证据与拒绝点 | 结论 |
|---|---|---|---|
| P0-9G | Case 25：两个 worker 并发 `claim()` 同一 task → `1 success + 1 "task not in pending/failed"`；反向实验：删除 `idx_attempts_one_active` 后 Case 25 仍输出 OK | `spikes/m0/worker-dispatch-test.py:46-101` 允许 rowcount/terminal/unique 任一原因；实际命中 `_helpers.claim()` 的 task UPDATE rowcount，`spikes/m0/_helpers.py:141-153`，不是 `idx_attempts_one_active`（schema 在 `spec/kernel-schema.sql:116-118`）。独立直写真并发能触发 `UNIQUE task_attempts.task_id`，说明索引本体有效，但当前提交的 spike 没有证明它。 | ❌ FAIL（evidence 不因果） |
| P0-9H | 同一 worker 的两个 active attempt → 第二条报 `UNIQUE task_attempts.worker_id` | `spikes/m0/worker-dispatch-test.py:104-130`；`idx_worker_one_active_attempt`，`spec/kernel-schema.sql:128-131`。删除该 index 后 Case 26 转红；但 Case 26 是顺序调用，不是独立连接 + threading。 | 🟡 spike-deferred（缺真并发文件证据） |
| P0-9I | 已提交用例：active INSERT + `worker_id=NULL` → I15；未覆盖反例：`pending,NULL → UPDATE status='claimed'` → **成功并留下 active/null row** | `spikes/m0/worker-dispatch-test.py:133-154` 只测 INSERT，且写死 `fence_version=1`、新 task 实际 fence=0；删除 I15 trigger 后仍由 fence trigger 拒绝，因果不纯。`trg_attempt_active_needs_worker` 也只有 `BEFORE INSERT`，`spec/kernel-schema.sql:368-375`。 | ❌ FAIL（UPDATE 旁路成功） |
| P0-9J | 已提交用例：`12:00:10 → 12:00:10` → I16；未覆盖反例：`12:00:00 → 11:00:00` → **UPDATE 成功** | `spikes/m0/worker-dispatch-test.py:157-182` 只测相等；`trg_worker_heartbeat_renew` 使用 `OLD = NEW` 而非严格单调比较，`spec/kernel-schema.sql:504-511`。这违反 `spec/events/worker.heartbeat.json:13-16` 的 strictly greater 合同。 | ❌ FAIL（倒退心跳被接受） |
| P0-9K | 已提交用例：active → draining 且 terminal pointer → I17；未覆盖反例：直接 INSERT `status='draining', current_attempt_id=<terminal>` → **成功** | `spikes/m0/worker-dispatch-test.py:185-210` 仅顺序 UPDATE；trigger 仅覆盖 `OLD active → NEW draining`，`spec/kernel-schema.sql:517-527`，没有 INSERT/已-draining UPDATE 兜底。 | ❌ FAIL（状态构造旁路；且缺真并发） |
| P0-9L | `workers.last_heartbeat_at=NULL` → `NOT NULL constraint failed` | `spikes/m0/worker-dispatch-test.py:213-228`；`workers.last_heartbeat_at NOT NULL`，`spec/kernel-schema.sql:144`。约束有效，但用例是单连接顺序执行。 | 🟡 spike-deferred（缺真并发文件证据） |
| P0-9M | `workers.status='rogue'` → worker status CHECK 拒绝 | `spikes/m0/worker-dispatch-test.py:231-247`；status CHECK，`spec/kernel-schema.sql:141-143`。约束有效，但用例是单连接顺序执行。 | 🟡 spike-deferred（缺真并发文件证据） |
| P0-9N | `current_attempt_id='att-fake'` → FK 拒绝 | `spikes/m0/worker-dispatch-test.py:250-266`；`workers.current_attempt_id → task_attempts.attempt_id` FK，`spec/kernel-schema.sql:148`。用例有效但非真并发；文件头 `spikes/m0/worker-dispatch-test.py:14` 将拒绝点误写成 `trg_attempt_worker_exists`，实际是 FK。 | 🟡 spike-deferred（缺真并发文件证据） |
| P0-9O | 同 worker 已有 active attempt，再绕过 `claim_via_pool()` 直接 INSERT 第二个 active attempt → `UNIQUE task_attempts.worker_id` | `spikes/m0/worker-dispatch-test.py:269-316`；`idx_worker_one_active_attempt`，`spec/kernel-schema.sql:128-131`。约束有效但用例是单连接顺序执行。 | 🟡 spike-deferred（缺真并发文件证据） |

## §4 P0-M2 / P1 清单

### P0-M2

1. **实际 `context.snapshot` 事件不符合自己的 schema。** `trg_snapshot_event_emit` 在 `spec/kernel-schema.sql:476-497` 生成的 payload 没有 `task_id`、`attempt_id`，但两者由 `spec/events/context.snapshot.json:7-14` 要求。实际 payload 送入 `Draft202012Validator` 后得到两个 required-property errors。现有 event spike 在 `spikes/m0/context-event-schema-test.py:124-139` 只抽取 `snapshot_id`，并在 `:141-149` 验证手写 fixture，因此误绿。
2. **attempt/worker 双向一致性可被 UPDATE 绕过。** `task_attempts.worker_id` 没有 FK，两个 I15 triggers 都只有 INSERT（`spec/kernel-schema.sql:368-386`）；实测 pending attempt 可 UPDATE 到 ghost worker。另一个实测为 worker `w-other.current_attempt_id` 指向由 `w-owner` 持有的 attempt，FK 仍通过。`spec/worker-pool.md:56-57` 声称“same task”，但 schema 既不验证 owner，也没有 worker 上的 task_id。
3. **v0.8 fence 与 one-active 回归证据已失真。** `spikes/m0/claim-fence-test.py:93-117` 的 oversized/undersized INSERT 没有 worker_id，实际错误是 I15，不是 fence。移除 `trg_attempt_fence_insert` 后整个 spike 仍 exit 0；移除 `idx_attempts_one_active` 后也仍 exit 0。schema 本体仍有效，但“schema 不退化”的可执行证据不再可信。

### P1

1. **lineage 只验证 non-null/same-task，不验证层级。** 实测 L3 直接把 L1 作为 parent 成功；但规范要求 L2 → L3（`spec/context-layers.md:57-60`），schema trigger 只检查 L3 parent 非空（`spec/kernel-schema.sql:432-440`）。
2. **worker 事件只有 JSON Schema，没有闭环 emission evidence。** 三个 schema 均通过 meta-validation，`spec/worker-pool.md:173` 和 `:182-229` 声称会有三个 `worker.*` 事件；但 `register_worker/heartbeat_worker/drain_worker`（`spikes/m0/_helpers.py:347-400`）只更新表，实跑完整 lifecycle 后 `task_events WHERE event_type LIKE 'worker.%'` 为 0。
3. **“round-robin”没有实现或验证。** `dispatch_worker()` 固定按 heartbeat 降序取首个匹配项（`spikes/m0/_helpers.py:420-446`）；fairness case 自己输出 `1 unique`（`spikes/m0/worker-dispatch-test.py:319-342`），只能证明 capability filter，不能证明轮询公平性。
4. **cross-server 证据仍是同机线程。** `spec/worker-pool.md:234-241` 提出多 host/NFS/WAL checkpoint/fsync，但 Case 25 只是同进程 threads + 本地 tempfile，不能证明跨 host、网络文件系统或 checkpoint 语义。
5. **计数口径需固定。** fresh schema 为 14 tables（若包含 SQLite 内部 `sqlite_sequence`）/13 个项目表、15 triggers、39 indexes（含 autoindex）/27 个命名 indexes；事件 schema 实际为 11 个且全部 meta-valid。报告或 CI 应同时写清 internal/autoindex 口径，避免“14/39”误判漂移。

## §5 spike coverage matrix（声明覆盖 vs 实际覆盖）

| Gate | v0.9-A/B 声明 | 本次实际运行/反向验证 | 结果 |
|---|---|---|---|
| M0-9：context schema 落地 | context table + trigger/index，schema 可应用 | fresh DB 可应用；13 项目表/14 含 `sqlite_sequence`、15 triggers、39 含 autoindex | PASS（需固定计数口径） |
| M0-10：A-F 六条反例 | 六条均为真并发且被正确约束拒绝 | `context-budget-test.py` A-F 全通过；删除 I11/I14 后对应 case 转红 | PASS |
| M0-11：context.snapshot 事件 | schema 合法且 INSERT 事件闭环 | meta-schema PASS、3 rows emitted；但实际 payload 缺 `task_id/attempt_id`，不符合 schema | **FAIL** |
| M0-12：Context Protocol/conformance | 第二实现 + runtime-checkable | 合并 conformance 10/10，ContextDistiller/ContextBudget 均通过 | PASS |
| M0-13：worker registry/lifecycle schema | I15-I17 在所有写路径成立 | table/CHECK/FK 存在；active-null UPDATE、ghost-worker UPDATE、backward heartbeat、initial-draining 均成功 | **FAIL** |
| M0-14：P0-9G～O | 9 条可执行真并发反例均由指定约束拒绝 | 原 spike exit 0；仅 G 用 threads 且拒绝原因不对，H-O 为顺序；I/J/K 存在成功旁路 | **FAIL** |
| M0-15：WorkerPool Protocol/conformance | 第 10 个 Protocol 可被第二实现满足 | `conformance-second-impl.py` 输出 10/10，WorkerPool shape/基本调用通过 | PASS（仅 shape） |
| M0-16：worker event schemas/闭环 | 3 schemas 合法并由 lifecycle 发出 | 3 schemas meta-valid；没有 emission spike，实跑 lifecycle 得 0 个 worker event | **FAIL** |
| v0.8-1：fence 严格相等 | oversized/undersized 必须命中 fence trigger | suite 绿，但实际命中 I15；删除 fence trigger 后 suite 仍绿 | **FAIL** |
| v0.8-2：terminal task 不可重开 | helper 与 DB backstop 均可证明 | canonical `claim()` rowcount 拒绝；删除两个 terminal trigger 后 spike 仍绿，DB backstop 未被隔离验证 | **FAIL（coverage）** |
| v0.8-3：每 task 最多一个 active attempt | 真并发且 DB partial unique 是兜底 | suite 绿；删除 `idx_attempts_one_active` 后 claim race/Case 25 仍绿；独立直写探针才命中 index | **FAIL（coverage）** |
| v0.8-4：cancel/renew/submit/reaper races | 竞争只允许合法 winner | `cancel-race-test.py` 全通过 | PASS |
| v0.8-5：approval supersede 唯一性 | 顺序与并发 supersede 均安全 | `approval-supersede-test.py` 全通过 | PASS |
| v0.8-6：gateway 唯一执行链 | deny/lease/fence 顺序与副作用受控 | `conformance-second-impl.py` 行为断言通过 | PASS |
| v0.8-7：egress 安全 | allowlist/private/rebinding/proxy/redirect | `egress-httpx-actual.py` 全通过 | PASS |
| v0.8-8：policy direction | trust × capability，approval 不得扩权 | `policy-direction-test.py` 全通过 | PASS |

补充：本次实际运行的是 9 个非 `__init__.py`/`_helpers.py` spike，不是 7 个；9/9 原始进程 exit 0，但 matrix 仍因错误归因、旁路与 coverage 缺口判 FAIL。

## §6 最小修复清单（按优先级）

1. **封闭 I15 所有写路径。** 给 active/null 与 worker-exists 增加 `BEFORE UPDATE OF status, worker_id` 触发器；最好让 `task_attempts.worker_id` 成为真实 FK。Case 27 使用正确 task fence，并新增 pending→active/null、NULL→ghost-worker UPDATE 反例。
2. **把 I16 改为真正严格单调。** 固定可排序时间格式后拒绝 `NEW.last_heartbeat_at <= OLD.last_heartbeat_at`；新增 equal 与 backward 两条真并发反例。若只在 heartbeat 操作要求更新，应改成 `UPDATE OF last_heartbeat_at`，避免无关 active-worker UPDATE 被意外耦合。
3. **封闭 worker 状态与 ownership。** INSERT/UPDATE 都校验 draining/drained/stale 的 current attempt 状态；保证 `workers.current_attempt_id` 指向的 attempt.worker_id 等于自身；必要时给非 NULL current_attempt_id 加唯一性，防止多个 worker 指向同一 attempt。
4. **修复事件闭环。** `context.snapshot` 实际 payload 加 `task_id`、`attempt_id`，event spike 必须直接验证数据库读取到的 payload；为 dispatched/heartbeat/drained 增加实际 emission 与 schema validation，不能只 meta-validate schema 文件。
5. **重写 G～O 与 v0.8 schema hard-gate spikes。** 所有要求的反例都使用 file DB、独立连接和 barrier；G 直接并发 INSERT 或以其他方式绕开 helper rowcount，且断言 loser 是目标 unique constraint。fence 用例先注册合法 worker并传 worker_id，必须断言 `EQUAL task.fence_version`。加入 mutation cases：删除目标 trigger/index 后，对应 spike 必须转红。
6. **补精确 lineage trigger。** L2 parent 必须是 L1；L3 parent 必须是 L2；保留 same-task 与 FK 检查。
7. **把“fairness/cross-server”声明降到已有证据，或补证据。** round-robin 至少验证两个 eligible worker 都被轮换；I18 要么提供真实多进程/多 host 共享存储 spike，要么明确标记为部署前 spike-deferred，不能由本机 threads 代替。

## §7 v0.9.1 复审门槛

提交以下 executable evidence 后即可重新申请 PASS：

1. `spikes/m0/context-budget-test.py`：P0-9A～F 保持 file DB + 两独立连接 + barrier，全通过；删除各自目标约束时对应 case 必须失败。
2. `spikes/m0/worker-dispatch-test.py`：P0-9G～O 每条都有独立连接 + threading 反例，并精确断言目标 index/trigger/CHECK/FK；至少加入 active/null UPDATE、ghost-worker UPDATE、backward heartbeat、initial-draining/terminal pointer、owner mismatch。
3. 一个可执行 mutation spike（可并入现有文件）：逐个 DROP `idx_attempts_one_active`、`idx_worker_one_active_attempt`、I15/I16/I17 trigger 与 fence trigger；每次都证明相应正向 spike 转红，杜绝错误约束抢先和 helper 假绿。
4. `spikes/m0/context-event-schema-test.py`：直接把 `task_events.payload_json` 送入 `Draft202012Validator`，0 errors；worker 三类实际事件同样各有至少一个 emitted instance 且 0 errors。
5. `spikes/m0/claim-fence-test.py`：oversized/undersized 输入除 fence 外完全合法，错误消息明确命中 `trg_attempt_fence_insert`；移除 fence trigger 后测试必须失败。
6. fresh schema 统计明确输出：13 project tables / 14 including SQLite internal、15 triggers、27 named indexes / 39 including autoindexes；11 个 event schemas 全部 `check_schema()` 通过。
7. 全部 9 个现有 spike + 新增 mutation/event spike exit 0，`conformance-second-impl.py` 明确输出 `10/10`，且 §5 的 16 行全部为 PASS。

在以上证据齐备之前，即使原始 suite 仍显示全绿，也应继续维持 **CHANGES REQUIRED**。
