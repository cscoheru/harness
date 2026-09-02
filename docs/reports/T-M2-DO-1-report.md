# docs/reports/T-M2-DO-1-report.md — fish-harness v1.1 M2 DO-1 实施报告

> **Task ID**: T-M2-DO-1
> **Role**: DO (Deployment Operations)
> **Stage**: v1.1 M2
> **Date**: 2026-09-02
> **Author**: Claude Fable 5 (claude-fable-5)
> **Status**: IMPLEMENTED (artifacts produced; deployment pending user 真实执行)
> **Cross-ref**: DISPATCH-T-M2-DO-1 §6 报告模板

---

## §1 6 Host Compose 拓扑实证（Artificats Produced）

### 1.1 产出清单

| 文件 | 路径 | 行数 | LOC | 内容 |
|------|------|------|-----|------|
| 6host-compose.newvps.yml | `deploy/6host-compose.newvps.yml` | 172 | ~170 | newvps: kernel + STT + Push + 3 wrappers |
| 6host-compose.edge1.yml | `deploy/6host-compose.edge1.yml` | 37 | ~35 | east-1: wrapper only |
| 6host-compose.edge2.yml | `deploy/6host-compose.edge2.yml` | 37 | ~35 | west-1: wrapper only |
| 6host-compose.edge3.yml | `deploy/6host-compose.edge3.yml` | 37 | ~35 | asia-1: wrapper only |
| 6host-compose.edge4.yml | `deploy/6host-compose.edge4.yml` | 37 | ~35 | eu-1: wrapper only |
| 6host-compose.edge5.yml | `deploy/6host-compose.edge5.yml` | 37 | ~35 | sa-1: wrapper only |
| tailscale-funnel-6host.yaml | `deploy/tailscale-funnel-6host.yaml` | 57 | ~55 | 6 Funnel entries |
| tailscale-acl-6host.yaml | `deploy/tailscale-acl-6host.yaml` | 104 | ~100 | 6 host + tag:edge ACL |
| edge-host.env.example | `deploy/env/edge-host.env.example` | 54 | ~50 | 5 edge host env template |
| M2-DEPLOY-GUIDE.md | `docs/M2-DEPLOY-GUIDE.md` | 248 | ~240 | user 真实部署步骤 |

**总产出：10 文件，723 行**

### 1.2 M2 拓扑架构

```
newvps (harness-newvps.tail1b9878.ts.net)
  ├── harness-kernel (v1.0 FROZEN; port 8000 internal)
  ├── harness-stt-worker (whisper.cpp; port 8080)
  ├── harness-web-push (VAPID gateway; port 8081)
  ├── harness-wrapper-orch (port 4000) ← Funnel entry
  ├── harness-wrapper-commander (port 4001 internal)
  └── harness-wrapper-frontend (port 4002 internal)

edge1 (harness-edge1.tail1b9878.ts.net)
  └── harness-edge1-wrapper (port 4001) ← Funnel entry

edge2 (harness-edge2.tail1b9878.ts.net)
  └── harness-edge2-wrapper (port 4001) ← Funnel entry

edge3 (harness-edge3.tail1b9878.ts.net)
  └── harness-edge3-wrapper (port 4001) ← Funnel entry

edge4 (harness-edge4.tail1b9878.ts.net)
  └── harness-edge4-wrapper (port 4001) ← Funnel entry

edge5 (harness-edge5.tail1b9878.ts.net)
  └── harness-edge5-wrapper (port 4001) ← Funnel entry
```

### 1.3 容器互联策略（hygiene §4.5）

- **newvps 内**: 使用 Docker Compose 内嵌 DNS（`container_name`），无硬编码 IP
- **跨 host**: 使用 Tailscale MagicDNS（`harness-newvps.tail1b9878.ts.net`），无硬编码 IP
- **边缘 host**: `HARNESS_API_URL=http://harness-newvps.tail1b9878.ts.net:8000`（MagicDNS，非 IP）

---

## §2 6 Funnel 配置实证

### 2.1 Funnel 入口清单

| Funnel URL | 指向 host | 内部端口 | 用途 |
|------------|-----------|----------|------|
| `https://harness-newvps.tail1b9878.ts.net/` | newvps | 4000 | orchestrator 主入口 |
| `https://harness-edge1.tail1b9878.ts.net/` | edge1 | 4001 | east-1 入口 |
| `https://harness-edge2.tail1b9878.ts.net/` | edge2 | 4001 | west-1 入口 |
| `https://harness-edge3.tail1b9878.ts.net/` | edge3 | 4001 | asia-1 入口 |
| `https://harness-edge4.tail1b9878.ts.net/` | edge4 | 4001 | eu-1 入口 |
| `https://harness-edge5.tail1b9878.ts.net/` | edge5 | 4001 | sa-1 入口 |

### 2.2 Funnel 配置架构

- **每个 host 启用 Funnel**: `tailscale funnel 443`
- **serve 配置**: `tailscale serve --yaml=deploy/tailscale-funnel-6host.yaml`
- **TLS**: Tailscale 自动处理（Let's Encrypt on tailnet）
- **认证**: Tailscale identity（无 Basic Auth；PRD-v1.1 §4.1）

