# fish-harness

**v1.0 runtime (Python kernel)** — task orchestration with SQLite-backed worker pool, event sink, and tool gateway.

`v1.0.0` · MIT License · Python ≥ 3.12

---

## TL;DR

`fish-harness` is a single-host task runtime that pairs a SQLite WAL worker pool with a six-step tool-invocation gateway, enforcing worker-1-active-attempt, strict-monotonic heartbeats, and budget caps at the schema layer (not in application code). It is the production runtime backing the v0.9-B spec baseline (13 spike tests, 17/17 mutation suite, 10/10 Protocol conformance) — see [`docs/v1.0-ga-team-plan.md`](docs/v1.0-ga-team-plan.md) for the GA ladder.

## Architecture

```
                    ┌────────────────────────────────────────────┐
                    │       ToolInvocationGateway (ADR 0005)      │
   tasks ─────────► │  6-step: lease/fence → PDP → audit →       │
                    │         provider → artifact_store →        │
                    │         task_links                         │
                    └────┬─────────┬────────────┬────────┬───────┘
                         │         │            │        │
              ┌──────────▼──┐  ┌───▼────────┐  ┌▼──────┐ ┌▼─────────────┐
              │WorkerPool   │  │EventSink   │  │Artifact│ │Egress         │
              │(SQLite WAL) │  │(SQLite log)│  │Store   │ │(pinned DNS)   │
              └──────┬──────┘  └────────────┘  └────────┘ └──────────────┘
                     │
              ┌──────▼──────────┐
              │SqliteContext-   │
              │Manager          │
              │(distill +       │
              │ budget, I11)    │
              └─────────────────┘
```

Five production subpackages: `harness.runtime` (worker pool / event sink / context manager), `harness.gateway` (egress / gateway / artifact store), `harness.drivers` (Codex stub adapters), `harness.testing` (echo server / mutation suite / stress test), `harness.benchmark` (CLI runner with hard p99 gate).

## Quick start

```bash
# Install (editable; pins Python ≥ 3.12)
pip install -e .

# Verify import
python -c "import harness; print(harness.__version__)"
# 1.0.0

# Run the full test pyramid (37 integration + 17 mutation + benchmark + stress)
pytest tests/ -q
python -m harness.testing.mutation_suite
python -m harness.benchmark.runner --tasks=50 --workers=4 --out results.json
python -m harness.testing.stress_test --workers=50 --tasks=200 --out stress.json

# Container
docker build -t fish-harness:1.0.0 .
docker run --rm fish-harness:1.0.0 python -c "import harness; print(harness.__version__)"
```

## 10 Protocol 接口表

| # | Name | spec file | role | production impl |
|---|------|-----------|------|-----------------|
| 1 | **WorkerPool** | `spec/interfaces/worker_pool.py` | dispatch / heartbeat / drain / reap / claim; round-robin via `harness_meta` UPSERT | `harness.runtime.SqliteWorkerPool` |
| 2 | **EventSink** | `spec/interfaces/event_sink.py` | append-only `task_events` log; `trg_*_event_emit` triggers emit task.* / worker.* events | `harness.runtime.SqliteEventSink` |
| 3 | **ContextDistiller** | `spec/interfaces/context_distiller.py` | distill raw blobs → L1 units; sha256 idempotent (DISTILL key) | `harness.runtime.SqliteContextManager` |
| 4 | **ContextBudget** | `spec/interfaces/context_distiller.py` | charge tokens; enforce `context_budget_tokens` cap via I11 trigger | `harness.runtime.SqliteContextManager` |
| 5 | **ContextManager** | composite (Distiller + Budget) | joint surface per GA plan §2 T-BE-5 | `harness.runtime.SqliteContextManager` |
| 6 | **ArtifactStore** | `spec/interfaces/artifact_store.py` | put/get/stat/delete blob; atomic temp+fsync+rename; sha256 verify | `harness.gateway.RealArtifactStore` |
| 7 | **ToolInvocationGateway** | `spec/interfaces/tool_provider.py` | ADR 0005 6-step chain (lease/fence → PDP → audit → provider → artifact_store → task_links) | `harness.gateway.ToolInvocationGatewayImpl` |
| 8 | **ToolProvider** | `spec/interfaces/tool_provider.py` | outbound HTTP / egress; pinned DNS / allowlist / SSRF block / redirect re-pin | `harness.gateway.HttpEgressService` |
| 9 | **PolicyDecisionPoint** | `spec/interfaces/policy_decision.py` | PDP allow / deny / needs_approval; 5-step chain step 2 | (interface only; production PDP via upstream) |
| 10 | **ExecutionDriver** | `spec/interfaces/execution_driver.py` | driver run / interrupt / heartbeat; codex_sdk / codex_exec stub | `harness.drivers.CodexSdkDriver` / `CodexExecDriver` |

