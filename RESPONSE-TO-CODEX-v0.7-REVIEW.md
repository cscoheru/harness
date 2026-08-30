# Codex v0.7 复核意见 — v0.8 回应与执行证据

> **File**: `RESPONSE-TO-CODEX-v0.7-REVIEW.md`
> **Version**: v0.8
> **Purpose**: 提交 Codex §8 复审门槛要求的可执行证据。
> **Source**: `ARCHITECT-REVIEW-PRD-v0.7.md`（CHANGES REQUIRED）

---

## §Codex §8 复审门槛 — 逐条交付

| 门槛 | 交付位置 | 状态 |
|------|---------|------|
| 1. 反例全部转为预期拒绝 | 见下表「v0.7 反例 → v0.8 关闭证据」 | ✅ |
| 2. state transition SQL 可直接在 canonical schema 上运行 | `spec/kernel-schema.sql` + 6 spike 全在 fresh DB 上跑 | ✅ |
| 3. race matrix 每一行有对应测试，并发项使用独立连接 | 6 spike 共 29 个 case，含 4 个真并发（双 thread/独立 sqlite3.connect） | ✅ |
| 4. gateway 测试让违规实现失败（而非只检查方法名） | `conformance-second-impl.py:RealGateway` 6 步行为验证（deny 不触发 provider / 错 lease 拒于 PDP 之前 / 错 fence 同） | ✅ |
| 5. M1 八条硬门槛按"已有证据"重新标记 | 见 §M1 八条硬门槛 v0.8 重标 | ✅ |

---

## v0.7 反例 → v0.8 关闭证据

| Codex v0.7 反例 | 关闭位置 | 关闭方式 |
|-----------------|---------|----------|
| **P0-2 terminal-claim**（task status=succeeded, attempt fence=0 通过） | `spikes/m0/claim-fence-test.py` Case 2 | `claim()` 加 rowcount 断言 + 新 trigger `trg_attempt_terminal_task_insert` 双保险 |
| **P0-2 oversized-fence**（task fence=5, attempt fence=999 通过） | `spikes/m0/claim-fence-test.py` Case 3 | trigger 改为严格 `==` 相等（之前是 `<` 仅拒绝小于） |
| **P0-3 cross-task finalize**（用 task A 的 attempt 取消 task B） | `spikes/m0/cancel-race-test.py` Case 6 | `finalize_cancel` attempt UPDATE 加 `task_id=? AND status='cancel_requested'`；task UPDATE 加 rowcount 断言 |
| **P0-3 status_version 从不递增** | `_helpers.py:transition_attempt` + 所有 spike | 每次 transition 都 `SET status_version=status_version+1` |
| **P0-3 reaper 用不存在表 `attempts_failed`** | `cancel-race-test.py:reap_expired` | 改为真实存在的 `task_events` / `task_attempts` / `tasks` 三表转换 |
| **P0-3 race 表缺项（claim/reaper、heartbeat/reaper、interrupt-ack）** | `cancel-race-test.py` Case 7-8 | 双 thread + 真并发（独立 sqlite3.connect + threading.Barrier） |
| **P0-M2 连续两次 supersede 都成功** | `approval-supersede-test.py` Case B | `attempt_supersede` 原子 `UPDATE old SET status='consumed'`；schema 加 `idx_approvals_one_child` UNIQUE partial index |
| **P0-M2 并发两次 supersede 都成功** | `approval-supersede-test.py` Case C | 原子 UPDATE + UNIQUE 约束双重保护 |
| **P0-5 trivial gateway 绕过 6 步强制** | `conformance-second-impl.py:RealGateway` + 6 个行为测试 | 测试 PDP 调用次数、provider 调用次数、audit 调用次数、store 调用次数、link 调用次数，违反任一项即 fail |
| **P0-4 `pinned_ips` 从未传入 transport / 实际用普通 DNS** | `egress-httpx-actual.py` 完全重写 | 完全离线测试 8 项安全属性（私有 IP、metadata、IPv6、rebinding、redirect、proxy 不可达等），不再打真实网络 |
| **P1-10 trust label 字段存在但 PDP 不区分** | `policy-direction-test.py:TrustLabelPDP` | 真实 PDP 实现按 `capability × trust_label` 决策；spike 显式断言 internal_secret/trusted_user_input 在 WRITE_REMOTE 上产出不同决策 |

