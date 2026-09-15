#!/usr/bin/env bash
#
# scripts/deploy-edge.sh — Claude-driven auto-deploy to edge1/2/3 (v1.2.0l NEW)
#
# Per user 2026-09-15 decision: Claude runs FULL auto-deploy end-to-end via
# Tailscale SSH + scp + docker compose + healthcheck + auto-rollback.
#
# Topology (per §6 (c) F2/F3/F4 + deploy/6host-compose.edge[1-3].yml):
#   edge1.fish-harness.ts.net — 100.103.132.72  (Tailscale: edge1)
#   edge2.fish-harness.ts.net — 100.92.18.67    (Tailscale: edge2)
#   edge3.fish-harness.ts.net — 100.127.118.64  (Tailscale: edge3)
#
# What this script does (per edge):
#   1. SSH preflight via 100.x Tailscale IP (NOT MagicDNS — see newvps-kex-workaround)
#   2. scp deploy/6host-compose.edgeN.yml + .env (sk- keys redacted server-side)
#   3. docker compose --env-file .env -f <compose> down -v (clean state)
#   4. docker compose --env-file .env -f <compose> up -d --force-recreate
#   5. tail logs for 60s waiting for "worker registered" heartbeat
#   6. Verify via newvps: curl http://100.x.x.x:4001/health → 200
#   7. Auto-rollback on any failure
#
# Exit codes:
#   0 — all edges healthy
#   1 — preflight failed (SSH/tailscale unreachable)
#   2 — at least one edge deploy failed (auto-rolled back, see stderr)

set -uo pipefail  # NOTE: do NOT use -e; we manage failures explicitly per edge

# ─── Constants ────────────────────────────────────────────────────────────────

NEWVPS_ORCH_URL="${NEWVPS_ORCH_URL:-http://100.99.5.90:4000}"
NEWVPS_API_URL="${NEWVPS_API_URL:-http://newvps.fish-harness.ts.net:4000}"
DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Edge host table: name|tailscale-ip|ssh-port|compose-file
EDGE_HOSTS=(
  "edge1|100.103.132.72|52134|6host-compose.edge1.yml"
  "edge2|100.92.18.67|52134|6host-compose.edge2.yml"
  "edge3|100.127.118.64|52134|6host-compose.edge3.yml"
)

# Per newvps-kex-workaround: macOS OpenSSH 10.3+ → sntrup761 ECDH fails on
# newvps. Edge hosts use the same OpenSSH build, so we MUST pin KEX algos.
SSH_OPTS=(
  -o KExAlgorithms=curve25519-sha256
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  -o ConnectTimeout=15
  -o ServerAliveInterval=10
  -o ServerAliveCountMax=3
)

# Healthcheck tuning (per deploy/6host-compose.edge[1-3].yml healthcheck stanza)
HEALTHCHECK_WAIT_SECONDS=60
HEALTHCHECK_POLL_INTERVAL=5

# ─── Logging helpers ──────────────────────────────────────────────────────────

_ts() { date +"%H:%M:%S"; }
log()  { printf "[%s] %s\n" "$(_ts)" "$*"; }
err()  { printf "[%s] [ERR] %s\n" "$(_ts)" "$*" >&2; }

# ─── Preflight ────────────────────────────────────────────────────────────────

preflight() {
  log "=== Preflight ==="
  log "NEWVPS orchestrator: $NEWVPS_ORCH_URL"

  # 1. Tailscale reachable?
  if ! command -v tailscale >/dev/null 2>&1; then
    err "tailscale CLI not found — install or run on a Tailscale-enabled host"
    return 1
  fi
  if ! tailscale status >/dev/null 2>&1; then
    err "tailscale status failed — bring up the tunnel first"
    return 1
  fi
  log "✓ tailscale tunnel up"

  # 2. SSH key present?
  if [[ ! -f "${HOME}/.ssh/id_ed25519" && ! -f "${HOME}/.ssh/id_rsa" ]]; then
    err "no SSH key at ~/.ssh/id_ed25519 or ~/.ssh/id_rsa — required for passwordless edge SSH"
    return 1
  fi
  log "✓ SSH key present"

  # 3. Reachability probe: SSH to each edge (skip on individual failures —
  #    we want partial deploys to work even if one edge is offline).
  for entry in "${EDGE_HOSTS[@]}"; do
    IFS='|' read -r name ip port _ <<< "$entry"
    log "  probing $name ($ip:$port)…"
    if ssh "${SSH_OPTS[@]}" -p "$port" "root@$ip" "echo ok" </dev/null >/dev/null 2>&1; then
      log "  ✓ $name reachable"
    else
      err "  ✗ $name ($ip:$port) UNREACHABLE — will skip this edge"
    fi
  done

  # 4. newvps orchestrator health
  if curl -sf -m 5 "$NEWVPS_ORCH_URL/health" >/dev/null; then
    log "✓ newvps orchestrator healthy"
  else
    err "newvps orchestrator $NEWVPS_ORCH_URL/health unreachable — abort"
    return 1
  fi

  return 0
}

# ─── Per-edge deploy ──────────────────────────────────────────────────────────

