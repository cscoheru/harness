# Codex Audit-scope — v1.2.0b worker 真实现 + heartbeat 真接 worker + SQLite WorkerPool registry + ExecutionDriver 起草 hygiene 守门

> **Date**: 2026-09-04
> **Purpose**: v0.1 升级 = v1.2.0b 周期第二 sub-cycle（worker 真实现 + heartbeat 真接 worker + SQLite WorkerPool registry + ExecutionDriver 真实现 + server.ts handleWorkerHeartbeat 真接 worker.heartbeat() + M4 hygiene fix 合并 commit 2）；v1.2.0b 路径 = `worker.ts` stub → real（8 函数真实现）+ `worker_pool.ts` NEW（better-sqlite3 per-host file + ADR 0007 schema 简化版 + WAL mode per ADR 0009）+ `execution_driver.ts` NEW（subprocess spawn + HTTP fallback per D2）+ `commander.ts:113-114` TODO(v1.2.0b) 替换为真调 `worker_pool.dispatch(task_id)` + `server.ts handleWorkerHeartbeat` 真接 worker + `orchestrator.ts dispatch()` 加 `commander.aggregateResults()` 后调 `worker.run()` 真发 step + `spec/capabilities/worker.json` 校准 `model_id: deepseek-v4-flash` + `wrapper/package.json` 加 `better-sqlite3@^11` + Dockerfile 加 apk add build tools + 4 NEW unit tests + 2 NEW integration tests gated + 4 cc-ready/CHANGELOG/README/hygiene 簿记
> **Why**: 继承 v0.7 §1-§9 + v1.2.0a §1-§9 全套守门（v1.2.0a PASS 0C/3M/4m 同轮清零 289e7eb 已 push）+ 启用 §4.11 NEW worker 真实现守门 — `TODO(M1)` in worker.ts == 0（worker 8 函数 stub 全部清零）+ `ExecutionDriver|worker_pool` refs ≥ 6（worker.ts 真实现深度耦合 worker_pool + ExecutionDriver）+ better-sqlite3 + WAL + busy_timeout ≥ 3（per ADR 0009 single-host WAL 守门）+ `child_process|callDshHeadless` ≥ 3（ExecutionDriver 主路径 dsh spawn）+ `fetch.*api/v1` ≥ 1（HTTP fallback per D2）+ server.ts `worker.heartbeat|worker_pool.heartbeat` ≥ 2（F6 server.ts heartbeat 真接）+ `version="1.2.0b"` ≥ 1（worker.health() 周期版本标记）+ M4 hygiene 合并归入（per D3 commit 2 vi.restoreAllMocks → vi.clearAllMocks）
> **How to apply**: v1.2.0b 14 文件改动守门统一引用本 §1-§9；本文件保留字面 grep pattern 用作后续 Codex 复审 hygiene anchor

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类，继承 v0.7 §1 + v1.2.0a §1）

```bash
# v1.2.0b 升级前向交付物（CHANGELOG + README + spec/capabilities/worker.json 校准）不锁型号：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md spec/capabilities/worker.json | wc -l
# 期望: 0 行

# 历史文档豁免口径锚定（tracked 锚定 post-v1.2.0a = 引用式本节）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == audit-scope §1.5 主表合计（v1.2.0a formal PASS 实测 = **引用 v1.2.0a §1.5 主表合计**；v1.2.0b 不预测新数字，引用 v1.2.0a 锚定）

# 历史文档豁免口径锚定（disk 口径 == tracked + 本 audit-scope 自伤）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0b-v0.1.md | wc -l
# 期望: == audit-scope §1.5 主表 disk 行（**v1.2.0b 实测 129 = 116 tracked + 13 本周期自伤**；m2 GATE-CALIB：起草时误引 v1.2.0a 127 — 自伤源随周期切换，引用式须重跑换算）

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.2.0b-v0.1.md | wc -l
# 期望: == 自伤实测 13（v1.2.0b 起草预估 ≥ 11 已按实测校准落定）

# wrapper/orchestrator/ 不锁型号守门（继承 v1.2.0a §1 NEW — worker/commander 真实现绝不锁型号）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l
# 期望: 0 行
```

**含义**：v1.2.0b 周期模型决策遵守 NORTH-STAR A-4 等价类约束；v1.2.0b 前向交付物（CHANGELOG + README + spec/capabilities/worker.json 校准）均不含具体型号字面；worker 真实现守门在 wrapper/orchestrator/ 内额外加锁（绝不含 Fable 5/GLM 5.3/MiniMax-M3 字面 — 即使在 worker.ts / worker_pool.ts / execution_driver.ts 新代码中也守）。

### §1.5 v1.2.0b 升级范围（14 文件改动；tracked 锚定 post-v1.2.0b = 引用式本节 + v1.2.0a §1.5 主表唯一权威源）

| # | 文件 | 操作 | docs/ 命中增量 | 自伤豁免 |
|---|------|------|----------------|----------|
| 1 | `wrapper/orchestrator/worker.ts` | **REWRITE** ~280 行（8 函数 stub → real：capability / run / interrupt / heartbeat / health / register / drain / getTaskStatus + ExecutionDriver.run() + WorkerPool.heartbeat() 集成 + spec/capabilities/worker.json 读 + ADR 0007 schema 实现）| 0 | wrapper/ 不入主合同 |
| 2 | `wrapper/orchestrator/worker_pool.ts` | **NEW** ~220 行（better-sqlite3 per-host file + WAL mode + busy_timeout=5000 per ADR 0009 + ADR 0007 schema 简化版 [无 current_attempt_id FK per F3] + 6 methods: register / dispatch / heartbeat / drain / reap_stale / claim_via_pool）| 0 | wrapper/ 不入主合同 |
| 3 | `wrapper/orchestrator/execution_driver.ts` | **NEW** ~200 行（subprocess spawn via `child_process.spawn('dsh --profile headless ...')` 主路径 + `fetch(DSH_HTTP_URL + '/api/v1/tasks', POST)` HTTP fallback per D2 + yield `DriverEvent` stream [driver.started → output_chunk ×N → heartbeat ×N → finished] + `interrupt()` SIGTERM + AbortController.abort() + 复用 dsh_client.ts:137-162 spawn pattern per F4）| 0 | wrapper/ 不入主合同 |
| 4 | `wrapper/orchestrator/commander.ts` | Edit（`commander.ts:113-114` TODO(v1.2.0b) 替换为真调 `worker_pool.dispatch(task_id)` 拿真实 worker_id 写 PlanStep.worker_id per F5；dispatchStep 不再用 synthetic `stub-worker-${taskId}-${stepName}` stub）| 0 | wrapper/ 不入主合同 |
| 5 | `wrapper/orchestrator/server.ts` | Edit（`handleWorkerHeartbeat` L154-158 PURE STUB 改造为真接 `worker.heartbeat()` + `worker_pool.heartbeat()` SQLite 持久化 per F6；接收 body `{worker_id, capabilities_json}` schema validation [worker_id 非空 + capabilities_json ≤10KB] + reject extra fields；返回 `{worker_id, status, last_heartbeat_at}`）| 0 | wrapper/ 不入主合同 |
| 6 | `wrapper/orchestrator/orchestrator.ts` | Edit（`dispatch()` 在 `commander.aggregateResults()` 后调 `worker.run()` 真发 step per F5 + plan §3.3 #2；保留 backward-compat kernel + dsh 调用）| 0 | wrapper/ 不入主合同 |
| 7 | `wrapper/package.json` | Edit（加 `better-sqlite3@^11` dep per F1 + newvps `npm install` 触发 fetch + native build）| 0 | wrapper/ 不入主合同 |
| 8 | `Dockerfile` | Edit（加 `RUN apk add --no-cache python3 make g++` per F2 — node:22-alpine 默认无 python3/make/g++，better-sqlite3 native build 必备）| 0 | Dockerfile 入主合同（v1.2.0a §3 维持 `v1.0.0..HEAD -- Dockerfile == 0`；v1.2.0b **新增** Dockerfile build tools 行 — §3 v1.0.0..HEAD diff 增量需实测校准） |
| 9 | `wrapper/test/unit/worker.test.ts` | **REWRITE** ~50 tests（30+ stub shape → real shape：capability from spec/capabilities/worker.json + heartbeat from worker_pool + run via ExecutionDriver DriverEvent stream + interrupt SIGTERM + register worker_pool INSERT + drain UPDATE + getTaskStatus query SQLite per F8）| 0 | wrapper/ 不入主合同 |
| 10 | `wrapper/test/unit/worker_pool.test.ts` | **NEW** ~30 tests（SQLite 持久化 + 6 methods + WAL mode + busy_timeout + reap_stale 过期 worker 清理 + claim_via_pool capability matching）| 0 | wrapper/ 不入主合同 |
| 11 | `wrapper/test/unit/execution_driver.test.ts` | **NEW** ~20 tests（DriverEvent stream 流式输出 + interrupt AbortController + spawn timeout fallback + HTTP fallback stub per D2）| 0 | wrapper/ 不入主合同 |
| 12 | `wrapper/test/integration/worker_pool.test.ts` | **NEW** ~12 tests（register → heartbeat → dispatch → drain flow；gated by `RUN_WORKER_POOL_E2E=1` per F10）| 0 | wrapper/ 不入主合同 |
| 13 | `wrapper/test/integration/server_heartbeat.test.ts` | **NEW** ~10 tests（HTTP POST `/api/v1/worker/heartbeat` → worker.heartbeat() → SQLite 持久化；gated by `RUN_SERVER_HEARTBEAT_E2E=1`；替换 `server_integration.test.ts:49-55` stub assertion per F7）| 0 | wrapper/ 不入主合同 |
| 14 | `wrapper/test/integration/{orch_commander,pack_plan}.test.ts` | Edit（M4 fix per D3：`vi.restoreAllMocks()` → `vi.clearAllMocks()` in afterEach per F10 — vi.restoreAllMocks 破坏 vi.mock factory 而 vi.clearAllMocks 仅清状态保 factory）| 0 | wrapper/ 不入主合同 |
| 15 | `spec/capabilities/worker.json` | Edit（`model_id: deepseek-chat` → `deepseek-v4-flash` per F9 + 加 `evidence_uri: spec/capabilities/worker.json` 字段；与 docs/m0b/profile-override-worker.yaml M2 校准对齐）| 0 | spec/capabilities/ 入主合同 |
| 16 | `notes/codex-audit-scope-v1.2.0b-v0.1.md` | **NEW**（本文件）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 17 | `notes/codex-audit-scope-v1.2.0b-v0.1-prompt.md` | **NEW**（配套 Codex 复审 prompt）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 18 | `docs/poll/cc-ready.json` | Edit（task_id `T-V1.2.0A-COMMANDER-PASS` → `T-V1.2.0B-WORKER-PASS`；status 翻牌；files_modified 含 v1.2.0b 14 文件 + M4 fix 归入）| 0 | docs/ 入主合同（实测 = 0）|
| 19 | `CHANGELOG.md` | Edit（[1.2.0b] minor 段新增；含 worker 真实现 PASS marker + worker_pool + execution_driver 真实现 + server.ts heartbeat 真接 + M4 hygiene 归 v1.2.0b + D1/D2/D3 决策记档）| 0 | grep 字面 0 行 |
| 20 | `README.md` | Edit（v1.2.0b status 段补；含 better-sqlite3 per-host + ExecutionDriver both + M4 hygiene + 7 user EXEC + v1.2.0c 后续 sub-cycle 预告）| 0 | grep 字面 0 行 |

