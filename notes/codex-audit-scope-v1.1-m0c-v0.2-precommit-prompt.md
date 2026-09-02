# Codex Audit-scope Prompt — v1.1 M0c v0.2 升级 + M1 派发 precommit 轮

> **Date**: 2026-09-02
> **Reviewer**: Cursor（拟 Codex `gpt-5.6-sol` + `reasoning_effort=xhigh` 风格；user 亲提 Codex CLI 复审；per fish-harness-project.md 2026-08-30 立 Codex 提交铁律）
> **复审对象**: v0.2 升级 8 文件改动（1 plan 大修 + 5 DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md NEW + 1 cc-ready.json 翻牌 + 1 prompt 文件留 notes/）+ M0c 5 subagent 收口（5 merge commits + 1 fix commit）
> **判定格式**: PASS / CHANGES REQUIRED / PARTIAL（Codex v0.1 风格 0C/0M/Nm 或 N/Nm）
> **配套 hygiene**: 守门聚合在 `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md`（本 prompt 同期落）
> **关系**: 本文件 = Cursor 审验 prompt（precommit 轮；user 提交后走 fix 轮 → formal 轮）

---

## §1 复审范围（v0.2 升级 8 文件）

### 1.1 修改文件 (M)

| # | 文件 | 行数 | 改动概述 |
||---|------|------|----------|
| 1 | `docs/v1.1-ga-team-plan.md` | ~30 处 patch | Header Status `🟢 v0.1 (实施中)` → `🟢 v0.2 (M1 实施中)`；Date 2026-09-02（不变）；M0b PASS 证据 + M0c 5 subagent PASS 证据 + §10.4 v0.2 准备清单 7/8 ✅（#3 newvps 真部署待 user）；新增 §11 v0.2→v1.0 升级门槛（M1/M2/M3 全部通过后）|
| 2 | `docs/poll/cc-ready.json` | task_id `T-M0c-DISPATCH` → `T-M1c-DISPATCH`；status M1 任务书细化完成；files_modified 8 文件清单；notes M1 派发状态 + M0c 5 subagent 收口 |

### 1.2 新增文件 (A)

| # | 文件 | 行数 | 内容概述 |
||---|------|------|----------|
| 3 | `docs/DISPATCH-T-M1c-BE-1.md` | 估 ~120 行 | Role BE 任务书 M1c 阶段：wrapper/orchestrator/orchestrator.ts 实接 v1.0 kernel HTTP API + dsh invoke；iPhone PWA 派工 → 24h 完成 → 看见完成态 |
| 4 | `docs/DISPATCH-T-M1c-TG-1.md` | 估 ~110 行 | Role TG 任务书 M1c 阶段：dsh 真调（env-inject DEEPSEEK_API_KEY）+ 3 档 profile 适配（orch/commander/worker）|
| 5 | `docs/DISPATCH-T-M1c-DO-1.md` | 估 ~140 行 | Role DO 任务书 M1c 阶段：user 上 newvps `git clone` + `docker compose -f deploy/newvps-compose.yml up -d` + `tailscale serve --bg --yaml=tailscale-serve-harness.yaml` |
| 6 | `docs/DISPATCH-T-M1c-QA-1.md` | 估 ~120 行 | Role QA 任务书 M1c 阶段：mock 替换为真 dsh 调通 + iPhone Safari 真机 E2E 4 步 |
| 7 | `docs/DISPATCH-T-M1c-DD-1.md` | 估 ~100 行 | Role DD 任务书 M1c 阶段：CHANGELOG 增 [1.1.0-M1c] 段 + README v1.1 段补 M1 实施细节 + v0.3 准备清单 |
| 8 | `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` | 估 ~80 行 | hygiene 守门聚合（不锁型号 / 不硬编码 API key / v1.0 runtime 0 行 diff / Tailscale-only / 工作流 A only / 无 STT 无 Web Push）；本 prompt 同期落 |

