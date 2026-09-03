# Codex 复审报告 — v1.1.1 v0.7 audit-scope + prompt 起草双文件（pre-commit 轮，发现+同轮收口一体）

> **Date**: 2026-09-03
> **Reviewer**: Codex（gpt-5.6-sol 风格，xhigh）
> **审验对象**: `notes/codex-audit-scope-v1.1.1-v0.7-precommit.md`（445→462 行）+ `notes/codex-audit-scope-v1.1.1-v0.7-precommit-prompt.md`（206→215 行）——**双文件 untracked 起草态**（hard rule (a)「先行起草」时序首次完全正确：实施 commit 1-4 前审合同本身）
> **判定**: **起草收口 PASS（0C/4M/4m → 同轮全修 → 修正版全绿）**——B 类守门（§4.5.7/§4.7.6/§4.8/§4.9）起草态预期红，实施后转绿，不计 findings
> **基线**: HEAD = `3323387`；`v1.1.0` tag 已打（GA 达成）；cc-ready 未翻牌（`T-M3-EXEC-PASS`，待 commit 4）

---

## §1 通过项（verbatim 实跑，起草态即绿 = A 类）

| 检查 | 实测 | 判定 |
|------|------|------|
| §1 前向 8 文件不锁型号 | **0**（NEW 文件 NOT-EXIST stderr 属预期） | ✅ |
| **tracked / disk / 自伤三源** | **117 / 126 / 9** —— 起草者实测前置达标（v0.6 W-A 教训内化：期望全带实测值，无占位） | ✅ |
| §2 sk- / tskey- / VAPID 赋值式 | 0 / 0 / 0（Tailscale auth key 新守门 §2.6 立得好） | ✅ |
| §4.5 IP / ts.net / Funnel | 1（白名单）/ 42 / 48 | ✅ |
| §4.7 VAPID 继承 | 私钥 0 / signVapidJwt 14 / dsaEncoding 2 / FCM 4 | ✅ |
| §4.8 旧 PROJECT_ROOT 现状 | 模块级 2 + 函数级 2 = 4 处（与 §4.8 修法描述吻合） | ✅ |
| B 类起草态（预期红，by-design） | sleep infinity **12** / tag:harness-edge **0** / build/server.js **0** / server.ts NOT-EXIST / import.meta.url **0** / install-dsh.sh NOT-EXIST / 旧 volume 挂载 **12** 新 **0** | ✅ 时序正确 |
| §7 教训记档 8 条 | volume 双修法 / import.meta.url / dsh URL user verify / 5 edge 单模板 / stub 维持防 scope creep / 实测前置 / 4 commits 拆分 / 9 user-must-execute | ✅ |

## §2 Findings（4 major + 4 minor，同轮已收口）

### F1 (major) §3 v1.0 runtime 命令双重错 + 暴露 v0.6 报告假绿
- **实测**：起草版实测 **204 ≠ 0**——①audit-scope §3 误纳 `'adr/0010-*.md'`：ADR 0010 系 **v1.1 周期 NEW 文件**（`2b0953a`），diff +95 行；②prompt §2.3 把 v0.6 的 `spec/kernel-schema.sql` 单文件抄成 `spec/` 整目录（混入 spec/capabilities 4 文件 79 行 + spec 其他 24 行 = 103）
- **连带发现**：v0.6 命令同纳 0010（v0.6 §3 注记自己写明「ADR 0010/0011 是 v1.1+ 新增不入此检查」——**注记与命令自相矛盾**）→ **v0.6 报告 §3「== 0」系假绿**（该命令当时跑必得 95，报告记 0 = 未跑或跑错，第 12 次同型病灶、首次「复审报告自身假绿」）
- **收口**：两文件命令统一为 `harness/ + spec/kernel-schema.sql + spikes/ + adr/000[1-9] + 3 配置文件`，附 GATE-CALIB 注记（含 v0.6 假绿记档）；修正版实测 **== 0** ✓

### F2 (major) §4 headless pattern 无空格 typo + 期望基数失实
- **实测**：`--profileheadless`（无空格）实测 **1 ≠ ≥ 3 必红**；正确空格版 `--profile headless` 实测 **19**（= v0.6 报告「headless 19」溯源对上；源码注释 5 + test 14）——起草者期望「≥ 3（三处）」未实测前置（v0.6 W-B 病灶复发）
- **收口**：pattern 修空格版（audit-scope §4 + prompt §2.4 同步），期望注记实测 19 分解；typo 字面仅存于 GATE-CALIB 记注行（教学引用合规）

