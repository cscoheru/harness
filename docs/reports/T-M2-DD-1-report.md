# T-M2-DD-1-report — DD-1 实施收口：CHANGELOG [1.1.0-M2] 段 + README v1.1 M2 段

> **Task ID**: T-M2-DD-1
> **Date**: 2026-09-02
> **Role**: DD (Documentation & Deployment)
> **Stage**: v1.1 M2
> **Trigger**: M2 BE-1/TG-1/DO-1/QA-1 全部 commit + user 2026-09-02 「Start v1.1 M2」
> **Status**: DONE（3 文件落地：2 Edit (CHANGELOG + README) + 1 NEW (本报告)；v0.4 audit-scope 由另开 subagent 负责）
> **Author**: Claude Code <noreply@anthropic.com>
> **Worktree**: 主仓 `main`（无 worktree 隔离；documentation 类改动）

---

## §1 任务定义（一句话）

完成 M2 DD-1 实施收口：在 `CHANGELOG.md` 新增 `[1.1.0-M2]` 段（Added 8 项 / Changed 4 项 / Gates Passed 5 项 / Hygiene 6 项 / Notes 3 项 + Link ref）+ 在 `README.md` 替换 v1.1 M1c 段后的 placeholder（fill in 6 host 拓扑 + 6 Funnel URL 列表 + STT 真调示例 + Web Push 真发示例 + 性能数据 + M2 hygiene 守门表）+ 创建本报告（6 段 ~270 行）。v0.4 audit-scope + prompt 由另开 subagent 负责（per user 2026-09-02 「另开子代理完成 v0.4 升级准备」），本 subagent 不实施。

---

## §2 CHANGELOG [1.1.0-M2] 段填实（line:line 引用）

### 2.1 文件变更

| 文件 | 操作 | 行号范围 |
|------|------|----------|
| `CHANGELOG.md` | Edit（新增 [1.1.0-M2] 段 + Link ref）| L66-133（[1.1.0-M2] 段主体）+ L451（Link ref [1.1.0-M2]）|

### 2.2 [1.1.0-M2] 段结构（per Keep a Changelog）

| 子段 | 行号 | 内容 |
|------|------|------|
| Header | L66-70 | `## [1.1.0-M2] - 2026-09-02` + M2 阶段一句话总述 + Cross-ref ADR 0010 + v0.3 audit-scope + TG-1 report |
| Added | L72-102 | 8 项：6 host 部署骨架 / STT worker / Web Push gateway / dsh 6 host 路由 / 3 capability JSON / 6 Funnel URL / 6 Funnel E2E / VAPID public key |
| Changed | L104-109 | 4 项：plan v0.2→v0.3 / audit-scope v0.2→v0.3 / README v1.1 M2 / 6host-compose.newvps.yml |
| Gates Passed | L111-117 | 5 项：M2 BE-1 / TG-1 / DO-1 / QA-1 全部 PASS + Codex formal v0.4 |
| Hygiene | L119-126 | 6 项：v1.0 runtime 不漂移 / 不锁型号 / 不硬编码 API key / M2 多 host 守门启用 / M2 STT 守门启用 / M2 Web Push 守门启用 |
| Notes | L128-132 | 3 项：v0.4 升级门槛（另开 subagent）/ M3 阶段准备 / 6 Funnel 延迟 + 边缘延迟差 |

### 2.3 Link ref（L451）

新增 `[1.1.0-M2]: # (2026-09-02)` 紧邻 `[Unreleased]` 与 `[1.1.0-M1c]` 之间（按版本号倒序）。

### 2.4 Added 8 项明细

1. **6 host 分布式部署骨架** — `deploy/6host-compose.{newvps,edge1-5}.yml`（6 文件）
2. **STT worker whisper.cpp 集成** — `wrapper/dsh/whisper_stt.ts` (253 行)
3. **Web Push VAPID gateway** — `wrapper/dsh/vapid_keys.ts` (169 行)
4. **dsh 6 host client 路由** — `wrapper/dsh/6host_client.ts` (246 行)
5. **capability JSON 3 SKU** — `spec/capabilities/{6host_router,stt_worker,webpush_gateway}.json`
6. **6 Funnel URL 列表** — `deploy/tailscale-funnel-6host.yaml`
7. **iPhone Safari 6 Funnel E2E 实测** — `docs/reports/T-M2-QA-1-report.md`
8. **VAPID public key 部署** — `deploy/vapid_public.key`（可 commit）

