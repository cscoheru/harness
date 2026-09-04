# Codex 复审报告 — v1.2.0a v0.1 commander 真实现 + workflow_pack（工作区实施态，发现+同轮收口一体）

> **Date**: 2026-09-04
> **Reviewer**: Codex（gpt-5.6-sol 风格，xhigh；per `notes/codex-audit-scope-v1.2.0a-v0.1-prompt.md`）
> **审验对象**: v1.2.0a 工作区实施（**未提交**：M 8 + NEW 7）+ 合同双文件（audit-scope 505 行 + prompt 268 行）；上游 v1.1.1 后 13 commits（D-7~D-10 + ACL 修复）一并入镜（无独立复审轮，欠账本轮代偿）
> **判定**: **收口 PASS（0C/3M/4m → 同轮全修 → 全绿）**——§4.10 commander 真实现 14 项守门全绿 + 双 gate **tsc 0 / vitest 147p-95s-0f**
> **基线**: HEAD = `70408dc`；cc-ready（工作区）= `T-V1.2.0A-COMMANDER-PASS`；v1.1.1 tag 已打

---

## §1 通过项（verbatim，全绿）

| 域 | 实测 |
|----|------|
| 三源锚定 | tracked **116/48**（-1 系 v1.1.1 后历史文件编辑，audit-scope 已注记溯源 ✓ 实测前置达标）+ disk **127** + 自伤 **11**；演进链 …→117→116 |
| 前向 + orch | 前向 3 文件 0；wrapper/orchestrator/ 型号 0；orch API-key 0；sk/tskey/VAPID 0；v1.0 diff 0 |
| **§4.10 commander 真实现** | TODO(M1) in commander.ts **0**（stub 清零 ✓）；WorkflowPack 3 / PlanPlan\|PlanStep 10 / AggregateError 5 / orchestrator 真走 commander 7 / 三态字段 10 / loadManifest 4 / gated 集成 4 / version 7 / plan_steps 2 / 单测增量 39（≥25）/ 双文件 EXISTS |
| 其余继承 | headless **48**（19→48 系 v1.2.0a 新增）/ heuristic 10 / IP 1 白名单 / ts.net 53 / Funnel 48 / sleep 0 / edge 34 / tag 11 / STT 0 / signVapidJwt 31 / dsa 2 / install 1/1/1/0 / 残留 0 |
| 双 gate | tsc **0**；vitest **147p / 95s / 0f (242)**（修复后稳定） |

## §2 Findings（3M + 4m，同轮收口）

### M1 §2.7「v0.7 锚定维持」未实测前置——8-endpoint 实测 2 ≠ ≥8
- D-9 Option B（`791b84a`/`7150929`）重构后 5 endpoint 走 `registerApiRoute()` 封装（直连 + Funnel stripped **双注册**），SPA fallback 移交 pwa_server.ts（L111 `*path`）——**功能 7/7 + PWA 分离完整**，但「锚定维持」条目直接抄 v0.7 pattern 未跑（第 14 次先跑后写病灶：**锚定维持类条目同样必须实测**）
- **收口**：pattern 加 `registerApiRoute\('` 分支（实测 2+5=**7**）+ 注记 D-9 架构（v1.1.1 后 13 commits 无守门轮的漂移，本轮代偿捕获）

### M2 workflow_pack.ts PACKS_DIR cwd 相对——容器内 manifest 恒 synthetic（真 bug）+ 违反合同 §2.8
- `resolve('workflow_packs')`（cwd 相对）+ **deploy/env 零注入 WORKFLOW_PACKS_DIR** → 容器 working_dir=/app/wrapper 解析到不存在路径 → loadManifest **静默恒走 synthetic fallback**，`workflow_packs/default.json` 生产永不生效；且 prompt §2.8 期望 `import.meta.url ≥ 1`（合同正确，实现未做）
- **收口**：PACKS_DIR 改 `WORKFLOW_PACKS_DIR env ?? fileURLToPath(import.meta.url) → ../../workflow_packs`（与 v0.7 §4.8 四 dsh 文件同模式，cwd 无关）；实测 imu-orch = **2** ✓

### M3 server.test 真 dsh 依赖 flaky——违反 §7-2 自家设计（「unit 默认走 heuristic」）
- 本机装 dsh + shell 导出 DEEPSEEK_API_KEY 时，POST /api/v1/tasks 用例真调 callDshHeadless（commander profile，**60s timeout > test 30s**）→ 偶发挂起 1-failure（首验后稳定复现）；§7-2 教训条款明写 unit 不依赖 key，实现却是「先烧 60s 再 fallback」
- **收口**（双管）：①`plan()` 开头无 DEEPSEEK_API_KEY 短路 `heuristicPlan`（无 key 秒回 + 生产 misconfig 快败）②server.test.ts 模块体 `delete process.env['DEEPSEEK_API_KEY']`（单测确定性；gated 集成测试自带注入不受影响）→ vitest **147p/0f 稳定**

### minors（4）
- **m1** §2.4 dsh 调用 pattern `dsh.*--profile` 抓不到 `callDshHeadless` 封装（实测 0 误报）→ pattern 校准，实测 2
- **m2** §4.10 c2 期望 `TODO-dir == 0` 与「worker.ts 仍待 v1.2.0b」注记自相矛盾（起草版对 untracked 工作区误测 git 态）→ 校准 `== 16`（commander.ts 0 ✓ + worker.ts 16 保留）
- **m3** c10 pattern `source.*heuristic|catch.*plan` 命中 1 误报 → 宽词校准，实测 11（含修复注释）
- **m4** 注记过时：headless 19→48、vitest 基准 146p-96s→147p-95s → 同步

## §3 终验（收口后）

8ep 2+5=**7** ✓（注记 D-9 架构）；dsh 封装 2 ✓；imu-orch **2** ✓；heur 11 ✓；TODO-dir 16（commander 0）✓；三源 **116/127/11** 稳定（校准零自引入）✓；tsc 0 / vitest **147p-95s-0f** ✓；cc-ready true ✓。

## §4 判定与下一步

**v1.2.0a v0.1 收口 PASS（0C/0M/0m 终态）**：commander 真实现实质达标（stub 清零 + WorkflowPack DAG + AggregateError 三态 + orchestrator 真走 7 处 + 39 单测 + gated 集成）；3M 均系「合同-实施错位」而非功能缺失，同轮双向校准。**全部改动保持工作区未提交**（实施本体 + 本轮 3 处代码修复 + 合同校准），随 v1.2.0a dispatch 链统一入库。**pending**：v1.2.0a commit 链 + `v1.2.0a` tag（user）；U5/U6 真机链维持；worker.ts 真实现 v1.2.0b。

---

*codex review done — v1.2.0a v0.1 **收口 PASS（0C/3M/4m 同轮清零）**：M1 8-endpoint 锚定未实测（D-9 registerApiRoute 双注册漂移，2+5=7 功能完整）/ M2 PACKS_DIR cwd 相对致容器 manifest 恒 synthetic（import.meta.url 化修复）/ M3 server.test 真 dsh 60s 挂起 flaky（§7-2 key 短路 + 单测 unset 双修，147p-0f 稳定）；§4.10 commander 14 项全绿 + 双 gate 绿 + 三源 116·127·11；v1.1.1 后 13 commits 欠账轮代偿捕获 D-9 漂移；第 14 次先跑后写病灶（锚定维持类也要跑）记档。*
