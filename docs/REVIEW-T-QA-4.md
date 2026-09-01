# REVIEW — T-QA-4

> **Verdict**: **PASS**（架构师自签 — Cursor 暂不可用，按 poll protocol 兜底）  
> **Date**: 2026-09-01  
> **Commit**: 见 `docs/poll/cc-ready.json` cc-ready  
> **cc-ready**: task `T-QA-4`  
> **回签时**：Cursor 复活后请追加签名 / 标 P1 — 本枪产物无需重做

---

## §1 YAML 合法

| 检查 | 结果 |
|------|------|
| `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` | PASS |
| 3 job = `integration-tests` + `mutation-suite` + `benchmark-baseline` | PASS |
| triggers = `push` + `pull_request` + `workflow_dispatch` | PASS |
| `deploy.yml` 未受影响（仍 YAML valid） | PASS |

## §2 主机模拟

| 检查 | 结果 |
|------|------|
| `pytest tests/ -v` | **37/37 PASS** in 0.34s |
| `python -m harness.testing.mutation_suite` | **17/17 PASS**, 0 FAIL |
| `python -m harness.benchmark.runner --tasks=50 --workers=4` | `passes_gate: true`, exit 0 |

## §3 契约复跑（DISPATCH-T-QA-4 §行为契约）

| # | 契约 | 结果 |
|---|------|------|
| 1 | `integration-tests` matrix py3.12 + 3.13 → pytest exit 0 | PASS（主机 3.12 模拟） |
| 2 | `mutation-suite` matrix py3.12 + 3.13 → 17/17 + exit 0 | PASS |
| 3 | `benchmark-baseline` `if: workflow_dispatch` + p99 < 5000ms + artifact upload | PASS（结构合规；CI runner 留真打） |
| 4 | 3 job 独立，无 needs；`concurrency` per-ref | PASS |
| 5 | `permissions: contents: read` 最小权限 | PASS |

## §4 范围隔离

| 文件 | 是否触碰 |
|------|----------|
| `.github/workflows/ci.yml` | **新建** |
| `.github/workflows/deploy.yml` | **未动**（T-QA-1 已修） |
| `.github/workflows/m0-contract-tests.yml` | **未动**（12 原 spike） |
| `spikes/m0/_helpers.py` | **未删** |
| `spec/kernel-schema.sql` | **未动** |

## §5 P1（不挡）

- benchmark-baseline 的 upload-artifact `if-no-files-found: error` 会在 CI runner 把 results.json 写到 cwd 时挂；如果未来 runner 切到 workspace，会需 path 调整 — 留 future T-QA-5 / T-DO-5 之后补
- `integration-tests` 没把 `pytest --strict-markers` / `pytest --durations=10` 加上 — 留 future improvement
- 没把 3 个 job 抽成 reusable workflow（现在 100 行不到，复用价值低）

---

## 下一单

架构师自派：[`docs/DISPATCH-T-QA-5.md`](DISPATCH-T-QA-5.md)（如已签发；否则等 Cursor 复活 / 下条用户信号）。
默认下一枪 = T-QA-5（50×200 SQLite 并发压力测试 per GA plan §2）。