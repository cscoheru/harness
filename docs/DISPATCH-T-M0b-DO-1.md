# DISPATCH-T-M0b-DO-1 — Role DO — dsh 实测 H-1 第 3 类 A 任务（摘要）+ newvps RAM 实测

> **Task ID**: T-M0b-DO-1
> **Status**: 🟡 pending（派发中，等 Cursor Agent / Codex CLI / 真实人类执行）
> **Date**: 2026-09-01
> **Author**: 架构师（v1.1 GA plan v0.0 DRAFT §2.3 派发）
> **Receiving Agent**: Role DO — DevOps & 多 Host 部署工程师（v1.1+）
> **Parent Plan**: `docs/v1.1-ga-team-plan.md` §2.3
> **Adjudication Source**: `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 2（newvps 共址前置）+ 裁定 6 + `docs/PRD-v1.1-product.md` §3 H-1 + §4.2

---

## §1 任务定义

### 1.1 一句话

跑 1 个 A 类任务（**摘要**）用 dsh（DeepSeek Harness）CLI，**等价类 = worker 档**（低成本批量执行）+ 实测 newvps RAM 余量（裁定 2 前置）+ 输出报告。

### 1.2 任务来源

PRD-v1.1 §3 H-1：**dsh 覆盖鱼之需求 80%**。本任务是 H-1 的第 3 类 A 任务切片（裁定 6 收窄：A 类任务 = 调研 / 改代码 / 摘要），DO 负责摘要类。**附加**：裁定 2 要求"调度层部署 newvps 共址 M1；超内存再升"——前置必须实测 newvps 当前 RAM 余量。

### 1.3 等价类约束（NORTH-STAR A-4）

| 层 | 等价类 | 本任务档位 |
|----|--------|-----------|
| Orchestrator | 高推理 / 跨项目决策 | ❌ BE-1 |
| Commander | 中上下文 / 单工作流编排 | ❌ TG-1 |
| Worker | 低成本批量执行 | ✅ 本任务 |

具体 SKU = `spec/capabilities/worker.json`（M0b-QA-1 落地后填入）。本任务**不锁型号名**，写 `class: "worker"` 字段。

### 1.4 摘要 A 任务定义

任选 1 个摘要类任务（建议从以下选 1）：

1. **v1.0.0 GA release notes 摘要** —— 取 `CHANGELOG.md` `[1.0.0]` 段 ~46 行 Markdown，让 dsh 生成 ≤ 200 字摘要，含 5 个核心变更点
2. **v1.1 GA plan v0.0 DRAFT 12 sections 摘要** —— 取 `docs/v1.1-ga-team-plan.md` 全部 12 sections 标题 + 摘要，让 dsh 生成 ≤ 300 字 TL;DR
3. **PRD-v1.1 §4 六项裁定摘要** —— 取 `docs/PRD-v1.1-product.md` §4 6 个裁定条款，让 dsh 生成 ≤ 150 字执行清单

### 1.5 newvps RAM 实测（裁定 2 前置）

v1.1 M1 调度层部署 = newvps 共址（1 orch + 1 commander + kernel 容器 + 1 worker）。必须实测 newvps 当前 RAM 余量 ≥ 估测值 1.5x。

```bash
ssh newvps "free -h && echo '---' && docker stats --no-stream"
```

**估测值**（M0b DD-1 给）：
- orch container：~500MB
- commander container：~300MB
- kernel container：~200MB（v1.0 runtime）
- worker container：~200MB
- 系统 + Docker daemon：~500MB
- **总估测**：~1.7GB

**newvps 实测要求**：总 RAM ≥ 4GB（估测值 1.7GB × 2.5x 余量）

### 1.6 硬约束（HARD CONSTRAINTS）

- ❌ **禁止部署 v1.1 wrapper**（M0c 才开）
- ❌ 不锁具体型号（写 `class: worker`，不写 `model: "MiniMax-M3"`）
- ❌ 不锁 RAM 具体数字（用 `total_gb` + `available_gb` 字段，不预设）
- ✅ 用 dsh CLI 跑摘要 A 任务至少 3 次
- ✅ newvps RAM 实测必须在 ssh 命令下输出 `free -h` 原始输出
- ✅ 报告 commit 到 `docs/DISPATCH-T-M0b-DO-1.md`（替换本 DISPATCH 占位段）

---

## §2 输入

### 2.1 前置依赖

- v1.0.0 GA tag `ab8749a` 已 released（✅ 2026-09-01）
- dsh CLI 安装（同 T-M0b-BE-1）
- 模型 API key：worker 档模型（由执行者决定）
- newvps ssh 访问权限（已有 Tailscale 拓扑）

### 2.2 输入材料

| 材料 | 路径 | 用途 |
|------|------|------|
| v1.1 GA plan v0.0 DRAFT | `docs/v1.1-ga-team-plan.md` | 摘要任务 2 输入 |
| CHANGELOG.md [1.0.0] 段 | `CHANGELOG.md` | 摘要任务 1 输入 |
| PRD-v1.1 §4 | `docs/PRD-v1.1-product.md` | 摘要任务 3 输入 |
| 裁定 2（newvps 共址）| `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 2 | RAM 实测依据 |
| newvps ssh 配置 | `~/.ssh/config` 或 Tailscale ACL | RAM 实测访问 |

