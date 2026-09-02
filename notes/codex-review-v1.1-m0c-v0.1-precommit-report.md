# Codex 审验报告 — v1.1 M0c v0.1 升级 8 文件改动（pre-commit 轮）

> **Date**: 2026-09-02
> **Reviewer**: Codex（gpt-5.6-sol 风格，xhigh；per `notes/codex-audit-scope-v1.1-m0c-v0.1-prompt.md` §7 checklist）
> **审验对象**: working tree 8 文件（2 M + 6 NEW；commit 未生成；HEAD = `5b3d263`）+ prompt + audit-scope 两份 notes
> **判定**: **CHANGES REQUIRED** — 0 critical / **1 major / 3 minor**；实质内容健康，验证命令期望值与仓库现实矛盾，修后可 commit
> **签发**: `docs/DISPATCH-T-M0c-V0.1-PRECOMMIT-FIX.md`（已派）

---

## §1 通过项（§3 矩阵 + §7 checklist verbatim 实跑）

| 检查 | 命令/证据 | 实测 | 判定 |
|------|-----------|------|------|
| A1 v0.1 计数 | `grep -c "v0.1" plan` | 30 ≥ 10 | ✅ |
| A2 M0c 引用 | `grep -c "T-M0c-" plan` | 11 ≥ 5 | ✅ |
| A3 done 证据 | `grep -c "commit 5b3d263\|M0b.*done\|✅.*done"` | 10 ≥ 5 | ✅ |
| A4 ADR 0010 | grep 计数 | 12 ≥ 1 | ✅ |
| B/C 5 DISPATCH | 存在 + 各含 §1 任务定义 | 5/5 = 1 | ✅ |
| D1 不锁型号（8 文件内） | grep 三型号 | **0** | ✅ |
| E key 不泄漏（GH013 教训） | `sk-[a-z0-9]{32,}` 8 文件 + 全仓 md/json/yaml | **0 / 0** | ✅ |
| F1 v1.0 runtime | `git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml` | **0 行** | ✅ |
| F2 v1.0 文档 | 修正 pathspec（'adr/000[1-9]-*.md' + v1.0-ga-team-plan.md） | **0 行** | ✅ |
| G jq | task_id==T-M0c-DISPATCH / files_modified==7 | true / true | ✅ |
| §10.1 | L283-297 十项 checkbox | **10/10 [x]** | ✅ |
| §10.2/§10.3 | L298/L314 三级门槛递进 | 存在，未勾 = 未来门槛（合理） | ✅ |
| H 五文件在 | M0b-DONE / ADR 0010(Accepted) / m0b v0.1 报告 / 两个 audit-scope | 全在 | ✅ |
| spec/capabilities 4 SKU | ls | orch/commander/worker/newvps_ram | ✅ |
| M0b 11-commit 链 | git log 对账 | 链上 hash 全部存在且顺序正确 | ✅（计数见 m1） |

## §2 Findings

### M1 (major) 守门 grep 范围扩全 docs/ 期望 0 —— 与仓库现实（39 处合法命中）矛盾，且违反 M0b plan C2 裁定
- **位置**: `notes/codex-audit-scope-v1.1-m0c-v0.1.md` §1；`notes/codex-audit-scope-v1.1-m0c-v0.1-prompt.md` §3-D2 + §2(A) 末条；`docs/v1.1-ga-team-plan.md` §10.1 第 9 check（L291）
- **实测**: `grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ | wc -l` = **39 ≠ 0**
- **39 处分布与定性**（全部为历史/合法，非新增违规）：① 守门字面自伤（M0b plan §3 L94/L353 + M0b DISPATCH §8 验证命令 L310/L186 等）；② 叙述性/规则性引用（M0b plan L89 明文裁定「DISPATCH 文档允许叙述性引用模型名」；VISION-v1.0-supplement 12 处 = v0.x before-record；ARCHITECT-REVIEW 2 / PRD-V0.1-NORTH-STAR 1 / PRD-v1.1 1 / DOCS-REVIEW 1）；③ `Co-Authored-By: Claude Fable 5` 署名尾注（REVIEW-T-DD-6 L121、M0b DISPATCH 报告尾注，不可也不应清除）。涉及 12 文件：VISION 12 / M0b-plan 5 / M0b-DISPATCH 14 / 历史评审+PRD 8。
- **后果**: 若按现稿 commit，Codex 复审 verbatim 跑 D2 必 FAIL，触发无谓返工轮。
- **修法**: 守门范围收窄为前向交付物 = `docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-*.md`（本报告实测 = **0**，维持 M0b plan §1.4 C2 fix 裁定口径）；audit-scope §1 增补「历史文档豁免清单」段（上述 12 文件 39 处三类定性，口供 = M0b plan L89 裁定）；plan L291 + prompt §3-D2/§2(A) 同步。**不清洗历史文档**（考古记录 + git 尾注保留）。

### m1 (minor) 「11 commits 链」off-by-one
- plan §0 L5 列 **12 个 hash**（9f5ef4b→…→2b0953a→**5b3d263**）却标「11 commits 链」；§9 L272、§10.1 L286 同句式；cc-ready notes(1) 列 11 个 hash（缺 5b3d263）。实际 `git log` = 12 commits。
- **修法**: plan 三处 + cc-ready notes(1) 统一为「12 commits 链」并补全 hash 列表（含 5b3d263）。

### m3 (minor) 行数声明失真（将随 commit 入库 → 必修）
- cc-ready `files_modified` L9-L13 声明 113/110/117/105/108 行，实测 **BE-1=100 / TG-1=113 / DO-1=148 / QA-1=118 / DD-1=118**（DO-1 偏差 +31 行 = 26%）；prompt §1.2 同源同错（含 audit-scope ~110 vs 实测 74）。
- **修法**: 两处表按 `wc -l` 实测值改正。
- 附带（仅 prompt，本地 notes）: §3 L145 pathspec `adr/0001-0009.md` 无效（匹配空集假通过；应为 `'adr/000[1-9]-*.md'`，本报告已按修正版复跑 = 0）。

### m2 (minor, user-decision) 孤儿文件 `v1.0-runtime-integration-roadmap.md`
- 根目录 untracked 440 行 = M0b BE-1 调研产物；cc-ready L33 已如实记录「cleanup hole 待 user 决定」→ **不阻塞、不入 v0.1 commit（保持 7 文件口径）**。建议 user 裁决归档位（`docs/m0b/` 存档 or 删除；M0c BE-1/TG-1 若需引用再定）。

## §3 结论与签发

- 实质内容（plan v0.1 写实、5 任务书、ADR 0010 enforcement、M0b 证据链、双零守门）**全部健康**；唯一阻塞 = M1 验证口径设计错误 + 两处事实失真（m1/m3）。
- **签发 `T-M0c-V0.1-PRECOMMIT-FIX`**（CC 执行）：修 M1+m1+m3 → cc-ready task_id 回 `T-M0c-DISPATCH` → 方案 A 单 commit 7 文件 + push（Clash proxy）→ 用户亲提 Codex 正式复审（prompt 修订稿）。
- m2 等 user 裁决；通过后 M0c 等 user 「Start v1.1 M0c」再派实施（不自动走）。

---

*codex review done — pre-commit 轮 CHANGES REQUIRED（1M/3m：守门范围设计错误必返工 + 计数/行数失真 + 孤儿文件待裁）；矩阵 15 项过、双零守门守住；修复签发 T-M0c-V0.1-PRECOMMIT-FIX。*
