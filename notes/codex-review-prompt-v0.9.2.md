# Codex v0.9.2 合并复审指令

> ⚠️ **SUPERSEDED — 2026-08-30**
> 本 prompt 在 Codex v0.9.2 复审返回 **CHANGES REQUIRED / 17/19 PASS** 后已被替代。
> 新权威 prompt: `notes/codex-review-prompt-v0.9.3.md`
> 修复映射: `RESPONSE-TO-CODEX-v0.9.2-REVIEW.md`
> 本文件保留作为历史记录。

> **File**: `notes/codex-review-prompt-v0.9.2.md`
> **Date**: 2026-08-30
> **Source**: `notes/codex-review-prompt-v0.9-merged.md` (SUPERSEDED)
> **Target**: Codex 对 v0.9.2 (Context Layering + Load Balancing + schema hard-gate closures) 做合并复审
> **Supersedes**: `notes/codex-review-prompt-v0.9-merged.md` (v0.9 合并复审 CHANGES REQUIRED)
>
> **背景**: Codex v0.9 合并复审返回 CHANGES REQUIRED（6 P0-M2 + 9 P0-9 失败 + 5 P1）。
> v0.9.2 修复了全部 14 项失败点，新增 3 spike（lineage-level / worker-events-emit / mutation）
> + 反向 DROP 因果链证据 + 实际 DB payload schema 验证。

---

## 主指令（可直接复制粘贴到 Codex）

