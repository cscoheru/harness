# Codex v1.0.0a1 修复复审指令

> **File**: `notes/codex-review-prompt-v1.0.0a1-recheck.md`
> **Date**: 2026-09-01
> **Status**: 初次审验返回 **CHANGES REQUIRED**（1 major + 5 minor，详见 `notes/codex-review-v1.0.0a1-report.md`）。架构师已修完所有 FAIL（commit `47ba181`）。本轮**只做修复后回归**，不复跑已 PASS 的 11 步。
> **Reviewer**: Codex (gpt-5.6-sol, reasoning=xhigh)

---

## 主指令（可直接复制粘贴到 Codex）

```text
请对 fish-harness v1.0.0a1 的 6 个 FAIL 修复做回归复审。**不要重跑
初次审验的全部 11 步**——只针对 FAIL-1/2/3/4/5/6 做最小可执行验证。
修复 commit = 47ba181 on main（已 push）。

【背景】
初次审验（HEAD 878a783）返回 CHANGES REQUIRED：
- FAIL-1 (major, blocking): `from harness.benchmark import runner` exit 1
  (RecursionError, PEP 562 __getattr__ 自递归)
- FAIL-2 (minor): version 元数据未随 v1.0.0a1 提升；CHANGELOG 无 a1 条目
- FAIL-3 (minor): `harness.__all__` 只 7 个 Protocol，缺 ToolProvider /
  PolicyDecisionPoint / ExecutionDriver；ADR 0008 代码块指向不存在的
  `harness.spec_interfaces`
- FAIL-4 (minor): a0→a1 实际 21 files 改动，文档失真
- FAIL-5 (minor): 初次 prompt prep 表列 10 个虚构 REVIEW 文件名
- FAIL-6 (minor): ADR 0008 benchmark 依赖方向措辞与实现不符；
  docker-compose 镜像名未同步

修复 commit 47ba181 的预期修复：
1. harness/benchmark/__init__.py 用 importlib.import_module 替代 from . import
2. harness/__init__.py 加 3 个缺失 Protocol + __all__ = 10
3. CHANGELOG.md 加 [v1.0.0a1] 段
5. notes/codex-review-prompt-v1.0.0a1.md prep 表重写为实际 13 文件
6. adr/0008 措辞修正 + docker-compose 镜像 + README PolicyDecisionPoint

【具体执行路径（按序，全部 exit 0 才 PASS）】

# Step 0 — 基线
cd /Users/kjonekong/projects/fish-harness
git checkout main
git pull
git rev-parse HEAD
# 期望：47ba181（chore(poll): cc-ready T-M3-FAILFIX）

# Step 1 — FAIL-1 验证（核心 blocking 项）
python3 -c "from harness.benchmark import runner; print('FAIL-1 FIX:', runner.__name__)"
# 期望：FAIL-1 FIX: harness.benchmark.runner（exit 0；不再是 RecursionError）

# Step 2 — FAIL-3 验证（10 Protocols）
python3 -c "
import harness
expected = {'WorkerPool','EventSink','ContextDistiller','ContextBudget','ContextManager','ArtifactStore','ToolInvocationGateway','ToolProvider','PolicyDecisionPoint','ExecutionDriver'}
actual = set(n for n in harness.__all__ if n != '__version__')
print('FAIL-3 expected:', sorted(expected))
print('FAIL-3 actual  :', sorted(actual))
assert expected == actual, f'mismatch: {expected ^ actual}'
print('FAIL-3 PASS: 10/10 Protocols match')
"
# 期望：FAIL-3 PASS: 10/10 Protocols match

# Step 3 — FAIL-3 验证（3 个新 Protocol 是 runtime_checkable）
python3 -c "
from harness import ToolProvider, PolicyDecisionPoint, ExecutionDriver
import harness
print('ToolProvider runtime_checkable:', hasattr(ToolProvider, '__runtime__'))
print('PolicyDecisionPoint runtime_checkable:', hasattr(PolicyDecisionPoint, '__runtime__'))
print('ExecutionDriver runtime_checkable:', hasattr(ExecutionDriver, '__runtime__'))
print('All 3 PASS')
"
# 期望：All 3 PASS

# Step 4 — FAIL-2/4 验证（CHANGELOG v1.0.0a1 段存在）
grep -A3 "v1.0.0a1" CHANGELOG.md | head -10
test -n "$(grep -c '^\[v1.0.0a1\]' CHANGELOG.md)" && echo "FAIL-2/4 PASS: v1.0.0a1 section exists" || echo "FAIL-2/4 FAIL"
# 期望：FAIL-2/4 PASS

# Step 5 — FAIL-5 验证（prep 表已修正）
ls docs/REVIEW-T-*.md | wc -l
# 期望：13
grep -c "REVIEW-T-BE-\|REVIEW-T-TG-\|REVIEW-T-DO-1\|REVIEW-T-DO-4\|REVIEW-T-DO-5" \
  notes/codex-review-prompt-v1.0.0a1.md
# 期望：prep 表中不再有虚构的 BE/TG/DO-1/4/5 行（计数应为 0 或仅在「未独立 review」段出现）
grep -E "REVIEW-T-DD-|REVIEW-T-DO-|REVIEW-T-QA-" notes/codex-review-prompt-v1.0.0a1.md | wc -l
# 期望：≥13（实际存在的 13 份）

# Step 6 — FAIL-6 验证（ADR 0008 + compose + README）
echo "--- ADR 0008 依赖方向行 ---"
grep -A3 "harness/benchmark/" adr/0008-v1.0-package-architecture.md | head -6
# 期望：含「具体实现」而非「仅接口类型」

echo "--- ADR 0008 import 行 ---"
grep -B1 -A6 "出口协议" adr/0008-v1.0-package-architecture.md | head -15
# 期望：from harness import (...) + PolicyDecisionPoint，不再 from harness.spec_interfaces

echo "--- docker-compose 镜像 ---"
grep "image:" docker-compose.yml
# 期望：两个 image 都是 fish-harness:1.0.0a1

echo "--- README PolicyDecisionPoint ---"
grep -c "PolicyDecisionPoint" README.md
# 期望：≥1

# Step 7 — 回归 sanity（避免修 FAIL-1 把别的弄坏）
python3 -m pytest tests/ -q --tb=short
# 期望：37 passed

python3 -m harness.testing.mutation_suite
# 期望：17/17 PASS

python3 -m harness.benchmark.runner --tasks=5 --workers=2
# 期望：exit 0 + passes_gate=true

python3 spikes/m0/conformance-second-impl.py | grep -E "10 Protocols|all_match"
# 期望：10 Protocols satisfy runtime_checkable

# Step 8 — 硬规则检查（修复过程不能触犯）
test -f spikes/m0/_helpers.py && echo "✓ _helpers.py" || echo "✗ FAIL"
test -f spikes/m0/conformance-second-impl.py && echo "✓ conformance-second-impl.py" || echo "✗ FAIL"
test -f spikes/m0/mutation-test.py && echo "✓ mutation-test.py" || echo "✗ FAIL"
git tag -l | grep -E "^v1\.0\.0a0$" && echo "✓ v1.0.0a0 保留" || echo "✗ FAIL"
git tag -l | grep -E "^v1\.0\.0a1$" && echo "✓ v1.0.0a1 保留" || echo "✗ FAIL"
# 期望：6/5 全 ✓（硬规则通过）

# Step 9 — 修改范围隔离（修复不能溢出）
git diff 878a783..47ba181 --stat
# 期望：仅 harness/{__init__,benchmark/__init__}.py + CHANGELOG.md + ADR 0008 +
#       docker-compose.yml + README.md + notes/codex-review-prompt-v1.0.0a1.md +
#       notes/codex-review-v1.0.0a1-report.md + results.json + docs/poll/cc-ready.json
# 不应触及：spec/、spikes/、harness/runtime/、harness/gateway/、harness/drivers/、
#         harness/testing/、Dockerfile、pyproject.toml、ADR 0001-0007/0009

【输出格式】

# Codex v1.0.0a1 修复复审报告

> **Date**: <auto>
> **Reviewer**: Codex (gpt-5.6-sol, reasoning=xhigh)
> **Pre-fix HEAD**: `878a783`
> **Post-fix HEAD**: `47ba181`
> **Scope**: 仅 FAIL-1/2/3/4/5/6 修复证据 + 回归 sanity

---

## §1 结论（一段）：PASS 或 CHANGES REQUIRED

## §2 FAIL 修复矩阵

| FAIL | 修复位置 | 验证命令实际跑出 | 状态 |
|------|---------|----------------|------|
| FAIL-1 (major) | `harness/benchmark/__init__.py:18-25` | `python3 -c "from harness.benchmark import runner"` → `harness.benchmark.runner` exit 0 | ✅/❌ |
| FAIL-3 (10 Protocols) | `harness/__init__.py:__all__` | 10/10 expected/actual match | ✅/❌ |
| FAIL-3 (3 新 Protocol runtime_checkable) | `harness/__init__.py` lines 76-101 | ToolProvider / PolicyDecisionPoint / ExecutionDriver 均有 `__runtime__` | ✅/❌ |
| FAIL-2/4 (CHANGELOG a1) | `CHANGELOG.md` `[v1.0.0a1]` 段 | grep 命中 + 段内容含「deploy-only patch / version 不 bump」| ✅/❌ |
| FAIL-5 (prep 表) | `notes/codex-review-prompt-v1.0.0a1.md` 架构师 prep 段 | 不再列虚构 BE/TG/DO-1/4/5；列实际 13 份 | ✅/❌ |
| FAIL-6 (ADR 0008 benchmark 措辞) | `adr/0008-v1.0-package-architecture.md` | 含「具体实现」不再「仅接口类型」| ✅/❌ |
| FAIL-6 (ADR 0008 import) | `adr/0008-v1.0-package-architecture.md` | `from harness import (...)` + PolicyDecisionPoint | ✅/❌ |
| FAIL-6 (compose 镜像) | `docker-compose.yml` | 2 行 image 都是 `fish-harness:1.0.0a1` | ✅/❌ |
| FAIL-6 (README PolicyDecisionPoint) | `README.md` | 含 PolicyDecisionPoint | ✅/❌ |

## §3 回归 sanity（避免修复引入新失败）

| 项 | 命令 | 实际跑出 | 状态 |
|----|------|---------|------|
| pytest | `pytest tests/ -q` | 37 passed | ✅/❌ |
| mutation_suite | `python -m harness.testing.mutation_suite` | 17/17 PASS | ✅/❌ |
| benchmark | `--tasks=5 --workers=2` | exit 0 + passes_gate | ✅/❌ |
| conformance | `conformance-second-impl.py` | 10 Protocols satisfy runtime_checkable | ✅/❌ |

## §4 硬规则检查

(6 项全 ✓/✗)

## §5 范围隔离

(列出 `git diff 878a783..47ba181 --stat` 实际命中文件，确认未触
 spec/、spikes/、harness/{runtime,gateway,drivers,testing}/、Dockerfile、
 pyproject.toml、ADR 0001-0007/0009)

## §6 整体建议

- PASS：建议架构师 proceed v1.0.0 GA tag（最终裁断由用户下）
- CHANGES REQUIRED：列出剩余问题 + 是否需要再一轮审验

【判断标准】
- PASS：§2 9/9 ✅ + §3 4/4 ✅ + §4 6/6 ✅ + §5 范围未溢出
- CHANGES REQUIRED：发现新失败 / 修复未生效 / 引入回归

【如果你发现 PASS】输出 §1 PASS + 9/9 + 4/4 + 6/6 + 范围未溢出 +
建议 proceed v1.0.0 GA tag（最终裁断仍由架构师/用户下，本审验只给
  「修复成立 + 无回归」证据）。
```