**总改动：2 文件 Edit + 6 文件 NEW = 8 文件**（v0.2 升级 + M1 派发；audit-scope 留本地 notes/）

### 1.3 关联不动文件 (Unmodified scope discipline)

- `harness/` + `spec/kernel-schema.sql` + `spikes/` + `_helpers.py` + 9 ADR body + `Dockerfile` + `docker-compose.yml` + `pyproject.toml` + `docs/v1.0-ga-team-plan.md`（ADR 0010 Decision (d) v1.0 runtime 不漂移守门）
- M0c 5 subagent 收口（已 commit + push）：b768097 (BE-1) / d168217 (TG-1) / 23f976e (QA-1) / 6ea2fae (DO-1) / 7a94ade (DD-1) / 3efe7dc (fix)
- M0b 11 + 5b3d263 commits 链
- ADR 0010 v1.1 cycle scope admission Accepted
- `spec/capabilities/{orch,commander,worker,newvps_ram}.json`（M0b 落地 4 SKU）
- `wrapper/` 目录（M0c 5 subagent 落地骨架；M1c 深度实施）

---

## §2 复审重点（Cursor 必查）

### (A) v0.2 升级完整性（plan v0.1 → v0.2）

- ✅ §10.4 v0.2 准备清单 7/8 [x]（#3 newvps 真部署待 user 上 newvps 后勾）
- ✅ Header Status v0.1 → v0.2 (M1 实施中)
- ✅ §11 v0.2→v1.0 升级门槛新增（M1c/M2/M3 全部通过后）
- ✅ M0c 5 subagent PASS 证据落地（5 merge commits + fix commit）

### (B) M1c 任务书写实完整性（5 DISPATCH）

- ✅ 5 DISPATCH 文件存在 + 含 §1 任务定义 / §2 输入 / §3 产出 / §4 验证命令 / §5 估时 / §6 报告模板 / §7 cross-ref / §8 禁止
- ✅ 总估时（per PRD-v1.1 §5 M1 范围 = 2 周 = 10 工作日）
- ✅ 不锁型号守门（5 DISPATCH §4 各含 1 行守门字面（per §1.5 #16-20 豁免））
- ✅ 不硬编码 API key（env-inject only；DEEPSEEK_API_KEY 通过环境变量 + inline prefix）
- ✅ 不动 v1.0 runtime（HTTP/FFI 调 `/health` 端点；kernel 不改）
- ✅ TypeScript Protocol ↔ Python Protocol 类型对位（不 fork schema；不 1:1）
- ✅ Tailscale-only（PRD-v1.1 §7 认证 Tailscale-only）
- ✅ M1 范围 = 收紧版 MVP（无 STT / 无 Web Push / 仅工作流 A / 1 worker / newvps 共址 / Tailscale-only）

### (C) dsh `headless` profile 正确性（M1c TG-1 验证）

- ✅ T-M1c-TG-1 §4 验证 #7：`grep "profile: ['\"]web['\"]" wrapper/` = 0 行（用 headless，非 web）

### (D) v1.0 runtime 不漂移守门（8 文件改动范围）