```text
请按以下规则复审 PRD-v0.9.2 (v0.9-A/v0.9.1 + v0.9-B + v0.9.2 修复):

【范围限定（强约束）】
- 只读 spec/ 与 spikes/m0/ 目录
- 不要读 PRD-v0.9.md（除非明确指出要看哪一段）
- 不要读 adr/0006-context-layering.md / adr/0007-worker-pool.md（除非明确指出）
- 不要读 RESPONSE-TO-CODEX-v0.9-AB-REVIEW.md / RESPONSE-TO-CODEX-v0.9-MERGED-RESPONSE.md（避免 anchor bias）
- 不要读 ARCHITECT-REVIEW-PRD-v0.9-MERGED.md（v0.9 review，你这次是 v0.9.2 重审）
- 不要读 notes/v0.9-contemplations.md
（避免你的判断被 v0.9 review 话术影响）
- 复审只基于 spike 实际跑出的结果，不基于 PRD 承诺

【反例驱动（核心 — 涵盖 v0.9-A 6 + v0.9-B 9 + v0.9.2 新增 5）】
PRD-v0.9.2 共 20 个反例，逐一跑出对应反例：

v0.9-A（6 个，spec/context-layers.md）:
  - P0-9A: charge 超 budget 的 token 数 → I11 trigger BudgetExceeded
  - P0-9B: L3 handoff trust_label=untrusted_external → I14 trigger
  - P0-9C: L1 distilled_blob_id 引用不存在的 raw_blob → FK 约束
  - P0-9D: cross-attempt snapshot 缺 task_id → NOT NULL 约束
  - P0-9E: snapshot.token_count < 0 → CHECK 约束
  - P0-9F: snapshot.level 不在 {L0,L1,L2,L3} → CHECK 约束

v0.9-B 原始（9 个，spec/worker-pool.md）:
  - P0-9G: 双 worker 并发 dispatch 同一 task → idx_attempts_one_active 拒绝
  - P0-9H: 同 worker 同时持两个 active attempt → idx_worker_one_active_attempt 拒绝
  - P0-9I: active attempt worker_id NULL → trg_attempt_active_needs_worker 拒绝 (INSERT + UPDATE)
  - P0-9J: heartbeat 不推进 last_heartbeat_at → trg_worker_heartbeat_renew 拒绝 (strict monotonic)
  - P0-9K: drain 时 current_attempt_id 指向已 terminal 的 attempt → trg_worker_drain_pause 拒绝
  - P0-9L: last_heartbeat_at NULL → NOT NULL 约束
  - P0-9M: worker.status 不在 {active,draining,drained,stale} → CHECK 约束
  - P0-9N: workers.current_attempt_id 指向不存在的 attempt → FK 约束
  - P0-9O: dispatch 绕过 claim() 直接 INSERT attempt → partial unique index 仍 reject

v0.9.2 新增（5 个修复点）:
  - P0-M2-1 (I11/I14/append-only): context.snapshot 实际 payload 必须含 task_id + attempt_id 且通过 schema 验证
  - P0-M2-2 (双向 ownership): workers.current_attempt_id 指向的 attempt.worker_id 必须 == self.worker_id (INSERT + UPDATE)
  - P1-1 (lineage level): L2 parent 必须 L0/L1, L3 parent 必须 L2
  - P1-2 (worker events): register/heartbeat/drain 3 类事件必须实际 emit 且 payload 符合 schema
  - P1-3 (round-robin): dispatch_worker() 必须 capability-match 后 least-dispatched 优先 (不是 heartbeat 降序固定取首)

【evidence 要求】
- 每个 P 编号必须有可执行 spike 文件名 + 行号
- 必须指明哪个断言拒绝该反例（trigger 名 / CHECK 名 / FK 名 / partial unique index 名）
- 没有 spike 兜底的修复 = 🟡 spike-deferred，不要标 ✅
- 反例必须用真并发跑（独立 sqlite3.connect + threading.Barrier）— 每个 v0.9-B case 必备
- v0.9.2 新增：必须用 mutation-test.py 反向 DROP 证明 spike 的因果链
- 不要相信 PRD-v0.9.md 里写的"已实现"——你必须自己跑

【输出格式（强约束）】
§1 结论（PASS / CHANGES REQUIRED，1 段）
§2 v0.9-A P0 清单 (P0-9A..F) + 每条配一个可复现反例（input → 错输出）
§3 v0.9-B P0 清单 (P0-9G..O) + 每条配一个可复现反例 + 真并发文件证据
§4 P0-M2 / P1 清单 (P0-M2-1, P0-M2-2, P1-1, P1-2, P1-3) + 修复证据
§5 spike coverage matrix（v0.9.2 声明覆盖 vs 实际覆盖）  ← 关键
   行：M0-9 / M0-10 / M0-11 / M0-12 / M0-13 / M0-14 / M0-15 / M0-16
        + v0.8 八条硬门槛（schema 不退化）
        + v0.9.2 新增三条: M0-17 (lineage level) / M0-18 (worker events emit) / M0-19 (mutation evidence)
   列：v0.9.2 声明 / 你实际跑过的 spike / PASS 或 FAIL
§6 最小修复清单（如有，按优先级，不分阶段）
§7 复审门槛（v0.9.2 提交什么即可 PASS，明确列出 executable evidence）

【判断标准】
- PASS：所有 20 个反例都有可执行 spike + 反例被拒 + §5 matrix 全 PASS
- CHANGES REQUIRED：任一反例没有 spike 兜底，或反例成功，或 §5 有 FAIL

【具体执行路径】
1. cd 到 fish-harness 项目根
2. 跑 schema 应用（应输出 14 tables / 24 triggers / 39 indexes / 13 project 表 / 27 named indexes）:
   rm -f /tmp/harness-test.sqlite
   sqlite3 /tmp/harness-test.sqlite < spec/kernel-schema.sql
   sqlite3 /tmp/harness-test.sqlite "SELECT 'tables_project=' || count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
   sqlite3 /tmp/harness-test.sqlite "SELECT 'tables_total=' || count(*) FROM sqlite_master WHERE type='table';"
   sqlite3 /tmp/harness-test.sqlite "SELECT 'triggers=' || count(*) FROM sqlite_master WHERE type='trigger';"
   sqlite3 /tmp/harness-test.sqlite "SELECT 'indexes_named=' || count(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';"
   sqlite3 /tmp/harness-test.sqlite "SELECT 'indexes_total=' || count(*) FROM sqlite_master WHERE type='index';"
3. 跑 12 spike（每个 case 一行）:
   for f in spikes/m0/*.py; do
     [ "$(basename "$f")" = "__init__.py" ] && continue
     [ "$(basename "$f")" = "_helpers.py" ] && continue
     python3 "$f"
   done
   # 期望：12/12 exit 0
4. 跑 11 个 event schema 验证:
   for f in spec/events/*.json; do
     [ "$(basename "$f")" = ".gitkeep" ] && continue
     check-jsonschema --schemafile "$f"
   done
5. 跑 conformance 10/10:
   python3 spikes/m0/conformance-second-impl.py | grep "10 Protocols"
6. 跑 mutation-test.py 验证因果链:
   python3 spikes/m0/mutation-test.py
   # 期望：6 mutations all baseline PASS / DROP FAIL

【期望输出】
如果 v0.9.2 修复完整，你应能产出:
  - §1 结论 = PASS
  - §5 matrix 19/19 PASS (M0-9..M0-16 + M0-17..M0-19 + v0.8 8 条硬门槛 → 实际 16 行)
  - 11 event schema 全部 check-jsonschema 通过
  - 12 spike exit 0
  - 10/10 Protocol conformance
  - 6 reverse-DROP mutations 全部 baseline PASS / DROP FAIL
```

