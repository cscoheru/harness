# ADR 0006: 上下文 4 层模型

> **Status**: Accepted (M0)
> **Date**: 2026-08-30
> **Deciders**: Architecture review (PRD-v0.9 §5 决策日志)
> **Supersedes**: v0.7 blob 流（无层概念）

## Context

v0.7 把 task 的"上下文"当作一条 blob 流：

- `blobs` 存任意 bytes
- `artifacts` 命名产物
- `task_links` 关联 task ↔ artifact

但**没有"层"的概念**。这带来三个问题：

1. **token 计数无落点**：v0.7 无法回答"这个 task 当前用掉了多少 token / 剩余多少"
2. **trust_label 沿用 v0.7 的 4 类**，但没有强制"压缩 / handoff 时不能被污染"
3. **Claude Code 上下文机制无映射**：200K window、auto-compact、cache breakpoint、@-mention、sub-agent context 全部要在 harness 层独立实现，但 v0.7 没结构

李厚辰的 harness 视频（2026-08）明确指出：**上下文机制是 harness 编排的核心**，"基于 Claude Code 上下文机制做分层设计"。

## Decision

**引入 4 层上下文模型（L0 / L1 / L2 / L3）**，落地位置：

```text
L0 raw_blob       — ingest 的原始字节
                    落点：v0.7 blobs 表（已有）
                    trust_label 由 ingest 决策

L1 distilled      — L0 经 ContextDistiller 后的语义单元
                    落点：context_snapshots(level='L1') + 新 blobs(trust_label 继承)
                    idempotent at sha256（v0.7 blobs.sha256 UNIQUE 已提供）

L2 working_set    — 当前 attempt 的活跃上下文
                    落点：context_snapshots(level='L2')
                    强制：累计 token ≤ tasks.context_budget_tokens（I11）

L3 handoff        — task 切换 / cancel 时压缩的状态
                    落点：context_snapshots(level='L3') + blobs
                    强制：trust_label ≠ untrusted_external（I14 防污染）
```

**关键不变量**：

- **I11**：L2/L3 snapshot 累计 token_count > `tasks.context_budget_tokens` 时 INSERT 必须 raise（trigger）
- **I12**：L1 distilled 在 `blobs.sha256` UNIQUE 约束下 idempotent（继承 v0.7）
- **I13**：L3 handoff 可在新 attempt 完整恢复 L2 working_set（由 `restore_handoff()` 保证）
- **I14**：L3 handoff trust_label ≠ untrusted_external（trigger）

**Protocol**：

- `ContextDistiller`：distill / charge / snapshot_for_handoff / restore_handoff
- `ContextBudget`：remaining / total（driver 用来决定何时触发 handoff）

**Schema 增量**（v0.9-A）：

- `tasks.context_budget_tokens INTEGER`（nullable）
- 新表 `context_snapshots`（L0/L1/L2/L3 账本）
- 2 新 trigger：`trg_snapshot_budget_check`（I11）+ `trg_handoff_trust_label`（I14）

## Consequences

**正面**：

- 4 层语义清晰：每个层有自己的生命周期、trust_label 语义、计费规则
- 与 Claude Code 上下文机制 1:1 对应（见 PRD-v0.9 §1.1 表）
- I11 / I14 在 SQLite 层强制；driver / pack 想绕过只能改 schema
- v0.9-A 增量小（1 列 + 1 表 + 2 trigger + 2 Protocol + 1 event + 1 spike），不破坏 v0.8 已 ✅ 的 4 条硬门槛

**负面**：

- `context_snapshots` 表行数随 task 时长线性增长；M2 retention 需考虑
- L1 蒸馏的具体实现（正则？LLM？rule？）v0.9-A 不强制，留给 pack 自定义
- ContextDistiller Protocol 是 sync；M2 引入 async pool 时需扩展

**跨 ADR 引用**：

- ADR 0002（fence_version 单一来源）：不变；context_snapshots 不引入新 counter
- ADR 0003（cancel state model）：L3 handoff 在 cancel 时由 `finalize_cancel` 同步触发
- ADR 0005（tool invocation gateway）：ContextDistiller 是 gateway 的"输入侧"——tool 结果先经 distill 再入 L2

## Alternatives Considered

### A1: 不分层，blob + token_count 字段

- 缺点：trust_label 在 L2/L3 不强制；污染防护要靠 driver 自律
- 否决

### A2: 2 层（L0 + L3）

- 缺点：丢掉 L1 distilled（idempotent 语义）和 L2 working_set（attempt 内）
- 否决

### A3: 5 层（L0 + L0.5 trust_resolved + L1 + L2 + L3）

- 缺点：trust_resolved 与 L1 distilled 重叠
- 否决

### A4: 沿用 v0.7 blob 流，由 driver 自己管 context

- 缺点：v0.7 没有强制 token 计数；driver 自己管 = 没有不变量
- 否决

## Spike

- `spikes/m0/context-budget-test.py`：6 个 case（含 I11 / I14 反例）
- `spikes/m0/conformance-second-impl.py` 7th Test：TrivialContextDistiller 满足 Protocol shape
- `spec/kernel-schema.sql`：在原 SQLite 上 `sqlite3 :memory: < spec/kernel-schema.sql` 不报错

## 兼容性

- v0.7 / v0.8 spike **不需要修改**
- v0.7 schema 应用后 v0.9-A schema 直接 apply（PRAGMA + 新表）
- v0.8 M1 八条硬门槛中已有的 ✅ 状态**保持不变**

## 后续（v0.9-B / v1.0）

- **v0.9-B 负载均衡**：workers 表 + WorkerPool Protocol + 跨 host dispatch
- **distill worker 自动调度**：tool 返回时异步 distill L1
- **auto-compact 触发器**：working_set 接近 budget 时自动 L2→L3
- **M3 Evaluator SPI**：context budget 违反 = 评估扣分项
---

## v1.0 Status

**v1.0 Status: Included in GA** — 2026-09-01.

本 ADR 在 fish-harness **v1.0.0a0** release 已纳入最终交付物；后续 v1.x 改动走标准 ADR 流程：

- 新增 ADR 编号 ≥ 0010
- 不修改本 ADR 内容（保留 v1.0.0a0 历史快照）
- 引用本文时用 `<adr-XXXX>` tag

详见：

- [`CHANGELOG.md`](../CHANGELOG.md) `## [v1.0.0a0]` 段
- [ADR 0008](./0008-v1.0-package-architecture.md) — `harness/` 5-subpackage layout
- [ADR 0009](./0009-sqlite-wal-production-constraints.md) — SQLite WAL single-host rule

