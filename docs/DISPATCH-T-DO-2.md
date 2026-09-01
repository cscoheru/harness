# 审验签发 — T-DO-2

> **给 CC**：只读本文件 + 文内指针。不要整段粘贴长 prompt。  
> **做完一枪即停。** 未读完禁止改代码。

---

## 0. 硬起步（按序 Read）

1. `.cursor/rules/00-now.mdc`
2. `docs/NOW.md` §2–§4
3. `docs/v1.0-ga-team-plan.md` §2 **T-DO-2** + §4 第 3–5 步
4. `docs/HANDOFF-TO-CURSOR.md`（P1：缺 `spec/` / runtime export）
5. 现有 `Dockerfile`

---

## 1. 上一枪审验（T-DO-1）— PASS

| 检查 | 结果 |
|------|------|
| `docker build -t fish-harness:1.0.0a0 .` | OK，image ~212MB |
| 容器 `import harness` / `python -m harness` | → `1.0.0a0` |
| 合同字面 | **PASS** |

**阻塞（本枪必须解，否则 compose / GA §4 不过）：**

1. 镜像未 COPY `spec/` → 容器内 `from harness.gateway import …` → `No module named 'spec'`
2. `harness/runtime/__init__.py` 未 re-export → `from harness.runtime import SqliteWorkerPool` 失败
3. 宿主机 gateway import **正常**；失败面在容器缺 `spec`

---

## 2. 本枪任务 — T-DO-2

**目标**：`docker-compose.yml` 本地开发；解开容器可用性阻塞。

### 必做产出

| 文件 | 做什么 |
|------|--------|
| `docker-compose.yml` | services: `harness` + `test-runner`；named volume `harness_db` |
| `Dockerfile` | **最小补丁**：COPY `spec/`；`ENV HARNESS_SCHEMA_PATH=…`；**base 按裁定换 alpine**（见 `docs/ADJUDICATION-sqlite-raise-T-DO-2.md`：`python:3.12-alpine`，若 sqlite&lt;3.47 则 `3.14-alpine`）；build 后断言 `sqlite3.sqlite_version >= 3.47.0`。**禁止**把动态 `RAISE(…\|\|…)` 改成 literal；**禁止** test-runner 改 host 跑 spike |
| `harness/runtime/__init__.py` | re-export `SqliteWorkerPool`, `SqliteEventSink`, `SqliteContextManager` |

### 推荐

- `test-runner` 同 Dockerfile build；**volume mount** `./spikes:/app/spikes:ro`（勿把 spikes bake 进生产层也可）
- compose 注释：WAL 单 host；禁跨 host/NFS SQLite

### compose 形状（名字对齐验收）

```yaml
services:
  harness:
    build: .
    volumes: [harness_db:/data]
  test-runner:
    build: .
    volumes:
      - ./spikes:/app/spikes:ro
      - harness_db:/data
    working_dir: /app
    command: >
      sh -c "python spikes/m0/conformance-second-impl.py &&
             python spikes/m0/egress-httpx-actual.py &&
             python spikes/m0/worker-dispatch-test.py &&
             python spikes/m0/worker-events-emit-test.py &&
             python spikes/m0/context-budget-test.py"
volumes:
  harness_db:
```

---

## 3. 验收（全部 exit 0）

```bash
docker build -t fish-harness:1.0.0a0 .
docker run --rm fish-harness:1.0.0a0 python -c "import harness; print(harness.__version__)"
docker run --rm fish-harness:1.0.0a0 python -c \
  "from harness.runtime import SqliteWorkerPool, SqliteEventSink, SqliteContextManager; print('runtime ok')"
docker run --rm fish-harness:1.0.0a0 python -c \
  "from harness.gateway import HttpEgressService, ToolInvocationGatewayImpl, RealArtifactStore; print('gateway ok')"
docker compose up --build test-runner
```

---

## 4. 完成后

1. `docs/NOW.md`：T-DO-2 → ✅；§4 → **T-DO-3**（`.dockerignore`）
2. 更新 `docs/HANDOFF-TO-CURSOR.md`（注明 spec-in-image + runtime export 已关）
3. **停下来**，等用户下一句

---

## 5. 禁止

- 不扩 T-DO-3/4/5、T-QA-*、真 Codex、v1.1、TS、dsh
- 不删 `spikes/m0/_helpers.py`；不改 NORTH-STAR / VISION 合同
- 不把 SQLite 当 NFS 多机
- 不 commit（除非用户明确要求）