---

## v0.9.2 改动清单（背景参考）

### Schema 变更 (13 → 24 triggers)

```text
v0.9-B 终态:  15 triggers
v0.9.2 增量:
  + trg_attempt_active_needs_worker_insert  (P0-9I INSERT path)
  + trg_attempt_active_needs_worker_update  (P0-9I UPDATE bypass)
  + trg_attempt_worker_exists_insert         (P0-9I companion INSERT)
  + trg_attempt_worker_exists_update         (P0-9I companion UPDATE)
  + trg_worker_no_draining_insert            (P0-9K INSERT bypass)
  + trg_worker_no_reactivate                 (P0-9K reactivate)
  + trg_worker_ownership_insert              (P0-M2-2 bidirectional)
  + trg_worker_ownership_update              (P0-M2-2 UPDATE)
  + trg_worker_dispatched_event_emit         (P1-2 emission)
  + trg_worker_heartbeat_event_emit          (P1-2 emission)
  + trg_worker_drained_event_emit            (P1-2 emission)
  ~ trg_worker_heartbeat_renew: NEW.last_heartbeat_at <= OLD (P0-9J strict monotonic)
  ~ trg_lineage_l2_needs_parent: parent.level must be L0/L1 (P1-1)
  ~ trg_lineage_l3_needs_parent: parent.level must be L2 (P1-1)
  ~ trg_snapshot_event_emit: payload includes task_id + attempt_id (P0-M2-1)
终态: 24 triggers (15 → 24, +9 net after splits)
```

### Helper 变更

```text
spikes/m0/_helpers.py
  ~ dispatch_worker(): capability-match → least-dispatched (via harness_meta)
    (was: ORDER BY last_heartbeat_at DESC LIMIT 1)
    closes P1-3 round-robin fairness
```

### 新 Spike 文件 (3)

```text
spikes/m0/lineage-level-test.py        — 11 cases (P1-1)
spikes/m0/worker-events-emit-test.py   — 5 cases (P1-2)
spikes/m0/mutation-test.py             — 6 reverse-DROP mutations (P0-M2 因果链)
```

### Spike 重写 (2)

