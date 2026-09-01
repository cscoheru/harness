# Changelog

fish-harness v1.0.0a0 — all notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.0.0a0] — 2026-09-01

First v1.0 alpha. Production runtime backing the v0.9-B spec baseline
([`spec/`](spec/) + [ADR 0001-0007](adr/)) — see
[`docs/v1.0-ga-team-plan.md`](docs/v1.0-ga-team-plan.md) for the GA ladder
and [`docs/NOW.md`](docs/NOW.md) for current stage.

### Added

**Package surface** — per [`pyproject.toml`](pyproject.toml) and
[`harness/__init__.py`](harness/__init__.py):

- New `harness/` package: 5 subpackages (`runtime` / `gateway` / `drivers` /
  `testing` / `benchmark`) + 10 Protocol exports (`WorkerPool`, `EventSink`,
  `ContextDistiller`, `ContextBudget`, `ContextManager`, `ArtifactStore`,
  `ToolInvocationGateway`, `ToolProvider`, `PolicyDecision`,
  `ExecutionDriver`).
- [`harness/runtime/SqliteWorkerPool`](harness/runtime/worker_pool.py) —
  production WorkerPool backed by SQLite triggers (I15 / I16 / I17).
  Round-robin via `harness_meta` UPSERT. (T-BE-2)
- [`harness/runtime/SqliteEventSink`](harness/runtime/event_sink.py) —
  append-only `task_events` log; emits `trg_*_event_emit` triggers fire
  `worker.{registered,dispatched,heartbeat,drained}` envelopes. (T-BE-3)
- [`harness/runtime/SqliteContextManager`](harness/runtime/context_manager.py) —
  joint `ContextDistiller` + `ContextBudget` surface; L1/L2/L3 lineage via
  `context_snapshots`; I11 budget cap + I14 handoff trust via triggers.
  (T-BE-4)
- [`harness/gateway/HttpEgressService`](harness/gateway/egress.py) +
  [`PinnedResolver`](harness/gateway/egress.py) — outbound HTTP with
  pinned DNS, 12 `BLOCKED_NETWORKS`, redirect re-pin, exponential
  backoff (base 0.5 s, cap 8 s), proxy-must-be-configured SSRF refusal.
  (T-TG-1)
- [`harness/gateway/ToolInvocationGatewayImpl`](harness/gateway/gateway.py) —
  ADR 0005 six-step chain
  `lease/fence → PDP → audit → provider → artifact_store → task_links`.
  `deny` never calls provider; `needs_approval` writes
  `approvals(pending)` and returns `approval_id`. (T-TG-2)
- [`harness/gateway/RealArtifactStore`](harness/gateway/artifact_store.py) —
  `local_fs` backend; atomic temp+fsync+rename; UPSERT on sha256;
  `expected_sha256` mismatch rejected pre-rename; RESTRICT-aware delete.
  (T-TG-3)
- [`harness/drivers/CodexSdkDriver`](harness/drivers/codex_sdk.py) +
  [`CodexExecDriver`](harness/drivers/codex_exec.py) — v1.0 stub adapters
  sharing `StubDriverBase`. `run()` emits cached
  `[STARTED, FINISHED]`; `interrupt()` / `heartbeat()` no-op on
  FINISHED. (T-TG-4)
- [`harness/testing/InProcessEgressServer`](harness/testing/echo_server.py) —
  stdlib `ThreadingHTTPServer` daemon thread; hardcoded `127.0.0.1`;
  context-managed lifecycle. (T-TG-5)

**Tests + benchmarks + CI** — per GA plan §5 R-1/R-2/R-5:

- [`harness/testing/mutation_suite`](harness/testing/mutation_suite.py) —
  v0.9.4 reverse-DROP causal-chain (17/17 mutations; M12 removed;
  M17 supersedes). (T-QA-1)
- [`tests/`](tests/) — integration suite (37 cases across worker_pool /
  context_manager / egress / gateway). (T-QA-2)
- [`harness/benchmark/runner.py`](harness/benchmark/runner.py) — p99
  latency under hard `< 5000 ms` gate; JSON + optional CSV output.
  (T-QA-3)
- [`harness/testing/stress_test.py`](harness/testing/stress_test.py) —
  SQLite WAL concurrent stress test: 50 workers × 200 tasks per
  worker = 10000 attempts, `Barrier`-synchronized start, single
  transaction per iteration. (T-QA-5)
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — 3 new CI jobs:
  `integration-tests` (py3.12 + 3.13 matrix), `mutation-suite`
  (py3.12 + 3.13 matrix), `benchmark-baseline` (py3.12,
  `if: github.event_name == 'workflow_dispatch'` ONLY per GA plan §5
  R-5 resource guard). (T-QA-4)

**Container + deploy**:

- [`Dockerfile`](Dockerfile) — `python:3.14-alpine` base; `CMD python -m
  harness`; hard gate `sqlite3.sqlite_version >= 3.47.0` for schema
  `RAISE(ABORT, expr || expr)` support. (T-DO-1, T-DO-2)
- [`docker-compose.yml`](docker-compose.yml) — local `harness` +
  `test-runner` services + `harness_db` named volume. (T-DO-2)
- [`.dockerignore`](.dockerignore) — 13 patterns; build context 457.2 kB
  (vs ~40-60 MB unignored). (T-DO-3)
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — `v*`
  tag-triggered; build → push to GHCR (`load: true` for in-runner
  smoke) → mutation-suite smoke gate. (T-DO-4, T-QA-1 P0 fix)

**Documentation**:

- [`README.md`](README.md) — M3-grade; 10 Protocol interface table +
  5-feature table + Architecture ASCII + quick start + 4-suite test
  pyramid. (T-DD-1)
