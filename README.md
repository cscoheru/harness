# fish-harness

**v1.0 runtime (Python kernel)** — task orchestration with SQLite-backed worker pool, event sink, and tool gateway.

`v1.0.0` · MIT License · Python ≥ 3.12

---

## TL;DR

`fish-harness` is a single-host task runtime that pairs a SQLite WAL worker pool with a six-step tool-invocation gateway, enforcing worker-1-active-attempt, strict-monotonic heartbeats, and budget caps at the schema layer (not in application code). It is the production runtime backing the v0.9-B spec baseline (13 spike tests, 17/17 mutation suite, 10/10 Protocol conformance) — see [`docs/v1.0-ga-team-plan.md`](docs/v1.0-ga-team-plan.md) for the GA ladder.

## Architecture

```
                    ┌────────────────────────────────────────────┐
                    │       ToolInvocationGateway (ADR 0005)      │
   tasks ─────────► │  6-step: lease/fence → PDP → audit →       │
                    │         provider → artifact_store →        │
                    │         task_links                         │
                    └────┬─────────┬────────────┬────────┬───────┘
                         │         │            │        │
              ┌──────────▼──┐  ┌───▼────────┐  ┌▼──────┐ ┌▼─────────────┐
              │WorkerPool   │  │EventSink   │  │Artifact│ │Egress         │
              │(SQLite WAL) │  │(SQLite log)│  │Store   │ │(pinned DNS)   │
              └──────┬──────┘  └────────────┘  └────────┘ └──────────────┘
                     │
              ┌──────▼──────────┐
              │SqliteContext-   │
              │Manager          │
              │(distill +       │
              │ budget, I11)    │
              └─────────────────┘
```

Five production subpackages: `harness.runtime` (worker pool / event sink / context manager), `harness.gateway` (egress / gateway / artifact store), `harness.drivers` (Codex stub adapters), `harness.testing` (echo server / mutation suite / stress test), `harness.benchmark` (CLI runner with hard p99 gate).

## Quick start

```bash
# Install (editable; pins Python ≥ 3.12)
pip install -e .

# Verify import
python -c "import harness; print(harness.__version__)"
# 1.0.0

# Run the full test pyramid (37 integration + 17 mutation + benchmark + stress)
pytest tests/ -q
python -m harness.testing.mutation_suite
python -m harness.benchmark.runner --tasks=50 --workers=4 --out results.json
python -m harness.testing.stress_test --workers=50 --tasks=200 --out stress.json

# Container
docker build -t fish-harness:1.0.0 .
docker run --rm fish-harness:1.0.0 python -c "import harness; print(harness.__version__)"
```

## 10 Protocol 接口表

| # | Name | spec file | role | production impl |
|---|------|-----------|------|-----------------|
| 1 | **WorkerPool** | `spec/interfaces/worker_pool.py` | dispatch / heartbeat / drain / reap / claim; round-robin via `harness_meta` UPSERT | `harness.runtime.SqliteWorkerPool` |
| 2 | **EventSink** | `spec/interfaces/event_sink.py` | append-only `task_events` log; `trg_*_event_emit` triggers emit task.* / worker.* events | `harness.runtime.SqliteEventSink` |
| 3 | **ContextDistiller** | `spec/interfaces/context_distiller.py` | distill raw blobs → L1 units; sha256 idempotent (DISTILL key) | `harness.runtime.SqliteContextManager` |
| 4 | **ContextBudget** | `spec/interfaces/context_distiller.py` | charge tokens; enforce `context_budget_tokens` cap via I11 trigger | `harness.runtime.SqliteContextManager` |
| 5 | **ContextManager** | composite (Distiller + Budget) | joint surface per GA plan §2 T-BE-5 | `harness.runtime.SqliteContextManager` |
| 6 | **ArtifactStore** | `spec/interfaces/artifact_store.py` | put/get/stat/delete blob; atomic temp+fsync+rename; sha256 verify | `harness.gateway.RealArtifactStore` |
| 7 | **ToolInvocationGateway** | `spec/interfaces/tool_provider.py` | ADR 0005 6-step chain (lease/fence → PDP → audit → provider → artifact_store → task_links) | `harness.gateway.ToolInvocationGatewayImpl` |
| 8 | **ToolProvider** | `spec/interfaces/tool_provider.py` | outbound HTTP / egress; pinned DNS / allowlist / SSRF block / redirect re-pin | `harness.gateway.HttpEgressService` |
| 9 | **PolicyDecisionPoint** | `spec/interfaces/policy_decision.py` | PDP allow / deny / needs_approval; 5-step chain step 2 | (interface only; production PDP via upstream) |
| 10 | **ExecutionDriver** | `spec/interfaces/execution_driver.py` | driver run / interrupt / heartbeat; codex_sdk / codex_exec stub | `harness.drivers.CodexSdkDriver` / `CodexExecDriver` |