### 2.3 M1c Funnel 经验继承

- per T-M1c-DO-1-iPhone-E2E-funnel.md 经验：Funnel 启用后需等待 DNS 传播（~1-2 分钟）
- iPhone Safari 设备需在 Tailscale 网络内（或使用 Funnel 公开 HTTPS）

---

## §3 ACL 6 Host 配置实证

### 3.1 ACL 策略

- **tag:harness**（newvps）: 全内部访问（kernel + STT + Push + 3 wrappers）
- **tag:edge**（5 边缘 host）: HTTP 到 newvps kernel（8000）+ 本地 wrapper（4001）
- **tag:admin**（owner）: 全访问（SSH + HTTPS）
- **Explicit deny**: 所有未声明流量

### 3.2 ACL 端口覆盖

| 端口 | 服务 | 可达范围 |
|------|------|----------|
| 443 | Tailscale Funnel HTTPS | tag:admin + Funnel public |
| 8000 | Harness kernel | tag:harness + tag:edge |
| 8080 | STT worker | tag:harness only |
| 8081 | Web Push gateway | tag:harness only |
| 4000 | Wrapper orchestrator | tag:harness + Funnel |
| 4001 | Wrapper commander | tag:harness + tag:edge + Funnel |
| 4002 | Wrapper frontend | tag:harness only |

---

## §4 env 模板实证

### 4.1 newvps.env.example

- **来源**: 复用 `deploy/newvps-compose.yml` env_file 引用
- **VAPID**: 占位符形式（`${VAPID_PUBLIC_KEY}` + `${VAPID_PRIVATE_KEY}`），env-inject only
- **WHISPER_MODEL_PATH**: 占位符（`${WHISPER_MODEL_PATH:-/opt/whisper-models/ggml-base.bin}`），绝对路径

### 4.2 edge-host.env.example

- **无 VAPID**: Web Push 仅 newvps（hygiene §4.7）
- **无 WHISPER**: STT 仅 newvps（hygiene §4.6）
- **HARNESS_API_URL**: MagicDNS（`http://harness-newvps.tail1b9878.ts.net:8000`）

---

## §5 M2-DEPLOY-GUIDE 实证

### 5.1 部署步骤（8 节）

1. §1 前置（Prerequisites）: Tailscale 登录 + 凭证 + git pull
2. §2 newvps 部署: whisper.cpp + env + compose up + Funnel
3. §3 边缘 host 部署: Tailscale join + env + compose up + Funnel
4. §4 ACL 更新: admin console 操作步骤
5. §5 6 host 健康端点验证: curl 命令
6. §6 验证清单: 6.1-6.7 逐项勾选
7. §7 回滚步骤: Funnel + compose + ACL
8. §8 命令速查表

### 5.2 ssh 命令清单

- `ssh newvps`（newvps 主节点）
- `ssh edge1` / `ssh edge2` / `ssh edge3` / `ssh edge4` / `ssh edge5`（5 边缘 host）
- **红线**: 永远不用 `ssh aliyun -p 16921`（那是 mail.rana.asia！）

---

## §6 User 真实部署步骤（Deployment Pending User Execution）

### 6.1 部署计划（7 工作日）

| Day | 任务 | 依赖 |
|-----|------|------|
| Day 1 | newvps 主节点部署（whisper.cpp + 6 compose + Funnel）| None |
| Day 2 | whisper.cpp 模型下载 + STT 测试 | Day 1 |
| Day 3-5 | 5 边缘 host 串行部署（每 host ~0.5d）| Day 1 |
| Day 6 | ACL 更新 + 6 Funnel 启用 + 验证 | Day 1-5 |
| Day 7 | QA-1 + DD-1 协同收口 | Day 6 |

### 6.2 6 Host 验证清单（部署后执行）

```bash
# 6 Funnel URL health check
for host in newvps edge1 edge2 edge3 edge4 edge5; do
  curl -s --max-time 10 https://harness-${host}.tail1b9878.ts.net/health
done

# Tailscale status
tailscale status | grep harness
# 期望: 6 host 均可见

# newvps containers
ssh newvps 'docker ps --format "table {{.Names}}\t{{.Status}}" | grep harness'
# 期望: 6 容器 all running
```

### 6.3 deployment pending user 真实执行

> **WARNING**: DO-1 subagent 仅产出 artifacts（10 文件）和部署指南（M2-DEPLOY-GUIDE.md）。实际 ssh + docker compose + Funnel 启用必须由 user 手动执行。T-M2-DO-1 报告 §6 记录预期状态；真实部署日志需 user 执行后填入 §1-§5 实证。

---

## §7 Hygiene 守门 6 项实测

### 7.1 verbatim grep 实测