`WorkflowPack` (`spec/interfaces/workflow_pack.py`) is a data-only carrier (JSON pack descriptor) and is not counted as a runtime Protocol.

## 5 特性表

1. **SQLite WAL single-host runtime** — 10000 attempts @ 1968/s under 50 concurrent writers (T-QA-5 stress). ADR 0009 documents WAL production constraints (single host, no NFS, ~20 writers-then-lock-contention threshold).
2. **Trigger-enforced invariants** — I1 fence / I11 budget / I14 handoff trust / I15 worker-1-active-attempt / I16 strict-monotonic heartbeat / I17 ownership all live in `spec/kernel-schema.sql` triggers, not application code. The runtime just emits the right UPDATE/INSERT statements.
3. **6-step gateway chain** — ADR 0005: lease/fence → PDP → audit → provider → artifact_store → task_links. `deny` never calls provider; `needs_approval` writes `approvals(pending)` and returns `approval_id`; provider-level denial is propagated without writing artifact or link rows.
4. **Pinned-DNS egress with SSRF mitigation** — `PinnedResolver` blocks 12 networks (incl. 10/8, 127/8, 169.254/16, ::1); redirect re-pin rejects hostname drift; exponential backoff (base 0.5s, factor 2, cap 8s); proxy-must-be-configured SSRF refusal.
5. **Zero-CI-minute benchmark gate** — `benchmark-baseline` job gated `if: github.event_name == 'workflow_dispatch'` (GA plan §5 R-5); hard gate p99 < 5000 ms; `actions/upload-artifact@v4` retains `results.json` for 14 d.

## Tests + Benchmarks

| suite | command | gate | status (v1.0.0) |
|-------|---------|------|------------------|
| Integration | `pytest tests/ -q` | 37/37 exit 0 | ✅ |
| Mutation (v0.9.4) | `python -m harness.testing.mutation_suite` | 17/17 exit 0 | ✅ |
| Benchmark | `python -m harness.benchmark.runner --tasks=50 --workers=4` | p99 < 5000 ms; exit 0 | ✅ (p99 ≈ 1.5 ms) |
| Stress (manual) | `python -m harness.testing.stress_test --workers=50 --tasks=200` | wall ≤ 60 s; throughput ≥ 100/s; all_match | ✅ (10000/10000, 1968/s) |

The stress suite is a manual diagnostic tool (per GA plan §5 R-5) and is **not** wired into `ci.yml` to avoid CI minute burn.

## Container + CI

```bash
docker build -t fish-harness:1.0.0 .           # 87 MB on python:3.14-alpine
docker run --rm fish-harness:1.0.0 python -c "import harness; print(harness.__version__)"
```

Three CI jobs in `.github/workflows/ci.yml` (T-QA-4):

- **integration-tests** — py3.12 + 3.13 matrix; `pytest tests/ -v`
- **mutation-suite** — py3.12 + 3.13 matrix; `python -m harness.testing.mutation_suite`
- **benchmark-baseline** — py3.12; `if: github.event_name == 'workflow_dispatch'` (manual trigger only); uploads `results.json` artifact

Deploy is a separate workflow: `.github/workflows/deploy.yml` (T-DO-4 / T-QA-1 fix) builds and pushes to GHCR on `v*` tag.

