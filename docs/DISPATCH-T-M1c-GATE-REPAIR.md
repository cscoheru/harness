# DISPATCH — T-M1c-GATE-REPAIR（M1c gate 修复 + 守门口径修正，v0.3 前置）

> **Date**: 2026-09-02
> **来源**: `notes/codex-review-v1.1-m0c-v0.2-precommit-report.md`（Codex precommit 轮 CHANGES REQUIRED 1C/2M/2m）
> **执行者**: CC（R1 测试修复可 subagent 辅助）；**单 commit + push 授权**
> **铁律**: 不动 v1.0 runtime（ADR 0010 d）；DEEPSEEK_API_KEY env-inject only；Claude 不亲提 Codex；**merge/收口前必须复跑 gate**

---

## §1 任务定义

修复 HEAD 上 M1c 收口遗留：测试套件双红（C1）+ 豁免锚定失效（M1）+ 前向守门广 glob 复发（M2）+ prompt/状态失真（m1/m2）。修后单 commit + push。

## §2 修复项

### R1 (C1) wrapper 测试双绿
1. `cd wrapper && npm install`（express ^5.0.1 / @playwright/test ^1.62.1 / @vitest/coverage-v8 ^3.2.7 per package-lock 19cade6）
2. `test/unit/tool_provider.test.ts` L95/102/109/116/122/128 等 7 处：invoke 调用前补 `await`（TS2339 全清）
3. `test/e2e/pwa_dispatch.test.ts` L27/43/96 `page` 与 L98 `msg` 参数补显式类型（或 `import type { Page }` from '@playwright/test'）消 implicit any
4. 复跑：`npx tsc --noEmit` **exit 0**；`npx vitest run` **0 failed**；结果回写 `docs/reports/T-M1c-GATE-REPAIR-report.md`（NEW，含 verbatim 输出尾行）

### R2 (M1) 豁免锚定 53
`notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1.5 补 6 行：#21 `DISPATCH-T-M1c-EXEC.md`(1)/#22-25 `docs/reports/T-M1c-{BE-1,TG-1,DO-1,QA-1}-report.md`(4)/#26 `docs/reports/T-M0c-TG-1-report.md`(1)；标题改「**26 文件 53 处**」；§1 锚定期望改 `== 53`

### R3 (M2) 前向 glob brace 化（两文件）
`notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1 与 `notes/codex-audit-scope-v1.1-m0c-v0.1.md` §1：`docs/DISPATCH-T-M0c-*.md`/`docs/DISPATCH-T-M1c-*.md` → `docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md`（v0.1 轮 P1 欠账一并清；执行书/实施报告一律走 §1.5 豁免）

### R4 (m1/m2) prompt/状态/DONE
1. prompt §2(B) 改「5 DISPATCH §4 各含 1 行守门字面（per §1.5 #16-20 豁免）」；「#8 newvps」→「#3」
2. plan header Status + cc-ready status：M1c 4 任务实施收口（6 commits 链）+ gate 修复完成，pending = user 上 newvps 真部署 + iPhone 真机 E2E
3. 补建 `docs/DISPATCH-T-M0c-DONE.md`（M0c 总报告 5 段，从 6 commits 链 + 5 subagent 报告汇编，格式 per DISPATCH-T-M0b-DONE.md）

## §3 提交

单 commit：`fix(m1c): T-M1c-GATE-REPAIR — tsc/vitest 双绿 + 守门锚定 53 + glob brace + M0c-DONE`（含 wrapper/ 修复 + 2 audit-scope + prompt + plan header + cc-ready + 2 NEW 报告）→ Clash proxy push。

## §4 验收（verbatim）

```bash
cd wrapper && npx tsc --noEmit; echo $?                       # 0
npx vitest run --reporter=basic 2>&1 | tail -4                # 0 failed
cd ..
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ | wc -l          # == 53
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md | wc -l   # == 0
grep -c "53 处" notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md                  # ≥ 2
grep -c "T-M0c-\*\|T-M1c-\*" notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md     # == 0（glob 清零）
test -f docs/DISPATCH-T-M0c-DONE.md && echo OK                                          # OK
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l   # == 0
grep -rE "sk-[a-z0-9]{32,}" docs/ wrapper/ deploy/ 2>/dev/null | wc -l               # == 0
```

## §5 完成后（不自动走）

push + 验收 8/8 → 通知 user 走 formal 轮（亲提 Codex，input=修订后 prompt → `notes/codex-review-v1.1-m0c-v0.2-formal-report.md`）；PASS 后等 user 上 newvps 真部署 + 真机 E2E → 派 T-M1c-DD-1-EXEC → v0.3。
