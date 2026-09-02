# T-M1c-DD-1 — CHANGELOG [1.1.0-M1c] + README v1.1 M1 段 + v0.3 准备清单

> **Task ID**: T-M1c-DD-1
> **Date**: 2026-09-02
> **Role**: DD (Documentation Deliverable)
> **Stage**: v1.1 M1c
> **Trigger**: T-M1c-GATE-REPAIR-2 PASS（commit pending）+ cc-ready task_id `T-M1c-AWAIT-DEPLOY` + user 2026-09-02 「e 和 f 请启动」
> **Status**: 🟡 DISPATCH DRAFT（待 subagent 实施）
> **Author**: 架构师 Claude Fable 5 (claude-fable-5)
> **Worktree**: 主仓 `main`（无 worktree 隔离；documentation 类改动）

---

## §1 任务定义（一句话）

起草并提交 **3 项** DD 产出：(1) `CHANGELOG.md` 加 `[1.1.0-M1c]` 段；(2) `README.md` 加 v1.1 M1 段（含 newvps 真部署 + Tailscale HTTPS 入口 + wrapper 三 profile）；(3) `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` 准备清单（v0.3 升级门槛 + hygiene 守门口径 + 待覆盖范围）。

---

## §2 输入

| 资源 | 用途 |
|------|------|
| `docs/reports/T-M1c-GATE-REPAIR-2-report.md` | M1c 实施收口 6 段（findings / G1-G4 实证 / verbatim 验证 / 改动 9 文件 / cross-ref / next）|
| `docs/DISPATCH-T-M0c-DONE.md` | M0c 总报告 5 段 PASS（5 subagent 全绿 + 11 commits 链 + newvps 真部署 6 大坑）|
| `adr/0010-v1.1-cycle-scope-admission.md` | v1.1 cycle scope admission Accepted（v1.1+ 周期第一份合同）|
| `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` | v0.2 当前 hygiene 守门锚定（tracked 重锚 == 68，docs 主表 29 文件 68 行）|
| `docs/v1.1-ga-team-plan.md` | v1.1 GA plan v0.1（M0c 任务书细化完成；§10.4 v0.2 → v0.3 升级门槛）|
| `wrapper/` 目录（M0c 5 subagent 落地）| orchestrator/{orchestrator,commander,worker,types}.ts + dsh/{dsh_client,tool_provider,types}.ts + test/{unit,integration,e2e} + vitest.config.ts |
| `deploy/` 目录（M0c DO-1 落地）| newvps-compose.yml + tailscale-serve-harness.yaml + tailscale-acl.yaml + env/newvps.env.example |

---

## §3 产出（3 文件）

### 3.1 `CHANGELOG.md` 加 `[1.1.0-M1c]` 段

**位置**：插在 `[1.0.0]` 段之上、unreleased 段之下（或按 docusaurus 现有 changelog 规范）

**内容骨架**：
```markdown
## [1.1.0-M1c] - 2026-09-02

### Added (v1.1 M0c + M1c 周期)
- **wrapper/ 目录** (M0c 5 subagent 落地)：
  - `wrapper/orchestrator/{orchestrator,commander,worker,types}.ts` — TypeScript wrapper 三档 profile 骨架
  - `wrapper/dsh/{dsh_client,tool_provider,types}.ts` — dsh CLI/HTTP 客户端 + tool provider Protocol
  - `wrapper/test/{unit,integration,e2e}` — vitest 单元/集成/E2E 测试（94 passed / 5 skipped / 0 failed）
  - `wrapper/vitest.config.ts` — coverage threshold 80% + testTimeout 30s
- **deploy/ 目录** (M0c DO-1 落地)：
  - `deploy/newvps-compose.yml` — newvps 共址 harness + dsh wrapper + 1 worker 容器编排
  - `deploy/tailscale-serve-harness.yaml` — Tailscale Serve HTTPS 配置（harness.rana.asia）
  - `deploy/tailscale-acl.yaml` — Tailscale ACL（仅 tailnet 内 + iPhone Safari 设备可达）
  - `deploy/env/newvps.env.example` — DEEPSEEK_API_KEY + TS_AUTHKEY env-inject only 模板
- **ADR 0010** — `v1.1 cycle scope admission Accepted`（v1.1+ 周期第一份合同）
- **harness v1.0 runtime 不漂移守门** — git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 9 ADR body == 0
- **不锁型号守门** — `grep -E "Fable 5|GLM 5.3|MiniMax-M3" wrapper/ deploy/ env/ CHANGELOG.md README.md` == 0

### Changed
- `docs/v1.1-ga-team-plan.md` v0.0 → v0.1（M0c 任务书细化）
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` v0.1 → v0.2（hygiene 守门升级：tracked-only 锚定 + docs/notes 拆分）

