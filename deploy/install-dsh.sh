#!/bin/bash
#
# deploy/install-dsh.sh — install the dsh CLI via npm (global install).
#
# Background:
#   The dsh project (deepseek-ai/deepseek-harness) does NOT publish
#   pre-built binaries on its GitHub releases — only source tarballs.
#   The official distribution channel is the npm package @deepseek-ai/dsh,
#   whose package.json declares "bin: dsh" (i.e. `npm install -g` creates
#   a `dsh` binary on $PATH).
#
#   fish-harness wrapper/dsh/dsh_client.ts invokes dsh via
#   `spawn('dsh', [...args])`, so the binary just needs to be on $PATH.
#
# Usage (operator must run interactively):
#   ssh newvps 'DSH_VERSION=0.1.2-rc.1 \
#     bash -s' < deploy/install-dsh.sh
#
# Required env vars (operator MUST verify before invoking):
#   DSH_VERSION   — exact npm version tag, e.g. 0.1.2-rc.1
#                   (NOT "latest"; npm @latest drifts; match GitHub release tag dsh-v0.1.2-rc.1)
#                   Verify: npm view @deepseek-ai/dsh versions --json | jq -r '.[]' | tail -5
#                   Or: https://github.com/deepseek-ai/deepseek-harness/releases
#
# Optional env vars:
#   DSH_INSTALL_DIR — npm global prefix (default: $(npm root -g))
#                     The `dsh` binary will be installed to <DSH_INSTALL_DIR>/../bin/dsh
#                     (typically /usr/local/bin/dsh or /root/.npm-global/bin/dsh)
#
# Hygiene:
#   - set -euo pipefail: bail on first failure / undefined var / pipe error
#   - npm install -g @deepseek-ai/dsh@<exact-version>: locked version, no drift
#   - which dsh && dsh --version: verify installation succeeded
#
# @file deploy/install-dsh.sh
set -euo pipefail

DSH_VERSION="${DSH_VERSION:-}"
DSH_INSTALL_DIR="${DSH_INSTALL_DIR:-}"

if [[ -z "${DSH_VERSION}" ]]; then
  echo "[install-dsh] ERROR: DSH_VERSION env var is required (e.g. 0.1.2-rc.1)" >&2
  echo "[install-dsh]   Verify at: https://github.com/deepseek-ai/deepseek-harness/releases" >&2
  echo "[install-dsh]   Or: npm view @deepseek-ai/dsh versions --json" >&2
  exit 1
fi

# Sanity check: DSH_VERSION should look like a semver (x.y.z or x.y.z-prerelease)
if [[ ! "${DSH_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "[install-dsh] WARNING: DSH_VERSION does not look like semver:" >&2
  echo "[install-dsh]   ${DSH_VERSION}" >&2
  echo "[install-dsh]   (expected: e.g. 0.1.2-rc.1)" >&2
  echo "[install-dsh]   Continuing anyway (operator has already verified)" >&2
fi

echo "[install-dsh] Installing dsh ${DSH_VERSION} via npm (global)"

# Build npm install command. Pin to official npm registry if a mirror is configured
# to avoid mirror-lag installing an outdated version (e.g. @latest may resolve
# to 0.1.1-rc.2 on npmmirror while official npm has 0.1.2-rc.1).
NPM_REGISTRY="https://registry.npmjs.org/"
NPM_CMD=(npm install -g --registry="${NPM_REGISTRY}" "@deepseek-ai/dsh@${DSH_VERSION}")

if [[ -n "${DSH_INSTALL_DIR}" ]]; then
  NPM_CMD+=(--prefix "${DSH_INSTALL_DIR}")
fi

echo "[install-dsh] Running: ${NPM_CMD[*]}"
"${NPM_CMD[@]}"

# Verify the dsh binary is on $PATH
if ! command -v dsh >/dev/null 2>&1; then
  echo "[install-dsh] ERROR: dsh not on PATH after install" >&2
  echo "[install-dsh]   (npm global bin dir may not be on \$PATH)" >&2
  echo "[install-dsh]   Find it with: npm bin -g" >&2
  exit 1
fi

echo "[install-dsh] Installed: $(command -v dsh)"

# Verify it runs
echo "[install-dsh] Running 'dsh --version' to verify:"
dsh --version || {
  echo "[install-dsh] WARNING: 'dsh --version' exited non-zero" >&2
  exit 1
}

echo "[install-dsh] OK — dsh ${DSH_VERSION} installed at $(command -v dsh)"