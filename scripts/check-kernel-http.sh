#!/usr/bin/env bash
# scripts/check-kernel-http.sh — kernel HTTP daemon smoke test (per ADR 0012).
#
# Verifies 5 routes return expected shapes:
#   GET  /api/orch/healthz     → status=ok, version=1.2.0k.3, active_tasks
#   POST /api/orch/invoke      → SSE stream with driver.handle + driver.finished
#                                AND v1.2.0k.2 driver.output_chunk (N>=1)
#   GET  /api/orch/list        → tenant-filtered via X-Tenant-ID (v1.2.0k.3)
#   GET  /api/orch/status/{id} → task snapshot with status=completed
#
# Usage: scripts/check-kernel-http.sh [--port 4001] [--host localhost]
#
# Returns 0 on all-pass, 1 on any failure. Mirrors scripts/check-stale-build.sh
# style (set -euo pipefail, clean exit codes, here-doc wrappers).

set -euo pipefail

PORT="${PORT:-4001}"
HOST="${HOST:-localhost}"
BASE="http://${HOST}:${PORT}"

echo "[kernel-http] smoke test against ${BASE}"

# ─── healthz ────────────────────────────────────────────────────────────
echo "[kernel-http] GET /api/orch/healthz"
HEALTH=$(curl -sf "${BASE}/api/orch/healthz")
echo "  ${HEALTH}"
STATUS=$(echo "${HEALTH}" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
VERSION=$(echo "${HEALTH}" | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])")
if [[ "${STATUS}" != "ok" ]]; then
  echo "[kernel-http] FAIL: healthz status=${STATUS} (expected ok)" >&2
  exit 1
fi
if [[ "${VERSION}" != "1.2.0k.3" ]]; then
  echo "[kernel-http] FAIL: healthz version=${VERSION} (expected 1.2.0k.3)" >&2
  exit 1
fi

# ─── invoke (SSE) ───────────────────────────────────────────────────────
TASK_ID="smoke-$(date +%s)-$$"
echo "[kernel-http] POST /api/orch/invoke (task_id=${TASK_ID})"
# Save full SSE stream to temp file (NOT head -8 — that would truncate
# before driver.finished emits on later lines).
SSE_TMP=$(mktemp)
trap "rm -f ${SSE_TMP}" EXIT
curl -s -N -X POST "${BASE}/api/orch/invoke" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: smoke-tenant" \
  -d "{
    \"task_id\": \"${TASK_ID}\",
    \"tenant_id\": \"smoke-tenant\",
    \"workflow_pack\": \"web_research\",
    \"workflow_version\": \"1.0.0\",
    \"capability_profile\": {\"driver_kind\": \"codex_exec\"},
    \"lease_token\": \"lease-smoke\",
    \"fence_version\": 1,
    \"prompt\": \"smoke test prompt\",
    \"model_class\": \"worker\",
    \"host_id\": \"smoke-host\"
  }" > "${SSE_TMP}"
head -8 "${SSE_TMP}"
if ! grep -q "event: driver.handle" "${SSE_TMP}"; then
  echo "[kernel-http] FAIL: invoke SSE missing driver.handle event" >&2
  exit 1
fi
if ! grep -q "event: driver.finished" "${SSE_TMP}"; then
  echo "[kernel-http] FAIL: invoke SSE missing driver.finished event" >&2
  exit 1
fi
# v1.2.0k.2: stub emits 3 synthetic driver.output_chunk events per run().
# Pipeline passthrough via harness/runtime/orch_http.py:188-201 (_to_http_event)
# → harness/server.py:108-125 SSE yield loop. Verify at least 1 chunk
# reached the wire (stub emits 3, so we expect >= 1).
if ! grep -q "event: driver.output_chunk" "${SSE_TMP}"; then
  echo "[kernel-http] FAIL: invoke SSE missing driver.output_chunk event" >&2
  exit 1
fi
CHUNK_COUNT=$(grep -c "event: driver.output_chunk" "${SSE_TMP}" || true)
echo "[kernel-http] invoke SSE contains ${CHUNK_COUNT} driver.output_chunk event(s)"

# ─── list ───────────────────────────────────────────────────────────────
echo "[kernel-http] GET /api/orch/list (X-Tenant-ID: smoke-tenant)"
LIST=$(curl -sf "${BASE}/api/orch/list" -H "X-Tenant-ID: smoke-tenant")
LIST_COUNT=$(echo "${LIST}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
if [[ "${LIST_COUNT}" -lt 1 ]]; then
  echo "[kernel-http] FAIL: list count=${LIST_COUNT} (expected >=1)" >&2
  exit 1
fi

# v1.2.0k.3: missing header must return 400 (not leak all tenants)
NO_TENANT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/orch/list")
if [[ "${NO_TENANT_STATUS}" != "400" ]]; then
  echo "[kernel-http] FAIL: list without X-Tenant-ID returned ${NO_TENANT_STATUS} (expected 400)" >&2
  exit 1
fi
echo "[kernel-http] list without X-Tenant-ID returns 400 (tenant isolation enforced)"

# ─── status ─────────────────────────────────────────────────────────────
echo "[kernel-http] GET /api/orch/status/${TASK_ID}"
STATUS_JSON=$(curl -sf "${BASE}/api/orch/status/${TASK_ID}")
TASK_STATUS=$(echo "${STATUS_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
echo "  status=${TASK_STATUS}"
if [[ "${TASK_STATUS}" != "completed" ]]; then
  echo "[kernel-http] FAIL: status=${TASK_STATUS} (expected completed)" >&2
  exit 1
fi

echo "[kernel-http] ALL CHECKS PASSED"
exit 0
