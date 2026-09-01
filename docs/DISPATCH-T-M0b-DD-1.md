# DISPATCH-T-M0b-DD-1 — Role DD — M0b 总报告 + ADR 0010 v1.1 cycle scope admission

> **Task ID**: T-M0b-DD-1
> **Status**: 🟡 pending（派发中，等 T-M0b-QA-1 完成后执行）
> **Date**: 2026-09-01
> **Author**: 架构师（v1.1 GA plan v0.0 DRAFT §2.5 派发）
> **Receiving Agent**: Role DD — ADR & 文档 & 报告 工程师（v1.1+）
> **Parent Plan**: `docs/v1.1-ga-team-plan.md` §2.5
> **Adjudication Source**: `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 全部裁定 + `docs/PRD-v1.1-product.md` §4 + §8

---

## §1 任务定义

### 1.1 一句话

基于 T-M0b-BE-1 + T-M0b-TG-1 + T-M0b-DO-1 + T-M0b-QA-1 四份报告，起草 M0b 总报告 `docs/DISPATCH-T-M0b-DONE.md`（5 段：H-1/H-2/H-3 PASS/FAIL + capability JSON 路径 + LOC 估算 + ADR 0010 cross-ref）+ 起草 `adr/0010-v1.1-cycle-scope-admission.md`（Status=Accepted；引用 PRD-v1.1 §4 + NORTH-STAR 合同层 v1.1 product 适用条款 + M0b 通过证据）。

### 1.2 任务来源

v1.1 GA plan v0.0 DRAFT §2.5 T-M0b-DD-1：M0b 收尾 + ADR 0010 是 v1.1+ 周期的第一份 ADR（按 v1.0 T-DD-6 冻结规则 ADR 编号 ≥ 0010）。

### 1.3 ADR 0010 内容要点**

- **Status**: Accepted
- **Date**: 2026-09-01（或 QA-1 完成日）
- **Deciders**: 架构师 + 用户裁断
- **Decision 段**：
  - v1.1+ 周期门已开（v1.0.0 GA 2026-09-01 关门 + PRD-v1.1 §4 六项裁定已写入 + NORTH-STAR 合同层 v1.1 product 适用条款已合并）
  - M0b spike 设计通过（5 个 T-M0b-* DISPATCH + capability JSON 落地）
  - capability JSON 守门（NORTH-STAR A-4 等价类约束）
  - v1.0 runtime 不漂移守门（v1.0.0 tag 后 0 行 diff in harness/ spec/ spikes/ 9 ADR body）
- **Alternatives**: 4 个（A1 不开 v1.1+ 周期 / A2 跳过 M0b 直接 M1 / A3 锁型号写 ADR / A4 暂不开）
- **Consequences**:
  - ✅ v1.1+ scope 解除 v1.0 ban list
  - ✅ M0b spike 可启动（待用户发 "Start v1.1 M0b"——本 ADR 不触发实际派发）
  - ⚠️ M0b spike 实测 dsh ≪ 80% → 触发「鱼之重新定义」（PRD-v1.1 §3 H-1 失败处理）

### 1.4 硬约束（HARD CONSTRAINTS）

- ❌ **禁止改 v1.0 runtime**（`harness/` + `spec/` + `spikes/` + `_helpers.py` + 9 ADR body）
- ❌ **禁止改 v1.0 GA plan** + v1.1 GA plan v0.0 DRAFT（PRD-v1.1 §8 复审门槛：M0b 后才能写为实施条款）
- ❌ **禁止改 VISION 归档**
- ❌ 不锁具体型号（ADR 0010 不写 `Fable 5` / `GLM 5.3` / `MiniMax-M3`）
- ✅ ADR 编号 = 0010（v1.0 T-DD-6 冻结规则：ADR ≥ 0010）
- ✅ M0b 总报告含 5 段（H-1/H-2/H-3 + capability JSON + LOC 估算 + ADR 0010）
- ✅ 总报告 commit 后通知架构师（架构师裁断 v0.1 升级 or 「鱼之重新定义」）

---

## §2 输入

### 2.1 前置依赖（必须全部完成）

- T-M0b-BE-1 done
- T-M0b-TG-1 done
- T-M0b-DO-1 done
- T-M0b-QA-1 done（含 H-2/H-3 判定 + capability JSON 落地）

### 2.2 输入材料

| 材料 | 路径 | 用途 |
|------|------|------|
| 4 份 spike 报告 | `docs/DISPATCH-T-M0b-{BE-1,TG-1,DO-1,QA-1}.md` | M0b 总报告输入 |
| capability JSON | `spec/capabilities/{orch,commander,worker,newvps_ram}.json` | M0b 总报告引用 |
| v1.1 GA plan v0.0 DRAFT | `docs/v1.1-ga-team-plan.md` | §10 复审门槛 |
| PRD-v1.1 §4 六项裁定 | `docs/PRD-v1.1-product.md` §4 | ADR 0010 引用 |
| PRD-v1.1 §8 复审门槛 | `docs/PRD-v1.1-product.md` §8 | ADR 0010 Consequences |
| 6 项裁定详情 | `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 | ADR 0010 引用 |
| NORTH-STAR 合同层 v1.1 product | `docs/PRD-V0.1-NORTH-STAR.md` §18 + §24-32 + §105/106 + §215/235/236 + §351-381 | ADR 0010 引用 |
| v1.0.0 GA tag | `ab8749a` | ADR 0010 baseline |
| v1.0 T-DD-6 冻结规则 | 9 ADR footer "新增 ADR 编号 ≥ 0010" | ADR 编号 0010 依据 |

