# DISPATCH-T-M0c-QA-1 — TypeScript Wrapper 集成测试 + M1 E2E 前置

> **Date**: 2026-09-02
> **Triggered by**: v1.1 GA plan v0.1 升级（user 「选 (a) v0.1 升级 GO」）
> **Source**: `docs/v1.1-ga-team-plan.md` §2.4（v0.1 升级后 T-M0c-QA-1 行）+ §6.2 M0c PR6
> **Status**: 任务书起草完成（等 user 「Start v1.1 M0c」启动实施）

---

## §1 任务定义

为 TypeScript wrapper skeleton + dsh wrapper 客户端 + tool provider 适配器提供单元测试 + 1 真机 E2E 前置测试（M1 阶段才走完整 E2E；本任务为 M1 验证提供脚手架）。

## §2 输入

- **M0c 实施产出**：
  - `wrapper/orchestrator/{orchestrator,commander,worker}.ts`（BE-1 产出）
  - `wrapper/dsh/{dsh_client,tool_provider}.ts`（TG-1 产出）
- **M0c 部署**：newvps 上 harness 容器 + dsh wrapper 容器 + 1 worker（DO-1 产出）
- **capability JSON**：`spec/capabilities/{orch,commander,worker}.json`
- **v1.0 runtime 测试套件**：`spikes/`（v1.0 spike 5627 行，作为 mock 参考）

## §3 产出

### 3.1 文件

- `wrapper/test/unit/orchestrator.test.ts`（orchestrator skeleton 单元测试）
- `wrapper/test/unit/commander.test.ts`（commander skeleton 单元测试）
- `wrapper/test/unit/worker.test.ts`（worker skeleton 单元测试）
- `wrapper/test/unit/dsh_client.test.ts`（dsh client 单元测试 — mock dsh）
- `wrapper/test/unit/tool_provider.test.ts`（tool provider 单元测试）
- `wrapper/test/integration/health-endpoint.test.ts`（HTTP /health 集成测试）
- `wrapper/test/e2e/pwa-smoke.test.ts`（真机 E2E 占位 — iPhone Safari 走 Tailscale 打开 PWA；M1 才跑完整 4 步，本任务仅占位）

### 3.2 关键约束

- ❌ 不跑真实 dsh（mock 优先；1 真机 E2E 仅占位）
- ❌ 不写 iPhone PWA 完整 E2E（M1 阶段；本任务仅占位 + 冒烟）
- ❌ 不测 v1.0 runtime kernel（v1.0 spike 5627 行已覆盖）
- ✅ 单元测试覆盖率 ≥ 80%（仅 wrapper/）
- ✅ `npm test` exit 0
- ✅ `npm run test:integration` exit 0（HTTP /health 真机）
- ✅ 不锁型号守门
- ✅ 不硬编码 API key

## §4 验证命令

```bash
# 1. 单元测试（mock 优先）
cd wrapper/ && npm test
# 期望: exit 0 + 覆盖率 ≥ 80%

# 2. 集成测试（HTTP /health）
cd wrapper/ && npm run test:integration
# 期望: exit 0（真机 /health 200）

# 3. E2E 占位（仅 smoke；M1 才跑完整）
cd wrapper/ && npm run test:e2e:smoke
# 期望: exit 0（占位 + smoke；4 步 E2E 留 M1）

# 4. 不锁型号守门：详见 `notes/codex-audit-scope-v1.1-m0c-v0.1.md` §1（grep 范围不含 notes/，避免自伤）

# 5. 不硬编码 API key
grep -rE "sk-[a-z0-9]{32,}" wrapper/test/
# 期望: 0 行（仅 mock token 或 env-inject）

# 6. 覆盖率报告
cd wrapper/ && npx nyc --reporter=text npm test
# 期望: Lines ≥ 80%, Functions ≥ 80%, Branches ≥ 80%
```

## §5 估时

- **3-5 天**（QA 工程师 1 人）
- 与 PRD-v1.1 §5 "M0c (2-3 周)" 对齐；本任务占总 M0c 时长 15-25%

## §6 报告模板（实施者填）

```markdown
## §6 实跑报告（实施者填）

- **Wall time**: Xd
- **测试 diff**: `wrapper/test/*` +N/-M 行
- **单元测试覆盖率**:
  - Lines: N%
  - Functions: N%
  - Branches: N%
- **测试结果**:
  - `npm test`: PASS（N 项）
  - `npm run test:integration`: PASS（N 项）
  - `npm run test:e2e:smoke`: PASS（占位 + smoke）
- **不锁型号 grep**: 0 行
- **不硬编码 key grep**: 0 行
- **测试层级**: 单元 + 集成 + E2E 占位
- **M1 完整 E2E 占位说明**: 4 步 E2E 留 M1；本任务提供脚手架 + smoke
```

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.4 T-M0c-QA-1 行（v0.1 升级后）+ §6.2 M0c PR6
- `docs/DISPATCH-T-M0b-QA-1.md`（M0b QA 等价类对比 + H-3 LOC 估算）
- `docs/DISPATCH-T-M0b-DONE.md` §3 H-3 LOC 估算（worker 800-1500 行）
- `wrapper/orchestrator/{orchestrator,commander,worker}.ts`（BE-1 产出）
- `wrapper/dsh/{dsh_client,tool_provider}.ts`（TG-1 产出）
- `spikes/`（v1.0 spike 5627 行；mock 参考）
- `spec/capabilities/{orch,commander,worker}.json`

## §8 禁止

- ❌ 不跑真实 dsh（mock 优先；M1 才真跑）
- ❌ 不写 iPhone PWA 完整 4 步 E2E（M1 阶段；本任务仅占位 + smoke）
- ❌ 不测 v1.0 runtime kernel（v1.0 spike 已覆盖）
- ❌ 不动 v1.0 runtime（mock 调 /health 即可）
- ❌ 不锁具体型号
- ❌ 不硬编码 API key

---

*任务书 ready for Cursor 审阅 — 等 user 「Start v1.1 M0c」启动实施*