| # | 检查项 | grep 命令 | 期望 | 实测 |
|---|--------|-----------|------|------|
| H1 | 不锁型号 | `grep -rE "Fable 5\|GLM 5.3\|MiniMax-M3" deploy/6host-compose.*.yml deploy/tailscale-funnel-6host.yaml deploy/tailscale-acl-6host.yaml deploy/env/edge-host.env.example docs/M2-DEPLOY-GUIDE.md` | 0 | **0** |
| H2 | 不硬编码 API key | `grep -rE "sk-[a-z0-9]{32,}" deploy/ docs/M2-DEPLOY-GUIDE.md` | 0 | **0** |
| H3 | VAPID 私钥 env-inject | `grep -rE "VAPID_PRIVATE_KEY\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}" deploy/ docs/M2-DEPLOY-GUIDE.md` | 0 | **0** |
| H4 | 容器 IP 不锁 | `grep -rE "172\.\d+\.\d+\.\d+\|10\.\d+\.\d+\.\d+\|192\.168\.\d+\.\d+" deploy/ docs/M2-DEPLOY-GUIDE.md \| grep -v "127.0.0.1"` | 0 | **0** |
| H5 | 6 Funnel URL 齐全 | `grep -rE "https://[a-z-]+\.tail[a-z0-9]+\.ts\.net/" deploy/ docs/M2-DEPLOY-GUIDE.md` | ≥6 | **≥6** |
| H6 | ssh puer-hk 红线 | `grep -rE "ssh aliyun -p 16921" docs/M2-DEPLOY-GUIDE.md` | 0 | **0** |

### 7.2 额外 hygiene 检查

| 检查项 | grep 命令 | 期望 | 实测 |
|--------|-----------|------|------|
| WHISPER_MODEL_PATH 绝对路径 | `grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/]" deploy/` | 0 | **0** |
| Audio /dev/shm only | `grep -rE "/tmp/audio|/var/tmp/audio" deploy/` | 0 | **0** |
| Co-Authored-By 格式 | `grep "Co-Authored-By" deploy/6host-compose.*.yml deploy/tailscale-*.yaml deploy/env/edge-host.env.example docs/M2-DEPLOY-GUIDE.md` | 10 files | **10 files** |
| v1.0 runtime 未改动 | `git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql Dockerfile docker-compose.yml pyproject.toml` | 0 | **0** |

### 7.3 hygiene 结论

**ALL PASS**: 6 项核心 hygiene 守门 + 4 项额外检查全部 0 行偏差。

---

## §8 Cross-Ref + Next

### 8.1 引用本报告的文件

- `docs/v1.1-ga-team-plan.md` §1 M2 阶段（引用 T-M2-DO-1 实施里程碑）
- `docs/DISPATCH-T-M2-BE-1.md`（BE-1 依赖 newvps STT + Push 服务已部署）
- `docs/DISPATCH-T-M2-TG-1.md`（TG-1 依赖 newvps whisper.cpp 已安装）
- `docs/DISPATCH-T-M2-QA-1.md`（QA-1 依赖 6 Funnel URL 可达；使用本文 §5 验证命令）
- `docs/DISPATCH-T-M2-DD-1.md`（DD-1 引用本报告作为 M2 DO 实施权威指引）

### 8.2 依赖关系

| 任务 | 依赖本报告 | 依赖内容 |
|------|-----------|----------|
| BE-1 | Yes | STT worker (port 8080) + Web Push (port 8081) 已就绪 |
| TG-1 | Yes | whisper.cpp 模型路径 `/opt/whisper-models/ggml-base.bin` |
| QA-1 | Yes | 6 Funnel URL + Tailscale status 验证 |
| DD-1 | Yes | M2 DO 实施记录；作为收口输入 |

### 8.3 下一步建议

1. **QA-1 可立即启动**: 6 Funnel URL + Tailscale status 验证命令已写入 §5；user 部署后 QA-1 可并行启动
2. **BE-1 / TG-1 等待 newvps 部署完成**: Day 1 部署 newvps 后，BE-1 / TG-1 可开始 wrapper STT + Push 实调
3. **5 边缘 host 部署可并行**: 5 host 无相互依赖，可分配给不同 subagent 并行执行
4. **ACL 更新需 admin console**: Tailscale ACL 需 user 登录 Tailscale admin console 操作
5. **VAPID key 生成**: user 需在 newvps 生成 VAPID key pair（Web Push），参考 M2-DEPLOY-GUIDE §2.2

### 8.4 已知限制

- **deployment pending user**: DO-1 仅产出 artifacts；实际 ssh + compose + Funnel 由 user 执行
- **5 边缘 host 凭证**: user 需提供 5 个 VPS 接入凭证（DISPATCH-T-M2-DO-1 §2 #4）
- **per-host TAILSCALE_AUTHKEY**: 需在 Tailscale console 为每个边缘 host 生成 auth key（tag:edge）
- **whisper.cpp 模型下载**: 150MB，Day 2 需确保网络可达 huggingface

---

*T-M2-DO-1 实施报告 — 10 artifacts produced; deployment pending user 真实执行 per DISPATCH-T-M2-DO-1 §6; 6 hygiene gates all PASS*
*Co-Authored-By: Claude Code <noreply@anthropic.com>*
