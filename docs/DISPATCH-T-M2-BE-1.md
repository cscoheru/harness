# T-M2-DISPATCH-BE-1 — TypeScript wrapper 6 host 适配 + STT worker + Web Push gateway

> **Task ID**: T-M2-BE-1
> **Date**: 2026-09-02
> **Role**: BE (Backend Engineering)
> **Stage**: v1.1 M2
> **Trigger**: M1c DD-1 收口（commit `T-M1c-DD-1` 待 commit + push）+ user 「Start v1.1 M2」信号 + v0.3 audit-scope §4.5/§4.6/§4.7 M2 hygiene 守门预备
> **Status**: 🟡 DISPATCH DRAFT（M2 阶段 BE 任务书，等 user 「Start v1.1 M2」启动真实工程师）
> **Author**: 架构师 Claude Fable 5 (claude-fable-5)
> **Worktree**: 主仓 `main`（无 worktree 隔离；实施类改动）

---

## §0 元数据

- **触发条件**: M1c 全 PASS（M0b/M0c/M1c/GATE-REPAIR-2/Codex formal/DO-1 Funnel E2E）+ v0.3 升级 commit + push + user 「Start v1.1 M2」
- **依赖**: T-M2-DO-1（6 host 部署先行；BE-1 必须基于真实 6 host 拓扑调 API）
- **产出**: 5 文件 `wrapper/orchestrator/{6host_router,stt_worker,webpush_gateway}.ts` + 3 capability JSON + 6 host spec 配置
- **估时**: 10-14 工作日（M1c 5-7d × 2 倍；多 host 适配 + STT 集成 + Web Push 是 3 倍复杂度）
- **守门**: 不锁型号（NORTH-STAR A-4）/ 不硬编码 API key（GH013 PUSH PROTECTION 教训）/ v1.0 runtime 0 行 diff（ADR 0010 Decision d）/ dsh `headless` profile（M1c 教训）/ **M2 多 host 守门（v0.3 §4.5 启用）/ M2 STT 守门（v0.3 §4.6 启用）/ M2 Web Push 守门（v0.3 §4.7 启用）**

---

## §1 任务定义（一句话）

把 M1c TypeScript wrapper 三档 profile 扩展为 **6 host 分布式架构**：在 newvps 主节点增加 STT worker（whisper.cpp 流式转写）+ Web Push gateway（VAPID 签名 + 4 推送端点路由），在 5 边缘 host 仅部署 wrapper/orchestrator HTTP 反向代理（无 STT / 无 Push gateway，避免能力漂移），全部通过 Tailscale Funnel 暴露 6 个独立 HTTPS 入口。

---

## §2 输入（前置条件）

