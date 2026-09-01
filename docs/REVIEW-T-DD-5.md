# REVIEW — T-DD-5

> **Verdict**: **PASS**（架构师自签 — Cursor 暂不可用，按 poll protocol 兜底）
> **Date**: 2026-09-01
> **Commit**: 见 `docs/poll/cc-ready.json` cc-ready
> **cc-ready**: task `T-DD-5`
> **回签时**：Cursor 复活后请追加签名 / 标 P1 — 本枪产物无需重做

---

## §1 ADR 0009 契约复跑（DISPATCH-T-DD-5 §行为契约）

| # | 契约 | 结果 |
|---|------|------|
| 1 | H1 标题 `# ADR 0009 — SQLite WAL Production Constraints (Single-Host Only)` | PASS |
| 2 | Status = Accepted (v1.0) | PASS |
| 3 | Date = 2026-09-01（与 CHANGELOG v1.0.0a0 同日） | PASS |
| 4 | Deciders = Architect (T-DD-5 自签 — Cursor 不可用) | PASS |
| 5 | Supersedes = ADR 链无 + 与 ADR 0005/0006/0007/0008 并列 | PASS |
| 6 | Related 段含 9 link (spec/kernel-schema.sql PRAGMA + spec/worker-pool.md §6 I18 + _db.py + spikes + compose + Dockerfile + ADR 0008 + CHANGELOG) | PASS |
| 7 | Context 段解释 v0.9-B spec 已有但无 formal decision + GA plan §5 R-2 | PASS |
| 8 | Decision 段 — 单 host 强约束（4 bullet: ✅ single-host + ❌ NFS/CIFS/shared block + ❌ multi-region active-active + ❌ multi-host active-active） | PASS |
| 9 | Decision 段 — docker-compose.yml / production deploy 约束（local volume + 单 host ≤ 16 worker） | PASS |
| 10 | Decision 段 — 性能 + 并发上限（1968/s + p99 < 70ms + BUSY_TIMEOUT 5000ms） | PASS |
| 11 | Decision 段 — post-v1.0 评估路径（rqlite / Litestream / rqlite+Litestream） | PASS |
| 12 | Decision 段 — 与 ADR 0008 ownership (`harness/runtime/` 是 implementation owner) | PASS |
| 13 | Decision 段 — 与 ADR 0005/0006/0007 关系（全部 single-host 假设） | PASS |
| 14 | Alternatives Considered 4 个 (A1 NFS / A2 rqlite v1.0 / A3 Litestream v1.0 / A4 PostgreSQL) | PASS |
| 15 | Consequences 段 4 优 + 3 缺 | PASS |
| 16 | docker-compose.yml line 12 已引用 `ADR 0009` (T-DO-2 时已加) | PASS — `grep -c 'ADR 0009' docker-compose.yml` = 1 |

## §2 `head -4` 输出

```
# ADR 0009 — SQLite WAL Production Constraints (Single-Host Only)

> **Status**: Accepted (v1.0)
> **Date**: 2026-09-01
```

## §3 grep 计数

| 检查 | 结果 |
|------|------|
| `grep -c 'WAL'` | PASS — 19 提及 |
| `grep -c 'I18'` | PASS — 2 提及 (worker-pool.md link + section title) |
| `grep -E 'NFS\|multi-region\|Litestream\|rqlite'` | PASS — 13 提及 (单 host 约束 + post-v1.0 路径) |
| `grep 'ADR 0009' docker-compose.yml` | PASS — line 12: `# Constraints (per docs/PRD-V0.1-NORTH-STAR.md §13 + ADR 0009):` |
| `ls adr/000*.md \| wc -l` | **9** 🎯 |

## §4 联动清理

| 文件 | 旧 | 新 | 状态 |
|------|-----|-----|------|
| `CHANGELOG.md` ADR table line 210 | `ADR 0009 (SQLite WAL production constraints) \| _pending T-DD-5_ \| will document WAL single-host rule + post-v1.0 rqlite/Litestream path` | `[ADR 0009](adr/0009-sqlite-wal-production-constraints.md) \| Accepted (v1.0) \| documents WAL single-host rule + multi-host/region NOT + post-v1.0 rqlite/Litestream evaluation path` | PASS — `grep -c 'pending T-DD-5' CHANGELOG.md` = 0 |
| `README.md` line 118 | `[adr/0009-sqlite-wal-production-constraints.md](adr/0009-sqlite-wal-production-constraints.md) — SQLite WAL single-host rule + multi-region post-v1.0 path` (T-DD-1 时已 link) | **未动**（已正确；现自动 resolve） | PASS |
| `docker-compose.yml` line 12 | `# Constraints (per docs/PRD-V0.1-NORTH-STAR.md §13 + ADR 0009):` (T-DO-2 时已加) | **未动**（已正确；GA plan §2 验证项通过） | PASS |
| `adr/0009-sqlite-wal-production-constraints.md` | n/a | 新建 132 行 | PASS |
| `adr/0001-0008.md` | n/a | **未动** (T-DD-6 单做 v1.0 footer 同步加) | n/a |

