# ADR 0003: cancel 状态机模型

> **Status**: Accepted (M0)
> **Date**: 2026-08-29
> **Deciders**: Architecture review (Codex v0.6 报告 P0-3)
> **Supersedes**: v0.6 PRD §cancel_requested 仅写 timestamp 不写 status

## Context

v0.6 PRD 的 cancel 实现只写 `tasks.cancel_requested_at`，
**没有**写 `tasks.status = 'cancel_requested'`。
Codex 报告 P0-3：worker 在 cancel 之后可能继续观察到 status='running'，
导致 race condition 无法收敛到终态。

更深的问题：v0.6 `finalize_cancel` 没有绑定 `current_attempt_id/lease_token/
fence_version/status_version` 中任何一个，导致任何人都可以"假装取消"。

## Decision

**`cancel_requested` 是一种状态（status enum），不是 timestamp 的别名**。

完整三段事务（spec/state-transitions.md §1.4）：

1. `tasks.status = 'cancel_requested'` + `tasks.cancel_requested_at = now`
2. `task_attempts.status = 'cancel_requested'`（同步 active attempts）
3. `audit_log` 写入（actor + reason）

`finalize_cancel` 必须绑定全部 6 个谓词：
- `task_id`
- `attempt_id`
- `worker_id`
- `lease_token`
- `fence_version`
- `status_version`（防 status 字段本身的 stale write）

## Consequences

**正面**：
- cancel 状态可被 SELECT 立即观察到，worker 不会"假装没事"
- finalize 是 credentialed 操作，不能被绕过
- audit log 强制有记录

**负面**：
- 三段事务需要在 IMMEDIATE 下执行，性能成本（约 +1-2ms）
- status_version 是新引入的列，v0.6 之前没有

## Alternatives Considered

- **A1: cancel_requested_at timestamp only**：v0.6 方案。P0-3 已否决。
- **A2: cancel as soft delete (DELETE FROM tasks)**：违反 "Harness is
  source of truth" 原则；audit 不可追溯。
- **A3: cancel via status_version alone**：单一字段表达不了"已请求取消"
  与"已确认取消"的区别。

## Spike

- `spikes/m0/cancel-race-test.py`：cancel vs renew/reaper/submit/interrupt-ack
  全竞态矩阵。