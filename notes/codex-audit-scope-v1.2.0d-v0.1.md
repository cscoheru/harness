# Codex audit-scope v1.2.0d — DeepSeek HTTP 直调 + Anti-OOM

> **Cycle**: v1.2.0d (per Debian stable point release, boundary commit `9781dcc` — v1.2.0d.2 cost-mode 收口; m2 GATE-CALIB per v0.1 prompt-review: 起草误写 9c2e325 = v1.2.0c formal 收口, 35fd9d0 已将 d.1 boundary 校准为 eff9da8, 本轮真起跑点 = 9781dcc)
> **Trigger**: user 2026-09-08 「选 A:wrapper 直调 DeepSeek HTTP API」+ v1.2.0e 3-host 真接闭环 (d 链内合并, 见 §1.1 E 块) + v1.2.0d.2 cost-mode PASS (`9781dcc`)
> **继承**: v0.7 audit-scope hygiene 守门 + v1.2.0a/b/c/d.2 已立守门 + §4.15/§4.16/§4.17/§4.18 NEW v1.2.0d 守门
> **目标**: 24 文件改动 (per plan §5) + 4 commits + 8 user EXEC + 1 tag v1.2.0d
> **v0.1 prompt-only** (Codex 反馈本 audit-scope, 等 Codex 报 0C/0M/0m 后启动 commit 2)

---

## §1 Context & 变更边界

### §1.1 v1.2.0d 4 大块(per plan §2)

| Block | 估文件 | scope |
|-------|--------|-------|
| A: DeepSeek HTTP 直调 | 6 (3 NEW + 3 EDIT) | D16/D17 决策 — wrapper 直调 api.deepseek.com 绕开 dsh binary |
| B: docker memory limits | 8 (8 EDIT) | D7 决策 — 7 service 全 limits + --stop-timeout=30 |
| C: queue backpressure | 4 (2 NEW + 2 EDIT) | D8 决策 — in-memory + SQLite 落盘 |
| D: Prometheus monitoring | 6 (4 NEW + 2 EDIT) | D9 决策 — 7 host scrape + 3 alert rules |
| v1.2.0e 合并 | 5 (3 NEW + 2 EDIT) | per user 选 A 决策, 5 文件并入 commit 2 |

### §1.2 不动范围(v1.2.0d cycle 不触)

- `harness/`、`spec/`、`spikes/`、9 ADR body、`ADR 0010`、`Dockerfile`、`docker-compose.yml`、`pyproject.toml`
- 10 ADR body immutable (per T-DD-6 冻结规则)
- v1.0 runtime kernel 不变 (per ADR 0010 Decision d)
- 旧 `wrapper/dsh/dsh_client.ts` deprecated 但保留 (向后兼容 re-export `deepseekInvoke as callDshHeadless`)

### §1.3 tracked 锚定(post-v1.2.0d)

| 类别 | 数量 | 说明 |
|------|------|------|
| tracked 文件 | 116 (维持 v1.2.0d.2 数) | 24 v1.2.0d NEW+EDIT 加 9 v1.2.0c 维持 + 5 v1.2.0b 维持 + ... |
| self-injury | **1** (m1 GATE-CALIB per v0.1 prompt-review: 本合同重写后旧 12 处自伤字面全灭, 实测 §3.2.1 pattern 行 1 处) | §6 self-injury 表(per v0.7 hygiene §4.5) |
| disk verbatim | **117** (m1 同步: 116 tracked + 1 自伤; 旧 128 含已灭的 11 处旧自伤) | §6 disk 引用式块(per v1.2.0b m1 hygiene) |

---

## §2 关键发现 F31-F40(v1.2.0d cycle 实操前必须吸收)