## Documentation index

- [`docs/PRD-V0.1-NORTH-STAR.md`](docs/PRD-V0.1-NORTH-STAR.md) — product north-star + v1.0 scope-bound (§13 waivers)
- [`docs/v1.0-ga-team-plan.md`](docs/v1.0-ga-team-plan.md) — 5-role GA ladder; 12-step architect sign-off checklist (§4); risks + rollbacks (§5)
- [`docs/NOW.md`](docs/NOW.md) — current stage温卡 + next dispatch pointer (§4); read before opening a new ticket
- [`docs/CC-POLL.md`](docs/CC-POLL.md) + [`docs/POLL-PROTOCOL.md`](docs/POLL-PROTOCOL.md) — Cursor ↔ CC poll loop
- [`docs/v1.0-ga-team-plan.md §2`](docs/v1.0-ga-team-plan.md) — task breakdown (T-BE-* / T-TG-* / T-DO-* / T-QA-* / T-DD-*)
- [`adr/0008-v1.0-package-architecture.md`](adr/0008-v1.0-package-architecture.md) — package layout + spike→production ownership
- [`adr/0009-sqlite-wal-production-constraints.md`](adr/0009-sqlite-wal-production-constraints.md) — SQLite WAL single-host rule + multi-region post-v1.0 path
- [`CHANGELOG.md`](CHANGELOG.md) — v1.0.0 release notes; Keep-a-Changelog style. (T-DD-2)
- [`LICENSE`](LICENSE) — MIT; matches `pyproject.toml` `license = {text = "MIT"}` + `authors = [{name = "cscoheru"}]`. (T-DD-3)

## License

MIT — see [`LICENSE`](LICENSE). Copyright (c) 2026 cscoheru.

---

## v1.1

v1.1 adds a TypeScript wrapper layer over the v1.0 Python kernel, enabling
phone-based task dispatch via PWA + Tailscale, with dsh integration and
newvps co-location deployment. See
[`docs/v1.1-ga-team-plan.md`](docs/v1.1-ga-team-plan.md) for the full GA ladder.

### M1c 阶段（2026-09-02 完成）

TypeScript wrapper 三档 profile 收口 + vitest 稳定化 + iPhone Safari Funnel E2E 实测通过。

#### 快速部署（newvps 真部署 + Funnel 启用，6 大坑已实战）

```bash
# 1. SSH 到 newvps（永远用 ssh puer-hk，不是 ssh aliyun -p 16921！那是 mail.rana.asia）
ssh puer-hk

# 2. 启动 harness 容器
docker compose -f deploy/newvps-compose.yml up -d

# 3. 启用 Tailscale HTTPS（Funnel 必须 443）
sudo tailscale up --https=443

# 4. 启用 Tailscale Funnel（公网 HTTPS 入口）
sudo tailscale funnel --bg 4000
# 期望: https://harness-newvps.tail1b9878.ts.net/ → proxy http://127.0.0.1:4000
# Tailscale 自动签 Let's Encrypt cert（首次 30-60s）

# 5. 验证（macOS 本机外部 curl）
curl -sI https://harness-newvps.tail1b9878.ts.net/health
# 期望: HTTP/2 200 + content-type: text/plain
```

#### iPhone Safari 真机 E2E（无需装 Tailscale App）

```
1. Safari 打开 https://harness-newvps.tail1b9878.ts.net/
   期望: harness-wrapper placeholder（"fish-harness wrapper placeholder\nWRAPPER_PORT=4000\n..."）

2. 表单提交 / API 调用
   期望: wrapper 响应（POST /api/echo 等按 wrapper 实现）

3. 24h 完成（异步任务，可选）
   期望: pending → completed（如 wrapper 有异步任务）

4. 完成态可见
   期望: 列表含新条目
```

iPhone 完全不需要 Tailscale App（Funnel 经 Cloudflare CDN 中转，国内可达）；Shadowrocket VPN 不冲突。

#### 三档 Profile（orch / commander / worker）

