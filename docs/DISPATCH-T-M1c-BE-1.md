# DISPATCH-T-M1c-BE-1 — TypeScript wrapper 实接 v1.0 kernel HTTP API + dsh invoke

> **Role**: BE (Backend Engineer — TypeScript wrapper)
> **Stage**: v1.1 M1c 实施合同（**等 user 「Start v1.1 M1」启动**）
> **Date**: 2026-09-02
> **Source**: `docs/v1.1-ga-team-plan.md` v0.2 §2.1 Role BE / §6.2 M1c PR8 / §10.4 v0.2 准备清单

---

## §1 任务定义

**一句话**: 把 M0c 落地的 `wrapper/orchestrator/orchestrator.ts` skeleton 升级到 v1.0 runtime kernel HTTP/FFI 实接 + dsh invoke（含真实部署路径 `POST /api/orch/invoke`），并新增 iPhone PWA 派工 → 24h 内完成 → 看见完成态 的最小闭环。

**范围**:
- ❌ 不做: 6 host 部署 (M2) / STT (M2) / Web Push (M2) / commander ≥3 (M3)
- ✅ 做: 1 orchestrator (newvps) + 1 worker (newvps 同机) + 1 commander (newvps) + TypeScript wrapper 实接 kernel HTTP + dsh 真调 + iPhone PWA 文字表单 + Tailscale HTTPS

**关键路径产物**:
1. `wrapper/orchestrator/orchestrator.ts` 实接 v1.0 kernel `POST /api/orch/invoke` 端点 (per M0c skeleton 已建 HTTP client)
2. `wrapper/orchestrator/orchestrator.ts` 实调 `wrapper/dsh/dsh_client.ts` dshInvoke (env-inject DEEPSEEK_API_KEY via env-only 占位)
3. `wrapper/orchestrator/pwa_server.ts` 新增: PWA 文字表单 server (Express 4 + 静态 HTML + POST /api/pwa/dispatch 端点)
4. `wrapper/orchestrator/static/index.html` 新增: PWA 文字表单最小可用页 (input + submit + 任务状态轮询)
5. `wrapper/orchestrator/types.ts` 扩: 加 `DispatchRequest` / `DispatchResponse` 类型 (PWA ↔ orchestrator 契约)

## §2 输入

- M0c skeleton commit `b768097` (`wrapper/orchestrator/{orchestrator,commander,worker,types}.ts`)
- M0c dsh_client commit `d168217` (`wrapper/dsh/{dsh_client,tool_provider,types}.ts`)
- v1.0 runtime kernel `/health` 端点 (per M0c skeleton 已建 HTTP client；M1c 扩到 `/api/orch/invoke` + `/api/orch/status/{task_id}` 端点)
- v1.0 runtime 10 Protocol (per `spec/interfaces/*.py` — type contract 参考，不 fork schema，不 1:1)
- `spec/capabilities/orch.json` + `commander.json` + `worker.json` (M0b 落地)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§4 (hygiene 守门)

## §3 产出

| # | 文件 | 行数估 | 内容 |
|---|------|--------|------|
| 1 | `wrapper/orchestrator/orchestrator.ts` | ~250 行 | 实接 kernel `/api/orch/invoke` + `/api/orch/status/{task_id}` + 调 dsh_client + 任务生命周期管理 (pending → running → done/failed) |
| 2 | `wrapper/orchestrator/pwa_server.ts` (NEW) | ~120 行 | Express server: 静态文件服务 `wrapper/orchestrator/static/` + `POST /api/pwa/dispatch` 端点 (接 PWA 表单 → orchestrator.dispatch) + `GET /api/pwa/status/{task_id}` 轮询 |
| 3 | `wrapper/orchestrator/static/index.html` (NEW) | ~80 行 | PWA 文字表单最小可用: `<form>` input + submit button + 任务 ID 显示 + 轮询 status + 完成态显示 |
| 4 | `wrapper/orchestrator/types.ts` | +30 行 | 加 `DispatchRequest` / `DispatchResponse` / `TaskStatus` 类型 |
| 5 | `wrapper/test/integration/orch_kernel.test.ts` (NEW) | ~80 行 | 集成测试: mock kernel server + 真 dsh_client (env-inject DEEPSEEK_API_KEY) + 派工 → 完成 → 状态查询 闭环 |
| 6 | `docs/reports/T-M1c-BE-1-report.md` (NEW) | ~120 行 | 实跑报告: §1 任务完成度 / §2 实跑数据 (tsc/vitest/e2e trace) / §3 问题与解决 / §4 cross-ref |

## §4 验证命令 (架构师最终验证)

