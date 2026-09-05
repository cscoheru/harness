# Codex Review v1.2.0b v0.1 — Formal Report

> **Date**: 2026-09-05
> **Reviewer**: Codex (`gpt-5.6-sol`, reasoning_effort=xhigh) via Claude 审验代理
> **Scope**: `289e7eb..8bef884` — v1.2.0b worker 真实现 11 commits（10 实施 + 1 同回合修复）
> **Prompt**: [codex-audit-scope-v1.2.0b-v0.1-prompt.md](./codex-audit-scope-v1.2.0b-v0.1-prompt.md)
> **终态**: **PASS — 0C/0M/0m**（初审 0C/2M/5m → same-round 全闭）

---

## §0 终态裁定

| 轮次 | C | M | m | 裁定 |
|---|---|---|---|---|
| 初审 | 0 | 2 | 5 | CHANGES REQUIRED |
| 同回合闭环后 | **0** | **0** | **0** | **PASS** |

复审预期达成：§4.11 worker 真实现守门 14 项全绿 + §4.7.7 heartbeat 真接全绿 + §4.10.5/§4.10.6 替换守门全绿 + §3.7 Dockerfile 例外合规 + §2.7 path 默认值守门全绿 + 三源锚定闭合（116/129/13）+ 双 gate 绿（tsc 0 + vitest 191p/0f）。

---

## §1 Findings（初审 0C/2M/5m → 同回合闭环）

### M1 — worker_pool 列单位契约崩坏（24837d1 半吊子修复；3 vitest 红）

**证据**：`vitest run` → SqliteWorkerPool 套件 3 失败：
- `register() > persists host...` → `expected '+058647-09-29T03:12:58.000Z' to match /^\d{4}-\d{2}-\d{2}T/`
- `dispatch() > picks least-recently-heartbeated worker` → 选错 worker_id
- `reap_stale() > does not reap workers within threshold` → expected 1 to be 0

**根因**：`24837d1`（ms 精度修复）commit message 声称「ISO conversion (* 1000 removed)」，实际只改一半 —— 4 点崩坏：
1. `register()` 把 **registered_at 连带 ms 化**（写 ms / 读 ×1000 → 年份溢出 ~58k）
2. `drain()` drained_at 同型连带
3. `reap_stale()` cutoff 用秒阈值比 ms 列
4. `rowToWorkerInfo()` last_heartbeat_at 读侧 ×1000 残留

**列契约**（schema 注释 + 代码现对齐）：`last_heartbeat_at` = ms（亚秒 dispatch 平局决胜负）；`registered_at`/`drained_at` = 秒。

**闭环**：工作区发现 10:54 热修复（用户侧未提交改动），验证 tsc 0 + vitest 全绿后收编为 commit **`8bef884`**（fix(v1.2.0b): worker_pool column-unit contract repair）。修复后 **191 passed | 0 failed | 107 gated-skip（298 total, 33.9s）**。

**教训（记档）**：单位迁移修复必须全链核查写点×读点×比较点三方；「commit message 声明的修复面 ≠ 实际改动面」以 diff 为准。

### M2 — disk 口径引用式走样（127 失实 + 自伤占位未落；v0.5「首用即裂」同型复发）

**证据**：audit-scope 4 处写「引用 v1.2.0a §1.5 主表 disk 行 = 127」，实测 disk = **129**（116 tracked + 13 本周期自伤）；自伤期望行残留「起草预估 ≥ 11，按实测校准」占位。

**根因**：v1.2.0b disk 命令自伤源已切换为本周期文件（自伤 13 ≠ v1.2.0a 的 11），起草时未重跑命令、直接抄引旧周期数字 —— **引用式 ≠ 免实测换算**。

**闭环**：audit-scope §1.5 期望行 + L74 实测行 + §4 引用段 + prompt §2.1 期望行，5 处校准落定 **129 = 116 + 13** + GATE-CALIB 警示注记；自伤占位落定 13。

### m3 — §2.4/L170 cmd-dsh 守门尾部多套 `| wc -l`（恒 1 假门）

`awk END{print s} | wc -l` 把 awk 的单行数字输出再数行 → 恒 1 < 期望 ≥2 恒红。去套管后实测 2 ✓（两文件同步修）。

### m4 — BRE `\|` 反斜杠抄写丢失 7 处（恒 0 假门）

