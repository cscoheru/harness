# Codex Audit-scope — v1.2.0c cross-host routedDsh 真发到 MagicDNS + MacBook Worker 接入 + host-id fencing per ADR 0009

> **Date**: 2026-09-05
> **Purpose**: v0.1 升级 = v1.2.0c 周期第三 sub-cycle（cross-host 真发 + MacBook Worker 接入 + host-id fencing per ADR 0009 line 68）；v1.2.0c 路径 = `6host_router.routedDsh()` L277 `callDshHeadless()` → `fetch(${getHostUrl(targetHost, 4001)}/api/v1/tasks, POST)` 真发远程 host + `6host_router.ts:33` HostId union 加 `"macbook"` (per F20) + `deploy/{6host-compose.edge[1-5],tailscale-{acl,funnel,serve}-*,6host-compose.newvps}.yml` MagicDNS 命名裂痕修复 (per D5 + F11 `tail1b9878.ts.net` → `fish-harness.ts.net`) + NEW `deploy/macbook-compose.yml` (per F15, MacBook worker 接入) + NEW `deploy/runbook-macbook-worker.md` (per F15, provision runbook) + NEW `spec/capabilities/macbook.json` (per F14, `host_class: macbook-main` + `working_hours: true`) + NEW `wrapper/orchestrator/host_fencing.ts` (per F13 + ADR 0009 line 68, partial unique index `UNIQUE(task_id, host_id) WHERE status='active'`) + `spec/kernel-schema.sql` 加 `dispatches.host_id` + `CREATE UNIQUE INDEX idx_dispatch_task_host` (per F13) + `harness/runtime/worker_pool.py` `dispatch(task_id, host_id)` 加 host_id 参数 (per F13) + `wrapper/orchestrator/orchestrator.ts` 加 MacBook scoring +100 工作时段 (per D6 + F14) + `wrapper/orchestrator/worker.ts` `capability()` 按 host 路由到 worker.json | macbook.json (per F14) + `deploy/tailscale-acl-6host.yaml` 加 `tag:macbook` 段 (per F16) + 3 NEW integration tests gated (cross_host_dispatch + host_id_fencing + macbook_worker) + 4 cc-ready/CHANGELOG/README/hygiene 簿记
> **Why**: 继承 v1.2.0b §1-§9 + v1.2.0a §1-§9 + v0.7 §1-§9 全套守门（v1.2.0a PASS 0C/3M/4m 收口 289e7eb + v1.2.0b PASS 0C/0M/0m 同轮全闭 commit `b44c1da` 已 push）+ 启用 §4.12 NEW cross-host 真发守门 — `fetch().*fish-harness.ts.net.*api/v1/tasks` in 6host_router.ts ≥ 1 (per F12 routedDsh 真发) + `callDshHeadless` in 6host_router.ts == 0 (per F12 替换) + `MACBOOK_HOST|macbook` refs ≥ 4 (per F20 HostId union + 表 + findAvailableHost + scoring) + `host_id|hostId` in kernel worker_pool.py + spec/kernel-schema.sql ≥ 5 (per F13 partial unique index) + §4.13 NEW MacBook worker 守门 — `macbook-compose.yml` + `runbook-macbook-worker.md` + `macbook.json` NEW + `isWorkingHours|scoring.*\+100` ≥ 2 (per D6 + F14) + `tag:macbook` ≥ 3 (per F16 ACL) + `kjonemacbook-pro|macbook.fish-harness.ts.net` ≥ 4 (per F20) + `node:24-slim` ≥ 1 (per F19 alpine 避开) + §4.14 NEW host-id fencing 守门 — `host_id|hostId` in worker_pool.py ≥ 3 (per F13) + `CREATE UNIQUE INDEX.*task_id.*host_id` ≥ 1 (per F13 partial unique index) + `host_id` in host_fencing.ts ≥ 5 (per F13 + ADR 0009 line 68) + `host_fencing.ts` file exists + §3.8 NEW MagicDNS 命名裂痕修复声明 (per D5 + F11 `tail1b9878.ts.net` → `fish-harness.ts.net` 6 deploy 文件全切)
> **How to apply**: v1.2.0c 14 文件改动守门统一引用本 §1-§11；本文件保留字面 grep pattern 用作后续 Codex 复审 hygiene anchor

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类，继承 v0.7 §1 + v1.2.0a §1 + v1.2.0b §1）

```bash
# v1.2.0c 升级前向交付物（CHANGELOG + README + spec/capabilities/{worker,macbook}.json 校准）不锁型号：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md spec/capabilities/worker.json spec/capabilities/macbook.json | wc -l
# 期望: 0 行

# 历史文档豁免口径锚定（tracked 锚定 post-v1.2.0c = 引用式本节 + v1.2.0a §1.5 主表唯一权威源）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == audit-scope §1.5 主表合计（v1.2.0a 收口 289e7eb 实测 = 116 tracked；v1.2.0c 增量实测按 audit-scope §1.5 主表新增条目校准）

# 历史文档豁免口径锚定（disk 口径 == tracked + 本 audit-scope 自伤）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0c-v0.1.md | wc -l
# 期望: == audit-scope §1.5 主表 disk 行（**v1.2.0c 实测 = 128 = 116 tracked + 12 本周期自伤**；NEW §4.12/§4.13/§4.14 grep 不引入 Fable/GLM/MiniMax 字面 — 仅 §1 继承 + §9 cmd 矩阵共 12 self-injury）

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.2.0c-v0.1.md | wc -l
# 期望: == 自伤实测 12（v1.2.0c 起草实测 = 12 — §1 + §9 cmd 矩阵 grep pattern 字面行 verbatim 校准）

# wrapper/orchestrator/ 不锁型号守门（继承 v1.2.0a §1 + v1.2.0b §1 — v1.2.0c 新增 host_fencing.ts 同样守）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l
# 期望: 0 行
```

**含义**：v1.2.0c 周期模型决策遵守 NORTH-STAR A-4 等价类约束；v1.2.0c 前向交付物（CHANGELOG + README + spec/capabilities/{worker,macbook}.json 校准）均不含具体型号字面；cross-host 真发 + MacBook worker 接入 + host-id fencing 守门在 wrapper/orchestrator/ 内额外加锁（绝不含 Fable 5/GLM 5.3/MiniMax-M3 字面 — 即使在 6host_router.ts / host_fencing.ts / orchestrator.ts / worker.ts 新代码中也守）。

### §1.5 v1.2.0c 升级范围（14 文件改动；tracked 锚定 post-v1.2.0c = 引用式本节 + v1.2.0a §1.5 主表唯一权威源）

| # | 文件 | 操作 | docs/ 命中增量 | 自伤豁免 |
|---|------|------|----------------|----------|
| 1 | `wrapper/orchestrator/6host_router.ts` | **Edit** (~50 行：HostId union 加 `"macbook"` + MACBOOK_HOST 新常量 + ALL_HOSTS 加 MACBOOK_HOST + findAvailableHost 加 MacBook + route() 加 MacBook scoring +100 in isWorkingHours() + routedDsh() L277 替换 `callDshHeadless()` → `fetch(${getHostUrl(targetHost, 4001)}/api/v1/tasks, POST)` + getHostUrl() 默认 port 改 4001 per F11/F12/F14/F20)| 0 | wrapper/ 不入主合同 |
| 2 | `wrapper/orchestrator/orchestrator.ts` | **Edit** (~30 行：`dispatch()` 加 MacBook scoring `if (worker.hostId === "macbook" && isWorkingHours()) score += 100` per D6 + NEW `isWorkingHours()` helper 函数 周一-周五 09:00-22:00 本地时间 per F14)| 0 | wrapper/ 不入主合同 |
| 3 | `wrapper/orchestrator/host_fencing.ts` | **NEW** ~80 行（per plan §4.2 + F13 + ADR 0009 line 68: `recordDispatch(task_id, host_id)` INSERT to dispatches table + `checkFencing(task_id, host_id)` SELECT count active + `HostIdFencingError` 抛出 when conflict + 简化 schema per F13 wrapper-side 无 cross-DB FK)| 0 | wrapper/ 不入主合同 |
| 4 | `wrapper/orchestrator/worker.ts` | Edit (~20 行：`capability()` 探测 `host` 字段 → 路由到 `spec/capabilities/{worker.json \| macbook.json}` + MacBook spec 加 `host_class: "macbook-main"` + `working_hours: true` per F14)| 0 | wrapper/ 不入主合同 |
| 5 | `wrapper/test/unit/6host_router.test.ts` | Edit (~30 tests：新增 MacBook scoring test + `isWorkingHours()` 时间窗 test mock Date + `fetch()` 真发 test mock fetch capture URL per F12 + F14 + F20)| 0 | wrapper/ 不入主合同 |
| 6 | `wrapper/test/integration/cross_host_dispatch.test.ts` | **NEW** ~180 行（per F18 + plan §4.2: gated by `RUN_CROSS_HOST_E2E=1` + 验证 routedDsh() 真发远程 capture fetch mock + 验证 partial unique index 兜底 2 orch 同时 dispatch 同一 task + 验证 MagicDNS 命名一致性 无 `tail1b9878.ts.net` 残留 per F11)| 0 | wrapper/ 不入主合同 |
| 7 | `wrapper/test/integration/host_id_fencing.test.ts` | **NEW** ~100 行（per plan §4.2: gated by `RUN_HOST_FENCING_E2E=1` + INSERT host_id=A OK + INSERT host_id=B 同 task_id UNIQUE constraint failed partial index 兜底 + INSERT host_id=A 同 task_id 但 status='completed' OK partial index 不命中 per F13 + ADR 0009)| 0 | wrapper/ 不入主合同 |
| 8 | `wrapper/test/integration/macbook_worker.test.ts` | **NEW** ~120 行（per plan §4.2: gated by `RUN_MACBOOK_E2E=1` 需 MacBook 上跑 colima/Docker Desktop + MacBook worker heartbeat → newvps worker_pool 收到 + scoring +100 工作时段 周一 10:00 测试 score=base+100 + scoring 0 非工作时段 周日 10:00 score=base + graceful degradation 3 次心跳失败 worker_pool mark stale per PRD §3.1)| 0 | wrapper/ 不入主合同 |
| 9 | `deploy/6host-compose.edge[1-5].yml` | **Edit** (5 文件：HARNESS_API_URL 改 `*.fish-harness.ts.net` per D5 + F11 MagicDNS 命名裂痕修复)| 0 | deploy/ 不入主合同 |
| 10 | `deploy/6host-compose.newvps.yml` | **Edit** (peer references 改 `*.fish-harness.ts.net` per D5 + F11)| 0 | deploy/ 不入主合同 |
| 11 | `deploy/{tailscale-acl-6host,tailscale-funnel-6host,tailscale-serve-harness}.yaml` | **Edit** (3 文件：全 6 host 改名 `*.fish-harness.ts.net` per D5 + F11；ACL 文件加 `tag:macbook` 段 + `tagOwners.tag:macbook: [cscoheru]` per F16)| 0 | deploy/ 不入主合同 |
| 12 | `deploy/macbook-compose.yml` | **NEW** ~120 行（per F15: `image: node:24-slim` per F19 + `WORKER_HOST=kjonemacbook-pro` + `EDGE_REGION=local-mac` + `volumes: [..:/app:ro]` MacBook bind mount `/Users/kjonekong/projects/fish-harness` + `mem_limit: 2g` + `HARNESS_API_URL=http://newvps.fish-harness.ts.net:4000` per D5 + `command: ["node", "build/server.js"]` + `depends_on: kernel service_started` + `networks: harness_net` + `restart: unless-stopped`)| 0 | deploy/ 不入主合同 |
| 13 | `deploy/runbook-macbook-worker.md` | **NEW** ~150 行（per F15: MacBook provision Docker Desktop / colima 二选一 per F19 colima `--vm-type=qemu --arch=x86_64` + Tailscale 接入 `tailscale up --advertise-tags=tag:macbook --hostname=kjonemacbook-pro` + MagicDNS 验证 `tailscale status | grep kjonemacbook-pro` + scoring +100 工作时段 周一-周五 09:00-22:00 本地时间 + graceful degradation 心跳失败 3 次 reassign per PRD §3.1 + 监控 `docker stats` + MacBook-specific pmset 防止合盖睡眠)| 0 | deploy/ 不入主合同 |
| 14 | `spec/capabilities/macbook.json` | **NEW** (~30 行：per F14: `model_id: deepseek-v4-flash` + `host_class: "macbook-main"` + `working_hours: true` + `evidence_uri: spec/capabilities/macbook.json`)| 0 | spec/capabilities/ 入主合同（实测 = 0）|
| 15 | `spec/kernel-schema.sql` | **Edit** (~10 行 per F13: `dispatches` 表加 `host_id TEXT NOT NULL DEFAULT 'unknown'` + `CREATE UNIQUE INDEX idx_dispatch_task_host ON dispatches(task_id, host_id) WHERE status='active';`)| 0 | spec/ 不入主合同（kernel-schema 不在 docs/adr/spec/capabilities 范围）|
| 16 | `harness/runtime/worker_pool.py` | **Edit** (~30 行 per F13: `dispatch(task_id, host_id)` 加 host_id 参数 + INSERT 用 host_id + 抛 `HostIdFencingError` 当 host_id 已存在 active dispatch for task_id 走 partial unique index 兜底)| 0 | harness/ 不入主合同（v1.0 runtime 区域 §3 第一条 diff 范围排除）|
| 17 | `notes/codex-audit-scope-v1.2.0c-v0.1.md` | **NEW**（本文件）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 18 | `notes/codex-audit-scope-v1.2.0c-v0.1-prompt.md` | **NEW**（配套 Codex 复审 prompt）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 19 | `docs/poll/cc-ready.json` | Edit（task_id `T-V1.2.0B-WORKER-PASS` → `T-V1.2.0C-CROSSHOST-MACBOOK-PASS`；status 翻牌；files_modified 含 v1.2.0c 14 文件 + §3.8 MagicDNS 命名裂痕修复声明 + §4.12/§4.13/§4.14 NEW 守门）| 0 | docs/ 入主合同（实测 = 0）|
| 20 | `CHANGELOG.md` | Edit（[1.2.0c] minor 段 NEW：routedDsh 真发 + host_fencing NEW + MacBook compose + 5 NEW files + 3 NEW integration tests gated + D4/D5/D6 决策记档）| 0 | grep 字面 0 行 |
| 21 | `README.md` | Edit（v1.2.0c status 段补：6+1 host 真接 + MagicDNS canonical + MacBook working hours + cross-host fetch + host-id fencing）| 0 | grep 字面 0 行 |

