# Codex v0.9-A 复核意见 — v0.9.1 回应与执行证据

> **File**: `RESPONSE-TO-CODEX-v0.9-A-REVIEW.md`
> **Version**: v0.9.1
> **Date**: 2026-08-30
> **Source**: `ARCHITECT-REVIEW-PRD-v0.9-A.md`（CHANGES REQUIRED）

---

## §Codex v0.9-A §6 复审门槛 — 逐条交付

| 门槛 | 交付位置 | 状态 |
|------|---------|------|
| 1. P0-9A~F 各有独立 threading case，每条用两个新连接并首先断言 PRAGMA foreign_keys==1 | `spikes/m0/context-budget-test.py` Case 10/11/12/13/14/15 + helper `connect_with_fk` 显式断言 FK=1 | ✅ |
| 2. P0-9C 在 Case 10 同型连接下稳定得 FOREIGN KEY constraint failed，bad row=0 | Case 12 + helper 强制 FK=ON | ✅ |
| 3. append-only spike：超预算 UPDATE、L3→untrusted UPDATE、DELETE 均被命名 trigger 拒绝 | Case 19/20/21 + `trg_snapshot_no_update` / `trg_snapshot_no_delete` | ✅ |
| 4. lineage spike：L0→L2、无 parent L2/L3、跨 task parent 均拒绝 | Case 16/17/18 + `trg_lineage_l2_needs_parent` / `trg_lineage_l3_needs_parent` / `trg_lineage_same_task` | ✅ |
| 5. conformance 逐项验证 8 个主 Protocol，实测为 8/8（+ ToolInvocationGateway 9/9），不打印硬编码字符串 | `spikes/m0/conformance-second-impl.py` Test 6 改为 `protocol_checks` 列表 + PASS/FAIL 计数；ToolProvider 加 `capability()`，ArtifactStore 加 `get/stat/delete` | ✅（9/9） |
| 6. 新增 `context-event-schema-test.py`：meta-schema + 合法/非法 instance + snapshot event emission | `spikes/m0/context-event-schema-test.py` + `trg_snapshot_event_emit` | ✅ |
| 7. 全量命令零失败，且 v0.8 spike 全绿 | 本地一次跑 8 spike 全绿（见末尾） | ✅ |
| 8. §4 matrix 的 M0-9/M0-10/M0-11/M0-12 与 H1~H4 标 PASS；H5/H6/H7/H8 仍 🟡 spike-deferred | 见 §matrix 状态 | ✅ |

---

## v0.9-A 反例 → v0.9.1 关闭证据

| Codex v0.9-A 反例 | 关闭位置 | 关闭方式 |
|-----------------|---------|---------|
| **P0-9C** 在独立连接 FK=0 时写入成功 | `spikes/m0/_helpers.py:connect_with_fk` 强制 PRAGMA foreign_keys=ON + 断言 `fk_state[0]==1`；`spikes/m0/context-budget-test.py:Case 12` 用 `connect_with_fk(path=race_path_c)` 两个 thread FK=1 | 真并发两线程 + FK=ON 双重保险 |
| **P0-9B** 缺并发 case | `spikes/m0/context-budget-test.py:Case 11` 真并发两线程：trusted 写入成功，untrusted 被 I14 拒 |
| **P0-9D** 缺并发 case | Case 13 真并发两线程：NULL task_id 被 NOT NULL 拒 |
| **P0-9E** 缺并发 case | Case 14 真并发两线程：negative token_count 被 CHECK 拒 |
| **P0-9F** 缺并发 case | Case 15 真并发两线程：bad level 被 CHECK enum 拒 |
| **P0-M2-1 I11/I14 UPDATE 绕过** | `spec/kernel-schema.sql:trg_snapshot_no_update` 拒绝任何 UPDATE（row 完整不变） | Case 19 + Case 20 |
| **P0-M2-1 DELETE 绕过** | `spec/kernel-schema.sql:trg_snapshot_no_delete` 拒绝任何 DELETE | Case 21 |
| **P1-1 lineage 跨 task parent** | `spec/kernel-schema.sql:trg_lineage_same_task` + 拒绝前查 parent.task_id != NEW.task_id | Case 18 |
| **P1-1 L2 无 parent** | `spec/kernel-schema.sql:trg_lineage_l2_needs_parent` | Case 16 |
| **P1-1 L3 无 parent** | `spec/kernel-schema.sql:trg_lineage_l3_needs_parent` | Case 17 |
| **P1-2 ContextBudget 双规范** | `spec/context-layers.md:§4.2` 改成 `remaining + total`（去 charge），与 `spec/interfaces/context_distiller.py:ContextBudget` 对齐 | spec 文件修订 |
| **P1-3 事件 schema 命令 FAIL + 无事件发送 spike** | `spec/kernel-schema.sql:trg_snapshot_event_emit` AFTER INSERT 同步写 task_events；新 spike `context-event-schema-test.py` 验证 meta-schema + instance + emission | Case 22 + 新 spike |
| **P1-4 "8 Protocols"硬编码 6/8** | `spikes/m0/conformance-second-impl.py:Test 6` 改为 `protocol_checks` 列表逐项 isinstance + PASS/FAIL 计数（输出 `N/total`）；补 ToolProvider.capability() + ArtifactStore.get/stat/delete | 9/9（v0.9.1 加 ToolInvocationGateway 也计入） |