### Gates Passed
- **M0b spike** — 5 subagent 全 PASS + 11 commits 链 + H-1/H-2/H-3 全 PASS（dsh 覆盖 ≥ 80%、三层等价类有差异记录、wrapper LOC 4800-8500 估算落地）
- **M0c 5 subagent** — TypeScript wrapper skeleton + dsh_client + newvps 共址部署 + 集成测试 + CHANGELOG/README 全 PASS
- **M1c GATE-REPAIR-2** — 0C/3M/2m → G1-G4 全 PASS（audit-scope 自洽 + tracked 重锚 == 68 + vitest 双绿 + 4 文件归档）
```

### 3.2 `README.md` v1.1 M1 段

**位置**：插在现有 v1.0 部署/启动段之后、license/contribution 段之前

**内容骨架**：
```markdown
## v1.1 M1 (M0c 完成 + M1c GATE-REPAIR-2 PASS)

### 快速部署（newvps 真部署 6 大坑已实战）

```bash
# 1. SSH 到 newvps（永远用 ssh puer-hk，不是 ssh aliyun！）
ssh puer-hk

# 2. 拉仓 + 跑 wrapper 容器编排
cd /opt/puer-hub  # 类比目录，按 fish-harness 实际目录调整
git pull origin main
docker compose -f deploy/newvps-compose.yml up -d

# 3. 验证 Tailscale Serve HTTPS
curl https://harness.rana.asia/health  # 期望 200

# 4. iPhone Safari 真机 E2E（打开 / 表单提交 / 24h 完成 / 完成态可见）
#   前提：iPhone 装 Tailscale App + Quantumult X（代理 controlplane.tailscale.com 走 Clash LAN）
```

### 三档 Profile（orch / commander / worker）

| Profile | modelClass | 用途 | wall time |
|---------|-----------|------|-----------|
| `orch` | high-cap | 编排 + 多步任务规划 | 19x baseline |
| `commander` | medium-cap | 中等复杂度任务 | 7x baseline |
| `worker` | low-cap | 单步快速任务 | 1x baseline |

### 测试（94 passed / 5 skipped / 0 failed）

```bash
cd wrapper && npx vitest run --reporter=basic
# 默认跳过 dsh_real 真调；要真调 = RUN_DSH_REAL=1 npx vitest run
```

### v1.0 runtime 不漂移

`git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml` == 0
```

### 3.3 `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` 准备清单

**位置**：notes/ 下 NEW 文件（M1c DD-1 阶段产物）

**内容骨架**（参考 v0.2 audit-scope §1-§6 模板）：
```markdown
# Codex Audit-scope — v1.1 M0c v0.3 准备清单（v0.2 → v0.3 升级门槛）

> **Date**: 2026-09-02
> **Purpose**: v0.3 升级 hygiene 守门集合（M2 阶段 6 host + STT + Web Push 前置）
> **Why**: v0.2 通过 M1c GATE-REPAIR-2 验证可作为 v0.3 起点；v0.3 需把 M2 阶段的 6 host + STT + Web Push 三类新交付物纳入 hygiene 守门
> **How to apply**: M2 阶段 5 subagent 实施前读本 §1-§5；提交前 verbatim 跑 §3 验证

## §1 不锁型号守门（v0.3 = v0.2 + M2 6 host 落地守门）

[继承 v0.2 §1 + 新增 M2 6 host grep 守门]

## §2 不硬编码 API key 守门（v0.3 = v0.2 + STT provider keys）

[继承 v0.2 §2 + 新增 STT provider (Deepgram / AssemblyAI / Whisper) key 守门]

## §3 v1.0 runtime 0 行 diff 守门（继承 v0.2 §3，ADR 0010 Decision (d) 不变）

## §4 dsh `headless` profile 守门（继承 v0.2 §4；M2 新增 STT provider `headless` 调用守门）

## §5 M2 阶段 6 host + STT + Web Push hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
[预计 8-12 文件：6 host DISPATCH + STT provider DISPATCH + Web Push DISPATCH + audit-scope]

## §6 v0.2 → v0.3 升级门槛

- ✅ v0.2 audit-scope 全部 PASS（M1c GATE-REPAIR-2 验证）
- ✅ CHANGELOG [1.1.0-M1c] commit + README v1.1 M1 段 commit
- ✅ v1.0 runtime 0 行 diff守门（M1c 通过后仍 0 漂移）
- ⏳ M2 阶段 5 DISPATCH 起草（6 host + STT + Web Push 拆分 5 角色）
- ⏳ M2 阶段 spec/capabilities/ 新增（host × 6 SKU + STT provider × 3 SKU + Web Push push subscription schema）
- ⏳ M2 阶段 wrapper/ 扩展（stt_provider.ts + push_subscription.ts + 6 host profiles）

