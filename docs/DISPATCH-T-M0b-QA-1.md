# DISPATCH-T-M0b-QA-1 — Role QA — H-2 三层等价类对比 + H-3 wrapper 缺失点 LOC 估算

> **Task ID**: T-M0b-QA-1
> **Status**: 🟡 pending（派发中，等 T-M0b-BE-1 + T-M0b-TG-1 + T-M0b-DO-1 完成后执行）
> **Date**: 2026-09-01
> **Author**: 架构师（v1.1 GA plan v0.0 DRAFT §2.4 派发）
> **Receiving Agent**: Role QA — Spike 验证 & E2E 工程师（v1.1+）
> **Parent Plan**: `docs/v1.1-ga-team-plan.md` §2.4
> **Adjudication Source**: `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 5（等价类）+ 裁定 6 + `docs/PRD-v1.1-product.md` §3 H-2/H-3

---

## §1 任务定义

### 1.1 一句话

基于 T-M0b-BE-1 + T-M0b-TG-1 + T-M0b-DO-1 三份 spike 报告，跑 H-2 三层等价类对比（orch/commander/worker 三档各跑同一 A 任务的能力差异）+ H-3 wrapper 缺失点清单 + TypeScript LOC 估算范围 + capability JSON 落地 `spec/capabilities/`。

### 1.2 任务来源

PRD-v1.1 §3 三假设中 H-2 + H-3：
- **H-2**：三层等价类各跑同一 A 任务能力差异成立（**裁定 5**：等价类约束，不锁具体型号）
- **H-3**：TypeScript wrapper 缺失点 → LOC 估计（**不预设 2500-3000**）

### 1.3 硬约束（HARD CONSTRAINTS）

- ❌ 不写 TypeScript wrapper 代码（仅 LOC 估算）
- ❌ 不锁具体 LOC（写范围如 `1500-3500`，不写 `2500`）
- ❌ 不锁具体型号（capability JSON 用 `class`/`tier` 字段）
- ❌ **禁止动 v1.0 runtime**（`harness/` + `spec/` + `spikes/` + `_helpers.py` + 9 ADR body）
- ✅ capability JSON 从 `_m0b_draft/` mv 到 `spec/capabilities/`（3 SKU + newvps_ram）
- ✅ H-3 LOC 估算必含 3 类：orch wrapper / commander wrapper / worker wrapper
- ✅ 报告含等价类对比表（orch vs commander vs worker 跑同一任务的差异）

---

## §2 输入

### 2.1 前置依赖（必须全部完成）

- T-M0b-BE-1 done（调研 A 任务 orch 档 spike 报告）
- T-M0b-TG-1 done（改代码 A 任务 commander 档 spike 报告）
- T-M0b-DO-1 done（摘要 A 任务 worker 档 spike 报告 + newvps RAM）

### 2.2 输入材料

| 材料 | 路径 | 用途 |
|------|------|------|
| BE-1 报告 | `docs/DISPATCH-T-M0b-BE-1.md` | orch 档调研 spike 数据 |
| TG-1 报告 | `docs/DISPATCH-T-M0b-TG-1.md` | commander 档改代码 spike 数据 |
| DO-1 报告 | `docs/DISPATCH-T-M0b-DO-1.md` | worker 档摘要 + newvps RAM spike 数据 |
| BE-1 capability 草案 | `spec/capabilities/_m0b_draft/orch.json` | mv 到 `spec/capabilities/orch.json` |
| TG-1 capability 草案 | `spec/capabilities/_m0b_draft/commander.json` | mv 到 `spec/capabilities/commander.json` |
| DO-1 capability 草案 | `spec/capabilities/_m0b_draft/worker.json` + `newvps_ram.json` | mv 到 `spec/capabilities/` |
| 裁定 5 | `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 5 | 等价类约束 |
| 裁定 6 | `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 6 | M0b 范围收窄 |

---

## §3 产出

### 3.1 主产出（必交付）

**文件**：`docs/DISPATCH-T-M0b-QA-1.md`（替换本 DISPATCH 占位段，在 §6 报告模板处填写）

**报告必含 7 段**（详见 §6 模板）：

1. 三份 spike 报告摘要（BE-1 / TG-1 / DO-1 各 1 段）
2. **H-2 等价类对比表**（orch / commander / worker 跑同一 A 任务的能力差异）
3. **H-2 等价类假设判定**（PASS / FAIL + 理由）
4. **H-3 wrapper 缺失点清单**（dsh 已覆盖 vs 缺什么）
5. **H-3 TypeScript LOC 估算范围**（orch wrapper / commander wrapper / worker wrapper / 总和范围；不锁数字）
6. **capability JSON 落地**（mv + 内容校验）
7. **H-2/H-3 总判定**（H-1 PASS/H-2 PASS/H-3 PASS 任一 FAIL 触发「鱼之重新定义」评估）

### 3.2 副产出（必交付）

```bash
# mv 4 个 capability JSON 到 spec/capabilities/（QA-1 后正式落地）
mkdir -p spec/capabilities
mv spec/capabilities/_m0b_draft/orch.json spec/capabilities/orch.json
mv spec/capabilities/_m0b_draft/commander.json spec/capabilities/commander.json
mv spec/capabilities/_m0b_draft/worker.json spec/capabilities/worker.json
mv spec/capabilities/_m0b_draft/newvps_ram.json spec/capabilities/newvps_ram.json
rmdir spec/capabilities/_m0b_draft
```

**`spec/capabilities/orch.json`** 等 4 文件最终内容（含 m0b_evidence + quality_score 填实）。

### 3.3 git commit

```bash
git add docs/DISPATCH-T-M0b-QA-1.md spec/capabilities/
git commit -m "feat(m0b): T-M0b-QA-1 H-2 等价类对比 + H-3 LOC 估算 + capability 落地

