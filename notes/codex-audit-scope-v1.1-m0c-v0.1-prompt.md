# Codex Audit-scope Prompt — v1.1 M0c v0.1 升级 8 文件改动复审

> **Date**: 2026-09-02
> **Reviewer**: Cursor（拟 Codex `gpt-5.6-sol` + `reasoning_effort=xhigh` 风格；用户亲提 Codex CLI 复审）
> **复审对象**: v1.1 GA plan v0.0 DRAFT → v0.1 升级 8 文件改动（commit 尚未生成；HEAD = `5b3d263` + 当前 working tree 修改）
> **判定格式**: **PASS** / **CHANGES REQUIRED** / **PARTIAL**（Codex v0.0 风格 0C/0M/Nm 或 N/Nm）
> **配套**: hygiene 守门在 `notes/codex-audit-scope-v1.1-m0c-v0.1.md`（已落地，grep 自伤豁免）
> **关系**: 本文件 = Cursor 审验 prompt；hygiene audit-scope = 复审辅助（grep 守门 + 自伤豁免机制）

---

## §1 复审范围（v0.1 升级 8 文件）

### 1.1 修改文件 (M)

| # | 文件 | 行数 | 改动概述 |
|---|------|------|----------|
| 1 | `docs/v1.1-ga-team-plan.md` | ~30 处 patch | Header Status `🟡 DRAFT v0.0` → `🟢 v0.1 (实施中)` + Date `2026-09-01` → `2026-09-02`；§1 M0b 阶段 done + M0c 写实；§2.1-2.5 5 角色 M0b ✅ done + M0c 任务书写实；§3 handoff M0b done + M0c 内部 5 个新增；§6.2 M0c PR4-PR7 写实；§9 修订日志 v0.1 行；§10.1 check 全 ✅；新增 §10.2 v0.1→v0.2 升级门槛（M0c 通过后）；新增 §10.3 v0.2→v1.0 升级门槛（M0c/M1/M2/M3 全部通过）|
| 2 | `docs/poll/cc-ready.json` | 4 Edit | task_id `T-M0b-DONE-AWAIT-USER` → `T-M0c-DISPATCH`；status v0.1 升级完成；files_modified 7 文件清单；notes 8 项 v0.1 升级说明 + ADR 0010 enforcement |

### 1.2 新增文件 (A)

| # | 文件 | 行数 | 内容概述 |
|---|------|------|----------|
| 3 | `docs/DISPATCH-T-M0c-BE-1.md` | 100 行 | Role BE 任务书：TypeScript wrapper skeleton (orchestrator/commander/worker.ts) + HTTP/FFI 调用 v1.0 kernel；估时 5-7d |
| 4 | `docs/DISPATCH-T-M0c-TG-1.md` | 113 行 | Role TG 任务书：dsh wrapper TS client + tool provider + 3 档 profile 适配；估时 5-7d |
| 5 | `docs/DISPATCH-T-M0c-DO-1.md` | 148 行 | Role DO 任务书：Tailscale-only + newvps 共址 + 1 worker 部署；估时 3-5d |
| 6 | `docs/DISPATCH-T-M0c-QA-1.md` | 118 行 | Role QA 任务书：TS wrapper 集成测试 + M1 E2E 脚手架；估时 3-5d |
| 7 | `docs/DISPATCH-T-M0c-DD-1.md` | 118 行 | Role DD 任务书：CHANGELOG `[1.1.0-M0c]` 段 + README v1.1 段 + v0.2 准备清单；估时 2-3d |
| 8 | `notes/codex-audit-scope-v1.1-m0c-v0.1.md` | 74 行 | hygiene 守门聚合（不锁型号 / 不硬编码 API key / v1.0 runtime 0 行 diff）；grep 范围限定到前向交付物口径（docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-*.md）；notes/ 自伤豁免 |

**总改动：2 文件 Edit + 6 文件 NEW = 8 文件**（之前 plan 写 7 文件；audit-scope 是新加的第 8 文件）

### 1.3 关联不动文件 (Unmodified scope discipline)

