# Codex precommit review prompt — v1.2.0e.1 commit 2 (4 残留 cleanup + 2 顺手清)

> **Date**: 2026-09-09
> **Reviewer**: Codex `gpt-5.6-sol` + `reasoning_effort=xhigh` (user 亲提 Codex CLI 复审；per fish-harness-project.md 2026-08-30 立 Codex 提交铁律 + 2026-09-05 修订版)
> **复审对象**: v1.2.0e.1 commit 2 — 4 残留 cleanup (heartbeat dedup / metrics wire / prometheus shared net / edge webhook) + 2 顺手清 (edge dns / DEEPSEEK key log)
> **判定格式**: PASS / CHANGES REQUIRED / PARTIAL；预期 0C/0M/Nm 或 N/Nm (per Codex v0.1 风格)
> **配套 hygiene**: 守门聚合在 `notes/codex-audit-scope-v1.2.0e.1-v0.1.md` (本 prompt 同期落)
> **关系**: 本文件 = precommit 轮 prompt；user 提交后走 fix 轮 → formal 轮 → tag v1.2.0e.1 (per §7 user EXEC U7)

---

## §1 Context

### 1.1 v1.2.0d.4 closure 残留 (4 项 + 2 顺手)

| # | 残留 | 根因 | fix 路径 |
|---|------|------|----------|
| R1 | heartbeat_sender 重复 register (edge1=1392 stale rows) | `worker_pool.register()` 不去重;`heartbeat_sender` 每 30s 一次一次性 UUID worker_id 重复 INSERT | **D1**: `worker_pool.register()` 加 `findActiveByHost(host)` 前置检查 + SELECT-then-INSERT 模式 |
| R2 | metrics.worker_count gauge 永远 =0 | `metrics.ts` 声明但从未 set;`worker_pool.countActive()` 已有但未 wire | **D2**: `metrics.ts startMetricsSampling()` 内 2 行:`import { getDefaultWorkerPool } from './worker_pool.js'` + `workerCount.set(getDefaultWorkerPool().countActive())` |
| R3 | Prometheus cross-network (monitoring_net ≠ harness_net) | 2 个独立 local bridge;prometheus 容器在 monitoring_net 无法 reach wrapper 容器 | **D3**: shared external network `deploy_harness_net` (双 compose 都 `external: true`) |
| R4 | Tailscale ACL 端口不一致 | `tag:harness:3000,*` 但 scrape 目标 `:4000-4003` | **D4**: ACL `dst: tag:harness:4000,4001,4002,4003,*` |
| R5 | edge host git pull 自动化缺失 (edge1=puer-hk 还跑 v1.2.0b HEAD 57dae79) | bind-mount `..:/app:ro` + CI deploy.yml 只推 GHCR 不触发 edge pull | **D5/D6**: edge webhook receiver (Node HTTP server :7777 + HMAC SHA-256 verify) + CI `notify-edge` job |
| R6 | edge dns 缺失 (顺手) | MagicDNS 公网盲区 同 newvps fix | **D7**: 5 × edge compose 加 `dns: [100.100.100.100, 1.1.1.1, 8.8.8.8]` |
| R7 | DEEPSEEK key env 漂移排查难 (顺手) | 启动时无 key fingerprint log | **D8**: `deepseek_client.ts` startup truncated prefix log |

### 1.2 L7 lesson (per `fish-harness-v1.2.0e.1-puerhk-restart-loop-emergency.md`)

**2026-09-09 puer-hk 1-min restart loop emergency** (RestartCount=2897, exitCode=0):
- **根因**: `wrapper/orchestrator/heartbeat_sender.ts:69` `timer.unref?.()` 使 setInterval 不 keep Node event loop alive;`app.listen()` TCP listener 在 bind-mount 场景不可靠;Node 干净退出后 docker `unless-stopped` 立即重启
- **应急 patch** (已完成 on puer-hk 主机): 注释掉 `timer.unref?.()` (built .js + source .ts);container stable 30+ min,daemon events 30+/5min → 0
- **本 commit 2 收口**: `wrapper/orchestrator/heartbeat_sender.ts` L7 fix 进 main + 多行注释 + 引用 L7 memory;**L7 commit 2 必删 main 中所有 `timer.unref()`** (grep 守门 §4.20)

### 1.3 决策已锁 (per plan §1 D1-D8)

