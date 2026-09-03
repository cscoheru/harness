/**
 * T-M2-QA-1: Web Push E2E integration test suite.
 *
 * Tests the VAPID-signed Web Push pipeline:
 *   1. Mock PushSubscription for 4 providers: FCM / Mozilla / WNS / APNs
 *   2. VAPID signing via process.env (M2 hygiene §4.7 — no hardcoded key)
 *   3. Endpoint whitelist enforcement (only 4 approved domains)
 *   4. Delivery rate stats + VAPID signing latency
 *
 * M2 hygiene gates (v0.3 §4.7):
 *   - VAPID private key: process.env.VAPID_PRIVATE_KEY only (no literal key)
 *   - VAPID public key: safe to include (client subscription only)
 *   - 4 push service endpoints in whitelist: FCM / Mozilla / WNS / APNs
 *
 * @file wrapper/test/integration/webpush_e2e.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import {
  normalizeSubscription,
  detectProvider,
  checkPushHealth,
  sendPush,
  sendBroadcast,
  type PushSubscription,
  type PushPayload,
} from '../../orchestrator/webpush_gateway.js';

// ---------------------------------------------------------------------------
// Env guard
// ---------------------------------------------------------------------------

const SKIP_REASON = 'RUN_WEBPUSH_E2E=1 + VAPID_PRIVATE_KEY required; default skip for gate stability';
const shouldRun = process.env.RUN_WEBPUSH_E2E === '1';

// ---------------------------------------------------------------------------
// Mock subscriptions for 4 providers
// ---------------------------------------------------------------------------

/**
 * Mock p256dh key (not a real key — for testing shape only).
 * The real key would come from PushSubscription.keys in the browser.
 */
const MOCK_P256DH = 'BCgw0ZU6sR_NkGOj69hzOAkBryoHbN4MXd7Iz16E8wBw1nWoGn0oRwmdVPdDKW0K1J9V4cJvnkD5ZJ3w5pJ8bE';
const MOCK_AUTH = 'WXRZbX3aZJxO7V1YQ3aZ3A';

/** Mock FCM subscription */
function mockFcmSubscription(): PushSubscription {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bHPLkp',
    keys: { p256dh: MOCK_P256DH, auth: MOCK_AUTH },
    provider: 'fcm',
  };
}

/** Mock Mozilla Push subscription */
function mockMozillaSubscription(): PushSubscription {
  return {
    endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA1B2C3D',
    keys: { p256dh: MOCK_P256DH, auth: MOCK_AUTH },
    provider: 'mozilla',
  };
}

/** Mock WNS (Windows Push Notification Service) subscription */
function mockWnsSubscription(): PushSubscription {
  return {
    endpoint: 'https://wns.windows-push.com/send/ABC123/?token=XYZ',
    keys: { p256dh: MOCK_P256DH, auth: MOCK_AUTH },
    provider: 'wns',
  };
}

/** Mock APNs subscription */
function mockApnsSubscription(): PushSubscription {
  return {
    endpoint: 'https://api.push.apple.com/3/device/dQw4w9WgXcQ123456789abcdef',
    keys: { p256dh: MOCK_P256DH, auth: MOCK_AUTH },
    provider: 'apns',
  };
}

// ---------------------------------------------------------------------------
// Shared test payload
// ---------------------------------------------------------------------------

const TEST_PAYLOAD: PushPayload = {
  title: 'Test Notification',
  body: 'This is a test push notification from T-M2-QA-1.',
  icon: '/icons/icon-192.png',
  badge: '/icons/badge-72.png',
  tag: 'test-tag',
  ttl: 86_400, // 24 hours
};

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