- ✅ v0.2 升级 8 文件全部在 `docs/` + `notes/` + `docs/poll/`（不触及 harness/ + spec/ + spikes/ + 9 ADR body + Dockerfile + docker-compose.yml + pyproject.toml + docs/v1.0-ga-team-plan.md）
- ✅ audit-scope §3 提供 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域> | wc -l` = 0 验证

### (E) DEEPSEEK_API_KEY 不泄漏（GH013 PUSH PROTECTION 教训）

- ✅ audit-scope §2 提供 `grep -rE "sk-[a-z0-9]{32,}" docs/ wrapper/ deploy/ | wc -l` = 0 验证
- ✅ cc-ready.json notes 用 env-inject only 占位（不写完整 key）

### (F) cc-ready.json 事实准确性（per cc-ready §6 守门）

- ✅ task_id = `T-M1c-DISPATCH`（M1c 阶段任务书细化完成；等 user 「Start v1.1 M1」启动真实工程师）
- ✅ commit field = `HEAD = v0.2 升级 commit`（v0.2 升级 commit 尚未生成；本字段待 commit 后更新）
- ✅ created_at = `2026-09-02T19:00:00Z`
- ✅ status = `v0.2 升级 GO；M1c 任务书细化完成；当前 pending = user 「Start v1.1 M1」`
- ✅ files_modified 8 文件清单（含 audit-scope 也应列入 notes/）
- ✅ files_unmodified_scope_discipline 14 项 v1.0 runtime 不动项 + 4 项 plan 文档
- ✅ notes 9 项 v0.2 升级说明 + M1c 派发状态 + M0c 5 subagent 收口 + ADR 0010 enforcement + GH013 教训 + 下一步 user signals

### (G) 潜在新 finding 风险点（Cursor 主动探查）

- G1 §11 v0.2→v1.0 升级门槛是否与 §10.1/§10.2/§10.3 逻辑自洽（v0.0→v0.1→v0.2→v1.0 四级门槛递进）
- G2 §2 5 角色 M1c 任务估时是否与 PRD-v1.1 §5 M1 (2 周) 对齐
- G3 §3 handoff M1c 内部 5 个新增是否覆盖 BE-1 → TG-1 → QA-1 + DO-1 + DD-1 全链路
- G4 §6.2 M1c PR8-PR11 是否与 §2 5 角色任务书产出对齐
- G5 §9 修订日志 v0.2 行是否引用足够证据（M0c 5 subagent + 12 commits 链 + H-1/H-2/H-3 + ADR 0010）
- G6 §7.3 M0c 5 模板清单是否含 spike 实跑数据落地（commit b768097/d168217/23f976e/6ea2fae/7a94ade/3efe7dc 引用）
- G7 §11 cross-ref 是否新增 M1c 相关引用（5 DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md + wrapper/ + spec/capabilities/）

---

## §3 验证命令矩阵（verbatim 实跑）

```bash
# === A. v1.1-ga-team-plan.md v0.2 升级完整性 ===
grep -c "v0.2" docs/v1.1-ga-team-plan.md
# 期望: ≥ 10

grep -c "T-M1c-" docs/v1.1-ga-team-plan.md
# 期望: ≥ 5（5 DISPATCH 引用）

grep -c "M0c.*PASS\|M0c.*5 subagent\|5b3d263.*M0b" docs/v1.1-ga-team-plan.md
# 期望: ≥ 5

grep -c "ADR 0010\|0010-v1.1-cycle-scope-admission" docs/v1.1-ga-team-plan.md
# 期望: ≥ 1

# === B. M1c 5 DISPATCH 文件存在 ===
for f in docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md; do
  test -f "$f" && echo "$f ✅"
done

# === C. M1c 5 DISPATCH §1 任务定义存在 ===
for f in docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md; do
  grep -c "^## §1 任务定义" "$f"  # 期望: ≥ 1
done

# === D. 不锁型号守门（v0.2 升级 8 文件范围）===
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md docs/poll/cc-ready.json | wc -l
# 期望: 0

# v0.2 升级前向交付物口径守门（不含历史文档，详见 audit-scope §1）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md | wc -l
# 期望: 0（实测 == 0；M0b plan L89 C2 裁定口径）
# 注: M1c 5 任务书 §4 守门字面 5 行走 §1.5 #16-20 豁免（① 自伤），不在前向交付物口径

# === E. DEEPSEEK_API_KEY 不泄漏 ===
grep -rE "sk-[a-z0-9]{32,}" docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md docs/poll/cc-ready.json | wc -l
# 期望: 0

# === F. v1.0 runtime 0 行 diff 守门 ===
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0

git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0