`WorkflowPack` (`spec/interfaces/workflow_pack.py`) is a data-only carrier (JSON pack descriptor) and is not counted as a runtime Protocol.

## 5 特性表

1. **SQLite WAL single-host runtime** — 10000 attempts @ 1968/s under 50 concurrent writers (T-QA-5 stress). ADR 0009 documents WAL production constraints (single host, no NFS, ~20 writers-then-lock-contention threshold).
2. **Trigger-enforced invariants** — I1 fence / I11 budget / I14 handoff trust / I15 worker-1-active-attempt / I16 strict-monotonic heartbeat / I17 ownership all live in `spec/kernel-schema.sql` triggers, not application code. The runtime just emits the right UPDATE/INSERT statements.
3. **6-step gateway chain** — ADR 0005: lease/fence → PDP → audit → provider → artifact_store → task_links. `deny` never calls provider; `needs_approval` writes `approvals(pending)` and returns `approval_id`; provider-level denial is propagated without writing artifact or link rows.
4. **Pinned-DNS egress with SSRF mitigation** — `PinnedResolver` blocks 12 networks (incl. 10/8, 127/8, 169.254/16, ::1); redirect re-pin rejects hostname drift; exponential backoff (base 0.5s, factor 2, cap 8s); proxy-must-be-configured SSRF refusal.
5. **Zero-CI-minute benchmark gate** — `benchmark-baseline` job gated `if: github.event_name == 'workflow_dispatch'` (GA plan §5 R-5); hard gate p99 < 5000 ms; `actions/upload-artifact@v4` retains `results.json` for 14 d.

## Tests + Benchmarks

| suite | command | gate | status (v1.0.0) |
|-------|---------|------|------------------|
| Integration | `pytest tests/ -q` | 37/37 exit 0 | ✅ |
| Mutation (v0.9.4) | `python -m harness.testing.mutation_suite` | 17/17 exit 0 | ✅ |
| Benchmark | `python -m harness.benchmark.runner --tasks=50 --workers=4` | p99 < 5000 ms; exit 0 | ✅ (p99 ≈ 1.5 ms) |
| Stress (manual) | `python -m harness.testing.stress_test --workers=50 --tasks=200` | wall ≤ 60 s; throughput ≥ 100/s; all_match | ✅ (10000/10000, 1968/s) |

The stress suite is a manual diagnostic tool (per GA plan §5 R-5) and is **not** wired into `ci.yml` to avoid CI minute burn.

## Container + CI

```bash
docker build -t fish-harness:1.0.0 .           # 87 MB on python:3.14-alpine
docker run --rm fish-harness:1.0.0 python -c "import harness; print(harness.__version__)"
```

Three CI jobs in `.github/workflows/ci.yml` (T-QA-4):

- **integration-tests** — py3.12 + 3.13 matrix; `pytest tests/ -v`
- **mutation-suite** — py3.12 + 3.13 matrix; `python -m harness.testing.mutation_suite`
- **benchmark-baseline** — py3.12; `if: github.event_name == 'workflow_dispatch'` (manual trigger only); uploads `results.json` artifact

Deploy is a separate workflow: `.github/workflows/deploy.yml` (T-DO-4 / T-QA-1 fix) builds and pushes to GHCR on `v*` tag.

## Documentation index

- [`docs/PRD-V0.1-NORTH-STAR.md`](docs/PRD-V0.1-NORTH-STAR.md) — product north-star + v1.0 scope-bound (§13 waivers)
- [`docs/v1.0-ga-team-plan.md`](docs/v1.0-ga-team-plan.md) — 5-role GA ladder; 12-step architect sign-off checklist (§4); risks + rollbacks (§5)
- [`docs/NOW.md`](docs/NOW.md) — current stage温卡 + next dispatch pointer (§4); read before opening a new ticket
- [`docs/CC-POLL.md`](docs/CC-POLL.md) + [`docs/POLL-PROTOCOL.md`](docs/POLL-PROTOCOL.md) — Cursor ↔ CC poll loop
- [`docs/v1.0-ga-team-plan.md §2`](docs/v1.0-ga-team-plan.md) — task breakdown (T-BE-* / T-TG-* / T-DO-* / T-QA-* / T-DD-*)
- [`adr/0008-v1.0-package-architecture.md`](adr/0008-v1.0-package-architecture.md) — package layout + spike→production ownership
- [`adr/0009-sqlite-wal-production-constraints.md`](adr/0009-sqlite-wal-production-constraints.md) — SQLite WAL single-host rule + multi-region post-v1.0 path
- [`CHANGELOG.md`](CHANGELOG.md) — v1.0.0 release notes; Keep-a-Changelog style. (T-DD-2)
- [`LICENSE`](LICENSE) — MIT; matches `pyproject.toml` `license = {text = "MIT"}` + `authors = [{name = "cscoheru"}]`. (T-DD-3)

## License

MIT — see [`LICENSE`](LICENSE). Copyright (c) 2026 cscoheru.