- H-2 三层等价类对比表（orch/commander/worker 跑同一 A 任务）
- H-3 wrapper 缺失点清单 + TypeScript LOC 估算范围（orch +
  commander + worker + 总和；不锁数字）
- spec/capabilities/{orch,commander,worker,newvps_ram}.json 落地
  (mv from _m0b_draft)
- H-1/H-2/H-3 总判定（H-1 FAIL 触发 鱼之重新定义 评估）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## §4 架构师验证命令

```bash
# 1. QA-1 报告存在 + 含 7 段
test -f docs/DISPATCH-T-M0b-QA-1.md
grep -cE "^## 三份 spike 报告摘要|^## H-2 等价类对比表|^## H-2 等价类假设判定|^## H-3 wrapper 缺失点清单|^## H-3 LOC 估算范围|^## capability JSON 落地|^## H-2/H-3 总判定" docs/DISPATCH-T-M0b-QA-1.md
# 期望: 7

# 2. capability JSON 落地（4 文件）
test -f spec/capabilities/orch.json
test -f spec/capabilities/commander.json
test -f spec/capabilities/worker.json
test -f spec/capabilities/newvps_ram.json
test ! -d spec/capabilities/_m0b_draft  # 已删除

# 3. 3 类 capability JSON class + tier 字段正确
jq -e '.class == "orch" and .tier == "high-reasoning"' spec/capabilities/orch.json
jq -e '.class == "commander" and .tier == "mid-context"' spec/capabilities/commander.json
jq -e '.class == "worker" and .tier == "low-cost-batch"' spec/capabilities/worker.json

# 4. 不锁型号守门（NORTH-STAR A-4 等价类）
grep -E "Fable 5|GLM 5.3|MiniMax-M3" docs/DISPATCH-T-M0b-QA-1.md spec/capabilities/*.json
# 期望: 无输出

# 5. H-3 LOC 估算范围格式（必须含 - 连字符范围）
grep -cE "^[ ]*[0-9]+-[0-9]+" docs/DISPATCH-T-M0b-QA-1.md
# 期望: ≥ 4（orch + commander + worker + 总和）

# 6. v1.0 runtime 不漂移守门
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ adr/0001-0009.md Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0

# 7. 等价类对比表存在（markdown table）
grep -cE "^\|.*orch.*\|.*commander.*\|.*worker.*\|" docs/DISPATCH-T-M0b-QA-1.md
# 期望: ≥ 1
```

---

## §5 估时 + 风险

### 5.1 估时

- 读 3 份 spike 报告 + capability 草案：0.5d
- H-2 等价类对比表 + 判定：0.5d
- H-3 wrapper 缺失点清单 + LOC 估算：1d
- capability JSON 落地 + 校验：0.5d
- 写报告 7 段：0.5d
- **合计：3d**（与 v1.1 GA plan §2.4 T-M0b-QA-1 估时对齐）

### 5.2 风险

| # | 风险 | 缓解 |
|---|------|------|
| **R-QA-1** | 3 份 spike 报告缺失（如 BE-1 失败）| 缺失报告则该档位标 N/A；H-2 等价类对比缺 1 行 |
| **R-QA-2** | LOC 估算偏低（R-M0b-2 风险）| 估算必含范围（不锁数字）；DD-1 总报告复核 |
| **R-QA-3** | capability JSON 字段错误（缺 class / tier）| 架构师验证命令 §4 第 3 步兜底 |
| **R-QA-4** | H-1 FAIL 但 H-2/H-3 PASS（部分假设失败）| 总判定段明示「鱼之重新定义」评估触发条件 |