# === G. cc-ready.json valid JSON + task_id 正确 ===
jq -e '.task_id == "T-M1c-DISPATCH"' docs/poll/cc-ready.json
# 期望: true

jq -e '.files_modified | length == 8' docs/poll/cc-ready.json
# 期望: true（v0.2 升级 8 文件改动；audit-scope 在 notes/ 计入 files_modified 注脚）

# === H. M0b/M0c 总报告 + ADR 0010 + 5 subagent 报告 不动 ===
test -f docs/DISPATCH-T-M0b-DONE.md && echo "M0b 总报告 ✅"
test -f docs/DISPATCH-T-M0c-DONE.md && echo "M0c 总报告 ✅"
test -f adr/0010-v1.1-cycle-scope-admission.md && echo "ADR 0010 ✅"
test -f docs/reports/T-M0c-BE-1-report.md && echo "M0c BE-1 报告 ✅"
test -f docs/reports/T-M0c-TG-1-report.md && echo "M0c TG-1 报告 ✅"
test -f docs/reports/T-M0c-DO-1-report.md && echo "M0c DO-1 报告 ✅"
test -f docs/reports/T-M0c-QA-1-report.md && echo "M0c QA-1 报告 ✅"
test -f docs/reports/T-M0c-DD-1-report.md && echo "M0c DD-1 报告 ✅"
test -f notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md && echo "v0.2 audit-scope ✅"

# === I. v0.2 升级范围 8 文件 hygiene 自检表（详见 audit-scope §4）===
ls -la docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md docs/poll/cc-ready.json notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md
```

---

## §4 复审流程（Codex CLI 提交模板）

```bash
# 1. user 亲提 Codex CLI（Claude 不亲提；per fish-harness-project.md 2026-08-30 立）
codex -m gpt-5.6-sol -c model_reasoning_effort=xhigh \
      --input notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md \
      --output notes/codex-review-v1.1-m0c-v0.2-precommit-report.md

# 2. 提交命令前置条件：
#    - git status 含 8 文件改动（M 2 + A 6 + audit-scope 留 notes/）
#    - git log HEAD = 3efe7dc（M0c 5 subagent merge + fix 已推）
#    - working tree 修改未 commit（v0.2 升级待 commit + push）

# 3. Codex 输出落 `notes/codex-review-v1.1-m0c-v0.2-precommit-report.md`
#    格式：PASS / CHANGES REQUIRED / PARTIAL + findings ID/等级/file:line/修法

# 4. 复审结果处理：
#    - PASS → 走 §5.1 v0.2 升级 commit + push（单 commit；归档 commit 分立）
#    - CHANGES REQUIRED → 修 findings → 重新提交 Codex 复审 → 闭环
#    - PARTIAL → 走 §5.2 部分 commit + partial findings 修复轮
```

---

## §5 签发下一枪（v0.2 升级 commit + push + M1 派发准备）

### 5.1 提交策略（单 commit，方案 A）

```bash
cd /Users/kjonekong/projects/fish-harness

# 1. git add 8 文件（audit-scope notes 不在 commit 范围；留本地）
git add docs/v1.1-ga-team-plan.md \
        docs/DISPATCH-T-M1c-BE-1.md \
        docs/DISPATCH-T-M1c-TG-1.md \
        docs/DISPATCH-T-M1c-DO-1.md \
        docs/DISPATCH-T-M1c-QA-1.md \
        docs/DISPATCH-T-M1c-DD-1.md \
        docs/poll/cc-ready.json

# 2. git commit（Co-Authored-By: Claude Code per QA-1 VERIF 4 守门）
git commit -m "feat(v1.1): v0.2 升级 + M1c 任务书 5 DISPATCH