**v1.2.0c 升级总改动：21 文件**（4 wrapper/orchestrator/ 代码 [6host_router + orchestrator + host_fencing + worker] + 4 wrapper/test/ [6host_router Edit + 3 integration NEW] + 7 deploy/ [5 edge compose + newvps compose + 3 tailscale files + 1 macbook compose + 1 runbook macbook = 实际 5+1+3+1+1=11, 待 v1.2.0c commit 2 实施时按 plan §12.3 #9-13 落地 5+1+3+1+1=11 deploy 文件 + 4 wrapper/test/ + 4 wrapper/orchestrator/ + 1 spec/capabilities/macbook.json + 1 spec/kernel-schema.sql + 1 harness/runtime/worker_pool.py + 2 notes/ + 3 docs/ = 21 文件）— 实际 = 21 文件。

**docs 主表**（继承 v0.7 §1.5 #1-#55 + v1.2.0a §1.5 主表合计；v1.2.0c 增量实测 = **引用 v1.2.0a §1.5 主表合计（v1.2.0a 收口 289e7eb 实测 = 116 tracked）**；v1.2.0c 不动 docs/adr/spec/capabilities 主表锚定区域，仅改 spec/capabilities/{worker,macbook}.json + spec/kernel-schema.sql + CHANGELOG + README + cc-ready 5-6 个 docs/spec 入口；演进链 116→116→(v1.2.0c 实测校准)，禁公式预测，以实测为准）。

**v1.2.0c 实测公式**（post-Commit 1-4 实测落地，引用式唯一权威源 + v1.2.0a §1.5 主表合计）：

```bash
# tracked 验收命令（git add 所有 v1.2.0c 文件后）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# v1.2.0c 实测: 引用 v1.2.0a §1.5 主表合计（v1.2.0a 收口 289e7eb 实测 = 116 tracked；v1.2.0c 不动 docs/adr/spec/capabilities 主表锚定区域）

# disk 验收命令
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0c-v0.1.md | wc -l
# v1.2.0c 实测: **128 disk = 116 tracked + 12 本周期自伤**（v1.2.0c 实测 verbatim 校准 — 仅 §1 继承 + §9 cmd 矩阵共 12 self-injury；NEW §4.12/§4.13/§4.14 grep 不引入 Fable/GLM/MiniMax 字面）
```

**v1.2.0c 主表新增条目**（v1.2.0c 增量实测；引用式不复制数字）：
- 🆕 v1.2.0c audit-scope 自伤实测行数（notes/ 自伤豁免不入 tracked + 仅本文件计入 disk）
- v1.2.0c 21 文件改动中 wrapper 8 文件 + 11 deploy/ 文件（5+1+3+1+1）+ 1 spec/capabilities/macbook.json + 1 spec/kernel-schema.sql + 1 harness/runtime/worker_pool.py + 2 notes/ + 3 docs/ = 21 文件
- spec/capabilities/{worker,macbook}.json 是 v1.2.0c 唯一 spec/capabilities 改动入口（worker model_id 校准 + macbook host_class/working_hours 新增）

**豁免口径不变**（per M0b plan §3 L89 C2 裁定 + v0.5 §1.5 末段 + v0.6 §1.5 末段 + v0.7 §1.5 末段 + v1.2.0a §1.5 末段 + v1.2.0b §1.5 末段）：**不清洗历史文档**（考古记录 + git 尾注 + DISPATCH §2/§4 验证命令字面均保留）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训，继承 v0.7 §2 + v1.2.0a §2 + v1.2.0b §2）

```bash
# v1.2.0c 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json spec/capabilities/macbook.json wrapper/orchestrator/ deploy/ | wc -l
# 期望: 0 行

# wrapper/orchestrator/ 不硬编码 API key 守门（继承 v1.2.0a §2.5 + v1.2.0b §2 — v1.2.0c 新增 host_fencing.ts 同样守）：
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/ | wc -l
# 期望: 0 行

# VAPID 私钥守门（继承 v0.7 §2 + §4.7 + v1.2.0a §2 + v1.2.0b §2）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/orchestrator/ workflow_packs/ CHANGELOG.md README.md | wc -l
# 期望: 0 行

# Tailscale auth key 守门（继承 v0.7 §2.6 + v1.2.0a §2 + v1.2.0b §2）：
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json spec/capabilities/macbook.json | wc -l
# 期望: 0 行

# better-sqlite3 path 守门（继承 v1.2.0b §2.7）：
grep -rE "WORKER_POOL_DB\s*=\s*['\"]/data/" wrapper/orchestrator/worker_pool.ts | wc -l
# 期望: 1 行（默认路径占位 + env override 优先）

# Tailscale MagicDNS hostname 不硬编码 auth key 守门（v1.2.0c NEW §2.8 — MacBook provision runbook + ACL）：
grep -rE "kjonemacbook-pro\s*=\s*['\"]?tskey-" deploy/ | wc -l
# 期望: 0 行（MagicDNS hostname 是 host 名非 key）
```

**含义**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 等敏感 key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；v1.2.0c §2.8 NEW `kjonemacbook-pro` 仅 MagicDNS hostname，不硬编码 Tailscale auth key。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)，继承 v0.7 §3 + v1.2.0a §3 + v1.2.0b §3）

```bash
# v1.2.0c 升级 v1.0 runtime 区域净 diff（commit v1.0.0 tag 后 0 漂移；§3.8/§3.9 例外文件 pathspec 排除 per v1.2.0b Dockerfile 模式 — m2 GATE-CALIB per v1.2.0c prompt-review：原 pathspec 含待 Edit 两文件，Commit 2 后必恒红）：
git diff v1.0.0..HEAD -- harness/ ':(exclude)harness/runtime/worker_pool.py' spec/kernel-schema.sql ':(exclude)spec/kernel-schema.sql' spikes/ 'adr/000[1-9]-*.md' docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行（主 pathspec 排除两例外文件）
git diff v1.0.0..HEAD -- harness/runtime/worker_pool.py | wc -l  # ≥ 1（§3.8 例外声明落地验证）
git diff v1.0.0..HEAD -- spec/kernel-schema.sql | wc -l  # ≥ 1（§3.9 例外声明落地验证）

# v1.2.0c §3.8 NEW `harness/runtime/worker_pool.py dispatch(task_id, host_id)` 例外声明（per F13 — 加 host_id 参数属 host-id fencing 必要扩展，非 v1.0 runtime kernel 改动；harness/ 在 §3 第一条 diff 范围但本改动属 host-id fencing 实现必需，v1.2.0c 是 host-id fencing 首次落地）：
git diff v1.0.0..HEAD -- harness/runtime/worker_pool.py | wc -l
# 期望: ≥ 1 行（v1.2.0c harness/runtime/worker_pool.py 加 host_id 参数 + INSERT host_id + HostIdFencingError）；v1.2.0c §3.8 NEW 例外声明：host_id fencing 改动不破 v1.0 runtime 0 行 diff 守门（per ADR 0009 line 68 「如果未来 multi-host，必须在 dispatch 层加 host-id fencing（不在 v1.0 scope）」 — v1.2.0c 是该声明的首次落地，host_id fencing 是 ADR 0009 v1.2.0c 升级契约）

# v1.2.0c §3.9 NEW `spec/kernel-schema.sql dispatches.host_id + CREATE UNIQUE INDEX` 例外声明（per F13 — 加 host_id 列 + partial unique index 属 host-id fencing schema 必要扩展）：
git diff v1.0.0..HEAD -- spec/kernel-schema.sql | wc -l
# 期望: ≥ 1 行（v1.2.0c spec/kernel-schema.sql 加 `dispatches.host_id TEXT NOT NULL DEFAULT 'unknown'` + `CREATE UNIQUE INDEX idx_dispatch_task_host`）；v1.2.0c §3.9 NEW 例外声明：schema 改动不破 v1.0 runtime 0 行 diff 守门（kernel-schema.sql 是 ADR 0009 host-id fencing schema 实现必需）

# v1.0 GA plan + 9 ADR body 不动（v1.0 runtime 9 ADR immutable per T-DD-6）：
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0 行

# ADR 0011 closure 合规（继承 v0.7 §3.3 + v1.2.0a §3 + v1.2.0b §3）：
grep -c "Status=" adr/0011-v1.1-cycle-closure.md
# 期望: ≥ 1（Status=Accepted）

# v0.7 audit-scope + v1.2.0a + v1.2.0b audit-scope 文件归档不再计入 disk（per GATE-CALIB "换源不累加机制"）：
git diff v1.0.0..HEAD -- Dockerfile | wc -l
# 期望: ≥ 1 行（v1.2.0b §3.7 NEW Dockerfile 例外声明维持 — `RUN apk add --no-cache python3 make g++` per F2；v1.2.0c 不动 Dockerfile）
```

