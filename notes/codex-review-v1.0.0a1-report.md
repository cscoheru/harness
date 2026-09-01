# Codex v1.0.0a0+a1 集中审验报告

> **Date**: 2026-09-01（commit date，见 HEAD）
> **Reviewer**: Cline（独立复审，按 `notes/codex-review-prompt-v1.0.0a1.md` 主指令执行；非 Codex 本体，结论仅基于可执行命令的实际输出 + 静态代码/ADR 阅读）
> **HEAD**: `878a783`（main；= tag `v1.0.0a1`(`41ca3c5`) + 1 个 notes-only 提交，代码/规格/文档零差异，已核实 `git show --stat 878a783` 仅 +notes/codex-review-prompt + docs/poll/cc-ready.json）
> **Baseline tags**: `v1.0.0a0` → `dc9d61b`；`v1.0.0a1` → `41ca3c5`（2026-09-01）—— 指向未变（不可变 ✓）
> **Scope**: harness/ + spec/ + spikes/m0/ + tests/ + adr/ + .github/workflows/ + 仓库根 5 文档 + deploy workflow patch
> **Method**: 遵守 prompt 范围约束——未读 docs/REVIEW-T-*.md、docs/DISPATCH-T-*.md、docs/CC-POLL.md / POLL-PROTOCOL.md / poll/、notes/ 前代 review 报告；§3 复审基于底层工件的独立验证，不基于任何自签 review 措辞。完整原始输出：`/tmp/harness-verify-out.txt`（Step 0-11）+ `/tmp/harness-verify2-out.txt`（补充核查）

---

## §1 结论：CHANGES REQUIRED（1 个必修项，其余全绿）

12 步验证中 11 步完全通过（schema 13/27、13/13 spikes、37/37 pytest、17/17 mutation、benchmark passes_gate=true、Docker 构建+容器导入 exit 0、5 文档、9 ADR 无篡改、deploy run 33481141073 completed/success、conformance 10 Protocols、硬规则无触犯），但 GA plan §4 Step 2 的 `python3 -c "from harness.benchmark import runner"` **实际 exit 1（RecursionError）**——`harness/benchmark/__init__.py:20` 的 PEP 562 `__getattr__` 用 `from . import runner as _r` 触发无限递归。按 prompt 判断标准（「全部命令必须 exit 0 才算 PASS」）判 **CHANGES REQUIRED**：修这 1 处（major）后复审即可转 PASS；另有 5 个 minor（见 §4）建议一并清理但不阻塞。

---

## §2 GA plan §4 12 步验证矩阵