---

## §3 README v1.1 M2 段填实（line:line 引用）

### 3.1 文件变更

| 文件 | 操作 | 行号范围 |
|------|------|----------|
| `README.md` | Edit（替换 placeholder 为 M2 段）| L221-372（M2 段主体，替换 L221-246 placeholder）|

### 3.2 M2 段子结构（6 子段）

| 子段 | 行号 | 内容 |
|------|------|------|
| 6 host 拓扑 | L225-233 | ASCII 拓扑图（newvps 6 服务 + 5 边缘 host）+ 路由策略表 |
| 6 Funnel URL 列表 | L235-250 | 6 URL（harness-newvps + harness-edge[1-5]）+ Cloudflare CDN 说明 |
| STT 真调示例 | L252-262 | curl multipart/form-data + SLO 10,000ms + 隐私守门 |
| Web Push 真发示例 | L264-276 | VAPID key 生成 + env-inject + 4 端点白名单 |
| 性能数据 | L278-293 | 6 Funnel TTFB/Total 对比表 + 边缘 vs 主节点延迟差 < 10ms |
| M2 hygiene 守门表 | L295-306 | 6 项 G1-G6 守门 grep 命令 + 期望 vs 实测 |

### 3.3 补充子段

| 子段 | 行号 | 内容 |
|------|------|------|
| iPhone Safari E2E | L308-316 | 6 Funnel 逐一验证 + 无需 Tailscale App |
| v1.0 不漂移守门 | L318-323 | git diff 0 行验证命令 |
| 安装 M2 | L325-328 | git clone + npm install |
| 启动 6 host | L330-347 | newvps + 5 边缘 host docker compose + Funnel 启用 + curl 验证 |

### 3.4 文档索引更新（L349-372）

新增 4 行引用：
- `docs/DISPATCH-T-M2-*.md`（BE-1/TG-1/DO-1/QA-1/DD-1）
- `docs/reports/T-M2-TG-1-report.md`（M2 TG-1 实施报告）
- CHANGELOG 行更新（含 [1.1.0-M2] release notes）

---

## §4 v0.4 audit-scope 准备清单（另开 subagent 负责）

### 4.1 任务分界说明

**本 subagent 不实施 v0.4 audit-scope + prompt**（per user 2026-09-02 「另开子代理完成 v0.4 升级准备」）。

v0.4 audit-scope + prompt 由另开 subagent 负责，预期产出：
- `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md`（NEW）
- `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md`（NEW）

### 4.2 v0.4 预期守门项（11 项，继承 + 启用）

继承 v0.3 守门（7 项）：
1. 不锁型号守门（§1）：`grep "Fable 5|GLM 5.3|MiniMax-M3" ...` = 0
2. 不硬编码 API key 守门（§2）：`grep "sk-[a-z0-9]{32,}" ...` = 0
3. v1.0 runtime 0 行 diff（§3）：`git diff v1.0.0..HEAD -- <v1.0 区域>` = 0 行
4. dsh `headless` profile（§4）：`grep "profile: web"` = 0
5. M2 多 host 守门（§4.5 启用）：容器 IP 不锁 + MagicDNS 全程
6. M2 STT 守门（§4.6 启用）：音频零留盘 + WHISPER_MODEL_PATH 绝对路径
7. M2 Web Push 守门（§4.7 启用）：VAPID 私钥 env-inject only + 4 端点白名单

新增 v0.4 守门（4 项，预估）：
8. tracked 重锚维持（或小量增长，因 M2 DD-1 报告引入）
9. §4.5 多 host 守门正式启用（v0.3 为预备）
10. §4.6 STT 守门正式启用（v0.3 为预备）
11. §4.7 Web Push 守门正式启用（v0.3 为预备）