**含义**：v1.2.0c 升级 21 文件改动中 wrapper 8 文件 + 11 deploy/ 文件 + 1 spec/capabilities/macbook.json + 1 spec/kernel-schema.sql + 1 harness/runtime/worker_pool.py + 2 notes/ + 3 docs/ = 21 文件；不触及 spec/kernel-schema.sql spike 之外的 v1.0 runtime（harness/runtime/worker_pool.py 例外 per §3.8）+ spec/kernel-schema.sql 例外 per §3.9 + 9 ADR body + ADR 0010 + docker-compose.yml + pyproject.toml + v1.0 GA plan；cross-host 真发（6host_router.ts routedDsh() L277 fetch 替换）+ MacBook worker 接入（macbook-compose.yml + runbook + capability spec + ACL tag）+ host-id fencing（host_fencing.ts NEW + kernel schema + kernel worker_pool dispatch host_id 参数）全在 wrapper/ + deploy/ + spec/capabilities/macbook.json + spec/kernel-schema.sql（§3.9 例外）+ harness/runtime/worker_pool.py（§3.8 例外）+ notes/ + docs/ 范围内。

### §3.8 NEW MagicDNS 命名裂痕修复声明（per D5 + F11）

```bash
# v1.2.0c §3.8 MagicDNS 命名裂痕修复（per D5 = `.fish-harness.ts.net` canonical + F11 wrapper/deploy 命名裂痕）：
grep -rE "fish-harness\.ts\.net" wrapper/orchestrator/6host_router.ts deploy/tailscale-acl-6host.yaml deploy/tailscale-funnel-6host.yaml deploy/tailscale-serve-harness.yaml deploy/6host-compose.edge1.yml deploy/6host-compose.edge2.yml deploy/6host-compose.edge3.yml deploy/6host-compose.edge4.yml deploy/6host-compose.edge5.yml deploy/6host-compose.newvps.yml deploy/macbook-compose.yml | wc -l
# 期望: ≥ 20 行（1 canonical suffix 跨 11 文件；v1.2.0c 起草预估 ≥ 20）

# v1.2.0c §3.8.1 OLD tail1b9878.ts.net 残留检测（per F11 修复后必 == 0）：
grep -rE "tail1b9878\.ts\.net" wrapper/orchestrator/ deploy/ 2>&1 | wc -l
# 期望: == 0（v1.2.0c 起草预估 = 0；F11 修复后所有 deploy 文件 + 6host_router.ts 切到 `.fish-harness.ts.net`）
```

**含义**：v1.2.0c §3.8 NEW MagicDNS 命名裂痕修复声明 — per D5 决策 `.fish-harness.ts.net` canonical suffix + F11 wrapper `*.fish-harness.ts.net` ≠ deploy `*.tail1b9878.ts.net` 裂痕修复；11 deploy/ 文件（5 edge compose + newvps compose + 3 tailscale files + macbook-compose）+ wrapper/orchestrator/6host_router.ts 全切到 `.fish-harness.ts.net`；routedDsh() 真发远程 host via fetch() 才能命中正确 host (per F12)。

## §4 dsh `headless` profile 守门（M1c TG-1 + M2 BE-1 预备，继承 v0.7 §4 + v1.2.0a §4 + v1.2.0b §4）

```bash
# v1.2.0c 升级不引入 web profile：
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# 期望: 0 行（v1.2.0c 起草实测 = 0）

# 期望出现 headless profile（v1.2.0c 维持 v1.2.0b 实测）：
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# 期望: ≥ 3（v1.2.0c 起草预估 ≥ v1.2.0b 实测维持）

# heuristic fallback 维持（v1.2.0a §4 — cross-host + MacBook 不破坏 commander heuristic fallback）：
grep -cE "plan_metadata.*source|heuristic" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 4（v1.2.0a formal 校准实测 ≥ 4 maintained；v1.2.0c 不动 commander 真实现）

# commander 真实现 dsh 调用守门（v1.2.0a §4 + v1.2.0b §4 维持 — v1.2.0c 不破坏）：
grep -cE "callDshHeadless|dshInvoke" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 2（v1.2.0a formal 校准实测 2 maintained；m3 GATE-CALIB 已去）
```

## §4.5 M2 多 host 守门正式启用（多 host 拓扑漂移风险；继承 v0.7 §4.5 + v1.2.0a §4.5 + v1.2.0b §4.5）

```bash
# M2 6+1 host 拓扑：1 newvps 主 + 5 边缘 host + 1 MacBook host（v1.2.0c §4.5 NEW MacBook 接入）

# 容器 IP 不锁守门（继承 v0.7 §4.5 GATE-CALIB 校准：命令范围排除 node_modules）：
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md | grep -v "127.0.0.1" | wc -l
# 期望: 0 行（v1.2.0c 起草实测 = 0；routedDsh() 用 MagicDNS host 不锁 IP）

# Tailscale MagicDNS 域名使用守门（继承 v0.7 §4.5 + v1.2.0a §4.5 + v1.2.0b §4.5 — v1.2.0c §3.8 修复后 1 canonical suffix）：
grep -rE "fish-harness\.ts\.net" deploy/ | wc -l
# 期望: ≥ 20（newvps + 5 edge + MacBook MagicDNS 名跨 11 文件；v1.2.0c 起草预估 ≥ 20）

# 边缘 host 健康端点 + Funnel URL（继承 v0.7 §4.5 + v1.2.0a §4.5 + v1.2.0b §4.5）：
grep -rE "https://[a-z][a-z0-9-]*\.fish-harness\.ts\.net/" docs/ deploy/ | wc -l
# 期望: ≥ 6（v1.2.0c §3.8 修复后 1 canonical suffix，URL 同步切；v1.2.0c 起草预估 ≥ 6）

# 5 edge compose 起草守门（继承 v0.7 §4.5.7 + v1.2.0a §4.5 + v1.2.0b §4.5 — v1.2.0c §3.8 修复后维持）：
grep -rE "sleep infinity" deploy/ | wc -l  # == 0
grep -rE "harness-edge[1-5]" deploy/ | wc -l  # ≥ 5
grep -rE "tag:harness-edge|tag:macbook" deploy/tailscale-acl-6host.yaml | wc -l  # ≥ 2（v1.2.0c §4.13 NEW tag:macbook 段 + v0.7 §4.5.7 tag:harness-edge）
```

**含义**：v1.2.0c §3.8 MagicDNS 命名裂痕修复后，11 deploy/ 文件 + wrapper/orchestrator/6host_router.ts 全部统一 `.fish-harness.ts.net` suffix；routedDsh() 真发远程 host via fetch() 才能命中正确 host（per F12）；6+1 host 拓扑（1 newvps + 5 edge + 1 MacBook）跨 11 文件 MagicDNS 字符串 ≥ 20。

## §4.6 M2 STT 守门正式启用（音频隐私；继承 v0.7 §4.6 + v1.2.0a §4.6 + v1.2.0b §4.6）

```bash
# M2 STT 录音不留盘守门（v1.2.0c 维持）：
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ env/ | wc -l
# 期望: 0 行（v1.2.0c 不动 STT；cross-host + MacBook 不引入音频处理）

# 临时缓存目录路径合规守门（v1.2.0c 维持）：
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
# 期望: 0 行

# Whisper 模型缓存目录合规守门（v1.2.0c 维持）：
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l
# 期望: 0 行
```

## §4.7 M2 Web Push 守门正式启用（VAPID key 泄漏；继承 v0.7 §4.7 + v1.2.0a §4.7 + v1.2.0b §4.7）

```bash
# VAPID 私钥不入 commit 守门（v1.2.0c 维持）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l
# 期望: 0 行

# Web Push 端点合规守门（v1.2.0c 维持）：
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ | wc -l
# 期望: ≥ 4（v1.2.0c 不动 Web Push）

# M3-EXEC-3 stub 替换守门（v1.2.0c 维持）：
grep -rE "hmacSha256\s*\(\s*signingInput" wrapper/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -rE "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1
grep -rE "dsaEncoding\s*:\s*['\"]ieee-p1363['\"]" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1

# server.ts endpoint 守门（v1.2.0c 维持 v1.2.0b 实测）：
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)|app\.use\(\s*\(\s*_req" wrapper/server.ts
# 期望: ≥ 8（v1.2.0c 不增减 endpoint；v1.2.0b 实测 = 9 maintained）
```

## §4.8 PROJECT_ROOT 路径 bug 修法守门（继承 v0.7 §4.8 + v1.2.0a §4.8 + v1.2.0b §4.8）

```bash
# PROJECT_ROOT import.meta.url 修法 4 文件守门（v1.2.0c 维持）：
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l
# 期望: ≥ 4（v0.7 实测 8 maintained）

# 原 process.cwd() + '..' 残留守门（v1.2.0c 维持）：
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/*.ts | wc -l
# 期望: == 0

# wrapper/orchestrator/ 同样守 import.meta.url 优先模式（v1.2.0c §4.8.6 NEW 扩展到 host_fencing.ts）：
grep -E "import.meta.url" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts wrapper/orchestrator/worker.ts wrapper/orchestrator/host_fencing.ts wrapper/orchestrator/6host_router.ts | wc -l
# 期望: ≥ 2（v1.2.0c 维持 v1.2.0b 实测）
```

## §4.9 dsh binary install 守门（继承 v0.7 §4.9 + v1.2.0a §4.9 + v1.2.0b §4.9）

```bash
# install-dsh.sh 脚本必含 npm 版三核心守卫（v1.2.0c 维持）：
test -f deploy/install-dsh.sh
grep -cF 'DSH_VERSION:-' deploy/install-dsh.sh  # ≥ 1
grep -cF 'if [[ -z "${DSH_VERSION}" ]]' deploy/install-dsh.sh  # ≥ 1
grep -c "set -euo pipefail" deploy/install-dsh.sh  # ≥ 1
grep -c "npm install -g @deepseek-ai/dsh@" deploy/install-dsh.sh  # ≥ 1

# install-dsh.sh 不含硬编码下载 URL（v1.2.0c 维持）：
grep -E "https://github\.com/.*dsh.*releases/download" deploy/install-dsh.sh | wc -l  # == 0
grep -cE "dsh@latest|@deepseek-ai/dsh@latest" deploy/install-dsh.sh  # == 0

# dsh version 锁定守门（v1.2.0c 维持）：
grep -E "DSH_VERSION=" deploy/install-dsh.sh | wc -l  # ≥ 1
```

## §4.10 v1.2.0a commander 真实现守门 + §4.11 v1.2.0b worker 真实现守门（继承 — v1.2.0c 不动 commander/worker 真实现）

