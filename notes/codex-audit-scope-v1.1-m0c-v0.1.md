# Codex Audit-scope — v1.1 M0c v0.1 升级 8 文件改动 hygiene 守门

> **Date**: 2026-09-02
> **Purpose**: v0.1 升级 8 文件改动 hygiene 守门集合（不锁型号 / 不硬编码 API key / v1.0 runtime 0 行 diff）
> **Why**: v0.1 升级前向交付物（v1.1-ga-team-plan.md + 5 DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md + cc-ready.json）若直接包含字面 grep pattern（`Fable 5|GLM 5.3|MiniMax-M3`），守门 grep 会自伤（grep pattern 字面命中自身）。本 audit-scope 把守门 grep 字面从 v0.1 升级前向交付物移到本 notes/ 下，且 grep 范围限定到**前向交付物口径**（不含历史文档），避免自伤且不冒犯历史考古记录。
> **How to apply**: v0.1 升级前向交付物守门命令统一引用本 §1-3；本文件保留字面 grep pattern 用作后续 Codex 复审的 hygiene anchor。

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类）

```bash
# v0.1 升级前向交付物不锁型号（实测 == 0）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md | wc -l
# 期望: 0 行

# 历史文档豁免口径锚定（含守门字面自伤 + 叙述性引用 + 署名尾注，详见 §1.5 豁免清单，实测 == 42）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ | wc -l
# 期望: == 42（历史文档豁免口径；不清洗历史）

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.1-m0c-v0.1.md | wc -l
# 期望: ≥ 1（grep 字面必现）
```

**含义**：v1.1+ 周期模型决策遵守 NORTH-STAR A-4 等价类约束，具体 SKU 只存在 `spec/capabilities/`（用 `class`/`tier` 字段），v0.1 升级前向交付物（TS wrapper 任务书 / plan v0.1 / cc-ready）均不含具体型号字面。改名不触发 NORTH-STAR 回滚。

### §1.5 历史文档豁免清单（42 处 / 13 文件，三类定性 — 不清洗历史）

| # | 文件 | 命中数 | 定性类别 | 说明 |
|---|------|--------|----------|------|
| 1 | `docs/VISION-v1.0-supplement.md` | 12 | ② 叙述性引用（v0.x before-record）| v0.x 历史愿景归档，含 M0 周期型号枚举；M0b 已 SUPERSEDED 2026-08-30；考古记录保留 |
| 2 | `docs/DISPATCH-T-M0b-DD-1.md` | 6 | ① 守门字面自伤 + ② 叙述性引用 | M0b 报告尾注 + M0b §3.1.5 验证命令字面（per Codex v0.1 m3 豁免） |
| 3 | `docs/DISPATCH-T-M0c-V0.1-PRECOMMIT-FIX.md` | 3 | ① 守门字面自伤 | v0.1 升级执行书 §2/§4 验证命令字面含 grep pattern（归档 commit 不入主合同，by-design） |
| 4 | `docs/v1.1-m0b-three-path-spike-plan.md` | 5 | ① 守门字面自伤 + ② 叙述性引用 | M0b 模板计划 §3 L89 明文裁定「DISPATCH 文档允许叙述性引用模型名」（C2 fix 裁定） |
| 5 | `docs/DISPATCH-T-M0b-BE-1.md` | 4 | ① 守门字面自伤 + ③ 署名尾注 | M0b BE-1 报告 §8 命令字面 + Co-Authored-By 尾注 |
| 6 | `docs/DISPATCH-T-M0b-DO-1.md` | 3 | ① 守门字面自伤 + ③ 署名尾注 | M0b DO-1 报告命令字面 + 尾注 |
| 7 | `docs/DISPATCH-T-M0b-SCOPE-FIX.md` | 2 | ① 守门字面自伤 | M0b scope-fix 执行书验证命令字面 |
| 8 | `docs/ARCHITECT-REVIEW-fish-harness-prd-v1.0.md` | 2 | ② 叙述性引用（历史评审）| v0.x 周期架构评审；考古记录保留 |
| 9 | `docs/REVIEW-T-DD-6.md` | 1 | ③ 署名尾注 `Co-Authored-By: Claude Fable 5` | v0.x 评审报告；不可也不应清除 git 历史尾注 |
| 10 | `docs/PRD-v1.1-product.md` | 1 | ② 叙述性引用 | v1.1 product PRD §1.5 等价类约束；规则性引用 |
| 11 | `docs/PRD-V0.1-NORTH-STAR.md` | 1 | ② 叙述性引用 | NORTH-STAR §10 冲突 5；规则性引用 |
| 12 | `docs/DOCS-REVIEW-v1.1-adjudication.md` | 1 | ② 叙述性引用 | 六项裁定文档；规则性引用 |
| 13 | `docs/DISPATCH-T-M0b-TG-1.md` | 1 | ① 守门字面自伤 | M0b TG-1 报告命令字面 |
| **总计** | **13 文件** | **42 行** | | 实测 == 42（执行书 PRECOMMIT-FIX 3 行 by-design 纳入豁免口径）|