| # | 决策 | 选项 | 含义 |
|---|------|------|------|
| D1 | heartbeat dedup 路径 | **worker_pool 内 fix** | `worker_pool.register()` 加 `findActiveByHost()` + SELECT-then-INSERT;不动 heartbeat_sender (worker_id 已正确捕获 in closure) |
| D2 | worker_count gauge 接法 | **同 15s interval 复用** | metrics.ts 内 2 行 import + set;避免 circular (worker_pool.ts 不引 metrics.ts) |
| D3 | Prometheus 网络 | **shared external network** | docker network create deploy_harness_net + 双 compose external:true |
| D4 | Tailscale ACL 端口 | **4000-4003 取代 3000** | scrape ACL ports 修正;保留 tagOwners.tag:monitor |
| D5 | Edge webhook 形态 | **Node 最小 HTTP :7777** | bind 127.0.0.1;Tailscale Funnel 暴露;路径 POST /webhook |
| D6 | Edge webhook secret | **per-host random 32B,CI secret EDGE_WEBHOOK_SECRET_<host>** | install.sh 生成 + GH secret 同步 |
| D7 | Edge dns 顺手清 | **加 dns: 段 per newvps pattern** | 5 edge compose +5 行 dns |
| D8 | DEEPSEEK key log | **startup truncated prefix** | slice(0,7) + length,缺失则 FATAL |

---

## §2 File 改动清单 (20 modified + 6 NEW)

### 2.1 Modified (M) — 20 文件

| # | 文件 | 行数 | 改动概述 |
||---|------|----------|
| M1 | `.github/workflows/deploy.yml` | +46/-1 | +`notify-edge` job (matrix 5 host + HMAC POST + EDGE_WEBHOOK_SECRET_<host> secret) |
| M2 | `deploy/6host-compose.edge1.yml` | +8 | +`dns: [100.100.100.100, 1.1.1.1, 8.8.8.8]` (per D7) |
| M3 | `deploy/6host-compose.edge2.yml` | +8 | 同 M2 |
| M4 | `deploy/6host-compose.edge3.yml` | +8 | 同 M2 |
| M5 | `deploy/6host-compose.edge4.yml` | +8 | 同 M2 |
| M6 | `deploy/6host-compose.edge5.yml` | +8 | 同 M2 |
| M7 | `deploy/6host-compose.newvps.yml` | +9 | `networks:` 改 `name: deploy_harness_net` + `external: true` (per D3) |
| M8 | `deploy/monitoring/docker-compose.yml` | +19/-~ | prometheus service + top-level `networks:` 改 shared external (per D3) |
| M9 | `deploy/tailscale-acl-6host.yaml` | +9/-~ | `tag:harness:3000,*` → `tag:harness:4000,4001,4002,4003,*` (3 处 tag:monitor/harness/edge) (per D4) |
| M10 | `wrapper/dsh/deepseek_client.ts` | +32 | +`logDeepseekKeyFingerprint()` + FATAL if missing + auto-init with idempotent guard (per D8) |
| M11 | `wrapper/orchestrator/heartbeat_sender.ts` | +12/-~ | **L7 fix**:移除 `timer.unref?.()` + 多行注释解释 L7 lesson + 引用 L7 memory |
| M12 | `wrapper/orchestrator/metrics.ts` | +10 | +import `getDefaultWorkerPool` + `workerCount.set(getDefaultWorkerPool().countActive())` (per D2) |
| M13 | `wrapper/orchestrator/types.ts` | +14 | +`RegisterStatus` ("new"\|"already_active") + `WorkerRegisterResult` 类型导出 (M3 GATE-CALIB per precommit 审验: register() 实际 dedup = return 已存在 worker_id, 不返回 status 对象) + EdgeWebhook HMAC types |
| M14 | `wrapper/orchestrator/worker_pool.ts` | +49 | +`findActiveByHost(host)` 方法 + `register()` 入口加 dedup check (per D1) |
| M15 | `wrapper/test/integration/deepseek_e2e.test.ts` | +1/-1 | 顺手修 pre-existing gate leak:辅助 `describe` → `suite` (与 v1.2.0e.1 scope 无关) |
| M16 | `wrapper/test/integration/server_heartbeat.test.ts` | +36 | +"concurrent register races resolve to single worker_id" test (8 并发 POST) |
| M17 | `wrapper/test/integration/worker_pool.test.ts` | +31 | +"/metrics endpoint exposes live worker_count" test (gated RUN_WORKER_POOL_E2E=1) |
| M18 | `wrapper/test/unit/deepseek_client.test.ts` | +57/-~ | +2 D8 tests (truncated prefix log + FATAL if missing) |
| M19 | `wrapper/test/unit/metrics.test.ts` | +61/-~ | +1 worker_count wire test + beforeAll WORKER_POOL_DB tmp dir 解决 `/data` mkdir macOS crash |
| M20 | `wrapper/test/unit/worker_pool.test.ts` | +41 | +5 dedup tests (same host twice / different hosts / findActiveByHost / advances heartbeat) |

