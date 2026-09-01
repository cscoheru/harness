# 审验签发 — T-QA-5（SQLite 并发压力测试）

> **给 CC**：Cursor 暂不可用，本 dispatch 由架构师自签（per GA plan §2 T-QA-5 模板）。  
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。  
> 做完即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

> **回签时**：等 Cursor 复活后补一份 `REVIEW-T-QA-5.md`（PASS/P1 列）即可，本枪产物无需重做。

---

## 任务

**T-QA-5** — SQLite WAL 并发压力测试（GA plan §2 + §5 R-1/R-2）

### 背景

T-QA-3 benchmark 是 sequential round-robin（每 task 后主线程等 worker），没真打过 50-thread contention。  
T-QA-5 = 50 worker thread 同时 dispatch + claim + succeed 10000 attempts（50 workers × 200 tasks each），验：

- 不死锁（SQLite WAL 1 writer at a time, N readers — 50 writers 排队 OK）
- 不破 I15 partial UNIQUE `idx_worker_one_active_attempt`（同 worker 不能持 2 个 active attempt）
- 不破 I16 strict monotonic heartbeat（不 bump heartbeat, 跳过此检查 — 同 benchmark）
- 不破 `idx_attempts_one_active`（同 task 不能 2 active attempt — 但我们 10000 task 都是 distinct, 不会撞）
- R-2 阈值验证: 50 concurrent writers under WAL, 测吞吐 + p99

### 产出

| 文件 | 内容 |
|------|------|
| `harness/testing/stress_test.py`（新建） | CLI: `python -m harness.testing.stress_test --workers=N --tasks=N --out=path` |
| `harness/testing/__init__.py` | export `stress_test` (lazy via PEP 562 `__getattr__`) |
| `docs/DISPATCH-T-QA-5.md` | 本文件 |
| `docs/REVIEW-T-QA-5.md` | 架构师自签（Cursor 复活可追加） |
| `docs/NOW.md` | §2 加 T-QA-5 行; §4 → 下一枪 |

### 行为契约

1. **CLI**:
   ```
   python -m harness.testing.stress_test --workers=50 --tasks=200 --out results.json
   ```
   - 默认: `--workers=50 --tasks=200 --out=results.json`
   - `--csv=path`（可选，写 summary CSV）

2. **DB setup**:
   - `tempfile.mkstemp(suffix=".sqlite")` 创建 file DB
   - `connect_with_fk(path, apply_schema=True)` 在 seed connection 上 apply schema
   - **强制** `PRAGMA journal_mode = WAL` (在 seed + 每个 thread connection 上都 set)
   - pre-seed `tasks × workers` task rows (默认 10000)
   - pre-register `workers` 个 worker rows (默认 50, worker_id = `stress-w-{i}`)

3. **Thread model**:
   - `ThreadPoolExecutor(max_workers=workers)` 或 `threading.Thread` × N
   - 每个线程: `connect_with_fk(path, apply_schema=False)` (新连接)
   - 每线程: `PRAGMA journal_mode = WAL` (reaffirm, idempotent)
   - 每线程: `PRAGMA foreign_keys = ON` (reaffirm)
   - **同步屏障**: `threading.Barrier(workers)` — 所有线程同时起跑 (测真并发峰值)
   - 每线程 loop `tasks` 次 (默认 200):
     ```
     for i in range(args.tasks):
         task_id = task_ids[thread_idx * args.tasks + i]
         barrier.wait()        # 仅首次, 后续不等
         worker_id = dispatch_worker(conn, task_id, required_capability=None)
         attempt_id, _fence = claim(conn, task_id, worker_id)
         conn.execute("UPDATE task_attempts SET status='succeeded', "
         "  finished_at=? WHERE attempt_id=?",
         (_now_iso(), attempt_id))
         conn.execute("UPDATE workers SET current_attempt_id=NULL WHERE worker_id=?",
         (worker_id,))
         conn.commit()
     ```

4. **Verify (主线程 join 完后)**:
   - `SELECT COUNT(*) FROM task_attempts` == `tasks × workers` (默认 10000)
   - `SELECT COUNT(*) FROM task_attempts WHERE status='succeeded'` == `tasks × workers`
   - `SELECT COUNT(*) FROM workers WHERE status='active'` == `workers` (50)
   - **没有 ClaimRejected / FK violation / I15 violation / 任何 exception**