- `harness/` + `spec/` + `spikes/` + `_helpers.py` + 9 ADR body + `Dockerfile` + `docker-compose.yml` + `pyproject.toml` + `docs/v1.0-ga-team-plan.md`（ADR 0010 Decision (d) v1.0 runtime 不漂移守门）
- `docs/DISPATCH-T-M0b-DONE.md`（M0b 总报告 5 段）+ `adr/0010-v1.1-cycle-scope-admission.md`（v1.1 cycle scope admission Accepted）+ `notes/codex-review-v1.1-m0b-v0.1-report.md`（Codex v0.1 PASS 报告）
- `spec/capabilities/{orch,commander,worker,newvps_ram}.json`（M0b 落地 4 SKU；v0.1 升级不动）
- `docs/m0b/profile-override-{base,orch,commander,worker}.yaml` + `m0b-rest-spike.py`（M0b 模板；v0.1 升级引用但不改）

---

## §2 复审重点（Cursor 必查）

### (A) M0b PASS 证据完整性（v1.1-ga-team-plan.md §1 / §10.1）

- ✅ M0b 阶段标注"✅ done, commit 5b3d263"，含 **12 commits 链**（`9f5ef4b` → `fb429e3` → `0da83a5` → `5e698c8` → `49e8380` → `9ab65b5` → `4cf0ece` → `6228ff5` → `fdd10ea` → `50d4c29` → `2b0953a` → `5b3d263`）
- ✅ §10.1 v0.0→v0.1 升级门槛 10 项 check 全部 `[x]`（commit 5b3d263 验证全绿）
- ✅ H-1 dsh 覆盖 ≥ 80%（3 档 quality_score 中位数 4 ≥ 4 阈值；退出码 3/3 成功）
- ✅ H-2 三层等价类差异记录（orch 213s / commander 76s / worker 11s, 19x/7x/1x 阶梯）
- ✅ H-3 wrapper LOC 估算范围 4800-8500（orch 1500-2500 / commander 2000-3500 / worker 800-1500 / 共用 500-1000）
- ✅ spec/capabilities/ ≥ 3 SKU（实际 4 SKU: orch/commander/worker/newvps_ram）
- ✅ ADR 0010 commit + Status=Accepted（commit 2b0953a）
- ✅ v1.0 runtime 0 行 diff（commit 5b3d263 验证）
- ✅ 不锁型号守门（前向交付物口径 grep = 0；详见 audit-scope §1 + §1.5 历史豁免 12 文件 39 处三类定性）
- ✅ 用户发 "Start v1.1 M0b"（PRD-v1.1 §4.6 第 3 条；2026-09-02 已发）

### (B) M0c 任务书写实完整性（5 DISPATCH）

- ✅ 5 DISPATCH 文件存在 + 含 §1 任务定义 / §2 输入 / §3 产出 / §4 验证命令 / §5 估时 / §6 报告模板 / §7 cross-ref / §8 禁止
- ✅ 总估时 18-27d ≈ 2-3 周（与 PRD-v1.1 §5 M0c 对齐）
- ✅ 不锁型号守门（5 DISPATCH 全部用 audit-scope §1 引用，无字面 grep pattern）
- ✅ 不硬编码 API key（env-inject only；DEEPSEEK_API_KEY 通过环境变量 + inline prefix）
- ✅ 不动 v1.0 runtime（HTTP/FFI 调 `/health` 端点；kernel 不改）
- ✅ TypeScript Protocol ↔ Python Protocol 类型对位（不 fork schema；不 1:1）

### (C) dsh `headless` profile 正确性（5 DISPATCH §4 验证）

- ✅ T-M0c-TG-1 验证命令 #7：grep `profile: ['"]web['"]` 在 wrapper/dsh/ = 0 行（用 headless，非 web）
- ✅ M0b BE-1/TG-1/DO-1 三 subagent 全部独立发现 web 是 Web UI server，QA-1 统一修订 5 DISPATCH §6.X（commit 50d4c29 验证）

### (D) v1.0 runtime 不漂移守门（8 文件改动范围）

