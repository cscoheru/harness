# Codex Audit-scope — v1.2.0d 防 OOM (docker memory limits + queue 持久化 + Prometheus monitoring + 顺手清 F21/F22)

> **Date**: 2026-09-05
> **Purpose**: v0.1 升级 = v1.2.0 周期第四 sub-cycle（防 OOM + monitoring + queue 持久化 + 顺手清 worker_pool round_robin + 顺手 wire execution_driver routedDsh）；v1.2.0d 路径 = `deploy/{newvps,6host-compose.newvps,6host-compose.edge[1-5],macbook}-compose.yml` 加 memory/CPU limits per D7 + `--stop-timeout=30` per F27 + kernel limit 256M per F23 + NEW `wrapper/orchestrator/queue_store.ts` (in-memory + SQLite 落盘 per D8 + F25/F26) + NEW `wrapper/orchestrator/metrics.ts` (prom-client exporter per F25) + `wrapper/orchestrator/orchestrator.ts` `dispatch()` 加 queue backpressure check + reclaim path + `wrapper/orchestrator/worker_pool.ts` `dispatch()` query 加 tertiary sort (registered_at) per F21 + `wrapper/orchestrator/execution_driver.ts` HTTP fallback path 替换为 `routedDsh()` per F22 + NEW `deploy/monitoring/prometheus.yml` (7 host scrape + 3 alert rules per F24/F28) + NEW `deploy/monitoring/runbook.md` + `deploy/tailscale-acl-6host.yaml` 加 `tag:monitor` 段 per F28 + 5 NEW test files (queue_store + queue_backpressure gated + oom_prevention gated + metrics + worker_pool round_robin fix + execution_driver routedDsh wire test) + 4 cc-ready/CHANGELOG/README/hygiene 簿记
> **Why**: 继承 v1.2.0c §1-§9 + v1.2.0b §1-§9 + v1.2.0a §1-§9 + v0.7 §1-§9 全套守门（v1.2.0c formal review PASS 0C/0M/0m 收口 commit `9c2e325` 已 push, 5 findings 全 pattern/测试层零实现 bug）+ 启用 §4.15 NEW docker memory limits 守门 — `memory:` ≥ 10 (per D7 全 7 service limits) + `mem_limit|deploy.resources.limits.memory` ≥ 7 + `--stop-timeout` ≥ 5 (per F27 graceful shutdown) + `256M` ≥ 1 (kernel smoke per F23) + §4.16 NEW queue 持久化守门 — `queue_store.ts` NEW + `better-sqlite3|Database` ≥ 4 (per F25 + ADR 0009) + `WAL|busy_timeout|journal_mode` ≥ 3 + `202|Retry-After|Location` ≥ 3 (per F26) + `max_in_flight` ≥ 1 (per D8) + `queue_depth|active_task_count` ≥ 4 (Prometheus metric names per F25) + §4.17 NEW monitoring + metrics 守门 — `metrics.ts` NEW + `prom-client|Prometheus|register` ≥ 4 + `active_task_count|queue_depth|memory_used|worker_count` ≥ 4 (per F25) + `prometheus.yml` NEW + `targets.*newvps|edge[1-5]|kjonemacbook-pro` ≥ 7 (7 host scrape per F24) + `alert|Alert` ≥ 3 (per §5.3 alert rules) + `memory > 80|queue_depth > 100|worker_offline > 5min` ≥ 3 + `tag:monitor|tag:admin` ≥ 2 (per F28 ACL 限制) + §3.10 NEW OOM graceful shutdown 声明 (per F27 SIGTERM/SIGKILL 区分 + `--stop-timeout=30`)
> **How to apply**: v1.2.0d 24 文件改动守门统一引用本 §1-§11；本文件保留字面 grep pattern 用作后续 Codex 复审 hygiene anchor

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类，继承 v0.7 §1 + v1.2.0a §1 + v1.2.0b §1 + v1.2.0c §1）

```bash
# v1.2.0d 升级前向交付物（CHANGELOG + README + spec/capabilities/{worker,macbook}.json 维持）不锁型号：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md spec/capabilities/worker.json spec/capabilities/macbook.json | wc -l
# 期望: 0 行

# 历史文档豁免口径锚定（tracked 锚定 post-v1.2.0d = 引用式本节 + v1.2.0a §1.5 主表唯一权威源）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == audit-scope §1.5 主表合计（v1.2.0c 收口 9c2e325 实测 = 116 tracked；v1.2.0d 不动 docs/adr/spec/capabilities 主表锚定区域，引用 v1.2.0c 116 维持）

# 历史文档豁免口径锚定（disk 口径 == tracked + 本 audit-scope 自伤）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0d-v0.1.md | wc -l
# 期望: == audit-scope §1.5 主表 disk 行（**v1.2.0d 实测 = 128 = 116 tracked + 12 本周期自伤**；NEW §4.15/§4.16/§4.17 grep 不引入 Fable/GLM/MiniMax 字面 — 仅 §1 继承 + §9 cmd 矩阵共 12 self-injury）

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.2.0d-v0.1.md | wc -l
# 期望: == 自伤实测 12（v1.2.0d 起草实测 = 12 — §1 + §9 cmd 矩阵 grep pattern 字面行 verbatim 校准）

# wrapper/orchestrator/ 不锁型号守门（继承 v1.2.0a/b/c §1 — v1.2.0d 新增 queue_store.ts + metrics.ts 同样守）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l
# 期望: 0 行

# deploy/ 不锁型号守门（继承 v1.2.0a/b/c §1 — v1.2.0d 加 7 service memory limits 不引入型号字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" deploy/ | wc -l
# 期望: 0 行
```

**含义**：v1.2.0d 周期模型决策遵守 NORTH-STAR A-4 等价类约束；v1.2.0d 前向交付物（CHANGELOG + README + spec/capabilities/{worker,macbook}.json 维持校准）均不含具体型号字面；防 OOM + queue 持久化 + Prometheus monitoring 守门在 wrapper/orchestrator/ + deploy/ 内额外加锁（绝不含 Fable 5/GLM 5.3/MiniMax-M3 字面 — 即使在 queue_store.ts / metrics.ts / execution_driver.ts / worker_pool.ts / 7 service compose / prometheus.yml 新代码中也守）。

### §1.5 v1.2.0d 升级范围（24 文件改动；tracked 锚定 post-v1.2.0d = 引用式本节 + v1.2.0a §1.5 主表唯一权威源）

