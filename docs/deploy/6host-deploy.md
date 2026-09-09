# docs/deploy/6host-deploy.md — fish-harness 6-host deploy operator guide
#
# v1.2.0e.1 NEW: Network setup + Edge webhook setup sections.
# This is the cross-cutting operator guide that complements
# runbook-edge-provision.md (per-host checklist) and the per-stack
# compose files in deploy/.
#
# Cycle status: v1.2.0e.1 (post v1.2.0d.4 closure @ `73f97fc`).
# The 3 sections in this file MUST be applied BEFORE bringing up
# the newvps wrapper compose or the monitoring compose, otherwise
# prometheus cannot reach the wrappers and the worker_offline alert
# will fire forever.

---

## §1 Network setup — shared external bridge `deploy_harness_net`

### §1.1 Why a shared network (per D3 + F43)

The `deploy/6host-compose.newvps.yml` and `deploy/monitoring/docker-compose.yml`
compose files run as **independent Docker Compose projects**. Each project
creates its own local bridge by default, so:

- prometheus in monitoring_net cannot DNS-resolve wrapper containers
- scrape targets fail with "no such host"
- /metrics is unreachable across stacks

The fix: one shared **external** bridge `deploy_harness_net` that BOTH
compose projects join via `external: true`. Network-level routing
resolves by container name across both stacks.

### §1.2 One-time host setup

Run ONCE on the newvps host before bringing up either stack:

```bash
# Prereq: docker-compose plugin installed (apt install docker-compose-plugin)
ssh newvps 'docker network create --driver bridge deploy_harness_net'
# Verify:
ssh newvps 'docker network ls | grep deploy_harness_net'
# Should print 1 line.
```

If the network already exists, the `create` command errors with
"network with name deploy_harness_net already exists". That is fine
— the network is still usable. To make the deploy script idempotent,
the recommended pre-flight check is:

```bash
ssh newvps 'docker network inspect deploy_harness_net >/dev/null 2>&1 \
  || docker network create --driver bridge deploy_harness_net'
```

### §1.3 Compose wiring (already applied in this commit)

- `deploy/6host-compose.newvps.yml` line ~274: `harness_net:` →
  `name: deploy_harness_net` + `external: true`
- `deploy/monitoring/docker-compose.yml` line ~28: prometheus service
  networks: `deploy_harness_net:` (with `aliases: [prometheus]`); the
  top-level `monitoring_net:` is replaced by an `external: true`
  reference to the same shared bridge.

### §1.4 Verify cross-stack reachability

After bringing up both stacks:

```bash
# newvps wrapper metrics should be reachable from prometheus container:
ssh newvps 'docker exec fish-harness-prometheus \
  wget -qO- http://wrapper-orchestrator:4000/metrics | grep -E "^worker_count|^memory_used"'
# Expect: 2 lines (worker_count, memory_used_mb) with non-zero values
# after a wrapper has registered via heartbeat_sender.

# Or from the host:
ssh newvps 'curl -s http://newvps.fish-harness.ts.net:4000/metrics | grep ^worker_count'
# Expect: worker_count <number> >= 1 (after edges register)
```

### §1.5 Tailscale ACL port fix (per D4 + F44)

`deploy/tailscale-acl-6host.yaml` line ~108: changed scrape port from
`3000` (stale v1.1 era) to `4000-4003` (matches current wrapper ports).
ACL was blocking all scrape traffic — applying this is mandatory.

After editing, push the ACL to Tailscale:

```bash
# Tailscale admin → Access Controls → paste file contents → Save
# OR via CLI:
ssh newvps 'tailscale acl set < deploy/tailscale-acl-6host.yaml'
```

Verify:

```bash
# Prometheus should now show 7 jobs up (1 newvps + 5 edge + 1 commander):
curl -s 'http://newvps.fish-harness.ts.net:9090/api/v1/targets?state=active' \
  | jq '.data.activeTargets | length'
# Expect: >= 7
```

---

## §2 Edge webhook setup — GitHub webhook → edge git pull + compose reload

### §2.1 Why (per D5 + D6 + F45)

The 5 edge hosts use `image: node:24-slim` + bind-mount `..:/app:ro`
(per `deploy/6host-compose.edge[1-5].yml`). Without an automated
update path, the edge host runs whatever was on the host when the
container was first created — observed edge1=puer-hk still running
v1.2.0b HEAD 57dae79 while main is at v1.2.0d.4 `73f97fc`. This
was the root cause of the 2026-09-09 puer-hk restart-loop emergency
(see `wrapper/orchestrator/heartbeat_sender.ts` L7 fix).

The webhook receiver pulls main on `v*` tag events and rebuilds +
reloads the edge container.

### §2.2 Per-host secret install (D6 + L8 mitigation)

Run ONCE per edge host (replace `<host>` with the edge name):