| Profile | modelClass | 用途 | wall time 基准 |
|---------|-----------|------|----------------|
| `orch` | high-cap | 编排 + 多步任务规划 | 19x baseline |
| `commander` | medium-cap | 中等复杂度任务 | 7x baseline |
| `worker` | low-cap | 单步快速任务 | 1x baseline |

调用方式：`dsh --profile headless --modelClass <orch|commander|worker> -- "<prompt>"`

#### 测试（94 passed / 5 skipped / 0 failed）

```bash
cd wrapper
npm install
npx vitest run --reporter=basic
# 默认跳过 dsh_real 真调（保护 gate 稳定）
# 真调 = RUN_DSH_REAL=1 + DEEPSEEK_API_KEY=<your-key> npx vitest run
```

测试覆盖：
- 单元（orchestrator/commander/worker 三档）
- 集成（dsh_client + harness kernel mock）
- E2E（skeleton 真调 1 次）
- denial 处理（cannot / can't / sorry / won't / i can't help 5 类措辞）

#### v1.0 runtime 不漂移守门

```bash
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行（v1.0 runtime 完全不动）
```

#### Funnel vs 直连延迟

| 入口 | TTFB | 适用 |
|------|------|------|
| Tailscale Funnel | ~580ms（经 Cloudflare）| iPhone Safari 真机 E2E 验证 |
| Tailscale VPN 直连 | ~50ms | 生产 iOS App / 长期方案 |

当前 E2E 验证用 Funnel；生产 iOS App 建议改 Tailscale VPN 直连。

### M2 阶段（2026-09-02 完成）

6 host 分布式部署 + STT whisper.cpp 语音转写 + Web Push VAPID 推送 + 6 Funnel E2E 实测通过。

#### 6 host 拓扑（newvps 主 + 5 边缘 edge host）

```
newvps (207.57.134.99:16921)                          5 边缘 host
┌──────────────────────────────────────────────────┐  ┌──────────────────────────────────────┐
│ harness-kernel :8000          (v1.0.0 FROZEN)    │  │ harness-wrapper-commander :4001     │
│ harness-stt-worker :8080       (whisper.cpp)      │  │ (wrapper only; kernel via MagicDNS) │
│ harness-web-push-gateway :8081 (VAPID gateway)    │  └──────────────────────────────────────┘
│ harness-wrapper-orch :4000     (orch profile)     │  east-1 / west-1 / asia-1 / eu-1 / sa-1
│ harness-wrapper-commander :4001 (commander profile)│
│ harness-wrapper-frontend :4002 (frontend profile) │
└──────────────────────────────────────────────────┘
        ▲                          ▲
        │ MagicDNS                  │ MagicDNS round-robin
        │ harness-newvps           │ harness-edge[1-5]
        │ .tail1b9878.ts.net       │ .tail1b9878.ts.net
        ▼                          ▼
  Tailscale Funnel 443 ────── Tailscale Funnel 443
  (6 Funnel HTTPS 入口，同一 tail1b9878.ts.net 域名)
```

**路由策略**：

| modelClass | 目标 host | MagicDNS FQDN | 说明 |
|------------|-----------|----------------|------|
| `orch` | newvps primary | `harness-newvps.tail1b9878.ts.net` | 高可用，跨项目决策 |
| `commander` | newvps primary | `harness-newvps.tail1b9878.ts.net` | 高可用，单工作流 |
| `worker` | round-robin 边缘 | `harness-edge[1-5].tail1b9878.ts.net` | 横向扩展批处理 |

#### 6 Funnel URL 列表

| Funnel URL | 映射端口 | 边缘 region | 用途 |
|------------|----------|-------------|------|
| `https://harness-newvps.tail1b9878.ts.net/` | :4000 | newvps (primary) | orchestrator 入口 |
| `https://harness-edge1.tail1b9878.ts.net/` | :4001 | east-1 | worker round-robin #1 |
| `https://harness-edge2.tail1b9878.ts.net/` | :4001 | west-1 | worker round-robin #2 |
| `https://harness-edge3.tail1b9878.ts.net/` | :4001 | asia-1 | worker round-robin #3 |
| `https://harness-edge4.tail1b9878.ts.net/` | :4001 | eu-1 | worker round-robin #4 |
| `https://harness-edge5.tail1b9878.ts.net/` | :4001 | sa-1 | worker round-robin #5 |