- ✅ v0.1 升级 8 文件全部在 `docs/` + `notes/` + `docs/poll/`（不触及 harness/ + spec/ + spikes/ + 9 ADR body + Dockerfile + docker-compose.yml + pyproject.toml + docs/v1.0-ga-team-plan.md）
- ✅ audit-scope §3 提供 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域> | wc -l` = 0 验证

### (E) DEEPSEEK_API_KEY 不泄漏（GH013 PUSH PROTECTION 教训）

- ✅ audit-scope §2 提供 `grep -rE "sk-[a-z0-9]{32,}" docs/ wrapper/ deploy/ | wc -l` = 0 验证
- ✅ cc-ready.json notes 用 env-inject only 占位（不写完整 key）

### (F) cc-ready.json 事实准确性（per cc-ready §6 守门）

- ✅ task_id = `T-M0c-DISPATCH`（v0.1 升级后首任务派发；等 user 「Start v1.1 M0c」启动）
- ✅ commit field = `HEAD = v0.1 升级 commit`（v0.1 升级 commit 尚未生成；本字段待 commit 后更新）
- ✅ created_at = `2026-09-02T18:00:00Z`
- ✅ status = `v0.1 升级 GO 完成；M0c 任务书细化完成；当前 pending = user 「Start v1.1 M0c」`
- ✅ files_modified 7 文件清单（不入 notes/codex-audit-scope-v1.1-m0c-v0.1.md，因为落本地不 commit）
- ✅ files_unmodified_scope_discipline 14 项 v1.0 runtime 不动项 + 4 项 plan 文档
- ✅ notes 8 项 v0.1 升级说明 + ADR 0010 enforcement + GH013 教训 + 下一步 user signals

### (G) 潜在新 finding 风险点（Cursor 主动探查）

- G1 §10.2 + §10.3 是否与 §10.1 逻辑自洽（v0.1→v0.2→v1.0 三级门槛递进）
- G2 §2 5 角色 M0c 任务估时是否与 PRD-v1.1 §5 M0c (2-3 周) 对齐（18-27d ≈ 2-3 周 ✓）
- G3 §3 handoff M0c 内部 5 个新增是否覆盖 BE-1 → TG-1 → QA-1 + DO-1 + DD-1 全链路
- G4 §6.2 M0c PR4-PR7 是否与 §2 5 角色任务书产出对齐
- G5 §9 修订日志 v0.1 行是否引用足够证据（commit 5b3d263 + 12 commits 链 + H-1/H-2/H-3 + ADR 0010）
- G6 §7.3 M0b 5 模板清单是否含 spike 实跑数据落地（commit fdd10ea/6228ff5/4cf0ece/50d4c29/2b0953a 引用）
- G7 §11 cross-ref 是否新增 M0c 相关引用（5 DISPATCH + wrapper/ + spec/capabilities/）

---

## §3 验证命令矩阵（verbatim 实跑）

```bash
# === A. v1.1-ga-team-plan.md v0.1 升级完整性 ===
grep -c "v0.1" docs/v1.1-ga-team-plan.md
# 期望: ≥ 10

grep -c "T-M0c-" docs/v1.1-ga-team-plan.md
# 期望: ≥ 5（5 DISPATCH 引用）

grep -c "commit 5b3d263\|M0b.*done\|✅.*done" docs/v1.1-ga-team-plan.md
# 期望: ≥ 5

grep -c "ADR 0010\|0010-v1.1-cycle-scope-admission" docs/v1.1-ga-team-plan.md
# 期望: ≥ 1

# === B. M0c 5 DISPATCH 文件存在 ===
for f in docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md; do
  test -f "$f" && echo "$f ✅"
done

# === C. M0c 5 DISPATCH §1 任务定义存在 ===
for f in docs/DISPATCH-T-M0c-*.md; do
  grep -c "^## §1 任务定义" "$f"  # 期望: ≥ 1
done

# === D. 不锁型号守门（v0.1 升级 8 文件范围）===
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-*.md docs/poll/cc-ready.json | wc -l
# 期望: 0

# v0.1 升级前向交付物口径守门（不含历史文档，详见 audit-scope §1）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-*.md | wc -l
# 期望: 0（实测 == 0；M0b plan L89 C2 裁定口径）

# 历史文档豁免口径锚定（audit-scope §1.5 清单 12 文件 39 处三类定性；不清洗历史）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ | wc -l
# 期望: == 39（豁免口径锚定）

# === E. DEEPSEEK_API_KEY 不泄漏 ===
grep -rE "sk-[a-z0-9]{32,}" docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-*.md docs/poll/cc-ready.json | wc -l
# 期望: 0

# === F. v1.0 runtime 0 行 diff 守门 ===
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0

git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0

# === G. cc-ready.json valid JSON + task_id 正确 ===
jq -e '.task_id == "T-M0c-DISPATCH"' docs/poll/cc-ready.json
# 期望: true

