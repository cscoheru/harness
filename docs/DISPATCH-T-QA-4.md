# 审验签发 — T-QA-4（3 个新 CI job）

> **给 CC**：Cursor 暂不可用，本 dispatch 由架构师自签（per GA plan §2 T-QA-4 模板）。  
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。  
> 做完即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

> **回签时**：等 Cursor 复活后补一份 `REVIEW-T-QA-4.md`（PASS/P1 列）即可，本枪产物无需重做。

---

## 任务

**T-QA-4** — 新增 3 个 CI job（GA plan §2）

### 产出

| 文件 | 内容 |
|------|------|
| `.github/workflows/ci.yml`（新建） | 3 job：integration-tests / mutation-suite / benchmark-baseline |
| 文档 | 本文件 + `docs/REVIEW-T-QA-4.md`（等 Cursor 复活补） |

### 行为契约

1. **`integration-tests`** job：
   - trigger：push（任何分支） + pull_request + workflow_dispatch
   - steps：checkout@v4 → setup-python@v5 (`python-version: ['3.12', '3.13']` matrix) → `pip install -e .[dev]` → `pytest tests/ -v` → 必须 exit 0
2. **`mutation-suite`** job：
   - trigger：同 integration-tests
   - steps：同上 → `python -m harness.testing.mutation_suite` → 必须 17/17 PASS + exit 0
3. **`benchmark-baseline`** job：
   - trigger：**仅** `workflow_dispatch`（GA plan §5 R-5：benchmark 不进 push 路径以免 CI 资源耗尽）
   - steps：同上 → `python -m harness.benchmark.runner --tasks=50 --workers=4 --out results.json` → 校验 `results.json.passes_gate == true`（硬门 p99 < 5000ms）；失败则 exit 1
   - 上传 `results.json` 为 artifact（`actions/upload-artifact@v4`，name=`benchmark-baseline`，path=`results.json`）
4. **并发/缓存**：3 job 独立，无依赖。`pip` 缓存走 `actions/setup-python@v5` 的 `cache: 'pip'`（自动 key on pyproject.toml hash）
5. **权限**：每个 job `permissions: contents: read`（最小权限；不需 packages: write）

### 验收

```bash
# YAML 合法
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"

# 主机模拟（不真跑 GitHub Actions）
pytest tests/ -v                                          # 37/37 PASS
python3 -m harness.testing.mutation_suite                 # 17/17 PASS
python3 -m harness.benchmark.runner --tasks=50 --workers=4 --out /tmp/results.json
# results.json: passes_gate == true; exit 0

# deploy.yml 不破坏（T-QA-1 已 fixed）
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"
```

### 与已有 workflow 的关系

- `m0-contract-tests.yml`（已存）：12 原 spike job — 不动
- `deploy.yml`（T-QA-1 已修）：build + push — 不动
- **新** `ci.yml`：本枪 — T-QA-4

---

## 完成后

1. NOW：T-QA-4 ✅；§4 → **T-QA-5**（50×200 SQLite 并发压力测试 per GA plan §2）
2. `docs/poll/cc-ready.json`（真实 commit）→ commit + push
3. 写本枪的 `docs/REVIEW-T-QA-4.md`（架构师自签 PASS — 等 Cursor 复活可追加签名）

## 禁止

不开 T-DO-5/真 Codex；不删 `_helpers.py`；不改 schema RAISE；不开 v1.1；不 force push；不动 deploy.yml / m0-contract-tests.yml