---

## §3 产出

### 3.1 主产出 1：M0b 总报告（必交付）

**文件**：`docs/DISPATCH-T-M0b-DONE.md`（新文件）

**5 段必含**：

```markdown
# DISPATCH-T-M0b-DONE — M0b 总报告

> **Date**: 2026-09-01（或 QA-1 完成日）
> **Triggered by**: T-M0b-DD-1 (Role DD)
> **Source**: v1.1 GA plan v0.0 DRAFT §2.5 + §6 PR3

---

## §1 H-1 dsh 覆盖 80% 判定

- **BE-1 调研**（orch）：质量分 __ / 5
- **TG-1 改代码**（commander）：质量分 __ / 5
- **DO-1 摘要**（worker）：质量分 __ / 5
- **H-1 总判定**：__（PASS ≥ 4 / FAIL < 3 / PARTIAL 3.x）
- **关键证据**：__（1-2 句）

## §2 H-2 等价类差异判定

- **等价类对比表**：见 QA-1 §6.2
- **H-2 总判定**：__（PASS / FAIL）
- **关键证据**：__（orch vs commander vs worker 能力差异 1-2 句）

## §3 H-3 wrapper LOC 估算范围

- **orch wrapper**：__-__ 行
- **commander wrapper**：__-__ 行
- **worker wrapper**：__-__ 行
- **共用基础**：__-__ 行
- **总计**：__-__ 行（**不锁数字**；M0c 实际编码后再校准）

## §4 capability JSON 落地（mv from _m0b_draft）

- **orch.json**：spec/capabilities/orch.json ✅
- **commander.json**：spec/capabilities/commander.json ✅
- **worker.json**：spec/capabilities/worker.json ✅
- **newvps_ram.json**：spec/capabilities/newvps_ram.json ✅
- **字段校验**：class + tier + m0b_evidence 全过
- **裁定 2 newvps 共址 verdict**：__（PASS / FAIL / 升独立 VPS）

## §5 ADR 0010 cross-ref + M0b 总判定

- **ADR 0010**：adr/0010-v1.1-cycle-scope-admission.md ✅ Status=Accepted
- **H-1/H-2/H-3 三假设总判定**：
  - H-1：__
  - H-2：__
  - H-3：__
- **M0b 总判定**：__（PASS 全部 → v0.1 升级 / FAIL → 鱼之重新定义 / PARTIAL → 二次 spike）
- **下一步**：
  - 架构师裁断 v0.1 升级 or 「鱼之重新定义」专项
  - v0.1 升级 → v1.1 GA plan v1.0 落地 + M0c 任务书细化
  - 鱼之重新定义 → 启动 NORTH-STAR §10 冲突 5 专项讨论
```

### 3.2 主产出 2：ADR 0010（必交付）

**文件**：`adr/0010-v1.1-cycle-scope-admission.md`（新文件）

**ADR 模板**（参考 ADR 0001-0009 风格）：

