# deploy/runbook-newvps-m1c.md — fish-harness v1.1 M1c newvps 真部署 runbook

> **Role**: DO-1 (DevOps Engineer)
> **Stage**: M1c 实施（部署由 user 真实操作；DO-1 仅写 runbook + 配置）
> **Date**: 2026-09-02
> **Baseline**: newvps-compose.yml (M0c skeleton) + tailscale-serve-harness.yaml + tailscale-acl.yaml + newvps.env.example

---

## §1 前置（Prerequisites）

### 1.1 Tailscale 登录 + 网络

```bash
# 从本机（admin 设备）验证 Tailscale 登录
tailscale status
# 期望输出含 user 身份（cscoheru）和 admin 标签 tag:admin

# 验证 newvps 主机在 tailnet 中
tailscale status | grep newvps
# 期望: newvps 主机名可见，含 tag:harness

# 如果 newvps 未加入 tailnet（首次部署）：
ssh newvps 'curl -fsSL https://tailscale.com/install.sh | sh'
ssh newvps 'tailscale up --authkey=${TAILSCALE_AUTHKEY} --advertise-tags=tag:harness --hostname=harness-newvps'
```

### 1.2 Git clone / pull

```bash
# SSH 到 newvps，拉取最新代码
ssh newvps 'cd /opt/fish-harness && git pull origin main'
# 或首次 clone：
# ssh newvps 'git clone https://github.com/cscoheru/fish-harness.git /opt/fish-harness'
```

### 1.3 Docker login（如果使用 GHCR 私有镜像）

```bash
# 如果 harness 镜像是 GHCR 私有镜像，需先 login
ssh newvps 'echo ${GITHUB_TOKEN} | docker login ghcr.io -u cscoheru --password-stdin'
# GITHUB_TOKEN 可从 GitHub Settings → Developer settings → Personal access tokens 生成
# Scope: packages:read
```

### 1.4 环境变量文件（env-inject only）

```bash
# 在 newvps 创建真实 env 文件（不要 commit 到 git）
ssh newvps 'cat > /opt/fish-harness/.env.newvps << '\''EOF'\''
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
TAILSCALE_AUTHKEY=${TAILSCALE_AUTHKEY}
WORKER_ID=worker-001
LOG_LEVEL=INFO
EOF'

# 验证文件存在且不含明文 key（仅占位符）
ssh newvps 'grep DEEPSEEK_API_KEY /opt/fish-harness/.env.newvps'
# 期望: DEEPSEEK_API_KEY=（后续部署时 shell 展开或 env-file 注入）
```

---

## §2 部署（Deploy）

### 2.1 应用 Tailscale ACL

```bash
# 从任意 admin 设备执行（本地或任何在 tailnet 的机器）
# ACL 定义了谁可以访问什么；不应用则 Tailscale Serve 拒绝连接
tailscale acl import --force < tailscale-acl.yaml
tailscale acl test   # 验证规则导入成功
```

### 2.2 启动 Tailscale Serve（HTTPS 反向代理）

```bash
# 在 newvps 上执行
ssh newvps 'cd /opt/fish-harness && tailscale serve --bg --yaml=tailscale-serve-harness.yaml'

# 验证 Serve 状态
ssh newvps 'tailscale serve status'
# 期望: harness.rana.asia listed as serving
```

> **注意**: `tailscale-serve-harness.yaml` 中的 `routes.harness.rana.asia.to` 应指向 wrapper 容器暴露的端口（M1c: 3000）。如果 wrapper 尚未就绪，先指向 kernel 端口 8000 过渡。

### 2.3 启动 Docker Compose

```bash
# 在 newvps 上执行（所有服务同机；RAM 余量 3.5x per M0b DO-1）
ssh newvps 'cd /opt/fish-harness && \
  DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY} \
  docker compose -f deploy/newvps-compose.yml up -d'

# 验证容器启动
ssh newvps 'docker compose -f deploy/newvps-compose.yml ps'
# 期望: 3 个容器（harness-kernel / dsh-wrapper / worker）全部 running
```

### 2.4 检查容器健康状态

```bash
# 验证 kernel 健康
ssh newvps 'docker exec harness-kernel python -c "import sqlite3; c=sqlite3.connect('\''/data/harness.db'\''); c.close(); print('\''ok'\'')"'
# 期望: ok

# 验证容器内存限制（确认不超限）
ssh newvps 'docker stats --no-stream | grep -E "harness-kernel|dsw-wrapper|worker"'
# 期望: 每容器 < 512m
```

---

## §3 验证（Verify）

### 3.1 本地健康检查（不走 Tailscale）

```bash
# 方式 A：通过 Docker 网络（从宿主机 curl 容器）
ssh newvps 'curl -s http://localhost:3000/health'
# 期望: {"status": "ok"} HTTP 200

# 方式 B：如果 wrapper 尚未就绪，先测 kernel 直接端口
# ssh newvps 'curl -s http://localhost:8000/health'
# 期望: HTTP 200
```

### 3.2 Tailscale HTTPS 验证（走 Tailscale 网络，非公网）

```bash
# 从本机 admin 设备执行（必须先加入 tailnet）
curl -s https://harness.rana.asia:443/health
# 期望: {"status": "ok"} HTTP 200

# 验证走的是 Tailscale 网络（不是公网）
curl -sv https://harness.rana.asia:443/health 2>&1 | grep -E "Connected via Tailscale|TLS|SSL"
# 期望: Connected via Tailscale 字样
```