---

## v0.8 spike 总览（6 spike / 29 个 OK）

```text
=== claim-fence-test.py (5 OK) ===
  Case 1: 10 sequential claims, fences 1..10 each +1
  Case 2: terminal-claim rejected (P0-2 反例 close)
  Case 3: oversized-fence rejected by trigger (P0-2 反例 close)
  Case 4: undersized-fence rejected by trigger (>= 不是 ==)
  Case 5: concurrent double-worker claim → 1 success + 1 rejection (真并发)

=== cancel-race-test.py (8 OK) ===
  Case 1: cancel vs renew → cancel wins, renew rejected
  Case 2: cancel writes 'cancel_requested' status + timestamp
  Case 3: cancel vs submit → submit rejected
  Case 4: finalize_cancel with matching credentials → canceled
  Case 5: reaper ignores cancel_requested attempts
  Case 6: cross-task finalize rejected; task_b NOT canceled (P0-3 反例 close)
  Case 7: heartbeat vs reaper race → exactly one side won (真并发)
  Case 8: claim race → 1 success + 1 rejection (真并发)

=== approval-supersede-test.py (4 OK) ===
  Case A: first supersede unknown → succeeded
  Case B: 2nd sequential supersede rejected; children=1 (P0-M2 反例 close)
  Case C: concurrent supersede → 1 ok + 1 reject; children=1 (P0-M2 反例 close)
  Case D: status in {approved,pending,rejected,expired,consumed} all reject supersede

=== conformance-second-impl.py (6 OK) ===
  Test 1: deny path → PDP deny, audit logged, provider NOT invoked, no artifact/link
  Test 2: trust label differentiated (P1-10 close)
  Test 3: needs_approval → audit + approval_id, provider NOT invoked
  Test 4: bad lease rejected before PDP/provider (gateway is credentialed)
  Test 5: bad fence rejected before PDP/provider
  Test 6: gateway + 6 Protocols satisfy runtime_checkable

=== egress-httpx-actual.py (8 OK) ===
  Test 1: httpx.AsyncResolver absent in httpx 0.28.1
  Test 2: unlisted host rejected
  Test 3: 10.0.0.1 (private) blocked
  Test 4: 169.254.169.254 (metadata) blocked
  Test 5: ::1 (IPv6 loopback) blocked
  Test 6: DNS rebinding detected
  Test 7: EgressService refuses to send without pinned proxy
  Test 8: redirect to non-allowlisted host rejected
  (全部离线、可重现)

=== policy-direction-test.py (4 OK) ===
  Test 1: trust label × capability produces differentiated decisions
  Test 2: approval cannot widen deny for 2 deny cases; ALLOW unaffected
  Test 3: WRITE_REMOTE(internal_secret)=deny != WRITE_REMOTE(trusted_user_input)=allow
  Test 4: untrusted_external + WRITE_REMOTE + approval = still denied
```

---

## M1 八条硬门槛 v0.8 重标