### F3 (major) §7-1 宣称的 volumes 双守门不存在——本周期最大改动无机器守门
- **实测**：§7-1 机制条款明写「§5 守门：`volumes: - ../wrapper` == 0 + `volumes: - ..` ≥ 8」，但 §4.5.7/§5/§9 命令矩阵**无此两条命令**；而 volume mount 双修法是 v0.7 最大改动（**12 services**，起草实测旧挂载 12 / 新挂载 0 全待改）——宣称守门 = 空头条款
- **收口**：§4.5.7 + §9-4 + prompt §2.5 三处补齐两条命令（旧 `../wrapper:/app/wrapper` == 0 + 新 `..:/app:ro` ≥ 12；12/13 services 口径注记待实施校准）+ prompt §4 引用式清单补第 4 条

### F4 (major) `grep -c | wc -l` 语义 bug ×2——数文件数非命中数，双假绿
- **实测**：`grep -c "EDGE_REGION" …edge[1-5].yml | wc -l` 恒 **5**（数文件数；0 命中文件也占行 → 永绿假门）；`grep -c "build/server.js" deploy/*.yml | wc -l` 数 yml 文件总数（**7**）与命中无关——起草实测真命中 **10**（EDGE_REGION）/ **0**（build/server.js），三处复制（§4.5.7/§9-4/prompt §2.5）
- **收口**：统一改 `2>/dev/null | awk -F: '{s+=$NF} END{print s}'` 真命中合计；期望校准 EDGE_REGION ≥ 10（实测）/ build/server.js ≥ 8（待实施）

### minors（4）
- **m1** prompt §2.4 pattern 与 audit-scope 失同步（v0.4 PROMPT-SYNC 病灶复发）→ 随 F2 同步 ✓
- **m2** prompt §4 引用式清单编号 1,2,3,5,6 跳号 → 补 4（volumes）重排 1-6 ✓
- **m3** §1 前向命令在 NEW 文件实施前跑打 3 行 stderr 未注记 → 注记「属预期，wc 不受影响」✓
- **m4** disk 口径切换（v0.6 盘 124 → v0.7 盘 126，自伤源换文件不累加）无注记 → 补「换源不累加」机制注记 ✓；另挂账：`.claude/` untracked 建议入 .gitignore（工具产物，dispatch commit 1 顺手）

## §3 收口后复验（verbatim）

前向 0 ✓ / v1.0 diff 修正版 **0** ✓ / headless 空格版 **19**（期望注记一致）✓ / EDGE_REGION awk **10** ✓ / build/server.js awk **0**（待实施）✓ / vol 旧 **12** 新 **0**（待实施）✓ / 三源 **117 / 126 / 自伤 9** 稳定（修复零自引入——新增字面均非 §1 pattern）✓ / `profileheadless` 残留仅 GATE-CALIB 记注 1 处 ✓ / 占位残留 0 ✓

## §4 判定与下一步

**v0.7 起草双文件收口 PASS**：4M/4m 全修，A 类全绿 + B 类时序正确（实施后转绿）。三文件（audit-scope + prompt + 本报告）保持 untracked，随 dispatch **commit 1** `chore(v1.1.1): v0.7 audit-scope drafting` 一并入库（per §7-7 4-commits 链）→ commit 2-4 实施 → U7 Codex v0.7 formal 复审（本报告升级为 formal 版）→ U8 v1.1.1 tag。

---

*codex review done — v0.7 起草复审 **0C/4M/4m 同轮收口**：F1 §3 命令双重错（ADR 0010 误纳 + spec 整目录化）连带坐实 v0.6 报告 §3 假绿（首次复审报告级假绿，记档）/ F2 headless pattern typo+期望失实（空格版实测 19）/ F3 volumes 双守门空头条款补齐（12 services 最大改动）/ F4 grep -c|wc -l 数文件假绿 ×2 awk 化；修正版全绿（v1.0 diff 0 / 三源 117·126·9 稳定零自引入）；起草者实测前置达标（disk 126/自伤 9 先跑后写 ✓）。三文件 untracked 随 commit 1 入库。*
