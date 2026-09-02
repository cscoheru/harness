# DISPATCH-T-M0b-TG-1 — Role TG — dsh 实测 H-1 第 2 类 A 任务（改代码）

> **Task ID**: T-M0b-TG-1
> **Status**: 🟢 done (2026-09-02)
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
- ❌ 不锁具体型号（写 `class: commander`，不写 `model: "[model-id]"`）
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

Co-Authored-By: Claude Code <noreply@anthropic.com>"
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

## §6 报告（执行者填写 — 2026-09-02）

## 任务定义

### §6.1 任务定义

- **A 任务选择**：① v1.0 `harness/runtime/_db.py` 加 `connect_with_fk_ro()` 只读连接方法
- **选择理由**：最小接触面（单文件 + 单一新函数），API 设计有明确约束（签名 / PRAGMA / docstring），验证可客观量化（query_only=1 / write blocked），是最安全的沙箱实测任务
- **沙箱路径**：`tmp/m0b-tg-1/`

## dsh 调用 trace

### §6.2 dsh 调用 trace

> **dsh profile**: `headless` (CLI 单轮模式; web profile 是 Web UI 不适合 batch; headless 支持 `--patch`)
> **profile override**: `profile-override-base.yaml` (启 tool-bash/fs/str-replace-editor/goal/ralph/subagent/agent-instructions) + `profile-override-commander.yaml` (model=deepseek-v4-flash)
> **telemetry**: DISABLED（profile-override-base.yaml pin）
> **token 用量**: telemetry DISABLED，无 per-run token 计数；session JSONL 未落地（~/.dsh-home/sessions/ 空）

#### Run 1

- **dsh 命令**：`dsh --profile headless --patch docs/m0b/profile-override-base.yaml --patch docs/m0b/profile-override-commander.yaml '<prompt (中文，详细)>'`
- **wall time**：83.77s
- **input tokens**：N/A (telemetry=OFF)
- **output tokens**：N/A (telemetry=OFF)
- **diff 行数**：+53 行（1 行 `__all__` + 52 行新函数）
- **退出码**：0

#### Run 2

- **dsh 命令**：同上 prompt 措辞微调（中文，同义结构）
- **wall time**：76.51s
- **input tokens**：N/A
- **output tokens**：N/A
- **diff 行数**：+53 行（内容与 Run 1 一致）
- **退出码**：0

#### Run 3

- **dsh 命令**：同上 prompt 改为英文
- **wall time**：43.87s
- **input tokens**：N/A
- **output tokens**：N/A
- **diff 行数**：+53 行（内容与 Run 1 一致）
- **退出码**：0

## 中位数

### §6.3 中位数（3 次取中位）

- **wall time 中位数**：76.51s（Run 2）
- **input tokens 中位数**：N/A（telemetry OFF）
- **output tokens 中位数**：N/A（telemetry OFF）
- **diff 行数 中位数**：53 行（3 次完全一致）
- **diff 一致性**：3/3 — 三次 prompt 措辞不同（中文详细 / 中文简化 / 英文），但 diff 完全相同；dsh 输出的函数逻辑（URI mode=ro / query_only / foreign_keys / read_uncommitted / path=None tempfile+reopen）完全一致

## 改代码结果

### §6.4 改代码 diff 摘要

**关键改动 1** — `__all__` 加 `"connect_with_fk_ro"` 导出

**关键改动 2** — `connect_with_fk_ro()` 函数体（52 行）：
- 签名：`def connect_with_fk_ro(path: str | None = None, row_factory: bool = True) -> sqlite3.Connection`
- `path=None` 时：用 `tempfile.mkstemp` 创建临时 DB，通过临时可写连接应用 `kernel-schema.sql`，关闭可写连接，以 `sqlite3.connect(f"{Path(path).resolve().as_uri()}?mode=ro", uri=True)` 重开只读连接
- `path` 非 None 时：直接 `sqlite3.connect(f"{Path(path).resolve().as_uri()}?mode=ro", uri=True)` 只读 URI
- `conn.execute("PRAGMA foreign_keys = ON")` + 断言 `== 1`
- `conn.execute("PRAGMA query_only = ON")`（SQL 层写拦截）
- `conn.execute("PRAGMA read_uncommitted = 1")`（读未提交隔离）
- `row_factory` 处理同 `connect_with_fk()`
- docstring 完整（双层写保护说明 + Args + Returns）

