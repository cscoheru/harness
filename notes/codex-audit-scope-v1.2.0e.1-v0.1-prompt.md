# Codex audit-scope prompt v1.2.0e.1 — 4 已知残留 cleanup

> **Trigger**: user 2026-09-09「v1.2.0e.1 cleanup」 + v1.2.0d.4 cycle closure memory §4 残留 4 项
> **Scope**: ~20 文件改动 (per plan §5) + 2 commits + 7 user EXEC (U1-U7) + 1 tag v1.2.0e.1
> **Cycle boundary**: `73f97fc` (v1.2.0d.4 EXEC 收口 commit)
> **Note**: cleanup sub-cycle skip formal Codex review per memory `fish-harness-v1.2.0d.1-cycle-closure.md` pattern (1 file +12/-7 quick-fix closed @ `1d462f5`);本 prompt 仍按 v0.7 hygiene 模板维护,供 user/Claude 跑 hygiene grep 守门

---

## §1 契约 — v1.2.0e.1 8 大决策(已 user 锁,不再二次审议)

| 决策 | 选项 | 关键不变量 |
|------|------|-----------|
| **D1** heartbeat dedup 路径 | worker_pool 内 fix | `findActiveByHost()` SELECT-then-INSERT 模式;status 字段 `new`/`already_active`;heartbeat_sender 不动(worker_id 已正确捕获) |
| **D2** metrics worker_count 接法 | 同 15s interval 复用 | `startMetricsSampling()` callback 内加 2 行:import `getDefaultWorkerPool` + `workerCount.set(countActive())`;单向 import 避免 circular |
| **D3** Prometheus 网络 | shared external network `deploy_harness_net` | `docker network create` + 两 compose `external: true` + monitoring_monitoring_net → deploy_harness_net 改名 |
| **D4** Tailscale ACL 端口 | 4000-4003 取代 3000 | `tag:harness:4000,4001,4002,4003,*`;保留 `tagOwners.tag:monitor: ["cscoheru"]` |
| **D5** Edge webhook 形态 | Node 最小 HTTP server :7777 | `wrapper/deploy/edge-webhook/edge-pull.ts` ~80 行;HMAC SHA-256 verify;systemd unit;bind 127.0.0.1 |
| **D6** Edge webhook secret | per-host random 32B | install.sh 生成 → /etc/edge-webhook.env;CI secret `EDGE_WEBHOOK_SECRET_<host>`;webhook POST 带 `X-Hub-Signature-256: sha256=<hmac>` |
| **D7** Edge dns 顺手清 | 加 `dns:` 段 per newvps pattern | `dns: [100.100.100.100, 1.1.1.1, 8.8.8.8]` 加 5 edge compose |
| **D8** DEEPSEEK key log | startup truncated prefix | `slice(0,7)` 显 `sk-3f55` + `length`;key missing → `console.error` |

---

## §2 Files — ~20 文件改动清单(per plan §5)

### A. heartbeat dedup (3: 3 EDIT)
1. `wrapper/orchestrator/worker_pool.ts` Edit:加 `findActiveByHost()` + register() dedup check
2. `wrapper/test/unit/worker_pool.test.ts` Edit:加 "register same host twice" + "already_active status" tests
3. `wrapper/test/integration/server_heartbeat.test.ts` Edit:加 "concurrent register races" test

### B. metrics worker_count (3: 3 EDIT)
4. `wrapper/orchestrator/metrics.ts` Edit:startMetricsSampling 接 worker_pool.countActive()
5. `wrapper/test/unit/metrics.test.ts` Edit:加 "workerCount reflects pool" + "updates after register/unregister" tests
6. `wrapper/test/integration/worker_pool.test.ts` Edit:加 "/metrics endpoint exposes live worker_count" test (gated RUN_WORKER_POOL_E2E=1)

