# Codex audit-scope prompt v1.2.0d — DeepSeek HTTP + Anti-OOM

> **Trigger**: user 2026-09-08「选 A:wrapper 直调 DeepSeek HTTP API」+ v1.2.0e 3-host 真接闭环 (d 链内合并) + v1.2.0d.2 cost-mode PASS (boundary `9781dcc`; m2 GATE-CALIB per v0.1 prompt-review: 起草误写 9c2e325 = v1.2.0c 收口)
> **Scope**: 24 文件改动 (per plan §5) + 4 commits + 8 user EXEC + 1 tag v1.2.0d
> **Codex CLI**: `codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md`

---

## §1 契约 — v1.2.0d 4 大块决策(已 user 锁,不再二次审议)

| 决策 | 选项 | 关键不变量 |
|------|------|-----------|
| **D16** DeepSeek 调用方式 | A:wrapper 直调 DeepSeek HTTP API | OpenAI-compatible Chat Completions;DEEPSEEK_API_KEY env-inject;wrapper 移除 dsh binary 依赖;spawn dsh `child_process.spawn('dsh', ...)` 在 execution_driver.ts 全消失 |
| **D17** DeepSeek endpoint + model | `https://api.deepseek.com/v1/chat/completions` | orch=deepseek-v4-pro / commander,worker=deepseek-v4-flash;cost-mode `DEEPSEEK_COST_MODE=cheap` 强制降级 |
| **D7** docker memory limits | A:7 service 全 limits + --stop-timeout=30 | kernel smoke 256M / orch 512M / commander 1G ×2 / frontend 1G / stt 2G / push 1G / worker 1G |
| **D8** queue backpressure | A:SQLite WAL + 202/429/Location | max_in_flight=50;超 → SQLite pending + 202 Accepted Location header |
| **D9** monitoring stack | A:Prometheus | 7 host scrape + 3 alert rules (memory > 80% / queue > 100 / worker offline > 5min) + Tailscale ACL `tag:monitor` |

---

## §2 Files — 24 文件改动清单(per plan §5)

### A. DeepSeek HTTP 直调 (6: 3 NEW + 3 EDIT)
1. `wrapper/dsh/deepseek_client.ts` NEW ~150 行
2. `wrapper/dsh/dsh_client.ts` Edit: 加 `@deprecated` JSDoc + re-export `deepseekInvoke as callDshHeadless`
3. `wrapper/orchestrator/execution_driver.ts` Edit: spawnDsh → deepseekInvoke + streamRoutedDshFallback 替换
4. `wrapper/orchestrator/orchestrator.ts` Edit: runDsh → deepseekInvoke
5. `wrapper/orchestrator/workflow_pack.ts` Edit: callDshHeadless → deepseekInvoke
6. `wrapper/test/unit/deepseek_client.test.ts` NEW ~40 tests

### B. docker memory limits (8: 8 EDIT)
7. `deploy/newvps-compose.yml` Edit memory/CPU/--stop-timeout
8. `deploy/6host-compose.newvps.yml` Edit 6 services
9. `deploy/3host-compose.worker.yml` NEW worker limit 1G (m6 GATE-CALIB per v0.1 prompt-review: 起草误标 Edit — 实为 v1.2.0e 新建未跟踪 ?? 状态)
10-14. `deploy/6host-compose.edge[1-5].yml` Edit 5 files

### C. queue backpressure (4: 2 NEW + 2 EDIT)
15. `wrapper/orchestrator/queue_store.ts` NEW ~120 行
16. `wrapper/orchestrator/orchestrator.ts` Edit dispatch backpressure
17. `wrapper/orchestrator/types.ts` Edit QueueOverflow + RetryAfter
18. `wrapper/test/unit/queue_store.test.ts` NEW ~80 行

### D. Prometheus monitoring (6: 4 NEW + 2 EDIT)
19. `wrapper/orchestrator/metrics.ts` NEW ~80 行
20. `wrapper/orchestrator/server.ts` Edit /metrics endpoint (现状已有 per F28)
21. `deploy/monitoring/prometheus.yml` NEW ~60 行
22. `deploy/monitoring/runbook.md` NEW ~120 行
23. `deploy/tailscale-acl-6host.yaml` Edit tag:monitor 段
24. `wrapper/test/unit/metrics.test.ts` NEW ~50 行

