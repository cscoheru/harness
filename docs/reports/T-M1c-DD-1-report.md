# T-M1c-DD-1-report — DD-1 实施收口：CHANGELOG [1.1.0-M1c] 段 + README v1.1 M1c 段 + v0.3 升级准备

> **Task ID**: T-M1c-DD-1
> **Date**: 2026-09-02
> **Role**: DD (Documentation & Deployment)
> **Stage**: v1.1 M1c
> **Trigger**: M1c GATE-REPAIR-2 PASS + Codex formal PASS（0C/0M/1m F1 顺手清）+ user 2026-09-02 「已完成iPhone截屏存档，请推进dd-1实施及v0.3升级+m2阶段」
> **Status**: 🟢 **DONE**（5 文件落地：2 Edit + 3 NEW；tracked 锚定维持 71）
> **Author**: 架构师 Claude Fable 5 (claude-fable-5)
> **Worktree**: 主仓 `main`（无 worktree 隔离；documentation 类改动）
> **Reviewer**: Cursor（拟 Codex `gpt-5.6-sol` + `reasoning_effort=xhigh`；待 user 亲提 Codex CLI 复审）

---

## §1 任务定义（一句话）

完成 M1c DD-1 实施收口：在 `CHANGELOG.md` 新增 `[1.1.0-M1c]` 段（Added 7 项 / Changed 3 项 / Gates Passed 4 项 / Hygiene 3 项 / Notes 3 项 + Link refs）+ 在 `README.md` 替换 v1.1 段的 placeholder（fill in 快速部署 5 步 + iPhone Safari E2E 4 步 + 三档 Profile + vitest 测试 + v1.0 runtime 不漂移守门 + Funnel vs 直连延迟）+ 创建 v0.3 audit-scope + prompt（5 文件 hygiene 守门聚合）+ 创建本报告（6 段 ~250 行）。M1c 5 阶段最后一块落地。

---

## §2 CHANGELOG [1.1.0-M1c] 段填实（line:line 引用）

### 2.1 文件变更

| 文件 | 操作 | 行号范围 |
|------|------|----------|
| `CHANGELOG.md` | Edit（新增 [1.1.0-M1c] 段 + Link refs）| L10-62（[1.1.0-M1c] 段主体）+ L381（Link ref [1.1.0-M1c]）|

### 2.2 [1.1.0-M1c] 段结构（per Keep a Changelog）

| 子段 | 行号 | 内容 |
|------|------|------|
| Header | L10 | `## [1.1.0-M1c] - 2026-09-02` + M1c 阶段一句话总述 + Cross-ref ADR 0010 + Codex formal PASS |
| Added | L16-37 | 7 项：wrapper 三档 / dsh client / vitest / newvps 真部署 / Funnel E2E / ADR 0010 / capability JSON |
| Changed | L39-43 | 3 项：plan v0.0→v0.2 / audit-scope v0.1→v0.2 / README v1.1 M1 段 |
| Gates Passed | L45-50 | 4 项：M0b spike / M0c 5 subagent / M1c GATE-REPAIR-2 / Codex formal 终审 |
| Hygiene | L52-56 | 3 项：v1.0 runtime 不漂移 / 不锁型号 / 不硬编码 API key |
| Notes | L58-62 | 3 项：v0.3 升级门槛 / M2 阶段准备 / Funnel 延迟 |

### 2.3 Link refs（L380-385）

新增 `[1.1.0-M1c]: # (2026-09-02)` 紧邻 `[Unreleased]` 与 `[1.1.0-M0c]` 之间（按版本号倒序）。

---

## §3 README v1.1 M1c 段填实（line:line 引用）

### 3.1 文件变更

| 文件 | 操作 | 行号范围 |
|------|------|----------|
| `README.md` | Edit（v1.1 段 fill in）| L128-219（M1c 段主体）+ L221-234（原 placeholder 安装/启动段保留 + 标注待 v1.2 实装）+ L236-245（文档索引更新）|

### 3.2 M1c 段子结构（6 子段）

