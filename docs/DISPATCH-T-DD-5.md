# 审验签发 — T-DD-5（ADR 0009 SQLite WAL Production Constraints）

> **给 CC**：Cursor 暂不可用，本 dispatch 由架构师自签（per GA plan §2 T-DD-5 模板）。
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。
> 做完即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

> **回签时**：等 Cursor 复活后补一份 `REVIEW-T-DD-5.md`（PASS/P1 列）即可，本枪产物无需重做。

---

## 任务

**T-DD-5** — ADR 0009 创建（GA plan §2 + §4 step 12 = 9 ADR count 最后一个新建）

### 背景

`spec/kernel-schema.sql` line 73-75 定义 `PRAGMA journal_mode = WAL` + `busy_timeout = 5000` + `synchronous = NORMAL`；`spec/worker-pool.md §6` 文档化 Invariant I18 (Cross-server 共享 DB 约束)。但 v0.9-B 阶段没有 ADR 层面的「single-host only + 多 host NOT + post-v1.0 rqlite/Litestream 评估」正式决策。

直接后果：

- 运维误把 `harness_db` volume mount 到 NFS → POSIX advisory lock 失效
- 业务方误以为 v1.0 支持 multi-region active-active → fence violation 重复 dispatch
- post-v1.0 评估 rqlite/Litestream 没有 baseline 文档对比

GA plan §4 step 12 = `ls adr/000*.md | wc -l` == 9。本枪 = 创建 ADR 0009，让 step 12 从 8/9 → **9/9 ✅**。

### 产出

| 文件 | 内容 |
|------|------|
| `adr/0009-sqlite-wal-production-constraints.md`（新建） | Status=Accepted (v1.0); Date=2026-09-01; WAL single-host rule + multi-host NOT + multi-region NOT + 性能 baseline (1968/s + p99 < 70ms) + post-v1.0 rqlite/Litestream 评估路径 |
| `CHANGELOG.md` | ADR table line 210 从 `_pending T-DD-5_` → `Accepted (v1.0)` link |
| `docs/DISPATCH-T-DD-5.md` | 本文件 |
| `docs/REVIEW-T-DD-5.md` | 架构师自签（Cursor 复活可追加）|
| `docs/NOW.md` | §2 加 T-DD-5 行；§4 → 下一枪（T-DD-6 9 ADR v1.0 footer updates） |

### 行为契约

ADR 0009 必须满足：

1. **H1 标题** `# ADR 0009 — SQLite WAL Production Constraints (Single-Host Only)`
2. **Status = Accepted (v1.0)**; Date 2026-09-01
3. **Deciders = Architect 自签** (Cursor 不可用 per GA plan §2)
4. **Supersedes = ADR 链无**（v1.0 新主题；与 ADR 0005/0006/0007/0008 并列）
5. **Related 段含**：`spec/kernel-schema.sql` PRAGMA (line 73-75) + `spec/worker-pool.md §6` I18 + `_db.py:connect_with_fk()` + spikes + docker-compose.yml + Dockerfile + ADR 0008 + CHANGELOG.md
6. **Context 段** 解释：v0.9-B 已有 spec 但无 formal decision；运维风险 + GA plan §5 R-2 (R-2: SQLite WAL 并发上限)
7. **Decision 段** 必须含：
   - **单 host 强约束**：✅ SQLite WAL 单 host; ❌ NFS/CIFS/shared block storage; ❌ Multi-region active-active; ❌ Multi-host active-active
   - **docker-compose.yml / production deploy 约束**：local volume only; 单 host ≤ 16 worker
   - **性能 + 并发上限**：实测 baseline 1968/s + p99 < 70ms + BUSY_TIMEOUT 5000ms
   - **post-v1.0 评估路径**：rqlite / Litestream / rqlite+Litestream 三个选项（NOT in v1.0）
   - **与 ADR 0008 ownership**：`harness/runtime/` 是 implementation owner
   - **与 ADR 0005/0006/0007 关系**：全部 single-host 假设
8. **Alternatives Considered 4 个**：A1 NFS / A2 rqlite v1.0 / A3 Litestream v1.0 / A4 PostgreSQL — 4 拒
9. **Consequences 段**：4 优 + 3 缺（与 ADR 0008 风格保持）