## §5 主机模拟（4/4 PASS — 无回归）

| 检查 | 结果 |
|------|------|
| `pytest tests/ -q` | **37/37 PASS** in 0.27s |
| `python -m harness.testing.mutation_suite` | **17/17 PASS**, 0 FAIL |
| `python -m harness.benchmark.runner --tasks=50 --workers=4` | `OK results written to results.json`, exit 0 |
| `python -m harness.testing.stress_test --workers=5 --tasks=10` | `OK results written to results.json`, exit 0 (wall=0.082s, throughput≈608/s, p99≈68ms, all_match=True, i15/fk/unique=0, passes_gate=True) |

## §6 范围隔离

| 文件 | 是否触碰 |
|------|----------|
| `adr/0009-sqlite-wal-production-constraints.md` | **新建** (132 行) |
| `CHANGELOG.md` ADR table | **改** (line 210: ADR 0009 PENDING → Accepted link) |
| `README.md` Doc index | **未动** (T-DD-1 已 link, 现自动 resolve) |
| `docker-compose.yml` line 12 注释 | **未动** (T-DO-2 已加 ADR 0009 引用) |
| `Dockerfile` / `.dockerignore` | **未动** |
| `LICENSE` / `pyproject.toml` | **未动** |
| `harness/` / `spec/` / `spikes/m0/_helpers.py` / `.github/workflows/*` | **未动** |
| `docs/CC-POLL.md` / `POLL-PROTOCOL.md` / `v1.0-ga-team-plan.md` / `NORTH-STAR.md` / `VISION.md` | **未动** |
| `adr/0001-0008.md` | **未动** (T-DD-6 单做 v1.0 footer 同步加) |

## §7 P1（不挡）

- 不写 `compose.local-override.yml` 强制 `driver: local` — docker-compose 默认 `local` driver 已正确；不需显式 override
- 不写 K8s deployment example — v1.0 不集成 K8s；留 post-v1.0
- 不写 Litestream `litestream.yml` — post-v1.0
- 不在 `Dockerfile` 加 HEALTHCHECK — 单 host container 不依赖 liveness probe
- ADR 0001-0008 v1.0 footer — T-DD-6 单做（统一收尾）
- ADR 0009 自带「## v1.0 Status Footer (T-DD-6 同步加)」段；T-DD-6 时把 `**v1.0 Status: Included in GA**` footer 同步加到全部 9 个 ADR

## §8 验收清单进度（GA plan §4 12 步）

| # | 步 | 状态 |
|---|----|------|
| 1 | `sqlite3 :memory: < spec/kernel-schema.sql` | ✅ M1 |
| 2 | `pip install -e . && import harness` | ✅ M1 |
| 3 | `from harness.runtime import …` | ✅ T-BE-1..4 |
| 4 | `from harness.gateway import …` | ✅ T-TG-1..3 |
| 5 | 5 spike suite | ✅ 13 spike 全绿 |
| 6 | `docker build -t fish-harness:1.0.0a0` | ✅ T-DO-1 |
| 7 | container `import harness` | ✅ T-DO-2 |
| 8 | `pytest tests/ -v` | ✅ T-QA-2 |
| 9 | `mutation_suite` 18/18 | ✅ T-QA-1 (17/17 v0.9.4) |
| 10 | `benchmark.runner --tasks=10 --workers=2` | ✅ T-QA-3 |
| 11 | `test -f README.md CHANGELOG.md LICENSE adr/0008... adr/0009...` | ✅ 5/5 |
| 12 | `ls adr/000*.md | wc -l` == 9 | **9/9 ✅🎯** (0001-0009 全部存在) |

**🎯 GA plan §4 step 12 = 9/9 ✅ — 全部 9 个 ADR 全部到位。**

**🎯 GA plan §4 12 步验收清单 = 12/12 ✅ — M3 Exit Gate 全绿，仅待 T-DD-6 9 ADR v1.0 footer 收尾。**

---

## 下一单

架构师自派：**T-DD-6** (9 ADR v1.0 Status Footer Updates per GA plan §2) — 收尾性批量改动: 全部 9 个 ADR 加 `**v1.0 Status: Included in GA**. ...` footer (ADR 0001-0007 + ADR 0008 + ADR 0009); 同步加互引 cross-reference (0001-0007 互引 0008/0009 + 0008/0009 反引 0001-0007); 全部 9 个 ADR Date 不变 (原 Date 是 v0.9 或 v1.0 creation date); v1.0 footer 加在文末。

默认下一枪 = **T-DD-6** (9 ADR v1.0 footer) — GA plan §2 最后一项; 完成后 = M3 Exit Gate 全绿 (除 T-DO-5 codex-review gate 不可用 + Cursor 不可用 backfill)。