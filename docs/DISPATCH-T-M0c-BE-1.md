# DISPATCH-T-M0c-BE-1 — TypeScript Wrapper Skeleton

> **Date**: 2026-09-02
> **Triggered by**: v1.1 GA plan v0.1 升级（user 「选 (a) v0.1 升级 GO」）
> **Source**: `docs/v1.1-ga-team-plan.md` §2.1（v0.1 升级后 T-M0c-BE-1 行）+ §6.2 M0c PR4
> **Status**: 任务书起草完成（等 user 「Start v1.1 M0c」启动实施）

---

## §1 任务定义

为 v1.1+ 周期实施 TypeScript wrapper skeleton，覆盖 orchestrator / commander / worker 三层，HTTP/FFI 调用 v1.0 runtime kernel（**不 fork schema**）。

## §2 输入

- **M0b 总报告**：`docs/DISPATCH-T-M0b-DONE.md`（H-1/H-2/H-3 PASS + LOC 4800-8500 估算）
- **v1.0 runtime type contract**：`spec/interfaces/*.py` 10 Protocol（**type contract 参考，不 fork schema**）
- **capability JSON**：`spec/capabilities/orch.json` + `spec/capabilities/commander.json` + `spec/capabilities/worker.json`
- **M0b spike 报告**：`docs/DISPATCH-T-M0b-BE-1.md`（dsh `deepseek-v4-pro` 调研报告）+ `docs/DISPATCH-T-M0b-TG-1.md`（commander 改代码）+ `docs/DISPATCH-T-M0b-DO-1.md`（worker 摘要）

## §3 产出

### 3.1 文件

- `wrapper/orchestrator/orchestrator.ts`（orch 层 skeleton + spawn commander）
- `wrapper/orchestrator/commander.ts`（commander 层 skeleton + spawn worker + dsh invoke）
- `wrapper/orchestrator/worker.ts`（worker 层 skeleton + HTTP/FFI 调用 v1.0 runtime kernel）
- `wrapper/orchestrator/types.ts`（与 spec/interfaces/*.py 类型对位，**不 1:1**）

### 3.2 关键约束

- ❌ 不 fork schema（v1.1 wrapper 与 Python Protocol 类型对位，不 1:1）
- ❌ 不实现业务逻辑（仅 skeleton）
- ❌ 不调真 dsh（仅 mock 接口，跑通即可）
- ✅ HTTP/FFI 调用 v1.0 runtime kernel（kernel 不动；走 `/health` 端点）
- ✅ TypeScript strict mode 全开 + `tsc --noEmit` exit 0
- ✅ 类型系统对位 Python Protocol（capability JSON class/tier 字段，**不锁型号**）

## §4 验证命令

```bash
# 1. TypeScript 编译
cd wrapper/ && npx tsc --noEmit
# 期望: exit 0（无类型错误）

# 2. mock dsh 调用跑通
cd wrapper/ && npm run test:mock
# 期望: exit 0（mock dsh 跑通三角色 skeleton）

# 3. v1.0 runtime kernel /health 端点
curl http://localhost:8000/health
# 期望: HTTP 200 + JSON {"status": "ok", "version": "1.0.0"}

# 4. capability JSON 不锁型号守门：详见 `notes/codex-audit-scope-v1.1-m0c-v0.1.md` §1（grep 范围不含 notes/，避免自伤）
```

## §5 估时

- **5-7 天**（BE 工程师 1 人）
- 与 PRD-v1.1 §5 "M0c (2-3 周)" 对齐；本任务占总 M0c 时长 25-35%

## §6 报告模板（实施者填）

执行完成后在 `docs/DISPATCH-T-M0c-BE-1.md` §6 追加：

```markdown
## §6 实跑报告（实施者填）

- **Wall time**: Xd
- **代码 diff**: `wrapper/orchestrator/*.ts` +N/-M 行
- **验证命令实跑**：
  - `tsc --noEmit`: exit N
  - mock dsh 测试: exit N
  - `/health`: HTTP N
  - 不锁型号 grep: 0 行
- **TypeScript strict mode**: 全开
- **类型对位 Python Protocol**: 10 Protocol 全对应
- **不锁型号守门**: PASS
```

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.1 T-M0c-BE-1 行（v0.1 升级后）+ §6.2 M0c PR4
- `docs/DISPATCH-T-M0b-BE-1.md`（M0b BE 实跑报告 — 提供 dsh orch 档能力证据）
- `docs/DISPATCH-T-M0b-DONE.md` §3 H-3 LOC 估算（orch 1500-2500 行）
- `spec/interfaces/*.py`（10 Protocol type contract 参考）
- `spec/capabilities/orch.json`（capability class/tier 字段）
- `adr/0010-v1.1-cycle-scope-admission.md` Decision (d) v1.0 runtime 不漂移守门

## §8 禁止

- ❌ 不写 wrapper 业务逻辑（M0c 仅 skeleton；M1+ 才实接）
- ❌ 不调真 dsh（M1+ 才走 dsh wrapper 客户端）
- ❌ 不部署 newvps（DO-1 任务）
- ❌ 不写 wrapper 单元测试（QA-1 任务）
- ❌ 不动 v1.0 runtime kernel（HTTP/FFI 调 `/health` 即可；kernel 不改）
- ❌ 不锁具体型号（NORTH-STAR A-4 等价类）

---

*任务书 ready for Cursor 审阅 — 等 user 「Start v1.1 M0c」启动实施*