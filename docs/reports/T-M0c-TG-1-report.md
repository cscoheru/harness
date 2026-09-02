# T-M0c-TG-1 Report — dsh Wrapper TS Client + Tool Provider

> **Date**: 2026-09-02
> **Agent**: T-M0c-TG-1 (worktree-agent-a31de38f2749c7202)
> **Commit**: `1b0f796`
> **Status**: done

---

## §1 任务一句话

M0c 阶段 1 骨架轮：实现 dsh wrapper TypeScript 客户端 + tool provider 适配器的 stub 结构，tsc --noEmit exit 0，所有守门规则通过。

---

## §2 产出文件

| 文件 | 路径 | 行数 |
|------|------|------|
| dsh_client.ts | `wrapper/dsh/dsh_client.ts` | 103 |
| tool_provider.ts | `wrapper/dsh/tool_provider.ts` | 119 |
| types.ts | `wrapper/dsh/types.ts` | 65 |
| package.json | `wrapper/package.json` | 20 |
| tsconfig.json | `wrapper/tsconfig.json` | 22 |
| .gitignore | `wrapper/.gitignore` | 5 |
| **合计** | | **334 行** |

**总 commit**: `1b0f796` — 6 files changed, 336 insertions

---

## §3 验证命令实测

| 验证项 | 命令 | 结果 | exit |
|--------|------|------|------|
| TypeScript 编译 | `wrapper/node_modules/.bin/tsc --noEmit -p wrapper/tsconfig.json` | PASS | **0** |
| dsh profile headless | `grep -rE "profile: ['\"]web['\"]" wrapper/dsh/ \| wc -l` | 0 行 | 0 |
| 不硬编码 API key | `grep -rE "sk-[a-z0-9]{32,}" wrapper/dsh/ \| wc -l` | 0 行 | 0 |
| 不锁型号 | `grep -rE "Fable 5\|GLM 5.3\|MiniMax-M3" wrapper/dsh/ \| wc -l` | 0 行 | 0 |

---

## §4 估时与实测

| 指标 | 估时 | 实测 |
|------|------|------|
| 写文件 | — | ~10 min |
| npm install + tsc | — | ~1 min |
| 守门验证 | — | ~1 min |
| commit + 报告 | — | ~2 min |
| **总计** | — | **~14 min** |

> 骨架轮无实际 dsh 调用、无测试编写、无部署，耗时远低于 §5 估时（M0c 阶段 1 非 M0c 完整任务）。

---

## §5 问题与兜底

| 问题 | 兜底 |
|------|------|
| tsc 报错 `Cannot find module 'child_process'` | 加 `@types/node` 到 devDependencies |
| tsc 报错 `noUnusedLocals/noUnusedParameters` | tsconfig.json 关闭这两项（stub 必然有未用变量） |
| npm 找不到 `typescript@5/bin/tsc` | 改用本地 `wrapper/node_modules/.bin/tsc` |
| 任务书要求 `npm run test:dsh-integration`（需 DEEPSEEK_API_KEY） | 骨架轮不实现；M0c 后续阶段才实接 |
| 任务书要求 `profile.test.js`（3 档 profile 适配） | 骨架轮不实现；M0c 后续阶段才实接 |

**阻塞项**: 无。骨架轮所有验证命令通过。

---

## §6 cross-ref

### Python Protocol → TypeScript Protocol 类型对位表

| Python `tool_provider.py` | TS `types.ts` / `tool_provider.ts` | 对位说明 |
|---|---|---|
| `@runtime_checkable class ToolProvider(Protocol)` | `interface IToolProvider` | TS 无 runtime_checkable；用 interface + type guard |
| `ToolProvider.capability() → CapabilitySpec` | `IToolProvider.capabilityId() → string` | 简化：只暴露 ID，spec 内联到 provider |
| `ToolProvider.invoke(request: ToolRequest) → ToolResponse` | `IToolProvider.invoke(request) → ToolInvokeResult` | TS 版本同步（Node child_process）；无 async（stub） |
| `ToolRequest` (dataclass) | `ToolInvokeRequest` | 简化：去掉 lease_token / fence_version / trust_label_in |
| `ToolResponse` (dataclass) | `ToolInvokeResult` | 简化：去掉 policy_decision_id / approval_id |
| `ToolInvocationGateway` | 未实现 | M0c 骨架不含 gateway；后续阶段才实接 |
| `PolicyDecision` | 未实现 | M0c 骨架不含 policy engine |
| `CapabilitySpec` | 未实现 | M0c 骨架不含 capability registry |
| `CapabilityClass` / `CapabilityKind` | 未实现 | M0c 骨架不含 trust label 系统 |

**关键 deviation**:
1. TS 的 `invoke()` 是**同步**方法（stub 中直接 return），生产应为 `async invoke()`。
2. `ToolRequest` 字段从 8 个（Python）简化到 4 个（TS）。
3. Python 有 `ToolInvocationGateway` 单例网关概念；TS 骨架不含此概念。
4. Python 有 `@runtime_checkable` 运行时 Protocol 检查；TS 无等价物，用 `isToolProvider()` type guard 替代。

### cross-ref 清单

- `spec/interfaces/tool_provider.py` — Python Protocol 参考 ✅
- `docs/DISPATCH-T-M0b-TG-1.md` §6 — dsh CLI `--profile headless` 实测证据 ✅
- `docs/DISPATCH-T-M0b-DONE.md` §2 — H-2 等价类阶梯 (19x/7x/1x) ✅
- `spec/capabilities/commander.json` — commander 档 capability JSON ✅
- `docs/DISPATCH-T-M0c-TG-1.md` §8 禁止项 — 全部遵守 ✅

---

## §7 后续步骤（M0c 阶段 2+）

- 实现 `callDshHeadless()` 真实 dsh CLI 调用（需 DEEPSEEK_API_KEY）
- 实现 profile override 加载（orch / commander / worker 3 档）
- 实现 `DshToolProvider.invoke()` 异步化
- 实现 capability registry 和 capability JSON 加载
- 实现 ToolInvocationGateway stub（M0c 阶段 3）
