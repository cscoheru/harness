# Codex v1.0.0a1 修复复审报告

> **Date**: 2026-09-01T09:35Z
> **Reviewer**: Codex (gpt-5.6-sol, reasoning=xhigh)
> **Pre-fix HEAD**: `878a783`
> **Post-fix HEAD**: `47ba181`（已 push，`origin/main` = `47ba1818a011…`，实测确认）
> **Scope**: 仅 FAIL-1/2/3/4/5/6 修复证据 + 回归 sanity + 硬规则 + 范围隔离
> **原始日志**: `/tmp/harness-recheck-out.txt`（Step 0-9）+ `/tmp/harness-recheck2-out.txt`（F1-F9 裁决补证）

---

## §1 结论

**PASS**。修复 commit `47ba181` 对初次审验全部 6 个 FAIL（1 major + 5 minor）的修复均成立：FAIL-1 的 PEP 562 自递归已用 `importlib.import_module("harness.benchmark.runner")` 根治（`from harness.benchmark import runner` → exit 0）；10 Protocol 出口、CHANGELOG a1 段、prep 表重写、ADR 0008/compose/README 六处文档修复全部到位。回归 sanity 4/4（pytest 37/37、mutation 17/17、benchmark passes_gate=true、conformance 10 Protocols）无新失败；硬规则 5/5；修改范围 10 文件精确落在预期白名单内、零溢出。两处复审指令自身的验证命令缺陷（Step-3 的 `__runtime__` 属性探针、Step-4 的 `grep -c | test -n` 判式）经对照实验裁决为「命令缺陷而非修复缺陷」，不影响判定。建议架构师 proceed **v1.0.0 GA tag** 流程（最终裁断由用户下）。

## §2 FAIL 修复矩阵

| FAIL | 修复位置 | 验证命令实际跑出 | 状态 |
|------|---------|----------------|------|
| FAIL-1 (major) | `harness/benchmark/__init__.py`（`importlib.import_module` 替代 `from . import`） | `FAIL-1 FIX: harness.benchmark.runner`，exit 0，无 RecursionError | ✅ |
| FAIL-3 (10 Protocols) | `harness/__init__.py:__all__` | expected == actual，10/10 名单逐一相同（含 ToolProvider / PolicyDecisionPoint / ExecutionDriver） | ✅ |
| FAIL-3 (3 新 Protocol runtime_checkable) | `harness/__init__.py` 新增 3 个 `@runtime_checkable class` | 字面命令 `hasattr(X,'__runtime__')` ×3 = False（exit 1）→ **裁决：命令缺陷**。对照实验：a0 未改动的 `WorkerPool` 同样 False（F1）；本机 Python 3.14.3 合成 `@runtime_checkable` Protocol 亦 False，真实标记为 `_is_runtime_protocol`（F2）；spec 侧同名类同样 False（F4）。**功能等价判定**（与 `conformance-second-impl.py` 同一方法，F5）：全部 10 个 Protocol `isinstance()` 无 TypeError → 真实 runtime_checkable（F3） | ✅（按实质意图） |
| FAIL-2/4 (CHANGELOG a1) | `CHANGELOG.md` `## [v1.0.0a1] — 2026-09-01` 段 | 段存在且内容完整：「Deploy-only patch over v1.0.0a0 / **Zero code/library changes**; library version **stays 1.0.0a0**…deliberately…deferred until the next functional release」+ Fixed（deploy.yml `actions/checkout@v4`，run `33481141073`）+ Notes（21-file diff = patch commit + post-M3 polish 链，**no code drift**）。注：prompt 的 `grep -c '^\[v1.0.0a1\]'` 计 0 是因为标题带 `## ` 前缀，且 `test -n "$(grep -c …)"` 判式对任意输出恒真——属 prompt 命令缺陷，实质已验 | ✅ |
| FAIL-5 (prep 表) | `notes/codex-review-prompt-v1.0.0a1.md` 架构师 prep 段（FIX 2026-09-01 披露块） | `ls docs/REVIEW-T-*.md \| wc -l` = **13** ✅；虚构名 grep = 2 处，均非 prep 表行：L158 = 报告输出格式模板的通配骨架行（`REVIEW-T-BE-*`）、L195 = FIX 披露 blockquote 本身（说明这 10 个名字从未存在）；实际 13 份的提及数 = 14 ≥ 13 ✅ | ✅ |
| FAIL-6 (ADR 0008 benchmark 措辞) | `adr/0008-v1.0-package-architecture.md` | 依赖行改为 `harness/benchmark/ → harness/runtime/ (具体实现 + WorkerPool/EventSink…)`，含「具体实现」 | ✅ |
| FAIL-6 (ADR 0008 import) | 同上 | 代码块 = `from harness import (… ToolProvider, PolicyDecisionPoint, ExecutionDriver,)`；`spec_interfaces` 全文 **0 命中**；并补注 PolicyDecisionPoint（Protocol）vs PolicyDecision（frozen dataclass）区分 | ✅ |
| FAIL-6 (compose 镜像) | `docker-compose.yml` | 2 个 service 均 `image: fish-harness:1.0.0a1` | ✅ |
| FAIL-6 (README PolicyDecisionPoint) | `README.md` | `grep -c PolicyDecisionPoint` = 1（≥1） | ✅ |