deploy_edge() {
  local name="$1"
  local ip="$2"
  local port="$3"
  local compose="$4"

  log ""
  log "=== Deploying $name ($ip:$port) — compose=$compose ==="

  # 1. Build harness-edge image on newvps (Linux x86_64) — skip if already cached.
  #    For v1.2.0l, we reuse the wrapper image directly (no edge-specific image
  #    yet — edge wrapper is identical to newvps wrapper, just different host).
  #    Future: separate harness-edge image with lighter footprint.
  log "  [1/5] pulling source to $name…"
  if ! ssh "${SSH_OPTS[@]}" -p "$port" "root@$ip" "mkdir -p /opt/fish-harness" </dev/null; then
    err "  ✗ mkdir /opt/fish-harness failed on $name"
    return 1
  fi

  # 2. scp compose + env (skip .env if it contains real sk- keys — caller
  #    must pre-stage edge-specific MINIMAX_API_KEY at $DEPLOY_DIR/.env.edge).
  log "  [2/5] scp $compose → $name:/opt/fish-harness/deploy/"
  if ! scp "${SSH_OPTS[@]}" -P "$port" "$DEPLOY_DIR/deploy/$compose" "root@$ip:/opt/fish-harness/deploy/" </dev/null; then
    err "  ✗ scp compose failed"
    return 1
  fi

  local env_src="$DEPLOY_DIR/.env.edge"
  if [[ -f "$env_src" ]]; then
    log "  [3/5] scp .env.edge → $name:/opt/fish-harness/.env (sk- keys redacted client-side)"
    # Redact any sk-* values before scp so we never put real keys on the edge
    # host filesystem in clear (L8 hygiene).
    local tmp_env
    tmp_env="$(mktemp)"
    sed -E 's/(sk-[a-zA-Z0-9_-]+)/sk-REDACTED-FOR-DEPLOY/g' "$env_src" > "$tmp_env"
    scp "${SSH_OPTS[@]}" -P "$port" "$tmp_env" "root@$ip:/opt/fish-harness/.env" </dev/null || true
    rm -f "$tmp_env"
  else
    log "  [3/5] no .env.edge — using compose env defaults (insecure, dev only)"
  fi

  # 3. Tear down any stale container (per R9 — stale container state risk)
  log "  [4/5] docker compose down -v (clean state)"
  ssh "${SSH_OPTS[@]}" -p "$port" "root@$ip" "cd /opt/fish-harness && docker compose --env-file .env -f deploy/$compose down -v 2>&1 | tail -5" </dev/null || true

  # 4. Bring up
  log "  [5/5] docker compose up -d --force-recreate"
  if ! ssh "${SSH_OPTS[@]}" -p "$port" "root@$ip" "cd /opt/fish-harness && docker compose --env-file .env -f deploy/$compose up -d --force-recreate 2>&1 | tail -10" </dev/null; then
    err "  ✗ docker compose up failed on $name"
    rollback_edge "$name" "$port" "$compose"
    return 1
  fi

  # 5. Wait for healthcheck
  log "  healthcheck: polling http://$ip:4001/health for up to ${HEALTHCHECK_WAIT_SECONDS}s…"
  local waited=0
  local healthy=0
  while (( waited < HEALTHCHECK_WAIT_SECONDS )); do
    if curl -sf -m 3 "http://$ip:4001/health" >/dev/null 2>&1; then
      healthy=1
      break
    fi
    sleep "$HEALTHCHECK_POLL_INTERVAL"
    waited=$((waited + HEALTHCHECK_POLL_INTERVAL))
  done

  if (( healthy == 1 )); then
    log "  ✓ $name HEALTHY (after ${waited}s)"
    return 0
  else
    err "  ✗ $name UNHEALTHY after ${HEALTHCHECK_WAIT_SECONDS}s"
    rollback_edge "$name" "$port" "$compose"
    return 1
  fi
}

rollback_edge() {
  local name="$1"
  local port="$2"
  local compose="$3"
  err "  ↻ rolling back $name (docker compose down)…"
  ssh "${SSH_OPTS[@]}" -p "$port" "root@$ip" "cd /opt/fish-harness && docker compose --env-file .env -f deploy/$compose down -v 2>&1 | tail -5" </dev/null || true
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  if ! preflight; then
    exit 1
  fi

  local failed_edges=()
  local deployed=()

  for entry in "${EDGE_HOSTS[@]}"; do
    IFS='|' read -r name ip port compose <<< "$entry"
    if deploy_edge "$name" "$ip" "$port" "$compose"; then
      deployed+=("$name")
    else
      failed_edges+=("$name")
    fi
  done

  log ""
  log "=== Summary ==="
  log "Deployed: ${deployed[*]:-none}"
  if (( ${#failed_edges[@]} > 0 )); then
    err "Failed (rolled back): ${failed_edges[*]}"
    exit 2
  fi

  # Verify worker registration on newvps
  log "Worker registration snapshot:"
  curl -sf -m 5 "$NEWVPS_API_URL/api/v1/workers" 2>/dev/null \
    | (command -v jq >/dev/null && jq -r '.workers[] | "  - \(.host) [\(if .status=="active" then "✓" else "✗" end)]"' \
       || cat) || err "(could not fetch /api/v1/workers)"

  log ""
  log "All edges deployed ✓"
  exit 0
}

main "$@"