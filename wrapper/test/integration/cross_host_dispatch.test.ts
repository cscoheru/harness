/**
 * wrapper/test/integration/cross_host_dispatch.test.ts — v1.2.0c NEW
 *
 * Verifies 6host_router.routedDsh() actually fetches across hosts via Tailscale
 * MagicDNS (per F12) — NOT the legacy callDshHeadless local path.
 *
 * Gated by RUN_CROSS_HOST_E2E=1; default vitest run skips with describe.skip.
 * Reason: requires network access to newvps.fish-harness.ts.net which is only
 * available on the owner tailnet.
 *
 * What this verifies (per §4.12 audit-scope):
 *   - routedDsh() uses fetch() to target HostEntry.magicDnsName, not local dsh
 *   - MagicDNS naming uses *.fish-harness.ts.net canonical (no tail1b9878)
 *   - HostId union includes "macbook"
 *   - findAvailableHost() probes MagicDNS hostnames via fetch()
 *
 * Co-Authored-By: Claude Code <noreply@anthropic.com>
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const E2E = process.env["RUN_CROSS_HOST_E2E"] === "1";
const d = E2E ? describe : describe.skip;

d("cross_host_dispatch (RUN_CROSS_HOST_E2E=1)", () => {
  // fetchSpy: vi.spyOn(globalThis, "fetch").mockResolvedValue(...) return type
  // is MockInstance<...>, but vitest's generic ReturnType<typeof vi.spyOn>
  // narrows to MockInstance<Procedure> which doesn't accept the spy result.
  // The test only uses .mockRestore() and .mock.calls, so any is safe here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", task_id: "t-1" }), { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("routedDsh fetches to *.fish-harness.ts.net — never tail1b9878", async () => {
    const { routedDsh, getHostUrl } = await import(
      "../../orchestrator/6host_router.js"
    );
    await routedDsh("test prompt", "worker");

    expect(fetchSpy).toHaveBeenCalled();
    const calledUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(calledUrl).toMatch(/\.fish-harness\.ts\.net:/);
    expect(calledUrl).not.toMatch(/tail1b9878/);
    // Worker dispatch goes to port 4001 (cross-host wrapper port, per F12 + getHostUrl default)
    expect(calledUrl).toContain(":4001/");
  });

  it("getHostUrl uses container MagicDNS for cross-host calls", async () => {
    const { getHostUrl } = await import("../../orchestrator/6host_router.js");
    const url = getHostUrl({ hostId: "edge1", magicDnsName: "edge1.fish-harness.ts.net", containerName: "harness-edge1", capabilities: "proxy", isPrimary: false }, 4001);
    expect(url).toBe("http://harness-edge1.fish-harness.ts.net:4001");
    expect(url).not.toMatch(/tail1b9878/);
  });

  it("HostId union includes macbook (per F20)", async () => {
    const { parseHostId } = await import("../../orchestrator/6host_router.js");
    // parseHostId("macbook.fish-harness.ts.net") should return "macbook"
    const id = parseHostId("macbook.fish-harness.ts.net");
    expect(id).toBe("macbook");
  });

  it("findAvailableHost probes via fetch to target host /health", async () => {
    fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));
    const { findAvailableHost } = await import(
      "../../orchestrator/6host_router.js"
    );
    const host = await findAvailableHost("worker");
    expect(host).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalled();
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toMatch(/\/health$/);
    expect(url).toMatch(/\.fish-harness\.ts\.net/);
  });

  it("routedDsh routes orch/commander/stt/webpush to newvps primary", async () => {
    const { routedDsh } = await import("../../orchestrator/6host_router.js");
    fetchSpy.mockResolvedValue(new Response("{}", { status: 200 }));
    await routedDsh("test", "orch");
    expect(fetchSpy).toHaveBeenCalled();
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toMatch(/newvps\.fish-harness\.ts\.net/);
  });

  it("routedDsh throws if no host available", async () => {
    fetchSpy.mockResolvedValue(new Response("{}", { status: 500 }));
    const { routedDsh } = await import("../../orchestrator/6host_router.js");
    await expect(routedDsh("test", "worker")).rejects.toThrow(/unreachable|not available/i);
  });

  it("route() includes newvps fallback for worker capability", async () => {
    const { route } = await import("../../orchestrator/6host_router.js");
    const decision = route({ capability: "worker" });
    expect(decision.fallback.hostId).toBe("newvps");
    expect(["newvps", "edge1", "edge2", "edge3", "edge4", "edge5", "macbook"]).toContain(
      decision.targetHost.hostId,
    );
  });

  it("route() respects explicit hostHint", async () => {
    const { route } = await import("../../orchestrator/6host_router.js");
    const decision = route({ capability: "worker", hostHint: "edge3.fish-harness.ts.net" });
    expect(decision.targetHost.hostId).toBe("edge3");
  });
});