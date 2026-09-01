# 审验签发 — T-DD-1（README.md 重写）

> **给 CC**：Cursor 暂不可用，本 dispatch 由架构师自签（per GA plan §2 T-DD-1 模板）。  
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。  
> 做完即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

> **回签时**：等 Cursor 复活后补一份 `REVIEW-T-DD-1.md`（PASS/P1 列）即可，本枪产物无需重做。

---

## 任务

**T-DD-1** — README.md 重写（GA plan §2 + §4 验收清单第 11 步）

### 背景

T-DO-1 placeholder README（8 行 stub）满足 `pyproject.toml [project].readme`，让 `pip install -e .` 能 build wheel。  
M3 GA Exit Gate 必须 `test -f README.md` + GitHub 渲染正常 + `pip show harness` description 不空 + 链接到 `adr/` `CHANGELOG.md` 全部 reachable。  
T-DD-1 = 把 placeholder 升级为 M3-grade README。

### 产出

| 文件 | 内容 |
|------|------|
| `README.md`（重写覆盖 placeholder） | 项目概览 / 架构图（text）/ quick start / 10 Protocol 接口表 / 5 特性表 / link 到 `adr/0008-v1.0-package-architecture.md` `adr/0009-sqlite-wal-production-constraints.md` `docs/v1.0-ga-team-plan.md` `CHANGELOG.md` |
| `docs/DISPATCH-T-DD-1.md` | 本文件 |
| `docs/REVIEW-T-DD-1.md` | 架构师自签（Cursor 复活可追加） |
| `docs/NOW.md` | §2 加 T-DD-1 行；§4 → 下一枪 |

### 行为契约

README 必须包含以下 section（顺序按 GitHub 渲染优先级）：

1. **H1 标题 + tagline**: `fish-harness` / v1.0 runtime (Python kernel) / task orchestration + SQLite-backed worker pool + event sink + tool gateway
2. **Status badge 行**: `v1.0.0a0` + `MIT License` + `Python >= 3.12`
3. **TL;DR** (3 行 elevator pitch): 一句话说清"做什么 / 怎么做 / 跟谁不一样"
4. **Architecture** ASCII 图: tasks → WorkerPool → workers + EventSink + ContextManager + ToolGateway → artifacts + audit_log
5. **Quick start** 代码块: `pip install -e .` + `python -c "import harness"` + 容器一行
6. **10 Protocol 接口表**: markdown table | name | spec file | role | production impl
7. **5 特性表**: 每行 1 特性 = name + 1 行说明 + link
8. **Tests + Benchmarks section**: 4 个命令（pytest / mutation / benchmark / stress）+ 各自 gate 阈值
9. **Container + CI**: `docker build` + 3 个 CI job 名 (integration-tests / mutation-suite / benchmark-baseline)
10. **Documentation index**: 链接到 `docs/PRD-V0.1-NORTH-STAR.md` `docs/v1.0-ga-team-plan.md` `adr/0008-v1.0-package-architecture.md` `adr/0009-sqlite-wal-production-constraints.md` `CHANGELOG.md` `LICENSE`
11. **License footer**: MIT 简注 + copyright `cscoheru`

### 10 Protocol 表（GA plan 口径）

按 `spec/interfaces/*.py` 实际文件 + GA plan §2 T-BE-5 + ContextManager composite:

| # | Name | spec file | role | production impl |
|---|------|-----------|------|-----------------|
| 1 | WorkerPool | `spec/interfaces/worker_pool.py` | dispatch / heartbeat / drain / reap / claim | `harness.runtime.SqliteWorkerPool` |
| 2 | EventSink | `spec/interfaces/event_sink.py` | append-only event log (task.* / worker.*) | `harness.runtime.SqliteEventSink` |
| 3 | ContextDistiller | `spec/interfaces/context_distiller.py` | distill raw blobs → L1 units; sha256 idempotent | `harness.runtime.SqliteContextManager` |
| 4 | ContextBudget | `spec/interfaces/context_distiller.py` (composite) | charge tokens; enforce `context_budget_tokens` cap (I11 trigger) | `harness.runtime.SqliteContextManager` |
| 5 | ContextManager | composite (Distiller + Budget) | joint surface per GA plan §2 T-BE-5 | `harness.runtime.SqliteContextManager` |
| 6 | ArtifactStore | `spec/interfaces/artifact_store.py` | put/get/stat/delete blob | `harness.gateway.RealArtifactStore` |
| 7 | ToolInvocationGateway | `spec/interfaces/tool_provider.py` | ADR 0005 6-step chain (lease/fence → PDP → audit → provider → artifact_store → task_links) | `harness.gateway.ToolInvocationGatewayImpl` |
| 8 | ToolProvider | `spec/interfaces/tool_provider.py` (subset) | outbound HTTP / egress; pinned DNS / allowlist / SSRF block | `harness.gateway.HttpEgressService` |
| 9 | PolicyDecision | `spec/interfaces/policy_decision.py` | PDP allow / deny / needs_approval | (interface only; production PDP via fake or upstream) |
| 10 | ExecutionDriver | `spec/interfaces/execution_driver.py` | driver run / interrupt / heartbeat; codex_sdk / codex_exec stub | `harness.drivers.CodexSdkDriver` / `CodexExecDriver` |

