# 审验签发 — T-QA-3（benchmark）

> **给 CC**：只读本文件。上一枪 [`docs/REVIEW-T-QA-2.md`](REVIEW-T-QA-2.md) = **PASS**（37/37，不重做）。  
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。  
> 做完即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

---

## 任务

**T-QA-3** — benchmark 套件（GA plan §2）

### 产出

| 文件 | 内容 |
|------|------|
| `harness/benchmark/__init__.py` | 子包 marker |
| `harness/benchmark/runner.py` | CLI：`python -m harness.benchmark.runner` |
| 输出 | 默认写 `results.json`（+ 可选 CSV）；含 throughput、latency **p50/p95/p99** |

### 行为契约

1. 负载对象：`SqliteWorkerPool`（register N workers → 派/领 M tasks；或等价 claim/dispatch 循环）  
2. 用 `harness.runtime._db.make_db()`（file DB，勿用纯 :memory: 测 WAL 吞吐若无意义）  
3. CLI 参数至少：`--tasks`（默认 50）、`--workers`（默认 4）、`--out`（默认 `results.json`）  
4. 指标：wall 时间、tasks/s（throughput）、每 task 延迟分布 → p50/p95/p99（毫秒）  
5. **硬门**：默认跑 `--tasks=50 --workers=4` 时 **p99 < 5000ms**（失败则 CLI exit ≠ 0）  
6. smoke（GA §4）：`--tasks=10 --workers=2` 须可跑通并出文件  

### 验收

```bash
python3 -m harness.benchmark.runner --tasks=10 --workers=2 --out /tmp/bench-smoke.json
python3 -m harness.benchmark.runner --tasks=50 --workers=4 --out results.json
# results.json 含 p50/p95/p99；p99 < 5000；exit 0

# 无回归
pytest tests/ -q
python3 -m harness.testing.mutation_suite
```

---

## 完成后

1. NOW：T-QA-3 ✅；§4 → **T-QA-4**（CI 三 job）或 **T-QA-5**（压力）；默认 **T-QA-4**  
2. `docs/poll/cc-ready.json`（真实 commit）→ commit + push  
3. 更新 HANDOFF；停等 REVIEW

## 禁止

不开 T-DO-5/真 Codex；不删 `_helpers.py`；不改 schema RAISE；不开 v1.1；不 force push
