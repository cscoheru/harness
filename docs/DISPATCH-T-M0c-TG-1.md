# DISPATCH-T-M0c-TG-1 — dsh Wrapper TS Client + Tool Provider

> **Date**: 2026-09-02
> **Triggered by**: v1.1 GA plan v0.1 升级（user 「选 (a) v0.1 升级 GO」）
> **Source**: `docs/v1.1-ga-team-plan.md` §2.2（v0.1 升级后 T-M0c-TG-1 行）+ §6.2 M0c PR4
> **Status**: 任务书起草完成（等 user 「Start v1.1 M0c」启动实施）

---

## §1 任务定义

实现 dsh wrapper TypeScript 客户端 + tool provider 适配器，让 commander 层 TypeScript wrapper 通过 dsh 调度模型（M0b spike 已验证 dsh `deepseek-v4-flash` 等价类能力）。

## §2 输入

- **M0b 总报告**：`docs/DISPATCH-T-M0b-DONE.md` §2 H-2 等价类对比（wall 19x/7x/1x 阶梯）
- **M0b TG 报告**：`docs/DISPATCH-T-M0b-TG-1.md`（dsh `deepseek-v4-flash` 改代码 +53 行 diff 100% 一致 + pytest 全绿）
- **v1.0 type contract**：`spec/interfaces/tool_provider.py`（ToolProvider Protocol）
- **capability JSON**：`spec/capabilities/commander.json`
- **dsh 调研结果**：`docs/DISPATCH-T-M0b-BE-1.md` + `notes/v1.1-m0b-dsh-research.md`（如有）

## §3 产出

### 3.1 文件

- `wrapper/dsh/dsh_client.ts`（调 dsh CLI / dsh HTTP；支持 3 档 model class：orch / commander / worker）
- `wrapper/dsh/tool_provider.ts`（ToolProvider Protocol TypeScript 实现；类型对位 Python Protocol，**不 1:1**）
- `wrapper/dsh/types.ts`（dsh CLI/HTTP 请求 / 响应类型）
- `wrapper/dsh/profile.ts`（3 档 profile 适配器，基于 `docs/m0b/profile-override-{orch,commander,worker}.yaml`）

### 3.2 关键约束

- ❌ 不 fork schema（TS Protocol 与 Python Protocol 类型对位）
- ❌ 不实接 v1.0 runtime kernel（M1 才实接；本任务仅 mock 跑通）
- ❌ 不硬编码 dsh API 密钥（env-inject only）
- ✅ dsh_client 调真 dsh 成功（`dsh --profile headless` 或 dsh HTTP 协议）
- ✅ TypeScript strict mode + `tsc --noEmit` exit 0
- ✅ profile override 支持 3 档等价类（capability JSON class 字段决定）

## §4 验证命令

```bash
# 1. TypeScript 编译
cd wrapper/ && npx tsc --noEmit
# 期望: exit 0

# 2. dsh_client 调真 dsh
cd wrapper/ && npm run test:dsh-integration
# 期望: exit 0（实跑 dsh --profile headless 成功）

# 3. ToolProvider Protocol 类型对位
cd wrapper/ && npx tsc --noEmit --strict
# 期望: exit 0（无类型错误）

# 4. capability JSON 3 档 profile 适配
cd wrapper/ && node dist/dsh/profile.test.js
# 期望: 3 档（orch/commander/worker）profile 全部生效

# 5. 不锁型号守门：详见 `notes/codex-audit-scope-v1.1-m0c-v0.1.md` §1（grep 范围不含 notes/，避免自伤）

# 6. 不硬编码 API key 守门
grep -rE "sk-[a-z0-9]{32,}" wrapper/dsh/
# 期望: 0 行（仅 env-inject）

# 7. dsh profile headless（非 web）
grep -rE "profile: ['\"]web['\"]" wrapper/dsh/
# 期望: 0 行（用 headless；per BE-1/TG-1/DO-1 三 subagent 独立发现）
```

## §5 估时

- **5-7 天**（TG 工程师 1 人）
- 与 PRD-v1.1 §5 "M0c (2-3 周)" 对齐；本任务占总 M0c 时长 25-35%

## §6 报告模板（实施者填）

```markdown
## §6 实跑报告（实施者填）

- **Wall time**: Xd
- **代码 diff**: `wrapper/dsh/*.ts` +N/-M 行
- **验证命令实跑**：
  - `tsc --noEmit`: exit N
  - `test:dsh-integration`: exit N
  - 3 档 profile 适配: PASS/FAIL
  - 不锁型号 grep: 0 行
  - 不硬编码 key grep: 0 行
  - dsh profile headless: PASS
- **dsh `--profile headless`**: 实跑成功
- **3 档 profile 适配**: orch / commander / worker
- **TypeScript Protocol ↔ Python Protocol 类型对位**: 1:1 对位表
```

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.2 T-M0c-TG-1 行（v0.1 升级后）+ §6.2 M0c PR4
- `docs/DISPATCH-T-M0b-TG-1.md`（M0b TG 实跑报告 — commander 档能力证据）
- `docs/DISPATCH-T-M0b-DONE.md` §3 H-3 LOC 估算（commander 2000-3500 行）
- `spec/interfaces/tool_provider.py`（type contract 参考）
- `spec/capabilities/commander.json`
- `docs/m0b/profile-override-{orch,commander,worker}.yaml`（3 档 profile 模板；commit 9f5ef4b v0.1）
- `notes/codex-review-v1.1-m0b-v0.1-report.md`（Codex v0.1 PASS — dsh `--profile headless` 实跑）

## §8 禁止

- ❌ 不实接 v1.0 runtime kernel（M1 才实接）
- ❌ 不硬编码 API key（env-inject only；per GH013 PUSH PROTECTION 教训）
- ❌ 不写 dsh web profile（per BE-1/TG-1/DO-1 三 subagent 独立发现；用 headless）
- ❌ 不锁具体型号（NORTH-STAR A-4 等价类）
- ❌ 不写 wrapper 业务逻辑

---

*任务书 ready for Cursor 审阅 — 等 user 「Start v1.1 M0c」启动实施*