**v1.2.0b 升级总改动：20 文件**（6 wrapper/orchestrator/ 代码 [worker/worker_pool/execution_driver/commander/server/orchestrator] + 6 wrapper/test/ tests [worker REWRITE + worker_pool NEW + execution_driver NEW + integration worker_pool NEW + server_heartbeat NEW + 2 integration M4 fix] + 1 wrapper/package.json + 1 Dockerfile + 1 spec/capabilities/worker.json + 2 notes/ v1.2.0b audit-scope/prompt + 3 docs/ cc-ready + CHANGELOG + README）。

**docs 主表**（继承 v0.7 §1.5 #1-#55 + v1.2.0a §1.5 主表合计；v1.2.0b 增量实测 = **引用 v1.2.0a §1.5 主表合计（v1.2.0a 收口 289e7eb 实测锚定）**；v1.2.0b 不动 docs/adr/ 主表锚定区域，仅改 spec/capabilities/worker.json + Dockerfile + CHANGELOG + README + cc-ready 5 个 docs/spec 入口；演进链 91→97→101→103→107→114→117→116→(v1.2.0b 实测校准)，禁公式预测，以实测为准）。

**v1.2.0b 实测公式**（post-Commit 1-3 实测落地，引用式唯一权威源 + v1.2.0a §1.5 主表合计）：

```bash
# tracked 验收命令（git add 所有 v1.2.0b 文件后）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# v1.2.0b 实测: 引用 v1.2.0a §1.5 主表合计（v1.2.0a 收口 289e7eb 实测 = 116 tracked；v1.2.0b 增量实测按 audit-scope §1.5 主表新增条目校准）

# disk 验收命令
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0b-v0.1.md | wc -l
# v1.2.0b 实测: **129 disk = 116 tracked + 13 本周期自伤**（m2 GATE-CALIB per v1.2.0b formal：起草误引 v1.2.0a 127（116+11）未换算自伤源切换 — v0.5「disk 口径首用即裂」同型复发，引用式 ≠ 免实测）
```

**v1.2.0b 主表新增条目**（v1.2.0b 增量实测；引用式不复制数字）：
- 🆕 v1.2.0b audit-scope 自伤实测行数（notes/ 自伤豁免不入 tracked + 仅本文件计入 disk）
- v1.2.0b 14 文件改动中 wrapper 12 文件 + 1 Dockerfile + 1 spec/capabilities/worker.json + 2 notes/ + 3 docs/ = 20 文件；spec/capabilities/worker.json 是 v1.2.0b 唯一 spec/capabilities 改动入口（model_id 校准 + evidence_uri 新增）
- v0.7 audit-scope + v1.2.0a audit-scope 文件归档不再计入 disk（per v0.7 §1.5 + v1.2.0a §1.5 GATE-CALIB "换源不累加机制"）

**豁免口径不变**（per M0b plan §3 L89 C2 裁定 + v0.5 §1.5 末段 + v0.6 §1.5 末段 + v0.7 §1.5 末段 + v1.2.0a §1.5 末段）：**不清洗历史文档**（考古记录 + git 尾注 + DISPATCH §2/§4 验证命令字面均保留）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训，继承 v0.7 §2 + v1.2.0a §2）

```bash
# v1.2.0b 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json wrapper/orchestrator/ | wc -l
# 期望: 0 行

# wrapper/orchestrator/ 不硬编码 API key 守门（继承 v1.2.0a §2.5 — worker 真实现 + worker_pool + execution_driver 绝不写死 key）：
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/ | wc -l
# 期望: 0 行

# 仅 env-inject only 占位（合规 — execution_driver.ts 调 dsh via DEEPSEEK_API_KEY env-inject + worker_pool.ts 调 better-sqlite3 不需 key）：
grep -rE "env-inject only|env:[A-Z_]+|process\.env\.[A-Z_]+|\\\$\{?[A-Z_]+\}?" wrapper/orchestrator/worker.ts wrapper/orchestrator/worker_pool.ts wrapper/orchestrator/execution_driver.ts | wc -l
# 期望: ≥ 1（execution_driver.ts 调 dsh via DEEPSEEK_API_KEY env-inject；worker.ts 仅 env var 读取）

# VAPID 私钥守门（继承 v0.7 §2 + §4.7 + v1.2.0a §2）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/orchestrator/ workflow_packs/ CHANGELOG.md README.md | wc -l
# 期望: 0 行（VAPID 私钥仅 env-inject；worker 真实现不涉及 VAPID — 守）

# Tailscale auth key 守门（继承 v0.7 §2.6 + v1.2.0a §2）：
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json | wc -l
# 期望: 0 行（Tailscale auth key 仅 env-inject；v1.2.0b 不引入 deploy 改动）

# better-sqlite3 path 不硬编码（继承 v1.2.0b NEW §2.7 — worker_pool.ts 路径应从 env 或默认 /data/worker_pool.db）：
grep -rE "WORKER_POOL_DB\s*=\s*['\"]/data/" wrapper/orchestrator/worker_pool.ts | wc -l
# 期望: 1 行（默认路径占位 + env override 优先）
```

**含义**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 等敏感 key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；v1.2.0b §2.7 NEW `wrapper/orchestrator/worker_pool.ts` SQLite DB path 不硬编码绝对路径占位（默认 `/data/worker_pool.db` 经 env override）。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)，继承 v0.7 §3 + v1.2.0a §3）

```bash
# v1.2.0b 升级 v1.0 runtime 区域净 diff（commit v1.0.0 tag 后 0 漂移 + v1.2.0b §3.7 NEW Dockerfile 加 apk add 例外声明）：
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行（v1.2.0b 起草实测 = 0；Dockerfile 不在 §3 第一条 diff 范围 — §3.7 例外声明）

# v1.2.0b §3.7 NEW Dockerfile 例外声明（v1.2.0b 是首次 Dockerfile 修改 — 加 build tools 不影响 v1.0 runtime kernel image，因为 Dockerfile 实际只 build Python kernel image；wrapper 镜像走 bind mount 部署 per deploy/6host-compose.newvps.yml）：
git diff v1.0.0..HEAD -- Dockerfile | wc -l
# 期望: ≥ 1 行（v1.2.0b Dockerfile + `RUN apk add --no-cache python3 make g++`）；v1.2.0b §3.7 NEW 例外声明：Dockerfile 修改不破 v1.0 runtime 0 行 diff 守门（per ADR 0010 Decision (d) v1.0 runtime 限定为 harness/ + spec/kernel-schema.sql + spikes/ + 9 ADR body + docker-compose.yml + pyproject.toml）

# v1.0 GA plan + 9 ADR body 不动（v1.0 runtime 9 ADR immutable per T-DD-6）：
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0 行

# ADR 0011 closure 合规（继承 v0.7 §3.3 + v1.2.0a §3）：
grep -c "Status=" adr/0011-v1.1-cycle-closure.md
# 期望: ≥ 1（Status=Accepted）

# v1.0 runtime deploy/ 范围确认（继承 v0.7 §3.5 + v1.2.0a §3 — v1.2.0b 不动 deploy/，守门仍生效）：
ls -la deploy/ 2>/dev/null
# 期望: deploy/ 目录存在（M2 实施包 9 文件 + v0.7 升级 11 文件），但不在 §3 第一条 diff 范围（per ADR 0010 Decision (d)）

# wrapper/ v1.0 影响守门（继承 v0.7 §3.4 + v1.2.0a §3 + v1.2.0b §3.7 NEW 增量）：
git diff v1.0.0..HEAD -- wrapper/ | wc -l
# 期望: v1.2.0b = v0.7 +8 文件增量 + v1.2.0a +11 wrapper 文件增量 + v1.2.0b +12 wrapper 文件增量（6 wrapper/orchestrator/ + 6 wrapper/test/）

# v1.2.0b §3.7 Dockerfile 例外声明（NEW）：Dockerfile 修改不破 v1.0 runtime 守门 — Dockerfile 当前只 build Python kernel image（harness/kernel/），wrapper 走 bind mount 部署；apk add python3 make g++ 仅用于 future wrapper image build（v1.2.0b 通过 npm install better-sqlite3 触发 native build 时需要，但当前 wrapper 部署走 `..:/app:ro` 不 rebuild wrapper image）；§3 第一条 diff 范围仍排除 Dockerfile 维持 0 行
```

