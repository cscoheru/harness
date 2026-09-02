# Codex Audit-scope — v1.1 M0c v0.2 升级 8 文件改动 hygiene 守门

> **Date**: 2026-09-02
> **Purpose**: v0.2 升级 8 文件改动 hygiene 守门集合（不锁型号 / 不硬编码 API key / v1.0 runtime 0 行 diff / dsh `headless` profile 守门 / Tailscale-only）
> **Why**: v0.2 升级前向交付物（v1.1-ga-team-plan.md + 5 DISPATCH-T-M1c-*.md + cc-ready.json）若直接包含字面 grep pattern（`Fable 5|GLM 5.3|MiniMax-M3`），守门 grep 会自伤。继承 v0.1 已建立的"前向交付物口径"机制（grep 字面移到 notes/，范围限定 `docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-*.md docs/DISPATCH-T-M1c-*.md`）。
> **How to apply**: v0.2 升级前向交付物守门命令统一引用本 §1-§5；本文件保留字面 grep pattern 用作后续 Codex 复审 hygiene anchor。

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类，继承 v0.1 §1）

```bash
# v0.2 升级前向交付物不锁型号（实测 == 0）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-*.md docs/DISPATCH-T-M1c-*.md | wc -l
# 期望: 0 行

# 历史文档豁免口径锚定（继承 v0.1 §1.5 清单 13 文件 42 处；v0.2 audit-scope 自伤豁免 + 1 行）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md | wc -l
# 期望: ≥ 43（v0.1 §1.5 42 + v0.2 audit-scope 自伤 ≥ 1）

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md | wc -l
# 期望: ≥ 3（grep 字面必现：§1 + §5 + §1.5）
```

**含义**：v1.1+ 周期模型决策遵守 NORTH-STAR A-4 等价类约束；v0.2 升级前向交付物（plan v0.2 / 5 DISPATCH-T-M1c-*.md / cc-ready.json）均不含具体型号字面。

### §1.5 历史文档豁免清单（继承 v0.1 §1.5 13 文件 42 处 + v0.2 升级新增 5 文件 5 行 = 18 文件 47 处三类定性，不清洗历史）

继承 v0.1 §1.5 13 文件 42 处三类定性（① 守门字面自伤 / ② 叙述性引用 / ③ 署名尾注），新增 v0.2 升级 5 文件 5 行（全部 ① 守门字面自伤）：

| # | 文件 | 命中数 | 定性类别 | 说明 |
|---|------|--------|----------|------|
| 14 | `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` | ≥ 3 | ① 守门字面自伤 | 本文件 §1/§5 验证命令字面含 grep pattern（by-design；归档 notes/ 不入主合同）|
| 15 | `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md` | ≥ 2 | ① 守门字面自伤 | 本配套 prompt 文件 §1.5 + §2 (G) + §3 验证命令字面含 grep pattern（by-design；归档 notes/ 不入主合同）|
| 16 | `docs/DISPATCH-T-M1c-BE-1.md` | 1 | ① 守门字面自伤 | M1c BE-1 §4 验证命令 #6 grep `Fable 5|GLM 5.3|MiniMax-M3` wrapper/orchestrator/ 字面（per v0.1 §1.5 #4 同口径）|
| 17 | `docs/DISPATCH-T-M1c-TG-1.md` | 1 | ① 守门字面自伤 | M1c TG-1 §4 验证命令 #6 grep 字面 |
| 18 | `docs/DISPATCH-T-M1c-DO-1.md` | 1 | ① 守门字面自伤 | M1c DO-1 §4 验证命令 #10 grep 字面 |
| 19 | `docs/DISPATCH-T-M1c-QA-1.md` | 1 | ① 守门字面自伤 | M1c QA-1 §4 验证命令 #5 grep 字面 |
| 20 | `docs/DISPATCH-T-M1c-DD-1.md` | 1 | ① 守门字面自伤 | M1c DD-1 §4 验证命令 #8 grep 字面 |
| **总计** | **18 文件** | **≥ 47 行** | ① 守门字面自伤 / ② 叙述性引用 / ③ 署名尾注 | 实测 = 47（v0.1 §1.5 13 文件 42 + M1c 5 DISPATCH 守门字面 5）|

**豁免口径不变**（per M0b plan §3 L89 C2 裁定 + pre-commit report §2 M1）：**不清洗历史文档**（考古记录 + git 尾注 + DISPATCH §4 验证命令字面均保留；§4 grep 字面是设计必然，与 v0.1 §1.5 #2/#4/#5/#6/#7/#13 同口径）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训，继承 v0.1 §2）