**关键改动 3** — 无（未改动原 `connect_with_fk()` 或其他函数）

**改动的合理性**：只读连接是 v1.0 runtime 合规需求（ADR-0009 WAL 约束下读流量不应写）；URI `mode=ro` + `query_only=ON` 双层防御符合 SQLite 安全最佳实践；path=None 时先建 schema 再 reopen 只读是合理设计；docstring 覆盖了 dual-layer protection 语义

## pytest 验证

### §6.5 pytest 验证

- **v1.0 runtime 原有 suite**：无 test_db.py / harness/testing/ 为空（stress_test.py 收集 0 items）；`git diff v1.0.0..HEAD -- harness/` 确认原文件零漂移（0 行 diff）
- **沙箱内新 pytest（4 项）**：全部 PASS
  1. `connect_with_fk_ro in __all__`
  2. `path=None`: FK=1 / query_only=1 / read_uncommitted=1 / tasks 表存在
  3. `INSERT blocked` → `sqlite3.OperationalError: attempt to write a readonly database`
  4. `SELECT 1` 读正常
- **pytest exit code**：0

## dsh 能力评估

## commander 档位适配度

### §6.6 dsh 能力评估（本次跑）

- **强项**：
  - 正确理解和补全函数签名（含类型注解 `str | None` / `bool` / `sqlite3.Connection`）
  - 正确实现 SQLite 只读连接（URI mode=ro 双层防御：文件层 + SQL 层 query_only）
  - docstring 质量高（说明 dual-layer protection、Args、Returns、v0.9-A P0-9C 引用）
  - 验证意识强（3 次都主动跑验证命令确认 query_only=1）
  - 对 `path=None` 边界情况处理正确（先可写建 schema 再只读 reopen）
  - 三次 prompt 措辞不同但输出一致（diff 完全相同），说明模型行为稳定
  - 理解沙箱隔离（使用 `git diff --no-index` 对比仓库原版；报告 tmp/ 在 .gitignore 中）
- **弱项**：
  - 不报告 token 用量（telemetry DISABLED 且 headless profile 无内置 token meter）；需手动开启 `~/.dsh-home/profiles/headless/profile.yaml` 中的 token-meter plugin 才能拿到 per-run token 数据
  - 对 `headless` vs `web` profile 的区别有摸索过程（web 是 Web UI 不适合 batch）；文档中明确 `headless` 才适合 CLI 单轮任务
  - prompt 中含反斜杠 `\?` 等特殊字符时 dsh 解析报错，prompt 需用单行字符串
- **commander 档位适配度（1-5）**：**4/5** — deepseek-v4-flash 在 commander 档（中上下文 / 单工作流编排）下改 Python 代码能力很强，diff 一致性 3/3，无语法错误，pytest 全绿。扣 1 分因为无 token 用量数据（需配置 token-meter plugin 才能获取）

### §6.7 H-1 判定

**结果：PASS**

**理由**：dsh (deepseek-v4-flash, commander 档) 在沙箱内完成改代码任务 3/3 次，diff 一致性 100%（+53 行完全相同），pytest 全绿，v1.0 runtime 零漂移。模型正确处理了 SQLite 只读连接的全部技术细节（URI mode=ro、query_only、path=None 边界、PRAGMA 断言）。telemetry OFF 导致无 token 数据不影响 H-1 判定（能力证据已充分）。

### §6.X 三姿势候选（执行者按 DEEPSEEK_API_KEY 可用性 + 用户偏好选）

