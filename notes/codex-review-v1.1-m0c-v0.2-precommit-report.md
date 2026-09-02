# Codex 审验报告 — v1.1 M0c v0.2 升级 + M1c 实施合同（precommit 轮，post-hoc）

> **Date**: 2026-09-02
> **Reviewer**: Codex（gpt-5.6-sol 风格，xhigh；per `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md`）
> **审验对象**: v0.2 升级链（`e590124` 7 文件 + `459c916`/`161db8e` audit trail）+ M1c 实施链 6 commits（`200ded1`/`5171753`/`cdd8449`/`5543604` own + `c4a9192` EXEC + `39e6e54`/`b1477dd`/`b16cb19`/`19cade6` 4 merges，HEAD 已推）
> **判定**: **CHANGES REQUIRED** — **1 critical / 2 major / 2 minor**
> **注**: prompt 定位 precommit（8 文件待 commit）已失效——对象先 commit 且 M1c 实施已落地；本轮按 post-hoc 合同复审执行，报告仍落 §6.2 预定槽位

---

## §1 通过项（verbatim 实跑）

| 检查 | 实测 | 判定 |
|------|------|------|
| v1.0 runtime 0 行 diff | `git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml` = **0** | ✅ |
| DEEPSEEK_API_KEY 泄漏 | `sk-[a-z0-9]{32,}` docs/ + wrapper/ + deploy/ = **0** | ✅ |
| e590124 结构 | diff-tree = **恰好 7 文件**（5 DISPATCH-T-M1c + cc-ready + plan） | ✅ |
| M0c 收口链 | b768097/d168217/23f976e/6ea2fae/7a94ade/3efe7dc 全部存在，与 plan header §M0c PASS 证据一致 | ✅ |
| M1c 5 任务书 | §1-§8 齐全（145/151/159/164/155 行）；估时与 PRD-v1.1 §5 对齐 | ✅ |
| DD-1 后置 | EXEC §5 Step5 明文「等 user 真部署 + 真机 E2E 后单独派发」→ 6 commits 链无 DD-1 = **by-design 非缺位** | ✅ |
| 19cade6 merge resolution | package.json/lock 合并 + 测试取 QA-1 整合版，commit message 全透明 | ✅ |
| §10.4 | 7/8 [x]，#3 newvps 待 user（plan 实文 #3 为准） | ✅ |
| node_modules | git ls-files wrapper/ = 0（未 tracked） | ✅ |

## §2 Findings

### C1 (critical) wrapper 测试套件在 HEAD 双红，§10.4 check #2 gate 声明失真
- **实测**: `npx tsc --noEmit` = **exit 2，15 错**（`orchestrator/pwa_server.ts` TS2307 找不到 express；`playwright.config.ts`/`pwa_dispatch.test.ts` TS2307 找不到 @playwright/test + 4 处 implicit any；`tool_provider.test.ts` **7 处 TS2339**（Promise 未 await 直接取 .result/.denialReason/.artifactId/.capabilityId））；`npx vitest run` = **exit 1，4 文件 failed / 25 测试 failed / 75 passed（100）**
- **失真**: plan §10.4 check #2「TypeScript wrapper 实跑 `tsc --noEmit` exit 0 + `vitest run` 4 passed / 1 todo / 1 skipped」在 HEAD 不成立（M0c b768097 时点可能绿，M1c QA-1 测试扩容 + 19cade6 取 QA-1 版本后打红，**merge 收口前未复跑 gate**）
- **修法**: ① `wrapper/` 下 `npm install`（express/@playwright/test/@vitest/coverage-v8 按 lock 19cade6 已并入）；② tool_provider.test.ts 7 处补 `await`；③ e2e `page`/`msg` 参数补类型注解；④ 复跑 tsc exit 0 + vitest 全绿并回写报告

### M1 (major) 豁免清单锚定失效：声称 18 文件 47 处，实测 **53**
- **实测**: `grep -rE ... docs/ adr/ spec/capabilities/ | wc -l` = **53**；§1.5 清单 47 + 漏 6 = `docs/DISPATCH-T-M1c-EXEC.md`(1) + `docs/reports/T-M1c-{BE-1,TG-1,DO-1,QA-1}-report.md`(4) + `docs/reports/T-M0c-TG-1-report.md`(1)——实施报告/执行书带入守门字面未随 merge 更新清单；§1 L19 期望「≥ 43」同样对不上
- **修法**: §1.5 补 6 行（第 21-24 文件，24 文件 53 处）；锚定命令期望改 `== 53`

### M2 (major) 前向守门命令广 glob 复发（P1 第三次），verbatim 必 FAIL
- **实测**: audit-scope v0.2 §1 L14 范围含 `docs/DISPATCH-T-M0c-*.md docs/DISPATCH-T-M1c-*.md` 广 glob → 扫入 PRECOMMIT-FIX 执行书(3) + EXEC 执行书(1) + M1c 5 任务书字面(5) = **9 ≠ 0**；v0.1 轮 P1 承诺「随 M1c 首个 docs commit 捎带修」未兑现（v0.1 audit-scope 仍广 glob），且 v0.2 复制同款
- **修法**: 两份 audit-scope §1 glob 改 brace 精确列 `docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md`（本报告已按此验证前向 = 0；执行书/实施报告全部走 §1.5 豁免口径）

### m1 (minor) prompt 失真两处
- §2(B)「5 DISPATCH 全部用 audit-scope §1 引用，无字面 grep pattern」—— 实际 5 文件各含 1 行 §4 验证命令字面（audit-scope §1.5 #16-20 已如实豁免，prompt 说反）；§1.1/§2(A)「#8 newvps 待勾」—— plan §10.4 实文为 **#3**。修法：随 R2/R3 一并改

### m2 (minor) 状态滞后 + M0c 总报告缺位
- plan header + cc-ready 仍写「pending = user Start v1.1 M1」「v0.2 commit 等 push 落地」，实际 M1c 4 任务已实施收口推送（合理时差，但合同状态行已失真一个身位）；prompt §6.1 承诺的 `docs/DISPATCH-T-M0c-DONE.md` 至今未创建（M0b 有 DONE 先例）。修法：随 R4 刷新 + 从 6 commits 链汇编补建

## §3 结论与签发

- 实质架构面健康（v1.0 零漂移、key 零泄漏、结构正确、DD-1 后置设计清晰、merge 透明）；但 **gate 声明与 HEAD 现实脱节是硬伤**——测试双红状态下收口 4 merge，违反自家「验证命令必须 verbatim 通过」铁律。
- **签发 `T-M1c-GATE-REPAIR`**（执行书 `docs/DISPATCH-T-M1c-GATE-REPAIR.md`）：R1 测试修复双绿 → R2 豁免锚定 53 → R3 glob brace 双文件 → R4 prompt 两处 + 状态刷新 + M0c-DONE 补建 → 单 commit + push → 验收 verbatim。
- 修复 PASS 后不自动走：等 user 上 newvps 真部署 + iPhone 真机 E2E（EXEC §5 Step5）→ 派 T-M1c-DD-1-EXEC → v0.3 升级。

---

*codex review done — v0.2+M1c 合同 precommit（post-hoc）轮 **CHANGES REQUIRED（1C/2M/2m）**：tsc exit 2 + vitest 25 failed 打脸 §10.4 check #2、豁免锚定 47→53 漏 6、广 glob 三连发；通过项 9 组全绿。签发 T-M1c-GATE-REPAIR。*