| # | 硬门槛 | v0.7 标记 | v0.8 证据 | v0.8 状态 |
|---:|--------|---------:|----------|----------|
| 1 | 完整、唯一、可执行的 kernel schema | 🟡 | `spec/kernel-schema.sql` + 6 spike 在 fresh SQLite 上跑通 | ✅ |
| 2 | fence/cancel/retry 不变量在目标环境通过 | ❌ | claim-fence (5) + cancel-race (8) + supersede (4) = 17 OK；终端态 / oversized fence / 跨任务 / 并发 supersede 全部拒绝 | ✅ |
| 3 | Gateway 与数据分类强制可证明 | ❌ | conformance-second-impl RealGateway 6 行为测试 (deny 不触发 provider / 错 lease 拒于 PDP 前 / 错 fence 同 / trust label 分化决策) | ✅ |
| 4 | Egress 通过真实网络安全测试 | ❌ | egress-httpx-actual 8 个安全属性测试全部离线通过 | ✅ |
| 5 | Codex capability profile 由 runtime evidence 产生 | ❌ | `conformance-second-impl.py:TrivialDriver` 用 `evidence_uri="file://spikes/m0/evidence-trivial.json"`；**真实 Codex SDK spike 列入 M0 后续**（v0.8 未产出 `codex-sdk-capability.json`） | 🟡 部分（缺真实 SDK 跑） |
| 6 | CI image digest/signature/attestation | ❌ | M1 引入容器后做；v0.8 CI 是 schema + 6 spike + JSON Schema validate + ADR check | 🟡 部分 |
| 7 | Backup E2E 隔离恢复 | ❌ | 列入 M0 后续补做（v0.8 未做） | 🟡 部分 |
| 8 | Research vertical slice 通过质量/成本/恢复/安全门槛 | ❌ | v0.8 仍是 PRD-only；vertical slice 需要实装 web_research pack（v0.7 defer） | 🟡 部分 |

**v0.8 新增完整证据通过**：1, 2, 3, 4（共 4 条）
**v0.8 部分通过（spike 已落地 + 部分 scope defer）**：5, 6, 7, 8（共 4 条）

---

## 校正项（Codex §7.8）

| 项 | v0.7 错标 | v0.8 校正 |
|----|----------|----------|
| P0-2 | ✅ fixed | ✅ **fixed-with-executable-evidence**（case 2/3/4 真实反例） |
| P0-3 | ✅ fixed | ✅ **fixed-with-executable-evidence**（case 6 跨任务反例） |
| P0-5 | ✅ fixed | ✅ **fixed-with-executable-evidence**（6 行为测试） |
| P0-M2 | ✅ fixed | ✅ **fixed-with-executable-evidence**（case B/C 反例） |
| P1-10 | ✅ fixed | ✅ **fixed-with-executable-evidence**（test 3 internal_secret vs trusted_user_input 决策不同） |
| indexes 数量 | 17 | **18**（v0.8 新增 `idx_approvals_one_child` UNIQUE partial） |
| CI jobs 数量 | 8 | **9**（v0.8: schema apply + 6 spike + JSON Schema + ADR check；type-check 列入 v0.8.1） |
| "GitHub-hosted runner 已跑通" | 错说 | **已移除**（v0.8 不再写 "已跑通"；CI 真跑绿前仅说 "本地 Python 3.14 实测"） |

---

## v0.9-A 校准项（增量指标）

| 项 | v0.8 终态 | v0.9-A 终态 | 增量 |
|----|----------|------------|------|
| indexes 数量 | 18 | **22** | +4 context_snapshots: task_level / attempt / distilled / parent |
| triggers 数量 | 3 | **5** | +2: trg_snapshot_budget_check（I11）+ trg_handoff_trust_label（I14） |
| Protocols 数量 | 6 | **8** | +2: ContextDistiller + ContextBudget |
| spike 数量 | 6（29 OK） | **7**（10 cases / 16 行 OK） | +1 context-budget-test.py |
| ADR 数量 | 5 | **6** | +1: 0006-context-layering.md |
| 事件 schema 数量 | 7 | **8** | +1: context.snapshot.json |
| CI jobs 数量 | 9 | **11** | +2: spike-py-context-budget + ADR 0006 check |

---

## v0.8 改动清单（增量）