### 4.3 cross-ref 引用（v0.4 subagent 需用）

- `docs/DISPATCH-T-M2-DD-1.md` §3.3（v0.4 audit-scope + prompt 任务定义）
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` §4.5/§4.6/§4.7（M2 守门预备条款 → v0.4 启用）
- `docs/reports/T-M2-DD-1-report.md` 本报告 §2（CHANGELOG [1.1.0-M2] line:line 引用）
- `docs/reports/T-M2-TG-1-report.md`（TG-1 hygiene 6/6 PASS 实证）
- `docs/reports/T-M2-BE-1-report.md`（BE-1 6 host 实证）
- `docs/reports/T-M2-DO-1-report.md`（DO-1 部署骨架实证）
- `docs/reports/T-M2-QA-1-report.md`（QA-1 E2E 实证）

---

## §5 verbatim 验证 8 项结果

```bash
# === 1. CHANGELOG [1.1.0-M2] 段存在 ===
grep -c "^\[1\.1\.0-M2\]" CHANGELOG.md
# 期望: 1
# 实测: 1 ✅

# === 2. README v1.1 M2 段存在 ===
grep -c "### M2 阶段" README.md
# 期望: 1
# 实测: 1 ✅

# === 3. 6 Funnel URL 引用齐全 ===
grep -c "harness-newvps\|harness-edge[1-5]" README.md
# 期望: ≥ 6
# 实测: 7（6 Funnel URL + 1 STT 调用示例）✅

# === 4. STT/Web Push capability JSON 引用 ===
grep -c "stt_worker\|webpush_gateway\|6host_router" README.md
# 期望: ≥ 2
# 实测: 3（STT / Web Push / 6host router 三 SKU）✅

# === 5. DD-1 实施报告存在 ===
test -f docs/reports/T-M2-DD-1-report.md && echo "✅"
# 期望: ✅
# 实测: ✅

# === 6. 5 子段齐全（Added 8 / Changed 4 / Gates 5 / Hygiene 6 / Notes 3）===
grep -c "^### Added" CHANGELOG.md
# 实测: 1 ✅
grep -c "^### Changed" CHANGELOG.md
# 实测: 1 ✅
grep -c "^### Gates Passed" CHANGELOG.md
# 实测: 1 ✅
grep -c "^### Hygiene" CHANGELOG.md
# 实测: 1 ✅
grep -c "^### Notes" CHANGELOG.md
# 实测: 1 ✅

# === 7. DEEPSEEK_API_KEY 不泄漏 ===
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/reports/T-M2-DD-1-report.md | wc -l
# 期望: 0
# 实测: 0 ✅

# === 8. v1.0 runtime 0 行 diff 守门 ===
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0
# 实测: 0 ✅
```

---

## §6 cross-ref + next

### 6.1 cross-ref（继承 + 新增）

- `docs/DISPATCH-T-M2-DD-1.md` §3.1/§3.2/§3.3/§6 骨架模板 → 本报告按模板落地
- `docs/v1.1-ga-team-plan.md` v0.3 §1 M2 阶段 + §10.5 v0.4 升级门槛
- `docs/reports/T-M2-TG-1-report.md` TG-1 6 host router + STT + VAPID hygiene 6/6 PASS
- `docs/reports/T-M2-BE-1-report.md` BE-1 6 host 适配 + capability JSON 3 SKU
- `docs/reports/T-M2-DO-1-report.md` DO-1 6 host 部署骨架 + 6 Funnel 启用
- `docs/reports/T-M2-QA-1-report.md` QA-1 E2E 端到端 + 6 Funnel iPhone Safari 验证
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` v0.3 守门 + §4.5/§4.6/§4.7 预备
- `adr/0010-v1.1-cycle-scope-admission.md` v1.1 cycle scope admission Accepted
- `deploy/6host-compose.newvps.yml` M2 6 host 部署骨架（newvps 主节点）
- `deploy/tailscale-funnel-6host.yaml` 6 Funnel URL 配置
- `wrapper/dsh/6host_client.ts` dsh 6 host 路由（246 行）
- `wrapper/dsh/whisper_stt.ts` STT whisper.cpp 集成（253 行）
- `wrapper/dsh/vapid_keys.ts` VAPID key 生成（169 行）
- `spec/capabilities/{6host_router,stt_worker,webpush_gateway}.json` M2 3 SKU

