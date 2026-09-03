# Codex 复审报告 — v1.1 v0.5 升级 + M3 GA final 阶段准备（formal 轮）

> **Date**: 2026-09-02
> **Reviewer**: Codex（gpt-5.6-sol 风格，xhigh；per `notes/codex-audit-scope-v1.1-m0c-v0.5-precommit-prompt.md` §8）
> **审验对象**: `3d24eeb`（v0.5 升级 + M3 GA final 准备，8 文件：CHANGELOG `[1.1.0]` GA 段 / README final 段 / plan v0.4 / ADR 0011 NEW / DISPATCH-T-M3 NEW / v0.5 audit-scope + prompt NEW / cc-ready 翻牌 `T-M3-DISPATCH-PASS`）
> **判定**: **CHANGES REQUIRED** — 0 critical / **1 major / 2 minor**（disk 口径首用即裂 + 演进链归属错位；tracked 主口径引用式机制生效首战告捷、实质面全绿）

---

## §1 通过项（verbatim 实跑）

| 检查 | 实测 | 判定 |
|------|------|------|
| 前向不锁型号（CHANGELOG+README） | **0**（L95 drift 已改引用式「按 §1 等价类 grep pattern 实测 = 0」✓） | ✅ |
| **tracked 锚定三源** | 命令 **114** == §1.5 主表合计「48 文件 114 行」== §1 期望引用式 114 —— **主口径三源同值，引用式机制（v0.4 §7.3 ②）首次全链生效** | ✅ |
| 主表增量 | #49 DISPATCH-T-M3 6（11 字面去重 6，over +2 已注）/ #50/#51 notes 自伤豁免不入 tracked / #52 ADR 0011 = 0 | ✅ |
| §2 DEEPSEEK_API_KEY | 0（CHANGELOG/README/docs/reports/docs/adr 全范围） | ✅ |
| §4.7 VAPID 公私钥字面 | 0 | ✅ |
| §4.7 端点白名单 | 6 ≥ 4 | ✅ |
| §4 dsh profile | headless 19 ≥ 3 / web 0 | ✅ |
| §4.6 STT | 音频留盘 0 / tmp 0 / whisper `${` 排除 0 | ✅ |
| §4.5 IP（单 host 现实口径） | 1（CHANGELOG L326 RFC1918 白名单，沿用 v0.4 裁定） | ✅ |
| §3 v1.0 runtime | 六区域 diff = **0** | ✅ |
| CHANGELOG `[1.1.0]` GA 段 | L66 段头 + Link ref L451 ✓ | ✅ |
| README final 段 | 单 host 现状 + 5 edge 缺口表 + 路径 A/B + 守门 5 条 + GA tag 命令（要素 13 处） | ✅ |
| ADR 0011 | Status Accepted + 5 节 + 0 命中（非冻结对象） | ✅ |
| DISPATCH-T-M3 | §1-§7 齐（171 行）+ 自引入预演 #49 | ✅ |
| plan | v0.4 升级行 + ADR 0011 cross-ref | ✅ |
| cc-ready | `T-M3-DISPATCH-PASS` JSON valid + 引用式 | ✅ |
| gate（本地 bin） | tsc exit **0**；vitest **8 文件 p/5 s + 95 tests p/69 s / 0 failed** | ✅ |
| hard rule 5 条内化 | (a) 先行起草 ✓ (b) 3 drift 修完 ✓（L95/§3 命令/锚定偏差）(c) #49-#52 预演入列 ✓ (d) message 附实测 ✓ (e) 引用式 5 处（prompt 5 + DISPATCH 1 权威源标注） | ✅ |

## §2 Findings

### V-A (major) disk 口径首用即裂 — 四数不一致（第十次锚定事故·disk 变体）
- **实测**：§1 disk 命令（范围 = `docs/ adr/ spec/ + v0.5 audit-scope 单文件`）= **120**；§1 期望行写 **≥ 128**（自注公式「docs 114 + audit-scope 8 + **prompt 6** = 128」——**prompt 不在命令范围内，公式越界计入**）；§1.5 主表 L57 写「**51 文件 128 行** disk」；commit message 写「disk **126**」——四方四数（120 / 公理应 122 / 126 / 128）
- **并发病灶**：#50 行声称 audit-scope 自伤 **8** 行 vs §1 命令实测该文件 **6** 行（差 2：§1 grep 字面 ×3 中 2 处与他节同行去重口径未对齐）
- **修法**：disk 期望改 **== 120**（范围即 §1 命令明文；主表 disk 行改「49 文件 120 行 disk」= 48 tracked + audit-scope 单文件 6 自伤实测；删除范围外「prompt 6」项；#50 行 8 → 6 并注去重口径）；message 126 记档不改写。**机制建议**：disk 口径与 tracked 同走「命令 == 期望 == 主表」三源同值 + 权威源单点维护（v0.4 §7.3 ② 同法），勿双口径并行手算

### V-B (minor) 演进链「108 = v0.4 终态实测」归属错位
- v0.4 终态（`a1f8e82` post-commit Codex 实测）= **107**；+1 实为 `3d24eeb` 自身 cc-ready 翻牌 status 引入的 pattern 字面（post 版实测 1）——演进链把它记在 v0.4 名下。数学殊途同归（107+1+6 = 108+6 = 114）但叙事错一行
- 修法：演进链改「107 v0.4 终态实测 → 114 v0.5 = 107 + #49 DISPATCH 6 + cc-ready flip 1」；主表 L50「继承 47 文件 107 行」与 #1-#48 行「108 行（含历史漂移 1）」统一为 107 + flip 1 归 #49 批次

### V-C (minor / 提示级) 引用式纪律执行注记
- prompt 内绝对数字「114」×7、DISPATCH ×3——均属演进链/实测注记且权威源标注齐全（「唯一权威源」prompt ×5 + DISPATCH ×1），期望类引用已纯引用式；**建议**：后续版本演进链数字仅保留于 audit-scope 一处，prompt/DISPATCH 引用演进链时不复制终值

## §3 结论与签发

- 实质面全绿：v0.5 升级 8 文件、ADR 0011 closure、M3 DISPATCH 合同、GA tag 准备、守门 8 项、双 gate 复跑 0/0f；**tracked 主口径三源同值 114——九次漂移后引用式机制首次全链生效（机制胜利）**
- 残留集中 **disk 口径首用校准**（V-A）+ 演进链一行归属（V-B）——纯 notes 文本级
- **签发 `T-M3-V0.5-DISK-CALIB`**（轻量：disk 期望 == 120 + #50 实测 6 + 主表 disk 行 49 文件 120 + 演进链归属修正 + disk 口径纳入三源同值机制；随 M3 EXEC 首个 docs commit 捎带归档亦可）——修完 v0.5 复审可转 PASS
- M3 执行端照常（GA final：v1.1.0 tag + 5 edge host 缺口挂账路径 A/B user 决策）

---

*codex review done — v0.5 formal 首审 **CHANGES REQUIRED（0C/1M/2m）**：实质全绿 + tracked 主口径三源 114 同值（引用式机制首战告捷）；disk 口径首用即裂（120/122/126/128 四数 + #50 自伤 8 vs 实测 6）+ 演进链 108 归属错位；签发 T-M3-V0.5-DISK-CALIB 轻量收口。*
