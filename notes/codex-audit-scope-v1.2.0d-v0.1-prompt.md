# Codex v0.1 prompt — v1.2.0d 防 OOM 复审 prompt

> **Date**: 2026-09-05
> **适用 sub-cycle**: v1.2.0d（v1.2.0 周期第四 sub-cycle）
> **核心目标**: 验证 v1.2.0d 24 文件改动 + §4.15/§4.16/§4.17 NEW 守门 + §3.10/§3.11/§3.12 NEW 声明 + tracked 116 / disk 128 锚定维持
> **预期 Codex 输出**: 0C/0M/0m | 1+M+5m 同轮清零（per v1.2.0b/c 闭环模式）

---

## §1 Codex 角色

你是 Anthropic Codex CLI（gpt-5.6-sol + xhigh），正对 `notes/codex-audit-scope-v1.2.0d-v0.1.md` 进行 v0.1 prompt-review（同一轮 commit 1 起草 PASS）。你的工作仅限以下 3 件事：

1. **逐条**核对 v1.2.0d audit-scope §1-§10 的 30 验证命令 + 30+ grep pattern 字面是否 verbatim 校准（per §9 cmd 矩阵）
2. **逐项**对照 §1.5 主表 24 文件改动清单，核对 §4.15-§4.17 + §3.10-§3.12 守门覆盖度
3. **逐条**核对 §7 教训记档 11 项（v1.2.0c 5 findings + v1.2.0d NEW 6 项）实战吸收模式

**不要**做：
- 推断 v1.2.0d Commit 2 还没写的代码（tsc 0 + vitest 230+ pass 实测需等 user U2 真跑）
- 修改 v1.0 runtime / spec/capabilities/ / 9 ADR body / Dockerfile / docker-compose.yml（frozen per §8.3）
- 提出 v1.3+ / v1.2.1+ 范围外建议（per §8.1/8.2）
- 校准 v1.2.0c cycle 已锁 boundary（per §14.2 推进式风格）

---

## §2 hygiene 自检表（20 项，必须全 PASS）

### §2.1 不锁型号守门（3 项）

- [ ] **H1**: wrapper/orchestrator/queue_store.ts 不含 Fable 5/GLM 5.3/MiniMax-M3 字面（per §1 继承 + NEW 文件同守）
- [ ] **H2**: wrapper/orchestrator/metrics.ts 不含 Fable 5/GLM 5.3/MiniMax-M3 字面
- [ ] **H3**: deploy/monitoring/prometheus.yml + runbook.md 不含 Fable 5/GLM 5.3/MiniMax-M3 字面（NEW monitoring stack 同守）

### §2.2 不硬编码凭据守门（3 项）

- [ ] **H4**: wrapper/orchestrator/queue_store.ts 不硬编码 DEEPSEEK_API_KEY（per §2 继承 + NEW queue_store 同守）
- [ ] **H5**: wrapper/orchestrator/metrics.ts 不暴露 VAPID_PRIVATE_KEY 或 Prometheus admin_password
- [ ] **H6**: deploy/tailscale-acl-6host.yaml 加 tag:monitor 段不硬编码 Tailscale auth key（per F28）

### §2.3 docker memory limits 守门（5 项）

- [ ] **H7**: deploy/newvps-compose.yml 加 memory/CPU limits per D7 (kernel 256M + orchestrator 2G + commander 1G ×3 + stt 2G + push 1G + monitor 512M)
- [ ] **H8**: deploy/6host-compose.newvps.yml 加 wrapper limits 1G per D7
- [ ] **H9**: deploy/6host-compose.edge[1-5].yml 5 文件全 wrapper limit 1G + `--stop-timeout=30` per F27
- [ ] **H10**: deploy/macbook-compose.yml 加 worker limit 2G + `--memory-reservation=1G` MacBook-specific per plan §5.2
- [ ] **H11**: ≥ 5 service 设 `--stop-timeout=30` graceful shutdown per F27（docker stats 验证 MemLimit 列非空）

### §2.4 queue 持久化守门（4 项）

- [ ] **H12**: wrapper/orchestrator/queue_store.ts NEW 文件存在（per D8 + F25）
- [ ] **H13**: queue_store.ts 加 better-sqlite3 + WAL mode + busy_timeout=5000 per ADR 0009
- [ ] **H14**: queue_store.ts 加 429 Retry-After + 202 Accepted Location header per F26 HTTP RFC
- [ ] **H15**: orchestrator.ts dispatch() 加 queue backpressure check max_in_flight=50 + reclaim path