---

## §6 报告模板（执行者填写）

### §6.1 三份 spike 报告摘要

- **BE-1（orch 调研）**：__（3 句话：调研结果 + 质量分 + 等价类适配度）
- **TG-1（commander 改代码）**：__（3 句话：diff 大小 + pytest + 等价类适配度）
- **DO-1（worker 摘要 + newvps RAM）**：__（3 句话：摘要质量 + newvps RAM verdict + 等价类适配度）

### §6.2 H-2 等价类对比表

| 维度 | orch 档 | commander 档 | worker 档 |
|------|---------|--------------|----------|
| **典型任务** | 调研 / 跨项目决策 | 改代码 / 单工作流编排 | 摘要 / 批量执行 |
| **成本/1k input** | $0.014 | $0.0014 | $0.00014 |
| **成本/1k output** | $0.28 | $0.0028 | $0.00028 |
| **max context** | 64k | 32k | 16k |
| **质量分（1-5）** | __（BE-1）| __（TG-1）| __（DO-1）|
| **wall 中位数（s）** | __ | __ | __ |
| **token 中位数** | __ | __ | __ |
| **等价类适配度（1-5）** | __ | __ | __ |
| **dsh 能力覆盖** | 调研 + 推理 | 改代码 + diff | 摘要 + 批量 |

### §6.3 H-2 等价类假设判定

- **判定**：__（PASS / FAIL）
- **理由**：__
- **关键差异点**（orch vs commander vs worker 的能力边界）：__

### §6.4 H-3 wrapper 缺失点清单

| # | 缺失点 | dsh 现状 | wrapper 需补 |
|---|--------|---------|------------|
| 1 | orch spawn 流程 | __ | __ |
| 2 | commander 工作流编排 | __ | __ |
| 3 | worker task 派发 | __ | __ |
| 4 | 6 host 路由（v1.1 M2 暂留）| __ | __ |
| 5 | Tailscale Serve HTTPS | __ | __ |
| 6 | iOS PWA 文字表单 | __ | __ |
| 7 | kernel HTTP/FFI 桥接 | v1.0 runtime 已 GA | TypeScript HTTP client 即可 |
| 8 | 等价类 capability 加载 | spec/capabilities/ 已落 | wrapper 读 JSON |

### §6.5 H-3 TypeScript LOC 估算范围

| 组件 | LOC 范围 | 备注 |
|------|---------|------|
| orch wrapper | __-__ 行 | 含 spawn + capability 加载 |
| commander wrapper | __-__ 行 | 含工作流编排 + diff 提交 |
| worker wrapper | __-__ 行 | 含任务派发 + 摘要调用 |
| 共用基础（HTTP/FS / log / ts 类型） | __-__ 行 | 公用 utilities |
| **总计** | __-__ 行 | **不锁数字；M0c 实际编码后再校准** |

### §6.6 capability JSON 落地

- **orch.json** mv：__ ✅
- **commander.json** mv：__ ✅
- **worker.json** mv：__ ✅
- **newvps_ram.json** mv：__ ✅
- **字段校验**（class + tier + m0b_evidence）：__ ✅

### §6.7 H-1/H-2/H-3 总判定

| 假设 | 判定 | 关键证据 |
|------|------|---------|
| **H-1 dsh 覆盖 80%** | __（PASS / FAIL / PARTIAL） | BE-1/TG-1/DO-1 质量分中位数 |
| **H-2 等价类差异成立** | __（PASS / FAIL） | §6.2 对比表 |
| **H-3 wrapper LOC 估算** | __（PASS / FAIL） | §6.5 LOC 范围 |

- **M0b 总判定**：__（PASS 全部 / FAIL 触发「鱼之重新定义」/ PARTIAL 二次 spike）
- **下一步**：
  - 如 PASS：通知 DD-1 起草 M0b 总报告 + ADR 0010
  - 如 FAIL：通知架构师，启动「鱼之重新定义」专项（PRD-v1.1 §3 H-1 失败处理 + NORTH-STAR §10 冲突 5）
  - 如 PARTIAL：架构师裁断是否补 spike

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.4 + §3 + §4.1 + §5 R-M0b-2 + §6 PR2 + §7.3 + §10.1
- `docs/PRD-v1.1-product.md` §1.5（A-4 等价类）+ §3 H-2/H-3 + §4.6
- `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 裁定 5（等价类）+ 裁定 6（M0b 范围）
- `docs/PRD-V0.1-NORTH-STAR.md` §3 A-4
- `docs/DISPATCH-T-M0b-BE-1.md` + `docs/DISPATCH-T-M0b-TG-1.md` + `docs/DISPATCH-T-M0b-DO-1.md`（前置输入）