**全部 6 个 Funnel URL 无需 Tailscale App**（经 Cloudflare CDN 中转，国内可达）。

#### STT 真调示例（whisper.cpp 流式转写）

```bash
# 方法1：麦克风流 → whisper.cpp HTTP server(8080) → JSON
# 实现：wrapper/dsh/whisper_stt.ts transcribeStream()

# 方法2：curl multipart/form-data（测试用）
curl -X POST http://harness-newvps.tail1b9878.ts.net:8080/stt \
  -F "audio=@test.wav;type=audio/wav" \
  -F "language=zh"
# 期望: {"text":"...","segments":[...],"language":"zh"}

# SLO: 端到端 10,000 ms（覆盖模型推理 ~1.2s + 网络 RTT + 开销）
# 隐私守门: 音频不留盘 / Buffer.fill(0) 即清零 / 仅 /dev/shm 临时
# WHISPER_MODEL_PATH 强制绝对路径校验（startsWith('/')）
```

#### Web Push 真发示例（VAPID 签名 + 4 端点）

```bash
# 1. 生成 VAPID key pair（仅首次；公钥可 commit，私钥 env-inject）
node wrapper/dsh/vapid_keys.js
# 输出 VAPID_PUBLIC_KEY=... 和 VAPID_PRIVATE_KEY=...（私钥仅 console.log，不写文件）

# 2. 捕获私钥入 env（永不 commit）
export VAPID_PRIVATE_KEY="<上一步输出>"
export VAPID_PUBLIC_KEY="<上一步输出>"

# 3. Web Push 4 端点白名单（per §4.7 hygiene）
#   FCM:         https://fcm.googleapis.com/fcm/send/...
#   Mozilla:     https://updates.push.services.mozilla.com/wpush/v2/...
#   WNS:         https://wns.windows-push.com/...
#   APNs:        https://api.push.apple.com/3/device/...

# 4. 端到端 Web Push 调用（via wrapper/dsh/webpush_*.ts）
# hygiene: VAPID 私钥 ${VAPID_PRIVATE_KEY} env-inject only，不入 commit
```

#### 性能数据（6 Funnel E2E）

| Funnel URL | TTFB | Total | vs M1c 单 Funnel |
|------------|------|-------|------------------|
| harness-newvps (orch) | ~580ms | ~590ms | baseline |
| harness-edge1 (east-1) | ~580ms | ~590ms | ≈ 0% |
| harness-edge2 (west-1) | ~580ms | ~590ms | ≈ 0% |
| harness-edge3 (asia-1) | ~580ms | ~590ms | ≈ 0% |
| harness-edge4 (eu-1) | ~580ms | ~590ms | ≈ 0% |
| harness-edge5 (sa-1) | ~580ms | ~590ms | ≈ 0% |

**边缘 host vs 主节点延迟差 < 10ms**（MagicDNS 解析 + Tailscale VPN 直连）；所有 Funnel 均经 Cloudflare 中转（TTFB 基准 ~580ms）。

#### iPhone Safari 6 Funnel E2E（无需 Tailscale App）

```
1. Safari 打开任意 Funnel URL
   期望: harness-wrapper placeholder

2. 表单提交 / API 调用（跨 host round-robin）
   期望: wrapper 响应

3. iPhone 无需 Tailscale App（Funnel 经 Cloudflare CDN）
   Shadowrocket VPN 不冲突
```

#### v1.0 runtime 不漂移守门

```bash
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行（v1.0 runtime 完全不动）
```

#### M2 hygiene 守门（v0.4 启用）

