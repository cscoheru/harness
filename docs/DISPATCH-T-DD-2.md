# 审验签发 — T-DD-2（CHANGELOG.md）

> **给 CC**：Cursor 暂不可用，本 dispatch 由架构师自签（per GA plan §2 T-DD-2 模板）。  
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。  
> 做完即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

> **回签时**：等 Cursor 复活后补一份 `REVIEW-T-DD-2.md`（PASS/P1 列）即可，本枪产物无需重做。

---

## 任务

**T-DD-2** — CHANGELOG.md 创建（GA plan §2 + §4 验收清单第 11 步）

### 背景

README.md (T-DD-1) 第 87 行已 link 到 `CHANGELOG.md`（标 PENDING）。M3 GA Exit Gate 必须 `test -f CHANGELOG.md` + 五段结构正确。  
T-DD-2 = 建 CHANGELOG.md，v1.0.0a0 段写 Added/Changed/Deprecated/Security/Fixed 五块 + v0.9 → v1.0 升级路径。

### 产出

| 文件 | 内容 |
|------|------|
| `CHANGELOG.md`（新建） | v1.0.0a0 段 + 5 块结构 + v0.9→v1.0 升级路径 + ADR cross-ref |
| `docs/DISPATCH-T-DD-2.md` | 本文件 |
| `docs/REVIEW-T-DD-2.md` | 架构师自签（Cursor 复活可追加）|
| `docs/NOW.md` | §2 加 T-DD-2 行；§4 → 下一枪 |

### 行为契约

CHANGELOG.md 必须包含：

1. **H1 标题** `# Changelog` + tagline `fish-harness v1.0.0a0 — Keep a Changelog style`
2. **v1.0.0a0 段**（发布日期 `2026-09-01`）：
   - **Added** — 所有 v1.0 新增能力（5 subpackage + 10 Protocol + production classes + tests + CI + container）
   - **Changed** — `pyproject.toml`、Dockerfile base (3.12-slim → 3.14-alpine per ADJUDICATION)、spike 引用方式
   - **Deprecated** — v1.0 first release，无 (显式写 "None")
   - **Security** — PinnedResolver SSRF / redirect re-pin / proxy-must-be-configured
   - **Fixed** — v1.0 first release，无 (显式写 "None (v1.0 baseline)")
3. **v0.9 → v1.0 升级路径** section — spec baseline preserved / spike suite 保留 / production runtime 新增 / mutation suite 迁移 / container 新增
4. **ADR cross-ref** — 列出 ADR 0001-0007 现有 + ADR 0008/0009 待 T-DD-4/5 单做 (PENDING 标)
5. **Keep a Changelog 引用 + Semantic Versioning 引用** footer

### v1.0.0a0 段必须包含的所有事实项

| 任务 | Added/Changed 项 |
|------|------------------|
| T-BE-1..4 | Added `harness.runtime.{SqliteWorkerPool,SqliteEventSink,SqliteContextManager}` |
| T-BE-5 | Added `pyproject.toml` + `harness/__init__.py` 暴露 5 Protocol |
| T-TG-1 | Added `harness.gateway.HttpEgressService` + `PinnedResolver` (12 BLOCKED_NETWORKS) |
| T-TG-2 | Added `harness.gateway.ToolInvocationGatewayImpl` (ADR 0005 6-step chain) |
| T-TG-3 | Added `harness.gateway.RealArtifactStore` (sha256 + atomic write) |
| T-TG-4 | Added `harness.drivers.CodexSdkDriver` + `CodexExecDriver` v1.0 stubs |
| T-TG-5 | Added `harness.testing.InProcessEgressServer` (127.0.0.1 fixture) |
| T-DO-1..3 | Added `Dockerfile` + `docker-compose.yml` + `.dockerignore` |
| T-DO-2 ADJUDICATION | Changed base image `python:3.12-slim → python:3.14-alpine` (schema RAISE expr 需 SQLite 3.47+) |
| T-DO-4 + T-QA-1 | Added `.github/workflows/deploy.yml` (T-DO-4) + mutation_suite smoke gate (T-QA-1) |
| T-QA-1 | Added `harness.testing.mutation_suite` v0.9.4 lift (17/17) |
| T-QA-2 | Added `tests/` integration suite (37 cases) |
| T-QA-3 | Added `harness.benchmark.runner` (p99<5000ms gate) |
| T-QA-4 | Added `.github/workflows/ci.yml` (3 jobs: integration-tests / mutation-suite / benchmark-baseline) |
| T-QA-5 | Added `harness.testing.stress_test` (50×200 WAL concurrency) |
| T-DD-1 | Added `README.md` M3-grade (10 Protocol + 5 特性) |
| v0.9 → v1.0 | spec/ + adr/0001-0007 全部保留；spikes/m0/_helpers.py 保留 |

