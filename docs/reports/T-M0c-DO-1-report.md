# T-M0c-DO-1 Report — Tailscale-only + newvps co-located + 1 worker 部署骨架

> **Agent**: T-M0c-DO-1 subagent
> **Worktree**: `worktree-agent-a82a4c4d259e91b1a`
> **Commit**: `e99393d`
> **Date**: 2026-09-02
> **Status**: done

---

## §1 任务一句话

T-M0c 阶段 1 骨架轮：在 worktree 内写 4 个部署文件（deploy/newvps-compose.yml / tailscale-serve-harness.yaml / tailscale-acl.yaml / env/newvps.env.example）+ yaml 语法验证全部 exit 0。

---

## §2 产出

| 文件 | 行数 | 路径 |
|------|------|------|
| `deploy/newvps-compose.yml` | 117 | `.claude/worktrees/agent-a82a4c4d259e91b1a/deploy/newvps-compose.yml` |
| `tailscale-serve-harness.yaml` | 29 | `.claude/worktrees/agent-a82a4c4d259e91b1a/tailscale-serve-harness.yaml` |
| `tailscale-acl.yaml` | 84 | `.claude/worktrees/agent-a82a4c4d259e91b1a/tailscale-acl.yaml` |
| `env/newvps.env.example` | 61 | `.claude/worktrees/agent-a82a4c4d259e91b1a/env/newvps.env.example` |
| **Total** | **291** | |

**Commit**: `e99393d` — 4 files changed, 291 insertions(+)

---

## §3 验证命令实测

```bash
# 1. python yaml safe_load — deploy/newvps-compose.yml
python3 -c "import yaml; yaml.safe_load(open('deploy/newvps-compose.yml'))"
# → ✅ no error

# 2. python yaml safe_load — tailscale-serve-harness.yaml
python3 -c "import yaml; yaml.safe_load(open('tailscale-serve-harness.yaml'))"
# → ✅ no error

# 3. python yaml safe_load — tailscale-acl.yaml
python3 -c "import yaml; yaml.safe_load(open('tailscale-acl.yaml'))"
# → ✅ no error

# 4. GH013 API key grep (守门)
grep -rE "sk-[a-zA-Z0-9]{32,}" deploy/ env/
# → 0 lines ✅

# 5. docker compose config
# ❌ docker compose plugin not installed on host (docker v29.7.2 present but
#    `docker compose` subcommand not available)
#    → python yaml safe_load fallback confirmed syntax; this is the expected
#      fallback per §5 兜底方案
```

All yaml syntax checks passed.

---

## §4 估时实测

- **Subagent wall time**: ~8 min（读任务书 x3 + 读 v1.0 Dockerfile/compose + 写 4 文件 + 验证 + commit）
- **估时（任务书）**: 2d（DO 工程师 1 人，真实部署场景）
- **实际**: subagent 骨架轮约 8 min（只写文件不部署，符合预期）

---

## §5 问题 + 兜底

| 问题 | 兜底 | 状态 |
|------|------|------|
| `docker compose` plugin not installed on host | python yaml `safe_load` fallback 确认 yaml 语法正确 | ✅ exit 0 |
| `deploy/` 和 `env/` 目录不存在 | 写文件前先 `mkdir -p` | ✅ |
| GitHub Secret Scanning (GH013) | env example 全用 `${VAR}` 占位符，不写真值 | ✅ grep 0 lines |
| v1.0 Dockerfile 保护 | `image: ghcr.io/cscoheru/fish-harness:1.0.0` 不动源文件 | ✅ |
| 不锁型号 (NORTH-STAR A-4) | `WORKER_CLASS: "worker"` 而非具体 SKU | ✅ |

**Subagent 严格不部署**（不 ssh / 不 docker compose up — 符合任务书边界）。

---

## §6 cross-ref

| 来源 | 条款 | 对应 |
|------|------|------|
| `PRD-v1.1-product.md` §4.1 | Tailscale-only（裁定 a）| ✅ `tailscale-serve-harness.yaml` 443 → harness:8000；`tailscale-acl.yaml` 身份认证；compose 无公网 port |
| `PRD-v1.1-product.md` §4.2 | newvps 共址 (a) | ✅ `newvps-compose.yml` 三服务同机 `harness_net` |
| `DISPATCH-T-M0b-DO-1.md` §newvps RAM | total 7.8 GB / available 6.0 GB / 余量 3.5x PASS | ✅ `newvps-compose.yml` 每容器 `mem_limit: 512m`；总 ~1.5 GB 在 6.0 GB 内 |
| `ADR 0010` Decision (d) | v1.0 runtime 0-diff gate | ✅ `image: ghcr.io/cscoheru/fish-harness:1.0.0` 不动 Dockerfile |
| NORTH-STAR §7 认证 | Tailscale identity 替代 Basic Auth | ✅ `tailscale-acl.yaml` 无 Basic Auth；ACL 守身份 |
| GH013 lesson | 不硬编码 API key | ✅ `${DEEPSEEK_API_KEY}` 占位符；grep 0 lines |

---

## §7 部署说明（供 user / 真实工程师参考）

> **Subagent 不部署。以下为部署步骤骨架，待 Stage 2 补全。**

```bash
# === ONE-TIME: newvps host setup ===

# 1. Install Tailscale on newvps
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=${TAILSCALE_AUTHKEY} --advertise-tags=tag:harness

# 2. Apply ACL (run from any admin machine with `tailscale` CLI)
tailscale acl import --force < tailscale-acl.yaml

# 3. Tag the host
tailscale set --advertise-tags=tag:harness

# 4. Enable Tailscale Serve (HTTPS certificate via Let's Encrypt on tailnet)
tailscale serve --bg --yaml=tailscale-serve-harness.yaml

# === DEPLOY: docker compose on newvps ===

# 5. Clone or pull repo on newvps
git clone https://github.com/cscoheru/fish-harness.git /opt/fish-harness
cd /opt/fish-harness

# 6. Create real env file (DO NOT commit this)
cat > .env.newvps << 'EOF'
DEEPSEEK_API_KEY=sk-real-key-here
WORKER_ID=worker-001
TAILSCALE_AUTHKEY=tskey-real-auth-key-here
EOF

# 7. Deploy
docker compose -f deploy/newvps-compose.yml --env-file .env.newvps up -d

# === VERIFY ===

# 8. Verify Tailscale Serve
tailscale serve status
# Expect: harness.rana.asia serving

# 9. Health check via tailnet
curl https://harness.rana.asia/health
# Expect: HTTP 200 + JSON

# 10. Check containers
docker compose -f deploy/newvps-compose.yml ps

# === ROLLBACK ===

docker compose -f deploy/newvps-compose.yml down
tailscale serve reset
```

---

## §8 遗留 / Stage 2 前置

- [ ] **Stage 2**: dsh-wrapper TypeScript 源码 mount；替换 `sleep infinity` placeholder command
- [ ] **Stage 2**: worker TypeScript 源码 mount；替换 `sleep infinity` placeholder command
- [ ] **Stage 2**: orchestrator + commander 健康检查 endpoints
- [ ] **Stage 2**: Tailscale serve 443 实际验证（需 user 在 newvps 执行 `tailscale serve`）
- [ ] **Stage 3**: 真实 dsh CLI 集成 + orchestrator spawn 流程