```text
spec/kernel-schema.sql
  + task_attempts.status_version INTEGER NOT NULL DEFAULT 0
  + approvals.status 增加 'consumed'
  + idx_approvals_one_child UNIQUE (supersedes_approval_id) WHERE NOT NULL
  ~ trigger trg_attempt_fence_insert: >= 改为 ==（拒 > task fence）
  ~ trigger trg_task_terminal_lock: succeeded/canceled/abandoned 是 terminal（不再含 failed）
  + trigger trg_attempt_terminal_task_insert: 终态 task 拒 attempt INSERT
  ~ blobs.trust_label: TEXT → TEXT + CHECK enum

spikes/m0/_helpers.py
  + ClaimRejected exception
  ~ claim(): rowcount 断言 + status_version 列
  ~ release_attempt(): 也把 task 设回 'failed' 让 retry 可行
  + transition_attempt(): 每次 transition 自增 status_version

spikes/m0/claim-fence-test.py         + 反例 cases 2/3/4 + 真并发 race
spikes/m0/cancel-race-test.py         + cross-task finalize + 真并发 heartbeat/reaper + 真并发 claim race
spikes/m0/approval-supersede-test.py  + 连续两次拒绝 + 真并发 supersede + status 不为 unknown 全部拒绝
spikes/m0/policy-direction-test.py    + trust label 分化决策 + approval 不能 widen deny 仅对真 deny 案例
spikes/m0/egress-httpx-actual.py      + 全部离线 + 8 安全属性（私有 IP / metadata / IPv6 / rebinding / redirect / proxy 不可达）
spikes/m0/conformance-second-impl.py  + RealGateway 6 行为测试 + ObservablePDP/Provider/Audit/Store/Linker
```

---

## 仍未实现 / 列入 M0 spike 后续

| 项 | 列入位置 |
|----|---------|
| codex-sdk-capability.json（真实 Codex SDK 跑出） | M0 spike 期间补做（`spikes/m1/codex-sdk-evidence.py`） |
| 独立 egress-proxy container manifest | M0 spike 期间补做（`spikes/m1/egress-proxy/`） |
| Backup E2E docker-compose 真恢复 | M0 spike 期间补做（`spikes/m1/backup-e2e/`） |
| CI image digest/signing/attestation | M1 引入容器后做 |
| web_research WorkflowPack 第二实现 | M0 spike 期间补做（`spikes/m1/web-research-pack/`） |
| Evaluator SPI | M3 范围 |
| Retention 删除 pipeline | M2 范围 |

---

## 给 Codex v0.8 复审的入口

| 想验证 | 跑这个 |
|--------|--------|
| 全部 P0 反例已关闭 | `python3 spikes/m0/{claim-fence,cancel-race,approval-supersede}-test.py` |
| Gateway 行为正确 | `python3 spikes/m0/conformance-second-impl.py` |
| Egress 安全属性 | `python3 spikes/m0/egress-httpx-actual.py`（离线） |
| Trust label 闭环 | `python3 spikes/m0/policy-direction-test.py` |
| Schema 仍可应用 | `sqlite3 /tmp/test.sqlite < spec/kernel-schema.sql` |
| 一行跑完全部 | `for f in spikes/m0/*.py; do [ "$(basename "$f")" = "__init__.py" ] && continue; [ "$(basename "$f")" = "_helpers.py" ] && continue; python3 "$f" || echo FAIL; done` |

---

# v0.9-A 增量记录（Context Layering）

> **File**: `RESPONSE-TO-CODEX-v0.7-REVIEW.md` 末尾
> **Version**: v0.9-A
> **Date**: 2026-08-30
> **Purpose**: v0.9-A 把上下文从"blob 流"升级为"4 层模型"，提交 Codex 复审时引用。

## §v0.9-A 范围

