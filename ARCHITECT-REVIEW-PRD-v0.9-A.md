# PRD-v0.9-A（Context Layering）架构审验

> 审验日期：2026-08-30  
> 证据边界：只读取 `spec/` 与 `spikes/m0/`；未读取 PRD、ADR、回应文件、旧审核报告或 notes  
> 判断方法：以真实 SQLite、独立连接、`threading` 和 spike 实际输出为准

## §1 结论

**CHANGES REQUIRED。** 六个指定反例中，P0-9A、P0-9B、P0-9D、P0-9E、P0-9F 在本轮真实并发复跑中被拒绝，但 P0-9C 在 Case 10 同型的独立 `sqlite3.connect` 上因 `PRAGMA foreign_keys=0` 而成功写入，属于不变量真实失守；同时，仓库中的 P0-9B/D/E/F spike 仍是单连接顺序 case，不满足“每个反例真并发”的证据要求，conformance 虽打印“8 Protocols”但逐项实测只有 6/8，规定的事件 schema 命令也实际输出 `FAIL`。按给定判定标准，任一 P0 反例成功或 coverage matrix 出现 FAIL 即不能 PASS。

## §2 P0 清单与可复现反例

### P0-9A：charge 超过 context budget

- 可执行 spike：`spikes/m0/context-budget-test.py:85-96`；真并发基准：`spikes/m0/context-budget-test.py:211-279`。
- 拒绝断言：`assert_integrity_aborted(..., "I11", ...)`，见 `spikes/m0/context-budget-test.py:92`；并发断言 `len(oks) == 1 and len(rejs) == 1`，见 `spikes/m0/context-budget-test.py:276-278`。
- 强制器：`trg_snapshot_budget_check`，`spec/kernel-schema.sql:314-328`。
- 反例：`budget=100，已有 L2=40；两个独立连接同时 INSERT L2=60` → `一个 ACCEPTED；一个 IntegrityError: I11: working_set token_count exceeds task.context_budget_tokens`。
- 判定：**PASS**。指定的超预算 INSERT 在真实并发下被拒绝。

### P0-9B：L3 handoff 携带 untrusted_external

- 可执行 spike：`spikes/m0/context-budget-test.py:98-129`。
- 拒绝断言：`assert_integrity_aborted(..., "I14", ...)`，见 `spikes/m0/context-budget-test.py:122`；拒绝后 L3 行数为 0 的断言见 `:124-128`。
- 强制器：`trg_handoff_trust_label`，`spec/kernel-schema.sql:333-339`。
- 反例：`一个独立连接 INSERT trusted L3；另一个同时 INSERT trust_label=untrusted_external L3` → `trusted ACCEPTED；untrusted IntegrityError: I14: L3 handoff trust_label cannot be untrusted_external`。
- 判定：**🟡 spike-deferred**。本轮审验的线程反例被正确拒绝，但仓库 spike 的 P0-9B case 是顺序执行；没有带文件行号的 P0-9B 并发 case，不能标为完整 PASS。

### P0-9C：L1 引用不存在的 raw_blob

- 可执行 spike：`spikes/m0/context-budget-test.py:131-142`。
- 预期拒绝断言：`assert_integrity_aborted(..., "FOREIGN KEY", ...)`，见 `spikes/m0/context-budget-test.py:139-141`。
- 预期约束：未命名 FK `FOREIGN KEY (raw_blob_id) REFERENCES blobs(blob_id)`，`spec/kernel-schema.sql:252`；SQLite 只返回通用名称 `FOREIGN KEY constraint failed`。
- 反例：`两个独立 sqlite3.connect 同时写 L1；bad.raw_blob_id='missing'，good.raw_blob_id='b'` → `两个连接 PRAGMA foreign_keys 均为 0；bad ACCEPTED，good ACCEPTED`。
- 对照：在同一独立连接先执行 `PRAGMA foreign_keys=ON` → `bad IntegrityError: FOREIGN KEY constraint failed`。
- 根因：schema 中的 `PRAGMA foreign_keys=ON` 只影响执行 schema 的连接。Case 10 在 `spikes/m0/context-budget-test.py:254` 新建连接后没有重新启用 FK；生产连接池若同样处理，FK 全部静默失效。
- 判定：**FAIL**。指定反例在要求的真实独立连接路径中成功，v0.9-A 未真正修复 P0-9C。