jq -e '.files_modified | length == 7' docs/poll/cc-ready.json
# 期望: true（v0.1 升级 7 文件改动；audit-scope 在 notes/ 不计入 files_modified）

# === H. M0b 总报告 + ADR 0010 不动（之前 commit 应保留）===
test -f docs/DISPATCH-T-M0b-DONE.md && echo "M0b 总报告 ✅"
test -f adr/0010-v1.1-cycle-scope-admission.md && echo "ADR 0010 ✅"
test -f notes/codex-review-v1.1-m0b-v0.1-report.md && echo "Codex v0.1 PASS 报告 ✅"
test -f notes/codex-audit-scope-v1.1-m0b-v0.1.md && echo "M0b audit-scope ✅"
test -f notes/codex-audit-scope-v1.1-m0c-v0.1.md && echo "M0c audit-scope ✅"

# === I. v0.1 升级范围 8 文件 hygiene 自检表（详见 audit-scope §4）===
ls -la docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md docs/poll/cc-ready.json notes/codex-audit-scope-v1.1-m0c-v0.1.md
```

---

## §4 复审流程（Codex CLI 提交模板）

```bash
# 1. 用户亲提 Codex CLI（Claude 不亲提；per fish-harness-project.md 2026-08-30 立）
codex -m gpt-5.6-sol -c model_reasoning_effort=xhigh \
      --input notes/codex-audit-scope-v1.1-m0c-v0.1-prompt.md \
      --output notes/codex-review-v1.1-m0c-v0.1-report.md

# 2. 提交命令前置条件：
#    - git status 含 8 文件改动（M 2 + A 6 + audit-scope 留 notes/）
#    - git log HEAD = 5b3d263（M0b 总报告 + ADR 0010 + cc-ready amend 已推）
#    - working tree 修改未 commit（v0.1 升级待 commit + push）

# 3. Codex 输出落 `notes/codex-review-v1.1-m0c-v0.1-report.md`
#    格式：PASS / CHANGES REQUIRED / PARTIAL + findings ID/等级/file:line/修法

# 4. self-audit 模式（可选；2026-09-01 立）：
#    用户/架构师模拟 gpt-5.6-sol + xhigh 跑 §3 矩阵 verbatim
#    输出落 `notes/codex-review-v1.1-m0c-v0.1-self-audit.md`
```

---

## §5 签发下一枪（v0.1 升级 commit + push 流程）

### 5.1 提交策略（用户裁定二选一）

**方案 A（推荐单 commit）**：

```bash
cd /Users/kjonekong/projects/fish-harness

# 1. git add 7 文件（audit-scope notes 不在 commit 范围；留本地）
git add docs/v1.1-ga-team-plan.md \
        docs/DISPATCH-T-M0c-BE-1.md \
        docs/DISPATCH-T-M0c-TG-1.md \
        docs/DISPATCH-T-M0c-DO-1.md \
        docs/DISPATCH-T-M0c-QA-1.md \
        docs/DISPATCH-T-M0c-DD-1.md \
        docs/poll/cc-ready.json

# 2. git commit（Co-Authored-By: Claude Code per QA-1 VERIF 4 守门）
git commit -m "feat(v1.1): v0.1 升级 + M0c 任务书 5 DISPATCH

- v1.1-ga-team-plan.md v0.0 DRAFT → v0.1 (实施中)
- §1 M0b 阶段 ✅ done (commit 5b3d263, 12 commits 链, H-1/H-2/H-3 PASS)
- §2 5 角色 M0b 任务 ✅ done + M0c 任务书写实 (T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1})
- §3 handoff M0b done + M0c 内部 5 个新增
- §6.2 M0c PR4-PR7 写实 (skeleton + dsh wrapper + newvps 部署 + 集成测试 + CHANGELOG/README v1.1)
- §9 修订日志 v0.1 行
- §10.1 check 全 ✅; 新增 §10.2 v0.1→v0.2 + §10.3 v0.2→v1.0 升级门槛
- 5 DISPATCH-T-M0c-*.md NEW: 总估时 18-27d ≈ 2-3 周
- cc-ready.json task_id → T-M0c-DISPATCH + notes 8 项 v0.1 升级说明

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
```

**方案 B（备选拆 2 commit）**：

```bash
# commit 1: v0.1 升级 (v1.1-ga-team-plan.md + cc-ready.json)
git add docs/v1.1-ga-team-plan.md docs/poll/cc-ready.json
git commit -m "feat(v1.1): v0.1 升级 (v1.1-ga-team-plan.md v0.0 DRAFT → v0.1)"
# 然后 push

