# 审验签发 — T-DD-4（ADR 0008 v1.0 Package Architecture）

> **给 CC**：Cursor 暂不可用，本 dispatch 由架构师自签（per GA plan §2 T-DD-4 模板）。
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。
> 做完即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

> **回签时**：等 Cursor 复活后补一份 `REVIEW-T-DD-4.md`（PASS/P1 列）即可，本枪产物无需重做。

---

## 任务

**T-DD-4** — ADR 0008 创建（GA plan §2 + §4 step 12 = 9 ADR count）

### 背景

v1.0 引入 `harness/` package 后，5 个 subpackage 各自的职责、复用关系、版本对齐规则没有 ADR 文档化。直接后果：

- 新 contributor 不知道代码属于哪个 subpackage
- spike vs production 双源 drift 风险（虽然 `spikes/m0/_helpers.py` 与 `harness/runtime/_db.py` 内容不重复，但 ownership 未声明）

GA plan §4 step 12 = `ls adr/000*.md | wc -l` == 9（v1.0 完整 ADR 数）。
T-DD-4 = 创建 ADR 0008，让 step 12 进度 +1（3/9 → 4/9）。

### 产出

| 文件 | 内容 |
|------|------|
| `adr/0008-v1.0-package-architecture.md`（新建） | Status=Accepted (v1.0); Date 2026-09-01; 5 subpackage 布局 + spike ownership 映射 + 依赖方向图 + 版本对齐规则 + 出口协议 |
| `CHANGELOG.md` | ADR table 第 8 行从 `_pending T-DD-4_` → `Accepted (v1.0)` + 改 link 到新 ADR |
| `docs/DISPATCH-T-DD-4.md` | 本文件 |
| `docs/REVIEW-T-DD-4.md` | 架构师自签（Cursor 复活可追加）|
| `docs/NOW.md` | §2 加 T-DD-4 行；§4 → 下一枪（T-DD-5 ADR 0009 SQLite WAL constraints） |

### 行为契约

ADR 0008 必须满足：

1. **H1 标题** `# ADR 0008 — v1.0 Package Architecture (harness/ Layout + Spike→Production Ownership)`
2. **Status = Accepted (v1.0)**（per T-DD-4 task spec）
3. **Date = 2026-09-01**（与 CHANGELOG v1.0.0a0 release 同日）
5. **Deciders = Architect (T-DD-4 自签 — Cursor 暂不可用，per GA plan §2 模板)**；与 ADR 0001 Deciders 风格保持一致
6. **Supersedes = ADR 链无（v1.0 新主题；与 ADR 0005/0006/0007 并列）**
7. **Related 段含** 5 个 link（GA plan §2 + pyproject.toml + harness/__init__.py + spikes/m0/_helpers.py + spec/ + CHANGELOG.md）
8. **Context 段** 解释 v0.9-B spec+spike baseline → v1.0 runtime 的 gap；引用 GA plan §7 + 用户硬规则
9. **Decision 段** 必须含：
   - **5 subpackage table**：runtime / gateway / drivers / testing / benchmark 各列「职责 + v0.9 spike ownership + 关键 production 类」
   - **复用规则（4 条 binding）**：`_helpers.py` / `conformance-second-impl.py` / `mutation-test.py` 不可删；生产代码不反向依赖 spike
   - **依赖方向图**：runtime 无内部依赖；gateway→runtime；drivers→runtime；testing→{runtime,gateway,drivers}；benchmark→{runtime,gateway}
   - **反向依赖禁令**：列出 4 类禁反向
   - **版本对齐规则**：pyproject version == CHANGELOG 段；spec 改动必须 sync 改 production + spike
   - **10 Protocol 出口**：列 10 Protocol export 列表（不含 WorkflowPack）
10. **Alternatives Considered 段**：A1 单包 / A2 删 spike / A3 spike 引用 harness / A4 6 subpackage — 4 个全拒
11. **Consequences 段**：3-5 优 + 2 缺

### CHANGELOG.md 联动

CHANGELOG.md `## ADR cross-reference` table 第 8 行需从：

