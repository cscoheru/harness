# T-M2-QA-1 — Test Plan: 6 host + STT + Web Push E2E

> **Task ID**: T-M2-QA-1
> **Date**: 2026-09-02
> **Role**: QA
> **Stage**: v1.1 M2
> **Status**: DRAFT — execution gated on T-M2-BE-1/TG-1/DO-1 commit
> **Co-Authored-By**: Claude Code <noreply@anthropic.com>

---

## §1 Scope

This test plan covers 4 integration test files + 2 report documents produced by T-M2-QA-1:

| File | Lines | Run Gate | Test Cases |
|------|-------|----------|------------|
| `6host_e2e.test.ts` | ~250 | `RUN_6HOST_E2E=1` | 6 hosts × 7 sections = 21 cases |
| `stt_e2e.test.ts` | ~200 | `RUN_STT_E2E=1` | 4 sections × 2-3 cases = 10 cases |
| `webpush_e2e.test.ts` | ~220 | `RUN_WEBPUSH_E2E=1` | 6 sections × 2-4 cases = 14 cases |
| `dsh_6host.test.ts` | ~180 | `RUN_DSH_6HOST=1` | 6 sections × 2-5 cases = 15 cases |

**Total**: ~850 lines, 4 files, ~60 test cases.

---

## §2 6 host Funnel E2E Test Cases (`6host_e2e.test.ts`)

### §2.1 §1 — Funnel Health Check
| # | Test | Host | Expected |
|---|------|------|----------|
| 1 | GET `/health` → HTTP 2xx | harness-newvps | 200-299 |
| 2 | GET `/health` → HTTP 2xx | harness-edge1 | 200-299 |
| 3 | GET `/health` → HTTP 2xx | harness-edge2 | 200-299 |
| 4 | GET `/health` → HTTP 2xx | harness-edge3 | 200-299 |
| 5 | GET `/health` → HTTP 2xx | harness-edge4 | 200-299 |
| 6 | GET `/health` → HTTP 2xx | harness-edge5 | 200-299 |

### §2.2 §2 — Response Shape
| # | Test | Expected |
|---|------|----------|
| 7-12 | Each host `/health` returns JSON with status indicator | `status` or `ok` or `up` field present |

### §2.3 §3 — Orchestrator Round-trip
| # | Test | SLO |
|---|------|-----|
| 13 | POST `/api/orch` with simple prompt → non-empty completion | < 120s |

### §2.4 §4 — Worker Round-robin
| # | Test | SLO |
|---|------|-----|
| 14 | 5 worker dispatches land on 5 different edges | < 60s each |

### §2.5 §5 — STT Capability Restriction
| # | Test | Expected |
|---|------|----------|
| 15 | Primary (newvps) has `/stt` endpoint | Not 404 |
| 16 | Edge host rejects STT | 4xx or redirect |

### §2.6 §6 — Web Push Capability Restriction
| # | Test | Expected |
|---|------|----------|
| 17 | Primary (newvps) has `/push` endpoint | Not 404 |
| 18 | Edge host rejects Web Push | 4xx |

### §2.7 §7 — MagicDNS Hygiene
| # | Test | Expected |
|---|------|----------|
| 19 | All Funnel URLs use MagicDNS suffix | No IP literal |
| 20 | At least 6 Funnel URLs in host table | >= 6 |

---

## §3 STT E2E Test Cases (`stt_e2e.test.ts`)

### §3.1 §1 — Hygiene: no disk paths
| # | Test | Expected |
|---|------|----------|
| 21 | `whisper_stt.ts` source: no `/tmp/audio` or `/var/tmp/audio` | 0 matches |
| 22 | `whisper_stt.ts` source: contains `/dev/shm` reference | Present |
| 23 | `WHISPER_MODEL_PATH` enforced as absolute path | Throws on relative |

### §3.2 §2 — Latency SLO
| # | Test | SLO |
|---|------|-----|
| 24 | `transcribeStream` 1s audio → complete | < 3s |
| 25 | `SttResult` shape: `text`, `wallMs`, `host` fields | All present |

### §3.3 §3 — Privacy: no disk persistence
| # | Test | Expected |
|---|------|----------|
| 26 | No audio file created in `/tmp` during transcription | 0 new audio files |
| 27 | `/dev/shm` available and writable | Is directory |

