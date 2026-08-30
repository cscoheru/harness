# Codex 复审指令模板（v0.8+ 复用版）

> **File**: `notes/codex-review-prompt-template.md`
> **Purpose**: 给 Codex 下达复审指令的可复用模板。v0.7/v0.8 复审已验证有效。

---

## 主模板

```text
请按以下规则复审 PRD-v0.X：

【范围限定（强约束）】
- 只读 spec/ 与 spikes/ 目录
- 不要读 PRD-v0.X.md（除非明确指出要看哪一段）
- 不要读 ADR（除非明确指出要看哪一条）
- 复审只基于 spike 实际跑出的结果，不基于 PRD 承诺
- 复审期间不要读 ARCHITECT-REVIEW 旧版（避免 anchor bias）

【反例驱动（核心）】
- 对每个 v0.X-1 标记为 "fixed" 的 P 编号，跑出对应反例
- 反例格式：<input/state> → <wrong output/crash>
- 反例成功（=违反不变量）= v0.X 未真正修复
- 反例被拒绝（=spike 抛异常/拒绝）= 真修复

【evidence 要求】
- 每个 P 编号必须有可执行 spike 文件名 + 行号
- "宣称已修复"必须指明哪个断言拒绝该反例
- 没有 spike 兜底的修复 = 🟡 spike-deferred，不要标 ✅
- 反例必须用真并发（独立 sqlite3.connect + threading）跑 race

【输出格式（强约束）】
- §1 结论（PASS / CHANGES REQUIRED，1 段）
- §2 P0 清单 + 每条配一个可复现反例（input → 错输出）
- §3 P0-M2 / P1 清单（如有）
- §4 spike coverage matrix（v0.X 声明覆盖 vs 实际覆盖）  ← 关键
- §5 最小修复清单（按优先级，不分阶段）
- §6 复审门槛（v0.X+1 提交什么即可 PASS，明确列出 executable evidence）

【判断标准】
- PASS：所有 P0 都有可执行 spike + 反例被拒
- CHANGES REQUIRED：任一 P0 没有 spike 兜底，或反例成功
```

---

## 配套：Codex 应读 vs 不读

| 应该读 | 不要读 |
|--------|-------|
| `spec/`（schema + Protocol + state machine）| `PRD-v0.X.md`（除非用户明确要 review）|
| `spikes/`（所有 spike 文件）| `ADR/`（除非用户明确要 review）|
| `spec/events/*.json`（JSON Schema）| `notes/`（探索性笔记）|
| `.github/workflows/*.yml`（CI 配置）| `RESPONSE-TO-CODEX-*-REVIEW.md`（前次回应）|

---

## 历史验证

| 版本 | 应用结果 | Codex 是否抓到反例 |
|------|---------|------------------|
| v0.6 → v0.7 | 用了 §4 coverage matrix 后抓到 4 P0 + 1 P1 真实反例 | ✅ 抓到了 |
| v0.7 → v0.8 | 反例已 spike 化（每个 P0 都有对应反例 case） | 待 Codex v0.8 复审验证 |

---

## 模板使用流程

1. 用户提交 PRD-v0.X
2. 我修复并写 spec/ + spikes/ + adr/（v0.X+1 工作）
3. 我本地跑全部 spike 验证 ✅
4. 提交 v0.X+1 给 Codex，使用本模板下达指令
5. Codex 按 §4 matrix + §2 反例返回报告
6. 我对照 §6 复审门槛修复 → v0.X+2

---

## 不变性

- §4 coverage matrix 不可省略（这是 v0.7 → v0.8 复审有效性的核心）
- §6 复审门槛必须明确"提交什么即可 PASS"，避免下次复审再次陷入细节
- 反例必须**真实可复现**（包含 input + 实际跑出的错输出）
- 限定范围是为了让 Codex 不陷入文字细节——v0.6 复审如果限定范围，可能更早就发现 P0-1 schema 缺失
