# DISPATCH — T-M1c-GATE-REPAIR-2（守门口径自洽 + gate 可复现，收尾轮）

> **Date**: 2026-09-02
> **来源**: `notes/codex-review-v1.1-m0c-v0.2-gaterepair-report.md`（GATE-REPAIR 轮验收 CHANGES REQUIRED 0C/3M/2m）
> **执行者**: CC；**单 commit + push 授权**
> **铁律**: 不动 v1.0 runtime；key env-inject only；**gate 声明必须 verbatim 可复现（含连跑 2 次）**

---

## §1 任务定义

清掉 GATE-REPAIR 轮残留 3M+2m：前向命令范围自洽（M-A）、锚定 tracked 重锚（M-B）、测试稳定化（M-C）、归档 + 翻牌（m1/m2）。修后单 commit + push。

## §2 修复项

### G1 (M-A) 前向命令范围
`notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1 前向命令：brace 去掉 `docs/DISPATCH-T-M1c-{…}` 五书 → 范围 = `docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md`，期望 == 0；加一行注释「M1c 5 任务书 §4 守门字面 5 行走 §1.5 #16-20 豁免（①自伤）」。v0.1 audit-scope §1 同步核对（其范围不含 M1c，无需动则注明）。

### G2 (M-B) 锚定 tracked 重锚 == 68
1. §1.5 拆两段：**docs 主表**（#1-28 去 #14/#15）+ **notes 自伤小节**（#14/#15 移入，标题注明不计入 docs 锚定）
2. docs 主表补漏：`docs/reports/T-M1c-GATE-REPAIR-report.md` **4 处**（①自伤）；归档后执行书 `docs/DISPATCH-T-M1c-GATE-REPAIR.md` 2 处保留；GATE-REPAIR-2 执行书 3 行 + GATE-REPAIR-2 report 5 行；主表合计改 **68**
3. §1 锚定命令改 tracked 口径：
   `git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'` 期望 == **68**
   （原磁盘口径命令保留为辅助，注明「含未归档工作文件会漂移，以 tracked 为准」）
4. `docs/DISPATCH-T-M0c-DONE.md` §1.5 引用 55 → 68；plan §10.4 相关引用同步

### G3 (M-C) 测试稳定化（连跑 2 次 0 failed）
1. `wrapper/test/integration/dsh_real.test.ts` denial 判定词表补 `"can't"` / `"won't"` / `"i can't help"`（或改 exit-code 断言）
2. `wrapper/vitest.config.ts` 加 `testTimeout: 30000`
3. `dsh_real.test.ts` 顶部 `const describeReal = process.env.RUN_DSH_REAL ? describe : describe.skip` 并替换 describe（真集成默认 skip，报告注明 skip 条数；真调 = `RUN_DSH_REAL=1 npx vitest run`）
4. 验证：`npx vitest run` **连跑 2 次**均 0 failed，结果回写 `docs/reports/T-M1c-GATE-REPAIR-2-report.md`（NEW，含两次尾行 verbatim）

### G4 (m1/m2) 归档 + 翻牌
归档 `docs/DISPATCH-T-M1c-GATE-REPAIR.md` + `notes/codex-review-v1.1-m0c-v0.2-precommit-report.md` + `notes/codex-review-v1.1-m0c-v0.2-gaterepair-report.md` + 本执行书；cc-ready task_id → **`T-M1c-AWAIT-DEPLOY`**（status：M1c 实施收口 + gate 双绿可复现；pending = user 上 newvps 真部署 + iPhone 真机 E2E → 派 T-M1c-DD-1-EXEC → v0.3；commit 字段填实号）。

## §3 提交

单 commit：`fix(m1c): T-M1c-GATE-REPAIR-2 — 前向范围自洽 + 锚定 tracked 68 + 测试稳定化 + 归档`（audit-scope + M0c-DONE + plan + vitest.config + dsh_real.test + cc-ready + 4 归档文件 + 1 NEW 报告）→ Clash proxy push。

## §4 验收（verbatim）

```bash
cd wrapper && npx tsc --noEmit; echo $?                                                    # 0
npx vitest run --reporter=basic 2>&1 | tail -3   # 0 failed；再跑一次仍 0 failed
cd ..
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'   # == 68
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md | wc -l   # == 0
jq -r '.task_id' docs/poll/cc-ready.json                                                  # T-M1c-AWAIT-DEPLOY
git status --porcelain | wc -l                                                            # == 0（全归档）
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l   # == 0
grep -rE "sk-[a-z0-9]{32,}" docs/ wrapper/ deploy/ 2>/dev/null | wc -l                    # == 0
```

## §5 完成后（不自动走）

push + 验收 8/8 → 通知 user 走 formal 轮（亲提 Codex → `notes/codex-review-v1.1-m0c-v0.2-formal-report.md`）；PASS 后 user 上 newvps 真部署 + iPhone 真机 E2E → 派 T-M1c-DD-1-EXEC → v0.3 升级。
