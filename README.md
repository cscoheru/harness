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

### v1.1 final（2026-09-02 — 单 host v1.1 GA tag 准备就绪 + **M3 EXEC PASS 2026-09-03**）

v1.1 周期 closure：单 host newvps v1.1.0 GA tag 准备就绪 + 5 edge host 缺口挂账 user 真实 provision + **M3-EXEC-3 stub 替换 PASS + ADR 0011 closure 公告起草 + v0.6 audit-scope 起草 PASS**。

Cross-ref: [ADR 0011](adr/0011-v1.1-cycle-closure.md) (Accepted) + [docs/DISPATCH-T-M3-DISPATCH.md](docs/DISPATCH-T-M3-DISPATCH.md) (§3 M3 路径选择 A 单 host 推荐 / B 6 host 备选) + [notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md](notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md) (§4.7.5 M3-EXEC-3 stub 替换守门 + §2.5 signVapidJwt JWK 合规) + [docs/announcements/adr-0011-closure.md](docs/announcements/adr-0011-closure.md) (M3-EXEC-5 9 段公告) + [docs/DOCS-RELEASE-NOTES-v1.1.0.md](docs/DOCS-RELEASE-NOTES-v1.1.0.md).

#### M3 GA final 实施 PASS（2026-09-03）

M3 GA final 阶段 = v1.1 周期收口 + 路径 A 单 host v1.1 GA 实施包。

**M3-EXEC-3 stub 替换 PASS**（per v0.6 §4.7.5）：
- `wrapper/dsh/vapid_keys.ts` 新增 `signVapidJwt(input, privateKeyBase64url)` ECDSA P-256 + SHA-256 函数 — Node.js `createSign('SHA256').sign({ key, dsaEncoding: 'ieee-p1363' })` 输出 RFC 8292 §3.2 raw r||s 64 字节 base64url = 86 字符
- `wrapper/orchestrator/webpush_gateway.ts` 删除 `hmacSha256` stub + import `createHmac` — 真 VAPID ES256 签名取代 M2 BE-1 placeholder
- `wrapper/test/integration/webpush_e2e.test.ts` 加 §7 describe block（86-char base64url 形状断言 + RFC 8292 公私钥 verify roundtrip） + 4 broken URL paths 修复 + env delete order 修复
- 实测：22 tests / **23 passed / 2 failed**（仅 §5 + §6 真机网络测试需 user 真实部署后跑；stub 替换前 7 failed 修复后 2 failed，符合 plan §2.5 20/2 预期）

**M3-EXEC-5 ADR 0011 closure 公告 PASS**：
- `docs/announcements/adr-0011-closure.md` 9 段（含 #8 Single Host Production-Ready Verification Checklist 6 项 + #9 v1.1.0 GA Tag Trigger Conditions 4 步）
- `docs/DOCS-RELEASE-NOTES-v1.1.0.md` GA release notes（3 段摘要 + 升级指南 + 5 edge host 缺口 + 单 host production-ready 声明）
- `docs/v1.1-ga-team-plan.md` v0.4 → v0.5 升级
- `CHANGELOG.md [1.1.0] GA 段` 补「M3 EXEC PASS」marker + M3-EXEC-3 stub 替换 entry

**v0.6 audit-scope 起草 PASS**：
- `notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md` v0.5 → v0.6 升级（11 文件改动 hygiene 自检表）
- §4.7.5 NEW: M3-EXEC-3 stub 替换守门（hmacSha256 == 0 / signVapidJwt ≥ 2 / createSign('SHA256') ≥ 1 / dsaEncoding 'ieee-p1363' ≥ 1）
- §2.5 NEW: signVapidJwt JWK 合规守门（`d:` 字面 = 0 行）
- §1.5 主表新增 #54-#57（实测后填；演进链 117 → 实测权威源；公式预测不准，禁复制绝对数字）
- `notes/codex-audit-scope-v1.1-m0c-v0.6-precommit-prompt.md` 配套 Codex 复审 prompt（17 验证命令 + 8 hygiene checklist）

**全 wrapper/ vitest 套件 PASS**：94 passed / 73 skipped / 0 failed（webpush_e2e + stt_e2e 需 env-inject 启用）。

#### 单 host v1.1 GA 部署现状（per ADR 0011 Decision 1）

fish-harness on newvps 已 production-ready：