### §3.4 §4 — Error handling
| # | Test | Expected |
|---|------|----------|
| 28 | Missing `WHISPER_MODEL_PATH` → throws | Error |
| 29 | Relative `WHISPER_MODEL_PATH` → throws | Error |

---

## §4 Web Push E2E Test Cases (`webpush_e2e.test.ts`)

### §4.1 §1 — Hygiene: no hardcoded VAPID key
| # | Test | Expected |
|---|------|----------|
| 30 | `webpush_gateway.ts`: no hardcoded VAPID private key | 0 matches |
| 31 | `VAPID_PRIVATE_KEY` read from `process.env` only | Present in source |
| 32 | VAPID public key safe to include in source | Present in source |

### §4.2 §2 — Endpoint whitelist (4 providers)
| # | Test | Expected |
|---|------|----------|
| 33 | FCM (`fcm.googleapis.com`) in whitelist | Detected as `fcm` |
| 34 | Mozilla (`updates.push.services.mozilla.com`) in whitelist | Detected as `mozilla` |
| 35 | WNS (`wns.windows-push.com`) in whitelist | Detected as `wns` |
| 36 | APNs (`api.push.apple.com`) in whitelist | Detected as `apns` |
| 37-38 | All 4 domains in source | All present |

### §4.3 §3 — Blacklist: unknown domains rejected
| # | Test | Expected |
|---|------|----------|
| 39-41 | Malicious endpoints rejected | `detectProvider` returns null |
| 42 | `normalizeSubscription` throws for unknown endpoint | Error |

### §4.4 §4 — VAPID signing
| # | Test | Expected |
|---|------|----------|
| 43 | `checkPushHealth` returns key availability | Boolean fields |
| 44 | Missing `VAPID_PRIVATE_KEY` → throws | Error |
| 45 | Missing `p256dh` or `auth` key → throws | Error |

### §4.5 §5 — Delivery
| # | Test | Expected |
|---|------|----------|
| 46 | `sendPush` returns `PushResult` shape | All fields present |
| 47 | `sendBroadcast` returns array of results | Length 2 |

### §4.6 §6 — VAPID signing latency
| # | Test | SLO |
|---|------|-----|
| 48 | VAPID signing avg < 2s (5 iterations) | < 2000ms |

---

## §5 dsh 6 host Test Cases (`dsh_6host.test.ts`)

### §5.1 §1 — MagicDNS routing topology
| # | Test | Expected |
|---|------|----------|
| 49 | `PRIMARY_HOST` is `harness-newvps` | Equal |
| 50 | `EDGE_HOSTS` has 5 entries | Length 5 |
| 51 | `buildHostFqdn` correct | `harness-newvps.tail1b9878.ts.net` |
| 52 | `listAllHostFqdns` returns 6 | Length 6 |
| 53 | No hardcoded IPs in `6host_client.ts` | 0 matches |

### §5.2 §2 — Host selection logic
| # | Test | Expected |
|---|------|----------|
| 54 | `selectHost('orch')` → primary | `harness-newvps` |
| 55 | `selectHost('commander')` → primary | `harness-newvps` |
| 56 | `selectHost('worker')` → edge | In EDGE_HOSTS |
| 57 | 5 worker calls → 5 different edges | Unique size = 5 |
| 58 | `getCurrentEdgeHost` returns valid edge | In EDGE_HOSTS |

### §5.3 §3 — Orch tier real call
| # | Test | SLO |
|---|------|-----|
| 59 | `callDsh6Host[orch]` exit 0 + non-empty | < 300s |

### §5.4 §4 — Commander tier real call
| # | Test | SLO |
|---|------|-----|
| 60 | `callDsh6Host[commander]` exit 0 + non-empty | < 180s |

### §5.5 §5 — Worker tier round-robin
| # | Test | SLO |
|---|------|-----|
| 61 | 5 `callDsh6Host[worker]` → 5 unique edges, all exit 0 | < 60s each |

### §5.6 §6 — dsh `--profile headless` enforcement
| # | Test | Expected |
|---|------|----------|
| 62 | `6host_client.ts` uses `--profile headless` | Present |
| 63 | `6host_client.ts` does NOT use `profile:web` | 0 matches |

---

## §6 Run Instructions