```
| ADR 0008 (v1.0 package architecture) | _pending T-DD-4_ | will document `harness/` layout + spike→production ownership |
```

改为：

```
| [ADR 0008](adr/0008-v1.0-package-architecture.md) | Accepted (v1.0) | documents `harness/` 5-subpackage layout + spike→production ownership |
```

### 验收

```bash
# 文件存在 + Status 正确
test -f adr/0008-v1.0-package-architecture.md
head -4 adr/0008-v1.0-package-architecture.md
# 期望: 
#   # ADR 0008 — v1.0 Package Architecture ...
#   > **Status**: Accepted (v1.0)
#   > **Date**: 2026-09-01
#   > **Deciders**: Architect (T-DD-4 自签 — Cursor 暂不可用，per GA plan §2 T-DD-4 模板)

# 5 subpackage 全列出
grep -E 'harness/(runtime|gateway|drivers|testing|benchmark)' adr/0008-v1.0-package-architecture.md | wc -l   # >= 5

# 3 spike ownership 锁定
grep -c 'spikes/m0/_helpers.py' adr/0008-v1.0-package-architecture.md   # >= 1
grep -c 'conformance-second-impl.py' adr/0008-v1.0-package-architecture.md   # >= 1
grep -c 'mutation-test.py' adr/0008-v1.0-package-architecture.md   # >= 1

# 10 Protocol 出口
grep -E 'WorkerPool|EventSink|ContextDistiller|ContextBudget|ContextManager|ArtifactStore|ToolInvocationGateway|ToolProvider|PolicyDecision|ExecutionDriver' adr/0008-v1.0-package-architecture.md | wc -l   # >= 10

# CHANGELOG PENDING 已删
grep -c 'pending T-DD-4' CHANGELOG.md   # 0

# README link 现 resolve
grep -E '\[adr/0008' README.md   # 已有 line 117

# ADR 数量
ls adr/000*.md | wc -l   # 8 (从 3 → 8: 0001-0007 pre-exist + 0008 NEW)

# 主机无回归 (4/4 PASS)
pytest tests/ -q                                                          # 37/37
python3 -m harness.testing.mutation_suite                                # 17/17
python3 -m harness.benchmark.runner --tasks=50 --workers=4               # exit 0
python3 -m harness.testing.stress_test --workers=5 --tasks=10            # exit 0
```

### 不动

- `harness/` / `spec/` / `spikes/m0/_helpers.py` / `.github/workflows/*` / `pyproject.toml`
- `docs/CC-POLL.md` / `POLL-PROTOCOL.md` / `v1.0-ga-team-plan.md` / `NORTH-STAR.md` / `VISION.md`
- `adr/0001-0007.md` (T-DD-6 单做 v1.0 footer)
- `adr/0009-sqlite-wal-production-constraints.md` (T-DD-5 单做)
- `Dockerfile` / `docker-compose.yml` / `.dockerignore`
- `LICENSE` / `README.md` §License footer

### 已知 P1（不挡）

- 不在 CI 加 `import-linter` / `pydeps` 反向依赖 gating — 等 T-DD-6 v1.0 footer 同步加
- 不在 ADR 0008 详列每个 Protocol 的 spec file 路径 — 简化为 `from harness.spec_interfaces import ...` + 相关 spec file 在 §Related
- 不为 ADR 0008 写日期 footer (T-DD-6 v1.0 Status footer 同步加)

---

## 完成后

1. NOW：T-DD-4 ✅；§4 → 下一枪（T-DD-5 ADR 0009 SQLite WAL constraints）
2. `docs/poll/cc-ready.json`（真实 commit）→ commit + push
3. 写本枪的 `docs/REVIEW-T-DD-4.md`（架构师自签 PASS — 等 Cursor 复活可追加签名）

## 禁止

不开 T-DO-5/真 Codex；不删 `_helpers.py` / `conformance-second-impl.py` / `mutation-test.py`；不改 schema RAISE；不开 v1.1；不 force push；不动 production code / CI / spec / existing ADR 0001-0007 / poll doc / pyproject