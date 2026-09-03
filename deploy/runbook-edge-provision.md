# deploy/runbook-edge-provision.md — fish-harness 5 edge hosts provision runbook
#
# v1.1.1 cycle scope: this runbook is the **draft** for the 5 edge host provision.
# Real provisioning is **v1.1.1.1+** scope and is executed by the operator (user)
# who holds the Tailscale auth key, VPS provisioning credentials, and DEPLOY rights.
#
# Cycle status:
#   - v1.1.1 commits the compose templates + ACL + env example (this runbook is the prose)
#   - v1.1.1.1+ operator runs §3 per-edge-host checklists on real VPS instances
#
# Why this is a draft:
#   - agent cannot provision VPS, hold Tailscale auth keys, or SSH into fresh nodes
#   - 5 edge hosts × Tailscale Funnel × Docker Compose = operator-owned execution
#   - All edge compose files exist but are placeholders until operator provisions
#
# References:
#   - PRD-v1.1 §3 M2: 6-host distributed (1 newvps + 5 edge)
#   - PRD-v1.1 §4.1: Tailscale-only (no Basic Auth)
#   - codex-audit-scope-v1.1.1-v0.7 §4.5: edge compose + tag:harness-edge 守门

---

## §1 前置条件 (operator must hold)

| Item | Where obtained | Format | Notes |
|------|---------------|--------|-------|
| Tailscale account | https://login.tailscale.com | account | Admin role on the fish-harness tailnet |
| Tailscale auth key | https://login.tailscale.com/admin/settings/keys | `tskey-auth-…` | **Reusable=true** to batch-provision 5 hosts |
| 5× VPS instances | Provider of choice (Hetzner / DO / Vultr / aliyun) | Ubuntu 22.04 LTS, ≥1 GB RAM, ≥10 GB disk | One per region (east-1 / west-1 / asia-1 / eu-1 / sa-1) |
| DEEPSEEK_API_KEY | DeepSeek dashboard | sk-… | **Same** key as newvps; env-inject only |
| VAPID_PUBLIC_KEY | `deploy/vapid_public.key` (committed) | base64url | Edge hosts don't need the private key |
| MagicDNS suffix | Tailscale admin console | `tail1b9878.ts.net` | Verify under DNS tab |

**Forbidden on edge hosts**:
- ❌ STT worker (whisper.cpp) — newvps only
- ❌ Web Push gateway (VAPID private key) — newvps only
- ❌ v1.0 harness kernel — newvps only
- ❌ DEEPSEEK_API_KEY hardcoded anywhere — env-inject only

---

## §2 5 步骤 (applies to each of the 5 edge hosts)

### Step 1 — VPS 采购
- Provision 1× Ubuntu 22.04 LTS VPS per region
- Minimum spec: 1 vCPU / 1 GB RAM / 10 GB disk (wrapper only)
- Note the public IP — needed for Tailscale node bring-up

### Step 2 — Tailscale 节点加入
On each fresh VPS, as root:

```bash
# Install Tailscale (Ubuntu)
curl -fsSL https://tailscale.com/install.sh | sh

# Bring up Tailscale with the harness-edge tag (reusable auth key from §1)
tailscale up --authkey="${TAILSCALE_AUTHKEY}" \
             --hostname="harness-edge<N>" \
             --advertise-tags="tag:harness-edge" \
             --accept-routes

# Verify
tailscale status
tailscale ping harness-newvps
```

After this step, the host is visible in the Tailscale admin console with the `harness-edge` tag.

### Step 3 — Tailscale Funnel 配置
On each edge host, expose port 4001 to the public internet via Tailscale Funnel:

```bash
# Enable Funnel on the wrapper port (4001 per compose template)
tailscale funnel --bg 4001

# Verify
tailscale funnel status
# Expected:
#   https://harness-edge<N>.tail1b9878.ts.net (Funnel on port 4001)
```

Repeat for each of the 5 hosts (edge1..5). Each host exposes its OWN port 4001 via Funnel; the MagicDNS name disambiguates.

### Step 4 — Docker Compose 部署
On each edge host:

```bash
# Install Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Clone the fish-harness repo (or sync /opt/fish-harness from newvps)
git clone https://github.com/cscoheru/harness.git /opt/fish-harness
cd /opt/fish-harness
git checkout v1.1.1

# Stage the env file (per §1; per-host values)
cp env/edge-host.env.example /etc/fish-harness/edge-host.env
chmod 600 /etc/fish-harness/edge-host.env
# Edit /etc/fish-harness/edge-host.env:
#   - TAILSCALE_AUTHKEY=tskey-auth-…
#   - DEEPSEEK_API_KEY=sk-…
#   - WORKER_ID=edge<N>-wrapper
#   - EDGE_REGION=east-1 (or whatever the host's region is)

# Build the wrapper (one-time, on each host)
cd /opt/fish-harness/wrapper
npm ci
./node_modules/.bin/tsc   # produces build/

# Start the edge container
docker compose --env-file /etc/fish-harness/edge-host.env \
               -f deploy/6host-compose.edge<N>.yml \
               up -d

# Verify
docker compose -f deploy/6host-compose.edge<N>.yml ps
# Expected: harness-edge<N>-wrapper ... Up
```

