import { describe, it } from 'vitest';

describe('env diag', () => {
  it('shows env state', () => {
    console.log('[diag] cwd=', process.cwd());
    console.log('[diag] key_len=', (process.env.MINIMAX_API_KEY ?? '').length);
    console.log('[diag] key_start=', (process.env.MINIMAX_API_KEY ?? '').slice(0, 8));
  });
});
