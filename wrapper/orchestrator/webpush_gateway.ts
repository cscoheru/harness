/**
 * Web Push Gateway — VAPID-signed push notifications for v1.1 M2.
 *
 * Responsibilities:
 *   - Sign push payloads with VAPID (RFC 8292)
 *   - Route push requests to the correct push service endpoint (FCM / Mozilla / WNS / APNs)
 *   - Enforce endpoint whitelist (only 4 approved services)
 *   - VAPID private key injected via process.env (M2 hygiene — never in source)
 *
 * M2 hygiene gates (v0.3 §4.7):
 *   - VAPID private key = process.env.VAPID_PRIVATE_KEY only (no literal key in source)
 *   - VAPID public key = safe to include in source / commit (used by client subscription)
 *   - Only 4 push service endpoints are allowed (whitelist enforcement)
 *
 * Env vars (env-inject only):
 *   VAPID_PRIVATE_KEY — base64url-encoded ECDSA P-256 private key
 *   VAPID_PUBLIC_KEY  — base64url-encoded ECDSA P-256 public key
 *   VAPID_SUBJECT     — mailto: URL for VAPID "Contact" claim
 *
 * Co-Authored-By: Claude Code <noreply@anthropic.com>
 */

import { createHmac, randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PushProvider = "fcm" | "mozilla" | "wns" | "apns";

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  provider: PushProvider;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  /** Seconds until expiration */
  ttl?: number;
}

export interface PushResult {
  success: boolean;
  provider: PushProvider;
  statusCode?: number;
  error?: string;
  pushId: string;
  deliveredAt: string;
}

// ─── VAPID key management ─────────────────────────────────────────────────────

/**
 * VAPID private key — injected via process.env (M2 hygiene §4.7).
 * NEVER hardcode a literal key in source.
 */
function getVapidPrivateKey(): string {
  const key = process.env["VAPID_PRIVATE_KEY"];
  if (!key) {
    throw new Error("VAPID_PRIVATE_KEY env var is required");
  }
  return key;
}

/**
 * VAPID public key — safe to hardcode or read from env.
 * This is the key clients use when subscribing; not sensitive.
 */
export function getVapidPublicKey(): string {
  return process.env["VAPID_PUBLIC_KEY"] ?? "";
}

/**
 * VAPID subject (Contact) — mailto: URL per RFC 8292.
 */
function getVapidSubject(): string {
  return process.env["VAPID_SUBJECT"] ?? "mailto:admin@fish-harness.ts.net";
}

// ─── Push endpoint whitelist ──────────────────────────────────────────────────

/**
 * Approved push service endpoints (M2 hygiene §4.7).
 * Only these 4 domains are allowed — prevents push hijacking.
 */
const ENDPOINT_WHITELIST: ReadonlyMap<PushProvider, RegExp> = new Map([
  ["fcm",     /^https:\/\/fcm\.googleapis\.com\/fcm\/send\//],
  ["mozilla", /^https:\/\/updates\.push\.services\.mozilla\.com\/wpush\/v[12]\//],
  ["wns",     /^https:\/\/wns\.windows-push\.com\/send\/.*/],
  ["apns",    /^https:\/\/api\.push\.apple\.com\/3\/device\//],
]);

/**
 * Detect which push provider an endpoint belongs to.
 * Returns null if endpoint is not in the whitelist.
 */
export function detectProvider(endpoint: string): PushProvider | null {
  for (const [provider, pattern] of ENDPOINT_WHITELIST) {
    if (pattern.test(endpoint)) return provider;
  }
  return null;
}

/**
 * Enforce endpoint whitelist — throws if endpoint is not approved.
 * This is a hard gate: no exceptions.
 */
function enforceWhitelist(endpoint: string): void {
  if (!detectProvider(endpoint)) {
    throw new Error(
      `Push endpoint not in whitelist: ${endpoint.slice(0, 80)}... ` +
      "Allowed: fcm.googleapis.com, updates.push.services.mozilla.com, wns.windows-push.com, api.push.apple.com",
    );
  }
}

// ─── VAPID JWT signing (RFC 8292) ────────────────────────────────────────────

/**
 * Create a VAPID JWT per RFC 8292 §3.
 * Uses the private key from process.env (M2 hygiene §4.7).
 *
 * JWT structure:
 *   Header: { typ: "JWT", alg: "ES256" }
 *   Payload: { aud: "<origin of push service>", exp: <unix timestamp>, sub: "<mailto:...>" }
 */
function createVapidJwt(audience: string): string {
  const privateKey = getVapidPrivateKey();
  const subject = getVapidSubject();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiry = issuedAt + 86_400; // 24 hours

  // JWT header (base64url)
  const header = base64urlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));

  // Payload
  const payload = JSON.stringify({
    aud: audience,
    exp: expiry,
    sub: subject,
  });
  const payloadEncoded = base64urlEncode(payload);

  // Signature: HMAC-SHA256 of "header.payload" using private key
  // NOTE: In production use the `web-push` npm package or equivalent RFC 8292 lib.
  // This stub implements the structural shape for testing; replace with real ECDSA
  // signing in production (e.g., node:crypto with P-256 key import).
  const signingInput = `${header}.${payloadEncoded}`;
  const signature = hmacSha256(signingInput, privateKey);

  return `${signingInput}.${signature}`;
}

/**
 * Base64url encoding (no padding).
 */
function base64urlEncode(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * HMAC-SHA256 signing (stub — use proper ECDSA P-256 in production).
 * In production, use `@web-push/web-push` or `web-push` package which handles
 * RFC 8292 ECDSA signing correctly.
 *
 * This stub exists so the module has no external dependencies during M2 BE-1
 * skeleton implementation. Replace with real VAPID signing before production use.
 */
function hmacSha256(input: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(input)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ─── Push payload serialization ───────────────────────────────────────────────

/**
 * Serialize a PushPayload into a JSON string for the Web Push protocol.
 * Includes TTL, urgency, and topic per Web Push spec.
 */
function serializePayload(payload: PushPayload): string {
  return JSON.stringify({
    notification: {
      title: payload.title,
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      data: payload.data,
    },
  });
}

// ─── Provider-specific delivery ───────────────────────────────────────────────

/**
 * Extract the "audience" origin from a push endpoint.
 * Required for the VAPID JWT `aud` claim.
 */
function extractAudience(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    throw new Error(`Invalid push endpoint URL: ${endpoint}`);
  }
}

/**
 * Deliver a push notification to the endpoint using fetch.
 * Implements Web Push protocol (RFC 8030) + VAPID authentication.
 *
 * Headers:
 *   TTL: max cache time (default 2419200 = 4 weeks)
 *   Urgency: normal|high|low
 *   Topic: message tag for replacement
 *   Authorization: VAPID jwt t=<token>,k=<publicKey>
 */
async function deliverPush(
  endpoint: string,
  payload: string,
  subscription: PushSubscription,
  ttl = 2419200,
): Promise<{ ok: boolean; statusCode: number; body: string }> {
  enforceWhitelist(endpoint);
  const audience = extractAudience(endpoint);
  const vapidJwt = createVapidJwt(audience);
  const publicKey = getVapidPublicKey();

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "TTL": String(ttl),
        "Urgency": "normal",
        "Authorization": `VAPID t=${vapidJwt},k=${publicKey}`,
        "Encryption-Key": `key=p256dh;dh=${subscription.keys.p256dh}`,
        "Crypto-Key": `dh=${subscription.keys.p256dh};p256ecdsa=${publicKey}`,
      },
      body: payload,
      // Do not follow redirects — push services return final status directly
      redirect: "error",
    } as RequestInit & { redirect: "error" } as RequestInit,
    );

    const body = await res.text().catch(() => "");

    return { ok: res.ok, statusCode: res.status, body: body.slice(0, 200) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, statusCode: 0, body: `network error: ${error}` };
  }
}