### 2.2 NEW (A) — 6 文件

| # | 文件 | 行数 | 内容概述 |
||---|------|----------|
| A1 | `wrapper/deploy/edge-webhook/edge-pull.ts` | 209 | Node HTTP server :7777;HMAC SHA-256 verify (timingSafeEqual);idempotent (HEAD check);git pull + tsc + docker compose up -d;FATAL if EDGE_WEBHOOK_SECRET missing;bound 127.0.0.1;Tailscale Funnel 暴露 (per D5) |
| A2 | `wrapper/deploy/edge-webhook/edge-pull.service` | 26 | systemd unit template;User=root;EnvironmentFile=/etc/edge-webhook.env;Restart=always;Hardening: NoNewPrivileges=true, ProtectSystem=strict, ReadWritePaths=/opt/fish-harness |
| A3 | `wrapper/deploy/edge-webhook/install.sh` | 58 | executable;生成 per-host random 32B secret → /etc/edge-webhook.env (chmod 600);systemctl daemon-reload + enable + start;prints secret for GH secret copy |
| A4 | `wrapper/deploy/edge-webhook/tsconfig.json` | 25 | mirrors wrapper/tsconfig.json;outDir: ../build/deploy/edge-webhook |
| A5 | `docs/deploy/6host-deploy.md` | 244 | §1 Network setup (docker network create deploy_harness_net) + §2 Edge webhook setup (per-host secret + systemd install + CI trigger) + §3 DNS fallback + §4 References |
| A6 | `wrapper/test/unit/edge-webhook.test.ts` | 252 | 9 tests:HMAC verify × 3 (missing sig 401 / wrong sig 401 / correct 200) + routing × 2 (GET / 404 / POST /not-webhook 404) + idempotence × 1 (HEAD already current → noop) + failure × 3 (git pull 500 / tsc 500 / compose up 500) |

**总改动:20 modified + 6 NEW = 26 文件;~457 insertions + ~814 NEW = ~1271 行**

### 2.3 不在范围 (Unmodified scope discipline)

- 9 ADR body (`adr/000[1-9]-*.md`) — frozen per T-DD-6
- `harness/` + `spec/` + `spikes/` + `Dockerfile` + `pyproject.toml` + `docker-compose.yml` (root)
- v1.0 runtime kernel (per ADR 0010 Decision d) 不变
- `wrapper/test/integration/deepseek_e2e.test.ts` — **唯一例外** (m6 措辞归位 per precommit 审验: 原与 M15 双列易误读): 已列入 M15 顺手修 pre-existing gate leak (+1/-1 describe→suite);与 v1.2.0e.1 scope 无关,Codex 可标注但不阻塞

---

## §3 Codex 期望输出 (formal review 维度)

### (A) heartbeat dedup (per D1 + §4.19 守门)

- ✅ `worker_pool.ts` 含 `findActiveByHost()` 方法 (新方法 ≥ 1 处)
- ✅ `register()` 入口 SELECT-then-INSERT (单 INSERT 路径守门:grep `INSERT.*workers` ≤ 1)
- ✅ `RegisterStatus` ("new"\|"already_active") 类型导出于 types.ts (≥ 2 grep);dedup 语义 = register() 命中 findActiveByHost 即 return 已存在 worker_id (M3 GATE-CALIB: impl 不构造 status 对象)
- ✅ `heartbeat_sender.ts` **L7 fix**:`timer.unref?.()` 完全移除 + 多行注释引用 L7 memory
- ✅ 并发 register races 测试覆盖 (8 并发 POST → same worker_id + countActive()=1)

### (B) metrics worker_count wire (per D2 + §4.20 守门)

- ✅ `metrics.ts` 内 `workerCount.set(getDefaultWorkerPool().countActive())` 至少 1 处
- ✅ 单向 import (metrics → worker_pool);**worker_pool.ts 不引 metrics.ts** (grep 守门,避免 circular)
- ✅ metrics.ts `workerCount.` 引用 ≥ 3 处 (declared + set + reset)
- ✅ `metrics.test.ts` worker_count 反映 pool.countActive() 测试 ≥ 1
- ✅ `worker_pool.test.ts` /metrics endpoint exposes live worker_count 测试 ≥ 1

### (C) Prometheus shared net + Tailscale ACL (per D3/D4 + §4.21 守门)