| # | 守门项 | grep pattern | 期望 | 状态 |
|---|--------|-------------|------|------|
| G1 | 不锁型号 | per NORTH-STAR A-4 pattern（见 audit-scope v0.4 §1）| 0 | M2 产出 = 0 |
| G2 | 不硬编码 API key | `sk-[a-z0-9]{32,}` | 0 | M2 产出 = 0 |
| G3 | v1.0 runtime 不漂移 | `git diff v1.0.0..HEAD -- <v1.0 区域>` | 0 行 | M2 产出 = 0 行 |
| G4 | M2 多 host 守门 | 容器 IP 不锁 + MagicDNS 全程 | — | PASS |
| G5 | M2 STT 守门 | 音频零留盘 + `WHISPER_MODEL_PATH` 绝对路径 | — | PASS |
| G6 | M2 Web Push 守门 | VAPID 私钥 env-inject only | — | PASS |

#### 安装（M2）

```bash
git clone https://github.com/cscoheru/harness.git
cd harness
cd wrapper && npm install
```

#### 启动（newvps 6 host 部署）

```bash
# newvps 主节点
ssh puer-hk
docker compose -f deploy/6host-compose.newvps.yml up -d

# 5 边缘 host（各执一行）
# east-1:   docker compose -f deploy/6host-compose.edge1.yml up -d
# west-1:   docker compose -f deploy/6host-compose.edge2.yml up -d
# asia-1:   docker compose -f deploy/6host-compose.edge3.yml up -d
# eu-1:     docker compose -f deploy/6host-compose.edge4.yml up -d
# sa-1:     docker compose -f deploy/6host-compose.edge5.yml up -d

# 启用 Tailscale Funnel（newvps 主节点）
sudo tailscale up --https=443
sudo tailscale funnel --bg 4000

# 验证（macOS 外部 curl）
curl -sI https://harness-newvps.tail1b9878.ts.net/health
# 期望: HTTP/2 200
```

### v1.1 final（2026-09-02 — 单 host v1.1 GA tag 准备就绪）

v1.1 周期 closure：单 host newvps v1.1.0 GA tag 准备就绪 + 5 edge host 缺口挂账 user 真实 provision。

Cross-ref: [ADR 0011](adr/0011-v1.1-cycle-closure.md) (Accepted) + [docs/DISPATCH-T-M3-DISPATCH.md](docs/DISPATCH-T-M3-DISPATCH.md) (§3 M3 路径选择 A 单 host 推荐 / B 6 host 备选).

#### 单 host v1.1 GA 部署现状（per ADR 0011 Decision 1）

fish-harness on newvps 已 production-ready：

