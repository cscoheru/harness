# docs/M2-DEPLOY-GUIDE.md — fish-harness v1.1 M2 6 Host 真实部署指南

> **Role**: DO-1 (DevOps) artifact + user 执行手册
> **Stage**: v1.1 M2 (T-M2-DO-1 产出)
> **Date**: 2026-09-02
> **Deployment**: user 手动 ssh + docker compose + Funnel 启用 (DO-1 仅产 artifacts + 本指南)
> **Note**: §6.7 deployment pending user 真实执行 (6 host ssh + compose up + Funnel 启用)

---

## §1 前置（Prerequisites）

### 1.1 Tailscale 登录验证（所有 host）

```bash
# 从本机（admin 设备）验证 Tailscale 登录
tailscale status

# 验证所有 6 host 已在 tailnet 中
tailscale status | grep -E "harness-(newvps|edge[1-5])"
# 期望: 6 个 hostname 可见

# 如果某 host 未加入 tailnet，首次接入见 §3
```

### 1.2 凭证准备（所有 host）

| 凭证 | 来源 | 用途 |
|------|------|------|
| `DEEPSEEK_API_KEY` | user 保管 | env-inject; 不入 git |
| `TAILSCALE_AUTHKEY` | Tailscale console → Settings → Keys | per-host auto-login |
| `VAPID_PUBLIC_KEY` | newvps generate | Web Push 公钥 (可入 commit) |
| `VAPID_PRIVATE_KEY` | newvps generate | Web Push 私钥 (env-inject only) |
| `WHISPER_MODEL_PATH` | whisper.cpp model | STT 模型路径 (newvps only) |

### 1.3 Git clone / pull（所有 host）

```bash
# SSH 到 newvps，拉取最新代码
ssh newvps 'cd /opt/fish-harness && git pull origin main'

# 对 5 个边缘 host 同样操作
ssh edge1 'cd /opt/fish-harness && git pull origin main'
ssh edge2 'cd /opt/fish-harness && git pull origin main'
ssh edge3 'cd /opt/fish-harness && git pull origin main'
ssh edge4 'cd /opt/fish-harness && git pull origin main'
ssh edge5 'cd /opt/fish-harness && git pull origin main'
```

### 1.4 Docker login（如使用 GHCR 私有镜像）

```bash
# 在所有 host 执行（如需要）
ssh newvps 'echo ${GITHUB_TOKEN} | docker login ghcr.io -u cscoheru --password-stdin'
# 边缘 host 同样
```

---

## §2 newvps 主节点部署

### 2.1 whisper.cpp 安装（newvps only）

```bash
# SSH 到 newvps
ssh newvps

# 创建模型目录（绝对路径; hygiene §4.6）
sudo mkdir -p /opt/whisper-models
sudo chown -R $(whoami):$(whoami) /opt/whisper-models

# 克隆 whisper.cpp（如尚未安装）
cd /tmp
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
mkdir build && cd build
cmake ..
make -j$(nproc)

# 下载 base 模型（~150MB）
# 模型路径必须是绝对路径（hygiene §4.6）
cd /opt/whisper-models
curl -L -o ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# 验证
ls -lh /opt/whisper-models/ggml-base.bin
# 期望: ~150MB 文件
```

### 2.2 创建 newvps env 文件（env-inject only）

```bash
ssh newvps 'cat > /opt/fish-harness/.env.newvps << '\''EOF'\''
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
VAPID_MAILTO=mailto:admin@rana.asia
WHISPER_MODEL_PATH=/opt/whisper-models/ggml-base.bin
TAILSCALE_AUTHKEY=${TAILSCALE_AUTHKEY}
WORKER_ID=worker-001
LOG_LEVEL=INFO
EOF'

# 验证（不暴露真实 key）
ssh newvps 'grep -v "sk-" /opt/fish-harness/.env.newvps'
# 期望: 占位符形式
```

### 2.3 newvps docker compose up

```bash
ssh newvps

cd /opt/fish-harness
export $(grep -v '^#' .env.newvps | xargs) && \
docker compose -f deploy/6host-compose.newvps.yml up -d

# 验证 6 容器启动
docker compose -f deploy/6host-compose.newvps.yml ps
# 期望: harness-kernel / harness-stt-worker / harness-web-push /
#       harness-wrapper-orch / harness-wrapper-commander / harness-wrapper-frontend
```

