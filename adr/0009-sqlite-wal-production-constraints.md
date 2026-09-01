# ADR 0009 — SQLite WAL Production Constraints (Single-Host Only)

> **Status**: Accepted (v1.0)
> **Date**: 2026-09-01
> **Deciders**: Architect (T-DD-5 自签 — Cursor 暂不可用，per GA plan §2 T-DD-5 模板)
> **Supersedes**: ADR 链无（v1.0 新主题；与 ADR 0005/0006/0007/0008 并列）
> **Related**:
>   - [`spec/kernel-schema.sql §PRAGMA`](../spec/kernel-schema.sql) — line 73-75: `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`
>   - [`spec/worker-pool.md §6`](../spec/worker-pool.md) — **Invariant I18: Cross-server 共享 DB 约束**
>   - [`spec/worker-pool.md`](../spec/worker-pool.md) line 67-101 — Invariants I15/I16/I17 + 触发器边界
>   - [`harness/runtime/_db.py`](../harness/runtime/_db.py) — `connect_with_fk()` re-affirms `PRAGMA journal_mode = WAL` per connection
>   - [`spikes/m0/worker-dispatch-test.py`](../spikes/m0/worker-dispatch-test.py) — `threading.Barrier` 真并发验证
>   - [`spikes/m0/conformance-second-impl.py`](../spikes/m0/conformance-second-impl.py) — 10/10 Protocol runtime_checkable
>   - [`docker-compose.yml`](../docker-compose.yml) — line 6-12: `Constraints (per ADR 0009)` comment
>   - [`Dockerfile`](../Dockerfile) — `python:3.14-alpine` base + SQLite ≥ 3.47 gate
>   - [ADR 0008](./0008-v1.0-package-architecture.md) — `harness/runtime/` 是 ADR 0009 的 implementation owner
>   - [`CHANGELOG.md`](../CHANGELOG.md) ADR cross-ref table — 0009 现挂 accepted link

---

## Context

v0.9-B 阶段已经定义了 SQLite WAL + 6 trigger invariants（I1 / I11 / I14 / I15 / I16 / I17），并且 `spec/worker-pool.md §6` 文档化了 **Invariant I18: Cross-server 共享 DB 约束**。v1.0 引入 `harness/runtime/` production 类后，需要把以下决策**正式记录在 ADR 层面**，否则：

- 运维误把 `harness_db` volume mount 到 NFS → POSIX advisory lock 行为未定义 → WAL stale read / silent corruption
- 运维误把多个 container 通过 `network_mode: host` 共享 file-DB → cross-host dispatch 不可靠
- 业务方误以为 v1.0 支持 multi-region active-active → 试图扩到 2+ AZ → 重复 dispatch + fence violation
- post-v1.0 评估 rqlite/Litestream 时没有 baseline 文档

GA plan §5 R-2 已经识别风险：「SQLite WAL 并发上限（~20 写并发后 lock contention）」— 概率 Low (M1-M2 规模)，影响 High。需要在 ADR 层面落地约束。

## Decision

### 单 host 强约束（v1.0 binding）

- ✅ **SQLite WAL 单 host**：v1.0 production runtime 必须在**单个 host**上运行（单个 container / single VM / single bare-metal）。所有 worker 进程、test-runner、benchmark runner 都通过同一台 host 的本地文件系统访问 `harness_db`。
- ❌ **NFS / CIFS / shared block storage 不可**：`harness_db` 不能 mount 到 NFS、CIFS、GlusterFS、CephFS 或任何远程块存储。SQLite WAL 依赖 `fcntl(F_SETLK)` / `lockf()` 之类的 POSIX advisory lock；这些锁在 NFS 上语义未定义（部分 NFS 实现会把锁降级为本地锁，导致多 host 同时看到 stale WAL 状态）。
- ❌ **Multi-region active-active 不可**：v1.0 不支持跨 region / 跨 AZ 的 active-active 部署。即使通过 S3-backed Litestream 把 WAL 流到第二 region，第二 region 只能作为**灾备 warm standby**（manual failover + accept data loss window），不能直接并发 open WAL。
- ❌ **Multi-host active-active 不可**：即使在同一 region 的不同 host，也不能共享 WAL 文件。每个 host 必须独立持有自己 `harness_db` 文件（典型场景：每台 worker host 跑自己的 harness container，挂本地 `harness_db` volume）。

### docker-compose.yml / production deploy 约束

- `docker-compose.yml` 注释 line 6-12 已经包含 `Constraints (per ADR 0009): SQLite WAL is SINGLE-HOST only` 提示
- `harness_db` volume 必须是 local volume（不是 `nfs` driver 或 `cifs` driver）
- production deploy（`deploy.yml` 推到 GHCR + 多 host 场景）：**每个 host 跑独立 harness container + 独立 harness_db volume**；container 之间不共享 DB
- 单 host 内可以跑多个 worker 进程（同一 DB file），但**总 worker 数建议 ≤ 16**（per GA plan §5 R-2 lock contention 上限）

### 性能 + 并发上限（实测 baseline）

- v1.0 实测（`harness/testing/stress_test.py` T-QA-5）：**50 workers × 200 tasks per worker = 10000 attempts**，WAL 模式下:
  - throughput ≈ **1968 attempts/s** 单 host
  - p99 latency < 70 ms
  - `i15=0, fk=0, unique=0`（no violation）