### P0-9D：snapshot 缺 task_id

- 可执行 spike：`spikes/m0/context-budget-test.py:144-155`。
- 拒绝断言：`assert_integrity_aborted(..., "NOT NULL", ...)`，见 `spikes/m0/context-budget-test.py:154`。
- 强制器：未命名列约束 `context_snapshots.task_id TEXT NOT NULL`，`spec/kernel-schema.sql:235`。
- 反例：`一个独立连接 INSERT task_id=NULL；另一个同时写合法 L2` → `bad IntegrityError: NOT NULL constraint failed: context_snapshots.task_id；good ACCEPTED`。
- 判定：**🟡 spike-deferred**。实际并发复跑正确拒绝，但仓库内该 case 仍是单连接顺序测试，没有可执行并发 case 的行号证据。

### P0-9E：snapshot.token_count < 0

- 可执行 spike：`spikes/m0/context-budget-test.py:157-164`。
- 拒绝断言：`assert_integrity_aborted(..., "CHECK", ...)`，见 `spikes/m0/context-budget-test.py:163`。
- 强制器：未命名 `CHECK (token_count >= 0)`，`spec/kernel-schema.sql:240`。
- 反例：`一个独立连接 INSERT token_count=-1；另一个同时写 token_count=1` → `bad IntegrityError: CHECK constraint failed: token_count >= 0；good ACCEPTED`。
- 判定：**🟡 spike-deferred**。数据库约束有效，但仓库没有 P0-9E 的真并发 spike case。

### P0-9F：snapshot.level 越界

- 可执行 spike：`spikes/m0/context-budget-test.py:166-177`。
- 拒绝断言：`assert_integrity_aborted(..., "CHECK", ...)`，见 `spikes/m0/context-budget-test.py:176`。
- 强制器：未命名 `CHECK (level IN ('L0','L1','L2','L3'))`，`spec/kernel-schema.sql:237`。
- 反例：`一个独立连接 INSERT level='L9'；另一个同时写 level='L2'` → `bad IntegrityError: CHECK constraint failed: level IN ('L0','L1','L2','L3')；good ACCEPTED`。
- 判定：**🟡 spike-deferred**。数据库约束有效，但仓库没有 P0-9F 的真并发 spike case。

## §3 P0-M2 / P1 清单

### P0-M2-1：I11/I14 可由 UPDATE 绕过

两个 trigger 都只声明为 `BEFORE INSERT`，见 `spec/kernel-schema.sql:314-315`、`:333-334`，而 `context_snapshots` 没有 append-only、UPDATE 或 DELETE 防护。实测：

- `先 INSERT L2 token_count=90，再 UPDATE token_count=110` → **ACCEPTED**，budget=100 时总数变成 110。
- `先写合法 snapshot，再 UPDATE level='L3', trust_label='untrusted_external'` → **ACCEPTED**。

仓库没有对应 spike。判定：**FAIL，P0-M2**。

### P1-1：4 层转换与 lineage 只写在规范中，schema 未强制

`spec/context-layers.md:72-76` 禁止 L0 直接进入 L2，并要求 L2/L3 转换规则；但 schema 允许所有 level 共用同一组 nullable 字段，`parent_snapshot_id` 也只引用 snapshot_id，没有绑定 parent 的 task/attempt/level。实测：

- `L2，parent_snapshot_id=NULL，raw_blob_id=NULL，distilled_blob_id=NULL` → **ACCEPTED**。
- `task2 的 L2 将 task1 的 L1 设为 parent` → **ACCEPTED**。

仓库无这两条反例 spike。判定：**🟡 spike-deferred / 约束缺失**。

### P1-2：ContextBudget 规范与实际 Protocol 漂移

`spec/context-layers.md:173-182` 的 `ContextBudget` 是 `remaining() + charge()`；实际 `spec/interfaces/context_distiller.py:91-105` 是 `remaining() + total()`。当前 conformance 只适配后者，没有证明哪一个是 canonical。判定：**FAIL**。

### P1-3：context.snapshot 只有 JSON Schema，没有“每次 INSERT 都发事件”的执行证据