### 2.4 newvps Funnel 启用

```bash
ssh newvps

cd /opt/fish-harness

# 启用 Funnel（443 端口）
tailscale funnel 443

# 配置 serve（harness-newvps Funnel entry）
tailscale serve --yaml=deploy/tailscale-funnel-6host.yaml

# 验证 Funnel 状态
tailscale funnel status
# 期望: harness-newvps.tail1b9878.ts.net → 127.0.0.1:4000

# 验证 HTTPS 可达（从 admin 设备）
curl -I https://harness-newvps.tail1b9878.ts.net/
# 期望: HTTP 200 or 401 (auth), not 502/503
```

---

## §3 5 边缘 host 串行部署

> 每个 host 独立操作；建议按 east-1 / west-1 / asia-1 / eu-1 / sa-1 顺序串行部署

### 3.1 首次接入（Tailscale 登录）

```bash
# 对每个边缘 host（首次部署时）
# 1. SSH 到 host（用 provider 给的 IP + 密钥）
ssh root@<edge-host-ip>

# 2. 安装 Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu

# 3. 安装 Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# 4. 加入 tailnet（用 per-host auth key）
#    生成方式: Tailscale console → Settings → Keys → Generate auth key (tag:edge)
tailscale up --authkey=${TAILSCALE_AUTHKEY} --advertise-tags=tag:edge --hostname=harness-edge{N}

# 5. 验证 MagicDNS
tailscale status | grep harness-edge{N}
# 期望: hostname = harness-edge{N}.tail1b9878.ts.net
```

### 3.2 创建 edge env 文件

```bash
# 对每个边缘 host
ssh edge{N} 'cat > /opt/fish-harness/.env.edge << '\''EOF'\''
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
TAILSCALE_AUTHKEY=${TAILSCALE_AUTHKEY}
WORKER_ID=edge{N}-wrapper
LOG_LEVEL=INFO
EDGE_REGION={region-name}
HARNESS_API_URL=http://harness-newvps.tail1b9878.ts.net:8000
EOF'
```

### 3.3 edge docker compose up

```bash
# 对每个边缘 host（以 edge1 为例）
ssh edge1

cd /opt/fish-harness
export $(grep -v '^#' .env.edge | xargs) && \
docker compose -f deploy/6host-compose.edge1.yml up -d

# 验证
docker compose -f deploy/6host-compose.edge1.yml ps
# 期望: harness-edge1-wrapper running
```

### 3.4 edge Funnel 启用

```bash
# 对每个边缘 host（以 edge1 为例）
ssh edge1

cd /opt/fish-harness

# 启用 Funnel（443 端口）
tailscale funnel 443

# 配置 serve
tailscale serve --yaml=deploy/tailscale-funnel-6host.yaml

# 验证
tailscale funnel status | grep harness-edge1
# 期望: harness-edge1.tail1b9878.ts.net → 127.0.0.1:4001
```

---

## §4 Tailscale ACL 更新

> 在 admin 设备执行（Tailscale admin console 或 `tailscale acl` 命令）

```bash
# 备份当前 ACL
tailscale acl show > ~/tailscale-acl-backup-$(date +%Y%m%d).json

# 应用新 ACL（6 host）
# 方式1: Tailscale admin console → Access Controls → 粘贴 tailscale-acl-6host.yaml
# 方式2: tailscale setAcl（如果 Tailscale CLI 支持）
tailscale serve --yaml=deploy/tailscale-acl-6host.yaml  # 注: ACL 用 admin console 更新

# 验证 ACL 生效
tailscale status | grep -E "harness-(newvps|edge[1-5])"
# 期望: 6 host 均可见，含 tag:harness 或 tag:edge
```

---

## §5 6 Host 健康端点验证

> 从 admin 设备执行（或任何 Tailscale 设备）

### 5.1 newvps 健康检查

```bash
# Funnel HTTPS 健康检查
curl -s --max-time 10 https://harness-newvps.tail1b9878.ts.net/health || \
curl -s --max-time 10 http://127.0.0.1:4000/health

# 验证 6 容器均 healthy
ssh newvps 'docker ps --format "table {{.Names}}\t{{.Status}}" | grep harness'
# 期望: 6 行 all healthy
```