```bash
# 1. TypeScript wrapper 实跑
cd wrapper && npm run tsc            # 期望: exit 0
cd wrapper && npm test               # 期望: exit 0 + 单元 + 集成测试全过 (含新 orch_kernel.test.ts)

# 2. dsh 真调 (env-inject DEEPSEEK_API_KEY via env-only 占位, 不写完整 key)
DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" npm run test:integration
# 期望: dsh_client 调真 dsh 成功 (per §4 #7 headless profile 守门)

# 3. iPhone Safari PWA 真机 E2E 4 步 (per T-M1c-QA-1 §4 #2)
# (此验证由 QA-1 在 iPhone Safari 上执行; BE-1 负责 PWA server 跑通 + curl 端点 200)

# 4. PWA server 端点 (本地 + newvps 真部署后)
curl -X POST http://localhost:3000/api/pwa/dispatch \
  -H "Content-Type: application/json" \
  -d '{"prompt": "调研 React 19 新特性", "class": "orch"}'
# 期望: 返回 {"task_id": "..."} + HTTP 200

curl http://localhost:3000/api/pwa/status/{task_id}
# 期望: {"status": "running" | "done" | "failed", "result": "..."} + HTTP 200

# 5. v1.0 runtime 不漂移守门
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行

# 6. 不锁型号守门 (继承 v0.2 §1)
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l
# 期望: 0 行

# 7. dsh headless profile 守门 (继承 v0.2 §4)
grep -rE "profile: ['\"]web['\"]" wrapper/ | wc -l
# 期望: 0 行 (用 headless, 非 web)
```

## §5 估时

**7 工作日** (关键路径) — 与 PRD-v1.1 §5 M1 2 周对齐 + 与其他 4 角色并行:
- Day 1-2: orchestrator.ts 实接 kernel HTTP API (POST /api/orch/invoke + status 端点)
- Day 3-4: orchestrator.ts 调 dsh_client.ts + 任务生命周期管理
- Day 5-6: pwa_server.ts + static/index.html + types.ts 扩
- Day 7: 集成测试 orch_kernel.test.ts + E2E 联通 (QA-1 真机)

## §6 报告模板 (docs/reports/T-M1c-BE-1-report.md)

```markdown
# T-M1c-BE-1 — TypeScript wrapper 实接 v1.0 kernel HTTP API + dsh invoke 实施报告

## §1 任务完成度
- [ ] §3 产出 6 文件全部落地
- [ ] §4 验证命令 #1-#7 全 exit 0
- [ ] M1 Exit Gate 部分过 (本任务负责 wrapper 部分; PWA 真机 E2E 由 QA-1)

## §2 实跑数据
- TypeScript wrapper 实跑: tsc --noEmit exit 0 + vitest run N passed / M todo
- dsh 真调: DEEPSEEK_API_KEY env-inject, headless profile, N 次 invoke 退出码 0
- PWA server 端点: POST /api/pwa/dispatch + GET /api/pwa/status/{task_id} 均 200
- E2E 联通: 本地 mock kernel + 真 dsh + PWA 表单 → 任务完成 → 状态查询 全过

## §3 问题与解决
- (列实跑中遇到的问题 + 修法)

## §4 cross-ref
- docs/v1.1-ga-team-plan.md v0.2 §2.1 + §6.2 PR8
- docs/DISPATCH-T-M1c-{TG-1,DO-1,QA-1}.md
- notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md §1-§4

## §5 守门自检
- [ ] 不锁型号 grep = 0
- [ ] DEEPSEEK_API_KEY 完整 key grep = 0 (env-inject only)
- [ ] v1.0 runtime 0 行 diff
- [ ] dsh headless profile (无 web profile)
- [ ] ADR 编号 ≥ 0010 (本任务不新增 ADR)
- [ ] cc-ready.json valid JSON (BE-1 提交时同步更新)
```

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` v0.2 §2.1 + §6.2 PR8 + §10.4 v0.2 准备清单
- `docs/DISPATCH-T-M0c-BE-1.md` (M0c skeleton 输入)
- `docs/DISPATCH-T-M1c-TG-1.md` (TG-1 dsh_client 真调 — BE-1 调用)
- `docs/DISPATCH-T-M1c-DO-1.md` (DO-1 newvps 真部署 — BE-1 wrapper 在 newvps 跑)
- `docs/DISPATCH-T-M1c-QA-1.md` (QA-1 真机 E2E — BE-1 PWA server 提供端点)
- `docs/DISPATCH-T-M1c-DD-1.md` (DD-1 CHANGELOG/README — BE-1 提交时同步)
- `wrapper/` (M0c skeleton + dsh_client + tool_provider 输入)
- `spec/capabilities/{orch,commander,worker}.json` (M0b 落地)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§4 (hygiene 守门)

## §8 禁止

- ❌ 不做 6 host 部署 (M2) / STT (M2) / Web Push (M2) / commander ≥3 (M3)
- ❌ 不动 v1.0 runtime kernel (HTTP/FFI 调端点, kernel 不改)
- ❌ 不硬编码 DEEPSEEK_API_KEY (仅 env-inject via env-only 占位)
- ❌ 不锁具体模型型号 (per NORTH-STAR A-4 等价类约束; capability JSON 用 class/tier 字段)
- ❌ 不打 v1.1.0 GA tag (M1c 不出 tag)
- ❌ 不调 dsh `web` profile (per M0b QA-1 §6.X 修订; 用 `headless` profile)
- ❌ 不直接 commit 到 main (per CLAUDE.md "不主动 commit"; 实施者 PR → 架构师 merge)

---

*DISPATCH-T-M1c-BE-1 — TypeScript wrapper 实接 v1.0 kernel HTTP API + dsh invoke 任务书；PRD-v1.1 §5 M1 收紧版 MVP 范围；等 user 「Start v1.1 M1」启动真实工程师实施；hygiene 守门见 `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md`*