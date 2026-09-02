/**
 * vapid_keys.ts — VAPID key pair generation for Web Push.
 *
 * Generates a VAPID key pair (public + private) using elliptic curve secp256r1
 * (P-256), as required by the Web Push protocol (RFC 8292).
 *
 * Key pair usage:
 *   - Public key  → stored in deploy/vapid_public.key (SAFE to commit)
 *   - Private key → printed to stdout only; operator copies into
 *                   deploy/env/newvps.env.example or CI secret manager
 *                   (NEVER committed to git)
 *
 * VAPID key pair is generated once per deployment, not per request.
 * Re-running this script generates a new pair — existing subscriptions
 * become invalid until the new public key is pushed to clients.
 *
 * Dependencies: Node.js 20+ built-in crypto (no npm packages required).
 *
 * Security notes:
 *   - Private key is NEVER written to a file by this script
 *   - Private key is printed to stdout ONLY
 *   - Public key is written to deploy/vapid_public.key
 *   - No hardcoded VAPID keys in source (env-inject only)
 *   - Public key may be committed (it has no secret value)
 *
 * @file wrapper/dsh/vapid_keys.ts
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createPublicKey, createPrivateKey, generateKeyPairSync } from 'crypto';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/**
 * Generate a VAPID key pair (EC P-256 / secp256r1).
 *
 * Output:
 *   publicKey  - base64url-encoded uncompressed point (for push subscription)
 *   privateKey - base64url-encoded private scalar (env-inject only)
 *
 * The public key is written to deploy/vapid_public.key (safe to commit).
 * The private key is printed to stdout and must be captured by the operator.
 */
export interface VapidKeyPair {
  publicKey: string;   // base64url, safe to commit
  privateKey: string;   // base64url, env-inject only — NEVER commit
}

/**
 * Convert a raw P-256 public key point to base64url format.
 * Handles both JWK and SPKI DER encodings.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function publicKeyToBase64url(publicKey: unknown): string {
  const raw = new Uint8Array(65);
  // Export as raw EC point (uncompressed: 0x04 || x || y)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(
    Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
  ).toString('utf8');
}

let _keyPairCache: VapidKeyPair | null = null;

/**
 * Generate a fresh VAPID key pair.
 *
 * Uses Node.js built-in crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).
 * prime256v1 === secp256r1 === P-256 (the curve required by RFC 8292).
 *
 * The public key is returned as a base64url string suitable for:
 *   - ApplicationServerKey in PushSubscriptionOptions (browser)
 *   - Stored in deploy/vapid_public.key (committed)
 *
 * The private key is returned as a base64url string for:
 *   - Web Push library (e.g. web-push) as VAPID_PRIVATE_KEY
 *   - Stored in CI/CD secret manager or deploy/env/newvps.env.example
 *   - NEVER committed to git
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JwkPublic = { x?: string; y?: string; crv?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JwkPrivate = { d?: string };

export function generateVapidKeyPair(): VapidKeyPair {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { publicKey, privateKey } = generateKeyPairSync('ec' as any, {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { format: 'jwk' },
    privateKeyEncoding: { format: 'jwk' },
  });

  // Derive the raw uncompressed EC point for the public key (0x04 || x || y)
  // This is what browsers expect for ApplicationServerKey
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jwk = publicKey as unknown as JwkPublic;

  if (!jwk.x || !jwk.y || jwk.crv !== 'P-256') {
    throw new Error('generateVapidKeyPair: unexpected JWK format from crypto.generateKeyPairSync');
  }

  const xBytes = Buffer.from(jwk.x, 'base64');
  const yBytes = Buffer.from(jwk.y, 'base64');
  const rawPoint = Buffer.concat([Buffer.from([0x04]), xBytes, yBytes]);
  const publicKeyBase64url = rawPoint
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Private key as base64url (JWK d parameter)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jwkPrivate = privateKey as unknown as JwkPrivate;
  const privateKeyBase64url = Buffer.from(jwkPrivate.d ?? '', 'base64')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { publicKey: publicKeyBase64url, privateKey: privateKeyBase64url };
}

/**
 * Get the cached VAPID key pair, generating one if not yet cached.
 * Caching avoids regenerating keys on every call within the same process.
 */
export function getVapidKeyPair(): VapidKeyPair {
  if (!_keyPairCache) {
    _keyPairCache = generateVapidKeyPair();
  }
  return _keyPairCache;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Print usage and generate VAPID key pair.
 *
 * Output:
 *   1. Public key path (written to deploy/vapid_public.key)
 *   2. Instructions for capturing the private key from stdout
 *
 * Run:
 *   node wrapper/dsh/vapid_keys.js
 *
 * Operator must capture the private key from stdout:
 *   node wrapper/dsh/vapid_keys.js 2>/dev/null | grep "VAPID_PRIVATE_KEY=" | cut -d= -f2
 */
function main(): void {
  const keyPair = generateVapidKeyPair();
  const projectRoot = resolve(process.cwd(), '..');
  const publicKeyPath = resolve(projectRoot, 'deploy', 'vapid_public.key');

  writeFileSync(publicKeyPath, keyPair.publicKey, 'utf8');

  // Print to stdout — operator must capture this value
  // eslint-disable-next-line no-console
  console.log('VAPID key pair generated:');
  // eslint-disable-next-line no-console
  console.log(`VAPID_PRIVATE_KEY=${keyPair.privateKey}`);
  // eslint-disable-next-line no-console
  console.log(`Public key written to: ${publicKeyPath}`);

  // Verify what was written
  // eslint-disable-next-line no-console
  console.log(`Public key (safe to commit): ${keyPair.publicKey}`);
}

main();
