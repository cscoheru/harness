# Cline Review — v1.2.0n M1.1 Pre-Implementation 一审 (2026-09-17)

**Reviewed**: `notes/cline-audit-scope-v1.2.0n-m1.1-preimplement.md` @ `02158d7` (310 行) + ADR 0013 (`af7d1cd`)
**Method**: §4 命令全量复跑 + §1 全部锚点/行数逐一 grep/wc 实测 + 基线 (tsc/vitest) 本机复跑。

## §0 Verdict

**CONDITIONAL — 3 major (F1-F3) + 3 minor (F4-F6) + 1 info (F7)。按 scope §5 自定 Pass 判据 (0 critical / 0 major / ≤2 minor) → NOT PASS,需 scope v1.1 修订后再实施。**

积极面: v0.6 #1 命令语法 **§3/§4 全部正确** (`--no-pager` 前置、L8 列源豁免写入期望值、title-body 自检命令内置);§1 证据块 6 段 grep 输出**逐行复现属实** (296/316/317/318/364、cases 345-348/373-376、421/683/747/760/780、418/427、PlanStepStatus 488/497/500、MCC=0、heartbeat L81-82)——M1 F1 时代 "grep 锚点陈旧" 的病灶本次未复发。**pre-implementation 审查在写代码前拦下 3 个 major,这正是流程目的** (M1 同类矛盾是落在代码+测试后才被二审揭出)。

## §1 基线锚点 (Cline 实测, 供修订对照)

`wc -l`: workflow_pack.ts **472** / orchestrator.ts **1033** / types.ts **539** / orch.json **36** / dispatch_wave.test.ts **466** (7 its) / wildcard.test.ts **181** (5 its)。it 计数 7/5 ✓;tsc exit 0 ✓;vitest **272/0/147** (419) ✓;`grep -c MAX_CONCURRENT` = 0 ✓;TaskStatus 定义 **types.ts:383-389**,成员 6 个: `pending | dispatched | running | completed | failed | cancelled`。

## §2 Findings