```markdown
# ADR 0010 — v1.1+ Cycle Scope Admission

> **Status**: Accepted
> **Date**: 2026-09-01
> **Deciders**: 架构师 + 用户裁断
> **Supersedes**: （无）

## Context

v1.0.0 GA tag `ab8749a` 已 released 2026-09-01（详见 NOW.md §4 T-V1-GA-TAG），
GHCR public verified, GitHub Release page live. v1.0+ 工作进入 v1.1+ 周期.

PRD-v1.1 §4 六项产品裁定已 2026-08-30 写入:
1. 安全 Tailscale-only
2. 调度层 newvps 共址（M1）
3. Web Push/STT 推迟 M2
4. 三工作流仅 A
5. 模型等价类约束（NORTH-STAR A-4）
6. M0b-dsh-spike 有条件启动

NORTH-STAR 合同层 v1.1 product 适用条款 2026-08-30 已合并
（修订日志 line 327 + 验证矩阵 line 351-381）:
- G-5/G-6/W-1/A-4/M-2/M-4/U-2/U-3 标 v1.0 runtime 不适用
- A-4 改等价类约束
- §7 认证改 Tailscale-only（删 Basic Auth）
- 协议数 8→10

M0b spike 设计已通过 v1.1 GA plan v0.0 DRAFT §2.1-§2.5 + §4.1 + §10.1.

## Decision

v1.1+ 周期门已开。具体:

(a) **v1.1+ scope admission** — v1.0 runtime ban list（NOW.md §3:
dsh / TypeScript wrapper / PWA / STT / Web Push / 6 host / 工作流 B/C）
解除生效，v1.1+ 工作可立项。

(b) **M0b-dsh-spike 设计通过** — v1.1 GA plan v0.0 DRAFT
`docs/v1.1-ga-team-plan.md` §2.1-§2.5 5 个 T-M0b-* DISPATCH 任务书
+ §4.1 M0b Exit Gate 10 步 + §10.1 v0.0→v0.1 升级门槛 通过设计审验。
spike 实测由后续 subagent / Cursor Agent / Codex CLI / 真实人类执行。

(c) **capability JSON 守门** — v1.1+ 模型决策遵守 NORTH-STAR A-4 等价类
约束，具体 SKU 只存在 `spec/capabilities/`，不锁型号名（不写 Fable 5 /
GLM 5.3 / MiniMax-M3 等具体型号）。改名不触发 NORTH-STAR 回滚。

(d) **v1.0 runtime 不漂移守门** — v1.0.0 tag 后 v1.0 runtime 0 行 diff:
禁止改 `harness/` + `spec/` + `spikes/` + `_helpers.py` + 9 ADR body
+ `Dockerfile` + `docker-compose.yml` + `pyproject.toml` + v1.0 GA plan.
v1.1+ 工作走新代码域（TypeScript wrapper / PWA / STT / Web Push / 6 host
部署 / 工作流 B/C）。

## Alternatives

- **A1: 不开 v1.1+ 周期** — 维持 v1.0 ban list 永久. ❌（拒绝：v1.0 GA 后
  无新工作 = 项目失活；PRD-v1.1 §0 已明示 v1.1 是另一条产品路径）
- **A2: 跳过 M0b 直接 M1** — 直接写 TypeScript wrapper + 手机派工.
  ❌（拒绝：违反 PRD-v1.1 §4.6 第 3 条硬前置 + §8 复审门槛；
  dsh 80% 覆盖未验证前禁止写 TypeScript 总量；H-1 失败 ≪ 80% → 启动
  鱼之重新定义专项，禁止假装 80% 继续）
- **A3: 锁具体型号写 ADR** — ADR 写 `Fable 5` / `GLM 5.3` / `MiniMax-M3`
  三档锁定. ❌（拒绝：违反 NORTH-STAR A-4 等价类约束；厂商改名时误爆守护；
  capability JSON class/tier 字段已足够）
- **A4: 暂不开，等 v1.0.1 patch** — v1.0 GA 后修 v1.0.1 再开. ❌（拒绝：
  v1.0 GA 已完整；v1.1+ 是新周期，不是 v1.0.1 patch）

## Consequences

✅ v1.1+ scope 解除 v1.0 ban list；5 个 T-M0b-* DISPATCH 可派发；
capability JSON 落地；v0.0 draft 进入实施待 M0b 通过升级 v0.1.

⏸ M0b spike 实测仍需用户单独发 "Start v1.1 M0b"
（PRD-v1.1 §4.6 第 3 条硬前置；本 ADR 不触发实际派发）.

⚠️ M0b spike H-1 ≪ 80% → 触发「鱼之重新定义」专项
（PRD-v1.1 §3 H-1 失败处理 + NORTH-STAR §10 冲突 5），
禁止假装 80% 继续写 TypeScript 总量.

## Cross-ref

- `docs/v1.1-ga-team-plan.md` §2 + §4.1 + §10.1
- `docs/PRD-v1.1-product.md` §4 (六项裁定) + §8 (复审门槛)
- `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 (裁定 1-6)
- `docs/PRD-V0.1-NORTH-STAR.md` §18 + §24-32 + §105/106 + §215/235/236 + §327 + §351-381
- `docs/v1.0-ga-team-plan.md`（frozen, baseline reference）
- v1.0.0 GA tag `ab8749a`（immutable）
- v1.0 T-DD-6 冻结规则（ADR ≥ 0010）

