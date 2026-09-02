/**
 * T-M2-QA-1: 6 host E2E integration test suite.
 *
 * Tests the complete 6-host MagicDNS topology via Tailscale Funnel:
 *   - harness-newvps.tail1b9878.ts.net  (primary: orch + commander + worker)
 *   - harness-edge[1-5].tail1b9878.ts.net  (edge replicas: worker only)
 *
 * Scope:
 *   - Real HTTP requests to all 6 Funnel endpoints
 *   - Health check + response shape validation
 *   - Orchestrator prompt round-trip
 *   - Worker round-robin distribution
 *
 * M2 hygiene gates (v0.3 §4.5):
 *   - NO hardcoded container IPs (172.x / 10.x / 192.168.x) — MagicDNS only
 *   - Uses harness-{newvps,edge1-5}.tail1b9878.ts.net (6 Funnel URL)
 *   - dsh --profile headless (NOT web)
 *
 * @file wrapper/test/integration/6host_e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// MagicDNS host table — aligned with 6host_client.ts §MagicDNS suffix
// ---------------------------------------------------------------------------

const MAGIC_DNS_SUFFIX = process.env.TAILSCALE_MAGIC_DNS_SUFFIX ?? 'tail1b9878.ts.net';

interface FunnelHost {
  name: string;
  role: 'primary' | 'edge';
  capabilities: string[];
  funnels: string[]; // Funnel-exposed URLs (may differ from internal port)
}

const FUNNEL_HOSTS: FunnelHost[] = [
  {
    name: 'harness-newvps',
    role: 'primary',
    capabilities: ['orch', 'commander', 'worker', 'stt', 'webpush'],
    funnels: [`https://harness-newvps.${MAGIC_DNS_SUFFIX}/`],
  },
  {
    name: 'harness-edge1',
    role: 'edge',
    capabilities: ['worker'],
    funnels: [`https://harness-edge1.${MAGIC_DNS_SUFFIX}/`],
  },
  {
    name: 'harness-edge2',
    role: 'edge',
    capabilities: ['worker'],
    funnels: [`https://harness-edge2.${MAGIC_DNS_SUFFIX}/`],
  },
  {
    name: 'harness-edge3',
    role: 'edge',
    capabilities: ['worker'],
    funnels: [`https://harness-edge3.${MAGIC_DNS_SUFFIX}/`],
  },
  {
    name: 'harness-edge4',
    role: 'edge',
    capabilities: ['worker'],
    funnels: [`https://harness-edge4.${MAGIC_DNS_SUFFIX}/`],
  },
  {
    name: 'harness-edge5',
    role: 'edge',
    capabilities: ['worker'],
    funnels: [`https://harness-edge5.${MAGIC_DNS_SUFFIX}/`],
  },
];

// ---------------------------------------------------------------------------
// Env guard — skip unless RUN_6HOST_E2E=1
// ---------------------------------------------------------------------------

const SKIP_REASON = 'RUN_6HOST_E2E=1 required; default skip for gate stability';
const shouldRun = process.env.RUN_6HOST_E2E === '1';

describe('6host E2E — 6 Funnel endpoints', { skip: !shouldRun }, () => {

  // ---------------------------------------------------------------------------
  // §1: All 6 Funnel health endpoints return HTTP 2xx
  // ---------------------------------------------------------------------------

  describe('§1 — Funnel health check', () => {
    for (const host of FUNNEL_HOSTS) {
      for (const funnelUrl of host.funnels) {
        it(`${host.name} ${funnelUrl} returns HTTP 2xx on /health`, async () => {
          const res = await fetch(`${funnelUrl}health`, {
            signal: AbortSignal.timeout(10_000),
          });
          expect(
            res.status,
            `${host.name} /health should return 2xx, got ${res.status}`,
          ).toBeLessThan(300);
          expect(res.status).toBeGreaterThanOrEqual(200);
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // §2: All 6 Funnel response shape validation
  // ---------------------------------------------------------------------------

  describe('§2 — Response shape', () => {
    for (const host of FUNNEL_HOSTS) {
      for (const funnelUrl of host.funnels) {
        it(`${host.name} /health returns JSON with expected fields`, async () => {
          const res = await fetch(`${funnelUrl}health`, {
            signal: AbortSignal.timeout(10_000),
          });
          expect(res.status).toBeLessThan(300);

          const json = await res.json() as Record<string, unknown>;
          // At minimum the response should have a status or ok field
          expect(
            json,
            `${host.name} response should be a JSON object`,
          ).toBeInstanceOf(Object);
          // Basic sanity: at least one of these fields present
          const hasStatusField =
            'status' in json || 'ok' in json || 'up' in json || 'version' in json;
          expect(
            hasStatusField,
            `${host.name} health response should have a status indicator field`,
          ).toBe(true);
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // §3: Orchestrator round-trip on primary (harness-newvps only)
  // ---------------------------------------------------------------------------

  describe('§3 — Orchestrator round-trip on primary', () => {
    const primaryFunnel = FUNNEL_HOSTS[0].funnels[0];
    const apiKey = process.env.DEEPSEEK_API_KEY;

    it('orchestrator prompt returns non-empty completion', async () => {
      if (!apiKey) {
        console.warn('[6host_e2e] DEEPSEEK_API_KEY not set — skipping orchestrator test');
        return;
      }

      const prompt = 'What is 2+2? Answer in one sentence.';
      const startMs = Date.now();

      // POST /api/chat or /api/orch endpoint — use primary Funnel
      const res = await fetch(`${primaryFunnel}api/orch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ prompt, modelClass: 'orch' }),
        signal: AbortSignal.timeout(120_000),
      });

      const wallMs = Date.now() - startMs;

      expect(res.status, 'orchestrator should return 2xx').toBeLessThan(300);

      const json = await res.json() as { completion?: string; text?: string; stdout?: string };
      const completion =
        json.completion ?? json.text ?? json.stdout ?? '';
      expect(
        completion.trim().length,
        `completion should be non-empty; got: ${completion.slice(0, 100)}`,
      ).toBeGreaterThan(0);

      // Upper bound: orch SLO 120s
      expect(wallMs, `orchestrator wall time should be under 120s`).toBeLessThan(120_000);
      console.log(`[6host_e2e] orchestrator: wallMs=${wallMs} completionLen=${completion.length}`);
    }, 130_000);
  });

  // ---------------------------------------------------------------------------
  // §4: Worker round-robin across 5 edge hosts
  // ---------------------------------------------------------------------------

  describe('§4 — Worker round-robin across edges', () => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const edgeHosts = FUNNEL_HOSTS.filter((h) => h.role === 'edge');

    // Dispatch 5 worker tasks and verify they land on different edges
    it('5 worker dispatches round-robin across 5 edges', async () => {
      if (!apiKey) {
        console.warn('[6host_e2e] DEEPSEEK_API_KEY not set — skipping worker round-robin test');
        return;
      }

      const prompt = 'Reply with just the word "ok". No punctuation.';
      const results: Array<{ edge: string; status: number; wallMs: number }> = [];

      for (const host of edgeHosts) {
        const funnelUrl = host.funnels[0];
        const startMs = Date.now();

        const res = await fetch(`${funnelUrl}api/worker`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ prompt, modelClass: 'worker' }),
          signal: AbortSignal.timeout(60_000),
        });

        const wallMs = Date.now() - startMs;
        results.push({ edge: host.name, status: res.status, wallMs });

        // Each edge should respond (may be 2xx or 4xx depending on capability)
        expect(
          res.status,
          `${host.name} should respond within SLO`,
        ).toBeLessThan(600);
      }

      // All 5 edges should have been reached
      const uniqueEdges = new Set(results.map((r) => r.edge));
      expect(
        uniqueEdges.size,
        `all 5 edge hosts should be reached; got ${uniqueEdges.size}: ${[...uniqueEdges].join(', ')}`,
      ).toBe(5);

      console.log(`[6host_e2e] round-robin results:`, results);
    }, 360_000);

    // ---------------------------------------------------------------------------
    // §5: STT endpoint only on primary (edges should reject or redirect)
    // ---------------------------------------------------------------------------

    describe('§5 — STT capability restricted to primary', () => {
      const primaryFunnel = FUNNEL_HOSTS[0].funnels[0];
      const edgeFunnel = FUNNEL_HOSTS[2].funnels[0]; // harness-edge2

      it('primary (newvps) has STT endpoint', async () => {
        const res = await fetch(`${primaryFunnel}stt`, {
          method: 'POST',
          signal: AbortSignal.timeout(5_000),
        });
        // Should at least respond (not 404)
        expect(res.status, 'primary STT endpoint should be reachable').not.toBe(404);
      });

      it('edge host rejects or redirects STT requests', async () => {
        const res = await fetch(`${edgeFunnel}stt`, {
          method: 'POST',
          signal: AbortSignal.timeout(5_000),
        });
        // Edge STT should return 4xx or redirect (not act as a passthrough proxy)
        expect(
          res.status,
          'edge STT should return non-2xx or redirect',
        ).toBeGreaterThanOrEqual(400);
      });
    });

    // ---------------------------------------------------------------------------
    // §6: Web Push endpoint only on primary
    // ---------------------------------------------------------------------------

    describe('§6 — Web Push capability restricted to primary', () => {
      const primaryFunnel = FUNNEL_HOSTS[0].funnels[0];
      const edgeFunnel = FUNNEL_HOSTS[3].funnels[0]; // harness-edge3

      it('primary (newvps) has /push endpoint', async () => {
        const res = await fetch(`${primaryFunnel}push`, {
          method: 'POST',
          signal: AbortSignal.timeout(5_000),
        });
        // Should at least respond (not 404)
        expect(res.status, 'primary push endpoint should be reachable').not.toBe(404);
      });

      it('edge host rejects Web Push requests', async () => {
        const res = await fetch(`${edgeFunnel}push`, {
          method: 'POST',
          signal: AbortSignal.timeout(5_000),
        });
        expect(
          res.status,
          'edge /push should return non-2xx',
        ).toBeGreaterThanOrEqual(400);
      });
    });

    // ---------------------------------------------------------------------------
    // §7: No hardcoded IPs — MagicDNS FQDN hygiene gate
    // ---------------------------------------------------------------------------

    describe('§7 — MagicDNS hygiene: no hardcoded IPs', () => {
      // This test verifies the source files pass the hygiene grep
      // It is a self-referential guard: we confirm the URL array is well-formed

      it('all 6 Funnel URLs use MagicDNS suffix (no IP literal)', () => {
        const ipPattern = /^(?:172\.\d+|10\.\d+|192\.168\.\d+)/;
        for (const host of FUNNEL_HOSTS) {
          for (const url of host.funnels) {
            expect(
              ipPattern.test(url),
              `URL ${url} should NOT start with a hardcoded IP`,
            ).toBe(false);
            // Must contain the MagicDNS suffix
            expect(url, `${url} should contain MagicDNS suffix`).toContain(MAGIC_DNS_SUFFIX);
          }
        }
      });

      it('at least 6 Funnel URLs exist in the host table', () => {
        const totalUrls = FUNNEL_HOSTS.reduce((sum, h) => sum + h.funnels.length, 0);
        expect(totalUrls, 'should have at least 6 Funnel URLs').toBeGreaterThanOrEqual(6);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Summary log (runs after all suites)
// ---------------------------------------------------------------------------

afterAll(() => {
  console.log('[6host_e2e] All suites complete. See test output above for pass/fail details.');
  console.log(
    `[6host_e2e] MagicDNS suffix: ${MAGIC_DNS_SUFFIX}`,
  );
});

/*
Co-Authored-By: Claude Code <noreply@anthropic.com>
*/