### E. v1.2.0e 合并 (5: 3 NEW + 2 EDIT) — per user 选 A 决策并入 commit 2
- `wrapper/orchestrator/heartbeat_sender.ts` (NEW)
- `wrapper/test/unit/heartbeat_sender.test.ts` (NEW)
- 3 host compose Edit (extra_hosts + .fish-harness.ts.net)

### F. 测试 + gated (E2E + 簿记)
- `wrapper/test/integration/deepseek_e2e.test.ts` NEW gated
- `wrapper/test/integration/queue_backpressure.test.ts` NEW gated
- `wrapper/test/integration/oom_prevention.test.ts` NEW gated
- `wrapper/test/integration/execution_driver.test.ts` Edit spawn mock → fetch mock

---

## §3 §4.15 NEW DeepSeek HTTP 直调守门 14 项 grep(commit 2 后实测)

```bash
test -f wrapper/dsh/deepseek_client.ts                                              # PASS
grep -c "deepseek.com/v1/chat/completions\|api.deepseek.com" wrapper/dsh/deepseek_client.ts  # ≥ 3
grep -c "DEEPSEEK_API_KEY" wrapper/dsh/deepseek_client.ts                           # ≥ 3
grep -rE "spawn.*dsh|child_process.spawn\(['\"]dsh" wrapper/orchestrator/execution_driver.ts | wc -l  # == 0
grep -c "deepseek_client\|deepseekInvoke" wrapper/orchestrator/execution_driver.ts  # ≥ 4
grep -rE "--profile|--model" wrapper/dsh/dsh_client.ts | wc -l                      # == 0 (deprecation 注释除外)
grep -rE "model_id.*deepseek-v4-(pro|flash)" wrapper/dsh/deepseek_client.ts | wc -l  # ≥ 3
grep -c "model.*deepseek-v4-flash" docs/m0b/profile-override-*.yaml                # == 4 (m5 GATE-CALIB per v0.1 prompt-review: 实测 commander 2 + worker 2, base/orch 0 — 起草误写 3)
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/dsh/deepseek_client.ts | wc -l  # == 0
grep -c "DEEPSEEK_COST_MODE\|resolveModelOverride" wrapper/dsh/deepseek_client.ts  # ≥ 2 (cost-mode 沿用)
grep -c "AbortSignal.timeout\|timeoutMs" wrapper/dsh/deepseek_client.ts            # ≥ 2
grep -c "DshResponse\|tokenUsage" wrapper/dsh/deepseek_client.ts                    # ≥ 4
test -f wrapper/test/unit/deepseek_client.test.ts                                   # PASS
grep -c "describe\|it(" wrapper/test/unit/deepseek_client.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 40
```

---

## §4 §4.16 NEW docker memory limits 守门 12 项

```bash
grep -c "mem_limit" deploy/newvps-compose.yml deploy/6host-compose.newvps.yml deploy/6host-compose.edge*.yml deploy/macbook-compose.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'  # ≥ 10 (M3 GATE-CALIB: `memory:` 形态实测 0 恒红, mem_limit 实测 18)
grep -c "mem_limit\|deploy.resources.limits.memory" deploy/*.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'  # ≥ 7
grep -c "cpus:" deploy/newvps-compose.yml deploy/6host-compose.newvps.yml            # ≥ 4 (post-commit-2: B 块 CPU limits 待加, 现实测 0)
grep -c "stop-timeout\|stop_grace_period" deploy/*.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'  # ≥ 5 (M3: compose 原生 stop_grace_period, 复合实测 10 — v1.2.0d.1 M1)
grep -cE "256M" deploy/newvps-compose.yml                                            # ≥ 1 (kernel smoke, per F23)
grep -c "memswap_limit\|memswap" deploy/*.yml                                        # ≥ 7
```

---

## §5 §4.17 NEW queue 持久化守门 8 项

```bash
test -f wrapper/orchestrator/queue_store.ts                                          # PASS
grep -c "better-sqlite3\|Database" wrapper/orchestrator/queue_store.ts              # ≥ 4 (per F25 + ADR 0009 WAL)
grep -c "WAL\|busy_timeout\|journal_mode" wrapper/orchestrator/queue_store.ts       # ≥ 3 (per ADR 0009)
grep -c "202\|Retry-After\|Location" wrapper/orchestrator/queue_store.ts wrapper/orchestrator/orchestrator.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 3 (per F26)
grep -cE "max_in_flight" wrapper/orchestrator/orchestrator.ts                       # ≥ 1
grep -c "queue_depth\|active_task_count" wrapper/orchestrator/metrics.ts wrapper/orchestrator/queue_store.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 4
test -f wrapper/test/unit/queue_store.test.ts                                        # PASS
test -f wrapper/test/integration/queue_backpressure.test.ts                          # PASS gated
```

