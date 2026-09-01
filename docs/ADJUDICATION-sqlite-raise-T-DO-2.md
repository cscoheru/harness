# 裁定 — 容器 SQLite 版本 vs RAISE(expr)（T-DO-2）

> **日期**：2026-08-31  
> **状态**：Accepted（本会话裁定）  
> **影响**：T-DO-1 Dockerfile base / T-DO-2 compose 验收

---

## 事实

1. `spec/kernel-schema.sql` 多处使用 **表达式型** `RAISE(ABORT, '…' || OLD.col || …)`（如 I16/I17、append-only snapshot）。
2. 这不是「3.46 bug」，而是 **SQLite 3.47.0+ 才支持的功能**（2024-10-21 changelog：Allow arbitrary expressions in RAISE second arg）。&lt;3.47 仅允许 string literal。
3. 实测：
   - 宿主：`3.50.4`（spike 绿）
   - `python:3.12-slim` / `3.13-slim` / `3.14-slim`：`3.46.1`（schema 应用失败）
   - `python:3.14-alpine`：`3.53.2`（满足 ≥3.47）
4. GA plan §2 T-DO-1 写死 `python:3.12-slim` — 与 schema 对 SQLite 的真实下限冲突。

---

## 裁定（选哪个）

| # | 方案 | 裁决 |
|---|------|------|
| **1** | 换 base 到带新 SQLite 的镜像（alpine 系） | **采用** |
| 2 | 保留 3.12-slim + patch schema 全改 literal | **否** — 丢掉诊断文案；与 spike/mutation 断言漂移风险高 |
| 3 | 3.12-slim + 源码编 SQLite 3.50 | **否（主路径）** — 构建重、维护贵；仅作 alpine 不可行时的 fallback |
| 4 | compose test-runner 改 host 跑 spike | **否** — 破坏「容器内 gate」；宿主/镜像漂移正是要抓的 |

### 具体执行方向（T-DO-2 内最小改）

1. **Dockerfile `FROM` → `python:3.12-alpine`**（优先贴近 plan 的 3.12；若该 tag 拉到的 `sqlite3.sqlite_version < 3.47.0`，则改 **`python:3.14-alpine`**）。
2. 镜像 build 后 **硬门**（写进 Dockerfile 注释 + smoke）：
   ```bash
   python -c "import sqlite3; v=sqlite3.sqlite_version; assert tuple(map(int,v.split('.'))) >= (3,47,0), v"
   ```
3. 在 `docs/v1.0-ga-team-plan.md` §2 T-DO-1 行加脚注（CC 可顺手改一句，或 Cursor 审验时改）：  
   `base = python:3.12-alpine（或 3.14-alpine）；要求 stdlib sqlite3 ≥ 3.47（RAISE expr）。原 3.12-slim=3.46.1 不满足 schema。`
4. **不**改 `spec/kernel-schema.sql` 的动态 RAISE（保留 I16/I17 等消息）。
5. alpine/musl：若 `httpx`/`jsonschema` 无 wheel 导致 pip 失败 → 再升级到裁定 fallback（源码 SQLite 或换带新 libsqlite 的 bookworm 衍生镜像）；**先试 alpine**。

---

## 对 T-DO-2 的含义

- DISPATCH 验收不变：`docker compose up --build test-runner` exit 0（**容器内**跑 spike）。
- 允许本枪改 Dockerfile base（解开阻塞，属 T-DO-2 范围，不是新开枪）。
- 完成后在 REVIEW / NOW 注明：base 偏离原文 `3.12-slim` 的原因 = 本裁定。

---

## 给 CC（一句）

```text
按 docs/ADJUDICATION-sqlite-raise-T-DO-2.md：Dockerfile 改 python:3.12-alpine（不够新则 3.14-alpine）；断言 sqlite≥3.47；勿 patch schema RAISE；勿改 host-only spike。
```