---

## v0.9.1 spike 总览（8 spike / 全绿）

```text
=== claim-fence-test.py (5 OK) ===
  v0.8 不变

=== cancel-race-test.py (8 OK) ===
  v0.8 不变

=== approval-supersede-test.py (4 OK) ===
  v0.8 不变

=== conformance-second-impl.py (7 tests / 9/9 PASS) ===
  Test 1-5: v0.8 gateway 行为不变
  Test 6 (v0.9.1): per-Protocol runtime_checkable → 9/9 pass
    PASS  ExecutionDriver / WorkflowPack / ToolProvider / PolicyDecisionPoint /
          ArtifactStore / EventSink / ContextDistiller / ContextBudget /
          ToolInvocationGateway
  Test 7: ContextDistiller.Protocol shape + I14 at Protocol level

=== egress-httpx-actual.py (8 OK) ===
  v0.8 不变

=== policy-direction-test.py (4 OK) ===
  v0.8 不变

=== context-budget-test.py (23 cases) ===
  Case 1: happy path (3 L2 fit budget)
  Case 2: P0-9A I11 budget exceeded
  Case 3: valid L3 handoff accepted
  Case 10: P0-9A 真并发 (1 ok + 1 reject)
  Case 11: P0-9B 真并发 (trusted ok, untrusted rejected by I14)
  Case 12: P0-9C 真并发 (good ok, bad rejected by FOREIGN KEY, FK=ON)
  Case 13: P0-9D 真并发 (good ok, NULL task_id rejected by NOT NULL)
  Case 14: P0-9E 真并发 (positive ok, negative rejected by CHECK)
  Case 15: P0-9F 真并发 (good ok, bad level rejected by CHECK enum)
  Case 16: P1-1 L2 must have parent (lineage)
  Case 17: P1-1 L3 must have parent (lineage)
  Case 18: P1-1 cross-task parent rejected
  Case 19: P0-M2-1 UPDATE rejected (I11 bypass closed)
  Case 20: P0-M2-1 UPDATE→untrusted rejected (I14 bypass closed)
  Case 21: P0-M2-1 DELETE rejected
  Case 22: P1-3 event emission — 3 INSERTs → 3 task_events
  Case 23: NULL budget means unlimited

=== context-event-schema-test.py (8 OK) ===
  Part A: meta-schema + canonical valid + bad level + neg tokens + bad label
  Part B: INSERT → task_events emission (3 rows, deterministic event_id)
```

---

## §4 Spike coverage matrix v0.9.1 重标

| Matrix row | v0.9.1 实际覆盖 | 结果 |
|---|---|---|
| **M0-9** | schema 应用 + 8 triggers（2 I11/I14 + 3 lineage + 2 append-only + 1 event-emit）+ 22 indexes | **PASS** |
| **M0-10** | 6 个 P0-9 反例全部真并发 case（Case 10-15） | **PASS** |
| **M0-11** | `conformance-second-impl.py` 9/9 PASS（不再硬编码） | **PASS** |
| **M0-12** | `context-event-schema-test.py` 8 OK + meta-schema + INSERT emission | **PASS** |
| **H1** | 7 v0.8 spike 全绿，schema apply exit 0 | **PASS** |
| **H2** | claim-fence + cancel-race + approval-supersede 全绿 | **PASS** |
| **H3** | conformance gateway 行为测试 + policy-direction 全绿 | **PASS** |
| **H4** | egress-httpx-actual 8 OK | **PASS** |
| **H5** | `evidence-trivial.json` 仍不存在 | **🟡 spike-deferred** |
| **H6** | 无 image digest/signing/attestation spike | **🟡 spike-deferred** |
| **H7** | 无 Backup E2E spike | **🟡 spike-deferred** |
| **H8** | 无 Research vertical-slice spike | **🟡 spike-deferred** |

