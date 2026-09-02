# DISPATCH-T-M1c-EXEC — M1c 实施派发执行书

> **Date**: 2026-09-02
> **Trigger**: user 2026-09-02 「Start v1.1 M1」（per PRD-v1.1 §4.6 第 3 条）
> **Scope**: 4 subagent 并发（BE-1 + TG-1 + DO-1 + QA-1）+ DD-1 等实施完成后单独派发
> **Source**: v0.2 升级 commit `e590124` + audit trail `459c916` + hygiene fix `161db8e`
> **关系**: 本文件 = 派发指令；任务定义详见 5 DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md

---

## §1 派发清单（4 subagent 并发 + 1 后置）

| ID | Role | 任务 | 估时 | worktree branch | commit prefix | 报告 |
|---|------|------|------|-----------------|---------------|------|
| T-M1c-BE-1-EXEC | BE | wrapper 实接 v1.0 kernel HTTP API + dsh invoke + PWA server | 7d (关键路径) | `worktree-agent-T-M1c-BE-1` | `feat(m1c): BE-1` | `docs/reports/T-M1c-BE-1-report.md` |
| T-M1c-TG-1-EXEC | TG | dsh 真调 + 3 档 profile 适配 (orch/commander/worker headless) | 5d (与 BE-1 并行) | `worktree-agent-T-M1c-TG-1` | `feat(m1c): TG-1` | `docs/reports/T-M1c-TG-1-report.md` |
| T-M1c-DO-1-EXEC | DO | newvps 部署 runbook + Tailscale-only + wrapper 容器 + env 模板 | 3d (依赖 BE/TG 部分) | `worktree-agent-T-M1c-DO-1` | `feat(m1c): DO-1` | `docs/reports/T-M1c-DO-1-report.md` |
| T-M1c-QA-1-EXEC | QA | dsh 真调集成测试 + Playwright E2E 占位 + iPhone Safari runbook | 5d (依赖 BE/TG/DO) | `worktree-agent-T-M1c-QA-1` | `feat(m1c): QA-1` | `docs/reports/T-M1c-QA-1-report.md` |
| T-M1c-DD-1-EXEC | DD | CHANGELOG `[1.1.0-M1c]` + README v1.1 M1c 段 + v0.3 准备清单 + notes/v1.1-m1c-release-notes.md | 2d (**等 M1c 实施完成 + user 真部署 + 真机 E2E 后单独派发**) | `worktree-agent-T-M1c-DD-1` | `feat(m1c): DD-1` | `docs/reports/T-M1c-DD-1-report.md` |

**关键路径**：BE-1 (7d) 是关键路径；TG-1/DO-1 与 BE-1 并行；QA-1 等 BE-1/TG-1 部分产出；DD-1 等 M1c 实施完成。

---

## §2 worktree 协议

每个 subagent 在独立 worktree branch 上工作，**不直接 commit 到 main**：

```bash
# subagent 启动时
git worktree add ../fish-harness-{role} -b worktree-agent-T-M1c-{role}-1 main
cd ../fish-harness-{role}

# subagent 实施 + commit (commit message 用 feat(m1c): {role}-1 {description})
git add <files>
git commit -m "feat(m1c): {role}-1 {description}

- {产出 1}
- {产出 2}
- ...

守门:
- tsc --noEmit exit 0
- vitest run exit 0 (覆盖率 ≥ 80% where applicable)
- 不锁型号 grep = 0
- DEEPSEEK_API_KEY 完整 key grep = 0
- v1.0 runtime 0 行 diff
- dsh headless profile

Co-Authored-By: Claude Code <noreply@anthropic.com>"

# subagent 完成后
git log --oneline worktree-agent-T-M1c-{role}-1 ^main
# 架构师 merge: git checkout main && git merge --no-ff worktree-agent-T-M1c-{role}-1 -m "feat(m1c): merge T-M1c-{role}-1 ..."

# 清理 worktree
git worktree remove ../fish-harness-{role}
git branch -D worktree-agent-T-M1c-{role}-1
```

---

## §3 验证守门 (per 各 DISPATCH §4)

### 通用守门（所有 4 subagent）

- **不锁型号**: `grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/ deploy/ | wc -l` = 0
- **DEEPSEEK_API_KEY 不泄漏**: `grep -rE "sk-[a-z0-9]{32,}" docs/ wrapper/ deploy/ env/ | wc -l` = 0
- **v1.0 runtime 不漂移**: `git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l` = 0
- **dsh headless profile**: `grep -rE "profile: ['\"]web['\"]" wrapper/ | wc -l` = 0

### 角色专属守门