- [`CHANGELOG.md`](CHANGELOG.md) — v1.0.0a0 release notes;
  Keep-a-Changelog style. (T-DD-2)
- [`LICENSE`](LICENSE) — MIT; matches `pyproject.toml` `license =
  {text = "MIT"}` + `authors = [{name = "cscoheru"}]`. (T-DD-3)

### Changed

- **Base image**: `Dockerfile` base switched from `python:3.12-slim` (T-DO-1
  initial) to `python:3.14-alpine` (T-DO-2 + ADJUDICATION). The
  v1.0 schema (`spec/kernel-schema.sql`) uses
  `RAISE(ABORT, expr || expr)` which requires SQLite ≥ 3.47; only the
  alpine image (3.53.2) shipped it at the time of writing. Image size
  dropped 212 MB → 87.3 MB.
- **spike vs production**: `spikes/m0/_helpers.py` (530 lines, v0.9-B
  source-of-truth) is **preserved** and remains the spike-suite
  reference. `harness/runtime/_db.py` (T-BE-1) lifts the same
  primitives and is what production uses. The two coexist throughout
  v1.0 by design (GA plan §7).
- **Deploy workflow smoke**: replaced the interim 5-spike subset with
  the formal `python -m harness.testing.mutation_suite` gate (T-QA-1).

### Deprecated

None. v1.0 is the first public release; no prior deprecations.

### Security

- **SSRF mitigation** — `PinnedResolver` blocks 12 networks
  (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `::1/128`, etc.) and
  pins DNS results across the connection lifecycle. Redirect re-pin
  rejects host drift. Proxy-must-be-configured refuses unproxied
  requests in production. See
  [`spec/interfaces/tool_provider.py`](spec/interfaces/tool_provider.py)
  + T-TG-1.
- **Audit log** — `audit_log` table is append-only via
  `trg_audit_log_no_update` / `trg_audit_log_no_delete` triggers; every
  gateway step (PDP, provider) writes one row. `deny` is audited.
- **Artifact integrity** — `RealArtifactStore.put()` verifies
  `expected_sha256` before atomic rename; `get()` re-hashes on read
  and raises `Sha256MismatchError` if drift detected.

### Fixed

None. v1.0 first release; no prior bugs to fix in this changelog. The
v0.9.4 fixes (P0-9G/H/I/J/K/L/M/N/O + P0-M2-2 + P1-2 + P1-3) are
inherited from the v0.9-B spec baseline and live in
[`spec/kernel-schema.sql`](spec/kernel-schema.sql) + the spike suite in
[`spikes/m0/`](spikes/m0/).

---

## Upgrade path: v0.9 → v1.0

This is a forward-only upgrade. v0.9 was a **spec + spike baseline**
(`spec/` + `adr/` + `spikes/m0/`); v1.0 adds a **production runtime**
(`harness/` package + tests + benchmarks + container + CI). Both
coexist.

**For consumers of the spike suite** (researchers running conformance
+ mutation directly):

```bash
# v0.9
cd fish-harness
python3 spikes/m0/conformance-second-impl.py   # 10/10 Protocol
python3 spikes/m0/mutation-test.py             # 17/17 mutation

# v1.0 (same behavior; production runtime as a second path)
pip install -e .
python3 spikes/m0/conformance-second-impl.py   # 10/10 Protocol (unchanged)
python3 -m harness.testing.mutation_suite      # 17/17 mutation (lift)
pytest tests/ -q                                # 37/37 integration
```

**For container consumers**:

```bash
# v0.9 (no container)
docker run --rm fish-harness:1.0.0a0 python -c "import harness; print(harness.__version__)"
# 1.0.0a0
```

**Schema**:

- `spec/kernel-schema.sql` is unchanged from v0.9-B. v0.9 databases
  import cleanly via `connect_with_fk(apply_schema=True)`. v0.9 spike
  data files (`.sqlite`) are forward-compatible.
- New trigger `trg_audit_log_no_update` / `trg_audit_log_no_delete`
  (audit log immutability, v1.0-only enforcement).

**Tests**:

- `tests/` is new in v1.0. Run alongside spike suite; both pass.
- `harness.testing.mutation_suite` replaces `spikes/m0/mutation-test.py`
  for CI use; the spike remains for direct invocation.

**No data migration required.**

---

## ADR cross-reference

| ADR | status (v1.0.0a0) | note |
|-----|-------------------|------|
| [ADR 0001](adr/0001-runtime-backend-vs-integration-adapter.md) | Accepted (v0.9) | unchanged |
| [ADR 0002](adr/0002-fence-version-model.md) | Accepted (v0.9) | unchanged |
| [ADR 0003](adr/0003-cancel-state-model.md) | Accepted (v0.9) | unchanged |
| [ADR 0004](adr/0004-egress-architecture.md) | Accepted (v0.9) | unchanged |
| [ADR 0005](adr/0005-tool-invocation-gateway.md) | Accepted (v0.9) | unchanged — implemented by `ToolInvocationGatewayImpl` |
| [ADR 0006](adr/0006-context-layering.md) | Accepted (v0.9) | unchanged — implemented by `SqliteContextManager` |
| [ADR 0007](adr/0007-worker-pool.md) | Accepted (v0.9) | unchanged — implemented by `SqliteWorkerPool` |
| ADR 0008 (v1.0 package architecture) | _pending T-DD-4_ | will document `harness/` layout + spike→production ownership |
| ADR 0009 (SQLite WAL production constraints) | _pending T-DD-5_ | will document WAL single-host rule + post-v1.0 rqlite/Litestream path |

The 7 v0.9 ADRs all gain a `v1.0 Status: Included in GA` footer in
[T-DD-6](docs/v1.0-ga-team-plan.md).

[Unreleased]: # (next minor; v1.0.0b0)
[v1.0.0a0]: # (2026-09-01)