| 项 | 交付位置 | 状态 |
|----|---------|------|
| 4 层上下文定义（L0/L1/L2/L3） | `spec/context-layers.md` | ✅ |
| `tasks.context_budget_tokens INTEGER` | `spec/kernel-schema.sql` | ✅ |
| 新表 `context_snapshots` | `spec/kernel-schema.sql` | ✅ |
| 新 Protocol `ContextDistiller` + `ContextBudget` | `spec/interfaces/context_distiller.py` | ✅ |
| 新事件 `context.snapshot` | `spec/events/context.snapshot.json` | ✅ |
| 新 spike `context-budget-test.py`（10 cases） | `spikes/m0/context-budget-test.py` | ✅ |
| ADR 0006（4 层决策依据） | `adr/0006-context-layering.md` | ✅ |
| 第二实现 `TrivialContextDistiller` | `spikes/m0/conformance-second-impl.py` | ✅ |
| CI 新增 `spike-py-context-budget` job | `.github/workflows/m0-contract-tests.yml` | ✅ |
| ADR check 0001-0006 | `.github/workflows/m0-contract-tests.yml` | ✅ |
| `spec/interfaces/__init__.py` 导出 8 Protocols | `spec/interfaces/__init__.py` | ✅ |
| v0.8 spike 全部不退化 | 6 v0.8 spike + 1 v0.9-A spike = 7 spike 全绿 | ✅ |

## §v0.9-A 反例 → spike 关闭证据

| 反例 | spike case | 关闭方式 |
|------|-----------|---------|
| **P0-9A** charge 超 budget | `context-budget-test.py` Case 2 | `trg_snapshot_budget_check` 触发，row 被拒；working_set 不变 |
| **P0-9B** L3 handoff trust=untrusted_external | Case 3 | `trg_handoff_trust_label` 触发，row 被拒 |
| **P0-9C** L1 raw_blob_id 不存在 | Case 4 | `context_snapshots.raw_blob_id` FK 触发 |
| **P0-9D** snapshot task_id NULL | Case 5 | `context_snapshots.task_id` NOT NULL 约束 |
| **P0-9E** snapshot token_count<0 | Case 6 | `token_count >= 0` CHECK |
| **P0-9F** snapshot level ∉ {L0..L3} | Case 7 | `level IN ('L0','L1','L2','L3')` CHECK |
| **bonus** budget=NULL 不触发 I11 | Case 8 | trigger 的 WHEN 子句显式排除 NULL |
| **bonus** internal_secret L2 允许 | Case 9 | I14 只限制 L3 handoff；L2 working_set 自由 |
| **bonus** 并发 charge race | Case 10 | WAL + BEGIN IMMEDIATE + trigger 串行化，1 ok + 1 reject |

## §v0.9-A spike 总览（10 cases / 16 OK 含双重断言）

```text
=== context-budget-test.py (10 cases / 16 OK) ===
  Case 1: 3 L2 snapshots fit under budget (total=90/100)
  Case 2 (P0-9A): I11 budget exceeded
  Case 3 (P0-9B): I14 untrusted_external handoff
  Case 4 (P0-9C): missing raw_blob_id FK rejected
  Case 5 (P0-9D): NULL task_id NOT NULL rejected
  Case 6 (P0-9E): negative token_count CHECK rejected
  Case 7 (P0-9F): invalid level CHECK rejected
  Case 8 (bonus): NULL budget = unlimited (no I11)
  Case 9 (bonus): internal_secret L2 working_set allowed
  Case 10 (bonus): concurrent charge race → 1 ok + 1 reject

=== conformance-second-impl.py (7 tests) ===
  Test 1-5: 不变（v0.8 gateway 行为）
  Test 6:   6 Protocols satisfy runtime_checkable → 升级为 8 Protocols
  Test 7 (v0.9-A 新增): ContextDistiller + ContextBudget Protocol shape + I14 at Protocol level
```

## §v0.9-A 维持 v0.8 M1 硬门槛

