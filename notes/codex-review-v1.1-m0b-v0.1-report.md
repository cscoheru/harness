# Codex 复审报告 — v1.1 M0b 三路径 spike 模板 v0.1（正式轮）

> **Date**: 2026-09-01
> **Reviewer**: Codex (gpt-5.6-sol, reasoning=xhigh)（用户亲提，per `notes/codex-audit-scope-v1.1-m0b-v0.1.md` §4.1 prompt）
> **复审对象**: commit 链 `9f5ef4b`（v0.1 工件）→ `fb429e3`（self-audit 报告）→ `0da83a5`（dispatch T-M0b-SCOPE-FIX）→ `5e698c8`（F1-F4 hygiene fix, HEAD）
> **判定**: **PASS** — 0 critical / 0 major / 1 minor polish（不阻塞）
> **原始日志**: `/tmp/harness-v01-out.txt`（修复验收 verbatim 实跑）+ 前轮 `notes/codex-review-v1.1-m0b-scope-v0.1-report.md` §2/§3（9f5ef4b 全量预验）

---

## §1 总判定

**PASS**。v0.0 的 14 findings（2C+7M+5m）在当前 HEAD `5e698c8` 上**全部成立地修复**：12 项在 `9f5ef4b` 修复并经前轮全量预验证实；F1-F4 四项 scope 清单 hygiene 已由 `5e698c8` 按执行书 `docs/DISPATCH-T-M0b-SCOPE-FIX.md` 精确修复（本报告 §2 逐条 verbatim 实跑通过）。复审重点 (A)-(F) 全过；潜在新 finding (G)-(M) 裁决后仅 (I) 构成 1 条 minor polish（`.log` 后缀碰撞边界），(H)(L) 为设计备注，其余非问题。范围自 `9f5ef4b` 起仅 4 个预期文件，v1.0 runtime 零漂移延续。**M0b 模板阶段收官，可进入等用户「Start v1.1 M0b」阶段（PRD-v1.1 §4.6 第 3 条）**；实测执行前仍需用户两信号（DEEPSEEK_API_KEY + Start 明示）。

## §2 T-M0b-SCOPE-FIX（5e698c8）验收 — DISPATCH 命令 verbatim 实跑

| 项 | 命令 | 实测 | 判定 |
|----|------|------|------|
| F1 | `grep -cE "^- id: (tool-\|agent-instructions)" docs/m0b/profile-override-base.yaml` | **8** | ✅（§3 M4 行已改，pattern/期望/口径三处对齐） |
| F2 | `grep -rE "Fable 5\|GLM 5.3\|MiniMax-M3" docs/m0b/ adr/ \| wc -l` | **0** | ✅（exit-2 语义已废；§2.1(E) 与 §3 统一为 `docs/m0b/+adr/`；spec/capabilities/ 注记落地后并入） |
| F3 | task_id 断言 + unmod 无 docs/m0b + tmp/ 保留 | **F3+task_id OK**（task_id=`T-M0b-SCOPE-FIX`） | ✅（diff 实证 unmod 列表删除 docs/m0b/ 行、保留 tmp/） |
| F4 | pending 计数 / 9f5ef4b / fb429e3 | **0 / 1 / 1** | ✅（header = `9f5ef4b`（工件）+ `fb429e3`（报告）；§1.2 尾注改「14 files 单 commit」） |

**范围隔离**：`git diff 9f5ef4b..HEAD --stat` = 4 files（scope 报告 @fb429e3、DISPATCH+cc-ready @0da83a5、scope-md+cc-ready @5e698c8），无溢出；`git diff v1.0.0..HEAD -- harness/ spec/ spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml` = **0 行**。§4.1 prompt 模板完整（未被 hygiene fix 误伤）。

## §3 复审重点 (A)-(F)

