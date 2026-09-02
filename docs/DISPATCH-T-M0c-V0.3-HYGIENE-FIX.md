# DISPATCH — T-M0c-V0.3-HYGIENE-FIX（v0.3 锚定三源统一 + 文档自洽，与 M2 并行）

> **Date**: 2026-09-02
> **来源**: `notes/codex-review-v1.1-m0c-v0.3-formal-report.md`（v0.3 终审 CHANGES REQUIRED 0C/1M/3m）
> **执行者**: CC；**单 commit + push**；**不翻 cc-ready**（`T-M2-EXEC` 为 M2 执行端占用）；**不碰 wrapper/ 与任何 M2 交付物**
> **铁律**: 不动 v1.0 runtime；gate 声明先跑后写；锚定「命令==清单==期望」三源同值

---

## §1 任务定义

修复 v0.3 终审残留（M1 + m1-m3），全部 notes/plan 文本级，与 M2 实施并行互不干扰。

## §2 修复项

### H1 (M1) 锚定三源统一 == 83
1. `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` §1 L18-24：锚定命令期望 `== 71` → `== 83`（两处）
2. 同文件 §1.5：主表即补 `#34-38`（M2 5 DISPATCH §Author/§Co-Authored-By check 共 6 行，**不等 v0.4**）；合计行改「**36 文件 83 行（实测 == 83）**」；删除「下版 v0.4 #34-38 补入」表述；纠「31 文件 79 行」笔误
3. `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md` §3-D：命令范围收窄为 `CHANGELOG.md README.md`（期望 0，实测 0）+ 加注「DD-1 报告 4 处（§Author/守门描述/命令字面/反向引用）走 audit-scope §1.5 #33 豁免」；§2(C) 同步

### H2 (m1) plan 刷新
`docs/v1.1-ga-team-plan.md` L3 Status 行：去「commit pending」滞后表述 → v0.3 已升（f666e47）+ M2 STARTED（fcd54f0，user 三连）；§9 修订日志补 v0.3 行（13 文件摘要 + Funnel E2E 数据 + M2 起草追认）

### H3 (m2) prompt §1.3 链误标
「M1c 实施已 commit」列表更正：b768097/d168217/23f976e/6ea2fae/7a94ade/3efe7dc = **M0c 收口**；补 M1c 实施链（c4a9192 EXEC + 200ded1/5171753/cdd8449/5543604 + 4 merges 39e6e54/b1477dd/b16cb19/19cade6 + GATE-REPAIR/2）

### H4 (m3) 教训记档
audit-scope 末段加一行：「教训（v0.3）：commit message 内 gate 声明必须先跑后写——f666e47 声明 grep=0 实测 4（DD-1 自伤），以 §1.5 追认收口」

## §3 提交

单 commit：`docs(v1.1): T-M0c-V0.3-HYGIENE-FIX — 锚定三源 83 + plan 刷新 + 链误标修正`（2 audit-scope + prompt + plan + 本执行书 + 终审报告归档）→ Clash proxy push。**cc-ready 不动。**

## §4 验收（verbatim）

```bash
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'   # == 85（83 + 本执行书 §4 自引入 2，per audit-scope §1.5 #39 即时入列）
grep -c "== 85" notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md                    # ≥ 2
grep -c "37 文件 85 行" notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md            # ≥ 1
grep -c "下版 v0.4" notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md                # == 0
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md | wc -l                  # == 0
jq -r '.task_id' docs/poll/cc-ready.json                                              # T-M2-EXEC（未动）
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l   # == 0
grep -rE "sk-[a-z0-9]{32,}" docs/ wrapper/ deploy/ CHANGELOG.md README.md 2>/dev/null | wc -l   # == 0
git status --porcelain | wc -l                                                        # == 0
```

## §5 完成后（不自动走）

归档即完；M2 执行端照常（T-M2-{BE-1,TG-1,DO-1,QA-1,DD-1} 五任务 → M2 Exit Gate → v0.4 audit-scope 启用 §4.5/§4.6/§4.7 三守门）。若 M2 实施引入新 docs 命中 → v0.4 §1.5 按 tracked 重锚协议即时补列（不再推下版）。
