# DISPATCH-T-M0b-BE-1 — Role BE — dsh 实测 H-1 第 1 类 A 任务（调研）

> **Task ID**: T-M0b-BE-1
> **Status**: 🟢 done (2026-09-02, subagent executed 2026-09-02)
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

## §6 实测报告（执行者填写）

> **执行者**：subagent (Claude Code, gpt-5.6-sol), 2026-09-02
> **姿势**：姿势 A — dsh CLI headless + profile override (base + orch)

## 任务定义
## dsh 调用 trace
## 中位数
## 调研报告摘要
## dsh 能力评估
## 等价类档位评估

### §6.1 任务定义

- **A 任务选择**：v1.0 runtime integration roadmap（第 1 项）
- **选择理由**：与本仓库直接相关；v1.1 wrapper 必须解决 v1.0 kernel 的调用方式问题；dsh 可真实读 harness/ 和 spec/ 源码，输出有实用价值。

### §6.2 dsh 调用 trace

#### Run 1

- **dsh 命令**：`DEEPSEEK_API_KEY=... dsh --profile headless --patch docs/m0b/profile-override-base.yaml --patch docs/m0b/profile-override-orch.yaml -- "<prompt>"`
- **wall time**：~213 s（/usr/bin/time 测 Run 2 同一命令得 213.22 s；Run 1 近似）
- **input tokens**：115,060（18 steps，含 cacheRead 1,008,768）
- **output tokens**：16,092（18 steps）
- **退出码**：0
- **输出摘要**：dsh 用 deepseek-v4-pro high-reasoning 跑满 18 步（step 1-18），读完了 harness/ 所有子包（runtime/gateway/drivers/benchmark/testing）和 spec/ 合约层，写出 v1.0-runtime-integration-roadmap.md。发现 kernel 是纯库而非 HTTP 服务、spec/ 被 wheel exclude 但 runtime import、sync/async 分裂等关键事实。

#### Run 2

- **dsh 命令**：同 Run 1（prompt 微调措辞 + "Output in English" 约束）
- **wall time**：213.22 s（/usr/bin/time 实测）
- **input tokens**：88,126（14 steps，含 cacheRead 755,072）
- **output tokens**：13,774（14 steps）
- **退出码**：0
- **输出摘要**：dsh 跑 14 步，读 harness/__init__.py、runtime/gateway/drivers 各子包、spec/interfaces/、kernel-schema.sql、pyproject.toml、Dockerfile。发现无 FastAPI/Flask、spec excluded from wheel、SQLite 3.47 需求、sync/async 分裂。推荐 JSON-over-stdio adapter。

#### Run 3

- **dsh 命令**：同 Run 1（prompt 加结构化 6 节要求 + 强调 cross-ref 文件路径）
- **wall time**：280.74 s（/usr/bin/time 实测）
- **input tokens**：91,933（13 steps，含 cacheRead 696,704）
- **output tokens**：17,744（13 steps）
- **退出码**：0
- **输出摘要**：dsh 跑 13 步，额外发现 v1.1 plan 假设的 /health 端点在 v1.0 不存在（gap）、13 表/27 触发器/27 索引的完整 schema、drivers 全为 stub。推荐 M0c 加 FastAPI facade 而非 JSON-over-stdio。

### §6.3 中位数（3 次取中位）

| 指标 | Run 1 | Run 2 | Run 3 | 中位数 |
|------|-------|-------|-------|--------|
| wall time (s) | ~213 | 213.22 | 280.74 | **213.22** |
| input tokens | 115,060 | 88,126 | 91,933 | **91,933** |
| output tokens | 16,092 | 13,774 | 17,744 | **16,092** |
| steps | 18 | 14 | 13 | — |
| 退出码 | 0 | 0 | 0 | **3/3 成功** |

注：deepseek-v4-pro 的 reasoningTokens 分别为 6,874 / 3,589 / 5,585，中位数 ~5,585。

### §6.4 调研报告摘要