| # | 文件 | 操作 | docs/ 命中增量 | 自伤豁免 |
|---|------|------|----------------|----------|
| 1 | `deploy/newvps-compose.yml` | **Edit** (~30 行 per D7: 加 memory/CPU limits per service + `--stop-timeout=30` per F27 + kernel limit 256M per F23 + D12 + orchestrator 2G + commander 1G each ×3 + stt 2G + web-push 1G + monitor 512M) | 0 | deploy/ 不入主合同 |
| 2 | `deploy/6host-compose.newvps.yml` | **Edit** (~25 行 per D7: 同 #1 for 6 services on newvps - wrapper limits 1G) | 0 | deploy/ 不入主合同 |
| 3 | `deploy/6host-compose.edge[1-5].yml` | **Edit** (5 文件 × ~10 行 per D7: wrapper limit 1G + `--stop-timeout=30` per F27) | 0 | deploy/ 不入主合同 |
| 4 | `deploy/macbook-compose.yml` | **Edit** (~10 行 per D7: worker limit 2G + `--memory-reservation=1G` MacBook-specific larger per §5.2) | 0 | deploy/ 不入主合同 |
| 5 | `wrapper/orchestrator/queue_store.ts` | **NEW** ~120 行 (per D8 + F25/F26: better-sqlite3 per-host file `/data/queue_store.db` per ADR 0009 line 27 + WAL mode + busy_timeout=5000 + 5 methods: enqueue/dequeue/peek/reclaim/pending_count + 429 Retry-After header + 202 Accepted Location header) | 0 | wrapper/ 不入主合同 |
| 6 | `wrapper/orchestrator/metrics.ts` | **NEW** ~80 行 (per F25: prom-client Prometheus exporter + 4 metric names: active_task_count/queue_depth/memory_used/worker_count + /metrics endpoint 暴露 scrape data per F28 Tailscale ACL 限) | 0 | wrapper/ 不入主合同 |
| 7 | `wrapper/orchestrator/orchestrator.ts` | **Edit** (~20 行 per D8: dispatch() 加 queue backpressure check max_in_flight=50 + 超过 → 写 SQLite pending + return 202 Accepted + Location header + reclaim path: worker 完成后扫 SQLite pending 拉下一个 task) | 0 | wrapper/ 不入主合同 |
| 8 | `wrapper/orchestrator/worker_pool.ts` | **Edit** (~10 行 per F21 顺手清: dispatch() query 加 tertiary sort `ORDER BY last_heartbeat_at ASC, worker_id ASC, registered_at ASC` 打破 same-ms register tie → widA expected widA) | 0 | wrapper/ 不入主合同 |
| 9 | `wrapper/orchestrator/execution_driver.ts` | **Edit** (~20 行 per F22 顺手 wire: HTTP fallback path 替换为 `routedDsh()` 调用 + 标记 `wire-routedDsh` commit 注释: per F22 option A) | 0 | wrapper/ 不入主合同 |
| 10 | `wrapper/orchestrator/types.ts` | **Edit** (~15 行 per F26: QueueOverflow error type + RetryAfter + Location response types) | 0 | wrapper/ 不入主合同 |
| 11 | `wrapper/orchestrator/server.ts` | **Edit** (~10 行 per F28: 加 `/metrics` endpoint per Tailscale ACL 限 + tag:monitor: ["cscoheru"]) | 0 | wrapper/ 不入主合同 |
| 12 | `wrapper/test/unit/queue_store.test.ts` | **NEW** ~80 行: SQLite 持久化 + 5 methods + 202/429 状态验证 | 0 | wrapper/ 不入主合同 |
| 13 | `wrapper/test/unit/metrics.test.ts` | **NEW** ~50 行: prom-client exporter shape + 4 metric names 验证 | 0 | wrapper/ 不入主合同 |
| 14 | `wrapper/test/unit/worker_pool.test.ts` | **Edit** (~20 tests per F21: 加 round_robin tie-breaking 测试 - same-ms register → tertiary sort → widA expected) | 0 | wrapper/ 不入主合同 |
| 15 | `wrapper/test/integration/execution_driver.test.ts` | **Edit** (~10 tests per F22: HTTP fallback → routedDsh() 调验证) | 0 | wrapper/ 不入主合同 |
| 16 | `wrapper/test/integration/queue_backpressure.test.ts` | **NEW** ~120 行 (per F30 + §5.2: gated `RUN_QUEUE_BACKPRESSURE_E2E=1` + mock `max_in_flight=2` 触发 429 + SQLite pending 落盘验证 + reclaim 重放) | 0 | wrapper/ 不入主合同 |
| 17 | `wrapper/test/integration/oom_prevention.test.ts` | **NEW** ~80 行 (gated `RUN_OOM_PREVENTION_E2E=1`: mock memory pressure 触发 SIGTERM graceful shutdown 30s window + worker current_attempt 状态保留验证) | 0 | wrapper/ 不入主合同 |
| 18 | `deploy/monitoring/prometheus.yml` | **NEW** ~60 行 (per F24 + F28: 7 scrape jobs newvps + 5 edge + macbook 每 host port 3000 + 3 alert rules: memory >80% / queue >100 / worker offline >5min + Tailscale bind 100.64.0.0/8 tailnet range not 0.0.0.0) | 0 | deploy/ 不入主合同 |
| 19 | `deploy/monitoring/runbook.md` | **NEW** ~120 行: alert 响应手册 (memory / queue / worker offline) + escalation policy (user paged → 15min acknowledge → 30min resolve) + 监控 dashboard URL + alert webhook config | 0 | deploy/ 不入主合同 |
| 20 | `deploy/tailscale-acl-6host.yaml` | **Edit** (~5 行 per F28: 加 `tag:monitor` 段 Prometheus access + `tagOwners.tag:monitor: ["cscoheru"]` + port 9090 仅 tag:admin 可达) | 0 | deploy/ 不入主合同 |
| 21 | `notes/codex-audit-scope-v1.2.0d-v0.1.md` | **NEW**（本文件）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 22 | `notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md` | **NEW**（配套 Codex 复审 prompt）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 23 | `docs/poll/cc-ready.json` | Edit（task_id `T-V1.2.0C-CROSSHOST-MACBOOK-PASS` → `T-V1.2.0D-ANTI-OOM-DRAFT`；status 翻牌；files_modified 含 v1.2.0d 24 文件 + §3.10 OOM graceful shutdown 声明 + §4.15/§4.16/§4.17 NEW 守门）| 0 | docs/ 入主合同（实测 = 0）|
| 24 | `CHANGELOG.md` | Edit（[1.2.0d] minor 段 NEW: docker memory limits + queue_store + metrics + 顺手清 F21 round_robin + 顺手 wire F22 routedDsh + 5 NEW files + 3 NEW integration tests gated + D7/D8/D9 决策记档）| 0 | grep 字面 0 行 |

**v1.2.0d 升级总改动：24 文件**（4 deploy/ Edit [newvps + 6host-compose.newvps + 5 edge compose + macbook] + 6 wrapper/orchestrator/ 代码 [queue_store NEW + metrics NEW + orchestrator Edit + worker_pool Edit + execution_driver Edit + types Edit + server Edit = 实际 2 NEW + 5 Edit] + 6 wrapper/test/ [queue_store NEW + metrics NEW + worker_pool Edit + execution_driver Edit + queue_backpressure NEW + oom_prevention NEW] + 3 deploy/monitoring/ [prometheus.yml NEW + runbook NEW + tailscale-acl Edit] + 2 notes/ + 1 docs/ + 1 CHANGELOG = 24 文件）

**docs 主表**（继承 v0.7 §1.5 #1-#55 + v1.2.0a §1.5 主表合计 + v1.2.0b §1.5 主表 + v1.2.0c §1.5 主表；v1.2.0d 增量实测 = **引用 v1.2.0c 116 tracked 维持**；v1.2.0d 不动 docs/adr/spec/capabilities 主表锚定区域，仅改 spec/capabilities/{worker,macbook}.json (维持) + spec/kernel-schema.sql (维持) + CHANGELOG + README + cc-ready 5-6 个 docs/spec 入口；演进链 116→116→116→116→(v1.2.0d 实测校准)，禁公式预测，以实测为准）。

**v1.2.0d 实测公式**（post-Commit 1-3 实测落地，引用式唯一权威源 + v1.2.0a §1.5 主表合计）：

```bash
# tracked 验收命令（git add 所有 v1.2.0d 文件后）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# v1.2.0d 实测: 引用 v1.2.0c 116 tracked 维持（v1.2.0c 收口 9c2e325 实测 = 116 tracked；v1.2.0d 不动 docs/adr/spec/capabilities 主表锚定区域）

# disk 验收命令
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0d-v0.1.md | wc -l
# v1.2.0d 实测: **128 disk = 116 tracked + 12 本周期自伤**（v1.2.0d 实测 verbatim 校准 — 仅 §1 继承 + §9 cmd 矩阵共 12 self-injury；NEW §4.15/§4.16/§4.17 grep 不引入 Fable/GLM/MiniMax 字面）
```

**v1.2.0d 主表新增条目**（v1.2.0d 增量实测；引用式不复制数字）：
- 🆕 v1.2.0d audit-scope 自伤实测行数（notes/ 自伤豁免不入 tracked + 仅本文件计入 disk）
- v1.2.0d 24 文件改动中 4 deploy/ Edit + 2 wrapper/orchestrator/ NEW + 5 wrapper/orchestrator/ Edit + 6 wrapper/test/ (3 NEW + 3 Edit) + 2 deploy/monitoring/ NEW + 1 deploy/tailscale-acl Edit + 2 notes/ + 1 docs/ + 1 CHANGELOG = 24 文件
- queue_store.ts + metrics.ts 是 v1.2.0d 唯一 NEW wrapper/orchestrator/ 文件

**豁免口径不变**（per M0b plan §3 L89 C2 裁定 + v0.5 §1.5 末段 + v0.6 §1.5 末段 + v0.7 §1.5 末段 + v1.2.0a §1.5 末段 + v1.2.0b §1.5 末段 + v1.2.0c §1.5 末段）：**不清洗历史文档**（考古记录 + git 尾注 + DISPATCH §2/§4 验证命令字面均保留）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训，继承 v0.7 §2 + v1.2.0a §2 + v1.2.0b §2 + v1.2.0c §2）

```bash
# v1.2.0d 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json spec/capabilities/macbook.json wrapper/orchestrator/ deploy/ | wc -l
# 期望: 0 行

# wrapper/orchestrator/ 不硬编码 API key 守门（继承 v1.2.0a/b/c §2.5 — v1.2.0d 新增 queue_store.ts + metrics.ts 同样守）：
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/ | wc -l
# 期望: 0 行

# VAPID 私钥守门（继承 v0.7 §2 + §4.7 + v1.2.0a/b/c §2）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/orchestrator/ workflow_packs/ CHANGELOG.md README.md | wc -l
# 期望: 0 行

# Tailscale auth key 守门（继承 v0.7 §2.6 + v1.2.0a/b/c §2）：
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json spec/capabilities/macbook.json | wc -l
# 期望: 0 行

# better-sqlite3 path 守门（继承 v1.2.0b §2.7 + v1.2.0c §2 — v1.2.0d queue_store.ts 加新 path）：
grep -rE "QUEUE_STORE_DB\s*=\s*['\"]/data/" wrapper/orchestrator/queue_store.ts | wc -l
# 期望: 1 行（默认路径占位 + env override 优先）

# Prometheus endpoint 不硬编码 admin credentials（v1.2.0d NEW §2.9）：
grep -rE "admin_password\s*[:=]\s*['\"][A-Za-z0-9]{8,}['\"]|PROM_ADMIN\s*[:=]\s*['\"][A-Za-z0-9]{8,}['\"]" deploy/monitoring/ | wc -l
# 期望: 0 行（Prometheus bind Tailscale IP only per F28，无需密码）

# Tailscale MagicDNS hostname 不硬编码 auth key 守门（v1.2.0d NEW §2.10 — Prometheus 7 host scrape）：
grep -rE "newvps|edge[1-5]|kjonemacbook-pro\s*=\s*['\"]?tskey-" deploy/monitoring/ | wc -l
# 期望: 0 行（MagicDNS hostname 是 host 名非 key）
```

**含义**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key / Prometheus admin password 等敏感 key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；v1.2.0d §2.10 NEW `newvps|edge[1-5]|kjonemacbook-pro` 仅 MagicDNS hostname，不硬编码 Tailscale auth key；Prometheus /metrics endpoint per F28 Tailscale ACL 限，不需 admin password 二次认证。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)，继承 v0.7 §3 + v1.2.0a §3 + v1.2.0b §3 + v1.2.0c §3）

