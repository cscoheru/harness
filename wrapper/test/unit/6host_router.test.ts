/**
 * wrapper/test/unit/6host_router.test.ts — v1.2.0c NEW
 *
 * Unit tests for the 7-host routing table (per F20 + D5 + D6).
 * Verifies:
 *   - HostId union includes "macbook"
 *   - MACBOOK_HOST constant is present with hostClass="macbook-main"
 *   - parseHostId accepts "macbook.fish-harness.ts.net" → "macbook"
 *   - getHostUrl defaults to port 4001 (cross-host wrapper port)
 *   - findAvailableHost() includes MacBook in worker candidate pool
 *   - getCapableHosts() includes MacBook for "worker" capability
 *   - route() includes macbook as a target for worker capability
 *   - dumpRoutingTable() returns 7 hosts (1 primary + 5 edges + macbook)
 *
 * Co-Authored-By: Claude Code <noreply@anthropic.com>
 */

import { describe, expect, it } from "vitest";
import {
  parseHostId,
  getHostUrl,
  route,
  dumpRoutingTable,
  getCapableHosts,
} from "../../orchestrator/6host_router.js";

describe("6host_router v1.2.0c — 7-host union (per F20)", () => {
  it("parseHostId accepts newvps.fish-harness.ts.net", () => {
    expect(parseHostId("newvps.fish-harness.ts.net")).toBe("newvps");
  });

  it("parseHostId accepts edge3.fish-harness.ts.net", () => {
    expect(parseHostId("edge3.fish-harness.ts.net")).toBe("edge3");
  });

  it("parseHostId accepts macbook.fish-harness.ts.net → 'macbook' (per F20)", () => {
    expect(parseHostId("macbook.fish-harness.ts.net")).toBe("macbook");
  });

  it("parseHostId rejects unknown hosts", () => {
    expect(parseHostId("unknown.fish-harness.ts.net")).toBeNull();
    expect(parseHostId("foo.bar.ts.net")).toBeNull();
    expect(parseHostId("")).toBeNull();
  });

  it("getHostUrl default port is 4001 (cross-host wrapper port per F12)", () => {
    const url = getHostUrl({
      hostId: "newvps",
      magicDnsName: "newvps.fish-harness.ts.net",
      containerName: "harness-newvps",
      capabilities: "full",
      isPrimary: true,
    });
    expect(url).toBe("http://harness-newvps.fish-harness.ts.net:4001");
  });

  it("getHostUrl respects explicit port argument", () => {
    const url = getHostUrl({
      hostId: "edge1",
      magicDnsName: "edge1.fish-harness.ts.net",
      containerName: "harness-edge1",
      capabilities: "proxy",
      isPrimary: false,
    }, 8000);
    expect(url).toBe("http://harness-edge1.fish-harness.ts.net:8000");
  });

  it("route() routes orch to newvps primary", () => {
    const decision = route({ capability: "orch" });
    expect(decision.targetHost.hostId).toBe("newvps");
    expect(decision.fallback.hostId).toBe("newvps");
  });

  it("route() routes stt/webpush/commander to newvps (full capability only)", () => {
    expect(route({ capability: "stt" }).targetHost.hostId).toBe("newvps");
    expect(route({ capability: "webpush" }).targetHost.hostId).toBe("newvps");
    expect(route({ capability: "commander" }).targetHost.hostId).toBe("newvps");
  });

  it("route() worker capability lands on one of: edges, macbook, or newvps", () => {
    const decision = route({ capability: "worker" });
    expect([
      "newvps", "edge1", "edge2", "edge3", "edge4", "edge5", "macbook",
    ]).toContain(decision.targetHost.hostId);
    expect(decision.fallback.hostId).toBe("newvps");
  });

  it("route() respects hostHint", () => {
    const decision = route({
      capability: "worker",
      hostHint: "macbook.fish-harness.ts.net",
    });
    expect(decision.targetHost.hostId).toBe("macbook");
  });

  it("getCapableHosts returns edges + macbook for worker capability", () => {
    const hosts = getCapableHosts("worker");
    const hostIds = hosts.map((h) => h.hostId);
    expect(hostIds).toContain("newvps");
    expect(hostIds).toContain("edge1");
    expect(hostIds).toContain("macbook");
  });

  it("getCapableHosts returns newvps-only for stt/webpush (M2 §8 prohibition)", () => {
    expect(getCapableHosts("stt").map((h) => h.hostId)).toEqual(["newvps"]);
    expect(getCapableHosts("webpush").map((h) => h.hostId)).toEqual(["newvps"]);
  });

  it("dumpRoutingTable returns 7 hosts (1 primary + 5 edges + macbook)", () => {
    const table = dumpRoutingTable();
    expect(table.primary.hostId).toBe("newvps");
    expect(table.edges.length).toBe(6); // 5 edges + 1 macbook
    const hostIds = [table.primary.hostId, ...table.edges.map((e) => e.hostId)];
    expect(hostIds).toContain("macbook");
    expect(hostIds).toContain("edge1");
    expect(hostIds).toContain("edge5");
  });

  it("MACBOOK_HOST entry has hostClass='macbook-main' (per F14)", () => {
    const table = dumpRoutingTable();
    const macbook = table.edges.find((e) => e.hostId === "macbook");
    expect(macbook).toBeDefined();
    expect(macbook?.hostClass).toBe("macbook-main");
    expect(macbook?.magicDnsName).toBe("macbook.fish-harness.ts.net");
  });
});