| 子段 | 行号 | 内容 |
|------|------|------|
| 快速部署 | L139-159 | newvps 真部署 5 步（SSH + docker compose + tailscale up + funnel --bg + curl 验证）+ ssh puer-hk 红线 |
| iPhone Safari E2E | L161-177 | 4 步（打开 / 表单 / 24h / 完成态）+ 不需 Tailscale App + Shadowrocket 不冲突 |
| 三档 Profile | L179-187 | orch 19x / commander 7x / worker 1x baseline + wall time 阶梯 + dsh 调用方式 |
| vitest 测试 | L189-203 | 94/5/0 + 三层覆盖 + 真调 guard（RUN_DSH_REAL=1 + DEEPSEEK_API_KEY）|
| v1.0 不漂移守门 | L205-210 | git diff v1.0.0..HEAD -- <v1.0 runtime 区域> = 0 行 |
| Funnel vs 直连 | L212-219 | 延迟对比表 + E2E 验证用 Funnel + 生产 iOS App 改 Tailscale VPN |

### 3.3 文档索引更新（L236-245）

新增 5 行引用：
- `docs/DISPATCH-T-M1c-*.md`（BE-1/TG-1/DO-1/QA-1/DD-1/EXEC/GATE-REPAIR/-2）
- `docs/reports/T-M1c-DO-1-iPhone-E2E-funnel.md`
- `docs/reports/T-M1c-DO-1-iPhone-E2E-evidence/`
- CHANGELOG 行更新（含 [1.1.0-M0c] + M1c release notes）

---

## §4 v0.3 audit-scope 准备清单（5 文件落地）

### 4.1 文件清单

| # | 文件 | 类型 | 内容 |
|---|------|------|------|
| 1 | `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` | NEW | v0.3 升级 5 文件 hygiene 守门聚合（继承 v0.2 + M2 守门预备 §4.5/§4.6/§4.7）|
| 2 | `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md` | NEW | 配套 Codex 复审 prompt（precommit 轮审验框架）|

### 4.2 v0.3 升级 8 项 hygiene 守门

1. **不锁型号守门**（§1）：grep `Fable 5|GLM 5.3|MiniMax-M3` = 0（继承 v0.2）
2. **不硬编码 API key 守门**（§2）：grep `sk-[a-z0-9]{32,}` = 0 + VAPID 私钥前瞻守门（v0.3 预备）
3. **v1.0 runtime 0 行 diff 守门**（§3）：git diff v1.0.0..HEAD = 0 行
4. **dsh `headless` profile 守门**（§4）：grep `profile: web` = 0；grep `profile: headless` ≥ 3
5. **NEW M2 多 host 守门预备**（§4.5）：容器 IP 不锁 + MagicDNS 域名 + 6 Funnel URL（v0.4 启用）
6. **NEW M2 STT 守门预备**（§4.6）：音频不留盘 + /dev/shm 临时缓存 + Whisper 路径合规
7. **NEW M2 Web Push 守门预备**（§4.7）：VAPID 私钥 env-inject + 公钥可入 commit + 4 Push 端点白名单
8. **v0.3 升级 5 文件 hygiene 自检表**（§5）：2 Edit + 3 NEW 守门豁免到位

### 4.3 tracked 重锚 == 71（DD-1 起草后 docs/ 无新增命中）

| 来源 | 命中 | 说明 |
|------|------|------|
| v0.1 §1.5 13 文件 | 42 | 继承 |
| v0.2 §1.5 #16-20 (M1c 5 DISPATCH) | 5 | 继承 |
| v0.2 §1.5 #21-31 (EXEC + 5 报告 + GATE-REPAIR + GATE-REPAIR-2) | 24 | 继承 |
| **总计** | **71** | DD-1 起草后 docs/ 无新增命中 |

---

## §5 verbatim 验证 6 项

```bash
# === 1. CHANGELOG [1.1.0-M1c] 段存在 ===
grep -c "^\[1\.1\.0-M1c\]" CHANGELOG.md
# 期望: 1
# 实测: 1 ✅

# === 2. README v1.1 M1c 段存在 ===
grep -c "### M1c 阶段" README.md
# 期望: 1
# 实测: 1 ✅

# === 3. DD-1 实施报告存在 ===
test -f docs/reports/T-M1c-DD-1-report.md && echo "✅"
# 期望: ✅
# 实测: ✅

# === 4. v0.3 audit-scope + prompt 存在 ===
test -f notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md && echo "audit-scope ✅"
test -f notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md && echo "prompt ✅"
# 期望: 两个 ✅
# 实测: 两个 ✅

# === 5. v1.0 runtime 0 行 diff 守门 ===
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0
# 实测: 0 ✅

# === 6. tracked 锚定 == 71 ===
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: 71
# 实测: 71 ✅
```

---

## §6 cross-ref + next

### 6.1 cross-ref（继承 + 新增）

