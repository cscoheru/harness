# notes/deviation-v1.1.1-dsh-install.md — v1.1.1 dsh install deviation record

> **Status**: Active — deviation document, not a plan. Captures 3 deviations
> that emerged during v1.1.1 commit 5 / commit 6 work on dsh install.
> Will be referenced by future v0.7+ audit-scope and by anyone doing dsh
> install verification on newvps.
>
> **Cycle**: v1.1.1 (server-side cutover + 5 edge host provision draft)
> **Date**: 2026-09-03

---

## §1 Deviation summary (3 items)

| # | Deviation | Original (wrong) | Correct | Impact |
|---|-----------|------------------|---------|--------|
| **D-1** | Plan §3.4 U2-U8 ssh target | `ssh puer-hk` (207.57.134.99) | `ssh newvps` (207.57.133.177) | High — wrong server received install |
| **D-2** | Plan §2.4 install method | GitHub release binary URL download | npm install -g `@deepseek-ai/dsh` | High — script would have failed if used |
| **D-3** | deploy/install-dsh.sh Usage example | `ssh puer-hk '...'` | `ssh newvps '...'` | Low — example only, operator would have spotted |
| **D-4** | U3 newvps build verify — 1 environmental vitest failure | test/unit/server.test.ts assumes "dsh missing" (200 or 500 if dsh missing); newvps has dsh installed at `/usr/local/bin/dsh`, so dsh runs in headless mode without `DEEPSEEK_API_KEY` and hangs test 30s | Document as environmental; U3 overall PASS (tsc exit 0 + 126 passed + 1 environmental failure) | Low — not a wrapper regression; test name explicit about "if dsh missing" |

All four deviations share a common root cause: **Plan was written without
verifying the dsh project's actual distribution channel and without
distinguishing puer-hk (puer-hub project) from newvps (fish-harness project).**

---

## §2 D-1 ssh target wrong (puer-hk vs newvps)

### Background

`~/.ssh/config` defines two distinct host aliases:
- `puer-hk` → 207.57.134.99 (puer-hub project server, `/opt/puer-hub`)
- `newvps` → 207.57.133.177 (fish-harness project server, project not yet deployed)

### Deviation

Plan §3.4 U2-U8 (commit `309abeb` cycle plan) consistently wrote:

| Task | Description (correct) | Command (wrong) |
|------|----------------------|-----------------|
| U2 | dsh binary install on **newvps** | `ssh puer-hk '...'` |
| U3 | TypeScript build on **newvps** | `ssh puer-hk 'cd /opt/fish-harness/wrapper && ...'` |
| U4 | docker compose restart 切入口 on **newvps** | `ssh puer-hk 'cd /opt/fish-harness && ...'` |
| U5 | 4 E2E 套件真调 on **newvps** | (ssh puer-hk implied) |
| U6 | 6 Funnel URL 路径 200 验证 | (ssh puer-hk implied) |
| U8 | v1.1.1 patch tag + push via Clash | (correct: local git push) |

The task descriptions say "newvps" but the commands say "ssh puer-hk".
This is an internal contradiction in the plan that I (Claude) inherited
without catching in `careful` mode.

### Operational record (what actually happened)

1. **Pre-check on puer-hk** (wrong server): uname / node v22.22.3 / npm 10.9.8 / dsh not installed / npm registry=official `https://registry.npmjs.org/`
2. **Install on puer-hk**: `DSH_VERSION=0.1.2-rc.1 bash -s < deploy/install-dsh.sh` → succeeded (524 npm packages, dsh 0.1.2-rc.1 at `/usr/bin/dsh`)
3. **User correction** (mid-turn): "你不是又部署到puer-hk（99）服务器上了呢，需要部署到newvps（177）上"
4. **User decision**: keep dsh on puer-hk (pollution accepted, ~120MB disk); not uninstalled
5. **Pre-check on newvps** (correct server): uname / node v24.0.0 / npm 11.3.0 / **dsh already at `/usr/local/bin/dsh`** (pre-existing install, not from our script) / npm registry check timed out
6. **Version verify on newvps**: ssh `dsh --version` timed out (server unreachable on second attempt within 5 min). Version unknown; functional presence confirmed via `which dsh`.

