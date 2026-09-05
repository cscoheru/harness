# fish-harness monitoring alert runbook (v1.2.0d, per D9 + F24 + §5.3)
#
# Escalation policy (per §5.3):
#   - alert fires → 15min acknowledge window
#   - if not ack → 30min resolve window
#   - if not resolved → page owner (cscoheru)
#
# Webhook: https://hooks.slack.com/services/<encrypted-in-env>/fish-harness-alerts
# (config in `deploy/monitoring/alertmanager.yml`, secret in Tailscale env)

---

## Alert 1: WrapperMemoryHigh

**Trigger**: `wrapper_memory_used_mb > 80% of mem_limit` for 5 minutes.

**Severity**: WARNING (1 occurrence) → CRITICAL (>3 occurrences in 30min)

**Diagnostic steps**:

1. Check current memory usage:
   ```bash
   ssh newvps 'docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" | grep -E "harness-"'
   ```

2. Identify which container is high:
   ```bash
   ssh newvps 'curl -s http://newvps.fish-harness.ts.net:3000/metrics | grep memory_used_mb'
   ```

3. Check dispatch load (queue depth + active tasks):
   ```bash
   ssh newvps 'curl -s http://newvps.fish-harness.ts.net:3000/metrics | grep -E "active_task_count|queue_depth"'
   ```

**Mitigation**:

| Cause | Action |
|-------|--------|
| High dispatch load (queue >50 active) | Expected, no action. If persistent >10min → scale workers or accept 429 throttling (per F26 backpressure) |
| Memory leak in wrapper | `docker restart <container>` (graceful SIGTERM 30s per F27) |
| Single large task hogging memory | Wait for task to complete; if stuck >5min → `docker kill <container>` (SIGKILL fallback) |
| Genuine need for more memory | Edit `deploy/*.yml` mem_limit + `docker compose up -d` (per D7 lock-in) |

**Escalation**: If memory >95% for >15min → page owner.

---

## Alert 2: QueueSaturated

**Trigger**: `queue_depth > 100` for 5 minutes.

**Severity**: WARNING (sustained load) → CRITICAL (>500 sustained 10min)

**Diagnostic steps**:

1. Check queue depth distribution across hosts:
   ```bash
   ssh newvps 'for host in newvps edge1 edge2 edge3 edge4 edge5 macbook; do
     curl -s http://${host}.fish-harness.ts.net:3000/metrics 2>/dev/null | grep queue_depth | head -1
   done'
   ```

2. Check worker count + active tasks:
   ```bash
   ssh newvps 'curl -s http://newvps.fish-harness.ts.net:3000/metrics | grep -E "worker_count|active_task_count"'
   ```

3. Check if dispatch rate is normal:
   ```bash
   ssh newvps 'grep -c "POST /api/v1/tasks" /var/log/harness/wrapper.log | tail -100'
   ```

**Mitigation**:

| Cause | Action |
|-------|--------|
| Dispatch rate spike | Expected if queue saturates → client should backoff (per F26 429 Retry-After: 30s) |
| Workers stuck (active task count not draining) | Check `worker_count` gauge; if low → restart workers per §9 |
| Workers crashed (no heartbeat) | Check `worker_offline` alert (Alert 3) |
| Genuine need for more workers | Scale edge compose: `ssh newvps docker compose -f deploy/6host-compose.edge[N].yml up -d` |

**Escalation**: If queue >500 for >30min → page owner.

---

## Alert 3: WorkerOffline

**Trigger**: `wrapper_worker_count = 0 for host` for 5 minutes.

**Severity**: CRITICAL (immediate)

**Diagnostic steps**:

1. Identify which host(s) are offline:
   ```bash
   ssh newvps 'for host in newvps edge1 edge2 edge3 edge4 edge5 macbook; do
     count=$(curl -sf http://${host}.fish-harness.ts.net:3000/metrics 2>/dev/null | grep "^worker_count " | awk "{print \$2}")
     echo "$host: worker_count=$count"
   done'
   ```

2. Check host Tailscale status:
   ```bash
   ssh newvps 'tailscale status | grep -E "(newvps|edge[1-5]|kjonemacbook-pro)"'
   ```

3. Check container status (per-host):
   ```bash
   # newvps:
   ssh newvps 'docker compose -f deploy/6host-compose.newvps.yml ps'

   # edge1 (via newvps, since edge hosts reachable via Tailscale):
   ssh newvps 'ssh edge1 "docker ps | grep harness"'
   ```

**Mitigation**:

| Cause | Action |
|-------|--------|
| Container crashed | `docker compose -f deploy/<compose>.yml up -d --force-recreate` |
| Host unreachable (Tailscale down) | Check host network; if host is up but Tailscale dropped → `tailscale up` |
| Host powered off | Wake host or accept degraded capacity until owner returns |
| MacBook asleep (per F15 + v1.2.0c graceful degradation) | `pmset -a disablesleep 0` or accept lower capacity during owner off-work hours |

**Escalation**: ALL workers offline >10min → CRITICAL page owner.

---

## Alert 4: HighDispatchLatency (optional, future)

**Trigger**: `rate(wrapper_dispatch_duration_seconds_sum[5m]) / rate(wrapper_dispatch_duration_seconds_count[5m]) > 60s`.

**Status**: NOT IMPLEMENTED in v1.2.0d. Deferred to v1.2.1+ (per plan §8.1 + §8.2).

---

## Maintenance

### Adding a new host

1. Update `deploy/monitoring/prometheus.yml` scrape_configs (new job)
2. Update `deploy/tailscale-acl-6host.yaml` (if new tag required)
3. `docker compose -f deploy/monitoring/prometheus.yml restart prometheus`
4. Verify: `curl -s http://newvps.fish-harness.ts.net:9090/targets` shows new host as `UP`

### Tailscale ACL verification (per F28 + R7)

```bash
# Test ACL syntax locally before push:
tailscale acl test --rules=deploy/tailscale-acl-6host.yaml

# Verify port 9090 only reachable from tag:admin:
tailscale acl check --src=tag:admin --dst=tag:monitor:9090
# Expected: allowed

tailscale acl check --src=tag:edge --dst=tag:monitor:9090
# Expected: denied (per F28 owner-only access)
```

### Reset alert silence

```bash
ssh newvps 'curl -X POST http://alertmanager.fish-harness.ts.net:9093/api/v1/silences -d \
  "{\"matchers\":[{\"name\":\"alertname\",\"value\":\"WrapperMemoryHigh\"}],\"startsAt\":\"now\",\"endsAt\":\"now+1h\",\"comment\":\"investigating\"}"'
```

---

## References

- Plan §5.3 — monitoring design (3 alert rules + 4 metric names)
- F24 — 7 host scrape (newvps + 5 edge + macbook)
- F25 — metrics.ts HTTP endpoint (not SQLite aggregate)
- F27 — `--stop-timeout=30` SIGTERM graceful drain
- F28 — Tailscale ACL tag:monitor + port 9090 owner-only
- D9 — Prometheus + alertmanager + Grafana stack decision