`spec/events/context.snapshot.json:5` 声称每次 `context_snapshots` INSERT 都发事件，但 canonical schema 只有五个与 context event 无关的 trigger，`spikes/m0/` 也没有 snapshot INSERT → `task_events(event_type='context.snapshot')` 的测试。规定命令对 `{}` 做实例验证，实际输出 `FAIL`；这是因为 `{}` 正确违反六个 required 字段，不是 schema 元验证。补充实测为：meta-schema PASS、合法实例 PASS、空实例 REJECTED。判定：**🟡 spike-deferred**。

### P1-4：“8 Protocols”输出是硬编码结论，逐项检查只有 6/8

`spikes/m0/conformance-second-impl.py:344-361` 没有对 `ToolProvider`、`ArtifactStore` 做 `isinstance`/assert；其中 `ObservableProvider` 缺 `capability()`，`ObservableStore` 缺 `get/stat/delete()`。逐项实测：

```text
ExecutionDriver=True, WorkflowPack=True, ToolProvider=False,
PolicyDecisionPoint=True, ArtifactStore=False, EventSink=True,
ContextDistiller=True, ContextBudget=True  => 6/8
```

若把 `ToolInvocationGateway` 也计入，结果是 7/9，而不是 8/8。判定：**FAIL**。

## §4 Spike coverage matrix

说明：允许读取的文件中没有出现 `M0-9`～`M0-12` 字面定义，所以下表严格按用户给出的具体执行路径映射，不读取 PRD 补义。

| Matrix row | v0.9-A 声明/执行路径映射 | 本轮实际跑过的 spike/命令 | 结果 |
|---|---|---|---:|
| M0-9 | schema 可应用；context_snapshots + I11/I14/FK/NOT NULL/CHECK 落地 | `sqlite3 :memory: < spec/kernel-schema.sql` exit 0；六条线程反例；UPDATE 绕过测试 | **FAIL**：P0-9C 在新连接 FK=0 时成功；I11/I14 可被 UPDATE 绕过 |
| M0-10 | 六个 Context Layering 反例均有 executable evidence，且真并发 | `context-budget-test.py` exit 0；Case 10 真并发；审验端逐项 threading 复跑 | **FAIL**：仓库只有 A 的并发 case；B/D/E/F 无并发 spike；C 真并发反例成功 |
| M0-11 | 输出并实际证明“8 Protocols satisfy runtime_checkable” | `conformance-second-impl.py` exit 0 并打印目标字符串；随后逐项 `isinstance` | **FAIL**：实际 6/8；`ToolProvider=False`、`ArtifactStore=False` |
| M0-12 | `context.snapshot` event schema 可验证且事件可观测 | 规定的一行命令输出 `FAIL`；另跑 meta-schema/合法实例/空实例；搜索 schema/spike 的事件写入 | **FAIL**：命令验证对象错误；无 INSERT → event emission spike |

### v0.8 八条硬门槛回归

| 硬门槛 | v0.9-A 声明 | 本轮实际跑过的 spike | 结果 |
|---|---|---|---:|
| H1 canonical schema | v0.9-A schema 不破坏旧 schema 应用 | schema apply exit 0；全部旧 spike 使用同一 schema | **PASS**（仅“可应用/旧测试不退化”含义） |
| H2 fence/cancel/retry/approval | 旧并发与状态不变量不退化 | `claim-fence-test.py`、`cancel-race-test.py`、`approval-supersede-test.py` 全部 exit 0 | **PASS** |
| H3 gateway + trust classification | gateway 六步链、policy direction 不退化 | `conformance-second-impl.py` gateway 行为用例、`policy-direction-test.py` exit 0 | **PASS**（不代表 8 Protocol conformance） |
| H4 egress 安全 | 离线、确定性的 egress 安全用例不退化 | `egress-httpx-actual.py` exit 0；unlisted/private/metadata/IPv6/rebinding/redirect 全拒绝 | **PASS** |
| H5 runtime capability evidence | capability profile 有真实 evidence artifact | `conformance-second-impl.py:188` 指向 `spikes/m0/evidence-trivial.json`；实际文件不存在 | **FAIL（🟡 spike-deferred）** |
| H6 image digest/signature/attestation | 有供应链可执行证据 | 允许目录内无对应 spec/spike | **FAIL（🟡 spike-deferred）** |
| H7 Backup E2E | 有隔离恢复可执行证据 | 允许目录内无 backup/restore E2E spike | **FAIL（🟡 spike-deferred）** |
| H8 Research vertical slice | 有质量、成本、恢复、安全的执行结果 | 允许目录内无 vertical-slice/eval spike | **FAIL（🟡 spike-deferred）** |

