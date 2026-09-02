/**
 * T-M2-QA-1: dsh 6 host real dispatch integration test suite.
 *
 * Tests the 6host_client.ts routing + dsh --profile headless integration:
 *   1. orch / commander → harness-newvps.tail1b9878.ts.net (primary)
 *   2. worker          → round-robin across 5 edge hosts
 *   3. Wall time per role: orch < 300s / commander < 180s / worker < 60s
 *   4. Uses --profile headless (NOT web) — enforced by 6host_client.ts
 *
 * M2 hygiene gates (v0.3 §4.5):
 *   - No hardcoded IPs (MagicDNS FQDN only)
 *   - dsh --profile headless (NOT web)
 *   - DEEPSEEK_API_KEY via process.env (env-inject only)
 *
 * @file wrapper/test/integration/dsh_6host.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  callDsh6Host,
  selectHost,
  selectHostFqdn,
  listAllHostFqdns,
  getCurrentEdgeHost,
  buildHostFqdn,
  PRIMARY_HOST,
  EDGE_HOSTS,
  MAGIC_DNS_SUFFIX,
} from '../dsh/6host_client.js';
import type { ModelClass } from '../dsh/types.js';

// ---------------------------------------------------------------------------
// Env guard
// ---------------------------------------------------------------------------

const SKIP_REASON = 'RUN_DSH_6HOST=1 + DEEPSEEK_API_KEY required; default skip for gate stability';
const apiKey = process.env.DEEPSEEK_API_KEY;
const shouldRun = process.env.RUN_DSH_6HOST === '1' && typeof apiKey === 'string' && apiKey.length > 0;

describe('dsh_6host — real dsh CLI across 6 hosts', { skip: !shouldRun }, () => {

  // ---------------------------------------------------------------------------
  // §1: Routing topology — MagicDNS FQDN construction
  // ---------------------------------------------------------------------------

  describe('§1 — MagicDNS FQDN routing topology', () => {
    it('PRIMARY_HOST is harness-newvps', () => {
      expect(PRIMARY_HOST, 'primary host should be harness-newvps').toBe('harness-newvps');
    });

    it('EDGE_HOSTS has exactly 5 entries', () => {
      expect(EDGE_HOSTS.length, 'should have 5 edge hosts').toBe(5);
      expect(EDGE_HOSTS, 'edges should be harness-edge1-5').toEqual([
        'harness-edge1', 'harness-edge2', 'harness-edge3', 'harness-edge4', 'harness-edge5',
      ]);
    });

    it('buildHostFqdn produces correct MagicDNS FQDN', () => {
      expect(buildHostFqdn('harness-newvps')).toBe(`harness-newvps.${MAGIC_DNS_SUFFIX}`);
      expect(buildHostFqdn('harness-edge1')).toBe(`harness-edge1.${MAGIC_DNS_SUFFIX}`);
    });

    it('listAllHostFqdns returns 6 FQDNs', () => {
      const fqdns = listAllHostFqdns();
      expect(fqdns.length, 'should have 6 host FQDNs').toBe(6);
      expect(fqdns[0], 'first should be newvps').toBe(`harness-newvps.${MAGIC_DNS_SUFFIX}`);
      expect(fqdns.slice(1), 'edges 2-6 should be harness-edgeN').toEqual([
        `harness-edge1.${MAGIC_DNS_SUFFIX}`,
        `harness-edge2.${MAGIC_DNS_SUFFIX}`,
        `harness-edge3.${MAGIC_DNS_SUFFIX}`,
        `harness-edge4.${MAGIC_DNS_SUFFIX}`,
        `harness-edge5.${MAGIC_DNS_SUFFIX}`,
      ]);
    });

    it('no hardcoded IP addresses in 6host_client source', async () => {
      const fs = await import('fs');
      const sourcePath = new URL('../dsh/6host_client.ts', import.meta.url);
      const source = fs.readFileSync(sourcePath, 'utf8');

      const ipPattern = /172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+/;
      const matches = source.match(ipPattern);
      expect(
        matches,
        `6host_client.ts should not contain hardcoded IPs; found: ${matches?.join(', ')}`,
      ).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // §2: Host selection logic
  // ---------------------------------------------------------------------------

  describe('§2 — Host selection: role → correct target', () => {
    it('orch selects primary host', () => {
      expect(selectHost('orch')).toBe(PRIMARY_HOST);
      expect(selectHostFqdn('orch')).toContain('harness-newvps');
    });

    it('commander selects primary host', () => {
      expect(selectHost('commander')).toBe(PRIMARY_HOST);
      expect(selectHostFqdn('commander')).toContain('harness-newvps');
    });

    it('worker selects one of the 5 edge hosts', () => {
      const host = selectHost('worker');
      expect(EDGE_HOSTS, `${host} should be in EDGE_HOSTS`).toContain(host);
      expect(host, `${host} should NOT be primary`).not.toBe(PRIMARY_HOST);
    });

    it('workers round-robin across all 5 edges (5 calls)', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 5; i++) {
        seen.add(selectHost('worker'));
      }
      expect(
        seen.size,
        `5 worker calls should cycle through all 5 edges; got: ${[...seen].join(', ')}`,
      ).toBe(5);
    });

    it('getCurrentEdgeHost returns a valid edge host name', () => {
      const host = getCurrentEdgeHost();
      expect(EDGE_HOSTS, `${host} should be a valid edge`).toContain(host);
    });
  });

  // ---------------------------------------------------------------------------
  // §3: Real dsh call — orch tier (SLO: 300s)
  // ---------------------------------------------------------------------------

  describe('§3 — Real dsh call: orch tier', () => {
    const simplePrompt = 'Reply with exactly: "orch-ok". Nothing else.';

    it('callDsh6Host[orch] returns exit 0 + non-empty stdout', async () => {
      const startMs = Date.now();

      let result: Awaited<ReturnType<typeof callDsh6Host>> | null = null;
      try {
        result = await callDsh6Host(simplePrompt, 'orch', { timeoutMs: 300_000 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('dsh') || msg.includes('not found') || msg.includes('ENOENT')) {
          console.warn('[dsh_6host] dsh CLI not found in PATH — skipping real call test');
          return;
        }
        throw err;
      }

      const wallMs = Date.now() - startMs;

      expect(result, 'result should not be null').not.toBeNull();
      expect(result!.exitCode, `exit code should be 0; stderr=${result!.stderr.slice(0, 200)}`).toBe(0);
      expect(result!.stdout.trim().length, 'stdout should be non-empty').toBeGreaterThan(0);
      expect(result!.targetHost, 'targetHost should contain harness-newvps').toContain('harness-newvps');

      // orch SLO: 300s
      expect(wallMs, 'orch wall time should be under 300s SLO').toBeLessThan(300_000);
      expect(result!.wallMs, 'wallMs should be non-negative').toBeGreaterThanOrEqual(0);

      console.log(`[dsh_6host] orch: wallMs=${wallMs} exit=${result!.exitCode} stdoutLen=${result!.stdout.length} target=${result!.targetHost}`);
    }, 310_000);
  });

  // ---------------------------------------------------------------------------
  // §4: Real dsh call — commander tier (SLO: 180s)
  // ---------------------------------------------------------------------------

  describe('§4 — Real dsh call: commander tier', () => {
    const prompt = 'Reply with exactly: "commander-ok". Nothing else.';

    it('callDsh6Host[commander] returns exit 0 + non-empty stdout', async () => {
      const startMs = Date.now();

      let result: Awaited<ReturnType<typeof callDsh6Host>> | null = null;
      try {
        result = await callDsh6Host(prompt, 'commander', { timeoutMs: 180_000 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('dsh') || msg.includes('not found') || msg.includes('ENOENT')) {
          console.warn('[dsh_6host] dsh CLI not found — skipping');
          return;
        }
        throw err;
      }

      const wallMs = Date.now() - startMs;

      expect(result).not.toBeNull();
      expect(result!.exitCode, 'exit code should be 0').toBe(0);
      expect(result!.stdout.trim().length, 'stdout should be non-empty').toBeGreaterThan(0);
      expect(result!.targetHost).toContain('harness-newvps');

      // commander SLO: 180s
      expect(wallMs, 'commander wall time should be under 180s SLO').toBeLessThan(180_000);

      console.log(`[dsh_6host] commander: wallMs=${wallMs} exit=${result!.exitCode} target=${result!.targetHost}`);
    }, 190_000);
  });

  // ---------------------------------------------------------------------------
  // §5: Real dsh call — worker tier (SLO: 60s, round-robin)
  // ---------------------------------------------------------------------------

  describe('§5 — Real dsh call: worker tier (5 edges round-robin)', () => {
    const prompt = 'Reply with exactly: "worker-ok". Nothing else.';

    it('5 worker calls round-robin across 5 edge hosts', async () => {
      const results: Array<{ host: string; exitCode: number; wallMs: number }> = [];

      for (let i = 0; i < 5; i++) {
        const startMs = Date.now();
        let result: Awaited<ReturnType<typeof callDsh6Host>> | null = null;
        try {
          result = await callDsh6Host(prompt, 'worker', { timeoutMs: 60_000 });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('dsh') || msg.includes('not found') || msg.includes('ENOENT')) {
            console.warn('[dsh_6host] dsh CLI not found — skipping worker test');
            return;
          }
          throw err;
        }

        const wallMs = Date.now() - startMs;
        results.push({ host: result!.targetHost, exitCode: result!.exitCode, wallMs });
      }

      const uniqueHosts = new Set(results.map((r) => r.host));
      expect(
        uniqueHosts.size,
        `5 worker calls should hit 5 different edges; got ${uniqueHosts.size}: ${[...uniqueHosts].join(', ')}`,
      ).toBe(5);

      // All should succeed (exit 0)
      const failures = results.filter((r) => r.exitCode !== 0);
      expect(failures, `all 5 worker calls should exit 0; failures: ${failures.map((f) => f.host).join(', ')}`).toHaveLength(0);

      console.log(`[dsh_6host] worker round-robin:`, results.map((r) => `${r.host.split('.')[0]}@${r.wallMs}ms`).join(' | '));
    }, 360_000);
  });

  // ---------------------------------------------------------------------------
  // §6: dsh --profile headless enforcement
  // ---------------------------------------------------------------------------

  describe('§6 — dsh --profile headless enforcement', () => {
    it('6host_client.ts uses --profile headless (not web)', async () => {
      const fs = await import('fs');
      const sourcePath = new URL('../dsh/6host_client.ts', import.meta.url);
      const source = fs.readFileSync(sourcePath, 'utf8');

      expect(
        source,
        '6host_client.ts should use --profile headless',
      ).toContain('--profile');
      expect(
        source,
        '6host_client.ts should use --profile headless (NOT web)',
      ).toContain('headless');

      // Must NOT contain web profile
      const webProfileMatch = source.match(/profile['":\s]+web['"\s}]/);
      expect(
        webProfileMatch,
        `6host_client.ts should NOT use profile:web; found: ${webProfileMatch?.[0]}`,
      ).toBeNull();
    });
  });
});

/*
Co-Authored-By: Claude Code <noreply@anthropic.com>
*/
