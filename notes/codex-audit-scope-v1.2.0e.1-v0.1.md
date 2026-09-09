# Codex audit-scope v1.2.0e.1 — 4 已知残留 cleanup

> **Cycle**: v1.2.0e.1 (cleanup sub-cycle, boundary commit `73f97fc` — v1.2.0d.4 EXEC 收口)
> **Trigger**: user 2026-09-09 「v1.2.0e.1 cleanup」 + v1.2.0d.4 cycle closure memory §4 残留 4 项
> **继承**: v0.7 audit-scope hygiene 守门 + v1.2.0d §4.15-§4.18 守门 + v1.2.0d.4 EXEC 实战 (U3-U7 5 步全 PASS)
> **目标**: ~20 文件改动 (per plan §5) + 2 commits + 7 user EXEC (U1-U7) + 1 tag v1.2.0e.1
> **v0.1 prompt-only** (Codex 反馈本 audit-scope; cleanup sub-cycle skip formal review per memory `fish-harness-v1.2.0d.1-cycle-closure.md` pattern)

---

## §1 Context & 变更边界

### §1.1 v1.2.0e.1 7 大块(per plan §5)

| Block | 估文件 | scope |
|-------|--------|-------|
| A: heartbeat dedup | 3 (3 EDIT) | D1 决策 — `worker_pool.register()` 加 host dedup (findActiveByHost 前置检查) |
| B: metrics worker_count wire | 3 (3 EDIT) | D2 决策 — `metrics.ts` startMetricsSampling 接 worker_pool.countActive() |
| C: Prometheus shared net | 4 (4 EDIT) | D3/D4 决策 — `docker network create deploy_harness_net` + 两 compose external:true + Tailscale ACL 4000-4003 取代 3000 |
| D: Edge webhook | 8 (4 NEW + 2 EDIT + 2 helper) | D5/D6 决策 — Node 最小 HTTP server :7777 + HMAC SHA-256 + systemd unit + install.sh + CI notify-edge job |
| E: DEEPSEEK key log | 2 (2 EDIT) | D8 决策 — startup truncated prefix (slice 0-7) + missing error |
| F: 类型 | 1 (1 EDIT) | `{worker_id, status: 'new'\|'already_active'}` + EdgeWebhook HMAC types |
| G: edge dns 顺手清 | 5 (5 EDIT) | D7 决策 — edge compose `dns: [100.100.100.100, 1.1.1.1, 8.8.8.8]` (同 newvps pattern) |

### §1.2 不动范围(v1.2.0e.1 cycle 不触)

- `harness/`、`spec/`、`spikes/`、9 ADR body、`ADR 0010`、`Dockerfile`、`docker-compose.yml` (root)、`pyproject.toml`
- 10 ADR body immutable (per T-DD-6 冻结规则)
- v1.0 runtime kernel 不变 (per ADR 0010 Decision d)
- 旧 `wrapper/dsh/dsh_client.ts` deprecated 维持 (per v1.2.0d)
- `wrapper/orchestrator/server.ts` register route handler 不动(per D1 worker_pool.register() 内 fix)

### §1.3 tracked 锚定(post-v1.2.0e.1)

| 类别 | 数量 | 说明 |
|------|------|------|
| tracked 文件 | ~120 (维持 v1.2.0d 数 +6 NEW) | 20 v1.2.0e.1 NEW+EDIT 加 4 v1.2.0e 新增 edge-webhook helper |
| self-injury | **0** (无新自伤, 沿 v1.2.0d.4 数) | §6 self-injury 表(per v0.7 hygiene §4.5) |
| disk verbatim | **117** (维持) | §6 disk 引用式块(per v1.2.0b m1 hygiene) |

---

## §2 关键发现 F41-F46(v1.2.0e.1 实操前必须吸收)

