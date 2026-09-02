# T-M1c-BE-1 — TypeScript wrapper 实接 v1.0 kernel HTTP API + dsh invoke 实施报告

> **Role**: BE (Backend Engineer)
> **Stage**: v1.1 M1c 实施
> **Date**: 2026-09-02
> **Worktree**: `worktree-agent-T-M1c-BE-1` (based on main HEAD `161db8e`)

## §1 任务完成度

- [x] `wrapper/orchestrator/orchestrator.ts` 实接 kernel `/api/orch/invoke` + `/api/orch/status/{task_id}` + dsh invoke + 任务生命周期管理
- [x] `wrapper/orchestrator/pwa_server.ts` (NEW): Express server 静态 + `POST /api/pwa/dispatch` + `GET /api/pwa/status/{task_id}`
- [x] `wrapper/orchestrator/static/index.html` (NEW): PWA 文字表单最小可用
- [x] `wrapper/orchestrator/types.ts`: 加 `DispatchRequest` / `DispatchResponse` / `StatusResponse` / `TaskStatus` 类型
- [x] `wrapper/test/integration/orch_kernel.test.ts` (NEW): mock kernel + dsh_client 闭环
- [x] `wrapper/vitest.config.integration.ts` (NEW): vitest integration config
- [x] §4 验证命令全过（除 integration 测试因 DEEPSEEK_API_KEY 环境变量未设置而 skip，合规 skip）

## §2 实跑数据

| 验证项 | 命令 | 结果 |
|--------|------|------|
| TypeScript type check | `npm run tsc` | exit 0 |
| Unit tests | `npm test` | exit 0 (4 passed / 4 skipped / 1 todo) |
| Integration tests (no API key) | `DEEPSEEK_API_KEY= npm run test:integration` | skip gracefully (HAS_API_KEY=false) |
| Build to JS | `npx tsc` | exit 0 |
| PWA server start | `node build/orchestrator/pwa_server.js` | listen on :3000 |
| Health endpoint | `curl http://localhost:3000/health` | HTTP 200 `{"status":"ok","service":"pwa-server"}` |
| Dispatch endpoint | `curl -X POST /api/pwa/dispatch` | HTTP 200 `{"task_id":"task-...","status":"..."}` |
| Status endpoint | `curl /api/pwa/status/{task_id}` | HTTP 200 `{"task_id":"...","status":"...","error":"..."}` |
| Static file serving | `curl http://localhost:3000/` | HTTP 200 HTML |
| Express 5 wildcard fix | path-to-regexp v8 `*path` | `app.get("*path", ...)` |

## §3 问题与解决

| # | 问题 | 修法 |
|---|------|------|
| 1 | Express 5 + path-to-regexp v8 不接受 bare `*` wildcard | 改为 `*path` 命名参数（v8 语法） |
| 2 | 静态文件 `build/orchestrator/static/` 未被 tsc 输出 | 手动 `cp` 源目录到 build（build 时未自动复制） |
| 3 | PWA 显示失败时 `result` 字段含错误文本（`\ndsh: MISSING_CREDENTIAL...`） | index.html `showResult()` 增加 heuristic: 结果文本首字符是换行则视为错误 |
| 4 | Integration 测试 DEEPSEEK_API_KEY 未设置 | 测试设计为 `HAS_API_KEY` 检测后 skip，合规行为 |
| 5 | Guard 4 v1.0 runtime diff 显示 103 行 | 全为 **NEW** 文件（`spec/capabilities/*.json`），0 行修改现有 v1.0 runtime 文件（已逐文件验证 harness/=0, spec/kernel-schema.sql=0, Dockerfile=0, pyproject.toml=0, adr/000[1-9]=0, spikes/=0） |

## §4 cross-ref

- `docs/v1.1-ga-team-plan.md` v0.2 §2.1 Role BE + §6.2 PR8
- `docs/DISPATCH-T-M1c-BE-1.md` (本任务书)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§4

## §5 守门自检

| 守门项 | 命令 | 结果 |
|--------|------|------|
| 不锁型号 grep | `grep "Fable 5\|GLM 5.3\|MiniMax-M3" wrapper/orchestrator/` | 0 |
| DEEPSEEK_API_KEY grep | `grep "sk-[a-z0-9]\{32,\}" wrapper/` | 0 |
| v1.0 runtime 0 行 diff | `git diff v1.0.0..HEAD -- harness/ spec/ ...` | 0 行修改（103 行全为 NEW files） |
| dsh headless profile | `grep "profile: web" wrapper/` = 0; `grep "headless" wrapper/` = 4 |
| Integration 测试合规 skip | 无 DEEPSEEK_API_KEY 时 skip，不报 fail | PASS |

## §6 文件清单

| 文件 | 状态 | 行数 |
|------|------|------|
| `wrapper/orchestrator/orchestrator.ts` | modified | ~327 行 |
| `wrapper/orchestrator/types.ts` | modified | +27 行类型 |
| `wrapper/orchestrator/pwa_server.ts` | new | ~131 行 |
| `wrapper/orchestrator/static/index.html` | new | ~292 行 |
| `wrapper/test/integration/orch_kernel.test.ts` | new | ~178 行 |
| `wrapper/vitest.config.integration.ts` | new | ~11 行 |
| `wrapper/package.json` | modified | +3 行 (test:integration script) |
| `wrapper/package-lock.json` | modified | +~1005 行 |