### C. Prometheus shared net (4: 4 EDIT)
7. `deploy/6host-compose.newvps.yml` Edit:`networks:` 段 `name: deploy_harness_net` + `external: true`
8. `deploy/monitoring/docker-compose.yml` Edit:`monitoring_net` 段改名 + `external: true` + prometheus alias
9. `deploy/tailscale-acl-6host.yaml` Edit:`tag:monitor` 段端口 3000 → 4000-4003
10. `docs/deploy/6host-deploy.md` Edit:加 "## Network setup" + "## Edge webhook setup" 段

### D. Edge webhook (8: 4 NEW + 2 EDIT + 2 helper)
11. `wrapper/deploy/edge-webhook/edge-pull.ts` NEW ~80 行
12. `wrapper/deploy/edge-webhook/edge-pull.service` NEW (systemd unit template)
13. `wrapper/deploy/edge-webhook/install.sh` NEW ~40 行
14. `wrapper/deploy/edge-webhook/tsconfig.json` NEW (简化版)
15. `.github/workflows/deploy.yml` Edit:加 notify-edge job + EDGE_WEBHOOK_SECRET secret
16. `wrapper/test/unit/edge-webhook.test.ts` NEW ~50 tests
17-18. (helper 占位, per plan §2 D)

### E. DEEPSEEK key log (2: 2 EDIT)
19. `wrapper/dsh/deepseek_client.ts` Edit:startup `console.log` key_prefix + missing error
20. `wrapper/test/unit/deepseek_client.test.ts` Edit:加 "logs truncated prefix" + "logs error missing" tests

### F. 类型 (1: 1 EDIT)
21. `wrapper/orchestrator/types.ts` Edit:`{worker_id, status: 'new'|'already_active'}` + EdgeWebhook HMAC types

### G. edge dns 顺手清 (5: 5 EDIT)
22-26. `deploy/6host-compose.edge[1-5].yml` Edit:`dns: [100.100.100.100, 1.1.1.1, 8.8.8.8]` 加 wrapper service

---

## §3 §4.20 NEW metrics worker_count 守门 6 项(commit 2 后实测)

```bash
grep -c "workerCount.set\|getDefaultWorkerPool\(\).countActive" wrapper/orchestrator/metrics.ts  # ≥ 2
grep -rE "workerCount\." wrapper/orchestrator/metrics.ts | wc -l                                  # ≥ 3 (declared + set + reset path)
grep -rE "worker_count" wrapper/test/unit/metrics.test.ts | wc -l                                  # ≥ 2 (新测试断言)
grep -rE "import.*getDefaultWorkerPool" wrapper/orchestrator/metrics.ts | wc -l                    # ≥ 1 (单向 import)
grep -c "countActive\(\)" wrapper/orchestrator/worker_pool.ts                                      # ≥ 1 (方法存在)
grep -rE "workerCount" wrapper/test/unit/metrics.test.ts | wc -l                                   # ≥ 3 (测试断言)
```

---

## §4 §4.21 NEW prometheus cross-net 守门 10 项

```bash
grep -cE "deploy_harness_net|external: true" deploy/6host-compose.newvps.yml deploy/monitoring/docker-compose.yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 4
grep -cE "4000|4001|4002|4003" deploy/tailscale-acl-6host.yaml | awk -F: '{s+=$NF} END{print s}'  # ≥ 4 (端口修正)
grep -rE "ssh newvps 'docker network create" docs/deploy/6host-deploy.md | wc -l                  # ≥ 1 (创建命令文档化)
grep -cE "external: true" deploy/6host-compose.newvps.yml deploy/monitoring/docker-compose.yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 2
grep -c "deploy_harness_net" deploy/monitoring/docker-compose.yml                                 # ≥ 2 (network name + service alias)
```

---

## §5 §4.22 NEW edge webhook 守门 12 项

