# 审验签发 — T-DD-6（9 ADR v1.0 Status Footer Sync）

> **给 CC**：Cursor 暂不可用，本 dispatch 由架构师自签（per GA plan §2 T-DD-6 模板）。
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。
> 做完即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

> **回签时**：等 Cursor 复活后补一份 `REVIEW-T-DD-6.md`（PASS/P1 列）即可，本枪产物无需重做。

---

## 任务

**T-DD-6** — 9 ADR v1.0 Status Footer Sync（GA plan §2 收尾性批量改动）

### 背景

v1.0.0a0 release 已完成全部交付物（T-BE-1..5 / T-TG-1..5 / T-DO-1..4 / T-QA-1..5 / T-DD-1..5）。但 9 个 ADR 现状：

- **ADR 0001-0007**：v0.9-B 阶段创建，Date 是原始创作日期（2026-08-29 / 2026-08-30）
- **ADR 0008-0009**：T-DD-4/5 创建，Date 2026-09-01

全部 9 个 ADR 都**没有 v1.0 Status footer** → reader 不知道这些 ADR 已被 v1.0.0a0 release 锁定 / 已纳入 GA 交付物 / 后续修改流程。

后果：
- 后续 v1.x 修改时不知道哪些 ADR 是 frozen 状态（哪些不能改 / 必须新开 ADR）
- 跨 ADR 引用 0008/0009 时 0001-0007 没有 cross-ref 链接
- v1.0.0a0 release 锁定文档证据缺失

GA plan §2 T-DD-6: "所有 9 个 ADR 加 'v1.0 Status: Included in GA' footer；日期更新到 v1.0 发布日；交叉引用 0008/0009"。

### 产出

| 文件 | 内容 |
|------|------|
| 全部 9 个 ADR `adr/0001-0009.md` | 文末 append 统一 v1.0 Status footer（10 行块；含 cross-ref 到 0008/0009） |
| `docs/DISPATCH-T-DD-6.md` | 本文件 |
| `docs/REVIEW-T-DD-6.md` | 架构师自签 |
| `docs/NOW.md` | §2 加 T-DD-6 行；§4 → 下一验收 (M3 Exit Gate 总结 + 用户裁断点) |

### 行为契约

每个 ADR 文末必须 append 以下 footer 块：

```markdown

---

## v1.0 Status

**v1.0 Status: Included in GA** — 2026-09-01.

本 ADR 在 fish-harness **v1.0.0a0** release 已纳入最终交付物；后续 v1.x 改动走标准 ADR 流程：

- 新增 ADR 编号 ≥ 0010
- 不修改本 ADR 内容（保留 v1.0.0a0 历史快照）
- 引用本文时用 `<adr-XXXX>` tag

详见：
- [`CHANGELOG.md`](../CHANGELOG.md) `## [v1.0.0a0]` 段
- [ADR 0008](./0008-v1.0-package-architecture.md) — `harness/` 5-subpackage layout
- [ADR 0009](./0009-sqlite-wal-production-constraints.md) — SQLite WAL single-host rule
```

### 关键设计决策

1. **原始 Date 不动**：ADR 0001-0007 的 `Date: 2026-08-29` / `2026-08-30` 是创作日期；v1.0 footer 用 `2026-09-01` 作为 v1.0 release 日期。两者并存（**创作日期 ≠ 状态日期**），避免 falsify history
2. **统一 footer 跨 9 ADR**：便于 reviewer 扫读；cross-ref 自然落在 footer 里（0001-0007 通过 footer 引 0008/0009）
3. **0008/0009 同样 append**：self-reference 不重复 cross-ref，但 footer 内引用保留以保持 9 ADR 一致
4. **冻结规则显式**：footer 明文写「不修改本 ADR 内容」+ 「新开 ADR 编号 ≥ 0010」，让 v1.x contributor 一眼看到边界

### 验收

```bash
# 9 个 ADR 全部含 v1.0 Status footer
for f in adr/000*.md; do
  grep -q "v1.0 Status: Included in GA" "$f" && echo "OK $f" || echo "MISS $f"
done
# 期望: 9 OK

# footer 块含 3 个 cross-ref link (CHANGELOG + ADR 0008 + ADR 0009)
grep -c 'CHANGELOG.md.*v1.0.0a0' adr/000*.md   # 9 (footer 包含)
grep -c '0008-v1.0-package-architecture.md' adr/000*.md   # 9
grep -c '0009-sqlite-wal-production-constraints.md' adr/000*.md   # 9

# ADR 总数 = 9 (不变)
ls adr/000*.md | wc -l   # 9

# 主机无回归 (4/4 PASS)
pytest tests/ -q                                                          # 37/37
python3 -m harness.testing.mutation_suite                                # 17/17
python3 -m harness.benchmark.runner --tasks=50 --workers=4               # exit 0
python3 -m harness.testing.stress_test --workers=5 --tasks=10            # exit 0
```

### 不动

- ADR 0001-0009 的原 content (Status / Date / Context / Decision / Alternatives / Consequences)
- `harness/` / `spec/` / `spikes/m0/_helpers.py` / `.github/workflows/*`
- `Dockerfile` / `docker-compose.yml` / `.dockerignore`
- `pyproject.toml` / `LICENSE` / `README.md` / `CHANGELOG.md` / `docs/CC-POLL.md` / `POLL-PROTOCOL.md` / `v1.0-ga-team-plan.md` / `NORTH-STAR.md` / `VISION.md`
- 任何 production code / schema / benchmark / mutation test

### 已知 P1（不挡）

- 不把 ADR 编号 ≥ 0010 占位 (v1.1+ ADR 实际编号由 post-v1.0 流程决定)
- 不在 ADR 0001-0007 Related 段加 ADR 0008/0009 link (footer 已包含 cross-ref; Related 段保持原文不变)
- 不改 Status field (Accepted 保持原值; v1.0 Status footer 是另一段, 不动 Status)
- 不加 `**Last reviewed**: 2026-09-01` line (历史 Date 已记录, 不再加)

---

## 完成后

1. NOW：T-DD-6 ✅；§4 → M3 Exit Gate 总结 + 用户裁断点（v1.0.0 GA tag / T-DO-5 codex-review gate / Cursor review backfill / M3 sign-off）
2. `docs/poll/cc-ready.json`（真实 commit）→ commit + push
3. 写本枪的 `docs/REVIEW-T-DD-6.md`（架构师自签 PASS — 等 Cursor 复活可追加签名）

## 禁止

不开 T-DO-5/真 Codex；不删 `_helpers.py`；不改 schema RAISE；不开 v1.1；不 force push；不动 production code / CI / spec / existing ADR content / poll doc / pyproject / Dockerfile / compose