全量回归命令实际执行了 7 个非 helper spike，全部进程 exit 0；但按证据语义，打印绿灯不能覆盖上述 M0-9～M0-12 和 H5～H8 缺口。

## §5 最小修复清单

1. **统一连接工厂并强制 FK**：每个新 `sqlite3.connect` 后立即执行 `PRAGMA foreign_keys=ON`，再读取 `PRAGMA foreign_keys` 断言为 1；所有生产连接、线程连接和测试连接必须走同一路径。不要依赖 schema 文件曾在另一个连接执行过 PRAGMA。
2. **把 P0-9A～F 全部改成仓库内真并发 case**：每条使用共享 file DB、`threading.Barrier`、两个独立连接，并断言线程退出、连接 FK 状态、一个合法同行写入成功、非法写入按指定 trigger/constraint 被拒。
3. **将 context_snapshots 做成真正 append-only ledger**：最小方案是增加 `BEFORE UPDATE` 与 `BEFORE DELETE` 拒绝 trigger；若业务确需修改，则为 UPDATE 镜像 I11/I14，并补降低 task budget 后的再验证。推荐 append-only，语义更明确。
4. **补层级与 lineage 约束**：至少拒绝无 L1 parent 的 L2、无 L2 parent 的 L3、跨 task parent；若允许跨 attempt restore，必须显式限定 L3→新 attempt L2，而不是允许任意 parent。
5. **修正 8 Protocol conformance**：补满足完整 Protocol 的第二 `ToolProvider` 与 `ArtifactStore`；对八个对象逐项 assert，并由检查结果生成 `N/8` 输出，禁止硬编码“8”。同时调用关键 async 方法验证签名/行为。
6. **新增事件 schema spike**：用 `Draft202012Validator.check_schema()` 做元验证，合法 instance 应 PASS，缺字段/负 token/非法 level 应 REJECT；如果“每次 INSERT 发事件”是契约，再增加真实 INSERT 后查询 `task_events` 的集成断言。
7. **消除 ContextBudget 双规范**：在 `context-layers.md` 与 `context_distiller.py` 中只保留同一方法集合，再由 conformance 覆盖 canonical 形状。
8. **补齐旧硬门槛证据或降级声明**：创建实际存在的 capability evidence；H6/H7/H8 没有 executable spike 前保持 🟡，不得算 PASS。

## §6 复审门槛

v0.9.1 提交以下 executable evidence 即可重新申请 PASS：

1. `spikes/m0/context-budget-test.py` 中 P0-9A～F 各有独立的 `threading` case；每条都使用两个新连接并首先断言 `PRAGMA foreign_keys == 1`。
2. P0-9C 的缺失 `raw_blob_id` 在 Case 10 同型连接下稳定得到 `IntegrityError: FOREIGN KEY constraint failed`，数据库中 bad row 数为 0。
3. 新增 append-only 或 UPDATE 防护 spike：超预算 UPDATE、L3→untrusted UPDATE、DELETE 均被命名 trigger 拒绝。
4. 新增 lineage spike：L0→L2、无 parent L2/L3、跨 task parent 均拒绝；合法 L0→L1→L2→L3 与明确的 L3→新 attempt L2 恢复路径通过。
5. `conformance-second-impl.py` 逐项验证八个主 Protocol，实测为 8/8；不得只打印字符串。`ToolProvider`、`ArtifactStore` 必须分别通过 runtime check 和行为调用。
6. 新增 `spikes/m0/context-event-schema-test.py`：meta-schema、合法/非法 instance 与 snapshot event emission 全部有断言；规定验证命令不再以 `{}` 当合法样例。
7. 全量命令 `for f in spikes/m0/*.py ...` 零失败，且 v0.8 旧 spike 输出保持全绿。
8. §4 matrix 的 M0-9/M0-10/M0-11/M0-12 与 H1～H8 全部具有当前仓库内可执行证据并标为 PASS；没有 spike 的项目继续标 🟡，不能通过本门槛。