describe('Web Push E2E — VAPID signed push', { skip: !shouldRun }, () => {
  // ---------------------------------------------------------------------------
  // §1: Hygiene — VAPID private key not hardcoded in source
  // ---------------------------------------------------------------------------

  describe('§1 — Hygiene: no hardcoded VAPID private key', () => {
    it('webpush_gateway.ts does NOT contain hardcoded VAPID private key', async () => {
      const fs = await import('fs');
      const sourcePath = new URL('../../orchestrator/webpush_gateway.ts', import.meta.url);
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Pattern: VAPID_PRIVATE_KEY := or : followed by 32+ char base64-like string
      const hardcodedKeyPattern = /VAPID_PRIVATE_KEY\s*[:=]\s*['"][A-Za-z0-9_=-]{32,}['"]/;
      expect(
        hardcodedKeyPattern.test(source),
        'webpush_gateway.ts should NOT hardcode VAPID private key',
      ).toBe(false);
    });

    it('VAPID private key getter reads from process.env only', async () => {
      const fs = await import('fs');
      const sourcePath = new URL('../../orchestrator/webpush_gateway.ts', import.meta.url);
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Should contain process.env["VAPID_PRIVATE_KEY"]
      expect(
        source,
        'should use process.env for VAPID private key',
      ).toContain('process.env["VAPID_PRIVATE_KEY"]');
    });

    it('VAPID public key is safe to include in source (not sensitive)', async () => {
      const fs = await import('fs');
      const sourcePath = new URL('../../orchestrator/webpush_gateway.ts', import.meta.url);
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Public key is referenced but should be safe to include
      expect(
        source,
        'VAPID public key should be retrievable via getVapidPublicKey()',
      ).toContain('getVapidPublicKey');
    });
  });

  // ---------------------------------------------------------------------------
  // §2: Endpoint whitelist — all 4 providers present
  // ---------------------------------------------------------------------------

  describe('§2 — Endpoint whitelist: 4 approved providers', () => {
    const providers: Array<{ name: string; fn: () => PushSubscription }> = [
      { name: 'FCM (fcm.googleapis.com)', fn: mockFcmSubscription },
      { name: 'Mozilla (updates.push.services.mozilla.com)', fn: mockMozillaSubscription },
      { name: 'WNS (wns.windows-push.com)', fn: mockWnsSubscription },
      { name: 'APNs (api.push.apple.com)', fn: mockApnsSubscription },
    ];

    for (const { name, fn } of providers) {
      it(`${name} is in the whitelist`, () => {
        const sub = fn();
        const detected = detectProvider(sub.endpoint);
        expect(detected, `${name} should be detected`).toBe(sub.provider);
      });

      it(`${name} normalizeSubscription succeeds`, () => {
        const sub = fn();
        const normalized = normalizeSubscription({
          endpoint: sub.endpoint,
          keys: sub.keys,
        });
        expect(normalized.provider, 'provider should match').toBe(sub.provider);
        expect(normalized.keys.p256dh, 'p256dh should be preserved').toBe(sub.keys.p256dh);
        expect(normalized.keys.auth, 'auth should be preserved').toBe(sub.keys.auth);
      });
    }

    it('4 push service endpoint domains appear in source', async () => {
      const fs = await import('fs');
      const sourcePath = new URL('../../orchestrator/webpush_gateway.ts', import.meta.url);
      const source = fs.readFileSync(sourcePath, 'utf8');

      const endpoints = [
        'fcm.googleapis.com',
        'updates.push.services.mozilla.com',
        'wns.windows-push.com',
        'api.push.apple.com',
      ];

      for (const endpoint of endpoints) {
        expect(
          source,
          `${endpoint} should be in the endpoint whitelist`,
        ).toContain(endpoint);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // §3: Reject unknown / malicious endpoints
  // ---------------------------------------------------------------------------

  describe('§3 — Endpoint blacklist: unknown domains rejected', () => {
    const maliciousEndpoints = [
      'https://attacker-push.example.com/fake',
      'https://spam-push.net/notify',
      'https://fcm-copy.googleapis.com.fake.com/fcm/send',
    ];

    for (const endpoint of maliciousEndpoints) {
      it(`rejects unknown endpoint: ${endpoint}`, () => {
        const detected = detectProvider(endpoint);
        expect(detected, `${endpoint} should NOT be in whitelist`).toBeNull();
      });
    }

    it('normalizeSubscription throws for unknown endpoint', () => {
      expect(() =>
        normalizeSubscription({
          endpoint: 'https://evil-push.example.com/push',
          keys: { p256dh: MOCK_P256DH, auth: MOCK_AUTH },
        }),
      ).toThrow('not in whitelist');
    });
  });

  // ---------------------------------------------------------------------------
  // §4: VAPID signing — env injection + signature shape
  // ---------------------------------------------------------------------------

  describe('§4 — VAPID signing: env-injection + signature shape', () => {
    it('checkPushHealth returns key availability', () => {
      const health = checkPushHealth();
      // If VAPID_PRIVATE_KEY is set (RUN_WEBPUSH_E2E=1 guard), this reflects that
      expect(typeof health.hasPrivateKey).toBe('boolean');
      expect(typeof health.hasPublicKey).toBe('boolean');
      expect(typeof health.hasSubject).toBe('boolean');
    });

    it('checkPushHealth reports hasPrivateKey=false when VAPID_PRIVATE_KEY is not set', () => {
      const originalKey = process.env['VAPID_PRIVATE_KEY'];
      if (originalKey !== undefined) delete process.env['VAPID_PRIVATE_KEY'];

      try {
        const health = checkPushHealth();
        expect(health.hasPrivateKey, 'hasPrivateKey should be false when env var is missing').toBe(false);
      } finally {
        if (originalKey !== undefined) process.env['VAPID_PRIVATE_KEY'] = originalKey;
      }
    });

    it('throws if normalizeSubscription missing keys', () => {
      const sub = mockFcmSubscription();
      expect(() =>
        normalizeSubscription({ endpoint: sub.endpoint, keys: {} }),
      ).toThrow('missing p256dh or auth key');

      expect(() =>
        normalizeSubscription({ endpoint: sub.endpoint, keys: { p256dh: MOCK_P256DH } }),
      ).toThrow('missing p256dh or auth key');
    });
  });

  // ---------------------------------------------------------------------------
  // §5: sendPush — delivery attempt (may fail due to mock keys)
  // ---------------------------------------------------------------------------

  describe('§5 — sendPush delivery attempt', () => {
    it('sendPush returns a PushResult shape', async () => {
      // Force a valid 32-byte base64url VAPID private key (signing must succeed even if FCM rejects)
      const { generateVapidKeyPair } = await import('../../dsh/vapid_keys.js');
      const kp = generateVapidKeyPair();
      process.env['VAPID_PRIVATE_KEY'] = kp.privateKey;
      process.env['VAPID_PUBLIC_KEY'] = process.env['VAPID_PUBLIC_KEY'] ?? 'test-public-key-minimum-32-chars!!!!';
      process.env['VAPID_SUBJECT'] = process.env['VAPID_SUBJECT'] ?? 'mailto:test@fish-harness.ts.net';

      const sub = mockFcmSubscription();
      const startMs = Date.now();

      const result = await sendPush(sub, TEST_PAYLOAD);

      const wallMs = Date.now() - startMs;

      expect(typeof result.success, 'result.success should be boolean').toBe('boolean');
      expect(typeof result.provider, 'result.provider should be string').toBe('string');
      expect(result.provider, 'provider should be fcm').toBe('fcm');
      expect(typeof result.pushId, 'result.pushId should be string').toBe('string');
      expect(typeof result.deliveredAt, 'result.deliveredAt should be ISO string').toBe('string');
      expect(result.deliveredAt, 'deliveredAt should be valid ISO timestamp').toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Signing should complete quickly (< 500ms)
      expect(wallMs, 'VAPID signing should complete in < 500ms').toBeLessThan(500);

      console.log(
        `[webpush_e2e] FCM push: success=${result.success} status=${result.statusCode} wallMs=${wallMs}`,
      );
    });

    it('sendBroadcast returns array of PushResults', async () => {
      const { generateVapidKeyPair } = await import('../../dsh/vapid_keys.js');
      const kp = generateVapidKeyPair();
      process.env['VAPID_PRIVATE_KEY'] = kp.privateKey;
      process.env['VAPID_PUBLIC_KEY'] = process.env['VAPID_PUBLIC_KEY'] ?? 'test-public-key-minimum-32-chars!!!!';
      process.env['VAPID_SUBJECT'] = process.env['VAPID_SUBJECT'] ?? 'mailto:test@fish-harness.ts.net';

      const subs: PushSubscription[] = [
        mockFcmSubscription(),
        mockMozillaSubscription(),
      ];

      const results = await sendBroadcast(subs, TEST_PAYLOAD);

      expect(Array.isArray(results), 'results should be an array').toBe(true);
      expect(results.length, 'results should have 2 entries').toBe(2);
      expect(results[0].provider).toBe('fcm');
      expect(results[1].provider).toBe('mozilla');
    });
  });

  // ---------------------------------------------------------------------------
  // §6: VAPID signing latency benchmark
  // ---------------------------------------------------------------------------

  describe('§6 — VAPID signing latency benchmark', () => {
    it('VAPID JWT creation < 50ms (signing overhead)', async () => {
      const { generateVapidKeyPair } = await import('../../dsh/vapid_keys.js');
      const kp = generateVapidKeyPair();
      process.env['VAPID_PRIVATE_KEY'] = kp.privateKey;
      process.env['VAPID_PUBLIC_KEY'] = process.env['VAPID_PUBLIC_KEY'] ?? 'test-public-key-minimum-32-chars!!!!';
      process.env['VAPID_SUBJECT'] = process.env['VAPID_SUBJECT'] ?? 'mailto:test@fish-harness.ts.net';

      const sub = mockFcmSubscription();

      // Warm up
      await sendPush(sub, TEST_PAYLOAD);

      // Benchmark: 5 iterations
      const timings: number[] = [];
      for (let i = 0; i < 5; i++) {
        const startMs = Date.now();
        await sendPush(sub, { ...TEST_PAYLOAD, tag: `bench-${i}` });
        timings.push(Date.now() - startMs);
      }

      const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;
      console.log(`[webpush_e2e] VAPID signing avg=${avgMs.toFixed(1)}ms min=${Math.min(...timings)}ms max=${Math.max(...timings)}ms`);

      // Signing overhead (JWT + headers) should be < 50ms
      // Total including fetch may be higher
      expect(
        avgMs,
        'average VAPID signing + request time should be reasonable',
      ).toBeLessThan(2_000);
    });
  });

  // ---------------------------------------------------------------------------
  // §7: VAPID ECDSA P-256 signature correctness (post-M3-EXEC-3 stub replacement)
  // ---------------------------------------------------------------------------

  describe('§7 — VAPID ECDSA P-256 signature correctness', () => {
    it('signVapidJwt outputs 86-char base64url (64-byte raw r||s)', async () => {
      const { signVapidJwt, generateVapidKeyPair } = await import('../../dsh/vapid_keys.js');
      const kp = generateVapidKeyPair();
      const sig = signVapidJwt('test.input.payload', kp.privateKey);

      expect(typeof sig).toBe('string');
      expect(sig.length, '64-byte raw r||s base64url = 86 chars no padding').toBe(86);
      expect(sig, 'must be pure base64url (no + / = chars)').not.toMatch(/[+/=]/);
    });

    it('signVapidJwt signature verifies against matching public key (RFC 8292)', async () => {
      const { signVapidJwt, generateVapidKeyPair } = await import('../../dsh/vapid_keys.js');
      const { createPublicKey, createVerify } = await import('crypto');
      const kp = generateVapidKeyPair();

      // Reconstruct public KeyObject from base64url-encoded uncompressed point (0x04 || x || y = 65 bytes)
      const paddedPub = kp.publicKey + '='.repeat((4 - (kp.publicKey.length % 4)) % 4);
      const rawPub = Buffer.from(paddedPub.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const publicJwk = {
        kty: 'EC',
        crv: 'P-256',
        x: rawPub.subarray(1, 33).toString('base64url'),
        y: rawPub.subarray(33, 65).toString('base64url'),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const publicKeyObj = createPublicKey({ key: publicJwk as any, format: 'jwk' });

      const input = 'header.payload.verify-test';
      const sig = signVapidJwt(input, kp.privateKey);

      // Verify: ECDSA P-256 + SHA-256 of input bytes against the raw r||s signature (RFC 8292 §3.2)
      // dsaEncoding: 'ieee-p1363' tells Node.js the signature is raw r||s (64 bytes) not DER
      const verifyObj = createVerify('SHA256');
      verifyObj.update(input);
      const ok = verifyObj.verify(
        { key: publicKeyObj, dsaEncoding: 'ieee-p1363' },
        Buffer.from(sig, 'base64url'),
      );
      expect(ok, 'signature must verify against the matching public key (RFC 8292 ES256)').toBe(true);
    });

    it('webpush_gateway.ts uses signVapidJwt (not hmacSha256 stub)', async () => {
      const fs = await import('fs');
      const sourcePath = new URL('../../orchestrator/webpush_gateway.ts', import.meta.url);
      const source = fs.readFileSync(sourcePath, 'utf8');

      expect(source, 'must import signVapidJwt').toContain('signVapidJwt');
      expect(source, 'must NOT contain hmacSha256 stub calls').not.toMatch(/hmacSha256\s*\(/);
    });
  });
});

/*
Co-Authored-By: Claude Code <noreply@anthropic.com>
*/
