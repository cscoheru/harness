# U8 — MacBook Worker 真部署 checklist (v1.2.0c)

> **适用对象**: MacBook Pro M1 16G (owner device, cscoheru)
> **部署时间**: 15-20 分钟
> **前置条件**: macOS 13+, Docker Desktop 4.x OR colima 0.6+, Tailscale 1.50+
> **参考**: `deploy/runbook-macbook-worker.md` (完整 11 步骤 runbook)
> **Codex 提交铁律覆盖**: 用户已授权 "请继续 u7-u9" — MacBook 部署由 MacBook 终端执行

---

## 前置检查 (Step 2)

```bash
sw_vers                                              # macOS 13+
docker --version                                     # Docker 24.x OR colima 0.6+
tailscale status | head -5                           # 必须显示 tailnet connected
```

---

## Step 1: 安装 Docker runtime (选一)

**选项 A — Docker Desktop** (推荐):
```bash
# 下载: https://www.docker.com/products/docker-desktop/
# 默认 Linux VM x86_64 → 兼容 node:24-slim image
```

**选项 B — colima (轻量, 无 Docker Desktop license)**:
```bash
brew install colima
colima start --vm-type=qemu --arch=x86_64 --cpu 4 --memory 8 --disk 60
# 为什么 --vm-type=qemu --arch=x86_64: M1 Mac 默认 colima 是 aarch64 alpine;
# better-sqlite3 native bindings 有 ABI 风险. x86_64 QEMU VM 匹配 newvps Linux runtime.
```

---

## Step 2: 加入 Tailscale tailnet (tag:macbook)

```bash
# ⚠️ 必须先确认 newvps admin 已 push deploy/tailscale-acl-6host.yaml (含 tag:macbook 段 + tagOwners.tag:macbook: [cscoheru])
# 验证: ssh newvps 'cat /opt/fish-harness/deploy/tailscale-acl-6host.yaml | grep -A3 "tag:macbook"'

tailscale up --advertise-tags=tag:macbook --hostname=kjonemacbook-pro
tailscale status | grep kjonemacbook-pro
# expected: kjonemacbook-pro  user@...  linux  tags: tag:macbook  active
```

---

## Step 3: 禁止 MacBook 合盖睡眠

```bash
pmset -a disablesleep 0
pmset -g | grep -i sleep                                # Sleep Disabled
# 还原: pmset -a disablesleep 1
```

---

## Step 4: 部署 MacBook worker 容器

```bash
cd /Users/kjonekong/projects/fish-harness

docker compose -f deploy/macbook-compose.yml pull
docker compose -f deploy/macbook-compose.yml up -d
# expected: harness-macbook-worker  Started

docker ps | grep macbook
# expected: harness-macbook-worker  node:24-slim  Up X minutes

docker logs harness-macbook-worker 2>&1 | grep -E "heartbeat|register" | tail -5
# expected: "register OK worker_id=wrk-..." then periodic heartbeat
```

---

## Step 5: 跨 host 验证 (从 newvps)

```bash
# SSH to newvps (NOT puer-hk — 那是 mail.rana.asia)
ssh newvps

# MagicDNS 验证 MacBook 可达
curl -i http://kjonemacbook-pro.fish-harness.ts.net:4001/health
# expected: HTTP/1.1 200 OK; {"status":"ok","version":"1.2.0c"}

# heartbeat 在 newvps worker_pool 落地
sqlite3 /data/worker_pool.db "SELECT worker_id, host, last_heartbeat_at FROM workers WHERE host LIKE '%macbook%' ORDER BY last_heartbeat_at DESC LIMIT 5"
# expected: ≥1 row with host containing "macbook"
```

---

## Step 6: 验证 scoring +100 工作时段

```bash
# 本地当前时间确认 (e.g. Tue 10:00)
date

# 触发任务 (从 newvps)
ssh newvps "cd /opt/fish-harness/wrapper && curl -i -X POST http://localhost:4000/api/v1/tasks -d '{\"prompt\":\"test\",\"modelClass\":\"worker\"}' -H 'Content-Type: application/json'"

# 检查 scoring 日志
ssh newvps "docker logs harness-wrapper-orchestrator 2>&1 | grep -i 'macbook\|scoring' | tail -10"
# expected: log line "MacBook scoring +100 host=kjonemacbook-pro isWorkingHours=true"
```

---

## Step 7: 优雅降级验证 (合盖/睡眠)

```bash
# 合盖 → heartbeat 失败 → newvps worker_pool 标记 MacBook stale (3 次心跳失败, default 10s 间隔 = 30s window)
# 重新启用: 开盖 + tailscale status + docker compose -f deploy/macbook-compose.yml up -d
```

---

## Step 8: 卸载 (可选)

```bash
cd /Users/kjonekong/projects/fish-harness
docker compose -f deploy/macbook-compose.yml down
# tailscale set --advertise-tags=   # 清除所有 tags (可选)
```

---

## Troubleshooting (6 项)

| 症状 | 原因 | 修法 |
|------|------|------|
| `kjonemacbook-pro not in tailnet` | Tailscale 未 auth | 重跑 Step 2 |
| `connection refused :4001` from newvps curl | 容器未 up OR ACL 拒 | `docker ps` + `tailscale acl test` |
| `better-sqlite3 ABI mismatch` | aarch64 alpine colima | 用 `--vm-type=qemu --arch=x86_64` 重创建 (Step 1 选项 B) |
| Heartbeats never reach newvps | Tailscale ACL `tag:macbook` 缺失 | 确认 ACL + admin `tailscale acl push` |
| Scoring not +100 | 非工作时段 | 验证 `isWorkingHours()` 条件 (周一-周五 09-22) |
| MacBook 合盖睡眠 | pmset 未设 | 重跑 Step 3 |

---

*U8 MacBook 真部署 checklist — 8 步骤 + 6 troubleshooting 项 — 与 runbook-macbook-worker.md (11 步骤) 对应核心动作*