| # | 重点 | 结论 |
|---|------|------|
| A | 14 findings 覆盖 | ✅ 12 项 @9f5ef4b（前轮 §2 矩阵 verbatim 12 过 + M7 对照实验有效）+ F1-F4 @5e698c8（本报告 §2）；v0.0 报告 findings 无一遗留 |
| B | 4 yaml schema | ✅ dsh `--dump-config` 复跑 8 处 `disabled: false`（7 tool-* + agent-instructions）；`disabled: false`（非 `enabled: true`）merge 语义正确 |
| C | rest-spike.py ≡ plan §2.3 | ✅ median（`statistics.median` + `median_or_none`）/ 全败 exit 1（L221-224）/ `.log` sidecar（L203-219）/ `--max-tokens` default=4096 / 429/5xx+网络错误 2^attempt 退避 / code-change 警告（6 处）全在码内；`--help` exit 0 + ast ok |
| D | 5 DISPATCH §6.X + DD-1 §3.1.5 | ✅ BE/TG/DO/QA 各 1 段（姿势行 6/6/6/6，按档位给 model 与 trace 落点）；DD-1 §3.1.5 恰好 1 处且在 DONE.md 模板围栏**外**（不污染报告骨架）|
| E | 守门设计 | ✅ grep 收窄后实测 == 0；DISPATCH 允许叙述性引用模型名的口径已写死；ADR glob pathspec 经对照实验有效 |
| F | cc-ready 事实准确性 | ✅ dsh v0.1.1-rc.2 / `disabled: false` 语法（dump-config 实证）/ 5 docs/m0b 文件均属实；previous task_id 携带清晰 |

## §4 潜在新 finding (G)-(M) 裁决

| # | 裁决 | 依据 |
|---|------|------|
| G yaml 覆盖冲突 | **非问题** | base.yaml 无 `agent-default-model`、3 role 仅 model 块；`--patch` 叠加 base→role 无键冲突（实测 dump-config 合并正确） |
| H plugin profile | **设计备注（不阻塞）** | M0b scope 仅 web profile（A 类任务经 dsh web 跑）；`plugin` 顶层子命令是插件管理器非执行 profile。若 M0c+ 需要非 web profile 再评估 |
| **I .log 后缀碰撞** | **minor polish（唯一新 finding）** | L204 `log_path = args.output.with_suffix(".log")`：若 `--output foo.log` 则 sidecar 与 JSON 同路径，后写的 log 会**覆盖 JSON**。约定用法（DD-1 §3.1.5 示例均 `*.json`）不触发；建议 M0b 实测版加 guard：`if args.output.suffix == ".log": log_path = args.output.with_suffix(".log.log")`（或直接报错拒绝 .log 输出名） |
| J §3.1.5 位置 | **非问题** | §3.1.5 在 §3.1 DONE.md 围栏外、属 DD-1 派工指引；DONE.md 5 段骨架原样，M0b 总报告生成不受影响 |
| K 姿势 C 冗余 | **非问题（有意分层）** | 各 DISPATCH §6.X 姿势 C = 执行者不填的指针；DD-1 §3.1.5 = 汇总者数据来源清单 + 架构判定占位。分工写死，无重复维护面 |
| L tmp/ 跨平台 | **设计备注** | §6.X trace 落点 `tmp/m0b-*.log` 假定 POSIX；M0b 执行者按 v1.0 GA 先例为 Cursor/Codex/真人（macOS/Linux 为主）。Windows 执行时换 `%TEMP%`，不影响守门（tmp/ 本就不入库） |
| M previous task_id | **非问题** | m3 已裁「保留 + notes 携带」，5e698c8 后 cc-ready 链路清晰（T-V1.1-M0B-DISPATCH → T-M0b-SCOPE-FIX） |

## §5 结论 + 后续

- **PASS**。v0.0 → v0.1 → hygiene fix 三段式闭环完成，scope 清单（audit-scope §3）现已可被未来轮次直接复用（14 条验证命令全部与工件一致）。
- 唯一 minor (I) 建议并入 M0b 实测执行者首跑前的顺手修（T-M0b-EXEC 前置 checklist 一行），不另开任务轮次。
- **下一站（不主动走）**：
  1. 架构师 commit 本报告（audit trail，同 fb429e3 模式）
  2. 用户信号 1：配置 `DEEPSEEK_API_KEY`（env，禁 hardcode）
  3. 用户信号 2：明示「Start v1.1 M0b」→ 架构师派发 T-M0b-{BE-1,TG-1,DO-1,QA-1,DD-1} 五任务（执行者 = Cursor Agent / Codex CLI / 真实人类）
  4. H-1 FAIL（≪80%）→ 停线触发「鱼之重新定义」专项（PRD-v1.1 §3 + NORTH-STAR §10 冲突 5）

---

*codex review done — v0.1 正式复审 **PASS**（0C/0M/1 minor polish：.log 碰撞 guard）；F1-F4 验收 4/4；范围 4 文件净；v1.0 runtime 零漂移。*
