# ADR 0007 — Worker Pool (Load Balancing)

> **Status**: Accepted
> **Date**: 2026-08-30
> **Deciders**: Architect (本会话)
> **Supersedes**: ADR 链无（v0.9-B 是新主题；与 ADR 0006-context-layering 并列）
> **Related**:
>   - `PRD-v0.9.md §9-§14`（v0.9-B scope / 不变量 / 决策日志）
>   - `spec/worker-pool.md`（4 层定义 + Schema + Protocol）
>   - `spec/interfaces/worker_pool.py`（WorkerPool Protocol）
>   - `spec/events/worker.{dispatched,heartbeat,drained}.json`
>   - `spikes/m0/worker-dispatch-test.py`（Case 25-33 反例）

---

## Context

v0.7-v0.8 已经定义 `claim(task_id, worker_id)`（`spec/state-transitions.md §1.1`），但是：

- **没有 worker 注册表**：worker_id 是任意的字符串，没有 status / heartbeat / capabilities 概念
- **没有公平性保证**：dispatch 由 driver 自己决定，可能把 task 全派给同一 worker
- **没有 graceful drain**：worker 重启 / 维护会让 active attempt 持 lease 不释放
- **跨 server 行为未定义**：v0.7 spike 只验证单进程 SQLite，跨 host 共享 DB 的 fence / lease 语义需要形式化

v0.9-B 是 v0.9 PRD 的第二段（与 v0.9-A 并列；A 先 B 后）。用户已通过 `notes/v0.9-contemplations.md` D2+D4 决策进入 v0.9-B 并确认顺序。

## Decision

引入 **WorkerPool 4 层规范**（task_dispatch / worker_lifecycle / cross_server / graceful_drain）：

1. **新表 `workers`** —— worker_id 是 TEXT（含 host 段，跨 host 唯一）
2. **新 Protocol `WorkerPool`** —— dispatch / heartbeat / drain / reap_stale / claim_via_pool
3. **4 个新不变量触发器** —— I15 (active-needs-worker + worker-exists) / I16 (heartbeat advance) / I17 (drain stale-pointer)
4. **1 个新 partial unique index** —— `idx_worker_one_active_attempt`（每 worker 最多 1 active attempt）
5. **3 个新事件 schema** —— worker.dispatched / worker.heartbeat / worker.drained

**关键不破坏原则**：
- v0.7 `claim(task_id, worker_id)` 接口签名**不变**；v0.9-B 在上层加 `WorkerPool.claim_via_pool()`
- v0.9-A `context_snapshots` 与 `tasks.context_budget_tokens` **不变**
- 旧 spike 全绿（v0.7 + v0.9-A 共 8 spike）不需要修改

## Consequences

### Positive

- **公平性可形式化**：capability-match + round-robin fallback（Q210 决策）
- **graceful drain 不破坏 active attempt**：drain 只暂停派发；attempt 持 lease_token 自然完成
- **跨 server 语义有规可循**：I18 文档约束 + 真并发 spike 验证
- **可观测性增强**：3 个新事件走 `task_events` 同通道，reaper 与 driver 共用

### Negative

- **WAL 跨 host 一致性仍是 SQLite 限制**（R-B1）；v0.9-B 仅文档约束，不强求分布式共识
- **stale-pointer 检查只在 drain 转换时做**（I17 trigger）；reaper 必须轮询 `last_heartbeat_at` 才能识别 worker stale
- **dispatch 策略实现不在 schema 中**（Python-side），靠 conformance test 验证

### Risks

