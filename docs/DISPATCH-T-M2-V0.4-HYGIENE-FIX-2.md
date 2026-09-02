# DISPATCH — T-M2-V0.4-HYGIENE-FIX-2（v0.4 复审轮收尾：锚定 101 三源 + IP 白名单注记）

> **Date**: 2026-09-02
> **来源**: `notes/codex-review-v1.1-m0c-v0.4-formal-report.md` §5（复审轮 0C/1M/1m）
> **执行者**: CC / 执行端（user 裁定后）；单 commit + push；**不动 wrapper/ 与 v1.0 runtime**
> **性质**: 纯锚定/注记文本收尾；修完即 v0.4 终态 PASS → M3 GA final 放行

---

## §1 修复项

### F1 (F-1) 锚定三源 97 → 101
- `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md` §1：期望 `== 97` → `== 101`（构成：97 + `#46` GATE-CALIB 执行书 §3 pattern 字面 4）；「43 文件 97 行」×5 处 → 「**44 文件 101 行（实测 == 101）**」
- §1.5 主表补 **#46 T-M2-V0.4-GATE-CALIB 执行书 4 行**（修复自引入，per v0.3 #39 即时入列先例）
- **注意**：本 FIX-2 执行书 §2 验收含 pattern 字面 → 自引入命中按同协议即时列注 **#47**（预计 +2；commit 后实测定值，三源同值以实测为准）
- `docs/poll/cc-ready.json` notes 与 M2 DD-1 报告 cross-ref 若含「97」同步 101

### F2 (F-2) §4.5 IP 白名单注记落合同
- audit-scope §4.5 加注：「白名单：RFC1918/回环网段**说明文案**豁免（CHANGELOG.md L326 `10.0.0.0/8` 等）——守门期望：源码 0 + 白名单说明 1（实测 = 1 全为 CHANGELOG L326）」

### F3 教训记档（第八次锚定事故）
- audit-scope 尾段加：「教训（v0.4）：修复 commit 自带的执行书/报告含 grep pattern 字面 → **commit 前必须预演自引入增量**（#39/#46 先例），锚定期望值以 post-commit 实测为准」

## §2 验收（verbatim）

```bash
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'   # == 实测 N（101 + 本执行书自引入，commit 前先跑预演）
grep -c "44 文件 101 行" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md              # ≥ 1（若 FIX-2 自引入推高则同步为终值）
grep -cE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md | grep -v 127.0.0.1 >/dev/null; grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md | grep -v "127.0.0.1" | wc -l   # == 1（CHANGELOG L326 白名单）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md | wc -l                    # == 0
cd wrapper && ./node_modules/.bin/tsc --noEmit; echo $?                                 # 0（本地 bin；禁 npx——见复审报告 §5.3）
./node_modules/.bin/vitest run 2>&1 | grep -E 'Tests '                                 # 0 failed
git status --porcelain | wc -l                                                         # == 0（commit 后）
```

## §3 完成后

commit + push → cc-ready 注记 HYGIENE-FIX-2 PASS → Codex v0.4 终态 PASS 归档（formal 报告 §5.4 勾稽）→ **M3 阶段 GA final 准备**（v0.5 audit-scope 起草纪律：audit-scope 先行 + commit 后立即复审 + 自引入预演入列）。

---
*Co-Authored-By: Claude Code*
