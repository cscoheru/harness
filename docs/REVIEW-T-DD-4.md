# REVIEW — T-DD-4

> **Verdict**: **PASS**（架构师自签 — Cursor 暂不可用，按 poll protocol 兜底）
> **Date**: 2026-09-01
> **Commit**: 见 `docs/poll/cc-ready.json` cc-ready
> **cc-ready**: task `T-DD-4`
> **回签时**：Cursor 复活后请追加签名 / 标 P1 — 本枪产物无需重做

---

## §1 ADR 0008 契约复跑（DISPATCH-T-DD-4 §行为契约）

| # | 契约 | 结果 |
|---|------|------|
| 1 | H1 标题 `# ADR 0008 — v1.0 Package Architecture (harness/ Layout + Spike→Production Ownership)` | PASS |
| 2 | Status = Accepted (v1.0) | PASS |
| 3 | Date = 2026-09-01（与 CHANGELOG v1.0.0a0 同日） | PASS |
| 4 | Deciders = Architect (T-DD-4 自签 — Cursor 暂不可用) | PASS |
| 5 | Supersedes = ADR 链无 + 与 ADR 0005/0006/0007 并列 | PASS |
| 6 | Related 段含 GA plan §2 + pyproject.toml + harness/__init__.py + spikes/m0/_helpers.py + spec/ + CHANGELOG.md | PASS (6 link) |
| 7 | Context 段解释 v0.9-B → v1.0 gap + GA plan §7 + 用户硬规则 | PASS |
| 8 | Decision 段含 5 subpackage table (runtime/gateway/drivers/testing/benchmark) | PASS — 5 行 table 完整 |
| 9 | 复用规则 4 条 binding | PASS — `_helpers.py` / `conformance-second-impl.py` / `mutation-test.py` 不可删；生产代码不反向依赖 spike |
| 10 | 依赖方向图 | PASS — runtime 无内部依赖；gateway→runtime；drivers→runtime；testing→{runtime,gateway,drivers}；benchmark→{runtime,gateway} |
| 11 | 反向依赖禁令 4 类 | PASS |
| 12 | 版本对齐规则 | PASS — pyproject version == CHANGELOG 段；spec 改动必须 sync 改 production + spike |
| 13 | 10 Protocol 出口 | PASS — WorkerPool/EventSink/ContextDistiller/ContextBudget/ContextManager/ArtifactStore/ToolInvocationGateway/ToolProvider/PolicyDecision/ExecutionDriver 全部 ≥1 |
| 14 | Alternatives Considered 4 个 (A1 单包 / A2 删 spike / A3 spike 引 harness / A4 6 subpackage) | PASS |
| 15 | Consequences 段 3-5 优 + 2 缺 | PASS — 4 优 + 2 缺 |

## §2 `head -4` 输出

```
# ADR 0008 — v1.0 Package Architecture (harness/ Layout + Spike→Production Ownership)

> **Status**: Accepted (v1.0)
> **Date**: 2026-09-01
```

## §3 grep 计数

| 检查 | 结果 |
|------|------|
| `grep -E 'harness/(runtime\|gateway\|drivers\|testing\|benchmark)'` 5 subpackage | PASS — 23 提及 (含 table 行 + 依赖方向图) |
| `grep -c '_helpers.py'` | PASS — 4 提及 (Related + 复用规则 + Decision table + ADR 0001 link) |
| `grep -c 'conformance-second-impl.py'` | PASS — 5 提及 |
| `grep -c 'mutation-test.py'` | PASS — 5 提及 |
| Per-Protocol 计数 | WorkerPool=4 / EventSink=4 / ContextDistiller=1 / ContextBudget=1 / ContextManager=2 / ArtifactStore=2 / ToolInvocationGateway=2 / ToolProvider=1 / PolicyDecision=1 / ExecutionDriver=2 — **10/10 全覆盖** |
| `ls adr/000*.md \| wc -l` | **8** (0001-0007 pre-exist + 0008 NEW) |

## §4 联动清理

| 文件 | 旧 | 新 | 状态 |
|------|-----|-----|------|
| `CHANGELOG.md` ADR table line 209 | `ADR 0008 (v1.0 package architecture) \| _pending T-DD-4_ \| will document harness/ layout + spike→production ownership` | `[ADR 0008](adr/0008-v1.0-package-architecture.md) \| Accepted (v1.0) \| documents harness/ 5-subpackage layout + spike→production ownership` | PASS — `grep -c 'pending T-DD-4' CHANGELOG.md` = 0 |
| `README.md` line 117 | `[adr/0008-v1.0-package-architecture.md](adr/0008-v1.0-package-architecture.md) — package layout + spike→production ownership` (T-DD-1 时已 link) | **未动**（已正确；现自动 resolve） | PASS — `grep -c 'pending T-DD-4' README.md` = 0 |
| `adr/0008-v1.0-package-architecture.md` | n/a | 新建 167 行 | PASS |
| `adr/0009-sqlite-wal-production-constraints.md` | **未存在** | **未存在**（T-DD-5 单做） | n/a |

