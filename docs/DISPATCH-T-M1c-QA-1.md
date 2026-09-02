# DISPATCH-T-M1c-QA-1 — iPhone Safari 真机 E2E + dsh 真调集成测试

> **Role**: QA (Quality Assurance — Spike Validation & E2E)
> **Stage**: v1.1 M1c 实施合同（**等 user 「Start v1.1 M1」启动**；**真机 E2E 由 user 真实操作**）
> **Date**: 2026-09-02
> **Source**: `docs/v1.1-ga-team-plan.md` v0.2 §2.4 Role QA / §6.2 M1c PR10 / §10.4 v0.2 准备清单

---

## §1 任务定义

**一句话**: 把 M0c 落地的 `wrapper/test/{unit,integration,e2e}/*.test.ts` skeleton 升级到 dsh 真调集成测试（mock 替换为真 dsh，env-inject DEEPSEEK_API_KEY）+ iPhone Safari 真机 E2E 4 步（PWA 打开 / 表单提交 / 24h 完成 / 完成态可见）。

**范围**:
- ❌ 不做: 6 host E2E (M2) / STT 准确率真机 5 人 × 50 句 (M2) / Web Push 真机 iOS 16.4+ (M2)
- ❌ 不做: 真机 E2E 真实执行 (QA-1 仅写真机 E2E 脚本 + 验证清单; user 真机 + 真部署后填)
- ✅ 做: dsh 真调集成测试 (env-inject) + iPhone Safari E2E 4 步脚本 + Playwright 真机 E2E 占位 + 验证清单

**关键路径产物**:
1. `wrapper/test/integration/dsh_real.test.ts` (与 TG-1 协作; TG-1 主写, QA-1 复核)
2. `wrapper/test/e2e/pwa_dispatch.test.ts` (NEW): Playwright 真机 E2E 脚本 (4 步: 打开 PWA → 提交表单 → 轮询 status → 完成态可见)
3. `wrapper/test/e2e/runbook-iphone-safari-m1c.md` (NEW): user 真机 E2E step-by-step runbook (待 user 在 iPhone Safari 上执行)
4. `wrapper/test/unit/{orchestrator,dsh_client,tool_provider}.test.ts` (M0c skeleton 已建, M1c 扩覆盖率 ≥ 80%)
5. 集成测试 `wrapper/test/integration/orch_kernel.test.ts` (与 BE-1 协作; BE-1 主写, QA-1 复核)

## §2 输入

- M0c QA-1 集成测试骨架 commit `23f976e` (`wrapper/test/{unit,integration,e2e}/*.test.ts`)
- M0c vitest 配置 commit `23f976e` (`wrapper/vitest.config.ts`)
- M0c dsh_client fix commit `3efe7dc` (TS2834 node16 import path)
- `spikes/` (v1.0 spike 5627 行, mock 参考; v1.0 frozen)
- M0b QA-1 等价类对比报告 commit `50d4c29`
- PRD-v1.1 §5 M1 范围 (收紧版 MVP: 4 步 E2E: PWA 打开 / 表单提交 / 24h 完成 / 完成态可见)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§4 (hygiene 守门)

## §3 产出

| # | 文件 | 行数估 | 内容 |
|---|------|--------|------|
| 1 | `wrapper/test/integration/dsh_real.test.ts` (与 TG-1 协作) | ~100 行 | 真 dsh 调用 (env-inject DEEPSEEK_API_KEY) + 3 档 profile 各跑 1 次 + 退出码/输出格式验证 |
| 2 | `wrapper/test/integration/orch_kernel.test.ts` (与 BE-1 协作) | ~80 行 | mock kernel server + 真 dsh_client + 派工 → 完成 → 状态查询 闭环 |
| 3 | `wrapper/test/e2e/pwa_dispatch.test.ts` (NEW) | ~120 行 | Playwright 真机 E2E 脚本: 4 步 (打开 PWA → 提交表单 → 轮询 status → 完成态可见) |
| 4 | `wrapper/test/e2e/runbook-iphone-safari-m1c.md` (NEW) | ~100 行 | user 真机 E2E step-by-step runbook: §1 前置 (iPhone Safari + Tailscale 登录) / §2 4 步执行 / §3 验证清单 / §4 排错 |
| 5 | `wrapper/test/unit/{orchestrator,dsh_client,tool_provider}.test.ts` (M1c 扩) | +80 行 | 单元测试覆盖率扩到 ≥ 80% |
| 6 | `docs/reports/T-M1c-QA-1-report.md` (NEW) | ~120 行 | 实跑报告: §1 任务完成度 / §2 实跑数据 (vitest 覆盖率 + 真机 E2E 4 步, 待 user 真机填) / §3 问题与解决 / §4 cross-ref |

## §4 验证命令 (架构师 + user 真机后验证)

