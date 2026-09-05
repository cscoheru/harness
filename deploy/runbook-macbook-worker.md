# deploy/runbook-macbook-worker.md — MacBook Worker 接入 runbook (v1.2.0c)

> **Date**: 2026-09-05
> **Audience**: owner (cscoheru)
> **Time to provision**: 15-20 minutes
> **Prerequisites**: macOS 13+, Docker Desktop 4.x OR colima 0.6+, Tailscale 1.50+

## 1. Why MacBook worker (per PRD §3.1)

PRD §3.1 specifies "MacBook Pro M1 16G ⭐ 主力 worker — 你工作时段本地优先". v1.2.0c adds MacBook as the 7th host in the multi-host pool. During owner working hours (周一-周五 09:00-22:00 本地时间), MacBook scores +100 and is preferred for new dispatches. This is the "local-first, fallback to fleet" pattern that minimises Tailscale DERP round-trip latency.

## 2. Prerequisites (verify before proceeding)

```bash
# macOS version
sw_vers
# expected: ProductVersion: 13.x or later

# Tailscale status (must show tailnet connected)
tailscale status | head -5
# expected: cscoheru@...  tagged ...

# Docker runtime
docker --version
# expected: Docker version 24.x (Docker Desktop) OR colima 0.6+
```

## 3. Install Docker runtime (if missing)

### Option A — Docker Desktop (recommended for simplicity)

Download from <https://www.docker.com/products/docker-desktop/>. Default Linux VM is x86_64 → compatible with `node:24-slim` image.

### Option B — colima (lightweight, no Docker Desktop license)

```bash
# Install colima (Homebrew)
brew install colima

# Start colima with explicit x86_64 (avoid aarch64 Alpine ABI mismatch per F19)
colima start --vm-type=qemu --arch=x86_64 --cpu 4 --memory 8 --disk 60
# expected: colima started, docker context set to "colima"
```

> **Why `--vm-type=qemu --arch=x86_64`**: M1 Mac default colima is aarch64 alpine; some node modules (notably better-sqlite3 native bindings) may have ABI issues. x86_64 QEMU VM matches the newvps Linux runtime.

## 4. Join Tailscale tailnet with `tag:macbook`

```bash
# Authenticate (one-time)
tailscale up --advertise-tags=tag:macbook --hostname=kjonemacbook-pro
# expected: Success; kjonemacbook-pro.fish-harness.ts.net appears in tailnet

# Verify ACL sync (tag:macbook section must be in deploy/tailscale-acl-6host.yaml
# before this command; admin must `tailscale acl push` from newvps first)
tailscale status | grep kjonemacbook-pro
# expected: kjonemacbook-pro  user@...  linux  tags: tag:macbook  active
```

## 5. Prevent MacBook sleep during work hours

```bash
# Disable sleep when lid is closed (display sleep only)
pmset -a disablesleep 0

# Verify
pmset -g | grep -i sleep
# expected: Sleep Disabled in pmset output

# Re-enable later (after work)
# pmset -a disablesleep 1
```

## 6. Deploy MacBook worker container

```bash
cd /Users/kjonekong/projects/fish-harness

# Pull image (mirrors may need docker login first time)
docker compose -f deploy/macbook-compose.yml pull

# Start in detached mode
docker compose -f deploy/macbook-compose.yml up -d
# expected: harness-macbook-worker  Started

# Verify container status
docker ps | grep macbook
# expected: harness-macbook-worker  node:24-slim  Up X minutes

# Verify heartbeat sent to newvps (from MacBook side)
docker logs harness-macbook-worker 2>&1 | grep -E "heartbeat|register" | tail -5
# expected: "register OK worker_id=wrk-..." then periodic heartbeat lines
```

## 7. Cross-host verification (from newvps)

```bash
# SSH to newvps (NOT puer-hk — that's mail.rana.asia)
ssh newvps

# Verify MacBook reachable via MagicDNS
curl -i http://kjonemacbook-pro.fish-harness.ts.net:4001/health
# expected: HTTP/1.1 200 OK; {"status":"ok","version":"1.2.0c"}

# Verify heartbeat received in newvps worker_pool
sqlite3 /data/worker_pool.db "SELECT worker_id, host, last_heartbeat_at FROM workers WHERE host LIKE '%macbook%' ORDER BY last_heartbeat_at DESC LIMIT 5"
# expected: at least 1 row with host containing "macbook"
```

## 8. Verify scoring +100 in working hours

The `isWorkingHours()` helper in `wrapper/orchestrator/6host_router.ts` returns true when:
- Day of week: Monday (1) through Friday (5) per JS Date.getDay()
- Hour: 09:00 ≤ local hour ≤ 22:00 per JS Date.getHours()

To verify scoring takes effect:

```bash
# On MacBook, during working hours (e.g. Tue 10:00 local)
date  # confirm Tue 10:00

# Trigger a task from newvps orchestrator
ssh newvps "cd /opt/fish-harness/wrapper && curl -i -X POST http://localhost:4000/api/v1/tasks -d '{\"prompt\":\"test\",\"modelClass\":\"worker\"}' -H 'Content-Type: application/json'"
# expected: response indicates dispatched to macbook worker

# Check newvps logs for scoring trace
ssh newvps "docker logs harness-wrapper-orchestrator 2>&1 | grep -i 'macbook\|scoring' | tail -10"
# expected: log line "MacBook scoring +100 host=kjonemacbook-pro isWorkingHours=true"
```

## 9. Graceful degradation (laptop closed / asleep)

If the MacBook lid closes during dispatch, the heartbeat stops reaching newvps:

```bash
# After 3 failed heartbeats (default 10s interval → 30s window),
# newvps worker_pool marks the MacBook worker as 'stale' (status field)
# and reassigns in-flight dispatches to the next-best worker.

# Re-enable MacBook by:
#   1. Open the lid
#   2. tailscale status  (verify connected)
#   3. docker compose -f deploy/macbook-compose.yml up -d  (if container exited)
```

## 10. Teardown (if you want to remove MacBook worker)

```bash
cd /Users/kjonekong/projects/fish-harness
docker compose -f deploy/macbook-compose.yml down
# removes harness-macbook-worker container; image kept for re-provision

# Remove Tailscale tag (optional)
# tailscale set --advertise-tags=  # clears all tags
```

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `kjonemacbook-pro not in tailnet` | Tailscale not authenticated | Run step 4 again |
| `connection refused :4001` from newvps curl | Container not up OR ACL denies | `docker ps` then check `tailscale acl test` |
| `better-sqlite3 ABI mismatch` | aarch64 alpine colima | Re-create colima with `--vm-type=qemu --arch=x86_64` (step 3) |
| Heartbeats never reach newvps | Tailscale ACL `tag:macbook` missing | Confirm ACL has tag:macbook section; admin runs `tailscale acl push` |
| Scoring not +100 | Outside working hours | Verify `isWorkingHours()` conditions in step 8 |
| MacBook sleeps with lid closed | pmset not set | Re-run step 5 |

---

*MacBook worker runbook v1.2.0c — 11 步骤 + 6 troubleshooting 项；Tailscale tag:macbook + Docker Desktop/colima + scoring +100 working hours + graceful degradation 3 次心跳失败 reassign per PRD §3.1*