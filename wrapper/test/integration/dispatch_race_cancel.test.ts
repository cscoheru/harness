/**
 * T-V1.2.0J+.10: orchestrator dispatch() dsh-fallback race integration test.
 *
 * Coverage (per §6 forward scope D8, deferred from v1.2.0j+.9+ closure):
 *   Validates that orchestrator.dispatch() dsh-fallback path honours a
 *   concurrent cancel(). Without the safe* helpers (v1.2.0j+.9-), the
 *   dsh-fallback path at orchestrator.ts:373-386 would unconditionally
 *   overwrite a cancelled SQLite status with 'completed'/'failed'.
 *
 * Test approach:
 *   - Mock deepseek_client to return a successful response (dsh succeeds).
 *   - Boot wrapper on ephemeral port.
 *   - Direct path: manually populate SqliteTaskStore with a task in
 *     'cancelled' status, then invoke orchestrator.dispatch() (which runs
 *     the dsh-fallback path). Verify the cancelled status is preserved.
 *   - The test bypasses /api/v1/tasks to control timing — we control when
 *     cancel() runs by pre-setting SQLite to 'cancelled' before dispatch().
 *   - HTTP layer validation: confirm GET /api/v1/tasks shows the task
 *     still in 'cancelled' status after dispatch.
 *
 * Gated by RUN_DISPATCH_RACE_CANCEL_E2E=1 (mirrors v1.2.0j+.9+
 * cancel_propagation_6host.test.ts RUN_CANCEL_6HOST=1 pattern).
 *
 * Run with:
 *   RUN_DISPATCH_RACE_CANCEL_E2E=1 npm run test:dispatch-race:e2e
 *
 * @file wrapper/test/integration/dispatch_race_cancel.test.ts
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Suppress DEEPSEEK_API_KEY auto-log at module import time
process.env["DEEPSEEK_API_KEY"] = "sk-test-key-for-dispatch-race";

// Mock deepseek_client so the dsh-fallback path in dispatch() doesn't hit
// the real network. Returns a successful response (exitCode 0).
vi.mock("../../dsh/deepseek_client.js", () => ({
  deepseekInvoke: vi.fn(async () => ({
    stdout: "mocked-ok",
    stderr: "",
    exitCode: 0,
    wallMs: 50,
    traceId: undefined,
    tokenUsage: undefined,
    denialReason: undefined,
  })),
}));

import { app } from "../../server.js";
import * as taskStoreModule from "../../orchestrator/task_store.js";
import * as queueStoreModule from "../../orchestrator/queue_store.js";
import * as workerPoolModule from "../../orchestrator/worker_pool.js";
import * as orchestratorModule from "../../orchestrator/orchestrator.js";

const shouldRun = process.env["RUN_DISPATCH_RACE_CANCEL_E2E"] === "1";

describe(
  "dispatch dsh-fallback race cancel (set RUN_DISPATCH_RACE_CANCEL_E2E=1 to run)",
  { skip: !shouldRun },
  () => {
    let tempDir: string;
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
      tempDir = mkdtempSync(join(tmpdir(), "dispatch-race-cancel-"));
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      rmSync(tempDir, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    beforeEach(async () => {
      // Fresh DB per test (mirrors cancel_propagation_6host.test.ts pattern)
      process.env["TASK_STORE_DB"] = join(tempDir, `task-${Date.now()}.db`);
      process.env["QUEUE_STORE_DB"] = join(tempDir, `queue-${Date.now()}.db`);
      process.env["WORKER_POOL_DB"] = join(tempDir, `worker-${Date.now()}.db`);
      taskStoreModule._resetTaskStoreForTests();
      queueStoreModule._resetQueueStoreForTests();
      workerPoolModule._resetWorkerPoolForTests();

      server = createServer(app);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("ephemeral server failed to bind");
      baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    // ─────────────────────────────────────────────────────────────────────
    // Test 1 — safeMarkCompleted guards cancelled status during dispatch
    //
    // Pre-populate SQLite with a task in 'cancelled' state, then call
    // orchestrator.dispatch(). The dsh-fallback path runs kernelInvoke +
    // runDsh + safeMarkCompleted. Without the D8 fix, markCompleted would
    // overwrite cancelled. With the fix, safeMarkCompleted honours cancelled
    // and returns false — status stays 'cancelled'.
    // ─────────────────────────────────────────────────────────────────────
    it("dispatch() dsh-fallback honours prior cancelled status (no overwrite)", async () => {
      const taskId = `race-cancel-${Date.now()}`;
      const store = taskStoreModule.getDefaultTaskStore();
      const now = Date.now();

      // Step 1: populate store with a task, mark as cancelled (simulating
      // orchestrator.cancel() that ran before dispatch() reached dsh-fallback)
      store.setTask({
        taskId,
        prompt: "race-test",
        modelClass: "orch",
        status: "pending",
        resultJson: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
      store.markCancelled(taskId);
      expect(store.getTask(taskId)?.status).toBe("cancelled");

      // Step 2: invoke orchestrator.dispatch(). The dsh-fallback path will
      // try to safeMarkCompleted at the end — must NOT overwrite cancelled.
      const task = {
        task_id: taskId,
        prompt: "race-test",
        workflow_pack: "orch",
        workflow_version: "1",
        input_blob_id: null,
        tenant_id: "test",
        created_at: now,
      };
      const dispatchRes = await orchestratorModule.dispatch(task);

      // Step 3: verify cancelled status is preserved
      const finalStatus = store.getTask(taskId)?.status;
      expect(finalStatus, "cancelled status must survive dsh-fallback write").toBe("cancelled");
      expect(dispatchRes.task_id).toBe(taskId);
    });

    // ─────────────────────────────────────────────────────────────────────
    // Test 2 — GET /api/v1/tasks surfaces the race-cancelled task correctly
    // ─────────────────────────────────────────────────────────────────────
    it("GET /api/v1/tasks surfaces race-cancelled task as cancelled", async () => {
      const taskId = `race-list-${Date.now()}`;
      const store = taskStoreModule.getDefaultTaskStore();
      const now = Date.now();
      store.setTask({
        taskId,
        prompt: "race-list",
        modelClass: "orch",
        status: "pending",
        resultJson: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
      store.markCancelled(taskId);

      // Run dispatch (will try to overwrite via safeMarkCompleted)
      await orchestratorModule.dispatch({
        task_id: taskId,
        prompt: "race-list",
        workflow_pack: "orch",
        workflow_version: "1",
        input_blob_id: null,
        tenant_id: "test",
        created_at: now,
      });

      // Verify HTTP list endpoint surfaces cancelled status
      const listRes = await fetch(`${baseUrl}/api/v1/tasks`);
      const body = (await listRes.json()) as {
        tasks: Array<{ task_id: string; status: string }>;
      };
      const found = body.tasks.find((t) => t.task_id === taskId);
      expect(found, "race-cancelled task should appear in listTasks").toBeDefined();
      expect(found!.status).toBe("cancelled");
    });

    // ─────────────────────────────────────────────────────────────────────
    // Test 3 — normal happy path still works (safe* don't break non-race)
    //
    // A task that is in 'running' status (NOT cancelled) should be markable
    // as 'completed' by safeMarkCompleted. This guards against the helper
    // being too conservative (always returning false).
    // ─────────────────────────────────────────────────────────────────────
    it("dispatch() happy path still completes (safe* is not over-conservative)", async () => {
      const taskId = `happy-${Date.now()}`;
      const store = taskStoreModule.getDefaultTaskStore();
      const now = Date.now();
      store.setTask({
        taskId,
        prompt: "happy-path",
        modelClass: "orch",
        status: "pending",
        resultJson: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
      store.markRunning(taskId);

      await orchestratorModule.dispatch({
        task_id: taskId,
        prompt: "happy-path",
        workflow_pack: "orch",
        workflow_version: "1",
        input_blob_id: null,
        tenant_id: "test",
        created_at: now,
      });

      const finalStatus = store.getTask(taskId)?.status;
      expect(finalStatus, "non-cancelled task should transition to terminal status").not.toBe("cancelled");
      expect(["completed", "failed"]).toContain(finalStatus);
    });
  },
);
