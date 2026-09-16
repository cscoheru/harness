---
name: cline-audit-scope-v1.2.0n-m0.1-predeploy
description: Pre-deploy verification scope for v1.2.0n M0.1 worker-pool auto-registration (commit 5faffea, tag v1.2.0n.0)
metadata:
  type: project
  originSessionId: 42de653a-6a8f-4659-a360-644587871f16
  modified: 2026-09-16T12:35:00.000Z
---

# Cline Audit Scope — v1.2.0n M0.1 Pre-Deploy Verification

**对应 commit:** 5faffea (tag v1.2.0n.0 → 5faffea9cf59c36b60bff071efdec81eb71b37f5)
**Cycle:** v1.2.0n M0.1 (worker-pool auto-registration)
**Auditor:** Cline (VS Code extension, gpt-5-claude-or-CLI substitute — user picks model in Cline settings)
**Hygiene baseline:** v0.5 hard rules (5 条 + 引用式纪律)

---

## §1 复审范围

5 files, commit `5faffea` (single commit per L19 hygiene, NOT cc-ready flip):

| # | 文件 | 改动 | 行数 | 关键 file:line |
|---|------|------|------|----------------|
| 1 | `wrapper/orchestrator/pwa_server.ts` | +129/-0 (heartbeat local handler + Option C double-write) | 357 total | L42-167 (route order critical) |
| 2 | `wrapper/test/unit/pwa_server.test.ts` | NEW, 195 lines | — | full file (6 tests) |
| 3 | `deploy/6host-compose.newvps.yml` | +20/-0 (3 wrapper env + frontend volume) | 384 total | L174-178, L227-231, L275-279, L312-316 |
| 4 | `pyproject.toml` | +1/-1 (version 1.2.0+0.m.0 → 1.2.0+0.n.0) | L7 | L7 |
| 5 | `harness/__init__.py` | +1/-1 (version 1.2.0m.0 → 1.2.0n.0) | L25 | L25 |

**Out of scope** (should NOT be in this commit):
- `wrapper/orchestrator/server.ts` (canonical heartbeat handler at L327-424 — read-only reference for shape parity)
- `wrapper/orchestrator/heartbeat_sender.ts` (worker side, no changes)
- `wrapper/orchestrator/worker_pool.ts` (SqliteWorkerPool — read-only reference)
- `wrapper/orchestrator/worker.ts` (worker.register() helper — read-only reference)

---

## §2 复审重点

### 必查项 (A-E)

**A. Express route order** (`wrapper/orchestrator/pwa_server.ts:42-167`)
- `app.post("/api/v1/worker/heartbeat", ...)` MUST be registered BEFORE `app.all("/api/v1/*path", ...)` (L167)
- Express matches in registration order; wildcard proxy would otherwise eat the heartbeat path → local pool never populates → double-write never fires
- Verification: `grep -nE 'app\.(post|all|use|get)\(' wrapper/orchestrator/pwa_server.ts`

**B. Option C double-write semantics** (`wrapper/orchestrator/pwa_server.ts:130-148`)
- Fire-and-forget `void fetch(...).catch(...)` swallows ECONNREFUSED → local 200 response still goes out
- Best-effort: local pool is source for PWA UI badge; orchestrator pool is source for dispatch
- Verification: T5 spy confirms fetch to `wrapper-orchestrator:4000` is called; pwa_server.test.ts:178-186

**C. Schema validation parity** (`wrapper/orchestrator/pwa_server.ts:54-63`)
- Mirrors server.ts:340-348 F6 injection guard
- Rejects: unexpected fields (400), missing host on register (400), missing capabilities_json (400), oversized capabilities_json > 10240 bytes (413)
- Verification: T1 (empty body → 400), T4 (extra fields → 400), T6 (no host → 400)

**D. SQLite WAL concurrency** (`deploy/6host-compose.newvps.yml:312-316`)
- BOTH `wrapper-orchestrator` (L150) AND `wrapper-frontend` (L312-316) mount `orch_pool:/data` volume
- SQLite WAL file co-located; concurrent writes from both processes
- Verify pragma: `journal_mode=WAL`, `busy_timeout=5000` (per `task_store.ts:133-136` + `worker_pool.ts`)
- Concern: under heavy heartbeat traffic, both processes writing → possible `SQLITE_BUSY` errors
- Mitigation already in place: WAL mode + busy_timeout

**E. Heartbeat sender env wiring** (`deploy/6host-compose.newvps.yml:174-178, 227-231, 275-279`)
- 3 newvps wrapper profiles set `WORKER_HEARTBEAT_URL=http://wrapper-frontend:4002` + `WORKER_HOST=<container-name>`
- `heartbeat_sender.ts:81-82` reads `process.env['WORKER_HEARTBEAT_URL']`; if unset, sender doesn't start
- MUST be set BEFORE `heartbeat_sender.ts` module loads (env-injected at container start per compose `environment:` block — eval order OK)

### 潜在新 finding (F-H)