| # | 步 | 命令 | 期望 | 实际（跑出） | 状态 |
|---|----|------|------|------|------|
| 1 | schema 应用 | `sqlite3 /tmp/harness-test.sqlite < spec/kernel-schema.sql` + count | 13/14 tables + 27 triggers | `tables=13` `triggers=27`（与 v0.9.5 baseline 及 m0-contract-tests.yml 期望一致）| ✅ |
| 2a | pip install | `pip install -e . --quiet` | exit 0 | `pip_exit=0` | ✅ |
| 2b | import harness | `python3 -c "import harness; print(...)"` | `1.0.0a1` | `harness: 1.0.0a0`（exit 0；版本见 FAIL-2）| ⚠️ |
| 2c | runtime/gateway/testing 导入 | 3 × `python3 -c "from harness.X import ..."` | OK | `runtime: OK` `gateway: OK` `testing: OK` | ✅ |
| 2d | benchmark 导入 | `python3 -c "from harness.benchmark import runner"` | OK | **RecursionError, exit 1**（FAIL-1）| ❌ |
| 3 | 13 spikes | loop `spikes/m0/*.py` | 13/13 ✓ | 13/13 OK（approval-supersede…worker-events-emit 全绿）| ✅ |
| 4a | pytest | `python3 -m pytest tests/ -q` | 37 passed | `37 passed in 0.23s` | ✅ |
| 4b | mutation | `python3 -m harness.testing.mutation_suite` | 17/17 PASS | `mutation_suite v0.9.4 — 17/17 PASS, 0 FAIL (M12 removed; M17 supersedes)` | ✅ |
| 4c | benchmark | `--tasks=10 --workers=2` | exit 0；results.json；passes_gate=true | exit 0；`"passes_gate": true` | ✅ |
| 5a | Docker 构建 | `docker build -t fish-harness:1.0.0a1 .` | 成功 | `Successfully built de55a7f34fd0`（cache 命中=构建上下文未变）| ✅ |
| 5b | 容器内导入 | `docker run --rm … python3 -c "import harness…"` | `1.0.0a1` | `in-container: 1.0.0a0`（exit 0；版本见 FAIL-2）| ⚠️ |
| 6-7 | 5 文档 + 9 ADR 完整性 | `test -f`×5 + ADR 计数 + git 历史核查 | 5 OK；ADR=9；footer=9；无篡改 | 5 OK；`9`；`9`；0001-0007 自首次提交仅追加 v1.0 Status footer + 1 行行尾空白规范化（-/+ 逐字相同）；a0→a1 ADR 零 diff | ✅ |
| 8 | deploy 修复验证 | `gh run view 33481141073 --json` | completed success | `{"conclusion":"success","status":"completed"}` | ✅ |
| 9-10 | 硬规则 + conformance | 见 §6；`conformance-second-impl.py` | 10 Protocols | `OK: 10 Protocols satisfy runtime_checkable` | ✅ |
| 11-12 | 完整性 critic 3 项 | imports/Dockerfile/LICENSE | 见 §6 | 内部 import 全部为 spec.interfaces 或 harness.runtime（合法方向）；Dockerfile 走 pyproject 安装；LICENSE=`MIT / Copyright (c) 2026 cscoheru` | ✅ |

**小结：除 2d（exit 1）外全部 exit 0。**


---

## §3 13 个架构师自签 REVIEW 复审结论

实际存在的 13 份 = `REVIEW-T-DD-1..6` + `REVIEW-T-DO-2/3` + `REVIEW-T-QA-1..5`（`ls docs/REVIEW-T-*.md` = 13）。**注意**：prompt「复审 prep」表所列 `REVIEW-T-BE-1..5`、`REVIEW-T-TG-1..5`、`DO-1/DO-4/DO-5` 共 13 个文件名**不存在，且 git 全历史从未存在**（`git log --all --diff-filter=A -- 'docs/REVIEW-T-BE-*' …` 为空）→ FAIL-5。「独立验证」列均为对底层工件的复核：

| REVIEW | 自签结论 | 独立验证（实际跑出/静态复核） | 一致性 |
|--------|---------|------------|--------|
| DD-1..6 | PASS | README/CHANGELOG/LICENSE 在；README 引用 ADR 0008/0009（L117-118）；CHANGELOG v1.0.0a0 段 5 块齐；LICENSE=MIT 2026 cscoheru；9 ADR footer 齐 | ✅（文档内含 FAIL-2/3 失真项）|
| DO-2 | PASS | Dockerfile 经 pyproject 安装（`COPY pyproject.toml README.md` + `RUN pip install --no-cache-dir --no-compile .`）；alpine 偏差有 ADJUDICATION 背书 + 构建期 SQLite ≥3.47 硬门 | ✅ |
| DO-3 | PASS | .dockerignore 排除 .git/docs/notes/spikes/tests 等；镜像复现构建成功 | ✅ |
| QA-1..5 | PASS | mutation 17/17 实跑零漂移；benchmark 实跑 `passes_gate=true`，runner.py 含 JSON+CSV 输出路径；stress_test.py 确为 50×200=10000 设计（本次未复跑 50×200，README 声称 10000/10000、1968/s）| ✅ |
| （prep 表）BE-1..5 | PASS | **文件不存在**。工件级成立：runtime 为 `_helpers.py` 逐段 lift（`_db.py`↔L1-189 / `workers.py`↔L328-531 / `context.py`↔L246-325），行为等价由 13 spikes + 37 pytest + 17 mutations 背书 | ⚠️ 工件 PASS / 交付物缺失 |
| （prep 表）TG-1..5 | PASS | **文件不存在**。工件级成立：egress.py 有 BLOCKED_NETWORKS（12 私网段）+ PinnedResolver allowlist + redirect 重校验 + 指数退避（0.5s×2 cap 8s）+ 无 proxy 即拒（SSRF）；gateway.py 6 步链齐全，deny 不触 provider | ⚠️ 工件 PASS / 交付物缺失 |
| （prep 表）DO-1/DO-4 | PASS | **文件不存在**。deploy.yml tag 触发器 `v*` + push job 自带 checkout（P1 修复在位；run 33481141073 success 实证）| ⚠️ 工件 PASS / 交付物缺失 |
| （prep 表）DO-5 | DEFER | `.github/workflows/` 仅 ci.yml/deploy.yml/m0-contract-tests.yml，无 codex-review gate | ✅ DEFER 成立 |