## v1.0 Status Footer

**v1.0 Status: Excluded from GA** — 2026-09-01

ADR 0010 是 v1.1+ 周期第一份 ADR，不属于 v1.0 GA 合同。
v1.0 GA 9 ADR（0001-0009）保持 immutable；引用本文时用 `<adr-0010>` tag.
```

### 3.3 副产出（必交付）

```bash
# git add 4 文件 + commit
git add docs/DISPATCH-T-M0b-DONE.md docs/DISPATCH-T-M0b-DD-1.md adr/0010-v1.1-cycle-scope-admission.md
# （注：DD-1.md 是本 DISPATCH 任务书，完成后也 commit 一份作为完成证据）
```

### 3.4 git commit

```bash
git add docs/DISPATCH-T-M0b-DONE.md adr/0010-v1.1-cycle-scope-admission.md
git commit -m "feat(m0b): T-M0b-DD-1 M0b 总报告 + ADR 0010 v1.1 cycle scope admission

- docs/DISPATCH-T-M0b-DONE.md: NEW M0b 总报告 5 段
  (H-1/H-2/H-3 判定 + capability JSON 落地 + LOC 估算 + ADR 0010
  cross-ref + M0b 总判定)
- adr/0010-v1.1-cycle-scope-admission.md: NEW Status=Accepted
  v1.1+ 周期门已开 + M0b spike 设计通过 + capability JSON 守门
  + v1.0 runtime 不漂移守门
- 引用 PRD-v1.1 §4 六项裁定 + NORTH-STAR 合同层 v1.1 product
  适用条款 + v1.0 T-DD-6 冻结规则 ADR ≥ 0010
- v1.0 GA 9 ADR (0001-0009) immutable; 不锁型号

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## §4 架构师验证命令

```bash
# 1. M0b 总报告存在 + 含 5 段
test -f docs/DISPATCH-T-M0b-DONE.md
grep -cE "^## §1 H-1|^## §2 H-2|^## §3 H-3|^## §4 capability JSON|^## §5 ADR 0010" docs/DISPATCH-T-M0b-DONE.md
# 期望: 5

# 2. ADR 0010 存在 + Status=Accepted + ADR 编号 0010
test -f adr/0010-v1.1-cycle-scope-admission.md
grep -c "^# ADR 0010" adr/0010-v1.1-cycle-scope-admission.md
# 期望: 1
grep -c "Status: Accepted" adr/0010-v1.1-cycle-scope-admission.md
# 期望: 1

# 3. ADR 0010 不锁型号守门
grep -E "Fable 5|GLM 5.3|MiniMax-M3" adr/0010-v1.1-cycle-scope-admission.md docs/DISPATCH-T-M0b-DONE.md
# 期望: 无输出

# 4. v1.0 runtime 不漂移守门（含 spec/capabilities/ 落地）
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ adr/0001-0009.md Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0
# 注：spec/capabilities/*.json 是 NEW，不算 v1.0 runtime diff

# 5. ADR 0010 引用 PRD-v1.1 §4 + NORTH-STAR + v1.1 GA plan v0.0
grep -cE "PRD-v1.1-product.md.*§4|NORTH-STAR.*§18|contract layer|v1.1-ga-team-plan" adr/0010-v1.1-cycle-scope-admission.md
# 期望: ≥ 1

# 6. v1.0 9 ADR 不可改守门
git diff v1.0.0..HEAD -- adr/0001-0009.md | wc -l
# 期望: 0

# 7. v1.0 GA plan 不可改守门
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md | wc -l
# 期望: 0

# 8. 8 ADR footer 含 v1.0 Status（v1.0 不变 + v1.1 新增 ADR 0010 v1.0 Status: Excluded）
ls adr/000*.md | wc -l
# 期望: 10（0001-0010）

# 9. M0b 总报告 H-1 FAIL 处理（如 H-1 FAIL）
# 如 H-1 FAIL：grep -c "鱼之重新定义" docs/DISPATCH-T-M0b-DONE.md → ≥ 1
grep -c "鱼之重新定义" docs/DISPATCH-T-M0b-DONE.md
# 期望: ≥ 1（M0b 总判定段必须明示路径）
```

