---
name: cline-review-v1.2.0n-m1-preimplement-report
description: M1 pre-implementation audit-scope review (commit 398122a) — CONDITIONAL 1 major (v0.6 ✅ 虚标/行数未实跑) + 4 minor; fix scope before implementation
metadata:
  type: project
  originSessionId: 42de653a-6a8f-4659-a360-644587871f16
  modified: 2026-09-16T16:10:00.000Z
---

# Cline Review — v1.2.0n M1 Pre-Implementation Audit Scope (commit 398122a)

**对象**: `406aeff`(closure v1.5, F15-F18 修复)+ `398122a`(M1 audit-scope 278 行归档)。tag 仍 v1.2.0n.0→5faffea ✓(scope 归档非 feature flip,正确不打 tag);工作区 clean ✓;notes-only ✓。

## §0 Verdict

**CONDITIONAL — 修订 scope 后放行实施。** 1 major + 4 minor(判据 0C/0M/≤2m 未过)。
设计本身健全(A-F 选题准、锚点大半实测吻合、⏳ 诚实标记待实施项、--no-pager/vault 注记/§9 元数据全落地);
major 集中在"实测"标签的证据保真——v0.6 #2/#3 在 §7 标 ✅ 但复现失败,是 F10/F15 同模式复发。
修复成本极低(一个 notes fix-forward),**必须在实施开始前修**(本文件是 M1 审计基线,基线的"实测"不可靠则 v0.6 机制在 t=0 即失效)。

## §1 406aeff (closure v1.5) — ✅ 全过

F15(计数 8→4 + 溯源 3 commits)、F16(M0.2→✅ 附 "33 stale failures" 实据,撤误挂)、F17(落地 5 项纠正)、F18(test:37 + 41-44 env)——4/4 正确落地,附 v1.5 元数据表 + v0.6 强化候选。

## §2 398122a 实测核验

### ✅ 通过(锚点逐个复跑)
- `orchestrator.ts:406` for-loop ✓;region 405-549 ✓(loop 收口 ~548);realStepCount `+=1`@**L539** ✓、`===0`@**L560** ✓
- `workflow_pack.ts` expandStepTemplate **L296-350** ✓;explicit `${step::` code 位 331/335/343/345 ✓;shellEscape **L346** ✓;wildcard `grep -c '${step.*'` = **0** ✓
- `types.ts:355` depends_on: readonly string[] ✓;`orch.json` L16/24/32 ✓ + L30 input_ref 已用 `${step::dispatch-commands::stdout}` ✓
- L8 secrets 语义 clean(2 命中均为本文档自引 pattern 文本,见 F6);tag/L19/流程纪律 ✓
- 5 段 cat-file 实证中 #1/#3/#5 逐字复现 ✓

### ❌ Findings

1. **major** — scope §1 行数列 + commit message 行数段 + §7 v0.6#2/#3 ✅ — **"实测"复现失败**:行数 4 项错 3(+1 项差 1):orchestrator.ts "793"→实际 **963**、orch.json "39"→**36**、types.ts "432"→**539**、workflow_pack.ts "434"→433(`wc -l` 实测);§1 证据块 #2 漏 L294(注释行,实际 5 匹配)、#4 漏 L416(实际 2 行)——非完整 verbatim;commit message 同错传播。§7 将 v0.6 #2/#3 标 ✅("全部实测 grep 写入")——按项目自定规则("✅ 必须 cat-file 实证,不凭记忆")该 ✅ 验证不过 = F10/F15 同模式。Fix: fix-forward 修 4 行数 + 证据块补全(或注明"过滤注释行")+ §7 #2/#3 补真实 `wc -l`/`grep -n` verbatim 或降 ⚠️。
2. **minor** — §2F `commander.ts:43-49` 错 — 实际 :43-49 是 `_RUNTIME_URL` + 段注释;`emitStepUpdate` 定义在 **:343**(使用 :330)。Fix: 改 :343。
3. **minor** — §2A "aggregate-results (L552)" 锚点虚 — `grep -n 'aggregate-results' orchestrator.ts` = 0;L552 在 backward-compat 注释区;该 step 名仅存在于 orch.json(L4/L30)。Fix: 删锚点或改引 orch.json。
4. **minor** — 计数口径 — "待审 5 文件"/"Files to change (5)"/commit "修订范围 (5 文件)" 实为 **6 文件**(第 5 行含 2 个新 test 文件)。Fix: 改"5 行/6 文件"。
5. **minor** — wildcard 记法混用 — frontmatter description + commit 首段 `${step.*.stdout}`(纯点)≠ §2B 规格 `${step.*::field}`(regex `/\$\{step\.\*::([a-zA-Z_]+)\}/g`);且点号与 orch.json L4 "separators are `::` to avoid bash's `.` conflict" 的既有理由相逆(模板内不展开、可用,但记法须统一并记 why)。Fix: 全文统一 `::` 形式,description 同步。
6. **info** — L8 pattern 自引预期 — §3#6/§4cmd3 的 pattern 文本使该 grep 跑在 398122a diff 上得 2 命中(均自引非 secret);对 M1 实施 diff 无此问题。留档防未来误判。
7. **info** — commit "5 轮 audit-trail" 口径含糊(Cline 实跑 4 轮 + 用户 v1.3/v1.5 修订迭代);"8 commits + 1 tag" ✓。

## §3 设计裁决(§2 A-F,pre-implementation confirm/refute)

- **A wave 执行**: ✅ 设计合理(Kahn + wave 内 Promise.all + wave 间 await;同 wave 失败不中断兄弟、后续 wave skip 正确;plan 时 cycle detection 正确)。注:现行 3-step DAG 每波仅 1 step,并行收益要 5+ step plan 才显现——测试须造 fan-out DAG(§3#2 已含)。
- **B wildcard 语义**: ✅ concat + `\n---\n` delimiter + skip non-completed 合理;delimiter 须为**真实换行**插入(orch.json L30 双引号 bash 串内),实施时注意 literal `\n` vs newline 语义并写测试钉死。
- **C 并发不限 (M1.0)**: ✅ 接受(per ADR 0010;3-step DAG 波长=1 无压力);M1.1 env-var 留口合理。
- **D cycle detection**: ✅ plan 时 throw 正确;heuristic 1-step acyclic 保留合理。
- **E escaping**: ✅ per-step shellEscape + hardcoded delimiter 安全(L346 已有 shellEscape 可复用)。
- **F 并行 emit**: ✅ EventEmitter 多 listener 安全、SSE 顺序不保证为合法语义;唯锚点错(Finding 2)。
- **G-J 潜在项**: 选题恰当,均为实施时验证点非 scope 缺陷;I(failed step 不可见于 wildcard)已在文中给出 M1.1 `${step.*::status}` 出口。

## §4 处置

1. Fix-forward notes commit 修 Finding 1-5(半小时内工作量;Finding 1 必修,2-5 顺带)。
2. 修后 M1 放行实施:EnterPlanMode → 实现 → vitest → 实施 commit(message 含实测数,per v0.6 #1)+ tag v1.2.0n.1 → push → Cline 收口审验 CLOSED。
3. §4 cmd1-10 均可直接跑(--no-pager ✓);cmd3 对 M1 diff 跑(非本 commit)。

---
**Audit trail:** 2026-09-16 实跑于 /Users/kjonekong/projects/fish-harness;`wc -l`/`grep -n`/`sed -n` 输出均直接复现于本报告 §2;git 一律 `--no-pager`。