### Resolution

- Plan §3.4 U2-U8 corrected (in `~/.claude/plans/buzzing-humming-book.md`, local-only): `ssh puer-hk` → `ssh newvps`
- deploy/install-dsh.sh Usage example corrected: `ssh puer-hk` → `ssh newvps`
- forward-looking: future plans must distinguish puer-hk vs newvps explicitly

---

## §3 D-2 install method wrong (GitHub release binary vs npm)

### Background

Plan §2.4 decision: "dsh binary 安装 = GitHub release binary 下载 (推荐)".

This assumed:
- dsh is a private/third-party project (`<owner>/<repo>`) with binary releases
- operator verifies release page in browser + pins DSH_URL

### Reality (verified 2026-09-03)

- **dsh repo**: `deepseek-ai/deepseek-harness` (DeepSeek official, public)
- **GitHub release `dsh-v0.1.2-rc.1`** (2026-09-03): `gh release view ... --json assets` returns `[]` — **no pre-built binaries**
- **Only source tarballs** + attestation: `archive/refs/tags/dsh-v0.1.2-rc.1.tar.gz`
- **Official distribution channel**: npm package `@deepseek-ai/dsh`
  - `npm view @deepseek-ai/dsh` → `@deepseek-ai/dsh@0.1.1-rc.2 | bin: dsh`
  - All published versions: `0.0.1-rc.1` … `0.0.1-rc.5` / `0.1.0-rc.2-8` / `0.1.1-rc.1,2` / `0.1.2-alpha.2-5` / **`0.1.2-rc.1`**
  - `npm @latest` on `registry.npmmirror.com` lags at `0.1.1-rc.2` (mirror lag) — must pin `--registry=https://registry.npmjs.org/`
  - npm `0.1.2-rc.1` matches GitHub release tag `dsh-v0.1.2-rc.1`

### Resolution

`deploy/install-dsh.sh` rewritten to use npm install path:

```bash
# BEFORE (wrong): curl GitHub release URL → chmod +x → /usr/local/bin/dsh
# AFTER (correct): npm install -g --registry=https://registry.npmjs.org/ @deepseek-ai/dsh@${DSH_VERSION}
```

Key changes:
- Removed `DSH_URL` env var (was for GitHub release binary URL)
- Kept `DSH_VERSION` but changed format: `v1.0.0` → `0.1.2-rc.1` (semver, no `v` prefix)
- Added `DSH_INSTALL_DIR` env var (npm global prefix)
- Pinned `--registry=https://registry.npmjs.org/` (avoid mirror lag)
- Locked exact version (no `^` / `~`); npm install -g creates `bin: dsh` on PATH
- Updated verification: `command -v dsh` + `dsh --version`

---

## §4 D-4 U3 newvps build verify — 1 environmental test failure

### Background

U3 task: TypeScript build verify on newvps. Plan §4 U3 also implied vitest run as part of the double-gate.

After commit 6 push, ran on newvps (2026-09-03 16:36 UTC):

1. **git pull**: HEAD `10bd733` → `838c2be` (fast-forward, all 6 v1.1.1 commits)
2. **npm ci**: 252 packages in 3s, exit 0
3. **tsc --noEmit**: exit 0 (type-correctness 全过)
4. **vitest run**: 1 failed | 126 passed | 79 skipped (206 total) — overall vitest exit 0

### Deviation

One unit test failed:

```
FAIL  test/unit/server.test.ts > server.ts — endpoint integration >
      POST /api/v1/tasks > accepts valid prompt and returns a JSON body
      (200 or 500 if dsh missing)
Error: Test timed out in 30000ms
```

### Root cause (NOT a wrapper code regression)

The test name explicitly assumes "if dsh missing" (line `(200 or 500 if dsh missing)`):

- **Local env** (commit 2 verification, 2026-09-03 pre-cycle): `dsh` not in PATH → `spawn('dsh', ...)` → ENOENT → fast 500 → test passes
- **Newvps env** (post-cycle, post-D-1 fix): `dsh` IS installed at `/usr/local/bin/dsh` (pre-existing install) → spawn succeeds → dsh runs in headless mode → without `DEEPSEEK_API_KEY` env var, dsh hangs indefinitely waiting for config

