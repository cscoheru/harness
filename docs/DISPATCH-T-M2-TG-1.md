# T-M2-DISPATCH-TG-1 — dsh 6 host 路由 + STT whisper.cpp 集成 + VAPID key 生成

> **Task ID**: T-M2-TG-1
> **Date**: 2026-09-02
> **Role**: TG (Tooling & Gateway)
> **Stage**: v1.1 M2
> **Trigger**: M1c DD-1 收口 + user 「Start v1.1 M2」 + v0.3 audit-scope §4.5/§4.6/§4.7 M2 hygiene 守门预备
> **Status**: 🟡 DISPATCH DRAFT（M2 阶段 TG 任务书，等 user 「Start v1.1 M2」启动真实工程师）
> **Author**: 架构师 Claude Fable 5 (claude-fable-5)
> **Worktree**: 主仓 `main`

---

## §0 元数据

- **触发条件**: M1c 全 PASS + T-M2-DO-1 6 host 部署 commit + T-M2-BE-1 wrapper/orchestrator 6 host skeleton
- **依赖**: T-M2-DO-1（6 host + whisper.cpp 模型部署）+ T-M2-BE-1（6host_router.ts 路由 API）
- **产出**: 5 文件 `wrapper/dsh/{6host_client,stt_invoke,vapid_gen}.ts` + 2 capability JSON + 1 模型部署脚本 + 1 ENV 模板
- **估时**: 8-10 工作日（M1c TG-1 5-7d + STT 集成 +3d + VAPID +2d）
- **守门**: 不锁型号（NORTH-STAR A-4）/ 不硬编码 API key（GH013 教训）/ dsh `headless` profile / **M2 多 host 守门（v0.3 §4.5）/ M2 STT 守门（v0.3 §4.6）/ M2 Web Push 守门（v0.3 §4.7）**

---

## §1 任务定义（一句话）

把 M1c dsh wrapper（CLI/HTTP 客户端 + tool provider）扩展为 **6 host 路由 + STT whisper.cpp 流式集成 + VAPID key 生成**：dsh client 支持按 MagicDNS 名路由到 6 host 任一；STT 通过 HTTP multipart/form-data 调用 newvps 主节点的 whisper.cpp（端口 8080）；VAPID key pair 由本任务生成（公钥可入 commit，私钥 env-inject + 不入 commit）。

---

## §2 输入

| # | 输入 | 来源 | 验证 |
|---|------|------|------|
| 1 | M1c dsh_client + tool_provider | `wrapper/dsh/{dsh_client,tool_provider}.ts` | M1c commit |
| 2 | 6 host MagicDNS 域名 | T-M2-DO-1 部署后从 `tailscale status` 取 | `harness-{newvps,edge1-5}.tail1b9878.ts.net` |
| 3 | whisper.cpp 模型 | T-M2-DO-1 下载 `whisper-base.en.bin`（~150 MB）| `/opt/harness/models/whisper-base.en.bin` |
| 4 | web-push npm 包 | npm install（package.json 加 dep）| M2 commit |
| 5 | DEEPSEEK_API_KEY | env-inject only | `process.env.DEEPSEEK_API_KEY` |
| 6 | VAPID key 生成算法 | 基于 elliptic curve secp256r1（`vapid` npm 包或自实现）| M2 自实现或用 `web-push` 生成 |

---

## §3 产出

### 3.1 dsh 6 host 路由

| 文件 | 行数 | 内容 |
|------|------|------|
| `wrapper/dsh/6host_client.ts` | ~200 行 | dsh 客户端扩展：解析 MagicDNS 域名 → 按 host_name 调对应 endpoint；fallback newvps |
| `wrapper/dsh/host_selector.ts` | ~80 行 | host 选择策略：orch → newvps + 5 边缘轮询；commander → newvps；worker → 任一边缘（最近延迟）|
| `spec/capabilities/dsh_6host.json` | ~30 行 | dsh 6 host capability（路由策略 + fallback）|

### 3.2 STT whisper.cpp 集成

| 文件 | 行数 | 内容 |
|------|------|------|
| `wrapper/dsh/stt_invoke.ts` | ~220 行 | STT 调用：multipart/form-data audio stream → POST `http://newvps:8080/stt` → 转写 JSON 返回；模型路径 env |
| `wrapper/dsh/audio_stream.ts` | ~80 行 | 音频流处理（pipe stdin → multipart → POST body）|
| `deploy/install-whisper.sh` | ~60 行 | whisper.cpp 安装脚本（apt install + git clone + make + 模型下载）|
| `spec/capabilities/stt_invoke.json` | ~40 行 | STT capability（端到端延迟 SLO + 不留盘守门）|

### 3.3 VAPID key 生成

| 文件 | 行数 | 内容 |
|------|------|------|
| `wrapper/dsh/vapid_gen.ts` | ~120 行 | VAPID key pair 生成：基于 elliptic curve secp256r1；公钥 base64url → 文件 `deploy/vapid_public.key`；私钥 → 仅打印到 stdout（不写文件，避免误 commit）|
| `deploy/env/newvps.env.example` | ~40 行 | ENV 模板：`VAPID_PRIVATE_KEY=<generated>` + `WHISPER_MODEL_PATH=/opt/harness/models/whisper-base.en.bin` + `TUNNEL_ROUTING_KEY=<generated>` |

**总产出：9 文件 = 6 NEW TS + 2 capability JSON + 1 deploy script**

---

## §4 验证