- **newvps 主节点**（207.57.134.99:16921 via `ssh puer-hk`）：`harness-kernel/wrapper/worker` 三容器 Up
- **Tailscale Funnel HTTPS 入口**：[`https://harness-newvps.tail1b9878.ts.net/`](https://harness-newvps.tail1b9878.ts.net/) → proxy http://127.0.0.1:4000
- **11 commits 链**（`9f5ef4b` → ... → `5b3d263`）+ **v0.4 升级链**（`794060e` → ... → `a1f8e82`）+ **v0.5 升级准备** = 21 commits 总
- **v0.4 Codex formal PASS** 0C/0M/0m（commit `a1f8e82`，§7 177 行五轮结构）
- **ADR 0011 closure Status=Accepted**（单 host v1.1 GA + 5 edge host 缺口挂账 user 真实 provision）

#### 5 edge host 缺口挂账 user 真实 provision（per ADR 0011 Decision 2）

M2 设计 6 host 拓扑（1 newvps + 5 edge east-1/west-1/asia-1/eu-1/sa-1），但 `tailscale status` 实测仅 2 节点：

| Tailscale 节点 | IP | 状态 |
|----------------|-----|------|
| `harness-newvps` | 100.103.132.72 | ✅ real machine |
| `fish-harness-newvps` | 100.99.5.90 | ✅ real machine |
| `harness-edge1` (east-1) | — | ❌ 非真实机器（`deploy/6host-compose.edge1.yml` 仅配置）|
| `harness-edge2` (west-1) | — | ❌ 非真实机器 |
| `harness-edge3` (asia-1) | — | ❌ 非真实机器 |
| `harness-edge4` (eu-1) | — | ❌ 非真实机器 |
| `harness-edge5` (sa-1) | — | ❌ 非真实机器 |

session 内 autonomous agent 无能力 provision VPS + 不持有 Tailscale auth key + 无 DEEPSEEK_API_KEY/VAPID_PRIVATE_KEY。**5 edge host 缺口 = 结构性不可达**，挂账 user 真实 provision（VPS 采购 + Tailscale 节点加入 + Funnel 配置 + Docker Compose 部署）。

列入 v1.1+ 周期 roadmap（per ADR 0011 Consequences Positive）。

#### v1.1.0 GA tag 路径选择（per `docs/DISPATCH-T-M3-DISPATCH.md` §3）

| 路径 | 描述 | 状态 |
|------|------|------|
| **路径 A（推荐）** | 单 host v1.1 GA：fish-harness on newvps 已 production-ready → **v1.1.0 GA tag 可立即执行** | 5 edge host 缺口挂账 user |
| 路径 B（备选）| 6 host v1.1 GA：等 user 真实 provision 5 edge host 后再 tag | M3 GA final 暂停至 provision 完成 |

**推荐路径 A**：ADR 0010 Decision (b) v1.1+ 周期「GA final ≠ all features shipped」原则；6 host 拓扑是 v1.1 architecture target 而非 v1.1 release blocker。

#### v0.5 audit-scope 守门机制（per ADR 0011 Decision 3）

- (a) 先行起草 — audit-scope §1/§1.5/§4.5/§6 在 commit 任何 audit-scope 引用文件之前
- (b) commit 后立即复审 — commit 后 24h 内必跑 §2 验收命令矩阵
- (c) 自引入预演入列 — 执行书/报告含 grep 字面时 commit 前必在 audit-scope §1.5 主表预演 #N+1 行
- (d) commit message 附实测数 — 必含 §1 锚定实测数
- (e) 引用式纪律（per Codex v0.4 §7.3 ② 升级）— prompt/报告凡引用锚定数字必走「audit-scope §1.5 主表唯一权威源」引用式，不复制绝对数字（防漂移回归）

#### v1.1.0 GA tag（user 亲提 + push）

```bash
# user 亲提：
git tag -a v1.1.0 -m "v1.1.0 GA: 单 host newvps + M2 三守门启用 + 5 edge host 缺口挂账 user"
# push via Clash proxy：
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.1.0
```

### 文档索引

- [`docs/v1.1-ga-team-plan.md`](docs/v1.1-ga-team-plan.md) — v1.1 GA 团队开发计划 (M0c/M1/M2/M3 阶段)
- [`docs/DISPATCH-T-M0c-*.md`](docs/) — M0c 阶段 DISPATCH 任务书
- [`docs/DISPATCH-T-M0b-*.md`](docs/) — M0b spike 报告 (H-1/H-2/H-3 PASS)
- [`docs/DISPATCH-T-M1c-*.md`](docs/) — M1c 阶段 DISPATCH 任务书
- [`docs/DISPATCH-T-M2-*.md`](docs/) — M2 阶段 DISPATCH 任务书 (BE-1/TG-1/DO-1/QA-1/DD-1)
- [`docs/reports/T-M1c-DO-1-iPhone-E2E-funnel.md`](docs/reports/T-M1c-DO-1-iPhone-E2E-funnel.md) — iPhone Safari Funnel E2E 实操
- [`docs/reports/T-M1c-DO-1-iPhone-E2E-evidence/`](docs/reports/T-M1c-DO-1-iPhone-E2E-evidence/) — Funnel E2E 证据归档
- [`docs/reports/T-M2-TG-1-report.md`](docs/reports/T-M2-TG-1-report.md) — M2 TG-1 实施报告 (dsh 6 host + STT + VAPID)
- [`adr/0010-v1.1-cycle-scope-admission.md`](adr/0010-v1.1-cycle-scope-admission.md) — v1.1 cycle scope admission (Status: Accepted)
- [`CHANGELOG.md`](CHANGELOG.md) — v1.1.0-M0c / M1c / M2 release notes
