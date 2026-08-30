# VISION v1.0 附录 — 鱼之产品愿景（已被 B 路径替代）

> **⛔ SUPERSEDED 2026-08-30** — 本文是 **2026-08-30 鱼之产品 PRD 草案的归档**，**不再作为实施合同**。
>
> **用户裁定（B 路径）**：采纳 `docs/v1.0-ga-team-plan.md` 的 Python kernel runtime v1.0 路线。
>
> **当前实施合同**：
> - 鱼鳞（runtime）→ `docs/v1.0-ga-team-plan.md`（Python lift、5 周、不重开 M0、不引入 dsh）
> - 鱼之（产品） → `docs/PRD-v1.1-product.md`（手机语音 + 6 host + dsh wrapper，另议）
>
> **本文保留理由**：愿景回收 + 鱼鳞定位 + Codex 扩充概念地图，三项作为 v1.1 product PRD 的输入参考。
>
> **本文不引用**：所有 §7.1/§7.2/§7.4/§7.5/§8.2/§6.3/§10/§11 引用为 ARCHITECT-REVIEW-PRD-v0.6 评审**建议**，非 PRD-v0.6 正文；引用错位详见 `docs/ARCHITECT-REVIEW-fish-harness-prd-v1.0.md` §P0-2。

---

# Fish Harness PRD v1.0 — 个人 AI 编排系统（生产就绪总纲）【历史草案】

> ## ⛔ 禁止引用清单（2026-08-30 补充）
>
> **本文为归档正文，Agent / 流程不得从本文抽取任何现行条款作为实施依据。** 仅以下条目可参考：
>
> 1. **愿景回收**（鱼之原点 — 一个从手机发指令、AI 团队在远程服务器 7×24 干活）→ 参考用，正式条款走 `docs/PRD-V0.1-NORTH-STAR.md` §1
> 2. **鱼鳞定位**（v0.9 spike = 持久化层形式验证基座）→ 参考用，正式条款走 `docs/v1.0-ga-team-plan.md` §1 + `docs/PRD-v1.1-product.md` §2
> 3. **Codex 扩充概念地图**（4 平面 / Evidence Graph / Driver split 等）→ 仅作 v1.1 M0b 的输入参考，不写为守门
>
> **以下内容全部错误或已过时**：
>
> - ❌ 协议数 = 8（仓库事实 = **10** Protocol）
> - ❌ 所有 `§7.1 / §7.2 / §7.4 / §7.5 / §8.2 / §6.3 / §10 / §11` 章节引用 — 错指 `PRD-v0.6.md` 正文（实际是 `ARCHITECT-REVIEW-PRD-v0.6.md` 评审建议）
> - ❌ `spikes/m0/{fence-monotonicity,cancel-vs-reaper,egress-real-network,dsh-spike}.py` — **不存在**（实际为 `claim-fence-test.py / cancel-race-test.py / egress-httpx-actual.py`，且为离线确定性测试）
> - ❌ `dsh 覆盖 80%` / `TypeScript 2500-3000 行` / `Fable 5 / GLM 5.3 / MiniMax-M3` 不可互换 — 未 spike 验证，已被 `docs/PRD-v1.1-product.md` §3 H-* 显式标记为待验证
> - ❌ `Caddy Basic Auth + 强密码` — 永久否（v0.2 + v1.0 已关）
> - ❌ v0.6 Stage 1 = "Tailscale Web UI" / v0.6 §10 = "8 条进入 M1 硬门槛" / v0.6 §8.2 = "9 项 M0 真实测试" — 全部错位
> - ❌ M1 示例步骤含 Evidence Graph / YouTube/ASR / Web Push — 与 `PRD-v1.1-product.md` §5 M1 范围（文字表单 / 仅 A / newvps 共址 / Tailscale-only）冲突
> - ❌ W-1 把 TypeScript ≥2000 行焊为守门 — 已被 NORTH-STAR §8 W-1 改为 v1.0 runtime **豁免** + v1.1 product 待 M0b 锁
>
> **复审证据**：`docs/ARCHITECT-REVIEW-fish-harness-prd-v1.0.md` §P0-1..P0-6（CHANGES REQUIRED）+ `docs/DOCS-REVIEW-v1.1-adjudication.md` §1（CHANGES REQUIRED）。
>
> **检索结果校验**：本文禁止被 grep 为现行方案关键词（harness.rana.asia / PWA / iPhone / orchestrator / commander / worker 等）。任何 PRD 修订不得引用本文作现行来源；如需引用本文，**必须**显式注明「历史草案参考」。

---

## 0. TL;DR（鱼之生产版）

**一个从手机发指令、AI 团队在远程服务器 7×24 干活的个人 AI 编排系统，吸纳 Codex 平台化扩展后形成的生产就绪 Agent Harness。**

- **鱼之原点**：PRD-v0.1（2026-08-29）的 5 条设计哲学 + 三层架构 + 6 host + Mobile UI + MVP 第一刀
- **平台化扩充**：ARCHITECT-REVIEW-PRD-v0.5/v0.6 中 Codex 引入的 4 平面架构（Edge/Control/Execution/Knowledge）+ 6+ 扩展接口 + Evidence Graph + Evaluator + CapabilityProfile + Tool Package
- **鱼鳞**：PRD-v0.9 完成的 13 spike + spec/kernel-schema.sql（27 trigger / 12 event JSON / 8 Protocol），重新定位为持久化层形式验证基座