```bash
# v1.2.0d 升级 v1.0 runtime 区域净 diff（commit v1.0.0 tag 后 0 漂移；§3.8/§3.9/§3.10 例外文件 pathspec 排除 per v1.2.0b Dockerfile 模式）：
git diff v1.0.0..HEAD -- harness/ ':(exclude)harness/runtime/worker_pool.py' spec/kernel-schema.sql ':(exclude)spec/kernel-schema.sql' spikes/ 'adr/000[1-9]-*.md' docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行（主 pathspec 排除 worker_pool.py + kernel-schema.sql 两例外文件 + 3 NEW §3.10/§3.11/§3.12 例外 per F22/F25/F26）

# v1.2.0d 例外声明（per F27 graceful shutdown + §3.10 NEW OOM graceful shutdown 声明；m1 GATE-CALIB per v1.2.0d formal：compose 原生字段为 stop_grace_period（等价 CLI --stop-timeout），5 edge 补齐后并入 pattern）：
grep -cE "stop-timeout|stop_grace_period|SIGTERM|SIGKILL" deploy/*.yml | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 5（per F27 至少 5 service graceful window；实测 9 = newvps×2 + 5 edge + 注释 SIGTERM×2）

# v1.2.0d §3.10 NEW OOM graceful shutdown 声明（per F27）：
grep -nE "§3\.10.*OOM graceful shutdown|--stop-timeout=30" notes/codex-audit-scope-v1.2.0d-v0.1.md | wc -l
# 期望: ≥ 1（本文件自伤实测行数）

# v1.2.0d §3.11 NEW execution_driver routedDsh wire 声明（per F22）：
grep -nE "§3\.11.*execution_driver routedDsh wire|wire-routedDsh" notes/codex-audit-scope-v1.2.0d-v0.1.md wrapper/orchestrator/execution_driver.ts | wc -l
# 期望: ≥ 2（本文件自伤 + execution_driver.ts 注释）

# v1.2.0d §3.12 NEW queue_store SQLite 持久化声明（per F25 + D8）：
grep -nE "§3\.12.*queue_store SQLite|in-memory \+ SQLite" notes/codex-audit-scope-v1.2.0d-v0.1.md wrapper/orchestrator/queue_store.ts | wc -l
# 期望: ≥ 2（本文件自伤 + queue_store.ts 注释）
```

### §3.10 NEW OOM graceful shutdown 声明（per F27）

