# T-M2-DISPATCH-DO-1 — newvps + 5 边缘 host 部署 + Tailscale Funnel 6 入口

> **Task ID**: T-M2-DO-1
> **Date**: 2026-09-02
> **Role**: DO (Deployment Operations)
> **Stage**: v1.1 M2
> **Trigger**: M1c DD-1 收口 + user 「Start v1.1 M2」 + v0.3 audit-scope §4.5 M2 多 host 守门预备
> **Status**: 🟡 DISPATCH DRAFT（M2 阶段 DO 任务书，等 user 「Start v1.1 M2」启动 user 真实部署）
> **Author**: 架构师 Claude Fable 5 (claude-fable-5)
> **Worktree**: 主仓 `main`

---

## §0 元数据

- **触发条件**: M1c 全 PASS + user 「Start v1.1 M2」信号
- **依赖**: 无（M2 DO-1 是 M2 阶段先行任务；其他 4 DISPATCH 依赖 DO-1 落地）
- **产出**: 6 host docker-compose 部署 + 6 Funnel 配置 + ENV 模板 + whisper.cpp 安装 + Tailscale ACL 6 host
- **估时**: 5-7 工作日（M1c DO-1 newvps 3-5d × 2 倍；6 host 共 12 次部署 + 5 边缘 host 选址）
- **守门**: 不锁型号 / 不硬编码 API key / **M2 多 host 守门（v0.3 §4.5：容器 IP 不锁 + MagicDNS + 6 Funnel URL）/ STT 守门（v0.3 §4.6：模型路径绝对）/ Web Push 守门（v0.3 §4.7：VAPID 私钥 env-inject）**

---

## §1 任务定义（一句话）

把 M1c newvps 单 host 部署扩展为 **6 host 分布式部署**：newvps 主节点跑 harness kernel + STT worker + Web Push gateway + wrapper 三档 profile；5 边缘 host（east-1 / west-1 / asia-1 / eu-1 / sa-1）各跑 wrapper/orchestrator HTTP 反向代理（无 STT / 无 Push gateway，避免能力漂移）；Tailscale Funnel 启用 6 个独立 HTTPS 入口（1 newvps + 5 边缘）；Tailscale ACL 收紧到仅 tailnet + iPhone Safari 设备可达。

---

## §2 输入

| # | 输入 | 来源 | 验证 |
|---|------|------|------|
| 1 | M1c newvps 真部署 6 大坑 | `newvps-harness-deploy-gotchas.md` | 已记录（M1c DO-1 实施）|
| 2 | M1c Funnel 启用经验 | `docs/reports/T-M1c-DO-1-iPhone-E2E-funnel.md` | 已 commit（iPhone 截屏存档）|
| 3 | ssh puer-hk 红线 | `ssh-puer-hk-host-agent-server.md` | per memory 永久红线 |
| 4 | 5 边缘 host 接入凭证 | user 提供（5 个 VPS 厂商：Vultr / DO / Linode / Hetzner / AWS Lightsail）| user 亲填部署 |
| 5 | Tailscale ACL 模板 | `deploy/tailscale-acl.yaml`（M1c 已落，需扩展到 6 host）| T-M2-DO-1 §3 扩展 |
| 6 | whisper.cpp 安装脚本 | T-M2-TG-1 起草 + T-M2-DO-1 实跑 | 待 T-M2-TG-1 commit |

---

## §3 产出

### 3.1 6 host docker-compose

| 文件 | 行数 | 内容 |
|------|------|------|
| `deploy/6host-compose.newvps.yml` | ~80 行 | newvps 主节点：harness kernel + STT worker + Web Push gateway + wrapper 三档 + 端口 4000/8080/8081/8082 |
| `deploy/6host-compose.edge1.yml` | ~50 行 | east-1 边缘：wrapper/orchestrator 反代 + 端口 4001 |
| `deploy/6host-compose.edge2.yml` | ~50 行 | west-1 边缘：wrapper/orchestrator 反代 + 端口 4001 |
| `deploy/6host-compose.edge3.yml` | ~50 行 | asia-1 边缘：wrapper/orchestrator 反代 + 端口 4001 |
| `deploy/6host-compose.edge4.yml` | ~50 行 | eu-1 边缘：wrapper/orchestrator 反代 + 端口 4001 |
| `deploy/6host-compose.edge5.yml` | ~50 行 | sa-1 边缘：wrapper/orchestrator 反代 + 端口 4001 |