| # | 发现 | 影响 | 解决 |
|---|------|------|------|
| **F41** | `wrapper/orchestrator/worker_pool.ts:214-235` `register()` 总是 `randomUUID()` 创建新 row;无 host dedup | heartbeat_sender 10s 拍每次 register → 1392 stale rows(edge1 实证) | D1 修法:`findActiveByHost(host)` SELECT-then-INSERT 模式(SQLite 无 UPSERT);返回 status `already_active` |
| **F42** | `wrapper/orchestrator/metrics.ts:58-62` `workerCount` Gauge 声明但从未 set;`worker_pool.countActive()` (worker_pool.ts:199-201) 存在 | /metrics 端点 `worker_count 0`;Prometheus `worker_offline` alert 永久 fire | D2 修法:`startMetricsSampling()` 15s interval callback 内加 `workerCount.set(getDefaultWorkerPool().countActive())` |
| **F43** | `deploy/monitoring/docker-compose.yml:35` `monitoring_net` 是 local bridge;`deploy/6host-compose.newvps.yml:275-277` `harness_net` 也是 local bridge;两 compose 各自独立 | prometheus 在 monitoring_net 不可 reach wrapper 在 harness_net | D3 修法:`docker network create deploy_harness_net` + 两 compose 都 `external: true` join |
| **F44** | `deploy/tailscale-acl-6host.yaml:109-114` `tag:harness:3000,*` 与 scrape 目标 `:4000-4003` 不一致 | 即便 network 通, ACL 也 block | D4 修法:`tag:harness:4000,4001,4002,4003,*` 取代 3000 |
| **F45** | edge1=puer-hk `git log -1` HEAD = `57dae79` (v1.2.0b),落后 main 多个 cycle;`deploy/6host-compose.edge[1-3].yml:25` 用 `image: node:24-slim` + bind-mount `..:/app:ro`;`.github/workflows/deploy.yml` 推 GHCR 不触发 edge pull | edge host 跑 stale 代码;deploy.yml workflow 与 edge deploy 解耦 | D5/D6 修法:Node HTTP server :7777 + HMAC SHA-256 + systemd unit + CI notify-edge job SSH-style webhook POST |
| **F46** | `wrapper/dsh/deepseek_client.ts` 无 startup log;puer-hk 容器 env `DEEPSEEK_API_KEY=sk-347b9b09...` 与 user 真身 `sk-3f55470...` 漂移 | 排查 key 漂移靠 env grep 慢;grep hardcode 守门已 PASS 但 env 漂移无 log | D8 修法:startup `console.log(\`[deepseek] key_prefix=${key?.slice(0,7)}... key_len=${key?.length}\`)`;missing → `console.error` |

---

## §3 实操机制(per Codex 期望输出)

### §3.1 §0 终态裁定

**0C/0M/0m PASS**: ~20 文件改动 + 2 commits + 7 user EXEC + 1 tag + tracked = ~120 + self-injury = **0** + disk = **117** verbatim PASS

### §3.2 §1 hygiene 28 项 checklist (沿用 v1.2.0d 模板)

#### §3.2.1 模型型号锁 (per F9 + v0.7 §4.5)
```
grep -rE "MiniMax-M3|GLM 5.3|Fable 5" wrapper/ docs/m0b/ deploy/ 2>&1 | grep -v "host_fencing" | wc -l  # == 0
grep -rE "deepseek-v4-(pro|flash)" wrapper/dsh/deepseek_client.ts                                       # ≥ 3 (维持 v1.2.0d 数)
grep -c "model.*deepseek-v4-flash" docs/m0b/profile-override-*.yaml                                     # == 4 (维持)
```

#### §3.2.2 v1.0 runtime 0 行 diff (per ADR 0010 Decision d)
```
git diff 73f97fc..HEAD -- harness/ spec/ Dockerfile docker-compose.yml pyproject.toml 2>&1 | wc -l  # == 0
```

#### §3.2.3 §4.5-§4.9 v0.7 hygiene 8 项 (维持)
```
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/dsh/ wrapper/orchestrator/ 2>&1 | wc -l  # == 0
grep -c "WHISPER_MODEL_PATH" deploy/6host-compose.edge*.yml deploy/3host-compose.worker.yml deploy/macbook-compose.yml | wc -l  # == 0
grep -rE "vapid_private_key.*=" deploy/tailscale-acl-6host.yaml wrapper/orchestrator/webpush_gateway.ts | wc -l  # == 0
grep -rE "sleep infinity" deploy/ | wc -l  # == 0
grep -c "container_name:" deploy/6host-compose.newvps.yml deploy/3host-compose.worker.yml | wc -l  # ≥ 7
```