```bash
test -f wrapper/deploy/edge-webhook/edge-pull.ts                                                  # PASS (NEW)
grep -c "X-Hub-Signature-256\|hmac\|createHmac" wrapper/deploy/edge-webhook/edge-pull.ts          # ≥ 3
grep -c "git -C\|docker compose" wrapper/deploy/edge-webhook/edge-pull.ts                         # ≥ 2
grep -rE "edge-webhook" .github/workflows/deploy.yml | wc -l                                       # ≥ 2 (CI 触发 + secret)
grep -rE "EDG.*WEBHOOK_SECRET|EDGE_WEBHOOK_SECRET" .github/workflows/deploy.yml | wc -l          # ≥ 1 (HMAC secret 配置)
test -f wrapper/deploy/edge-webhook/edge-pull.service                                              # PASS
test -f wrapper/deploy/edge-webhook/install.sh                                                     # PASS
test -f wrapper/test/unit/edge-webhook.test.ts                                                     # PASS (NEW)
grep -c "7777" wrapper/deploy/edge-webhook/edge-pull.ts                                             # ≥ 1 (port 绑定)
grep -c "127.0.0.1" wrapper/deploy/edge-webhook/edge-pull.ts                                       # ≥ 1 (绑 loopback)
grep -c "HMAC.*SHA-256\|sha256" wrapper/deploy/edge-webhook/edge-pull.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 2
grep -c "spawn\|exec" wrapper/deploy/edge-webhook/edge-pull.ts                                     # ≥ 2 (git + docker compose spawn)
```

---

## §6 §4.23 NEW edge dns 守门 6 项

```bash
grep -c "dns: \[100.100.100.100" deploy/6host-compose.edge[1-5].yml | awk -F: '{s+=$NF} END{print s}'  # == 5 (5 edge × 1 行)
grep -c "1.1.1.1\|8.8.8.8" deploy/6host-compose.edge[1-5].yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 10 (5 edge × 2 fallback)
grep -c "dns:" deploy/6host-compose.edge[1-5].yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 5 (per edge 1 个 dns: 段)
```

---

## §7 §4.24 NEW DEEPSEEK key log 守门 4 项

```bash
grep -c "key_prefix\|key_len" wrapper/dsh/deepseek_client.ts                                       # ≥ 2 (prefix + length log)
grep -c "FATAL: DEEPSEEK_API_KEY missing" wrapper/dsh/deepseek_client.ts                          # ≥ 1 (missing error)
grep -c "key_prefix\|FATAL" wrapper/test/unit/deepseek_client.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 2 (新测试断言)
grep -c "slice(0,7)\|slice(0, 7)" wrapper/dsh/deepseek_client.ts                                   # ≥ 1 (truncated prefix)
```

---

## §8 §4.25 NEW heartbeat dedup 守门 8 项

```bash
grep -c "findActiveByHost\|select.*host.*status.*active" wrapper/orchestrator/worker_pool.ts       # ≥ 2 (新方法 + register 前置检查)
grep -c "host_dedup\|already_active" wrapper/orchestrator/worker_pool.ts                            # ≥ 1 (返回值 status 字段)
grep -rE "INSERT.*workers" wrapper/orchestrator/worker_pool.ts | wc -l                              # == 1 (单 INSERT 路径, after dedup check)
grep -c "findActiveByHost" wrapper/test/unit/worker_pool.test.ts                                   # ≥ 1 (新方法测试)
grep -c "same host\|concurrent register" wrapper/test/integration/server_heartbeat.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 2 (新测试)
grep -c "already_active\|already_registered" wrapper/orchestrator/worker_pool.ts                  # ≥ 2 (status 字符串)
```

---

## §9 v0.7 hygiene 8 项守门(per F1-F4 cycle hygiene, 维持)

