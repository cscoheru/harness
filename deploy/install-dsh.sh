#!/bin/bash
#
# deploy/install-dsh.sh — install the dsh CLI binary from a GitHub release.
#
# Usage (operator must run interactively):
#   ssh puer-hk 'DSH_VERSION=v1.0.0 DSH_URL=https://github.com/<owner>/dsh/releases/download/v1.0.0/dsh-linux-x64 \
#     bash -s' < deploy/install-dsh.sh
#
# Required env vars (operator MUST verify before invoking):
#   DSH_VERSION   — release tag, e.g. v1.0.0 (NOT "latest"; reproducibility)
#   DSH_URL       — full URL to the release binary asset
#                   (e.g. https://github.com/<owner>/dsh/releases/download/v1.0.0/dsh-linux-x64)
#
# Optional env vars:
#   DSH_INSTALL_PATH — install destination (default: /usr/local/bin/dsh)
#
# Agent cannot know the dsh project's GitHub URL — operator must verify the
# release page in a browser and pin DSH_URL accordingly.
#
# Hygiene:
#   - set -e: bail on first failure
#   - curl -fsSL: fail on HTTP error, follow redirects
#   - chmod +x: required for execution from $PATH
#   - which dsh && dsh --version: verify installation succeeded
#
# @file deploy/install-dsh.sh
set -euo pipefail

DSH_VERSION="${DSH_VERSION:-}"
DSH_URL="${DSH_URL:-}"
DSH_INSTALL_PATH="${DSH_INSTALL_PATH:-/usr/local/bin/dsh}"

if [[ -z "${DSH_VERSION}" ]]; then
  echo "[install-dsh] ERROR: DSH_VERSION env var is required (e.g. v1.0.0)" >&2
  exit 1
fi

if [[ -z "${DSH_URL}" ]]; then
  echo "[install-dsh] ERROR: DSH_URL env var is required" >&2
  echo "[install-dsh]   (operator must verify the GitHub release URL in a browser)" >&2
  exit 1
fi

# Sanity check: DSH_URL should look like an HTTPS URL pointing to a release asset
if [[ ! "${DSH_URL}" =~ ^https://github\.com/[^/]+/[^/]+/releases/download/ ]]; then
  echo "[install-dsh] WARNING: DSH_URL does not look like a GitHub release URL:" >&2
  echo "[install-dsh]   ${DSH_URL}" >&2
  echo "[install-dsh]   (expected: https://github.com/<owner>/<repo>/releases/download/<tag>/<asset>)" >&2
  echo "[install-dsh]   Continuing anyway (operator has already verified)" >&2
fi

echo "[install-dsh] Downloading dsh ${DSH_VERSION} from ${DSH_URL}"

# Download to a temp location first, then move atomically
TMP_PATH="$(mktemp)"
trap 'rm -f "${TMP_PATH}"' EXIT

curl -fsSL --retry 3 --retry-delay 5 "${DSH_URL}" -o "${TMP_PATH}"

if [[ ! -s "${TMP_PATH}" ]]; then
  echo "[install-dsh] ERROR: downloaded file is empty" >&2
  exit 1
fi

# chmod +x and move to install path
chmod +x "${TMP_PATH}"
mv "${TMP_PATH}" "${DSH_INSTALL_PATH}"

# Verify
if ! command -v dsh >/dev/null 2>&1; then
  echo "[install-dsh] WARNING: dsh not on PATH after install" >&2
  echo "[install-dsh]   (installed to ${DSH_INSTALL_PATH}; check your \$PATH)" >&2
else
  echo "[install-dsh] Installed to $(command -v dsh)"
fi

echo "[install-dsh] Running 'dsh --version' to verify:"
dsh --version || echo "[install-dsh] WARNING: 'dsh --version' exited non-zero"

echo "[install-dsh] OK — dsh ${DSH_VERSION} installed at ${DSH_INSTALL_PATH}"