| # | 发现 | 影响 | 解决 |
|---|------|------|------|
| **F31** | `wrapper/dsh/dsh_client.ts:146-162` `buildArgs()` 用 `--model` flag + `--profile headless`;`execution_driver.ts:166-185` `spawnDsh()` 同款死命令 | dsh 0.1.1-rc.2 拒 `--model` flag;只有 `web` profile,无 headless CLI execution path | D16 决策 = deepseek_client.ts 新模块,fetch OpenAI-compatible HTTP API,绕开 dsh binary |
| **F32** | newvps wrapper 容器没装 dsh binary → dispatch E2E 报 `spawn dsh ENOENT` (per v1.2.0e memory) | orchestrator `runDsh()` → dsh_client → spawn 死锁 | D16 修法:deepseek_client 直调 api.deepseek.com, 容器不需 dsh binary |
| **F33** | `wrapper/orchestrator/execution_driver.ts:232-282` `streamRoutedDshFallback()` 已 wire (F22 option A) | routedDsh 已 import `./6host_router.js`, 但 `routedDsh()` 实际仍是调 callDshHeadless() 本地 (per plan §4 F12) | D16 修法:routedDsh fallback 也改 deepseekInvoke; ExecutionDriver 双重路径(subprocess + routedDsh)都走 deepseek_client |
| **F34** | dsh_client.ts 14 unit tests 全部测 `callDshHeadless()` shape | 全改 deepseekInvoke 后会断 | D16 re-export `callDshHeadless = deepseekInvoke` 维持兼容; 加 deprecation JSDoc + 后续 cycle 逐步迁移 |
| **F35** | `wrapper/orchestrator/orchestrator.ts:412-422` `runDsh()` 调 `callDshHeadless` | 同 F34 | 替换为 `deepseekInvoke`, 直接 import deepseek_client.ts |
| **F36** | `wrapper/orchestrator/workflow_pack.ts:136` 调 `callDshHeadless` | 同 F34 | 同上替换 |
| **F37** | `wrapper/dsh/6host_client.ts:233` `'dsh'` 字面 + callDshHeadless 同链路 | 同 F34 | dsh_client.ts 内部走 deepseek_client.ts (re-export), 6host_client.ts 不变 |
| **F38** | 7 service 现有 mem_limit 已部分存在 (per v1.2.0d plan F23 kernel 256M + others) | docker memory limits 已部分就位 | D7 校准所有 7 service 全 limits + 加 --stop-timeout=30 + 调整一些 service memswap |
| **F39** | `wrapper/orchestrator/worker_pool.ts` 用 better-sqlite3 WAL per-host file (v1.2.0b 已就) | queue_store.ts 复用同 pattern | D8 复用 v1.2.0b pattern: per-host file + WAL + busy_timeout=5000 |
| **F40** | prom-client 是 Node.js 标准 Prometheus library, 已部署在 many fish-harness-equivalent 项目 | metrics.ts 直接 import `prom-client` 无新依赖 | D9 metrics.ts 用 prom-client + Registry + Counter/Gauge 4 个 metric |

---

## §3 实操机制(per Codex 期望输出)

### §3.1 §0 终态裁定

**0C/0M/0m PASS**: 24 文件改动 + 4 commits + 8 user EXEC + 1 tag + tracked = 116 + self-injury = **1** + disk = **117** verbatim PASS (m1 GATE-CALIB: 重写后口径重锚, per v0.1 prompt-review)

### §3.2 §1 hygiene 28 项 checklist

#### §3.2.1 模型型号锁 (per F9 + v0.7 §4.5)

```
grep -rE "MiniMax-M3|GLM 5.3|Fable 5" wrapper/ docs/m0b/ deploy/ 2>&1 | grep -v "host_fencing" | wc -l  # == 0 (m1 GATE-CALIB per v0.1 prompt-review: ①去 notes/ — 历史档 143 处必恒红, notes 侧由三源公式锚定; ②豁免 host_fencing 守门自检注释 3 处(src+build 产物, v1.2.0c fencing 合规声明, per d.1 原版精确 pathspec 精神 — 起草扩 wrapper/ 引入))
grep -rE "deepseek-v4-(pro|flash)" wrapper/dsh/deepseek_client.ts  # ≥ 3 (3 role defaults; post-commit-2)
grep -c "model.*deepseek-v4-flash" docs/m0b/profile-override-*.yaml  # == 4 (m5 GATE-CALIB: 实测 commander 2 + worker 2; base/orch 0 — 起草误写 3)
```