**F. fetchSpy isolation in pwa_server.test.ts:96-101**
- `vi.spyOn(globalThis, "fetch")` uses default calls-through behavior (NOT `mockResolvedValue`)
- Reason: test's own `postJson` (line 79) uses fetch → if mocked with canned response, status/body assertions break
- Concern: if test ever adds a 7th case that DOES rely on canned fetch response, it would silently break
- Verification: T5 line 178-186 inspects `fetchSpy.mock.calls` for URL pattern, not response shape

**G. `process.env["PWA_PORT"] = "0"` in test setup** (`pwa_server.test.ts:64`)
- `parseInt("0")` = 0, but `app.listen(0, ...)` should ephemeral-bind (Node behavior, not Port 0 literal)
- Concern: if pwa_server.ts uses `parseInt("0")` but `app.listen(PORT, ...)` then PORT=0 → ephemeral bind OK
- Verify: build/orchestrator/pwa_server.js L301 `app.listen(PORT, () => ...)` — uses PORT not literal 0

**H. `process.env["PWA_ORCH_PROXY_URL"]` default** (`wrapper/orchestrator/pwa_server.ts:32`)
- `?? "http://wrapper-orchestrator:4000"` — defaults to wrapper-orchestrator in newvps compose network
- Concern: in test env this hostname is unresolvable → fetchSpy records URL but actual fetch would fail (test uses calls-through so it tries real DNS → ECONNREFUSED, which handler `.catch` swallows)
- Verify: build/orchestrator/pwa_server.js L32 has the `??` fallback

### 不应再 FAIL 的项 (I-K)

**(I)** v1.2.0l.5 followup 已修 51 ripple (M0.2 + M0.3) — 不要回滚 M0.2/M0.3 fixes
- M0.2: `.gitignore /node_modules/` + `vitest.config.ts !build/**` 排除
- M0.3: tenant_id + X-Tenant-ID + KERNEL_VERSION + execution_driver mock + planStep shapes

**(J)** v1.2.0k.3 P0 tenant isolation — production code 在 `server.ts:188-205` (kernel fallback 路径); pwa_server heartbeat 不传 tenant (worker 不是 task-scoped, workers_count + per-driver liveness)
- **不应** 在 `pwa_server.ts` heartbeat handler 加 tenant validation (workers are tenant-agnostic)

**(K)** v1.2.0l.5 WORKFLOW_PACKS_DIR 在 compose L329 — M0.1 不应改动

---

## §3 Findings 覆盖矩阵 (本次新功能, 无「前一轮 finding」)

| # | 类别 | 风险 | 验证方式 | 期望 |
|---|------|------|----------|------|
| 1 | Correctness | Express 路由顺序错 | vitest pwa_server.test.ts T1-T6 | 6/6 PASS |
| 2 | Correctness | Option C 双写 fetch URL 错 | T5 spy 检查 wrapper-orchestrator:4000 | URL match |
| 3 | Correctness | schema validation 漏字段 | T1 (空 body) + T4 (extra) + T6 (no host) | 3 个 400 |
| 4 | Correctness | last_heartbeat_at 类型错 | T3 类型检查 | string 或 number |
| 5 | Hygiene | L8 secrets | `git diff 5faffea^..5faffea -U0 \| grep sk-/TOKEN` | 0 matches |
| 6 | Hygiene | L19 tag 指向 | `git rev-parse v1.2.0n.0^{commit}` | = HEAD = 5faffea |
| 7 | Hygiene | v1.0 runtime 0 diff | `git diff 1.0.0..HEAD -- harness/server.py spec/ \| wc -l` | 0 |
| 8 | Build | tsc clean | `cd wrapper && ./node_modules/.bin/tsc --noEmit` | exit 0 |
| 9 | Test | full vitest | `cd wrapper && ./node_modules/.bin/vitest run` | 260 PASS / 0 FAIL |
| 10 | Compose | YAML valid | `python3 -c "import yaml; yaml.safe_load(...)"` | exit 0 |
| 11 | Compose | WORKER_HEARTBEAT_URL ×3 + WORKER_HOST ×3 | grep count | 6 matches |

---

## §4 复验命令 (Cline 可直接跑)

