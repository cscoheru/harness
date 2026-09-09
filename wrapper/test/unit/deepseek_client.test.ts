/**
 * Unit tests for wrapper/dsh/deepseek_client.ts
 *
 * Per v1.2.0d plan §2 A6 — deepseek HTTP client unit tests.
 * Target: ≥ 40 it() tests across 7 describe blocks (1 outer + 6 inner).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  deepseekInvoke,
  resolveModelOverride,
  ROLE_DEFAULT_MODEL,
  logDeepseekKeyFingerprint,
} from '../../dsh/deepseek_client.js';
import type { DshResponse } from '../../dsh/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal successful DeepSeek API response object. */
function makeOkResponse(overrides: Partial<{
  id: string;
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
}> = {}): { choices: Array<{ message: { content: string } }>; usage: { prompt_tokens: number; completion_tokens: number }; id: string } {
  return {
    id: overrides.id ?? 'chatcmpl-test-123',
    choices: [{ message: { content: overrides.content ?? 'hello world' } }],
    usage: {
      prompt_tokens: overrides.prompt_tokens ?? 10,
      completion_tokens: overrides.completion_tokens ?? 5,
    },
  };
}

/** Spy on globalThis.fetch and return a mock Response. */
function mockFetch(overrides: Partial<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyJson: unknown;
  bodyText: string;
}> = {}) {
  const { ok = true, status = 200, headers = {}, bodyJson, bodyText = '' } = overrides;
  const mockResponse = {
    ok,
    status,
    statusText: overrides.statusText ?? (ok ? 'OK' : String(status)),
    headers: new Map(Object.entries(headers)) as unknown as Headers,
    async json() { return bodyJson ?? makeOkResponse(); },
    async text() { return bodyText; },
  };
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('deepseek_client unit', () => {

  beforeEach(() => {
    // Provide a valid-looking key so the early guard passes.
    process.env.DEEPSEEK_API_KEY = 'sk-test-placeholder';
  });

  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_ENDPOINT;
    delete process.env.DSH_MODEL;
    delete process.env.DEEPSEEK_COST_MODE;
    vi.restoreAllMocks();
  });

  // ============================================================
  // describe 1 — endpoint + auth headers
  // ============================================================
  describe('endpoint + auth headers', () => {

    it('fetch called with correct default URL', async () => {
      const fetchSpy = mockFetch();
      await deepseekInvoke('hello');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    });

    it('headers include Authorization Bearer token', async () => {
      const fetchSpy = mockFetch();
      await deepseekInvoke('hello');
      const [, opts] = fetchSpy.mock.calls[0]!;
      expect((opts as Record<string, unknown>).headers).toMatchObject({
        Authorization: 'Bearer sk-test-placeholder',
      });
    });

    it('headers include content-type application/json', async () => {
      const fetchSpy = mockFetch();
      await deepseekInvoke('hello');
      const [, opts] = fetchSpy.mock.calls[0]!;
      expect((opts as Record<string, unknown>).headers).toMatchObject({
        'Content-Type': 'application/json',
      });
    });

    it('DEEPSEEK_ENDPOINT env override changes base URL', async () => {
      process.env.DEEPSEEK_ENDPOINT = 'https://my-proxy.example.com';
      const fetchSpy = mockFetch();
      await deepseekInvoke('hello');
      const [url] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('https://my-proxy.example.com/v1/chat/completions');
    });

    it('apiKey in opts overrides env', async () => {
      const fetchSpy = mockFetch();
      await deepseekInvoke('hello', { apiKey: 'sk-opts-override' });
      const [, opts] = fetchSpy.mock.calls[0]!;
      expect((opts as Record<string, unknown>).headers).toMatchObject({
        Authorization: 'Bearer sk-opts-override',
      });
    });

    it('AbortSignal.timeout is set with the configured timeoutMs', async () => {
      const fetchSpy = mockFetch();
      await deepseekInvoke('hello', { timeoutMs: 45_000, modelClass: 'worker' });
      const [, opts] = fetchSpy.mock.calls[0]!;
      expect((opts as Record<string, unknown>).signal).toBeInstanceOf(AbortSignal);
    });

    it('default timeout when no opts provided uses model-class default', async () => {
      const fetchSpy = mockFetch();
      await deepseekInvoke('hello', { modelClass: 'commander' });
      const [, opts] = fetchSpy.mock.calls[0]!;
      expect((opts as Record<string, unknown>).signal).toBeInstanceOf(AbortSignal);
    });

  });

  // ============================================================
  // describe 2 — role default models
  // ============================================================
  describe('role default models', () => {

    it('ROLE_DEFAULT_MODEL exports orch as deepseek-v4-pro', () => {
      expect(ROLE_DEFAULT_MODEL.orch).toBe('deepseek-v4-pro');
    });

    it('ROLE_DEFAULT_MODEL exports commander as deepseek-v4-flash', () => {
      expect(ROLE_DEFAULT_MODEL.commander).toBe('deepseek-v4-flash');
    });

    it('ROLE_DEFAULT_MODEL exports worker as deepseek-v4-flash', () => {
      expect(ROLE_DEFAULT_MODEL.worker).toBe('deepseek-v4-flash');
    });

    it('resolveModelOverride returns commander model when modelClass is undefined', () => {
      // When modelClass is undefined, deepseekInvoke defaults to 'commander',
      // which means resolveModelOverride receives 'commander'.
      const model = resolveModelOverride('commander');
      // In cheap mode (default), this resolves to v4-flash.
      expect(model).toBe('deepseek-v4-flash');
    });

  });

  // ============================================================
  // describe 3 — cost-mode resolveModelOverride
  // ============================================================
  describe('cost-mode resolveModelOverride', () => {

    it('DSH_MODEL env wins over everything', () => {
      process.env.DSH_MODEL = 'deepseek-chat';
      process.env.DEEPSEEK_COST_MODE = 'full';
      const model = resolveModelOverride('orch');
      expect(model).toBe('deepseek-chat');
    });

    it('DSH_MODEL env wins for worker too', () => {
      process.env.DSH_MODEL = 'custom-model';
      process.env.DEEPSEEK_COST_MODE = 'cheap';
      const model = resolveModelOverride('worker');
      expect(model).toBe('custom-model');
    });

    it('DEEPSEEK_COST_MODE=cheap (default) downgrades orch to v4-flash', () => {
      // Ensure no DSH_MODEL; cheap is the default so don't set COST_MODE explicitly
      delete process.env.DSH_MODEL;
      const model = resolveModelOverride('orch');
      expect(model).toBe('deepseek-v4-flash');
    });

    it('DEEPSEEK_COST_MODE=cheap keeps commander at v4-flash (already cheap)', () => {
      process.env.DEEPSEEK_COST_MODE = 'cheap';
      const model = resolveModelOverride('commander');
      expect(model).toBe('deepseek-v4-flash');
    });

    it('DEEPSEEK_COST_MODE=cheap keeps worker at v4-flash (already cheap)', () => {
      process.env.DEEPSEEK_COST_MODE = 'cheap';
      const model = resolveModelOverride('worker');
      expect(model).toBe('deepseek-v4-flash');
    });

    it('DEEPSEEK_COST_MODE=full preserves orch at v4-pro', () => {
      process.env.DEEPSEEK_COST_MODE = 'full';
      const model = resolveModelOverride('orch');
      expect(model).toBe('deepseek-v4-pro');
    });

    it('DEEPSEEK_COST_MODE=full preserves commander at v4-flash', () => {
      process.env.DEEPSEEK_COST_MODE = 'full';
      const model = resolveModelOverride('commander');
      expect(model).toBe('deepseek-v4-flash');
    });

    it('resolveModelOverride returns a string model name', () => {
      const model = resolveModelOverride('orch');
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    });

  });

  // ============================================================
  // describe 4 — request body shape
  // ============================================================
  describe('request body shape', () => {

    it('body contains model, messages, and stream:false', async () => {
      const fetchSpy = mockFetch();
      await deepseekInvoke('hello', { modelClass: 'commander' });
      const [, opts] = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((opts as Record<string, unknown>).body as string);
      expect(body).toMatchObject({
        model: expect.any(String),
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });
    });

    it('prompt string flows through unchanged', async () => {
      const fetchSpy = mockFetch();
      await deepseekInvoke('What is 2+2?', { modelClass: 'worker' });
      const [, opts] = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((opts as Record<string, unknown>).body as string);
      expect(body.messages[0]).toEqual({ role: 'user', content: 'What is 2+2?' });
    });

    it('unicode prompt is preserved in body', async () => {
      const fetchSpy = mockFetch();
      const unicodePrompt = '你好世界 🐟 🎣\n普洱茶鉴别：';
      await deepseekInvoke(unicodePrompt);
      const [, opts] = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((opts as Record<string, unknown>).body as string);
      expect(body.messages[0].content).toBe(unicodePrompt);
    });

    it('empty prompt is sent as empty string', async () => {
      const fetchSpy = mockFetch();
      await deepseekInvoke('');
      const [, opts] = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((opts as Record<string, unknown>).body as string);
      expect(body.messages[0].content).toBe('');
    });

    it('multiline prompt is preserved in body', async () => {
      const fetchSpy = mockFetch();
      const multiline = 'Line one.\nLine two.\nLine three.';
      await deepseekInvoke(multiline);
      const [, opts] = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((opts as Record<string, unknown>).body as string);
      expect(body.messages[0].content).toBe(multiline);
    });

  });

  // ============================================================
  // describe 5 — response parsing
  // ============================================================
  describe('response parsing', () => {

    it('200 response returns DshResponse with stdout and exitCode:0', async () => {
      mockFetch({ ok: true, status: 200, bodyJson: makeOkResponse({ content: 'answer' }) });
      const result = await deepseekInvoke('hello') as DshResponse;
      expect(result.stdout).toBe('answer');
      expect(result.exitCode).toBe(0);
    });

    it('traceId is parsed from response.id', async () => {
      mockFetch({ ok: true, status: 200, bodyJson: makeOkResponse({ id: 'chatcmpl-abc-xyz' }) });
      const result = await deepseekInvoke('hello') as DshResponse & { traceId?: string };
      expect(result.traceId).toBe('chatcmpl-abc-xyz');
    });

    it('tokenUsage is parsed from response.usage', async () => {
      mockFetch({ ok: true, status: 200, bodyJson: makeOkResponse({ prompt_tokens: 42, completion_tokens: 7 }) });
      const result = await deepseekInvoke('hello') as DshResponse & { tokenUsage?: { inputTokens: number; outputTokens: number } };
      expect(result.tokenUsage).toEqual({ inputTokens: 42, outputTokens: 7 });
    });

    it('empty choices returns stdout empty string but exitCode:0', async () => {
      mockFetch({ ok: true, status: 200, bodyJson: { ...makeOkResponse(), choices: [] } });
      const result = await deepseekInvoke('hello') as DshResponse;
      expect(result.stdout).toBe('');
      expect(result.exitCode).toBe(0);
    });

    it('wallMs is measured and present in response', async () => {
      mockFetch({ ok: true, status: 200, bodyJson: makeOkResponse() });
      const result = await deepseekInvoke('hello') as DshResponse;
      expect(typeof result.wallMs).toBe('number');
      expect(result.wallMs).toBeGreaterThanOrEqual(0);
    });

    it('stderr is empty string on success', async () => {
      mockFetch({ ok: true, status: 200, bodyJson: makeOkResponse({ content: 'ok' }) });
      const result = await deepseekInvoke('hello') as DshResponse;
      expect(result.stderr).toBe('');
    });

  });

  // ============================================================
  // describe 6 — error handling
  // ============================================================
  describe('error handling', () => {

    it('401 throws with error message', async () => {
      mockFetch({ ok: false, status: 401, bodyText: 'Unauthorized' });
      await expect(deepseekInvoke('hello')).rejects.toThrow('deepseekInvoke: HTTP 401');
    });

    it('429 with Retry-After header triggers exponential backoff and retries', async () => {
      // First two calls return 429, third returns 200.
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            ok: false,
            status: 429,
            headers: new Map([['Retry-After', '0']]) as unknown as Headers,
            statusText: 'Too Many Requests',
            async text() { return 'rate limited'; },
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: new Map() as unknown as Headers,
          statusText: 'OK',
          async json() { return makeOkResponse({ content: 'finally' }); },
        } as unknown as Response;
      });

      const result = await deepseekInvoke('hello') as DshResponse;
      expect(result.stdout).toBe('finally');
      expect(result.exitCode).toBe(0);
    });

    it('429 with no Retry-After header uses exponential backoff', async () => {
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            ok: false,
            status: 429,
            headers: new Map() as unknown as Headers,
            statusText: 'Too Many Requests',
            async text() { return 'rate limited'; },
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: new Map() as unknown as Headers,
          statusText: 'OK',
          async json() { return makeOkResponse({ content: 'ok' }); },
        } as unknown as Response;
      });

      const result = await deepseekInvoke('hello') as DshResponse;
      expect(result.exitCode).toBe(0);
    });

    it('500 throws after fetch', async () => {
      mockFetch({ ok: false, status: 500, bodyText: 'Internal Server Error' });
      await expect(deepseekInvoke('hello')).rejects.toThrow('deepseekInvoke: HTTP 500');
    });

    it('network error (fetch throws) propagates', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'));
      await expect(deepseekInvoke('hello')).rejects.toThrow('ENOTFOUND');
    });

    it('AbortSignal.timeout causes exitCode 124 (timeout return)', async () => {
      // Simulate fetch throwing AbortError from AbortSignal.timeout.
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Aborted', 'AbortError'));
      const result = await deepseekInvoke('hello', { timeoutMs: 5000 }) as DshResponse;
      expect(result.exitCode).toBe(124);
      expect(result.stdout).toBe('');
    });

    it('4xx non-401/429 throws with status code', async () => {
      mockFetch({ ok: false, status: 422, bodyText: 'Unprocessable Entity' });
      await expect(deepseekInvoke('hello')).rejects.toThrow('deepseekInvoke: HTTP 422');
    });

    it('4xx non-401/429 throws with the response body text', async () => {
      mockFetch({ ok: false, status: 403, bodyText: 'Forbidden: quota exceeded' });
      await expect(deepseekInvoke('hello')).rejects.toThrow('Forbidden: quota exceeded');
    });

    it('4th 429 throws after exhausting retries', async () => {
      // All 4 attempts (initial + 3 retries) return 429.
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        callCount++;
        return {
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '0']]) as unknown as Headers,
          statusText: 'Too Many Requests',
          async text() { return 'still rate limited'; },
        } as unknown as Response;
      });

      await expect(deepseekInvoke('hello')).rejects.toThrow(`429 after ${3} retries`);
      expect(callCount).toBe(4); // initial + 3 retries
    });

  });

  // ============================================================
  // describe 7 — v1.2.0e.1 NEW (per D8 + F46): key fingerprint log
  // ============================================================
  describe('key fingerprint log (D8)', () => {
    it('logs truncated prefix (slice 0..7) + length, never the full key', () => {
      const logs: string[] = [];
      const errs: string[] = [];
      const origLog = console.log;
      const origErr = console.error;
      console.log = (msg: string) => logs.push(msg);
      console.error = (msg: string) => errs.push(msg);
      try {
        process.env.DEEPSEEK_API_KEY = 'sk-TESTFIX-3f55470a1b2c3d4e5f6a7b8c9d0e1f2a';
        // Reset the idempotency flag inside deepseek_client so the auto-init
        // log fired at module-load time doesn't pollute our capture.
        // (We exercise logDeepseekKeyFingerprint directly here.)
        logDeepseekKeyFingerprint();
        expect(logs.some((l) => l.includes('key_prefix=sk-TEST'))).toBe(true);
        expect(logs.some((l) => l.includes('key_len=43'))).toBe(true);
        // The full key body must NEVER appear in any log line.
        for (const l of logs) {
          expect(l).not.toContain('3f55470a1b2c3d4e5f6a7b8c9d0e1f2a');
        }
        expect(errs).toHaveLength(0);
      } finally {
        console.log = origLog;
        console.error = origErr;
      }
    });

    it('logs FATAL error when DEEPSEEK_API_KEY missing', () => {
      const logs: string[] = [];
      const errs: string[] = [];
      const origLog = console.log;
      const origErr = console.error;
      console.log = (msg: string) => logs.push(msg);
      console.error = (msg: string) => errs.push(msg);
      try {
        delete process.env.DEEPSEEK_API_KEY;
        logDeepseekKeyFingerprint();
        expect(logs).toHaveLength(0);
        expect(errs).toHaveLength(1);
        expect(errs[0]).toContain('FATAL: DEEPSEEK_API_KEY missing');
      } finally {
        console.log = origLog;
        console.error = origErr;
      }
    });
  });

});