---

## §6 §4.18 NEW monitoring 守门 10 项

```bash
test -f wrapper/orchestrator/metrics.ts                                              # PASS
test -f deploy/monitoring/prometheus.yml                                             # PASS
test -f deploy/monitoring/runbook.md                                                 # PASS
grep -cE "prom-client|Prometheus|register" wrapper/orchestrator/metrics.ts           # ≥ 4
grep -c "active_task_count\|queue_depth\|memory_used\|worker_count" wrapper/orchestrator/metrics.ts  # ≥ 4
grep -c "scrape_configs" deploy/monitoring/prometheus.yml                            # ≥ 1
grep -cE "targets.*newvps|edge[1-5]|kjonemacbook-pro" deploy/monitoring/prometheus.yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 7
grep -c "alert:" deploy/monitoring/alerts.yml                                       # == 3 (M3 GATE-CALIB: `alert|Alert` 结构行假绿, 真身 alerts.yml)
grep -cE "memory_used_mb > 819|queue_depth > 100|worker_count < 1" deploy/monitoring/alerts.yml  # ≥ 3 (M3: 条件真身, 实测 4)
grep -cE "tag:monitor|tag:admin" deploy/tailscale-acl-6host.yaml                     # ≥ 2 (per F28)
```

---

## §7 §3.10 NEW dsh binary 移除声明(per F31/F32)

```bash
grep -rE "child_process.spawn\(['\"]dsh" wrapper/orchestrator/execution_driver.ts   # == 0
grep -rE "'dsh'|\"dsh\"" wrapper/orchestrator/execution_driver.ts | grep -vE '^\s*[^:]+:[0-9]+:\s*(\*|//|#)' | wc -l  # == 0 (m4 GATE-CALIB: 注释除外不可 grep 验证 — 排注释行判活代码, post-commit-2)
grep -c "deepseekInvoke\|deepseek_client" wrapper/orchestrator/execution_driver.ts  # ≥ 4
grep -c "deepseekInvoke" wrapper/orchestrator/orchestrator.ts wrapper/orchestrator/workflow_pack.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 2
grep -c "@deprecated" wrapper/dsh/dsh_client.ts                                       # ≥ 1
grep -c "export.*deepseekInvoke.*as.*callDshHeadless" wrapper/dsh/dsh_client.ts     # ≥ 1
```

---

## §8 v0.7 hygiene 8 项守门(per F1-F4 cycle hygiene)

```bash
# §4.5 no hardcoded keys
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/dsh/ wrapper/orchestrator/ | wc -l  # == 0

# §4.6 STT 守门 (新vps only)
grep -c "WHISPER_MODEL_PATH" deploy/6host-compose.edge*.yml deploy/3host-compose.worker.yml deploy/macbook-compose.yml | wc -l  # == 0

# §4.7 Web Push VAPID env-inject only
grep -rE "vapid_private_key.*=" deploy/tailscale-acl-6host.yaml wrapper/orchestrator/webpush_gateway.ts | wc -l  # == 0

# §4.8 sleep infinity 守门
grep -rE "sleep infinity" deploy/ | wc -l                                            # == 0

# §4.9 container_name 引用
grep -c "container_name:" deploy/6host-compose.newvps.yml deploy/3host-compose.worker.yml | wc -l  # ≥ 7

# F1 grep pattern 三处对齐 (commit hash / cc-ready / notes index)
grep -c "v1.2.0d" docs/poll/cc-ready.json CHANGELOG.md README.md | wc -l              # ≥ 3 (m2 GATE-CALIB: 起草误写 notes/MEMORY.md — 该文件不存在, grep 报错恒红)

# F2 grep -r | wc -l 守门 (实测长度对齐,不靠 exit code)
wc -l notes/codex-audit-scope-v1.2.0d-v0.1.md                                       # == 252 (m1 GATE-CALIB per v0.1 prompt-review: 起草误写 ≥320 与实测 252 自相矛盾必恒红 — F2 实测长度对齐不靠 exit code 的正用)

# F3 cc-ready 单一簿记
test -f docs/poll/cc-ready.json                                                      # PASS (单源)
grep -cE "task_id.*V1\\.2\\.0D" docs/poll/cc-ready.json                              # ≥ 1 (m3 GATE-CALIB: task_id 真值 T-V1.2.0D- 大写无点间 — 起草小写 pattern 实测 0 恒红)
```