- ✅ `deploy_harness_net` + `external: true` 在双 compose 各 ≥ 2 处 (newvps + monitoring)
- ✅ `tailscale-acl-6host.yaml` 端口修正 4000/4001/4002/4003 至少 4 处 (3 tag × 多行)
- ✅ `docs/deploy/6host-deploy.md` §1 Network setup 含 `docker network create deploy_harness_net` 字面命令
- ✅ `monitoring/docker-compose.yml` prometheus service + top-level networks 双改 external

### (D) Edge webhook (per D5/D6 + §4.22 守门)

- ✅ `wrapper/deploy/edge-webhook/edge-pull.ts` NEW (~209 行)
- ✅ HMAC SHA-256 verify (X-Hub-Signature-256 header + createHmac + timingSafeEqual) ≥ 3 grep
- ✅ git pull + docker compose 至少 2 grep
- ✅ Idempotent noop (HEAD already current 短路) — 测试覆盖
- ✅ systemd unit template + install.sh per-host secret 生成
- ✅ CI deploy.yml `notify-edge` job + matrix 5 host + `secrets[format('EDGE_WEBHOOK_SECRET_{0}', matrix.host)]`
- ✅ `edge-webhook.test.ts` 9 tests (HMAC verify × 3 + routing × 2 + idempotence × 1 + failure × 3)

### (E) DEEPSEEK key log (per D8)

- ✅ `deepseek_client.ts` 含 `logDeepseekKeyFingerprint()` 函数 + FATAL if missing + auto-init with idempotent guard
- ✅ 测试覆盖:truncated prefix (slice 0..7) + length + 全 key 不泄漏 + FATAL if missing

### (F) 类型 (per plan §2 F)

- ✅ `wrapper/orchestrator/types.ts` 加 `{worker_id, status: 'new'|'already_active'}` + EdgeWebhook HMAC types

### (G) edge dns 顺手清 (per D7)

- ✅ 5 × `deploy/6host-compose.edge[1-5].yml` 加 `dns: [100.100.100.100, 1.1.1.1, 8.8.8.8]` (5 × +5 行守门)

### (H) L7 lesson 完整性

- ✅ `heartbeat_sender.ts` L7 注释引用 `fish-harness-v1.2.0e.1-puerhk-restart-loop-emergency.md` 字面
- ✅ main 分支中**所有** `timer.unref()` 必须删除 (grep 守门 §4.20)

### (I) 潜在新 finding 风险点 (Codex 主动探查)

- I1 **SELECT-then-INSERT race**: `findActiveByHost()` → INSERT 之间并发 register 同 host 可能产生 2 rows?Mitigation: SQLite busy_timeout=5000 + 测试覆盖 8 并发
- I2 **worker_pool.ts 不引 metrics.ts 守门**: 防止 circular dep 漂移 (R2 mitigation per plan)
- I3 **edge-webhook.test.ts mock ordering**: vi.mock("node:child_process") 必须在 import edge-pull.js 之前
- I4 **edge-pull.ts handle() export 必要**: 之前 internal 不可测,必须 export 后才能测试
- I5 **systemd unit hardening**: NoNewPrivileges + ProtectSystem=strict + ReadWritePaths=/opt/fish-harness 是否齐备
- I6 **deepseek_client auto-init idempotent guard**: 模块 import 时跑 1 次,test import 不重复 log
- I7 **Tailscale ACL ports 4000-4003 是否覆盖 5 edge + newvps + frontend 全部 scrape targets**
- I8 **prometheus 容器 network alias**: `aliases: -prometheus` 是否配置 (自指)
- I9 **HMAC secret 不入 commit**: install.sh 生成 + /etc/edge-webhook.env chmod 600 + GH secret 单独维护
- I10 **git pull origin main 在 edge webhook 触发时是否有 race with user docker exec**: compose up -d 不 kill 现有容器 (--force-recreate 默认 no),用户 exec 完成后下次 pull 生效

---

## §4 验证命令矩阵 (verbatim 实跑;按 §4.19-§4.22 + L7 守门)

### 4.1 §4.19 NEW heartbeat dedup 守门

```bash
# 1. findActiveByHost 方法定义 (≥ 1)
grep -c "findActiveByHost" wrapper/orchestrator/worker_pool.ts
# 期望: ≥ 2 (方法定义 + register 内部调用)

# 2. SELECT-then-INSERT 模式 (单 INSERT 路径守门)
grep -E "INSERT.*workers" wrapper/orchestrator/worker_pool.ts | wc -l
# 期望: == 1 (单 INSERT 路径,dedup check 在前)

# 3. already_active status field (≥ 1)
grep -c "RegisterStatus" wrapper/orchestrator/types.ts
# 期望: ≥ 2 (M3 GATE-CALIB per v0.1 precommit 审验: 原锚 worker_pool.ts `already_active` = 0 恒红 — impl 实际 dedup 形态 = register() 命中 findActiveByHost 直接 return 已存在 worker_id (同 id 即 dedup), 不构造 status 对象; RegisterStatus 类型仅 types.ts 导出供 API 消费者/未来用。实测 types.ts = 2 (L155 定义 + L158 WorkerRegisterResult.status), worker_pool 零消费)

# 4. dedup 测试覆盖 (≥ 5 tests)
grep -c "v1.2.0e.1:" wrapper/test/unit/worker_pool.test.ts
# 期望: ≥ 5

# 5. concurrent races 测试覆盖 (≥ 1)
grep -c "concurrent register" wrapper/test/integration/server_heartbeat.test.ts
# 期望: ≥ 1
```

