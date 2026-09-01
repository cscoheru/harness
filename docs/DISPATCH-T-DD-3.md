# 审验签发 — T-DD-3（LICENSE）

> **给 CC**：Cursor 暂不可用，本 dispatch 由架构师自签（per GA plan §2 T-DD-3 模板）。
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。
> 做完即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

> **回签时**：等 Cursor 复活后补一份 `REVIEW-T-DD-3.md`（PASS/P1 列）即可，本枪产物无需重做。

---

## 任务

**T-DD-3** — LICENSE 创建（GA plan §2 + §4 验收清单第 11 步）

### 背景

README.md (T-DD-1) 已 link 到 `LICENSE`（标 PENDING）；CHANGELOG.md (T-DD-2) `[Documentation]` 段写 `_pending T-DD-3_`。
GA plan §4 step 11 = `test -f README.md CHANGELOG.md LICENSE adr/0008... adr/0009...` → 5 文件全存在。前两文件已 done；本枪 = 补 LICENSE 让 step 11 变 5/5。

### 产出

| 文件 | 内容 |
|------|------|
| `LICENSE`（新建） | 标准 MIT License 文本（21 行 + final newline）；Copyright (c) 2026 cscoheru |
| `README.md` | Doc index 删 2 行 PENDING（CHANGELOG.md + LICENSE 现已 done；CHANGELOG 段改 v1.0.0a0 release notes；LICENSE 段加 MIT + pyproject cross-ref） |
| `CHANGELOG.md` | `[Documentation]` 段 LICENSE `_pending T-DD-3_` → 现存 link（同步 README） |
| `docs/DISPATCH-T-DD-3.md` | 本文件 |
| `docs/REVIEW-T-DD-3.md` | 架构师自签（Cursor 复活可追加） |
| `docs/NOW.md` | §2 加 T-DD-3 行；§4 → 下一枪 |

### 行为契约

LICENSE 必须满足：

1. **H1 或首行标识 = `MIT License`**（GA plan §4 step 11 验收：`head -3 LICENSE` 显示 MIT）
2. **年份**：`Copyright (c) 2026 cscoheru`（2026 = CHANGELOG `v1.0.0a0` 段 release 日期 `2026-09-01` 同年）
3. **版权人**：`cscoheru` — 与 `pyproject.toml` `authors = [{name = "cscoheru"}]` + README §License footer + CHANGELOG ADR table author 一致
4. **MIT 完整文本** = 标准 OSI-approved 21 行（per SPDX `MIT`）— `Permission is hereby granted, free of charge, to any person obtaining a copy ...`
5. **可选署名行**：保留 MIT 原始结尾 `THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND ...`

### README.md 联动修改

README.md Doc index 段（line 119-120）需从：

```
- `CHANGELOG.md` — _pending T-DD-2_.
- `LICENSE` — _pending T-DD-3 (MIT)_.
```

改为：

```
- [`CHANGELOG.md`](CHANGELOG.md) — v1.0.0a0 release notes; Keep-a-Changelog style. (T-DD-2)
- [`LICENSE`](LICENSE) — MIT; matches `pyproject.toml` `license = {text = "MIT"}` + `authors = [{name = "cscoheru"}]`. (T-DD-3)
```

README.md §License footer（line 122-124）已经存在 + 内容正确 (`MIT — see [`LICENSE`](LICENSE). Copyright (c) 2026 cscoheru.`) — **不动**。

### CHANGELOG.md 联动修改

CHANGELOG.md `[Documentation]` 段（LTS line 95-99）需从：

```
- [`README.md`](README.md) — ... (T-DD-1)
- `CHANGELOG.md` — this file. (T-DD-2)
- `LICENSE` — _pending T-DD-3_.
```

改为：

```
- [`README.md`](README.md) — ... (T-DD-1)
- [`CHANGELOG.md`](CHANGELOG.md) — v1.0.0a0 release notes; Keep-a-Changelog style. (T-DD-2)
- [`LICENSE`](LICENSE) — MIT; matches `pyproject.toml` `license = {text = "MIT"}` + `authors = [{name = "cscoheru"}]`. (T-DD-3)
```