---

## §5 估时 + 风险

### 5.1 估时

- 读 4 份 spike 报告 + QA-1 落地结果：0.5d
- 起草 M0b 总报告 5 段：0.5d
- 起草 ADR 0010（Status + Context + Decision + Alternatives + Consequences + Cross-ref + Footer）：0.5d
- git commit + 自检：0.5d
- **合计：2d**（与 v1.1 GA plan §2.5 T-M0b-DD-1 估时对齐）

### 5.2 风险

| # | 风险 | 缓解 |
|---|------|------|
| **R-DD-1** | 4 份 spike 报告缺失（如 QA-1 未落地 capability JSON）| 等 QA-1 完成；DD-1 不抢先 |
| **R-DD-2** | ADR 0010 写锁具体型号（违反 A-4）| 架构师验证 §4 第 3 步兜底 |
| **R-DD-3** | M0b 总判定误判（H-1 FAIL 但未明示「鱼之重新定义」）| 架构师验证 §4 第 9 步兜底 |
| **R-DD-4** | v1.0 runtime diff 漂移（误改 harness/ spec/ 等）| 架构师验证 §4 第 4/6/7 步兜底 |

### 5.3 完成路径

- **路径 1（H-1/H-2/H-3 全 PASS）**：M0b 总判定 PASS → 通知架构师 → v0.1 升级（v1.1 GA plan v1.0 落地 + M0c 任务书细化）
- **路径 2（H-1 FAIL）**：M0b 总判定 FAIL → 通知架构师 → 启动「鱼之重新定义」专项（NORTH-STAR §10 冲突 5 + PRD-v1.1 §3 H-1 失败处理）
- **路径 3（H-1/H-2/H-3 PARTIAL）**：M0b 总判定 PARTIAL → 通知架构师 → 二次 spike 决策

---

## §6 报告模板（执行者填写）

> **执行者**：请在完成 M0b 总报告 + ADR 0010 后，**替换整个 §6 块**为完成总结。

### §6.1 M0b 总报告摘要

- **§1 H-1 判定**：__
- **§2 H-2 判定**：__
- **§3 H-3 LOC 范围**：__
- **§4 capability JSON 落地**：4/4 ✅
- **§5 M0b 总判定**：__（PASS / FAIL / PARTIAL）

### §6.2 ADR 0010 完成摘要

- **Status**：Accepted
- **Decision 段 4 子项**：(a) scope admission ✅ (b) M0b 设计 ✅ (c) capability 守门 ✅ (d) v1.0 不漂移 ✅
- **Alternatives 4 个**：A1/A2/A3/A4 ❌ 全部拒绝 + 理由
- **Consequences 3 项**：✅ scope / ⏸ Start 门 / ⚠️ 鱼之重新定义
- **Cross-ref 6+ 引用**：v1.1 GA plan + PRD-v1.1 §4 + DOCS-REVIEW + NORTH-STAR + v1.0 GA plan + tag ab8749a + T-DD-6

### §6.3 git commit 证据

- **commit SHA**：__
- **commit message**：`feat(m0b): T-M0b-DD-1 M0b 总报告 + ADR 0010 ...`
- **files changed**：__ files / +__ / -__

### §6.4 路径选择

- **路径 1（H-1/H-2/H-3 全 PASS）**：__（是 / 否）
- **路径 2（H-1 FAIL）**：__（是 / 否）
- **路径 3（PARTIAL）**：__（是 / 否）
- **通知架构师**：__（是 / 否）

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.5 + §3 + §4.1 + §6 PR3 + §7.3 + §10.1
- `docs/PRD-v1.1-product.md` §4 + §8
- `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 全部裁定
- `docs/PRD-V0.1-NORTH-STAR.md` 合同层 v1.1 product 适用条款
- `docs/DISPATCH-T-M0b-BE-1.md` + `docs/DISPATCH-T-M0b-TG-1.md` + `docs/DISPATCH-T-M0b-DO-1.md` + `docs/DISPATCH-T-M0b-QA-1.md`（前置输入）
- 9 个 v1.0 ADR 0001-0009（footer "新增 ADR 编号 ≥ 0010" 冻结规则）