**含义**：v1.2.0b 升级 20 文件改动中 wrapper 12 文件 + 1 Dockerfile + 1 spec/capabilities/worker.json + 2 notes/ + 3 docs/ + 1 package.json = 20 文件；不触及 harness/spec/spikes/9 ADR body/ADR 0010/docker-compose.yml/pyproject.toml/v1.0 GA plan；worker 真实现（worker.ts 8 函数 stub → real）+ worker_pool NEW + execution_driver NEW + server.ts handleWorkerHeartbeat 真接 + M4 hygiene fix 归 commit 2 + spec/capabilities/worker.json 校准 + Dockerfile 加 build tools（§3.7 NEW 例外声明）+ 6 测试/簿记文件全在 wrapper/ + spec/capabilities/ + Dockerfile + docs/ + notes/ 范围内。

## §4 dsh `headless` profile 守门（M1c TG-1 + M2 BE-1 预备，继承 v0.7 §4 + v1.2.0a §4）

```bash
# M1c wrapper 实调 dsh 必须用 headless profile（per M0b QA-1 §6.X 修订）：
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# 期望: 0 行（v1.2.0b 起草实测 = 0；execution_driver.ts NEW 调 dsh via headless profile 守）

# 期望出现 headless profile（M0c skeleton + M1c 实施 + v0.7 server.ts 集成 + v1.2.0a commander 真实现 + v1.2.0b execution_driver 真实现）：
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# 期望: ≥ 3（v1.2.0b 起草预估 ≥ v1.2.0a 实测 19 + execution_driver.ts NEW 增量）

# ExecutionDriver dsh 调用守门（v1.2.0b NEW §4 前置 — execution_driver.ts 主路径走 dsh spawn）：
grep -cE "child_process|callDshHeadless" wrapper/orchestrator/execution_driver.ts wrapper/orchestrator/worker.ts
# 期望: ≥ 3（execution_driver.ts 至少 3 处：import { spawn } + callDshHeadless import from dsh_client + spawn 调用；v1.2.0b 起草预估 = ≥ 3）

# HTTP fallback 守门（v1.2.0b NEW §4 — D2 决策 execution_driver 备用路径 fetch 到 dsh binary HTTP endpoint）：
grep -cE "fetch.*api/v1" wrapper/orchestrator/execution_driver.ts
# 期望: ≥ 1（HTTP fallback stub per D2 — 当前 dsh 不暴露 HTTP，stub 预留接口；v1.2.0b 起草预估 = ≥ 1）

# heuristic fallback 维持（v1.2.0a §4 — worker 真实现不破坏 commander heuristic fallback）：
grep -cE "plan_metadata.*source|heuristic" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 4（v1.2.0a formal 校准实测 ≥ 4 maintained；v1.2.0b 不动 commander 真实现）

# commander 真实现 dsh 调用守门（v1.2.0a §4 维持 — v1.2.0b 不破坏）：
grep -cE "callDshHeadless|dshInvoke" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 2（v1.2.0a formal 校准实测 2 maintained；m3 GATE-CALIB：v1.2.0b 抄写多套尾部 `| wc -l` 使输出恒 1 — 假门已去）
```

## §4.5 M2 多 host 守门正式启用（多 host 拓扑漂移风险；继承 v0.7 §4.5 + v1.2.0a §4.5）

```bash
# M2 6 host 拓扑：1 newvps 主 + 5 边缘 host（east-1/west-1/asia-1/eu-1/sa-1）
# 容器 IP 不锁守门（继承 v0.7 §4.5 GATE-CALIB 校准：命令范围排除 node_modules）：
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md | grep -v "127.0.0.1" | wc -l
# 期望: 0 行（v1.2.0b 起草实测 = 0；execution_driver.ts HTTP fallback 用 MagicDNS host 不锁 IP）

# Tailscale MagicDNS 域名使用守门（继承 v0.7 §4.5 + v1.2.0a §4.5 — v1.2.0b 不动 deploy/，仍守）：
grep -rE "ts\.net" deploy/ | wc -l
# 期望: ≥ 6（newvps + 5 edge host MagicDNS 名；v1.2.0b 不动 deploy/，守门维持）

# 边缘 host 健康端点 + Funnel URL（继承 v0.7 §4.5 + v1.2.0a §4.5 — v1.2.0b 不动 docs/，仍守）：
grep -rE "https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/" docs/ deploy/ | wc -l
# 期望: ≥ 6（v1.2.0b 不动 docs/，守门维持）

# 5 edge compose 起草守门（继承 v0.7 §4.5.7 + v1.2.0a §4.5 — v1.2.0b 不动 deploy/，仍守）：
grep -rE "sleep infinity" deploy/ | wc -l  # == 0
grep -rE "harness-edge[1-5]" deploy/ | wc -l  # ≥ 5
grep -rE "tag:harness-edge" deploy/tailscale-acl.yaml | wc -l  # ≥ 1
```

**含义**：v1.2.0b 不动 deploy/，§4.5 全部守门 v0.7 + v1.2.0a 锚定维持；worker 真实现 + worker_pool + execution_driver + server.ts handleWorkerHeartbeat 暂未引入新 host 拓扑（v1.2.0c 才上 6 host routedDsh 真发 + MacBook Worker 接入）；§4.5.7 5 edge compose 起草守门 = v0.7 + v1.2.0a 锚定的强信号。

## §4.6 M2 STT 守门正式启用（音频隐私；继承 v0.7 §4.6 + v1.2.0a §4.6）

```bash
# M2 STT 录音不留盘守门（继承 v0.7 §4.6 + v1.2.0a §4.6）：
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ env/ | wc -l
# 期望: 0 行（v1.2.0b 不动 STT；worker 真实现不引入音频处理）

# 临时缓存目录路径合规守门（继承 v0.7 §4.6 + v1.2.0a §4.6）：
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
# 期望: 0 行

# Whisper 模型缓存目录合规守门（继承 v0.7 §4.6 + v1.2.0a §4.6）：
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l
# 期望: 0 行
```

## §4.7 M2 Web Push 守门正式启用（VAPID key 泄漏；继承 v0.7 §4.7 + v1.2.0a §4.7）

```bash
# VAPID 私钥不入 commit 守门（继承 v0.7 §4.7 + §2 + v1.2.0a §4.7）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l
# 期望: 0 行

# VAPID 公钥 env-inject-only 合规（继承 v0.7 §4.7 GATE-CALIB + v1.2.0a §4.7）：
grep -rE "vapid_public_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PUBLIC\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" deploy/ env/ | wc -l
# 期望: == 0

# Web Push 端点合规守门（继承 v0.7 §4.7 + v1.2.0a §4.7）：
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ | wc -l
# 期望: ≥ 4（v1.2.0b 不动 Web Push）

# M3-EXEC-3 stub 替换守门（继承 v0.7 §4.7.5 + v1.2.0a §4.7）：
grep -rE "hmacSha256\s*\(\s*signingInput" wrapper/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -rE "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1
grep -rE "dsaEncoding\s*:\s*['\"]ieee-p1363['\"]" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1

# server.ts 8 endpoint 守门（继承 v0.7 §4.7.6 + v1.2.0a §4.7 — v1.2.0b 升级 server.ts handleWorkerHeartbeat 但 endpoint 路径不变）：
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)|app\.use\(\s*\(\s*_req" wrapper/server.ts
# 期望: ≥ 8（v1.2.0b 不增减 endpoint，handler 内部真接 worker 真实现；v1.2.0a 起草实测 = 8 maintained）

# v1.2.0b §4.7.7 NEW server.ts handleWorkerHeartbeat 真接 worker.heartbeat() 守门（F6）：
grep -cE "worker\.heartbeat|worker_pool\.heartbeat" wrapper/server.ts
# 期望: ≥ 2（handleWorkerHeartbeat handler 内部调 worker.heartbeat() + worker_pool.heartbeat() SQLite 持久化；v1.2.0b 起草预估 = ≥ 2）
```

## §4.8 PROJECT_ROOT 路径 bug 修法守门（继承 v0.7 §4.8 + v1.2.0a §4.8）