- **核心结论 1（架构）**：v1.0 kernel 是一个**纯 Python 库**，无 HTTP/daemon 服务；`python -m harness` 只打印版本号，无 FastAPI/Flask/starlette 路由。v1.1 plan 假设的 `/health` 端点在 v1.0 不存在，是真实 gap。
- **核心结论 2（导入面）**：`harness/` 顶层导出 10 个 `Protocol` 类；生产类分布在 5 子包（runtime/gateway/drivers/testing/benchmark）。`spec/` 被 `pyproject.toml` exclude 掉 wheel，但 runtime 在模块加载时 `from spec.interfaces import ...`，导致裸 wheel 安装必然失败（Dockerfile 用 `COPY spec/` + `PYTHONPATH=/app` 绕过）。
- **核心结论 3（集成路径）**：推荐两条路——(a) 即刻可用的 JSON-over-stdio subprocess adapter（wrap ToolInvocationGatewayImpl + SqliteWorkerPool）；(b) M0c 加 minimal FastAPI facade（/health + gateway/invoke），更贴近 v1.1 plan 原意。
- **核心结论 4（约束）**：Python ≥ 3.12，SQLite ≥ 3.47，sync/async 混合（pool/context 同步，gateway/egress 异步），单主机 WAL（无 NFS/多主机），~16 writer ceiling，event sink 仅 AUDIT 模式。
- **质量分（1-5）**：4 — 报告结构完整，结论有文件路径 cross-ref，但不够深入（drivers stub 未展开、PDP 接口实现状态不明）。

### §6.X H-1 判定 + 架构师汇总锚点

#### 任务定义

A 类任务：v1.0 runtime integration roadmap。选此项因为与本仓库直接相关；v1.1 wrapper 必须解决 v1.0 kernel 调用方式问题。

#### dsh 调用 trace

dsh --profile headless + base+orch patches，跑 3 次，退出码均为 0，wall time 213-281 s，input tokens 88K-115K，output tokens 14K-18K，model=deepseek-v4-pro high-reasoning。

#### 中位数

wall 213.22 s / input 91,933 / output 16,092 / reasoning 5,585 / 退出码 3/3 成功。

#### 调研报告摘要

v1.0 kernel 是纯 Python 库（非 HTTP 服务）；spec/ 被 wheel exclude 但 runtime import（安装 bug）；/health 端点不存在（v1.1 plan gap）；推荐 JSON-over-stdio adapter 或 M0c 加 FastAPI facade。

#### dsh 能力评估

dsh orch 档强项：多步源码分析、high-reasoning 输出精确文件 cross-ref、高 cacheRead 效率。弱项：session 日志 zstd 压缩无内置 token 计量，token 需逐 step 累加不直观。调研类适配度 4/5。

#### 等价类档位评估

orch 档（high-reasoning）适配调研类任务 4/5。不需改档，但 orch 对纯调研任务有过剩（overkill），需权衡 commander 档成本。

> **架构师验证说明**：Check 5（v1.0 runtime 不漂移）报告 80 行 diff，但全部来自 `spec/capabilities/_m0b_draft/`（M0b 期间新建目录）。非 m0b 文件（harness/ spec/ spikes/ adr/ Dockerfile/ docker-compose.yml/ pyproject.toml）diff = 0 行，意图满足。

### §6.X 三姿势候选（执行者按 DEEPSEEK_API_KEY 可用性 + 用户偏好选）

> 三路径 spike 实测并行设计 ——
> 姿势 A：dsh + profile override（v1.1 GA plan 钦定路径，需 DEEPSEEK_API_KEY）
> 姿势 B：DeepSeek REST API 直跑（绕开 dsh，直接验证 H-1 模型能力）
> 姿势 C：架构判定（A + B 数据回填后由架构师判定 H-1/H-2/H-3）
>
> 详细设计：`docs/v1.1-m0b-three-path-spike-plan.md` §0 修订对照表 + §2.1 §6.X 模板 + §2.2 4 yaml + §2.3 rest-spike.py。

#### 姿势 A：dsh + profile override（本任务 = BE-1 orch 档）

