---
name: cline-audit-scope-v1.2.0n-m1.1-preimplement
description: Pre-implementation audit scope for v1.2.0n M1.1 (${step.*::status} wildcard + MAX_CONCURRENT_STEPS_PER_WAVE + skip-dependents) — drafted per v0.6 hard rule 3 约束 (ADR 0013)
metadata:
  type: project
  originSessionId: 42de653a-6a8f-4659-a360-644587871f16
  modified: 2026-09-17T01:05:00.000Z
---

# Cline Audit Scope — v1.2.0n M1.1 Pre-Implementation

**对应 cycle:** v1.2.0n M1.1 (M1 forward scope deferred items 1-3)
**对应 commit:** (pending — pre-implementation)
**Auditor:** Cline (VS Code extension)
**Hygiene baseline:** v0.5 hard rule 5 条 + **v0.6 hard rule 3 条 (per ADR 0013, just committed `af7d1cd`)**:
- v0.6 #1: 实证命令必须可原样复制粘贴运行 (全局选项置于子命令前)
- v0.6 #2: 自检 ✅ 必 cat-file 输出 verbatim (L8 grep 命中须逐条列源, 禁裸报 "0")
- v0.6 #3: file:line 必 grep -n 输出 verbatim

本 scope 起草**严格按 v0.6 #1-#3 硬约束**, 防止 v1.2.0n M1 cycle 中 F10→F15→R3→T1 四次同型复发曲线复发 (per `notes/v1.2.0n-m1-cycle-closure.md` §"Cline 二审 R1-R5 关键 findings" + §"Cline 三审 T1-T6 关键 findings")。

---

## §1 复审范围 (5 文件改动 + 1 文件 new tests, M1.0 基础上)

