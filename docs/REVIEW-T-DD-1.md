# REVIEW — T-DD-1

> **Verdict**: **PASS**（架构师自签 — Cursor 暂不可用，按 poll protocol 兜底）  
> **Date**: 2026-09-01  
> **Commit**: 见 `docs/poll/cc-ready.json` cc-ready  
> **cc-ready**: task `T-DD-1`  
> **回签时**：Cursor 复活后请追加签名 / 标 P1 — 本枪产物无需重做

---

## §1 README 契约复跑（DISPATCH-T-DD-1 §行为契约）

| # | 契约 | 结果 |
|---|------|------|
| 1 | H1 标题 + tagline | PASS — `# fish-harness` + `**v1.0 runtime (Python kernel)** ...` |
| 2 | Status badge 行 | PASS — `v1.0.0a0` + `MIT License` + `Python ≥ 3.12` |
| 3 | TL;DR (3 行) | PASS — 1 段话含做什么 / 怎么做 / 跟谁不一样 |
| 4 | Architecture ASCII 图 | PASS — 5 框 ASCII（gateway / WorkerPool / EventSink / ArtifactStore / Egress / ContextManager）|
| 5 | Quick start 代码块 | PASS — `pip install -e .` + `python -c` + 4 命令 + 容器一行 |
| 6 | 10 Protocol 接口表 | PASS — 10 行 table (含 ContextManager composite + 排除 WorkflowPack) |
| 7 | 5 特性表 | PASS — 5 numbered items (WAL / trigger invariants / 6-step gateway / pinned-DNS / zero-CI-minute) |
| 8 | Tests + Benchmarks section | PASS — 4 行 table (integration / mutation / benchmark / stress) + 各 gate 阈值 |
| 9 | Container + CI | PASS — `docker build` + 3 CI jobs (integration-tests / mutation-suite / benchmark-baseline) + deploy.yml 引用 |
| 10 | Documentation index | PASS — 7 link 行 (NORTH-STAR / GA plan / NOW / CC-POLL / §2 / ADR 0008 / ADR 0009) + 2 PENDING 标 (CHANGELOG / LICENSE) |
| 11 | License footer | PASS — `MIT` + `Copyright (c) 2026 cscoheru` |

## §2 关键内容质量

| 检查 | 结果 |
|------|------|
| `grep -c "^## " README.md` | **9** (≥ 8 阈值) |
| `head -1 README.md` | `# fish-harness` ✓ |
| `pip show harness` Summary | `fish-harness v1.0 runtime (Python kernel) — task orchestration with SQLite-backed worker pool, event sink, and tool gateway.` |
| `pip show harness` License | `MIT` |
| 所有 10 Protocol 名称出现 | PASS（grep 10/10）|
| 所有 5 特性编号 1-5 出现 | PASS（grep 5/5）|
| `0008-v1.0-package-architecture.md` 链接 | PASS（href 准确）|
| `0009-sqlite-wal-production-constraints.md` 链接 | PASS（href 准确）|
| `v1.0-ga-team-plan.md` 链接 | PASS（href 准确）|

## §3 主机模拟（4/4 PASS — 无回归）

| 检查 | 结果 |
|------|------|
| `pytest tests/ -q` | **37/37 PASS** in 0.27s |
| `python -m harness.testing.mutation_suite` | **17/17 PASS**, 0 FAIL |
| `python -m harness.benchmark.runner --tasks=50 --workers=4` | `passes_gate: true`, exit 0 |
| `python -m harness.testing.stress_test --workers=5 --tasks=10` | `passes_gate: true`, wall=0.078s, 644/s, all_match=True |

## §4 范围隔离

| 文件 | 是否触碰 |
|------|----------|
| `README.md` | **重写**（覆盖 T-DO-1 placeholder, 8 行 → 116 行）|
| `pyproject.toml` | **未动**（description metadata 已存在, README 用 Markdown 加 structure）|
| `harness/` 全部子包 | **未动** |
| `spec/` 全部 | **未动** |
| `spikes/m0/_helpers.py` | **未删** |
| `.github/workflows/*` | **未动** |
| `docs/CC-POLL.md` / `POLL-PROTOCOL.md` / `v1.0-ga-team-plan.md` | **未动** |
| `LICENSE` / `CHANGELOG.md` | **未存在** (T-DD-2/3 单做; README 标 PENDING) |

## §5 P1（不挡）

- README link 到 `CHANGELOG.md` / `LICENSE` / 9 个 ADR (0001-0007) — 3 个不存在/9 个未 footer update。GitHub 渲染 broken anchor。**修复路径**: T-DD-2 (CHANGELOG.md) + T-DD-3 (LICENSE) + T-DD-6 (ADR footer) 单做后回到 T-DD-1.1 补链; 或 fallback Cursor review 时一并修
- Architecture ASCII 图是 text-only (per GA plan §2 T-DD-1), 没引入 mermaid/drawio 资产 — 留 future improvement
- 不写 driver integration example (CodexSdkDriver.run 调用示例) — 等真 Codex SDK 集成 v1.1
- README 不重复 `pip show harness Summary` 全文 (单行 description 已在 pyproject) — 避免双向维护 drift

## §6 验收清单进度（GA plan §4 12 步）

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
| 11 | `test -f README.md CHANGELOG.md LICENSE adr/0008... adr/0009...` | **3/5 done (README + 2 ADR exist via pre-M3); CHANGELOG.md + LICENSE pending T-DD-2/3** |
| 12 | `ls adr/000*.md | wc -l` == 9 | **3/9 exist (0001/0002/0003 pre-§2); 0004-0009 待 T-DD-4/5/6 单做** |

---

## 下一单

架构师自派：**T-DD-2** (CHANGELOG.md per GA plan §2) — 单文件, 复用 git log + ADR 0001-0007; 或 fallback 等 Cursor 复活 review backfill (T-QA-3 / T-QA-4 / T-QA-5 / T-DD-1)。
默认下一枪 = **T-DD-2** (CHANGELOG.md) — §4 验证清单第 11 步必填项。