- v1.1-ga-team-plan.md v0.1 → v0.2 (M1 实施中)
- §10.4 v0.2 准备清单 7/8 [x]（#3 newvps 真部署待 user）
- 新增 §11 v0.2→v1.0 升级门槛（M1c/M2/M3 全部通过后）
- §9 修订日志 v0.2 行（M0c 5 subagent PASS + 12 commits 链 + H-1/H-2/H-3 PASS + ADR 0010）
- 5 DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md NEW: BE-1 wrapper 实接 + TG-1 dsh 真调 + DO-1 newvps 真部署 + QA-1 真机 E2E + DD-1 CHANGELOG/README M1c 段
- cc-ready.json task_id → T-M1c-DISPATCH + notes 9 项 v0.2 升级说明

守门:
- 不锁型号 grep: 0 行 (NORTH-STAR A-4 等价类)
- DEEPSEEK_API_KEY 完整 key grep: 0 行 (env-inject only)
- v1.0 runtime 0 行 diff (ADR 0010 Decision d)
- cc-ready.json valid JSON

Co-Authored-By: Claude Code <noreply@anthropic.com>"

# 3. git push via Clash proxy（per M0b BE-1 踩坑 + 2026-09-02 GH013 amend 教训）
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin main

# 4. 如果 GH013 PUSH PROTECTION 拦截（commit 含完整 key 字面），立即 amend 修复：
#    - 检查 cc-ready.json notes 是否含完整 sk-* 字面
#    - 替换为 env-inject only 占位
#    - git commit --amend
#    - git push 重新

# 5. 归档 commit（audit trail）：
git add docs/DISPATCH-T-M0c-V0.2-PRECOMMIT-FIX.md \
        notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md \
        notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md \
        notes/codex-review-v1.1-m0c-v0.2-precommit-report.md
git commit -m "chore(m1c): T-M1c-V0.2-PRECOMMIT-FIX 修复 + audit trail

- DISPATCH-T-M0c-V0.2-PRECOMMIT-FIX.md: 执行书 (修 v0.2 precommit findings)
- notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md: hygiene 守门聚合
- notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md: Codex 复审 prompt
- notes/codex-review-v1.1-m0c-v0.2-precommit-report.md: Codex 复审报告

守门: precommit fix done
Co-Authored-By: Claude Code <noreply@anthropic.com>"
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin main
```

### 5.2 Codex 复审触发（commit 后 formal 轮）

```bash
# 1. user 亲提 Codex CLI（gpt-5.6-sol + xhigh）
codex -m gpt-5.6-sol -c model_reasoning_effort=xhigh \
      --input notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md \
      --output notes/codex-review-v1.1-m0c-v0.2-formal-report.md

# 2. Codex 输出 PASS → 走 §5.3 M1 实施派发流程
# 3. Codex 输出 CHANGES REQUIRED → 修 F1-F4 hygiene + §3 验证命令失败项 → 重新提交
```

### 5.3 M1c 实施派发（Codex PASS + user 「Start v1.1 M1」）

```bash
# 1. user signal "Start v1.1 M1" (per PRD-v1.1 §4.6 第 3 条)

# 2. 真实工程师接手（非 subagent；DO-1 必须上 newvps 实部署）：
#    - BE-1: wrapper/orchestrator/orchestrator.ts 实接 v1.0 kernel HTTP API + dsh invoke（subagent 可辅助原型）
#    - TG-1: dsh 真调（env-inject DEEPSEEK_API_KEY）+ 3 档 profile 适配（真实工程师）
#    - DO-1: user 上 newvps `git clone` + `docker compose -f deploy/newvps-compose.yml up -d` + `tailscale serve --bg --yaml=tailscale-serve-harness.yaml`（user 真实部署）
#    - QA-1: mock 替换为真 dsh 调通 + iPhone Safari 真机 E2E 4 步（真实工程师 + 真机）
#    - DD-1: CHANGELOG 增 [1.1.0-M1c] 段 + README v1.1 段补 M1 实施细节 + v0.3 准备清单（subagent 可辅助）

# 3. 实施者按各自 DISPATCH §6 报告模板填实跑数据