#### §3.2.2 v1.0 runtime 0 行 diff (per ADR 0010 Decision d)

```
git diff 9781dcc..HEAD -- harness/ spec/ Dockerfile docker-compose.yml pyproject.toml 2>&1 | wc -l  # == 0 (m2 GATE-CALIB per v0.1 prompt-review: 起草误写 HEAD~24..HEAD — 实测 HEAD~24=0bfa73b 落 v1.2.0c 中段 diff 170 行必恒红; boundary 单义化 = 本轮起跑点 9781dcc, post-commit-2 跑)
```

#### §3.2.3 §4.5-§4.9 v0.7 hygiene 8 项(per plan §3.10 NEW dsh binary 移除声明)

```
# §4.5 no hardcoded keys
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/dsh/ wrapper/orchestrator/ 2>&1 | wc -l  # == 0

# §4.6 STT 守门 (新vps only)
grep -c "WHISPER_MODEL_PATH" deploy/6host-compose.edge*.yml deploy/3host-compose.worker.yml deploy/macbook-compose.yml 2>&1 | wc -l  # == 0

# §4.7 Web Push VAPID env-inject only
grep -rE "vapid_private_key.*=" deploy/tailscale-acl-6host.yaml wrapper/orchestrator/webpush_gateway.ts | wc -l  # == 0

# §4.8 sleep infinity 守门
grep -rE "sleep infinity" deploy/ | wc -l  # == 0

# §4.9 container_name 引用
grep -c "container_name:" deploy/6host-compose.newvps.yml deploy/3host-compose.worker.yml | wc -l  # ≥ 7
```

#### §3.2.4 §4.10 v1.2.0a commander 真实现守门(维持)
#### §3.2.5 §4.11 v1.2.0b worker 真实现守门(维持)
#### §3.2.6 §4.12/§4.13/§4.14 v1.2.0c cross-host + MacBook + fencing 守门(维持)

### §3.3 §4.15 NEW DeepSeek HTTP 直调守门 14 项(per plan §2 commit 1 §4.15)

```
test -f wrapper/dsh/deepseek_client.ts  # NEW (per D16)
grep -c "deepseek.com/v1/chat/completions\|api.deepseek.com" wrapper/dsh/deepseek_client.ts  # ≥ 3
grep -c "DEEPSEEK_API_KEY" wrapper/dsh/deepseek_client.ts  # ≥ 3
grep -rE "spawn.*dsh|child_process.spawn\(['\"]dsh" wrapper/orchestrator/execution_driver.ts | wc -l  # == 0
grep -c "deepseek_client\|deepseekInvoke" wrapper/orchestrator/execution_driver.ts  # ≥ 4
grep -rE "--profile|--model" wrapper/dsh/dsh_client.ts | wc -l  # == 0 (deprecation 注释除外)
grep -rE "model_id.*deepseek-v4-(pro|flash)" wrapper/dsh/deepseek_client.ts | wc -l  # ≥ 3
grep -c "model.*deepseek-v4-flash" docs/m0b/profile-override-*.yaml  # == 3
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/dsh/deepseek_client.ts | wc -l  # == 0
grep -c "DEEPSEEK_COST_MODE\|resolveModelOverride" wrapper/dsh/deepseek_client.ts  # ≥ 2 (cost-mode 沿用)
grep -c "AbortSignal.timeout\|timeoutMs" wrapper/dsh/deepseek_client.ts  # ≥ 2 (timeout 沿用 dsh_client)
grep -c "DshResponse\|tokenUsage" wrapper/dsh/deepseek_client.ts  # ≥ 4 (兼容 shape)
test -f wrapper/test/unit/deepseek_client.test.ts  # NEW
grep -c "describe\|it(" wrapper/test/unit/deepseek_client.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 40
```

