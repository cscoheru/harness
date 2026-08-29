# Fish Harness PRD v0.7

> **版本**：v0.7
> **日期**：2026-08-29
> **状态**：**Stage gate 文档；不含可执行契约**
> **位置**：`/Users/kjonekong/projects/fish-harness/PRD-v0.7.md`
> **配套**：`spec/`（schema + Protocol + state machine）、`spikes/m0/`（可执行证据）、`adr/`（架构决策）

---

## 1. 文档定位

**v0.7 = 拆分第一版**。本文件**仅**包含产品目标、范围、用户流程、Stage gate 和决策日志。
可执行契约（schema、Protocol、state machine、JSON Schema、conformance fixture）必须放在 `spec/`、`spikes/m0/`、`adr/`，由 CI 实际执行。

**历史 PRD**（v0.1-v0.6）保留为审计追踪，**不再被引用补齐当前规范**。

---

## 2. 核心价值

你（人）→ 手机发指令 → Harness（AI 团队）→ 产出（调研/代码/视频）

**关键特性**：永远在线、能力匹配、弹性扩展、优雅降级。

---

## 3. 设计哲学（5 条不可妥协）

| 原则 | 含义 | spec 对应 |
|------|------|-----------|
| **Harness 是事实来源** | SQLite 是 orchestration state authority | `spec/kernel-schema.sql` |
| **Kernel 不懂业务** | WorkflowPack 与 Driver 完全可替换 | `spec/interfaces/{workflow_pack,execution_driver}.py` |
| **Driver 不懂权限** | PolicyDecisionPoint 是唯一授权 | `spec/interfaces/policy_decision.py` |
| **单向权限** | deny 永远不能被 approval 扩权 | `spikes/m0/policy-direction-test.py` |
| **外部系统对账** | 不可伪造本地确定性 | `spec/interfaces/event_sink.py` |

---

## 4. Stage 1：Web-only Research MVP（v0.7 进一步收敛）

按 v0.6 复审报告（Codex）建议，Stage 1 仅交付：

```text
一个入口：Tailscale Web UI
一个工作流：Research（web-only）
一个 Codex integration adapter（spike 后锁定）
三个能力：web.search + web.fetch + artifact.write
一个结果：带引用的 Markdown report
一个恢复目标：kill/restart 后 task 进入可解释终态
```

**不进入 Stage 1**：
- `note.read`（v0.6 引入但 Research 未使用，扩大最小权限面，删除）
- `audio.transcribe`（涉及外部音频服务，推迟到 M1.1）
- external write + approval reconcile（推到 M2）
- schema-driven 通用 UI、CapabilityRouter、Workflow Catalog（推到 M3）

---

## 5. 阶段门

### M0：Integration Proof

**目标**：决策 Codex 主 Driver、修 6 P0 + 高优先级 P1、建立可复现的 executable evidence。

**退出标准（evidence artifacts）**：

```text
spikes/m0/claim-fence-test.py            连续 10 次 claim，fence 单调递增
spikes/m0/cancel-race-test.py            cancel vs renew/reaper/submit/interrupt-ack 全竞态
spikes/m0/policy-direction-test.py       deny 永远不能被 approval 扩权
spikes/m0/approval-supersede-test.py     old=unknown → 新 attempt → 新 policy decision → 新 approval
spikes/m0/egress-httpx-actual.py         目标 Python/httpx 版本下 import 成功 + 通过网络安全测试集
spikes/m0/codex-sdk-capability.json      Codex capability profile 由 runtime evidence 自动产生
spec/kernel-schema.sql                   空目录可创建 DB，运行 10 次 claim
spec/interfaces/*.py                     六个 Protocol 全部可 import，最小第二实现 conformance test 通过
adr/0001-0005.md                         已决定的架构决策落地
```

**不允许**：
- 复制 v0.6 的 claim/cancel/Egress 样例到生产代码
- 宣布六个接口"已经稳定"
- 把 Codex exec 当成独立高可用 fallback
- 在 M2 使用 v0.6 的 Approval supersede

### M1：Web-only Research MVP

**目标**：手机派一个研究任务，一小时内看到报告，**无外部副作用**。

**M1 硬门槛**（v0.6 复审报告）：

```text
1. 当前版本具备完整、唯一、可执行的 kernel schema
2. fence/cancel/retry 不变量在目标 Python/SQLite 环境通过
3. ToolInvocationGateway 和数据分类强制执行可证明
4. Egress 在目标依赖版本下通过真实网络安全测试
5. Codex capability profile 由 runtime evidence 自动产生
6. CI image digest/signature/attestation 真实跑通
7. 指定 backup 在隔离环境并发安全地恢复 DB + artifacts
8. web-only Research vertical slice 通过质量、成本、恢复和安全门槛
```