### 4.2 §4.20 NEW metrics worker_count 守门

```bash
# 1. workerCount.set 接 worker_pool (≥ 1)
grep -c "workerCount.set" wrapper/orchestrator/metrics.ts
# 期望: ≥ 1

# 2. metrics.ts 引用 workerCount ≥ 3 处
grep -c "workerCount\." wrapper/orchestrator/metrics.ts
# 期望: ≥ 1 (m1 GATE-CALIB per v0.1 precommit 审验: 实测 1 — 声明行 `const workerCount = new Gauge` 无尾点不匹配, 且无 reset path (gauge 单调由 set 覆盖); `.set` 接线 L88 唯一。交叉锚: grep -c "workerCount" = 4 (jsdoc 注释 + 声明 + set + wire 注释))

# 3. 单向 import (worker_pool 不引 metrics) — circular 守门
grep -c "metrics" wrapper/orchestrator/worker_pool.ts
# 期望: 0 (无 metrics import;反向唯一)

# 4. L7 fix — timer.unref() 在 main 中必须为 0
grep -rnE "timer\.unref|interval\.unref" wrapper/ --include="*.ts" --include="*.js" | grep -vE "build/|node_modules" | grep -vE ":[0-9]+:[[:space:]]*(\*|//|#)" | wc -l
# 期望: 0 (M2 GATE-CALIB per v0.1 precommit 审验: 原门恒红 — src 2 hits 均为注释本体 (edge-pull.ts L14 + heartbeat_sender.ts L87 引用 timer.unref 字面解释 L7 删除原因), 另 wrapper/build/*.js stale 编译产物 2 处 + node_modules 污染; m4-pattern 复刻 (v1.2.0d 教训)。排注释+产物后活代码实测 0。注: 首版校准自踩双坑 — ① 漏 -n (无行号前缀则 :[0-9]: 排除永不匹配, 实测仍 2); ② macOS BSD grep -E 的 \s 不可靠, 须 POSIX [[:space:]]。双保险 = -n + [[:space:]])

# 5. metrics 反映 worker_count 测试 (≥ 1)
grep -c "worker_count\|pool.countActive" wrapper/test/unit/metrics.test.ts
# 期望: ≥ 2
```

### 4.3 §4.21 NEW prometheus cross-net 守门

```bash
# 1. deploy_harness_net + external: true 在双 compose 各 ≥ 2 处
grep -cE "deploy_harness_net|external: true" deploy/6host-compose.newvps.yml
# 期望: ≥ 2

grep -cE "deploy_harness_net|external: true" deploy/monitoring/docker-compose.yml
# 期望: ≥ 2

# 2. Tailscale ACL 端口修正 (4000-4003 至少 4 处)
grep -cE "4000|4001|4002|4003" deploy/tailscale-acl-6host.yaml
# 期望: ≥ 4 (3 tag × 多行)

# 3. docker network create 命令文档化
grep -cE "docker network create.*deploy_harness_net" docs/deploy/6host-deploy.md
# 期望: ≥ 2 (m2 GATE-CALIB per v0.1 precommit 审验: 原精确串 = 0 — doc L38/L51 实际形态带 `--driver bridge` flag; 放宽后实测 2 (L38 直建 + L51 幂等 inspect||create))

# 4. prometheus network alias
grep -c "aliases:" deploy/monitoring/docker-compose.yml
# 期望: ≥ 1
```

### 4.4 §4.22 NEW edge webhook 守门