### 3.3 Tailscale Serve 状态验证

```bash
# 验证 harness.rana.asia 的 HTTPS 证书是 Tailscale 签发（Let's Encrypt on tailnet）
ssh newvps 'tailscale serve status | grep harness.rana.asia'
# 期望: harness.rana.asia → http://127.0.0.1:3000
```

### 3.4 RAM 余量验证（per M0b DO-1 实测 7.8/6.0 GB）

```bash
ssh newvps 'free -h && docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}"'
# 期望: available > 1.7 GB（支撑 kernel 512m + wrapper 512m + worker 512m = 1.5 GB，余量 3.5x）
```

---

## §4 排错（Troubleshooting）

### 4.1 Tailscale 网络问题

| 症状 | 检查命令 | 修法 |
|------|----------|------|
| `curl: (7) Failed to connect` | `tailscale status`（本机 + newvps）| 确认两台机器都在 tailnet；本机执行 `tailscale up` |
| Tailscale Serve 报错 `no identity` | `ssh newvps 'tailscale serve status'` | 重新执行 `tailscale serve --bg --yaml=...` |
| ACL 拒绝连接 | `tailscale ping harness-newvps` | 重新 import ACL: `tailscale acl import --force < tailscale-acl.yaml` |
| DNS 解析失败 `harness.rana.asia` | `tailscale status --json \| jq '.DNSConfig'` | 确认 MagicDNS 开启；Tailscale Admin Console 检查域名 |

### 4.2 Docker Compose 问题

| 症状 | 检查命令 | 修法 |
|------|----------|------|
| 容器反复 restart | `docker logs <container> --tail 50` | 常见原因：HARNESS_PORT 冲突 / env 文件缺失 DEEPSEEK_API_KEY |
| `port is already allocated` | `ss -tlnp \| grep 3000` | 宿主机已有进程占用了端口；改 newvps-compose.yml 的端口映射或杀进程 |
| 镜像拉取失败 `404 Not Found` | `docker images \| grep fish-harness` | GHCR 私有镜像未 login；执行 `docker login ghcr.io` 或改公网镜像 tag |
| 内存 OOM | `dmesg \| grep -i oom` | 减少容器数量；当前 M1c 3 容器 × 512m = 1.5 GB，应该安全 |

### 4.3 DEEPSEEK_API_KEY 问题

| 症状 | 检查命令 | 修法 |
|------|----------|------|
| API 调用 401 Unauthorized | `docker logs <container> \| grep 401` | DEEPSEEK_API_KEY 未正确注入；检查 env 文件 `grep DEEPSEEK_API_KEY .env.newvps` |
| Key 泄露到日志 | `docker logs <container> \| grep sk-` | **立即轮换 key**；GitHub Settings → Developer settings → Regenerate token |

> **GH013 教训**: 不要把真实 DEEPSEEK_API_KEY 写入任何 commit 的文件。只能通过 shell 展开（`${VAR}`）或独立 env 文件（不 commit）注入。

### 4.4 RAM 余量不足

| 症状 | 检查命令 | 修法 |
|------|----------|------|
| OOM Killer 杀容器 | `ssh newvps 'dmesg \| grep -i "out of memory"'` | M1c 每容器 512m 已设上限；检查宿主机是否还跑了其他服务 |
| newvps 可用内存 < 1 GB | `ssh newvps 'free -h'` | 先清其他进程；M1c 后继可考虑减 worker 数量 |

### 4.5 回滚（Rollback）

```bash
# 停止所有服务
ssh newvps 'cd /opt/fish-harness && docker compose -f deploy/newvps-compose.yml down'

# 关闭 Tailscale Serve
ssh newvps 'tailscale serve reset'

# 可选：保留数据卷（harness_db）
# ssh newvps 'docker volume rm fish-harness_harness_db'
# 注意：删除 volume 会丢失 SQLite 数据库
```

---

## §5 部署后检查清单

- [ ] `tailscale serve status` 显示 harness.rana.asia
- [ ] `curl https://harness.rana.asia:443/health` 返回 HTTP 200
- [ ] `docker compose ps` 三容器全部 running
- [ ] `free -h` 剩余可用内存 ≥ 1 GB
- [ ] `docker logs` 无 ERROR 关键字（忽略 INFO/WARNING）
- [ ] `.env.newvps` 不在 git 内（`git status` 无 .env.newvps）

---

## §6 cross-ref

- `deploy/newvps-compose.yml` (M0c skeleton; M1c 扩 wrapper + PWA port)
- `deploy/tailscale-serve-harness.yaml` (M0c; M1c 微调)
- `deploy/tailscale-acl.yaml` (M0c; M1c 微调)
- `env/newvps.env.example` (M0c; M1c 扩 env-only 占位)
- `docs/v1.1-ga-team-plan.md` v0.2 §2.3 Role DO + §10.4 #3
- `docs/DISPATCH-T-M1c-DO-1.md` §3 产出清单
- M0b DO-1 RAM 报告 (commit 4cf0ece)
- PRD-v1.1 §4.1 Tailscale-only

---

*runbook 由 T-M1c-DO-1 subagent 编写（2026-09-02）；部署由 user 真实执行 per PRD-v1.1 §4.6 第 3 条 + v1.1-ga-team-plan.md v0.2 §10.4 #3*