### §3.4 §4.16 NEW docker memory limits 守门 12 项(per plan §2 commit 1 §4.16)

```
grep -c "mem_limit" deploy/newvps-compose.yml deploy/6host-compose.newvps.yml deploy/6host-compose.edge*.yml deploy/macbook-compose.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'  # ≥ 10 (M3 GATE-CALIB per v0.1 prompt-review: 起草误写 `memory:` — compose 全 mem_limit 形态, `memory:` 实测 0 必恒红; 实测 18)
grep -c "mem_limit\|deploy.resources.limits.memory" deploy/*.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'  # ≥ 7
grep -c "cpus:" deploy/newvps-compose.yml deploy/6host-compose.newvps.yml  # ≥ 4 (post-commit-2: B 块 CPU limits 待加, 现实测 0 — commit 2 前跑必红, 勿在起草期误判)
grep -c "stop-timeout\|stop_grace_period" deploy/*.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'  # ≥ 5 (M3 GATE-CALIB: compose 原生字段为 stop_grace_period, `stop-timeout` CLI 字面实测 2; 复合实测 10 — per v1.2.0d.1 formal M1 教训)
grep -cE "256M" deploy/newvps-compose.yml  # ≥ 1 (kernel smoke limit, per F23)
grep -c "memswap_limit\|memswap" deploy/*.yml  # ≥ 7
```

### §3.5 §4.17 NEW queue 持久化守门 8 项(per plan §2 commit 1 §4.17)

```
test -f wrapper/orchestrator/queue_store.ts  # NEW
grep -c "better-sqlite3\|Database" wrapper/orchestrator/queue_store.ts  # ≥ 4
grep -c "WAL\|busy_timeout\|journal_mode" wrapper/orchestrator/queue_store.ts  # ≥ 3
grep -c "202\|Retry-After\|Location" wrapper/orchestrator/queue_store.ts wrapper/orchestrator/orchestrator.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 3
grep -cE "MAX_IN_FLIGHT|maxInFlight" wrapper/orchestrator/queue_store.ts  # ≥ 1 (M5 GATE-CALIB per v0.1 codex-run: 起草锚 orchestrator.ts `max_in_flight` — 字面真身 queue_store.ts L41-92 (DEFAULT_MAX_IN_FLIGHT=50 + QUEUE_MAX_IN_FLIGHT env + maxInFlight field), orchestrator 侧走 tryEnqueueOrThrottle 间接链, 原守门 post-commit-2 也恒 0 红 — pattern 锚定落地物, v1.2.0d.1 M2 同型; 实测 4)
grep -c "queue_depth\|active_task_count" wrapper/orchestrator/metrics.ts wrapper/orchestrator/queue_store.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 4
test -f wrapper/test/unit/queue_store.test.ts  # NEW
test -f wrapper/test/integration/queue_backpressure.test.ts  # NEW gated
```

### §3.6 §4.18 NEW monitoring 守门 10 项(per plan §2 commit 1 §4.18)

```
test -f wrapper/orchestrator/metrics.ts  # NEW
test -f deploy/monitoring/prometheus.yml  # NEW
test -f deploy/monitoring/runbook.md  # NEW
grep -cE "prom-client|Prometheus|register" wrapper/orchestrator/metrics.ts  # ≥ 4
grep -c "active_task_count\|queue_depth\|memory_used\|worker_count" wrapper/orchestrator/metrics.ts  # ≥ 4
grep -c "scrape_configs" deploy/monitoring/prometheus.yml  # ≥ 1
grep -cE "targets.*newvps|edge[1-5]|kjonemacbook-pro" deploy/monitoring/prometheus.yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 7 (实测 19; newvps 为多行 targets 列表形态, `targets.*newvps` 行内失配由 edge/macbook 单行兜底 — per v1.2.0d.1 m3)
grep -c "alert:" deploy/monitoring/alerts.yml  # == 3 (M3 GATE-CALIB per v0.1 prompt-review: `alert|Alert` 对 prometheus.yml 结构行假绿(实测 7), 3 条规则真身在 alerts.yml — per v1.2.0d.1 formal M2)
grep -cE "memory_used_mb > 819|queue_depth > 100|worker_count < 1" deploy/monitoring/alerts.yml  # ≥ 3 (M3 同步: 条件真身 alerts.yml 实测 4; 起草误指 prometheus.yml 实测 1 必红; summary 注释同字面可超)
grep -cE "tag:monitor|tag:admin" deploy/tailscale-acl-6host.yaml  # ≥ 2
```

