# Codex v1.0.0a1 集中审验指令

> **File**: `notes/codex-review-prompt-v1.0.0a1.md`
> **Date**: 2026-09-01
> **Status**: v1.0.0a0 已发（tag → commit `dc9d61b`）；v1.0.0a1 修补 deploy workflow 后已发（tag → commit `41ca3c5`）。本次集中审验覆盖 v1.0.0a0 + v1.0.0a1 全范围
> **Background**: v0.9.4 review PASS（28/28 反例 / 17/17 mutation / 13/13 spike / 12/12 schema / 10/10 conformance）；v1.0 在 v0.9.5 之上加了 production runtime + 容器化 + 文档 + 2 个新 ADR + deploy workflow
> **Reviewer**: Codex（gpt-5.6-sol, reasoning=xhigh）

---

## 主指令（可直接复制粘贴到 Codex）

```text
请对 fish-harness v1.0.0a0 + v1.0.0a1 做集中审验。架构师在 M1/M2/M3
过程中自签了 13 个 REVIEW-T-*.md 报告（Cursor 暂不可用，poll protocol
兜底），本轮用你的独立视角验证这些自签结论是否成立。

【范围限定（强约束）】
- 只读以下目录：harness/、spec/、spikes/m0/、tests/、adr/、.github/workflows/、
  仓库根的 Dockerfile / docker-compose.yml / .dockerignore / pyproject.toml /
  README.md / CHANGELOG.md / LICENSE
- 不要读 docs/CC-POLL.md / docs/POLL-PROTOCOL.md / docs/poll/ 下的 poll 协议
  内部状态（这是协调机制，不是 v1.0 交付物）
- 不要读 docs/REVIEW-T-*.md（你自己要审验的对象，不是输入）
- 不要读 docs/DISPATCH-T-*.md（任务派发原始 spec，不是输入；可以从 specs 章节读）
- 不要读 notes/ 下的 contemplation / 之前的 codex-review-v0.9.*-report.md
  （前代 review 话术，避免被锚定）
- 复审只基于「可执行验证命令的实际跑出结果 + 静态代码/ADR 阅」，不基于任何
  自签 review 的措辞或承诺

【背景】
v1.0.0a0 = v0.9.5 spec + production runtime（harness/ 5 subpackage：
runtime/gateway/drivers/testing/benchmark；10 Protocol 出口）。v1.0.0a1 =
同 a0 唯一变化 = .github/workflows/deploy.yml 的 push job 补 checkout step
（修 GHCR 推镜像失败 bug，run 33472159405 → 33481141073 已变 success）。

要审验 = (a) 13 个架构师自签 REVIEW 是否合格；(b) v1.0 实际代码/ADR/部署
是否真满足 GA plan §4 12 步验证清单；(c) 是否触犯硬规则。

【具体执行路径（按序，全部命令必须 exit 0 才算 PASS）】

# Step 0 — 环境
cd /Users/kjonekong/projects/fish-harness
git checkout main
git pull
git rev-parse HEAD           # 记录 baseline HEAD

# Step 1 — GA plan §4 step 1：schema 应用
rm -f /tmp/harness-test.sqlite
sqlite3 /tmp/harness-test.sqlite < spec/kernel-schema.sql
sqlite3 /tmp/harness-test.sqlite \
  "SELECT 'tables='||count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
sqlite3 /tmp/harness-test.sqlite \
  "SELECT 'triggers='||count(*) FROM sqlite_master WHERE type='trigger';"
# 期望：tables=13/14，triggers=27（与 v0.9.5 baseline 一致）

# Step 2 — GA plan §4 step 2-4：包导入 + Protocol 入口
pip install -e . --quiet
python3 -c "import harness; print('harness:', harness.__version__)"  # 期望 1.0.0a1
python3 -c "from harness.runtime import SqliteWorkerPool, SqliteEventSink, SqliteContextManager; print('runtime: OK')"
python3 -c "from harness.gateway import HttpEgressService, ToolInvocationGatewayImpl, RealArtifactStore; print('gateway: OK')"
python3 -c "from harness.testing import run_mutations; print('testing: OK')"
python3 -c "from harness.benchmark import runner; print('benchmark: OK')"

# Step 3 — GA plan §4 step 5：13 spike 全绿（v0.9.5 baseline 复用）
for f in spikes/m0/*.py; do
  bn=$(basename "$f")
  [ "$bn" = "__init__.py" ] && continue
  [ "$bn" = "_helpers.py" ] && continue
  python3 "$f" >/dev/null 2>&1 && echo "  ✓ $bn" || echo "  ✗ $bn FAIL"
done
# 期望：13/13 ✓

# Step 4 — GA plan §4 step 8-10：测试 + mutation + benchmark
python3 -m pytest tests/ -q --tb=short
# 期望：37 passed（与 v0.9.5 一致）

python3 -m harness.testing.mutation_suite
# 期望：17/17 PASS（M12 被 M17 替代，仅 17 个；不要按 18/18 计数）

python3 -m harness.benchmark.runner --tasks=10 --workers=2
# 期望：exit 0；results.json 生成；passes_gate=true

# Step 5 — GA plan §4 step 6-7：Docker 镜像构建 + 容器内导入
docker build -t fish-harness:1.0.0a1 . 2>&1 | tail -3
docker run --rm fish-harness:1.0.0a1 python3 -c \
  "import harness; print('in-container:', harness.__version__)"
# 期望：1.0.0a1

# Step 6 — GA plan §4 step 11-12：5 文档 + 9 ADR
test -f README.md && echo "✓ README.md" || echo "✗ README.md MISSING"
test -f CHANGELOG.md && echo "✓ CHANGELOG.md" || echo "✗ MISSING"
test -f LICENSE && echo "✓ LICENSE" || echo "✗ MISSING"
test -f adr/0008-v1.0-package-architecture.md && echo "✓ ADR 0008" || echo "✗ MISSING"
test -f adr/0009-sqlite-wal-production-constraints.md && echo "✓ ADR 0009" || echo "✗ MISSING"
ls adr/000*.md | wc -l   # 期望：9
grep -l "v1.0 Status: Included in GA" adr/000*.md | wc -l   # 期望：9

# Step 7 — 9 ADR 完整性（spec/contract 复审）
# 逐个 Read ADR 0001..0009，验证每条 Decision 段未被篡改、Status=Accepted、
# Consequences 段非空；交叉引用 ADR 0008/0009 闭环

# Step 8 — deploy workflow 修复验证（v1.0.0a1 patch）
gh run view 33481141073 --repo cscoheru/harness --json status,conclusion \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'], d['conclusion'])"
# 期望：completed success

# Step 9 — 硬规则触犯检查（绝对不能触）
test -f spikes/m0/_helpers.py && echo "✓ _helpers.py 保留" || echo "✗ _helpers.py 被删！FAIL"
test -f spikes/m0/conformance-second-impl.py && echo "✓ conformance-second-impl.py 保留" \
  || echo "✗ conformance 被删！FAIL"
test -f spikes/m0/mutation-test.py && echo "✓ mutation-test.py 保留" \
  || echo "✗ mutation-test.py 被删！FAIL"
git tag -l | grep -E "^v1\.0\.0a0$" && echo "✓ v1.0.0a0 tag 保留（不可变）" \
  || echo "✗ v1.0.0a0 tag 丢失！FAIL"
git tag -l | grep -E "^v1\.0\.0a1$" && echo "✓ v1.0.0a1 tag 存在" \
  || echo "✗ v1.0.0a1 tag 丢失！FAIL"

# Step 10 — Protocol 类型契约（v0.9.5 conformance 复用）
python3 spikes/m0/conformance-second-impl.py | grep -E "10 Protocols|all_match"
# 期望：10 Protocols satisfy runtime_checkable

# Step 11 — 完整性 critic（你必须额外查 3 项）
# (1) harness/runtime/ + harness/gateway/ 是否有文件 import 了 spec/ 之外的私有路径？
grep -rn "^from harness" harness/ | grep -v "^harness/__init__" || echo "no internal imports OK"
# (2) Dockerfile 是否真的从 pyproject.toml 安装而非源码 COPY？
grep -E "^(FROM|COPY|RUN|pip)" Dockerfile | head -10
# (3) LICENSE 头部年份/版权是否正确？
head -3 LICENSE
# 期望：MIT + 2026 + cscoheru

【输出格式】

# Codex v1.0.0a0+a1 集中审验报告

> **Date**: <自动取 commit date>
> **Reviewer**: Codex (gpt-5.6-sol, reasoning=xhigh)
> **HEAD**: <short SHA>
> **Scope**: harness/ + spec/ + spikes/m0/ + tests/ + adr/ + .github/workflows/
>   + 仓库根 5 文档 + deploy workflow patch

---

## §1 结论（PASS / CHANGES REQUIRED，1 段）

## §2 GA plan §4 12 步验证矩阵

| # | 步 | 命令 | 期望 | 实际 | 状态 |
|---|----|------|------|------|------|
| 1 | schema 应用 | sqlite3 | 13/14 tables + 27 triggers | ... | ✅/❌ |
| 2 | pip install + import harness | ... | 1.0.0a1 | ... | ... |
| ...（填完 12 步） |

## §3 13 个架构师自签 REVIEW 复审结论

| REVIEW 文件 | 自签结论 | 你的独立验证 | 一致性 |
|------------|---------|------------|--------|
| REVIEW-T-BE-* | PASS/CHANGES | ... | ✅/❌ |
| ...（填完 13 个）|

## §4 FAIL 清单（如有）

每个 FAIL 必须含：
- 文件:行号
- 可执行复现命令（贴出实际跑出的输出片段）
- 严重程度（critical / major / minor）

## §5 整体评价 + 是否建议 GA sign-off

(PASS → 建议合并 + v1.0.0 GA tag 可发 / CHANGES REQUIRED → 列必修项)

## §6 触犯硬规则检查

(9 条硬规则逐一确认 PASS/FAIL)

【判断标准】
- PASS：12 步全 exit 0 + 13 个自签 REVIEW 通过独立验证 + 0 硬规则触犯
- CHANGES REQUIRED：发现 ≥1 个可复现 FAIL，或 ≥1 个硬规则触犯，或 13 个自签
  REVIEW 结论被推翻
- 严重度：critical = 阻塞 GA；major = 必须修；minor = 可后续

【如果你发现 PASS】输出 §1 PASS 一段话 + §2 矩阵全 ✅ + §3 13/13 一致 +
§5 建议 GA sign-off 可发 + §6 硬规则全 PASS。

【如果你发现 FAIL】按 §4 模板列出每条 FAIL 的：文件:行号 + 复现命令输出 +
严重度。不要在 §1 给 PASS 后又在 §2/§4 里写 FAIL — 保持报告一致。
```