```bash
# §4.5 no hardcoded keys
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/dsh/ wrapper/orchestrator/ 2>&1 | wc -l  # == 0

# §4.6 STT 守门 (新vps only)
grep -c "WHISPER_MODEL_PATH" deploy/6host-compose.edge*.yml deploy/3host-compose.worker.yml deploy/macbook-compose.yml | wc -l  # == 0

# §4.7 Web Push VAPID env-inject only
grep -rE "vapid_private_key.*=" deploy/tailscale-acl-6host.yaml wrapper/orchestrator/webpush_gateway.ts | wc -l  # == 0

# §4.8 sleep infinity 守门
grep -rE "sleep infinity" deploy/ | wc -l                                                         # == 0

# §4.9 container_name 引用
grep -c "container_name:" deploy/6host-compose.newvps.yml deploy/3host-compose.worker.yml | wc -l  # ≥ 7

# F1 grep pattern 三处对齐 (commit hash / cc-ready / notes index)
grep -c "v1.2.0e.1" docs/poll/cc-ready.json CHANGELOG.md README.md | wc -l                        # ≥ 3 (per F1 hygiene)

# F2 grep -r | wc -l 守门 (实测长度对齐,不靠 exit code)
wc -l notes/codex-audit-scope-v1.2.0e.1-v0.1.md                                                  # 实测 ~250 (post-write)

# F3 cc-ready 单一簿记
test -f docs/poll/cc-ready.json                                                                   # PASS (单源)
grep -cE "task_id.*V1\\.2\\.0E\\.1" docs/poll/cc-ready.json                                       # ≥ 1 (task_id 真值 T-V1.2.0E.1-CLEANUP-DRAFT)
```

---

## §10 v1.2.0a/b/c/d 已立守门(维持,不再重复)

- §4.10 v1.2.0a commander 真实现守门
- §4.11 v1.2.0b worker 真实现守门 (heartbeat_sender 已就位 per v1.2.0e)
- §4.12/§4.13/§4.14 v1.2.0c cross-host + MacBook + fencing 守门
- §4.15-§4.18 v1.2.0d DeepSeek + docker limits + queue + monitoring 守门
- §4.19 v1.2.0d.2 DEEPSEEK_COST_MODE 三层优先级守门

---

## §11 引用式机制 5 处实测(per §5 disk verbatim)

每条引用式必须实测校验,**未实测报 PASS 即同轮 critical**:

1. `worker_pool.register()` host dedup → 真机 `docker exec newvps-wrapper sqlite3 /data/worker_pool.db 'SELECT COUNT(*) FROM workers GROUP BY host'` 显示 edge1/2/3 各 ≤5 rows (而非 1392)
2. `metrics.workerCount.set(countActive())` → `curl http://newvps.fish-harness.ts.net:4000/metrics` `worker_count` ≥ 3 (active edges)
3. `docker network create deploy_harness_net` → `curl http://newvps.fish-harness.ts.net:9090/api/v1/targets?state=active` 8 jobs up (1 prom + 7 harness)
4. `edge-pull.ts` HMAC verify → `curl -X POST http://edge1.fish-harness.ts.net:7777/webhook -H "X-Hub-Signature-256: sha256=<invalid>"` 返回 401
5. `edge dns: [100.100.100.100]` → `docker exec harness-edge1-wrapper nslookup newvps.fish-harness.ts.net` 解析到 100.x.x.x IP

---

## §12 hygiene 期望(per cleanup sub-cycle pattern)

- 0C/0M/0m(目标;cleanup cycle 实际期望 0C/0M/0-3m 因为小变更容忍 cosmetic)
- Critical: 0 (任何 spawn dsh 字面残留 / hardcoded key → critical)
- Major: 0 (host dedup race / metrics import circular / prometheus network 未通 → major)
- Minor: 0-3 (注释排版 / JSDoc 字段顺序)

---

*Prompt 起草完成 (2026-09-09 v1.2.0e.1 cycle, D1-D8 决策锁 + §3-§8 §4.20-§4.25 NEW 守门 38 项 + §11 引用式 5 处 + §12 hygiene 期望)。等 commit 2 (~20 文件改动) + U1-U7 user EXEC + tag v1.2.0e.1 via Clash (per Codex 提交铁律 修订 2026-09-05)。*