**小结：存在的 13 份自签 REVIEW 结论全部经独立验证成立；prep 表清单描述有误（10 个文件名从未存在）。**


---

## §4 FAIL 清单

**FAIL-1（major，必修——按 exit-0 标准阻塞 PASS）**
- 位置：`harness/benchmark/__init__.py:18-21`
- 复现：`python3 -c "from harness.benchmark import runner; print('benchmark: OK')"` → **exit 1**
- 输出片段：`File ".../harness/benchmark/__init__.py", line 20, in __getattr__` / `from . import runner as _r` ×N / `RecursionError: maximum recursion depth exceeded`
- 根因：`__getattr__('runner')` 内 `from . import runner` 再次触发 `_handle_fromlist`→`hasattr`→`__getattr__` 无限递归。对照组 `harness/testing/__init__.py` 能过，因其惰性导出的是**属性名**（run_mutations）而非**子模块名**。`python -m harness.benchmark.runner`（CI/README 路径）不受影响，CI 全绿掩盖了该缺陷。
- 修复建议：改用 `importlib.import_module("harness.benchmark.runner")`，并补 `from harness.benchmark import runner` 回归测试。
- 影响：GA plan §4 Step 2 第 5 条命令失败；包属性访问路径（IDE 补全 / `from harness.benchmark import runner` 消费者）损坏。

**FAIL-2（minor）版本元数据未随 v1.0.0a1 提升**
- 位置：`pyproject.toml:7`（`version = "1.0.0a0"`）、`harness/__init__.py:16`（`__version__ = "1.0.0a0"`）
- 复现：Step 2b 跑出 `harness: 1.0.0a0`；Step 5b 跑出 `in-container: 1.0.0a0`（prompt 期望均为 1.0.0a1）；CHANGELOG 无 v1.0.0a1 条目。
- 影响：tag v1.0.0a1 / GHCR 镜像 v1.0.0a1 自报版本 1.0.0a0，发布可追溯性失真。

**FAIL-3（minor）「10 Protocol 出口」文档失真**
- 位置：`CHANGELOG.md` L22-26（"+ 10 Protocol exports（…ToolProvider、PolicyDecision、ExecutionDriver）"）、`adr/0008` L85-93（展示 `from harness.spec_interfaces import …`——该模块不存在）
- 实际：`__all__` 协议名 = 7 个；10 个 Protocol 定义在 `spec/interfaces/`（conformance 10/10 属实）。
- 影响：文档与代码不符；ADR 0008 代码块为虚构快照。

**FAIL-4（minor）「a1 唯一变化 = deploy.yml」表述失真**
- 复现：`git diff v1.0.0a0..v1.0.0a1 --stat` = **21 files changed**（deploy.yml + .gitignore + docs×13 + notes×1 + results.json + poll 状态）。代码面（harness/、spec/、Dockerfile、docker-compose.yml、ci.yml）零变化属实。
- 影响：变更范围声明不精确；results.json（基准输出）被纳入 a1 提交。

**FAIL-5（minor）复审 prep 表 REVIEW 清单失真**
- 位置：`notes/codex-review-prompt-v1.0.0a1.md` §架构师复审 prep
- 复现：`ls docs/REVIEW-T-*.md` = 13（DD-1..6、DO-2/3、QA-1..5）；prep 表所列 BE/TG/DO-1/DO-4/DO-5 文件在 git 全历史从未存在。
- 影响：M1/M2 的 BE/TG 任务缺少对应自签 REVIEW 载体（其验收由 GA plan §4 命令 + 本轮工件复核覆盖）。