**§2 计：9/9 ✅**

## §3 回归 sanity

| 项 | 命令 | 实际跑出 | 状态 |
|----|------|---------|------|
| pytest | `python3 -m pytest tests/ -q --tb=short` | **37 passed in 0.29s** | ✅ |
| mutation_suite | `python3 -m harness.testing.mutation_suite` | `mutation_suite v0.9.4 — 17/17 PASS, 0 FAIL` | ✅ |
| benchmark | `python3 -m harness.benchmark.runner --tasks=5 --workers=2` | exit 0，`"passes_gate": true`（gate 5000ms）；跑后 `results.json` 已 `git checkout --` 还原 | ✅ |
| conformance | `python3 spikes/m0/conformance-second-impl.py` | `OK: 10 Protocols satisfy runtime_checkable (v0.9-B adds WorkerPool)` | ✅ |

**§3 计：4/4 ✅**

## §4 硬规则检查

| # | 检查 | 结果 |
|---|------|------|
| 1 | `spikes/m0/_helpers.py` 存在未删 | ✓ |
| 2 | `spikes/m0/conformance-second-impl.py` 存在未删 | ✓ |
| 3 | `spikes/m0/mutation-test.py` 存在未删 | ✓ |
| 4 | tag `v1.0.0a0` 保留且指向不变（→ `dc9d61b`） | ✓ |
| 5 | tag `v1.0.0a1` 保留且指向不变（→ `41ca3c5`） | ✓ |

（复审指令 Step-8 实际列 5 项命令，文字「6/5」为笔误。）**§4 计：5/5 ✓**。附加：修复 commit 经普通 commit 落在 main 之上，无 force push、无 tag 改写。

## §5 范围隔离

`git diff 878a783..47ba181 --stat`（10 files, +281/−33）：

```
CHANGELOG.md                          | 41 ++++++++++-
README.md                             |  2 +-
adr/0008-v1.0-package-architecture.md | 15 ++--
docker-compose.yml                    |  8 ++-
docs/poll/cc-ready.json               |  6 +-
harness/__init__.py                   | 52 ++++++++++++--
harness/benchmark/__init__.py         | 11 ++-
notes/codex-review-prompt-v1.0.0a1.md | 34 +++++++--
notes/codex-review-v1.0.0a1-report.md |129 +++++++++++++++++++  ← 初次审验报告归档
results.json                          | 16 ++---
```

与复审指令预期白名单**逐文件精确一致（10/10）**；`spec/`、`spikes/`、`harness/{runtime,gateway,drivers,testing}/`、`Dockerfile`、`pyproject.toml`、ADR 0001-0007/0009 **全部零触碰**（版本不 bump 决策与 CHANGELOG a1 Notes 声明一致）。代码 diff 复核：`harness/benchmark/__init__.py` 仅 `__getattr__` 内一行改 `importlib.import_module`（附 harness/testing 差异成因注释）；`harness/__init__.py` 仅 docstring 重写 + 3 个新 Protocol 类 + `__all__` 3 行追加。

## §6 整体建议

- **PASS → 建议架构师 proceed `v1.0.0` GA tag 流程**（最终裁断由用户下；本审验只给「修复成立 + 无回归 + 无范围溢出」证据）。
- 非阻塞遗留（并入 GA 流程处理，不属本轮 FAIL）：
  1. **版本 bump**：`pyproject.toml` / `harness.__version__` 仍为 `1.0.0a0`（本次有意的 no-bump，CHANGELOG 已声明 deferred until the next functional release）→ **v1.0.0 GA 即该时点**，tag 时必须 bump 至 `1.0.0` 并同步 CHANGELOG `[1.0.0]` 段 + `docker-compose.yml` 镜像 tag（ADR 0008 版本对齐规则）。
  2. **复审指令质量**：recheck prompt Step-3（`__runtime__` 探针）与 Step-4（`test -n` 恒真 + `^\[` 模式失配）两条命令自身有缺陷，后续 prompt 复用前应改为 `isinstance()` 探针与 `grep -c '^## \[v1\.0\.0\]'` 判非零。
  3. **GHCR 可见性**：`v1.0.0a1` 镜像为 private；GA 发布时建议设为 public（或记录用户裁断）。

---

*Report generated by Codex recheck run 2026-09-01T09:29Z; raw logs `/tmp/harness-recheck-out.txt`, `/tmp/harness-recheck2-out.txt`.*
