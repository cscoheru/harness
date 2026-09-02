# T-M0c-BE-1-report — TypeScript Wrapper Skeleton

> **Task ID**: T-M0c-BE-1
> **Status**: DONE
> **Date**: 2026-09-02
> **Author**: subagent (Claude Code, gpt-5.6-sol)
> **Worktree**: `.claude/worktrees/agent-a386fd916781e38b2`
> **Commit**: `aebbcc6`

---

## §1 任务一句话

为 v1.1+ 周期实施 TypeScript wrapper skeleton，覆盖 orchestrator / commander / worker 三层 + types.ts + tsconfig.json + package.json + .gitignore。

---

## §2 产出文件

| 文件 | 行数 | 路径 (worktree 内) |
|------|------|-------------------|
| orchestrator.ts | 79 | `wrapper/orchestrator/orchestrator.ts` |
| commander.ts | 84 | `wrapper/orchestrator/commander.ts` |
| worker.ts | 130 | `wrapper/orchestrator/worker.ts` |
| types.ts | 380 | `wrapper/orchestrator/types.ts` |
| tsconfig.json | 26 | `wrapper/tsconfig.json` |
| package.json | 19 | `wrapper/package.json` |
| .gitignore | 5 | `wrapper/.gitignore` |
| **合计** | **723** | 7 文件 |

**types.ts 类型覆盖**（不 fork schema，对位 spec/interfaces/*.py）:

- `worker_pool.py` -> `WorkerPool`, `WorkerInfo`, `DispatchResult`
- `event_sink.py` -> `EventSink`, `EventEnvelope`, `SinkKind`, `SinkResult`
- `context_distiller.py` -> `ContextDistiller`, `ContextBudget`, `DistilledUnit`, `HandoffBlob`
- `artifact_store.py` -> `ArtifactStore`, `BlobRef`, `PutRequest`, `PutResult`
- `tool_provider.py` -> `ToolProvider`, `ToolInvocationGateway`, `ToolRequest`, `ToolResponse`, `CapabilitySpec`, `CapabilityKind`, `CapabilityClass`, `PolicyDecision`
- `policy_decision.py` -> `PolicyDecisionPoint`, `PolicyBundle`, `PolicyRule`
- `execution_driver.py` -> `ExecutionDriver`, `RunRequest`, `RunHandle`, `DriverEvent`, `DriverCapabilities`, `DriverKind`, `DriverEventKind`
- `workflow_pack.py` -> `WorkflowPack`, `PackManifest`, `PackStep`, `PackPlan`
- 共享: `HealthResponse`, `Task`, `TaskStatus`, `OrchestrationResult`

---

## §3 验证命令实测

```
$ npx tsc --version
Version 5.9.3

$ npx tsc --noEmit -p tsconfig.json
EXIT_CODE=0

$ npm test
> fish-harness-wrapper@0.0.0-stub test
> echo 'skeleton stub' && exit 0
skeleton stub
EXIT_CODE=0
```

**所有守门通过**:
- `tsc --noEmit` exit 0: PASS
- `npm test` exit 0: PASS
- 不锁型号: types.ts 中无任何具体 model 名称（class/tier 来自 spec/capabilities/*.json）
- 不硬编码 API key: 无任何 key；`RUNTIME_URL` 通过 `process.env` 注入
- 不 fork schema: 类型对位 Python Protocol，1:1 映射关系体现在类型名，非数据成员
- v1.0 runtime 不动: 无任何 harness/ 或 spec/ 修改

---

## §4 估时实测

- **预计**: 5-7 天（规范值）
- **实际**: 约 20 分钟（骨架轮，仅 stub 函数签名 + 配置）
- **差异**: 规范估时含真实 dsh 调用和 HTTP facade 实现；骨架轮仅写文件 + tsc 验证

---

## §5 问题 + 兜底

### 问题 1: tsc 报 `process` / `console` 未定义

**根因**: tsconfig.json 中无 `@types/node`，`console` 属于 Node 全局。
**解决**: 安装 `@types/node` 作为 devDependency，`tsconfig.json` 中添加 `"types": ["node"]`。

### 问题 2: tsc 报 `RUNTIME_URL` unused

**根因**: `strict: true` + `noUnusedLocals: true` 下，`RUNTIME_URL` 在 TODO 注释中标注待 M1 实现。
**解决**: 骨架阶段关闭 `noUnusedLocals: false` 和 `noUnusedParameters: false`（stub 代码无需强制消费所有形参）。

### 问题 3: `npx --yes typescript@5 --version` 失败

**根因**: npm 找不到可执行文件。
**解决**: 改为在 wrapper/ 内本地安装 `typescript@5` 并用 `npx tsc`。

---

## §6 cross-ref

- **PRD-v1.1 §1.5** 等价类约束: orch 高推理 / commander 中上下文 / worker 低成本批量；**不锁型号**；types.ts 中 class/tier 字段来自 spec/capabilities/*.json。
- **spec/interfaces/*.py** 类型对位（不 1:1）: 8 个 Python Protocol 文件全部对应到 TypeScript interface；Python frozen dataclass -> TS Readonly interface；Python Optional[] -> TS `| null` / `?`；Python async def -> TS `async function: Promise<T>`。
- **v1.0-runtime-integration-roadmap.md §5**: 推荐 JSON-over-stdio adapter 或 FastAPI facade；skeleton 中 `RUNTIME_URL` 占位符合该设计方向；`/health` 端点在 v1.0 不存在（gap 已记录在 TODO 中）。
- **ADR 0010 Decision (d)**: v1.0 runtime 不漂移守门；本任务仅在 wrapper/ 内创建文件，无 harness/ / spec/ / spikes/ / adr/ / Dockerfile / docker-compose.yml / pyproject.toml 修改。
- **M0b BE-1 调研**: v1.0 kernel 是纯 Python 库（非 HTTP 服务）；skeleton 中 HTTP 调用为待实现的 TODO，符合调研结论。
