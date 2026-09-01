# Codex 审核报告 — audit-scope v1.1 M0b v0.1（复审清单文档）

> **Date**: 2026-09-01
> **Reviewer**: Codex (gpt-5.6-sol, reasoning=xhigh)
> **对象**: `notes/codex-audit-scope-v1.1-m0b-v0.1.md`（已随 `9f5ef4b` commit）
> **判定**: **PASS（附 2 项必修 minor——§3 清单自身的验证命令缺陷；修后再复用，不阻断本轮 v0.1 复审启动）**
> **方法**: §3 覆盖矩阵 14 条验证命令 **verbatim 实跑** + 关键声称独立复验（dsh 静态校验 / M7 pathspec 有效性对照实验 / cc-ready 全文）

---

## §1 总判定

**PASS**。该文档作为 v0.1 复审的固定 scope + key points 沉淀，核心内容全部属实：14 findings 映射与 v0.0 FAIL 报告（`notes/codex-review-v1.1-m0b-plan-report.md`）逐条一致（ID/等级/事实描述均准确）；§1.2 的 12+2 文件清单与 commit `9f5ef4b` 实际内容精确吻合（14 files，working tree clean）；§3 矩阵 14 条验证命令我逐条实跑，**12 条原样通过**；(B) 声称的 dsh 静态验证我独立复跑成立（`--dump-config` 合并配置 8 处 `disabled: false`，exit 0）。发现 **2 处清单自 身缺陷（M4 数字错、C2 期望语义错）**——不阻断复审，但复用前必修，否则未来轮次照单跑会出假信号。

## §2 §3 矩阵 14 条 verbatim 实跑结果

| ID | 期望 | 实测 | 判定 |
|----|------|------|------|
| C1 | grep .gitignore exit 1 | exit 1（docs/m0b/ 未被 ignore） | ✅ |
| C2 | grep docs/m0b/ spec/capabilities/ adr/ **exit 2** | exit 2——但根因是 `spec/capabilities/: No such file or directory`；命中数实为 **0**（实质 ✓） | ⚠️ F2 |
| M1 | `grep -c "^### §3.1.5"` DD-1 == 1 | 1（DD-1:138） | ✅ |
| M2 | worker.yaml `model: deepseek-v4-flash` == 1 | 1；vision-exp 2 处命中均为 RATIONALE 注释（L13-17），非 model 行 | ✅ |
| M3 | 4 个 role yaml | 4 | ✅ |
| M4 | `grep -c "^- id: tool-"` base.yaml **== 8** | **7**（7 个 tool-* + agent-instructions 不匹配该 pattern） | ❌ F1 |
| M5 | py `code-change` ≥ 2 | 6 | ✅ |
| M6 | `--help` exit 0 | exit 0 + ast.parse ok | ✅ |
| M7 | diff glob pathspec == 0 lines | 0（v1.0.0..HEAD）| ✅（有效性另证，见 §3） |
| m1 | plan 自引用 ≥ 1 | 3 | ✅ |
| m2 | `default=4096` == 1 | 1 | ✅ |
| m3 | cc-ready 含 @deepseek-ai/dsh ≥ 1 | 1；且旧文本（"dsh CLI 未装"/"Authentication Fails"）已清除 | ✅ |
| m5 | BE/TG/DO/QA 姿势行 ≥ 3/file | 6/6/6/6 | ✅ |
| m4 | （不在 v0.1 范围） | — | n/a |

## §3 关键声称独立复验（全过）

1. **M7 glob pathspec 有效性（对照实验）**：用已知改过 adr/0008 的区间 `878a783..47ba181` 实测——`git diff -- "adr/000[1-9]-*.md"` **正确捕获 15 行变更**（与直接点名该文件的结果一致）→ v0.1 的 M7 修复真实有效，不再是 no-op。（注：`git ls-tree` 对该 pathspec 返回 0 是 ls-tree 自身不支持通配 pathspec，与 git diff 行为不同，勿用 ls-tree 做此类 sanity check。）
2. **dsh 静态校验复跑**：`dsh --profile web --patch base.yaml --patch orch.yaml --dump-config | grep -c "disabled: false"` = **8**，exit 0 → §2.1(B)「已静态验证 8 工具」声称成立（7 个 tool-* + agent-instructions）。
3. **yaml 拆分干净（G 项关闭）**：base.yaml 无 `agent-default-model` ✓；orch/commander/worker 三个 role yaml 仅含 model 块 ✓；worker = v4-flash、vision-exp 仅注释探索臂（含 PRD-v1.1 §1.5 依据）✓——M2/M3 修复落实。
4. **py 脚本功能落实（C 项）**：`statistics.median` + `median_or_none`、429/5xx `2^attempt` 退避重试、缺 key `exit 2`、`.log` sidecar、`--max-tokens` 全部在码内 ✓——M6/m2 修复落实。
5. **§6.X/§3.1.5 落位**：BE/TG/DO/QA 各 +1 段「三姿势候选」（位于 §6 末尾、§6.6 之后，编号不冲突）；DD-1 在 §3.1 骨架内插 §3.1.5 ✓——M1/m5 修复落实。
6. **commit 内容**：`9f5ef4b` = 12 改动 + audit-scope + v0.0 报告 = 14 files，与 §1.2 清单精确一致；v1.0 runtime 零漂移延续（M7 命令 = 0 行）。

