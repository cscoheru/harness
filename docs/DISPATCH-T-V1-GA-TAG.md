# 签发 — T-V1-GA-TAG（v1.0.0 GA 发布）

> **给 CC**：只读本文件。上一枪 = 修复复审 **PASS**（`notes/codex-review-v1.0.0a1-recheck-report.md`：§2 9/9 ✅ + §3 4/4 ✅ + §4 硬规则 5/5 + §5 范围 10/10 净）。初次审验 6 FAIL 已全部由 commit `47ba181` 修复，不复做。  
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。  
> 做完即停 → `cc-ready` + commit/push → `docs/CC-POLL.md`。

---

## 任务

**T-V1-GA-TAG** — v1.0.0 GA tag 发布流程（GA plan §6 M3 Exit Gate 最后一条 + §8.6；前置：a0 tag `dc9d61b`、a1 tag `41ca3c5`、修复 `47ba181` 复审 PASS）

### 产出

| 文件 | 变更 |
|------|------|
| `pyproject.toml` | `version = "1.0.0a0"` → `"1.0.0"`（ADR 0008 版本对齐规则） |
| `harness/__init__.py` | `__version__ = "1.0.0"` |
| `CHANGELOG.md` | 新增 `## [1.0.0] — <date>` GA 段（含 a1 复审修复摘述 + 版本对齐声明） |
| `docker-compose.yml` | 2 处 `image:` `fish-harness:1.0.0a1` → `fish-harness:1.0.0` |
| `README.md` | 版本字样/徽章同步为 1.0.0（如有 a0/a1 残留引用） |
| `docs/NOW.md` + `notes/v1.0-tasks.md` | T-V1-GA-TAG 行 + §4 指针更新 |
| tag + Release | `git tag -a v1.0.0`（release notes 取 CHANGELOG `[1.0.0]` 段，§8.6；参照 T-GH-RELEASE 先例） |

### 行为契约

1. **版本对齐四元组**：`pyproject.toml` == `harness.__version__` == CHANGELOG 段 == tag 名 == GHCR 镜像 tag == compose `image:`，全为 `1.0.0` / `v1.0.0`。
2. **用户裁断点（不可跳过）**：release commit 落地 + §4 清单全绿后，**停等用户 GO** 再打 tag——tag 不可逆，`v1.0.0a0`/`v1.0.0a1` 不得移动。裁断点同时问 GHCR 可见性（a1 镜像现为 private；GA 建议 public）。
3. GA plan **§4 十二步**在 release commit 上全 exit 0（step 2 期望值随版本改为 `1.0.0`；含 FAIL-1 回归命令 `from harness.benchmark import runner`）。
4. tag push 后：15 CI job on tag 全绿 + `deploy.yml` GHCR 发布 `ghcr.io/cscoheru/fish-harness:v1.0.0`（deploy run 号记录进 NOW.md）。
5. GitHub Release `v1.0.0` page 发布，notes = CHANGELOG `[1.0.0]` 段全文。
6. 无回归四件套照常（pytest 37 / mutation 17 / benchmark passes_gate / conformance 10 Protocols）。

### 验收

```bash
# 1. 版本对齐
python3 -c "import harness; assert harness.__version__=='1.0.0'; print(harness.__version__)"
grep '^version' pyproject.toml          # 1.0.0
grep -c '^## \[1\.0\.0\]' CHANGELOG.md  # ≥1（注意 H2 前缀）
grep 'image:' docker-compose.yml        # 2× fish-harness:1.0.0

# 2. FAIL-1 回归 + §4 12 步（架构师清单，step 2 期望 1.0.0）
python3 -c "from harness.benchmark import runner; print(runner.__name__)"
python3 -m pytest tests/ -q             # 37 passed
python3 -m harness.testing.mutation_suite   # 17/17
python3 -m harness.benchmark.runner --tasks=5 --workers=2   # passes_gate=true
python3 spikes/m0/conformance-second-impl.py | grep "10 Protocols"

# 3. tag 后
git ls-remote origin v1.0.0             # 远程可见
gh release view v1.0.0                  # page + notes
# deploy run 号 + GHCR digest 记录进 NOW.md §2 T-V1-GA-TAG row
```

---

## 完成后

1. NOW：T-V1-GA-TAG ✅；§4 → 「下一验收为空，v1.0 周期关闭；新工作开 v1.1+ 周期（ADR ≥ 0010）」
2. `docs/poll/cc-ready.json` task_id=`T-V1-GA-TAG`（真实 commit）→ commit + push
3. 更新 HANDOFF；停等用户最终 GA 裁断

## 禁止

- tag 未获用户 GO 前不得打；不 force push；不动 `v1.0.0a0`/`v1.0.0a1` tag
- 不删 `_helpers.py`；不改 schema RAISE；不动 `spec/`、`spikes/`、ADR 0001-0009 正文
- 不开 v1.1 scope（drivers SDK 集成、Litestream 等留给 v1.1+，ADR ≥ 0010 起）