### 验收

```bash
# 文件存在 + H1 正确
test -f CHANGELOG.md && head -1 CHANGELOG.md                          # "# Changelog"

# 五段结构正确 (GA plan §2 T-DD-2 验收命令)
grep -E 'v1\.0|## ' CHANGELOG.md
# 期望: "## [v1.0.0a0]" + "### Added" + "### Changed" + "### Deprecated"
#       + "### Security" + "### Fixed"

# 必须 link 到 README 已 link 的 ADR
grep -q "0008-v1.0-package-architecture" CHANGELOG.md || true           # PENDING (T-DD-4)
grep -q "0009-sqlite-wal-production-constraints" CHANGELOG.md || true  # PENDING (T-DD-5)
grep -q "0001-runtime-backend" CHANGELOG.md
grep -q "0007-worker-pool" CHANGELOG.md

# 升级路径
grep -q -i "v0\.9" CHANGELOG.md
grep -q "升级" CHANGELOG.md || grep -q -i "upgrade" CHANGELOG.md

# README link 现在 reachable
test -f CHANGELOG.md && grep -q "CHANGELOG.md" README.md && echo "OK README link resolves"

# 主机无回归 (4/4 PASS)
pytest tests/ -q                                                          # 37/37
python3 -m harness.testing.mutation_suite                                # 17/17
python3 -m harness.benchmark.runner --tasks=50 --workers=4               # exit 0
python3 -m harness.testing.stress_test --workers=5 --tasks=10            # exit 0
```

### 不动

- `README.md` (T-DD-1 已 done; CHANGELOG.md 写完 link 自动 resolve)
- `LICENSE` (T-DD-3 单做; CHANGELOG.md link 标 PENDING)
- `adr/0001-0007.md` (T-DD-6 单做 v1.0 footer; CHANGELOG.md cross-ref 现挂 accepted link 即可)
- `adr/0008-v1.0-package-architecture.md` + `adr/0009-sqlite-wal-production-constraints.md` — **未存在** (T-DD-4/5 单做; CHANGELOG.md 标 PENDING)
- `pyproject.toml` (已含 version 字段, 不需新加)
- `harness/` / `spec/` / `spikes/m0/_helpers.py` / `.github/workflows/*` — 不动
- `docs/CC-POLL.md` / `POLL-PROTOCOL.md` / `v1.0-ga-team-plan.md` — 不动

### 已知 P1（不挡）

- ADR 0008 + 0009 不存在 → CHANGELOG.md cross-ref 标 PENDING。等 T-DD-4/5 完成后回到 T-DD-2.1 补链
- ADR 0001-0007 现有但未加 v1.0 footer → T-DD-6 单做, 本枪 link 写 acceped status 即可
- 不写 v0.9 → v0.9.5 之间的 changelog (历史阶段 v0.9.x 在 git log + ADR 里能查到; 不强行 backfill)

---

## 完成后

1. NOW：T-DD-2 ✅；§4 → 下一枪（T-DD-3 LICENSE or fallback Cursor review backfill）
2. `docs/poll/cc-ready.json`（真实 commit）→ commit + push
3. 写本枪的 `docs/REVIEW-T-DD-2.md`（架构师自签 PASS — 等 Cursor 复活可追加签名）

## 禁止

不开 T-DO-5/真 Codex；不删 `_helpers.py`；不改 schema RAISE；不开 v1.1；不 force push；不动 README / LICENSE / pyproject / production code / CI / spec / existing ADR