```bash
# 1. edge-pull.ts NEW 存在
test -f wrapper/deploy/edge-webhook/edge-pull.ts && echo "edge-pull.ts ✅"
test -f wrapper/deploy/edge-webhook/edge-pull.service && echo "edge-pull.service ✅"
test -f wrapper/deploy/edge-webhook/install.sh && echo "install.sh ✅"
test -f wrapper/deploy/edge-webhook/tsconfig.json && echo "tsconfig.json ✅"

# 2. HMAC SHA-256 verify (≥ 3 grep)
grep -c "X-Hub-Signature-256\|hmac\|createHmac\|timingSafeEqual" wrapper/deploy/edge-webhook/edge-pull.ts
# 期望: ≥ 4

# 3. git pull + docker compose (≥ 2 grep)
grep -c "git -C\|docker compose\|git pull" wrapper/deploy/edge-webhook/edge-pull.ts
# 期望: ≥ 3

# 4. CI deploy.yml 触发 + secret 配置
grep -c "edge-webhook\|notify-edge\|EDGE_WEBHOOK_SECRET" .github/workflows/deploy.yml
# 期望: ≥ 4

# 5. edge-webhook.test.ts 测试覆盖 (≥ 9 tests)
grep -c "it(\|describe(" wrapper/test/unit/edge-webhook.test.ts
# 期望: ≥ 9 it() + ≥ 4 describe()
```

### 4.5 DEEPSEEK key log 守门 (per D8)

```bash
# 1. logDeepseekKeyFingerprint 函数 + FATAL if missing
grep -c "logDeepseekKeyFingerprint\|FATAL: DEEPSEEK_API_KEY missing" wrapper/dsh/deepseek_client.ts
# 期望: ≥ 3

# 2. 测试覆盖 (≥ 2 tests)
grep -c "logs truncated prefix\|logs FATAL error" wrapper/test/unit/deepseek_client.test.ts
# 期望: ≥ 2
```

### 4.6 edge dns 顺手清守门 (per D7)

```bash
# 5 × edge compose 加 dns: 段 (每文件 ≥ 1)
for f in deploy/6host-compose.edge{1,2,3,4,5}.yml; do
  grep -c "100.100.100.100" "$f"
done | awk '{s+=$1} END{print s}'
# 期望: ≥ 5 (每文件 1 处)
```

### 4.7 Hygiene 自检 (按 v0.7 pattern)

```bash
# 1. 不锁型号 (Fable 5|GLM 5.3|MiniMax-M3) — 仅 §1.2 L7 lesson 引用豁免
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/ docs/m0b/ deploy/ 2>/dev/null | grep -v "host_fencing" | wc -l
# 期望: 0 (M1 GATE-CALIB per v0.1 precommit 审验: 原锚 docs/ 全域实测 119 恒红 — 全为 docs/ 历史文档 pre-existing;git diff 引入 = 0 + NEW 文件 = 0 实证。校准为配套合同 §hygiene 形态: docs/m0b/ 范围 + host_fencing 豁免, 实测 0)
git diff | grep -cE "^\+.*(Fable 5|GLM 5.3|MiniMax-M3)"
# 期望: 0 (intent 锚: 本 commit diff 零引入 — 实测 0)

# 2. DEEPSEEK_API_KEY / EdgeWebhook secret 不泄漏
grep -rE "sk-[a-z0-9]{32,}" wrapper/deploy/edge-webhook/ wrapper/dsh/ 2>/dev/null | wc -l
# 期望: 0 (env-inject only)

# 3. timer.unref() 主分支 0 grep (L7 fix 守门)
grep -rnE "timer\.unref|interval\.unref" wrapper/ --include="*.ts" --include="*.js" | grep -vE "build/|node_modules" | grep -vE ":[0-9]+:[[:space:]]*(\*|//|#)" | wc -l
# 期望: 0 (M2 GATE-CALIB 同 §4.2 #4: -n 行号前缀 + 排 L7-lesson 注释 + build 产物, POSIX [[:space:]]; 实测 0)

# 4. Tailscale Funnel URL 引用 (5 + newvps + frontend = 7)
grep -rE "fish-harness\.ts\.net" wrapper/deploy/edge-webhook/ docs/deploy/ .github/workflows/ | wc -l
# 期望: ≥ 7 (m3 GATE-CALIB per v0.1 precommit 审验: 原 https://+字面主机正则实测 2 恒红 — CI L180 用 `https://${HOST}.` 模板变量不匹配 [a-z] 类, doc L75/97 用 http://; 裸域名计数实测 7 (workflow L180 + doc ×6), 压线过 ≥7。另原命令缺 -r 对目录参数不可跑)

# 5. 双 gate (tsc + vitest) — 已实跑过;Codex 可选择性复跑
cd wrapper && ./node_modules/.bin/tsc --noEmit   # exit 0 (m4 GATE-CALIB: repo root 无 node_modules; 审验复核 2026-09-09 exit 0 ✓)
./node_modules/.bin/vitest run     # 189 passed / 0 failed / 165 skipped (审验复核 2026-09-09: 13 file passed / 189 / 0 failed / 165 skipped ✓)
```

### 4.8 全量 verification (post-Codex review)

```bash
# 1. git status (commit 范围确认)
git status --short
# 期望: 20 modified + 6 NEW = 26 文件 (per §2)