---

## 怎么用

```bash
# 1. 把上面的「主指令框」整段复制
# 2. 启动 Codex：
codex --model gpt-5.6-sol --reasoning-effort xhigh exec \
  "<粘贴主指令框内容>"
# 3. Codex 跑完后输出报告，建议保存到
#    notes/codex-review-v1.0.0a1-recheck-report.md
# 4. 如果 PASS → 架构师 proceed v1.0.0 GA tag 流程
```

## 与初次审验的区别

| 维度 | 初次审验 (`v0.9.5` → `v1.0.0a1` 报告) | 本次复审 |
|------|--------------------------------------|----------|
| 范围 | GA plan §4 12 步 + 13 自签 REVIEW + 9 硬规则 | **仅 6 FAIL + 回归 sanity + 6 硬规则** |
| 步数 | 11 步验证命令 | 9 步验证命令 |
| 期望耗时 | 5-10 分钟（schema 应用 + 13 spike + pytest + ...）| **30-60 秒**（直接 import + grep + 4 条 sanity） |
| 输出 | 初次审验报告（已落盘 `codex-review-v1.0.0a1-report.md`）| 修复复审报告（建议落盘 `codex-review-v1.0.0a1-recheck-report.md`） |
| 判断 | PASS / CHANGES REQUIRED | PASS / CHANGES REQUIRED（更聚焦） |

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>