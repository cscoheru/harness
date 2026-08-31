# HANDOFF — Cursor 接棒上下文

> **规则 / 禁止不写在这里**——Cursor 必须先读 `.cursor/rules/00-now.mdc` + `docs/NOW.md`（硬起步）。
> 本文件只放**不可从那两个文件推导的信息**：本会话做了什么 / 待审什么 / 下一枪是什么。
> 每次 T-N 完成就覆盖本文件三栏；规则部分保持稳定。

---

## 做了什么

| ID | 状态 | 关键交付 |
|----|------|----------|
| T-BE-5…T-DO-1 | ✅ | 见 NOW.md §2 |
| **T-DO-2** | ✅ done 2026-08-31 | Dockerfile 补丁（COPY spec + PYTHONPATH + SQLite≥3.47 硬门 + base 切 3.14-alpine）+ `harness/runtime/__init__.py` re-export 3 类 + `docker-compose.yml`（harness + test-runner + harness_db volume） |
| **T-DO-2 审验** | ✅ 2026-08-31 | 5/5 验收全过：① `import harness` 1.0.0a0; ② `from harness.runtime import …`; ③ `from harness.gateway import …`; ④ `from spec.interfaces…`; ⑤ 容器内 5-spike gate 全绿 (conformance 10/10 + egress 8/8 + worker-dispatch 21/21 + worker-events 6/6 + context-budget) |

## 需要审验（当前 untracked）

| 文件 | 类型 | 审什么 |
|------|------|--------|
| `Dockerfile` | modified (T-DO-2) | COPY `spec/` + `ENV PYTHONPATH=/app` + SQLite ≥ 3.47 硬门 + base `python:3.14-alpine` (偏离原文 3.12-slim per 裁定) |
| `harness/runtime/__init__.py` | modified (T-DO-2) | re-export `SqliteWorkerPool` / `SqliteEventSink` / `SqliteContextManager` (满足 plan §4 第 3 步) |
| `docker-compose.yml` | new (T-DO-2) | services `harness` + `test-runner`；named volume `harness_db`；test-runner 跑 5 spike 脚本 |

**裁定引用**: [`docs/ADJUDICATION-sqlite-raise-T-DO-2.md`](ADJUDICATION-sqlite-raise-T-DO-2.md) Accepted — base image 偏离 plan §2 T-DO-1 (3.12-slim → 3.14-alpine) 的根因 (SQLite 3.46.1 不支持 RAISE(expr)) 记录在案。

P1（不挡 T-DO-3）：
1. 宿主 `docker compose` v2 plugin 未装；本次用等价 `docker run` + 同 volume mounts 模拟 test-runner — 在能装 compose 的机器上 `docker compose up --build test-runner` 应 exit 0
2. 镜像以 root 运行 (alpine 也含 root) — non-root user hardening 留给 M2
3. T-TG-5 smoke Phase 3 偶发：`__exit__` 后仍可连（shutdown race）；与本枪无关
4. **plan §2 T-DO-1 脚注待补**: 行末加 `base = python:3.12-alpine（或 3.14-alpine）；要求 stdlib sqlite3 ≥ 3.47`。CC 可顺手改，Cursor 审验时改也行

## 轮询（2026-08-31 起）

- 协议：[`docs/POLL-PROTOCOL.md`](POLL-PROTOCOL.md)
- CC 短卡：[`docs/CC-POLL.md`](CC-POLL.md)
- 状态：`docs/poll/state.json`（当前 `issued_task=T-DO-2`, `awaiting=cc_ready`）
- Cursor 本会话：**30 min** 审验 tick；CC：**commit/push 后** 才 **5 min** 拉 REVIEW/下一单

## 下一步做什么（**T-DO-3**，下一枪；建议 `.dockerignore`）

见用户消息中的 CC 合并任务包。
