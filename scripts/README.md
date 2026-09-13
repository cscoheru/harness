# scripts/ — fish-harness ops scripts

> Ops automation. NOT shipped in container images; user EXEC from repo root or newvps.

## newvps-deploy.sh

Automates the 5-step newvps wrapper deploy sequence from `docs/M2-DEPLOY-GUIDE.md §1.3.1`.

**Use case**: After committing wrapper `.ts` source changes, run this to rebuild `.js` and restart containers on newvps. Idempotent — safe to re-run.

**Usage**:
```bash
scripts/newvps-deploy.sh                              # all 6 wrapper services
scripts/newvps-deploy.sh --service=wrapper-frontend   # single service
scripts/newvps-deploy.sh --commit=ff9d830             # pin commit
scripts/newvps-deploy.sh --dry-run                    # preview only
```

**v1.2.0j+.3 NEW** (R4 docs compliance mitigation). Replaces the manual §1.3.1 sequence.

## check-stale-build.sh

L25 stale-build detector (standalone). Extracted from `scripts/newvps-deploy.sh` idempotent guard for CI gate / manual pre-deploy verification.

**Use case**: Before deploy or as a CI gate, verify `wrapper/build/orchestrator/pwa_server.js` contains the sentinel string (proves `.ts → .js` compile is fresh). Default checks `service: "pwa-server"`. Override via `--symbol=`. Use `--exit-on-stale` to make CI fail when stale.

**Usage**:
```bash
scripts/check-stale-build.sh                                # default sentinel check (informational)
scripts/check-stale-build.sh --symbol='registerShutdown'    # custom symbol
scripts/check-stale-build.sh --exit-on-stale                # exit 1 if stale (CI mode)
```

**Exit codes**: `0` fresh / informational, `1` stale (only when `--exit-on-stale` set), `2` file not found.

**v1.2.0j+.4 NEW**. Pattern reusable for future CI gates.

@file scripts/README.md