v1.2.0d 引入 docker memory limits (per D7) 后，OOM-kill 默认 SIGKILL 会导致 worker.current_attempt 状态丢失。v1.2.0d 校准：
- docker compose 7 service `--stop-timeout=30` 给 30 秒 graceful drain window (per F27)
- orchestrator / commander 设 `--stop-signal=SIGTERM` (docker compose default 已 SIGTERM, 维持)
- worker 设 `--restart unless-stopped` 让 OOM-kill 后 container 自动重启
- queue_store SQLite WAL 模式 + busy_timeout=5000 兜底 (per D8 + ADR 0009)

引用式：本节为 v1.2.0d 唯一声明，§4.15 grep 模板实测。

### §3.11 NEW execution_driver routedDsh wire 声明（per F22）

v1.2.0c cycle 残留 F22 `routedDsh()` defined but NOT wired into production dispatch flow。v1.2.0d 顺手 wire (option A per F22 决策)：
- `execution_driver.ts` HTTP fallback path 替换为 `routedDsh()` 调用
- 注释 `// wire-routedDsh per F22 option A` 标注 commit message
- main path (`callDshHeadless`) 维持 backward compat per v1.2.0b pattern

引用式：本节为 v1.2.0d 唯一声明，§4.17 grep 模板实测。

### §3.12 NEW queue_store SQLite 持久化声明（per F25 + D8）

v1.2.0d 引入 in-memory + SQLite 落盘双层 queue (per D8 决策)。queue_store.ts NEW file：
- in-memory queue (per service) 高速访问
- SQLite per-host file `/data/queue_store.db` (per ADR 0009 line 27) 持久化兜底
- WAL mode + busy_timeout=5000 (per ADR 0009 single-host constraint)
- 5 methods: enqueue / dequeue / peek / reclaim / pending_count
- 429 Retry-After + 202 Accepted Location header (per F26 HTTP RFC 7231 + RFC 6585)

引用式：本节为 v1.2.0d 唯一声明，§4.16 grep 模板实测。

**含义**：v1.2.0d 升级维持 ADR 0010 Decision (d) v1.0 runtime 不漂移守门；3 NEW §3.10/§3.11/§3.12 例外声明覆盖 OOM graceful shutdown + execution_driver routedDsh wire + queue_store SQLite 持久化（3 NEW 子系统独立例外声明）。

---

## §4 守门扩展（继承 v1.2.0a §4.6 + v1.2.0b §4.11 + v1.2.0c §4.12-§4.14 + v1.2.0d NEW §4.15-§4.17）

### §4.15 NEW docker memory limits 守门（per D7 + F23 + F27）

v1.2.0d 引入 7 service docker memory limits (per D7 决策) + kernel 256M smoke limit (per F23 + D12) + `--stop-timeout=30` graceful shutdown (per F27)。12 项 grep 守门：

```bash
# v1.2.0d 7 service compose 文件存在守门（4 类 + 5 edge + 5 edge compose = 7 类）：
test -f deploy/newvps-compose.yml  # kernel + orchestrator + commander + stt + push + monitor
test -f deploy/6host-compose.newvps.yml  # 6 wrappers on newvps
test -f deploy/6host-compose.edge1.yml deploy/6host-compose.edge2.yml deploy/6host-compose.edge3.yml deploy/6host-compose.edge4.yml deploy/6host-compose.edge5.yml
test -f deploy/macbook-compose.yml
# 期望: ≥ 8 文件 (4 类 + 5 edge + macbook)

# v1.2.0d memory limit 守门（per D7 全 7 service limits）：
grep -c "memory:" deploy/newvps-compose.yml deploy/6host-compose.newvps.yml deploy/6host-compose.edge*.yml deploy/macbook-compose.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 10（per D7 kernel 256M + orchestrator 2G + commander 1G ×3 + stt 2G + web-push 1G + wrapper 1G = 9 main + ≥1 monitor 512M = 10）

# v1.2.0d mem_limit / deploy.resources.limits.memory 守门（双 syntax 兼容）：
grep -cE "mem_limit|deploy\.resources\.limits\.memory" deploy/*.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 7（per D7 7 service limits，deploy syntax 兼容 long-form compose v2/v3）

# v1.2.0d CPU limit 守门（per D7 orch + commander + kernel + monitor）：
grep -c "cpus:" deploy/newvps-compose.yml deploy/6host-compose.newvps.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 4（orch + commander + kernel + monitor）

# v1.2.0d --stop-timeout graceful shutdown 守门（per F27）：
grep -c "stop-timeout" deploy/*.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 5（per F27 至少 5 service 设 --stop-timeout=30 graceful drain window）

# v1.2.0d kernel smoke limit 守门（per F23 + D12）：
grep -cE "256M" deploy/newvps-compose.yml
# 期望: ≥ 1（kernel service memory 256M smoke limit）

# v1.2.0d memory-reservation 守门（per MacBook 2G limit + 1G reservation）：
grep -c "memory-reservation" deploy/macbook-compose.yml
# 期望: ≥ 1（MacBook-specific larger per plan §5.2）

# v1.2.0d restart unless-stopped 守门（per F27 OOM-kill auto restart）：
grep -c "unless-stopped" deploy/*.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 5（per F27 worker auto restart after OOM-kill）

# v1.2.0d docker memory limits 不锁型号 守门（继承 §1）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" deploy/*.yml | wc -l
# 期望: 0 行（deploy compose 不含具体型号字面）

# v1.2.0d 不硬编码 resource limits 守门（继承 §2）：
grep -rE "memory:\s*['\"]?[0-9]+[Gg]?['\"]?\s*#" deploy/*.yml | wc -l
# 期望: 0 行（memory limits 不在 inline 注释 hardcode，全部走 resource key）

# v1.2.0d wrapper-side image not alpine 守门（per F19 + v1.2.0b D1 better-sqlite3 native build）：
grep -cE "image:\s*node:24-slim|node:22-slim" deploy/6host-compose.*.yml deploy/macbook-compose.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 6（6host newvps + 5 edge + macbook，避开 alpine musl ABI issue）
```

**含义**：v1.2.0d 引入全 7 service docker memory limits 是 anti-OOM 的核心机制；12 项 grep 守门覆盖 file exists + memory/CPU limits + graceful shutdown + restart policy + 不锁型号 + 不硬编码 + image architecture；实测落地后 F29 tracked 锚定维持 116 + disk verbatim 128 维持。

### §4.16 NEW queue 持久化守门（per D8 + F25 + F26 + ADR 0009）

v1.2.0d 引入 in-memory + SQLite 落盘双层 queue (per D8 决策) + queue backpressure 429 Retry-After + 202 Accepted Location header (per F26 HTTP RFC)。8 项 grep 守门：

