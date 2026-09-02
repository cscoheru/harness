# DISPATCH — T-M2-V0.4-GATE-CALIB（三守门 pattern 校准 + 锚定 97 三源 + README 交付缺口）

> **Date**: 2026-09-02
> **来源**: `notes/codex-review-v1.1-m0c-v0.4-formal-report.md`（v0.4 formal 首审 CHANGES REQUIRED 0C/4M/3m）
> **执行者**: M2 执行端 / CC（user 裁定后执行）；单 commit + push
> **铁律**: 守门期望值 = 合同级变更 → 校准说明必须逐处记入 audit-scope §4.5-§4.7；gate 声明先跑后写；锚定三源同值；不动 v1.0 runtime

---

## §1 任务定义

修复 v0.4 formal 首审 4M/3m：三守门 pattern 五处校准 + 重测全绿，锚定三源统一 97，README 两处交付缺口，tsc/vitest 复跑收口。

## §2 修复项

### C1 (M-A) README:342 前向字面 → 引用式
守门对照表 G1 行 pattern 字面改为「per NORTH-STAR A-4 pattern（见 audit-scope v0.4 §1）」；改后 `grep -E 'Fable 5|GLM 5.3|MiniMax-M3' CHANGELOG.md README.md` == 0

### C2 (M-B) 锚定三源 == 97
- audit-scope v0.4 §1 期望 91 → **97**；构成行更正为「85（v0.3 post-commit，已含 M2 DISPATCH #34-38）+ M2 实施报告群 12 = 97」；删除「85 + M2 5 DISPATCH 6 = 91」重复计数公式
- §1.5 主表补 **#40-#45**（#40 BE-1 rep 3 / #41 TG-1 rep 2 / #42 DO-1 rep 2 / #43 DD-1 rep 2 / #44 QA-1 rep 1 / #45 QA-1 test-plan 2）→ 合计 **43 文件 97 行（实测 == 97）**
- §1.5 表 #3（DD-1 报告）「4 命中」→「2 命中（实测）」；prompt §2(C)/§8 checklist 同步 == 97

### C3 (M-C) 三守门 pattern 五处校准（记入 audit-scope 各节 + 校准说明）
1. §4.5 IP 命令范围：`wrapper/ deploy/ ...` → `wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md`（排除 node_modules；期望 0 + compose IPAM/subnet 白名单注记）
2. §4.6 tmp：范围追加排除 `wrapper/test/`（守护测试断言自伤豁免；期望 0 保持）
3. §4.6 whisper：pattern 排除 `${`（env-inject 占位符；期望 0 保持）
4. §4.7 公钥期望：`≥ 1` → `== 0（env-inject-only，较"可入 commit"更严）`
5. 三节「期望值经验证」表述改为附 verbatim 实测输出（校准后重测日期 + 数值）

### C4 (M-D) README M2 段 Funnel 表补 5 边缘 host URL 行（源：deploy/tailscale-funnel-6host.yaml / M2-DEPLOY-GUIDE）；补后 README ts.net host 数 == 6

### C5 (m) DD-1 报告 §5 声明改口径（2 处自伤走 §1.5 #43）；CHANGELOG M2 段 26 项逐项 verbatim 计数核对（8/4/5/6/3）记入执行书；prompt §5 [COMMIT_HASH_PLACEHOLDER] 回填

### C6 gate 必跑收口
`npx tsc --noEmit` exit 0 + `npx vitest run` 0 failed（沿用 RUN_DSH_REAL/DEEPSEEK_API_KEY 双守卫跳过 + testTimeout 30000）——输出贴执行书

## §3 验收（verbatim，全绿才算收口）

```bash
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md | wc -l                    # == 0（C1 README:342 改引用式后）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md docs/reports/T-M2-DD-1-report.md | wc -l   # == 3（README L342 已修 → 0；DD-1 报告 L106/L233 自伤 2 走 §1.5 #43 豁免）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'   # == 97（C2 锚定 97 三源同值）
grep -c "43 文件 97 行" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md              # ≥ 1
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md | grep -v "127.0.0.1" | wc -l   # ≤ 1（业务源码 0；compose IPAM subnet 白名单合例 1）
grep -rE '/tmp/audio|/var/tmp/audio' wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l   # == 0（wrapper/test/ 守护测试自伤 3 行走 §1.5 豁免）
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l                  # == 0（`${WHISPER_MODEL_PATH}` env-inject 占位符合规）
grep -rE "vapid_(private|public)_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_(PRIVATE|PUBLIC)\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l   # == 0（公钥亦 env-inject-only；私钥严格 env-inject）
grep -oE 'https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net' README.md | sort -u | wc -l         # == 6（H5 pattern 修 `[a-z][a-z0-9-]*` 允许数字；README 实测 6 unique host）
npx tsc --noEmit; echo $?                                                              # 0
npx vitest run 2>&1 | grep -E 'Tests '                                                  # 0 failed
```

**CHANGELOG M2 段 26 项 verbatim 计数核对**（m-2 fix / 2026-09-02）：
```
Added: 8 项（6 host / STT / Web Push / dsh 6 host / capability JSON 3 SKU / 6 Funnel URL / 6 Funnel E2E / VAPID public key）
Changed: 4 项（plan v0.2→v0.3 / audit-scope v0.2→v0.3 / README v1.1 M2 / 6host-compose.newvps.yml）
Gates Passed: 5 项（M2 BE-1 / TG-1 / DO-1 / QA-1 / Codex formal v0.4）
Hygiene: 6 项（v1.0 不漂移 / 不锁型号 / 不硬编码 API key / M2 多 host 守门启用 / M2 STT 守门启用 / M2 Web Push 守门启用）
Notes: 3 项（v0.4 升级门槛 / M3 阶段准备 / 6 Funnel 延迟）
TOTAL: 8+4+5+6+3 = 26 项 ✅
```

## §4 完成后

commit + push → cc-ready 注记 GATE-CALIB PASS → v0.4 复审转 PASS → M3 阶段 GA final 准备（新 audit-scope v0.5 起草纪律：audit-scope 先行 + commit 后立即复审）。若 DO-1 working tree 3 文件先收口，锚定按 §1.5 即时入列协议重测（97 + 增量）。

---
*Co-Authored-By: Claude Code*