### §2.5 monitoring + metrics 守门（3 项）

- [ ] **H16**: wrapper/orchestrator/metrics.ts NEW 文件存在 + prom-client exporter + 4 metric names per F25
- [ ] **H17**: deploy/monitoring/prometheus.yml NEW + 7 host scrape jobs (newvps + 5 edge + macbook) per F24
- [ ] **H18**: prometheus.yml 加 3 alert rules (memory >80% / queue >100 / worker offline >5min) + Tailscale ACL tag:monitor + tag:admin per F28

### §2.6 顺手清 + 顺手 wire 守门（2 项）

- [ ] **H19**: wrapper/orchestrator/worker_pool.ts dispatch() query 加 tertiary sort `ORDER BY last_heartbeat_at ASC, worker_id ASC, registered_at ASC` per F21 (round_robin tie-breaking)
- [ ] **H20**: wrapper/orchestrator/execution_driver.ts HTTP fallback path 替换为 `routedDsh()` 调用 + commit 注释 `// wire-routedDsh per F22 option A`

---

## §3 Codex 期望输出（per v1.2.0b/c 闭环模式 + v1.2.0d NEW 8 处引用式）

### §3.1 v0.1 终态裁定

```yaml
v1.2.0d v0.1 prompt-review expected:
  - 终态: PASS (0C/0M/0m) OR PASS with 1+M+5m 同轮清零
  - 含义: 全部 20 hygiene checklist 全 PASS + 8 处引用式机制落地验证全 PASS + 30 验证命令 verbatim 校准
  - 不接受: 终态 FAIL 或 2+M+ 或 任意 Critical (C) finding
```

### §3.2 8 处引用式机制落地验证

每处引用式机制 = plan §13.3 + audit-scope §5 24 文件清单中一个独立子系统，需逐处验证：

#### §3.2.1 docker memory limits 机制（per D7 + F23 + F27）

- 7 service compose 文件存在 + memory limit ≥10 + cpus ≥4 + stop-timeout ≥5 + 256M kernel smoke + unless-stopped ≥5
- 验证命令: `grep -cE "memory:|mem_limit|deploy\.resources\.limits\.memory|stop-timeout|256M|unless-stopped" deploy/*.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'`
- 期望: ≥ 27 (10 memory + 7 mem_limit + 5 stop-timeout + 1 256M + 5 unless-stopped = 28)

#### §3.2.2 queue 持久化机制（per D8 + F25 + F26）

- queue_store.ts NEW + better-sqlite3 + WAL + 202/429/Location + max_in_flight + queue_depth/active_task_count metric
- 验证命令: `grep -cE "better-sqlite3|Database|WAL|busy_timeout|202|Retry-After|Location|max_in_flight|queue_depth|active_task_count" wrapper/orchestrator/queue_store.ts wrapper/orchestrator/orchestrator.ts wrapper/orchestrator/types.ts 2>&1 | awk -F: '{s+=$NF} END{print s}'`
- 期望: ≥ 12 (4 better-sqlite3 + 3 WAL + 3 429/202 + 1 max_in_flight + 4 metric = 15)

#### §3.2.3 metrics.ts + Prometheus exporter 机制（per F25）

- prom-client + Prometheus + register + 4 metric names (active_task_count/queue_depth/memory_used/worker_count)
- 验证命令: `grep -cE "prom-client|Prometheus|register|active_task_count|queue_depth|memory_used|worker_count" wrapper/orchestrator/metrics.ts`
- 期望: ≥ 8 (3 framework + 4 metric + 1 register = 8)

#### §3.2.4 Prometheus 7 host scrape 机制（per F24）

- scrape_configs + 7 host targets + 3 alert rules + 3 alert condition + Tailscale bind 100.64.0.0/8
- 验证命令: `grep -cE "scrape_configs|targets.*newvps|targets.*edge[1-5]|targets.*kjonemacbook-pro|alert|memory > 80|queue_depth > 100|worker_offline > 5min|100\.64\.0\.0" deploy/monitoring/prometheus.yml 2>&1 | awk -F: '{s+=$NF} END{print s}'`
- 期望: ≥ 14 (1 scrape_configs + 7 targets + 3 alert + 3 condition + 1 Tailscale = 15)

#### §3.2.5 worker_pool round_robin tertiary sort 机制（per F21）

- ORDER BY last_heartbeat_at ASC, worker_id ASC, registered_at ASC + 集成测试 same-ms register → widA expected widA
- 验证命令: `grep -cE "ORDER BY.*last_heartbeat_at|ORDER BY.*registered_at" wrapper/orchestrator/worker_pool.ts wrapper/test/unit/worker_pool.test.ts`
- 期望: ≥ 2

