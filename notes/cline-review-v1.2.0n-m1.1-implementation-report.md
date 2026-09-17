# Cline 三审 — v1.2.0n M1.1 实施 (`516588a` tag `v1.2.0n.2` + fix-forward `3474322`)

**判定:NOT PASS** — 生产代码完整正确,但 fix-forward 自伤测试文件致 **M1.1 核心验收面在 HEAD 零执行**,且 "5 failed → 0" claim 为误读。需 fix-forward #2。

## 实测基线 (本机复跑 verbatim, 2026-09-17)

- HEAD `3474322`: `Test Files 1 failed | 29 passed | 17 skipped (47)` / `Tests 271 passed | 147 skipped (418)`;tsc exit 0
- `516588a` (tag 复放): `Test Files 2 failed` / `Tests 5 failed | 274 passed | 147 skipped (426)` — dispatch_wave 4 failed + skip_pack 1 failed
- HEAD 失败根因: `orchestrator_dispatch_wave.test.ts:424 ERROR: "await" can only be used inside an "async" function` — 文件级 transform 失败,8 its 全部不执行
- L8 (committed `66efa0d..516588a`): 1 hit = 归档报告内引 "sk-placeholder" (豁免类,v0.6 #2);message claim "0"
- immutability (harness/server.py + spec/ + kernel-schema.sql): 0 改动 ✓;tag `v1.2.0n.1`→`09e35f6` ✓、`v1.2.0n.2`→`516588a` ✓;一审报告 (91 行) 已归档 ✓

## Findings

**U1 (major) — fix-forward 语法损坏,验收文件不可执行。** `3474322` 重写 T4 头部后遗留旧 T4 尾尸 (L417-439): 悬空 `vi.spyOn` + 顶层 `await`(:424) + 死代码内含不可能断言对 (`dispatchOrder` 同时 `toEqual([A,B,D])` 与 `toContain("step-C")`)。整文件 parse 失败 → T4a/T4b/T4b-shared/T5 全部不跑。**"5 failed → 0" 误读**: message 贴的真实输出 `Tests 271 passed | 147 skipped (418)` 无 "0 failed" 可言——证据命令 `tail -3 | head -2` 恰切掉 `Test Files 1 failed` 行;未查 vitest exit code (非零);passed 274→271、总数 426→418 (-8 = 整文件蒸发) 双异常未触发警觉。ADR 0013 "verbatim 粘贴" 貫徹了字面、失了语义——**贴而未读,第 6 次 claims-vs-reality 同型** (T1→M1.1-F1 链延续)。

**U2 (major) — 正向 skip 路径 HEAD 零执行覆盖。** 唯一正向断言 ("D 真被 mark skipped + 不派发") 在 T4b — 已死于 U1。skip_pack 5 its 仅覆盖 not-skipped (L235-236 `expect(result).not.toContain("skipped")`) 与 wildcard 可见性;fixture 无会被 skip 的下游 step。**M1.1 核心语义 (skip-dependents) 在 HEAD 实际处于未验证状态。**

**U3 (major) — T4a 语义漂移。** fix-forward 把 T4a 改写为 "B succeeds → all 3 dispatched" (3-step chain, 全成功路径);授权语义 (scope §2 C item 1 + 一审报告 §6 要点 1) 为 "**B fails → 同 wave 独立 C 仍派发**" (M1.0 wave 内失败不阻断守卫)。现全绿路径无失败注入,守卫语义仅存于死代码 orphan 注释中。

**U4 (major) — tag `v1.2.0n.2` 打在 5 红测 commit 上。** `516588a` 自知 5 failed (message 诚实记录) 仍 tag+push;§修订元数据表同时在claim R2′/R3′ "✅ FIXED 本 commit"——其验证测试恰在该 commit 是红的。L19 tag→commit 1 SHA 规则下不可移,须在 closure note 明示 "tag 红、HEAD 绿" 并由 fix-forward #2 承载最终绿态 (或追加 `v1.2.0n.3`)。

**U5 (minor) — 实施commit证据取自 commit 前工作树。** message 实测 #1 stat "7 files/261+" ≠ committed "10 files/668+" (261+91+37+279=668: report/fixture/skip_pack 证据采集后加入)。T1 同型第 5 次。

**U6 (minor) — L8 "0" 又是裸值。** 实际 1 hit (报告引 "sk-placeholder",豁免类应列源),message 写 "0 (全…豁免)" — 0 与豁免并存自相矛盾,v0.6 #2 禁裸 0 再犯。

**U7 (minor) — 元数据表 F1/R1 重复计数。** 同一 finding 两行凑 "12/12" (实为 11);R5′ claim 全修而 §8 L317 残留未随实施吸收 (一审 §6 要点 6 未执行)。

**U8 (info)** — message 称归档报告为 "三审 PASS" (实为一审报告 §6 终判);行数偏差 (workflow_pack 492 vs 估 474、orchestrator 1123 vs 1063、dispatch_wave 540 vs 496、skip_pack 280 vs 150) 属估算容差,但 message 因 U5 无 post-commit 真值可对。

## 正面确认

生产代码全中: skip 逻辑 (failedUpstream Set + wIdx>0 跨 wave 检查 + toSkip 标记, orchestrator.ts:434-505) ✓;MCC chunk (`chunkSize = MCC>0 ? Math.min(MCC,len) : len`, 4-step/MCC=1→4 chunks) ✓;`${step.*::status}` 双 case (workflow_pack.ts:353 explicit + :398 wildcard) ✓;TaskStatus 第 7 成员 `| "skipped"` (types.ts:397) + 详注 ✓;tsc 0 ✓。skip_pack 5/5 绿、title-body 对齐扎实 (split-count 断言等);wildcard T6 绿;fixture 严格按授权设计 (status-echo 无 depends_on、orch.json 未动) ✓;`516588a` message 对 5 failed 诚实记录 + fix-forward 根因分析 (restoreAllMocks 重置 mockWorkerRun) 技术上成立。

## Fix-forward #2 要求 → PASS 判据 (预授权)

1. 删 orphan L417-439,文件可 parse (vitest 该文件 0 file-fail,its 恢复执行)
2. T4a 恢复授权语义: 4-step fan-out A→B/C→D,B fails → 断言 dispatchOrder 含 C (同 wave 独立仍派发);D 交给 T4b
3. T4b 执行且含正向断言: dispatchStep 未为 D 调用 + skipped 状态写盘/emit_step_update 至少其一
4. 全量: `Test Files` 行 **0 failed** + `Tests` 行 verbatim 粘贴 **+ vitest exit code (`echo $?`)= 0** + passed 计数 ≥ 279 (274 基线 + T 净增) 且总数对账 (its 不得凭空消失)
5. commit message: F1/R1 去重 (11/11)、§8 L317 cite 顺改、L8 按实际列源 (预期 1 豁免或改写后 0)、附 post-commit `--stat` 真值
6. closure note 记录 tag-red 事实 (v1.2.0n.2→516588a 红 / fix-forward #2 绿),如追加 `v1.2.0n.3` 则 tag→新 commit

Cline 复核仅: vitest 全量两行 + exit code + 该文件 grep 无顶层 await + T4a/T4b 断言语义 + 上记 5 点 grep。

---

## §2 Fix-forward #2 复核 (`296f18c`, 2026-09-17) — **CONDITIONAL: 实质修复全到位, 1 处新违 + 收尾未落**

**复现 ✓ (本机独立复跑)**: `Test Files 30 passed | 17 skipped (47)` / `Tests 279 passed | 147 skipped (426)` / vitest exit 0 / tsc 0——与 message verbatim 一致;426 = `516588a` 对账 (8 its 复活);U1 orphan 已删 (文件可 parse);U2 T4b 正向断言真实 (`emitStepUpdate c[1]="step-D" + c[2]="step_update" + c[3].status="skipped"` + `dispatchStep` ×2 + skip-pattern `_recordStepResult`, L470-514) ✓;U3 T4a body 语义正确 (4-step fan-out, B fails 注入 driver.failed, 断言 C 派发 + D 不入 dispatchOrder + `_recordStepFailure` ×1) ✓;证据管道吸取教训 (grep -E 锚定双行 + `echo $?` + 判据原话) ✓;post-commit stat "1 file/52+/31-" 与实际一致 ✓;本 commit L8 实测 0 ✓;tag 不动、`v1.2.0n.2`→`516588a` 锁定记录在案 ✓。

**V1 (major, v0.6 #3 title-body invariant) — T4a 标题与断言相反。** Title: "B fails → C dispatched + **D dispatched (no skip)**" (:388);body: `expect(dispatchOrder).not.toContain("step-D")`——标题宣称 body 所否证之事。同型讽刺: 本 commit 自称守 title-body 硬规则。附 :385 残留注释 "3-step chain DAG A → B → D, **B succeeds**" (描述两版前的 T4a)。工程实质无恙 (body 内注释已诚实说明 "M1.0 baseline 不能直接测, M1.1 skip 已落地"), 但标题必须改 (如 "B fails → 同 wave C dispatched + 跨 wave D skipped (M1.1)")。

**V2 (minor) — 元数据表 over-claim ×2。** U4 标 ✅ FIXED——已 push 的 tag 无法回溯 "修", 只能 DOCUMENTED/ANNOTATED (red-at-tag 事实已在案);U7 标 ✅ FIXED 且理由不成立 ("dispatch_wave 不再重复 R1+F1 引用"——F1/R1 重复计数在 `516588a` 不可变 message 里, 只能注释不能修)。

**V3 (minor) — 收尾件未落 (message 自列 Forward, 与三审判据 5/6 对齐但本轮未兑现)。** §8 L317 cite 未修 (自认 deferred);closure note 不存在 (`ls notes/` 无 m1.1-cycle-closure);memory vault 未建;L8 结尾 "0 (…全列源豁免)" 又见 0+豁免矛盾措辞 (本 commit 实为真 0, 无需豁免语)。

## §3 收口判据 (预授权 → 终审 PASS + CLOSED)

1. **V1**: T4a title 改为断言一致 (grep: 无 "D dispatched (no skip)"、无 "B succeeds" 残注) —— 随任意 forward commit
2. **Closure note** `notes/v1.2.0n-m1.1-cycle-closure.md`: 记 tag-red 事实 (`v1.2.0n.2`→`516588a` 5 红测, `296f18c` 绿 279/0/147) + cycle 全貌 (scope v1.1→v1.1.2 三修 + 实施 + fix-forward ×2 + 8+3 findings) + V2 元数据更正 (U4/U7 → DOCUMENTED)
3. **§8 L317** "audit-scope v1.0 §2 A" → "M1 scope v1.2 §2 A"
4. memory vault 同步 (可选, user-driven)

1-3 落地后 Cline grep 三点即 **终审 PASS, M1.1 cycle CLOSED**;本三审报告随归档。

---

## §4 终审 (`509d917`, 2026-09-17) — **PASS — M1.1 cycle CLOSED** ✅

**收口判据逐项**: V1 ✅ T4a 标题已修 (:388 "M1.1 wave 内不阻断 + 跨 wave skip — B fails → C dispatched, D skipped" 与 body 断言语义一致;残 :385-386 旧注释 → F-终1′ 顺改);V2 ✅ DOCUMENTED (message 详录 tag-red 链: `516588a` 5 红 → `3474322` 修 4 → `296f18c` 修 1 → 0;F1=R1 重复与 over-claim 自认;memory vault 实存 141 行已验证);V3 ✅ §8 cite 全清 (grep 'audit-scope v1.0 §2' = 0)。§修订元数据表 **3/3 跨工件一致** (title↔body / scope §8↔message / tag↔L19)。

**全量复现 (HEAD `509d917`)**: `Test Files 30 passed | 17 skipped (47)` / `Tests 279 passed | 147 skipped (426)` / vitest exit 0 / tsc 0——与 message verbatim 一致。

**Tag 锁定**: `v1.2.0n.1`→`09e35f6` ✓ · `v1.2.0n.2`→`516588a` ✓ (points-at 复核) · fix-forward ×3 不动 tag (M0.1 precedent) ✓。

**Deploy 可行性: READY** — ① `09e35f6..509d917` compose/Dockerfile/deploy **零漂移** (与 M1 live 验证过的 4-container 拓扑同构);② 版本双侧 bump (pyproject `1.2.0+0.n.2` + `harness/__init__.py` `1.2.0n.2`);③ 新 env `MAX_CONCURRENT_STEPS_PER_WAVE` default 0=unlimited → **无需 compose/env 变更,部署安全**;④ 建议 user-driven: newvps `docker compose up -d --build` 重建 4 wrapper 容器 + `/api/orch/healthz` ×4 = 200 验证 (per M1 收口模式)。

**顺延至归档 commit (F-终模式, 不阻断 CLOSED)**:
- **F-终1′ (info)**: :385-386 残注 "3-step chain DAG A → B → D, B succeeds" 与已修标题矛盾——1 行顺改
- **F-终2′ (minor)**: repo 侧 closure note 缺位 (memory vault 141 行已替代, 但 M1 惯例是 `notes/v1.2.0n-*-cycle-closure.md` 入库镜像);本三审报告 + 一审报告仍未跟踪——随归档 commit 入库
- **F-终3′ (info)**: 数字叙述两处混乱 (V2 段 19/27/26 互搏;memory "约250 行" 实 141)——归档时统一口径 (建议: unique findings 计 F1-F7=7 + R2′/R3′/R5′+R1′cos=4 + U1-U8=8 + V1-V3=3, F1=R1 同条, 共 22 unique)

**Cycle 全貌 (v1.2.0n M1.1)**: scope v1.1→v1.1.1→v1.1.2 (3 修) + 实施 `516588a` (tag, 5 红自认) + fix-forward ×3 (`3474322`/`296f18c`/`509d917`) + 4 轮 Cline 审 (一审 CONDITIONAL→PASS 授权 / 实施 NOT PASS / 复核 CONDITIONAL / 终审 PASS)。核心语义落地: `${step.*::status}` wildcard + TaskStatus "skipped" + skip-dependents 跨 wave + MCC chunking;279/0/147 绿、tsc 0、imm 0、双 tag 锁定。6 次同型复发链 (F10→F15→R3→T1→F1→U1"贴而未读") 完整闭环——v0.7 三维一致判据 (完整多行 + exit code + 计数对账) 已在本 cycle 末两 commit 实操成型, 待 ADR 0013 升级固化。

**判定: 终审 PASS — v1.2.0n M1.1 cycle ✅ CLOSED** (F-终1′-3′ 顺延归档, deploy READY 待 user 执行)。