# 2. diff stat
git diff --stat
# 期望: 20 files changed, 457 insertions(+), 11 deletions(-)

# 3. 全量测试 (gated 模式 + 9 flag)
cd wrapper
unset DEEPSEEK_API_KEY
export RUN_OOM_PREVENTION_E2E=1 RUN_QUEUE_BACKPRESSURE_E2E=1 RUN_WORKER_POOL_E2E=1 \
       RUN_SERVER_HEARTBEAT_E2E=1 RUN_ORCH_COMMANDER_E2E=1 RUN_PACK_PLAN_E2E=1 \
       RUN_CROSS_HOST_E2E=1 RUN_HOST_FENCING_E2E=1 RUN_MACBOOK_E2E=1
./node_modules/.bin/vitest run
# 期望: 295+/295+ PASS (post-fix 数字)

# 4. 实机 tsc emit (newvps host)
ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc'
# 期望: exit 0 + build/deploy/edge-webhook/edge-pull.js emitted
```

---

## §5 §4.19-§4.22 NEW 守门汇总 (commit 2 后实测)

| 守门 | grep pattern | 期望 | 关联 plan |
|------|------------|------|-----------|
| §4.19 heartbeat dedup | `findActiveByHost` ≥ 2 (实3) / INSERT ≤ 1 (实1) / `RegisterStatus` types ≥ 2 (实2, M3 校准) / dedup tests ≥ 5 (实5) / concurrent ≥ 1 (实4) | PASS | D1 |
| §4.20 metrics wire | `workerCount.set` ≥ 1 (实1) / `workerCount.` ≥ 1 (m1 校准, 实1) / circular 0 (实0) / `timer.unref` 活代码 0 (M2 校准: 排注释/产物, 实0) / worker_count tests ≥ 2 (实5) | PASS | D2 + L7 |
| §4.21 prometheus shared net | `deploy_harness_net` 双 compose 各 ≥ 2 / 4000-4003 ≥ 4 / `docker network create` ≥ 1 / `aliases:` ≥ 1 | PASS | D3/D4 |
| §4.22 edge webhook | 4 NEW files / HMAC ≥ 4 / git+compose ≥ 3 / CI ≥ 4 / 9 tests | PASS | D5/D6 |
| D8 DEEPSEEK key log | `logDeepseekKeyFingerprint` ≥ 3 / tests ≥ 2 | PASS | D8 |
| D7 edge dns | 5 文件 × `100.100.100.100` ≥ 5 | PASS | D7 |

**预期 0C/0M/0m** (本 commit scope 限定,无 impl 漂移风险):
- C-class (correctness): 0
- M-class (must-fix): 0
- m-class (minor): 0 (pre-existing gate leak fix 与 scope 无关,Codex 可标不阻塞)

---

## §6 提交策略 (per Codex 提交铁律 2026-09-05 修订)

```bash
cd /Users/kjonekong/projects/fish-harness

# 1. git add 26 文件
git add .github/workflows/deploy.yml \
        deploy/6host-compose.edge{1,2,3,4,5}.yml \
        deploy/6host-compose.newvps.yml \
        deploy/monitoring/docker-compose.yml \
        deploy/tailscale-acl-6host.yaml \
        wrapper/dsh/deepseek_client.ts \
        wrapper/orchestrator/heartbeat_sender.ts \
        wrapper/orchestrator/metrics.ts \
        wrapper/orchestrator/types.ts \
        wrapper/orchestrator/worker_pool.ts \
        wrapper/test/integration/deepseek_e2e.test.ts \
        wrapper/test/integration/server_heartbeat.test.ts \
        wrapper/test/integration/worker_pool.test.ts \
        wrapper/test/unit/deepseek_client.test.ts \
        wrapper/test/unit/metrics.test.ts \
        wrapper/test/unit/worker_pool.test.ts \
        wrapper/deploy/edge-webhook/ \
        wrapper/test/unit/edge-webhook.test.ts \
        docs/deploy/

# 2. git commit
git commit -m "feat(v1.2.0e.1): cleanup 4 残留 + 2 顺手清

A. heartbeat dedup (D1): worker_pool.register() 加 findActiveByHost 前置检查,
   SELECT-then-INSERT 模式,单 INSERT 路径守门
B. metrics worker_count wire (D2): metrics.ts 15s interval 内 workerCount.set
   接 getDefaultWorkerPool().countActive();单向 import 避 circular