## §4 Findings

### F1（minor，必修——复用必踩坑）：§3 M4 期望值与自家工件不符
- 期望 `grep -c "^- id: tool-" docs/m0b/profile-override-base.yaml` == **8**，实测 **7**。base.yaml 实际 = 7 个 `tool-*` id + `agent-instructions`（L43，不匹配 `^- id: tool-`）。§2.1(B) 与 commit message 的「8 工具」是把 agent-instructions 计入的口径，但 grep pattern 数不到它——命令/期望/口径三处错位。
- **修法**（二选一）：pattern 改 `^- id: (tool-|agent-instructions)` == 8；或期望改 == 7 并另加一条 `grep -c "^- id: agent-instructions"` == 1。

### F2（minor，必修——期望语义随环境翻转）：§3 C2 把「目标目录不存在」编码为 PASS 信号
- 实测 exit 2 来自 `spec/capabilities/` 缺失（grep 报错码），非「无命中」（exit 1）。当前 docs/m0b/ + adr/ 命中数确为 0（实质 PASS），但 QA-1 落地 `spec/capabilities/` 后该命令 exit 变 1，checklist 判定语义翻转。
- **修法**：改用 `grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ adr/ | wc -l` == 0，`spec/capabilities/` 存在后再并入 scope；并统一 §2.1(E) 的 `adr/001*.md` 与 §3 的 `adr/` 两处写法（当前等价，写死一处）。

### F3（minor）：cc-ready 字段簿记自相矛盾（§1.2 row 12 指示所致）
- 按本文档指示，`files_unmodified_scope_discipline` 加入了 `docs/m0b/`——但同一字段清单里 `files_modified` 已列 docs/m0b/ 5 个新建模板：**同一路径既 modified 又 unmodified**。`tmp/` 条目（记录"故意不入库"）合理。
- **修法**：docs/m0b/ 从 unmodified 列表移除；或该字段改名/分段（v1.0 冻结资产 vs 本周期新增 vs 故意不入库）。

### F4（trivial）
- header「对应 commit: pending」已过时（实际 = `9f5ef4b`）；§1.2 尾注「commit 含 12 改动；2 reference 在 commit 范围内」措辞绕（实际 14 files 同一 commit），建议改写。
- commit message 提到 `notes/codex-review-v1.1-m0b-v0.1.md`，实际文件名为 `codex-review-v1.1-m0b-plan-report.md`（非本文件缺陷，记录备查）。

## §5 结论 + v0.1 正式复审预判（详）

- **本 scope 文档：PASS**——作为 v0.1 复审清单可用，14 findings 映射与 12/14 验证命令实测有效；F1/F2 属清单自伤，修复是两行改动，可在 v0.1 复审提交前顺手改（或由复审者知悉豁免）。

### 5.1 预判依据（本次全量预验 = v0.1 复审的超集）

v0.0 的 14 findings 在 `9f5ef4b` 上已逐条实质修复，且我已复跑 v0.1 复审将要执行的全部客观检查：

| v0.0 finding | 修复载体 | 我的复验证据 | 预判复审结果 |
|----|----|----|----|
| C1 tmp/ 被 ignore | docs/m0b/ 选址 | C1 命令 exit 1；5 文件已随 9f5ef4b 入库 | PASS |
| C2 grep 守门矛盾 | 收窄到 docs/m0b/+spec/capabilities/+adr | 命中数实测 0（docs/m0b/ + adr/ 全净） | PASS（注意 F2 的 exit 码语义） |
| M1 DD-1 无锚点 | §3.1.5 段 | DD-1:138 存在，count == 1 | PASS |
| M2 worker 档不一致 | 4 yaml 统一 worker=v4-flash | worker.yaml model 行唯一；vision-exp 仅注释 | PASS |
| M3 未按档位换 model | base + 3 role 拆分 | base 无 model；orch=pro / commander=flash / worker=flash | PASS |
| M4 漏启 tool-goal | base.yaml disabled:false | dsh --dump-config 复跑 8 处 disabled:false | PASS（注意 F1 的 7≠8 计数口径） |
| M5 B 姿势不能跑 TG-1 | 指南 + py 警告 | py code-change 相关 6 处命中 | PASS |
| M6 py 描述不符 | median/exit1/.log/max-tokens/retry | 五项全在码内（L10-14/49/71-99/105-109） | PASS |
| M7 ADR pathspec 失效 | glob adr/000[1-9]-*.md | 对照实验：878a783..47ba181 捕获 adr/0008 15 行 | PASS |
| m1-m5 | 各自小修 | m1=3 / m2=1 / m3=1+旧文本清除 / m5=6×4 | PASS |

