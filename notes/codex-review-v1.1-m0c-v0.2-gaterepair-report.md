# Codex 验收报告 — T-M1c-GATE-REPAIR（GATE-REPAIR 轮验收，CHANGES REQUIRED 收窄）

> **Date**: 2026-09-02
> **Reviewer**: Codex（gpt-5.6-sol 风格，xhigh；per `docs/DISPATCH-T-M1c-GATE-REPAIR.md` §4）
> **验收对象**: `cbca896`→`50ede17`（3 个 dsh_client 调试/修复 commits，范围仅 wrapper/dsh）+ `dc4bc33`（GATE-REPAIR 修复 commit，HEAD，已推）
> **判定**: **CHANGES REQUIRED** — 0 critical / **3 major / 2 minor**（收尾小修轮可清）

---

## §1 通过项（verbatim 实跑）

| 检查 | 实测 | 判定 |
|------|------|------|
| R1-a tsc | `npx tsc --noEmit` = **exit 0**（15 错全清） | ✅ |
| R3 glob 残留 | 两 audit-scope `T-M0c-*`/`T-M1c-*` = **0** | ✅ |
| 双零 | v1.0 runtime diff = **0**；`sk-` = **0** | ✅ |
| R4 M0c-DONE | `docs/DISPATCH-T-M0c-DONE.md` 存在（5 段） | ✅ |
| R4 prompt 修正 | 「#8」→「#3」✅；「无字面 grep pattern」句已改 ✅ | ✅ |
| R4 状态刷新 | plan header 含 GATE-REPAIR 实况 ✅；cc-ready task_id = T-M1c-GATE-REPAIR | ✅（待翻回，见 m2） |
| 范围纪律 | 3 个额外 commits 仅触 `wrapper/dsh/dsh_client.ts` | ✅ |
| vitest 主体 | 97 passed / 99（2 failed 见 M-C） | ◐ |

## §2 Findings

### M-A (major) §1 前向命令 brace 范围与豁免归属自矛盾 —— verbatim = 5 ≠ 0
- audit-scope v0.2 §1 前向命令 brace **含 M1c 5 任务书**，而 §1.5 #16-20 已将同一批文件 §4 守门字面（5 行）列为豁免 → 同一批文件既在前向又在豁免。实测 verbatim = **5 ≠ 0 ≠ 期望 0**；commit msg「forward guard 0 行」与实测不符
- **修法**：前向命令 brace 去掉 M1c 5 书（保留 `docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-{BE-1,TG-1,DO-1,QA-1,DD-1}.md`）→ == 0；注释注明「M1c 5 任务书 §4 守门字面 5 行走 §1.5 #16-20 豁免」

### M-B (major) 豁免锚定四数字无一口径对上实测
- 实测：**58（tracked-only）/ 60（磁盘含 untracked 执行书 2）**；§1.5 清单合计 **56**；§1 锚定期望 **62**；M0c-DONE 引用 **55** —— 四个数字互相打架
- 差异归因：① `docs/reports/T-M1c-GATE-REPAIR-report.md` 实测 **4 处漏列**（清单只记「GATE-REPAIR 1 文件 2 行」= untracked 执行书）；② 执行书未入库却提前入清单；③ §1.5 #14/#15 为 notes/ 文件与 docs 混编，「26 文件」标题与明细错位
- **修法**：先归档（见 m1），再以 **tracked 口径重锚**：`git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE … | grep -v :0 | awk -F: '{s+=$NF} END{print s}'` == §1.5 docs 明细合计（归档后 == 60）；§1.5 拆「docs 主表 + notes 自伤小节」两段；M0c-DONE 引用同步

### M-C (major) vitest gate 不可稳定复现（声明 0 failed，实测 2 failed × 非确定性根因）
- fail#1 `dsh_real > handles denial gracefully`：模型回复「I **can't** help with that…」exit 0，判定词表只含 `cannot` 等 → 措辞漂移即红（LLM 输出非确定性）
- fail#2 `dsh_client > accepts modelClass values`：**5s 默认超时** < 真 dsh 调用实测 1.5-3.5s+ 波动（该文件普遍 1.6-3.5s）→ 负载波动即红
- **修法**：① denial 判定词表补 `can't` / `won't` / `i can't help`（或改 exit-code 断言）；② `vitest.config.ts` `testTimeout: 30000`；③ `dsh_real.test.ts` 顶部 `describe.skipIf(!process.env.RUN_DSH_REAL)`——真集成默认 skip 保 gate 稳定，真调留 env gate；修后**连跑 2 次 0 failed**

### m1 (minor) 执行书 + precommit 报告未归档
- `docs/DISPATCH-T-M1c-GATE-REPAIR.md`（untracked，还污染锚定口径）+ `notes/codex-review-v1.1-m0c-v0.2-precommit-report.md` 未入库。**修法**：随 GATE-REPAIR-2 单 commit 归档

### m2 (minor) cc-ready 未翻回
- 停在 `T-M1c-GATE-REPAIR`。**修法**：修复完成翻 `T-M1c-AWAIT-DEPLOY`（等 user 上 newvps 真部署 + iPhone 真机 E2E → 派 DD-1）

## §3 结论与签发

- 实质修复大头已落地（tsc 15 错清零、glob 清零、M0c-DONE 补建、prompt/状态刷新、双零延续）；残留 = **守门口径自洽性 + gate 可复现性**两关，均为小修。
- **签发 `T-M1c-GATE-REPAIR-2`**（执行书 `docs/DISPATCH-T-M1c-GATE-REPAIR-2.md`）：G1 前向范围 → G2 tracked 重锚 60 → G3 测试稳定化连跑双绿 → G4 归档 + 翻牌 → 单 commit + push → 验收 verbatim。
- 之后不自动走：formal 轮（user 亲提）→ user 上 newvps 真部署 + iPhone 真机 E2E → 派 T-M1c-DD-1-EXEC → v0.3。

---

*codex review done — GATE-REPAIR 轮验收 **CHANGES REQUIRED（0C/3M/2m）**：tsc 15→0 与双零守住，但前向命令 verbatim=5≠0（豁免归属自矛盾）、锚定四数字打架（GATE-REPAIR-report 4 处漏列）、vitest 非确定性 2 failed（词表+超时）；签发收尾轮 T-M1c-GATE-REPAIR-2。*