```bash
# Pre-req: set env vars (never commit these)
export DEEPSEEK_API_KEY=sk-...          # DeepSeek API key
export TAILSCALE_MAGIC_DNS_SUFFIX=tail1b9878.ts.net
export VAPID_PRIVATE_KEY=...            # Web Push private key
export VAPID_PUBLIC_KEY=...              # Web Push public key
export VAPID_SUBJECT=mailto:admin@...
export WHISPER_HOST=harness-newvps
export WHISPER_MODEL_PATH=/opt/harness/models/whisper-base.en.bin

# Run each suite independently
RUN_6HOST_E2E=1 npx vitest run wrapper/test/integration/6host_e2e.test.ts
RUN_STT_E2E=1 npx vitest run wrapper/test/integration/stt_e2e.test.ts
RUN_WEBPUSH_E2E=1 npx vitest run wrapper/test/integration/webpush_e2e.test.ts
RUN_DSH_6HOST=1 npx vitest run wrapper/test/integration/dsh_6host.test.ts

# Or run all at once
RUN_6HOST_E2E=1 RUN_STT_E2E=1 RUN_WEBPUSH_E2E=1 RUN_DSH_6HOST=1 npx vitest run wrapper/test/integration/
```

---

## §7 iPhone Safari E2E: 6 Funnel 4-Step Test Plan

> For user to execute manually on physical iPhone with Safari.

### §7.1 Preconditions
- iPhone connected via Shadowrocket VPN to access Tailscale Funnel URLs
- User logged into fish-harness at `https://harness-newvps.tail1b9878.ts.net/`
- 24 screenshots taken: 6 hosts × 4 steps

### §7.2 4-Step Test per Host

| Step | Action | Expected Result | Screenshot |
|------|--------|----------------|------------|
| 1 | Navigate to `https://harness-{host}.tail1b9878.ts.net/` | Login page or dashboard | step1-`{host}`-home.png |
| 2 | Complete authentication | User info visible | step2-`{host}`-auth.png |
| 3 | Submit a task (e.g., "What is 2+2?") | Completion visible | step3-`{host}`-task.png |
| 4 | Check notification badge | Badge count visible | step4-`{host}`-notify.png |

### §7.3 Hosts to Test
- harness-newvps (primary)
- harness-edge1, harness-edge2, harness-edge3, harness-edge4, harness-edge5 (edges)

### §7.4 Evidence Archiving
```
docs/reports/T-M2-QA-1-iPhone-E2E-evidence/
  newvps/
    step1-newvps-home.png
    step2-newvps-auth.png
    step3-newvps-task.png
    step4-newvps-notify.png
  edge1/
    step1-edge1-home.png
    ...
```

---

## §8 Hygiene Gates (verbatim grep patterns)

These are the automated hygiene checks embedded in the test files:

```bash
# H1: No model names (Fable 5 / GLM 5.3 / MiniMax-M3)
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" \
  wrapper/test/integration/6host_e2e.test.ts \
  wrapper/test/integration/stt_e2e.test.ts \
  wrapper/test/integration/webpush_e2e.test.ts \
  wrapper/test/integration/dsh_6host.test.ts | wc -l
# Expected: 0

# H2: No full API keys (sk-32+)
grep -rE "sk-[a-z0-9]{32,}" wrapper/test/integration/ | wc -l
# Expected: 0

# H3: No hardcoded VAPID private key
grep -rE "VAPID_PRIVATE_KEY\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}" \
  wrapper/test/integration/ | wc -l
# Expected: 0

# H4: No /tmp/audio or /var/tmp/audio
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/test/integration/stt_e2e.test.ts | wc -l
# Expected: 0

# H5: No hardcoded container IPs (excluding 127.0.0.1)
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" \
  wrapper/test/integration/ | grep -v "127.0.0.1" | wc -l
# Expected: 0

# H6: At least 6 Funnel URLs
grep -rE "https://[a-z-]+\.tail[a-z0-9]+\.ts\.net/" \
  wrapper/test/integration/6host_e2e.test.ts | wc -l
# Expected: >= 6

# H7: 4 push service endpoint domains
grep -rE "fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|wns\.windows-push\.com|api\.push\.apple\.com" \
  wrapper/test/integration/webpush_e2e.test.ts | wc -l
# Expected: >= 4

# H8: v1.0 runtime unchanged
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# Expected: 0
```

---

*End of T-M2-QA-1 Test Plan*