(WorkflowPack `spec/interfaces/workflow_pack.py` exists as a data-only carrier; not counted as a runtime Protocol.)

### 5 特性表

1. **SQLite WAL single-host runtime** — 10000 attempts @ 1968/s under 50 concurrent writers (T-QA-5 stress); ADR 0009 documents WAL production constraints; no multi-host until post-v1.0 rqlite/Litestream evaluation.
2. **Trigger-enforced invariants** — I1 fence / I11 budget / I14 handoff trust / I15 worker-1-active-attempt / I16 strict-monotonic heartbeat / I17 ownership — all in `spec/kernel-schema.sql` triggers, not application code.
3. **6-step gateway chain** — ADR 0005: lease/fence → PDP → audit → provider → artifact_store → task_links. deny never calls provider; needs_approval writes `approvals(pending)` and returns `approval_id`.
4. **Pinned-DNS egress with SSRF mitigation** — `PinnedResolver` (12 BLOCKED_NETWORKS incl. 10/127/169.254/::1), redirect re-pin, exponential backoff (base 0.5s, cap 8s), proxy-must-be-configured.
5. **Zero-CI-minute benchmark gate** — `benchmark-baseline` job `if: github.event_name == 'workflow_dispatch'` only (GA plan §5 R-5); p99 < 5000ms hard gate; results.json artifact retention 14d.

### 验收

```bash
# 文件存在 + 标题正确
test -f README.md && head -1 README.md                            # "# fish-harness"

# 包含所有关键 section
grep -c "^## " README.md                                          # >= 8
grep -q "Quick start" README.md
grep -q "Architecture" README.md
grep -q "10 Protocol" README.md || grep -q "Protocol" README.md
grep -q "Tests" README.md || grep -q "pytest" README.md
grep -q "MIT" README.md
grep -q "0008-v1.0-package-architecture" README.md
grep -q "0009-sqlite-wal-production-constraints" README.md
grep -q "v1.0-ga-team-plan" README.md

# pip show description 不空 (pyproject metadata 已写, README 不需重复 description 全文)
pip show harness | grep -E "Description|Version"

# 主机无回归
pytest tests/ -q                                                   # 37/37 PASS
python3 -m harness.testing.mutation_suite                         # 17/17 PASS
python3 -m harness.benchmark.runner --tasks=50 --workers=4        # exit 0
python3 -m harness.testing.stress_test --workers=5 --tasks=10     # exit 0
```

### 不动

- `pyproject.toml`（已有 description + readme 字段）
- `harness/` 所有模块
- `spec/` 所有文件
- `spikes/m0/_helpers.py` — 不删
- `.github/workflows/*` — 不动
- `docs/CC-POLL.md` / `docs/POLL-PROTOCOL.md` / `docs/v1.0-ga-team-plan.md` — 不动
- `LICENSE` / `CHANGELOG.md` — **未存在**（T-DD-2 / T-DD-3 单做），README 链接会 404，留 P1
- `adr/0001-0007.md` — 不动（T-DD-6 单做 v1.0 状态 footer）

### 已知 P1（不挡）

- README 链接 `CHANGELOG.md` / `LICENSE` / 9 个 ADR 都尚未 T-DD-* 创建 → GitHub 渲染 broken anchor。等 T-DD-2/3/6 完成后回到 T-DD-1.1 补链 (或 fallback Cursor review 时一并修)
- 不写 usage example 的 driver integration (CodexSdkDriver.run 调用示例) — 等真 Codex SDK 集成 v1.1

---

## 完成后

1. NOW：T-DD-1 ✅；§4 → 下一枪（T-DD-2 CHANGELOG.md or fallback Cursor review backfill）
2. `docs/poll/cc-ready.json`（真实 commit）→ commit + push
3. 写本枪的 `docs/REVIEW-T-DD-1.md`（架构师自签 PASS — 等 Cursor 复活可追加签名）

## 禁止

不开 T-DO-5/真 Codex；不删 `_helpers.py`；不改 schema RAISE；不开 v1.1；不 force push；不动 pyproject.toml / production code / CI / spec
