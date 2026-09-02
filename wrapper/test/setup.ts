/**
 * vitest setup file — load environment from project-root .env.local
 *
 * M1c: dsh 真调集成测试需要 DEEPSEEK_API_KEY 等敏感 env。
 * 在 vitest.config.ts 通过 setupFiles 引入,优先级高于 vitest 内置 env,
 * 保证 test 启动前 process.env 已含项目级 env。
 *
 * 注意: .env.local 必须 chmod 600 且入 .gitignore (.env.* 已命中)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const envLocal = resolve(process.cwd(), '..', '.env.local');
if (existsSync(envLocal)) {
  config({ path: envLocal, override: false });
  // Debug log: confirm env loaded (only shown if DEBUG_VITEST_SETUP=1)
  if (process.env['DEBUG_VITEST_SETUP']) {
    const keyLen = (process.env['DEEPSEEK_API_KEY'] ?? '').length;
    console.log(`[vitest-setup] loaded .env.local from ${envLocal} (DEEPSEEK_API_KEY length: ${keyLen})`);
  }
} else if (process.env['DEBUG_VITEST_SETUP']) {
  console.warn(`[vitest-setup] .env.local not found at ${envLocal}`);
}