```bash
# PROJECT_ROOT import.meta.url 修法 4 文件守门（继承 v0.7 §4.8 + v1.2.0a §4.8）：
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l
# 期望: ≥ 4（v0.7 实测 8 = 4 文件 × src/build conditional 双路径 per D-5；v1.2.0b 维持）

# 原 process.cwd() + '..' 残留守门（继承 v0.7 §4.8 + v1.2.0a §4.8）：
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/*.ts | wc -l
# 期望: == 0

# 函数内 process.cwd() + '..' 局部变量残留守门（继承 v0.7 §4.8 + v1.2.0a §4.8）：
grep -E "projectRoot\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l
# 期望: == 0

# wrapper/orchestrator/ 同样守 import.meta.url 优先模式（v1.2.0a §4.8 NEW — v1.2.0b §4.8.5 NEW 扩展到 worker_pool + execution_driver）：
grep -E "import.meta.url" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts wrapper/orchestrator/worker.ts wrapper/orchestrator/worker_pool.ts wrapper/orchestrator/execution_driver.ts | wc -l
# 期望: ≥ 2（workflow_pack.ts 已含 import.meta.url per v1.2.0a；worker.ts 不需项目根访问；worker_pool.ts SQLite path 不需 import.meta.url（绝对路径或 env override）；execution_driver.ts dsh_client.ts import 路径相对解析；v1.2.0b 起草预估 = ≥ 2 maintained）
```

## §4.9 dsh binary install 守门（继承 v0.7 §4.9 + v1.2.0a §4.9）

```bash
# install-dsh.sh 脚本必含 npm 版三核心守卫（继承 v0.7 §4.9 + v1.2.0a §4.9 — v1.2.0b 不动 install-dsh.sh）：
test -f deploy/install-dsh.sh
grep -cF 'DSH_VERSION:-' deploy/install-dsh.sh  # ≥ 1
grep -cF 'if [[ -z "${DSH_VERSION}" ]]' deploy/install-dsh.sh  # ≥ 1
grep -c "set -euo pipefail" deploy/install-dsh.sh  # ≥ 1
grep -c "npm install -g @deepseek-ai/dsh@" deploy/install-dsh.sh  # ≥ 1

# install-dsh.sh 不含硬编码下载 URL（维持，双渠道皆禁）：
grep -E "https://github\.com/.*dsh.*releases/download" deploy/install-dsh.sh | wc -l  # == 0
grep -cE "dsh@latest|@deepseek-ai/dsh@latest" deploy/install-dsh.sh  # == 0

# dsh version 锁定守门（维持）：
grep -E "DSH_VERSION=" deploy/install-dsh.sh | wc -l  # ≥ 1
```

## §4.10 v1.2.0a commander 真实现守门（继承 v1.2.0a §4.10 — v1.2.0b 不动 commander 真实现）

```bash
# v1.2.0a §4.10 14 项 commander 真实现守门维持（v1.2.0a PASS 0C/3M/4m 收口 289e7eb 实测；v1.2.0b 不预测新数字）：
grep -rE "TODO\(M1\)" wrapper/orchestrator/commander.ts | wc -l  # == 0（v1.2.0a 实测）
grep -c "WorkflowPack" wrapper/orchestrator/commander.ts  # ≥ 3（v1.2.0a 实测 = 3）
grep -cE "PlanPlan|PlanStep" wrapper/orchestrator/commander.ts  # ≥ 4（v1.2.0a 实测 = 10）
grep -c "AggregateError" wrapper/orchestrator/commander.ts  # ≥ 2（v1.2.0a 实测 = 5）
grep -cE "commander\.(planStep|dispatchStep|aggregateResults)" wrapper/orchestrator/orchestrator.ts  # ≥ 3（v1.2.0a 实测 = 7）
grep -cE "completed_steps|failed_steps|pending_steps" wrapper/orchestrator/commander.ts wrapper/orchestrator/types.ts  # ≥ 4
test -f wrapper/orchestrator/workflow_pack.ts  # NEW
test -f workflow_packs/default.json  # NEW
grep -c "loadManifest" wrapper/orchestrator/workflow_pack.ts  # ≥ 1
grep -c "heuristic" wrapper/orchestrator/workflow_pack.ts  # ≥ 2（v1.2.0a formal 校准）
grep -E "version.*1\.2\.0a|1\.2\.0a" wrapper/orchestrator/commander.ts | wc -l  # ≥ 1
grep -cE "plan_steps|plan_source" wrapper/orchestrator/orchestrator.ts  # ≥ 2
grep -cE "RUN_ORCH_COMMANDER_E2E|RUN_PACK_PLAN_E2E" wrapper/test/integration/orch_commander.test.ts wrapper/test/integration/pack_plan.test.ts  # ≥ 2
grep -c "describe\|it(" wrapper/test/unit/commander.test.ts wrapper/test/unit/workflow_pack.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 25

# v1.2.0b NEW §4.10.5 commander.ts:113-114 TODO(v1.2.0b) 替换为真调 worker_pool.dispatch(task_id)（per F5）：
grep -rE "TODO\(v1\.2\.0b\)" wrapper/orchestrator/commander.ts | wc -l
# 期望: == 0（commander.ts:113-114 TODO(v1.2.0b) marker 替换为真调 worker_pool.dispatch；v1.2.0b 起草预估 = ≥ 1 → 替换后 == 0）

# v1.2.0b NEW §4.10.6 commander.ts dispatchStep 不再用 synthetic stub-worker 守门（per F5 + plan §3.3 #2）：
grep -rE "stub-worker-\\\$\\{taskId\\}" wrapper/orchestrator/commander.ts | wc -l
# 期望: == 0（v1.2.0a 暂用 synthetic stub；v1.2.0b 替换为真调 worker_pool.dispatch 拿真实 worker_id）
```

## §4.11 v1.2.0b worker 真实现守门（v1.2.0b NEW — PRD §3 L102-104 + A-1/A-2/A-3 三层架构抽象铁律 + ADR 0007 + ADR 0009 + D1/D2/D3 决策）

```bash
# TODO(M1) stub 清零守门（v1.2.0b NEW — worker 8 函数 stub 全部真实现）：
grep -rE "TODO\(M1\)" wrapper/orchestrator/worker.ts | wc -l
# 期望: == 0 行（v1.2.0b 起草预估 = 8 → 替换后 == 0）

# TODO(M1) wrapper/orchestrator/ 全局清零守门（v1.2.0b NEW — 配合 v1.2.0b worker 真实现收口）：
grep -rE "TODO\(M1\)" wrapper/orchestrator/ | wc -l
# 期望: == 0 行（v1.2.0a formal 校准 16 = worker.ts 16 处 TODO(M1) 保留系 v1.2.0b 范围；v1.2.0b 替换后 == 0）

# ExecutionDriver + worker_pool integration 守门（v1.2.0b NEW — worker.ts 真实现深度耦合 worker_pool + ExecutionDriver）：
grep -cE "ExecutionDriver|worker_pool" wrapper/orchestrator/worker.ts
# 期望: ≥ 6 行（import ExecutionDriver + import worker_pool + run() 调 ExecutionDriver.run() + heartbeat() 调 worker_pool.heartbeat() + register() 调 worker_pool.register() + drain() 调 worker_pool.drain() + getTaskStatus() query SQLite；v1.2.0b 起草预估 = ≥ 6）

# worker_pool SQLite 持久化守门（v1.2.0b NEW §4.11 — D1 better-sqlite3 per-host file per ADR 0009）：
grep -c "better-sqlite3\|Database" wrapper/orchestrator/worker_pool.ts
# 期望: ≥ 4 行（import Database from 'better-sqlite3' + new Database() + INSERT workers + UPDATE workers SET status + SELECT workers WHERE worker_id；v1.2.0b 起草预估 = ≥ 4）

# WAL mode + busy_timeout 守门（v1.2.0b NEW §4.11 — per ADR 0009 single-host WAL constraint）：
grep -c "WAL\|busy_timeout\|journal_mode" wrapper/orchestrator/worker_pool.ts
# 期望: ≥ 3 行（db.pragma('journal_mode = WAL') + db.pragma('busy_timeout = 5000') + WAL 字面注释；v1.2.0b 起草预估 = ≥ 3）

# ExecutionDriver subprocess spawn + HTTP fallback 守门（v1.2.0b NEW §4.11 — D2 both 模型 per F4 + D2）：
grep -c "child_process\|callDshHeadless" wrapper/orchestrator/execution_driver.ts
# 期望: ≥ 3 行（import { spawn } from 'child_process' + import { callDshHeadless } from '../dsh/dsh_client.js' + spawn() 或 callDshHeadless() 调用 + HTTP fallback fetch() stub；v1.2.0b 起草预估 = ≥ 3）

grep -cE "fetch.*api/v1" wrapper/orchestrator/execution_driver.ts
# 期望: ≥ 1 行（HTTP fallback stub per D2 — 当前 dsh 不暴露 HTTP，stub 预留接口；v1.2.0b 起草预估 = ≥ 1）

# server.ts handleWorkerHeartbeat 真接 worker.heartbeat() 守门（v1.2.0b NEW §4.11 — F6 PURE STUB 改造）：
grep -cE "worker\.heartbeat|worker_pool\.heartbeat" wrapper/server.ts
# 期望: ≥ 2 行（handleWorkerHeartbeat handler 内部调 worker.heartbeat() + worker_pool.heartbeat() SQLite 持久化；v1.2.0b 起草预估 = ≥ 2）

# hygiene 净守门（v1.2.0b NEW §4.11 — worker 真实现 + worker_pool + execution_driver 绝不硬编码 key）：
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/orchestrator/worker.ts wrapper/orchestrator/worker_pool.ts wrapper/orchestrator/execution_driver.ts | wc -l
# 期望: 0 行（worker 真实现不引入 VAPID，不硬编码 DEEPSEEK key — 守）

grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l
# 期望: 0 行（继承 v1.2.0a §1 — wrapper/orchestrator/ 不锁型号；v1.2.0b worker.ts / worker_pool.ts / execution_driver.ts 0 字面）

# worker.health() version="1.2.0b" 守门（v1.2.0b NEW §4.11 — 周期版本标记）：
grep -E "version.*1\.2\.0b|1\.2\.0b" wrapper/orchestrator/worker.ts | wc -l
# 期望: ≥ 1 行（worker.health() 返回周期版本号 '1.2.0b'；v1.2.0b 起草预估 = ≥ 1）

# spec/capabilities/worker.json model_id 校准守门（v1.2.0b NEW §4.11 — F9）：
grep -c "deepseek-v4-flash" spec/capabilities/worker.json
# 期望: ≥ 1 行（model_id 从 deepseek-chat 改为 deepseek-v4-flash per profile yaml M2 校准；v1.2.0b 起草预估 = ≥ 1）

# 单测增量守门（v1.2.0b NEW §4.11 — 50 + 30 + 20 = 100 单测覆盖 worker + worker_pool + execution_driver 真实现）：
grep -c "describe\|it(" wrapper/test/unit/worker.test.ts wrapper/test/unit/worker_pool.test.ts wrapper/test/unit/execution_driver.test.ts | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 40（v1.2.0b 起草预估 worker REWRITE 50 + worker_pool NEW 30 + execution_driver NEW 20 = 100 单测；formal 实测按 git diff 校准）

# 集成测试 gated 守门（v1.2.0b NEW §4.11 — 2 NEW integration tests gated by env var）：
grep -cE "RUN_WORKER_POOL_E2E|RUN_SERVER_HEARTBEAT_E2E" wrapper/test/integration/worker_pool.test.ts wrapper/test/integration/server_heartbeat.test.ts
# 期望: ≥ 2 行（gated by env var 守门；v1.2.0b 起草预估 = 2）

# worker_pool.ts + execution_driver.ts 文件存在守门（v1.2.0b NEW §4.11 — 2 NEW files）：
test -f wrapper/orchestrator/worker_pool.ts  # NEW
test -f wrapper/orchestrator/execution_driver.ts  # NEW

# better-sqlite3 dep 加守门（v1.2.0b NEW §4.11 — F1）：
grep -c '"better-sqlite3"' wrapper/package.json
# 期望: ≥ 1 行（"better-sqlite3": "^11.x" dep 加；v1.2.0b 起草预估 = ≥ 1）

# Dockerfile build tools 加守门（v1.2.0b NEW §4.11 — F2）：
grep -c "apk add.*python3.*make.*g++" Dockerfile
# 期望: ≥ 1 行（RUN apk add --no-cache python3 make g++；v1.2.0b 起草预估 = ≥ 1）
```