**F1 (major) — §1 主表两处行数 "实测" 为陈旧值 (v0.6 #2 违例, 首个 v0.6-hardened cycle 即复发同族病灶)。**
① workflow_pack.ts 单元格: "**434** total (实测 — 433 → 433 + status case ×2)" — 实际 **472**。433 是 M1 实施前基线 (M1 scope v1.1 §1 row 2 值),陈旧一个 M1 (+39);且单元格自相矛盾 (433→433+×2 ≠ 434;M1.1 后应为 472+2=474)。
② dispatch_wave.test.ts 单元格: "baseline 412 lines / 7 tests" — 实际 **466** 行 (7 tests ✓)。412 不对应任何已测状态 (M1 实施 401 → T4 重写后 ~460 → e72f3b0 头部修 466)。
scope 头部声称 "cat-file 实测真值, 不是凭印象"、§7 对 v0.6 #2 打 ✅ — wc -l 单元格系凭印象转录自 M1 scope 记忆,未重跑。**修复**: 重跑 `wc -l` 更正两格 (预期 M1.1 后 ≈474 / ≈486),并在 §7 证据列补 wc -l verbatim 输出。

**F2 (major) — §2 C 与 T4 现存断言不相容: "T4 旧断言仍 pass" 在 skip-dependents 实现后必假。**
§2 C item 1 声称 "M1.0 行为保留 (T4 旧断言仍 pass) … 后续 wave 仍 dispatch",item 2 又要求跨 wave skip。T4 现断言 `expect(dispatchOrder).toEqual(["step-A","step-B","step-D"])` (A→B 失败→D 跨 wave 依赖 B) — 按 item 2, D 必被 skip → T4 必红。M1 scope v1.2 §3 #4 已预写: "M1.1 加 skip 逻辑后此测试改断言 D 未被 dispatchStep" — 本 scope §1 row 5 (2) "验证 T4 旧断言仍 pass" 与之直接冲突。另: "保留 M1.0 行为" 的正确载体是**同 wave 无关 step 不受失败影响** (B 失败 → 同 wave 独立 C 仍派发),而现存测试无此覆盖 (T2 全成功),scope 亦未计划补。**修复**: §1 row 5 + §2 C item 1 改为 "T4 翻转断言 (D skipped, dispatchOrder=[A,B]) + 新增 T-same-wave (B 失败 → 独立 C 仍派发) 承接 M1.0 语义"。

**F3 (major) — §2 D / §1 row 4 验收场景不可能发生 + 生产默认包被当 demo 改。**
§2 D Verification: "dispatch 3-step (… dispatch-commands FAIL, aggregate-results skipped) → aggregate-results bash 看到 3 status 拼接" — **自相矛盾**: aggregate-results depends_on dispatch-commands,F2 落地 skip 后它被 skip → 根本不执行,不可能 "bash 看到" 任何拼接;场景只有全成功时才运行 (此时 3 status 全 "completed")。且 orch.json 是**生产默认包**,把 aggregate-results input_ref 从 stdout 改为 status echo 会改变所有真实任务的聚合输出——demo 应放 test pack 或独立 step,不应改默认包语义。§1 row 4 又标 "不动 +0" 与 §2 D 改动矛盾;"M0.1 已支持 implicit" 归因错 (wildcard 是 M1)。**修复**: 重设计 D (独立 status-echo step 或 test pack;验收场景改为 "B 失败 → status-echo 独立 step 看到 completed\n---\nfailed");§1 row 4 更正 "改动" 描述。

**F4 (minor) — TaskStatus 编辑锚点错位 + union 成员清单错 + ripple 未审。**
§2 A item 1 指 `types.ts:500` 扩 union — L500 是用法 (`status: TaskStatus;`),union 定义在 **L383-389**;§1 row 3 现状列漏列 `"dispatched"` (实 6 成员)。设计面: TaskStatus 同时是 Task 级类型 (task_store/queue_store/PWA UI/safeMarkCompleted),加 "skipped" 扩大任务级词表 — 可接受但 scope 以 "539→539 +1 字面" 呈现为无 ripple,应至少注记共享性与 StepStatus 别名选项。**修复**: 锚点改 L383;现状列补 "dispatched";§2 A 加 ripple 注记。

**F5 (minor) — 引用错版/错节。** §1 Out-of-scope + §2 C item 3 + §8 三处引 "audit-scope v1.0 §2 I / §2 A" 作为 "M1.0 wave 内失败不阻断; M1.1 candidate" 出处 — 该句实在 **M1 scope v1.2 §2 A** (R1 修订后文本);v1.0 §2 A 是 "后续 wave 跳过" (相反语义)、v1.0 §2 I 是 wildcard failed 语义。**修复**: 统一改引 "v1.2 §2 A"。

**F6 (minor) — 算术/叙述滑差。** §2 B Verification "MCC=1 + 4-step wave → 2 chunks" (MCC=1 应为 4 chunks;2 chunks 对应 MCC=2);§1 row 2 括注 "963 → 1033, M1.1 + skip/MCC" 把 M1 的变化当 M1.1 叙述且 1033 是 M1.1 **前**值 (实施后 ≈1063);§3 #5 期望 "each chunk in single emit_step_update" 语义不明。**修复**: 更正 chunk 算术与叙述。

**F7 (info) — §7 ✅ 伞过宽。** "全文 cat-file 实测" 的 ✅ 覆盖了未实际重跑的 wc -l 单元格 (见 F1);证据块 6 段 grep 属实部分应与 wc -l 分列,✅ 只标注实际跑过的命令。

## §3 修订要求 (scope v1.1)

1. F1: 重跑 wc -l 更正 §1 两格 + §7 补 verbatim。
2. F2: §1 row 5 + §2 C 改 T4 翻转 + 新增 same-wave-continue 测试计划。
3. F3: 重设计 §2 D (不改生产默认包语义;验收场景逻辑自洽)。
4. F4-F6: 锚点/清单/引用/算术更正。
5. §修订元数据表 (§7 或新 §) 列 F1-F7 处置。

修订 commit 后 Cline 复核 (预计 spot-check 级) → PASS → 实施。

---
*Cline 一审 · 2026-09-17 · 全部锚点/行数/基线为本机复跑 verbatim;报告未提交 (待修订后归档)。*

## §4 修订复核 (spot-check `37f2a1d` + `2a9121b` v1.1.1, 2026-09-17) — **CONDITIONAL: 3/7 全落实, 2/7 半落地, 2/7 部分落地**

**全落实 ✓**: R1 (行数 472/466/539/36/181 真值 + L383-389/6 成员/L394·406·419 用法锚点全验) · R6 (4 chunks + 估算/实测区分) · R7 (§7 ✅→⚠️ + v0.7 候选, 诚实) · L8 两修订 commit diff 实测 **0** ✓ (37f2a1d 的 "cat-file 真测" 声称首次完全成立)。

**半落地 (residual majors — 修订自引入 metadata-claims-vs-content 失配, v0.6 #4 核心病灶):**

**R2′ (major) — §2 C item 1 未改, 与 §2 C Verification 自相矛盾。** 元数据表claim "§2 C 'M1.0 行为保留' 改'同 wave 独立 step 不受影响'" — **实际未落**:§2 C item 1 现行文本仍为 "**M1.0 行为保留** (T4 旧断言仍 pass) … 后续 wave 仍 dispatch",直接抵触同节 Verification "D skipped (M1.1 新行为)" 与 §1 row 5 的 T4a/T4b 拆分。且 §2 C 仍用 "T6" 命名 (§1 row 5 已改 T4a/T4b, 命名失同步)。另 §1 row 5 (2) 括注 "T4a … B fails → **D still dispatched**" 又把旧语义带回 T4a — T4a 应为 "B fails → 同 wave 独立 C 仍派发" (D 跨 wave 依赖 B, skip 落地后必 skip)。

**R3′ (major) — 重设计未同步到验收面, 三处陈旧。** ① §2 D **Verification 原文保留不可能场景** ("dispatch-commands FAIL, aggregate-results skipped → aggregate-results bash 看到 3 status 拼接" — 被 skip 的 step 不执行, 且 orch.json 已定不动);② **§4 #10 未改**: 仍 `grep orch.json` 期望 `${step.*::status}` — 现为必然假期望;③ **§5 模板 #4 未改**: 仍 "orch.json (0 or 1) — input_ref 改 ${step.*::status}"。附: (K) 仍列 orch.json 为 M1.1 触碰文件 (现不动)。

**R5′ (minor) — v0.6 #3 引用修正未落。** "M0.1→M1.0 (per M1 cycle)" 三处已改 ✓, 但三处 "**audit-scope v1.0** §2 I/§2 A" 引用原样保留 (L77 Out-of-scope / L111 §2 C caveat / L311 §8) — 元数据表自己写明真位置 "M1 scope v1.2 §2 A L132" 却未改引用。

**Cosmetics (info)**: §1 row 1 括注 "472 + **0** M1.1 case 添加" 应为 +2 (→474);37f2a1d message "0 (…全 self-injury + sk-placeholder 豁免)" 措辞空洞 (0 命中即无可豁免项)。

## §5 一轮收口清单 (8 处文本同步, 全 notes-only) → PASS 判据 (预授权)

1. §2 C item 1 改 "同 wave 独立 step 不受失败影响 (T4a); 跨 wave 依赖 failed/skipped 的 step 被 skip (T4b)" + "T6"→"T4b" 命名统一
2. §1 row 5 (2) 括注改 "B fails → 同 wave 独立 C 仍派发"
3. §2 D Verification 重写: "test pack 3-step: B fail → 独立 status-echo step 看到 `completed\n---\nfailed` 拼接 (echo step 无 depends_on, 不被 skip)"
4. §4 #10 改 grep test pack fixture 路径 + 期望相应更新
5. §5 模板 #4 改 "orch.json 不动; test pack +skip_pack test 新增"
6. (K) 去掉 orch.json
7. L77/L111/L311 三处 "v1.0 §2" → "M1 scope v1.2 §2 A"
8. §1 row 1 括注 +2 修正; §修订元数据表补 R2′/R3′/R5′ 行 (半落地→全落地)

落地后 Cline 仅 grep 验 8 点 (§2 C 无 "T4 旧断言" 字样 / §4 #10 无 orch.json / 无 "v1.0 §2" 残留等) 即发 **一审 PASS → 实施授权**。

## §6 终判 (spot-check `66efa0d` v1.1.2, 2026-09-17) — **一审 PASS,实施授权** ✅

8 点复核: ① §2 C item 1 改 T4a (同 wave 独立不受影响) / T4b (跨 wave skip) + 引 v1.2 §2 A L82 ✓; ② row 5 (2) 括注改 "同 wave 独立 C 仍派发" ✓; ③ §2 D Verification 重写 (独立 status-echo step 无 depends_on 不被 skip, 并自释 "aggregate-results 被 skip 不可能再执行") ✓; ④ §4 #10 改 grep test pack fixture ✓; ⑤ §5 #4 改 orch.json 不动 + 新增 4b fixture/4c skip_pack test ✓; ⑥ (K) 去 orch.json ✓; ⑦ L77/L111 引用已改 v1.2 §2 A ✓ — §8 L317 历史溯源行残留 1 处 "v1.0 §2 A" (R5′ 元数据行 claim 已修而未修, info 级: 历史叙事行, 权威引用已在 §2 C 更正; 随实施/归档 commit 顺改); ⑧ row 1 "+2" 修正 + 诚实注记 ✓, R2′/R3′/R5′ 元数据行齐全 ✓ (总计 格 severity 枚举凌乱, info)。

**设计矛盾类 major 全部消解**; 残留 2 处 info 级 cosmetic (§8 cite + 总计 格), 随实施 commit 顺带吸收, 不需新审轮。

**实施授权要点 (implementer 必读)**:
1. T4 拆 T4a/T4b — T4a 断言 "B fails → 同 wave 独立 C 仍派发"; T4b 断言 "D skipped + emit_step_update('skipped') + dispatchStep 未为 D 调用" (title-body invariant)
2. orch.json **不动**; demo 放 `wrapper/test/unit/fixtures/orch-skip-test-pack.json` + `orchestrator_skip_pack.test.ts` (5+ tests)
3. TaskStatus 扩 `"skipped"` @ **types.ts L383-389** (7th 成员)
4. MCC: env 读取 module 顶部, default 0=unlimited; MCC=1 + 4-step wave = **4 chunks**
5. 行数预期: workflow_pack 472→474, orchestrator 1033→~1063, dispatch_wave.test 466→~496; 基线 272/0/147 → 实施 commit message 附 cat-file 实测 (含 it 计数), L8 列源禁裸报 0 (v0.6 #1/#2 per ADR 0013)
6. tag `v1.2.0n.2` → 实施 commit; 一审报告 (本文件) 随实施或归档 commit 入库