```bash
# On the edge host:
ssh <host> 'bash /opt/fish-harness/wrapper/deploy/edge-webhook/install.sh'
# The script:
#   1. Generates 32-byte random secret → writes /etc/edge-webhook.env
#   2. Installs systemd unit `edge-webhook.service`
#   3. Starts the receiver on 127.0.0.1:7777
#   4. Prints the secret to stdout — copy this to GitHub secrets
```

Then add the per-host secret to GitHub:

```bash
# GitHub repo → Settings → Secrets and variables → Actions → New repository secret
# Name: EDGE_WEBHOOK_SECRET_<host>  (e.g. EDGE_WEBHOOK_SECRET_edge1)
# Value: <32-byte random secret from install.sh output>
```

### §2.3 Wire Tailscale Funnel to expose :7777

The edge webhook is bound to 127.0.0.1 only. To receive GitHub
webhook POSTs, expose :7777 via Tailscale Funnel (per-host):

```bash
ssh <host> 'tailscale serve --bg --set-path=/webhook --https=443 \
  --http-to-local-port=7777'
# OR for full public Funnel (read-only repo, no secrets):
ssh <host> 'tailscale funnel --bg --set-path=/webhook --https=443 \
  http://127.0.0.1:7777'
```

Note: GitHub webhook URLs are HTTPS public, so Funnel is required
(not just serve). Tailscale Funnel ACL (per `deploy/tailscale-funnel-6host.yaml`)
must allow the webhook path.

### §2.4 CI workflow trigger (per `.github/workflows/deploy.yml`)

The `notify-edge` job runs after `build-and-push` on `v*` tags and
POSTs to each edge's webhook in parallel:

```yaml
notify-edge:
  needs: build-and-push
  if: startsWith(github.ref, 'refs/tags/v')
  strategy:
    matrix:
      host: [edge1, edge2, edge3, edge4, edge5]
  steps:
    - name: POST webhook to ${{ matrix.host }}
      run: |
        SECRET="${{ secrets[format('EDGE_WEBHOOK_SECRET_{0}', matrix.host) }}"
        BODY="{\"ref\":\"${{ github.ref_name }}\",\"commit\":\"${{ github.sha }}\"}"
        HMAC=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex \
          | awk '{print $2}')
        curl -fsS -X POST "https://edge-${{ matrix.host }}.fish-harness.ts.net/webhook" \
          -H "content-type: application/json" \
          -H "X-Hub-Signature-256: sha256=$HMAC" \
          -d "$BODY"
```

### §2.5 Verify webhook end-to-end

```bash
# Replay a webhook payload with the correct HMAC:
SECRET="$(ssh edge1 'cat /etc/edge-webhook.env | cut -d= -f2')"
BODY='{"ref":"v1.2.0e.1","commit":"manual-test"}'
HMAC=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex \
  | awk '{print $2}')
curl -i -X POST 'https://edge1.fish-harness.ts.net/webhook' \
  -H 'content-type: application/json' \
  -H "X-Hub-Signature-256: sha256=$HMAC" \
  -d "$BODY"
# Expect: HTTP/1.1 200 OK, body {"ok":true,"commit":"manual-test",...}

# Wrong signature → 401 (no reload happens):
curl -i -X POST 'https://edge1.fish-harness.ts.net/webhook' \
  -H 'X-Hub-Signature-256: sha256=deadbeef' -d "$BODY"
# Expect: HTTP/1.1 401 Unauthorized
```

### §2.6 Audit + rollback

```bash
# Webhook receiver logs (systemd journal):
ssh <host> 'journalctl -u edge-webhook -n 50 --no-pager'

# Recent git pulls on edge host:
ssh <host> 'cd /opt/fish-harness && git log --oneline -5'

# Container health after reload:
ssh <host> 'docker ps --filter name=harness-edge<host>-wrapper \
  --format "{{.Names}} {{.Status}}"'
# Expect: Up X minutes (healthy)
```

---

## §3 DNS fallback (per D7)

All 5 edge compose files now declare:
```yaml
    dns:
      - 100.100.100.100   # Tailscale MagicDNS
      - 1.1.1.1           # public fallback (DeepSeek API, etc.)
      - 8.8.8.8           # public fallback
```

This matches the `newvps-compose.yml` wrapper pattern. Without the
public fallbacks, containers can resolve `*.fish-harness.ts.net`
(tailnet) but fail on `api.deepseek.com` (D16 direct HTTP call) and
other public domains.

---

## §4 References

- v1.2.0d.4 EXEC closure: `notes/codex-audit-scope-v1.2.0d.4-v0.1*.md`
- v1.2.0e.1 EXEC: `notes/codex-audit-scope-v1.2.0e.1-v0.1*.md`
- Edge provision draft: `deploy/runbook-edge-provision.md`
- Tailscale ACL: `deploy/tailscale-acl-6host.yaml`
- Compose templates: `deploy/6host-compose.{newvps,edge[1-5]}.yml`
- Monitoring stack: `deploy/monitoring/docker-compose.yml`