**豁免口径**（per M0b plan §3 L89 C2 裁定 + pre-commit report §2 M1）：① 守门字面自伤 = DISPATCH/plan §3 验证命令字面含 grep pattern，是设计必然；② 叙述性引用 = 文档规则性引用型号名（等价类约束 + 守门设计 + 历史评审）；③ 署名尾注 = `Co-Authored-By: Claude Fable 5`（v0.x 时代；不可清洗 git 历史）。**不清洗历史文档**（考古记录 + git 尾注保留）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训）

```bash
# v0.1 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" docs/ wrapper/ deploy/ | wc -l
# 期望: 0 行

# 仅 env-inject only 占位（合规）：
grep -rE "env-inject only|env:[A-Z_]+" docs/ wrapper/ deploy/ | wc -l
# 期望: ≥ 1
```

**含义**：DEEPSEEK_API_KEY 等敏感 API key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；M0b 已踩坑（cc-ready.json notes line 6 写完整 key 触发 GH013 PUSH PROTECTION → amend 修复）。所有 wrapper / 文档不得含完整 key 字面。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)）

```bash
# v0.1 升级不动 v1.0 runtime 区域（commit v1.0.0 tag ab8749a 后 0 漂移）：
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行

# v1.0 GA plan + 现有 ADR body 不动：
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0 行
```

**含义**：v1.0.0 GA tag `ab8749a` 后 v1.0 runtime 0 行 diff：禁止改 `harness/` + `spec/` + `spikes/` + `_helpers.py` + 9 ADR body + `Dockerfile` + `docker-compose.yml` + `pyproject.toml` + v1.0 GA plan。v1.1+ 工作走新代码域（TypeScript wrapper / PWA / STT / Web Push / 6 host 部署 / 工作流 B/C）。

## §4 v0.1 升级 8 文件 hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
| 1 | `docs/v1.1-ga-team-plan.md` | ❌ 已移除 | ✅ §1/§3 引用 | ✅ grep 前向交付物口径不含本文件 |
| 2 | `docs/DISPATCH-T-M0c-BE-1.md` | ❌ 已移除 | ✅ §1 引用 | ✅ |
| 3 | `docs/DISPATCH-T-M0c-TG-1.md` | ❌ 已移除 | ✅ §1/§2 引用 | ✅ |
| 4 | `docs/DISPATCH-T-M0c-DO-1.md` | ❌ 已移除 | ✅ §1/§2 引用 | ✅ |
| 5 | `docs/DISPATCH-T-M0c-QA-1.md` | ❌ 已移除 | ✅ §1/§2 引用 | ✅ |
| 6 | `docs/DISPATCH-T-M0c-DD-1.md` | ❌ 已移除 | ✅ §1/§2 引用 | ✅ |
| 7 | `docs/poll/cc-ready.json` | ❌ 已移除 | ✅ §2 引用 | ✅ |
| 8 | `notes/codex-audit-scope-v1.1-m0c-v0.1.md` (NEW 本文件) | ✅ 含字面（自伤豁免）| 本文件 | ✅ grep 前向交付物口径不含 notes/ |

## §5 后续 Codex 复审预期

- v0.1 升级前向交付物 grep `Fable 5|GLM 5.3|MiniMax-M3` = 0 ✓
- v0.1 升级范围 grep `sk-[a-z0-9]{32,}` = 0 ✓
- v0.1 升级范围 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域>` = 0 行 ✓
- 历史文档豁免口径锚定（§1.5 清单 13 文件 42 处三类定性，含归档执行书 PRECOMMIT-FIX 3 行 by-design 豁免）
- Codex 提交铁律：用户亲提 `gpt-5.6-sol` + `xhigh`；Claude 不亲提
- 下一站：M0c 通过 → v0.2 升级

---

*hygiene audit-scope — v0.1 升级 8 文件改动守门 by-design（grep 字面移到 notes/，grep 范围限定前向交付物口径 docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md；历史文档豁免 §1.5 清单 13 文件 42 处三类定性不清洗）*