**含义**：v1.2.0b §4.11 NEW worker 真实现守门 — `worker.ts` stub → real 8 函数全部真实现 + ExecutionDriver.run() + WorkerPool.heartbeat() 集成 + spec/capabilities/worker.json 读 + ADR 0007 schema 实现；`worker_pool.ts` NEW better-sqlite3 per-host file + WAL mode + busy_timeout=5000 per ADR 0009 + 6 methods (register/dispatch/heartbeat/drain/reap_stale/claim_via_pool) per types.ts WorkerPool Protocol；`execution_driver.ts` NEW subprocess spawn 主路径 + HTTP fallback per D2 + yield `DriverEvent` stream + `interrupt()` SIGTERM + AbortController.abort() + 复用 dsh_client.ts:137-162 spawn pattern per F4；`commander.ts:113-114` TODO(v1.2.0b) 替换为真调 `worker_pool.dispatch(task_id)` per F5；`server.ts handleWorkerHeartbeat` 真接 worker.heartbeat() + worker_pool.heartbeat() SQLite 持久化 per F6；`wrapper/package.json` 加 better-sqlite3@^11 dep per F1；`Dockerfile` 加 apk add python3 make g++ per F2；`spec/capabilities/worker.json` model_id 校准 deepseek-v4-flash + evidence_uri 字段 per F9；4 NEW unit tests (worker REWRITE 50 + worker_pool NEW 30 + execution_driver NEW 20 = 100 单测) + 2 NEW integration tests gated (worker_pool + server_heartbeat)；M4 hygiene fix (`vi.restoreAllMocks` → `vi.clearAllMocks` in afterEach) 合并 commit 2 per D3。这是 v1.2.0 4 sub-cycle 的第二刀（worker 真实现）+ PRD §3 L102-104 三层架构抽象铁律（A-1/A-2/A-3）的第二份落地合同。

## §5 v1.2.0b 14 文件 hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
| 1 | `wrapper/orchestrator/worker.ts` (REWRITE ~280 行) | 无 | 无（8 函数 stub → real + ExecutionDriver + WorkerPool 集成）| ✅ wrapper/ 不入主合同 |
| 2 | `wrapper/orchestrator/worker_pool.ts` (NEW ~220 行) | 无 | 无（better-sqlite3 + WAL + 6 methods + ADR 0007 schema 简化版 per F3）| ✅ wrapper/ 不入主合同 |
| 3 | `wrapper/orchestrator/execution_driver.ts` (NEW ~200 行) | 无 | 无（subprocess spawn + HTTP fallback per D2 + DriverEvent stream）| ✅ wrapper/ 不入主合同 |
| 4 | `wrapper/orchestrator/commander.ts` (Edit) | 无 | 无（`commander.ts:113-114` TODO(v1.2.0b) 替换为真调 worker_pool.dispatch per F5）| ✅ wrapper/ 不入主合同 |
| 5 | `wrapper/orchestrator/server.ts` (Edit) | 无 | 无（handleWorkerHeartbeat 真接 worker.heartbeat() + worker_pool.heartbeat() per F6）| ✅ wrapper/ 不入主合同 |
| 6 | `wrapper/orchestrator/orchestrator.ts` (Edit) | 无 | 无（dispatch() 加 `commander.aggregateResults()` 后调 `worker.run()` 真发 step per F5 + plan §3.3 #2）| ✅ wrapper/ 不入主合同 |
| 7 | `wrapper/package.json` (Edit) | 无 | 无（加 `better-sqlite3@^11` dep per F1）| ✅ wrapper/ 不入主合同 |
| 8 | `Dockerfile` (Edit) | 无 | 无（§3.7 NEW 例外声明 + `RUN apk add --no-cache python3 make g++` per F2）| ⚠️ §3.7 NEW Dockerfile 修改不破 v1.0 runtime 0 行 diff 守门 |
| 9 | `wrapper/test/unit/worker.test.ts` (REWRITE ~50 tests) | 无 | 无（30+ stub shape → real shape per F8）| ✅ wrapper/ 不入主合同 |
| 10 | `wrapper/test/unit/worker_pool.test.ts` (NEW ~30 tests) | 无 | 无（SQLite 持久化 + 6 methods + WAL mode + reap_stale）| ✅ wrapper/ 不入主合同 |
| 11 | `wrapper/test/unit/execution_driver.test.ts` (NEW ~20 tests) | 无 | 无（DriverEvent stream + interrupt + spawn timeout + HTTP fallback stub）| ✅ wrapper/ 不入主合同 |
| 12 | `wrapper/test/integration/worker_pool.test.ts` (NEW ~12 tests gated) | 无 | 无（register → heartbeat → dispatch → drain flow; gated by `RUN_WORKER_POOL_E2E=1` per F10）| ✅ wrapper/ 不入主合同 |
| 13 | `wrapper/test/integration/server_heartbeat.test.ts` (NEW ~10 tests gated) | 无 | 无（HTTP POST `/api/v1/worker/heartbeat` → worker.heartbeat() → SQLite; gated by `RUN_SERVER_HEARTBEAT_E2E=1`; replaces server_integration.test.ts:49-55 stub assertion per F7）| ✅ wrapper/ 不入主合同 |
| 14 | `wrapper/test/integration/{orch_commander,pack_plan}.test.ts` (Edit M4 fix) | 无 | 无（`vi.restoreAllMocks` → `vi.clearAllMocks` in afterEach per D3 + F10）| ✅ wrapper/ 不入主合同 |
| 15 | `spec/capabilities/worker.json` (Edit) | 无 | 无（`model_id: deepseek-chat` → `deepseek-v4-flash` per F9 + `evidence_uri` 字段新增）| ✅ spec/capabilities/ 入主合同（实测 = 0）|
| 16 | `notes/codex-audit-scope-v1.2.0b-v0.1.md` (NEW 本文件) | 含字面（自伤豁免）| 本文件 | ✅ notes/ 不入主合同 |
| 17 | `notes/codex-audit-scope-v1.2.0b-v0.1-prompt.md` (NEW 配套 prompt) | 含字面（自伤豁免）| §1.5 引用 | ✅ notes/ 不入主合同 |
| 18 | `docs/poll/cc-ready.json` (Edit) | 无 | 无（task_id 翻牌 T-V1.2.0B-WORKER-PASS）| ✅ |
| 19 | `CHANGELOG.md` (Edit) | 无 | 无（[1.2.0b] minor 段新增 + D1/D2/D3 决策记档 + M4 hygiene 归入）| ✅ |
| 20 | `README.md` (Edit) | 无 | 无（v1.2.0b status 段补 + 7 user EXEC + v1.2.0c 预告）| ✅ |