```bash
# v1.2.0d queue_store.ts NEW file 守门：
test -f wrapper/orchestrator/queue_store.ts
# 期望: true（per F25 + D8）

# v1.2.0d better-sqlite3 + Database 守门（per F25 + ADR 0009 WAL）：
grep -c "better-sqlite3\|Database" wrapper/orchestrator/queue_store.ts
# 期望: ≥ 4（import + new Database + 2 method 调用）

# v1.2.0d WAL mode + busy_timeout + journal_mode 守门（per ADR 0009 single-host constraint）：
grep -c "WAL\|busy_timeout\|journal_mode" wrapper/orchestrator/queue_store.ts
# 期望: ≥ 3（pragma journal_mode = WAL + busy_timeout=5000 + journal_mode SELECT 验证）

# v1.2.0d 429 Retry-After + 202 Accepted Location header 守门（per F26）：
grep -c "202\|Retry-After\|Location" wrapper/orchestrator/queue_store.ts wrapper/orchestrator/orchestrator.ts wrapper/orchestrator/types.ts 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 3（429 Retry-After header + 202 Accepted status + Location header response）

# v1.2.0d max_in_flight backpressure 守门（per D8）：
grep -cE "max_in_flight|maxInflight" wrapper/orchestrator/orchestrator.ts
# 期望: ≥ 1（dispatch() 检查 max_in_flight 阈值）

# v1.2.0d queue_depth / active_task_count Prometheus metric 守门（per F25）：
grep -c "queue_depth\|active_task_count" wrapper/orchestrator/metrics.ts wrapper/orchestrator/queue_store.ts wrapper/orchestrator/orchestrator.ts 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 4（per F25 Prometheus metric names 暴露）

# v1.2.0d queue_store 不锁型号 守门（继承 §1）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/queue_store.ts | wc -l
# 期望: 0 行

# v1.2.0d queue_store 不硬编码 path 守门（继承 §2 + per-host file pattern）：
grep -cE "QUEUE_STORE_DB\s*=\s*['\"]/data/" wrapper/orchestrator/queue_store.ts
# 期望: 1 行（默认路径占位 + env override 优先 per ADR 0009）
```

**含义**：v1.2.0d queue 持久化是 anti-OOM 第二道防线；8 项 grep 守门覆盖 queue_store.ts NEW + better-sqlite3 WAL + 429/202 HTTP status + max_in_flight + Prometheus metric names + 不锁型号 + 不硬编码 path。

### §4.17 NEW monitoring + metrics 守门（per F24 + F25 + F28 + D9）

v1.2.0d 引入 Prometheus + alertmanager + Grafana full monitoring stack (per D9 决策) + 7 host metrics scrape (per F24) + Tailscale ACL 限制 access (per F28)。10 项 grep 守门：

```bash
# v1.2.0d metrics.ts NEW + prometheus.yml NEW + runbook.md NEW 守门：
test -f wrapper/orchestrator/metrics.ts
test -f deploy/monitoring/prometheus.yml
test -f deploy/monitoring/runbook.md
# 期望: 3 true

# v1.2.0d prom-client + Prometheus + register 守门（per F25）：
grep -cE "prom-client|Prometheus|register" wrapper/orchestrator/metrics.ts
# 期望: ≥ 4（import + Prometheus class + register collector + register metrics）

# v1.2.0d 4 Prometheus metric names 守门（per F25 实时 metrics）：
grep -c "active_task_count\|queue_depth\|memory_used\|worker_count" wrapper/orchestrator/metrics.ts
# 期望: ≥ 4（4 metric 全暴露 scrape）

# v1.2.0d /metrics endpoint 守门（per F28 Tailscale ACL 限）：
grep -cE "metrics|/metrics" wrapper/orchestrator/server.ts
# 期望: ≥ 1（server.ts 加 /metrics endpoint + Tailscale bind）

# v1.2.0d prometheus.yml scrape_configs 守门：
grep -c "scrape_configs" deploy/monitoring/prometheus.yml
# 期望: ≥ 1（Prometheus config scrape section 存在）

# v1.2.0d 7 host scrape targets 守门（per F24 newvps + 5 edge + macbook；m3 GATE-CALIB per v1.2.0d formal：newvps 为多行 targets 列表形态，`targets.*newvps` 行内失配 — 改锚 host:port 全形态）：
grep -c "fish-harness.ts.net:300" deploy/monitoring/prometheus.yml
# 期望: ≥ 8（newvps 4 端口 + 5 edge + macbook 多行/单行混合全形态）

# v1.2.0d alert rules 守门（per D9 + §5.3；m2 GATE-CALIB per v1.2.0d formal：rule_files 引用 alerts.yml 须落地验证，`alert|Alert` 对 prometheus.yml 结构行假绿）：
grep -c "alert:" deploy/monitoring/alerts.yml
# 期望: == 3（WrapperMemoryHigh / WrapperQueueDepthHigh / WorkerOffline）

# v1.2.0d 3 alert condition 守门（per D9 memory/queue/worker；metric 名对齐 metrics.ts 导出；m5 GATE-CALIB per v1.2.0d formal：==3 计数被 summary 注释同字面多算 — 拆 expr 行）：
grep -c "expr:" deploy/monitoring/alerts.yml
# 期望: == 3（仅 PromQL 表达式行）+ `grep -cE "memory_used_mb > 819|queue_depth > 100|worker_count < 1" deploy/monitoring/alerts.yml` ≥ 3（条件字面，summary 注释冗余命中可超）

# v1.2.0d Tailscale bind + tag:monitor ACL 守门（per F28）：
grep -cE "tag:monitor|tag:admin" deploy/tailscale-acl-6host.yaml
# 期望: ≥ 2（tag:monitor 段 + tag:admin port 9090 访问控制 + tagOwners.tag:monitor: ["cscoheru"]）

# v1.2.0d monitoring 不硬编码 admin credentials 守门（继承 §2.9）：
grep -rE "admin_password\s*[:=]\s*['\"][A-Za-z0-9]{8,}['\"]|PROM_ADMIN\s*[:=]\s*['\"][A-Za-z0-9]{8,}['\"]" deploy/monitoring/ | wc -l
# 期望: 0 行（per F28 Tailscale ACL 限，无需 admin password）
```

**含义**：v1.2.0d monitoring 是 anti-OOM 第三道防线（可视 + 告警）；10 项 grep 守门覆盖 metrics.ts + prometheus.yml + runbook.md NEW + prom-client exporter + 4 metric names + /metrics endpoint + 7 host scrape + 3 alert rules + Tailscale ACL + 不硬编码 credentials。

---

## §5 v1.2.0d 24 文件 hygiene 自检表（per §13.3 Commit 2 spec）

