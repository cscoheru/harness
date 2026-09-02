# DISPATCH — T-M2-V0.4-PROMPT-SYNC（v0.4 终态 PASS 收尾：prompt 103 全量 + 演进链 + H1 收窄 + hash 回填 + checklist 勾稽）

> **Date**: 2026-09-02
> **来源**: `notes/codex-review-v1.1-m0c-v0.4-formal-report.md` §6 prompt 复审轮（CHANGES REQUIRED 0C/2M/2m）
> **执行者**: CC / 执行端；单 commit + push；**不动 wrapper/ 与 v1.0 runtime**
> **性质**: 纯文本同步轮（无代码改动）；修完即 v0.4 终态 PASS → cc-ready pending #1 兑现 → M3 放行
> **前置**: T-M2-V0.4-HYGIENE-FIX-2 PASS（commit `ed36bd7`）

---

## §1 修复项（5 段同步收口）

### S1 (P-1) prompt 锚定数字全量同步 == 103 + 演进链注记 + H1 命令收窄

- `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md`:
  - L70 §2.(C) `tracked 重锚 post-M2 实测 = 97` → `**103**`（85 + 12 + 4 + 2 = 103；演进链注记：91 预估 → 97 CALIB → 101 FIX-2 自引入 → 103 FIX-2 实测）
  - L96 §2.(G) G5 `tracked 重锚预估 91` → `**103（演进链：91 预估 → 97 CALIB → 101/103 FIX-2）**`
  - L131 §3#4 H1 命令 `docs/reports/T-M2-DD-1-report.md` 移除（实测 2 命中走 §1.5 #43 豁免，与 L131-133 注记自相矛盾）；H1 命令收窄为 `CHANGELOG.md README.md`，期望 == 0
  - L135-137 §3#4 `tracked 锚定 == 97 / 43 文件` → `**== 103 / 45 文件**` + 公式 85 + 12 + 4 + 2 = 103
  - L219 §8 (C) `tracked 锚定 == 91` → `**tracked 锚定 == 103**`
  - L369 §8 (C) `tracked 锚定 == 91` → `**tracked 锚定 == 103**`

### S2 (P-2) C5 placeholder 回填真实 hash + 行号证据教训

- `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md`:
  - L295 §5.3 `[TBD: GATE-CALIB commit hash 待本轮提交后回填]` → `277cdf8 (T-M2-V0.4-GATE-CALIB)`
  - L301 §5.3 修订日志 `[TBD: GATE-CALIB commit hash]` → `277cdf8 (GATE-CALIB) → ed36bd7 (FIX-2 → PROMPT-SYNC)`
  - §5.3 末尾新增教训段："**先跑后写铁律第三次失守教训（2026-09-02 立）**：commit message 声明「已回填/已验证」类必须附行号证据（如 L295/L301），否则被 Codex 复审检出 P-2（f666e47 grep=0 实测 4 → M-C 「期望值经验证」 → C5「placeholder 已回填」三次同型失守）"

### S3 (P-4) §8 checklist 9 项勾稽 + 判定栏 + findings 表填写

- `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md`:
  - §8 (A)-(I) 9 项全部 `[x]` 勾上（precommit 轮 Cursor 模拟视角，所有 8 项 hygiene 已 PASS）
  - 判定栏：`☑ PASS`（FIX-2 + PROMPT-SYNC 后 v0.4 终态）
  - findings 表填写 P-1/P-2/P-4/P-5 复审闭环（修法列引用本 DISPATCH §1）

### S4 (P-5) audit-scope §1 期望 101 → 103 收口 + 公式增 #47

