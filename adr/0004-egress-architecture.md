# ADR 0004: Egress 架构选型

> **Status**: Accepted (M0 pending spike)
> **Date**: 2026-08-29
> **Deciders**: Architecture review (Codex v0.6 报告 P0-4)
> **Supersedes**: v0.6 PRD §httpx.AsyncResolver（不存在）

## Context

v0.6 PRD 用 `httpx.AsyncResolver` 做 SSRF 防护（pinned DNS）。
**`httpx.AsyncResolver` 不存在**（Codex 验证 httpx 0.28.1：
`hasattr(httpx, "AsyncResolver") = False`）。这是 v0.7 spec 必须修的硬错。

可选方案：

**A: 独立 egress proxy 进程**
- 在 harness 进程之外跑一个 sidecar（envoy / mitmproxy / 自研）
- 所有 outbound HTTP 走 proxy，proxy 做 IP 校验 + allowlist
- 优点：硬隔离，harness 进程即使被攻破也无法绕过 egress 控制
- 缺点：增加运维复杂度，需要 service mesh

**B: httpcore custom backend**
- 用 `httpcore.AsyncConnectionPool` 的 custom backend 接口
- 在 transport 层注入 pinned resolver
- 优点：纯 Python，harness 单进程
- 缺点：必须实现完整的 backend（dial / connect / read / write），
  工作量大

**C: 手动 IP pin + socket.getaddrinfo 替换**
- 启动时把允许域名解析为固定 IP，httpx 仍然走正常 DNS
- 但在 transport 层把 host 替换为 IP + Host header
- 优点：实现简单，几十行代码
- 缺点：HTTPS SNI/TLS 不一致时可能被 ECH/CDN 拒绝
  （需要同步维护 IP 列表）

## Decision

**M0 spike 选 A（独立 egress proxy）作为 primary path，B/C 作为 fallback**。

理由：
- SSRF 是单点防御目标，隔离进程天然正确
- 0.7 已经引入 spike 机制，A 方案可在 spike 中真实跑通
- A 方案不需要 Python 代码解决 HTTP/2 + TLS + ECH 等细节

**禁止**：
- ❌ 用 `httpx.AsyncResolver`（不存在）
- ❌ 在 harness 进程内做 IP pin 后直接用 host 头（绕过 TLS 校验）
- ❌ 把 egress 校验推迟到 "after connect"（TOCTOU）

## Consequences

**正面**：
- 安全模型清晰：proxy 是 hard boundary
- harness 代码不需要理解 IP 协议层
- future 可以直接换成 corporate egress / Zscaler / Cloudflare Gateway

**负面**：
- 必须先部署 proxy 才能跑 spike（M0 spike 包含 deployment manifest）
- 进程间通信增加 5-20ms 延迟（per request）

## Spike

- `spikes/m0/egress-httpx-actual.py`：验证 `httpx.AsyncResolver` 不存在，
  并展示 `socket.getaddrinfo` 是正确原语
- M0 退出标准必须包含一个能跑通的 egress proxy container image

## Alternatives Considered

参见 Context 段。决策理由见 Decision 段。
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

