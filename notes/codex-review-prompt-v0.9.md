# Codex v0.9-A 复审指令

> **File**: `notes/codex-review-prompt-v0.9.md`
> **Date**: 2026-08-30
> **Source template**: `notes/codex-review-prompt-template.md`（v0.8 复用版）
> **Target**: Codex 对 PRD-v0.9-A（Context Layering）做复审

---

## 主指令（可直接复制粘贴到 Codex）

```text
请按以下规则复审 PRD-v0.9-A（Context Layering）：

【范围限定（强约束）】
- 只读 spec/ 与 spikes/m0/ 目录
- 不要读 PRD-v0.9.md（除非明确指出要看哪一段）
- 不要读 adr/0006-context-layering.md（除非明确指出要看哪一段）
- 不要读 RESPONSE-TO-CODEX-v0.7-REVIEW.md（避免 anchor bias）
- 复审只基于 spike 实际跑出的结果，不基于 PRD 承诺

【反例驱动（核心）】
PRD-v0.9 §6 列了 6 个反例，逐一跑出对应反例：
  - P0-9A: charge 超 budget 的 token 数 → I11 trigger BudgetExceeded
  - P0-9B: L3 handoff trust_label=untrusted_external → I14 trigger
  - P0-9C: L1 distilled_blob_id 引用不存在的 raw_blob → FK 约束
  - P0-9D: cross-attempt snapshot 缺 task_id → NOT NULL 约束
  - P0-9E: snapshot.token_count < 0 → CHECK 约束
  - P0-9F: snapshot.level 不在 {L0,L1,L2,L3} → CHECK 约束

反例格式：<input/state> → <wrong output/crash>
反例成功（=违反不变量）= v0.9-A 未真正修复
反例被拒绝（=spike 抛异常/拒绝）= 真修复

【evidence 要求】
- 每个 P 编号必须有可执行 spike 文件名 + 行号
- 必须指明哪个断言拒绝该反例（trigger 名 / CHECK 名 / FK 名）
- 没有 spike 兜底的修复 = 🟡 spike-deferred，不要标 ✅
- 反例必须用真并发跑（独立 sqlite3.connect + threading）— Case 10 是基准
- 不要相信 PRD-v0.9.md 里写的"已实现"——你必须自己跑

【输出格式（强约束）】
§1 结论（PASS / CHANGES REQUIRED，1 段）
§2 P0 清单 + 每条配一个可复现反例（input → 错输出）
   - P0-9A / P0-9B / P0-9C / P0-9D / P0-9E / P0-9F
§3 P0-M2 / P1 清单（如有）
§4 spike coverage matrix（v0.9-A 声明覆盖 vs 实际覆盖）  ← 关键
   行：M0-9 / M0-10 / M0-11 / M0-12 + v0.8 八条硬门槛（schema 不退化）
   列：v0.9-A 声明 / 你实际跑过的 spike / PASS 或 FAIL
§5 最小修复清单（按优先级，不分阶段）
§6 复审门槛（v0.9.1 提交什么即可 PASS，明确列出 executable evidence）

【判断标准】
- PASS：所有 6 个 P0-9 都有可执行 spike + 反例被拒 + §4 matrix 全 PASS
- CHANGES REQUIRED：任一 P0-9 没有 spike 兜底，或反例成功，或 §4 有 FAIL

【具体执行路径】
1. cd 到 fish-harness 项目根
2. 跑 schema 应用：
   sqlite3 :memory: < spec/kernel-schema.sql
3. 跑反例 spike（每个 case 一行）：
   python3 spikes/m0/context-budget-test.py
4. 跑 v0.8 spike 确认 v0.9-A schema 不破坏已 ✅ 状态：
   for f in spikes/m0/*.py; do
     [ "$(basename "$f")" = "__init__.py" ] && continue
     [ "$(basename "$f")" = "_helpers.py" ] && continue
     python3 "$f" || echo FAIL: $f
   done
5. 跑 conformance：
   python3 spikes/m0/conformance-second-impl.py
   （确认输出 "8 Protocols satisfy runtime_checkable"，不是 6）
6. 验证事件 schema：
   python3 -c "import json; from jsonschema import Draft202012Validator;
   print('OK' if not list(Draft202012Validator(json.load(open('spec/events/context.snapshot.json'))).iter_errors({})) else 'FAIL')"
7. 对照 §4 coverage matrix 列出你实际跑过的与 PRD 声明的差异
8. 输出 §1-§6

【不读列表（强化）】
- 不要读 PRD-v0.9.md
- 不要读 adr/0006-context-layering.md
- 不要读 RESPONSE-TO-CODEX-v0.7-REVIEW.md
- 不要读 ARCHITECT-REVIEW-PRD-v0.7.md
- 不要读 notes/v0.9-contemplations.md
（避免你的判断被 PRD 的话术影响）
```

---

## 复审门槛（v0.9.1 PASS 条件 — 已写入 §6）

| 门槛 | 必须有 |
|------|--------|
| 1 | 6 个 P0-9 反例全部跑出，且 spike 输出 "I11" / "I14" / "NOT NULL" / "CHECK" / "FOREIGN KEY" 拒绝字样 |
| 2 | `spikes/m0/context-budget-test.py` exit 0（10 cases 全绿） |
| 3 | 7 个 spike 全部 exit 0（v0.8 6 个 + v0.9-A 1 个） |
| 4 | `spec/kernel-schema.sql` 在 fresh SQLite 上 `sqlite3 :memory: <` 不报错 |
| 5 | `spikes/m0/conformance-second-impl.py` 输出 `8 Protocols`（不是 6） |
| 6 | `spec/events/context.snapshot.json` 通过 Draft 2020-12 校验 |
| 7 | §4 coverage matrix 全 PASS（包括 v0.8 八条硬门槛不退化） |

---

## 已知边界（你应自行验证）

- `context_snapshots` 表的 FK 约束是 v0.7 `blobs.blob_id` 继承，**不要假设 L1/L2/L3 必须有 raw_blob_id / distilled_blob_id**——schema 里它们都是 nullable
- I11 trigger 的 `WHEN` 子句显式排除 `context_budget_tokens IS NULL`——budget=NULL 等于不限
- 并发 case (Case 10) 用 file-level 共享 DB + threading.Barrier，**不是 in-memory**
- `TrivialContextDistiller` 只验证 Protocol shape，不实现真实 I11/I14——真实强制在 SQLite trigger

---

## v0.9-A vs v0.8 复审差异

| 维度 | v0.8 复审 | v0.9-A 复审 |
|------|----------|------------|
| 反例数量 | 4 P0 + 1 P1 | 6 P0-9 |
| 新增 spike | 6 spike 29 OK | +1 spike 16 OK（context-budget-test） |
| schema 增量 | 0 列 0 表 1 trigger | +1 列 +1 表 +2 trigger |
| Protocol 增量 | 0 | +2 (ContextDistiller + ContextBudget) |
| ADR 增量 | 0 | +1 (0006) |
| 事件 schema 增量 | 0 | +1 (context.snapshot) |
| CI job 增量 | 0 | +2 (spike-py-context-budget + ADR 0006 check) |

Codex v0.9-A 复审应在此基线上扩展，**不需要重测 v0.8 的 6 个 spike**——除非你想确认 v0.9-A schema 没有退化。