```bash
# 1. 单元 + 集成测试实跑
cd wrapper && npm test
# 期望: exit 0 + 覆盖率 ≥ 80% (per M0b §6.X QA-1 标准)

cd wrapper && npm run test:integration
# 期望: exit 0 + 含 dsh_real.test.ts + orch_kernel.test.ts 全过

# 2. iPhone Safari 真机 E2E 4 步 (per T-M1c-QA-1 §4 #2, 待 user 真机执行):
#   步骤 1: iPhone Safari 打开 https://harness.rana.asia/ (走 Tailscale)
#           期望: 看到 PWA 文字表单 (input + submit button)
#   步骤 2: input 输入 "调研 React 19 新特性" + 点击 submit
#           期望: 返回 task_id + 显示任务状态 (pending → running)
#   步骤 3: 轮询 status (前端 JS setInterval 5s)
#           期望: 24h 内 status 从 running → done
#   步骤 4: 看到完成态 (结果显示在 PWA 页面)
#           期望: status: done + result 内容可读

# 3. Playwright 真机 E2E 占位 (M1c 仅占位; M2+ 才跑完整 Playwright)
cd wrapper && npm run test:e2e:smoke
# 期望: exit 0 + smoke 测试通过 (仅打开 PWA + 验证表单元素可见)

# 4. v1.0 runtime 不漂移 (per v0.2 §3)
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行

# 5. 不锁型号 (per v0.2 §1)
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/test/ | wc -l
# 期望: 0 行

# 6. DEEPSEEK_API_KEY 不泄漏 (per v0.2 §2)
grep -rE "sk-[a-z0-9]{32,}" wrapper/test/ | wc -l
# 期望: 0 行 (env-inject only)

# 7. dsh headless profile (per v0.2 §4)
grep -rE "profile: ['\"]web['\"]" wrapper/test/ | wc -l
# 期望: 0 行

# 8. 覆盖率 ≥ 80%
cd wrapper && npm run test:coverage
# 期望: All files | ≥ 80% (Lines / Branch / Functions / Statements)
```

## §5 估时

**5 工作日** (与 BE-1/TG-1/DO-1 并行; 依赖 BE-1/TG-1 部分产出):
- Day 1: 单元测试覆盖率扩到 ≥ 80%
- Day 2: 集成测试 dsh_real.test.ts + orch_kernel.test.ts (与 TG-1/BE-1 协作)
- Day 3: Playwright 真机 E2E 占位 (pwa_dispatch.test.ts smoke 版)
- Day 4: runbook-iphone-safari-m1c.md user 真机 E2E runbook
- Day 5: user 真机 E2E 验证 (待 user 上 newvps 部署后, 在 iPhone Safari 执行 4 步)

## §6 报告模板 (docs/reports/T-M1c-QA-1-report.md)

```markdown
# T-M1c-QA-1 — iPhone Safari 真机 E2E + dsh 真调集成测试 实施报告

## §1 任务完成度
- [ ] §3 产出 6 文件全部落地 (含协作产出)
- [ ] §4 验证命令 #1 + #3-#8 本地 exit 0 (单元/集成/Playwright/守门)
- [ ] §4 验证命令 #2 待 user 上 newvps 部署 + iPhone Safari 真机执行后填

## §2 实跑数据
- 单元测试: vitest N passed / M todo / 覆盖率 ≥ 80%
- 集成测试: dsh_real.test.ts 3 档 profile 各跑 1 次 + orch_kernel.test.ts 派工 → 完成 → 状态查询 闭环 全过
- Playwright smoke: 打开 PWA + 验证表单元素可见
- 真机 E2E 4 步 (待 user 真机执行):
  - 步骤 1: iPhone Safari 打开 https://harness.rana.asia/ ✅/❌
  - 步骤 2: 表单提交 "调研 React 19 新特性" → 返回 task_id ✅/❌
  - 步骤 3: 轮询 status 24h 内 running → done ✅/❌
  - 步骤 4: 完成态可见 + result 可读 ✅/❌

## §3 问题与解决
- (列实跑中遇到的问题 + 修法)

## §4 cross-ref
- docs/v1.1-ga-team-plan.md v0.2 §2.4 + §6.2 PR10 + §10.4 v0.2 准备清单
- docs/DISPATCH-T-M0c-QA-1.md
- docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1}.md
- notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md §1-§4

## §5 守门自检
- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 集成测试 (dsh_real + orch_kernel) 全过
- [ ] Playwright smoke exit 0
- [ ] iPhone Safari 真机 E2E 4 步 全过 (待 user 真机)
- [ ] 不锁型号 grep = 0
- [ ] DEEPSEEK_API_KEY 完整 key grep = 0
- [ ] v1.0 runtime 0 行 diff
- [ ] dsh headless profile (无 web profile)
```

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` v0.2 §2.4 + §6.2 PR10 + §10.4 v0.2 准备清单
- `docs/DISPATCH-T-M0c-QA-1.md` (M0c 集成测试骨架输入)
- `docs/DISPATCH-T-M1c-BE-1.md` (BE-1 wrapper + PWA server)
- `docs/DISPATCH-T-M1c-TG-1.md` (TG-1 dsh_client 真调)
- `docs/DISPATCH-T-M1c-DO-1.md` (DO-1 newvps 真部署, 真机 E2E 前置)
- `docs/DISPATCH-T-M1c-DD-1.md` (DD-1 CHANGELOG/README 同步 E2E 步骤)
- `wrapper/test/` (M0c skeleton 输入)
- `spikes/` (v1.0 spike mock 参考)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§4

## §8 禁止

- ❌ 不做 6 host E2E (M2) / STT 准确率真机 5 人 × 50 句 (M2) / Web Push 真机 iOS 16.4+ (M2)
- ❌ 不做真实 iPhone Safari 执行 (QA-1 仅写脚本 + runbook; user 真机 per §10.4 v0.2 准备清单)
- ❌ 不硬编码 DEEPSEEK_API_KEY (env-inject only)
- ❌ 不锁具体模型型号 (per NORTH-STAR A-4)
- ❌ 不动 v1.0 runtime (mock 参考用 v1.0 spikes 但不改)
- ❌ 不调 dsh `web` profile (per M0b QA-1 §6.X 修订)
- ❌ 不直接 commit 到 main (实施者 PR → 架构师 merge)

---

*DISPATCH-T-M1c-QA-1 — iPhone Safari 真机 E2E + dsh 真调集成测试 任务书；真机执行由 user 真实操作 (per §10.4 v0.2 准备清单 + §6.2 PR10)；hygiene 守门见 `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md`*