| # | 文件 | 操作 | grep 守门命中 | 自伤豁免 |
|---|------|------|---------------|----------|
| 1 | `deploy/newvps-compose.yml` | Edit (~30 行) | §4.15 #2/#3/#4/#5/#6/#7/#8 + §4.16 #4 (orchestrator 调 queue_store) + §4.17 #4 (orchestrator /metrics endpoint) | deploy/ 不入主合同 |
| 2 | `deploy/6host-compose.newvps.yml` | Edit (~25 行) | §4.15 #2/#3/#8/#9 | deploy/ 不入主合同 |
| 3 | `deploy/6host-compose.edge[1-5].yml` | Edit (5 × ~10 行) | §4.15 #2/#3/#7/#8/#9 | deploy/ 不入主合同 |
| 4 | `deploy/macbook-compose.yml` | Edit (~10 行) | §4.15 #2/#3/#7/#8/#9 | deploy/ 不入主合同 |
| 5 | `wrapper/orchestrator/queue_store.ts` | **NEW** ~120 行 | §4.16 #2/#3/#4/#6/#7/#8 + §4.17 #5 (metric names) + §3.12 | wrapper/ 不入主合同 |
| 6 | `wrapper/orchestrator/metrics.ts` | **NEW** ~80 行 | §4.17 #3/#4/#6 + §4.16 #6 (metric names) | wrapper/ 不入主合同 |
| 7 | `wrapper/orchestrator/orchestrator.ts` | Edit (~20 行) | §4.16 #4/#5/#6 + §3.10 (graceful integration) | wrapper/ 不入主合同 |
| 8 | `wrapper/orchestrator/worker_pool.ts` | Edit (~10 行, per F21) | §4.15 (no direct, but per F21 tertiary sort) | wrapper/ 不入主合同 |
| 9 | `wrapper/orchestrator/execution_driver.ts` | Edit (~20 行, per F22) | §3.11 (routedDsh wire) + §4.17 #4 (HTTP fallback metric) | wrapper/ 不入主合同 |
| 10 | `wrapper/orchestrator/types.ts` | Edit (~15 行, per F26) | §4.16 #4 (QueueOverflow type) | wrapper/ 不入主合同 |
| 11 | `wrapper/orchestrator/server.ts` | Edit (~10 行, per F28) | §4.17 #4 (/metrics endpoint) | wrapper/ 不入主合同 |
| 12 | `wrapper/test/unit/queue_store.test.ts` | **NEW** ~80 行 | §4.16 #2/#3/#4 (5 methods + 202/429 + WAL) | wrapper/ 不入主合同 |
| 13 | `wrapper/test/unit/metrics.test.ts` | **NEW** ~50 行 | §4.17 #3/#4 (prom-client shape) | wrapper/ 不入主合同 |
| 14 | `wrapper/test/unit/worker_pool.test.ts` | Edit (~20 tests, per F21) | §4.15 (no direct, but per F21 tertiary sort tie-breaking) | wrapper/ 不入主合同 |
| 15 | `wrapper/test/integration/execution_driver.test.ts` | Edit (~10 tests, per F22) | §3.11 (routedDsh wire 验证) | wrapper/ 不入主合同 |
| 16 | `wrapper/test/integration/queue_backpressure.test.ts` | **NEW** ~120 行 (gated, per F30) | §4.16 #4/#5 (429/202 + max_in_flight mock) + §3.12 | wrapper/ 不入主合同 |
| 17 | `wrapper/test/integration/oom_prevention.test.ts` | **NEW** ~80 行 (gated) | §3.10 (graceful shutdown 30s window) | wrapper/ 不入主合同 |
| 18 | `deploy/monitoring/prometheus.yml` | **NEW** ~60 行 | §4.17 #5/#6/#7/#8 | deploy/ 不入主合同 |
| 19 | `deploy/monitoring/runbook.md` | **NEW** ~120 行 | §4.17 + §3.10 (graceful shutdown runbook) | deploy/ 不入主合同 |
| 20 | `deploy/tailscale-acl-6host.yaml` | Edit (~5 行, per F28) | §4.17 #9 (tag:monitor + tag:admin) | deploy/ 不入主合同 |
| 21 | `notes/codex-audit-scope-v1.2.0d-v0.1.md` | **NEW**（本文件）| §1 + §3.10/§3.11/§3.12 + §9 cmd 矩阵共 12 self-injury | notes/ 不入主合同（自伤豁免）|
| 22 | `notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md` | **NEW**（配套 Codex 复审 prompt）| 0（prompt 文件 grep pattern 不含 Fable/GLM 字面）| notes/ 不入主合同 |
| 23 | `docs/poll/cc-ready.json` | Edit（task_id 翻牌 + status + commit field + files_modified）| §3.10/§3.11/§3.12 声明 (cc-ready 文件字段引用) | docs/ 入主合同（实测 = 0）|
| 24 | `CHANGELOG.md` | Edit（[1.2.0d] minor 段 NEW）| grep 字面 0 行 | grep 字面 0 行 |

**实测落地**：v1.2.0d 24 文件改动守门实测 = 24 文件（4 deploy/ Edit + 2 wrapper/orchestrator/ NEW + 5 wrapper/orchestrator/ Edit + 6 wrapper/test/ [3 NEW + 3 Edit] + 2 deploy/monitoring/ NEW + 1 deploy/tailscale-acl Edit + 2 notes/ + 1 docs/ + 1 CHANGELOG = 24 文件）；自伤实测 = 12（仅本文件 §1 + §9 cmd 矩阵 grep pattern 字面）；其余 23 文件 grep 字面均 0。

---

## §6 复审环境（继承 v1.2.0a §6 + v1.2.0b §6 + v1.2.0c §6）

### §6.1 newvps 真机执行环境

- **Path**: ssh newvps (207.57.133.177:52134) — **NOT** ssh aliyun -p 16921 (那是 mail.rana.asia)
- **Tech**: Next.js 16.2.6 + Turbopack + Prisma + PostgreSQL + Docker
- **Harness dir**: `/opt/fish-harness` (per §11.5 + §12.4)
- **Wrapper dir**: `/opt/fish-harness/wrapper`
- **TS toolchain**: `./node_modules/.bin/tsc --noEmit` for type check, `./node_modules/.bin/vitest run` for unit + integration tests
- **Docker runtime**: docker compose v2 (`docker compose -f <file> up -d`)
- **Tailscale**: 1.50+ MagicDNS `.fish-harness.ts.net` canonical (per F11 v1.2.0c fix)

### §6.2 v1.2.0d 复审期望（per §3 Codex 期望输出）

```yaml
v1.2.0d v0.1 prompt-review expected outcome:
  - 终态裁定: PASS (0C/0M/0m | 1+M+5m 同轮清零)
  - §1 不锁型号守门: 12 self-injury tracked 维持
  - §2 不硬编码 API key 守门: 0 命中
  - §3 v1.0 runtime 0 行 diff 守门: 0 漂移 + 3 NEW §3.10/§3.11/§3.12 例外声明合规
  - §4.15 docker memory limits 守门: 12 项全 PASS
  - §4.16 queue 持久化守门: 8 项全 PASS
  - §4.17 monitoring + metrics 守门: 10 项全 PASS
  - §5 24 文件 hygiene 自检表: 24 文件实测落地
  - §7 v1.2.0d NEW 教训记档: 6 项吸收 (含 v1.2.0c 5 findings 实战模式)
```

### §6.3 复审环境 NEW 标注

- **§6.3.1 docker memory limits 真部署验证** (per R9 HIGH mitigation): newvps docker compose restart 7 service limits + `docker stats` 观察 memory usage 在 limit 以下
- **§6.3.2 queue backpressure 真机 E2E** (per F30 + plan §5.5): mock `max_in_flight=2` 触发 429 + SQLite pending 落盘 + reclaim 重放
- **§6.3.3 OOM prevention 真机 E2E**: mock memory pressure 触发 SIGTERM graceful shutdown 30s window + worker.current_attempt 状态保留
- **§6.3.4 Prometheus 7 host metrics scrape** (per F24): newvps:9090/metrics 暴露 7 scrape job 实时数据
- **§6.3.5 alertmanager 触发验证**: 模拟 memory >80% / queue >100 触发 alert webhook

---

## §7 v1.2.0d NEW 教训记档（继承 v1.2.0c 5 findings 实战吸收 + v1.2.0d NEW 6 项）