---

## §3 产出

### 3.1 主产出（必交付）

**文件**：`docs/DISPATCH-T-M0b-DO-1.md`（替换本 DISPATCH 占位段，在 §6 报告模板处填写）

**报告必含 7 段**（详见 §6 模板）：

1. 任务定义（哪个摘要 A 任务、为什么选）
2. dsh 调用 trace（命令 + 摘要输出 + token）
3. 至少 3 次运行的中位数（wall / token / 摘要字数 / 质量分）
4. 摘要结果 + 5 个核心点提取
5. dsh 能力评估（摘要类强项 + 弱项 + worker 档适配度）
6. **newvps RAM 实测**（`free -h` 输出 + 估测对比 + 余量判断）
7. **裁定 2 newvps 共址可行性结论**（PASS / 升独立 VPS / 减 commander+worker 数量）

### 3.2 副产出（建议）

- `spec/capabilities/_m0b_draft/worker.json`：

```json
{
  "class": "worker",
  "provider": "deepseek",
  "model_id": "deepseek-chat",
  "tier": "low-cost-batch",
  "cost_per_1k_input_tokens_usd": 0.00014,
  "cost_per_1k_output_tokens_usd": 0.00028,
  "max_context_tokens": 16000,
  "m0b_evidence": {
    "task_id": "T-M0b-DO-1",
    "report": "docs/DISPATCH-T-M0b-DO-1.md",
    "median_wall_seconds": null,
    "median_tokens": null,
    "quality_score_1to5": null
  }
}
```

- `spec/capabilities/_m0b_draft/newvps_ram.json`：

```json
{
  "host": "newvps",
  "measured_at": "2026-09-01T00:00:00Z",
  "total_gb": null,
  "available_gb": null,
  "docker_daemon_overhead_gb": null,
  "m1_estimates_gb": {
    "orch": 0.5,
    "commander": 0.3,
    "kernel": 0.2,
    "worker": 0.2,
    "system_plus_docker": 0.5,
    "total": 1.7
  },
  "verdict": null,
  "verdict_reason": null
}
```

### 3.3 git commit

```bash
git add docs/DISPATCH-T-M0b-DO-1.md spec/capabilities/_m0b_draft/worker.json spec/capabilities/_m0b_draft/newvps_ram.json
git commit -m "feat(m0b): T-M0b-DO-1 dsh 摘要 A 任务 worker 档实测 + newvps RAM

- dsh CLI 跑 1 个摘要 A 任务（CHANGELOG [1.0.0] / v1.1 GA plan /
  PRD-v1.1 §4 三选一）至少 3 次取中位数
- newvps RAM 实测（裁定 2 前置；ssh + free -h + docker stats）
- 报告含 trace + 摘要输出 + worker 档适配度 + newvps 共址可行性
- spec/capabilities/_m0b_draft/worker.json + newvps_ram.json 草案

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## §4 架构师验证命令

```bash
# 1. 报告存在 + 含 7 段
test -f docs/DISPATCH-T-M0b-DO-1.md
grep -cE "^## 任务定义|^## dsh 调用 trace|^## 中位数|^## 摘要结果|^## dsh 能力评估|^## newvps RAM 实测|^## 裁定 2 可行性结论" docs/DISPATCH-T-M0b-DO-1.md
# 期望: 7