---

## 架构师复审 prep（Codex 跑前）

> **FIX 2026-09-01**（per Codex review FAIL-5）：以下 13 份 REVIEW-T-*.md 是
> 仓库中实际存在的自签 review 文件。原始 prep 表列出的
> `REVIEW-T-BE-*` / `REVIEW-T-TG-*` / `REVIEW-T-DO-1/4/5` 共 10 个文件名
> 在 git 全历史中从未存在 — M1/M2 期间架构师对 BE/TG/DO 任务的验收未产出
> 独立 REVIEW 载体，而是直接被 GA plan §4 12 步验证清单 + 本轮工件级
> 复核覆盖。

| 文件 | 自签结论 | 自签时间 | 重点看什么 |
|------|---------|---------|-----------|
| `docs/REVIEW-T-DD-1.md` | PASS | 2026-09-01 | README 9 sections + 10 Protocol 接口表 + 5 特性表 + Tests/CI table 是否真覆盖 |
| `docs/REVIEW-T-DD-2.md` | PASS | 2026-09-01 | CHANGELOG v1.0.0a0 段 5 块（Added/Changed/Deprecated/Security/Fixed）是否齐 |
| `docs/REVIEW-T-DD-3.md` | PASS | 2026-09-01 | LICENSE = MIT + 2026 + cscoheru |
| `docs/REVIEW-T-DD-4.md` | PASS | 2026-09-01 | ADR 0008 5-subpackage 表 + 4 binding 复用规则 + 依赖方向图 + 10 Protocol 出口 |
| `docs/REVIEW-T-DD-5.md` | PASS | 2026-09-01 | ADR 0009 SQLite WAL 单 host 4 硬约束 + perf baseline（1968/s p99<70ms BUSY_TIMEOUT 5000ms）|
| `docs/REVIEW-T-DD-6.md` | PASS | 2026-09-01 | 9 ADR 全部含 `v1.0 Status: Included in GA` footer + 3 cross-ref link (CHANGELOG + ADR 0008 + ADR 0009) |
| `docs/REVIEW-T-DO-2.md` | PASS | 2026-09-01 | Dockerfile 走 pyproject 安装 + alpine SQLite ≥3.47 硬门 + harness_db 命名 volume |
| `docs/REVIEW-T-DO-3.md` | PASS | 2026-09-01 | `.dockerignore` 排除 .git/docs/notes/spikes/tests + 镜像复现性 |
| `docs/REVIEW-T-QA-1.md` | PASS | 2026-09-01 | `harness/testing/mutation_suite.py` 从 `_helpers.py` / `mutation-test.py` lift，行为零漂移（17/17）|
| `docs/REVIEW-T-QA-2.md` | PASS | 2026-09-01 | tests/ 集成测试套件（37/37）+ harness.runtime.make_db fixture 正确性 |
| `docs/REVIEW-T-QA-3.md` | PASS | 2026-09-01 | `harness/benchmark/runner.py` 输出 CSV+JSON；passes_gate=true；p99 < 5000ms |
| `docs/REVIEW-T-QA-4.md` | PASS | 2026-09-01 | 3 新 CI job：integration-tests / mutation-suite / benchmark-baseline（workflow_dispatch）|
| `docs/REVIEW-T-QA-5.md` | PASS | 2026-09-01 | `harness/testing/stress_test.py` 50 workers × 200 tasks (WAL) 设计 + 退出语义 |

