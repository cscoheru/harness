# Codex v0.9 合并复审指令（v0.9-A/v0.9.1 + v0.9-B）

> **File**: `notes/codex-review-prompt-v0.9-merged.md`
> **Date**: 2026-08-30
> **Source template**: `notes/codex-review-prompt-template.md`（v0.8 复用版）
> **Target**: Codex 对 PRD-v0.9（A + B 两段，Context Layering + Load Balancing）做合并复审
> **Supersedes**: `notes/codex-review-prompt-v0.9.md`（仅 v0.9-A；本文件覆盖 A+B 合并复审）
>
> ⚠️ **SUPERSEDED by v0.9.2**（2026-08-30）：本文档已被 `notes/codex-review-prompt-v0.9.2.md` 取代。Codex v0.9 合并复审结论 = CHANGES REQUIRED；v0.9.2 已修复全部 6 项 P0-M2 + 9 项 P0-9 失败 + 5 项 P1。请使用 v0.9.2 prompt 重新提交。

---

## 主指令（可直接复制粘贴到 Codex）

```text
请按以下规则复审 PRD-v0.9（v0.9-A/v0.9.1 + v0.9-B 合并复审）：

【范围限定（强约束）】
- 只读 spec/ 与 spikes/m0/ 目录
- 不要读 PRD-v0.9.md（除非明确指出要看哪一段）
- 不要读 adr/0006-context-layering.md 与 adr/0007-worker-pool.md（除非明确指出要看哪一段）
- 不要读 RESPONSE-TO-CODEX-v0.7-REVIEW.md / RESPONSE-TO-CODEX-v0.9-A-REVIEW.md（避免 anchor bias）
- 不要读 ARCHITECT-REVIEW-PRD-v0.7.md / ARCHITECT-REVIEW-PRD-v0.9-A.md
- 不要读 notes/v0.9-contemplations.md
（避免你的判断被 PRD 的话术影响）
- 复审只基于 spike 实际跑出的结果，不基于 PRD 承诺

【反例驱动（核心 — 两段共 15 个反例）】
PRD-v0.9 §6（v0.9-A） + §12（v0.9-B）共 15 个反例，逐一跑出对应反例：

v0.9-A（6 个，spec/context-layers.md）：
  - P0-9A: charge 超 budget 的 token 数 → I11 trigger BudgetExceeded
  - P0-9B: L3 handoff trust_label=untrusted_external → I14 trigger
  - P0-9C: L1 distilled_blob_id 引用不存在的 raw_blob → FK 约束
  - P0-9D: cross-attempt snapshot 缺 task_id → NOT NULL 约束
  - P0-9E: snapshot.token_count < 0 → CHECK 约束
  - P0-9F: snapshot.level 不在 {L0,L1,L2,L3} → CHECK 约束

v0.9-B（9 个，spec/worker-pool.md）：
  - P0-9G: 双 worker 并发 dispatch 同一 task → idx_attempts_one_active 拒绝
  - P0-9H: 同 worker 同时持两个 active attempt → idx_worker_one_active_attempt 拒绝
  - P0-9I: active attempt worker_id NULL → trg_attempt_active_needs_worker 拒绝
  - P0-9J: heartbeat 不推进 last_heartbeat_at → trg_worker_heartbeat_renew 拒绝
  - P0-9K: drain 时 current_attempt_id 指向已 terminal 的 attempt → trg_worker_drain_pause 拒绝
  - P0-9L: last_heartbeat_at NULL → NOT NULL 约束
  - P0-9M: worker.status 不在 {active,draining,drained,stale} → CHECK 约束
  - P0-9N: workers.current_attempt_id 指向不存在的 attempt → FK 约束
  - P0-9O: dispatch 绕过 claim() 直接 INSERT attempt → partial unique index 仍 reject

反例格式：<input/state> → <wrong output/crash>
反例成功（=违反不变量）= v0.9 未真正修复
反例被拒绝（=spike 抛异常/拒绝）= 真修复

【evidence 要求】
- 每个 P 编号必须有可执行 spike 文件名 + 行号
- 必须指明哪个断言拒绝该反例（trigger 名 / CHECK 名 / FK 名 / partial unique index 名）
- 没有 spike 兜底的修复 = 🟡 spike-deferred，不要标 ✅
- 反例必须用真并发跑（独立 sqlite3.connect + threading）— Case 10/25 是基准
- 不要相信 PRD-v0.9.md 里写的"已实现"——你必须自己跑

【输出格式（强约束）】
§1 结论（PASS / CHANGES REQUIRED，1 段）
§2 v0.9-A P0 清单 + 每条配一个可复现反例（input → 错输出）
   - P0-9A / P0-9B / P0-9C / P0-9D / P0-9E / P0-9F
§3 v0.9-B P0 清单 + 每条配一个可复现反例
   - P0-9G / P0-9H / P0-9I / P0-9J / P0-9K / P0-9L / P0-9M / P0-9N / P0-9O
§4 P0-M2 / P1 清单（如有）
§5 spike coverage matrix（v0.9-A + v0.9-B 声明覆盖 vs 实际覆盖）  ← 关键
   行：M0-9 / M0-10 / M0-11 / M0-12 / M0-13 / M0-14 / M0-15 / M0-16 + v0.8 八条硬门槛（schema 不退化）
   列：v0.9 声明 / 你实际跑过的 spike / PASS 或 FAIL
§6 最小修复清单（按优先级，不分阶段）
§7 复审门槛（v0.9 提交什么即可 PASS，明确列出 executable evidence）

【判断标准】
- PASS：所有 15 个 P0-9 都有可执行 spike + 反例被拒 + §5 matrix 全 PASS
- CHANGES REQUIRED：任一 P0-9 没有 spike 兜底，或反例成功，或 §5 有 FAIL

【具体执行路径】
1. cd 到 fish-harness 项目根
2. 跑 schema 应用（应输出 14 tables / 15 triggers / 39 indexes）：
   rm -f /tmp/harness-test.sqlite
   sqlite3 /tmp/harness-test.sqlite < spec/kernel-schema.sql
   sqlite3 /tmp/harness-test.sqlite "SELECT 'tables=' || count(*) FROM sqlite_master WHERE type='table';"
   sqlite3 /tmp/harness-test.sqlite "SELECT 'triggers=' || count(*) FROM sqlite_master WHERE type='trigger';"
   sqlite3 /tmp/harness-test.sqlite "SELECT 'indexes=' || count(*) FROM sqlite_master WHERE type='index';"
3. 跑 v0.9-A 反例 spike（每个 case 一行）：
   python3 spikes/m0/context-budget-test.py
   python3 spikes/m0/context-event-schema-test.py
4. 跑 v0.9-B 反例 spike：
   python3 spikes/m0/worker-dispatch-test.py
5. 跑 v0.8 spike 确认 v0.9 schema 不破坏已 ✅ 状态：
   for f in spikes/m0/*.py; do
     [ "$(basename "$f")" = "__init__.py" ] && continue
     [ "$(basename "$f")" = "_helpers.py" ] && continue
     python3 "$f" || echo FAIL: $f
   done
6. 跑 conformance（应输出 "10 Protocols" 不是 6/8/9）：
   python3 spikes/m0/conformance-second-impl.py
7. 验证所有事件 schema：
   for f in spec/events/*.json; do
     check-jsonschema --schemafile "$f"
   done
8. 对照 §5 coverage matrix 列出你实际跑过的与 PRD 声明的差异
9. 输出 §1-§7

【不读列表（强化）】
- 不要读 PRD-v0.9.md
- 不要读 adr/0006-context-layering.md / adr/0007-worker-pool.md
- 不要读 RESPONSE-TO-CODEX-v0.7-REVIEW.md / RESPONSE-TO-CODEX-v0.9-A-REVIEW.md / RESPONSE-TO-CODEX-v0.9-AB-REVIEW.md
- 不要读 ARCHITECT-REVIEW-PRD-v0.7.md / ARCHITECT-REVIEW-PRD-v0.9-A.md
- 不要读 notes/v0.9-contemplations.md / notes/codex-review-prompt-v0.9.md
（避免你的判断被 PRD 的话术影响）
```