#### §3.2.4 §4.10-§4.14 v1.2.0a/b/c 守门 (维持)
#### §3.2.5 §4.15-§4.18 v1.2.0d 守门 (维持,不再重复)
#### §3.2.6 §4.19 v1.2.0d.2 DEEPSEEK_COST_MODE 三层优先级守门 (维持)

### §3.3 §4.20 NEW metrics worker_count 守门 6 项 (per plan §2 commit 1 §4.20)
```
grep -c "workerCount.set\|getDefaultWorkerPool\(\).countActive" wrapper/orchestrator/metrics.ts  # ≥ 2 (post-commit-2)
grep -rE "workerCount\." wrapper/orchestrator/metrics.ts | wc -l                                  # ≥ 3 (declared + set + reset path)
grep -rE "worker_count" wrapper/test/unit/metrics.test.ts | wc -l                                  # ≥ 2 (新测试断言)
```

### §3.4 §4.21 NEW prometheus cross-net 守门 10 项 (per plan §2 commit 1 §4.21)
```
grep -cE "deploy_harness_net|external: true" deploy/6host-compose.newvps.yml deploy/monitoring/docker-compose.yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 4 (双 compose × 2 处)
grep -cE "4000|4001|4002|4003" deploy/tailscale-acl-6host.yaml | awk -F: '{s+=$NF} END{print s}'  # ≥ 4 (端口修正)
grep -rE "ssh newvps 'docker network create" docs/deploy/6host-deploy.md | wc -l                  # ≥ 1 (创建命令文档化)
grep -cE "external: true" deploy/6host-compose.newvps.yml deploy/monitoring/docker-compose.yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 2
```

### §3.5 §4.22 NEW edge webhook 守门 12 项 (per plan §2 commit 1 §4.22)
```
test -f wrapper/deploy/edge-webhook/edge-pull.ts  # PASS (NEW)
grep -c "X-Hub-Signature-256\|hmac\|createHmac" wrapper/deploy/edge-webhook/edge-pull.ts  # ≥ 3
grep -c "git -C\|docker compose" wrapper/deploy/edge-webhook/edge-pull.ts                      # ≥ 2
grep -rE "edge-webhook" .github/workflows/deploy.yml | wc -l                                    # ≥ 2 (CI 触发 + secret)
grep -rE "EDG.*WEBHOOK_SECRET|EDGE_WEBHOOK_SECRET" .github/workflows/deploy.yml | wc -l        # ≥ 1 (HMAC secret 配置)
test -f wrapper/deploy/edge-webhook/edge-pull.service  # PASS
test -f wrapper/deploy/edge-webhook/install.sh                                                  # PASS
test -f wrapper/test/unit/edge-webhook.test.ts                                                  # PASS (NEW)
```

### §3.6 §4.23 NEW edge dns 守门 6 项 (per plan §2 commit 1 §4.23)
```
grep -c "dns: \[100.100.100.100" deploy/6host-compose.edge[1-5].yml | awk -F: '{s+=$NF} END{print s}'  # == 5 (5 edge × 1 行)
grep -c "1.1.1.1\|8.8.8.8" deploy/6host-compose.edge[1-5].yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 10 (5 edge × 2 fallback)
```

### §3.7 §4.24 NEW DEEPSEEK key log 守门 4 项 (per plan §2 commit 1 §4.24)
```
grep -c "key_prefix\|key_len" wrapper/dsh/deepseek_client.ts  # ≥ 2 (prefix + length log)
grep -c "FATAL: DEEPSEEK_API_KEY missing" wrapper/dsh/deepseek_client.ts  # ≥ 1 (missing error)
grep -c "key_prefix\|FATAL" wrapper/test/unit/deepseek_client.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 2 (新测试断言)
```

---

## §4 实施分解 (2 commits per plan §2)

### Commit 1 — audit-scope 起草 (本文件 + prompt + cc-ready.json flip)
- `notes/codex-audit-scope-v1.2.0e.1-v0.1.md` NEW (本文件)
- `notes/codex-audit-scope-v1.2.0e.1-v0.1-prompt.md` NEW (per plan §2 commit 1 + Codex CLI prompt)
- `docs/poll/cc-ready.json` Edit status: `v1.2.0d.3 -DEEPSEEK-HTTP-EXEC-COMMIT2-PASS` → `v1.2.0e.1 -CLEANUP-DRAFT` 翻牌 (M-bug 教训: DRAFT 期 status 必显前)