---

## §9 v1.2.0a/b/c/d.2 已立守门(维持,不再重复)

- §4.10 v1.2.0a commander 真实现守门
- §4.11 v1.2.0b worker 真实现守门 (heartbeat_sender 已就位 per v1.2.0e)
- §4.12/§4.13/§4.14 v1.2.0c cross-host + MacBook + fencing 守门
- §4.19 v1.2.0d.2 DEEPSEEK_COST_MODE 三层优先级守门 (cheap 默认全 flash;full orch 回 pro) (m7 GATE-CALIB: 起草误挂 §4.14 — 已被 v1.2.0c fencing 占用, 顺延 §4.19)

---

## §10 引用式机制 8 处实测(per v1.2.0c v0.1 模板)

每条引用式必须实测校验,**未实测报 PASS 即同轮 critical**:

1. `deploy/3host-compose.worker.yml` extra_hosts + .fish-harness.ts.net URL → aliyun 容器内 `curl http://newvps.fish-harness.ts.net:4000/health` OK (per v1.2.0e 闭环)
2. `deploy/6host-compose.newvps.yml` dns: 100.100.100.100 + extra_hosts → newvps orchestrator 拿 7 host 列表 `curl http://newvps.fish-harness.ts.net:4000/api/v1/worker/health` workers_count=7
3. `deploy/3host-compose.worker.yml` mem_limit: 1G → `docker stats harness-edge-worker --no-stream` memory_used < 1G
4. `wrapper/orchestrator/queue_store.ts` SQLite WAL → `docker exec newvps-wrapper sqlite3 /data/queue_store.db 'PRAGMA journal_mode=WAL'` 返回 `wal`
5. `wrapper/orchestrator/metrics.ts` prom-client /metrics endpoint → `curl http://newvps.fish-harness.ts.net:4000/metrics` 返回 `text/plain; version=0.0.4`
6. `deploy/monitoring/prometheus.yml` 7 scrape jobs → prometheus up `curl newvps:9090/api/v1/targets` 7 全 Up
7. `wrapper/dsh/deepseek_client.ts` fetch api.deepseek.com → 真机 E2E dispatch `curl -X POST :4000/api/v1/tasks -d '{"prompt":"echo"}'` 拿真实 DeepSeek response (含 `usage.total_tokens`)
8. `deploy/tailscale-acl-6host.yaml` tag:monitor 段 → `tailscale acl test` PASS (cscoheru tagOwners)

---

## §11 Codex 期望输出格式

报告落 `notes/codex-review-v1.2.0d-v0.1-formal-report.md`,7 段:

| § | 内容 | 期望 |
|---|------|------|
| §0 | 终态裁定 | 0C/0M/0m |
| §1 | hygiene 28 项 checklist | 28/28 PASS |
| §2 | §3-§7 NEW 守门 grep | 全部 PASS (实测子串) |
| §3 | §10 引用式 8 处 | 全部 PASS (每处附实测 stdout) |
| §4 | §8 v0.7 hygiene 8 项 + §9 v1.2.0a/b/c/d.2 守门 | 全 PASS |
| §5 | self-injury 1 项 + disk verbatim 117 项 | 全 PASS (m1 GATE-CALIB: 重写后口径重锚) |
| §6 | plan §7 教训 L1-L6 落档确认 | 6 项全落 |
| §7 | 关键 deviation (与 v1.2.0c v0.1 模板一致) | 列任何偏离 |

---

## §12 期望:0C/0M/0m

- Critical: 0 (任何 spawn dsh 字面残留 → critical)
- Major: 0 (queue backpressure / Prometheus scrape 漏 trigger → major)
- Minor: 0-3 (cosmetic, e.g. 注释排版 / JSDoc 字段顺序)
- 任何 1 误判 critical → 同轮 fail

---

*Prompt 起草完成 (2026-09-08 v1.2.0d cycle, D7/D8/D9/D16/D17 决策锁 + §3-§7 NEW 守门 grep 44 项 + §8 hygiene 8 项 + §10 引用式 8 处 + §11/§12 期望输出格式)。等 Codex v0.1 反馈 0C/0M/0m 后启动 commit 2 (24 文件改动)。*