---

## 复审门槛（v0.9 PASS 条件 — 已写入 §7）

| 门槛 | 必须有 |
|------|--------|
| 1 | 15 个 P0-9 反例全部跑出，且 spike 输出 "I11"/"I14"/"I15"/"I16"/"I17"/"NOT NULL"/"CHECK"/"FOREIGN KEY"/"UNIQUE constraint" 拒绝字样 |
| 2 | `spikes/m0/context-budget-test.py` exit 0（23 cases 全绿，v0.9.1） |
| 3 | `spikes/m0/context-event-schema-test.py` exit 0（v0.9.1） |
| 4 | `spikes/m0/worker-dispatch-test.py` exit 0（11 cases 全绿，v0.9-B） |
| 5 | 7 个 spike 全部 exit 0（v0.8 6 个 + v0.9-A 2 个 + v0.9-B 1 个 = 9 total） |
| 6 | `spec/kernel-schema.sql` 在 fresh SQLite 上应用后 14 tables / 15 triggers / 39 indexes（v0.9-B 终态） |
| 7 | `spikes/m0/conformance-second-impl.py` 输出 `10 Protocols satisfy runtime_checkable`（v0.9-B 加 WorkerPool） |
| 8 | 11 个事件 schema 全部通过 Draft 2020-12 校验（v0.7 8 个 + v0.9-A 1 个 + v0.9-B 3 个 = 12 个，等等再数一遍） |
| 9 | §5 coverage matrix 全 PASS（包括 v0.8 八条硬门槛不退化） |
| 10 | 7 个 ADR 全部 Status: Accepted（0001-0007） |

---

## 已知边界（你应自行验证）

### v0.9-A 边界

