# Codex 复审报告 — v1.1 M0c v0.2 升级 + M1c 实施（formal 轮，终审）

> **Date**: 2026-09-02
> **Reviewer**: Codex（gpt-5.6-sol 风格，xhigh；per `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md` §4 提交模板）
> **复审基线**: HEAD = `dc4bc33` + GATE-REPAIR-2 staged 10 文件（formal PASS 后单 commit + push，流程 by-design）
> **判定**: **PASS** — 0 critical / 0 major / **1 minor polish**（随 formal commit 顺手清）
> **上游链**: precommit 轮 1C/2M/2m → GATE-REPAIR 轮 0C/3M/2m → GATE-REPAIR-2 全清（本报告终审）

---

## §1 GATE-REPAIR-2 验收（执行书 §4 八组，verbatim 实跑）

| # | 检查 | 实测 | 判定 |
|---|------|------|------|
| 1 | `npx tsc --noEmit` | **exit 0**（15 错保持清零） | ✅ |
| 2 | vitest 连跑 ×2 | 两次均 **8 文件 passed/1 skipped；95 passed / 4 skipped / 0 failed，exit 0** —— 稳定可复现（cc-ready 声称 94/5，实为 skip 归类差 1，无 failed 达标） | ✅ |
| 3 | tracked 锚定 | `git ls-files … xargs grep -cE …` 合计 = **68** == §1.5 docs 主表合计 68 == 标题 68 == 磁盘口径 68 —— **四源同值**；29 文件构成注记详实（v0.1 13 文件 42 行 + v0.2 新增 16 文件 26 行） | ✅ |
| 4 | 前向守门（audit-scope 权威口径，M1c 5 书归 §1.5 #16-20 豁免） | **== 0** | ✅ |
| 5 | cc-ready | task_id = `T-M1c-AWAIT-DEPLOY`；status/pending 链准确 | ✅ |
| 6 | 归档结构 | staged 10 文件齐（2 执行书 + 2 报告归档 + audit-scope + cc-ready + vitest.config + dsh_real.test + GATE-REPAIR-2-report NEW） | ✅ |
| 7 | v1.0 runtime | `git diff v1.0.0..HEAD` 六区域 = **0 行** | ✅ |
| 8 | key 泄漏 | `sk-[a-z0-9]{32,}` docs/ + wrapper/ + deploy/ = **0** | ✅ |

**G3 机制落地实证**：`dsh_real.test.ts` 双 guard（`RUN_DSH_REAL=1` AND `DEEPSEEK_API_KEY`）默认 skip 保 gate 稳定；`vitest.config.ts` `testTimeout: 30000`；denial 词表补 `can't`/`won't`/`i can't help`/`sorry`（L104-109）——M-C 非确定性根因三件全修。

## §2 prompt §7 checklist (A)-(G)

- **(A)** v0.2 升级完整：Header `🟢 v0.2 (M1c 实施中)` ✅、§10.4 7/8 [x]（#3 newvps 待 user）✅、§11 v0.2→v1.0 门槛在位 ✅、M0c 6 commits PASS 证据锚定 ✅
- **(B)** M1c 5 任务书 §1-§8 齐全（145-164 行）✅；估时与 PRD-v1.1 §5 对齐 ✅
- **(C)** headless profile（TG-1 §4 #7 链）✅
- **(D)** v1.0 runtime 0 行 diff ✅
- **(E)** key 零泄漏 + env-inject ✅
- **(F)** cc-ready 事实准确（task_id / 锚定引用机制式而非写死数字）✅
- **(G)** G1-G7 历轮已探查，本轮无新增 ✅

## §3 Findings

| ID | 等级 | 位置 | 描述 | 处置 |
|----|------|------|------|------|
| F1 | minor polish | prompt §3-D2（L131-133） | 前向命令仍含 `docs/DISPATCH-T-M1c-{…}` 五书（verbatim = **5 ≠ 0**），未随 G1 同步 audit-scope 权威口径（audit-scope 已去 M1c 5 书 == 0；M1c 5 书 §4 字面 5 行已列 §1.5 #16-20 豁免） | L132 范围去 M1c 5 书 + 注明「走 §1.5 #16-20 豁免」；**随 formal PASS 后的单 commit 顺手清**（notes/ 工装文件，不构成合同缺陷） |

## §4 结论 + 下一枪

- **PASS**。v0.2 升级 + M1c 实施合同在三轮修复后全绿收口：测试 gate 稳定可复现（连跑双绿）、守门口径三源同值（68）、前向 == 0、双零延续、audit trail 完整归档 staged。F1 为复审工装自身一处命令滞后，不阻塞。
- **下一枪（CC 执行，随后停等 user）**：
  1. 顺手修 F1（prompt L131-133 同步 audit-scope 口径）
  2. 单 commit：staged 10 文件 + 本 formal 报告 + F1 修改 → `fix(m1c): T-M1c-GATE-REPAIR-2 + formal PASS 归档` → Clash proxy push
  3. cc-ready 保持 `T-M1c-AWAIT-DEPLOY`
- **然后停等 user 信号（不自动走）**：
  - user 上 newvps 真部署（`docker compose -f deploy/newvps-compose.yml up -d` + `tailscale serve`，gotchas 文档 6 坑已实战）+ iPhone Safari 真机 E2E 4 步
  - → 架构师派 `T-M1c-DD-1-EXEC`（CHANGELOG `[1.1.0-M1c]` + README + v0.3 准备）
  - → §10.2/§11 门槛验证 → v0.3 升级 → M2（6 host + STT + Web Push）

---

*codex review done — v0.2+M1c formal 轮 **PASS（0C/0M/1 minor polish）**：八组验收全绿（tsc 0 / vitest 连跑 95p4s0f / 锚定四源同值 68 / 前向 0 / 双零）；F1 prompt §3-D2 命令滞后随 commit 顺手清；签发「commit+push → 停等 user 真部署」。*