> 三路径 spike 实测并行设计 ——
> 姿势 A：dsh + profile override（v1.1 GA plan 钦定路径，需 DEEPSEEK_API_KEY）
> 姿势 B：DeepSeek REST API 直跑（绕开 dsh，直接验证 H-1 模型能力）
> 姿势 C：架构判定（A + B 数据回填后由架构师判定 H-1/H-2/H-3）
>
> 详细设计：`docs/v1.1-m0b-three-path-spike-plan.md` §0 修订对照表 + §2.1 §6.X 模板 + §2.2 4 yaml + §2.3 rest-spike.py。

#### 姿势 A：dsh + profile override（本任务 = TG-1 commander 档）

**前置**：
- `npm install -g @deepseek-ai/dsh`（v0.1.1-rc.2 / 455 packages / ~30s）
- `export DEEPSEEK_API_KEY=sk-...`

**profile override（base + commander 档）**：
- `docs/m0b/profile-override-base.yaml` —— 启 tool-bash / tool-fs / tool-fs-search / tool-str-replace-editor / tool-goal / tool-ralph / tool-subagent / agent-instructions；sandbox=workspace-write；telemetry=DISABLED；approval=ask
- `docs/m0b/profile-override-commander.yaml` —— model = `deepseek-v4-flash`（TG-1 commander 档；dsh 默认模型）

**跑命令**（必须在 `tmp/m0b-tg-1/` 沙箱内执行）：
```bash
cd tmp/m0b-tg-1
time dsh --profile headless \
  --patch docs/m0b/profile-override-base.yaml \
  --patch docs/m0b/profile-override-commander.yaml \
  -- "<§1.4 三选一改代码 A 任务 prompt>"
```

**trace 采集 + 落地**：
- wall time / token / 退出码：dsh stderr + `$?`
- diff：dsh 输出 + `git diff` 在沙箱内
- 落地 trace：`tmp/m0b-tg-1-a.log`

#### 姿势 B：DeepSeek REST API

**前置**：同 BE-1

**spike runner**：`docs/m0b/m0b-rest-spike.py`（同 BE-1）

**跑命令**（TG-1 跑 code-change 类 — ⚠️ **不构成 H-1 证据**，仅对照）：
```bash
python3 docs/m0b/m0b-rest-spike.py \
  --class commander \
  --task code-change \
  --input tmp/m0b-input-tg-1.txt \
  --output tmp/m0b-output-tg-1.json
```

**落地 trace**：`tmp/m0b-output-tg-1.json` + `tmp/m0b-output-tg-1.log`

**姿势 B 适用边界（M5）**：
- ❌ **TG-1 code-change 不被姿势 B 覆盖**：REST single-turn 无 tool loop，只能"单次吐代码块"，**无法真实验证改代码能力**（diff 落盘 + pytest 跑不了）
- ⚠️ TG-1 H-1 覆盖率判定 = 姿势 A 跑出的 diff 行数 + pytest 通过率；姿势 B 输出仅作"模型是否能写合理代码块"对照
- ✅ 文本型 A 任务（research/summary）用姿势 B 验有效
- 探索臂：`--model deepseek-v4-flash-vision-exp` 用于"看图"子任务

#### 姿势 C：架构判定

执行者**不**直接填——架构师在 A + B 数据回填后填 H-1/H-2/H-3 PASS/FAIL/PARTIAL/ABSTAIN。

#### 执行者选择指南

| DEEPSEEK_API_KEY | 任务类型 | 建议姿势 |
|-----------------|---------|---------|
| 有 + 想验证 dsh 真实能力 | code-change | **姿势 A 必跑**；姿势 B 仅对照 |
| 有 + 只想快速验证 H-1 模型能力 | 文本型（research/summary） | 姿势 B（单跑） |
| 无 | — | 静态校验 + 报告"Not run: DEEPSEEK_API_KEY missing" |

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.2 + §3 + §4.1 + §6 PR1 + §7.3 + §10.1
- `docs/PRD-v1.1-product.md` §3 H-1 + §4.6
- `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 5 + 裁定 6
- `docs/PRD-V0.1-NORTH-STAR.md` §3 A-4
- `docs/v1.0-ga-team-plan.md`（frozen, 参考）