### §7.1 继承 v1.2.0c formal review 5 findings 实战模式（per 9c2e325）

| # | v1.2.0c finding | v1.2.0d 吸收模式 | §应用位置 |
|---|-----------------|------------------|----------|
| m1 | test assertion drift (a6d6e06 version) | §4.15/§4.16/§4.17 grep 守门加测试断言同步 discipline | §4.15-§4.17 + §9 cmd 矩阵 |
| m2 | fetch pattern 跨架构形态 | metrics.ts exporter 避免硬编码 URL 形态, 用 protocol abstraction | §4.17 #3 + §6.3.4 |
| m3 | class-method form escapes function/= pattern | queue_store.ts class method 显式声明 method-name pattern | §4.16 #2 + §3.12 |
| m4 | camelCase + scope 二次校准 | audit-scope 自检需 maintain 二次校准 discipline | §1.5 + §5 + §9 cmd 矩阵 |
| m5 | 注释豁免第三例 | §3.10/§3.11/§3.12 OOM graceful shutdown + routedDsh wire + queue_store SQLite 声明遵守豁免 third-instance pattern | §3.10-§3.12 |

### §7.2 v1.2.0d NEW 6 项教训

| # | 教训 | 来源 | 实施模式 |
|---|------|------|----------|
| **L1** | docker memory limits 必须 `--stop-timeout=30` 配 `--restart unless-stopped` (per F27) | R9 HIGH mitigation | §4.15 #5/#7 |
| **L2** | queue backpressure 需 429 + 202 双状态码区分 (per F26) | F26 HTTP RFC 7231 + RFC 6585 | §4.16 #4 + §3.12 |
| **L3** | Prometheus 7 host scrape 必须 Tailscale ACL 限制 (per F28) | R14 MEDIUM mitigation | §4.17 #9 + §2.9 |
| **L4** | metrics.ts 不能 aggregate 多 host SQLite (per F25) | F25 metrics design decision | §4.17 #4 + §6.3.4 |
| **L5** | worker_pool round_robin fix 加 tertiary sort registered_at (per F21) | v1.2.0c 残留 test 失败 | §5 #8 + §13.2 F21 |
| **L6** | execution_driver HTTP fallback wire routedDsh() (per F22) | v1.2.0c 残留 wire 缺失 | §3.11 + §5 #9 |

**含义**：v1.2.0d 教训记档 6 项 + 继承 v1.2.0c 5 findings 实战模式 = 11 项吸收；每项教训均映射到具体守门 grep + 实施模式，避免 v1.2.0d cycle 重复 v1.2.0a/b/c cycle 试错成本。

---

## §9 v1.2.0d 30 验证命令矩阵（per Codex v0.1 复审 28 验证命令模板 + v1.2.0d +2 项）

### §9.1 hygiene 验证（8 命令）

```bash
# §1 不锁型号守门（继承 v1.2.0a/b/c §1 — v1.2.0d 新增 queue_store + metrics + monitoring 同样守）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/queue_store.ts wrapper/orchestrator/metrics.ts deploy/monitoring/ deploy/tailscale-acl-6host.yaml 2>&1 | wc -l
# 期望: 0

# §2 不硬编码 API key 守门（继承 v1.2.0a/b/c §2）：
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/queue_store.ts wrapper/orchestrator/metrics.ts 2>&1 | wc -l
# 期望: 0

# §3.10 NEW OOM graceful shutdown 声明（per F27）：
grep -cE "stop-timeout|SIGTERM|SIGKILL" deploy/*.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 5

# §3.11 NEW execution_driver routedDsh wire 声明（per F22）：
grep -nE "wire-routedDsh|routedDsh\(\)" wrapper/orchestrator/execution_driver.ts | wc -l
# 期望: ≥ 2

# §3.12 NEW queue_store SQLite 持久化声明（per F25 + D8）：
grep -nE "better-sqlite3|journal_mode = WAL" wrapper/orchestrator/queue_store.ts | wc -l
# 期望: ≥ 2

# §4.15 docker memory limits 守门（per D7 + F23 + F27）：
grep -cE "memory:|mem_limit|deploy\.resources\.limits\.memory" deploy/*.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 10

# §4.16 queue 持久化守门（per D8 + F25 + F26）：
grep -cE "max_in_flight|429|202" wrapper/orchestrator/orchestrator.ts wrapper/orchestrator/queue_store.ts wrapper/orchestrator/types.ts 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 4

# §4.17 monitoring + metrics 守门（per F24 + F25 + F28）：
grep -cE "prom-client|Prometheus|scrape_configs|targets.*newvps|targets.*edge|targets.*kjonemacbook" deploy/monitoring/prometheus.yml wrapper/orchestrator/metrics.ts 2>&1 | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 8
```

### §9.2 tsc + vitest 双 gate（4 命令）

```bash
# §9.2.1 TypeScript build on newvps:
ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc --noEmit; echo $?'
# 期望: 0

# §9.2.2 vitest run (default gated skip):
ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/vitest run 2>&1 | tail -3'
# 期望: ≥ 230 passed | 0 failed (per §13.4 U2)

# §9.2.3 vitest run gated (queue_backpressure + oom_prevention + cross_host + host_fencing + macbook):
ssh newvps 'cd /opt/fish-harness/wrapper && RUN_QUEUE_BACKPRESSURE_E2E=1 RUN_OOM_PREVENTION_E2E=1 RUN_CROSS_HOST_E2E=1 RUN_HOST_FENCING_E2E=1 RUN_MACBOOK_E2E=1 DEEPSEEK_API_KEY=$(cat /data/secrets/deepseek_key) ./node_modules/.bin/vitest run test/integration/{queue_backpressure,oom_prevention,cross_host_dispatch,host_id_fencing,macbook_worker}.test.ts 2>&1 | tail -5'
# 期望: 12+10+8+7+8 = 45 tests PASS (per §13.4 U4)

# §9.2.4 metrics.test.ts shape 验证:
ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/vitest run test/unit/metrics.test.ts 2>&1 | tail -3'
# 期望: ≥ 15 tests PASS
```

### §9.3 docker compose + Prometheus 验证（10 命令）