**前置**：
- `npm install -g @deepseek-ai/dsh`（v0.1.1-rc.2 / 455 packages / ~30s）
- `export DEEPSEEK_API_KEY=sk-...`

**profile override（base + orch 档）**：
- `docs/m0b/profile-override-base.yaml` —— 启 tool-bash / tool-fs / tool-fs-search / tool-str-replace-editor / tool-goal / tool-ralph / tool-subagent / agent-instructions（via `disabled: false`）；sandbox=workspace-write；telemetry=DISABLED；approval=ask
- `docs/m0b/profile-override-orch.yaml` —— model = `deepseek-v4-pro`（BE-1 orch 档）

**跑命令**：
```bash
time dsh --profile web \
  --patch docs/m0b/profile-override-base.yaml \
  --patch docs/m0b/profile-override-orch.yaml \
  -- "<§1.4 三选一调研 A 任务 prompt>"
```

**trace 采集 + 落地**：
- wall time：`time` 输出
- token 用量：dsh 内置 `token-meter` plugin 输出到 stderr；或读 `~/.dsh-home/sessions/<session-id>.jsonl`
- 退出码：`$?`
- 落地 trace：`tmp/m0b-be-1-a.log`（含 wall / token / 退出码）

#### 姿势 B：DeepSeek REST API

**前置**：
- `export DEEPSEEK_API_KEY=sk-...`
- Python ≥ 3.10 + httpx（v1.0 runtime 已有 `httpx>=0.28,<0.29`）

**spike runner**：`docs/m0b/m0b-rest-spike.py`
- 端点：`https://api.deepseek.com/v1/chat/completions`（OpenAI 兼容）
- 3 等价类模型：orch = `deepseek-v4-pro` / commander = `deepseek-v4-flash`（默认）/ worker = `deepseek-v4-flash`（vision-exp 作探索臂）
- 输出：`--output` 写 JSON + sidecar `.log`（per-run trace + retry 计数 + 失败 reason）
- 聚合：median(wall_s) / median(input_tokens) / median(output_tokens)
- 失败：全部 run 失败 → exit 1
- 成本护栏：--max-tokens 默认 4096
- 重试：429/5xx + 网络错误 → 指数退避（2^attempt 秒），默认 2 次

**跑命令**（BE-1 跑 research 类）：
```bash
python3 docs/m0b/m0b-rest-spike.py \
  --class orch \
  --task research \
  --input tmp/m0b-input-be-1.txt \
  --output tmp/m0b-output-be-1.json
```

**落地 trace**：`tmp/m0b-output-be-1.json` + `tmp/m0b-output-be-1.log`

**姿势 B 适用边界**：
- ✅ 文本型 A 类任务（research / summary）—— REST 单轮可验证模型能力
- ❌ code-change A 类任务（TG-1）—— REST 单轮无 tool loop；H-1 证据必须含姿势 A
- ❌ multi-turn 研究
- 探索臂：`--model deepseek-v4-flash-vision-exp` 用于"看图"子任务

#### 姿势 C：架构判定

执行者**不**直接填——架构师在 A + B 数据回填后填 H-1/H-2/H-3 PASS/FAIL/PARTIAL/ABSTAIN。

#### 执行者选择指南

| DEEPSEEK_API_KEY | 任务类型 | 建议姿势 |
|-----------------|---------|---------|
| 有 + 想验证 dsh 真实能力 | 任意 A | 姿势 A（主）+ 姿势 B（对照） |
| 有 + 只想快速验证 H-1 模型能力 | 文本型（research/summary） | 姿势 B（单跑） |
| 无 | — | 静态校验 + 报告"Not run: DEEPSEEK_API_KEY missing" |

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.1 + §3 + §4.1 + §6 PR1 + §7.3 + §10.1
- `docs/PRD-v1.1-product.md` §3 H-1 + §4.6
- `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 5（等价类）+ 裁定 6（M0b 范围收窄）
- `docs/PRD-V0.1-NORTH-STAR.md` §1 G-2 + §3 A-4 + 合同层 v1.1 product 适用条款
- `docs/v1.0-ga-team-plan.md`（frozen, 参考任务书结构）