### Step 5 — 验证
On each edge host:

```bash
# Local health
curl -s http://localhost:4001/health
# Expected: {"status":"ok","version":"0.0.0-stub"} (or real kernel response)

# Cross-host routing (from edge to newvps)
curl -s http://harness-newvps.tail1b9878.ts.net:8000/health
# Expected: kernel health response

# Funnel HTTPS entrypoint (from outside Tailscale)
curl -s https://harness-edge<N>.tail1b9878.ts.net/health
# Expected: wrapper health response

# Funnel SPA fallback
curl -s -o /dev/null -w "%{http_code}\n" https://harness-edge<N>.tail1b9878.ts.net/
# Expected: 200 (HTML shell)
```

If any step fails, see §5 故障排除.

---

## §3 每个 edge host 独立小节

| Host | EDGE_REGION | container_name | WRAPPER_PORT | Funnel URL |
|------|-------------|----------------|--------------|------------|
| edge1 | east-1 | harness-edge1-wrapper | 4001 | https://harness-edge1.tail1b9878.ts.net |
| edge2 | west-1 | harness-edge2-wrapper | 4001 | https://harness-edge2.tail1b9878.ts.net |
| edge3 | asia-1 | harness-edge3-wrapper | 4001 | https://harness-edge3.tail1b9878.ts.net |
| edge4 | eu-1 | harness-edge4-wrapper | 4001 | https://harness-edge4.tail1b9878.ts.net |
| edge5 | sa-1 | harness-edge5-wrapper | 4001 | https://harness-edge5.tail1b9878.ts.net |

All 5 hosts share the same `wrapper/build/server.js` binary (built once, deployed 5×).

---

## §4 验证清单 (post-provision, all 5 hosts)

```bash
# From newvps, verify MagicDNS resolves all 5 edge hosts
for n in 1 2 3 4 5; do
  echo -n "harness-edge${n}.tail1b9878.ts.net → "
  getent hosts harness-edge${n}.tail1b9878.ts.net || echo "UNRESOLVED"
done

# From any host, verify Funnel HTTPS is reachable (5 separate URLs)
for n in 1 2 3 4 5; do
  curl -s -o /dev/null -w "https://harness-edge${n}.tail1b9878.ts.net/health → %{http_code}\n" \
    https://harness-edge${n}.tail1b9878.ts.net/health
done
# Expected: 5 lines, each "200"

# Verify the 6 orchestration endpoints respond on the Funnel URL
for path in / /health /api/v1/status/test /api/v1/worker/heartbeat; do
  curl -s -o /dev/null -w "edge1 ${path} → %{http_code}\n" \
    https://harness-edge1.tail1b9878.ts.net${path}
done
# Expected: 4 lines, each "200"
```

---

## §5 故障排除

### Symptom: `tailscale up` fails with "auth key not found"
**Cause**: Auth key revoked or expired.
**Fix**: Generate a new reusable auth key at https://login.tailscale.com/admin/settings/keys.

### Symptom: `docker compose up` fails with "bind: address already in use"
**Cause**: Port 4001 is held by another process (often a stale container).
**Fix**: `docker ps -a | grep 4001` → `docker rm -f <container>` → retry.

### Symptom: `curl ... /health` returns connection refused
**Cause**: Wrapper container crashed or `node build/server.js` exited.
**Fix**: `docker compose logs harness-edge<N>-wrapper` → look for "WHISPER_MODEL_PATH env var is required" or TypeScript errors.

### Symptom: Cross-host routing fails (edge can't reach newvps)
**Cause**: Tailscale ACL missing tag:harness-edge entry (see deploy/tailscale-acl.yaml).
**Fix**: Verify `tagOwners.tag:harness-edge` includes `cscoheru`; verify `acls[*].src` includes `"tag:harness-edge"`.

### Symptom: Funnel HTTPS returns 502 Bad Gateway
**Cause**: `tailscale funnel --bg 4001` not run on the edge host, OR wrapper not listening on 4001.
**Fix**: `tailscale funnel status` on the edge host → if port 4001 not in list, rerun `tailscale funnel --bg 4001`.

### Symptom: `dsh --version` exits "command not found" on edge host
**Cause**: install-dsh.sh was not run on the edge host (or DSH_URL was wrong).
**Fix**: `DSH_VERSION=v1.0.0 DSH_URL=https://... bash < deploy/install-dsh.sh` on the edge host.

---

## §6 Rollback (per host)

```bash
# Stop and remove
docker compose -f deploy/6host-compose.edge<N>.yml down

# Disable Funnel
tailscale funnel --off 4001

# Remove Tailscale node from admin console (UI):
#   https://login.tailscale.com/admin/machines → select harness-edge<N> → Remove
```

---

*Runbook drafted (v1.1.1, 2026-09-03) — operator runs §2 per-edge-host checklists in v1.1.1.1+ cycle. Agent cannot provision VPS or hold Tailscale auth keys.*