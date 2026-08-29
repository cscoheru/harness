# ADR 0002: fence_version 单一来源模型

> **Status**: Accepted (M0)
> **Date**: 2026-08-29
> **Deciders**: Architecture review (Codex v0.6 报告 P0-2)
> **Supersedes**: v0.6 PRD §claim fence_version 硬编码 = 1

## Context

v0.6 PRD 在 `task_attempts` 插入时把 `fence_version` 硬编码为 1。
Codex 实际跑出来发现 task.fence_version=8、attempt.fence_version=1，
导致 trigger `trg_attempt_fence_insert` 永远 fail（如果 trigger 是新加的），
或者 fence 检查彻底失效（如果 trigger 是旧的）。

Codex v0.6 报告 P0-2 是 v0.7 spec 修这个 bug 的源头。

## Decision

**fence_version 单一来源 = `tasks.fence_version`**。

规则：

1. **新 attempt 插入时**：`attempt.fence_version = task.fence_version + 1`。
   触发器 `trg_attempt_fence_insert` 强制等于 task 当前 fence。
2. **claim/fail/cancel/retry_wait 等状态转换后**：`task.fence_version` 自增 1。
   触发器 `trg_task_fence_bump` 同步所有 active attempts 的 fence_version。
3. **最终态检查**：每次 SELECT/UPDATE 都带 `fence_version` 谓词，
   避免 stale write。
4. **counter 持久化**：靠 SQLite WAL + 触发器实现，不需要额外的 fence table。
5. **distributed counter**：Stage 1 单进程 SQLite，不需要；如果未来多进程，
   fence 必须是 task-local 派生（`task.fence_version` 字段即可），不允许
   引入全局 counter。

## Consequences

**正面**：
- 触发器层面的 invariant I1 由 DB 强制，应用层只负责"派生 + 1"
- stale write 被 fence 谓词阻止（I4）
- 没有"全局 counter 漂移"问题

**负面**：
- 触发器增加调试复杂度（M0 spike 必须覆盖）
- 多步转换必须在同一个 IMMEDIATE 事务里完成 fence 自增

## Alternatives Considered

- **A1: fence 表 + 序列**：v0.5 之前的方案。Codex v0.5 报告否决。
- **A2: 应用层 fence 自增，无触发器**：v0.6 方案。Codex v0.6 报告 P0-2 否决。
- **A3: 用 attempt_no 替代 fence_version**：语义不同，attempt_no 是
  顺序号（可能因为 retry 跳号），fence_version 是 optimistic concurrency
  的乐观锁版本号。**不替代**。

## Spike

- `spikes/m0/claim-fence-test.py`：连续 10 次 claim，fence 必须单调递增。
- `spec/kernel-schema.sql` 的 `trg_attempt_fence_insert` 与 `trg_task_fence_bump`：
  必须在 spike 中可执行。