```bash
cd /Users/kjonekong/projects/fish-harness

# 1. Type check (per [[fish-harness-project]] §5.3 — must use local bin)
cd wrapper && ./node_modules/.bin/tsc --noEmit
cd ..

# 2. Full test suite
cd wrapper && ./node_modules/.bin/vitest run 2>&1 | tail -10
cd ..

# 3. L8 secrets (F1 hygiene — pattern strict)
git diff 5faffea^..5faffea -U0 | grep -E 'sk-[a-zA-Z0-9]{8,}|api[_-]key|SECRET|TOKEN|PASSWORD' || echo "L8 clean ✓"

# 4. L19 tag lock (per F4 — must match HEAD)
echo "tag commit: $(git rev-parse v1.2.0n.0^{commit})"
echo "HEAD:       $(git rev-parse HEAD)"
# 期望两者都是 5faffea9cf59c36b60bff071efdec81eb71b37f5

# 5. v1.0 runtime immutability (per ADR 0010 Decision d)
git diff 1.0.0..HEAD -- harness/server.py spec/ kernel-schema.sql | wc -l
# 期望 0

# 6. Express route order (A — most critical)
grep -nE 'app\.(post|all|use|get)\(' wrapper/orchestrator/pwa_server.ts
# 期望顺序: use(json) → post(/api/v1/worker/heartbeat) → all(/api/v1/*path) → post(/api/pwa/dispatch) → static

# 7. Compose schema validation
python3 -c "import yaml; yaml.safe_load(open('deploy/6host-compose.newvps.yml'))" && echo "YAML valid ✓"

# 8. Compose env var count
echo "WORKER_HEARTBEAT_URL: $(grep -c 'WORKER_HEARTBEAT_URL' deploy/6host-compose.newvps.yml)"
echo "WORKER_HOST:         $(grep -c 'WORKER_HOST' deploy/6host-compose.newvps.yml)"
# 期望各 3 (3 wrapper profiles)

# 9. heartbeat_sender env contract
grep -n 'WORKER_HEARTBEAT_URL' wrapper/orchestrator/heartbeat_sender.ts | head -5
# 期望: process.env['WORKER_HEARTBEAT_URL'] early-return guard

# 10. fetchSpy isolation sanity
grep -n 'mockResolvedValue\|mockImplementation\|spyOn(globalThis, .fetch.)' wrapper/test/unit/pwa_server.test.ts
# 期望: 只有 spyOn(globalThis, "fetch") 无 mockResolvedValue (calls-through default)
```

---

## §5 Cline prompt 模板

```
You are reviewing v1.2.0n.0 M0.1 worker-pool auto-registration changes for
pre-deploy verification.

Tag: v1.2.0n.0 → commit 5faffea
Project: /Users/kjonekong/projects/fish-harness
Files changed (5):
  1. wrapper/orchestrator/pwa_server.ts (+129) — heartbeat local short-circuit + Option C double-write
  2. wrapper/test/unit/pwa_server.test.ts (NEW, 195 lines) — 6 tests
  3. deploy/6host-compose.newvps.yml (+20) — 3 wrapper profile env + frontend volume
  4. pyproject.toml (+1/-1) — version bump
  5. harness/__init__.py (+1/-1) — version bump

Read this audit scope: notes/cline-audit-scope-v1.2.0n-m0.1-predeploy.md
For each §2 必查项 (A-E), confirm or refute. For 潜在新 finding (F-H),
check if it's a real concern or scope-appropriate.

Run the §4 verification commands yourself. Report findings as a numbered
list with:
  - File:line
  - Severity (critical / major / minor)
  - Description
  - Suggested fix (or "no fix needed" if you confirm it's OK)

Pass criteria: 0 critical, 0 major, ≤ 2 minor (sanity polish only).

DO NOT modify any files. Read-only review.
```

---

## §6 沉淀机制

- 审验结果落 `notes/cline-review-v1.2.0n-m0.1-predeploy-report.md`
- 若有 critical/major finding, 用户裁断是否 amend commit + 补推 (`git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin main --force-with-lease` — 不动 tag)
- 若全 pass, deploy 授权 (`docker compose -f deploy/6host-compose.newvps.yml up -d --force-recreate wrapper-frontend wrapper-orchestrator wrapper-commander wrapper-commander-2`)
- Forward scope (v1.2.0n M1): depends_on 并行执行 + wildcard `${step.*.stdout}` template var

---

## §7 hygiene 自检 (按 v0.5 hard rule 5 条)

| # | 规则 | 落地 | 证据 |
|---|------|------|------|
| (a) | 先行起草 | ✅ | 本文件在 commit 5faffea 之前起草（用户要求） |
| (b) | commit 后立即复审 | ✅ | M0.1 commit 后已跑 tsc + vitest, pwa_server.test.ts 6/6 PASS, full baseline 260 PASS / 0 FAIL / 147 SKIP |
| (c) | 自引入预演入列 | ✅ | 本文件 grep 字面预计 0（不入 tracked） |
| (d) | commit message 附实测数 | ✅ | 5faffea commit message 含 "260 PASS / 0 FAIL / 147 SKIP" |
| (e) | 引用式纪律 | ✅ | §1.5 主表唯一权威源 + §4 命令是单点验证 |

---

## §8 引用 (cross-ref)

- [[fish-harness-v1-2-0l-cycle-closure]] — M0.1 close the v1.2.0l.5 P0 deferred worker pool gap
- [[fish-harness-auto-commit-push]] — auto commit/push via Clash proxy (no codex review)
- [[fish-harness-newvps-kex-workaround]] — KEX curve25519-sha256 for ssh into newvps (deploy step)
- [[fish-harness-newvps-deploy-gotchas]] — M1c DO-1 6 大坑 (deploy step)
- [[codex-manager-project]] — Cline 在 VS Code 里运行 (本次审验工具)
