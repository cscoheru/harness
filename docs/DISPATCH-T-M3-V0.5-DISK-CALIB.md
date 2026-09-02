# DISPATCH — T-M3-V0.5-DISK-CALIB（disk 口径三源校准 + 演进链归属修正）

> **Date**: 2026-09-02
> **来源**: `notes/codex-review-v1.1-m0c-v0.5-formal-report.md`（v0.5 formal 首审 0C/1M/2m）
> **执行者**: CC / M3 执行端（可随 M3 EXEC 首个 docs commit 捎带归档）；只动 `notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md`；不动 wrapper/ 与 v1.0 runtime
> **性质**: 纯 notes 文本级轻量收口；修完 v0.5 复审转 PASS

---

## §1 修复项

### D1 (V-A) disk 口径三源同值 == 124
- §1 disk 期望行：`≥ 128（…+ v0.5 prompt 6 = 128）` → `== 124（实测为准；范围即本命令明文：docs/ + adr/ + spec/ + 本 audit-scope 单文件；公式 = tracked 117（git add DISK-CALIB.md 后 = 114 + 3）+ 本文件自伤实测 7 = 124；DISK-CALIB.md 在 docs/ 下被 §1 命令范围包含故计入 disk；Codex 报告 120 漏数 §6 :207 一行已修正）`
- §1.5 主表 disk 行：`51 文件 128 行 disk` → `50 文件 124 行 disk（= 49 tracked 文件含 DISK-CALIB.md + 本 audit-scope 7 自伤实测；prompt 不在 §1 disk 命令范围；git add 后三源同值）`
- #50 行自伤计数：`6 行` → `7 行（实测：§1 grep 命令字面 ×4 + §1.5 tracked+disk 验收命令字面 ×2 + §6 v0.5 升级前向交付物 grep 字面 ×1 = 7 行；Codex 实测 6 漏数 §6 一行已修正）`
- 机制条款：disk 口径纳入「命令 == 期望 == 主表」三源同值 + 权威源单点（与 tracked 同法，v0.4 §7.3 ② 延伸）；新口径启用前先跑命令再写期望 + 公式只计命令范围内文件 + 全文 grep 字面去重要跨节

### D2 (V-B) 演进链归属修正
- 演进链与主表继承行：`108 v0.4 终态实测` → `107 v0.4 终态实测（a1f8e82 post-commit Codex 实测）→ 114 v0.5 = 107 + #49 DISPATCH-T-M3 6 + cc-ready flip 1（flip 引入行归 #49 批次）`
- 主表 #1-#48 行「47 文件 108 行（107 + 1 历史漂移）」→「47 文件 107 行」

### D3 教训记档（第十次·disk 变体）
- audit-scope §7 追加：「disk 口径首用四方裂（124 实测/122 越界公式/126 message/128 主表；Codex 报告 120 漏数 §6 一行 + DISK-CALIB.md untracked 计入问题）——新口径启用前必须先跑命令再写期望，且公式只计命令范围内文件（prompt 越界计入是本轮病灶之一）+ 全文 grep pattern 字面实测去重要跨节（per audit-scope #50 7 行实测）+ untracked 文件若在 docs/ 下也会被 §1 命令范围包含（DISK-CALIB.md 即此类）——DISK-CALIB 实测修正 disk == 124」

## §2 验收（verbatim）

```bash
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md | wc -l   # == 124 == 期望 == 主表 disk 行（git add DISK-CALIB.md 后三源同值；DISK-CALIB.md 在 docs/ 下被 §1 命令范围包含）
grep -c "== 124" notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md                # ≥ 2
grep -c "50 文件 124 行" notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md        # ≥ 1
grep -c "128 行 disk\|121 行 disk\|120 行 disk" notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md                # == 0
grep -c "7 行实测\|7 自伤实测" notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md  # ≥ 2
grep -c "107 v0.4 终态" notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md         # ≥ 1
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'   # == 117（DISK-CALIB.md git add 后 = 114 + 3；DISK-CALIB.md 未 add 时 == 114）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md | wc -l               # == 0
cd wrapper && ./node_modules/.bin/tsc --noEmit; echo $?                             # 0
./node_modules/.bin/vitest run 2>&1 | grep -E 'Tests '                             # 0 failed
```

## §3 完成后

归档 commit（message 附 disk 124 / tracked 117 双实测数 per hard rule (d)，DISK-CALIB.md git add 后）→ Codex v0.5 复审转 PASS → M3 GA final 继续（v1.1.0 tag + 路径 A/B user 决策 + 5 edge host 缺口挂账）。

---
*Co-Authored-By: Claude Code*
