/**
 * edge-webhook.test.ts — unit tests for wrapper/deploy/edge-webhook/edge-pull.ts
 * (v1.2.0e.1 NEW per D5/D6 + §4.22 audit-scope).
 *
 * Coverage:
 *   - HMAC SHA-256 verification (correct / wrong / missing signature)
 *   - 404 for non-POST / non-/webhook routes
 *   - Idempotent re-call when HEAD already matches commit
 *   - 500 on git pull / tsc / compose up failure (with stderr excerpt)
 *   - 200 + reload on valid HMAC + new commit
 *
 * Strategy: Set EDGE_WEBHOOK_NO_BOOT=1 before importing edge-pull.ts so the
 * module-level createServer() boot is skipped; then exercise the exported
 * `handle()` function directly with synthetic IncomingMessage / ServerResponse.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";

// IMPORTANT: set EDGE_WEBHOOK_NO_BOOT BEFORE the module is imported so that
// the server-boot block at module bottom is skipped.
process.env["EDGE_WEBHOOK_NO_BOOT"] = "1";

// We must mock child_process.spawn BEFORE importing edge-pull.ts (which uses
// spawn at runtime inside the handle() function).
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import * as cp from "node:child_process";
import { readFileSync } from "node:fs";

// Provide a static secret via fs mock so readSecret() finds it.
const STATIC_SECRET = "test-secret-32bytes-aaaaaaaaaaaa";

beforeEach(() => {
  vi.mocked(readFileSync).mockImplementation((p: unknown) => {
    if (typeof p === "string" && p === "/etc/edge-webhook.env") {
      return `EDGE_WEBHOOK_SECRET=${STATIC_SECRET}\n`;
    }
    throw new Error(`mock readFileSync: unexpected path ${String(p)}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeReq(method: string, url: string, body: string, signature: string | null): IncomingMessage {
  // Readable.from(buffer) provides the async iterator needed by
  // `for await (const chunk of req)` inside handle().
  const stream = Readable.from(Buffer.from(body, "utf8")) as IncomingMessage;
  stream.method = method;
  stream.url = url;
  stream.headers = signature
    ? { "x-hub-signature-256": signature, "content-type": "application/json" }
    : { "content-type": "application/json" };
  return stream;
}

class FakeRes extends Writable {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = "";
  headersSent = false;

  writeHead(code: number, h?: Record<string, string>) {
    this.statusCode = code;
    if (h) Object.assign(this.headers, h);
    this.headersSent = true;
    return this;
  }

  // Match the Writable base signatures (3 overloads): end(cb), end(chunk, cb),
  // end(chunk, encoding, cb). All three resolve to capturing body when given.
  end(chunk?: unknown, _encoding?: unknown, _cb?: unknown): this {
    if (chunk !== undefined && chunk !== null && typeof chunk !== "function") {
      this.body = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    }
    this.emit("close");
    return this;
  }
}

function sign(body: string, secret = STATIC_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

async function loadHandler() {
  const mod = await import("../../deploy/edge-webhook/edge-pull.js");
  return mod as { handle: (req: IncomingMessage, res: ServerResponse) => Promise<void> };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("edge-webhook HMAC verification", () => {
  it("rejects POST with missing signature header → 401", async () => {
    const { handle } = await loadHandler();
    const req = makeReq("POST", "/webhook", '{"ref":"v1.2.0e.1"}', null);
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toMatchObject({ error: "invalid_signature" });
  });

  it("rejects POST with wrong signature → 401", async () => {
    const { handle } = await loadHandler();
    const req = makeReq("POST", "/webhook", '{"ref":"v1.2.0e.1"}', "sha256=deadbeefcafebabe");
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(401);
  });

  it("accepts POST with correct HMAC signature → 200", async () => {
    const { handle } = await loadHandler();
    const body = JSON.stringify({ ref: "v1.2.0e.1", commit: "abc1234567890def" });
    // Mock spawn: 1st call = git rev-parse HEAD returns old commit (not equal to abc1234)
    // 2nd call = git pull returns success
    // 3rd call = tsc --incremental returns success (v1.2.0e.3 E1)
    // 4th call = docker compose up returns success
    vi.mocked(cp.spawn)
      .mockImplementationOnce(makeSuccessSpawn("oldhead1234") as never)
      .mockImplementationOnce(makeSuccessSpawn("Already up to date.") as never)
      .mockImplementationOnce(makeSuccessSpawn("") as never)
      .mockImplementationOnce(makeSuccessSpawn("Container edge-wrapper  Started") as never);
    const req = makeReq("POST", "/webhook", body, sign(body));
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed).toMatchObject({ ok: true, status: "reloaded" });
    // v1.2.0e.3 NEW (E2): elapsed_ms for all 3 steps + total in success response
    expect(parsed.elapsed_ms).toMatchObject({
      pull: expect.any(Number),
      build: expect.any(Number),
      compose: expect.any(Number),
      total: expect.any(Number),
    });
    // Total should equal sum of parts (within tolerance)
    expect(parsed.elapsed_ms.total).toBeGreaterThanOrEqual(
      parsed.elapsed_ms.pull + parsed.elapsed_ms.build + parsed.elapsed_ms.compose - 50,
    );
  });
});

describe("edge-webhook routing", () => {
  it("404 on GET /", async () => {
    const { handle } = await loadHandler();
    const req = makeReq("GET", "/", "", null);
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(404);
  });

  it("404 on POST /not-webhook", async () => {
    const { handle } = await loadHandler();
    const req = makeReq("POST", "/not-webhook", "{}", null);
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(404);
  });

  it("accepts POST / with valid HMAC (Funnel strips /webhook prefix)", async () => {
    // Tailscale Funnel with --set-path=/webhook strips the matched prefix
    // before forwarding to the backend, so public POSTs to /webhook arrive
    // at the Node handler as POST /. The handler must accept both forms.
    const { handle } = await loadHandler();
    const commit = "newheadabc456";
    vi.mocked(cp.spawn)
      .mockImplementationOnce(makeSuccessSpawn("oldhead1234") as never)
      .mockImplementationOnce(makeSuccessSpawn("Already up to date.") as never)
      .mockImplementationOnce(makeSuccessSpawn("") as never)
      .mockImplementationOnce(makeSuccessSpawn("Container edge-wrapper  Started") as never);
    const body = JSON.stringify({ ref: "v1.2.0e.2", commit });
    const req = makeReq("POST", "/", body, sign(body));
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, status: "reloaded" });
  });
});

describe("edge-webhook idempotence", () => {
  it("returns noop when git HEAD already matches commit", async () => {
    const { handle } = await loadHandler();
    const commit = "currentheadabc123";
    // First spawn returns git rev-parse HEAD = "currentheadabc123"
    vi.mocked(cp.spawn).mockImplementationOnce(makeSuccessSpawn(commit) as never);
    const body = JSON.stringify({ ref: "v1.2.0e.1", commit });
    const req = makeReq("POST", "/webhook", body, sign(body));
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, status: "noop" });
  });
});

describe("edge-webhook v1.2.0e.3 incremental tsc (E1)", () => {
  it("invokes tsc with --incremental flag for incremental compile cache", async () => {
    const { handle } = await loadHandler();
    const body = JSON.stringify({ ref: "v1.2.0e.3", commit: "newheadabc456" });
    const spawnSpy = vi.mocked(cp.spawn);
    spawnSpy
      .mockImplementationOnce(makeSuccessSpawn("oldhead1234") as never) // rev-parse
      .mockImplementationOnce(makeSuccessSpawn("Already up to date.") as never) // git pull
      .mockImplementationOnce(makeSuccessSpawn("") as never) // tsc
      .mockImplementationOnce(makeSuccessSpawn("Container edge-wrapper Started") as never); // compose
    const req = makeReq("POST", "/webhook", body, sign(body));
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(200);

    // 3rd spawn (index 2) = tsc — must include --incremental flag (E1)
    const tscCall = spawnSpy.mock.calls[2];
    expect(tscCall[0]).toBe("./node_modules/.bin/tsc");
    expect(tscCall[1]).toContain("--incremental");
    // cwd must be wrapper dir (3rd arg of spawn)
    expect((tscCall[2] as { cwd?: string }).cwd).toBe("/opt/fish-harness/wrapper");
  });
});

describe("edge-webhook failure modes", () => {
  it("500 on git pull failure with stderr excerpt", async () => {
    const { handle } = await loadHandler();
    vi.mocked(cp.spawn)
      .mockImplementationOnce(makeSuccessSpawn("oldhead1234") as never) // rev-parse
      .mockImplementationOnce(makeFailureSpawn("fatal: not a git repo") as never); // pull
    const body = JSON.stringify({ ref: "v1.2.0e.1", commit: "newcommit5678" });
    const req = makeReq("POST", "/webhook", body, sign(body));
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(res.body);
    expect(parsed).toMatchObject({ error: "git_pull_failed" });
    expect(parsed.stderr).toContain("fatal: not a git repo");
    // v1.2.0e.3 NEW (E2): elapsed_ms reported per step in failure response
    expect(parsed.elapsed_ms).toMatchObject({ pull: expect.any(Number) });
  });

  it("500 on tsc failure", async () => {
    const { handle } = await loadHandler();
    vi.mocked(cp.spawn)
      .mockImplementationOnce(makeSuccessSpawn("oldhead1234") as never) // rev-parse
      .mockImplementationOnce(makeSuccessSpawn("Already up to date.") as never) // pull
      .mockImplementationOnce(makeFailureSpawn("error TS1234: type mismatch") as never); // tsc
    const body = JSON.stringify({ ref: "v1.2.0e.1", commit: "newcommit5678" });
    const req = makeReq("POST", "/webhook", body, sign(body));
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(res.body);
    expect(parsed).toMatchObject({ error: "tsc_failed" });
    expect(parsed.stderr).toContain("error TS1234");
    expect(parsed.elapsed_ms).toMatchObject({ pull: expect.any(Number), build: expect.any(Number) });
  });

  it("500 on compose up failure", async () => {
    const { handle } = await loadHandler();
    vi.mocked(cp.spawn)
      .mockImplementationOnce(makeSuccessSpawn("oldhead1234") as never) // rev-parse
      .mockImplementationOnce(makeSuccessSpawn("Already up to date.") as never) // pull
      .mockImplementationOnce(makeSuccessSpawn("") as never) // tsc
      .mockImplementationOnce(makeFailureSpawn("Error: no such service") as never); // compose
    const body = JSON.stringify({ ref: "v1.2.0e.1", commit: "newcommit5678" });
    const req = makeReq("POST", "/webhook", body, sign(body));
    const res = new FakeRes();
    await handle(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toMatchObject({ error: "compose_up_failed" });
  });
});

// ─── Spawn mock helpers ─────────────────────────────────────────────────────

function makeSuccessSpawn(stdout: string) {
  return () => {
    const EventEmitter = require("node:events").EventEmitter;
    const child: any = new EventEmitter();
    child.stdout = new (require("node:stream").Readable)({ read() {} });
    child.stderr = new (require("node:stream").Readable)({ read() {} });
    process.nextTick(() => {
      child.stdout.emit("data", Buffer.from(stdout, "utf8"));
      child.emit("close", 0);
    });
    return child;
  };
}

function makeFailureSpawn(stderr: string) {
  return () => {
    const EventEmitter = require("node:events").EventEmitter;
    const child: any = new EventEmitter();
    child.stdout = new (require("node:stream").Readable)({ read() {} });
    child.stderr = new (require("node:stream").Readable)({ read() {} });
    process.nextTick(() => {
      child.stderr.emit("data", Buffer.from(stderr, "utf8"));
      child.emit("close", 1);
    });
    return child;
  };
}