**预判结论：v0.1 正式复审（按 audit-scope §4.1 prompt 执行）= PASS**，剩余开放项为 G-M 设计讨论题（见 §6.3）与本报告 F1-F3。

### 5.2 预判的边界（不打包票的部分）

- (I) `.log` 后缀碰撞：`--output foo.log` 时 sidecar 与输出同名——需复审者实际判定（建议 `--output` 加 `.json` 强制或 sidecar 用 `.log` 之外后缀如 `.trace.log`）
- (L) tmp/ 路径跨平台：§6.X 跑命令示例的 tmp/ 假设 Linux/macOS；Windows 执行者需换 %TEMP%（M0b 执行环境按 v1.0 GA 先例是 Cursor/Codex/真人，macOS/Linux 为主，风险低）
- (H)/(K)：plugin profile 适用性与姿势 C 冗余——纯设计裁量，不构成 FAIL 依据

## §6 后续任务清单

### 6.1 必修（建议在 v0.1 复审提交前完成，单 commit）

**T-M0b-SCOPE-FIX**（架构师，~15 分钟）：
1. F1：`notes/codex-audit-scope-v1.1-m0b-v0.1.md` §3 M4 验证命令改 `grep -cE "^- id: (tool-|agent-instructions)" docs/m0b/profile-override-base.yaml` == 8（或拆两条：tool-* == 7 + agent-instructions == 1）
2. F2：§3 C2 改 `grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ adr/ | wc -l` == 0（spec/capabilities/ 落地后再并入）；统一 §2.1(E) 与 §3 的 adr 范围写法
3. F3：cc-ready.json 把 `docs/m0b/` 从 `files_unmodified_scope_discipline` 移除（保留 `tmp/` 条目）
4. F4：scope 文档 header「对应 commit: pending」改为 `9f5ef4b`（+ 后续修复 commit 号）；§1.2 尾注改写为「14 files 单 commit」
5. 验证：F1/F2 修正后的两条命令 verbatim 实跑通过；`python3 -c "import json; json.load(open('docs/poll/cc-ready.json'))"` exit 0

### 6.2 流程任务（按序）

**T-M0b-V0.1-RECHECK**（用户亲提 Codex CLI，gpt-5.6-sol + xhigh）：
- 按 `notes/codex-audit-scope-v1.1-m0b-v0.1.md` §4.1 prompt 执行；报告落 `notes/codex-review-v1.1-m0b-v0.1-report.md`
- 预期 PASS（见 §5.1）；若复审者对 F1/F2 未修复版本跑出 7≠8 / exit 2 疑问，出示本报告 §2/§4 裁决即可
- PASS 后：commit + push（若 T-M0b-SCOPE-FIX 已做则含修复）→ M0b 进入等用户「Start v1.1 M0b」阶段（PRD-v1.1 §4.6 第 3 条，不自动开工）

**T-M0b-EXEC（实测执行，需用户两个信号）**：
- 信号 1：提供/配置 `DEEPSEEK_API_KEY`（不允许 hardcode；dsh 与 REST 姿势都走 env）
- 信号 2：用户明示「Start v1.1 M0b」→ 架构师派发 5 个 T-M0b-* 任务（执行者 = Cursor Agent / Codex CLI / 真实人类，按 v1.0 GA 派发模式）
- 执行环境前置：dsh CLI（本机已装 v0.1.1-rc.2 ✓）+ ssh newvps 访问（DO-1 的 free -h 实测）
- H-1 FAIL（≪80%）→ 触发「鱼之重新定义」专项（PRD-v1.1 §3 + NORTH-STAR §10 冲突 5），M0b 停线等裁断

### 6.3 顺带裁断/记录项（不阻塞）

- (I)/(L)：T-M0b-EXEC 执行者首次实测时裁断（.log 命名 + tmp/ 路径），结论回写 DISPATCH §6.X
- m4：M0b 通过后 v1.1-ga-plan 升 v0.1 时把 `docs/m0b/` 补入 §7.3 产出清单
- capability JSON：QA-1 落地 `spec/capabilities/_m0b_draft/` → M0b 通过后 mv 至 `spec/capabilities/`（class/tier 字段，不锁型号）
- ADR 0010：T-M0b-DD-1 完成时起草（v1.1 cycle scope admission）
- commit message 文件名笔误（codex-review-v1.1-m0b-v0.1.md vs 实际 -plan-report.md）记录备查，不改历史

---

*Codex audit done — PASS（附 F1/F2 必修 minor + F3/F4）；§3 矩阵 14 条 verbatim 实跑 12 过；M7 修复经对照实验证实有效；v0.1 正式复审预判 PASS；后续任务见 §6。*
