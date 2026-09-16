# Cline Review — v1.2.0n M1 Implementation Audit-Trail 二审 (2026-09-16)

**Reviewed**: `09e35f6` (feat M1 depends_on + wildcard, tag `v1.2.0n.1`) · `5912ddb` (audit-scope v1.1 + 一审报告归档) · `2e5268f` (closure, pre-二审)
**Method**: 全部关键数字由 Cline 本机复跑 (wc -l / grep / vitest / tsc / git --no-pager diff),非转引。

## §0 Verdict

**NOT PASS (CONDITIONAL)** — 3 major + 1 minor + 1 info。

实施代码本身的 happy path 全部属实 (wave 执行 / wildcard / 271/0/147 / tag 锁定 / immutability 0),**但 audit-trail 三线核验全线失守**: §2 A 承诺的错误传播未实现且被空壳测试掩盖 (R1)、wildcard failed 语义与未修订的 scope 直接矛盾且三处伪引 §2 I (R2)、commit message 的 L8/immunability "cat-file 实证" 命令本身是非法 git 语法 → 记录的 "0" 是失败命令的空洞输出 (R3)。R3 是 F10 (伪引文) → F15 (未跑计数) 之后的**第三次同型复发**。

## §1 复跑属实的实测 (✅)

| 项 | commit 声称 | Cline 复跑 | 判 |
|---|---|---|---|
| tsc | exit 0 | `exit: 0` | ✅ |
| vitest | 271/0/147, Files 29 passed \| 17 skipped (46) | 完全一致 | ✅ |
| wc -l | 1033 / 472 / 401 / 181 | 完全一致 (4/4) | ✅ |
| it 计数 | 6 / 5 | `grep -cE '^\s*it\('` = 6 / 5 | ✅ |
| Cyclic/topoWaves grep | 8 行 (409…671) | 逐行一致 (8/8) | ✅ |
| WILDCARD_RE grep | 4 行 (317…365) | 逐行一致 (4/4) | ✅ |
| version bump | 1.2.0+0.n.1 / 1.2.0n.1 | pyproject:7 / __init__:25 一致 | ✅ |
| tag 锁定 | v1.2.0n.1 → 09e35f6 | `09e35f6b75445…` ✓;v1.2.0n.0 → 5faffea 未动 ✓ | ✅ |
| v1.0 immutability | 0 行 | `git --no-pager diff 5faffea..HEAD -- harness/server.py spec/ kernel-schema.sql \| wc -l` = **0**;M1 单 commit 范围亦 0 | ✅ (但见 R3: 记录命令语法非法) |
| L8 (M1 diff) | 0 | `09e35f6^..09e35f6` grep = 0 ✓;`5912ddb..HEAD` = **2** (见 R3) | ⚠️ |
| §修订元数据表 | 7 findings 表 | commit message 含表;5912ddb 实修 F1-F5 全部验证 (963/36/539/433/385 · :343 · orch.json L31 · 6 files · `::` 统一) | ✅ |
| wildcard delimiter | 真实换行 | `values.join("\n---\n")` L384 + per-value shellEscape L382 | ✅ |
| §3 #5 escape 边界 | 测试覆盖 | wildcard test L137 `"; DROP TABLE workers; echo "` | ✅ |
| deploy 记录 | pending | closure L145 "待 user explicit deploy 授权";4 个 service 名 (wrapper-frontend/orchestrator/commander/commander-2) 均在 compose L141/219/270/319 | ✅ 二审前不 deploy,流程正确 |

closure 引用数字: audit-scope 331 行 ✓、一审报告 61 行 ✓、11-commit trail ✓、+70/+39 ✓。

## §2 Findings

**R1 (major) — §2 A 错误传播未实现 + T4 空壳测试 + 虚构 integration 引用。**
scope v1.1 §2 A 明文: "一个 step 失败 → …后续 wave 跳过 (mark upstream failed → step skipped)";§3 #4 期望 `step-D.status = 'skipped' (新 status)`。实现 (orchestrator.ts:411-428) wave 循环逐 step try/catch,Promise.all **从不 reject**,**无任何 skip 逻辑** — `grep -n 'skipped\|upstream' orchestrator.ts` 仅命中 L492/L535 (无关)。B 失败后 D 照常派发,且因 explicit-ref 对 failed 也解析 (workflow_pack.ts:340),D 的 input 会注入失败父步骤的 (可能残缺的) stdout。T4 (`dispatch_wave.test.ts:330-372`) 标题 "marks downstream D as skipped" 但测试体: ① 从未使 B 失败 (mock driver 恒成功);② 根本未调 `dispatch()`;③ 仅断言 `topologicalWaves` 输出 3 wave (与错误传播零关联)。注释 "promise.all rejects on first failure" 与实现相反;"Full runtime error-propagation is verified in integration tests" 为**虚构引用** — `wrapper/test/integration/` 20 个文件无一覆盖 wave 错误传播 (grep 验证)。