### 3.2 Tailscale Funnel 6 入口

| 文件 | 行数 | 内容 |
|------|------|------|
| `deploy/tailscale-funnel-newvps.yaml` | ~30 行 | `https://harness-newvps.tail1b9878.ts.net/` → `http://127.0.0.1:4000` |
| `deploy/tailscale-funnel-edge1.yaml` | ~30 行 | `https://harness-edge1.tail1b9878.ts.net/` → `http://127.0.0.1:4001` |
| `deploy/tailscale-funnel-edge2.yaml` | ~30 行 | `https://harness-edge2.tail1b9878.ts.net/` → `http://127.0.0.1:4001` |
| `deploy/tailscale-funnel-edge3.yaml` | ~30 行 | `https://harness-edge3.tail1b9878.ts.net/` → `http://127.0.0.1:4001` |
| `deploy/tailscale-funnel-edge4.yaml` | ~30 行 | `https://harness-edge4.tail1b9878.ts.net/` → `http://127.0.0.1:4001` |
| `deploy/tailscale-funnel-edge5.yaml` | ~30 行 | `https://harness-edge5.tail1b9878.ts.net/` → `http://127.0.0.1:4001` |

### 3.3 Tailscale ACL + ENV + whisper.cpp 安装

| 文件 | 行数 | 内容 |
|------|------|------|
| `deploy/tailscale-acl.yaml` | ~80 行 | ACL 扩展：6 host 全列 + 端口 4000/4001/8080/8081/8082 + iPhone Safari 设备 ID |
| `deploy/install-whisper.sh` | ~60 行 | whisper.cpp 一键安装脚本（apt + git clone + make + 模型下载 150MB）|
| `deploy/env/newvps.env.example` | ~40 行 | ENV 模板（VAPID_PRIVATE_KEY + WHISPER_MODEL_PATH + TUNNEL_ROUTING_KEY）|
| `deploy/env/edge.env.example` | ~30 行 | 5 边缘 host 共用 ENV（仅 TUNNEL_ROUTING_KEY + WRAPPER_PORT=4001）|
| `deploy/m2-deploy-runbook.md` | ~150 行 | M2 6 host 部署 playbook（10 步：newvps → 5 边缘串行 → 6 Funnel 启用 → 验证）|

**总产出：19 文件 = 6 compose + 6 funnel + 1 ACL + 1 install + 2 env + 1 runbook + 2 capability JSON**

---

## §4 验证

```bash
# === 1. v0.3 §4.5 多 host 守门（容器 IP 不锁）===
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" deploy/6host-compose.* deploy/tailscale-funnel-*.yaml deploy/env/ | grep -v "127.0.0.1" | wc -l
# 期望: 0（容器互联用 container_name + service name）

# === 2. MagicDNS 域名使用守门 ===
grep -rE "ts\.net" deploy/ | wc -l
# 期望: ≥ 6（6 Funnel URL 全用 MagicDNS）

# === 3. 6 Funnel URL 验证 ===
grep -rE "https://harness-(newvps|edge[1-5])\.tail[a-z0-9]+\.ts\.net/" deploy/tailscale-funnel-*.yaml | wc -l
# 期望: 6（1 newvps + 5 边缘）

# === 4. STT 守门（whisper 路径绝对）===
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/]" deploy/install-whisper.sh deploy/env/newvps.env.example | wc -l
# 期望: 0（绝对路径）

# === 5. Web Push VAPID 私钥 env-inject 守门 ===
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" deploy/env/newvps.env.example | wc -l
# 期望: 0

# === 6. ssh puer-hk 红线 + DEEPSEEK_API_KEY 不泄漏 ===
grep -rE "ssh aliyun -p 16921" deploy/m2-deploy-runbook.md | wc -l
# 期望: 0（永远 ssh puer-hk）

grep -rE "sk-[a-z0-9]{32,}" deploy/ | wc -l
# 期望: 0
```

---

## §5 估时

- **Day 1**: newvps 主节点部署（继承 M1c 6 大坑教训 + 升级到 6 host-compose.newvps.yml）
- **Day 2**: whisper.cpp 部署（`deploy/install-whisper.sh` 实跑 + 模型下载）
- **Day 3-5**: 5 边缘 host 串行部署（每 host ~0.5-1d：SSH 接入 + docker compose up + Tailscale 登录 + Funnel 启用）
- **Day 6**: 6 host Tailscale ACL 收紧 + 6 Funnel 启用 + ENV 模板
- **Day 7**: M2 BE-1 + TG-1 + QA-1 + DD-1 协同收口 + verbatim 验证 6 项