```bash
# v1.2.0a §4.10 14 项 commander 真实现守门维持（v1.2.0a PASS 0C/3M/4m 收口 289e7eb 实测）：
grep -rE "TODO\(M1\)" wrapper/orchestrator/commander.ts | wc -l  # == 0
grep -c "WorkflowPack" wrapper/orchestrator/commander.ts  # ≥ 3
grep -cE "PlanPlan|PlanStep" wrapper/orchestrator/commander.ts  # ≥ 4
grep -c "AggregateError" wrapper/orchestrator/commander.ts  # ≥ 2
grep -cE "commander\.(planStep|dispatchStep|aggregateResults)" wrapper/orchestrator/orchestrator.ts  # ≥ 3
grep -cE "completed_steps|failed_steps|pending_steps" wrapper/orchestrator/commander.ts wrapper/orchestrator/types.ts  # ≥ 4
test -f wrapper/orchestrator/workflow_pack.ts  # NEW
test -f workflow_packs/default.json  # NEW
grep -c "loadManifest" wrapper/orchestrator/workflow_pack.ts  # ≥ 1
grep -c "heuristic" wrapper/orchestrator/workflow_pack.ts  # ≥ 2
grep -E "version.*1\.2\.0a|1\.2\.0a" wrapper/orchestrator/commander.ts | wc -l  # ≥ 1
grep -cE "plan_steps|plan_source" wrapper/orchestrator/orchestrator.ts  # ≥ 2
grep -cE "RUN_ORCH_COMMANDER_E2E|RUN_PACK_PLAN_E2E" wrapper/test/integration/orch_commander.test.ts wrapper/test/integration/pack_plan.test.ts  # ≥ 2
grep -c "describe\|it(" wrapper/test/unit/commander.test.ts wrapper/test/unit/workflow_pack.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 25

# v1.2.0b §4.11 worker 真实现守门维持（v1.2.0b PASS 0C/0M/0m 收口 b44c1da 实测）：
grep -rE "TODO\(M1\)" wrapper/orchestrator/worker.ts | wc -l  # == 0
grep -rE "TODO\(M1\)" wrapper/orchestrator/ | wc -l  # == 0
grep -cE "ExecutionDriver|worker_pool" wrapper/orchestrator/worker.ts  # ≥ 6
grep -c "better-sqlite3\|Database" wrapper/orchestrator/worker_pool.ts  # ≥ 4
grep -c "WAL\|busy_timeout\|journal_mode" wrapper/orchestrator/worker_pool.ts  # ≥ 3
grep -c "child_process\|callDshHeadless" wrapper/orchestrator/execution_driver.ts  # ≥ 3
grep -cE "fetch.*api/v1" wrapper/orchestrator/execution_driver.ts  # ≥ 1
grep -cE "worker\.heartbeat|worker_pool\.heartbeat" wrapper/server.ts  # ≥ 2
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/orchestrator/worker.ts wrapper/orchestrator/worker_pool.ts wrapper/orchestrator/execution_driver.ts | wc -l  # == 0
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l  # == 0
grep -E "version.*1\.2\.0b|1\.2\.0b" wrapper/orchestrator/worker.ts | wc -l  # ≥ 1
grep -c "deepseek-v4-flash" spec/capabilities/worker.json  # ≥ 1
grep -c "describe\|it(" wrapper/test/unit/worker.test.ts wrapper/test/unit/worker_pool.test.ts wrapper/test/unit/execution_driver.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 40
grep -cE "RUN_WORKER_POOL_E2E|RUN_SERVER_HEARTBEAT_E2E" wrapper/test/integration/worker_pool.test.ts wrapper/test/integration/server_heartbeat.test.ts  # ≥ 2
test -f wrapper/orchestrator/worker_pool.ts  # NEW
test -f wrapper/orchestrator/execution_driver.ts  # NEW
grep -c '"better-sqlite3"' wrapper/package.json  # ≥ 1
grep -c "apk add.*python3.*make.*g++" Dockerfile  # ≥ 1
```

## §4.12 v1.2.0c cross-host 真发守门（v1.2.0c NEW — plan §4 + F11/F12/F18/F20 + ADR 0009 line 68）

```bash
# MagicDNS suffix canonical 跨 11 文件守门（v1.2.0c NEW §4.12.1 — per §3.8 修复声明）：
grep -rE "fish-harness\.ts\.net" wrapper/orchestrator/6host_router.ts deploy/tailscale-acl-6host.yaml deploy/tailscale-funnel-6host.yaml deploy/tailscale-serve-harness.yaml deploy/6host-compose.edge1.yml deploy/6host-compose.edge2.yml deploy/6host-compose.edge3.yml deploy/6host-compose.edge4.yml deploy/6host-compose.edge5.yml deploy/6host-compose.newvps.yml deploy/macbook-compose.yml | wc -l
# 期望: ≥ 20（v1.2.0c 起草预估 ≥ 20；1 canonical suffix 跨 11 文件）

# 旧 tail1b9878.ts.net 残留检测（v1.2.0c NEW §4.12.2 — per F11 修复后必 == 0）：
grep -rE "tail1b9878\.ts\.net" wrapper/orchestrator/ deploy/ 2>&1 | wc -l
# 期望: == 0（v1.2.0c 起草预估 = 0）

# routedDsh() 真发 fetch() 守门（v1.2.0c NEW §4.12.3 — per F12 L277 替换）：
grep -cE "fetch.*fish-harness\.ts\.net.*api/v1/tasks" wrapper/orchestrator/6host_router.ts
# 期望: ≥ 1（v1.2.0c 起草预估 ≥ 1）

# callDshHeadless 残留检测（v1.2.0c NEW §4.12.4 — per F12 替换后必 == 0）：
grep -c "callDshHeadless" wrapper/orchestrator/6host_router.ts
# 期望: == 0（v1.2.0c 起草预估 = 0；6host_router.ts L277 callDshHeadless 替换为 fetch）

# HostId union 扩 7 host 守门（v1.2.0c NEW §4.12.5 — per F20）：
grep -c "MACBOOK_HOST\|macbook" wrapper/orchestrator/6host_router.ts
# 期望: ≥ 4（v1.2.0c 起草预估 ≥ 4；HostId union + 表 + findAvailableHost + scoring）

# host_id fencing kernel-side 守门（v1.2.0c NEW §4.12.6 — per F13 + ADR 0009 line 68）：
grep -c "host_id\|hostId" harness/runtime/worker_pool.py spec/kernel-schema.sql | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 5（v1.2.0c 起草预估 ≥ 5；worker_pool.py dispatch(task_id, host_id) ≥ 3 + kernel-schema.sql host_id 列 + partial unique index）

# partial unique index 守门（v1.2.0c NEW §4.12.7 — per F13 partial unique index `UNIQUE(task_id, host_id) WHERE status='active'`）：
grep -rE "CREATE UNIQUE INDEX.*task_id.*host_id" spec/ | wc -l
# 期望: ≥ 1（v1.2.0c 起草预估 ≥ 1；spec/kernel-schema.sql 加 idx_dispatch_task_host）

# host_fencing.ts 文件存在守门（v1.2.0c NEW §4.12.8 — per plan §4.2 + F13 NEW）：
test -f wrapper/orchestrator/host_fencing.ts  # NEW
# 期望: exists（v1.2.0c 起草预估 = exists）

# host_fencing.ts host_id refs 守门（v1.2.0c NEW §4.12.9 — per F13 + ADR 0009 line 68）：
grep -c "host_id" wrapper/orchestrator/host_fencing.ts
# 期望: ≥ 5（v1.2.0c 起草预估 ≥ 5；recordDispatch/checkFencing/HostIdFencingError/host_id 参数/INSERT host_id）

# cross-host 真发 test gated 守门（v1.2.0c NEW §4.12.10 — per F18）：
grep -cE "RUN_CROSS_HOST_E2E|RUN_HOST_FENCING_E2E" wrapper/test/integration/cross_host_dispatch.test.ts wrapper/test/integration/host_id_fencing.test.ts
# 期望: ≥ 2（v1.2.0c 起草预估 ≥ 2；integration gated）

# MacBook MagicDNS hostname 守门（v1.2.0c NEW §4.12.11 — per F20 + D5）：
grep -c "kjonemacbook-pro\|macbook\.fish-harness\.ts\.net" deploy/macbook-compose.yml wrapper/orchestrator/6host_router.ts
# 期望: ≥ 4（v1.2.0c 起草预估 ≥ 4；macbook-compose.yml WORKER_HOST + 6host_router.ts MACBOOK_HOST.magicDnsName）

# 6host_router.ts HostId union 字面守门（v1.2.0c NEW §4.12.12 — per F20）：
grep -E "type HostId\s*=\s*['\"](newvps|edge[1-5]|macbook)" wrapper/orchestrator/6host_router.ts
# 期望: ≥ 1（v1.2.0c 起草预估 ≥ 1；HostId union 加 "macbook" 字面）

# integration cross-host E2E file exists 守门（v1.2.0c NEW §4.12.13 — per plan §4.2）：
test -f wrapper/test/integration/cross_host_dispatch.test.ts  # NEW
# 期望: exists（v1.2.0c 起草预估 = exists）

# host_id_fencing.test.ts file exists 守门（v1.2.0c NEW §4.12.14 — per plan §4.2）：
test -f wrapper/test/integration/host_id_fencing.test.ts  # NEW
# 期望: exists（v1.2.0c 起草预估 = exists）

# macbook.json file exists 守门（v1.2.0c NEW §4.12.15 — per F14）：
test -f spec/capabilities/macbook.json  # NEW
# 期望: exists（v1.2.0c 起草预估 = exists）

# hygiene 净守门（v1.2.0c NEW §4.12.16 — cross-host + fencing 绝不硬编码 key）：
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/orchestrator/6host_router.ts wrapper/orchestrator/host_fencing.ts wrapper/orchestrator/orchestrator.ts wrapper/orchestrator/worker.ts | wc -l
# 期望: 0 行（cross-host 真发 + fencing 不引入 VAPID，不硬编码 DEEPSEEK key — 守）
```

**含义**：v1.2.0c §4.12 NEW cross-host 真发守门 16 项 — `6host_router.routedDsh()` L277 `callDshHeadless()` → `fetch(${getHostUrl(targetHost, 4001)}/api/v1/tasks, POST)` 真发远程 host (per F12) + HostId union 7 host (per F20 newvps + 5 edge + macbook) + MagicDNS canonical `.fish-harness.ts.net` 跨 11 deploy/ 文件 (per D5 + F11) + `host_fencing.ts` NEW partial unique index wrapper-side (per F13) + kernel-side `dispatches.host_id` + partial unique index (per F13 + ADR 0009 line 68) + 3 NEW integration tests gated (cross_host_dispatch + host_id_fencing + macbook_worker) + 16 grep pattern 全绿 — 这是 v1.2.0 4 sub-cycle 的第三刀（cross-host + MacBook）+ ADR 0009 line 68 host-id fencing 落地 + PRD §3.1 MacBook 主力 worker 接入 + §3.3 跨 host 真发。

## §4.13 v1.2.0c MacBook worker 守门（v1.2.0c NEW — plan §4 + D6 + F14/F15/F16/F19）