**R2 (major) — wildcard failed-include 语义与 scope v1.1 §2 B/§3 #3 直接矛盾,三处伪引 §2 I。**
scope v1.1 §2 B (5912ddb 未改,现行文本): "failed/cancelled steps' field **不进** concatenation";§3 #3 期望 "step-A failed → 不含 step-A / bash sees only step-B stdout"。实现 (workflow_pack.ts:370) 与 wildcard test T2 (:96 "includes failed step stdout (per audit-scope v1.1 §2 I)") 断言的是**反面**;代码注释 :356-362 与 commit message、closure L12 ("completed (or failed)") 同口径。`git show 5912ddb -- scope.md | grep failed/skip/§2 I` = **零改动** — §2 I 从未修订,"per audit-scope v1.1 §2 I" 属伪引。缓解: 该语义与 M1 之前既有先例一致 (`workflow_pack_upstream_injection.test.ts:20`,v1.2.0l.5: explicit-ref 对 completed-or-failed 解析),wildcard 是对齐而非首创,且 rationale (失败可见性) 合理 — **但 scope 是审计契约,设计翻转必须走 v0.6 #4 修订,未走即违约**。

**R3 (major) — "cat-file 实证" 命令为非法 git 语法,记录的 0 是空洞输出。**
commit message #6/#8 及 scope §3 #8 写作 `git diff --no-pager 5912ddb..HEAD | …` / `git diff 5faffea..HEAD --no-pager -- …` — `--no-pager` 是全局选项,置于子命令后 git 直接打 usage 报错、输出为空 → 管道后的 "0" 从未被测量。正确语法复跑: `git --no-pager diff 5912ddb..HEAD | grep -cE 'sk-…|TOKEN|…'` = **2** (均为良性: closure 自引命令文本 + forward-scope 提及 `sk-placeholder-edge{2,3}` 占位符,非真密钥);M1 单 commit 范围 = 0 ✓;immutability 两范围 = 0 ✓。**结论属实,证据链断裂** — v0.6 #1 "archive commit 必 cat-file 实证" 名义违约。这是 F10→F15 后第三次同型复发;scope §3 #8 的命令形式一审时 Cline 亦未检出 (自查记过)。

**R4 (minor) — closure 两处陈述与事实不符。**
L12/L140 "实施未揭新 finding" — 被 R1-R3 直接否定;L153-155 将一审 "CONDITIONAL" 自行升格为 "v1.1 修订后 PASS" (修订确已落地且本次由 Cline 验证,实质成立,但 PASS 从未经 Cline 复签,记录时序失真)。

**R5 (info) — closure git trail 表述。**
"11 commits + 2 tags" 计数正确 (2e5268f 自身未计,合理);closure 自我标注 "archived in pending commit" 处理妥当。

## §3 Fix-forward 要求 (tag 不回改 — L19;09e35f6 保持锁定)

1. **scope v1.2 修订** (notes commit,§11 新修订元数据表含 R1-R5): §2 A + §3 #4 要么实现 skip-dependents 要么显式 defer 至 M1.1 (附 rationale);§2 B + §2 I + §3 #3 改为 codify include-failed (引 v1.2.0l.5 upstream_injection 先例),消除伪引。
2. **T4 重写** (test-only commit,无需新 tag): 使 B 真实失败 (override mockWorkerRun → driver.failed),断言 D 的 `dispatchStep` 未被调用 (若 §2 A 实现了 skip) 或按 defer 后的现状改题改断言 (B 失败后 D 仍派发、任务不崩溃),删除虚构 integration 注释。
3. **closure v1.2**: 更正 "实施未揭新 finding" → 二审 3 major;以正确语法补 verbatim L8/immu 输出 (注明 5912ddb..HEAD 的 2 hits 为 self-referential/placeholder 豁免)。
4. **v0.6 硬约束升级 (第三次复发后必落地)**: 实证命令须**可原样复制粘贴运行** (`--no-pager` 等全局选项置于子命令前);L8 grep 命中须逐条列源并注明豁免类,不允许只报计数;测试标题/注释与断言体不一致视为无效测试 (title-body invariant)。

二审 PASS 条件: 上述 1-3 落地后 Cline 复核;deploy (closure forward #2) 维持待授权不变。

---
*Cline 二审 · 2026-09-16 · 证据均为本机复跑 verbatim;报告未提交 (待用户 fix-forward 后一并归档)。*