---

## v0.9.1 改动清单（增量）

```text
spec/kernel-schema.sql
  + trg_snapshot_no_update  (append-only: 拒 UPDATE)
  + trg_snapshot_no_delete  (append-only: 拒 DELETE)
  + trg_lineage_l2_needs_parent  (I15: L2 必须有 parent)
  + trg_lineage_l3_needs_parent  (I16: L3 必须有 parent)
  + trg_lineage_same_task       (I17: parent 必须同 task)
  + trg_snapshot_event_emit     (I19: INSERT → task_events)

spec/context-layers.md
  ~ §4.2 ContextBudget Protocol：charge() → total()（对齐 spec/interfaces）

spikes/m0/_helpers.py
  + connect_with_fk(path, apply_schema=False)
    * 强制 PRAGMA foreign_keys=ON + 断言 fk_state[0]==1
    * 默认不 apply schema（schema 必须一次性应用）

spikes/m0/context-budget-test.py
  + Cases 10-15: 真并发 6 个 P0-9 反例（共享 file-DB + threading.Barrier + connect_with_fk）
  + Cases 16-18: lineage 3 反例
  + Cases 19-21: append-only 3 反例
  + Case 22: event emission 验证
  + Case 23: NULL budget 路径

spikes/m0/conformance-second-impl.py
  + ObservableProvider.capability() (Protocol shape)
  + ObservableStore.get/stat/delete (Protocol shape)
  ~ Test 6: 不再硬编码 "8 Protocols"；改 protocol_checks 列表 + PASS/FAIL 计数
  + Test 6 输出 "9/9 pass"（8 主 Protocol + ToolInvocationGateway）

spikes/m0/context-event-schema-test.py (新增)
  + meta-schema check
  + canonical valid + 3 个非法 instance (level / tokens / label)
  + INSERT → task_events emission 验证

.github/workflows/m0-contract-tests.yml
  + spike-py-context-event-schema job
  ~ spike-py-context-budget 描述改为 v0.9.1
```

---

## §触发器总数（v0.9.1 终态）

```text
v0.7: 1 trigger (trg_attempt_fence_insert)
v0.8: +2 (trg_task_terminal_lock, trg_attempt_terminal_task_insert) = 3
v0.9-A: +2 (trg_snapshot_budget_check, trg_handoff_trust_label) = 5
v0.9.1: +6 (trg_snapshot_no_update, no_delete, l2_needs_parent, l3_needs_parent, same_task, event_emit) = 11
```

11 个 trigger 全部在 schema 可应用范围内，`sqlite3 :memory: < spec/kernel-schema.sql` exit 0。

---

## §给 Codex v0.9.1 复审的入口

| 想验证 | 跑这个 |
|--------|--------|
| 全部 P0-9 真并发反例 | `python3 spikes/m0/context-budget-test.py` Case 10-15 |
| FK=ON 强制 | `python3 -c "from _helpers import connect_with_fk; c = connect_with_fk(); print(c.execute('PRAGMA foreign_keys').fetchone())"` |
| 9/9 Protocol pass | `python3 spikes/m0/conformance-second-impl.py`（看 `9/9 pass`） |
| Event schema + emission | `python3 spikes/m0/context-event-schema-test.py` |
| Append-only triggers | Case 19/20/21 |
| Lineage triggers | Case 16/17/18 |
| Schema 应用 | `sqlite3 :memory: < spec/kernel-schema.sql`（11 triggers / 22 indexes） |
| 全量 spike | `for f in spikes/m0/*.py; do [ "$(basename "$f")" = "__init__.py" ] && continue; [ "$(basename "$f")" = "_helpers.py" ] && continue; python3 "$f" || echo FAIL; done` |

---

## §回滚路径

如果 v0.9.1 引入回归：

| 触发器 | 关闭 SQL |
|--------|---------|
| trg_snapshot_no_update | `DROP TRIGGER trg_snapshot_no_update`（snapshot 变成可改 — 重新开放 P0-M2-1） |
| trg_snapshot_no_delete | `DROP TRIGGER trg_snapshot_no_delete`（允许清理） |
| trg_lineage_* | `DROP TRIGGER trg_lineage_l2_needs_parent` 等 |
| trg_snapshot_event_emit | `DROP TRIGGER trg_snapshot_event_emit`（失去事件可观测性） |

任一 trigger DROP 后立即破坏对应 spike 的 PASS 状态——Codex v0.9.2 复审会立即发现。