# 4. 架构师按 §4.1 M1c Exit Gate + §11 v0.2→v1.0 升级门槛验证

# 5. 全部 PASS → v0.3 升级 → 走 M2 阶段（6 host + STT + Web Push）
```

---

## §6 沉淀机制（per Codex 复审流水线模式）

### 6.1 已落地沉淀

- `notes/codex-audit-scope-v1.1-m0b-v0.1.md`（M0b 模板阶段 audit-scope，Codex v0.1 复审 PASS — 0C/0M/1m）
- `notes/codex-review-v1.1-m0b-v0.1-report.md`（M0b 模板阶段 Codex v0.1 PASS 报告）
- `notes/codex-audit-scope-v1.1-m0c-v0.1.md`（v0.1 升级 hygiene 守门聚合，grep 自伤豁免）
- `notes/codex-audit-scope-v1.1-m0c-v0.1-prompt.md`（v0.1 升级 Codex 复审 prompt）
- `notes/codex-review-v1.1-m0c-v0.1-precommit-report.md`（v0.1 升级 precommit 轮 CHANGES REQUIRED 1M/3m）
- `notes/codex-review-v1.1-m0c-v0.1-report.md`（v0.1 升级 formal 轮 PASS 0C/0M/2m+1ud）
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md`（v0.2 升级 hygiene 守门聚合，本 prompt 同期落）
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md`（**本文件** = Cursor 审验 prompt，precommit 轮）
- `docs/DISPATCH-T-M0b-DONE.md`（M0b 总报告 5 段 PASS）
- `docs/DISPATCH-T-M0c-DONE.md`（M0c 总报告 5 段 PASS — 待 v0.2 升级 commit 时创建）

### 6.2 待生成沉淀（Codex 复审后）

- `notes/codex-review-v1.1-m0c-v0.2-precommit-report.md`（v0.2 升级 precommit 轮复审报告）
- `notes/codex-review-v1.1-m0c-v0.2-formal-report.md`（v0.2 升级 formal 轮复审报告）
- 若 Codex FAIL → `notes/codex-audit-scope-v1.1-m0c-v0.2-scope-fix.md`（F1-F4 hygiene fix 派工）
- 若 Codex PASS → 进入 §5.3 M1c 实施派发流程

### 6.3 未来复用

- v0.3 / v1.0 升级时按本模式建新 audit-scope-prompt 文件
- 引用 v0.2 audit-scope 作为模板
- 提交前必走 self-audit + 必修 F1-F4 hygiene findings（per fish-harness-project.md 2026-09-01 立）

---

## §7 审验 checklist（Cursor 必填）

- [ ] (A) v0.2 升级完整性 — Header v0.2 + §10.4 7/8 + §11 新增
- [ ] (B) M1c 任务书写实完整性 — 5 DISPATCH ✅
- [ ] (C) dsh `headless` profile 正确性 — TG-1 验证命令 #7
- [ ] (D) v1.0 runtime 不漂移守门 — §3 验证 #F
- [ ] (E) DEEPSEEK_API_KEY 不泄漏 — §3 验证 #E
- [ ] (F) cc-ready.json 事实准确性 — 7 子项
- [ ] (G) 潜在新 finding — G1-G7 主动探查

**判定**: ☐ PASS  ☐ CHANGES REQUIRED（findings ___） ☐ PARTIAL（___ PASS / ___ FAIL）

**findings 列表**（如有）：

| ID | 等级 | file:line | 描述 | 修法建议 |
|----|------|-----------|------|----------|
| | | | | |

---

*audit-scope-prompt — v1.1 M0c v0.2 升级 + M1 派发 precommit 轮审验 prompt for Cursor（Codex v0.2 风格）；grep 自伤豁免机制由 `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` 提供；本 prompt 含完整 §1-§7 审验框架 + 下一枪 commit/push + Codex 复审 + M1c 实施派发流程*