5. **输出 `results.json`** (per GA plan §5 R-2 阈值记录):
   ```json
   {
     "schema_version": "v1.0",
     "workers": 50,
     "tasks_per_worker": 200,
     "total_attempts": 10000,
     "wall_seconds": 12.345,
     "throughput_attempts_per_sec": 810.4,
     "latency_ms": {"mean": 1.234, "p50": 1.1, "p95": 3.2, "p99": 5.4, "max": 12.0},
     "counters": {
       "claim_rejected": 0,
       "deadlocks_detected": 0,
       "i15_violations": 0,
       "i16_violations": 0,
       "fk_violations": 0,
       "unique_violations": 0
     },
     "verification": {
       "task_attempts_total": 10000,
       "task_attempts_succeeded": 10000,
       "workers_active": 50,
       "all_match": true
     },
     "passes_gate": true,
     "gate_threshold": {"wall_seconds_max": 60.0, "throughput_min_per_sec": 100.0}
   }
   ```

6. **硬门 (PASS 条件)**:
   - `wall_seconds < 60.0`
   - `throughput_attempts_per_sec >= 100.0`
   - `verification.all_match == true`
   - `counters` 全 0
   - exit 0 if all 4 pass; else exit 1 + 写 stderr reason

### 验收

```bash
# 默认 50×200
python3 -m harness.testing.stress_test --workers=50 --tasks=200 --out /tmp/stress.json
cat /tmp/stress.json | python3 -c "import json,sys; r=json.load(sys.stdin); assert r['passes_gate']; print('OK', r['wall_seconds'], 's,', r['throughput_attempts_per_sec'], 'att/s')"

# smoke (5×10 = 50 attempts)
python3 -m harness.testing.stress_test --workers=5 --tasks=10 --out /tmp/stress-smoke.json

# YAML / 模块
python3 -c "from harness.testing import stress_test; print('ok')"

# 主机无回归
pytest tests/ -q                                              # 37/37 PASS
python3 -m harness.testing.mutation_suite                      # 17/17 PASS
python3 -m harness.benchmark.runner --tasks=50 --workers=4     # exit 0
```

### 不动

- `spikes/m0/_helpers.py` — 不删
- `spec/kernel-schema.sql` — 不改
- `.github/workflows/{ci,deploy,m0-contract-tests}.yml` — 不动
- `harness/runtime/{_db,workers,worker_pool,event_sink,context_manager}.py` — 不动
- `harness/benchmark/{__init__,runner}.py` — 不动
- `harness/testing/{mutation_suite,echo_server}.py` — 不动

### 关键设计抉择（capture 给 Cursor 看）

1. **每线程独立 connection**: sqlite3 default `check_same_thread=True`, connection 不能跨线程; thread-local conn 是 production 模式 (不是 connection pool)
2. **WAL mode 在每 conn 上 reaffirm**: WAL 是 database-level 不是 connection-level, 但 PRAGMA 设了之后 SQLite 返回 WAL mode 给 query 用; reaffirm 是 no-op if already WAL, 但 first thread 启动后才 enable 的话后续 thread 仍会继承 (file-level flag)
3. **barrier.wait() 仅首次**: 让所有 thread 同步起跑, 测峰值并发; 后续 iteration 不等, 避免 fake serialization
4. **skip heartbeat bump**: 同 T-QA-3 benchmark — I16 sub-millisecond ties 风险 + benchmark/stress test 不测 reap_stale; 用 `_now_iso()` 给 finished_at 即可
5. **distinct task_ids 避免 ClaimRejected**: 10000 attempts × distinct task = 0 race on same task; 否则会随机 ClaimRejected (1 个 thread 抢到, 其他 rowcount=0)
6. **release worker.current_attempt_id=NULL**: I15 partial UNIQUE 强制; 不 release 第二次 dispatch 同 worker 会撞

---

## 完成后

1. NOW：T-QA-5 ✅；§4 → 下一枪（M3 ladder 第一枪 = T-DD-*，或 fallback Cursor review backfill）
2. `docs/poll/cc-ready.json`（真实 commit）→ commit + push
3. 写本枪的 `docs/REVIEW-T-QA-5.md`（架构师自签 PASS — 等 Cursor 复活可追加签名）
4. **不要把 stress_test 加进 CI job 列表** — `tests/pytest` 已经覆盖功能性, stress 是 manual/diagnostic 工具, 进 CI 会爆分钟数 (R-5)

## 禁止

不开 T-DO-5/真 Codex；不删 `_helpers.py`；不改 schema RAISE；不开 v1.1；不 force push；不动 ci.yml / deploy.yml / m0-contract-tests.yml / production runtime code