```bash
# MacBook compose + runbook + capability spec 三件套守门（v1.2.0c NEW §4.13.1 — per F14/F15）：
test -f deploy/macbook-compose.yml  # NEW（v1.2.0c 起草预估 = exists）
test -f deploy/runbook-macbook-worker.md  # NEW（v1.2.0c 起草预估 = exists）
test -f spec/capabilities/macbook.json  # NEW（v1.2.0c 起草预估 = exists）

# host_class + working_hours 字段守门（v1.2.0c NEW §4.13.2 — per F14）：
grep -c "host_class.*macbook-main\|working_hours" wrapper/orchestrator/worker.ts spec/capabilities/macbook.json | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 3（v1.2.0c 起草预估 ≥ 3；worker.ts capability() 路由 + macbook.json 字面 + working_hours 字段）

# isWorkingHours + scoring +100 守门（v1.2.0c NEW §4.13.3 — per D6 + F14）：
grep -c "isWorkingHours\|scoring.*+100\|score.*+.*100" wrapper/orchestrator/orchestrator.ts
# 期望: ≥ 2（v1.2.0c 起草预估 ≥ 2；orchestrator.ts isWorkingHours() 函数 + scoring +100 命中）

# Tailscale ACL tag:macbook 守门（v1.2.0c NEW §4.13.4 — per F16）：
grep -rE "tag:macbook" deploy/tailscale-acl-6host.yaml | wc -l
# 期望: ≥ 3（v1.2.0c 起草预估 ≥ 3；ACL 段 + tagOwners + 引用至少 3 处）

# MacBook MagicDNS hostname + container 守门（v1.2.0c NEW §4.13.5 — per F15/F20）：
grep -c "kjonemacbook-pro\|macbook\.fish-harness\.ts\.net" deploy/macbook-compose.yml wrapper/orchestrator/6host_router.ts
# 期望: ≥ 4（v1.2.0c 起草预估 ≥ 4；macbook-compose.yml WORKER_HOST + 6host_router.ts MACBOOK_HOST.magicDnsName + containerName）

# node:24-slim image 守门（v1.2.0c NEW §4.13.6 — per F19 alpine musl 避开）：
grep -cE "node:24-slim" deploy/macbook-compose.yml
# 期望: ≥ 1（v1.2.0c 起草预估 ≥ 1；image: node:24-slim）

# MacBook WORKER_HOST + EDGE_REGION + colima 守门（v1.2.0c NEW §4.13.7 — per F15/F19）：
grep -c "WORKER_HOST\|EDGE_REGION.*local-mac\|colima" deploy/macbook-compose.yml
# 期望: ≥ 3（v1.2.0c 起草预估 ≥ 3；WORKER_HOST + EDGE_REGION + colima 文档）

# MacBook bind mount 守门（v1.2.0c NEW §4.13.8 — per F15）：
grep -c "bind.*Users/kjonekong\|/Users.*projects.*fish-harness" deploy/macbook-compose.yml
# 期望: ≥ 2（v1.2.0c 起草预估 ≥ 2；volumes bind mount + runbook 引用）

# sleep infinity 检测（v1.2.0c NEW §4.13.9 — per v0.7 §4.5.7 维持）：
grep -rE "sleep infinity" deploy/macbook-compose.yml | wc -l  # == 0

# macbook_worker.test.ts file exists 守门（v1.2.0c NEW §4.13.10 — per plan §4.2 + F18）：
test -f wrapper/test/integration/macbook_worker.test.ts  # NEW
# 期望: exists（v1.2.0c 起草预估 = exists；gated by RUN_MACBOOK_E2E=1）

# macbook.json model_id 守门（v1.2.0c NEW §4.13.11 — per F14）：
grep -c "deepseek-v4-flash" spec/capabilities/macbook.json
# 期望: ≥ 1（v1.2.0c 起草预估 ≥ 1；model_id 与 worker.json 一致）

# graceful degradation 守门（v1.2.0c NEW §4.13.12 — per F15 + PRD §3.1）：
grep -c "pmset\|disablesleep\|reassign" deploy/runbook-macbook-worker.md deploy/macbook-compose.yml | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 2（v1.2.0c 起草预估 ≥ 2；runbook pmset 防止合盖 + reassign 心跳失败 3 次）
```

**含义**：v1.2.0c §4.13 NEW MacBook worker 守门 12 项 — `deploy/macbook-compose.yml` NEW MacBook worker deployment (per F15 + node:24-slim per F19) + `deploy/runbook-macbook-worker.md` NEW provision runbook (per F15 Docker Desktop / colima `--vm-type=qemu --arch=x86_64` per F19) + `spec/capabilities/macbook.json` NEW capability spec `host_class: macbook-main` + `working_hours: true` (per F14) + `wrapper/orchestrator/worker.ts` capability() 按 host 路由到 macbook.json (per F14) + `wrapper/orchestrator/orchestrator.ts` MacBook scoring +100 工作时段 周一-周五 09:00-22:00 本地时间 (per D6 + F14) + `deploy/tailscale-acl-6host.yaml` `tag:macbook` 段 + `tagOwners.tag:macbook: [cscoheru]` (per F16) + `wrapper/test/integration/macbook_worker.test.ts` NEW gated by `RUN_MACBOOK_E2E=1` (per F18 + plan §4.2) — 这是 v1.2.0 4 sub-cycle 的第三刀（MacBook worker 接入）+ PRD §3.1 「MacBook Pro M1 16G ⭐ 主力」 + PRD §3.3 跨 host 真发。

## §4.14 v1.2.0c host-id fencing 守门（v1.2.0c NEW — plan §4 + F13 + ADR 0009 line 68）

```bash
# kernel-side worker_pool.py host_id 参数守门（v1.2.0c NEW §4.14.1 — per F13）：
grep -cE "host_id|hostId" harness/runtime/worker_pool.py
# 期望: ≥ 3（v1.2.0c 起草预估 ≥ 3；dispatch(task_id, host_id) 参数 + INSERT host_id + HostIdFencingError）

# spec/kernel-schema.sql partial unique index 守门（v1.2.0c NEW §4.14.2 — per F13）：
grep -cE "CREATE UNIQUE INDEX.*task_id.*host_id|UNIQUE.*host_id" spec/kernel-schema.sql
# 期望: ≥ 1（v1.2.0c 起草预估 ≥ 1；CREATE UNIQUE INDEX idx_dispatch_task_host）

# host_fencing.ts host_id refs 守门（v1.2.0c NEW §4.14.3 — per F13 + ADR 0009）：
grep -c "host_id" wrapper/orchestrator/host_fencing.ts
# 期望: ≥ 5（v1.2.0c 起草预估 ≥ 5；recordDispatch + checkFencing + HostIdFencingError + host_id 参数 + INSERT host_id）

# host_fencing.ts file exists 守门（v1.2.0c NEW §4.14.4 — per plan §4.2 + F13 NEW）：
test -f wrapper/orchestrator/host_fencing.ts  # NEW
# 期望: exists（v1.2.0c 起草预估 = exists）

# host_fencing.ts recordDispatch 函数守门（v1.2.0c NEW §4.14.5 — per plan §4.2）：
grep -c "function recordDispatch\|export function recordDispatch\|recordDispatch\s*=" wrapper/orchestrator/host_fencing.ts
# 期望: ≥ 1（v1.2.0c 起草预估 ≥ 1）

# host_fencing.ts checkFencing 函数守门（v1.2.0c NEW §4.14.6 — per plan §4.2）：
grep -c "function checkFencing\|export function checkFencing\|checkFencing\s*=" wrapper/orchestrator/host_fencing.ts
# 期望: ≥ 1（v1.2.0c 起草预估 ≥ 1）

# host_fencing.ts HostIdFencingError 类守门（v1.2.0c NEW §4.14.7 — per plan §4.2 + F13）：
grep -c "class HostIdFencingError\|HostIdFencingError\s*extends" wrapper/orchestrator/host_fencing.ts
# 期望: ≥ 1（v1.2.0c 起草预估 ≥ 1）

# host_id_fencing.test.ts file exists 守门（v1.2.0c NEW §4.14.8 — per plan §4.2 + F18）：
test -f wrapper/test/integration/host_id_fencing.test.ts  # NEW
# 期望: exists（v1.2.0c 起草预估 = exists；gated by RUN_HOST_FENCING_E2E=1）
```

**含义**：v1.2.0c §4.14 NEW host-id fencing 守门 8 项 — `wrapper/orchestrator/host_fencing.ts` NEW wrapper-side fencing (per plan §4.2 + F13) + `spec/kernel-schema.sql` `dispatches.host_id` 列 + partial unique index `idx_dispatch_task_host ON dispatches(task_id, host_id) WHERE status='active'` (per F13 + ADR 0009 line 68) + `harness/runtime/worker_pool.py` `dispatch(task_id, host_id)` 加 host_id 参数 + INSERT host_id + 抛 `HostIdFencingError` (per F13) + 3 NEW file exists 守门 (host_fencing.ts + host_id_fencing.test.ts + kernel-schema.sql UPDATE) — 这是 v1.2.0 4 sub-cycle 的第三刀（host-id fencing per ADR 0009 line 68 首次落地）+ §3.8 harness/runtime/worker_pool.py 例外声明 + §3.9 spec/kernel-schema.sql 例外声明。

## §5 v1.2.0c 21 文件 hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
| 1 | `wrapper/orchestrator/6host_router.ts` (Edit ~50 行) | 无 | 无（HostId union 加 "macbook" + MACBOOK_HOST + routedDsh() fetch 替换 + MacBook scoring +100 per F11/F12/F14/F20）| ✅ wrapper/ 不入主合同 |
| 2 | `wrapper/orchestrator/orchestrator.ts` (Edit ~30 行) | 无 | 无（dispatch() 加 MacBook scoring +100 + isWorkingHours() helper per D6 + F14）| ✅ wrapper/ 不入主合同 |
| 3 | `wrapper/orchestrator/host_fencing.ts` (NEW ~80 行) | 无 | 无（recordDispatch + checkFencing + HostIdFencingError per plan §4.2 + F13 + ADR 0009 line 68）| ✅ wrapper/ 不入主合同 |
| 4 | `wrapper/orchestrator/worker.ts` (Edit ~20 行) | 无 | 无（capability() 路由 worker.json \| macbook.json per F14）| ✅ wrapper/ 不入主合同 |
| 5 | `wrapper/test/unit/6host_router.test.ts` (Edit ~30 tests) | 无 | 无（MacBook scoring + isWorkingHours 时间窗 + fetch() 真发 mock capture URL per F12/F14/F20）| ✅ wrapper/ 不入主合同 |
| 6 | `wrapper/test/integration/cross_host_dispatch.test.ts` (NEW ~180 行) | 无 | 无（gated by RUN_CROSS_HOST_E2E=1 + routedDsh 真发 capture fetch + partial unique index 兜底 + MagicDNS 命名一致性 per F11/F12/F18）| ✅ wrapper/ 不入主合同 |
| 7 | `wrapper/test/integration/host_id_fencing.test.ts` (NEW ~100 行) | 无 | 无（gated by RUN_HOST_FENCING_E2E=1 + INSERT host_id=A OK + INSERT host_id=B UNIQUE constraint failed + INSERT host_id=A 同 task 但 status='completed' OK per F13 + ADR 0009）| ✅ wrapper/ 不入主合同 |
| 8 | `wrapper/test/integration/macbook_worker.test.ts` (NEW ~120 行) | 无 | 无（gated by RUN_MACBOOK_E2E=1 + MacBook heartbeat + scoring +100 工作时段 + graceful degradation 心跳失败 3 次 reassign per F15/F18 + PRD §3.1）| ✅ wrapper/ 不入主合同 |
| 9 | `deploy/6host-compose.edge[1-5].yml` (Edit 5 文件) | 无 | 无（HARNESS_API_URL 改 `*.fish-harness.ts.net` per D5 + F11）| ✅ deploy/ 不入主合同 |
| 10 | `deploy/6host-compose.newvps.yml` (Edit) | 无 | 无（peer references 改 `*.fish-harness.ts.net` per D5 + F11）| ✅ deploy/ 不入主合同 |
| 11 | `deploy/{tailscale-acl-6host,tailscale-funnel-6host,tailscale-serve-harness}.yaml` (Edit 3 文件) | 无 | 无（全 6 host 改名 `*.fish-harness.ts.net` per D5 + F11；ACL 文件加 `tag:macbook` 段 per F16）| ✅ deploy/ 不入主合同 |
| 12 | `deploy/macbook-compose.yml` (NEW ~120 行) | 无 | 无（image: node:24-slim per F19 + WORKER_HOST=kjonemacbook-pro + bind mount + HARNESS_API_URL=http://newvps.fish-harness.ts.net:4000 per D5 + mem_limit 2g + command: ["node", "build/server.js"] per F15）| ✅ deploy/ 不入主合同 |
| 13 | `deploy/runbook-macbook-worker.md` (NEW ~150 行) | 无 | 无（MacBook provision Docker Desktop / colima `--vm-type=qemu --arch=x86_64` per F19 + Tailscale 接入 + MagicDNS 验证 + scoring +100 工作时段 + graceful degradation per PRD §3.1）| ✅ deploy/ 不入主合同 |
| 14 | `spec/capabilities/macbook.json` (NEW ~30 行) | 无 | 无（model_id: deepseek-v4-flash + host_class: "macbook-main" + working_hours: true + evidence_uri per F14）| ✅ spec/capabilities/ 入主合同（实测 = 0）|
| 15 | `spec/kernel-schema.sql` (Edit ~10 行) | 无 | 无（dispatches.host_id + CREATE UNIQUE INDEX idx_dispatch_task_host per F13；§3.9 NEW 例外声明）| ✅ spec/kernel-schema.sql 入主合同（实测 = 0 — 不含 Fable/GLM/MiniMax）|
| 16 | `harness/runtime/worker_pool.py` (Edit ~30 行) | 无 | 无（dispatch(task_id, host_id) + INSERT host_id + HostIdFencingError per F13；§3.8 NEW 例外声明）| ✅ harness/ §3.8 例外声明（host_id fencing 必需扩展）|
| 17 | `notes/codex-audit-scope-v1.2.0c-v0.1.md` (NEW 本文件) | 含字面（自伤豁免）| 本文件 | ✅ notes/ 不入主合同 |
| 18 | `notes/codex-audit-scope-v1.2.0c-v0.1-prompt.md` (NEW 配套 prompt) | 含字面（自伤豁免）| §1.5 引用 | ✅ notes/ 不入主合同 |
| 19 | `docs/poll/cc-ready.json` (Edit) | 无 | 无（task_id 翻牌 T-V1.2.0C-CROSSHOST-MACBOOK-PASS + D4/D5/D6 决策记档 + §3.8 修复声明 + §4.12/§4.13/§4.14 NEW 守门）| ✅ |
| 20 | `CHANGELOG.md` (Edit) | 无 | 无（[1.2.0c] minor 段 NEW：routedDsh 真发 + host_fencing NEW + MacBook compose + 5 NEW files + 3 NEW integration tests gated + D4/D5/D6 决策记档）| ✅ |
| 21 | `README.md` (Edit) | 无 | 无（v1.2.0c status 段补：6+1 host 真接 + MagicDNS canonical + MacBook working hours + cross-host fetch + host-id fencing）| ✅ |