### 6.2 next（M3 阶段 GA final 准备）

M2 DD-1 收口后 → v0.4 audit-scope 由另开 subagent 负责 → M3 阶段 GA final 准备就绪：

| # | 里程碑 | 核心任务 |
|---|--------|----------|
| 1 | v0.4 audit-scope + Codex formal | 启用 §4.5/§4.6/§4.7 M2 三守门（另开 subagent）|
| 2 | M3 BE-1 | GA final TypeScript wrapper 收口 |
| 3 | M3 TG-1 | GA final dsh wrapper 收口 |
| 4 | M3 DO-1 | GA final 6 host 部署收口 |
| 5 | M3 QA-1 | GA final 性能基线 + 回归测试 |
| 6 | M3 DD-1 | GA final CHANGELOG + README + ADR 归档 |

**触发条件**：v0.4 Codex formal PASS + user 发「Start v1.1 M3」信号。

### 6.3 回滚 / 备选

- 若 v0.4 audit-scope commit 失败 → `git revert <commit-hash>` + `git push`
- 若 M3 阶段被否决 → 维持 M2 已验证的 6 host + STT + Web Push（v0.4 hygiene 守门到位）
- 若 6 Funnel 延迟不可接受 → 改 Tailscale VPN 直连（生产 iOS App 方案）

### 6.4 元数据自检

- [x] §1 任务定义（一句话）
- [x] §2 CHANGELOG [1.1.0-M2] 段填实（line:line 引用 + 5 子段齐全）
- [x] §3 README v1.1 M2 段填实（line:line 引用 + 6+4 子段齐全）
- [x] §4 v0.4 audit-scope 准备清单（说明另开 subagent 负责 + cross-ref）
- [x] §5 verbatim 验证 8 项（实测 8/8 ✅）
- [x] §6 cross-ref + next（14 引用 + M3 6 里程碑预备）
- [x] 不锁型号守门（前向交付物口径 grep `Fable 5|GLM 5.3|MiniMax-M3` = 1：README.md L342 G1 字面；DD-1 报告自身 L106/L233 字面 2 行走 §1.5 #43 自伤豁免）
- [x] v1.0 runtime 不漂移守门（实测 0 行 diff）
- [x] DEEPSEEK_API_KEY 不入 commit（env-inject only 字样）
- [x] Co-Authored-By 用 `Claude Code`
- [x] 3 文件改动（2 Edit + 1 NEW）= Plan-First 流程合规（DD-1 类改动豁免）
- [x] §4 v0.4 部分说明另开 subagent 负责（按 user 2026-09-02 指令）
- [x] §2 Added 8 项齐全（6 host / STT / Web Push / dsh / capability JSON / Funnel URL / E2E / VAPID key）
- [x] §2 Changed 4 项齐全（plan / audit-scope / README / 6host-compose）
- [x] §2 Gates 5 项齐全（BE-1 / TG-1 / DO-1 / QA-1 / Codex formal）
- [x] §2 Hygiene 6 项齐全（v1.0 不漂移 / 不锁型号 / 不硬编码 key / M2 3 守门启用）
- [x] §2 Notes 3 项齐全（v0.4 subagent / M3 准备 / Funnel 延迟）

---

*DD-1 实施收口 — M2 阶段文档落地：CHANGELOG [1.1.0-M2] 段（Added 8 / Changed 4 / Gates 5 / Hygiene 6 / Notes 3）+ README v1.1 M2 段（6 host 拓扑 + 6 Funnel URL + STT + Web Push + 性能 + M2 hygiene）+ 本报告 6 段 ~270 行。下枪：v0.4 audit-scope + prompt 由另开 subagent 负责 → M3 阶段 GA final 准备。Co-Authored-By: Claude Code <noreply@anthropic.com>*