- `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md`:
  - L20 §1 `期望: == 101` → `== 103（85 + 12 + 4 + 2 = 103；45 文件）`
  - L21 §1 公式 `v0.3 tracked (85) + M2 实施报告群 12 行 + #46 GATE-CALIB exec 4 = 101` → `+ #46 GATE-CALIB exec 4 + #47 HYGIENE-FIX-2 exec 自引入 2 = 103`
  - L25 §1 disk `≥ 101` → `≥ 103`
  - L34 §1.5 heading `tracked 重锚 post-M2 = 101，实测 44 文件 101 行` → `= 103，实测 45 文件 103 行（2026-09-02 FIX-2 后实测）`
  - L36 §1.5 `总锚定 tracked 重锚 post-M2 实测 = 101（85 + 12 + 4 = 101；44 文件）` → `= 103（85 + 12 + 4 + 2 = 103；45 文件；M2 起草 6 已在 85 内含不重复计）`
  - L48 §1.5 docs 主表 `44 文件 101 行` → `45 文件 103 行`
  - L74 §1.5 #46 行加注："#46 已 commit 277cdf8；#47 已 commit ed36bd7"
  - L76 §1.5 总计 `44 文件 101 行 ... 85 + 12 + 4 = 101` → `45 文件 103 行 ... 85 + 12 + 4 + 2 = 103`
  - L78-83 公式 `85 + 12 + 4 = 101` → `85 + 12 + 4 + 2 = 103`
  - L228 §6 `= 0 ✓` / §6 (C) `tracked 重锚 == 97` → `== 103`
  - L236 §6 (锚定口径) `tracked 重锚 post-M2 = 101 ... 85 + M2 实施报告群 12 + GATE-CALIB exec 4 = 101` → `= 103 ... + FIX-2 exec 2 = 103`
  - L260 footer `预估 103` → `实测 103（2026-09-02 FIX-2 后实测）`

### S5 #48 自引入预演（PROMPT-SYNC exec）

- 本执行书 §2 验收命令含 grep 字面 → 自引入命中按 §1.5 即时列注 **#48**
- **预计 #48 命中 = 3**：本 DISPATCH §2 (a) `grep -cE "Fable 5..."` 字面 ×1 + (b) `grep -rE "Fable 5..." ` 字面 ×1 + (c) `grep -rE "Fable 5..." CHANGELOG.md README.md` 字面 ×1（H1 收窄后命令同步）
- 终态锚定：**103 + 3 = 106 / 47 文件**（实测以 commit 后为准）

---

## §2 验收（verbatim）

```bash
# 1. prompt 锚定数字全量同步 == 103（演进链：91 预估 → 97 CALIB → 101 FIX-2 → 103 PROMPT-SYNC）
grep -c "103" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md          # ≥ 5（§2.C + §2.G + §3#4 + §8.C ×2）
grep -c "91" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md            # 仅保留演进链注记（不再为期望值）
grep -c "97" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md            # 仅保留演进链注记

# 2. H1 命令收窄（移除 DD-1 报告，与 L131-133 注记自洽）
grep "Fable 5\|GLM 5.3\|MiniMax-M3" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md | grep -E "CHANGELOG\.md README\.md docs/reports" | wc -l   # == 0（DD-1 报告已移除）

# 3. hash 回填（277cdf8 GATE-CALIB + ed36bd7 FIX-2 + 本 PROMPT-SYNC commit）
grep -c "277cdf8" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md       # ≥ 1
grep -c "ed36bd7" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md        # ≥ 1

# 4. checklist 勾稽（9 项全部 [x]）
grep -c "^- \[x\]" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md       # == 9

# 5. audit-scope §1 期望同步 == 103
grep -c "== 103" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md                # ≥ 3（§1 + §1.5 + §6）

# 6. tracked 锚定三源同值
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'   # == 103 + 本 DISPATCH 自引入（预计 3 = 106；实测以 commit 后为准）

# 7. 前向交付物不锁型号守门（PROMPT-SYNC 不改 CHANGELOG/README/DD-1 报告，仅 audit-scope + prompt）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md | wc -l                                                                          # == 0
cd wrapper && ./node_modules/.bin/tsc --noEmit; echo $?                                                                                       # 0（项目本地 bin；PROMPT-SYNC 不动 wrapper/）
git status --porcelain | wc -l                                                                                                                  # == 0（commit 后）
```

---

## §3 完成后

commit + push → cc-ready 翻牌 `T-M2-V0.4-PROMPT-SYNC-PASS` → **v0.4 终态 PASS 归档**（cc-ready pending 信号 #1 兑现）→ M3 放行等 user「Start v1.1 M3」+ 6 host 真部署 E2E。

---

*Co-Authored-By: Claude Code*