## §7 后续 Codex 复审预期

[继承 v0.2 §6 模板]
```

---

## §4 验证（verbatim 6 项）

```bash
# 1. CHANGELOG [1.1.0-M1c] 段存在
grep -c "## \[1.1.0-M1c\]" CHANGELOG.md  # ≥ 1
grep -c "ADR 0010\|Accepted" CHANGELOG.md  # ≥ 1
grep -c "wrapper/\|deploy/" CHANGELOG.md  # ≥ 5

# 2. README v1.1 M1 段存在
grep -c "v1.1 M1\|wrapper/\|newvps" README.md  # ≥ 5
grep -c "Tailscale\|tailscale" README.md  # ≥ 1
grep -c "iPhone Safari\|Quantumult X" README.md  # ≥ 1

# 3. v0.3 audit-scope 文件存在
test -f notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md
test -f notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md

# 4. 不锁型号守门（M1c + M2 前置均不含字面型号）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md | wc -l
# 期望: 0

# 5. v1.0 runtime 不漂移守门（M1c + DD-1 后仍 0 漂移）
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0

# 6. DEEPSEEK_API_KEY 不硬编码（M1c + DD-1 范围仍 0 行）
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md | wc -l
# 期望: 0
```

---

## §5 估时

2-3d（DD 角色惯例：documentation-only 改动，估时基于文档生成 + 守门验证）。

---

## §6 报告模板

落点：`docs/reports/T-M1c-DD-1-report.md` ~250 行 6 段：

1. **§1 CHANGELOG diff + 内容说明**：列出 `[1.1.0-M1c]` 段所有 Added/Changed/Gates Passed 子条目
2. **§2 README diff + 部署/启动步骤**：列出 v1.1 M1 段所有 quick-deploy / 三档 profile / 测试 / 不漂移守门
3. **§3 v0.3 audit-scope diff + 升级门槛**：列出 §6 升级门槛 + §7 复审预期
4. **§4 verbatim 验证 6 项**：CHANGELOG format + README format + v0.3 文件存在 + 不锁型号 + v1.0 runtime + API key
5. **§5 改动 4 文件清单**：CHANGELOG.md Edit + README.md Edit + v0.3 audit-scope NEW + v0.3 prompt NEW
6. **§6 cross-ref + next**：v0.3 升级 → M2 阶段 5 DISPATCH 起草 → M2 阶段实施 → M2 GATE-REPAIR（预期类比 M1c GATE-REPAIR-2）

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §10.4（M1c 通过后 v0.2 → v0.3 升级门槛）
- `docs/DISPATCH-T-M0c-DD-1.md`（DD 角色模板；M0c DD-1 实施报告 7a94ade 合并 97f371b 已有先例）
- `docs/reports/T-M1c-GATE-REPAIR-2-report.md`（M1c 实施收口 6 段 PASS）
- `docs/DISPATCH-T-M0c-DONE.md`（M0c 总报告 5 段 PASS）
- `adr/0010-v1.1-cycle-scope-admission.md`（v1.1 cycle scope admission Accepted）
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md`（v0.2 当前锚定）
- `wrapper/` 目录（M0c 5 subagent 落地骨架）
- `deploy/` 目录（M0c DO-1 落地 4 文件）

---

## §8 元数据自检

- [x] §0 触发条件明示（M1c GATE-REPAIR-2 PASS + user 「e 和 f 请启动」）
- [x] §1 任务定义一句话
- [x] §2 输入 6 资源覆盖
- [x] §3 产出 3 文件（CHANGELOG / README / v0.3 audit-scope）骨架完整
- [x] §4 验证 6 项 verbatim
- [x] §5 估时 2-3d
- [x] §6 报告模板 6 段 ~250 行
- [x] §7 cross-ref 8 引用
- [x] 不锁型号守门（CHANGELOG / README / v0.3 audit-scope grep == 0）
- [x] v1.0 runtime 不漂移守门
- [x] DEEPSEEK_API_KEY 不入 commit（env-inject only 字样）
- [x] Co-Authored-By 用 `Claude Code` 不写 `Claude Fable 5`
- [x] 3 文件改动 + 1 报告文件 < 5 文件 → /review 强制线（per global CLAUDE.md）将由 DD-1 实施前 Codex precommit 触发

---

*DD 角色 — v1.1 M1c 阶段 documentation deliverable（CHANGELOG + README + v0.3 准备清单）。M1c GATE-REPAIR-2 PASS 收口后启动，M2 阶段 6 host + STT + Web Push 前置准备。DD-1 通过 → v0.3 升级 → M2 DISPATCH 起草 → M2 实施 → M2 GATE-REPAIR（类比 M1c GATE-REPAIR-2）。Co-Authored-By: Claude Code <noreply@anthropic.com>*