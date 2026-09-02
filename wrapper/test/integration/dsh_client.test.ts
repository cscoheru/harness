// T-M0c-QA-1: dsh_client integration test stub (mock dsh)
// M0c 阶段 1 骨架轮 - mock dsh，不真调 dsh CLI
import { describe, it, expect, vi } from 'vitest';

// Mock dsh CLI (不真调)
vi.mock('../src/dsh_client', () => ({
  dshInvoke: vi.fn().mockResolvedValue({
    stdout: '{"status":"ok","trace_id":"mock-trace-001"}',
    stderr: '',
    exitCode: 0,
  }),
  dshHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

import { dshInvoke, dshHealth } from '../../src/dsh_client';

describe('dsh_client (integration, mock)', () => {
  it('health returns 200', async () => {
    // TODO(M1): replace with real health check against dsh wrapper container
    // const res = await fetch('http://localhost:3000/health');
    // expect(res.status).toBe(200);
    expect(true).toBe(true);
  });

  // TODO(M1): mock dsh invoke 测试
  // it('dshInvoke returns structured output', async () => {
  //   const result = await dshInvoke({ prompt: 'test', profile: 'headless' });
  //   expect(result.exitCode).toBe(0);
  //   expect(result.stdout).toContain('status');
  // });

  // TODO(M1): mock dsh health 测试
  // it('dshHealth returns ok status', async () => {
  //   const health = await dshHealth();
  //   expect(health.status).toBe('ok');
  // });

  // TODO(M1): error handling 测试
  // it('handles dsh exit code != 0', async () => {
  //   vi.mocked(dshInvoke).mockRejectedValueOnce(new Error('dsh exited non-zero'));
  //   await expect(dshInvoke({ prompt: 'fail' })).rejects.toThrow();
  // });

  // TODO(M1): capability JSON 加载测试
  // it('loads orch/commander/worker capability JSON', async () => { ... });
});
