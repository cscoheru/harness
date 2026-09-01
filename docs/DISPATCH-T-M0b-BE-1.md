# DISPATCH-T-M0b-BE-1 — Role BE — dsh 实测 H-1 第 1 类 A 任务（调研）

> **Task ID**: T-M0b-BE-1
> **Status**: 🟡 pending（派发中，等 Cursor Agent / Codex CLI / 真实人类执行）
> **Date**: 2026-09-01
> **Author**: 架构师（v1.1 GA plan v0.0 DRAFT §2.1 派发）
> **Receiving Agent**: Role BE — Orchestrator/Commander/Worker TypeScript 工程师（v1.1+）
> **Parent Plan**: `docs/v1.1-ga-team-plan.md` §2.1
> **Adjudication Source**: `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 6 + `docs/PRD-v1.1-product.md` §3 H-1/H-2

---

## §1 任务定义

### 1.1 一句话

跑 1 个 A 类任务（**调研**）用 dsh（DeepSeek Harness）CLI，**等价类 = orch 档**（高推理 / 跨项目决策），输出 trace + token + 质量评估报告。

### 1.2 任务来源

PRD-v1.1 §3 H-1：**dsh 覆盖鱼之需求 80%**。本任务是 H-1 的第 1 类 A 任务切片（裁定 6 收窄：A 类任务 = 调研 / 改代码 / 摘要），BE 负责调研类。

### 1.3 等价类约束（NORTH-STAR A-4）

| 层 | 等价类 | 本任务档位 |
|----|--------|-----------|
| Orchestrator | 高推理 / 跨项目决策 | ✅ 本任务 |
| Commander | 中上下文 / 单工作流编排 | ❌ TG-1 |
| Worker | 低成本批量执行 | ❌ DO-1 |

具体 SKU = `spec/capabilities/orch.json`（M0b-QA-1 落地后填入）。本任务**不锁型号名**，写 `class: "orch"` 字段。

### 1.4 调研 A 任务定义

任选 1 个调研类任务（建议从以下选 1）：

1. **v1.0 runtime integration roadmap** — 调研 v1.0 `harness/` Python kernel 如何被 v1.1 wrapper 调用（HTTP / FFI / 包导入），输出 3-5 页 Markdown 报告
2. **dsh TypeScript SDK 能力边界** — 调研 dsh 是否暴露 Node.js/TypeScript SDK（除 CLI 外），输出能力矩阵
3. **Tailscale Serve + iOS PWA 集成路径** — 调研 Tailscale Serve 给 iOS Safari 提供 HTTPS + Service Worker 的具体步骤，输出集成指南

### 1.5 硬约束（HARD CONSTRAINTS）

- ❌ 不写 TypeScript wrapper 代码（M0c 才开）
- ❌ 不调 v1.0 runtime kernel HTTP API（M0b 仅 dsh CLI）
- ❌ 不锁具体型号（写 `class: orch`，不写 `model: "Fable 5"`）
- ✅ 用 dsh CLI（最新 stable），不 fork dsh 源码
- ✅ 报告 commit 到 `docs/DISPATCH-T-M0b-BE-1.md`（替换本 DISPATCH 占位段）
- ✅ 至少跑 **3 次** 取中位数（避免 R-M0b-1 spike 报告失真）

---

## §2 输入

### 2.1 前置依赖

- v1.0.0 GA tag `ab8749a` 已 released（✅ 2026-09-01）
- dsh CLI 安装：见 `https://github.com/deepseek-ai/dsh`（或 dsh 官方安装文档）
- 模型 API key：deepseek（或等价类 orch 档模型 key，由执行者决定）

### 2.2 输入材料

| 材料 | 路径 | 用途 |
|------|------|------|
| v1.1 GA plan v0.0 DRAFT | `docs/v1.1-ga-team-plan.md` | 阶段表 + 验证清单 |
| v1.0 runtime Python kernel | `harness/` + `spec/` | 调研 v1.0 integration 路径（任务 1） |
| dsh 官方文档 | （执行者自查）| 调研 dsh TypeScript SDK（任务 2）|
| Tailscale 官方文档 | （执行者自查）| 调研 Tailscale Serve + iOS PWA（任务 3）|

---

## §3 产出

### 3.1 主产出（必交付）

**文件**：`docs/DISPATCH-T-M0b-BE-1.md`（替换本 DISPATCH 占位段，在 §6 报告模板处填写）

**报告必含 6 段**（详见 §6 模板）：

1. 任务定义（哪个 A 任务、为什么选）
2. dsh 调用 trace（命令 + 输出 + token）
3. 至少 3 次运行的中位数（wall / token / 质量分）
4. 调研报告摘要（3-5 句核心结论）
5. dsh 能力评估（本次跑暴露的 dsh 强项 + 弱项）
6. 等价类档位评估（orch 档位对调研类任务适配度 1-5 分）

### 3.2 副产出（建议）

- `spec/capabilities/_m0b_draft/orch.json`（草案，QA-1 落地时 mv 到 `spec/capabilities/orch.json`）：

```json
{
  "class": "orch",
  "provider": "deepseek",
  "model_id": "deepseek-reasoner",
  "tier": "high-reasoning",
  "cost_per_1k_input_tokens_usd": 0.014,
  "cost_per_1k_output_tokens_usd": 0.28,
  "max_context_tokens": 64000,
  "m0b_evidence": {
    "task_id": "T-M0b-BE-1",
    "report": "docs/DISPATCH-T-M0b-BE-1.md",
    "median_wall_seconds": null,
    "median_tokens": null,
    "quality_score_1to5": null
  }
}
```

> **注**：`_m0b_draft/` 目录是 M0b 期间的临时位置；QA-1 收齐 3 类 orch/commander/worker JSON 后 mv 到 `spec/capabilities/`。