```bash
# === 1. v0.3 §4.5 多 host 守门 ===
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/6host_client.ts wrapper/dsh/host_selector.ts | grep -v "127.0.0.1" | wc -l
# 期望: 0（用 MagicDNS 名）

grep -rE "ts\.net" wrapper/dsh/6host_client.ts | wc -l
# 期望: ≥ 6（6 host MagicDNS 全列）

# === 2. v0.3 §4.6 STT 守门 ===
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]" wrapper/dsh/stt_invoke.ts wrapper/dsh/audio_stream.ts | wc -l
# 期望: 0（不落盘 .wav/.mp3）

grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/]" deploy/install-whisper.sh deploy/env/newvps.env.example | wc -l
# 期望: 0（绝对路径）

# === 3. v0.3 §4.7 VAPID 私钥 env-inject 守门 ===
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/dsh/vapid_gen.ts deploy/env/newvps.env.example | wc -l
# 期望: 0（私钥仅 env 占位）

# VAPID 公钥可入 commit（合规）：
grep -rE "vapid_public_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" deploy/env/newvps.env.example | wc -l
# 期望: 0（公钥示例用 env 占位，正经公钥在 vapid_gen 生成后入 deploy/vapid_public.key）

# === 4. dsh `headless` profile 守门 ===
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/dsh/6host_client.ts wrapper/dsh/stt_invoke.ts | wc -l
# 期望: 0

# === 5. DEEPSEEK_API_KEY 不泄漏 ===
grep -rE "sk-[a-z0-9]{32,}" wrapper/dsh/ deploy/env/ | wc -l
# 期望: 0

# === 6. v1.0 runtime 0 行 diff ===
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0
```

---

## §5 估时

- **Day 1-2**: dsh 6 host client + host_selector + capability JSON
- **Day 3-5**: STT whisper.cpp 集成（multipart upload + 模型部署脚本）
- **Day 6-7**: VAPID key 生成 + ENV 模板
- **Day 8-9**: 三层测试（unit + integration + E2E）
- **Day 10**: M2 QA-1 + DD-1 协同收口 + verbatim 验证 6 项

**总估时**: 10 工作日（2 周）；与 PRD-v1.1 §5 M2 = 3 周对齐，余 1 周给 DO-1 + QA-1 E2E。

---

## §6 报告模板

落点：`docs/reports/T-M2-TG-1-report.md` ~200 行 6 段：

1. **§1 6 host dsh 路由实证**: 6 个 dsh 调用实测 wall time（orch 平均 < 500ms / commander < 200ms / worker < 100ms 边缘）
2. **§2 STT whisper.cpp 实测**: 转写端到端延迟（流式 + 模型加载 1.2s）+ `/dev/shm` 内存峰值 + 不留盘验证
3. **§3 VAPID key 生成实证**: 公钥入 `deploy/vapid_public.key` 验证 + 私钥仅 stdout 不入 commit（git grep 私钥 = 0 行）
4. **§4 whisper.cpp 部署脚本实证**: `deploy/install-whisper.sh` 在 newvps 实跑日志（apt + git clone + make + 模型下载）
5. **§5 verbatim 验证 6 项结果**
6. **§6 cross-ref + next**: DD-1 M2 段引用本报告作为 M2 TG 实施权威指引

---

## §7 cross-ref

- `docs/DISPATCH-T-M1c-TG-1.md`（M1c TG-1 dsh 真调先例）
- `docs/DISPATCH-T-M2-BE-1.md`（M2 BE-1 6host_router API 依赖）
- `docs/DISPATCH-T-M2-DO-1.md`（M2 DO-1 whisper.cpp 部署先行）
- `docs/DISPATCH-T-M2-QA-1.md`（M2 QA-1 端到端验证）
- `docs/reports/T-M1c-TG-1-report.md`（M1c TG-1 实施报告）
- `docs/reports/T-M1c-DD-1-report.md`（M1c DD-1 收口）
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` §4.5/§4.6/§4.7

---

## §8 禁止

- ❌ 不锁 MagicDNS 域名为 IP（用 ts.net 名）
- ❌ 不落盘 STT 音频文件
- ❌ 不硬编码 VAPID 私钥（仅 env-inject + stdout 打印）
- ❌ 不写完整 DEEPSEEK_API_KEY
- ❌ 不切 dsh `web` profile
- ❌ 不动 v1.0 runtime
- ❌ 不在 5 边缘 host 部署 whisper.cpp（仅 newvps 主）
- ❌ 不在 5 边缘 host 生成 VAPID（仅 newvps 主，集中管理）

---

## §9 元数据自检

- [x] §0 元数据（触发 / 依赖 / 产出 / 估时 / 守门）
- [x] §1 任务定义（一句话）
- [x] §2 输入 6 项
- [x] §3 产出 9 文件（6 host + STT + VAPID）
- [x] §4 验证 6 项（v0.3 §4.5/§4.6/§4.7 + dsh + v1.0 runtime）
- [x] §5 估时 10 工作日（2 周）
- [x] §6 报告模板 6 段 ~200 行
- [x] §7 cross-ref 7 引用
- [x] §8 禁止 8 项（不锁域名 + 不落盘 + 不硬编码 + 能力集中）
- [x] §9 元数据自检
- [x] 不锁型号守门
- [x] v1.0 runtime 不漂移守门
- [x] DEEPSEEK_API_KEY 不入 commit
- [x] Co-Authored-By 用 `Claude Code`

---

*TG-1 DISPATCH — M2 阶段 dsh 6 host 路由 + STT whisper.cpp + VAPID 生成。依赖 T-M2-BE-1 路由 API + T-M2-DO-1 模型部署；产出 9 文件；估时 10 工作日；守门 v0.3 §4.5/§4.6/§4.7。Co-Authored-By: Claude Code <noreply@anthropic.com>*