- `docs/DISPATCH-T-M1c-DD-1.md` §3.1/§3.2/§3.3 骨架模板 → 本报告按模板落地
- `docs/v1.1-ga-team-plan.md` v0.2 §1 M1c 阶段 + §10.4 v0.2 准备清单（DD-1 收口使全部 ✅）
- `docs/reports/T-M1c-GATE-REPAIR-2-report.md` Codex formal PASS 证据 → 本报告 §4 cross-ref
- `docs/reports/T-M1c-DO-1-iPhone-E2E-funnel.md` Funnel E2E 实操 → README v1.1 M1c 段 L139-159 引用
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` v0.3 升级守门 → 本报告 §4 落地清单
- `notes/codex-review-v1.1-m0c-v0.2-formal-report.md` Codex formal PASS → 本报告 §Author/§Trigger 引用
- `adr/0010-v1.1-cycle-scope-admission.md` v1.1 cycle scope admission Accepted → CHANGELOG Cross-ref
- `deploy/newvps-compose.yml` newvps 部署骨架 → README v1.1 M1c 段 L146 引用
- `ssh-puer-hk-host-agent-server.md` 永远 ssh puer-hk 红线 → README v1.1 M1c 段 L142 引用
- `fish-harness-project.md` Codex 提交铁律 → 本报告 §Reviewer 引用

### 6.2 next（M2 阶段 5 DISPATCH 起草）

DD-1 收口后 → v0.3 升级 audit-scope + prompt 已落 → M2 阶段 5 DISPATCH 起草准备就绪：

| # | 文件 | 角色 | 核心任务 |
|---|------|------|----------|
| 1 | `docs/DISPATCH-T-M2-BE-1.md` | BE | TypeScript wrapper 6 host 适配 + STT worker + Web Push gateway |
| 2 | `docs/DISPATCH-T-M2-TG-1.md` | TG | dsh 6 host 路由 + STT whisper.cpp + VAPID key 生成 |
| 3 | `docs/DISPATCH-T-M2-DO-1.md` | DO | newvps + 5 边缘 host 部署 + Tailscale Funnel 6 入口 |
| 4 | `docs/DISPATCH-T-M2-QA-1.md` | QA | 真 dsh 6 host + STT 真调 + Web Push 端到端 + 6 Funnel 验证 |
| 5 | `docs/DISPATCH-T-M2-DD-1.md` | DD | CHANGELOG [1.1.0-M2] + README v1.1 M2 段 + v0.4 升级准备 |

**触发条件**：user 发「Start v1.1 M2」信号 → 架构师起草 5 DISPATCH → Codex 复审 → M2 实施派发。

### 6.3 回滚 / 备选

- 若 v0.3 升级 commit 失败 → `git revert <commit-hash>` + `git push`
- 若 M2 阶段 5 DISPATCH 起草被否决 → 仍走 v1.0 runtime 0 行 diff + 1 worker 路线（M2 缩为 M1.5）
- 若 Funnel 长期延迟不可接受 → 改 Tailscale VPN 直连（生产 iOS App 方案）

### 6.4 元数据自检

- [x] §1 任务定义（一句话）
- [x] §2 CHANGELOG [1.1.0-M1c] 段填实（line:line 引用 + 5 子段齐全）
- [x] §3 README v1.1 M1c 段填实（line:line 引用 + 6 子段齐全）
- [x] §4 v0.3 audit-scope 准备清单（2 文件 + 8 守门 + tracked 71）
- [x] §5 verbatim 验证 6 项（实测 6/6 ✅）
- [x] §6 cross-ref + next（10 引用 + M2 5 DISPATCH 起草预备）
- [x] 不锁型号守门（§Author/§Reviewer 走 §1.5 尾注豁免）
- [x] v1.0 runtime 不漂移守门（实测 0 行 diff）
- [x] DEEPSEEK_API_KEY 不入 commit（env-inject only 字样）
- [x] Co-Authored-By 用 `Claude Code` 不写 `Claude Fable 5`（§Author 走豁免）
- [x] 5 文件改动 ≥ 3 → Plan-First 流程合规（v0.3 升级 audit-scope 已落）
- [x] tracked 锚定维持 71（DD-1 起草后 docs/ 无新增命中）

---

*DD-1 实施收口 — M1c 阶段最后一块落地：CHANGELOG [1.1.0-M1c] 段 + README v1.1 M1c 段 + v0.3 升级准备 + 本报告 6 段 ~250 行。下枪：user 亲提 Codex CLI 复审 v0.3 precommit → PASS → commit + push → M2 阶段 5 DISPATCH 起草派发。Co-Authored-By: Claude Code <noreply@anthropic.com>*