| Role | 验证命令 |
|------|----------|
| BE-1 | `cd wrapper && npm run tsc && npm test` exit 0；`curl -X POST http://localhost:3000/api/pwa/dispatch` 返回 200；curl status/{task_id} 200 |
| TG-1 | `DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" npm run test:integration` 3 档 profile 各 1 次 exit 0 |
| DO-1 | `docker compose -f deploy/newvps-compose.yml config --quiet` exit 0；`yq eval '.services.harness' deploy/tailscale-serve-harness.yaml` 非空 |
| QA-1 | `cd wrapper && npm run test:coverage` 覆盖率 ≥ 80%；`npm run test:e2e:smoke` exit 0 |

---

## §4 派发指令（架构师 → subagent prompt 模板）

每个 subagent 收到如下指令：

```
你是 T-M1c-{role}-1 subagent，负责实施 M1c 阶段 {role} 任务。

任务书位置: docs/DISPATCH-T-M1c-{role}-1.md （必读全文 §1-§8）

工作目录: ../fish-harness-{role} （worktree branch worktree-agent-T-M1c-{role}-1）

任务:
1. 读 DISPATCH-T-M1c-{role}-1.md 全文（含 §1-§8）
2. 读 docs/v1.1-ga-team-plan.md v0.2 §2 + §6.2 + §10.4（必读）
3. 读 notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md §1-§4（hygiene 守门）
4. 实施 §3 产出清单所有文件
5. 跑 §4 验证命令清单
6. 写 docs/reports/T-M1c-{role}-1-report.md 报告（按 §6 模板）
7. commit 到 worktree branch（不 commit 到 main）

产出 commit message 规范:
- 前缀: feat(m1c): {role}-1
- Co-Authored-By: Claude Code <noreply@anthropic.com>
- 不锁型号 / DEEPSEEK_API_KEY / v1.0 runtime / dsh headless 守门 4 项必填

禁止:
- ❌ 不直接 commit 到 main
- ❌ 不写完整 sk-* DEEPSEEK_API_KEY 入 commit (env-inject only)
- ❌ 不锁具体模型型号 (per NORTH-STAR A-4 等价类约束)
- ❌ 不动 v1.0 runtime (harness/ spec/ spikes/ 9 ADR body/ Dockerfile/ docker-compose.yml/ pyproject.toml)
- ❌ 不调 dsh `web` profile (用 headless)
- ❌ 不做范围外功能 (6 host 部署 M2 / STT M2 / Web Push M2 / commander ≥3 M3)
- ❌ 不打 v1.1.0 GA tag

完成后报告:
- docs/reports/T-M1c-{role}-1-report.md commit hash
- §4 验证命令全 exit 0 证据 (含 command + output)
- 任何边界问题 + 修法
```

---

## §5 派发顺序（4 subagent 并发 + 1 后置）

### Step 1：架构师创建 4 worktree

```bash
cd /Users/kjonekong/projects/fish-harness
git worktree add ../fish-harness-m1c-be -b worktree-agent-T-M1c-BE-1 main
git worktree add ../fish-harness-m1c-tg -b worktree-agent-T-M1c-TG-1 main
git worktree add ../fish-harness-m1c-do -b worktree-agent-T-M1c-DO-1 main
git worktree add ../fish-harness-m1c-qa -b worktree-agent-T-M1c-QA-1 main
```

### Step 2：派 4 subagent 并发（Agent tool 一次性发 4 个）

每个 subagent 在各自 worktree 上工作，**互不冲突**（各自修改不同文件 / 目录）。

### Step 3：subagent 完成 → 架构师 merge

```bash
# 架构师逐个 merge（按 §3 验证后再 merge）
git checkout main
git merge --no-ff worktree-agent-T-M1c-BE-1 -m "feat(m1c): merge T-M1c-BE-1 wrapper 实接 kernel HTTP + PWA server"
git merge --no-ff worktree-agent-T-M1c-TG-1 -m "feat(m1c): merge T-M1c-TG-1 dsh 真调 + 3 档 profile"
git merge --no-ff worktree-agent-T-M1c-DO-1 -m "feat(m1c): merge T-M1c-DO-1 newvps 部署 runbook + Tailscale-only"
git merge --no-ff worktree-agent-T-M1c-QA-1 -m "feat(m1c): merge T-M1c-QA-1 真机 E2E runbook + dsh 集成测试"

# push via Clash proxy
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin main

# 清理 worktree
git worktree remove ../fish-harness-m1c-be
git worktree remove ../fish-harness-m1c-tg
git worktree remove ../fish-harness-m1c-do
git worktree remove ../fish-harness-m1c-qa
git branch -D worktree-agent-T-M1c-BE-1
git branch -D worktree-agent-T-M1c-TG-1
git branch -D worktree-agent-T-M1c-DO-1
git branch -D worktree-agent-T-M1c-QA-1
```