**未独立 review 的 13 任务**（BE-1..5 + TG-1..5 + DO-1/4/5）：Codex
本次以「工件级独立验证」覆盖 — 对照 `_helpers.py` / `conformance-second-impl.py` /
`mutation-test.py` 等 spike reference 与 `harness/runtime/*.py` /
`harness/gateway/*.py` / `Dockerfile` / `deploy.yml` 的实际代码，验证
GA plan §4 12 步命令的实际跑出（spike 全绿、pytest 37/37、mutation 17/17、
benchmark passes_gate、docker build + 容器内导入、9 ADR footer、deploy workflow
success）。不基于任何自签 review 的措辞。

## 硬规则（绝对不能触，触了就算 FAIL）

1. 禁删 `spikes/m0/_helpers.py` / `conformance-second-impl.py` / `mutation-test.py`（v1.0 与 spike 共存，spike suite 必须全绿）
3. 禁改 `v1.0.0a0` / `v1.0.0a1` tag（不可变，per GA plan §6）
4. 禁改 `harness/__init__.py` 已暴露的 10 Protocol（向后兼容）
5. 禁引入 TypeScript / dsh / PWA（v1.1+ scope）
6. 禁改 spec/ 接口（v1.0 已 lock）
7. 禁把 v1.0.0a0 / a1 的 GHCR 镜像删了（哪怕只是 unpublish）
8. 禁改 Dockerfile 入口 CMD（容器化契约）
9. 禁改 ADR 0001-0009 的 Status/Decision/Consequences（只能 v1.0 Status footer 之外不动）

