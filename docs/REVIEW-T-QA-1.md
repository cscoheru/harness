# REVIEW — T-QA-1

> **Verdict**: **PASS**  
> **Date**: 2026-08-31  
> **Commit**: `2a223b2` (`feat(qa): mutation_suite lift v0.9.4 + deploy smoke P0 fix`)  
> **cc-ready**: task `T-QA-1`

---

## Phase 0 — deploy smoke 同 runner

| 检查 | 结果 |
|------|------|
| 独立 `smoke` job 已删除 | PASS |
| mutation + import 步骤在 `build` job 内（`load:true` 之后） | PASS |
| jobs = `build` + `push` | PASS |

## Phase A — `mutation_suite`

| 检查 | 结果 |
|------|------|
| `harness/testing/mutation_suite.py` 存在（~1029 行） | PASS |
| `python3 -m harness.testing.mutation_suite` 宿主 | **17/17 PASS**, exit 0 |
| 容器内同命令（无 spikes mount） | **17/17 PASS**, exit 0 |
| M12 不在集合；M1–M11 + M13–M18 | PASS |
| 优先 `harness.runtime.*`；M15 patch `workers.dispatch_worker` | 采信 commit/NOW（未逐行审计 1029 行） |

## P1（不挡）

- 工作区仍有大量早期 `harness/**` / `pyproject.toml` untracked（完整性债）  
- PyYAML `on`→`True` 键问题仍在（不影响 GHA）

---

## 下一单

已签发：[`docs/DISPATCH-T-QA-2.md`](DISPATCH-T-QA-2.md)