- `context_snapshots` 表的 FK 约束是 v0.7 `blobs.blob_id` 继承，**不要假设 L1/L2/L3 必须有 raw_blob_id / distilled_blob_id**——schema 里它们都是 nullable
- I11 trigger 的 `WHEN` 子句显式排除 `context_budget_tokens IS NULL`——budget=NULL 等于不限
- 并发 case (Case 10/11/12/13/14/15) 用 file-level 共享 DB + threading.Barrier，**不是 in-memory**
- `TrivialContextDistiller` 只验证 Protocol shape，不实现真实 I11/I14——真实强制在 SQLite trigger
- append-only 触发器（trg_snapshot_no_update / trg_snapshot_no_delete）拒绝任何 UPDATE / DELETE
- lineage 触发器（trg_lineage_*）要求 L2/L3 必有 parent_snapshot_id 且同 task

### v0.9-B 边界

- `idx_attempts_one_active`（v0.8）继续保留；v0.9-B 新增 `idx_worker_one_active_attempt`（每 worker 最多 1 active attempt）——两条索引配合 → task × worker 二维唯一
- 触发器顺序（重要）：SQLite 按 schema 中 CREATE TRIGGER 顺序执行；`trg_attempt_active_needs_worker` 在 `trg_attempt_fence_insert` 之后——I1 fence 优先触发
- `claim()` helper 自动注册 worker（INSERT OR IGNORE + commit before BEGIN IMMEDIATE）以兼容 v0.7-v0.9-A 测试；direct INSERTs 仍被 trigger 拒绝
- `_helpers._now_iso()` 使用固定基准时间 `2026-08-30T12:00:00.000Z` + 偏移，避免 wall-clock 波动
- I16 trigger 严格要求 `last_heartbeat_at` 字符串发生变化；测试必须用 `offset_seconds > 0`
- I17 trigger 检测 `drain` 时 current_attempt_id 指向已 terminal 的 attempt；测试需要先把 attempt 标 succeeded/failed/canceled/expired
- I18 是文档约束（SQLite 不支持跨 host 分布式共识）；spike 通过 `connect_with_fk(path)` 共享 file-DB 验证真并发

### 跨段交互边界（重点验证）

- v0.9-A context_snapshots.parent_snapshot_id FK → context_snapshots.snapshot_id；触发器要求 parent.task_id = NEW.task_id
- v0.9-B workers.current_attempt_id FK → task_attempts.attempt_id；触发器要求 worker 已注册才能 INSERT attempt
- `claim()` helper 是 v0.7 + v0.9-B 的粘合点：v0.7 fence + v0.9-B worker 都在这里
- v0.9-A 的 snapshot.append-only trigger 与 v0.9-B 的 worker.heartbeat trigger **互不干扰**（不同表）

---

## v0.9 vs v0.8 复审差异

| 维度 | v0.8 复审 | v0.9 合并复审 |
|------|----------|---------------|
| 反例数量 | 4 P0 + 1 P1 | 15 P0-9（A 6 + B 9） |
| 新增 spike | 6 spike 29 OK | +3 spike（context-budget + context-event-schema + worker-dispatch） |
| schema 增量 | 0 列 0 表 1 trigger | +1 列 +2 表 +6 trigger（A 2 + B 4） |
| Protocol 增量 | 0 | +3（ContextDistiller + ContextBudget + WorkerPool） |
| ADR 增量 | 0 | +2（0006 + 0007） |
| 事件 schema 增量 | 0 | +4（context.snapshot + worker.dispatched + worker.heartbeat + worker.drained） |
| CI job 增量 | 0 | +3（spike-py-context-budget + spike-py-context-event-schema + spike-py-worker-dispatch） |

Codex v0.9 合并复审应在此基线上扩展，**不需要重测 v0.8 的 6 个 spike**——除非你想确认 v0.9 schema 没有退化（spike 全绿已证明）。

---

## 给 Codex 的一个常见反例编写建议

如果你想确认某个 P0-9X 真的有 spike 兜底（而不是"我相信它被拒绝"），可以这样验证：

```bash
# 跑 spike，看是否有 "OK: ..." 输出
python3 spikes/m0/worker-dispatch-test.py

# 反向验证：临时 DROP trigger，再跑 spike，看是否变成 FAIL
sqlite3 /tmp/test.sqlite < spec/kernel-schema.sql
sqlite3 /tmp/test.sqlite "DROP TRIGGER trg_worker_heartbeat_renew;"
python3 spikes/m0/worker-dispatch-test.py  # 此时应该 FAIL
```

如果 DROP trigger 后 spike 仍然 PASS，说明 spike 没真正验证 trigger——这是 v0.9-A P1-4 "8 Protocols 硬编码 6/8" 的同类反例。

---

## 备注

本文件覆盖 v0.9-A + v0.9-B 合并复审。如果未来 v0.9-C 进入（在 v0.9-B 后），应新建 `codex-review-prompt-v0.9C.md` 而不是扩展本文件——保持每个 v0.9.X 复审 prompt 独立。