**FAIL-6（minor）ADR 0008 依赖方向措辞与实现偏差（及小项）**
- `adr/0008` 声明 `benchmark → runtime（仅接口类型）`，但 `harness/benchmark/runner.py:25-26` import 具体实现 `make_db/seed_task/SqliteWorkerPool`。
- 小项：`docker-compose.yml` 两个 service `image:` 仍为 `fish-harness:1.0.0a0`。


---

## §5 整体评价 + 是否建议 GA sign-off

工程本体质量高：schema 13 tables/27 triggers 与 baseline 一致、17/17 mutation 零漂移复现、13/13 spike 与 37/37 pytest 全绿、benchmark p99 远低于 5000ms 硬门（passes_gate=true）、容器构建可复现且带 SQLite ≥3.47 构建期硬门、9 份 ADR 经 git 历史核查无篡改、deploy workflow 修复有 run 33481141073 completed/success 实证、硬规则无一触犯。**当前不建议直接 GA sign-off**：先修 FAIL-1（一行改动：`__getattr__` 改 `importlib.import_module`，补回归测试），可顺手处理 FAIL-2（bump 版本或以 1.0.0a2 重发）与 FAIL-3/4/5/6 文档一致性；修复后只需复跑 Step 2 五条导入命令即可复审转 PASS 并发 GA tag，其余 11 步本次已实跑通过、无需重跑。

---

## §6 触犯硬规则检查

注：prompt 称「9 条硬规则」但清单实际编号 1,3,4,5,6,7,8,9（缺 2），按所列 8 条核查：

| # | 规则 | 核查（实际跑出） | 状态 |
|---|------|------|------|
| 1 | 禁删 3 个 spike 文件 | `_helpers.py`、`conformance-second-impl.py`、`mutation-test.py` 均在；spike 套件 13/13 全绿 | ✅ |
| 3 | 禁改 v1.0.0a0/a1 tag | tag→commit = `dc9d61b`/`41ca3c5`，未变 | ✅ |
| 4 | 禁改 harness/__init__ 已暴露 Protocol | a0→a1 该文件零 diff | ✅ |
| 5 | 禁引入 TS/dsh/PWA | `git ls-files` 过滤 → none | ✅ |
| 6 | 禁改 spec/ 接口 | a0→a1 spec/ 零 diff；spec 最后变更为 v0.9.4（f06c913） | ✅ |
| 7 | 禁删 GHCR a0/a1 镜像 | 匿名 `docker manifest inspect` 不可见（包非 public 可见性所致，非删除证据）；deploy run 33481141073（含 push job）success 为推送成功直接证据；历史无 unpublish 迹象 | ✅（caveat）|
| 8 | 禁改 Dockerfile 入口 CMD | `Dockerfile:79 CMD ["python","-m","harness"]`；容器 `Config.Cmd=[python -m harness]` | ✅ |
| 9 | 禁改 ADR 0001-0009 Status/Decision/Consequences | 0001-0007 自首版仅追加 v1.0 footer + 1 行空白规范化（-/+ 逐字相同）；0008/0009 为 v1.0 新增；a0→a1 adr/ 零 diff | ✅ |

**8/8 PASS（#7 为间接验证 + 本地匿名验证受限 caveat）。**

---

### 附：环境与方法限制

1. 共享终端多次被交互式 TUI 占用，全部验证改经 `/tmp/harness-verify.sh`（Step 0-11 原样命令）后台执行、输出落盘 `/tmp/harness-verify-out.txt`（1636+ 行原始记录）+ `/tmp/harness-verify2-out.txt`，命令语义与 prompt 逐条一致。
2. `stress_test --workers=50 --tasks=200` 与 benchmark `--csv` 输出未实际执行（不在 12 步清单内；前者以静态代码复核 + README 声称为据）。
3. 未读 docs/REVIEW-T-*.md / DISPATCH-T-*.md / poll 内部状态 / notes 前代 review（per prompt 范围约束）。
4. 复核完成后已还原验证中被动变更的 tracked 文件 `results.json`（`git status` clean，仅本报告为新增未跟踪文件）。
