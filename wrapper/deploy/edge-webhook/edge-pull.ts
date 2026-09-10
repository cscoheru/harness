/**
 * edge-pull.ts — Edge webhook receiver for git pull + compose reload (v1.2.0e.1).
 *
 * Bound to 127.0.0.1:7777 (exposed via Tailscale Funnel per docs/deploy/6host-deploy.md §2).
 * Receives GitHub webhook POSTs from `.github/workflows/deploy.yml` `notify-edge` job
 * on `v*` tag events; verifies HMAC SHA-256 against /etc/edge-webhook.env secret,
 * then runs `git -C /opt/fish-harness pull origin main` + `docker compose
 * -f deploy/6host-compose.edgeN.yml up -d`.
 *
 * Why this exists (per D5 + D6 + F45):
 *   - Edge hosts (5× per v1.1 M2) use bind-mount `..:/app:ro`; without an automated
 *     update path, the host repo can advance but the container runs stale code.
 *   - Observed edge1=puer-hk at HEAD 57dae79 (v1.2.0b) while main was at 73f97fc
 *     (v1.2.0d.4) — caused the 2026-09-09 puer-hk `timer.unref()` restart-loop
 *     emergency (see fish-harness-v1.2.0e.1-puerhk-restart-loop-emergency.md).
 *
 * Security (per D6 + L8):
 *   - Per-host HMAC secret at /etc/edge-webhook.env (chmod 600).
 *   - HMAC SHA-256 of RAW request body vs `X-Hub-Signature-256: sha256=<hex>`.
 *   - Wrong/missing signature → 401 Unauthorized, no reload happens.
 *   - bind 127.0.0.1:7777 only (Funnel handles public exposure + ACL).
 *
 * @file wrapper/deploy/edge-webhook/edge-pull.ts
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

// ─── Configuration ──────────────────────────────────────────────────────────

const PORT = Number(process.env["EDGE_WEBHOOK_PORT"] ?? 7777);
const HOST = process.env["EDGE_WEBHOOK_HOST"] ?? "127.0.0.1";
const REPO_DIR = process.env["EDGE_REPO_DIR"] ?? "/opt/fish-harness";
const COMPOSE_FILE = process.env["EDGE_COMPOSE_FILE"]
  ?? "/opt/fish-harness/deploy/6host-compose.edge1.yml";
const SECRET = readSecret();

function readSecret(): string {
  // Read from /etc/edge-webhook.env (chmod 600, root-owned) — format: KEY=value.
  // Falls back to env var for unit tests / local dev.
  try {
    const txt = readFileSync("/etc/edge-webhook.env", "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^EDGE_WEBHOOK_SECRET=(.+)$/);
      if (m) return m[1].trim();
    }
  } catch {
    // file missing — fall through to env
  }
  const env = process.env["EDGE_WEBHOOK_SECRET"];
  if (!env) {
    console.error("[edge-webhook] FATAL: EDGE_WEBHOOK_SECRET not set");
    process.exit(1);
  }
  return env;
}

// ─── HMAC verification (per D6) ──────────────────────────────────────────────

function verifyHmac(rawBody: string, header: string | undefined): boolean {
  if (!header) return false;
  // GitHub format: "sha256=<hex>"; tolerate absent prefix for non-GH callers.
  const hex = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", SECRET).update(rawBody).digest("hex");
  if (expected.length !== hex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(hex));
  } catch {
    return false;
  }
}

// ─── Shell command runner ────────────────────────────────────────────────────

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, timeout: timeoutMs });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout, stderr, code });
    });
    child.on("error", (err) => {
      resolve({ ok: false, stdout, stderr: stderr + `\n[spawn error] ${String(err)}`, code: -1 });
    });
  });
}

// ─── Request handler (exported for unit testing) ────────────────────────────

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Only POST /webhook accepted. Tailscale Funnel with `--set-path=/webhook`
  // STRIPS that prefix before forwarding, so the backend sees `/` for public
  // POSTs to `/webhook`; accept both forms (direct :7777 access still uses
  // `/webhook`, Funnel-routed traffic arrives as `/`).
  const urlPath = (req.url ?? "/").split("?")[0];
  if (req.method !== "POST" || (urlPath !== "/webhook" && urlPath !== "/")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found", path: urlPath }));
    return;
  }

  // Read raw body (HMAC needs bytes, not parsed JSON).
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");

  // Verify HMAC.
  if (!verifyHmac(rawBody, req.headers["x-hub-signature-256"] as string | undefined)) {
    console.warn("[edge-webhook] 401 invalid signature");
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_signature" }));
    return;
  }

  // Parse payload (GitHub sends {ref, after, repository:{...}}).
  let payload: { ref?: string; commit?: string; after?: string } = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // tolerate non-JSON payloads (e.g., test ping)
  }
  const ref = payload.ref ?? "unknown";
  const commit = payload.commit ?? payload.after ?? "unknown";

  console.log(`[edge-webhook] valid signature; ref=${ref} commit=${commit.slice(0, 12)}`);

  // Idempotent: if HEAD already at the commit, skip pull + reload.
  const headResult = await run("git", ["rev-parse", "HEAD"], REPO_DIR, 10_000);
  if (headResult.ok && headResult.stdout.trim() === commit) {
    console.log(`[edge-webhook] already at ${commit.slice(0, 12)}; noop`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "noop", commit, compose: "skipped" }));
    return;
  }

  // Step 1: git pull.
  const pullStart = Date.now();
  const pull = await run("git", ["pull", "origin", "main"], REPO_DIR, 60_000);
  const pullMs = Date.now() - pullStart;
  if (!pull.ok) {
    console.error(`[edge-webhook] git pull failed (${pullMs}ms): ${pull.stderr}`);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "git_pull_failed", elapsed_ms: { pull: pullMs }, stderr: pull.stderr.slice(0, 1000) }));
    return;
  }
  console.log(`[edge-webhook] git pull ok (${pullMs}ms)`);

  // Step 2: rebuild wrapper (host-side, so the bind-mounted /app picks up new code).
  // Use --incremental to keep a .tsbuildinfo cache; first run ~30s (full), subsequent ~1-3s
  // (only changed files recompiled). Cache file lives at /opt/fish-harness/wrapper/.tsbuildinfo
  // and is excluded from git via .gitignore.
  const buildStart = Date.now();
  const build = await run("./node_modules/.bin/tsc", ["--incremental"], `${REPO_DIR}/wrapper`, 120_000);
  const buildMs = Date.now() - buildStart;
  if (!build.ok) {
    console.error(`[edge-webhook] tsc failed (${buildMs}ms): ${build.stderr}`);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "tsc_failed", elapsed_ms: { pull: pullMs, build: buildMs }, stderr: build.stderr.slice(0, 1000) }));
    return;
  }
  console.log(`[edge-webhook] tsc ok (${buildMs}ms)`);

  // Step 3: docker compose up -d (per-host compose file from env).
  // `--remove-orphans` cleans up any stale containers from prior versions
  // (e.g. v1.2.0b `harness-edge-worker` vs v1.2.0e.1 `harness-edge1-wrapper`)
  // whose name no longer matches the compose service, freeing 0.0.0.0:4001.
  const composeStart = Date.now();
  const compose = await run("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d", "--remove-orphans"], REPO_DIR, 120_000);
  const composeMs = Date.now() - composeStart;
  if (!compose.ok) {
    console.error(`[edge-webhook] compose up failed (${composeMs}ms): ${compose.stderr}`);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "compose_up_failed", elapsed_ms: { pull: pullMs, build: buildMs, compose: composeMs }, stderr: compose.stderr.slice(0, 1000) }));
    return;
  }
  console.log(`[edge-webhook] compose up ok (${composeMs}ms)`);

  // Step 4: self-restart edge-webhook.service so the in-memory process loads
  // the new source code we just pulled + tsc'd (per L15 / v1.2.0e.3 M-class
  // gap). Uses `spawn` with `detached: true` + `unref()` so the child runs
  // independently; `systemctl restart --no-block` makes systemctl return
  // immediately and let systemd schedule the restart asynchronously. The
  // current process is SIGTERM'd by systemd after the response is flushed;
  // the existing SIGTERM handler closes the server gracefully and exits.
  // Edge cases:
  //   - If systemctl is unavailable (no systemd), the spawn error is logged
  //     but the response still returns 200 (the reload already succeeded;
  //     the next webhook will pick up the new code).
  //   - If the SIGTERM arrives before res.end() flushes, the response is
  //     dropped (caller sees connection reset). Mitigated by Node's
  //     res.end() being synchronous in writing to the OS socket buffer.
  const restartStart = Date.now();
  try {
    const selfRestart = spawn("systemctl", ["restart", "edge-webhook.service", "--no-block"], {
      detached: true,
      stdio: "ignore",
    });
    selfRestart.unref();
    selfRestart.on("error", (err) => {
      console.warn(`[edge-webhook] self-restart spawn error (non-fatal): ${String(err)}`);
    });
  } catch (err) {
    console.warn(`[edge-webhook] self-restart threw (non-fatal): ${String(err)}`);
  }

  // v1.2.0g NEW (per G1): Step 5 docker restart wrapper container so the
  // bind-mount + node build/server.js in-memory JS reloads. Parallels Step 4
  // pattern (detached + unref + non-fatal). Container name per-host via
  // EDGE_WRAPPER_CONTAINER env var (default harness-edge1-wrapper; install.sh
  // writes per-edge value to /etc/edge-webhook.env). docker restart default =
  // 10s SIGTERM grace then SIGKILL — acceptable ~1-2s wrapper downtime per
  // edge deploy. Root cause: `docker compose up -d` is a no-op when image +
  // config unchanged, so the running container keeps OLD in-memory code
  // despite disk updates. Step 5 closes this v1.2.0f NEW M-class gap.
  const wrapperContainer = process.env["EDGE_WRAPPER_CONTAINER"] ?? "harness-edge1-wrapper";
  try {
    const wrapperRestart = spawn("docker", ["restart", wrapperContainer], {
      detached: true,
      stdio: "ignore",
    });
    wrapperRestart.unref();
    wrapperRestart.on("error", (err) => {
      console.warn(`[edge-webhook] docker restart ${wrapperContainer} spawn error (non-fatal): ${String(err)}`);
    });
  } catch (err) {
    console.warn(`[edge-webhook] docker restart ${wrapperContainer} threw (non-fatal): ${String(err)}`);
  }

  const restartMs = Date.now() - restartStart;
  console.log(`[edge-webhook] self+wrapper restart scheduled (${restartMs}ms; --no-block + docker restart ${wrapperContainer})`);

  const totalMs = pullMs + buildMs + composeMs;
  console.log(`[edge-webhook] ok; pulled ${commit.slice(0, 12)} + reloaded; total=${totalMs}ms (pull=${pullMs} build=${buildMs} compose=${composeMs} restart=${restartMs})`);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, status: "reloaded", commit, compose: "up_to_date", elapsed_ms: { pull: pullMs, build: buildMs, compose: composeMs, restart: restartMs, total: totalMs + restartMs } }));
}

// ─── Server boot ────────────────────────────────────────────────────────────

if (!SECRET) {
  console.error("[edge-webhook] FATAL: EDGE_WEBHOOK_SECRET not set; refusing to start");
  process.exit(1);
}

// Skip auto-boot when imported in unit tests (e.g., EDGE_WEBHOOK_NO_BOOT=1).
if (process.env["EDGE_WEBHOOK_NO_BOOT"] !== "1") {
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(`[edge-webhook] handler error: ${String(err)}`);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "internal_error", message: String(err) }));
      }
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`[edge-webhook] listening on ${HOST}:${PORT}; repo=${REPO_DIR}; compose=${COMPOSE_FILE}`);
  });

  // Graceful shutdown.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      console.log(`[edge-webhook] ${sig} received; closing`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 5000).unref();
    });
  }
}