## 与 v0.9.5 的对比（已知变化）

| 维度 | v0.9.5 | v1.0.0a0/a1 |
|------|--------|-------------|
| runtime 层 | spec + spike only | `harness/runtime/{_db,workers,context,worker_pool,event_sink,context_manager}.py` |
| gateway 层 | spike only | `harness/gateway/{egress,gateway,artifact_store}.py` |
| 容器化 | 无 | Dockerfile + docker-compose.yml + .dockerignore |
| CI/CD | 12 job + m0-contract-tests | + deploy.yml + 镜像推送 GHCR |
| 文档 | spec + ADR 0001-0007 | + README + CHANGELOG + LICENSE + ADR 0008/0009 |
| mutation suite | spike 17/17 | `harness/testing/mutation_suite.py` 17/17（行为不变）|
| benchmark | 无 | `harness/benchmark/runner.py` + results.json |
| tags | 无 | v1.0.0a0 (dc9d61b) + v1.0.0a1 (41ca3c5) |
| Release page | 无 | github.com/cscoheru/harness/releases/tag/v1.0.0a0 |

---

## Codex 报告输出位置建议

```
notes/codex-review-v1.0.0a1-report.md
```

如果 Codex 给出 PASS，架构师会基于此报告做 M3 Exit Gate 最终 sign-off。
如果给出 CHANGES REQUIRED，架构师按 §4 FAIL 清单逐条修，再走一轮审验。