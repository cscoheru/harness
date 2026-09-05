# v1.2.0d.1 quick-fix — M-class #3 oom_prevention.test.ts test logic 修复

> **Trigger**: v1.2.0d cycle closed @ eff9da8 (tag on GitHub). Post-cycle 真机 E2E 暴露 1 failing test
> in `wrapper/test/integration/oom_prevention.test.ts:78` "reclaim round-trip drains 1000-task burst
> without memory growth" — `expect(reclaimed).toBe(0)` 但 impl 正确返回 `5`。
>
> **Scope**: 1 file (`wrapper/test/integration/oom_prevention.test.ts`), 1 `it()` body rewrite.
> **No production code change**。0 impl 漂移,0 env flag,0 new dep。
>
> **Cycle 类型**: quick-fix sub-cycle (per plan §6 模板)。不 amend closed v1.2.0d cycle。
> **Codex review**: 用户亲提 `codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.2.0d.1-v0.1-prompt.md`

---

## §1 Context

### 1.1 实际语义 vs 测试期望 (impl 是对的)

| 步骤 | impl 实际行为 | 原测试期望 | 一致? |
|------|-------------|-----------|-------|
| 1000 enqueues (maxInFlight=5) | 前 5: in-memory push + SQLite `INSERT pending` (5 rows status='pending'); 后 995: throttled, NOTHING written | comment "0 SQLite pending (throttled returns early)" | ❌ comment 错 |
| 5 dequeues | `markDispatched` (NOT completed) — still 5 rows status='dispatched' | "drain all in-memory" | ✓ |
| reclaim() | `WHERE status != 'completed'` → 找到 5 dispatched → re-push 进 in-memory → returns **5** | `expect(reclaimed).toBe(0)` | ❌ **FAIL** |

### 1.2 Root cause

`queue_store.dequeue()` 故意 mark 'dispatched' (NOT 'completed') —— 这是 crash recovery 路径的设计:
dequeued-but-not-completed 的 task 在 wrapper crash 后必须能被 reclaim 捞回重 dispatch。
若 mark 'completed',crash 恢复时会丢任务 (M-class 隐患)。

Test author 误以为 enqueue → SQLite 是 0 rows (comment 错),并误以为 reclaim 应返回 0 (assertion 错)。

### 1.3 Fix 方向 (推荐)

**Test-only fix** (impl 不动):
1. Rename it() → "reclaim recovers dispatched-but-not-completed tasks after in-memory drain (crash recovery)"
2. Rewrite comments 反映实际语义
3. Update assertions: `reclaimed === 5`, `inFlightCount === 5`,加 `pendingCount === 5` 验证 SQLite 一致性

```typescript
// 期望 fix 后:
expect(reclaimed).toBe(5);                   // 5 originally accepted → 5 dispatched → 5 re-pushed
expect(store.inFlightCount()).toBe(5);       // reclaim re-pushed them
expect(store.pendingCount()).toBe(0);        // reclaim moved them from pending/dispatched → in-memory (still dispatched in SQLite)
```

注:`pendingCount()` 只数 `status='pending'`,不数 `dispatched`。所以 reclaim 后 pendingCount=0 (它们都是 dispatched,被 reclaim re-push 但 SQLite 状态保持 dispatched)。

---

## §2 File 改动清单 (1 file)

| # | 文件 | 操作 | 行 |
|---|------|------|-----|
| 1 | `wrapper/test/integration/oom_prevention.test.ts` | Edit (it() body rewrite) | L63-80 |

**Diff estimate**: 12 insertions / 7 deletions (1 file)。

**不动的文件**:
- `wrapper/orchestrator/queue_store.ts` (impl 是对的)
- `wrapper/orchestrator/orchestrator.ts` (dispatch path 不变)
- `deploy/*.yml` (docker limits 不变)
- 0 production code touched

---

## §3 Codex 期望输出 (formal review)

| 维度 | 期望 |
|------|------|
| §3.1 Correctness | `expect(reclaimed).toBe(5)` 准确反映 impl 语义 (crash recovery 路径) |
| §3.2 Consistency | 与 test 1 + test 4 行为对齐 (test 1: 5 accepted / 995 throttled; test 4: pendingCount=5 after enqueue) |
| §3.3 Hygiene | 0 production code 漂移, 0 new dep, 0 new env flag |
| §3.4 Documentation | test name + comments 让 reader 立刻理解 crash recovery invariant |
| §3.5 Forward-looking | 记录 M-class #3 lesson: test author 必须先读 impl, 再写 assertion; 不能 comment-driven 写 test |

**预期 0C/0M/0m** (1 file fix,无 impl 漂移)。

---

## §4 验证清单 (Codex 复审 + post-fix 真机 E2E)

