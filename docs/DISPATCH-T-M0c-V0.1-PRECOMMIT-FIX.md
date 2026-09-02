# DISPATCH — T-M0c-V0.1-PRECOMMIT-FIX（v0.1 升级 commit 前置修复 + 签发下一枪）

> **Date**: 2026-09-02
> **来源**: `notes/codex-review-v1.1-m0c-v0.1-precommit-report.md`（Codex pre-commit 轮 CHANGES REQUIRED: 1M/3m）
> **执行者**: CC（Cursor）；**单 commit 修复 + 单 commit v0.1 升级 + push 授权**
> **铁律**: Claude 不亲提 Codex；DEEPSEEK_API_KEY 仅 env-inject（GH013）；不动 v1.0 runtime（ADR 0010 Decision d）

---

## §1 任务定义

修复 pre-commit 轮 findings（M1 + m1 + m3），随后按 `notes/codex-audit-scope-v1.1-m0c-v0.1-prompt.md` §5.1 **方案 A** 完成 v0.1 升级单 commit + push。m2（孤儿 roadmap）**不在本任务**（等 user 裁决）。

## §2 修复项

### M1 守门 grep 范围收窄（1 major）
1. `notes/codex-audit-scope-v1.1-m0c-v0.1.md` §1：范围 `docs/ adr/ spec/capabilities/` → **前向交付物口径**：
   `grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-*.md | wc -l` 期望 0（实测已 0）
2. 同文件 §1 末增补「历史文档豁免清单」段：12 文件 39 处三类定性（守门字面自伤 / 叙述性引用 per M0b plan L89 C2 裁定 / Co-Authored-By 尾注），命令 `grep -rE ... docs/ adr/ spec/capabilities/ | wc -l` 期望 **39**（豁免口径锚定）；**不清洗历史文档**
3. `docs/v1.1-ga-team-plan.md` §10.1 第 9 check（L291）grep 范围描述同步收窄
4. `notes/codex-audit-scope-v1.1-m0c-v0.1-prompt.md` §3-D2 两命令 + §2(A) 末条同步（含 L145 pathspec 改 `'adr/000[1-9]-*.md'`）

### m1 计数统一（1 minor）
`docs/v1.1-ga-team-plan.md` L5 / L272 / L286「11 commits 链」→「**12 commits 链**」（hash 列表已含 5b3d263，保持 12 个）；cc-ready notes(1) hash 列表补 5b3d263 → 12。

### m3 行数校正（1 minor，入库事实）
cc-ready `files_modified` L9-L13 与 prompt §1.2 表按实测改：**BE-1=100 / TG-1=113 / DO-1=148 / QA-1=118 / DD-1=118 / audit-scope=74**（`wc -l` 为准）。

## §3 提交流程（方案 A，修复后）

1. cc-ready.json `task_id` 回 `T-M0c-DISPATCH`、`commit` 字段填 v0.1 升级 commit 号占位说明
2. `git add` 7 文件（v1.1-ga-team-plan.md + 5×DISPATCH-T-M0c-*.md + docs/poll/cc-ready.json）
3. 单 commit（message 按 prompt §5.1 方案 A 全文；Co-Authored-By: Claude Code）
4. 归档 commit：`git add docs/DISPATCH-T-M0c-V0.1-PRECOMMIT-FIX.md notes/codex-review-v1.1-m0c-v0.1-precommit-report.md notes/codex-audit-scope-v1.1-m0c-v0.1{,-prompt}.md` → `chore(m0c): T-M0c-V0.1-PRECOMMIT-FIX 修复 + audit trail`
5. push（Clash proxy：`git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin main`）；GH013 拦截则 amend 后重推

## §4 验收命令（verbatim，全过才完）

```bash
# 1. 守门收窄版 == 0（不含 DISPATCH-T-M0c-V0.1-PRECOMMIT-FIX.md 自身，归档 commit 不入主合同；详见 audit-scope §1.5 行 3）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ spec/capabilities/ adr/ docs/poll/ docs/v1.1-ga-team-plan.md docs/DISPATCH-T-M0c-BE-1.md docs/DISPATCH-T-M0c-TG-1.md docs/DISPATCH-T-M0c-DO-1.md docs/DISPATCH-T-M0c-QA-1.md docs/DISPATCH-T-M0c-DD-1.md | wc -l   # == 0
# 2. 豁免口径锚定 == 42（含本执行书 3 行 by-design 自伤豁免；详见 audit-scope §1.5 清单 13 文件）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ | wc -l   # == 42
# 3. 计数统一
grep -c "12 commits 链" docs/v1.1-ga-team-plan.md        # == 3
grep -c "11 commits 链" docs/v1.1-ga-team-plan.md        # == 0
grep -c "5b3d263" docs/poll/cc-ready.json                # ≥ 2
# 4. cc-ready 状态 + 行数
jq -e '.task_id == "T-M0c-DISPATCH"' docs/poll/cc-ready.json        # true
jq -e '.files_modified | length == 7' docs/poll/cc-ready.json       # true
jq -r '.files_modified[]' docs/poll/cc-ready.json | grep -cE "100 行|148 行|118 行"  # == 4
# 5. commit 结构
git show --stat HEAD~1 | grep -c "DISPATCH-T-M0c\|v1.1-ga-team-plan\|cc-ready"       # == 7
git log --oneline -2 | grep -c "PRECOMMIT-FIX\|v0.1 升级"                            # == 2
# 6. 双零守门
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l  # == 0
grep -rE "sk-[a-z0-9]{32,}" docs/ wrapper/ deploy/ 2>/dev/null | wc -l               # == 0
```

## §5 完成后（不自动走）

push 成功 + 验收 6/6 → 通知用户亲提 Codex 正式复审（修订后 prompt → `notes/codex-review-v1.1-m0c-v0.1-report.md`）；PASS 后等 user 「Start v1.1 M0c」派实施（PRD-v1.1 §4.6 第 3 条）。m2 孤儿 roadmap 同场请 user 裁决。
