# U9 — 5 Edge Host 真 provision + ACL sync checklist (v1.2.0c)

> **适用对象**: 5 edge hosts (harness-edge[1-5]) + Tailscale admin console (newvps admin)
> **部署时间**: 10-15 分钟/host × 5 = 50-75 分钟总计
> **前置条件**: 5 VPS 已采购 + Ubuntu 22.04+ + Tailscale 1.50+ + cscoheru Tailscale auth key
> **参考**: `deploy/tailscale-acl-6host.yaml` (已含 tag:edge + tag:macbook 段)
> **Codex 提交铁律覆盖**: 用户已授权 "请继续 u7-u9" — 5 edge provision + ACL push 由用户执行 (session 内 agent 无 Tailscale auth + 无 VPS 采购能力)

---

## Step 1: 5 edge host 各登入 + 安装 Tailscale

```bash
# 每台 edge host 一次性执行 (harness-edge[1-5]):

ssh ubuntu@harness-edge1.fish-harness.ts.net   # 或 IP
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

---

## Step 2: 每台 edge host 设置 tag:edge

```bash
# 每台 edge host 一次性执行 (harness-edge1 → edge5):

ssh ubuntu@harness-edge1.fish-harness.ts.net
sudo tailscale set --advertise-tags=tag:edge --hostname=harness-edge1
# harness-edge2: --hostname=harness-edge2
# harness-edge3: --hostname=harness-edge3
# harness-edge4: --hostname=harness-edge4
# harness-edge5: --hostname=harness-edge5

# 验证
tailscale status | grep harness-edge
# expected: 5 lines, each with tags: tag:edge
```

---

## Step 3: Admin 端验证 7 host + push ACL

> **重要**: 此步必须在 Step 2 全部完成后执行 (admin 一致确认 7 host)

```bash
# Admin 端 (Tailscale admin console 或 cscoheru 本地):
# 1. 打开 https://login.tailscale.com/admin/machines
# 2. 确认 7 host 全部显示 + tags 正确:
#    - harness-newvps: tag:harness
#    - harness-edge1: tag:edge
#    - harness-edge2: tag:edge
#    - harness-edge3: tag:edge
#    - harness-edge4: tag:edge
#    - harness-edge5: tag:edge
#    - kjonemacbook-pro: tag:macbook

# 3. 在 admin console → Access Controls → Edit rules → 粘贴 deploy/tailscale-acl-6host.yaml 内容
#    或用 CLI:
ssh newvps
cd /opt/fish-harness
sudo tailscale acl push --file deploy/tailscale-acl-6host.yaml
# expected: ACL pushed successfully
```

---

## Step 4: Admin 端验证 ACL 守门

```bash
# Admin 端验证 ACL 段都生效
ssh newvps
sudo tailscale acl test
# expected: 7 测试全 PASS (newvps→edges + edges→newvps + MacBook→newvps + MacBook→edges + edges↔edges + MacBook↔MacBook + cscoheru SSH)

# 验证 Funnel 配置
sudo tailscale funnel status
# expected: 7 Funnel HTTPS URLs (per deploy/tailscale-funnel-6host.yaml)
```

---

## Step 5: 5 edge wrappers 部署

```bash
# Admin 端 (在 newvps):
ssh newvps
cd /opt/fish-harness

# 5 edge wrappers 各自 docker compose
for i in 1 2 3 4 5; do
  echo "=== edge$i ==="
  docker compose -f deploy/6host-compose.edge$i.yml pull
  docker compose -f deploy/6host-compose.edge$i.yml up -d
done
# expected: 5 wrapper containers (edge[1-5]-wrapper) Up

# newvps 自己的 wrappers
docker compose -f deploy/6host-compose.newvps.yml pull
docker compose -f deploy/6host-compose.newvps.yml up -d
# expected: 3 wrappers (orchestrator + 2 workers) Up
```

---

## Step 6: 7 host MagicDNS + health 真接

```bash
# Admin 端 (在 newvps) — 7 host curl 健康检查
for host in newvps edge1 edge2 edge3 edge4 edge5; do
  echo "=== $host ==="
  curl -sI http://$host.fish-harness.ts.net:4001/health | head -1
done
# expected: 5 lines all "HTTP/1.1 200 OK"

# MacBook 单独测 (U8 Step 5 已验)
curl -sI http://kjonemacbook-pro.fish-harness.ts.net:4001/health | head -1
# expected: "HTTP/1.1 200 OK"

# newvps orchestrator (port 4000)
curl -sI http://newvps.fish-harness.ts.net:4000/health | head -1
# expected: "HTTP/1.1 200 OK"
```

---

## Step 7: cross-host 真发验证

```bash
# Admin 端 (在 newvps) — 触发跨 host dispatch + 验证 routedDsh() 真发
cd /opt/fish-harness/wrapper
RUN_CROSS_HOST_E2E=1 DEEPSEEK_API_KEY=$(cat /data/secrets/deepseek_key) \
  ./node_modules/.bin/vitest run test/integration/cross_host_dispatch.test.ts
# expected: 8 tests PASS (routedDsh fetch 真发 + MagicDNS canonical + findAvailableHost probes)

# Host-id fencing 验证 (partial unique index)
RUN_HOST_FENCING_E2E=1 DEEPSEEK_API_KEY=$(cat /data/secrets/deepseek_key) \
  ./node_modules/.bin/vitest run test/integration/host_id_fencing.test.ts
# expected: 7 tests PASS (recordDispatch/checkFencing/completeDispatch)
```

---

## Step 8: 6+1 host heartbeat + worker_pool 落地

```bash
# Admin 端 (在 newvps):
sqlite3 /data/worker_pool.db "SELECT host, COUNT(*) AS workers, MAX(last_heartbeat_at) AS last_seen FROM workers GROUP BY host ORDER BY host"
# expected: 6 rows (newvps + edge[1-5]) + MacBook row (post U8) — total 7 host rows,
# last_seen 在最近 30s 内 (heartbeat 频率 default 10s)
```

---

## Troubleshooting (6 项)

| 症状 | 原因 | 修法 |
|------|------|------|
| `harness-edge[1-5] not in tailnet` | Tailscale auth 失败 | 重跑 Step 1 + tailscale login |
| `tag:edge not applied` | admin 没在 console 批准 tag | https://login.tailscale.com/admin/machines → Edit → Approve tags |
| `connection refused :4001` from newvps to edge | ACL 拒 OR wrapper 未 up | `tailscale acl test` + `docker ps` on edge |
| ACL push 误锁 owner | `tagOwners` 段 owner 错位 | 确认 `tagOwners.tag:macbook: [cscoheru]` + push 前 `tailscale acl test --json` |
| Funnel 404 | Funnel 没设 | `tailscale serve --yaml=deploy/tailscale-funnel-6host.yaml` |
| Wrapper restart loop | kernel 不可达 | 验证 `curl http://newvps:8000/health` 在 edge 上可达 (Tailscale 直连 OR ACL) |

---

*U9 5 edge host 真 provision + ACL sync checklist — 8 步骤 + 6 troubleshooting 项 — 5 VPS × 10-15 分钟/host = 50-75 分钟总计*