# ADR 0005: Tool Invocation Gateway 单一入口

> **Status**: Accepted (M0)
> **Date**: 2026-08-29
> **Deciders**: Architecture review (Codex v0.6 报告 P0-5)
> **Supersedes**: v0.6 PRD §ToolProvider 仅有 manifest，无 invoke gateway

## Context

v0.6 PRD 的 ToolProvider 只有 `manifest()`，**没有**统一的 `invoke()` gateway。
Codex 报告 P0-5：没有 gateway 就意味着任何代码（pack、driver、甚至 kernel
helper）都可以直接调 search API / fetch API / DB，policy 完全旁路。

更深的问题：v0.6 的 `ToolProvider` 是一个 Protocol，但代码里没人 ensure
"所有调用都通过 gateway"。Protocol 只描述能力，不描述调用路径。

## Decision

**`ToolInvocationGateway` 是唯一 tool 执行路径**。所有 side effect 走 gateway。

调用关系：

```text
WorkflowPack / ExecutionDriver
    ↓ invoke(request)
ToolInvocationGateway
    ↓ 1. 校验 lease_token + fence_version
    ↓ 2. PolicyDecisionPoint.evaluate()  → 写入 policy_decisions
    ↓ 3. audit_log.append()             → 写入 audit_log
    ↓ 4. ToolProvider.invoke(request)   → 调用具体能力
    ↓ 5. artifact_store.put()           → 持久化结果
    ↓ 6. task_links INSERT              → 关联到 task
ToolResponse
```

每一步都不可绕过。**绕过 gateway 等于绕过 kernel**。

实现细节：
- gateway 是单例（kernel boot 时构造一次）
- gateway 强制把 capability_id 写进 audit_log（trust label + capability_id 双锚点）
- gateway 写 deny 决策时**不抛异常**，而是返回 `ToolResponse(denial_reason=...)`。
  调用方负责判断 denial。
- needs_approval 决策创建 pending approval 后返回 ToolResponse(approval_id=...)，
  调用方决定是否 await。

## Consequences

**正面**：
- policy 与 audit 形成串联，单点强制
- 加新 capability 只需注册到 gateway，无需改 pack
- 「为什么这个 tool 被调用」永远有 audit 锚点

**负面**：
- gateway 是 critical path，必须实现正确（M0 spike 覆盖）
- pack 写起来稍微冗长（必须走 gateway.request 形式）

## Spike

- `spikes/m0/conformance-second-impl.py`：包含 `_TrivialGateway` 第二实现
- `spikes/m0/policy-direction-test.py`：deny > needs_approval > allow 顺序

## Alternatives Considered

- **A1: ToolProvider as Protocol only**：v0.6 方案。P0-5 已否决。
- **A2: Side-effect 通过 typed callable 而非 gateway**：违反"单一入口"原则；
  policy 会被分散到每个 callable。
- **A3: 把 policy 写进每个 pack**：违反 "Driver 不懂权限" 原则
  （PRD-v0.7 §3）。