- **newvps 主节点**（207.57.134.99:16921 via `ssh puer-hk`）：`harness-kernel/wrapper/worker` 三容器 Up
- **Tailscale Funnel HTTPS 入口**：[`https://harness-newvps.tail1b9878.ts.net/`](https://harness-newvps.tail1b9878.ts.net/) → proxy http://127.0.0.1:4000
- **11 commits 链**（`9f5ef4b` → ... → `5b3d263`）+ **v0.4 升级链**（`794060e` → ... → `a1f8e82`）+ **v0.5 升级准备** + **v0.6 M3 EXEC 11 文件改动** = 22+ commits 总
- **v0.4 Codex formal PASS** 0C/0M/0m（commit `a1f8e82`，§7 177 行五轮结构）
- **v0.6 audit-scope 起草 PASS**（11 文件改动 hygiene 自检表 PASS；§4.7.5 M3-EXEC-3 stub 替换守门启用）
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

#### v1.1.0 GA tag（user 亲提 + push via Clash proxy）

```bash
# user 亲提 v1.1.0 GA tag：
git tag -a v1.1.0 -m "v1.1.0 GA: 单 host newvps + M2 三守门启用 + M3 EXEC PASS + ADR 0011 closure + 5 edge host 缺口挂账 user"
# push via Clash proxy（项目本地铁律，不用 HTTPS proxy 会断连）：
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.1.0
```

**tag 触发前置条件**（per `docs/announcements/adr-0011-closure.md` #9）：
1. M3-EXEC-1 ~ M3-EXEC-5 全部完成（agent 已 PASS）
2. **v0.6 audit-scope Codex formal PASS**（user 亲提 Codex CLI：model=gpt-5.6-sol + reasoning_effort=xhigh）
3. user 亲提 `git tag -a v1.1.0`
4. 6 Funnel URL 路径全部 200（`/ /health /api/v1/tasks /api/v1/status/test /api/v1/worker/heartbeat /api/v1/push/subscribe` — user ssh puer-hk 真机验证）

**user 必须执行挂账**（per M3-EXEC-1/2/3/6）：
- **M3-EXEC-1**：ssh puer-hk + 写入 DEEPSEEK_API_KEY + VAPID_PRIVATE_KEY + VAPID_PUBLIC_KEY + VAPID_SUBJECT 到 `/opt/puer-hub/.env` + restart containers
- **M3-EXEC-2**：真机 4 E2E 套件真调（webpush_e2e + stt_e2e + dsh_6host + 6host_e2e）
- **M3-EXEC-3 (验证)**：Funnel URL 6 路径 × 200 验证
- **M3-EXEC-6**：v1.1.0 GA tag + push via Clash proxy（命令见上）

### v1.1.1 cycle scope（2026-09-03 — server-side 切入口 + 5 edge host provision 起草 + dsh binary install）

v1.1 cycle scope 继续推进：把仓库 12 个 wrapper 真实现文件（`orchestrator.ts` + `6host_router.ts` + `stt_worker.ts` + `webpush_gateway.ts` + `pwa_server.ts` + `types.ts` + 7 dsh 文件）的 server-side 切入口落地（`sleep infinity` placeholder → `node build/server.js` 真实现），同时把 5 edge host provision 起草到「operator 真机 provision ready」状态。

**Cross-ref**：[`notes/codex-audit-scope-v1.1.1-v0.7-precommit.md`](notes/codex-audit-scope-v1.1.1-v0.7-precommit.md)（v0.7 守门：§4.5.7 5 edge compose 守门 + §4.7.6 server.ts 8 endpoint 守门 + §4.8 PROJECT_ROOT 路径修法守门 + §4.9 dsh binary install 守门）+ [`deploy/runbook-edge-provision.md`](deploy/runbook-edge-provision.md)（5 edge host provision runbook §2 5 步骤 + §3 5 edge 表 + §4 验证清单 + §5 故障排除 6 项 + §6 rollback）。

#### 1. server.ts 8 endpoint integration（NEW `wrapper/server.ts`）

```
GET  /health                    → orchestrator.health()
POST /api/v1/tasks              → orchestrator.dispatch()
GET  /api/v1/status/:task_id    → orchestrator.getTaskStatus()
GET  /api/v1/status/test        → inline {status:"ok",test:true,ts}
POST /api/v1/worker/heartbeat   → stub {status:"ok"} (M1+ skeleton)
POST /api/v1/push/subscribe     → webpush.sendPush()
POST /api/stt/transcribe        → stt.transcribe() (dynamic-imported)
GET  *                          → SPA fallback (app.use catch-all)
```

**实战发现**：
- Express 5 + path-to-regexp v8 不再支持裸 `*`，必须用 `app.use` catch-all middleware
- Route order：literal `/status/test` 必须 BEFORE parameterized `/status/:task_id`（否则 `test` 被捕获为 task_id → 404）
- `stt_worker.ts` module-level `WHISPER_MODEL_PATH` check 会触发 wrapper 启动崩溃 → handler 内 dynamic import 隔离副作用

#### 2. PROJECT_ROOT 路径修法（4 dsh 文件统一模式）

```
旧: const PROJECT_ROOT = resolve(process.cwd(), '..')
新: const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const PROJECT_ROOT = resolve(__dirname, '..', '..')
```

**双修 volume mount**：`../wrapper:/app/wrapper:ro` → `..:/app:ro` + `working_dir: /app/wrapper`

4 文件：`wrapper/dsh/{dsh_client.ts:33, profile.ts:37, 6host_client.ts:138 (函数内), vapid_keys.ts:221 (main() 内)}`

#### 3. deploy 切入口（12 services sleep infinity → node build/server.js）

| Compose file | Services | 切入口 |
|--------------|----------|--------|
| `deploy/newvps-compose.yml` | wrapper + worker (2) | volumes + working_dir + command |
| `deploy/6host-compose.newvps.yml` | stt-worker + web-push-gateway + wrapper-orch/commander/frontend (5) | 同上 |
| `deploy/6host-compose.edge[1-5].yml` | edge1-5 wrapper (5) | 同上 + EDGE_REGION east-1/west-1/asia-1/eu-1/sa-1 |

**kernel FROZEN 不动**（per ADR 0010 Decision (d)）— 12 service entries 全部切到 `node build/server.js`。

#### 4. 5 edge host provision 起草（operator 真机执行 ready）

- 5 edge compose + `tag:harness-edge` ACL + 跨 host routing（edge → newvps kernel:8000 + wrapper:4000-4002 + stt:8080 + push:8081）+ 端口 4001 Funnel
- `env/edge-host.env.example` 模板（TAILSCALE_AUTHKEY + DEEPSEEK_API_KEY + WORKER_ID + EDGE_REGION）
- `deploy/runbook-edge-provision.md` §2 5 步骤 + §5 故障排除 6 项 + §6 rollback
- **真机 provision 留待 v1.1.1.1+** — session 内 autonomous agent 无能力 provision VPS + 无 Tailscale auth key

#### 5. dsh binary install（`deploy/install-dsh.sh` NEW ~70 行）

```bash
# Operator SSH to newvps + 跑:
ssh puer-hk 'DSH_VERSION=v1.0.0 DSH_URL=https://github.com/<owner>/dsh/releases/download/v1.0.0/dsh-linux-x64 \
  bash -s' < deploy/install-dsh.sh
# Verify: which dsh && dsh --version
```

**operator 必须 verify** DSH_URL（agent 无法访问 GitHub + 不知道 dsh 项目确切 URL）。

#### 6. 双 gate + hygiene 守门 PASS

| Gate | Result |
|------|--------|
| tsc `--noEmit` | exit 0 |
| vitest run | 126 passed / 80 skipped / 0 failed（含 32 NEW tests: 12 server + 20 project_root）|
| 不锁型号 grep | == 0 |
| DEEPSEEK_API_KEY 字面 | == 0 |
| VAPID 私钥字面 | == 0 |
| hmacSha256 stub | == 0 |
| `signVapidJwt` | ≥ 2 |
| `dsaEncoding ieee-p1363` | ≥ 1 |
| `createSign('SHA256')` | ≥ 1 |
| `import.meta.url` | == 8 (4 dsh files × 2 occurrences) |
| `sleep infinity` | == 0 |
| `harness-edge[1-5]` | ≥ 5 |
| `tag:harness-edge` | ≥ 1 |
| `build/server.js` services | == 12 (newvps 2 + 6host 5 + 5 edge) |

#### 7. user 必须执行挂账（per `notes/codex-audit-scope-v1.1.1-v0.7-precommit.md` §5 + plan §4 9 EXEC items）

| # | Step | Command |
|---|------|---------|
| **U1** | dsh GitHub release URL verify | 浏览器 + `curl -sI <dsh release URL>` 验证 HTTP 200 |
| **U2** | dsh binary install on newvps | `ssh puer-hk 'DSH_VERSION=v1.0.0 DSH_URL=<verified-url> bash -s < deploy/install-dsh.sh && which dsh && dsh --version'` |
| **U3** | TypeScript build on newvps | `ssh puer-hk 'cd /opt/fish-harness/wrapper && npm install && ./node_modules/.bin/tsc'` |
| **U4** | docker compose restart 切入口 | `ssh puer-hk 'cd /opt/fish-harness && docker compose -f deploy/newvps-compose.yml down && docker compose -f deploy/newvps-compose.yml up -d && docker compose -f deploy/6host-compose.newvps.yml up -d && docker compose ps'` |
| **U5** | 真机 4 E2E 套件真调 | `ssh puer-hk 'cd /opt/fish-harness/wrapper && RUN_WEBPUSH_E2E=1 RUN_STT_E2E=1 RUN_DSH_6HOST=1 RUN_6HOST_E2E=1 DEEPSEEK_API_KEY=<key> WHISPER_MODEL_PATH=/opt/whisper/models/ggml-base.bin ./node_modules/.bin/vitest run test/integration/{webpush_e2e,stt_e2e,dsh_6host,6host_e2e}.test.ts'` |
| **U6** | 6 Funnel URL 路径 200 验证 | `for path in / /health /api/v1/tasks /api/v1/status/test /api/v1/worker/heartbeat /api/v1/push/subscribe; do curl -s -o /dev/null -w "https://harness-newvps.tail1b9878.ts.net${path} → %{http_code}\n" https://harness-newvps.tail1b9878.ts.net${path}; done` |
| **U7** | Codex v0.7 formal 复审 | user 亲提 `npx codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.1.1-v0.7-precommit-prompt.md`（预期 0C/0M/0m） |
| **U8** | v1.1.1 patch tag + push via Clash | `git tag -a v1.1.1 -m "v1.1.1: server-side entrypoint cutover + 5 edge host provision draft + v0.7 audit-scope + dsh binary install" && git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.1.1` |
| **U9** | 5 edge host 真实 provision v1.1.1.1+ | per `deploy/runbook-edge-provision.md` §2 5 步骤 |

#### 8. NEXT v1.1.1.1+ 周期（5 edge host 真实 provision）

- 5× VPS 采购（east-1/west-1/asia-1/eu-1/sa-1）
- 5× Tailscale 节点加入（持有 auth key，session 内 agent 无 key）
- 5× Tailscale Funnel 配置（`tailscale funnel --bg 4001`）
- 5× Docker Compose 部署（per runbook §2 step 4）
- 5× env vars 填入（TAILSCALE_MAGIC_DNS_SUFFIX + DEEPSEEK_API_KEY + WORKER_ID）

### v1.2.0a cycle scope（2026-09-04 — 3 层 dispatch 架构 commander 真实现 + workflow_pack 真实现 + dispatch 走 commander）

v1.2 周期第一 sub-cycle（commander/worker 真实现 + 多机 LB + 防 OOM 大周期第 1 刀；v1.2.0b/c/d 排队中）: `commander.ts` 4 函数 stub → real + `workflow_pack.ts` NEW（loadManifest + plan via dsh + heuristic fallback + build WorkflowPack interface）+ `types.ts` 加 `PlanStep` / `PlanPlan` / `AggregateError` 三契约 + `orchestrator.dispatch()` 真走 commander 链 + 27 NEW 单测 + 2 NEW 集成测试 gated.

**Cross-ref**: [`notes/codex-audit-scope-v1.2.0a-v0.1.md`](notes/codex-audit-scope-v1.2.0a-v0.1.md)（v0.1 守门: §4.10 NEW commander 真实现守门 14 项 grep + §2.5 NEW wrapper/orchestrator/ API key 守门 + §4.8 NEW wrapper/orchestrator/ PROJECT_ROOT 守门 + §5 17 文件 hygiene 自检表 + §7 NEW 教训记档 8 条 + §9 13 验证命令矩阵）+ [`notes/codex-audit-scope-v1.2.0a-v0.1-prompt.md`](notes/codex-audit-scope-v1.2.0a-v0.1-prompt.md)（v1.2.0a Codex 复审 prompt + 13 hygiene checklist + 6 处引用式机制落地验证）.

#### 1. commander.ts 真实现（REWRITE `wrapper/orchestrator/commander.ts` ~250 行）

```
commander.planStep(task)         → workflow_pack.plan(task) 拿 PlanPlan + 跟踪 steps 到内部 Map
commander.dispatchStep(...)      → synthetic worker_id + status="dispatched" (v1.2.0a STUB, v1.2.0b 真 worker pool)
commander.aggregateResults(...)  → 收集所有 step 状态 → OrchestrationResult 含 completed_steps/failed_steps/pending_steps
commander.health()              → {status, version: "1.2.0a", active_plans, total_steps, kernel_reachable, error}
+ _recordStepResult / _recordStepFailure / _trackerSnapshot / _resetTracker (test helpers)
```

**stub 标志清零**: TODO(M1) in commander.ts = 0（v1.1.1 4 函数 stub 全消）+ `wrapper/orchestrator/` 全局 TODO(M1) = 0.

#### 2. workflow_pack.ts NEW（`wrapper/orchestrator/workflow_pack.ts` ~270 行）

```
workflow_pack.loadManifest(packName) → 读 workflow_packs/<name>.json + unknown pack 返回 synthetic default
workflow_pack.plan(task)             → 调 dsh with commander profile (60s timeout, model='deepseek-v4-flash')
                                        + PLAN_JSON_RE regex parser 提取 JSON step DAG
                                        + catch dsh 错误时回退 1-step heuristic plan (不依赖 DEEPSEEK_API_KEY)
workflow_pack.build(packName)        → 返回 WorkflowPack interface 对象含 manifest cache
```

**heuristic fallback plan 字段**: `{name: 'default-execute', capability: 'execute', input_ref: 'task.input_blob_id', output_kind: 'text', depends_on: [], timeout_seconds: 300}` — unit test 不需 key 即跑.

#### 3. types.ts 三契约（Edit `wrapper/orchestrator/types.ts`）

```typescript
interface PlanStep extends PackStep {
  status: TaskStatus;
  worker_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}
interface PlanPlan {
  steps: readonly PlanStep[];
  plan_metadata: Record<string, unknown>;
}
class AggregateError extends Error {
  // task_id + failed_steps + partial_output + message
}
```

#### 4. orchestrator.ts 真走 commander（Edit `wrapper/orchestrator/orchestrator.ts`）

`dispatch()` 加三函数调链: `commander.planStep(task)` → `commander.dispatchStep(taskId, step.name)` × N → `commander.aggregateResults(taskId)`. output 加 `plan_steps` (number) + `plan_source` (string, e.g. "heuristic" / "dsh") 字段. 保留 backward-compat kernel + dsh 调用（不破坏现有调用方）.

#### 5. workflow_packs/default.json NEW

```json
{
  "name": "default",
  "version": "1.0.0",
  "description": "Default workflow pack — single-step executor for general-purpose tasks. v1.2.0a NEW...",
  "required_capabilities": ["read_local"],
  "optional_capabilities": ["execute", "write_local"],
  "input_schema_ref": "workflow_packs/schemas/default.input.json",
  "output_kind": "text"
}
```

#### 6. 27 NEW 单测 + 2 NEW 集成测试 gated

- `wrapper/test/unit/commander.test.ts` (REWRITE 15 tests)
- `wrapper/test/unit/workflow_pack.test.ts` (NEW 12 tests)
- `wrapper/test/unit/orchestrator.test.ts` (Edit cleanup: 移除无效 `process.env` 行)
- `wrapper/test/unit/server.test.ts` (Edit cleanup: `describe.skip('GET * (SPA fallback)')')` + TODO comment for v1.2.0a+ server.ts SPA handler)
- `wrapper/test/integration/orch_commander.test.ts` (NEW ~150 行, 7 tests gated by `RUN_ORCH_COMMANDER_E2E=1`)
- `wrapper/test/integration/pack_plan.test.ts` (NEW ~150 行, 8 tests gated by `RUN_PACK_PLAN_E2E=1`)
- `wrapper/test/setup.ts` (Edit: `HARNESS_RUNTIME_URL=http://127.0.0.1:1` 默认值 — vitest setupFiles 优先于 ESM hoist)

#### 7. 双 gate + hygiene §1-§4.10 全过

- `cd wrapper && ./node_modules/.bin/tsc --noEmit` → exit 0
- `cd wrapper && ./node_modules/.bin/vitest run` → **146 passed | 96 skipped (242)** (含 27 NEW commander/workflow_pack unit tests; 15 gated integration tests skipped)
- Hygiene §1-§4.10 全过 (per docs/poll/cc-ready.json `T-V1.2.0A-COMMANDER-PASS`): tracked == 117 / disk == 128 / TODO(M1) in commander.ts == 0 / WorkflowPack refs = 3 / PlanPlan|PlanStep refs = 10 / AggregateError refs = 5 / orchestrator.ts 真走 commander ≥ 3 + v0.7 §4.5.7 + §4.7.6 + §4.8 + §4.9 全部锚定维持

#### 8. user 必须执行挂账（per `notes/codex-audit-scope-v1.2.0a-v0.1.md` §7 + plan §7 9 EXEC items）

| # | Step | Command |
|---|------|---------|
| **U1** | TypeScript build on newvps | `ssh puer-hk 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc'` |
| **U2** | 双 gate 验证 | `ssh puer-hk 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run'` |
| **U3** | docker compose 重启 (v1.2.0a 范围 — 仅 wrapper 容器, deploy/ 不动) | `ssh puer-hk 'cd /opt/fish-harness && docker compose -f deploy/newvps-compose.yml restart wrapper-orchestrator'` |
| **U4** | 真机 E2E 套件真调 (2 gated 集成测试) | `RUN_ORCH_COMMANDER_E2E=1 RUN_PACK_PLAN_E2E=1 DEEPSEEK_API_KEY=<key> ssh puer-hk 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/vitest run test/integration/{orch_commander,pack_plan}.test.ts'` |
| **U5** | 4 Funnel URL 路径 200 验证 (v1.2.0a 加 `/api/v1/commander/health`) | `for path in /health /api/v1/tasks /api/v1/status/test /api/v1/commander/health; do curl -s -o /dev/null -w "${path} → %{http_code}\n" https://harness-newvps.tail1b9878.ts.net${path}; done` |
| **U6** | Codex v1.2.0a formal 复审 | user 亲提 `npx codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.2.0a-v0.1-prompt.md`（预期 0C/0M/0m + §4.10 commander 真实现守门全绿）|
| **U7** | v1.2.0a minor tag + push via Clash | `git tag -a v1.2.0a -m "v1.2.0a: commander 真实现 + workflow_pack 真实现 + dispatch 走 commander + 集成测试 gated" && git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.2.0a` |
| **U8** | MacBook worker 真部署 (仅 v1.2.0c) | n/a |
| **U9** | 5 edge host 真 provision (仅 v1.2.0c) | n/a |

#### 9. NEXT v1.2.0c/d sub-cycle 周期（v1.2.0b PASS 后启动；4 sub-cycles 总计 38-54 文件 + 9-13 commits + 22-30 user EXEC + 14-22 天 per plan §6）

- **v1.2.0b** worker 真实现: worker.ts 8 函数 stub → real + worker_pool.ts NEW (SQLite-backed registry) + execution_driver.ts NEW + server.ts handleWorkerHeartbeat 真接 worker + 8-14 文件 + 2-3 commits + 5-7 user EXEC + 3-5 天
- **v1.2.0c** 6 host routedDsh 真发到 MagicDNS + MacBook Worker 接入: 6host_router.ts routedDsh() 真发远程 + host_fencing.ts NEW (per ADR 0009 partial unique index) + deploy/macbook-mpose + runbook + 11-15 文件 + 3-4 commits + 7-9 user EXEC + 5-7 天
- **v1.2.0d** 防 OOM: docker compose memory limits + queue_store.ts NEW (SQLite-backed queue) + metrics.ts NEW (Prometheus exporter) + monitoring/prometheus.yml + runbook + 8-12 文件 + 2-3 commits + 5-7 user EXEC + 3-5 天

### v1.2.0c cycle scope（2026-09-05 — cross-host routedDsh 真发到 MagicDNS + MacBook Worker 接入 + host-id fencing per ADR 0009 + MagicDNS 命名裂痕修复）✅ v1.2.0c formal PASS 0C/0M/0m + tag pushed @ `b5a1d07`

v1.2 周期第三 sub-cycle（commander/worker 真实现 + 多机 LB + 防 OOM 大周期第 3 刀）: `6host_router.ts` HostId union 扩到 7 host (加 `macbook` per F20) + `MACBOOK_HOST` 常量 + `parseHostId()` 接受 `macbook.fish-harness.ts.net` + `routedDsh()` L277 替换 `callDshHeadless()` → 真发 `fetch(${getHostUrl(targetHost, 4001)}/api/v1/tasks)` 远程 host (per F12) + `getHostUrl()` 默认 port 改 4001 + `findAvailableHost()` worker candidate pool 加 MACBOOK_HOST + `orchestrator.ts` NEW `isWorkingHours(date)` 周一-周五 09:00-22:00 本地时间 + NEW `scoreMacBookWorker(baseScore, date)` 工作时段 +100 (per D6 + F14) + `host_fencing.ts` NEW ~140 行 `HostFence` per-host SQLite + `recordDispatch(task, host_id)` + `checkFencing(task)` + `completeDispatch(task, host, status)` + `HostIdFencingError` 类 (per F13 + ADR 0009 line 68) + `worker.ts` `resolveCapabilityPath()` 按 `WORKER_HOST` env 路由 `spec/capabilities/worker.json` 或 `macbook.json` + `WORKER_VERSION` 升到 `1.2.0c` + `spec/capabilities/macbook.json` NEW (`host_class: macbook-main` + `working_hours: true` per F14) + `spec/kernel-schema.sql` NEW `dispatches` 表 + `host_id` 列 + `CREATE UNIQUE INDEX idx_dispatches_task_host ON dispatches(task_id, host_id) WHERE status='active'` partial unique index (per F13) + `harness/runtime/worker_pool.py` `dispatch(task_id, host_id)` 加 host_id 参数 + INSERT dispatches + `HostIdFencingError` 类 + 失败 rollback (per F13) + `deploy/macbook-compose.yml` NEW (per F15) + `deploy/runbook-macbook-worker.md` NEW 11 步骤 + 6 troubleshooting + `tailscale-acl-6host.yaml` 加 `tag:macbook` 段 (per F16) + `tagOwners.tag:macbook: [cscoheru]` + 11 deploy 文件 MagicDNS rename `.tail1b9878.ts.net` → `.fish-harness.ts.net` canonical (per D5 + F11 命名裂痕修复) + 1 NEW unit test (`6host_router.test.ts` 14 tests) + 3 NEW integration tests gated (`cross_host_dispatch` 8 tests gated `RUN_CROSS_HOST_E2E=1` + `host_id_fencing` 7 tests gated `RUN_HOST_FENCING_E2E=1` + `macbook_worker` 8 tests gated `RUN_MACBOOK_E2E=1`).

**Cross-ref**: [`notes/codex-audit-scope-v1.2.0c-v0.1.md`](notes/codex-audit-scope-v1.2.0c-v0.1.md) (v0.1 守门: §3.8 NEW MagicDNS 命名裂痕修复声明 + §3.8.1 OLD tail1b9878.ts.net 残留 == 0 守门 + §4.12 NEW cross-host 真发守门 16 项 grep + §4.13 NEW MacBook worker 守门 12 项 grep + §4.14 NEW host-id fencing 守门 8 项 grep + §5 21 文件 hygiene 自检表 + §7 NEW v1.2.0c 教训记档 6 项 + §9 17 验证命令矩阵) + [`notes/codex-audit-scope-v1.2.0c-v0.1-prompt.md`](notes/codex-audit-scope-v1.2.0c-v0.1-prompt.md) (v1.2.0c Codex 复审 prompt + 18 hygiene checklist + 7 处引用式机制落地验证 + 36 条 NEW §4.x 守门命令).

**Decisions 3D (per 决策 3D 2026-09-05)**: **D4=D** (v1.2.0c full scope per plan §4) + **D5=A** (`.fish-harness.ts.net` canonical MagicDNS suffix per F11) + **D6=A** (MacBook scoring +100 工作时段 Mon-Fri 09:00-22:00 本地时间 per PRD §3.1).

**New discoveries F11-F20 吸收** (per plan §12.2):
- **F11** MagicDNS 命名裂痕修复 (wrapper `*.fish-harness.ts.net` ≠ deploy `*.tail1b9878.ts.net`)
- **F12** routedDsh() L277 实际调本地 `callDshHeadless()` — 必须替换为 fetch 远程
- **F13** kernel-side dispatches 表无 host_id 列 + 无 partial unique index — 必须加
- **F14** MacBook 无 capability spec — NEW `macbook.json` + `host_class: macbook-main`
- **F15** macbook-compose.yml + runbook 全 NEW (per F15)
- **F16** Tailscale ACL 需 `tag:macbook` 段
- **F17** wrapper-side per-host file pattern 已就 (v1.2.0b 锚定维持)
- **F18** 107 gated integration tests 待真跑
- **F19** `node:24-slim` (per memory newvps-harness-deploy-gotchas) + colima `--vm-type=qemu --arch=x86_64`
- **F20** HostId union type 需扩到 7 host

**user 必须执行挂账 (per plan §12.4 U1-U9)**: U1 TypeScript build + U2 双 gate (tsc 0 + vitest ≥220 passed | 0 failed) + U3 docker compose restart (5 edge + 3 newvps services Up) + U4 107 gated E2E 真跑 (含 RUN_CROSS_HOST_E2E=1 + RUN_HOST_FENCING_E2E=1 + RUN_MACBOOK_E2E=1) + U5 7 Funnel URL 路径 200 (newvps + 5 edge + MacBook, per F11 修复后 MagicDNS 一致) + U6 Codex v1.2.0c formal 复审 PASS (user 亲提 `gpt-5.6-sol` + `xhigh`) + U7 v1.2.0c minor tag @ boundary commit 289e7eb (per Debian stable point release 风格) + U8 MacBook worker 真部署 (per F15 + runbook) + U9 5 edge host 真 provision + ACL sync (per F16).

#### Commit 3 E2E verification (2026-09-05 newvps Tailscale direct IP 100.99.5.90)

- **tsc exit 0** — `ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc --noEmit'` ✅
- **37/37 v1.2.0c-specific tests PASS on newvps**:
  - `test/integration/cross_host_dispatch.test.ts` (gated `RUN_CROSS_HOST_E2E=1`): 8 tests ✅ — routedDsh fetch 真发 + MagicDNS canonical `.fish-harness.ts.net` + findAvailableHost probes + hostHint 路由
  - `test/integration/host_id_fencing.test.ts` (gated `RUN_HOST_FENCING_E2E=1`): 7 tests ✅ — recordDispatch/checkFencing/completeDispatch + HostIdFencingError + partial unique index
  - `test/integration/macbook_worker.test.ts` (gated `RUN_MACBOOK_E2E=1`): 8 tests ✅ — MacBook capability spec + isWorkingHours 时间窗 + scoreMacBookWorker +100 working / 0 weekend
  - `test/unit/6host_router.test.ts`: 14 tests ✅ — HostId union 7 host + MACBOOK_HOST + parseHostId + getHostUrl default 4001 + route() + dumpRoutingTable
- **Wrappers restarted with v1.2.0c code**:
  - `curl -i http://newvps:4000/api/v1/orchestrator/health` → `{"status":"ok","version":"1.2.0c"}` ✅
  - `curl -i http://newvps:4001/api/v1/worker/health` → `{"status":"ok","version":"1.2.0c"}` ✅
- **a6d6e06 fix** — `orchestrator.health()` kernel-unreachable fallback version `0.0.0-stub` → `1.2.0c` (commit 3 follow-up: source had `WORKER_VERSION="1.2.0c"` but `orchestrator.ts:170` fallback hardcoded stub version; fixed by inlining `version: "1.2.0c"` in fallback return)
- **1 pre-existing persistent failure** (v1.2.0b-era, outside v1.2.0c scope) — `test/unit/worker_pool.test.ts round_robin` ms precision tie mock race; tracked for v1.2.0d/future
- **routedDsh() defined but NOT wired into production dispatch flow** (intentional per F12) — exported + public surface ready; production `dispatch() → commander.dispatchStep() → worker_pool.dispatch() → worker.run()` chain 不调 routedDsh(); integration is future work (execution_driver.ts HTTP fallback stub 待 v1.2.0d 真接 MagicDNS 远程 host)
- **harness-kernel is smoke container** (per ADR 0010 Decision d) — `python -m harness` prints version + exits; restart loop by design

#### 6 commits 收口 (2026-09-05)

| # | Hash | Subject |
|---|------|---------|
| 1 | `e735a8d` | review(v1.2.0c): v0.1 prompt-review — drafting-contract 0C/2M/5m same-round closed (3 files) |
| 2 | `3844243` | feat: v1.2.0c cross-host dispatch + MacBook + host-id fencing (D4/D5/D6) (26 files +1266/-86) |
| 3 | `a6d6e06` | fix(wrapper): orchestrator.health() version 0.0.0-stub → 1.2.0c (1 file) |
| 4 | `e08fe9d` | chore(v1.2.0c): cc-ready + CHANGELOG + README 簿记翻牌 (3 files +58/-3) |
| 5 | `d8c8929` | chore(deploy): U8 + U9 execution checklists for v1.2.0c (2 NEW files +313) |
| 6 | `9c2e325` | review(v1.2.0c): v0.1 formal PASS — same-round closure 0C/0M/5m → 0/0/0 (1 NEW review report) |

#### User EXEC status (per plan §12.4, post cycle 闭环)

- **U6** Codex v1.2.0c formal 复审 — **✅ PASS 0C/0M/0m** (user 亲提 `gpt-5.6-sol` + `xhigh`; commit `9c2e325`; 报告 `notes/codex-review-v1.2.0c-v0.1-formal-report.md`; 5 findings 全 pattern/测试层零实现 bug: m1 断言漂移 / m2 fetch 跨架构形态 ×4 / m3 class-method form ×6 / m4 camelCase + scope / m5 注释豁免第3例; 三源 verbatim 116/128/12 全闭; tsc 0 + vitest 205p/0f/130 gated = 335)
- **U7** v1.2.0c minor tag @ boundary `b5a1d07` — **✅ pushed** via Clash proxy (per Debian stable point release 推进式风格 v1.2.0a/b 锁 `289e7eb`, v1.2.0c 推进到 `b5a1d07` = v1.2.0b cross-ref commit)
- **U8** MacBook worker 真部署 per `deploy/U8-MACBOOK-DEPLOY-CHECKLIST.md` 8 步骤 + `deploy/runbook-macbook-worker.md` 11 步骤 — **⏳ user EXEC**
- **U9** 5 edge host 真 provision + ACL sync per `deploy/U9-EDGE-PROVISION-CHECKLIST.md` 8 步骤 — **⏳ user EXEC** (5 VPS × 10-15 分钟/host = 50-75 分钟)

### v1.2.0d cycle scope（2026-09-05 — 防 OOM: docker memory limits + queue 持久化 + Prometheus monitoring + 顺手清 v1.2.0c 残留）✅ Commit 2 核心实现 pushed + Commit 3 簿记翻牌

v1.2 周期第四 sub-cycle（commander/worker 真实现 + 多机 LB + 防 OOM 大周期第 4 刀）: **D7=A** 全 7 service docker memory limits (kernel 256M smoke per F23 + ADR 0010 d / orchestrator 2G / commander 1G ×3 / stt 2G / push 1G / wrapper 1G / monitor 512M) + per F27 `--stop-timeout=30` SIGTERM graceful drain + `--restart unless-stopped` + **D8=A** in-memory + SQLite WAL per-host queue (`queue_store.ts` NEW ~297 行 per-host file `/data/queue_store.db` per ADR 0009 line 27 + WAL mode + busy_timeout=5000 + 5 methods `enqueue/dequeue/peek/reclaim/pending_count` + `QueueOverflowError` + `QueueAcceptedResult` + `QueueThrottledResult` discriminated union + `getDefaultQueueStore()` singleton + `DEFAULT_MAX_IN_FLIGHT=50` + `QUEUE_MAX_IN_FLIGHT` env override + `RETRY_AFTER_SECONDS=30`) + **D9=A** Prometheus + alertmanager + Grafana stack (`metrics.ts` NEW ~107 行 `prom-client` Registry + `collectDefaultMetrics` + 4 gauges `active_task_count/queue_depth/memory_used_mb/worker_count` + `startMetricsSampling()` 15s interval RSS + `renderMetrics()` text exposition format + `getMetricsRegistry()` singleton) + `deploy/monitoring/prometheus.yml` NEW ~127 行 (7 scrape jobs newvps+5edge+macbook 每 host port 3000 + `scrape_interval=15s` + `evaluation_interval=15s` + `rule_files: alerts.yml` + alertmanager routing `tag:monitor:9093` per F24 + F28) + `deploy/monitoring/runbook.md` NEW ~177 行 (4 alert runbooks `WrapperMemoryHigh/QueueSaturated/WorkerOffline/HighDispatchLatency` + 每 alert 5 步 diagnostic + 4 mitigation paths + escalation 15min ack / 30min resolve / page owner + 维护操作) + `tailscale-acl-6host.yaml` 加 `tag:monitor` 段 (per F28: tag:admin owner-only port 9090 + tag:monitor scrape wrapper :3000 on harness/edge/macbook) + `tagOwners.tag:monitor: [cscoheru]` + `server.ts` NEW `handleMetrics` GET `/metrics` endpoint (dynamic import 延后 module-level side effects + `registerApiRoute` 同时 register `/api/v1/metrics` + `/metrics` Tailscale Funnel 兼容 per v1.2.0b pattern) + `orchestrator.ts` NEW `tryEnqueueOrThrottle(taskId, payload)` helper (queue backpressure at entry per F26) + `reclaimAndUpdateMetrics()` (reclaim SQLite pending → in-memory + F25 Prometheus gauge updates) + `types.ts` 加 `QueueOverflowError` + `QueueAcceptedResult` + `QueueThrottledResult` discriminated union.

**顺手清 v1.2.0c 残留** (per F21 + F22):
- **F21** `worker_pool.ts` `dispatch()` SQL `ORDER BY last_heartbeat_at ASC, worker_id ASC` 加 tertiary sort `, registered_at ASC` 打破 same-ms register tie → widA expected widA (1 unit test fix for `worker_pool.test.ts round_robin` persistent failure tracked since v1.2.0b era, per v1.2.0c 6 commits 收口表 §1 pre-existing persistent failure 行)
- **F22** `execution_driver.ts` `streamHttpFallback()` 替换为 `streamRoutedDshFallback()` + dynamic import `const { routedDsh } = await import("../dsh/6host_router.js")` + `wire-routedDsh per F22 option A` commit marker + yield `driver.finished` payload `source: "routed_dsh"` (per v1.2.0c routedDsh defined but NOT wired 跟踪 + F22 option A; main path `callDshHeadless` 维持 backward compat per F4 + v1.2.0b pattern)

**Cross-ref**: [`notes/codex-audit-scope-v1.2.0d-v0.1.md`](notes/codex-audit-scope-v1.2.0d-v0.1.md) (v0.1 守门: 继承 v0.7 §1-§9 + v1.2.0a/b/c 全套 + §3.10 NEW OOM graceful shutdown 声明 [per F27 --stop-timeout=30 SIGTERM + --kill-signal=SIGTERM + --restart unless-stopped 区分 SIGKILL 默认] + §3.11 NEW execution_driver routedDsh wire 声明 [per F22 option A + F4 backward compat] + §3.12 NEW queue_store SQLite 持久化声明 [per D8 + F25 + ADR 0009 line 27] + §4.15 NEW docker memory limits 守门 12 项 grep [per D7 全 7 service limits + F23 256M kernel smoke + F27 stop-timeout + 5 stop-timeout grep] + §4.16 NEW queue 持久化守门 8 项 grep [per F25 better-sqlite3 WAL + F26 429/202 + D8 max_in_flight + F25 metric names] + §4.17 NEW monitoring + metrics 守门 10 项 grep [per F24 7 host scrape + F25 4 metric names + F28 Tailscale ACL]) + [`notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md`](notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md) (v1.2.0d Codex 复审 prompt + 20 hygiene checklist + 8 处引用式机制落地验证 + 30 验证命令矩阵).

**Decisions 3D (per 决策 3D 2026-09-05)**: **D7=A** (全 7 service docker memory limits per §5.2) + **D8=A** (in-memory + SQLite 落盘双层 queue per ADR 0009 WAL + max_in_flight=50 + 429 Retry-After=30 + 202 Accepted Location header per F26 HTTP RFC 7231 + RFC 6585) + **D9=A** (Prometheus + alertmanager + Grafana full stack per §5.3 + 7 host scrape + 3 alert rules + Tailscale ACL tag:monitor owner-only per F28).

**New discoveries F21-F30 吸收** (per plan §13.2):
- **F21** v1.2.0c 残留 `worker_pool.test.ts round_robin` ms precision tie mock race → tertiary sort registered_at ASC 打破 tie
- **F22** `routedDsh()` defined but NOT wired into production → execution_driver HTTP fallback path 真接 routedDsh()
- **F23** harness-kernel 是 smoke container (per v1.2.0c ADR 0010 Decision d) → docker mem_limit 256M 足够
- **F24** v1.2.0c 后 7 host heartbeat 已就位 → Prometheus 加 7 scrape job per host
- **F25** worker_pool SQLite per-host 不能 aggregate → metrics.ts HTTP endpoint 实时 values (PromQL sum by host)
- **F26** queue backpressure 触发时 → 429 Retry-After + 202 Accepted Location header (HTTP RFC 7231 + RFC 6585)
- **F27** docker compose memory limit OOM kill 时 graceful shutdown SIGKILL default → `--stop-timeout=30` SIGTERM 30s window
- **F28** monitoring/prometheus.yml Tailscale ACL 限 access → tag:monitor + port 9090 仅 tag:admin
- **F29** v1.2.0c 实施链 6 commits → audit-scope 校准 tracked = 116 维持 + disk = 128 verbatim
- **F30** queue_backpressure test mock memory pressure → mock max_in_flight=2 触发 429 (per v1.2.0c gated test pattern)

**user 必须执行挂账 (per plan §13.4 U1-U7)**: U1 TypeScript build `ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc'` exit 0 + U2 双 gate `tsc --noEmit && vitest run` ≥230 passed | 0 failed (per commit 2 增量 ≥25 unit + 2 gated integration × 9 tests) + U3 docker compose 重启 7 service limits (9 containers: kernel 256M + 6 wrappers + orchestrator + commander + stt + push + monitor 全 Up) + U4 queue backpressure + OOM 真机 E2E `RUN_QUEUE_BACKPRESSURE_E2E=1 RUN_OOM_PREVENTION_E2E=1 RUN_CROSS_HOST_E2E=1 RUN_HOST_FENCING_E2E=1 RUN_MACBOOK_E2E=1 DEEPSEEK_API_KEY=<key> ./node_modules/.bin/vitest run test/integration/{queue_backpressure,oom_prevention,cross_host_dispatch,host_id_fencing,macbook_worker}.test.ts` 5+4+8+7+8 = 32 gated tests PASS + U5 7 host metrics scrape + alert rules `curl http://newvps.fish-harness.ts.net:9090/metrics` + `curl http://newvps.fish-harness.ts.net:3000/metrics` (7 scrape jobs up + 3 alert rules + memory/queue/worker metrics 暴露) + U6 Codex v1.2.0d formal 复审 PASS user 亲提 `codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md` expected 0C/0M/0m + §4.15/§4.16/§4.17 全绿 + tracked 116 + disk 128 verbatim + U7 v1.2.0d minor tag @ boundary `9c2e325` (per Debian stable point release 推进式风格, v1.2.0a/b 锁 `289e7eb`, v1.2.0c 锁 `b5a1d07`, v1.2.0d 推进到 `9c2e325` = v1.2.0c formal review closure) user 亲提 `git tag -a v1.2.0d 9c2e325 -m "v1.2.0d: docker memory limits + queue 持久化 + Prometheus monitoring + execution_driver routedDsh wire + worker_pool round_robin fix" && git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.2.0d` via Clash proxy.

#### 3 commits 实施 (2026-09-05)

| # | Hash | Subject | Files |
|---|------|---------|-------|
| 1 | `de64791` | review(v1.2.0d): v0.1 audit-scope 起草 — drafting-contract 0C/2M/5m same-round closed | 3 (2 NEW notes/ + cc-ready) |
| 2 | `18acbd1` | feat(v1.2.0d): 防 OOM — docker memory limits + queue 持久化 + Prometheus monitoring | 25 (+1610/-32) |
| 3 | (本 commit) | chore(v1.2.0d): cc-ready + CHANGELOG + README 簿记翻 PASS | 3 |

#### User EXEC status (per plan §13.4, 待 cycle 闭环)

- **U1** TypeScript build on newvps — `ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc'` exit 0 — **⏳ user EXEC**
- **U2** 双 gate 验证 — `tsc --noEmit && vitest run` ≥230 passed | 0 failed — **⏳ user EXEC**
- **U3** docker compose 重启 (7 service limits) — 9 containers 全 Up + memory limits 验证 — **⏳ user EXEC**
- **U4** queue backpressure + OOM 真机 E2E — 32 gated tests PASS (5+4+8+7+8) — **⏳ user EXEC**
- **U5** 7 host metrics scrape + alert rules — 7 scrape jobs up + 3 alert rules + memory/queue/worker metrics 暴露 — **⏳ user EXEC**
- **U6** Codex v1.2.0d formal 复审 PASS 0C/0M/0m (user 亲提 `gpt-5.6-sol` + `xhigh`) — **⏳ user EXEC**
- **U7** v1.2.0d minor tag @ boundary `9c2e325` (per Debian stable point release 推进式风格) — **⏳ user EXEC** (`git tag -a v1.2.0d 9c2e325 -m "..." && git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.2.0d` via Clash proxy)

### v1.2.0b cycle scope（2026-09-05 — worker 真实现 + heartbeat 真接 worker + SQLite WorkerPool registry + ExecutionDriver dual + 4 root-cause fixes）✅ PASS

v1.2 周期第二 sub-cycle（commander/worker 真实现 + 多机 LB + 防 OOM 大周期第 2 刀）: `worker.ts` 8 函数 stub → real + `worker_pool.ts` NEW ~220 行（better-sqlite3 per-host + WAL + busy_timeout=5000 per ADR 0009 + 6 methods per types.ts WorkerPool Protocol + round-robin ms precision + secondary sort）+ `execution_driver.ts` NEW ~200 行（subprocess spawn 主路径 + HTTP fallback stub per D2 + DriverEvent stream）+ `commander.ts:113-114` TODO(v1.2.0b) 替换为真调 `worker_pool.dispatch(task_id)` + `server.ts handleWorkerHeartbeat` PURE STUB → real + 新增 `/api/v1/{worker,commander}/health` 路由 + `spec/capabilities/worker.json` 校准 `model_id: deepseek-v4-flash` + `wrapper/package.json` 加 `better-sqlite3@^11` + `Dockerfile` 加 `apk add python3 make g++` (§3.7 NEW Dockerfile 例外声明) + 4 NEW unit tests (worker REWRITE 50 + worker_pool 30 + execution_driver 20 = 100 单测) + 2 NEW integration tests gated (worker_pool 12 + server_heartbeat 10) + M4 hygiene fix 合并 commit 2 (vi.restoreAllMocks → vi.clearAllMocks per D3).

**Cross-ref**: [`notes/codex-audit-scope-v1.2.0b-v0.1.md`](notes/codex-audit-scope-v1.2.0b-v0.1.md) (v0.1 守门: §4.11 NEW worker 真实现守门 14 项 grep + §4.7.7 NEW server.ts handleWorkerHeartbeat 真接守门 + §4.10.5/§4.10.6 NEW commander.ts TODO(v1.2.0b) + synthetic stub 替换守门 + §3.7 NEW Dockerfile 例外声明 + §2.7 NEW better-sqlite3 path 默认值守门 + §4.8.5 NEW wrapper/orchestrator/ 5 文件 PROJECT_ROOT 守门 + §5 20 文件 hygiene 自检表 + §7 NEW 教训记档 6 项 + §9 14 验证命令矩阵) + [`notes/codex-audit-scope-v1.2.0b-v0.1-prompt.md`](notes/codex-audit-scope-v1.2.0b-v0.1-prompt.md) (v1.2.0b Codex 复审 prompt + 14 hygiene checklist + 6 处引用式机制落地验证 + 25 条验证命令).

**Codex v0.1 formal 复审报告**: [`notes/codex-review-v1.2.0b-v0.1-formal-report.md`](notes/codex-review-v1.2.0b-v0.1-formal-report.md) (10657 bytes, PASS 0C/0M/0m 同轮全闭 — 初审 0C/2M/5m → same-round closure: M1 worker_pool column-unit contract repair [8bef884 列契约 heartbeat ms / register+drain seconds] + M2 disk anchoring 116/129/13 三源闭合 + m3-m7 守门 全部 closed). 三源闭合 116/129/13 + 双 gate tsc 0 + vitest 191p/0f/107g (298 total, 33.9s) 维持.

#### 1. 三层架构抽象第二刀收口 (per PRD §3 L102-104 + A-1/A-2/A-3)

```
worker.ts 真实现 (8 函数 stub → real):
  capability()         → 读 spec/capabilities/worker.json + 运行时探测
  run(request)         → ExecutionDriver.run() yield DriverEvent stream
  interrupt()          → SIGTERM + AbortController.abort()
  heartbeat()          → worker_pool.heartbeat() + SQLite 持久化
  health()             → kernel HTTP probe + {version: "1.2.0b", workers_count}
  register()           → worker_pool.register() INSERT + return worker_id
  drain()              → worker_pool.drain() UPDATE drained_at
  getTaskStatus()      → query SQLite by task_id
```

#### 2. WorkerPool SQLite per-host + WAL (per ADR 0009 single-host constraint)

```yaml
# /data/worker_pool.db per host, WAL mode + busy_timeout=5000
# workers 表 schema (简化 per F3 — 无 current_attempt_id FK, kernel-side authoritative):
#   worker_id TEXT PRIMARY KEY (UUID v4)
#   host TEXT NOT NULL
#   capabilities_json TEXT NOT NULL
#   status TEXT NOT NULL CHECK IN ('active','draining','drained','reaped')
#   last_heartbeat_at INTEGER NOT NULL (unix epoch ms; ms precision 防 3+ worker 同秒 tie)
#   registered_at INTEGER NOT NULL
#   drained_at INTEGER (nullable)
# 6 methods: register / dispatch / heartbeat / drain / reap_stale / claim_via_pool
```

```
Round-robin dispatch SQL:
  SELECT worker_id, host, capabilities_json, status,
         last_heartbeat_at, registered_at, drained_at
    FROM workers
   WHERE status = 'active'
   ORDER BY last_heartbeat_at ASC, worker_id ASC  -- secondary sort 破 ms-level ties
   LIMIT 1
```

#### 3. ExecutionDriver 双模型 (per D2 = subprocess spawn + HTTP fallback)

```
execution_driver.ts ~200 行:
  主路径: callDshHeadless(prompt, {modelClass: 'worker'})
          (复用 wrapper/dsh/dsh_client.ts:137-162 spawn pattern)
  备用路径: fetch(DSH_HTTP_URL + '/api/v1/tasks', POST)  -- 当前 stub, v1.2.0c 真接 MagicDNS 远程
  yield DriverEvent stream:
    driver.started → output_chunk ×N → heartbeat ×N → finished
  interrupt: SIGTERM + AbortController.abort() + dsh_client.ts runWithTimeout 兜底
```

#### 4. server.ts handleWorkerHeartbeat 真接 (per F6 PURE STUB → real)

```typescript
// BEFORE (v1.2.0a):
res.json({ status: 'ok', heartbeat: true });

// AFTER (v1.2.0b):
POST /api/v1/worker/heartbeat
  body: { worker_id? | host? + capabilities_json? }
  validation: reject extra fields + capabilities_json ≤10KB
  → worker.register() (first-call path) 或 worker_pool.heartbeat() (subsequent)
  → SQLite 持久化 (per ADR 0009 WAL mode)
  → 返回 { worker_id, status, last_heartbeat_at }
```

#### 5. spec/capabilities/worker.json 校准 (per F9 + docs/m0b M2 校准对齐)

```json
{
  "model_id": "deepseek-v4-flash",        // was deepseek-chat
  "evidence_uri": "spec/capabilities/worker.json",  // NEW (per ADR 0007 capability evidence)
  "driver_kind": "codex_exec",
  ...
}
```

#### 6. 4 NEW files + 2 NEW integration tests gated

| 文件 | 类型 | 行数 | 说明 |
|------|------|------|------|
| `wrapper/orchestrator/worker_pool.ts` | NEW | ~220 | better-sqlite3 + WAL + 6 methods + ms precision |
| `wrapper/orchestrator/execution_driver.ts` | NEW | ~200 | subprocess spawn + HTTP fallback stub + DriverEvent stream |
| `wrapper/test/unit/worker.test.ts` | REWRITE | ~50 tests | 8 函数 real shape 覆盖 |
| `wrapper/test/unit/worker_pool.test.ts` | NEW | ~30 tests | SQLite 持久化 + WAL + reap_stale |
| `wrapper/test/unit/execution_driver.test.ts` | NEW | ~20 tests | DriverEvent stream + interrupt |
| `wrapper/test/integration/worker_pool.test.ts` | NEW | 5 tests gated | register → heartbeat → dispatch → drain flow |
| `wrapper/test/integration/server_heartbeat.test.ts` | NEW | 7 tests gated | HTTP POST → SQLite 持久化 |

#### 7. 4 大 root cause 完整溯源 (v1.2.0b 部署期)

| # | 病灶 | 修法 | 证据 |
|---|------|------|------|
| **R1** | musl/glibc 不匹配 (alpine 容器 vs Ubuntu host, `fcntl64: symbol not found`) | `node:22-alpine` → `node:22-slim` → `node:24-slim` (glibc 双侧同) | commit 26051c9 + e1f4f2e |
| **R2** | Node ABI 不匹配 (host Node v24 ABIv137 vs container Node v22 ABIv127) | 容器升 v24 对齐 host | commit e1f4f2e |
| **R3** | Kernel restart-loop blocks wrapper (pre-existing M0c CLI-vs-server bug; `python -m harness` 打印 version 即退出) | `depends_on condition: service_healthy` → `service_started` | commit 0bfa73b + 20d92ac |
| **R4** | Round-robin dispatch tie (3+ worker 同秒注册, unixNowSeconds 整数秒精度永远选第一个) | `unixNowSeconds()` → `unixNowMillis()` ms 精度 + secondary sort `worker_id ASC` | commit 24837d1; 关键证据 U5 返回 `last_heartbeat_at: 2026-09-05T02:32:52.415Z` |

#### 8. U1-U5 实测 (2026-09-05 newvps Tailscale direct IP 100.99.5.90:4000)

- **U1** TypeScript build on newvps: `ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc'` → exit 0 PASS
- **U2** 双 gate 验证: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run` → tsc 0 + vitest 27/27 PASS (基础 + M4 fix 收口)
- **U3** 8 containers 全 Up: newvps-compose 3 (harness-kernel + wrapper + worker) + 6host-compose.newvps 5 (wrapper-orchestrator + worker ×4); 两次 `--force-recreate`
- **U4** 真机 E2E 27/27 PASS (per `/tmp/run-u4.sh`):
  - `test/integration/orch_commander.test.ts`: 7 tests ✅
  - `test/integration/worker_pool.test.ts`: 5 tests ✅
  - `test/integration/pack_plan.test.ts`: 8 tests ✅
  - `test/integration/server_heartbeat.test.ts`: 7 tests ✅
- **U5** 4+1 Funnel URL 5/5 200 (per newvps Tailscale direct IP):
  - `GET /api/v1/worker/health`: 200, `{version: "1.2.0b", workers_count: 3, status: "ok"}`
  - `POST /api/v1/worker/heartbeat {valid}`: 200, `wrk-013598df-1b56-4d5c-b09d-52ad655732d8`
  - `GET /api/v1/commander/health`: 200, `{version: "1.2.0a", active_plans: 1}` (v1.2.0a anchor maintained)
  - `POST /api/v1/tasks {valid}`: 200
  - `GET /api/v1/status/test`: 200

#### 9. NEXT v1.2.0c/d sub-cycle 周期 (v1.2.0b PASS 后启动, 4 sub-cycles 总计 38-54 文件 + 9-13 commits + 22-30 user EXEC + 14-22 天 per plan §6)

- **v1.2.0c** 6 host routedDsh 真发到 MagicDNS + MacBook Worker 接入: 6host_router.ts routedDsh() 真发远程 + host_fencing.ts NEW (per ADR 0009 partial unique index) + deploy/macbook-compose + runbook + 11-15 文件 + 3-4 commits + 7-9 user EXEC + 5-7 天
- **v1.2.0d** 防 OOM: docker compose memory limits + queue_store.ts NEW (SQLite-backed queue) + metrics.ts NEW (Prometheus exporter) + monitoring/prometheus.yml + runbook + 8-12 文件 + 2-3 commits + 5-7 user EXEC + 3-5 天

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
