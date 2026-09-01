# REVIEW — T-QA-5

> **Verdict**: **PASS**（架构师自签 — Cursor 暂不可用，按 poll protocol 兜底）  
> **Date**: 2026-09-01  
> **Commit**: 见 `docs/poll/cc-ready.json` cc-ready  
> **cc-ready**: task `T-QA-5`  
> **回签时**：Cursor 复活后请追加签名 / 标 P1 — 本枪产物无需重做

---

## §1 行为契约复跑

| # | 契约 | 结果 |
|---|------|------|
| 1 | CLI `--workers=50 --tasks=200 --out=results.json` | PASS（exit 0） |
| 2 | `tempfile.mkstemp` + `connect_with_fk(apply_schema=True)` + `PRAGMA journal_mode = WAL` 在 seed conn + 每 thread conn 上 reaffirm | PASS |
| 3 | pre-seed `tasks × workers` = 10000 tasks; pre-register 50 workers | PASS |
| 4 | `threading.Thread × 50` + `threading.Barrier(50)` peak-concurrency start | PASS |
| 5 | 每 iteration 单 transaction (BEGIN IMMEDIATE → claim → succeed → release → COMMIT) | PASS |
| 6 | `verification.all_match == True` + 全计数器 = 0 | PASS |

## §2 主机模拟

| 检查 | 结果 |
|------|------|
| `python3 -m harness.testing.stress_test --workers=5 --tasks=10 --out /tmp/smoke.json` | **50/50 PASS**, exit 0, throughput 633/s |
| `python3 -m harness.testing.stress_test --workers=50 --tasks=200 --out /tmp/stress.json` | **10000/10000 PASS**, exit 0, wall=5.08s, throughput=1968/s, p99=260ms, all_match=True, i15=0, fk=0, unique=0 |
| `pytest tests/ -q` | **37/37 PASS** in 0.24s |
| `python3 -m harness.testing.mutation_suite` | **17/17 PASS**, 0 FAIL |
| `python3 -m harness.benchmark.runner --tasks=50 --workers=4` | `passes_gate: true`, exit 0 |

## §3 R-1 / R-2 阈值

| 风险 | 阈值 | 实测 |
|------|------|------|
| R-1 spike→production 漂移 | 50 concurrent writers 不死锁 / 不破 I15 | ✅ 10000/10000 全 succeeded, i15=0 |
| R-2 SQLite WAL 并发上限 | throughput ≥ 100/s, wall ≤ 60s | ✅ 1968/s, wall=5.08s (10× 余量) |

## §4 关键设计抉择（capture 给 Cursor 看）

| 抉择 | 理由 |
|------|------|
| 每 iteration 单 transaction | 原 naive 模式 (`_db.claim()` + outer auto-commit UPDATE) 有微秒级 race window; 同 worker 在 claim commit 后 outer UPDATE 之前可被另一 thread dispatch → I15 partial UNIQUE 撞 ~1-2% |
| 保留 'claimed' 中间态 | `trg_attempt_terminal_task_insert` trigger 检查 task 状态, 跳过 'claimed' → attempt INSERT (status='claimed') 通过 trigger; 直接 INSERT succeeded 撞 trigger |
| 每线程独立 sqlite3.Connection | sqlite3 default `check_same_thread=True`; WAL mode file-level flag, 在首个连接 set 后所有连接继承 |
| Barrier 仅首次 wait | 让所有 thread 同步起跑测峰值并发; 后续 iteration 不等避免 fake serialization |
| 跳过 heartbeat bump | I16 sub-millisecond ties 风险 + stress 不测 reap_stale (同 T-QA-3 benchmark) |
| distinct task_ids (10000 个) | 避免同 task 双 claim (idx_attempts_one_active); round-robin 仍触发 50 worker 共享 |
| release worker.current_attempt_id=NULL | I15 partial UNIQUE 要求; 不 release 后续 dispatch 同 worker 会撞 |

## §5 范围隔离

| 文件 | 是否触碰 |
|------|----------|
| `harness/testing/stress_test.py` | **新建** (374 行) |
| `harness/testing/__init__.py` | **未动** (stress_test 不需要 lazy import — 模块顶部直接 import 不引入 mutation_suite 重型副作用) |
| `spec/kernel-schema.sql` | **未动** |
| `harness/runtime/{_db,workers,worker_pool,...}.py` | **未动** |
| `harness/benchmark/*` | **未动** |
| `harness/testing/{mutation_suite,echo_server}.py` | **未动** |
| `.github/workflows/{ci,deploy,m0-contract-tests}.yml` | **未动** (stress 不进 CI — R-5 资源护栏; manual/diagnostic 工具) |
| `spikes/m0/_helpers.py` | **未删** |

## §6 P1（不挡）

- 50×200 host peak 单跑 ~5s, 但 CI runner (ubuntu-latest) 更慢 + 资源争用; 不进 ci.yml (per DISPATCH §R-5 资源护栏); 留给 v1.0.1 评估 LiteFS / pysqlite3-binary
- `passes_gate` 阈值 (60s wall / 100/s throughput) 是 generous — T-QA-3 benchmark 已验 4128/s, stress 2000/s 仍有 20× 余量; 若 v1.0.1 实际部署发现 R-2 更紧, 可调
- 没把 stress_test 加进 T-TG-5 的 `InProcessEgressServer` 测试矩阵 — stress 测的是 DB, egress 是 HTTP; 边界清
- 没做 multi-host stress (单 host SQLite only per ADR 0009) — 多 host 留 post-v1.0 rqlite/Litestream 评估

---

## 下一单

架构师自派：M3 ladder 起步（**T-DD-1** README.md per GA plan §2），或 fallback 等 Cursor 复活 review backfill (REVIEW-T-QA-3 / REVIEW-T-QA-4)。
默认下一枪 = **T-DD-1** (README.md) — 文档交付, 单文件, low risk。