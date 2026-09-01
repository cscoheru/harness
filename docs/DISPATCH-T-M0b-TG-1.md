# DISPATCH-T-M0b-TG-1 — Role TG — dsh 实测 H-1 第 2 类 A 任务（改代码）

> **Task ID**: T-M0b-TG-1
> **Status**: 🟡 pending（派发中，等 Cursor Agent / Codex CLI / 真实人类执行）
> **Date**: 2026-09-01
> **Author**: 架构师（v1.1 GA plan v0.0 DRAFT §2.2 派发）
> **Receiving Agent**: Role TG — dsh Wrapper & Tool Provider 工程师（v1.1+）
> **Parent Plan**: `docs/v1.1-ga-team-plan.md` §2.2
> **Adjudication Source**: `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 6 + `docs/PRD-v1.1-product.md` §3 H-1/H-2

---

## §1 任务定义

### 1.1 一句话

跑 1 个 A 类任务（**改代码**）用 dsh（DeepSeek Harness）CLI，**等价类 = commander 档**（中上下文 / 单工作流编排），输出 diff + PR 描述 + token 用量。

### 1.2 任务来源

PRD-v1.1 §3 H-1：**dsh 覆盖鱼之需求 80%**。本任务是 H-1 的第 2 类 A 任务切片（裁定 6 收窄：A 类任务 = 调研 / 改代码 / 摘要），TG 负责改代码类。

### 1.3 等价类约束（NORTH-STAR A-4）

| 层 | 等价类 | 本任务档位 |
|----|--------|-----------|
| Orchestrator | 高推理 / 跨项目决策 | ❌ BE-1 |
| Commander | 中上下文 / 单工作流编排 | ✅ 本任务 |
| Worker | 低成本批量执行 | ❌ DO-1 |

具体 SKU = `spec/capabilities/commander.json`（M0b-QA-1 落地后填入）。本任务**不锁型号名**，写 `class: "commander"` 字段。

### 1.4 改代码 A 任务定义

任选 1 个改代码类任务（建议从以下选 1，所有改动必须在 `tmp/m0b-tg-1/` 沙箱内进行，**禁止**改动 v1.0 runtime / spec / spikes / _helpers / 9 ADR body / v1.1 GA plan）：

1. **v1.0 `harness/runtime/_db.py` 加 1 个新方法 `connect_with_fk_ro()`**（read-only 连接，FK 开启但禁止写）—— TG 在 `tmp/m0b-tg-1/` 内 fork 一份 `_db.py` 做改动，输出 diff + pytest 通过证据
2. **`harness/gateway/gateway.py` 6 步链加 audit 行写 `actor` 字段**（v1.0 audit_log 没存 actor）—— TG 在沙箱内做改动，输出 diff + pytest 37/37 通过证据
3. **新增 `harness/testing/test_capability_loader.py`**（读 `spec/capabilities/*.json` 验证 4 字段 class/provider/tier/cost）—— TG 在沙箱内新建 + 跑 pytest，输出 diff + pytest 通过证据

### 1.5 硬约束（HARD CONSTRAINTS）

- ❌ **禁止改动 v1.0 runtime 任何文件**（`harness/` + `spec/` + `spikes/` + `_helpers.py` + `Dockerfile` + `docker-compose.yml` + `pyproject.toml` + 9 ADR body + CHANGELOG）
- ❌ 禁止改动 `docs/v1.1-ga-team-plan.md` + `docs/v1.0-ga-team-plan.md` + `docs/PRD-v1.1-product.md` + `docs/PRD-V0.1-NORTH-STAR.md`
- ❌ 不写 TypeScript wrapper（M0c 才开）
- ❌ 不锁具体型号（写 `class: commander`，不写 `model: "GLM 5.3"`）
- ✅ 用 dsh CLI 在 `tmp/m0b-tg-1/` 沙箱内做改动（git worktree 或 tmp 目录都行）
- ✅ 报告 commit 到 `docs/DISPATCH-T-M0b-TG-1.md`（替换本 DISPATCH 占位段）
- ✅ 至少跑 **3 次** 取中位数（避免 R-M0b-1 spike 报告失真）

---

## §2 输入

### 2.1 前置依赖

- v1.0.0 GA tag `ab8749a` 已 released（✅ 2026-09-01）
- dsh CLI 安装（同 T-M0b-BE-1）
- 模型 API key：commander 档模型（由执行者决定）

### 2.2 输入材料

| 材料 | 路径 | 用途 |
|------|------|------|
| v1.1 GA plan v0.0 DRAFT | `docs/v1.1-ga-team-plan.md` | 阶段表 |
| v1.0 runtime Python kernel | `harness/` | 改代码对象（沙箱内 fork）|
| ADR 0005 + 0009 | `adr/0005-tool-invocation-gateway.md` + `adr/0009-sqlite-wal-production-constraints.md` | 改代码合规参考 |

---

## §3 产出

### 3.1 主产出（必交付）

**文件**：`docs/DISPATCH-T-M0b-TG-1.md`（替换本 DISPATCH 占位段，在 §6 报告模板处填写）

**报告必含 6 段**（详见 §6 模板）：

1. 任务定义（哪个 A 任务、为什么选）
2. dsh 调用 trace（命令 + diff 输出 + token）
3. 至少 3 次运行的中位数（wall / token / diff 行数）
4. 改代码 diff 摘要（关键 3-5 处改动）
5. pytest 验证（v1.0 spike suite + 沙箱内新 pytest，全绿）
6. dsh 能力评估（强项 + 弱项 + commander 档位适配度）

### 3.2 副产出（建议）

- `spec/capabilities/_m0b_draft/commander.json`：

```json
{
  "class": "commander",
  "provider": "deepseek",
  "model_id": "deepseek-chat",
  "tier": "mid-context",
  "cost_per_1k_input_tokens_usd": 0.0014,
  "cost_per_1k_output_tokens_usd": 0.0028,
  "max_context_tokens": 32000,
  "m0b_evidence": {
    "task_id": "T-M0b-TG-1",
    "report": "docs/DISPATCH-T-M0b-TG-1.md",
    "median_wall_seconds": null,
    "median_tokens": null,
    "median_diff_lines": null,
    "quality_score_1to5": null
  }
}
```

### 3.3 git commit

```bash
git add docs/DISPATCH-T-M0b-TG-1.md spec/capabilities/_m0b_draft/commander.json
git commit -m "feat(m0b): T-M0b-TG-1 dsh 改代码 A 任务 commander 档实测 + 报告

- dsh CLI 跑 1 个改代码 A 任务（v1.0 _db.py / gateway.py / 新 test
  三选一）至少 3 次取中位数；改动在 tmp/m0b-tg-1/ 沙箱内
- 报告含 diff + token + pytest 验证 + commander 档适配度
- spec/capabilities/_m0b_draft/commander.json 草案（QA-1 后 mv）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## §4 架构师验证命令

```bash
# 1. 报告存在 + 含 6 段
test -f docs/DISPATCH-T-M0b-TG-1.md
grep -cE "^## 任务定义|^## dsh 调用 trace|^## 中位数|^## 改代码 diff 摘要|^## pytest 验证|^## dsh 能力评估" docs/DISPATCH-T-M0b-TG-1.md
# 期望: 6

# 2. commander 档 capability JSON 草案存在
test -f spec/capabilities/_m0b_draft/commander.json
jq -e '.class == "commander" and .tier == "mid-context"' spec/capabilities/_m0b_draft/commander.json

# 3. 不锁型号守门
grep -E "Fable 5|GLM 5.3|MiniMax-M3" docs/DISPATCH-T-M0b-TG-1.md spec/capabilities/_m0b_draft/commander.json
# 期望: 无输出

# 4. v1.0 runtime 不漂移守门
git diff v1.0.0..HEAD -- harness/ spec/ spikes/ adr/0001-0009.md Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0

# 5. 至少 3 次运行
grep -cE "中位数|median" docs/DISPATCH-T-M0b-TG-1.md
# 期望: ≥ 1
```

---

## §5 估时 + 风险

### 5.1 估时

- dsh CLI 配置（如已 BE-1 装好可省）：0.5d
- 选 A 任务 + 写沙箱 + 写 dsh 提示词：0.5d
- dsh 跑 3 次 + 收 diff + token：0.5d
- 沙箱内 pytest 全绿验证：0.5d
- 写报告 6 段 + capability JSON：0.5d
- **合计：2d**（与 v1.1 GA plan §2.2 T-M0b-TG-1 估时对齐）

### 5.2 风险

| # | 风险 | 缓解 |
|---|------|------|
| **R-TG-1** | dsh 改代码能力不足（diff 不通 / pytest 红）| 改用更简单的 A 任务（如任务 3 新 test）；失败转 DISPATCH-T-M0b-TG-1-FAIL |
| **R-TG-2** | 沙箱污染 v1.0 runtime（漏改 v1.0 文件）| 用 git worktree 隔离；架构师验证命令 §4 第 4 步兜底 |
| **R-TG-3** | commander 档位跑改代码 ≠ 适配 | 报告中明示，由 QA-1 跑等价类对比时核实 |

### 5.3 H-1 失败处理

如本任务 dsh 改代码能力不足（diff < 5 行 或 pytest 红）：

1. 报告 `## dsh 能力评估` 段明示 "H-1 dsh 改代码类 FAIL"
2. capability JSON 标 `quality_score_1to5: null`
3. 通知 QA-1 + 架构师，启动「鱼之重新定义」评估

---

## §6 报告模板（执行者填写）

### §6.1 任务定义

- **A 任务选择**：____（v1.0 _db.py / gateway.py / 新 test 三选一）
- **选择理由**：____
- **沙箱路径**：____（如 `tmp/m0b-tg-1/`）

### §6.2 dsh 调用 trace

#### Run 1

- **dsh 命令**：`dsh ...`
- **wall time**：__s
- **input tokens**：__
- **output tokens**：__
- **diff 行数**：__
- **退出码**：__

#### Run 2

- **dsh 命令**：`dsh ...`
- **wall time**：__s
- **input tokens**：__
- **output tokens**：__
- **diff 行数**：__
- **退出码**：__

#### Run 3

- **dsh 命令**：`dsh ...`
- **wall time**：__s
- **input tokens**：__
- **output tokens**：__
- **diff 行数**：__
- **退出码**：__

### §6.3 中位数（3 次取中位）

- **wall time 中位数**：__s
- **input tokens 中位数**：__
- **output tokens 中位数**：__
- **diff 行数 中位数**：__
- **diff 一致性**：__/3 次 diff 完全相同

### §6.4 改代码 diff 摘要

- **关键改动 1**：__（v1.0 _db.py / gateway.py / 新 test 三选一的位置）
- **关键改动 2**：__
- **关键改动 3**：__
- **改动的合理性**：__

### §6.5 pytest 验证

- **v1.0 spike suite**（conformance 10/10 + worker-dispatch + worker-events + context-budget）：__/__
- **沙箱内新 pytest**（如任务 3）：__/__
- **pytest exit code**：__

### §6.6 dsh 能力评估（本次跑）

- **强项**：__
- **弱项**：__
- **commander 档位适配度**（1-5）：__

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.2 + §3 + §4.1 + §6 PR1 + §7.3 + §10.1
- `docs/PRD-v1.1-product.md` §3 H-1 + §4.6
- `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 5 + 裁定 6
- `docs/PRD-V0.1-NORTH-STAR.md` §3 A-4
- `docs/v1.0-ga-team-plan.md`（frozen, 参考）