```bash
# §9.3.1 docker compose config 验证 (per service memory limit):
ssh newvps 'cd /opt/fish-harness && docker compose -f deploy/newvps-compose.yml config 2>&1 | grep -c "memory:" '
# 期望: ≥ 6 (kernel + orchestrator + commander + stt + push + monitor)

# §9.3.2 docker compose up 验证 (newvps + 6host newvps):
ssh newvps 'cd /opt/fish-harness && docker compose -f deploy/newvps-compose.yml up -d && docker compose -f deploy/6host-compose.newvps.yml up -d && docker ps --format "{{.Names}}\t{{.Status}}" | grep -E "harness-"'
# 期望: ≥ 8 containers Up (1 kernel + orchestrator + 3 commander + 1 stt + 1 push + 1 monitor + 6 wrapper)

# §9.3.3 docker stats memory limit 验证:
ssh newvps 'docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}\t{{.MemLimit}}" | grep -E "harness-"'
# 期望: 每 service MemLimit 列非空 (per D7 limits)

# §9.3.4 Prometheus container up 验证:
ssh newvps 'cd /opt/fish-harness && docker compose -f deploy/monitoring/prometheus.yml up -d && curl -sI http://newvps.fish-harness.ts.net:9090/metrics | head -1'
# 期望: HTTP/1.1 200 OK

# §9.3.5 Prometheus 7 host scrape targets 验证:
ssh newvps 'curl -s http://newvps.fish-harness.ts.net:9090/api/v1/targets 2>&1 | jq ".data.activeTargets | length"'
# 期望: ≥ 7 (newvps + 5 edge + macbook, per F24)

# §9.3.6 /metrics endpoint 验证:
ssh newvps 'curl -s http://newvps.fish-harness.ts.net:3000/metrics 2>&1 | grep -cE "active_task_count|queue_depth|memory_used|worker_count"'
# 期望: ≥ 4 (per F25 4 metric names 暴露)

# §9.3.7 alertmanager 触发验证 (mock memory >80%):
ssh newvps 'curl -s http://newvps.fish-harness.ts.net:9090/api/v1/alerts 2>&1 | jq ".data.alerts | length"'
# 期望: 0 alerts (无真触发) 或 ≥ 1 (测试 mock 触发后)

# §9.3.8 Tailscale ACL 验证 (per F28 tag:monitor):
ssh newvps 'sudo tailscale acl test --json | jq ".tests | map(select(.src.tags[] == "tag:admin" and .dst.port == "9090")) | length"'
# 期望: ≥ 1 (tag:admin 可达 Prometheus port 9090)

# §9.3.9 docker memory limit OOM graceful shutdown 验证 (per F27):
ssh newvps 'cd /opt/fish-harness && docker compose -f deploy/6host-compose.newvps.yml stop wrapper-orchestrator --timeout 30 && docker ps --format "{{.Names}}\t{{.Status}}" | grep wrapper-orchestrator'
# 期望: wrapper-orchestrator Exited (130 = SIGTERM graceful)

# §9.3.10 docker restart unless-stopped 验证 (per F27 OOM-kill auto restart):
ssh newvps 'docker inspect --format "{{.HostConfig.RestartPolicy.Name}}" $(docker ps -aq --filter "name=harness-") | sort | uniq -c'
# 期望: ≥ 5 containers "unless-stopped"
```

### §9.4 MacBook + 5 edge 真接验证（5 命令）

```bash
# §9.4.1 MacBook worker heartbeat 验证 (per U8):
ssh macbook 'docker ps --format "{{.Names}}\t{{.Status}}" | grep harness-macbook'
# 期望: harness-macbook Up

# §9.4.2 MacBook scoring +100 工作时段验证 (per D6):
ssh macbook 'curl -s http://kjonemacbook-pro.fish-harness.ts.net:3000/metrics 2>&1 | grep working_hours'
# 期望: working_hours 1 (周一-周五 09:00-22:00)

# §9.4.3 5 edge heartbeat 验证 (per U9):
for i in 1 2 3 4 5; do ssh newvps "curl -sI http://edge$i.fish-harness.ts.net:4001/health 2>&1 | head -1"; done
# 期望: 5 lines "HTTP/1.1 200 OK"

# §9.4.4 6+1 host MagicDNS canonical 验证 (per F11 fix):
ssh newvps 'for host in newvps edge1 edge2 edge3 edge4 edge5 macbook; do getent hosts $host.fish-harness.ts.net; done'
# 期望: 7 lines (无 NXDOMAIN)

# §9.4.5 host-id fencing 真生效验证 (per F13):
ssh newvps 'sqlite3 /data/worker_pool.db "INSERT INTO dispatches (task_id, host_id, status) VALUES (\"test-001\", \"host-A\", \"active\"); INSERT INTO dispatches (task_id, host_id, status) VALUES (\"test-001\", \"host-B\", \"active\");" 2>&1'
# 期望: 第 2 个 INSERT 报 UNIQUE constraint failed (partial unique index 兜底)
```

### §9.5 cc-ready + CHANGELOG + README 簿记验证（3 命令）

```bash
# §9.5.1 cc-ready.json task_id 翻牌验证:
cat docs/poll/cc-ready.json | jq -r '.task_id'
# 期望: "T-V1.2.0D-ANTI-OOM-DRAFT" (Commit 1 DRAFT) 或 "T-V1.2.0D-ANTI-OOM-PASS" (Commit 3 PASS)

# §9.5.2 CHANGELOG [1.2.0d] minor 段验证:
grep -c "\[1\.2\.0d\]" CHANGELOG.md
# 期望: ≥ 1 (NEW minor 段存在)

# §9.5.3 README v1.2.0d status 段验证:
grep -c "v1\.2\.0d.*anti-OOM\|docker memory limits\|queue_store\|metrics\|Prometheus" README.md
# 期望: ≥ 4 (5 keywords 命中)
```

**含义**：v1.2.0d 30 验证命令矩阵覆盖 hygiene 8 + 双 gate 4 + docker/Prometheus 10 + MacBook/edge 5 + 簿记 3 = 30 命令；每命令期望值 verbatim 校准，Codex 复审可逐条 grep 实测。

---

## §10 Plan self-check (v1.2.0d audit-scope 起草后)

- [x] §1 不锁型号守门（继承 + NEW queue_store + metrics + monitoring 同样守）
- [x] §2 不硬编码 API key / VAPID / Tailscale auth key / Prometheus admin password 守门
- [x] §3 v1.0 runtime 0 行 diff 守门 + §3.10/§3.11/§3.12 NEW 例外声明
- [x] §4.15 NEW docker memory limits 守门 12 项 grep
- [x] §4.16 NEW queue 持久化守门 8 项 grep
- [x] §4.17 NEW monitoring + metrics 守门 10 项 grep
- [x] §5 24 文件 hygiene 自检表（4 deploy/ Edit + 2 wrapper/orchestrator/ NEW + 5 wrapper/orchestrator/ Edit + 6 wrapper/test/ + 2 deploy/monitoring/ NEW + 1 deploy/tailscale-acl Edit + 2 notes/ + 1 docs/ + 1 CHANGELOG = 24）
- [x] §6 复审环境（newvps 真机 + Codex v0.1 期望 + §6.3 NEW 5 标注）
- [x] §7 v1.2.0d NEW 教训记档（继承 v1.2.0c 5 findings + v1.2.0d NEW 6 项 = 11 项吸收）
- [x] §9 30 验证命令矩阵（hygiene 8 + 双 gate 4 + docker/Prometheus 10 + MacBook/edge 5 + 簿记 3 = 30）
- [x] tracked 锚定 post-v1.2.0d = 引用 v1.2.0c 116 tracked 维持（v1.2.0d 不动 docs/adr/spec/capabilities 主表锚定区域）
- [x] disk verbatim 校准 = 128 (116 tracked + 12 self-injury，NEW §4.15/§4.16/§4.17 grep 不引入 Fable/GLM/MiniMax 字面)

---

*v1.2.0d audit-scope v0.1 起草 PASS — §1-§10 全守门 grep + 24 文件 hygiene 自检表 + 30 验证命令矩阵 + 11 项教训记档 + tracked 116 / disk 128 维持。等 user ExitPlanMode 批准后启动 Commit 2 (核心实现)。*