# 2. worker 档 capability JSON 草案
test -f spec/capabilities/_m0b_draft/worker.json
jq -e '.class == "worker" and .tier == "low-cost-batch"' spec/capabilities/_m0b_draft/worker.json

# 3. newvps RAM JSON 草案
test -f spec/capabilities/_m0b_draft/newvps_ram.json
jq -e '.host == "newvps" and .total_gb != null and .verdict != null' spec/capabilities/_m0b_draft/newvps_ram.json

# 4. 不锁型号守门
grep -E "Fable 5|GLM 5.3|MiniMax-M3" docs/DISPATCH-T-M0b-DO-1.md spec/capabilities/_m0b_draft/worker.json spec/capabilities/_m0b_draft/newvps_ram.json
# 期望: 无输出

# 5. 至少 3 次运行
grep -cE "中位数|median" docs/DISPATCH-T-M0b-DO-1.md
# 期望: ≥ 1

# 6. v1.0 runtime 不漂移守门
git diff v1.0.0..HEAD -- harness/ spec/ spikes/ adr/0001-0009.md Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0
```

---

## §5 估时 + 风险

### 5.1 估时

- dsh CLI 配置：0.5d
- newvps ssh 测试 + `free -h` + `docker stats`：0.5d
- 选摘要 A 任务 + 写 dsh 提示词：0.25d
- dsh 跑 3 次 + 收摘要 + token：0.25d
- 写报告 7 段 + capability JSON + newvps RAM JSON：0.5d
- **合计：2d**（与 v1.1 GA plan §2.3 T-M0b-DO-1 估时对齐）

### 5.2 风险

| # | 风险 | 缓解 |
|---|------|------|
| **R-DO-1** | newvps ssh 不通（Tailscale 抖动 / 配置漂移）| 走 proxy 重连；失败转 DISPATCH-T-M0b-DO-1-FAIL |
| **R-DO-2** | newvps RAM 不够（裁定 2 失败）| 报告标 FAIL；通知架构师；先减 commander/worker 数量，不先加机器 |
| **R-DO-3** | dsh 摘要能力 < 3/5（worker 档不适配）| 报告中明示，由 QA-1 跑等价类对比核实 |
| **R-DO-4** | dsh 摘要输出字数超限 / 漏核心点 | 提示词调优；仍不行标 FAIL |

### 5.3 H-1 + 裁定 2 失败处理

| 失败类型 | 处理 |
|---------|------|
| **H-1 dsh 摘要类 FAIL** | capability JSON 标 `quality_score_1to5: null`；通知 QA-1 + 架构师，启动「鱼之重新定义」评估 |
| **裁定 2 newvps RAM FAIL** | newvps_ram.json 标 `verdict: "FAIL"` + `verdict_reason`；通知架构师，启动裁定 2 选项 (b) 独立 VPS 评估 |

---

## §6 报告模板（执行者填写）

### §6.1 任务定义

- **摘要 A 任务选择**：____（CHANGELOG [1.0.0] / v1.1 GA plan / PRD-v1.1 §4 三选一）
- **选择理由**：____

### §6.2 dsh 调用 trace

#### Run 1

- **dsh 命令**：`dsh ...`
- **wall time**：__s
- **input tokens**：__
- **output tokens**：__
- **摘要字数**：__
- **退出码**：__

#### Run 2

- **dsh 命令**：`dsh ...`
- **wall time**：__s
- **input tokens**：__
- **output tokens**：__
- **摘要字数**：__
- **退出码**：__

#### Run 3

- **dsh 命令**：`dsh ...`
- **wall time**：__s
- **input tokens**：__
- **output tokens**：__
- **摘要字数**：__
- **退出码**：__

### §6.3 中位数（3 次取中位）

- **wall time 中位数**：__s
- **input tokens 中位数**：__
- **output tokens 中位数**：__
- **摘要字数中位数**：__

### §6.4 摘要结果

- **dsh 实际输出**（取 Run 2 示例）：
```

（粘贴 dsh 输出原文）

```

- **5 个核心点提取**：
  1. __
  2. __
  3. __
  4. __
  5. __
- **质量分**（1-5）：__

### §6.5 dsh 能力评估（本次跑）

- **强项**：__
- **弱项**：__
- **worker 档位适配度**（1-5）：__

### §6.6 newvps RAM 实测

**`free -h` 输出**（ssh newvps）：
```

（粘贴原始输出）

