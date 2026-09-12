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

@file scripts/README.md