起草正文带 `grep -c "A\|B"` 正确；**§4 引用段 + prompt 抄写时丢 `\`** → BRE 下 `|` 为字面 → 恒 0 假门。涉及：describe|it( ×2（§4.10/§4.11）+ better-sqlite3|Database / WAL|busy_timeout|journal_mode / child_process|callDshHeadless ×2 文件。恢复后实测 39 / 89 / 16 / 6 / 5 全对齐期望。

### m5 — §2.7 8 endpoint pattern 单引号漏双引号注册 2 条

`f7eb145` 新增 `/api/v1/{worker,commander}/health` 走 `registerApiRoute("get", ...)` **双引号**，pattern `registerApiRoute\('` 漏 2。实值 **9 = 2 直书 + 7 封装** ≥ 8 期望幸存，但注记「server.ts = 7 API」失实。pattern 升级 `['\"]` 后 9 实测对齐。

### m6 — §4.10.6 stub-worker 守门未声明注释豁免

`commander.ts` L99 hygiene 注释「NO synthetic stub-worker-... IDs」自身提及字面 → 守门 == 0 期望撞注释 1 处。生产路径 0 处（NoActiveWorkerError 结构化抛出 ✓）。补 v0.6 DER 同型注释豁免注记。

### m7 — §2.4 headless 注记过时（19 → 50）

worker.ts REWRITE 后实测 50，注记残留 v1.2.0a 时代「≥ 19」。校准 50。

---

## §2 验证命令矩阵结果

### §2.1 三源锚定（§1 不锁型号）

| 口径 | 实测 | 期望 | 判定 |
|---|---|---|---|
| tracked（git ls-files 5 域） | **116** | 116（v1.2.0a 收口维持，0 增量） | ✅ |
| disk（+ 本周期自伤源） | **129** | 129 = 116 + 13（M2 校准后） | ✅ |
| 自伤（notes/ 本文件） | **13** | 13（占位落定） | ✅ |
| 前向交付物（CHANGELOG/README/worker.json） | 0 | 0 | ✅ |
| wrapper/orchestrator/ | 0 | 0 | ✅ |

### §2.2 API key 守门

sk- 0 / tskey- 0 / VAPID 私钥 0 / orchestrator 复合 0 / **§2.7 WORKER_POOL_DB `'/data/` 默认 == 1**（默认占位 + env override）全部 ✅。

### §2.3 v1.0 runtime + Dockerfile 例外

v1.0 runtime 0 行 diff ✅；Dockerfile diff 11 行 ≥ 1 ✅（§3.7 例外合规 —— **仅 `apk add python3 make g++` build tools，FROM 未动**：`git diff v1.0.0..HEAD -- Dockerfile | grep '^[+-]FROM'` 空；node:22→24 base 演进在 deploy/ compose 字段不在 Dockerfile）。

### §2.4 dsh headless + ExecutionDriver

web 0 ✅ / headless **50** ≥3 ✅ / ExecutionDriver dsh 5 ≥3 ✅ / HTTP fallback 1 ≥1 ✅ / heuristic 13 ≥4 ✅ / commander dsh **2** ≥2（m3 去套管后）✅。

### §2.5-§2.6 多 host + STT

IP 锁 0 ✅ / ts.net 53 ≥6 ✅ / Funnel 48 ≥6 ✅ / sleep infinity 0 ✅ / harness-edge 34 ≥5 ✅ / tag 11 ≥1 ✅ / STT 三项 0 ✅。

### §2.7 Web Push + 8 endpoint + §4.7.7 heartbeat 真接

hmacSha256 0 ✅ / signVapidJwt 31 ≥2 ✅ / **8 endpoint = 2 直书 + 7 registerApiRoute = 9 ≥ 8**（m5 pattern 升级后，含 v1.2.0b NEW 双引号注册 health ×2）✅ / **handleWorkerHeartbeat 真接 7 ≥ 2** ✅。

### §2.8-§2.9 PROJECT_ROOT + install-dsh

4 dsh 文件 import.meta.url 8 ≥4 ✅ / PROJECT_ROOT 残留 0 ✅ / **§4.8.5 wrapper/orchestrator/ 5 文件 4 ≥ 2** ✅ / DSH_VERSION 强校验 1 + set -euo pipefail 1 + npm pin 1 ✅。

### §4.10 commander 真实现守门维持（v1.2.0a）

TODO(M1) 0 ✅ / WorkflowPack 3 ≥3 ✅ / PlanPlan|PlanStep 11 ≥4 ✅ / AggregateError 7 ≥2 ✅ / orchestrator 真走 7 ≥3 ✅ / loadManifest 5 ≥1 ✅ / gated 集成 4 ≥2 ✅ / §4.10 单测 39 ≥25 ✅。

### §4.10.5/§4.10.6（v1.2.0b NEW）

TODO(v1.2.0b) in commander.ts **0** ✅ / stub-worker- 生产路径 **0**（m6 注释豁免声明后）✅。

### §4.11 worker 真实现守门 14 项（v1.2.0b NEW）

| # | 守门 | 实测 | 期望 | 判定 |
|---|---|---|---|---|
| 1 | TODO(M1) in worker.ts | 0 | == 0（16→0 全清） | ✅ |
| 2 | TODO(M1) wrapper/orchestrator/ | 0 | == 0 | ✅ |
| 3 | ExecutionDriver\|worker_pool refs | 19 | ≥ 6 | ✅ |
| 4 | better-sqlite3\|Database | 16 | ≥ 4 | ✅ |
| 5 | WAL\|busy_timeout\|journal_mode | 6 | ≥ 3 | ✅ |
| 6 | child_process\|callDshHeadless | 5 | ≥ 3 | ✅ |
| 7 | fetch.*api/v1 fallback | 1 | ≥ 1 | ✅ |
| 8 | server.ts heartbeat 真接 | 7 | ≥ 2 | ✅ |
| 9 | worker.health() version 1.2.0b | 8 | ≥ 1 | ✅ |
| 10 | spec worker.json deepseek-v4-flash | 2 | ≥ 1 | ✅ |
| 11 | 单测增量（3 NEW 套件） | **89** | ≥ 40 | ✅ |
| 12 | gated 集成（RUN_*_E2E） | 6 | ≥ 2 | ✅ |
| 13 | worker_pool.ts + execution_driver.ts | BOTH | exists | ✅ |
| 14 | better-sqlite3 dep + Dockerfile apk | 1 + 1 | ≥ 1 + ≥ 1 | ✅ |

净守门（3 NEW 文件 key/型号）0 ✅。

### §2.12 cc-ready + 双 gate

`T-V1.2.0B-WORKER-PASS` ✅；`tsc --noEmit`（本地 bin）**exit 0** ✅；`vitest run`（本地 bin）**191 passed | 0 failed | 107 skipped (298), 33.9s** ✅（v1.2.0a 基线 147p → +44：worker 三套件 89 + server_heartbeat 单测化）。

---

## §3 引用式纪律落地（6 处 PASS）

1. tracked — 实测 116 == v1.2.0a 收口维持 ✅
2. disk — M2 校准后 129 = 116 + 13（换算式落定）✅
3. 前向交付物 — 实测 0 ✅
4. wrapper/orchestrator/ — 实测 0 ✅
5. v1.2.0a §4.10 14 项 — 实测维持 ✅
6. v1.2.0b §4.11 14 项 — 实测（§2 表）✅

---

## §4 同回合闭环清单

| 项 | 落点 |
|---|---|
| M1 单位契约修复收编 | commit `8bef884`（+13-5 worker_pool.ts） |
| M2 disk 口径校准 129/13 | audit-scope 4 处 + prompt 1 处 |
| m3 套管假门去除 | 两文件 §2.4/L170 |
| m4 BRE `\|` 恢复 ×7 | 两文件引用段 |
| m5 8ep pattern `['\"]` + 注记 9 | prompt §2.7 |
| m6 注释豁免声明 | prompt §4.10.6 |
| m7 headless 注记 50 | prompt §2.4 |

闭环后复验：三源 116/129/13 闭合 + 假门残留检查空 + 受影响 gate 全对齐（2/9/39/89/16/6）+ 双 gate 绿。

---

## §5 环境注记（供下周期继承）

- **commit message 修复面声明 ≠ 实际 diff**：以 `git show <sha>` 为准（M1：24837d1 声称 ×1000 removed 实未全改）
- **单位迁移全链核查**：写点 × 读点 × 比较点三方对齐（ms/秒混列是 SQLite INTEGER 列高发病）
- **引用式 ≠ 免实测换算**：disk 自伤源随周期切换须重跑（M2；v0.5 同型第二次复发）
- **抄写层 `\|` 丢失**：正文 → 引用段/prompt 复制时反斜杠易丢（m4 七处）；引用段须 verbatim 块复制
- **管道套管道恒假门**：`awk END{print} | wc -l` 恒 1（m3；「grep -c | wc -l 数文件不数命中」姊妹坑）
- **双引号注册逃逸单引号 pattern**：`registerApiRoute\(['\"]`（m5）
- **热修复收编流程**：工作区外部热修复 → tsc+vitest 双验 → 收编 commit 引用原不完整 sha（M1 范式）

---

## §6 遗留（非本轮范围）

- v1.2.0a tag（31ca234）不含 M3 patch（289e7eb）— 用户决定是否移动（沿上轮遗留）
- v1.2.0b tag 未打 — 建议打在合同校准 commit 后（涵盖 M1 修复）
- U5 真机 4+1 路径 + U6 Funnel 200 检查 + 5 edge host provision（用户侧）
- v1.2.0c 候选：gated 集成真跑（RUN_WORKER_POOL_E2E 等 107 gated）+ per-host WAL 多进程并发实测

---

*Codex review v1.2.0b v0.1 formal — 0C/2M/5m → same-round 全闭 → PASS 0C/0M/0m；双 gate 绿（tsc 0 / vitest 191p-0f-33.9s）。*

Co-Authored-By: Claude Code <noreply@anthropic.com>