| # | 输入 | 来源 | 验证 |
|---|------|------|------|
| 1 | M1c wrapper 三档 profile skeleton | `wrapper/orchestrator/{orchestrator,commander,worker}.ts` | 已 commit（`T-M1c-BE-1` 落地）|
| 2 | M1c dsh client + tool provider | `wrapper/dsh/{dsh_client,tool_provider}.ts` | 已 commit |
| 3 | M1c vitest 三层测试（94/5/0）| `wrapper/test/{unit,integration,e2e}/` | 已 commit + M1c DO-1 真调 PASS |
| 4 | M2 6 host 部署骨架 | T-M2-DO-1 实施后 | 待 M2-DO-1 commit |
| 5 | Tailscale Funnel 6 入口 | `deploy/tailscale-funnel-{newvps,edge1-5}.yaml` | T-M2-DO-1 实施 |
| 6 | whisper.cpp 模型权重 | `whisper-base.en.bin`（~150 MB）| T-M2-DO-1 部署时下载到 newvps `/opt/harness/models/` |
| 7 | VAPID key pair | T-M2-TG-1 生成（公钥可入 commit，私钥 env-inject）| 待 T-M2-TG-1 commit |
| 8 | ENV vars | `DEEPSEEK_API_KEY` + `WHISPER_MODEL_PATH` + `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `TUNNEL_ROUTING_KEY` | env-inject only |

---

## §3 产出（详细文件清单）

### 3.1 6 host 路由适配

| 文件 | 行数 | 内容 |
|------|------|------|
| `wrapper/orchestrator/6host_router.ts` | ~180 行 | 6 host 路由器：解析 Tailscale MagicDNS 域名 → 按 host_name 路由到对应功能 endpoint；fallback newvps 主节点 |
| `wrapper/orchestrator/container_dns.ts` | ~60 行 | 容器互联用 container_name（禁 IP 锁）；通过 Docker Compose 内嵌 DNS 解析 |
| `spec/capabilities/6host_router.json` | ~30 行 | capability 描述 6 host + 路由表 + fallback 策略 |

### 3.2 STT worker

| 文件 | 行数 | 内容 |
|------|------|------|
| `wrapper/orchestrator/stt_worker.ts` | ~220 行 | whisper.cpp 流式转写：接受 multipart/form-data audio stream → 立即转写 → 不落盘；模型路径 env `WHISPER_MODEL_PATH` |
| `wrapper/orchestrator/audio_pipe.ts` | ~80 行 | 音频管道：`/dev/shm/harness-stt-{uuid}` 临时文件（内存，进程退出即释放）|
| `spec/capabilities/stt_worker.json` | ~40 行 | STT capability（语言模型 + 转写延迟 SLO + 不留盘守门命令）|

### 3.3 Web Push gateway

| 文件 | 行数 | 内容 |
|------|------|------|
| `wrapper/orchestrator/webpush_gateway.ts` | ~260 行 | VAPID 签名推送：按订阅 endpoint 路由 FCM/Mozilla/WNS/APNs；私钥 env-inject only |
| `wrapper/orchestrator/push_endpoints.ts` | ~100 行 | 4 推送端点白名单：`fcm.googleapis.com` / `updates.push.services.mozilla.com` / `wns.windows-push.com` / `api.push.apple.com` |
| `wrapper/orchestrator/vapid_signer.ts` | ~80 行 | VAPID 签名（基于 `web-push` npm 包 + elliptic 曲线）|
| `spec/capabilities/webpush_gateway.json` | ~50 行 | Web Push capability（端点白名单 + 私钥 env-inject 守门 + 公钥可入 commit）|

### 3.4 三档 profile 扩展

| 文件 | 行数 | 内容 |
|------|------|------|
| `wrapper/orchestrator/profile_6host.ts` | ~140 行 | 三档 profile 在 6 host 下的路由策略：orch → newvps 主 + 5 边缘 fallback；commander → newvps 主；worker → 任一边缘 |
| `wrapper/test/integration/6host_router.test.ts` | ~120 行 | 6 host 路由集成测试（mock Tailscale MagicDNS + 真 container_dns）|
| `wrapper/test/integration/stt_worker.test.ts` | ~100 行 | STT 流式转写测试（mock audio stream + 真 whisper.cpp 模型）|
| `wrapper/test/integration/webpush_gateway.test.ts` | ~120 行 | Web Push 端到端测试（mock 4 端点 + 真 VAPID 签名）|

**总产出：12 文件 = 8 NEW + 3 capability JSON + 1 profile_6host + 3 test**

---

## §4 验证（verbatim 6 项）

```bash
# === 1. v0.3 §4.5 多 host 守门（容器 IP 不锁）===
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/orchestrator/6host_router.ts wrapper/orchestrator/container_dns.ts | grep -v "127.0.0.1" | wc -l
# 期望: 0 行（用 container_name，禁 IP 锁）

# === 2. v0.3 §4.6 STT 守门（音频不留盘）===
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/orchestrator/stt_worker.ts wrapper/orchestrator/audio_pipe.ts | wc -l
# 期望: 0 行（音频流仅 /dev/shm 内存，禁 .wav/.mp3/.m4a 落盘）

# === 3. v0.3 §4.7 Web Push 守门（VAPID 私钥 env-inject）===
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/orchestrator/webpush_gateway.ts wrapper/orchestrator/vapid_signer.ts | wc -l
# 期望: 0 行（VAPID 私钥仅 process.env.VAPID_PRIVATE_KEY）

# === 4. 4 推送端点白名单守门 ===
grep -rE "fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|wns\.windows-push\.com|api\.push\.apple\.com" wrapper/orchestrator/push_endpoints.ts | wc -l
# 期望: ≥ 4（4 端点全列）

# === 5. dsh `headless` profile 守门（M2 扩展 wrapper 实调）===
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/orchestrator/6host_router.ts wrapper/orchestrator/profile_6host.ts | wc -l
# 期望: 0 行（依然 headless，不切 web）