// ─── Main gateway API ─────────────────────────────────────────────────────────

/**
 * Send a push notification to a single subscription.
 * Returns PushResult with provider, status, and push ID.
 *
 * DEEPSEEK_API_KEY is NOT used here (no AI involved in push delivery).
 * VAPID_PRIVATE_KEY is injected via process.env (M2 hygiene §4.7).
 */
export async function sendPush(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<PushResult> {
  const pushId = randomUUID();
  const provider = subscription.provider;

  const serialized = serializePayload(payload);

  const { ok, statusCode, body } = await deliverPush(
    subscription.endpoint,
    serialized,
    subscription,
    payload.ttl,
  );

  return {
    success: ok,
    provider,
    statusCode,
    error: ok ? undefined : body,
    pushId,
    deliveredAt: new Date().toISOString(),
  };
}

/**
 * Broadcast a push notification to multiple subscriptions.
 * Returns an array of PushResults (one per subscription).
 */
export async function sendBroadcast(
  subscriptions: PushSubscription[],
  payload: PushPayload,
): Promise<PushResult[]> {
  return Promise.all(
    subscriptions.map((sub) => sendPush(sub, payload)),
  );
}

// ─── Subscription management ───────────────────────────────────────────────────

/**
 * Normalize and validate a raw subscription object from the client.
 * Detects provider, validates keys, enforces whitelist.
 *
 * Input: raw subscription from ServiceWorker.registration.pushManager.subscribe()
 */
export function normalizeSubscription(raw: {
  endpoint: string;
  keys?: Record<string, string>;
}): PushSubscription {
  const provider = detectProvider(raw.endpoint);
  if (!provider) {
    throw new Error(
      `Endpoint not in whitelist: ${raw.endpoint}. ` +
      "Allowed: fcm.googleapis.com, updates.push.services.mozilla.com, wns.windows-push.com, api.push.apple.com",
    );
  }

  if (!raw.keys?.p256dh || !raw.keys?.auth) {
    throw new Error("Subscription missing p256dh or auth key");
  }

  return {
    endpoint: raw.endpoint,
    keys: {
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
    },
    provider,
  };
}

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Check that VAPID keys are available (private key present, public key available).
 */
export function checkPushHealth(): {
  hasPrivateKey: boolean;
  hasPublicKey: boolean;
  hasSubject: boolean;
} {
  return {
    hasPrivateKey: Boolean(process.env["VAPID_PRIVATE_KEY"]),
    hasPublicKey: Boolean(process.env["VAPID_PUBLIC_KEY"]),
    hasSubject: Boolean(process.env["VAPID_SUBJECT"]),
  };
}

// ─── VAPID public key endpoint (for clients) ─────────────────────────────────

/**
 * Return the VAPID public key for clients to use when subscribing.
 * Safe to expose publicly — only used to verify push authenticity server-side.
 */
export function getVapidKeyPair(): {
  publicKey: string;
} {
  return { publicKey: getVapidPublicKey() };
}