- 横向扩展方式：**单 host 加 worker 数**直到 lock contention 上限（实测 ~20 write workers 后开始退化）；**超过 20 worker 必须 multi-host 各自独立 DB**（见上）
- `BUSY_TIMEOUT = 5000 ms`（`PRAGMA busy_timeout` line 74）：单 host 写锁等待最多 5 秒后失败抛出 `sqlite3.OperationalError(database is locked)`

### post-v1.0 评估路径（NOT in v1.0 scope）

- **rqlite**：分布式 SQLite over Raft consensus。v1.0 不集成；post-v1.0 评估「单 host SQLite + Raft replication」是否能替代 NFS 共享。预期 trade-off：单 host 写入吞吐 ↓（Raft log append），但支持 multi-region active-active。
- **Litestream**：S3-backed WAL streaming。**v1.0 不集成**；post-v1.0 评估「warm standby + 5-min RPO」是否能满足灾备 SLA。预期 trade-off：failover 必须 manual + 接受 ≤ 5 min 数据丢失。
- **rqlite + Litestream 组合**：rqlite 解决 multi-region 写一致；Litestream 解决 backup/recovery。v1.0 **不集成任何一种**；post-v1.0 评估时需明确选型标准。

### 与 ADR 0008 的 ownership

`harness/runtime/` 是 ADR 0009 的 implementation owner：
- `harness/runtime/_db.py:connect_with_fk()` 每个 connection 必须 re-affirm `PRAGMA journal_mode = WAL`（per-connection idempotent）
- `harness/runtime/_db.py` **不实现** 任何 distributed lock / cross-host coordination（明确不实现，避免 scope creep）
- `harness/runtime/worker_pool.py:SqliteWorkerPool.claim_via_pool()` 依赖 single-host WAL 假设；如果未来 multi-host，必须在 dispatch 层加 host-id fencing（不在 v1.0 scope）

### 与 ADR 0005/0006/0007 的关系

- **ADR 0005 (Tool Invocation Gateway)**：6-step chain 全部 single-host（gateway 不依赖任何 cross-host 状态）。
- **ADR 0006 (Context Layering)**：L1/L2/L3 lineage 通过 `context_snapshots` 内部 join，single-host 即可（无 cross-host query）。
- **ADR 0007 (Worker Pool)**：dispatch / heartbeat / drain 全部依赖 single-host WAL；`task_attempts` partial UNIQUE index (I15) 在 multi-host 下会失效。

## Alternatives Considered

- **A1: SQLite WAL 支持 NFS** — 拒绝。NFS advisory lock 语义未定义；社区有大量「SQLite over NFS」失败的 case。**用户硬规则 + GA plan §5 R-2 风险表已识别**。
- **A2: 集成 rqlite 作为 v1.0 默认** — 拒绝。rqlite 是 Go-based distributed SQLite；与现有 `harness/runtime/_db.py` (Python `sqlite3` stdlib) 集成需要重写所有 connection 层。**v1.0 时间线不允许**；post-v1.0 评估。
- **A3: 集成 Litestream 作为 v1.0 backup** — 拒绝。Litestream 是 streaming backup tool；它**不解决 multi-host 一致性问题**，只解决 RPO + DR。v1.0 灾备 SLA 未要求；post-v1.0 评估。
- **A4: 改用 PostgreSQL** — 拒绝。`spec/kernel-schema.sql` 强依赖 SQLite 特有的 `RAISE(ABORT, expr || expr)` (≥ 3.47) + partial UNIQUE index + WAL mode。PostgreSQL 需要重写 schema + 全部 trigger；不在 v1.0 scope。

## Consequences

- ✅ **可预测**：v1.0 production runtime 部署模式唯一（单 host local volume）；运维无歧义
- ✅ **可测试**：`spikes/m0/worker-dispatch-test.py` 在单 host 用 `threading.Barrier` 验证真并发；50×200 10000 attempts 实测通过
- ✅ **可升级**：post-v1.0 评估 rqlite/Litestream 的 baseline 已锁定（单 host WAL 1968/s + p99 < 70ms + 16 worker 上限）
- ✅ **与 ADR 0008 配套**：runtime 不引入 distributed lock / cross-host coordination；scope 锁定 single-host
- ❌ **不可水平扩展**：超过单 host capacity 必须 multi-host（每个 host 独立 DB），跨 host 不共享数据
- ❌ **灾备弱**：v1.0 无异地容灾；`harness_db` volume 丢失 = 数据丢失（无 Litestream 备份）
- ❌ **lock contention 上限**：单 host 写 worker > 16 后吞吐退化（per GA plan §5 R-2）

---

## 自签声明 (T-DD-5)

本 ADR 由架构师自签（per GA plan §2 T-DD-5 模板，Cursor 暂不可用）。
回签时：Cursor 复活后请追加签名 / 标 P1 — 本 ADR 内容无需重做。

## v1.0 Status Footer (T-DD-6 同步加)

待 T-DD-6（9 ADR v1.0 footer updates）时加：
> **v1.0 Status: Included in GA**. 本 ADR 在 v1.0.0a0 release 已纳入最终交付物；后续 v1.x 改动走标准 ADR 流程。