### §3.7 §3.10 NEW dsh binary 移除声明(per F31/F32)

```
grep -rE "child_process.spawn\(['\"]dsh" wrapper/orchestrator/execution_driver.ts  # == 0
grep -rE "'dsh'|\"dsh\"" wrapper/orchestrator/execution_driver.ts | grep -vE "^\s*[^:]+:[0-9]+:\s*(\*|//|#)" | wc -l  # == 0 (m4 GATE-CALIB per v0.1 prompt-review + codex-run 数字校准: 「注释除外」不可 grep 验证 — 排除注释行后判活代码; 实测 1 处 L44 DEFAULT_DSH_BIN, post-commit-2 迁移后 == 0)
grep -c "deepseekInvoke\|deepseek_client" wrapper/orchestrator/execution_driver.ts  # ≥ 4
grep -c "deepseekInvoke" wrapper/orchestrator/orchestrator.ts wrapper/orchestrator/workflow_pack.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 2
grep -c "@deprecated" wrapper/dsh/dsh_client.ts  # ≥ 1 (deprecated JSDoc)
grep -c "export.*deepseekInvoke.*as.*callDshHeadless" wrapper/dsh/dsh_client.ts  # ≥ 1 (向后兼容 re-export)
```

### §3.8 引用式机制落地验证(8 处 per plan §2 commit 1)

每条引用式必须实测校验:
1. `deploy/3host-compose.worker.yml` extra_hosts + .fish-harness.ts.net URL → aliyun 容器内 fetch OK(per v1.2.0e 闭环)
2. `deploy/6host-compose.newvps.yml` dns: 100.100.100.100 + extra_hosts → newvps orchestrator 拿 7 host 列表
3. `deploy/3host-compose.worker.yml` mem_limit: 1G → docker stats 验证
4. `wrapper/orchestrator/queue_store.ts` SQLite WAL → docker exec 验证 PRAGMA journal_mode=WAL
5. `wrapper/orchestrator/metrics.ts` prom-client /metrics endpoint → curl http://localhost:3000/metrics
6. `deploy/monitoring/prometheus.yml` 7 scrape jobs → prometheus up 状态 7 全 Up
7. `wrapper/dsh/deepseek_client.ts` fetch api.deepseek.com → 真机 E2E dispatch 拿真实 DeepSeek response
8. `deploy/tailscale-acl-6host.yaml` tag:monitor 段 → tailscale acl test PASS

---

## §4 Codex 期望输出格式

### §4.1 报告格式

`notes/codex-review-v1.2.0d-v0.1-formal-report.md`:
- §0 终态裁定:0C/0M/0m OR 1+/M+/5m+ 同轮分类
- §1 hygiene 28 项:每项 PASS/FAIL
- §2 §3.3-§3.7 守门:每 grep PASS/FAIL
- §3 引用式机制 8 处:每处实测 PASS/FAIL
- §4 §3.2.1-§3.2.6 hygiene 守门:每项 PASS/FAIL
- §5 v0.7 §4.5-§4.9 8 项:每项 PASS/FAIL
- §6 self-injury 1 项 + disk verbatim 117 项:每项 PASS/FAIL (m1 GATE-CALIB: 重写后口径重锚, 见 §1.3)
- §7 教训记档(per plan §7 6 项)

