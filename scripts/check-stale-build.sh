#!/usr/bin/env bash
#
# scripts/check-stale-build.sh — L25 stale-build detector (standalone).
#
# v1.2.0j+.4 NEW: extract L25 detection pattern from newvps-deploy.sh idempotent
# guard into a standalone script for CI gate / manual pre-deploy verification.
# L25 validated end-to-end in v1.2.0j+.3 U4 (build/.js age=4986s detected → rebuild).
#
# v1.2.0j+.7+ NEW: --remote=<host> SSH mode (forward scope per v1.2.0j+.4 closure §8.1).
# Mirrors newvps-deploy.sh remote() pattern. Default host=newvps SSH alias.
# CHECK_STALE_BUILD_HOST env var overrides. --dry-run prints SSH command without exec.
#
# Usage:
#   scripts/check-stale-build.sh                          # default: check pwa_server.js sentinel
#   scripts/check-stale-build.sh --symbol='registerShutdown'  # custom symbol
#   scripts/check-stale-build.sh --exit-on-stale          # exit 1 if stale (CI mode)
#   scripts/check-stale-build.sh --remote=newvps          # check remote file via SSH
#   scripts/check-stale-build.sh --remote=newvps --exit-on-stale  # remote CI gate
#   scripts/check-stale-build.sh --dry-run --remote=newvps  # preview SSH command
#   scripts/check-stale-build.sh --help                   # show this help
#
# Exit codes:
#   0 = fresh (symbol found >= 1 match) OR informational mode
#   1 = stale (0 matches) — only when --exit-on-stale set
#   2 = file not found (build never ran on this checkout) OR SSH unreachable
#
# Parallel pattern: scripts/newvps-deploy.sh (set -euo pipefail, color logging).
#
# @file scripts/check-stale-build.sh
set -euo pipefail

readonly TARGET="wrapper/build/orchestrator/pwa_server.js"
readonly DEFAULT_SYMBOL='service: "pwa-server"'

SYMBOL="$DEFAULT_SYMBOL"
EXIT_ON_STALE=0

# ─── Remote mode config (v1.2.0j+.7+) ──────────────────────────────────────────
readonly DEFAULT_REMOTE_HOST="${CHECK_STALE_BUILD_HOST:-newvps}"
readonly REMOTE_REPO_DIR="${CHECK_STALE_BUILD_REPO_DIR:-/opt/fish-harness}"

REMOTE_MODE=0
REMOTE_HOST="$DEFAULT_REMOTE_HOST"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --symbol=*)      SYMBOL="${1#*=}" ;;
    --exit-on-stale) EXIT_ON_STALE=1 ;;
    --remote=*)      REMOTE_MODE=1; REMOTE_HOST="${1#*=}" ;;
    --dry-run)       DRY_RUN=1 ;;
    -h|--help)       sed -n '2,27p' "$0"; exit 0 ;;
    *)               printf "Unknown flag: %s (use --help)\n" "$1" >&2; exit 2 ;;
  esac
  shift
done

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf "${GREEN}[check-stale-build %s]${NC} %s\n" "$(ts)" "$*" >&2; }

# ─── Remote mode (v1.2.0j+.7+) ─────────────────────────────────────────────────
if [[ "$REMOTE_MODE" -eq 1 ]]; then
  if [[ -z "$REMOTE_HOST" ]]; then
    printf "${RED}[check-stale-build %s] ERROR: --remote host cannot be empty (use --remote=newvps or CHECK_STALE_BUILD_HOST=newvps).${NC}\n" "$(ts)" >&2
    exit 2
  fi

  REMOTE_FILE="$REMOTE_REPO_DIR/$TARGET"

  # Dry-run: print what we would do, exit 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would ssh ${REMOTE_HOST} 'set -euo pipefail && test -f ${REMOTE_FILE} && grep -c -- \"<symbol>\" ${REMOTE_FILE}' (symbol='${SYMBOL}')"
    exit 0
  fi

  # SSH with here-doc wrapper that emits FILE_NOT_FOUND (exit 2) or COUNT=N (exit 0).
  # Local variables are NOT expanded by the remote shell — escaped \$ only.
  SSH_OUTPUT=$(ssh "$REMOTE_HOST" "
    set -euo pipefail
    FILE='$REMOTE_FILE'
    SYMBOL='$SYMBOL'
    if [[ ! -f \"\$FILE\" ]]; then
      echo 'FILE_NOT_FOUND'
      exit 2
    fi
    COUNT=\$(grep -c -- \"\$SYMBOL\" \"\$FILE\" || true)
    echo \"COUNT=\$COUNT\"
  " 2>&1) || {
    ssh_status=$?
    printf "${RED}[check-stale-build %s] ERROR: SSH to ${REMOTE_HOST} failed (exit $ssh_status): %s${NC}\n" "$(ts)" "$SSH_OUTPUT" >&2
    exit 2
  }

  if [[ "$SSH_OUTPUT" == "FILE_NOT_FOUND" ]]; then
    printf "${RED}[check-stale-build %s] ERROR remote=${REMOTE_HOST}: ${TARGET} not found on ${REMOTE_HOST}.${NC}\n" "$(ts)" >&2
    exit 2
  fi

  COUNT="${SSH_OUTPUT#COUNT=}"
  log "remote=${REMOTE_HOST}: Checked ${TARGET} for symbol '${SYMBOL}': ${COUNT} match(es)"

  if [[ "$COUNT" -eq 0 ]]; then
    if [[ "$EXIT_ON_STALE" -eq 1 ]]; then
      printf "${RED}[check-stale-build %s] remote=${REMOTE_HOST} STALE: 0 matches. Run \`cd wrapper && npm run build\` on ${REMOTE_HOST}.${NC}\n" "$(ts)" >&2
      exit 1
    else
      printf "${RED}[check-stale-build %s] remote=${REMOTE_HOST} STALE: 0 matches (informational, use --exit-on-stale to fail).${NC}\n" "$(ts)" >&2
    fi
  fi
  exit 0
fi

# ─── Local mode (v1.2.0j+.4 original) ─────────────────────────────────────────
if [[ ! -f "$TARGET" ]]; then
  printf "${RED}[check-stale-build %s] ERROR: ${TARGET} not found. Run \`npm run build\` first.${NC}\n" "$(ts)" >&2
  exit 2
fi

COUNT=$(grep -c "$SYMBOL" "$TARGET" || true)
log "Checked ${TARGET} for symbol '${SYMBOL}': ${COUNT} match(es)"

if [[ "$COUNT" -eq 0 ]]; then
  if [[ "$EXIT_ON_STALE" -eq 1 ]]; then
    printf "${RED}[check-stale-build %s] STALE: 0 matches. Run \`cd wrapper && npm run build\`.${NC}\n" "$(ts)" >&2
    exit 1
  else
    printf "${RED}[check-stale-build %s] STALE: 0 matches (informational, use --exit-on-stale to fail).${NC}\n" "$(ts)" >&2
  fi
fi
