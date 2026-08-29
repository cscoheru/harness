# ADR 0001: Runtime Backend vs Integration Adapter 分层

> **Status**: Accepted (M0)
> **Date**: 2026-08-29
> **Deciders**: Architecture review (Codex v0.6 报告 §6.2)
> **Supersedes**: v0.6 PRD §5.3 单层 "Codex integration"

## Context

v0.6 PRD 把 "Codex" 描述为单一 integration。Codex v0.6 复审报告指出这是
两个不同关注点的耦合：

1. **Runtime Backend**（kernel 关心的）：这是「可以运行 AI 工作流的服务」。
   Kernel 需要知道它的 capability profile、heartbeat 协议、interrupt 协议、
   streaming 协议。这是 `ExecutionDriver` Protocol 的契约面。

2. **Integration Adapter**（provider SDK 关心的）：这是「调用特定 SDK 的代码」。
   比如「如何 import `openai_codex`」「如何把 SDK 事件转换成 DriverEvent」。
   这是 implementation detail。

v0.6 报告 P1-1 指出：把这两层混在一起会让 capability claim 失去 evidence 锚点。
没有 evidence 的 capability 就是「自我证明」，不可被 CI 验证。

## Decision

强制分层：

```text
RuntimeBackend (抽象概念)
    ↓ 满足
ExecutionDriver (Protocol)              ← spec/interfaces/execution_driver.py
    ↓ 实现
IntegrationAdapter (具体 SDK 包装)      ← execution_driver/codex_sdk.py
                                         execution_driver/codex_app_server.py
                                         execution_driver/codex_exec.py
```

- RuntimeBackend 的 capability profile **必须**由 runtime evidence 产生（spike）。
  没有 spike 的 backend 不能声明 `supports_tool_gateway = True`。
- IntegrationAdapter 只负责 SDK ↔ DriverEvent 转换，不做 policy/auth/audit。
- 三种 IntegrationAdapter 可以共存（SDK、app-server、exec），但只有一种
  通过 M0 spike 后才能成为 primary。其它可以保留为 fallback，**前提**：
  - 通过同一份 conformance test（`spikes/m0/conformance-second-impl.py`）
  - 在测试套件中持续被验证
  - 不被产品代码默认为 silent fallback（必须显式 opt-in）

## Consequences

**正面**：
- capability 永远有 evidence 锚点（spike → json → capability_profile）
- 切换 RuntimeBackend 时只需替换 IntegrationAdapter，kernel 零修改
- CI 可以把不同 adapter 都跑同一份 conformance test，避免「Codex 换 API
  我就崩」的情形

**负面**：
- 多一层抽象。早期开发会显得"过度设计"。M0 退出前这是必要的代价。
- capability spike 必须先于 SDK 选型完成，意味着 M0 不能直接抄 v0.6 PRD。

## Alternatives Considered

- **A1: 单层 "Codex integration"**：v0.6 方案。报告 P1-1 已否决。
- **A2: RuntimeBackend 作为 Protocol，IntegrationAdapter 作为 free function**：
  不可行，因为同一 SDK 可能需要不同 adapter 实现。
- **A3: 用 Anthropic Agent SDK 替代 Codex SDK**：技术上可行，但 Codex 是
  本项目的现有投资；不在本 ADR 决策范围内。