```bash
# v0.2 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" docs/ wrapper/ deploy/ | wc -l
# 期望: 0 行

# 仅 env-inject only 占位（合规）：
grep -rE "env-inject only|env:[A-Z_]+" docs/DISPATCH-T-M1c-*.md | wc -l
# 期望: ≥ 5（5 DISPATCH 各自含 env-inject 字样）
```

**含义**：DEEPSEEK_API_KEY 等敏感 API key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；M0b 已踩坑（cc-ready.json notes line 6 写完整 key 触发 GH013 PUSH PROTECTION → amend 修复）。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)，继承 v0.1 §3）

```bash
# v0.2 升级不动 v1.0 runtime 区域（commit v1.0.0 tag ab8749a 后 0 漂移）：
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行

# v1.0 GA plan + 现有 ADR body 不动：
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0 行
```

**含义**：v0.2 升级仅在 `docs/` + `notes/` + `docs/poll/` 范围；不触及 harness/spec/spikes/9 ADR body/Dockerfile/docker-compose.yml/pyproject.toml/v1.0 GA plan。

## §4 dsh `headless` profile 守门（M1c TG-1 新增；M0b §6.X QA-1 修订教训）

```bash
# M1c wrapper 实调 dsh 必须用 headless profile（per M0b QA-1 §6.X 修订）：
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# 期望: 0 行（M0c skeleton 已用 headless；M1c 严禁 web profile）

# 期望出现 headless profile（M0c skeleton + M1c 实施）：
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# 期望: ≥ 3（orchestrator + dsh_client + tool_provider 三处）
```

**含义**：dsh `web` profile 是 Web UI server（per M0b QA-1 修订），不是 CLI 单轮任务。v1.1 wrapper 实调必须用 `headless`（CLI 单轮任务）。

## §5 v0.2 升级 8 文件 hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
| 1 | `docs/v1.1-ga-team-plan.md` | ❌ 已移除 | ✅ §1/§3 引用 | ✅ grep 前向交付物口径不含本文件 |
| 2 | `docs/DISPATCH-T-M1c-BE-1.md` | ❌ 已移除 | ✅ §1/§2/§4 引用 | ✅ |
| 3 | `docs/DISPATCH-T-M1c-TG-1.md` | ❌ 已移除 | ✅ §1/§2/§4 引用 | ✅ |
| 4 | `docs/DISPATCH-T-M1c-DO-1.md` | ❌ 已移除 | ✅ §1/§2 引用 | ✅ |
| 5 | `docs/DISPATCH-T-M1c-QA-1.md` | ❌ 已移除 | ✅ §1/§2 引用 | ✅ |
| 6 | `docs/DISPATCH-T-M1c-DD-1.md` | ❌ 已移除 | ✅ §1/§2 引用 | ✅ |
| 7 | `docs/poll/cc-ready.json` | ❌ 已移除 | ✅ §2 引用 | ✅ |
| 8 | `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` (NEW 本文件) | ✅ 含字面（自伤豁免）| 本文件 | ✅ grep 前向交付物口径不含 notes/ |
| 9 | `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md` (NEW) | ✅ 含字面（自伤豁免）| §1.5 #15 | ✅ grep 前向交付物口径不含 notes/ |

**总改动：2 文件 Edit (plan + cc-ready) + 7 文件 NEW (5 DISPATCH + 2 notes) = 9 文件**。**v0.2 升级前向交付物** = 7 文件（plan + 5 DISPATCH + cc-ready）；**audit-scope + prompt** = 2 文件（留 notes/ 归档）。

## §6 后续 Codex 复审预期

- v0.2 升级前向交付物 grep `Fable 5|GLM 5.3|MiniMax-M3` = 0 ✓
- v0.2 升级范围 grep `sk-[a-z0-9]{32,}` = 0 ✓
- v0.2 升级范围 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域>` = 0 行 ✓
- v0.2 升级范围 `grep "profile: web" wrapper/` = 0 行 ✓
- v0.2 升级范围 `grep "profile: headless" wrapper/` ≥ 3 ✓
- 历史文档豁免口径锚定（§1.5 清单 13+2 文件 42+5 处三类定性，含 v0.2 audit-scope 自伤 ≥ 3 行 by-design）
- Codex 提交铁律：用户亲提 `gpt-5.6-sol` + `xhigh`；Claude 不亲提
- 下一站：M1c 通过 → v0.3 升级 → M2 阶段（6 host + STT + Web Push）

---

*hygiene audit-scope — v0.2 升级 8 文件改动守门 by-design（grep 字面移到 notes/；范围限定前向交付物口径 `docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-*.md docs/DISPATCH-T-M1c-*.md`；继承 v0.1 §1.5 历史文档豁免清单 + v0.2 audit-scope 自伤 ≥ 3 行 + prompt 自伤 ≥ 2 行）*