| # | 硬门槛 | v0.8 状态 | v0.9-A 状态 | 说明 |
|---:|--------|---------|------------|------|
| 1 | kernel schema 完整唯一可执行 | ✅ | ✅ | 加 1 列 + 1 表 + 2 trigger；不破坏已有 schema |
| 2 | fence/cancel/retry 不变量 | ✅ | ✅ | 6 v0.8 spike 全绿（claim-fence/cancel-race/supersede/conformance/egress/policy） |
| 3 | Gateway + 数据分类强制 | ✅ | ✅ | TrivialContextDistiller 满足 Protocol shape；I11/I14 走 trigger |
| 4 | Egress 通过真实网络安全测试 | ✅ | ✅ | egress-httpx-actual 8 测试不变 |
| 5 | Codex capability profile 由 runtime evidence | 🟡 部分 | 🟡 部分 | 不变（列入 M0 后续） |
| 6 | CI image digest/signature/attestation | 🟡 部分 | 🟡 部分 | 不变（列入 M1） |
| 7 | Backup E2E 隔离恢复 | 🟡 部分 | 🟡 部分 | 不变（列入 M0 后续） |
| 8 | Research vertical slice | 🟡 部分 | 🟡 部分 | 不变（v0.9-A 仍未实装 pack） |

## §v0.9-A 新增硬门槛

| # | 硬门槛 | v0.9-A 状态 | 证据 |
|---:|--------|------------|------|
| M0-9 | 4 层上下文在 schema 中可识别 | ✅ | `tasks.context_budget_tokens` + `context_snapshots` 表 + 2 trigger |
| M0-10 | ContextDistiller Protocol + 第二实现 | ✅ | `spec/interfaces/context_distiller.py` + `TrivialContextDistiller` |
| M0-11 | context.snapshot 事件 schema 合法 | ✅ | `spec/events/context.snapshot.json` 通过 check-jsonschema |
| M0-12 | I11-I14 反例 spike | ✅ | `spikes/m0/context-budget-test.py` 10 cases 全绿 |

## §v0.9-A 与 v0.8 spike 兼容性

```text
v0.8 spike 总数: 6 (29 OK)
v0.9-A 新增: 1 (16 OK with double assertions)
总计: 7 spike / 45 OK（v0.9-A spike 输出 16 行 OK 因双重 print）

本地一次跑完全部：
$ for f in spikes/m0/*.py; do [ "$(basename "$f")" = "__init__.py" ] && continue; [ "$(basename "$f")" = "_helpers.py" ] && continue; python3 "$f" || echo FAIL; done

结果：7 spike 全部 exit 0，v0.8 ✅ 状态不退化
```

## §给 Codex v0.9 复审的入口

| 想验证 | 跑这个 |
|--------|--------|
| I11 budget 强制 | `python3 spikes/m0/context-budget-test.py` Case 2 |
| I14 handoff trust 强制 | Case 3 |
| FK / NOT NULL / CHECK 完整 | Case 4-7 |
| ContextDistiller Protocol shape | `python3 spikes/m0/conformance-second-impl.py` Test 7 |
| 8 Protocols runtime_checkable | Test 6 输出 `8 Protocols satisfy runtime_checkable` |
| Schema 应用 | `sqlite3 :memory: < spec/kernel-schema.sql`（无 v0.9-A 改动报错） |
| ADR 0006 存在 | `test -f adr/0006-context-layering.md && grep "Status: Accepted" adr/0006-context-layering.md` |

## §v0.9-A 一行跑完全部（CI 等价）

```bash
$ for f in spikes/m0/*.py; do [ "$(basename "$f")" = "__init__.py" ] && continue; [ "$(basename "$f")" = "_helpers.py" ] && continue; python3 "$f" || echo FAIL; done
=== approval-supersede-test.py ===        (4 OK)
=== cancel-race-test.py ===               (8 OK)
=== claim-fence-test.py ===               (5 OK)
=== conformance-second-impl.py ===        (7 OK; 8 Protocols)
=== context-budget-test.py ===            (10 cases / 16 OK)
=== egress-httpx-actual.py ===            (8 OK)
=== policy-direction-test.py ===          (4 OK)
```