```bash
# 1. Hygiene 自检 (per §3 Codex 期望)
git diff --stat wrapper/test/integration/oom_prevention.test.ts
# 期望: 1 file changed, 12 insertions(+), 7 deletions(-)

grep -rE "TODO\(M1\)|Fable 5|GLM 5.3|MiniMax-M3|sk-[a-z0-9]{32,}" wrapper/orchestrator/ wrapper/test/integration/oom_prevention.test.ts | wc -l
# 期望: 0

# 2. 双 gate (per U2 模板)
ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc --noEmit'  # exit 0
ssh newvps 'cd /opt/fish-harness/wrapper && unset DEEPSEEK_API_KEY; export RUN_OOM_PREVENTION_E2E=1; ./node_modules/.bin/vitest run test/integration/oom_prevention.test.ts'  # 4/4 PASS

# 3. Full gated suite (per U4 模板,9 flag)
ssh newvps 'cd /opt/fish-harness/wrapper && unset DEEPSEEK_API_KEY; export RUN_QUEUE_BACKPRESSURE_E2E=1 RUN_OOM_PREVENTION_E2E=1 RUN_WORKER_POOL_E2E=1 RUN_SERVER_HEARTBEAT_E2E=1 RUN_ORCH_COMMANDER_E2E=1 RUN_PACK_PLAN_E2E=1 RUN_CROSS_HOST_E2E=1 RUN_HOST_FENCING_E2E=1 RUN_MACBOOK_E2E=1; ./node_modules/.bin/vitest run'  # 295/295 PASS (was 294/295)

# 4. Tracked anchored (per v0.7 hygiene)
# post-v1.2.0d.1 = 116 (维持,不动 spec/harness/9 ADR/Dockerfile)
# disk verbatim = 128 (维持)
```

---

## §5 M-bug class 复盘 (forward looking)

| Cycle | M-bug 表现 | 类型 | 修法 |
|-------|-----------|------|------|
| v1.2.0b | ms / 秒混列陷阱 (register/drain 秒 vs heart 心 ms) | impl | column-unit contract 8bef884 fix |
| v1.2.0c | disk verbatim 走样 (audit-scope §5 引用式 + 自伤源实测校准) | audit-scope | BRE `\|` 反斜杠块复制 |
| **v1.2.0d** | **cc-ready PASS 翻牌超前于实测 + test logic 错** | **impl + test** | **本轮 quick-fix + 真机 E2E 暴露 (本次)** |

**结构性修法 (已在 v1.2.0d cycle closure memory 记档)**:
- cc-ready.json 翻牌脚本必须依赖双 gate 实测 stdout 子串 (如 `> tsc exit 0` + `> vitest "Tests \d+ passed"`)
- 真机 E2E 必须在每 sub-cycle 跑 (`vitest run` with all gated flags) 而非 unit test alone
- Test author 必须先读 impl + 再写 assertion (not comment-driven)

**v1.2.0d.1 additional lesson**: Codex 6M formal review 0C/6M/5m PASS 但漏抓 test logic —— formal review 重点在 impl + audit-scope,test assertion drift 需靠真机 vitest 实测才能 catch。

---

## §6 user EXEC (per §7 模板, 3 项 = U1-U3)

| # | 步骤 | user 命令 | 预期 |
|---|------|-----------|------|
| **U1** | TypeScript build | `ssh newvps "cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc --noEmit"` | exit 0 |
| **U2** | 双 gate vitest (full gated 9 flag) | `ssh newvps "cd /opt/fish-harness/wrapper && unset DEEPSEEK_API_KEY; export RUN_QUEUE_BACKPRESSURE_E2E=1 RUN_OOM_PREVENTION_E2E=1 RUN_WORKER_POOL_E2E=1 RUN_SERVER_HEARTBEAT_E2E=1 RUN_ORCH_COMMANDER_E2E=1 RUN_PACK_PLAN_E2E=1 RUN_CROSS_HOST_E2E=1 RUN_HOST_FENCING_E2E=1 RUN_MACBOOK_E2E=1; ./node_modules/.bin/vitest run"` | 295/295 PASS |
| **U3** | Codex formal 复审 + tag | `codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.2.0d.1-v0.1-prompt.md` → 预期 0C/0M/0m → `git tag -a v1.2.0d.1 <closure-commit> -m "v1.2.0d.1: oom_prevention.test.ts reclaim test logic 修复 (M-class #3 quick-fix)" && git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.2.0d.1` | tag 落地 (Claude 可代劳 push per 修订 Codex 提交铁律 2026-09-05) |

---

## §7 Plan self-check

- [x] §1.1 实际语义 vs 测试期望表 (impl 是对的,test 错)
- [x] §1.2 Root cause (dequeue marks dispatched 是 crash recovery 设计,不是 bug)
- [x] §1.3 Fix 方向 (test-only)
- [x] §2 File 改动清单 (1 file, ~12 lines diff)
- [x] §3 Codex 期望输出 (5 维度)
- [x] §4 验证清单 (双 gate + full gated + tracked anchored)
- [x] §5 M-bug class 复盘 (3 cycle 横向对比)
- [x] §6 user EXEC 3 项 (U1-U3, 比 v1.2.0d U1-U7 简)
- [x] §7 Plan self-check

---

*Plan 校准完成 (v1.2.0d.1, 2026-09-05 v1.2.0d post-cycle 真机 E2E 暴露后启动) — M-class #3 修复 + 0 impl 漂移 + 1 file / 12 lines。等 user Codex formal review (U3) 批准后启动 commit 2 (簿记) + tag。*
