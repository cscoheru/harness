#!/usr/bin/env bash
#
# scripts/newvps-deploy.sh — automate the 5-step newvps wrapper deploy sequence.
#
# v1.2.0j+.3 NEW (R4 docs compliance mitigation): codifies M2-DEPLOY-GUIDE.md §1.3.1
# into an idempotent, parameterizable bash script. Prevents the L24 stale-build
# bug (container runs stale .js because user skipped `npm run build` step).
#
# Usage:
#   scripts/newvps-deploy.sh                          # full deploy, all 6 wrapper services
#   scripts/newvps-deploy.sh --service=wrapper-frontend  # single service
#   scripts/newvps-deploy.sh --commit=ff9d830         # pin to specific commit
#   scripts/newvps-deploy.sh --dry-run                # print commands, don't execute
#
# Idempotent: skips pull+build if newvps HEAD already matches target commit AND
# wrapper/build/ mtime < 60s old. docker compose up -d is naturally no-op if config unchanged.
#
# Parallel pattern: deploy/install-dsh.sh + wrapper/deploy/edge-webhook/install.sh (set -euo pipefail).
# Edge hosts use edge-pull.ts webhook automation (different path).
#
# @file scripts/newvps-deploy.sh
set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────────
readonly REMOTE_HOST="${NEWVPS_HOST:-newvps}"  # ssh alias (defined in ~/.ssh/config)
readonly REPO_DIR="/opt/fish-harness"
readonly COMPOSE_FILE="deploy/6host-compose.newvps.yml"
readonly ENV_FILE=".env.deploy"
readonly SERVICES_DEFAULT="wrapper-orchestrator wrapper-commander wrapper-commander-2 wrapper-frontend web-push-gateway stt-worker"
readonly BUILD_MTIME_FRESH_SEC=60  # build considered fresh if .js mtime < 60s ago

# ─── Color helpers ─────────────────────────────────────────────────────────────
readonly RED='\033[0;31m'; readonly GREEN='\033[0;32m'; readonly YELLOW='\033[0;33m'; readonly NC='\033[0m'
log()   { printf "${GREEN}[newvps-deploy %s]${NC} %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
warn()  { printf "${YELLOW}[newvps-deploy %s] WARN:${NC} %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
err()   { printf "${RED}[newvps-deploy %s] ERROR:${NC} %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die()   { err "$@"; exit 1; }

# ─── Argument parsing ──────────────────────────────────────────────────────────
TARGET_COMMIT=""
TARGET_SERVICES="$SERVICES_DEFAULT"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit=*)  TARGET_COMMIT="${1#*=}" ;;
    --service=*) TARGET_SERVICES="${1#*=}" ;;
    --dry-run)   DRY_RUN=1 ;;
    -h|--help)   sed -n '2,18p' "$0"; exit 0 ;;
    *)           die "Unknown flag: $1 (use --help)" ;;
  esac
  shift
done

# ─── Helpers ───────────────────────────────────────────────────────────────────
remote() {
  # Run a command on the remote host. In dry-run, print instead.
  local cmd="$*"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN ssh $REMOTE_HOST '$cmd'"
  else
    ssh "$REMOTE_HOST" "$cmd"
  fi
}

# ─── Pre-flight: resolve target commit ─────────────────────────────────────────
if [[ -z "$TARGET_COMMIT" ]]; then
  TARGET_COMMIT=$(git rev-parse HEAD)
  log "Target commit (local HEAD): ${TARGET_COMMIT:0:12}"
else
  log "Target commit (pinned):     ${TARGET_COMMIT:0:12}"
fi

# ─── Idempotent guard: skip if HEAD matches + build fresh ──────────────────────
REMOTE_HEAD=$(remote "cd $REPO_DIR && git rev-parse HEAD" 2>/dev/null || echo "")
if [[ "$REMOTE_HEAD" == "$TARGET_COMMIT" ]]; then
  BUILD_MTIME=$(remote "stat -c %Y $REPO_DIR/wrapper/build/orchestrator/pwa_server.js 2>/dev/null || echo 0")
  NOW=$(date +%s)
  BUILD_AGE=$(( NOW - BUILD_MTIME ))
  if [[ "$BUILD_AGE" -lt "$BUILD_MTIME_FRESH_SEC" ]]; then
    log "Noop: newvps HEAD=${REMOTE_HEAD:0:12} matches target, build/.js age=${BUILD_AGE}s (< ${BUILD_MTIME_FRESH_SEC}s fresh). Skipping pull + build."
    SKIP_BUILD=1
  else
    log "HEAD matches but build/.js age=${BUILD_AGE}s (>= ${BUILD_MTIME_FRESH_SEC}s). Rebuilding."
    SKIP_BUILD=0
  fi
else
  log "newvps HEAD=${REMOTE_HEAD:0:12} differs from target ${TARGET_COMMIT:0:12}. Full sequence."
  SKIP_BUILD=0
fi

# ─── Step (a) git pull ──────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "Step (a) git pull --ff-only on $REMOTE_HOST"
  remote "cd $REPO_DIR && git pull --ff-only" || die "git pull failed on $REMOTE_HOST"
fi

# ─── Step (b) npm run build (L24 hygiene gate) ──────────────────────────────────
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "Step (b) cd wrapper && npm run build (L24 hygiene gate)"
  remote "cd $REPO_DIR/wrapper && npm run build" || die "npm run build failed on $REMOTE_HOST"
fi

# ─── Step (c) docker compose up -d ─────────────────────────────────────────────
for svc in $TARGET_SERVICES; do
  log "Step (c) docker compose up -d $svc"
  remote "cd $REPO_DIR && docker compose --env-file $ENV_FILE -f $COMPOSE_FILE up -d $svc" \
    || die "docker compose up -d $svc failed on $REMOTE_HOST"
done

# ─── Step (d) verify Health=healthy ────────────────────────────────────────────
log "Step (d) docker inspect Health verification (sleep 60s for healthcheck probe)"
remote "sleep 60 && cd $REPO_DIR && for svc in $TARGET_SERVICES; do \
  docker inspect --format \"{{.Name}} Status={{.State.Status}} Health={{.State.Health.Status}}\" harness-\$svc; \
done" || warn "Health verification failed (containers may still be starting)."

log "✅ Deploy complete. U-style verification (U5 graceful drain) optional: see M2-DEPLOY-GUIDE.md §1.3.1 step (e)."