**v1.2.0b 升级前向交付物** = 8 文件（CHANGELOG + README + spec/capabilities/worker.json + Dockerfile + wrapper/package.json + 3 docs/ cc-ready）；**audit-scope + prompt** = 2 文件（留 notes/ 归档）；**wrapper/orchestrator/** = 6 文件代码改动（worker REWRITE + worker_pool NEW + execution_driver NEW + commander EDIT + server EDIT + orchestrator EDIT）；**wrapper/test/** = 6 文件（3 unit + 2 integration + 1 M4 fix）。

## §6 后续 Codex 复审预期 + v1.2.0b minor tag 路径选择

- v1.2.0b 升级前向交付物 grep `Fable 5|GLM 5.3|MiniMax-M3` = 0 ✓
- v1.2.0b 升级前向交付物 grep `sk-[a-z0-9]{32,}` = 0 ✓
- v1.2.0b 升级前向交付物 grep `tskey-[a-zA-Z0-9_-]{32,}` = 0 ✓
- v1.2.0b 升级范围 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域>` = 0 行 ✓（§3.7 Dockerfile 例外声明）
- v1.2.0b 升级范围 `grep "profile: web" wrapper/` = 0 行 ✓
- v1.2.0b 升级范围 `grep "profile: headless" wrapper/` ≥ 3 行 ✓（v1.2.0a 实测 19 维持 + execution_driver.ts NEW 增量）
- §4.10 NEW commander 真实现守门维持（v1.2.0a PASS 0C/3M/4m 收口 289e7eb 实测锚定）
- §4.11 NEW worker 真实现守门启用（TODO(M1) in worker.ts == 0 + ExecutionDriver|worker_pool refs ≥ 6 + better-sqlite3|Database ≥ 4 + WAL|busy_timeout|journal_mode ≥ 3 + child_process|callDshHeadless ≥ 3 + fetch.*api/v1 ≥ 1 + server.ts worker.heartbeat|worker_pool.heartbeat ≥ 2 + worker.health() version="1.2.0b" ≥ 1 + spec/capabilities/worker.json deepseek-v4-flash ≥ 1 + 单测增量 ≥ 40 + 集成测试 gated ≥ 2 + worker_pool.ts + execution_driver.ts file exists + better-sqlite3 dep ≥ 1 + Dockerfile apk add ≥ 1）
- §4.7.7 NEW server.ts handleWorkerHeartbeat 真接 worker.heartbeat() 守门（≥ 2）
- §3.7 NEW Dockerfile 例外声明（修改不破 v1.0 runtime 0 行 diff 守门）
- tracked 锚定 post-v1.2.0b = 引用式 audit-scope §1.5 主表合计（v1.2.0b 引用 v1.2.0a 主表合计 + v1.2.0b 增量实测校准；禁公式预测）
- Codex 提交铁律：用户亲提 `gpt-5.6-sol` + `xhigh`；Claude 不亲提
- 下一站：v1.2.0b PASS → **v1.2.0b Codex formal 复审 PASS**（user 亲提）→ **v1.2.0b minor tag**（user 亲提 git tag + push via Clash proxy）→ **v1.2.0c sub-cycle**（6 host routedDsh 真发到 MagicDNS + MacBook Worker 接入 + host-id fencing per ADR 0009；待 user 裁断 v1.2.0b PASS 后启动）

---

## §7 教训记档（v1.2.0b NEW — worker 真实现 + worker_pool 真实现 + execution_driver 真实现 + server.ts heartbeat 真接 + M4 hygiene 实战）

**v1.2.0b 教训（2026-09-04 立）**：

1. **worker 真实现 stub → real 8 函数实战（v1.2.0b NEW — 三层架构抽象第二刀）**：
   - **病灶**：原 `worker.ts` (4.7KB TODO(M1)) 8 函数全 stub（capability 返回 `{driver_kind:"codex_exec", notes:"stub"}` + run 返回空 async iterable + interrupt 打印日志 + heartbeat 打印日志 + health 返回 `{status:"ok", version:"0.0.0-stub"}` + register 返回 `stub-worker-${host}` + drain 返回 "drained" + getTaskStatus 返回 "pending"）；违反 PRD §3 L102-104 A-1/A-2/A-3 三层架构铁律 + commander 真实现（v1.2.0a）dispatchStep 暂用 synthetic `stub-worker-${taskId}-${stepName}` 是 v1.2.0a 临时妥协，v1.2.0b 必须接 worker.run() 真实现
   - **修法**：worker.ts 重写 ~280 行真实现 — `capability()` 读 `spec/capabilities/worker.json` (model_id per F9 校准 `deepseek-v4-flash`) + 运行时探测（CPU cores + memory）+ `run()` 调 `ExecutionDriver.run()` yield `DriverEvent` stream + `interrupt()` 发 SIGTERM + 写 `worker_pool` + `heartbeat()` 调 `worker_pool.heartbeat()` + 写 SQLite + `health()` kernel HTTP probe + 返回 `{version:'1.2.0b', workers_count}` + `register()` INSERT worker + 返回 `worker_id` (per ADR 0007 schema 简化版 per F3 无 `current_attempt_id` FK) + `drain()` UPDATE `drained_at` + 等 active 完成 + `getTaskStatus()` query SQLite by `task_id`
   - **机制条款**：v1.2.0b §4.11 「TODO(M1) in worker.ts == 0 + ExecutionDriver|worker_pool refs ≥ 6」守门；8 函数 stub 全消；server.ts handleWorkerHeartbeat 真接 worker.heartbeat() + worker_pool.heartbeat() SQLite 持久化 per §4.7.7 NEW 守门
   - **实战坑**：worker.ts 真实现 ≠ commander 真实现 — v1.2.0a commander 真实现 + dispatchStep 仍用 synthetic `stub-worker-${taskId}-${stepName}` 临时妥协（commander.ts:113-114 TODO(v1.2.0b) 已标注），v1.2.0b 同步替换为真调 `worker_pool.dispatch(task_id)` 拿真实 `worker_id` 写 PlanStep.worker_id；ExecutionDriver 与 worker pool 解耦（driver 调 dsh，pool 管 SQLite worker 注册表）

2. **better-sqlite3 per-host file + WAL mode 实战（v1.2.0b NEW — D1 决策 + ADR 0009 单 host WAL 守门）**：
   - **病灶**：worker pool 需要持久化 worker 注册表（worker_id / host / capabilities_json / status / last_heartbeat_at / registered_at / drained_at），跨进程安全 + 不依赖外部 DB service；选项 Redis / SQLite / In-memory，Redis 新增部署依赖 + In-memory 进程崩溃即丢
   - **修法**：per ADR 0007 WorkerInfo schema + ADR 0009 single-host WAL constraint，**D1 = better-sqlite3 per-host file** — 新增 dep `better-sqlite3@^11` + `db.pragma('journal_mode = WAL')` + `db.pragma('busy_timeout = 5000')`；wrapper 镜像需 Dockerfile 升级加 build tools (`RUN apk add --no-cache python3 make g++`) per F2 — node:22-alpine 默认无 python3/make/g++，better-sqlite3 native 编译必备；简化 workers 表 schema (per F3 无 `current_attempt_id` FK) — wrapper 是 pure client，不持有 SQLite，kernel-side 才是 authoritative per ADR 0007 §2.1
   - **机制条款**：v1.2.0b §4.11 「better-sqlite3|Database refs ≥ 4 + WAL|busy_timeout|journal_mode ≥ 3 + better-sqlite3 dep ≥ 1 + Dockerfile apk add ≥ 1」守门；6 methods 实现 per types.ts WorkerPool Protocol (register/dispatch/heartbeat/drain/reap_stale/claim_via_pool)
   - **实战坑**：per-host file 是关键决策（不能 multi-host 共享 file-DB）— ADR 0009 line 27 明确禁止；1 wrapper process per host (per deploy/6host-compose.newvps.yml) 满足约束；better-sqlite3 v11+ alpine prebuilt binaries 但需 build tools 作为 fallback（v1.2.0b 防御性加 build tools）；node-gyp 编译耗时较长（>30s），newvps npm install 触发后需等待

3. **ExecutionDriver subprocess spawn + HTTP fallback 双模型实战（v1.2.0b NEW — D2 决策 + F4 复用 dsh_client.ts）**：
   - **病灶**：worker.run() 需要执行 step，需要 driver；选项 subprocess spawn / HTTP forward / gRPC；subprocess spawn 同步阻塞需 interrupt 机制；HTTP forward 异步流需 WebSocket/SSE；gRPC 新增依赖
   - **修法**：per D2 = both（subprocess spawn + HTTP fallback）— 主路径 `child_process.spawn('dsh --profile headless ...')` 复用 `wrapper/dsh/dsh_client.ts:137-162` 现有 spawn pattern (per F4 `import { callDshHeadless } from '../dsh/dsh_client.js'`)，yield `DriverEvent` stream（`driver.started` → `output_chunk ×N` → `heartbeat ×N` → `finished`）；备用路径 `fetch(DSH_HTTP_URL + '/api/v1/tasks', POST)` stub — 当前 dsh 不暴露 HTTP，stub 预留接口，等 v1.2.0c 真接 MagicDNS 远程 host 时启用；`interrupt()` 发 SIGTERM + AbortController.abort()
   - **机制条款**：v1.2.0b §4.11 「child_process|callDshHeadless ≥ 3 + fetch.*api/v1 ≥ 1」守门；`interrupt()` SIGTERM + AbortController.abort() + dsh_client.ts runWithTimeout AbortSignal.timeout 兜底
   - **实战坑**：subprocess spawn 需 careful cleanup（`child.kill('SIGTERM')` + 父进程不退出会僵尸）；interrupt race condition — driver 正在 yield event 时被 interrupt 需 graceful cleanup（close stdio + wait exit + 写 cancelled 状态）；HTTP fallback 当前 stub 但调用路径必须保留（v1.2.0c 6 host routedDsh 真发时启用）

4. **server.ts handleWorkerHeartbeat 真接 worker.heartbeat() 实战（v1.2.0b NEW — F6 PURE STUB 改造 + 注入防护）**：
   - **病灶**：原 `wrapper/server.ts:154-158` 是 PURE STUB 返回 `{status:'ok', heartbeat:true}`，未调 `worker.ts` + 未持久化；违反 PRD §3 + A-3 worker≥6 host 架构（worker 端发送心跳到 wrapper，wrapper 必须真接）
   - **修法**：handleWorkerHeartbeat 改造 — 接收 body `{worker_id?: string, capabilities_json?: string}` schema validation (worker_id 非空 + capabilities_json ≤10KB + reject extra fields 注入防护) → 调 `worker.register()` 或 `worker.heartbeat()` by worker_id existence → 写 `worker_pool.heartbeat()` SQLite 持久化 → 返回 `{worker_id, status, last_heartbeat_at}`
   - **机制条款**：v1.2.0b §4.7.7 NEW 「server.ts worker.heartbeat|worker_pool.heartbeat ≥ 2」守门；schema validation 防注入（reject extra fields + size limit）
   - **实战坑**：Pure stub → real handler 需保持 backward-compat endpoint 路径 `/api/v1/worker/heartbeat` 不变（避免破坏 6 host worker 心跳客户端）；server_integration.test.ts:49-55 stub assertion 替换 per F7

5. **M4 hygiene fix 合并 commit 2 实战（v1.2.0b NEW — D3 决策 + F10 注入 commit 2）**：
   - **病灶**：M4 fix (`fb2ab31` local + `a34f345` newvps, unpushed) 是 v1.2.0a 复审中 3M 之一 — `vi.restoreAllMocks()` in afterEach 破坏 `vi.mock` factory（restoreAllMocks 会还原所有 mock 模块到原始状态，导致下次 test 重新加载时 factory 失效）；正确修法是 `vi.clearAllMocks()` 仅清 mock 状态（call history + implementations）保留 factory
   - **修法**：per D3 = 合并进 commit 2 — commit 2 = worker.ts 真实现 + worker_pool.ts + execution_driver.ts + server.ts heartbeat + M4 fix + integration tests 同步 push；`wrapper/test/integration/{orch_commander,pack_plan}.test.ts` `vi.restoreAllMocks` → `vi.clearAllMocks` in afterEach
   - **机制条款**：F10 「M4 fix 是 U4 真机 E2E 15/15 的前提」守门；commit 2 合并 push + v1.2.0b tag 涵盖，避免 v1.2.0a tag 缺 hygiene
   - **实战坑**：vi.restoreAllMocks vs vi.clearAllMocks 区别 — restoreAllMocks = 还原 mock + 清状态（破坏 factory），clearAllMocks = 仅清状态（保 factory）；M4 fix 是 v1.2.0a 复审发现的隐性 bug，commit 2 合并 push 确保 v1.2.0b tag 包含 hygiene fix

6. **spec/capabilities/worker.json model_id 校准实战（v1.2.0b NEW — F9 + docs/m0b M2 校准对齐）**：
   - **病灶**：`spec/capabilities/worker.json` 当前 `model_id: deepseek-chat` 与 `docs/m0b/profile-override-worker.yaml` `model: deepseek-v4-flash` 不一致 — Codex v0.1 M2 校准已发现 yaml 端正确（per profile yaml M2 comment），但 spec JSON 端漏校准；v1.2.0b worker.capability() 读 spec JSON，必须先校准 JSON 端，否则 worker 真实现会按 `deepseek-chat` 调用 dsh 而 profile yaml override 为 `deepseek-v4-flash` 矛盾
   - **修法**：`spec/capabilities/worker.json` `model_id: deepseek-chat` → `deepseek-v4-flash` + 加 `evidence_uri: spec/capabilities/worker.json` 字段（per ADR 0007 capability evidence 要求）
   - **机制条款**：v1.2.0b §4.11 「spec/capabilities/worker.json deepseek-v4-flash ≥ 1」守门；与 docs/m0b/profile-override-worker.yaml M2 校准对齐
   - **实战坑**：spec JSON 与 profile yaml 是两个独立的 spec source — 校准必须双向（JSON 端 + yaml 端）；v1.2.0a 复审未发现此问题，因为 v1.2.0a 不读 spec JSON（commander 真实现不读 capability 文件）；v1.2.0b worker.capability() 必读 → 必须先校准

7. **plan agent 7 user must execute items（v1.2.0b EXEC — 继承 v1.2.0a 9 EXEC 减 2 = 7 项）**：
   - U1: TypeScript build on newvps（`ssh puer-hk 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc'`）
   - U2: 双 gate 验证（tsc + vitest，`./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`）
   - U3: npm install + Docker build + restart（per v1.2.0b 范围 — 新增 better-sqlite3 dep + Dockerfile build tools；`npm install --no-save better-sqlite3@^11` 触发 native build + `docker build -t fish-harness-wrapper:latest .` 重新 build 镜像（v1.2.0a 校准：当前 wrapper 走 bind mount 部署，U3 视实际情况可省 Docker build，仅重启 wrapper 容器即可）+ `docker compose -f deploy/6host-compose.newvps.yml up -d --force-recreate` 重启 5 wrapper 容器）
   - U4: 真机 E2E 套件真调（`RUN_WORKER_POOL_E2E=1 RUN_SERVER_HEARTBEAT_E2E=1 RUN_ORCH_COMMANDER_E2E=1 RUN_PACK_PLAN_E2E=1 DEEPSEEK_API_KEY=<key> vitest run test/integration/{worker_pool,server_heartbeat,orch_commander,pack_plan}.test.ts`；22+15+15 tests PASS (worker_pool 12 + server_heartbeat 10 + orch_commander 7 + pack_plan 8)）
   - U5: 4+1 Funnel URL 路径 200 验证（per v1.2.0b — `/api/v1/worker/health` + `/api/v1/worker/heartbeat` + `/api/v1/commander/health` + `/api/v1/tasks` + `/api/v1/status/test` 5 路径 all 200）
   - U6: Codex v1.2.0b formal 复审（user 亲提 `gpt-5.6-sol` + `xhigh`；报告落点 `notes/codex-review-v1.2.0b-v0.1-formal-report.md`）
   - U7: v1.2.0b minor tag（user 亲提 `git tag -a v1.2.0b -m "..." && git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.2.0b` via Clash proxy）

---

## §8 复审环境注记（继承 v0.4 §5.3 + v0.6 §5.3 + v0.7 §5.3 + v1.2.0a §8 + v1.2.0b §8 NEW 实战校准）

- **tsc**：`cd wrapper && ./node_modules/.bin/tsc --noEmit`（**项目本地 bin 必用**，禁 npx tsc — 会拉假 typosquat 包 exit=0 假绿）
- **vitest**：`cd wrapper && ./node_modules/.bin/vitest run`（**项目本地 bin 必用**，禁 npx --yes vitest — 缺 rolldown binding）
- **typecheck + tests 双 gate**：tsc exit 0 + vitest 0 failed（**v1.2.0b 起草 baseline = v1.2.0a formal PASS 实测** — 引用 v1.2.0a §9 命令 #12 校准值，不复制绝对数字）
- **env-inject**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 仅 env var 注入，不入 commit
- **VAPID 公钥**：`deploy/vapid_public.key` 单文件白名单入库（per v0.6 §4.7 GATE-CALIB）；公钥本为公开分发物 RFC 8292
- **deploy/ sleep infinity 检测**：`grep -rE "sleep infinity" deploy/ | wc -l` == 0（v0.7 §4.5.7 锚定维持）
- **vitest setupFiles 优先模式**（v1.2.0a §7-4）：`test/setup.ts` 在所有 test file 加载前执行（hoist-safe），env var mutation 必须在此层
- **commander 真实现 heuristic fallback 不依赖 DEEPSEEK_API_KEY**（v1.2.0a §7-2）：unit test 默认场景下 plan() 走 heuristic 1-step plan；production env var 注入后才走 dsh 真调
- **集成测试 gated by env var**（v1.2.0a §7-5 + v1.2.0b §8 NEW）：`RUN_WORKER_POOL_E2E=1 RUN_SERVER_HEARTBEAT_E2E=1 DEEPSEEK_API_KEY=<key> ./node_modules/.bin/vitest run test/integration/{worker_pool,server_heartbeat}.test.ts`
- **better-sqlite3 native build**（v1.2.0b §8 NEW）：per F2 `npm install better-sqlite3` 触发 node-gyp native 编译，node:22-alpine 默认无 python3/make/g++；Dockerfile 加 `RUN apk add --no-cache python3 make g++` per F2；or 用 v11+ prebuilt binaries for alpine-x64（v1.2.0b 防御性加 build tools）
- **Dockerfile 例外声明**（v1.2.0b §3.7 NEW）：Dockerfile 修改不破 v1.0 runtime 0 行 diff 守门（§3 第一条 diff 范围排除 Dockerfile；v1.2.0b 是首次 Dockerfile 修改 + 仅 build tools 不影响 v1.0 runtime kernel image）
- **wrapper 镜像 bind mount 部署**（v1.2.0b §8 NEW 实战校准）：per deploy/6host-compose.newvps.yml `..:/app:ro` + command `node build/server.js`，wrapper 走 bind mount 不重建 wrapper image；v1.2.0b U3 npm install 触发 better-sqlite3 native build in container 内（host-side 已 npm install 完毕 → bind mount 进容器时已含 better-sqlite3 native binary）；U3 Docker build 视情况可省（v1.2.0a 实战仅重启 wrapper 容器即可，v1.2.0b 视 better-sqlite3 native binary 是否需容器内 rebuild 校准）

---

## §9 v1.2.0b hygiene 自检命令矩阵（用户/Codex 复审必跑）

```bash
# 1. tracked 锚定（v1.2.0b 实测 — 引用式 v1.2.0a §1.5 主表合计）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == §1.5 主表合计（v1.2.0b 引用 v1.2.0a §1.5 主表合计）

# 2. disk 锚定（v1.2.0b 实测 — m2 GATE-CALIB 129 = 116 + 13 自伤）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0b-v0.1.md | wc -l
# 期望: == §1.5 主表 disk 行（v1.2.0b 实测 129；起草误引 v1.2.0a 127 已校准）

# 3. v1.0 runtime 0 行 diff（§3.7 Dockerfile 例外声明）
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' docker-compose.yml pyproject.toml | wc -l
# 期望: == 0
git diff v1.0.0..HEAD -- Dockerfile | wc -l
# 期望: ≥ 1（v1.2.0b §3.7 NEW Dockerfile 例外 — `RUN apk add --no-cache python3 make g++` per F2）

# 4. dsh headless profile（v1.2.0a 起草实测 19 维持 + execution_driver.ts NEW 增量）
grep -rE "profile: ['\"]web['\"]|profile=web" wrapper/ | wc -l  # == 0
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l  # ≥ 3

# 5. §4.10 v1.2.0a commander 真实现守门维持（引用式 v1.2.0a §9 #5 校准值）
grep -rE "TODO\(M1\)" wrapper/orchestrator/commander.ts | wc -l  # == 0
grep -rE "TODO\(v1\.2\.0b\)" wrapper/orchestrator/commander.ts | wc -l  # == 0（§4.10.5 NEW — TODO(v1.2.0b) marker 替换为真调 worker_pool.dispatch）
grep -rE "stub-worker-\\\$\\{taskId\\}" wrapper/orchestrator/commander.ts | wc -l  # == 0（§4.10.6 NEW — synthetic stub 替换为真 worker_id）

# 6. §4.11 v1.2.0b worker 真实现守门 NEW（commit 2 后实测）
grep -rE "TODO\(M1\)" wrapper/orchestrator/worker.ts | wc -l  # == 0
grep -rE "TODO\(M1\)" wrapper/orchestrator/ | wc -l  # == 0（v1.2.0a 实测 16 系 worker.ts 16 处保留；v1.2.0b 替换后 == 0）
grep -cE "ExecutionDriver|worker_pool" wrapper/orchestrator/worker.ts  # ≥ 6
grep -c "better-sqlite3\|Database" wrapper/orchestrator/worker_pool.ts  # ≥ 4
grep -c "WAL\|busy_timeout\|journal_mode" wrapper/orchestrator/worker_pool.ts  # ≥ 3
grep -c "child_process\|callDshHeadless" wrapper/orchestrator/execution_driver.ts  # ≥ 3
grep -cE "fetch.*api/v1" wrapper/orchestrator/execution_driver.ts  # ≥ 1
grep -cE "worker\.heartbeat|worker_pool\.heartbeat" wrapper/server.ts  # ≥ 2（§4.7.7 NEW）
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/orchestrator/worker.ts wrapper/orchestrator/worker_pool.ts wrapper/orchestrator/execution_driver.ts | wc -l  # == 0
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l  # == 0
grep -E "version.*1\.2\.0b|1\.2\.0b" wrapper/orchestrator/worker.ts | wc -l  # ≥ 1
grep -c "deepseek-v4-flash" spec/capabilities/worker.json  # ≥ 1
grep -c "describe\|it(" wrapper/test/unit/worker.test.ts wrapper/test/unit/worker_pool.test.ts wrapper/test/unit/execution_driver.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 40（m4 同型：BRE `\|` 恢复实测 89）
grep -cE "RUN_WORKER_POOL_E2E|RUN_SERVER_HEARTBEAT_E2E" wrapper/test/integration/worker_pool.test.ts wrapper/test/integration/server_heartbeat.test.ts  # ≥ 2
test -f wrapper/orchestrator/worker_pool.ts  # NEW
test -f wrapper/orchestrator/execution_driver.ts  # NEW
grep -c '"better-sqlite3"' wrapper/package.json  # ≥ 1
grep -c "apk add.*python3.*make.*g++" Dockerfile  # ≥ 1

# 7. PROJECT_ROOT 路径修法（v0.7 + v1.2.0a 锚定维持）
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 4
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd" wrapper/dsh/*.ts | wc -l  # == 0
grep -E "import.meta.url" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts wrapper/orchestrator/worker.ts wrapper/orchestrator/worker_pool.ts wrapper/orchestrator/execution_driver.ts | wc -l  # ≥ 2（v1.2.0b §4.8.5 NEW 扩展）

# 8. dsh binary install 守门（v0.7 + v1.2.0a 锚定维持）
test -f deploy/install-dsh.sh
grep -c "set -euo pipefail" deploy/install-dsh.sh  # ≥ 1
grep -c "npm install -g @deepseek-ai/dsh@" deploy/install-dsh.sh  # ≥ 1

# 9. 不硬编码 API key（v0.7 + v1.2.0a 锚定维持 + v1.2.0b §2.7 NEW worker_pool path）
grep -rE "sk-[a-z0-9]{32,}" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l  # == 0
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/ | wc -l  # == 0
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json | wc -l  # == 0
grep -rE "WORKER_POOL_DB\s*=\s*['\"]/data/" wrapper/orchestrator/worker_pool.ts | wc -l  # 1（v1.2.0b §2.7 NEW — 默认路径占位 + env override）

# 10. VAPID 守门（v0.6 + v0.7 + v1.2.0a 锚定维持）
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}" wrapper/ deploy/ env/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -c "dsaEncoding.*ieee-p1363" wrapper/dsh/vapid_keys.ts  # ≥ 1
grep -c "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts  # ≥ 1

# 11. server.ts 8 endpoint 守门（v0.7 + v1.2.0a 锚定维持 + v1.2.0b §4.7.7 NEW handleWorkerHeartbeat 真接）
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)|app\.use\(\s*\(\s*_req" wrapper/server.ts  # ≥ 8

# 12. 5 edge compose 起草守门（v0.7 + v1.2.0a 锚定维持）
grep -rE "sleep infinity" deploy/ | wc -l  # == 0
grep -rE "harness-edge[1-5]" deploy/ | wc -l  # ≥ 5
grep -rE "tag:harness-edge" deploy/tailscale-acl.yaml | wc -l  # ≥ 1

# 13. 双 gate（typecheck + tests；v1.2.0b 起草 baseline 引用式 v1.2.0a §9 #12）
cd wrapper && ./node_modules/.bin/tsc --noEmit; echo $?  # 0
./node_modules/.bin/vitest run 2>&1 | grep -E 'Tests ' | tail -1  # v1.2.0a formal 实测值 + v1.2.0b commit 2 增量（≥ 40 单测 + 22 gated 集成）

# 14. cc-ready.json 翻牌
jq -e '.task_id == "T-V1.2.0B-WORKER-PASS"' docs/poll/cc-ready.json  # true
```

---

*hygiene audit-scope — v1.2.0b 14 文件改动守门 by-design；继承 v0.7 §1-§9 + v1.2.0a §1-§9 + 启用 §4.11 worker 真实现守门 + §4.7.7 server.ts handleWorkerHeartbeat 真接守门 + §4.10.5/§4.10.6 commander.ts TODO(v1.2.0b) + synthetic stub 替换守门 + §3.7 Dockerfile 例外声明 + §2.7 better-sqlite3 path 默认值守门 + tracked 锚定 post-v1.2.0b = 引用式 audit-scope §1.5 主表合计（v1.2.0b 引用 v1.2.0a 主表合计 + v1.2.0b 增量实测校准，禁公式预测）；v1.2.0b minor tag 路径 = worker 真实现 + worker_pool 真实现 + execution_driver 真实现 + server.ts heartbeat 真接 + M4 hygiene 归 commit 2 + 7 user EXEC（减 2 per v1.2.0a 9 EXEC → v1.2.0b 仅 U1-U7）；下一站 v1.2.0b minor tag（user 亲提 + push via Clash proxy）+ v1.2.0c cross-host + MacBook sub-cycle*

Co-Authored-By: Claude Code <noreply@anthropic.com>