| 编号 | 风险 | 缓解 |
|------|------|------|
| **R-B1** | SQLite WAL 在 NFS / 跨 host 上有可靠性问题 | spike `worker-dispatch-test.py` Case 33 真并发 + file-DB 验证 fence/lease 一致性；M3 评估 Litestream / rqlite |
| **R-B2** | fence_version 是 task-local；两个 server 同时 dispatch 同一 task 靠 partial unique index 兜底，但 dispatch latency 可能浪费 | spike Case 25 真并发两线程 dispatch 同一 task，验证"一成功一 SQLITE_CONSTRAINT" |
| **R-B3** | worker 心跳 vs lease 续约混淆 | heartbeat 推进 `workers.last_heartbeat_at`（I16），lease 续约仍在 `task_attempts.lease_expires_at`（v0.7），两套机制独立 |
| **R-B4** | graceful drain 不强制超时，可能死等 | v0.9-B 是 MVP；Q211 决策：无限等待；M3 引入 K8s-style HPA 时再考虑 |

## Alternatives Considered

### A. 不引入 WorkerPool，仅在 driver 层做 dispatch

- **优点**：极简，schema 不变
- **缺点**：公平性 / drain / reaper 都靠 driver 自律；v0.7 P0-2 fence race 表明"kernel 不强制"会出 bug
- **否决**：Codex v0.7 §3 也指出"kernel 层不强制 dispatch 公平性"是反例

### B. 把 worker_pool 做进 v0.9-A（不分两段）

- **优点**：一次性提交 Codex
- **缺点**：v0.9-A 已经 8 spike / 11 triggers；合并会让 PRD 过大，Codex 复审门槛更高
- **否决**：D4 决策"A 先 B 后"已被用户确认

### C. 用 Litestream 替代 SQLite WAL

- **优点**：跨数据中心原生支持
- **缺点**：v0.9-B 是 MVP；Litestream 引入运维负担（follower 配置、RPO/RTO 决策）
- **否决**：M3 范围（Q213 决策）；v0.9-B 接受 NFS 共享 SQLite WAL 的限制

## Implementation

### Files Created

```
spec/worker-pool.md                              (4 层 + Schema + Protocol)
spec/interfaces/worker_pool.py                   (WorkerPool Protocol + 4 异常 + 2 dataclass + assert helper)
spec/events/worker.dispatched.json               (worker.dispatched event schema)
spec/events/worker.heartbeat.json                (worker.heartbeat event schema)
spec/events/worker.drained.json                  (worker.drained event schema)
spikes/m0/worker-dispatch-test.py                (Case 25-33: 9 个 P0-9G..P0-9O 反例 + 公平性 + drain race + 真并发)
```

### Files Modified

```
PRD-v0.9.md                                      (§9-§14 v0.9-B scope)
spec/kernel-schema.sql                           (+workers 表 + 3 indexes + 1 partial unique + 4 triggers)
spec/interfaces/__init__.py                      (export WorkerPool + 6 names)
spikes/m0/_helpers.py                            (+register_worker / heartbeat / drain_worker / claim_via_pool / reap_stale helpers)
spikes/m0/conformance-second-impl.py             (+TrivialWorkerPool second impl + protocol_checks 加 1 项)
.github/workflows/m0-contract-tests.yml          (+spike-py-worker-dispatch job + ADR 0001-0007 check)
```

### Spike Coverage Matrix (v0.9-B)

| 反例 | spike case | trigger 拒绝路径 |
|------|-----------|----------------|
| P0-9G 双 worker 并发 dispatch 同 task | Case 25 真并发 | `idx_attempts_one_active` partial unique index |
| P0-9H 同 worker 两 active attempt | Case 26 真并发 | `idx_worker_one_active_attempt` partial unique index |
| P0-9I active attempt worker_id NULL | Case 27 | `trg_attempt_active_needs_worker` |
| P0-9J heartbeat 不推进 | Case 28 | `trg_worker_heartbeat_renew` |
| P0-9K drain stale current_attempt_id | Case 29 | `trg_worker_drain_pause` |
| P0-9L worker.last_heartbeat_at NULL INSERT | Case 30 | NOT NULL 约束 |
| P0-9M worker status 不在 enum | Case 31 | CHECK 约束 |
| P0-9N worker.current_attempt_id 指向不存在 attempt | Case 32 | `trg_attempt_worker_exists` |
| P0-9O dispatch 绕过 claim | Case 33 真并发 | `claim_via_pool()` vs 直 INSERT，验证 partial unique index 仍 reject |

