#!/usr/bin/env bash
#
# scripts/check-stale-build.sh — L25 stale-build detector (standalone).
#
# v1.2.0j+.4 NEW: extract L25 detection pattern from newvps-deploy.sh idempotent
# guard into a standalone script for CI gate / manual pre-deploy verification.
# L25 validated end-to-end in v1.2.0j+.3 U4 (build/.js age=4986s detected → rebuild).
#
# Usage:
#   scripts/check-stale-build.sh                          # default: check pwa_server.js sentinel
#   scripts/check-stale-build.sh --symbol='registerShutdown'  # custom symbol
#   scripts/check-stale-build.sh --exit-on-stale          # exit 1 if stale (CI mode)
#   scripts/check-stale-build.sh --help                   # show this help
#
# Exit codes:
#   0 = fresh (symbol found >= 1 match) OR informational mode
#   1 = stale (0 matches) — only when --exit-on-stale set
#   2 = file not found (build never ran on this checkout)
#
# Parallel pattern: scripts/newvps-deploy.sh (set -euo pipefail, color logging).
#
# @file scripts/check-stale-build.sh
set -euo pipefail

readonly TARGET="wrapper/build/orchestrator/pwa_server.js"
readonly DEFAULT_SYMBOL='service: "pwa-server"'

SYMBOL="$DEFAULT_SYMBOL"
EXIT_ON_STALE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --symbol=*)      SYMBOL="${1#*=}" ;;
    --exit-on-stale) EXIT_ON_STALE=1 ;;
    -h|--help)       sed -n '2,17p' "$0"; exit 0 ;;
    *)               printf "Unknown flag: %s (use --help)\n" "$1" >&2; exit 2 ;;
  esac
  shift
done

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf "${GREEN}[check-stale-build %s]${NC} %s\n" "$(ts)" "$*" >&2; }

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