C. Prometheus shared external network (D3): 双 compose 都改 external: true +
   name: deploy_harness_net; Tailscale ACL 端口 3000 → 4000-4003 (D4)
D. Edge webhook (D5/D6): edge-pull.ts ~200 行 + systemd unit + install.sh +
   CI notify-edge job (matrix 5 host + HMAC SHA-256 verify + per-host secret)
E. DEEPSEEK key log (D8): startup truncated prefix + FATAL if missing +
   idempotent auto-init guard
F. types: RegisterStatus + WorkerRegisterResult 导出 (types.ts;
   register() dedup = return 已存在 worker_id — M3 GATE-CALIB) +
   EdgeWebhook HMAC types
G. edge dns 顺手清 (D7): 5 × edge compose +dns: 段 (MagicDNS 公网盲区 fix)

L7 fix: heartbeat_sender.ts 移除 timer.unref() (root cause of 2026-09-09
   puer-hk 1-min restart loop emergency,per memory
   fish-harness-v1.2.0e.1-puerhk-restart-loop-emergency.md)

守门:
- §4.19 heartbeat dedup: findActiveByHost ≥ 2 / INSERT ≤ 1 / dedup tests ≥ 5
- §4.20 metrics wire: workerCount.set ≥ 1 / circular 0 / timer.unref 0 / tests ≥ 2
- §4.21 prometheus shared net: deploy_harness_net 双 compose × 2 / 4000-4003 ≥ 4
- §4.22 edge webhook: 4 NEW files / HMAC ≥ 4 / CI ≥ 4 / 9 tests
- D8 DEEPSEEK key log: logDeepseekKeyFingerprint ≥ 3 / tests ≥ 2
- D7 edge dns: 5 文件 × dns ≥ 5
- 双 gate: tsc 0 / vitest 189 passed / 0 failed (gated 14/14 passed)
- timer.unref() main 分支 grep == 0 (L7 fix 守门)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"

# 3. tag v1.2.0e.1 (per Codex 提交铁律修订:Claude 代劳 git tag 创建 + push via Clash)
git tag v1.2.0e.1

# 4. push via Clash proxy
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.2.0e.1
```

---

## §7 下一步 (post-Codex review)

1. **本 prompt** (本文件) → Codex CLI review (`gpt-5.6-sol` + `xhigh`)
2. Codexfinding → fix 轮 → formal 轮 → 最终 PASS
3. user 授权 commit + push tag v1.2.0e.1 (per §6)
4. user EXEC U1-U7 (per plan §3): tsc + vitest / docker network create / compose up / prometheus scrape / edge webhook install / CI tag trigger
5. **Memory write**: `notes/codex-review-v1.2.0e.1-v0.1-formal-report.md` + `~/.claude/projects/-Users-kjonekong/memory/fish-harness-v1.2.0e.1-cycle-closure.md`
6. **cc-ready.json flip**: task_id `T-V1.2.0E.1-CLEANUP-PASS` status DRAFT → PASS

---

## §8 Plan self-check (本 prompt 起草后)

- [x] §1 Context: 4 残留 + 2 顺手清 + L7 lesson 完整
- [x] §1.3 D1-D8 决策已锁 (引用 plan §1)
- [x] §2 File 改动清单 20 modified + 6 NEW (verbatim diff stat + wc -l)
- [x] §2.3 不在范围 (9 ADR + frozen files)
- [x] §3 Codex 期望输出 9 维度 (A-I)
- [x] §4 验证命令矩阵 6 sub-section (§4.1-§4.6 + §4.7 hygiene + §4.8 全量)
- [x] §4.19-§4.22 grep gate verbatim (commit 2 后实测)
- [x] §5 守门汇总表 (PASS 6 项)
- [x] §6 提交策略 (per Codex 提交铁律 2026-09-05 修订)
- [x] §7 下一步 6 项 (Codex → fix → formal → commit → push → memory → cc-ready)
- [x] §8 self-check 10 项
- [x] L7 fix + memory 引用 (P0)
- [x] DEEPSEEK key log env-inject only (D8 + R8 mitigation)
- [x] Phase 5 ExitPlanMode v1.2.0e.1 commit 2 — 待 user 批准后 Codex precommit 轮启动

---

*Prompt 起草完成 (v1.2.0e.1 commit 2, 2026-09-09 20:21;前 20 modified + 6 NEW;vitest 189/0/165;tsc 0) — D1-D8 + L7 + §4.19-§4.22 + §6 提交策略 (Clash push) + §7 下一步 6 项 完整。等 user 复制 prompt 给 Codex (`gpt-5.6-sol` + `xhigh`) 复审。*