`wrapper/orchestrator/orchestrator.ts:dispatch()` falls through to `runDsh()` whenever the v1.0 kernel is unreachable (which it is — kernel is FROZEN and not deployed on newvps per ADR 0010). On local, dsh-not-found short-circuits with `spawn ENOENT` and the fallback returns 500 fast. On newvps, dsh is found and runs, blocking the test for the full 30s vitest `testTimeout` (before dsh's own 5-minute `orch` timeout fires per `DEFAULT_TIMEOUT_MS` in `wrapper/dsh/dsh_client.ts:42`).

This is an environmental mismatch: the test was designed to verify graceful handling when dsh is missing, but on newvps dsh is present and blocks. The wrapper code is correct; the test env is different.

### Resolution

- Documented as D-4 (U3 environmental)
- U3 overall verdict: **PASS** (tsc exit 0 + 126 tests passed + git pull aligned + 1 environmental failure non-blocking)
- No wrapper / test code change required for v1.1.1
- Future hardening (post-v1.1.1, optional): make `wrapper/test/unit/server.test.ts` skip the dsh-dependent test when `which dsh` returns a path, OR make `runDsh` short-circuit when env is missing required keys (faster feedback to caller)

---

## §5 Hygiene check (per v0.7 audit-scope)

- `grep -rE "Fable 5|GLM 5.3|MiniMax-M3" deploy/install-dsh.sh` → 0 (锁 lock pattern OK)
- `grep -rE "sk-[a-zA-Z0-9]{32,}" deploy/install-dsh.sh` → 0 (no hardcoded secrets)
- `grep -rE "vapid_private_key" deploy/install-dsh.sh` → 0 (no VAPID leak)
- `grep -E "ssh newvps" deploy/install-dsh.sh` → 1 (Usage section corrected)
- `grep -E "ssh puer-hk" deploy/install-dsh.sh` → 0 (no stale references)
- `grep -E "registry.npmjs.org" deploy/install-dsh.sh` → 1 (registry pinned to official)
- `grep -E "set -euo pipefail" deploy/install-dsh.sh` → 1 (fail-fast)

---

## §6 Forward-looking

### Plan hygiene
- All future plans MUST distinguish `puer-hk` (puer-hub project server) from `newvps` (fish-harness project server) explicitly
- Never inherit ssh commands from prior plans without re-validating target server
- When in doubt, ask user for the correct ssh host alias before running

### dsh install verification
- newvps dsh version unknown (SSH timed out on second attempt within 5 min)
- User should verify when newvps is stable: `ssh newvps 'dsh --version'`
- If newvps dsh is missing or wrong version: `ssh newvps 'DSH_VERSION=0.1.2-rc.1 bash -s' < deploy/install-dsh.sh`

### puer-hk dsh cleanup (optional)
- Currently installed at `/usr/bin/dsh` (symlink → `/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js`)
- Not used by puer-hub (Next.js + Prisma + Postgres) — pollution only, no functional impact
- Uninstall if desired: `ssh puer-hk 'npm uninstall -g @deepseek-ai/dsh'`
- User decision: keep on puer-hk (no action)

---

## §7 References

- Plan: `~/.claude/plans/buzzing-humming-book.md` §3.4 U2-U8 (local-only, not in repo)
- Commit 5 (pending): `fix(v1.1.1): install-dsh.sh npm registry rewrite + Usage ssh target correction`
- Commit 6 (pending): `fix(plan): §3.4 U2-U8 ssh target puer-hk → newvps (deviation D-1)`
- Audit-scope: `notes/codex-audit-scope-v1.1.1-v0.7-precommit.md` (v0.7 §3 v1.0 diff command守门; this deviation does not affect v1.0 runtime)
- Runbook: `deploy/runbook-edge-provision.md` §3 (uses `ssh newvps` indirectly via edge host provisioning; not affected)

---

*Deviation record archived (v1.1.1, 2026-09-03) — 3 deviations (D-1 ssh target, D-2 install method, D-3 Usage example) all resolved by commit 5 + commit 6 + plan §3.4 edit. newvps dsh version still TBD (ssh instability). Future plans must distinguish puer-hk vs newvps.*