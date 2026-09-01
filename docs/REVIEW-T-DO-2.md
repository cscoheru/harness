# REVIEW — T-DO-2

> **Verdict**: **PASS**  
> **Date**: 2026-08-31 (Cursor 即时审验，未等 30min tick)  
> **Commit**: `eea5991` (`feat(do): Dockerfile base 3.14-alpine + COPY spec + runtime exports + compose`)  
> **Image**: `945685d5f836` · 87.3MB · `python:3.14-alpine` · SQLite **3.53.2**

---

## 验收复跑（本机 Cursor）

| # | 检查 | 结果 |
|---|------|------|
| 1 | `import harness` → `1.0.0a0` | PASS |
| 2 | `sqlite3.sqlite_version >= 3.47.0` | PASS (`3.53.2`) |
| 3 | `from harness.runtime import SqliteWorkerPool, SqliteEventSink, SqliteContextManager` | PASS |
| 4 | `from harness.gateway import HttpEgressService, ToolInvocationGatewayImpl, RealArtifactStore` | PASS |
| 5 | `from spec.interfaces…`（PYTHONPATH=/app） | PASS |
| 6 | 容器内 5 spike gate（`docker run -v spikes:ro` 等价 test-runner） | PASS：conformance + egress + worker-dispatch 21 + worker-events 6 + context-budget |

## 合同对齐

- `docker-compose.yml`：`harness` + `test-runner` + `harness_db` ✓  
- Dockerfile：COPY `spec/` + sqlite 硬门 + alpine base per `docs/ADJUDICATION-sqlite-raise-T-DO-2.md` ✓  
- 动态 `RAISE(expr)` **未**被改成 literal ✓  

## P1（不挡 PASS）

1. 宿主无 `docker compose` v2；验收用等价 `docker run`（NOW 已注明）。建议本机装 compose plugin，或文档写明等价命令。  
2. `cc-ready.json` 的 `commit` 字段为 `null`（应为 `eea5991…`）；本地 `main` **无 upstream**——CC 须 `git push -u` 后 5min 轮询才生效。  
3. 大量早期 `harness/**` / `pyproject.toml` 仍 **untracked**（未进 `eea5991`）；不影响本枪镜像（commit 含 Dockerfile 所需路径），但仓库完整性差——后续枪应 `git add` 收口。  
4. CI `m0-contract-tests` 用 runner 系统 `sqlite3` 灌 schema——若 runner &lt;3.47 会炸；记入后续 DO/QA（非本枪）。

---

## 下一单

已签发合并包：[`docs/DISPATCH-T-DO-3.md`](DISPATCH-T-DO-3.md)  
（**Phase A = T-DO-3** `.dockerignore` · **Phase B = T-DO-4** `deploy.yml` 骨架；一次交付、一次 `cc-ready`）