# commit 2: M0c 5 DISPATCH 任务书细化
git add docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md
git commit -m "feat(v1.1): M0c 5 DISPATCH 任务书细化"
# 然后 push
```

### 5.2 Codex 复审触发（commit 后）

```bash
# 1. 用户亲提 Codex CLI（gpt-5.6-sol + xhigh）
codex -m gpt-5.6-sol -c model_reasoning_effort=xhigh \
      --input notes/codex-audit-scope-v1.1-m0c-v0.1-prompt.md \
      --output notes/codex-review-v1.1-m0c-v0.1-report.md

# 2. Codex 输出 PASS → 走 §5.3 派发流程
# 3. Codex 输出 CHANGES REQUIRED → 修 F1-F4 hygiene + §3 验证命令失败项 → 重新提交
```

### 5.3 M0c 实施派发（Codex PASS + user 「Start v1.1 M0c」）

```bash
# 1. user signal "Start v1.1 M0c" (per PRD-v1.1 §4.6 第 3 条)

# 2. 架构师派发 5 个 T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1} subagent（per user 2026-09-01 subagent 偏好）
#    - BE-1: TypeScript wrapper skeleton (subagent 或真实工程师)
#    - TG-1: dsh wrapper TS client (subagent 或真实工程师)
#    - DO-1: Tailscale + newvps 部署 (真实工程师; subagent 不部署)
#    - QA-1: TS wrapper 集成测试 (subagent 或真实工程师)
#    - DD-1: CHANGELOG/README v1.1 + v0.2 准备 (subagent 或真实工程师)

# 3. 实施者按各自 DISPATCH §6 报告模板填实跑数据

# 4. 架构师按 §4.2 M0c Exit Gate + §10.2 v0.1→v0.2 升级门槛验证

# 5. 全部 PASS → v0.2 升级 → 走 M1 阶段
```

---

## §6 沉淀机制（per Codex 复审流水线模式）

### 6.1 已落地沉淀

- `notes/codex-audit-scope-v1.1-m0b-v0.1.md`（M0b 模板阶段 audit-scope，Codex v0.1 复审 PASS — 0C/0M/1m）
- `notes/codex-review-v1.1-m0b-v0.1-report.md`（M0b 模板阶段 Codex v0.1 PASS 报告）
- `notes/codex-audit-scope-v1.1-m0c-v0.1.md`（v0.1 升级 hygiene 守门聚合，grep 自伤豁免）
- `notes/codex-audit-scope-v1.1-m0c-v0.1-prompt.md`（**本文件** = Cursor 审验 prompt）
- `docs/DISPATCH-T-M0b-DONE.md`（M0b 总报告 5 段 PASS）

### 6.2 待生成沉淀（Codex 复审后）

- `notes/codex-review-v1.1-m0c-v0.1-report.md`（v0.1 升级 Codex v0.1 复审报告；FAIL/PASS）
- 若 Codex FAIL → `notes/codex-audit-scope-v1.1-m0c-v0.2-scope-fix.md`（F1-F4 hygiene fix 派工）
- 若 Codex PASS → 进入 §5.3 M0c 实施派发流程

### 6.3 未来复用

- v0.2 / v1.0 升级时按本模式建新 audit-scope-prompt 文件
- 引用 v0.1 audit-scope 作为模板
- 提交前必走 self-audit + 必修 F1-F4 hygiene findings（per fish-harness-project.md 2026-09-01 立）

---

## §7 审验 checklist（Cursor 必填）

- [ ] (A) M0b PASS 证据完整性 — 9 项 ✅
- [ ] (B) M0c 任务书写实完整性 — 5 DISPATCH ✅
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

*audit-scope-prompt — v1.1 M0c v0.1 升级 8 文件改动审验 prompt for Cursor（Codex v0.1 风格）；grep 自伤豁免机制由 `notes/codex-audit-scope-v1.1-m0c-v0.1.md` 提供；本 prompt 含完整 §1-§7 审验框架 + 下一枪 commit/push + Codex 复审 + M0c 实施派发流程*