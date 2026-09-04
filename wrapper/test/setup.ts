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
}

// T-V1.2.0A-TEST-FIX: Point orchestrator.health() kernel probe at a dead port
// for unit tests so it falls through to the stub response. (Local port 8000
// may be bound by an unrelated process returning non-HealthResponse JSON.)
// Integration tests with real kernel probe should override via .env.local.
if (!process.env['HARNESS_RUNTIME_URL']) {
  process.env['HARNESS_RUNTIME_URL'] = 'http://127.0.0.1:1';
}