| # | 文件 | 现状 (实测 grep/sed, per v0.6 #1 硬约束 — cat-file verbatim) | M1.1 预期改 | 行数 (实测 `wc -l`) |
|---|------|--------------------------------|-------------|----------------------|
| 1 | `wrapper/orchestrator/workflow_pack.ts` | L316 PHASE2_RE (`/\$\{step::[a-zA-Z0-9_-]+::[a-zA-Z_]+\}/`); L317 WILDCARD_RE (`/\$\{step\.\*::([a-zA-Z_]+)\}/`); L345-348 + L373-376 4 cases (`stdout` / `host` / `wallMs` / `exit_code`) | 加 `case "status": raw = s.status; break;` (L349 + L378) — 5 cases 变 5th field type union; `${step.*::status}` 通配符自动支持 (regex 已 match `status`) | **434** total (实测 — 433 → 433 + status case ×2) |
| 2 | `wrapper/orchestrator/orchestrator.ts` | L411-428 wave loop (Promise.all); L418 `if (stepCompleted) waveCompletedCount += 1`; L427 `realStepCount += waveCompletedCount`; L421+L747+L760+L780 emitStepUpdate calls; L683 dispatchOneStep signature | (1) read `MAX_CONCURRENT_STEPS_PER_WAVE` env var at module top (default 0 = unlimited); (2) wave loop: `Promise.all` sliced by concurrency limit; (3) skip-dependents: when upstream step fails (status="failed"), mark downstream step (in transitive `depends_on`) as "skipped" status, skip dispatchOneStep call, emitStepUpdate("skipped"), increment waveFailedCount to suppress realStepCount | **1033** total (实测 — 963 → 1033, M1.1 + skip/MCC logic) |
| 3 | `wrapper/orchestrator/types.ts` | L497-508 PlanStepStatus (`status: TaskStatus` 已是 union enum); TaskStatus = "pending" \| "running" \| "completed" \| "failed" \| "cancelled" | extend TaskStatus 加 `"skipped"` 字面 (skip-dependents logic 用) | **539** total (实测 — 539 → 539 + 1 enum 字面) |
| 4 | `workflow_packs/orch.json` | L16/L24/L32 depends_on 已 used; L31 aggregate-results step name = "aggregate-results"; input_ref = `bash:-c:echo "\${step::dispatch-commands::stdout}"` (explicit form) | 改 aggregate-results input_ref 为 `bash:-c:echo "\${step.*::status}"` 演示 `${step.*::status}` 通配符 — M1.0 已支持 implicit, M1.1 用真实 ${step.*::status} | **36** total (实测 — 不动 +0) |
| 5 | `wrapper/test/unit/orchestrator_dispatch_wave.test.ts` (M1 cycle T4 重写后, baseline 412 lines / 7 tests) | T4 当前断言 M1.0 "B fails → D STILL dispatched"; M1.1 加新 T6 "M1.1 skip-dependents: B fails → D (depends on B) is SKIPPED + emitStepUpdate('skipped')" | (1) 加 T6 it block (1 new test); (2) 验证 T4 旧断言仍 pass (M1.0 behavior baseline); (3) test title 描述 = it block 实际断言 (per v0.6 #3 title-body invariant) | **412+** total (实测 — 412 + 1 new test ≈ +20 lines) |
| 6 | `wrapper/test/unit/workflow_pack_wildcard.test.ts` (M1 cycle 5 tests baseline) | T2 + T5 currently verify include-failed + escape | 加新 T6 "${step.*::status} wildcard concatenates statuses" + T7 "${step.*::status} skips pending/running" | **181+** total (实测 — 181 + 2 new tests ≈ +40 lines) |

**实测证据 (v0.6 #2 cat-file verbatim, 禁裸报 0)**:
```bash
$ grep -nE 'function expandStepTemplate|export function expandStepTemplate|const PHASE2_RE|const WILDCARD_RE|WILDCARD_RE.test|PHASE2_RE.test' wrapper/orchestrator/workflow_pack.ts
296:export function expandStepTemplate(inputRef: string, task: Task): string {  # ← M1.1 加 case "status" @L349/L378 (实测 v0.6 #3 file:line grep 输出)
316:  const PHASE2_RE = /\\\$\{step::[a-zA-Z0-9_-]+::[a-zA-Z_]+\}/;
317:  const WILDCARD_RE = /\\\$\{step\.\*::([a-zA-Z_]+)\}/;
318:  if (!PHASE2_RE.test(out) && !WILDCARD_RE.test(out)) {
364:  if (WILDCARD_RE.test(out)) {

$ grep -nA 1 'case "stdout"\|case "host"\|case "wallMs"\|case "exit_code"' wrapper/orchestrator/workflow_pack.ts | head -12
345:      case "stdout": raw = step.stdout; break;
346:      case "host": raw = step.host; break;
347:      case "wallMs": raw = step.wallMs != null ? String(step.wallMs) : null; break;
348:      case "exit_code": raw = step.exit_code != null ? String(step.exit_code) : null; break;
--
373:          case "stdout": raw = s.stdout; break;
374:          case "host": raw = s.host; break;
375:           case "wallMs": raw = s.wallMs != null ? String(s.wallMs) : null; break;
376:           case "exit_code": raw = s.exit_code != null ? String(s.exit_code) : null; break;

$ grep -nE 'function dispatchOneStep|emitStepUpdate.*step_update' wrapper/orchestrator/orchestrator.ts | head -10
421:          emitStepUpdate(taskId, step.name, "step_update", {
683:async function dispatchOneStep(
747:      emitStepUpdate(taskId, step.name, "step_update", {
760:      emitStepUpdate(taskId, step.name, "step_update", {
780:    emitStepUpdate(taskId, step.name, "step_update", {

$ grep -nE 'realStepCount \+= waveCompletedCount|waveCompletedCount \+=' wrapper/orchestrator/orchestrator.ts | head -3
418:          if (stepCompleted) waveCompletedCount += 1;
427:      realStepCount += waveCompletedCount;

$ grep -c 'MAX_CONCURRENT' wrapper/orchestrator/orchestrator.ts
0  # 0 matches — M1.0 无此 env var, M1.1 加

$ grep -nE 'PlanStepStatus' wrapper/orchestrator/types.ts | head -3
488:  steps?: PlanStepStatus[];
497:export interface PlanStepStatus {
500:  status: TaskStatus;
```

**Out of scope** (NOT in M1.1):
- `wrapper/orchestrator/orchestrator.ts` dispatchOneStep body (L683-786) — **保留 M1.0 行为**, M1.1 加 skip 标记在 wave loop 外层 (per audit-scope v1.0 §2 I "M1.0 wave 内失败不阻断; M1.1 candidate: skip-dependents")
- `wrapper/server.ts` heartbeat handler (M0.1 实施, 不动)
- `wrapper/orchestrator/pwa_server.ts` heartbeat local short-circuit (M0.1 实施, 不动)
- `deploy/6host-compose.newvps.yml` (M0.1 改, M1.1 无 deploy 改动)
- `wrapper/test/integration/*` (M1 cycle T4 虚构 integration 注释已删, 后续 follow-up 添加真实 integration 测试)

---

## §2 复审重点 (4 必查项 + 3 潜在 finding + 4 不应 FAIL)

### 必查项 (A-D)

**A. `${step.*::status}` wildcard 落地** (`workflow_pack.ts:296-385`, `types.ts:497-508`)

- M1.1 预期改:
  1. `types.ts:500` extend `TaskStatus` union 加 `"skipped"` 字面 (1 enum 字面)
  2. `workflow_pack.ts:349` + `workflow_pack.ts:378` 加 `case "status": raw = s.status; break;` (extractField 5th case, phase 2 explicit + phase 3 wildcard 都生效)
  3. `orch.json:31` aggregate-results input_ref 改 `${step.*::status}` 通配符 (真实 status 流, M0.1 已支持 implicit)
- **保留**: M1.0 4 cases (`stdout` / `host` / `wallMs` / `exit_code`) 不动
- Verification: T6 (新增 wildcard test) `${step.*::status}` 3-step DAG (completed + failed + skipped) → 拼接 3 status 字符串 (`"completed\n---\nfailed\n---\nskipped"`)
- **per v0.6 #3 title-body invariant**: test title 描述 = test 实际断言 (no "verified in integration tests" 占位)

**B. `MAX_CONCURRENT_STEPS_PER_WAVE` env var 落地** (`orchestrator.ts:411-428`)

- M1.1 预期改: 在 module 顶部 (e.g. L62 附近) read `process.env['MAX_CONCURRENT_STEPS_PER_WAVE']`, parse to int (default 0 = unlimited); wave loop 改 `Promise.all(wave.map(...))` 为 chunked `Promise.all(chunk.map(...))`, chunk size = min(MCC, wave.length)
- **保留**: MCC=0 = unlimited (M1.0 行为, 3-step DAG 每波仅 1 step 不触发限制)
- Verification: T_new MCC=1 + 4-step wave → 2 chunks (sequential) 但 wave 内 total dispatched 4 (M1.0 行为是 4 parallel, M1.1 = 2+2 sequential)
- **per v0.6 #3 title-body invariant**: T_new 断言 chunked dispatch 顺序 + emit_step_update 顺序

**C. skip-dependents logic 落地** (`orchestrator.ts:411-428`)

- M1.1 预期改:
  1. **M1.0 行为保留** (T4 旧断言仍 pass): M1.0 wave loop 逐 step try/catch, 同 wave 失败继续, 后续 wave 仍 dispatch
  2. **M1.1 新增** (T6 新断言): 在 wave loop 进入下个 wave 前, 检查上 wave 是否有 step.status === "failed" (或 "skipped"); 若有, mark 所有 depends_on 含该 step 的 step 为 "skipped" (新 emit_step_update), skip dispatchOneStep
  3. **Caveat** (per audit-scope v1.0 §2 A "M1.0 wave 内失败不阻断"): M1.1 skip 只跨 wave 边界触发 (wave 1 失败 → wave 2 跳), wave 内仍全 dispatch
- Verification: T6 4-step DAG (A → B/C → D) B fails → D (depends on B) skipped, **B and C 同 wave 仍全 dispatch** (M1.0 行为) + D skipped (M1.1 新行为)
- **per v0.6 #3 title-body invariant**: T6 标题 "M1.1 skip-dependents" + it block "B fails → D is SKIPPED" 真实断言

**D. aggregate-results `${step.*::status}` end-to-end** (`orch.json:31`, `workflow_pack.ts:296-385`)

- M1.1 预期改: `orch.json:31` aggregate-results input_ref 改 `bash:-c:echo "\${step.*::status}"` (M0.1 已支持 implicit, M1.1 真实使用)
- Verification: dispatch 3-step DAG (spawn-workers OK, dispatch-commands FAIL, aggregate-results skipped) → aggregate-results bash 看到 `"completed\n---\nfailed\n---\nskipped"` (per v0.6 #1 cat-file 真测, 实证命令可粘贴)
- **per v0.6 #3 title-body invariant**: end-to-end 验证真实 step.status 流 (not mocked)

### 潜在新 finding (E-G)

**E. skip cascade 复杂性**: 5+ step fan-out DAG (A → B/C → D, D → E) B fails → D skipped, E skipped (transitive). M1.1 需 BFS/DFS 标记 transitive upstream-failed steps. Verification: T_extra 5-step fan-out DAG transitive skip.

**F. MAX_CONCURRENT=0 边界**: env var 缺失 or 空 string or "0" or 负数 → 行为? M1.1 default unlimited (M1.0 行为). Verification: T_extra 各种 invalid env var → unlimited.

**G. status enum 扩展兼容**: M1.0 emitStepUpdate 用 `"failed"` (per `commander._recordStepFailure`). M1.1 加 `"skipped"` (per skip-dependents). Verification: T_extra dispatchOneStep 在 skip path emit `"skipped"` 而非 `"failed"`.

### 不应再 FAIL 的项 (H-K)

**(H)** v0.6 hard rule 3 约束 (per ADR 0013) — 起草 + 修订 + 实施 commit 全周期套用 (M1.1 是 v0.6 hard rule 落地后**第一个** cycle, 验证机制有效)
**(I)** F10→F15→R3→T1 同型复发曲线 — M1.1 scope 起草严格按 v0.6 3 硬约束 (cat-file 实测, 列源豁免, title-body invariant), 不再经历 self-audit failure
**(J)** v1.2.0n M1 forward scope (per `notes/v1.2.0n-m1-cycle-closure.md` §"Forward scope (deferred)") — M1.1 直接吸收 items 1-3 (status wildcard + MCC + skip), M1 cycle closure §"M1.1 cycle CLOSED" 铺垫
**(K)** v1.0 runtime immutability (per ADR 0010 Decision d) — M1.1 改 `wrapper/orchestrator/workflow_pack.ts` + `orchestrator.ts` + `types.ts` + `orch.json` (M1.1 forward scope 文档) + tests, **不触** `harness/` + `spec/` + `spikes/`

---

## §3 Findings 覆盖矩阵 (12 行 — per v0.6 #1 cat-file + #2 列源 + #3 grep -n)

| # | 类别 | 风险 | 验证方式 (per v0.6 #1 cat-file, 实证命令可粘贴) | 期望 |
|---|------|------|------------------------------------------|-------|
| 1 | Correctness | `${step.*::status}` 通配符不工作 (workflow_pack.ts case 缺) | 单测 T6 new: mock 3 step tracker (completed/failed/skipped status) → expandStepTemplate(`${step.*::status}`) → bash sees 3 status 拼接 | bash sees `"completed\n---\nfailed\n---\nskipped"` |
| 2 | Correctness | extractField 5 cases 同步 (phase 2 explicit + phase 3 wildcard) | 单测 T_explicit: 显式 `${step::spawn-workers::status}` 应 resolve to `"completed"` | resolve to "completed" |
| 3 | Correctness | TaskStatus union 加 `"skipped"` 不破坏现有 5 状态 | 单测 T_enum: cast "skipped" to TaskStatus + parse DispatchResponse status field | TS 编译 pass, no type error |
| 4 | Correctness | skip-dependents BFS transitive (5-step fan-out) | 单测 T_skip_5: A → B/C → D, D → E; B fails → D skipped (depends on B), E skipped (depends on D) | D + E both skipped, A + B + C dispatched |
| 5 | Correctness | MAX_CONCURRENT chunked dispatch | 单测 T_mcc: MCC=1 + 4-step wave → chunked 1+1+1+1 sequential, but each chunk in single emit_step_update; MCC=0 → M1.0 behavior (4 parallel) | dispatch order matches chunked |
| 6 | Correctness | skip emit_step_update payload | 单测 T_skip_emit: verify emit_step_update called with `{status: "skipped", ...}` after skip path | payload contains "skipped" |
| 7 | Hygiene | L8 secrets (M1.1 commit 范围, 正确 git 语法) | `git --no-pager diff M1.1_commit^ M1.1_commit -U0 \| grep -cE 'sk-[a-zA-Z0-9]{8,}\|...'` | 0 真密钥 (列源豁免: 自引 + sk-placeholder-edge{2,3}) |
| 8 | Hygiene | L19 tag → commit 1 SHA (M1.1 → v1.2.0n.2 → 本 commit) | `git rev-parse v1.2.0n.2^{commit}` | = M1.1 commit SHA |
| 9 | Hygiene | v1.0 runtime immutability (M1.1 commit 范围) | `git --no-pager diff v1.2.0n.1^ M1.1_commit -- harness/server.py spec/ kernel-schema.sql \| wc -l` | 0 (M1.1 不触 v1.0 frozen runtime) |
| 10 | Build | tsc clean | `cd wrapper && ./node_modules/.bin/tsc --noEmit` | exit 0 |
| 11 | Test | full vitest | `cd wrapper && ./node_modules/.bin/vitest run` | 274+ PASS / 0 FAIL (M1.0 baseline 272 + M1.1 新增 3+ tests) |
| 12 | Test | title-body invariant (per v0.6 #3 硬约束) | grep `^\s*it\(` 全文件 → 每 `it` title 与 body 断言一致; 不允许 "verified in integration tests" 占位引用 | 0 title-body mismatch |

---

## §4 复验命令 (Cline 可直接跑, per v0.6 #1 cat-file + #2 列源 + #3 grep -n)

```bash
cd /Users/kjonekong/projects/fish-harness

# 1. Type check (per [[fish-harness-project]] §5.3 — must use local bin)
cd wrapper && ./node_modules/.bin/tsc --noEmit
cd ..

# 2. Full test suite (含 M1.1 新增 3+ tests)
cd wrapper && ./node_modules/.bin/vitest run 2>&1 | tail -10
cd ..

# 3. L8 secrets (M1.1 commit 范围, 正确 git 语法 — 全局选项置于子命令前)
git --no-pager diff v1.2.0n.1^ M1.1_commit -U0 | grep -cE 'sk-[a-zA-Z0-9]{8,}|api[_-]key|SECRET|TOKEN|PASSWORD'
# 期望: 0 真密钥 (列源豁免按 v0.6 #2: 自引 cat-file 命令文本 + sk-placeholder-edge{2,3} 占位)

# 4. L19 tag lock (per L19: tag → commit 1 SHA)
git rev-parse v1.2.0n.2^{commit}
# 期望 = M1.1 commit SHA

# 5. v1.0 runtime immutability (per ADR 0010 Decision d)
git --no-pager diff v1.2.0n.1^ M1.1_commit -- harness/server.py spec/ kernel-schema.sql | wc -l
# 期望 0 (M1.1 不触 v1.0 frozen runtime)

# 6. extractField case 检查 (v0.6 #3 file:line grep)
grep -nE 'case "stdout"|case "host"|case "wallMs"|case "exit_code"|case "status"' wrapper/orchestrator/workflow_pack.ts | head -10
# 期望: 5 cases × 2 (phase 2 + phase 3) = 10 matches

# 7. TaskStatus union 检查 (v0.6 #3 grep)
grep -nE 'TaskStatus.*="skipped"|"pending" \| "running" \| "completed" \| "failed" \| "cancelled" \| "skipped"' wrapper/orchestrator/types.ts | head -5
# 期望: union 含 "skipped"

# 8. MAX_CONCURRENT env var 读取 (v0.6 #3 grep)
grep -nE "process\.env\['MAX_CONCURRENT_STEPS_PER_WAVE'\]|MAX_CONCURRENT_STEPS_PER_WAVE" wrapper/orchestrator/orchestrator.ts | head -5
# 期望: 至少 1 个 match (env var read 落地)

# 9. skip-dependents logic (v0.6 #3 grep — emit "skipped" status)
grep -nE '"skipped"' wrapper/orchestrator/orchestrator.ts wrapper/orchestrator/types.ts | head -5
# 期望: orchestrator.ts emit skip path; types.ts TaskStatus union

# 10. aggregate-results ${step.*::status} (v0.6 #3 grep)
grep -nE 'step\.\*::status|step\.\*::field' workflow_packs/orch.json | head -3
# 期望: orch.json 含 ${step.*::status}

# 11. heartbeat_sender env (M1.1 不改, verify 未动)
grep -n 'WORKER_HEARTBEAT_URL' wrapper/orchestrator/heartbeat_sender.ts | head -3
# 期望: L81-82 早退守卫 (同 v1.2.0n M0.1)

# 12. title-body invariant 检查 (v0.6 #3 强约束, 自检)
grep -nE 'verified in integration tests|placeholder|refer to integration' wrapper/test/unit/orchestrator_dispatch_wave.test.ts wrapper/test/unit/workflow_pack_wildcard.test.ts
# 期望: 0 matches (T1 cycle T4 虚构 integration 注释已删)
```

---

## §5 Cline prompt 模板 (per v0.6 #1-#3 硬约束)

```
You are reviewing v1.2.0n M1.1 (${step.*::status} wildcard +
MAX_CONCURRENT_STEPS_PER_WAVE + skip-dependents) pre-implementation.

This is a pre-implementation audit scope — no code has been written yet.
Your job is to confirm/refute the design assumptions in §2 (必查项 A-D)
before implementation starts. Per v0.6 #1-#3 硬约束 (per ADR 0013):
- #1: 实证命令 must be paste-runnable (--no-pager BEFORE diff subcommand)
- #2: 自检 ✅ 必 cat-file 输出 verbatim (L8 grep 命中须逐条列源, 禁裸报 "0")
- #3: file:line 必 grep -n 输出 verbatim

Files to change (6, per §1 表):
1. wrapper/orchestrator/workflow_pack.ts (+2) — add `case "status"` in 2 places
2. wrapper/orchestrator/orchestrator.ts (+~30) — read MCC env var + skip-dependents logic
3. wrapper/orchestrator/types.ts (+1) — TaskStatus union extend "skipped"
4. workflow_packs/orch.json (0 or 1) — aggregate-results input_ref改 ${step.*::status}
5. wrapper/test/unit/orchestrator_dispatch_wave.test.ts (+~20) — new T6 skip test
6. wrapper/test/unit/workflow_pack_wildcard.test.ts (+~40) — new T6/T7 status tests

Read this audit scope: notes/cline-audit-scope-v1.2.0n-m1.1-preimplement.md
For each §2 必查项 A-D, confirm or refute. For 潜在 E-G, check scope-appropriateness.

Run §4 verification commands yourself. Report findings as numbered list:
- File:line
- Severity (critical / major / minor)
- Description
- Suggested fix (or "no fix needed" if you confirm it's OK)

Pass criteria: 0 critical, 0 major, ≤ 2 minor (sanity polish only).

DO NOT modify any code. Read-only design review.
```

---

## §6 沉淀机制

- 审验结果落 `notes/cline-review-v1.2.0n-m1.1-preimplement-report.md` (per §5 报告格式)
- 若有 critical/major finding, 用户裁断是否修订 scope 后再实施
- 若全 pass, 进入实施: 6 file commits + version bump 1.2.0+0.n.1 → 1.2.0+0.n.2 + tag **v1.2.0n.2** → push via Clash proxy
- 实施后, 让 Cline 跑 **audit-trail 二审** (per v0.6 流程纪律): 审实施 commit cat-file + §修订元数据表 + tag 锁定 + deploy 可行性 → 二审 PASS → cycle ✅ CLOSED
- Forward scope (M1.2): PWA fan-out DAG E2E + edge1 + MINIMAX rotation (USER OOB)

---

## §7 v0.5 + v0.6 hard rule 自检 (起草时落地证据 — per v0.6 #1-#4 硬约束)

| # | 规则 | 落地 | 证据 (cat-file verbatim, per v0.6 #1) |
|---|------|------|----------------------------------|
| v0.5 (a) | 先行起草 | ✅ | 本文件 `notes/cline-audit-scope-v1.2.0n-m1.1-preimplement.md` 在实施 commit 之前起草 (per 新流程纪律 "归档 → Cline 审 → deploy" v1.2.0n M0.1 立) |
| v0.5 (b) | commit 后立即复审 | (⏳ 实施后跑 tsc + vitest + L8 + L19 + immutability) | — |
| v0.5 (c) | 自引入不入 tracked | ✅ | notes/ 自伤豁免域 (per v1.2.0l followup §1.5 #50); 本 scope cat-file 命令字面 + sk-placeholder-edge{2,3} 占位符 全列源豁免 |
| v0.5 (d) | commit message 附实测数 | (⏳ 实施 commit message 含 cat-file 实测) | — |
| v0.5 (e) | 引用式纪律 | ✅ | §1 主表是唯一权威源 + §3 矩阵 12 行 §修订元数据表 |
| **v0.6 #1** | 实证命令可粘贴运行 | ✅ | §4 命令 12 条全部 `--no-pager diff` 全局选项前置; §1 实测证据块 6 段 grep 输出 verbatim |
| **v0.6 #2** | 自检 ✅ 必 cat-file 输出 verbatim | ✅ | §1 + §3 + §7 cat-file 实证段共 12 段 grep -c/-n 输出 verbatim; 禁止"声明做了 grep" |
| **v0.6 #3** | file:line 必 grep -n 输出 verbatim | ✅ | §1 主表 + §2 必查项 + §3 矩阵 全部 file:line 都附 `grep -nE` 命令 + 实测输出 (L296-385 / L316-317 / L345-348 / L373-376 / L421/L683/L747/L760/L780 / L418/L427) |
| **v0.6 #4** | 修订 commit 必同步 §元数据表 | (⏳ 实施 commit + 修订 commit 必含 §修订元数据表, 含 Cline 7/5/6 + 本 scope 新 findings 处置) | — |

**机制补丁验证** (per v0.6 硬约束 rule, 自检): 本 scope 严格按 v0.6 #1-#3 起草 — cat-file 实测真值 (不是凭印象), 列源豁免已标注 (closure self-injury + sk-placeholder-edge{2,3} 占位符), 测试标题 = 测试断言 body (无 "verified in integration tests" 占位引用)。**M1.1 是 v0.6 hard rule 落地后第一个 cycle**, 验证机制有效 (防止 4 次同型复发曲线复发)。

---

## §8 v1.2.0n M1.1 草案元数据 (per v0.6 #4 — 起草来源)

| 字段 | 内容 | 来源 |
|------|------|------|
| Cycle | v1.2.0n M1.1 | per [[fish-harness-v1-2-0n-m1-cycle-closure]] §"Forward scope (deferred)" items 1-3 |
| Feature flip | `${step.*::status}` wildcard + `MAX_CONCURRENT_STEPS_PER_WAVE` + skip-dependents | per [[fish-harness-v1-2-0n-m1-cycle-closure]] §"Forward scope (deferred)" |
| Tag | v1.2.0n.2 | next feature flip after v1.2.0n.1 (M1 tag) |
| Pre-implementation audit | 本文件 (2026-09-17 起草) | per 新流程纪律 "归档 → Cline 审 → deploy" + v0.6 硬约束 (per ADR 0013) |
| v0.6 hard rule 落地 | §7 自检 + 全文 cat-file 实测 + 列源豁免 + title-body invariant | per ADR 0013 (commit `af7d1cd` 2026-09-17) |
| v1.3 fix-forward 沉淀 | skip 跨 wave 边界触发 (caveat per audit-scope v1.0 §2 A "M1.0 wave 内失败不阻断; M1.1 candidate: skip-dependents") | per `notes/v1.2.0n-m1-cycle-closure.md` Cline 二审 R1 fix |
| 跟 M1 cycle 关系 | M1.1 吸收 M1 cycle forward scope items 1-3 (status + MCC + skip); M1 cycle closure §"M1.1 cycle CLOSED" 铺垫 | per [[fish-harness-v1-2-0n-m1-cycle-closure]] |

---

## §9 Cross-ref

**注**: 下列 wikilink 指向 Claude memory vault (`~/.claude/projects/-Users-kjonekong/memory/`), 不在 repo 内解析。

- [[fish-harness-v1-2-0n-cycle-closure]] — v1.2.0n M0.1 cycle CLOSED (M1 predecessor, v0.6 4 候选沉淀)
- [[fish-harness-v1-2-0n-m1-cycle-closure]] — v1.2.0n M1 cycle CLOSED (4 轮 Cline audit-trail, 18 findings, v0.6 升级 3 硬约束沉淀)
- [[fish-harness-auto-commit-push]] — auto commit/push via Clash proxy (M1.1 沿用)
- [[fish-harness-newvps-host-alias]] — `ssh newvps` ≠ `ssh puer-hk` 铁律 (M1.1 deploy step)
- ADR 0010 (v1.1+ cycle scope admission)
- ADR 0012 (v1.2k D3 lock lift — 最近 v1.2k ADR)
- **ADR 0013 (v0.6 audit-trail hygiene hard rule, 2026-09-17, just committed `af7d1cd`)** — M1.1 起草严格按 v0.6 3 硬约束
- In-repo: `notes/v1.2.0n-m1-cycle-closure.md` (M1 cycle closure, committed in `2e5268f` + v1.3 fix-forward `e72f3b0` + memory update `f7b66f6`)
- In-repo: `notes/cline-audit-scope-v1.2.0n-m1-preimplement.md` (M1 audit-scope, committed in `398122a` + v1.1 `5912ddb` + v1.2 `3e894db`) — M1.1 起草参照 v1.2 format

## v1.0 Status Footer

**v1.0 Status: Excluded from GA** — 2026-09-02

ADR 0013 是 v1.2.0n M1.1 cycle 起草前置. 本 scope 不属于 v1.0 GA 合同。
v1.0 GA 9 ADR（0001-0009）+ v1.2k 0012 + v1.2.0n 0013 保持 immutable；引用本文时用 `<scope-v1.2.0n-m1.1-preimplement>` tag.