**总估时**: 7 工作日（1.5 周）；与 PRD-v1.1 §5 M2 = 3 周对齐，余 1.5 周给 BE-1/TG-1/QA-1。

---

## §6 报告模板

落点：`docs/reports/T-M2-DO-1-report.md` ~250 行 7 段：

1. **§1 6 host 拓扑实证**: 6 个 Tailscale 节点 `tailscale status` 输出 + 6 个 MagicDNS 名 + 6 个 Funnel URL
2. **§2 newvps 主节点部署实证**: docker compose up + 5 容器（harness + STT + Web Push + wrapper orch/commander）实测
3. **§3 5 边缘 host 串行部署实证**: 每 host 接入厂商 + IP + tailscale 登录 + Funnel 启用 log
4. **§4 Tailscale ACL 收紧实证**: 6 host + iPhone Safari 设备可达性测试
5. **§5 whisper.cpp 安装实证**: `deploy/install-whisper.sh` 实跑日志（apt + git clone + make + 模型下载 150MB + 端到端 STT 转写测试）
6. **§6 verbatim 验证 6 项结果**
7. **§7 cross-ref + next**: DD-1 M2 段引用本报告作为 M2 DO 实施权威指引

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §1 M2 阶段 + §10.5 v0.4 升级门槛
- `docs/DISPATCH-T-M1c-DO-1.md`（M1c DO-1 newvps 真部署 6 大坑）
- `docs/reports/T-M1c-DO-1-iPhone-E2E-funnel.md`（M1c Funnel 经验）
- `docs/reports/T-M1c-DO-1-report.md`（M1c DO-1 newvps 部署报告）
- `docs/reports/T-M1c-DD-1-report.md`（M1c DD-1 收口）
- `newvps-harness-deploy-gotchas.md`（6 大坑实战 + ssh-puer-hk 红线）
- `ssh-puer-hk-host-agent-server.md`（永远 ssh puer-hk）
- `deploy/newvps-compose.yml`（M1c newvps 单 host 部署骨架）
- `deploy/tailscale-serve-harness.yaml`（M1c Tailscale Serve 配置）
- `deploy/tailscale-acl.yaml`（M1c ACL 模板）
- `deploy/env/newvps.env.example`（M1c ENV 模板）
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` §4.5/§4.6/§4.7

---

## §8 禁止

- ❌ 不在 5 边缘 host 部署 STT worker（仅 newvps，避免能力漂移）
- ❌ 不在 5 边缘 host 部署 Web Push gateway（VAPID 私钥集中管理）
- ❌ 不锁容器 IP（用 container_name + MagicDNS）
- ❌ 不写完整 VAPID 私钥（env-inject）
- ❌ 不写完整 DEEPSEEK_API_KEY
- ❌ 不动 v1.0 runtime
- ❌ 永远 ssh puer-hk，不用 ssh aliyun -p 16921
- ❌ 不在边缘 host 跑 whisper.cpp（仅 newvps，避免 5 份 150MB 模型重复下载）

---

## §9 元数据自检

- [x] §0 元数据
- [x] §1 任务定义
- [x] §2 输入 6 项
- [x] §3 产出 19 文件
- [x] §4 验证 6 项
- [x] §5 估时 7 工作日
- [x] §6 报告模板 7 段 ~250 行
- [x] §7 cross-ref 12 引用
- [x] §8 禁止 8 项
- [x] §9 元数据自检
- [x] 不锁型号守门
- [x] v1.0 runtime 不漂移守门
- [x] DEEPSEEK_API_KEY 不入 commit
- [x] Co-Authored-By 用 `Claude Code`
- [x] ssh puer-hk 红线警示在 §8

---

*DO-1 DISPATCH — M2 阶段 6 host 分布式部署 + Tailscale Funnel 6 入口。user 真实部署 + 架构师 playbook；产出 19 文件；估时 7 工作日；守门 v0.3 §4.5/§4.6/§4.7 + ssh puer-hk 红线。Co-Authored-By: Claude Code <noreply@anthropic.com>*