**用户成功指标**（最小集合）：

| 类别 | 最小指标 |
|------|----------|
| 价值 | ≥60% pilot 报告被打开，≥40% 被标记有用或继续追问 |
| 质量 | citation coverage ≥90%，抽检 claim-source 支持率达门槛 |
| 时延 | p50 < 15 分钟，p95 < 60 分钟 |
| 可靠性 | terminal success ≥90%，无静默丢任务 |
| 恢复 | kill/restart 后 100% 进入可解释终态 |
| 成本 | 每任务预算和 p95 成本可见，超预算明确停止 |
| 安全 | 0 次 internal/secret 数据越权外传 |

### M2：Durable Control Plane

- Approval 状态机激活（含 reconcile UI）
- external write ToolProvider（video.publish、email.send）
- observability 完整化（metrics + alerts + runbook）
- CapabilityRegistry 与 budget-aware routing

### M3：证明扩展性

- 在独立 package 实现第二 WorkflowPack 或 Driver
- 真实 conformance suite（不依赖 mock/grep）
- 验证"kernel 零修改"

---

## 6. 阶段工期

```text
M0：2-3 周
M1 build：4-6 周
M1 pilot：2-3 周
Stage 1 总投入：8-12 周（或明确哪些工作并行）
```

每个阶段分别人力投入、CC+Codex effort、calendar time。

---

## 7. 决策日志（v0.7 新增）

| Q | 决策 | 依据 |
|---|------|------|
| Q103 | v0.7 拆分 PRD 与 spec，CI 验证可执行 | v0.6 Codex 复审报告 §9 |
| Q104 | Stage 1 进一步收敛 web-only（删除 note.read）| v0.6 Codex 复审报告 §6.1 |
| Q105 | M0 exit 由 executable evidence artifacts 定义 | v0.6 Codex 复审报告 §6.2 |
| Q106 | M1 用户成功指标扩展到质量+成本+安全 | v0.6 Codex 复审报告 §6.3 |
| Q107 | fence_version 单一来源（task 当前 fence + 1）| v0.6 Codex 复审报告 P0-2 |
| Q108 | CancelService 真正写入 status（cancel_requested 是 status）| v0.6 Codex 复审报告 P0-3 |
| Q109 | Egress 选 A（独立 proxy）/ B（httpcore backend）/ C（手动 IP），禁止 httpx.AsyncResolver | v0.6 Codex 复审报告 P0-4 |
| Q110 | ToolInvocationGateway 是唯一 tool 执行点 | v0.6 Codex 复审报告 P0-5 |
| Q111 | Approval supersede 仅 old=unknown，重跑 PolicyDecision | v0.6 Codex 复审报告 P0-M2 |
| Q112 | CapabilityProfile 绑定 evidence，spike 前 false/unknown | v0.6 Codex 复审报告 P1-1 |
| Q113 | RuntimeBackend 与 IntegrationAdapter 分层 | v0.6 Codex 复审报告 P1-1 |
| Q114 | blob/artifact/task_link 三层数据模型 | v0.6 Codex 复审报告 P1-5 |
| Q115 | workflow_run_id 在 M1 改为 Optional | v0.6 Codex 复审报告 P1-4 |
| Q116 | 数据 trust labels（trusted_user_input/untrusted_external/model_generated 等）| v0.6 Codex 复审报告 P1-10 |

累计决策：116（v0.6 102 + v0.7 14）

---

## 8. 不在 PRD 范围

**禁止在本文件写**：
- SQLite schema 定义（→ `spec/kernel-schema.sql`）
- 状态转换伪代码（→ `spec/state-transitions.md`）
- Protocol 完整定义（→ `spec/interfaces/*.py`）
- Event JSON Schema（→ `spec/events/*.jsonschema`）
- 可执行测试（→ `spikes/m0/*.py`）
- 详细架构决策依据（→ `adr/*.md`）

如果发现 PRD 需要包含这些内容，**先把 spec/spike/ADR 写好，再回到 PRD 引用**。

---

## 9. 退出 v0.7 进入 v0.8 的条件

```text
1. spec/、spikes/m0/、adr/ 全部进入 CI 并通过
2. M0 evidence 6 个 artifacts 全部产出
3. Stage 1 范围进一步收敛后用户流程明确
4. fence/cancel/retry 不变量测试在目标 Python/SQLite 环境全绿
5. Codex 主 Driver 锁定（决策记录在 adr/）
6. Egress 架构选型落地 + 网络安全测试集通过
```