### Step 4：通知 user 真部署 + 真机

架构师 §4 验证全过 + 4 merge commits push 完毕后，通知 user：
- 上 newvps 执行 DO-1 runbook (`deploy/runbook-newvps-m1c.md`)
- 在 iPhone Safari 执行 QA-1 真机 E2E runbook (`wrapper/test/e2e/runbook-iphone-safari-m1c.md`)

### Step 5：user 真部署 + 真机完成 → 派 T-M1c-DD-1-EXEC

user 上 newvps 真部署 + iPhone Safari 真机 E2E 全过后，架构师派 T-M1c-DD-1-EXEC：
- CHANGELOG `[1.1.0-M1c]` 段
- README v1.1 M1c 段
- plan §10.5 v0.3 准备清单
- notes/v1.1-m1c-release-notes.md

### Step 6：DD-1 完成 → M1c Exit Gate 全过

- §4 各 DISPATCH 验证命令全 exit 0
- user 真部署 + 真机 E2E 4 步全过
- DD-1 CHANGELOG/README commit

### Step 7：架构师裁定 v0.3 升级准备

- v0.3 准备清单 8/8 [x]（含 user 真部署 + 真机 E2E 全过）
- §10.3 v0.2→v1.0 升级门槛未启动（M2/M3 阶段）
- 架构师发"GO v0.3 升级准备"信号

---

## §6 M1c Exit Gate（per §4 各 DISPATCH）

| 阶段 | Gate | 状态 |
|------|------|------|
| §4 #1 tsc + vitest 全过 | wrapper 实跑 exit 0 | subagent 实施后 |
| §4 #2 iPhone Safari 真机 E2E 4 步 | PWA 打开 / 表单提交 / 24h 完成 / 完成态可见 | **user 真机后** |
| §4 #3 newvps 真部署 | curl https://harness.rana.asia:443/health 200 | **user 真部署后** |
| §4 #4 dsh 真调 3 档 profile | exit 0 + headless profile | subagent 实施后 |
| §4 #5 v1.0 runtime 0 行 diff | git diff == 0 | subagent 实施后 |
| §4 #6 不锁型号 grep = 0 | wrapper + deploy 全过 | subagent 实施后 |
| §4 #7 DEEPSEEK_API_KEY 不泄漏 | env-inject only | subagent 实施后 |
| §4 #8 §10.4 v0.2 准备清单 8/8 [x] | #3 newvps 真部署 = 用户勾 | **user 真部署后** |

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` v0.2 §1 M1c 阶段 + §2 5 角色任务 + §3 handoff + §6.2 PR8-PR11 + §10.4 v0.2 准备清单
- `docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md` 5 任务书
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§4 hygiene 守门
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md` Codex 复审 prompt（user 亲提）
- v0.2 升级 commit `e590124` + audit trail `459c916` + hygiene fix `161db8e`
- M0c 5 subagent 经验: `docs/reports/T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}-report.md` 6 commits 链
- `wrapper/` M0c 5 subagent 落地骨架（M1c 深度实施目录）
- `deploy/` M0c DO-1 落地 4 文件（M1c 扩）

---

## §8 不做 + 留给后续

### 8.1 不在 M1c 范围（DD-1 / 后续阶段）

- ❌ 不写 CHANGELOG `[1.1.0-M1c]`（DD-1 后置派发）
- ❌ 不写 README v1.1 M1c 段（DD-1 后置派发）
- ❌ 不写 v0.3 升级准备清单（DD-1 后置派发）
- ❌ 不打 v1.1.0 GA tag（M3 通过后由架构师打）

### 8.2 不在 M1c 范围（M2/M3 阶段）

- ❌ 不做 6 host 部署（M2）
- ❌ 不做 STT（M2）
- ❌ 不做 Web Push（M2）
- ❌ 不做 commander ≥3（M3）
- ❌ 不做 Evidence Graph + MemoryStore + CapabilityProfile（M3）

### 8.3 留给 user 真实操作

- ❌ subagent 不上 newvps（DO-1 写 runbook + 配置；user 上 newvps 真部署）
- ❌ subagent 不用 iPhone Safari（QA-1 写 Playwright + runbook；user 真机 E2E）

---

*DISPATCH-T-M1c-EXEC — M1c 实施派发执行书；4 subagent 并发 (BE-1/TG-1/DO-1/QA-1) + DD-1 后置派发；user 真部署 + 真机 E2E 留 user；worktree isolation 防 commit 冲突；M1c Exit Gate 全过 → v0.3 升级准备 → M2 阶段*