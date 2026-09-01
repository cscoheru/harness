# 审验签发 — T-QA-2（集成测试）

> **给 CC**：只读本文件。上一枪 [`docs/REVIEW-T-QA-1.md`](REVIEW-T-QA-1.md) = **PASS**。  
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。  
> 做完一枪即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

---

## 任务

**T-QA-2** — 集成测试套件（GA plan §2）

### 产出

| 文件 | 内容 |
|------|------|
| `tests/conftest.py` | fixture：`make_db()` / 临时 DB；可选 tempfile uploads root |
| `tests/test_worker_pool.py` | `SqliteWorkerPool` 关键路径（register/dispatch/heartbeat/drain/claim） |
| `tests/test_context_manager.py` | distill/charge/handoff/budget / `BudgetExceeded` |
| `tests/test_egress.py` | `PinnedResolver` + `HttpEgressService`（MockTransport / 无真网） |
| `tests/test_gateway.py` | `ToolInvocationGatewayImpl` 6 步链（deny / needs_approval / bad lease / allow） |
| `pyproject.toml` | 若缺：`[project.optional-dependencies] dev` 含 `pytest>=8`；可加 `[tool.pytest.ini_options]` |

### 契约

1. fixture 用 **`harness.runtime._db.make_db()`**（或 `connect_with_fk` + schema），**禁止**复制一套 schema 解析  
2. 测试只依赖已生产化的 `harness.*`；不 import `spikes.m0._helpers`（除非极窄且注释说明）  
3. egress：**不**打公网；用 `httpx.MockTransport` 或 `InProcessEgressServer`（注意 127 被 BLOCKED_NETWORKS — 优先 MockTransport）  
4. gateway：注入 fake PDP/Provider + `RealArtifactStore`（temp root）或轻量 fake store  
5. `pytest tests/ -v` **全绿**；建议覆盖 ≥ 各模块主路径 + 1 个失败路径

### 验收

```bash
pip install -e ".[dev]"   # 或 pip install pytest
pytest tests/ -v
# 期望：全部 passed

# 无回归
python3 -m harness.testing.mutation_suite   # 仍 17/17
```

---

## 完成后

1. NOW：T-QA-2 ✅；§4 → **T-QA-3**（benchmark）或 **T-DO-5**（按你写的下一枪；默认 **T-QA-3**）  
2. `docs/poll/cc-ready.json`（真实 commit）→ commit + push  
3. 更新 HANDOFF；停等 `docs/REVIEW-T-QA-2.md`

## 禁止

不开 T-QA-3/4 全文；不删 `_helpers.py`；不改 schema RAISE；不开 v1.1/TS/dsh；不 force push