### §4.2 期望结果

| 维度 | 期望 | 不期望 |
|------|------|--------|
| Critical | 0 | 1+ 同轮 |
| Major | 0 | 1+ 同轮 |
| Minor | 0 | 5+ 同轮 (cosmetic) |
| Format | `notes/codex-review-v1.2.0d-v0.1-formal-report.md` | inline only |
| Hygiene | 28/28 PASS | 27/28 PASS (1 误判 critical) |
| 守门 | §3.3-§3.7 全 PASS | 任何 1 误判 critical |
| 引用式 | §3.8 8 处全 PASS | 任何 1 未实测报 PASS |

---

## §5 v1.2.0d NEW 教训记档(per plan §7)

| 教训 | 内容 |
|------|------|
| **L1** dsh 0.1.1-rc.2 无 headless CLI | wrapper 当前 spawn dsh 是死命令,deepseek 直调已绕开;v1.2.0e 3-host 真接后 spawn ENOENT 暴露 |
| **L2** v1.2.0e extra_hosts + env URL 一致用 .fish-harness.ts.net | 绕开 c-ares + tailscaled UDP 不可达双重坑,3 host 持久 heartbeat |
| **L3** docker DNS snapshot 静态 (systemd-resolved 重启不同步) | compose dns: 强制注入 + extra_hosts 兜底 |
| **L4** 7 service memory limits 校准 (per F23 kernel 256M smoke) | 跟 v0.7 hygiene 守门 + ADR 0010 kernel frozen 维持 |
| **L5** Prometheus 7 scrape + 3 alert rules | thresholds 校准 (memory > 80% / queue > 100 / worker offline > 5min) |
| **L6** DeepSeek HTTP API rate limit / 429 | Retry-After header 解析 + exponential backoff (max 3 retries) |

---

## §6 验证命令矩阵(30 条 per plan §2 commit 1)

```bash
# §3.2 hygiene 28 项 (略, per plan §3.2.1-§3.2.6)
# §3.3 §4.15 DeepSeek 直调 14 项 (略)
# §3.4 §4.16 docker memory limits 12 项 (略)
# §3.5 §4.17 queue 持久化 8 项 (略)
# §3.6 §4.18 monitoring 10 项 (略)
# §3.7 §3.10 dsh binary 移除声明 (略)
# §3.8 引用式机制 8 处 (略)
# 累计 70+ 实测命令, 全 commit 2 后跑
```

---

## §7 计划摘要

- **commit 1**: 本 audit-scope + prompt 起草, 翻牌 cc-ready.json
- **commit 2**: 24 文件改动 (per plan §5: 3 NEW + 6 EDIT A 块 / 8 EDIT B 块 / 2 NEW + 2 EDIT C 块 / 4 NEW + 2 EDIT D 块 / 5 file v1.2.0e 合并)
- **commit 3**: 7 host 真接 + 107+ gated 真跑 + E2E 闭环
- **commit 4**: 簿记 (cc-ready + CHANGELOG + README) + tag v1.2.0d @ 本轮收口 commit (m2 GATE-CALIB: 起草误写 @ boundary 9c2e325 — tag 打在收口点非起跑点, per v1.2.0a/b @289e7eb 用户决策先例除外)
- **user EXEC**: U1-U8 (8 项 per plan §3)
- **Codex review**: 0C/0M/0m (per §4.2 期望)

---

*audit-scope v1.2.0d 起草完成 (2026-09-08 v1.2.0e 3-host 闭环 + user 选 A 决策后启动) — D7/D8/D9/D16/D17/D18 决策已锁 + F31-F40 关键发现 + §3.3-§3.7 NEW 守门 grep 模板 + §3.8 引用式机制 8 处 + 70+ 实测命令。等 Codex v0.1 反馈 0C/0M/0m 后启动 commit 2.*