**v1.2.0c 升级前向交付物** = 8 文件（CHANGELOG + README + spec/capabilities/{worker,macbook}.json + spec/kernel-schema.sql + harness/runtime/worker_pool.py + wrapper/package.json（不动）+ Dockerfile（不动）+ 3 docs/ cc-ready）；**audit-scope + prompt** = 2 文件（留 notes/ 归档）；**wrapper/orchestrator/** = 4 文件代码改动（6host_router Edit + orchestrator Edit + host_fencing NEW + worker Edit）；**wrapper/test/** = 4 文件（6host_router Edit + 3 integration NEW）；**deploy/** = 11 文件（5 edge compose Edit + newvps compose Edit + 3 tailscale files Edit + macbook-compose NEW + runbook-macbook-worker NEW = 实际 5+1+3+1+1=11 deploy 文件）；**spec/capabilities/** = 1 文件 NEW（macbook.json）+ spec/kernel-schema.sql Edit；**harness/runtime/** = 1 文件 Edit（worker_pool.py per §3.8 例外）。

## §6 后续 Codex 复审预期 + v1.2.0c minor tag 路径选择

- v1.2.0c 升级前向交付物 grep `Fable 5|GLM 5.3|MiniMax-M3` = 0 ✓
- v1.2.0c 升级前向交付物 grep `sk-[a-z0-9]{32,}` = 0 ✓
- v1.2.0c 升级前向交付物 grep `tskey-[a-zA-Z0-9_-]{32,}` = 0 ✓
- v1.2.0c 升级范围 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域>` = 0 行 ✓（§3.8 harness/runtime/worker_pool.py 例外声明 + §3.9 spec/kernel-schema.sql 例外声明 + §3.7 Dockerfile 例外声明 v1.2.0b 维持）
- v1.2.0c 升级范围 `grep "profile: web" wrapper/` = 0 行 ✓
- v1.2.0c 升级范围 `grep "profile: headless" wrapper/` ≥ 3 行 ✓（v1.2.0b 实测维持）
- §3.8 NEW MagicDNS 命名裂痕修复声明（per D5 + F11）— 11 deploy/ 文件 + 6host_router.ts 全切 `.fish-harness.ts.net`
- §3.8.1 tail1b9878.ts.net 残留 == 0
- §4.10 NEW v1.2.0a commander 真实现守门维持（v1.2.0a PASS 0C/3M/4m 收口 289e7eb 实测锚定）
- §4.11 NEW v1.2.0b worker 真实现守门维持（v1.2.0b PASS 0C/0M/0m 同轮全闭 b44c1da 实测锚定）
- §4.12 NEW v1.2.0c cross-host 真发守门 16 项全绿
- §4.13 NEW v1.2.0c MacBook worker 守门 12 项全绿
- §4.14 NEW v1.2.0c host-id fencing 守门 8 项全绿
- tracked 锚定 post-v1.2.0c = 引用式 audit-scope §1.5 主表合计（v1.2.0c 引用 v1.2.0a 主表合计 + v1.2.0c 增量实测校准；禁公式预测）
- Codex 提交铁律：用户亲提 `gpt-5.6-sol` + `xhigh`；Claude 不亲提
- 下一站：v1.2.0c PASS → **v1.2.0c Codex formal 复审 PASS**（user 亲提）→ **v1.2.0c minor tag @ boundary commit b5a1d07**（m1 GATE-CALIB per prompt-review：Debian 风格 tag @ 本周期起跑点 = v1.2.0b 收口后 cross-ref；289e7eb 是 v1.2.0a 收口 boundary，user 亲提 git tag + push via Clash proxy）→ **v1.2.0d sub-cycle**（防 OOM 策略 docker memory limits + queue 持久化 + monitoring；待 user 裁断 v1.2.0c PASS 后启动）

---

## §7 教训记档（v1.2.0c NEW — cross-host 真发 + MacBook 接入 + host-id fencing 实战）

**v1.2.0c 教训（2026-09-05 立）**：

1. **MagicDNS 命名裂痕修复实战（v1.2.0c NEW — D5 决策 + F11 裂痕）**：
   - **病灶**：wrapper/orchestrator/6host_router.ts:74,82-86,120,193 使用 `.fish-harness.ts.net` suffix（wrapper 视角）；但 deploy/{6host-compose.edge[1-5].yml, 6host-compose.newvps.yml, tailscale-acl-6host.yaml, tailscale-funnel-6host.yaml, tailscale-serve-harness.yaml} 11 文件全用 `.tail1b9878.ts.net` suffix（Tailscale 默认 tailnet hostname）；routedDsh() 真发跨 host 时域名解析到错 host → dispatch 静默失败（per F11）
   - **修法**：per D5 决策 `.fish-harness.ts.net` canonical suffix + §3.8 NEW 修复声明 — 11 deploy/ 文件全切 + wrapper/orchestrator/6host_router.ts 维持（已是 canonical）+ §3.8.1 tail1b9878.ts.net 残留 == 0 守门
   - **机制条款**：v1.2.0c §4.12.1 「fish-harness.ts.net 跨 11 文件 ≥ 20」+ §3.8.1 「tail1b9878.ts.net 残留 == 0」守门；11 文件 MagicDNS 字符串全一致
   - **实战坑**：routedDsh() 真发跨 host via fetch() 时，MagicDNS suffix 不一致会触发 Tailscale DNS 解析失败 → Promise reject → orchestrator 抛 error 看似「No host available」实为 hostname typo；统一 suffix 后 Tailscale DNS resolver 命中正确 host

2. **routedDsh() L277 真发 fetch() 实战（v1.2.0c NEW — F12 L277 替换）**：
   - **病灶**：原 `wrapper/orchestrator/6host_router.ts:277` `return await callDshHeadless(prompt, opts);` 决策路由了但实际未跨 host — `routedDsh()` L252-278 全部 26 行代码只有路由决策，落点还是本地 dsh（per F12 + plan §4.3 #1）
   - **修法**：L277 替换为 `const resp = await fetch(${getHostUrl(targetHost, 4001)}/api/v1/tasks, POST {body: JSON.stringify({prompt, class: modelClass}), signal: AbortSignal.timeout(timeoutMs)}); return await resp.json();` — `getHostUrl(targetHost, 4001)` 默认 port 改 4001（cross-host wrapper port 而非本地 dsh port 3000）
   - **机制条款**：v1.2.0c §4.12.3 「fetch.*fish-harness.ts.net.*api/v1/tasks ≥ 1」+ §4.12.4 「callDshHeadless == 0」守门
   - **实战坑**：fetch() 需要 AbortSignal.timeout 否则跨 host HTTP 卡住时无 timeout 兜底；resp.json() 假设 server.ts 真接 task endpoint（v1.2.0b 已实测 + U5 验证）；mock fetch 在 unit test 需 capture URL 验证真发到 MagicDNS host 而非 localhost

3. **host-id fencing per ADR 0009 line 68 实战（v1.2.0c NEW — F13 + ADR 0009 首次落地）**：
   - **病灶**：ADR 0009 line 68 「如果未来 multi-host，必须在 dispatch 层加 host-id fencing（不在 v1.0 scope）」— v1.2.0c 是该声明的首次落地；kernel-side `dispatches` 表无 host_id 列 + 无 partial unique index 兜底；2 orchestrator 同时 dispatch 同一 task_id（不同 host）会双 INSERT 成功导致任务分配冲突
   - **修法**：kernel-side `spec/kernel-schema.sql` 加 `dispatches.host_id TEXT NOT NULL DEFAULT 'unknown'` + `CREATE UNIQUE INDEX idx_dispatch_task_host ON dispatches(task_id, host_id) WHERE status='active';` (partial unique index 仅 active 状态冲突兜底，completed dispatch 不冲突) + `harness/runtime/worker_pool.py` `dispatch(task_id, host_id)` 加 host_id 参数 + INSERT 用 host_id + 抛 `HostIdFencingError` 当 host_id 已存在 active dispatch for task_id（走 partial unique index 兜底，try-except）；wrapper-side `wrapper/orchestrator/host_fencing.ts` NEW 80 行简化版（无 cross-DB FK，per F3 wrapper 是 pure client 不权威）+ `recordDispatch(task_id, host_id)` INSERT to dispatches table + `checkFencing(task_id, host_id)` SELECT count active + `HostIdFencingError` 抛出 when conflict
   - **机制条款**：v1.2.0c §3.8 harness/runtime/worker_pool.py 例外声明 + §3.9 spec/kernel-schema.sql 例外声明 + §4.12.6 「host_id kernel ≥ 5」+ §4.12.7 「CREATE UNIQUE INDEX ≥ 1」+ §4.14.1-§4.14.8 host-id fencing 8 项守门
   - **实战坑**：partial unique index 仅在 SQLite 3.8+ 支持（v1.2.0b better-sqlite3@^11 默认 SQLite 3.45+ 满足）；wrapper-side host_fencing.ts 是简化版本（per F13 无 cross-DB FK），仅做 fencing 检查 + 抛出错误（不持久化），kernel-side 是 authoritative；host_id 参数经 orchestrator → commander → worker_pool.dispatch 全链路传递（per F13 全链路 + ADR 0009）

4. **MacBook Worker 接入实战（v1.2.0c NEW — D6 + F14/F15 + PRD §3.1）**：
   - **病灶**：PRD §3.1 「MacBook Pro M1 16G ⭐ 主力（你工作时段）」— v1.2.0c 需接入 MacBook 作为 worker host；但 MacBook 不跑 Docker daemon 默认（需 Docker Desktop 或 colima）；5 edge compose 已就位，MacBook 0 文件（per F15）
   - **修法**：NEW `deploy/macbook-compose.yml` ~120 行（MacBook-specific: `image: node:24-slim` per F19 避开 alpine musl + `WORKER_HOST=kjonemacbook-pro` + `EDGE_REGION=local-mac` + `volumes: [..:/app:ro]` bind mount `/Users/kjonekong/projects/fish-harness` + `mem_limit: 2g` + `HARNESS_API_URL=http://newvps.fish-harness.ts.net:4000` per D5 + `command: ["node", "build/server.js"]` + `depends_on: kernel service_started` + `networks: harness_net` + `restart: unless-stopped`）+ NEW `deploy/runbook-macbook-worker.md` ~150 行（Docker Desktop / colima 二选一 + Tailscale 接入 + MagicDNS 验证 + scoring +100 工作时段 + graceful degradation 心跳失败 3 次 reassign per PRD §3.1）+ NEW `spec/capabilities/macbook.json` ~30 行（`model_id: deepseek-v4-flash` + `host_class: "macbook-main"` + `working_hours: true` + `evidence_uri: spec/capabilities/macbook.json` per F14）+ `wrapper/orchestrator/worker.ts` capability() 探测 `host` 字段 → 路由到 `spec/capabilities/{worker.json | macbook.json}` per F14 + `wrapper/orchestrator/orchestrator.ts` MacBook scoring +100 工作时段 周一-周五 09:00-22:00 本地时间 per D6 + F14 + NEW `isWorkingHours()` helper 函数 + `deploy/tailscale-acl-6host.yaml` `tag:macbook` 段 + `tagOwners.tag:macbook: [cscoheru]` per F16
   - **机制条款**：v1.2.0c §4.13.1-§4.13.12 MacBook worker 12 项守门
   - **实战坑**：MacBook colima alpine aarch64 vs Linux x86_64 ABI 不一致（per F19）— runbook 注 `--vm-type=qemu --arch=x86_64` + `image: node:24-slim` 避开 musl；MacBook 合盖/睡眠 → 任务卡住 — runbook 注 `pmset -a disablesleep 0`（MacBook 不合盖）+ graceful degradation 心跳失败 3 次 → reassign per PRD §3.1；`node:24-slim` 而非 `node:22-alpine` 避免 musl/glibc 兼容性问题（per F19 + v1.2.0b R1/R2 root-cause fixes）

5. **Tailscale ACL tag:macbook 段实战（v1.2.0c NEW — F16）**：
   - **病灶**：当前 `deploy/tailscale-acl-6host.yaml` 仅有 `tag:harness` (newvps) + `tag:edge` (5 edge) + `tag:admin` (owner) — MacBook 接入需新 tag:macbook 段（per F16）
   - **修法**：ACL 加 `tag:macbook` 段（MacBook → tag:harness:8000,4000 access for fetch dispatch；MacBook → tag:edge:4001 for cross-host LB）+ `tagOwners` 段加 `tag:macbook: [cscoheru]`
   - **机制条款**：v1.2.0c §4.13.4 「tag:macbook ≥ 3」守门；ACL 段 + tagOwners + 引用至少 3 处
   - **实战坑**：Tailscale ACL push 误操作锁出 owner（deny all 兜底生效）— F16 ACL 段先在 dev Tailscale tailnet 验证 + `tailscale acl test` 跑通；主 tailnet push 前 diff review（per plan §12.5 R7）

7. **v1.2.0c plan agent 9 user must execute items（v1.2.0c EXEC — 继承 v1.2.0b 7 EXEC + 2 = 9 项）**：
   - U1: TypeScript build on newvps（`ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc'`）
   - U2: 双 gate 验证（tsc + vitest，`./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`）
   - U3: docker compose 重启（per v1.2.0c 范围 — 加 macbook compose；`docker compose -f deploy/6host-compose.newvps.yml down && docker compose -f deploy/6host-compose.newvps.yml up -d` 5 edge + 3 newvps services = 8 containers Up）
   - U4: 107 gated E2E 真跑（per F18：`RUN_WORKER_POOL_E2E=1 RUN_SERVER_HEARTBEAT_E2E=1 RUN_ORCH_COMMANDER_E2E=1 RUN_PACK_PLAN_E2E=1 RUN_CROSS_HOST_E2E=1 RUN_HOST_FENCING_E2E=1 DEEPSEEK_API_KEY=<key> ./node_modules/.bin/vitest run test/integration/{worker_pool,server_heartbeat,orch_commander,pack_plan,cross_host_dispatch,host_id_fencing}.test.ts`；12+10+15+15+?+? = 70+ tests PASS，新增 cross_host_dispatch 8 + host_id_fencing 6 = 14 gated tests）
   - U5: 6+1 Funnel URL 路径 200 验证（per F11 修复后 MagicDNS 一致 — `curl -i http://newvps.fish-harness.ts.net:4001/api/v1/worker/health` + 5 edge wrappers + `curl -i http://kjonemacbook-pro.fish-harness.ts.net:4001/api/v1/worker/health`（MacBook 需 U8 部署后验证）= 7 路径 all 200）
   - U6: Codex v1.2.0c formal 复审（user 亲提 `codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.2.0c-v0.1-prompt.md`；预期 0C/0M/0m + §4.12 cross-host 真发守门 16 项全绿 + §4.13 MacBook worker 守门 12 项全绿 + §4.14 host-id fencing 守门 8 项全绿 + §3.8 MagicDNS 命名裂痕修复声明合规 + tracked 锚定 post-v1.2.0c 引用式 PASS）
   - U7: v1.2.0c minor tag @ boundary commit **b5a1d07**（m1 GATE-CALIB per prompt-review：原文 289e7eb 与提交命令矛盾已校准；per Debian stable point release 风格 + user 亲提 `git tag -a v1.2.0c b5a1d07 -m "v1.2.0c: routedDsh 真发 + host_fencing + MacBook compose + MagicDNS 命名裂痕修复 + 6+1 host 真接 + 107 gated 真跑" && git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.2.0c` via Clash proxy — b5a1d07 = cross-ref commit = 本周期 boundary commit；v1.2.0a/v1.2.0b 同风格 tag @ 各自起跑点 289e7eb）
   - U8: MacBook worker 真部署（per F15 + runbook — `cd /Users/kjonekong/projects/fish-harness && docker compose -f deploy/macbook-compose.yml up -d`（MacBook 上）；MacBook container `harness-macbook` Up + heartbeat 真发到 newvps worker_pool）
   - U9: 5 edge host 真 provision + ACL sync（per plan §4.5 + F16 — 5 edge host `tailscale set --advertise-tags=tag:edge --hostname=harness-edge[1-5]` + MacBook `tailscale set --advertise-tags=tag:macbook --hostname=kjonemacbook-pro`；Tailscale admin console 显示 7 host（newvps + 5 edge + macbook）全 tag 正确 + ACL push per F16）

---

## §8 复审环境注记（继承 v0.4 §5.3 + v0.6 §5.3 + v0.7 §5.3 + v1.2.0a §8 + v1.2.0b §8 + v1.2.0c §8 NEW 实战校准）

- **tsc**：`cd wrapper && ./node_modules/.bin/tsc --noEmit`（**项目本地 bin 必用**，禁 npx tsc — 会拉假 typosquat 包 exit=0 假绿）
- **vitest**：`cd wrapper && ./node_modules/.bin/vitest run`（**项目本地 bin 必用**，禁 npx --yes vitest — 缺 rolldown binding）
- **typecheck + tests 双 gate**：tsc exit 0 + vitest 0 failed（**v1.2.0c 起草 baseline = v1.2.0b formal PASS 实测** — 引用 v1.2.0b §9 #12 校准值，不复制绝对数字）
- **env-inject**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 仅 env var 注入，不入 commit
- **VAPID 公钥**：`deploy/vapid_public.key` 单文件白名单入库（per v0.6 §4.7 GATE-CALIB）；公钥本为公开分发物 RFC 8292
- **deploy/ sleep infinity 检测**：`grep -rE "sleep infinity" deploy/ | wc -l` == 0（v0.7 §4.5.7 锚定维持）
- **vitest setupFiles 优先模式**（v1.2.0a §7-4）：`test/setup.ts` 在所有 test file 加载前执行（hoist-safe），env var mutation 必须在此层
- **commander 真实现 heuristic fallback 不依赖 DEEPSEEK_API_KEY**（v1.2.0a §7-2）：unit test 默认场景下 plan() 走 heuristic 1-step plan；production env var 注入后才走 dsh 真调
- **集成测试 gated by env var**（v1.2.0a §7-5 + v1.2.0b §8 + v1.2.0c §8 NEW）：`RUN_WORKER_POOL_E2E=1 RUN_SERVER_HEARTBEAT_E2E=1 RUN_CROSS_HOST_E2E=1 RUN_HOST_FENCING_E2E=1 RUN_MACBOOK_E2E=1 DEEPSEEK_API_KEY=<key> ./node_modules/.bin/vitest run test/integration/{worker_pool,server_heartbeat,cross_host_dispatch,host_id_fencing,macbook_worker}.test.ts`
- **better-sqlite3 native build**（v1.2.0b §8 维持）：per F2 `npm install better-sqlite3` 触发 node-gyp native 编译，node:22-alpine 默认无 python3/make/g++；Dockerfile 加 `RUN apk add --no-cache python3 make g++` per F2；or 用 v11+ prebuilt binaries for alpine-x64（v1.2.0b 防御性加 build tools）
- **Dockerfile 例外声明**（v1.2.0b §3.7 NEW 维持）：Dockerfile 修改不破 v1.0 runtime 0 行 diff 守门（§3 第一条 diff 范围排除 Dockerfile；v1.2.0b 是首次 Dockerfile 修改 + 仅 build tools 不影响 v1.0 runtime kernel image）
- **wrapper 镜像 bind mount 部署**（v1.2.0b §8 维持）：per deploy/6host-compose.newvps.yml `..:/app:ro` + command `node build/server.js`，wrapper 走 bind mount 不重建 wrapper image
- **cross-host HTTP 走 Tailscale DERP**（v1.2.0c §8 NEW）：newvps ↔ edge 同 region 优先直连（per Tailscale DERP map）；latency 实测 baseline 后调 timeout；fetch() AbortSignal.timeout 兜底（per F12 + §4.12.3 实战坑）
- **107 gated 真跑**（v1.2.0c §8 NEW per F18）：v1.2.0b 实施链完成后 vitest 191p/0f/107g，107 gated 含 `RUN_WORKER_POOL_E2E=1` (12) + `RUN_SERVER_HEARTBEAT_E2E=1` (10) + `RUN_ORCH_COMMANDER_E2E=1` (15) + `RUN_PACK_PLAN_E2E=1` (15) + NEW `RUN_CROSS_HOST_E2E=1` (~8) + NEW `RUN_HOST_FENCING_E2E=1` (~6) + NEW `RUN_MACBOOK_E2E=1` (~10) = 76 tests；v1.2.0c U4 真机 E2E 全跑 6 env flag 后 107 → 目标 76 gated tests PASS
- **MacBook Tailscale 直连**（v1.2.0c §8 NEW per F15）：MacBook 上跑 colima/Docker Desktop 必须先 `tailscale up --advertise-tags=tag:macbook --hostname=kjonemacbook-pro`（U8 + U9），否则 MagicDNS `kjonemacbook-pro.fish-harness.ts.net` 解析失败
- **host-id fencing partial unique index 行为**（v1.2.0c §8 NEW per F13 + ADR 0009 line 68）：SQLite partial unique index `CREATE UNIQUE INDEX ... ON dispatches(task_id, host_id) WHERE status='active'` 仅 active 状态冲突兜底 — INSERT host_id=A + task_id=X + status='active' OK + INSERT host_id=B + task_id=X + status='active' UNIQUE constraint failed + INSERT host_id=A + task_id=X + status='completed' OK（partial index 不命中）；kernel-side 是 authoritative（per ADR 0007 §2.1），wrapper-side host_fencing.ts 是简化版（per F13 无 cross-DB FK）仅做 fencing 检查 + 抛出错误（不持久化）

---

## §9 v1.2.0c hygiene 自检命令矩阵（用户/Codex 复审必跑）

```bash
# 1. tracked 锚定（v1.2.0c 引用式 v1.2.0a §1.5 主表合计 = 116）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == 116 tracked（v1.2.0a 收口 289e7eb 实测锚定；v1.2.0c 不动 docs/adr/spec/capabilities 主表锚定区域）

# 2. disk 锚定（v1.2.0c 实测 = 128 = 116 tracked + 12 本周期自伤）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0c-v0.1.md | wc -l
# 期望: == 128 disk（v1.2.0c 实测 verbatim 校准 = 128 = 116 tracked + 12 self-injury；NEW §4.12/§4.13/§4.14 grep 不引入 Fable/GLM/MiniMax 字面 — 仅 §1 继承 + §9 cmd 矩阵共 12 self-injury verbatim 校准落定）

# 3. v1.0 runtime 0 行 diff（§3.8 harness/runtime/worker_pool.py + §3.9 spec/kernel-schema.sql + §3.7 Dockerfile 例外声明 — pathspec 排除配套）
git diff v1.0.0..HEAD -- harness/ ':(exclude)harness/runtime/worker_pool.py' spec/kernel-schema.sql ':(exclude)spec/kernel-schema.sql' spikes/ 'adr/000[1-9]-*.md' docker-compose.yml pyproject.toml | wc -l
# 期望: == 0（主 pathspec 排除两例外文件 + 单独 ≥1 例外验证两条 per prompt m2 GATE-CALIB）

# 4. dsh headless profile（v1.2.0c 维持 v1.2.0b 实测）
grep -rE "profile: ['\"]web['\"]|profile=web" wrapper/ | wc -l  # == 0
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l  # ≥ 3

# 5. §3.8 NEW MagicDNS 命名裂痕修复声明（per D5 + F11）
grep -rE "fish-harness\.ts\.net" wrapper/orchestrator/6host_router.ts deploy/tailscale-acl-6host.yaml deploy/tailscale-funnel-6host.yaml deploy/tailscale-serve-harness.yaml deploy/6host-compose.edge1.yml deploy/6host-compose.edge2.yml deploy/6host-compose.edge3.yml deploy/6host-compose.edge4.yml deploy/6host-compose.edge5.yml deploy/6host-compose.newvps.yml deploy/macbook-compose.yml | wc -l  # ≥ 20
grep -rE "tail1b9878\.ts\.net" wrapper/orchestrator/ deploy/ 2>&1 | wc -l  # == 0

# 6. §4.10 v1.2.0a commander 真实现守门维持 + §4.11 v1.2.0b worker 真实现守门维持（引用式 v1.2.0b §9 #6 校准值）
grep -rE "TODO\(M1\)" wrapper/orchestrator/commander.ts | wc -l  # == 0
grep -rE "TODO\(M1\)" wrapper/orchestrator/worker.ts | wc -l  # == 0
grep -cE "WorkflowPack" wrapper/orchestrator/commander.ts  # ≥ 3
grep -cE "ExecutionDriver|worker_pool" wrapper/orchestrator/worker.ts  # ≥ 6

# 7. §4.12 v1.2.0c cross-host 真发守门 16 项 NEW（commit 2 后实测）
grep -cE "fetch.*fish-harness\.ts\.net.*api/v1/tasks" wrapper/orchestrator/6host_router.ts  # ≥ 1
grep -c "callDshHeadless" wrapper/orchestrator/6host_router.ts  # == 0
grep -c "MACBOOK_HOST\|macbook" wrapper/orchestrator/6host_router.ts  # ≥ 4
grep -c "host_id\|hostId" harness/runtime/worker_pool.py spec/kernel-schema.sql | awk -F: '{s+=$NF} END{print s}'  # ≥ 5
grep -rE "CREATE UNIQUE INDEX.*task_id.*host_id" spec/ | wc -l  # ≥ 1
grep -c "host_id" wrapper/orchestrator/host_fencing.ts  # ≥ 5
grep -cE "RUN_CROSS_HOST_E2E|RUN_HOST_FENCING_E2E" wrapper/test/integration/cross_host_dispatch.test.ts wrapper/test/integration/host_id_fencing.test.ts  # ≥ 2
grep -c "kjonemacbook-pro\|macbook\.fish-harness\.ts\.net" deploy/macbook-compose.yml wrapper/orchestrator/6host_router.ts  # ≥ 4
grep -E "type HostId\s*=\s*['\"](newvps|edge[1-5]|macbook)" wrapper/orchestrator/6host_router.ts  # ≥ 1
test -f wrapper/orchestrator/host_fencing.ts  # NEW
test -f wrapper/test/integration/cross_host_dispatch.test.ts  # NEW
test -f wrapper/test/integration/host_id_fencing.test.ts  # NEW
test -f spec/capabilities/macbook.json  # NEW
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/orchestrator/6host_router.ts wrapper/orchestrator/host_fencing.ts wrapper/orchestrator/orchestrator.ts wrapper/orchestrator/worker.ts | wc -l  # == 0

# 8. §4.13 v1.2.0c MacBook worker 守门 12 项 NEW（commit 2 后实测）
test -f deploy/macbook-compose.yml  # NEW
test -f deploy/runbook-macbook-worker.md  # NEW
test -f spec/capabilities/macbook.json  # NEW
grep -c "host_class.*macbook-main\|working_hours" wrapper/orchestrator/worker.ts spec/capabilities/macbook.json | awk -F: '{s+=$NF} END{print s}'  # ≥ 3
grep -c "isWorkingHours\|scoring.*+100\|score.*+.*100" wrapper/orchestrator/orchestrator.ts  # ≥ 2
grep -rE "tag:macbook" deploy/tailscale-acl-6host.yaml | wc -l  # ≥ 3
grep -c "kjonemacbook-pro\|macbook\.fish-harness\.ts\.net" deploy/macbook-compose.yml wrapper/orchestrator/6host_router.ts  # ≥ 4
grep -cE "node:24-slim" deploy/macbook-compose.yml  # ≥ 1
grep -c "WORKER_HOST\|EDGE_REGION.*local-mac\|colima" deploy/macbook-compose.yml  # ≥ 3
grep -c "bind.*Users/kjonekong\|/Users.*projects.*fish-harness" deploy/macbook-compose.yml  # ≥ 2
grep -rE "sleep infinity" deploy/macbook-compose.yml | wc -l  # == 0
test -f wrapper/test/integration/macbook_worker.test.ts  # NEW
grep -c "deepseek-v4-flash" spec/capabilities/macbook.json  # ≥ 1
grep -c "pmset\|disablesleep\|reassign" deploy/runbook-macbook-worker.md deploy/macbook-compose.yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 2

# 9. §4.14 v1.2.0c host-id fencing 守门 8 项 NEW（commit 2 后实测）
grep -cE "host_id|hostId" harness/runtime/worker_pool.py  # ≥ 3
grep -cE "CREATE UNIQUE INDEX.*task_id.*host_id|UNIQUE.*host_id" spec/kernel-schema.sql  # ≥ 1
grep -c "host_id" wrapper/orchestrator/host_fencing.ts  # ≥ 5
test -f wrapper/orchestrator/host_fencing.ts  # NEW
grep -c "function recordDispatch\|export function recordDispatch\|recordDispatch\s*=" wrapper/orchestrator/host_fencing.ts  # ≥ 1
grep -c "function checkFencing\|export function checkFencing\|checkFencing\s*=" wrapper/orchestrator/host_fencing.ts  # ≥ 1
grep -c "class HostIdFencingError\|HostIdFencingError\s*extends" wrapper/orchestrator/host_fencing.ts  # ≥ 1
test -f wrapper/test/integration/host_id_fencing.test.ts  # NEW

# 10. PROJECT_ROOT 路径修法（v0.7 + v1.2.0a + v1.2.0b 锚定维持）
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 4
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd" wrapper/dsh/*.ts | wc -l  # == 0

# 11. dsh binary install 守门（v0.7 + v1.2.0a + v1.2.0b 锚定维持）
test -f deploy/install-dsh.sh
grep -c "set -euo pipefail" deploy/install-dsh.sh  # ≥ 1
grep -c "npm install -g @deepseek-ai/dsh@" deploy/install-dsh.sh  # ≥ 1

# 12. 不硬编码 API key（v0.7 + v1.2.0a + v1.2.0b 锚定维持 + v1.2.0c §2.8 NEW MacBook MagicDNS hostname）
grep -rE "sk-[a-z0-9]{32,}" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l  # == 0
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/ | wc -l  # == 0
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json spec/capabilities/macbook.json | wc -l  # == 0
grep -rE "WORKER_POOL_DB\s*=\s*['\"]/data/" wrapper/orchestrator/worker_pool.ts | wc -l  # 1
grep -rE "kjonemacbook-pro\s*=\s*['\"]?tskey-" deploy/ | wc -l  # == 0

# 13. VAPID 守门（v0.6 + v0.7 + v1.2.0a + v1.2.0b 锚定维持）
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}" wrapper/ deploy/ env/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -c "dsaEncoding.*ieee-p1363" wrapper/dsh/vapid_keys.ts  # ≥ 1
grep -c "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts  # ≥ 1

# 14. server.ts 8 endpoint 守门（v0.7 + v1.2.0a + v1.2.0b 锚定维持）
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)|app\.use\(\s*\(\s*_req" wrapper/server.ts  # ≥ 8

# 15. 5 edge compose 起草守门（v0.7 + v1.2.0a + v1.2.0b + v1.2.0c 锚定维持）
grep -rE "sleep infinity" deploy/ | wc -l  # == 0
grep -rE "harness-edge[1-5]" deploy/ | wc -l  # ≥ 5
grep -rE "tag:harness-edge|tag:macbook" deploy/tailscale-acl-6host.yaml | wc -l  # ≥ 2

# 16. 双 gate（typecheck + tests；v1.2.0c 起草 baseline 引用式 v1.2.0b §9 #12）
cd wrapper && ./node_modules/.bin/tsc --noEmit; echo $?  # 0
./node_modules/.bin/vitest run 2>&1 | grep -E 'Tests ' | tail -1  # v1.2.0b formal 实测值 + v1.2.0c commit 2 增量（≥ 30 unit + 14 gated integration）

# 17. cc-ready.json 翻牌
jq -e '.task_id == "T-V1.2.0C-CROSSHOST-MACBOOK-PASS"' docs/poll/cc-ready.json  # true
```

---

*hygiene audit-scope — v1.2.0c 21 文件改动守门 by-design；继承 v0.7 §1-§9 + v1.2.0a §1-§9 + v1.2.0b §1-§9 + 启用 §3.8 NEW MagicDNS 命名裂痕修复声明 + §3.8.1 tail1b9878.ts.net 残留 == 0 + §3.9 NEW spec/kernel-schema.sql 例外声明 + §4.12 NEW cross-host 真发守门 16 项 + §4.13 NEW MacBook worker 守门 12 项 + §4.14 NEW host-id fencing 守门 8 项 + tracked 锚定 post-v1.2.0c = 引用式 audit-scope §1.5 主表合计（v1.2.0c 引用 v1.2.0a 主表合计 116 + v1.2.0c 增量实测校准，禁公式预测，disk 实测 verbatim 校准 = 116 tracked + 12 自伤 = 128）；v1.2.0c minor tag 路径 = routedDsh 真发 + host_fencing NEW + MacBook compose + MagicDNS 命名裂痕修复 + 6+1 host 真接 + 107 gated 真跑 + 9 user EXEC（v1.2.0b 7 EXEC + 2 = U1-U9）；下一站 v1.2.0c minor tag @ boundary commit b5a1d07（m1 校准 per prompt-review；per Debian stable point release 风格）+ v1.2.0d 防 OOM sub-cycle*

Co-Authored-By: Claude Code <noreply@anthropic.com>