### v1.0 核心特性（综合鱼 + 鱼鳞）

| 维度 | 内容 |
|------|------|
| **调度层** | newvps（清理后 + 4G swap）跑 `orchestrator + 3 commander`，用 Fable 5 / GLM 5.3 |
| **执行层** | 6 host：MacBook 主力 + newvps-w1/2 + puerHK-w1 + aliyun-w1 + HK103-w1 + GPU VPS 按需 |
| **控制层** | iPhone Safari PWA，语音为主（Web Speech API）+ 文字为辅 |
| **知识层** | Evidence Graph（Source → Snapshot → Claim → Citation → Report）+ MemoryStore + Evaluator |
| **持久化** | SQLite kernel schema（27 trigger / 12 event / 8 Protocol，PRD-v0.9 鱼鳞）|
| **基础框架** | dsh（DeepSeek Harness）覆盖 80%，wrapper（~2500-3000 行 TypeScript）补 20% |
| **二次开发量** | ~3000-4000 行 TypeScript（v0.1 基线 + Codex 平台化扩展 + Knowledge Plane）|

### 阶段路线（M0 → M3 均可演示）

| 阶段 | 目标 | 退出标准 |
|------|------|----------|
| **M0: spike 验证** | dsh/Codex SDK 真实 capability + fence/cancel/retry 不变量 + Egress SSRF 真实测试 | 9 项 spike exit 0（PRD-v0.6 §8.2）+ Codex capability JSON |
| **M1: MVP 第一刀** | 手机语音派 1 个任务 → 24h 内跑完 → 推送回手机 | PRD-v0.1 §11.2 全部 + M0 全绿 |
| **M2: 平台化扩展** | Evidence Graph + Evaluator + CapabilityProfile（Codex 扩充）+ 第二工作流（信息检索）| 4 平面架构全部实装 + p50 <15min / p95 <60min |
| **M3: 知识层 + GA** | MemoryStore + Channel Adapter + 多用户支持 + 第三方 Tool Package 注册 | Knowledge Plane 实装 + Stage 1 质量/成本/安全指标全绿 |

---

## 1. 愿景与设计哲学（PRD-v0.1 §1，**不可妥协**）

### 1.1 核心价值（鱼之原点）

```
你（人）→ 手机发指令 → Harness（AI 团队）→ 产出（调研/代码/视频）
                              ↑
                     24/7 跑在远程 VPS
                     调度/执行分层
                     优雅降级
                     知识沉淀
```

**关键特性**：
- **永远在线**：核心能力跑在 VPS 上，电脑合盖不影响
- **能力匹配**：Xcode 任务只能 MacBook，puer-hub 任务优先 puerHK
- **弹性扩展**：GPU 任务临时拉 VPS，跑完释放
- **优雅降级**：MacBook 离线，任务自动转移
- **知识沉淀**（v1.0 新增）：每个任务产出 Evidence Graph，下次任务复用

### 1.2 设计哲学（5 条不可妥协，**禁止替换**）

| # | 原则 | 含义 | 守门条款 |
|---|------|------|----------|
| P-1 | **调度 ≠ 执行** | orchestrator 决策但不执行，worker 执行但不决策 | PRD-v0.1 NORTH-STAR §2 |
| P-2 | **位置无关** | orchestrator 看不见 worker 在哪台机器，只看见能力 | 同上 |
| P-3 | **在线优先 + 离线降级** | MacBook 在工作时段优先，离线时自动转 VPS | 同上 |
| P-4 | **Locality 优先** | 代码在哪里，worker 就在哪里 | 同上 |
| P-5 | **永远在容器/daemon 上** | 调度层容器化，agent 必 daemon | 同上 |

### 1.3 数字分身长期闭环（v1.0 新增，结合 PRD-v0.1 §1 + Codex 平台化）

```
Goal → Observation → Proposal → Approval → Action → Outcome
  ↑                                                     │
  └──────────── Evaluation ← Memory / Learning ─────────┘
```

v1.0 通过 Evidence Graph + Evaluator + MemoryStore 实现稳定 ID 与事件类型，**预留闭环不强制实现**。

---

## 2. 鱼之三层架构（PRD-v0.1 §2，**不可变结构**）

```
                    🧠 调度层
              newvps（清理后 + 4G swap）
            orchestrator + commander × 3
                       │
                       ↓ JSON-RPC / WebSocket
        ┌──────────────┴──────────────┐
        ↓                             ↓
   ⚙️ Worker Pool（6+ host）
   ┌──────────────────────────────────────────────┐
   │  MacBook Pro M1 16G ⭐ 主力（你工作时段）     │
   │  newvps 4C/7.8G（调度层共址，清理后）        │
   │  puerHK 4C/7.8G（puer-hub 专用，挤 1 worker）│
   │  aliyun 2C/3.4G+4G swap（公网 worker）       │
   │  HK103 2C/3.8G+2G swap（frp 网络 worker）   │
   │  临时 GPU VPS（按需，AutoDL/矩池云）         │
   └──────────────────────────────────────────────┘
        ↑
        │
┌─────────────────┐
│ 📱 控制层       │
│ iPhone Safari   │
│ harness.rana.asia│
│ PWA + 语音输入  │
└─────────────────┘
```