### 验收

```bash
# LICENSE 存在 + MIT 头正确
test -f LICENSE && head -3 LICENSE
# 期望:
#   MIT License
#
#   Copyright (c) 2026 cscoheru

# MIT 标准 21 行
grep -c "Permission is hereby granted" LICENSE           # 1
grep -c "THE SOFTWARE IS PROVIDED" LICENSE              # 1
grep -c "cscoheru" LICENSE                              # 1
grep -c "2026" LICENSE                                  # 1

# README / CHANGELOG PENDING 已删
grep -c "pending T-DD-3" README.md                      # 0
grep -c "pending T-DD-3" CHANGELOG.md                   # 0

# README Doc index 现含 CHANGELOG + LICENSE 都为 link
grep -E "\[CHANGELOG\.md\]|\[LICENSE\]" README.md

# pyproject + README + CHANGELOG + LICENSE 4 处 "cscoheru" 一致
grep -c "cscoheru" pyproject.toml                       # 1
grep -c "cscoheru" README.md                            # >=1 (License footer)
grep -c "cscoheru" CHANGELOG.md                         # 0 (CHANGELOG 无个人署名, 仅 adr ADR cross-ref 是 v0.9 ADR 是中性描述; OK)
grep -c "cscoheru" LICENSE                              # 1

# 主机无回归 (4/4 PASS)
pytest tests/ -q                                                          # 37/37
python3 -m harness.testing.mutation_suite                                # 17/17
python3 -m harness.benchmark.runner --tasks=50 --workers=4               # exit 0
python3 -m harness.testing.stress_test --workers=5 --tasks=10            # exit 0
```

### 不动

- `harness/` / `spec/` / `spikes/m0/_helpers.py` / `.github/workflows/*` / `pyproject.toml` (license metadata 已存在)
- `docs/CC-POLL.md` / `POLL-PROTOCOL.md` / `v1.0-ga-team-plan.md` / `NORTH-STAR.md` / `VISION.md`
- `adr/0001-0007.md` / `adr/0008-v1.0-package-architecture.md` / `adr/0009-sqlite-wal-production-constraints.md`
- 任何 production code / schema / benchmark / mutation test
- `Dockerfile` (无需再硬编 LICENSE path; SPDX `MIT` 由 pip + GitHub auto-detect)

### 已知 P1（不挡）

- 不在 root 加 `COPY LICENSE` Dockerfile step — 容器 `import harness` 不依赖 LICENSE; SPDX auto-detect 由 GitHub UI 读 root `LICENSE` 文件
- 不在 `pyproject.toml` 加 SPDX `License-Expression: MIT` (`license = {text = "MIT"}` 已是合法 PEP 639 等价表达; 不重复)
- 不写 `NOTICE` 文件 — MIT 标准不带 NOTICE; v1.0 单 copyright holder
- 不写 `AUTHORS` / `CONTRIBUTORS` 文件 — 单人项目; cscoheru 在 README + pyproject + LICENSE 三处冗余足够
- `LICENSE` 第 2 行 = 空行（per MIT standard format）— head -3 输出 = `MIT License / (空) / Copyright (c) 2026 cscoheru`

---

## 完成后

1. NOW：T-DD-3 ✅；§4 → 下一枪（T-DD-4 ADR 0008 package architecture, 或 fallback Cursor review backfill）
2. `docs/poll/cc-ready.json`（真实 commit）→ commit + push
3. 写本枪的 `docs/REVIEW-T-DD-3.md`（架构师自签 PASS — 等 Cursor 复活可追加签名）

## 禁止

不开 T-DO-5/真 Codex；不删 `_helpers.py`；不改 schema RAISE；不开 v1.1；不 force push；不动 production code / CI / spec / existing ADR；不写 NOTICE / AUTHORS；不改 Dockerfile；不改 README.md License footer 段（已正确）；不写 SPDX `License-Expression` 双标