```text
spikes/m0/worker-dispatch-test.py      — 18 cases (was 11)
  + Case 25b: direct INSERT race (isolates idx_attempts_one_active)
  + Case 27a/b/c: I15 INSERT/UPDATE/ghost-worker bypass paths
  + Case 28a/b/c: equal/backward/concurrent-backward heartbeat
  + Case 29a/b/c: drain/INSERT-draining/reactivate I17 bypass paths
  + Case 34: 真并发 lifecycle → 3 worker.* events emitted + schema valid
  ~ 所有 16 cases use 真并发 (file-DB + threading.Barrier + independent sqlite3.connect)

spikes/m0/context-event-schema-test.py
  ~ Part B validates actual DB payload (not hand-written fixture) via Draft202012Validator
  + Part C: worker lifecycle → 3 valid worker.* events
  + Asserts task_id + attempt_id present in payload (P0-M2-1)

spikes/m0/claim-fence-test.py
  ~ Case 3: register valid worker first so fence trigger fires (not I15 NULL check)
```

### Worker Event Schema 修订 (3)

```text
spec/events/worker.dispatched.json
  ~ required=[worker_id, host, capabilities_json, status, dispatched_at]
    (was: task_id/worker_id — task_id NULL since workers are task-independent)
spec/events/worker.heartbeat.json
  ~ required=[worker_id, last_heartbeat_at, current_attempt_id]
spec/events/worker.drained.json
  ~ required=[worker_id, status, current_attempt_id, drained_at]
```

---

## 复审门槛 (§7 期望 Codex 输出)

如果 v0.9.2 修复完整且 spike evidence 真实，Codex 应输出:

```text
§1 结论：PASS
§2 v0.9-A P0 6 个 — 全 PASS，每个有独立 spike case
§3 v0.9-B P0 9 个 — 全 PASS，每个有真并发文件证据
§4 P0-M2 + P1 共 5 个 — 全 PASS，每个有对应 spike
§5 matrix 19/19 PASS:
     M0-9 (context schema)             PASS
     M0-10 (context A-F 真并发)         PASS
     M0-11 (snapshot 事件 payload)      PASS (含 task_id + attempt_id)
     M0-12 (Context Protocol)          PASS
     M0-13 (worker schema)             PASS (含 24 triggers / FK / 双向 ownership)
     M0-14 (worker P0-9G-O)            PASS (16 真并发 cases)
     M0-15 (WorkerPool Protocol)       PASS (10/10 conformance)
     M0-16 (worker event emit)         PASS (P1-2)
     M0-17 (lineage level P1-1)        PASS (11 cases)
     M0-18 (worker events P1-2)        PASS (5 cases)
     M0-19 (mutation evidence)         PASS (6 reverse-DROP)
     + v0.8 八条硬门槛 全 PASS (fence/terminal/one-active/cancel-renew/approval/egress/policy)
§6 最小修复清单: 空 (no new blockers)
§7 复审门槛: v0.9.2 已是 PASS 状态，无需新提交
```

如果在 §5 仍有 FAIL，按 FAIL 行号定位修复。

---

## 与 v0.9 prompt 的差异

| 项 | v0.9 (merged) | v0.9.2 (本文件) |
|---|---|---|
| Trigger 数 | 15 | 24 |
| Spike 数 | 9 | 12 (新增 3) |
| Worker-dispatch cases | 11 | 18 (新增 7 sub-cases) |
| 真并发 cases | 1 (Case 25 only) | 16 (every v0.9-B case) |
| Mutation evidence | ❌ 无 | ✅ mutation-test.py (6 reverse-DROP) |
| Payload schema validation | ❌ fixture-only | ✅ Draft202012Validator on actual DB |
| Schema counts in prompt | 14/15/39 | 13/14/24/27/39 (明确 internal/autoindex 口径) |
| Lineage level P1-1 | ❌ 未明确 | ✅ L2/L3 parent level 验证 |
| Round-robin P1-3 | ❌ 未明确 | ✅ least-dispatched via harness_meta |

---

## 历史版本

- `notes/codex-review-prompt-v0.9.md` (superseded by merged)
- `notes/codex-review-prompt-v0.9-merged.md` (superseded by v0.9.2, returned CHANGES REQUIRED)
- `notes/codex-review-prompt-v0.9.2.md` ← **当前权威**