#### §3.2.6 execution_driver routedDsh wire 机制（per F22）

- HTTP fallback path 替换为 `routedDsh()` + commit 注释 `// wire-routedDsh per F22 option A`
- 验证命令: `grep -cE "routedDsh\(\)|wire-routedDsh" wrapper/orchestrator/execution_driver.ts wrapper/test/integration/execution_driver.test.ts`
- 期望: ≥ 2

#### §3.2.7 Tailscale ACL tag:monitor 机制（per F28）

- tag:monitor 段 + tagOwners.tag:monitor: ["cscoheru"] + port 9090 仅 tag:admin 可达
- 验证命令: `grep -cE "tag:monitor|tagOwners|tag:admin|9090" deploy/tailscale-acl-6host.yaml`
- 期望: ≥ 4 (1 tag:monitor + 1 tagOwners + 1 tag:admin + 1 port 9090)

#### §3.2.8 OOM graceful shutdown 声明机制（per §3.10 + F27）

- audit-scope §3.10 + §3.11 + §3.12 声明 + commit 注释 graceful shutdown + integration test oom_prevention
- 验证命令: `grep -cE "§3\.10|§3\.11|§3\.12|OOM graceful shutdown|routedDsh wire|queue_store SQLite|wire-routedDsh" notes/codex-audit-scope-v1.2.0d-v0.1.md wrapper/orchestrator/execution_driver.ts wrapper/orchestrator/queue_store.ts wrapper/test/integration/oom_prevention.test.ts 2>&1 | awk -F: '{s+=$NF} END{print s}'`
- 期望: ≥ 5 (1 §3.10 + 1 §3.11 + 1 §3.12 + 1 OOM graceful shutdown + 1 oom_prevention test = 5)

### §3.3 30 验证命令 verbatim 校准

按 audit-scope §9 cmd 矩阵 30 命令逐条 grep 实测：
- §9.1 hygiene 8 命令（不锁型号 + 不硬编码 + §3.10/§3.11/§3.12 声明 + §4.15/§4.16/§4.17 守门）
- §9.2 tsc + vitest 4 命令（双 gate 绿）
- §9.3 docker compose + Prometheus 10 命令（memory limits + scrape + alert + graceful shutdown）
- §9.4 MacBook + 5 edge 5 命令（heartbeat + scoring + MagicDNS + fencing）
- §9.5 cc-ready + CHANGELOG + README 3 命令（task_id 翻牌 + [1.2.0d] 段 + status 段）

每命令期望值 verbatim 校准（不预测，引用式实测）。

---

## §4 Codex findings 提交格式

请以 JSON 格式输出 findings（每个 finding 一行）：

```json
[
  {
    "id": "H{N}",
    "severity": "M" | "m" | "C",
    "category": "hygiene" | "filesystem" | "wire" | "metrics" | "compose",
    "file": "<rel path>",
    "line": <1-indexed>,
    "claim": "<verbatim quoted line>",
    "why": "<factual 错误说明, 不解释背景>",
    "fix": "<具体改法>"
  }
]
```

**Severity 含义**：
- **C** (Critical): hygiene 守门违例, 必须修才能 PASS
- **M** (Major): 实施层 bug, 影响 v1.2.0d cycle closure
- **m** (minor): 命名/格式 polish, 同轮可清零

**注意**: 不要输出「建议性」finding (e.g., 「考虑加更多注释」), 仅输出可 grep 验证的事实错。

---

## §5 Codex 提交铁律

- Claude 不亲提 Codex review — **user 亲提**
- 用户命令模板: `codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md`
- Codex 报告落: `notes/codex-review-v1.2.0d-v0.1-formal-report.md` (per v1.2.0b/c 闭环模式)
- 复审后用户裁断: PASS → Commit 2 启动 / PASS with M+m → 同轮清零后再启 / FAIL → 等 user 决定 re-plan

---

## §6 push via Clash proxy 守门

任何 git push 操作必须通过 Clash 代理（per Codex 提交铁律）：

```bash
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin main
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.2.0d  # tag push
```

不允许 push 前未通过 Clash proxy 的命令。

---

*v1.2.0d v0.1 Codex prompt 起草 PASS — §1 角色 + §2 20 hygiene checklist + §3 Codex 期望输出 (8 处引用式 + 30 验证命令) + §4 findings JSON 格式 + §5 提交铁律 + §6 Clash push。等 user ExitPlanMode 批准 + Codex 亲提复审。*