### 3.3 git commit

报告完成后 commit 到 main 分支：

```bash
git add docs/DISPATCH-T-M0b-BE-1.md spec/capabilities/_m0b_draft/orch.json
git commit -m "feat(m0b): T-M0b-BE-1 dsh 调研 A 任务 orch 档实测 + 报告

- dsh CLI 跑 1 个调研 A 任务（v1.0 integration roadmap / dsh SDK
  / Tailscale PWA 三选一）至少 3 次取中位数
- 报告含 trace + token + 质量评估 + 等价类适配分
- spec/capabilities/_m0b_draft/orch.json 草案（QA-1 后 mv）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## §4 架构师验证命令

报告 commit 后，架构师跑下列命令验证：

```bash
# 1. 报告存在 + 含 6 段
test -f docs/DISPATCH-T-M0b-BE-1.md
grep -cE "^## 任务定义|^## dsh 调用 trace|^## 中位数|^## 调研报告摘要|^## dsh 能力评估|^## 等价类档位评估" docs/DISPATCH-T-M0b-BE-1.md
# 期望: 6

# 2. orch 档 capability JSON 草案存在
test -f spec/capabilities/_m0b_draft/orch.json
jq -e '.class == "orch" and .tier == "high-reasoning"' spec/capabilities/_m0b_draft/orch.json

# 3. 不锁型号守门（NORTH-STAR A-4 等价类）
grep -E "Fable 5|GLM 5.3|MiniMax-M3" docs/DISPATCH-T-M0b-BE-1.md spec/capabilities/_m0b_draft/orch.json
# 期望: 无输出（不锁型号）

# 4. 至少 3 次运行（中位数行存在）
grep -cE "中位数|median" docs/DISPATCH-T-M0b-BE-1.md
# 期望: ≥ 1
```

---

## §5 估时 + 风险

### 5.1 估时

- dsh CLI 安装 + 模型 API key 配置：0.5d
- 选 A 任务 + 写调研提示词：0.5d
- dsh 跑 3 次 + 收 trace：0.5d
- 写报告 6 段 + capability JSON：0.5d
- **合计：2d**（人天估算；与 v1.1 GA plan §2.1 T-M0b-BE-1 估时对齐）

### 5.2 风险

| # | 风险 | 缓解 |
|---|------|------|
| **R-BE-1** | dsh CLI 安装失败（网络 / 依赖冲突） | 改 pip install / Docker 镜像；失败转 DISPATCH-T-M0b-BE-1-FAIL |
| **R-BE-2** | 模型 API key 缺失 / 限流 | 改用 orch 档其他模型（MiniMax-M3 / GLM 5.3 等），3 次降为 1 次 |
| **R-BE-3** | 调研 A 任务输出质量 < 3/5 | 重写提示词 + 重跑 3 次；仍 < 3 则标记 H-1 失败路径 |
| **R-BE-4** | 等价类档位不适配（orch 跑调研 ≠ 适配）| 报告中明示，由 QA-1 跑等价类对比时核实 |

### 5.3 H-1 失败处理

如本任务 dsh 跑不出可用调研结果（质量 < 3/5 或 dsh CLI 不可用）：

1. 在报告 `## dsh 能力评估` 段明示 "H-1 dsh 调研类 FAIL"
2. 不强行写 capability JSON（标 `quality_score_1to5: null`）
3. 通知 QA-1 + 架构师，由架构师裁定是否启动「鱼之重新定义」（PRD-v1.1 §3 H-1 失败处理 + NORTH-STAR §10 冲突 5）

---

## §6 报告模板（执行者填写）

> **执行者**（Cursor Agent / Codex CLI / 真实人类）：请在执行后，**替换整个 §6 块**为你的实测报告。

### §6.1 任务定义

- **A 任务选择**：____（v1.0 integration / dsh SDK / Tailscale PWA 三选一）
- **选择理由**：____

### §6.2 dsh 调用 trace

#### Run 1

- **dsh 命令**：`dsh ...`（具体命令）
- **wall time**：__s
- **input tokens**：__
- **output tokens**：__
- **退出码**：__
- **输出摘要**：__（3 句话）

#### Run 2（同任务）

- **dsh 命令**：`dsh ...`
- **wall time**：__s
- **input tokens**：__
- **output tokens**：__
- **退出码**：__
- **输出摘要**：__

#### Run 3（同任务）

- **dsh 命令**：`dsh ...`
- **wall time**：__s
- **input tokens**：__
- **output tokens**：__
- **退出码**：__
- **输出摘要**：__

### §6.3 中位数（3 次取中位）

- **wall time 中位数**：__s
- **input tokens 中位数**：__
- **output tokens 中位数**：__
- **退出码一致性**：__/3 成功

### §6.4 调研报告摘要

- **核心结论 1**：__
- **核心结论 2**：__
- **核心结论 3**：__
- **质量分**（1-5）：__

### §6.5 dsh 能力评估（本次跑）

- **强项**：__
- **弱项**：__
- **调研类适配度**（orch 档，1-5）：__

### §6.6 等价类档位评估

- **本次档位**：orch
- **适配调研类任务 1-5 分**：__
- **建议改档位**：__（如不 orch，改其他档）
- **理由**：__

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.1 + §3 + §4.1 + §6 PR1 + §7.3 + §10.1
- `docs/PRD-v1.1-product.md` §3 H-1 + §4.6
- `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 5（等价类）+ 裁定 6（M0b 范围收窄）
- `docs/PRD-V0.1-NORTH-STAR.md` §1 G-2 + §3 A-4 + 合同层 v1.1 product 适用条款
- `docs/v1.0-ga-team-plan.md`（frozen, 参考任务书结构）