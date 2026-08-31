# HANDOFF — Cursor 接棒上下文

> **规则 / 禁止不写在这里**——Cursor 必须先读 `.cursor/rules/00-now.mdc` + `docs/NOW.md`（硬起步）。
> 本文件只放**不可从那两个文件推导的信息**：本会话做了什么 / 待审什么 / 下一枪是什么。
> 每次 T-N 完成就覆盖本文件三栏；规则部分保持稳定。

---

## 做了什么

| ID | 状态 | 关键交付 |
|----|------|----------|
| T-BE-5…T-TG-3 | ✅ | 见 NOW.md §2 |
| **T-TG-4** | ✅ done 2026-08-31 | `harness/drivers/{_stub,codex_sdk,codex_exec,__init__}.py` + 2 evidence 文件 — `CodexSdkDriver` (CODEX_SDK) + `CodexExecDriver` (CODEX_EXEC) 共享 `StubDriverBase`；run() 幂等缓存；interrupt/heartbeat no-op；supports_tool_gateway=False (Q112)；evidence_uri 指向实存空 JSON |
| **T-TG-4 审验** | ✅ 2026-08-31 | import OK；10-phase dedicated smoke 全过（isinstance/cap/run-2-events/no-raise/duplicate cached/namespace/evidence file）；conformance 10/10 + TrivialDriver driver 部分无回归；egress 8/8 无回归；`pip install -e .` OK |

## 需要审验（当前 untracked）

| 文件 | 类型 | 审什么 |
|------|------|--------|
| `harness/drivers/_stub.py` | new | `StubDriverBase` 4 法 + 幂等缓存（`(attempt_id, fence_version)` 键） |
| `harness/drivers/codex_sdk.py` | new | `CodexSdkDriver` 仅覆 `_driver_kind/evidence_uri/notes` |
| `harness/drivers/codex_exec.py` | new | `CodexExecDriver` 同形 |
| `harness/drivers/__init__.py` | new | export 3 个类（单例身份） |
| `harness/drivers/evidence-sdk-stub.json` | new | 空 `{}` JSON（让 evidence_uri 可达） |
| `harness/drivers/evidence-exec-stub.json` | new | 空 `{}` JSON（让 evidence_uri 可达） |

P1（不挡 T-TG-5）：
1. 真实 Codex SDK 集成延后 v1.1（v1.0 stub 不开 subprocess / 不连网 / 不导入 SDK）
2. run() 事件 stream 仅 `[STARTED, FINISHED]`；中间事件（HEARTBEAT/OUTPUT_CHUNK/TOOL_CALL_*）v1.1 再加
3. `_stream_cache` 永不清理（v1.0 stub 不需要）；真 driver v1.1 需 LRU + TTL
4. `CodexAppServerDriver` 未建（schema/Enum 包含 CODEX_APP_SERVER，T-TG-4 范围仅 sdk+exec）

## 下一步做什么（**T-TG-5**，下一枪）

见用户消息中的 CC 合并任务包。