# === 6. v1.0 runtime 0 行 diff 守门（M2 不触及 v1.0 kernel）===
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行
```

---

## §5 估时

- **Day 1-2**: 6 host 路由器设计 + container_dns + capability JSON
- **Day 3-4**: profile_6host + 三档 profile 6 host 路由策略
- **Day 5-7**: STT worker + audio_pipe（流式转写 + /dev/shm 临时缓存）
- **Day 8-10**: Web Push gateway + vapid_signer + 4 推送端点白名单
- **Day 11-12**: 三层集成测试（unit + integration + E2E）
- **Day 13-14**: M2 QA-1 + DD-1 协同收口 + verbatim 验证 6 项

**总估时**: 14 工作日（2.5 周）；与 PRD-v1.1 §5 M2 = 3 周对齐，余 1 周给 QA-1 E2E + 回滚缓冲。

---

## §6 报告模板

落点：`docs/reports/T-M2-BE-1-report.md` ~200 行 6 段：

1. **§1 6 host 拓扑实证**: 6 个 Tailscale Funnel URL + 6 个 MagicDNS 名 + 容器互联 topology 图
2. **§2 STT worker 实测**: 流式转写延迟（端到端 TTFB + 转写完成时间）+ /dev/shm 内存占用峰值 + 不留盘验证（`/tmp` + `/var/tmp` 无 .wav/.mp3/.m4a）
3. **§3 Web Push gateway 实测**: VAPID 签名时延 + 4 端点投递成功率 + 私钥 env-inject 验证（grep VAPID_PRIVATE_KEY 完整字面 = 0 行）
4. **§4 三档 profile 6 host 路由实测**: orch 主 + 5 边缘 fallback / commander 主 / worker 任一边缘 wall time 对比
5. **§5 verbatim 验证 6 项结果**: v0.3 §4.5/§4.6/§4.7 + dsh headless + v1.0 runtime 0 行 diff
6. **§6 cross-ref + next**: DD-1 M2 段引用本报告作为 M2 BE 实施权威指引

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §1 M2 阶段 + §10.5 v0.4 升级门槛
- `docs/DISPATCH-T-M1c-BE-1.md`（M1c BE-1 实施先例，三档 profile skeleton）
- `docs/DISPATCH-T-M1c-TG-1.md`（M1c TG-1 dsh 真调先例，M2 TG-1 继承）
- `docs/DISPATCH-T-M2-DO-1.md`（M2 DO-1 6 host 部署先行任务）
- `docs/DISPATCH-T-M2-TG-1.md`（M2 TG-1 VAPID key 生成 + STT whisper.cpp 部署）
- `docs/DISPATCH-T-M2-QA-1.md`（M2 QA-1 真机 E2E + 6 Funnel 验证）
- `docs/reports/T-M1c-BE-1-report.md`（M1c BE-1 实施报告 95/4/0）
- `docs/reports/T-M1c-DD-1-report.md`（M1c DD-1 收口报告）
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` §4.5/§4.6/§4.7（M2 hygiene 守门预备）
- `deploy/tailscale-funnel-{newvps,edge1-5}.yaml`（M2 DO-1 6 host Funnel 配置）
- `spec/capabilities/{orch,commander,worker,newvps_ram}.json`（M0b 4 SKU；M2 增 3 SKU = 6host_router + stt_worker + webpush_gateway）

---

## §8 禁止

- ❌ 不在边缘 host 部署 STT worker（仅 newvps 主，避免能力漂移 + 模型权重 150MB 重复下载）
- ❌ 不在边缘 host 部署 Web Push gateway（仅 newvps 主，VAPID 私钥集中管理）
- ❌ 不锁容器 IP（用 container_name + Tailscale MagicDNS）
- ❌ 不落盘音频文件（仅 /dev/shm 内存临时缓存）
- ❌ 不硬编码 VAPID 私钥（仅 env-inject process.env.VAPID_PRIVATE_KEY）
- ❌ 不写完整 DEEPSEEK_API_KEY（GH013 PUSH PROTECTION 教训）
- ❌ 不动 v1.0 runtime（harness/ + spec/ + spikes/ + 9 ADR body）
- ❌ 不切 dsh `web` profile（必须 `headless`）

---

## §9 元数据自检

- [x] §0 元数据（触发 / 依赖 / 产出 / 估时 / 守门）
- [x] §1 任务定义（一句话）
- [x] §2 输入 8 项（M1c skeleton + 6 host + 模型 + VAPID + ENV）
- [x] §3 产出 12 文件（6host router + STT + Web Push + 测试）
- [x] §4 验证 6 项（v0.3 §4.5/§4.6/§4.7 + dsh + v1.0 runtime）
- [x] §5 估时 14 工作日（2.5 周）
- [x] §6 报告模板 6 段 ~200 行
- [x] §7 cross-ref 11 引用
- [x] §8 禁止 8 项（边缘 host 边界 + 不锁 IP + 不落盘 + 不硬编码）
- [x] §9 元数据自检
- [x] 不锁型号守门（无 grep pattern 字面）
- [x] v1.0 runtime 不漂移守门（仅 wrapper/ + spec/capabilities/）
- [x] DEEPSEEK_API_KEY 不入 commit（env-inject only 字样）
- [x] Co-Authored-By 用 `Claude Code` 不写 `Claude Fable 5`
- [x] 12 文件改动 ≥ 3 → Plan-First 流程合规（v0.3 audit-scope 已落）

---

*BE-1 DISPATCH — M2 阶段 TypeScript wrapper 6 host 适配 + STT worker + Web Push gateway。依赖 T-M2-DO-1 6 host 部署先行；产出 12 文件；估时 14 工作日；守门 v0.3 §4.5/§4.6/§4.7 M2 三新增 hygiene。Co-Authored-By: Claude Code <noreply@anthropic.com>*