### 5.2 edge1-5 健康检查

```bash
# 6 Funnel URL 健康检查（并行）
for host in newvps edge1 edge2 edge3 edge4 edge5; do
  url="https://harness-${host}.tail1b9878.ts.net/health"
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "FAIL")
  echo "$host: HTTP $status"
done
# 期望: HTTP 200 or 401 (auth), not FAIL/502/503
```

### 5.3 Tailscale status 验证

```bash
tailscale status | grep harness
# 期望 6 行:
#   harness-newvps  (tag:harness)
#   harness-edge1    (tag:edge)
#   harness-edge2    (tag:edge)
#   harness-edge3    (tag:edge)
#   harness-edge4    (tag:edge)
#   harness-edge5    (tag:edge)
```

---

## §6 验证清单（Verification Checklist）

### 6.1 newvps 主节点
- [ ] whisper.cpp 模型下载完成（/opt/whisper-models/ggml-base.bin ~150MB）
- [ ] 6 容器全部 running: harness-kernel / stt-worker / web-push / orchestrator / commander / frontend
- [ ] 6 容器 health check 全 PASS
- [ ] Funnel 443 启用（harness-newvps.tail1b9878.ts.net → 127.0.0.1:4000）
- [ ] HTTPS 可达（curl HTTP 200 or 401）
- [ ] VAPID 私钥仅 env-inject（不在 git / compose file 中）
- [ ] WHISPER_MODEL_PATH 使用绝对路径

### 6.2 edge1 east-1
- [ ] Tailscale 登录成功（harness-edge1.tail1b9878.ts.net）
- [ ] tag:edge 已分配
- [ ] harness-edge1-wrapper 容器 running
- [ ] Funnel 443 启用（harness-edge1.tail1b9878.ts.net → 127.0.0.1:4001）
- [ ] HTTPS 可达
- [ ] 无 STT worker（compose 中无 whisper 相关配置）

### 6.3 edge2 west-1
- [ ] 同 edge1 清单项

### 6.4 edge3 asia-1
- [ ] 同 edge1 清单项

### 6.5 edge4 eu-1
- [ ] 同 edge1 清单项

### 6.6 edge5 sa-1
- [ ] 同 edge1 清单项

### 6.7 跨 host 验证
- [ ] ACL 更新已生效（6 host + admin 可达）
- [ ] 边缘 host 可通过 MagicDNS 访问 newvps kernel（http://harness-newvps.tail1b9878.ts.net:8000）
- [ ] 边缘 host 无硬编码 IP（compose file 使用 MagicDNS）
- [ ] 无 API key 明文写入 git

---

## §7 回滚步骤

### 7.1 Funnel 回滚

```bash
# 在有问题的主机执行
ssh <host>
tailscale funnel reset
tailscale serve reset
```

### 7.2 docker compose 回滚

```bash
ssh <host>
cd /opt/fish-harness
docker compose -f deploy/6host-compose.{newvps|edge1-5}.yml down
# 如需回到 M1c:
# docker compose -f deploy/newvps-compose.yml up -d
```

### 7.3 ACL 回滚

```bash
# 从 admin 设备
tailscale acl revert ~/tailscale-acl-backup-YYYYMMDD.json
```

---

## §8 关键命令速查

| 操作 | 命令 |
|------|------|
| SSH newvps | `ssh newvps` |
| SSH edge host | `ssh edge{N}` |
| 6 host health | `curl -s https://harness-{newvps,edge1-5}.tail1b9878.ts.net/health` |
| Tailscale status | `tailscale status \| grep harness` |
| Funnel status | `tailscale funnel status` |
| Container logs | `ssh <host> 'docker logs -f <container-name>'` |
| Restart compose | `ssh <host> 'cd /opt/fish-harness && docker compose -f deploy/6host-compose.*.yml restart'` |

---

*DO-1 artifact — user 真实部署执行手册; 6 host ssh + compose + Funnel; deployment pending user 真实执行 per DISPATCH-T-M2-DO-1 §6*
*Co-Authored-By: Claude Code <noreply@anthropic.com>*