### CHANGELOG.md 联动

CHANGELOG.md `## ADR cross-reference` table line 210 需从：

```
| ADR 0009 (SQLite WAL production constraints) | _pending T-DD-5_ | will document WAL single-host rule + post-v1.0 rqlite/Litestream path |
```

改为：

```
| [ADR 0009](adr/0009-sqlite-wal-production-constraints.md) | Accepted (v1.0) | documents WAL single-host rule + multi-host/region NOT + post-v1.0 rqlite/Litestream evaluation path |
```

### 验收

```bash
# 文件存在 + Status 正确
test -f adr/0009-sqlite-wal-production-constraints.md
head -4 adr/0009-sqlite-wal-production-constraints.md
# 期望:
#   # ADR 0009 — SQLite WAL Production Constraints (Single-Host Only)
#
#   > **Status**: Accepted (v1.0)
#   > **Date**: 2026-09-01

# WAL + I18 + post-v1.0 路径全提
grep -c 'WAL' adr/0009-sqlite-wal-production-constraints.md                                  # >= 10
grep -c 'I18' adr/0009-sqlite-wal-production-constraints.md                                  # >= 2
grep -E 'NFS|multi-region|Litestream|rqlite' adr/0009-sqlite-wal-production-constraints.md    # >= 10

# docker-compose.yml 注释引用 ADR 0009
grep -c 'ADR 0009' docker-compose.yml    # >= 1

# CHANGELOG PENDING 已删
grep -c 'pending T-DD-5' CHANGELOG.md    # 0

# README link 现 resolve (T-DD-1 已 link)
grep 'adr/0009' README.md    # line 118 已 link

# ADR 总数 = 9 (step 12 必填项)
ls adr/000*.md | wc -l    # 9

# 主机无回归 (4/4 PASS)
pytest tests/ -q                                                          # 37/37
python3 -m harness.testing.mutation_suite                                # 17/17
python3 -m harness.benchmark.runner --tasks=50 --workers=4               # exit 0
python3 -m harness.testing.stress_test --workers=5 --tasks=10            # exit 0
```

### 不动

- `harness/` / `spec/` / `spikes/m0/_helpers.py` / `.github/workflows/*` / `pyproject.toml`
- `docs/CC-POLL.md` / `POLL-PROTOCOL.md` / `v1.0-ga-team-plan.md` / `NORTH-STAR.md` / `VISION.md`
- `adr/0001-0008.md` (T-DD-6 单做 v1.0 footer)
- `Dockerfile` (不动; ADR 0009 §Related 已 link)
- `LICENSE` / `README.md` (T-DD-1 已 link ADR 0009; 现自动 resolve)
- `docker-compose.yml` 注释 (line 12 已经引用 ADR 0009; 不需再加)

### 已知 P1（不挡）

- 不写 `compose.local-override.yml` 强制 `driver: local` (default 已正确; 不需显式 override)
- 不写 `k8s deployment example` (v1.0 不集成 K8s; 留 post-v1.0)
- 不写 Litestream `litestream.yml` 配置文件 (post-v1.0)
- 不在 `Dockerfile` 加 `HEALTHCHECK` (单 host container 不依赖 liveness probe)
- ADR 0001-0008 v1.0 footer 同步加 — T-DD-6 单做

---

## 完成后

1. NOW：T-DD-5 ✅；§4 → 下一枪（T-DD-6 9 ADR v1.0 footer updates — 全部 v1.0 收尾）
2. `docs/poll/cc-ready.json`（真实 commit）→ commit + push
3. 写本枪的 `docs/REVIEW-T-DD-5.md`（架构师自签 PASS — 等 Cursor 复活可追加签名）

## 禁止

不开 T-DO-5/真 Codex；不删 `_helpers.py` / `conformance-second-impl.py` / `mutation-test.py`；不改 schema RAISE；不开 v1.1；不 force push；不动 production code / CI / spec / existing ADR 0001-0008 / poll doc / pyproject / Dockerfile / docker-compose.yml 注释 / README.md Doc index