| 层 | 组件 | 模型 | 资源 | 职责 |
|----|------|------|------|------|
| **调度层** | orchestrator × 1 | Fable 5 | 1G | 跨项目决策、调度、状态管理 |
| **调度层** | commander × 3 | GLM 5.3 | 1G×3 | 独立任务 / 信息检索 / 视频工作流 |
| **调度层** | dsh web | — | 0.5G | harness.rana.asia 入口（frp 暴露）|
| **调度层** | Portainer | — | 0.5G | 可视化管理 |
| **执行层** | worker pool（6 host）| MiniMax-M3 | 4G×5 | 跑实际任务 |

### 守门条款（NORTH-STAR §3 A-1..A-4）

- A-1：三层结构不可合并（orch/commander/worker 必须独立）
- A-2：orchestrator 数量 = 1，commander ≥ 3
- A-3：worker 数量 ≥ 6 host
- A-4：三层不同模型（orch=Fable5 / comm=GLM5.3 / worker=MiniMax-M3）

---

## 3. 4 平面架构（Codex 平台化扩充，PRD-v0.6 §7.1）

Codex 评审引入的四平面架构，作为三层架构的功能补充：

```text
Edge Plane
  ChannelAdapter · TriggerSource
          │
Control Plane
  Goal · Task · Attempt · Policy · Budget · Event
          │
Execution Plane
  WorkflowPack · ToolInvocationGateway · RuntimeAdapter
          │
Knowledge Plane
  Artifact/Evidence Graph · ContextProvider · MemoryStore · Evaluator
```

### 平面职责（v1.0 必装 + 可选）