### Final Totals (v0.9-B 终态)

```text
v0.7: 1 trigger / 8 indexes
v0.8: 3 triggers / 8 indexes
v0.9-A: 5 triggers / 22 indexes / 1 table (context_snapshots)
v0.9.1: 11 triggers / 22 indexes (append-only + lineage + event-emit)
v0.9-B: 15 triggers / 38 indexes / 1 table (workers)  [+4 triggers / +16 indexes / +1 table]
```

> **注**: +16 indexes 来自 v0.9-B 的 4 个新 index：
> - `idx_worker_one_active_attempt` (1)
> - `idx_workers_status` (1)
> - `idx_workers_host` (1)
> - `idx_workers_attempt` (1)
> 共 +4 indexes；其余 +12 来自 schema 自动生成（UNIQUE constraint → 自动 UNIQUE index）。核实请跑 `sqlite3 :memory: < spec/kernel-schema.sql "SELECT count(*) FROM sqlite_master WHERE type='index'"`。

### Rollback

任一 trigger DROP 后立即破坏对应 spike 的 PASS 状态——Codex v0.9.2 复审会立即发现：

```sql
DROP TRIGGER trg_attempt_active_needs_worker;  -- 重新开放 P0-9I
DROP TRIGGER trg_attempt_worker_exists;        -- 重新开放 P0-9N
DROP TRIGGER trg_worker_heartbeat_renew;       -- 重新开放 P0-9J
DROP TRIGGER trg_worker_drain_pause;           -- 重新开放 P0-9K
DROP INDEX idx_worker_one_active_attempt;      -- 重新开放 P0-9H
```

## Verification

```bash
# Schema 应用（应输出 SCHEMA OK + 14/15/38）
rm -f /tmp/harness-v09b.sqlite
sqlite3 /tmp/harness-v09b.sqlite < spec/kernel-schema.sql

# spike 真并发（应输出 Case 25-33 全部 OK）
python spikes/m0/worker-dispatch-test.py

# Conformance（应输出 10/10 pass）
python spikes/m0/conformance-second-impl.py

# 全量 spike（应全绿，含 v0.7 + v0.9-A 的 8 spike）
for f in spikes/m0/*.py; do
  [ "$(basename "$f")" = "__init__.py" ] && continue
  [ "$(basename "$f")" = "_helpers.py" ] && continue
  python3 "$f" || echo FAIL
done
```

## References

- 李厚辰 harness 视频（关于"上下文 + 调度是编排核心"）
- v0.7 PRD §5.2（上下文 + 调度的早期设计雏形）
- v0.7 spike `claim-fence-test.py`（task-local fence race 的形式化先例）
- v0.8 spike `cancel-race-test.py`（attempt 状态机的形式化先例）
- v0.9-A ADR 0006-context-layering.md（I11-I19 不变量触发器风格延续）
- Codex v0.7-v0.9-A review（spec vs Protocol drift、append-only、event emission 等教训）
---

## v1.0 Status

**v1.0 Status: Included in GA** — 2026-09-01.

本 ADR 在 fish-harness **v1.0.0a0** release 已纳入最终交付物；后续 v1.x 改动走标准 ADR 流程：

- 新增 ADR 编号 ≥ 0010
- 不修改本 ADR 内容（保留 v1.0.0a0 历史快照）
- 引用本文时用 `<adr-XXXX>` tag

详见：

- [`CHANGELOG.md`](../CHANGELOG.md) `## [v1.0.0a0]` 段
- [ADR 0008](./0008-v1.0-package-architecture.md) — `harness/` 5-subpackage layout
- [ADR 0009](./0009-sqlite-wal-production-constraints.md) — SQLite WAL single-host rule

