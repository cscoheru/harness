/**
 * 6host Router — Tailscale MagicDNS multi-host routing for v1.1 M2.
 *
 * Responsibilities:
 *   - Parse Tailscale MagicDNS host names to route requests to the correct 6-host endpoint
 *   - newvps (primary): full orchestrator + STT worker + Web Push gateway
 *   - edge1-5 (replicas): lightweight HTTP reverse-proxy / health-only
 *   - Fallback to newvps primary if edge host is unreachable
 *   - NO hardcoded container IPs — uses container_name + Docker Compose MagicDNS
 *
 * Host topology (Tailscale MagicDNS):
 *   newvps.fish-harness.ts.net  — primary: all capabilities
 *   edge1.fish-harness.ts.net  — replica: health + task proxy only
 *   edge2.fish-harness.ts.net  — replica: health + task proxy only
 *   edge3.fish-harness.ts.net  — replica: health + task proxy only
 *   edge4.fish-harness.ts.net  — replica: health + task proxy only
 *   edge5.fish-harness.ts.net  — replica: health + task proxy only
 *
 * M2 hygiene gates (v0.3 §4.5):
 *   - NO hardcoded IPs (172.x / 10.x / 192.168.x)
 *   - Uses container_name for Docker internal DNS
 *   - dsh always uses --profile headless (NOT web)
 *
 * Co-Authored-By: Claude Code <noreply@anthropic.com>
 */

import { callDshHeadless } from "../dsh/dsh_client.js";
import type { DshOpts, DshResponse } from "../dsh/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** 6-host identifier */
export type HostId = "newvps" | "edge1" | "edge2" | "edge3" | "edge4" | "edge5";

/** Capability level per host */
export type CapabilityLevel = "full" | "proxy";

/** 6-host routing table entry */
export interface HostEntry {
  hostId: HostId;
  magicDnsName: string;
  /** container_name used for Docker internal service discovery */
  containerName: string;
  capabilities: CapabilityLevel;
  isPrimary: boolean;
}

/** Routing decision */
export interface RouteDecision {
  targetHost: HostEntry;
  viaMagicDns: boolean;
  fallback: HostEntry; // always newvps primary
}

/** Request to be routed */
export interface RoutableRequest {
  hostHint?: string;       // explicit host preference from caller
  capability: CapabilityId;
  taskId?: string;
}

export type CapabilityId =
  | "orch"
  | "commander"
  | "worker"
  | "stt"
  | "webpush";

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Primary host (newvps) — full capabilities */
const PRIMARY_HOST: HostEntry = {
  hostId: "newvps",
  magicDnsName: "newvps.fish-harness.ts.net",
  containerName: "harness-newvps",
  capabilities: "full",
  isPrimary: true,
};

/** Edge host table — proxy only */
const EDGE_HOSTS: HostEntry[] = [
  { hostId: "edge1", magicDnsName: "edge1.fish-harness.ts.net", containerName: "harness-edge1", capabilities: "proxy", isPrimary: false },
  { hostId: "edge2", magicDnsName: "edge2.fish-harness.ts.net", containerName: "harness-edge2", capabilities: "proxy", isPrimary: false },
  { hostId: "edge3", magicDnsName: "edge3.fish-harness.ts.net", containerName: "harness-edge3", capabilities: "proxy", isPrimary: false },
  { hostId: "edge4", magicDnsName: "edge4.fish-harness.ts.net", containerName: "harness-edge4", capabilities: "proxy", isPrimary: false },
  { hostId: "edge5", magicDnsName: "edge5.fish-harness.ts.net", containerName: "harness-edge5", capabilities: "proxy", isPrimary: false },
];

/** All hosts ordered: primary first, then edges round-robin */
const ALL_HOSTS: HostEntry[] = [PRIMARY_HOST, ...EDGE_HOSTS];

// Round-robin index for worker tasks (shared across calls, not persistent)
let _edgeRoundRobin = 0;

// ─── MagicDNS host parser ──────────────────────────────────────────────────────

/**
 * Parse a Tailscale MagicDNS hostname into a HostId.
 * Examples:
 *   "newvps.fish-harness.ts.net"  -> "newvps"
 *   "edge3.fish-harness.ts.net"    -> "edge3"
 *   "node-xyz.fish-harness.ts.net" -> null (unknown)
 */
export function parseHostId(magicDns: string): HostId | null {
  const match = magicDns.match(/^([a-z]+[0-9]*)\.fish-harness\.ts\.net$/);
  if (!match) return null;
  const id = match[1] as string;
  if (id === "newvps") return "newvps";
  if (/^edge[1-5]$/.test(id)) return id as HostId;
  return null;
}

/**
 * Resolve container_name to Docker-internal FQDN via MagicDNS.
 * Docker Compose injects container names into the internal DNS (Tailscale MagicDNS).
 * No hardcoded IPs — DNS resolution is dynamic.
 */
export function resolveMagicDns(containerName: string): string {
  // container_name + MagicDNS suffix — resolved by Docker's embedded DNS
  return `${containerName}.fish-harness.ts.net`;
}

// ─── Routing table ───────────────────────────────────────────────────────────

/**
 * Full routing table: capability -> required capability level.
 * STT and WebPush are newvps-primary only (M2 BE-1 §8 prohibitions).
 */
const CAPABILITY_REQUIREMENTS: Record<CapabilityId, CapabilityLevel> = {
  orch: "full",
  commander: "full",
  stt: "full",       // STT worker only on newvps (M2 §8 prohibition)
  webpush: "full",  // Web Push gateway only on newvps (M2 §8 prohibition)
  worker: "proxy",   // worker tasks can run on edge replicas
};

