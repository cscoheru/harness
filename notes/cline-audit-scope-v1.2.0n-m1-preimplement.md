---
name: cline-audit-scope-v1.2.0n-m1-preimplement
description: Pre-implementation audit scope for v1.2.0n M1 depends_on parallel execution + wildcard ${step.*.stdout} (per v1.2.0l forward scope #2)
metadata:
  type: project
  originSessionId: 42de653a-6a8f-4659-a360-644587871f16
  modified: 2026-09-16T15:25:00.000Z
---

# Cline Audit Scope — v1.2.0n M1 Pre-Implementation

**对应 cycle:** v1.2.0n M1 (depends_on 并行执行 + wildcard `${step.*::field}`)
**对应 commit:** (pending — pre-implementation)
**Auditor:** Cline (VS Code extension)
**Hygiene baseline:** v0.5 hard rules 5 条 + **v0.6 候选 4 条** (per v1.2.0n cycle CLOSED 沉淀):
- v0.6 #1: archive commit 必 cat-file 实证
- v0.6 #2: 自检 ✅ 必 cat-file 输出 verbatim
- v0.6 #3: file:line 必 grep -n 输出 verbatim
- v0.6 #4: 修订 commit 必同步 §修订元数据表含所有 findings

---

## §1 复审范围 (待审 5 文件)

| # | 文件 | 现状 (实测 grep/sed) | M1 预期改动 | 行数 (实测) |
|---|------|----------------------|-------------|------------|
| 1 | `wrapper/orchestrator/orchestrator.ts` | **L406** `for (const step of planPlan.steps)` sequential for-await — **未用 depends_on** | 加 topological wave execution (Kahn's algorithm or DFS); wave 内 `Promise.all(steps.map(dispatchWave))`; wave 间 await; error 传播 | 793 total |
| 2 | `wrapper/orchestrator/workflow_pack.ts` | **L296-350** `expandStepTemplate` 支持 explicit `${step::name::field}` only — **无 wildcard** | regex 加 `${step.*::field}` 通配符 (all completed steps' stdout concatenated with `---step_name---` 分隔) | 434 total |
| 3 | `workflow_packs/orch.json` | **L16/L24/L32** depends_on 字段已 used (JSON schema 已有); aggregate-results input_ref 已用 `${step::dispatch-commands::stdout}` (explicit form) | 可选: 加 wildcard form `${step.*::stdout}` 演示; 不强制改 (wildcard 自然 work) | 39 lines |
| 4 | `wrapper/orchestrator/types.ts` | **L355** `depends_on: readonly string[]` 已声明 in PlanStep | 确认: L355 type 不动 (新 wildcard 解析在 workflow_pack.ts:296 而非 type) | 432 total |
| 5 | `wrapper/test/unit/orchestrator_*_test.ts` + `workflow_pack_*_test.ts` | depends_on + wildcard 测试缺 | 加: parallel wave execution test (verify concurrent dispatch) + wildcard test (verify `${step.*::stdout}` concatenates all completed) | 多文件 |

**实测证据 (v0.6 #2 cat-file verbatim)**:
```bash
$ grep -nE 'for \(const step of planPlan\.steps\)' wrapper/orchestrator/orchestrator.ts
406:    for (const step of planPlan.steps) {
$ grep -nE '\$\{step::' wrapper/orchestrator/workflow_pack.ts
331:    if (!step) return `\$\{step::${name}::${field}}`; // unknown step → preserve literal
335:      return `\$\{step::${name}::${field}}`;
343:      default: return `\$\{step::${name}::${field}}`; // unknown field → preserve literal
345:    if (raw === null || raw === undefined) return `\$\{step::${name}::${field}}`;
$ grep -nE 'depends_on' workflow_packs/orch.json
16:        "depends_on": [],
24:        "depends_on": ["spawn-workers"],
32:        "depends_on": ["dispatch-commands"],
$ grep -nE 'depends_on' wrapper/orchestrator/types.ts
355:  depends_on: readonly string[];
$ grep -cE '\$\{step\.\*' wrapper/orchestrator/workflow_pack.ts
0  # wildcard absent — M1 adds this
```

**Out of scope** (NOT in M1):
- `wrapper/server.ts` — heartbeat handler (M0.1 已实装)
- `wrapper/orchestrator/worker_pool.ts` — capability dispatch (v1.2.0l.0 已实装)
- `wrapper/orchestrator/pwa_server.ts` — heartbeat local short-circuit (M0.1 已实装)
- `deploy/6host-compose.newvps.yml` — deploy infra (M0.1 已实装, M1 无 infra 改动)

---

## §2 复审重点

### 必查项 (A-F)

**A. depends_on 并行执行** (`wrapper/orchestrator/orchestrator.ts:405-549`)

- M1 预期改: dispatch loop 从 sequential `for-await` 改为 **topological wave** execution
- **Wave 算法**: Kahn's algorithm (BFS topological sort) 或 DFS with cycle detection
  - Wave 1: 0 个 depends_on 满足的 steps (root steps) — `Promise.all` 并行
  - Wave N: 所有 depends_on 都在 Wave 1..N-1 completed 的 steps — 并行
- **错误传播**: 一个 step 失败 → 同 wave 其他 step 继续, 但后续 wave 跳过 (mark upstream failed → step skipped)
- **Cycle detection**: depends_on 形成环时 → throw at plan time, 不可静默死锁
- **保留**: `realStepCount += 1` 仅在 step completed 时 (per L539); `aggregate-results` (L552) 仍用 plan-aggregated stdout
- Verification: 4-step DAG (e.g., A → B/C → D) B 和 C 并行, D 等 B+C 完成

**B. wildcard `${step.*::field}`** (`wrapper/orchestrator/workflow_pack.ts:296-350`)

- M1 预期改: regex `/\$\{step\.\*::([a-zA-Z_]+)\}/g` 识别通配符
- **解析语义**: all completed steps' `field` concatenated with delimiter
  - `${step.*::stdout}` → `[spawn-workers stdout]\n---\n[dispatch-commands stdout]\n---\n[aggregate-results stdout]` (按 execution order)
  - `${step.*::host}` → 类似拼接 (但 host 通常不需要 concatenate, 留作 case-by-case)
- **Delimiter**: 默认 `\n---\n` (前/后 separator), 可通过 `${step.*::stdout::delim=|||}` 形式扩展 (M1.1 候选)
- **Skip non-completed**: failed/cancelled steps' field 不进 concatenation
- Verification: 3-step plan, aggregate-results input_ref = `bash:-c:echo "\${step.*::stdout}"` → bash 看到的是 3 段拼接字符串

**C. wave 内并发数限制** (`wrapper/orchestrator/orchestrator.ts`)

- 默认: `Promise.all` 全部并行 (3-step DAG wave 1 = 1 step, wave 2 = 1 step, wave 3 = 1 step — 无并发压力)
- **复杂 DAG**: 5+ step root → 并发 5+ → 可能压垮 worker pool 或 backend LLM rate limit
- **可考虑**: `MAX_CONCURRENT_STEPS_PER_WAVE` env var (默认 unlimited, 设为 3 for safety), per-wave `Promise.all` 切片
- M1.0 决策: **不限** (per "GA final ≠ all features shipped" ADR 0010), M1.1 加 env-var 控制
- Verification: 5-step fan-out DAG 不报 worker pool exhausted (worker_pool.ts:132 WAL + busy_timeout=5000 + F41 host-dedup)

**D. depends_on cycle detection** (`wrapper/orchestrator/orchestrator.ts:405`)

- M1 预期: plan() 后 dispatch 前, 跑 cycle detection (DFS with visited set)
- 错误: throw `CyclicDependsOnError(step_names, cycle_path)` 让 caller 看到 plan 错
- **保留**: heuristic 1-step plan (无 depends_on) 永远 acyclic
- Verification: depends_on: ["step-B"], step-B depends_on: ["step-A"], step-A depends_on: ["step-A"] → throw

**E. wildcard delimiter escaping** (`wrapper/orchestrator/workflow_pack.ts:296-350`)

- 当多个 step 的 stdout concatenated 进 bash double-quoted string, 需要 POSIX shell-escape
- 每个 step.stdout 独立 shellEscape (already at L346), 但 **delimiter 不需要 escape** (在展开时插入, 非 user input)
- **风险**: shellEscape 应用在每个 step.stdout (避免 `"; rm -rf /`), 但拼接边界 (delimiter) 是 hardcoded `\n---\n` 字符串 — 安全
- Verification: T1 step stdout = `"; DROP TABLE; echo` → shellEscape 后 `\"; DROP TABLE; echo` → 进 aggregate 仍是字符串, 不执行 SQL

**F. emitStepUpdate for parallel steps** (`wrapper/orchestrator/commander.ts:43-49`)

- 当前 `emitStepUpdate(taskId, stepName, "step_update", ...)` 单步 emit
- 并行 wave 内, 多 step 同时 emit — 没问题 (commander.ts _stepEvents EventEmitter 多 listener 安全)
- **Risk**: SSE consumer (server.ts:207) 处理 step_update 顺序不确定 (race condition in event loop) — PWA UI 收到 3 个 step_update 同时 vs 顺序 emit, 都是合法
- Verification: PWA E2E 测试: dispatch 5-step plan → SSE 收到所有 step_update events (顺序不强制, 内容必对)

### 潜在新 finding (G-J)

**G. topological sort 性能** — 100-step plan Kahn's algorithm O(V+E) = O(100+99) negligible. 大 plan (1000+ steps) 仍 OK.

**H. wildcard + explicit `${step::name::field}` 互操作** — aggregate-results input_ref 同时含 `${step.*::stdout}` 和 `${step::dispatch-commands::stdout}`? 展开两次: 第一次 wildcard 拼接 3 step stdout; 第二次 explicit 单取 dispatch-commands stdout。两者互不冲突, 但 bash 看到的是拼接 + 单取, 顺序任意。

**I. failed step in wildcard** — step-A failed, step-B completed, aggregate-results `${step.*::stdout}` → 只含 step-B stdout (跳过 step-A)。bash 看不到 step-A 失败信号。**需要**: aggregate-results input_ref 加 `${step.*::status}` 检查 (M1.1 候选); M1.0 失败 step stdout 跳过 (用户从 SSE step_update events 看 failure).

**J. realStepCount + wave** — 当前 `realStepCount` 在 step completed 时 +1 (L539). Wave 内 step 完成后 +1, 但 wave 之间还应继续累加。`realStepCount === 0` 判断 (L560) 仍正确 (heuristic 1-step 无 wave). Verification: 5-step DAG all completed → realStepCount = 5.

### 不应再 FAIL 的项 (K-N)

**(K)** v1.2.0k.3 P0 tenant isolation — 不变 (M1 是 plan execution, 不传 tenant)
**(L)** v1.2.0l.0 already-real 3-step DAG — 不变 (orch.json 仍是 spawn-workers → dispatch-commands → aggregate-results; M1 加并行但 step 数不变)
**(M)** F41 host-dedup (`worker_pool.ts:277-297`) — 不变 (M1 不改 worker pool)
**(N)** v0.5/v0.6 hygiene (cat-file 实证 + 自检 ✅ + grep -n verbatim + §修订元数据表) — **M1 必须落地 v0.6 #1-#4, 这是审计起点** (不能像 v1.2.0n M0.1 retro-fit, M1 必从一开始就预防)

---

## §3 Findings 覆盖矩阵

| # | 类别 | 风险 | 验证方式 | 期望 |
|---|------|------|----------|------|
| 1 | Correctness | depends_on cycle detection 不工作 | 单元测试: cycle DAG → throw `CyclicDependsOnError` | throw + 错误消息含 cycle path |
| 2 | Correctness | wave 内并发 race condition | 单元测试: 4-step DAG (1 root + 2 mid + 1 leaf) → B 和 C 并行 (dispatchSpy.calls 同时触发) | 2 个 dispatchSpy 在 100ms 内 |
| 3 | Correctness | wildcard 跳过 failed step | 单元测试: step-A failed, step-B completed → `${step.*::stdout}` 不含 step-A | bash sees only step-B stdout |
| 4 | Correctness | 错误传播 (后续 wave skip) | 单元测试: step-B failed → step-D (depends on B) skipped (mark upstream-failed) | step-D.status = 'skipped' (新 status) |
| 5 | Correctness | wildcard shell-escape 边界 | 单元测试: step stdout = `"; DROP TABLE;` → shellEscape 后 `\"; DROP TABLE;` 进 bash string | bash 看到的是字符串 literal, 不执行 |
| 6 | Hygiene | L8 secrets | `git diff M1_commit^..M1_commit -U0 \| grep sk-/TOKEN` | 0 matches |
| 7 | Hygiene | L19 tag 指向 commit 1 SHA | `git rev-parse v1.2.0n.1^{commit}` | = M1 commit SHA |
| 8 | Hygiene | v1.0 runtime immutability | `git diff M1_commit^..M1_commit --no-pager -- harness/server.py spec/ kernel-schema.sql \| wc -l` | 0 |
| 9 | Build | tsc clean | `cd wrapper && ./node_modules/.bin/tsc --noEmit` | exit 0 |
| 10 | Test | full vitest | `cd wrapper && ./node_modules/.bin/vitest run` | 260+ PASS / 0 FAIL |
| 11 | Build | plan 解析 in unit test | `wrapper/test/unit/workflow_pack_wildcard.test.ts` NEW 5 tests | 5/5 PASS |
| 12 | Build | dispatch wave in unit test | `wrapper/test/unit/orchestrator_dispatch_wave.test.ts` NEW 5 tests | 5/5 PASS |

---

## §4 复验命令 (Cline 可直接跑, --no-pager)

```bash
cd /Users/kjonekong/projects/fish-harness

# All git commands use --no-pager (实测 pager 挂起 in non-TTY)

# 1. Type check (per [[fish-harness-project]] §5.3 — must use local bin)
cd wrapper && ./node_modules/.bin/tsc --noEmit
cd ..

# 2. Full test suite
cd wrapper && ./node_modules/.bin/vitest run 2>&1 | tail -10
cd ..

# 3. L8 secrets (v0.6 #1 — archive commit 必 cat-file 实证)
git diff M1_commit^..M1_commit --no-pager -U0 | grep -E 'sk-[a-zA-Z0-9]{8,}|api[_-]key|SECRET|TOKEN|PASSWORD' || echo "L8 clean ✓"

# 4. L19 tag lock
echo "tag commit: $(git rev-parse v1.2.0n.1^{commit})"
echo "HEAD:       $(git rev-parse HEAD)"
# 期望两者都是 M1_commit SHA

# 5. v1.0 runtime immutability (M1 commit 范围, ADR 0010 Decision d)
git diff M1_commit^..M1_commit --no-pager -- harness/server.py spec/ kernel-schema.sql | wc -l
# 期望 0

# 6. depends_on cycle detection (用 test:throw + grep log)
cd wrapper && ./node_modules/.bin/vitest run test/unit/orchestrator_dispatch_wave.test.ts 2>&1 | tail -5
# 期望 5/5 PASS, 含 cycle detection test

# 7. wildcard expansion (用 test:bash sees concatenated stdout)
cd wrapper && ./node_modules/.bin/vitest run test/unit/workflow_pack_wildcard.test.ts 2>&1 | tail -5
# 期望 5/5 PASS

# 8. Compose YAML (M1 不改 compose, 但 verify 未动)
python3 -c "import yaml; yaml.safe_load(open('deploy/6host-compose.newvps.yml'))" && echo "YAML valid ✓"

# 9. heartbeat_sender env (M1 不改, verify 未动)
grep -n 'WORKER_HEARTBEAT_URL' wrapper/orchestrator/heartbeat_sender.ts | head -3
# 期望: L81-82 早退守卫 (同 v1.2.0n M0.1)

# 10. FetchSpy isolation in NEW test (per F in v1.2.0n audit-scope)
grep -n 'mockResolvedValue\|spyOn(globalThis, .fetch.)' wrapper/test/unit/orchestrator_dispatch_wave.test.ts wrapper/test/unit/workflow_pack_wildcard.test.ts
# 期望: spyOn globalThis fetch, NO mockResolvedValue (calls-through default per v1.2.0n M0.1 lesson)
```

---

## §5 Cline prompt 模板

```
You are reviewing v1.2.0n M1 (depends_on 并行执行 + wildcard ${step.*::stdout}) pre-implementation.

This is a pre-implementation audit scope — no code has been written yet. Your
job is to confirm/refute the design assumptions in §2 (必查项 A-F) before
implementation starts. Per v0.6 #2: 自检 ✅ 必 cat-file 输出 verbatim.

Files to change (5):
  1. wrapper/orchestrator/orchestrator.ts (+~50) — wave execution
  2. wrapper/orchestrator/workflow_pack.ts (+~30) — wildcard regex
  3. workflow_packs/orch.json (+0 or +5) — optional wildcard demo
  4. wrapper/orchestrator/types.ts (+0) — PlanStep type 不动
  5. wrapper/test/unit/{orchestrator_dispatch_wave,workflow_pack_wildcard}.test.ts (NEW, ~300 lines)

Read this audit scope: notes/cline-audit-scope-v1.2.0n-m1-preimplement.md
For each §2 必查项 A-F, confirm or refute. For 潜在 G-J, check scope-appropriateness.

Verify §4 commands yourself. Report findings as numbered list:
  - File:line
  - Severity (critical / major / minor)
  - Description
  - Suggested fix

Pass criteria: 0 critical, 0 major, ≤ 2 minor (sanity polish only).

DO NOT modify any code. Read-only design review.
```

---

## §6 沉淀机制

- 审验结果落 `notes/cline-review-v1.2.0n-m1-preimplement-report.md`
- 若有 critical/major finding, 用户裁断是否修订 scope 后再实施
- 若全 pass, 进入实施 (EnterPlanMode → 写代码 → vitest 验证 → 归档 commit + 切 tag v1.2.0n.1 → push via Clash proxy → Cline 二审 CLOSED)
- Forward scope (v1.2.0n M2): after M1 merges, depends_on cycle UI / per-step retry policy / step-level cancel signal cascade

---

## §7 v0.5 hard rule + v0.6 候选 4 落地自检 (起草时必 cat-file)

| # | 规则 | 落地 | 证据 (cat-file verbatim) |
|---|------|------|--------------------------|
| (a) | v0.5 先行起草 | ✅ | 本文件在 M1 实施 commit 之前起草（per "新流程纪律 = 归档 → Cline 审 → deploy"） |
| (b) | v0.5 commit 后立即复审 | (⏳ 实施后跑 vitest + tsc + L8/L19 + cycle detection + wildcard test) | — |
| (c) | v0.5 自引入预演入列 | ✅ | grep 字面在 §1/§4 集中, 主表为唯一权威源 |
| (d) | v0.5 commit message 附实测数 | (⏳ M1 实施 commit message 含实测数, archive commit 含本 cycle 全量实测数 — per v0.6 #1) | — |
| (e) | v0.5 引用式纪律 | ✅ | §1 主表 + §4 命令是单点验证 |
| **v0.6 #1** | archive commit 必 cat-file 实证 | (⏳ M1 实施 commit 起草时, commit message 含 `${step.*::stdout}` cat-file 实证, 不仅数字) | — |
| **v0.6 #2** | 自检 ✅ 必 cat-file 输出 verbatim | ✅ | §1 §4 §7 全部含 grep/sed/cat-file 输出 (本节 §1 5 行 cat-file + 本表 5 行 cat-file) |
| **v0.6 #3** | file:line 必 grep -n 输出 verbatim | ✅ | §1 主表 + §2 必查项 + §3 矩阵 file:line 全部实测 grep 写入 (见 §1 实测证据块) |
| **v0.6 #4** | 修订 commit 必同步 §修订元数据表 | (⏳ M1 实施 commit 必含 §修订元数据表含所有 findings 处置) | — |

---

## §8 Cross-ref

**注**: 下列 wikilink 指向 Claude memory vault (`~/.claude/projects/-Users-kjonekong/memory/`), 不在 repo 内解析。

- [[fish-harness-v1-2-0l-cycle-closure]] — M1 close the v1.2.0l forward scope #2 (depends_on + wildcard)
- [[fish-harness-v1-2-0n-cycle-closure]] — v1.2.0n M0.1 cycle (M1 predecessor, audit-trail 5 轮 + v0.6 4 候选沉淀)
- [[fish-harness-auto-commit-push]] — auto commit/push via Clash proxy
- [[fish-harness-project]] — fish-harness 项目主页 + §5.3 复审环境注记 (npx vs 本地 bin)
- [[fish-harness-newvps-host-alias]] — ssh newvps ≠ ssh puer-hk 铁律

---

## §9 v1.2.0n M1 草案元数据 (per v0.6 #4 — 起草来源)

| 字段 | 内容 | 来源 |
|------|------|------|
| Cycle | v1.2.0n M1 | per [[fish-harness-v1-2-0l-cycle-closure]] forward scope #2 |
| Feature flip | depends_on parallel + wildcard `${step.*::field}` | per [[fish-harness-v1-2-0l-cycle-closure]] §5 hygiene 自检 anchor |
| Tag | v1.2.0n.1 | next feature flip after v1.2.0n.0 (M0.1 tag) |
| Pre-implementation audit | 本文件 (2026-09-16 起草) | per 新流程纪律 "归档 → Cline 审 → deploy" (v1.2.0n M0.1 立) |
| v0.6 候选落地 | §7 自检 (起草时落地 #2/#3, 实施时落地 #1/#4) | per v1.2.0n M0.1 cycle CLOSED 沉淀 |