```

- **total_gb**：__
- **available_gb**：__
- **M1 估测总需求**（orch + commander + kernel + worker + system）：1.7 GB
- **余量判断**：available_gb / 1.7 = __倍

### §6.7 裁定 2 newvps 共址可行性结论

- **verdict**：__（PASS / FAIL / 升独立 VPS）
- **理由**：__

### §6.X 三姿势候选（执行者按 DEEPSEEK_API_KEY 可用性 + 用户偏好选）

> 三路径 spike 实测并行设计 ——
> 姿势 A：dsh + profile override（v1.1 GA plan 钦定路径，需 DEEPSEEK_API_KEY）
> 姿势 B：DeepSeek REST API 直跑（绕开 dsh，直接验证 H-1 模型能力）
> 姿势 C：架构判定（A + B 数据回填后由架构师判定 H-1/H-2/H-3）
>
> 详细设计：`docs/v1.1-m0b-three-path-spike-plan.md` §0 修订对照表 + §2.1 §6.X 模板 + §2.2 4 yaml + §2.3 rest-spike.py。

#### 姿势 A：dsh + profile override（本任务 = DO-1 worker 档）

**前置**：
- `npm install -g @deepseek-ai/dsh`（v0.1.1-rc.2 / 455 packages / ~30s）
- `export DEEPSEEK_API_KEY=sk-...`
- newvps ssh 访问权限（裁定 2 前置；已有 Tailscale 拓扑）

**profile override（base + worker 档）**：
- `docs/m0b/profile-override-base.yaml` —— 启 8 工具；sandbox=workspace-write；telemetry=DISABLED；approval=ask
- `docs/m0b/profile-override-worker.yaml` —— model = `deepseek-v4-flash`（DO-1 worker 档；vision-exp 作探索臂）

**跑命令**：
```bash
time dsh --profile web \
  --patch docs/m0b/profile-override-base.yaml \
  --patch docs/m0b/profile-override-worker.yaml \
  -- "<§1.4 三选一摘要 A 任务 prompt>"
```

**trace 采集 + 落地**：`tmp/m0b-do-1-a.log`

#### 姿势 B：DeepSeek REST API

**前置**：同 BE-1

**spike runner**：`docs/m0b/m0b-rest-spike.py`

**跑命令**（DO-1 跑 summary 类）：
```bash
python3 docs/m0b/m0b-rest-spike.py \
  --class worker \
  --task summary \
  --input tmp/m0b-input-do-1.txt \
  --output tmp/m0b-output-do-1.json
```

**落地 trace**：`tmp/m0b-output-do-1.json` + `tmp/m0b-output-do-1.log`

**姿势 B 适用边界**：
- ✅ 文本型 A 类任务（summary）—— REST 单轮可验证模型能力
- ❌ code-change（TG-1 范围）
- ❌ multi-turn
- 探索臂：`--model deepseek-v4-flash-vision-exp` 用于"看图"摘要

#### 姿势 C：架构判定

执行者**不**直接填——架构师在 A + B 数据回填后填 H-1/H-2/H-3 PASS/FAIL/PARTIAL/ABSTAIN。

#### newvps RAM 实测（裁定 2 前置 — 与 spike 实测并行）

```bash
ssh newvps "free -h && echo '---' && docker stats --no-stream"
```

实测输出落 `tmp/m0b-do-1-newvps-free.txt` + `tmp/m0b-do-1-newvps-docker-stats.txt`，报告 §6.6 / §6.7 模板填实。

#### 执行者选择指南

| DEEPSEEK_API_KEY | 任务类型 | 建议姿势 |
|-----------------|---------|---------|
| 有 + 想验证 dsh 真实能力 | summary | 姿势 A（主）+ 姿势 B（对照） |
| 有 + 只想快速验证 H-1 模型能力 | 文本型（summary） | 姿势 B（单跑） |
| 无 | — | 仅跑 newvps RAM 实测 + 报告"Not run: DEEPSEEK_API_KEY missing" |

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.3 + §3 + §4.1 + §5 R-3 + §6 PR1 + §7.3 + §10.1
- `docs/PRD-v1.1-product.md` §3 H-1 + §4.2 + §4.6
- `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 2（newvps 共址）+ 裁定 5（等价类）+ 裁定 6（M0b 范围）
- `docs/PRD-V0.1-NORTH-STAR.md` §3 A-4
- `docs/v1.0-ga-team-plan.md`（frozen, 参考）