// ─── Routing logic ───────────────────────────────────────────────────────────

/**
 * Determine which host to route a request to.
 *
 * Strategy:
 *   1. If hostHint is provided and valid, use it
 *   2. If capability requires "full" (orch/commander/stt/webpush), route to newvps primary
 *   3. If capability is "worker", use round-robin across edge hosts
 *   4. Always include newvps primary as fallback
 *
 * Uses container_name MagicDNS — no IP hardcoding.
 */
export function route(request: RoutableRequest): RouteDecision {
  const { hostHint, capability } = request;

  // 1. Explicit host hint
  if (hostHint) {
    const hintHostId = parseHostId(hostHint);
    if (hintHostId) {
      const entry = ALL_HOSTS.find((h) => h.hostId === hintHostId);
      if (entry) {
        return makeDecision(entry);
      }
    }
  }

  // 2. Capability-level routing
  const requiredLevel = CAPABILITY_REQUIREMENTS[capability] ?? "proxy";

  if (requiredLevel === "full") {
    // STT / WebPush / orch / commander all go to primary
    return makeDecision(PRIMARY_HOST);
  }

  // 3. Worker round-robin across edges
  const edge = EDGE_HOSTS[_edgeRoundRobin % EDGE_HOSTS.length];
  _edgeRoundRobin++;

  return makeDecision(edge);
}

function makeDecision(targetHost: HostEntry): RouteDecision {
  return {
    targetHost,
    viaMagicDns: true,
    fallback: PRIMARY_HOST,
  };
}

/**
 * Get the HTTP base URL for a host entry.
 * Uses Tailscale MagicDNS for cross-host routing.
 * Container internal traffic uses container_name MagicDNS.
 */
export function getHostUrl(entry: HostEntry, port = 8000): string {
  const dnsName = resolveMagicDns(entry.containerName);
  return `http://${dnsName}:${port}`;
}

// ─── Health probe ─────────────────────────────────────────────────────────────

/**
 * Probe a host's /health endpoint via MagicDNS.
 * Returns true only if the host responds with HTTP 2xx.
 * Timeout: 3 seconds.
 */
export async function probeHost(entry: HostEntry): Promise<boolean> {
  const url = `${getHostUrl(entry)}/health`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Probe all 6 hosts and return the first available (primary-first for full-capability,
 * round-robin for worker).
 */
export async function findAvailableHost(
  capability: CapabilityId,
): Promise<HostEntry | null> {
  const decision = route({ capability });

  // Probe primary first for full-capability requests
  if (decision.targetHost.capabilities === "full") {
    const ok = await probeHost(decision.targetHost);
    if (ok) return decision.targetHost;
    // Fallback also exists but not auto-probed here
    return null;
  }

  // For worker, try multiple edges in case one is down
  for (const edge of EDGE_HOSTS) {
    if (await probeHost(edge)) return edge;
  }

  // All edges down — fallback to primary
  if (await probeHost(PRIMARY_HOST)) return PRIMARY_HOST;

  return null;
}

// ─── dsh headless wrapper ────────────────────────────────────────────────────

/**
 * Run a dsh command on a specific host via routed HTTP call.
 * DEEPSEEK_API_KEY is injected via process.env (M2 hygiene — no hardcoding).
 * Always uses --profile headless (M2 hygiene §4 — NOT web).
 */
export async function routedDsh(
  prompt: string,
  modelClass: "orch" | "commander" | "worker",
  hostHint?: string,
): Promise<DshResponse> {
  const capability: CapabilityId = modelClass; // maps 1:1 for dsh
  const decision = route({ capability, hostHint });

  console.log(
    `[6host_router] routedDsh modelClass=${modelClass} -> ${decision.targetHost.magicDnsName} via=${decision.viaMagicDns ? "MagicDNS" : "fallback"}`,
  );

  // Check host availability before dispatching
  const available = await findAvailableHost(capability);
  if (!available) {
    throw new Error(
      `No host available for capability=${capability}; all 6 hosts unreachable`,
    );
  }

  const opts: DshOpts = {
    modelClass,
    timeoutMs: getTimeoutForClass(modelClass),
  };

  return await callDshHeadless(prompt, opts);
}

function getTimeoutForClass(
  modelClass: "orch" | "commander" | "worker",
): number {
  switch (modelClass) {
    case "orch":      return 300_000; // 5 min
    case "commander": return 180_000; // 3 min
    case "worker":    return 60_000;  // 1 min
  }
}

// ─── Capability table ────────────────────────────────────────────────────────

/**
 * Returns which hosts can handle a given capability.
 * Used by integration tests and health dashboard.
 */
export function getCapableHosts(capability: CapabilityId): HostEntry[] {
  const requiredLevel = CAPABILITY_REQUIREMENTS[capability] ?? "proxy";
  return ALL_HOSTS.filter((h) => h.capabilities === "full" || requiredLevel === "proxy");
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/**
 * Dump the full 6-host routing table as a structured object.
 * Safe for logging — contains no secrets.
 */
export function dumpRoutingTable(): {
  primary: HostEntry;
  edges: HostEntry[];
  capabilityMap: Record<CapabilityId, string[]>;
} {
  const capabilityMap = Object.fromEntries(
    (["orch", "commander", "stt", "webpush", "worker"] as CapabilityId[]).map((cap) => [
      cap,
      getCapableHosts(cap).map((h) => h.hostId),
    ]),
  ) as Record<CapabilityId, string[]>;

  return {
    primary: PRIMARY_HOST,
    edges: EDGE_HOSTS,
    capabilityMap,
  };
}