### Commit 2 — 6 sub-blocks A-G (per plan §2 commit 2)
- A (heartbeat dedup) + B (metrics wire) + C (prometheus shared net) + D (edge webhook) + E (DEEPSEEK key log) + F (types) + G (edge dns)
- 详细见 plan §2 commit 2

---

## §5 self-injury 0 项 + disk verbatim 117 项 (维持)

- self-injury: 0 (无新自伤, cleanup cycle 不引入自伤)
- disk verbatim: 117 (per v1.2.0d.4 数, 维持)
- 引用式机制 (5 处新增, per §3.3-§3.7):
  1. `worker_pool.register()` host dedup → `docker exec newvps-wrapper sqlite3 /data/worker_pool.db 'SELECT COUNT(*) FROM workers GROUP BY host'` 显示 edge1/2/3 各 ≤5 rows (而非 1392)
  2. `metrics.workerCount.set(countActive())` → `curl http://newvps.fish-harness.ts.net:4000/metrics` `worker_count` ≥ 3 (active edges)
  3. `docker network create deploy_harness_net` → `curl http://newvps.fish-harness.ts.net:9090/api/v1/targets?state=active` 8 jobs up (1 prom + 7 harness)
  4. `edge-pull.ts` HMAC verify → `curl -X POST http://edge1.fish-harness.ts.net:7777/webhook -H "X-Hub-Signature-256: sha256=<invalid>"` 返回 401
  5. `edge dns: [100.100.100.100]` → `docker exec harness-edge1-wrapper nslookup newvps.fish-harness.ts.net` 解析到 100.x.x.x IP

---

## §6 教训 L1-L6 (per plan §4 风险评估 → 教训落档)

| # | 教训 | 来源 |
|---|------|------|
| **L1** | host dedup race: SQLite busy_timeout=5000 + atomic check-then-insert via single statement;integration test "concurrent register" 覆盖 | R1 |
| **L2** | worker_count import circular: worker_pool.ts 不引 metrics.ts;单向 import 守门 | R2 |
| **L3** | docker network create 已存在 error: install script 先 `inspect`;已存在跳过 | R3 |
| **L4** | Tailscale ACL 端口修正影响其他服务: 4000-4003 取代 3000;先 audit tailscale-acl-6host.yaml | R4 |
| **L5** | edge webhook HMAC secret 漂移: per-host secret + install.sh 生成 32B random → /etc/edge-webhook.env;CI secret 同步;test 覆盖 wrong signature → 401 | R5 |
| **L6** | 5 edge compose × +5 行(dns:) multi-edit 漂移: replace_in_files 一次性 `dns:` 段插入 5 文件;git diff --stat 守门 5 +5 行 | R10 |

---

## §7 Plan self-check(v1.2.0e.1 启动后)

- [x] Context 写明(4 残留 + 2 minor + v1.2.0d.4 closure)
- [x] §1 user 决策已锁(D1-D8)
- [x] §2 实施分解 2 commits(audit-scope / 6 sub-blocks A-G)
- [x] §3 user EXEC 7 项(U1-U7)
- [x] §4 风险评估 10 项(HIGH 0 / MEDIUM 4 / LOW 6)
- [x] §3.3-§3.7 §4.20-§4.24 NEW 守门 grep 模板(commit 2 后实测)
- [x] §5 self-injury 0 + disk 117 维持
- [x] §6 教训 L1-L6 落档
- [x] §1.3 tracked ~120 锚定
- [x] DRAFT 状态翻牌(M-bug 教训)
- [x] DeepSeek key 真身安全(env-inject + prefix log + grep 守门)
- [x] cleanup sub-cycle skip formal review (per memory `fish-harness-v1.2.0d.1-cycle-closure.md`)

---

*Audit-scope 起草完成 (2026-09-09 v1.2.0e.1 cycle, D1-D8 决策锁 + §3.3-§3.7 §4.20-§4.24 NEW 守门 28 项 + §6 教训 L1-L6 落档 + §1.3 tracked ~120 锚定)。等 user ExitPlanMode 批准 commit 2 (~20 文件改动) + U1-U7 user EXEC + tag v1.2.0e.1 via Clash (per Codex 提交铁律 修订 2026-09-05)。*