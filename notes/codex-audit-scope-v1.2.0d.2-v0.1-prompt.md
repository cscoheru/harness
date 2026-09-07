# v1.2.0d.2 quick-fix — DEEPSEEK_COST_MODE 成本闸门 (orch 默认 v4-flash)

> **Trigger**: user 2026-09-06 扣费质询 → gated E2E 计费大头 = `dsh_client.ts` orch role patch →
> `deepseek-v4-pro` (≈flash 5-10x 价)。
> **Scope**: 4 files + 1 new test。commander/worker 行为零漂移。
> **Cycle 类型**: quick-fix sub-cycle (per plan §6 模板)。skip formal review per user 成本优先。
> **Codex review (若未来补跑)**: `codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.2.0d.2-v0.1-prompt.md`

---

## §1 契约 — 三层模型优先级

`resolveModelOverride(modelClass)` 返回 CLI `--model` override (undefined = role patch yaml 决定):

| 优先级 | 来源 | 语义 |
|--------|------|------|
| 1 | `DSH_MODEL` | 直接 override, 压过一切 |
| 2 | `DEEPSEEK_COST_MODE` | `cheap` (默认) = 全 class 落 v4-flash; `full` = role patch 默认 (orch 回 v4-pro) |
| 3 | role patch yaml | authoritative (orch→v4-pro / commander,worker→v4-flash per docs/m0b/) |

关键不变量: cheap 模式只给 **orch** 补 `--model` (其 role 默认是贵的 v4-pro); commander/worker
role 默认已是 flash → 返回 undefined → args 字节不变。

## §2 Files (4 + 1 test)

| # | 文件 | 改动 |
|---|------|------|
| 1 | `wrapper/dsh/dsh_client.ts` | +42: resolver + ROLE_DEFAULT_MODEL + buildArgs 条件注入 |
| 2 | `spec/capabilities/commander.json` | model_id → deepseek-v4-flash |
| 3 | `deploy/env/newvps.env.example` | 首次入库; MODEL default flash; 全 placeholder |
| 4 | `wrapper/test/unit/dsh_client_cost_mode.test.ts` | NEW 9 单测 |

## §3 Codex 期望输出

- Correctness: 优先级矩阵正确 (DSH_MODEL > COST_MODE > yaml); `--model` 注入位置在双 `--patch` 之后
- Consistency: 与 execution_driver `spawnDsh` 的 `--model ${DSH_MODEL ?? v4-flash}` 路径不冲突 (两条独立路径)
- Hygiene: 0 红线 (无 TODO(M1)/Fable/GLM/MiniMax/sk-32+); 无真实 secret 入库
- 预期 0C/0M/0m

## §4 验证命令

```bash
ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc --noEmit'  # exit 0
ssh newvps 'cd /opt/fish-harness/wrapper && unset DEEPSEEK_API_KEY; export RUN_QUEUE_BACKPRESSURE_E2E=1 RUN_OOM_PREVENTION_E2E=1 RUN_WORKER_POOL_E2E=1 RUN_SERVER_HEARTBEAT_E2E=1 RUN_ORCH_COMMANDER_E2E=1 RUN_PACK_PLAN_E2E=1 RUN_CROSS_HOST_E2E=1 RUN_HOST_FENCING_E2E=1 RUN_MACBOOK_E2E=1; ./node_modules/.bin/vitest run'  # 304/304 PASS
grep -rn "deepseek-chat" spec/capabilities/*.json | grep -v notes | wc -l  # 0 (活配置清零; worker.json notes 历史记载保留)
```

---

*v1.2.0d.2 audit-scope (compact) — 2026-09-07。skip formal review per user 成本优先; 本文件供未来补跑。*