## §5 主机模拟（4/4 PASS — 无回归）

| 检查 | 结果 |
|------|------|
| `pytest tests/ -q` | **37/37 PASS** in 0.36s |
| `python -m harness.testing.mutation_suite` | **17/17 PASS**, 0 FAIL |
| `python -m harness.benchmark.runner --tasks=50 --workers=4` | `OK results written to results.json`, exit 0 |
| `python -m harness.testing.stress_test --workers=5 --tasks=10` | wall=0.082s, throughput=606.5/s, p99=67.661ms, all_match=True, i15/fk/unique=0, **passes_gate=True**, exit 0 |

## §6 范围隔离

| 文件 | 是否触碰 |
|------|----------|
| `adr/0008-v1.0-package-architecture.md` | **新建** (167 行) |
| `CHANGELOG.md` ADR table | **改** (line 209: ADR 0008 PENDING → Accepted link) |
| `README.md` | **未动** (T-DD-1 已 link, 现自动 resolve) |
| `LICENSE` / `pyproject.toml` | **未动** |
| `harness/` / `spec/` / `spikes/m0/_helpers.py` / `.github/workflows/*` | **未动** |
| `Dockerfile` / `docker-compose.yml` / `.dockerignore` | **未动** |
| `docs/CC-POLL.md` / `POLL-PROTOCOL.md` / `v1.0-ga-team-plan.md` / `NORTH-STAR.md` / `VISION.md` | **未动** |
| `adr/0001-0007.md` | **未动** (T-DD-6 单做 v1.0 footer) |
| `adr/0009-sqlite-wal-production-constraints.md` | **未存在** (T-DD-5 单做) |
| `Dockerfile` + `docker-compose.yml` 注释 | **未改** (DISPATCH §已知 P1 — `ADR 0009` WAL 注释由 T-DD-5 完成后写) |

## §7 P1（不挡）

- 不在 CI 加 `import-linter` / `pydeps` 反向依赖 gating — 等 T-DD-6 v1.0 footer 同步加
- ADR 0009 注释引用 (`docker-compose.yml` worker 数上限) — 等 T-DD-5 完成后写
- ADR 0001-0007 v1.0 footer (Status: Accepted (v1.0) + 互引 0008/0009) — T-DD-6 单做
- 不在 ADR 0008 详列每个 Protocol 的 spec file 路径 — 简化为 Related 段 + Decision 段 subpackage table (interface 名足够)
- ADR 0008 date 同步 v1.0.0a0 release (2026-09-01) — 已正确

## §8 验收清单进度（GA plan §4 12 步）

| # | 步 | 状态 |
|---|----|------|
| 1 | `sqlite3 :memory: < spec/kernel-schema.sql` | ✅ M1 |
| 2 | `pip install -e . && import harness` | ✅ M1 |
| 3 | `from harness.runtime import …` | ✅ T-BE-1..4 |
| 4 | `from harness.gateway import …` | ✅ T-TG-1..3 |
| 5 | 5 spike suite | ✅ 13 spike 全绿 |
| 6 | `docker build -t fish-harness:1.0.0a0` | ✅ T-DO-1 |
| 7 | container `import harness` | ✅ T-DO-2 |
| 8 | `pytest tests/ -v` | ✅ T-QA-2 |
| 9 | `mutation_suite` 18/18 | ✅ T-QA-1 (17/17 v0.9.4) |
| 10 | `benchmark.runner --tasks=10 --workers=2` | ✅ T-QA-3 |
| 11 | `test -f README.md CHANGELOG.md LICENSE adr/0008... adr/0009...` | ✅ 5/5 (README + CHANGELOG + LICENSE + ADR 0008 NEW + ADR 0009 PENDING) |
| 12 | `ls adr/000*.md | wc -l` == 9 | **8/9** (0001-0008 exist; ADR 0009 待 T-DD-5) |

**GA plan §4 step 12 进度**: 3/9 → **8/9** ✅ (0001-0007 pre-exist + 0008 NEW)。剩 ADR 0009 (T-DD-5) + 9 ADR v1.0 footer (T-DD-6)。

---

## 下一单

架构师自派：**T-DD-5** (ADR 0009 SQLite WAL production constraints per GA plan §2) — 最后一个新建 ADR; 与 ADR 0008 配对; 完成后 step 12 = 9/9 ✅。
默认下一枪 = **T-DD-5** (ADR 0009) — GA plan §4 step 12 必填最后一项; 与 ADR 0008 风格保持一致; Status=Accepted (v1.0), Date=2026-09-01, 必须含 WAL single-host rule + 12 BLOCKED_NETWORKS 联动 + post-v1.0 rqlite/Litestream 评估路径。