| 平面 | 职责 | v1.0 状态 | 落点 |
|------|------|----------|------|
| **Edge Plane** | 输入渠道（语音/文字/Webhook/scheduled）| ✅ M1 装 | Mobile UI + Web Speech API + launchd/cron |
| **Control Plane** | 任务/Attempt/Policy/Budget/Event 编排权威 | ✅ M1 装 | SQLite kernel schema（27 trigger）+ dsh |
| **Execution Plane** | WorkflowPack + ToolGateway + RuntimeAdapter | ✅ M1 装（6 接口）+ M2 RuntimeBackend/IntegrationAdapter 拆分 | spec/interfaces/*.py（8 Protocol）|
| **Knowledge Plane** | Evidence Graph + ContextProvider + MemoryStore + Evaluator | 🟡 M2 起装（先 Evidence Graph）+ M3 装全部 | spec/evidence/（M2 新增）|

### 6+ 扩展接口（Codex 引入 + v0.9 验证）

| 接口 | 来源 | v1.0 必装 | spec 落点 |
|------|------|-----------|----------|
| **ExecutionDriver** | Codex/Codex as a platform | ✅ M0 spike | spec/interfaces/execution_driver.py |
| **WorkflowPack** | v0.6 | ✅ M0 | spec/interfaces/workflow_pack.py |
| **ToolProvider** + **ToolInvocationGateway** | v0.6 | ✅ M0 | spec/interfaces/tool_provider.py |
| **PolicyDecisionPoint** | v0.6 | ✅ M0 | spec/interfaces/policy_decision.py |
| **ArtifactStore** | v0.6 | ✅ M0 | spec/interfaces/artifact_store.py |
| **EventSink** | v0.6 | ✅ M0 | spec/interfaces/event_sink.py |
| **ContextDistiller** + **ContextBudget** | v0.9 | ✅ M1 | spec/interfaces/context_distiller.py |
| **WorkerPool** | v0.9 | ✅ M1 | spec/interfaces/worker_pool.py |
| **RuntimeBackend** + **IntegrationAdapter** | v0.6 §7.2 | 🟡 M2 装 | spec/interfaces/runtime_backend.py（新增）|
| **Evaluator** | v0.6 §7.5 | 🟡 M2 装 | spec/interfaces/evaluator.py（新增）|
| **CapabilityProfile**（结构化）| v0.6 §7.6 | 🟡 M2 装 | spec/interfaces/capability_profile.py（新增）|
| **Evidence Graph** | v0.6 §7.4 | 🟡 M2 装 | spec/evidence/（新增 schema）|
| **ChannelAdapter** | v0.6 §7.1 | 🟡 M3 装 | spec/interfaces/channel_adapter.py（新增）|

---

## 4. 鱼之三大工作流（PRD-v0.1 §5，**不可删除**）

| 工作流 | 触发 | 典型任务 | 默认 worker | M 阶段 |
|--------|------|----------|-------------|--------|
| **A: 独立任务** | 手动 cc/codex 或手机派工 | 改课件、做调研、写代码 | macbook-main（白天）/ newvps-w1（夜间） | M1 |
| **B: 动态信息检索** | commander-2 定时 + 手机派工 | 抓 YouTube 频道、经济信息 | 拉取 aliyun-w1 → ASR newvps-w1 → 分析 newvps-w2 | M2 |
| **C: 视频工作流** | commander-3 编排 | 选题 → 写脚本 → 图文转视频 → 整合发布 | 脚本 macbook-main / newvps-w2；渲染 GPU VPS 按小时 | M2/M3 |

### 工作流 → WorkflowPack 映射

| 工作流 | WorkflowPack 名 | v1.0 实现 |
|--------|-----------------|-----------|
| A | `research.v1`（PRD-v0.6 §11）| M1 Web-only research MVP；M3 升级为 full research |
| B | `retrieval.v1` | M2 实现 |
| C | `video.v1` | M3 实现（GPU VPS 渲染）|

---

## 5. MVP 第一刀（PRD-v0.1 §11，**必须可演示**）

### 5.1 MVP 定义（鱼之原点）

> 能用手机派 1 个任务，24 小时内自动跑完，结果推送回手机。

### 5.2 MVP 范围（M1）

```
✅ 必要：
  · newvps 调度层（orchestrator + 1 commander + dsh web）
  · 1 个 worker（newvps-w1）
  · Mobile UI（语音派工，Web Speech API）
  · 1 个工作流：research.v1（独立任务）

⏸ 后续（M2/M3）：
  · 5 个其他 worker host
  · 2 个其他 commander
  · 信息检索 + 视频工作流
  · Evidence Graph / MemoryStore / Evaluator
  · 智能路由（用默认轮询 + Locality）
```

### 5.3 MVP 任务示例（PRD-v0.1 §11.3）

```
用户：手机说"调研李厚辰最近 5 期视频"
harness：
  1. 语音 → STT → 派工（harness.rana.asia）
  2. orchestrator → commander-1 → newvps-w1
  3. cc/codex 子进程拉 YouTube + ASR + 摘要
  4. Evidence Graph：Source(URL) → Snapshot → Claim → Citation → Report
  5. dsh web Web Push → iPhone
用户：看到结果（带引用），下载到 NAS
```

### 5.4 MVP 守门条款（NORTH-STAR §5 M-1..M-5）

- M-1：必须能从手机端发起任务
- M-2：必须能用语音（Web Speech API）
- M-3：必须 24h 内自动跑完（无需人介入）
- M-4：结果必须推送回手机（Web Push）
- M-5：MVP 范围必须含 orchestrator + commander + worker 三层

### 5.5 MVP 验证命令（架构师最终 sign-off 时跑）

```bash
# 1. 从 iPhone Safari 打开 harness.rana.asia PWA
# 2. 按住麦克风说"测试任务"
# 3. STT 转文字显示在输入框
# 4. 点"派工" → 发送到 orchestrator
# 5. WebSocket 流式回传 → 显示执行进度
# 6. 完成后 Web Push 通知 iPhone
# 任一环节中断即 MVP 失败
```

---

## 6. 6 host 部署清单（PRD-v0.1 §2.3，**必须保留**）

| ID | Host | 资源 | 角色 | 能力 | 24/7 | M 阶段 |
|----|------|------|------|------|------|--------|
| `macbook-main` | MacBook Pro M1 16G | 12G | **主力** | claude-code, codex, cursor, xcode, gui-debug | ❌ | M1（部分）/M3 全功能 |
| `newvps-w1` | newvps 4C/7.8G | 4G | 通用 worker | claude-code, codex, ffmpeg | ✅ | M1 |
| `newvps-w2` | newvps | 4G | 通用 worker | claude-code, codex | ✅ | M2 |
| `puerHK-w1` | puerHK 4C/7.8G | 1.5G | **puer-hub 专用** | claude-code, prisma, postgres | ✅ | M2（Locality）|
| `aliyun-w1` | aliyun 2C/3.4G+4G | 1.5G | 公网 worker | claude-code, codex | ✅ | M2（信息检索）|
| `hk103-w1` | HK103 2C/3.8G+2G | 2G | frp 网络 worker | claude-code | ✅ | M2 |
| `gpu-w-temp` | AutoDL/矩池云 | 8-16G + GPU | 视频/重型 | ffmpeg-gpu, cuda | 按小时 | M3 |

### 守门条款（NORTH-STAR §6 H-1..H-4）

- H-1：MacBook 必为 worker（主力，工作时段优先）
- H-2：puerHK-w1 必为 puer-hub 专用（Locality）
- H-3：GPU VPS 必为按需（视频工作流渲染）
- H-4：至少 5 个 24/7 VPS

---

## 7. Mobile UI 关键决策（PRD-v0.1 §7，**不可推迟**）

| 项 | 决策 | 实现 |
|----|------|------|
| **域名** | `harness.rana.asia` | aliyun nginx + wildcard SSL（复用现有）|
| **形态** | PWA（添加到主屏幕，全屏运行）| Service Worker + manifest.json |
| **输入** | **语音为主** + 文字为辅 | iOS Web Speech API + 文字输入框 |
| **STT 主方案** | iOS Safari Web Speech API（零成本，85-90%）| webkitSpeechRecognition |
| **STT 降级** | 云 STT（Whisper API / 阿里云）| fetch to orchestrator → Whisper |
| **实时性** | WebSocket 流式回传 | harness.rana.asia/ws |
| **通知** | Web Push API（iOS 16.4+）| Push API + VAPID |
| **认证** | Caddy Basic Auth + 强密码 | 个人项目够用 |

### 守门条款（NORTH-STAR §7 U-1..U-3）

- U-1：域名 `harness.rana.asia`（不可替换）
- U-2：STT 主方案 = iOS Web Speech API（云 STT 仅作降级）
- U-3：推送 = Web Push API（不可用邮件/微信替代）

---

## 8. 模型分配矩阵（PRD-v0.1 §4，**不可互换**）

| 层 | 模型 | 用途 | 成本估算 |
|----|------|------|----------|
| **Orchestrator** | Claude Fable 5 | 跨项目决策、复杂推理、开会 | 高（按需调用）|
| **Commander** | GLM 5.3 | 单项目全权负责、上下文管理 | 中（每任务 1-3 次）|
| **Worker** | MiniMax-M3 | 批量任务、执行、简单推理 | 低（量大）|
| **Evaluator（M2）** | Claude Fable 5 | 质量评估、citation 检查 | 中（M2 起）|
| **Channel Adapter（M3）** | MiniMax-M3 | 通知格式化、消息分拣 | 低（M3 起）|

```yaml
# dsh config（v1.0）
models:
  orchestrator:
    provider: anthropic
    model: claude-fable-5
    api_key: ${ANTHROPIC_API_KEY}
    max_tokens: 8000
    
  commander:
    provider: zhipu
    model: glm-5.3-flash
    api_key: ${ZHIPU_API_KEY}
    max_tokens: 4000
    
  worker:
    provider: minimax
    model: MiniMax-M3
    api_key: ${MINIMAX_API_KEY}
    max_tokens: 2000
```

---

## 9. 二次开发范围（PRD-v0.1 §9 + Codex 扩充，**TypeScript**）

| 模块 | 代码量 | 优先级 | M 阶段 | 状态 |
|------|--------|--------|--------|------|
| **鱼之基线（PRD-v0.1）** | | | | |
| 三层架构抽象（orch/commander/worker）| 800-1000 | P0 | M1 | 待开发 |
| 持久化层（SQLite 任务历史，已由鱼鳞覆盖）| 300 | P0 | M1 | ✅ v0.9 完成 |
| Mobile UI 改造（PWA + 语音）| 400-500 | P1 | M1 | 待开发 |
| 业务工作流模板（A 工作流）| 400 | P1 | M1 | 待开发 |
| 智能路由评分 | 200-300 | P1 | M2 | 待开发 |
| 优雅降级（task reassignment）| 200-300 | P1 | M2 | 待开发 |
| **Codex 扩充** | | | | |
| RuntimeBackend + IntegrationAdapter 拆分 | 200 | P1 | M2 | 待开发 |
| Tool Package 容器化（manifest + adapter + policy）| 300 | P1 | M2 | 待开发 |
| Evidence Graph（Source → Claim → Citation）| 500 | P1 | M2 | 待开发 |
| Evaluator SPI（citation coverage + 结构完整性）| 200 | P1 | M2 | 待开发 |
| CapabilityProfile 结构化（feature/limits/trust/economics/evidence）| 150 | P1 | M2 | 待开发 |
| Channel Adapter（iOS Web Push + scheduler）| 200 | P1 | M3 | 待开发 |
| MemoryStore（基础实现）| 300 | P1 | M3 | 待开发 |
| 第二/第三工作流（B 检索 + C 视频）| 600 | P1 | M2/M3 | 待开发 |
| **总计** | **~4000-4500** | — | — | **TypeScript** |

### 守门条款（NORTH-STAR §8 W-1..W-4）

- W-1：语言 = TypeScript（不是 Python；鱼鳞 spike 仅作持久化层参考）
- W-2：不修改 dsh 源码（只在 wrapper 层包装）
- W-3：dsh 升级时 wrapper 不重写
- W-4：目录结构 = `/opt/harness/{wrapper,workspace,data,logs}`

---

## 10. 鱼鳞（PRD-v0.9 spike 套件，**持久化层形式验证基座**）

PRD-v0.9 完成的 13 spike + spec/kernel-schema.sql（27 trigger / 12 event JSON / 8 Protocol）**不是鱼**、**不是鱼钩**，是**鱼鳞**——fish-harness v1.0 持久化层的形式验证基座。

### 鱼鳞落点（按 PRD-v0.1 §9.1 "持久化层 300 行 SQLite 任务历史"）

| PRD-v0.9 资产 | v1.0 落点 | 限制 |
|---------------|----------|------|
| `spec/kernel-schema.sql`（873 行）| `wrapper/persistence/schema.sql`（300 行 TypeScript wrapper 调 SQLite）| 不可外暴露为鱼的目标 |
| 13 spike + 28/28 反例 | `wrapper/persistence/tests/`（v1.0 集成测试正确性验证）| spike 不得脱离持久化层独立演进 |
| `spec/interfaces/*.py`（8 Protocol）| wrapper TS 接口的 type contract 参考 | TS 接口是鱼，Python Protocol 是参考 |
| `spec/events/*.json`（12 JSON schema）| wrapper TS event 契约的 schema 参考 | TS event 是鱼，JSON schema 是参考 |
| ADR 0001-0007 | `adr/`（fish-harness 内部架构决策）| ADR 不可替代 PRD |

### 鱼鳞硬约束（**禁止偏离**）

- 鱼鳞不得脱离持久化层独立演进（spike 修改必须挂载到 §11 持久化层任务）
- 鱼鳞不得替代 §5 MVP 验证（MVP 验证是真用户真场景，不是 spike）
- 鱼鳞不得作为"fish-harness 完成"的标志（鱼鳞漂亮 ≠ 鱼活了）

---

## 11. 阶段路线（M0 → M3 均可演示）

### M0: spike 验证（4 周）

**目标**：建立可信的 M0 executable contract，把 v0.9 spike 与 Codex 平台化扩展打通。

| 任务 | 输入 | 产出 | 验证 |
|------|------|------|------|
| T-M0-1: dsh 真实 spike | PRD-v0.6 §8.2 M0 必增测试 + `notes/codex-review-prompt-v0.9.4.md` | `spikes/m0/dsh-spike.py` | 9 项真实测试 exit 0 |
| T-M0-2: Codex SDK capability | PRD-v0.5 §6 + Codex Python SDK | `codex-sdk-capability.json`（runtime evidence 自动产生）| schema validation 通过 |
| T-M0-3: fence/cancel/retry 不变量 | PRD-v0.6 §4 + v0.9 鱼鳞 | `spikes/m0/fence-monotonicity.py` + `cancel-vs-reaper.py` | 不变量可证明 |
| T-M0-4: Egress SSRF 真实测试 | PRD-v0.6 §7 + httpx 0.28.1 | `spikes/m0/egress-real-network.py` | 私网阻断 + pinned IP + redirect re-pin |
| T-M0-5: ToolInvocationGateway | PRD-v0.6 §7.6 + 鱼鳞 8 Protocol | `wrapper/gateway/gateway.ts`（PDP→audit→lease+fence→provider 链）| conformance-second-impl.py 通过 |

**M0 退出标准**：
- 9 项 spike exit 0（PRD-v0.6 §8.2）
- Codex capability JSON 由 runtime evidence 自动产生
- fence/cancel/retry 不变量可证明
- Egress 真实网络安全测试通过
- ToolInvocationGateway 数据分类强制执行可证明
- CI image digest/signature/attestation 真实跑通

### M1: MVP 第一刀（3 周）

**目标**：手机语音派 1 个任务 → 24h 内跑完 → 推送回手机。

| 任务 | 输入 | 产出 | 验证 |
|------|------|------|------|
| T-M1-1: Mobile UI PWA | PRD-v0.1 §7 + harness.rana.asia | `wrapper/mobile-ui/pwa/` | iPhone Safari PWA 安装 + 语音输入 |
| T-M1-2: dsh wrapper 三层抽象 | PRD-v0.1 §9 + §8 设计哲学 | `wrapper/orchestrator/` + `wrapper/commander/` + `wrapper/agents/`（~1000 行 TS）| spawn 流程跑通 |
| T-M1-3: research.v1 WorkflowPack | PRD-v0.6 §11 + §4 工作流 A | `wrapper/workflows/research.v1/`（~400 行 TS）| 1 个真任务跑通 |
| T-M1-4: newvps-w1 部署 | PRD-v0.1 §10 Phase 1+2 | docker-compose + systemd unit | `dsh agent` 注册到 orchestrator |
| T-M1-5: Web Push 推送 | PRD-v0.1 §7 | Push API + VAPID | 任务完成通知 iPhone 收到 |
| T-M1-6: MVP 端到端验证 | §5.5 验证命令 | 真任务端到端跑通 | 24h 内完成 + 推送 |

**M1 退出标准**：PRD-v0.1 §5.5 MVP 验证命令全部通过（手机语音 → 24h 完成 → 推送）

### M2: 平台化扩展（4 周）

**目标**：4 平面架构全部实装 + Evidence Graph + Evaluator + 第二工作流。

| 任务 | 输入 | 产出 | 验证 |
|------|------|------|------|
| T-M2-1: RuntimeBackend/IntegrationAdapter 拆分 | PRD-v0.6 §7.2 | `wrapper/runtime/`（~200 行 TS）| conformance 通过 |
| T-M2-2: Tool Package 容器化 | PRD-v0.6 §7.3 | manifest + adapter + policy | registry 可加载 |
| T-M2-3: Evidence Graph | PRD-v0.6 §7.4 | `wrapper/evidence/`（~500 行 TS）+ SQLite 表 | Source → Citation 全链路可查 |
| T-M2-4: Evaluator SPI | PRD-v0.6 §7.5 | `wrapper/evaluator/`（~200 行 TS）| citation coverage ≥90% |
| T-M2-5: CapabilityProfile 结构化 | PRD-v0.6 §7.6 | `wrapper/capability/`（~150 行 TS）| evidence 自动产生 profile |
| T-M2-6: 智能路由评分 | PRD-v0.1 §3 + Locality | `wrapper/routing/`（~250 行 TS）| 6 host 全联通 + MacBook 优先 |
| T-M2-7: retrieval.v1 工作流（B 检索）| §4 工作流 B + 3 worker | `wrapper/workflows/retrieval.v1/` | YouTube 抓取 + ASR + 摘要 |
| T-M2-8: 5 host 部署 | PRD-v0.1 §10 Phase 3-7 | 全部 worker 注册 | 全部 capability 报告 OK |
| T-M2-9: 优雅降级 | PRD-v0.1 §3.3 | `wrapper/degradation/`（~250 行 TS）| MacBook 离线 → 任务自动转 VPS |

**M2 退出标准**：
- 4 平面架构全部实装（Edge + Control + Execution + Knowledge 部分）
- Evidence Graph 全链路可查（Source → Citation → User feedback）
- p50 < 15 分钟 / p95 < 60 分钟（PRD-v0.6 §6.3）
- terminal success ≥ 90%
- 6 host 全联通 + MacBook 主力 + Locality 优先

### M3: 知识层 + GA（4 周）

**目标**：Knowledge Plane 全装 + Channel Adapter + 第三工作流 + 第三方 Tool Package 支持。

| 任务 | 输入 | 产出 | 验证 |
|------|------|------|------|
| T-M3-1: MemoryStore 基础实现 | PRD-v0.6 §7.1 | `wrapper/memory/`（~300 行 TS）| 跨任务记忆可查 |
| T-M3-2: Channel Adapter | PRD-v0.6 §7.1 | `wrapper/channels/`（~200 行 TS）| Web Push + email + webhook |
| T-M3-3: video.v1 工作流（C 视频）| §4 工作流 C + GPU VPS | `wrapper/workflows/video.v1/`（~300 行 TS）| 选题 → 脚本 → GPU 渲染 → 发布 |
| T-M3-4: 第三方 Tool Package registry | PRD-v0.6 §7.3 后续 | `wrapper/registry/`（~200 行 TS）| 第三方包可加载 |
| T-M3-5: GA 验收 | §5 + §6 + §7 + §8 + §11 全套 | `docs/fish-harness-prd-v1.0-ga-report.md` | 全条款通过 |

**M3 退出标准**：
- Knowledge Plane 4 组件全部实装（Evidence Graph + ContextProvider + MemoryStore + Evaluator）
- 3 大工作流全跑通（A + B + C）
- 第三方 Tool Package 可注册（虽然不开放 marketplace）
- Stage 1 质量/成本/安全指标全绿（PRD-v0.6 §6.3）

---

## 12. 风险与回滚（PRD-v0.1 §12 + Codex 扩充）

| # | 风险 | 概率 | 影响 | 缓解 |
|---|------|------|------|------|
| R-1 | newvps OOM | 中 | 高 | 4G swap + commander 数限制 |
| R-2 | MacBook 长期离线 | 低 | 中 | 任务自动转 VPS（优雅降级）|
| R-3 | dsh API 变更 | 低 | 中 | wrapper 隔离，不直接依赖 dsh 内部 |
| R-4 | Codex API 限流 | 中 | 中 | 多模型 fallback（GLM → DeepSeek）|
| R-5 | VPS 突然宕机 | 低 | 中 | 任务有 retry + 持久化（鱼鳞）|
| R-6 | Mobile UI 安全 | 中 | 高 | Caddy Basic Auth + 强密码 |
| R-7 | GPU 成本失控 | 中 | 中 | 月度预算上限 + AutoDL 按小时 |
| R-8 | Codex SDK 升级破坏兼容 | 中 | 高 | RuntimeBackend/IntegrationAdapter 拆分（T-M2-1）|
| R-9 | Evidence Graph 膨胀 | 低 | 中 | 引用失效检测 + 增量刷新 |
| R-10 | 上下文漂移（PRD 历史教训）| **高** | **高** | **NORTH-STAR 守护文档 + 修订前检查脚本** |

### 回滚（PRD-v0.1 §12.2 + Codex 阶段化）

```
阶段 1（M0/M1 失败）：
  · docker compose down
  · 恢复 newvps 原状
  · 零成本回滚

阶段 2（M2 失败）：
  · 保留 M1 鱼之基线
  · 关闭 Knowledge Plane / 第二工作流
  · 降级为"鱼之 MVP"
  · 1 小时回滚

阶段 3（M3 失败）：
  · 保留 M2 平台化扩展
  · 关闭第三方 registry / video 工作流
  · 降级为"鱼之平台"
  · 半小时回滚

完全回滚：
  · 关闭所有 dsh agent
  · docker compose down
  · 移除 harness stack
  · 恢复 VPS 原始用途
```

---

## 13. 与 Codex 评审的整合清单（**避免重复漂移**）

PRD-v0.1 → v0.9 漂移事故中，Codex 评审引入的扩充概念被部分丢失。本节明确**v1.0 必须吸纳的 Codex 扩充**，避免重复漂移。

| Codex 扩充 | 来源文件:行 | v1.0 落点 |
|-----------|-------------|----------|
| **Codex as a platform** 官方思路 | ARCHITECT-REVIEW-PRD-v0.5.md:433 | §1.3 + §3 4 平面架构 |
| **4 平面架构**（Edge/Control/Execution/Knowledge）| ARCHITECT-REVIEW-PRD-v0.6.md §7.1 | §3 |
| **Driver 拆 RuntimeBackend/IntegrationAdapter** | v0.6 §7.2 | §3 + §11 T-M2-1 |
| **ToolProvider → Tool Package** | v0.6 §7.3 | §3 + §11 T-M2-2 |
| **ArtifactStore → Evidence Graph** | v0.6 §7.4 | §3 + §10 鱼鳞 + §11 T-M2-3 |
| **Evaluator SPI** | v0.6 §7.5 | §3 + §11 T-M2-4 |
| **CapabilityProfile 结构化** | v0.6 §7.6 | §3 + §11 T-M2-5 |
| **ChannelAdapter** | v0.6 §7.1 | §3 + §11 T-M3-2 |
| **ContextProvider / MemoryStore** | v0.6 §7.1 | §3 + §11 T-M3-1 |
| **6+ 扩展接口** | v0.5 §6 | §3 表格 + 鱼鳞 8 Protocol |
| **M1 用户成功指标**（p50/p95/成本/质量）| v0.6 §6.3 | §11 M2 退出标准 |
| **8 条进入 M1 硬门槛** | v0.6 §10 | §11 M0/M1 退出标准 |
| **9 项 M0 必增回归测试** | v0.6 §8.2 | §11 T-M0-1 spike 列表 |
| **可移植 Tool Package 结构**（manifest + adapter + policy）| v0.6 §7.3 | §11 T-M2-2 |
| **CI image digest/signature/attestation** | v0.6 §10 §6 | §11 M0 退出标准 |

**禁止遗漏**：任何 PRD-v1.0 后续修订若删除本节任一条目，必须在 `docs/PRD-V0.1-NORTH-STAR.md` 守门清单中明确登记并由架构师签字。

---

## 14. 与鱼鳞（PRD-v0.9 spike）的整合清单

| 鱼鳞资产 | v1.0 角色 | 不可越界 |
|----------|----------|----------|
| spec/kernel-schema.sql（873 行 / 27 trigger）| 持久化层 SQLite kernel | 不得独立演进为 fish-harness 目标 |
| 13 spike（5627 行 / 28/28 反例）| 持久化层正确性形式验证 | spike PASS ≠ MVP 验证 |
| 8 Protocol interface | wrapper TS 接口的 type contract 参考 | TS 接口是鱼，Python Protocol 是参考 |
| 12 event JSON schema | wrapper TS event 契约的 schema 参考 | TS event 是鱼，JSON schema 是参考 |
| ADR 0001-0007 | fish-harness 内部架构决策 | ADR 不可替代 PRD |

**禁止**：
- 把 spike PASS 当作 fish-harness "完成"
- 把 spec/Protocol 当作 fish-harness "接口契约"
- 把鱼鳞当作 MVP 验证的替代

---

## 15. 修订前检查（NORTH-STAR §10 强制执行）

任何 PRD-v1.x 修订前必须跑 `docs/PRD-V0.1-NORTH-STAR.md` §10 检查脚本，所有守门条款 G/A/M/U/W 必须通过：

```bash
PRD_OLD=PRD-v1.0.md
NORTH_STAR=docs/PRD-V0.1-NORTH-STAR.md

# 1. §1 守门条款 G-1..G-6
grep -E "个人 AI 编排|AI 编排系统" $PRD_OLD || echo "❌ G-1"
grep -E "orchestrator.*commander" $PRD_OLD || echo "❌ G-2"
grep -cE "macbook|puerHK|aliyun|HK103|newvps|gpu" $PRD_OLD | xargs -I{} test {} -ge 5 && echo "✅ G-3" || echo "❌ G-3"
grep -E "语音|PWA|Safari" $PRD_OLD || echo "❌ G-4"
grep -E "dsh|DeepSeek Harness" $PRD_OLD || echo "❌ G-5"

# 2. §2 设计哲学 P-1..P-5
grep -E "调度.*不执行|不决策" $PRD_OLD || echo "❌ P-1"
grep -E "MacBook.*主力|工作时段" $PRD_OLD || echo "❌ P-3"
grep -E "Locality|代码在哪里" $PRD_OLD || echo "❌ P-4"

# 3. §3 三层架构 A-1..A-4
grep -E "orchestrator.*commander.*worker" $PRD_OLD || echo "❌ A-1"

# 4. §5 MVP M-1..M-5
grep -E "手机|iPhone|PWA|语音派工" $PRD_OLD || echo "❌ M-1"
grep -E "24 小时|24h|无人介入" $PRD_OLD || echo "❌ M-3"
grep -cE "orchestrator|commander|worker" $PRD_OLD | xargs -I{} test {} -ge 3 && echo "✅ M-5" || echo "❌ M-5"

# 5. §9 二次开发 W-1
grep -E "TypeScript|\.ts\b" $PRD_OLD || echo "❌ W-1"
```

---

## 16. 修订日志

| 日期 | 版本 | 修订 | 原因 |
|------|------|------|------|
| 2026-08-30 | v1.0 | 初版（合成总 PRD）| PRD-v0.1 鱼之原点 + Codex 平台化扩充（v0.5/v0.6 评审）+ PRD-v0.9 spike 鱼鳞 + 漂移事故溯源后建立 |

---

## 17. 一句话总纲

> **fish-harness v1.0 = 一个从手机发指令、AI 团队在远程服务器 7×24 干活的个人 AI 编排系统，吸纳 Codex 平台化扩展后形成的生产就绪 Agent Harness。**
>
> **怎么算完成（M3 GA）**：能用手机派工 → 24h 内跑完 → 推送回手机 + Evidence Graph 可查 + 6 host 全联通 + 三大工作流全跑通 + 第三方 Tool Package 可注册。
>
> **怎么不算完成**：spike 形式验证 PASS ≠ 完成；spec/27 trigger 完整 ≠ 完成；鱼鳞漂亮 ≠ 完成；鱼钩精致 ≠ 完成。
>
> **只有鱼活了，fish-harness 才算完成。**