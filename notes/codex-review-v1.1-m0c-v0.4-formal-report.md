# Codex 复审报告 — v1.1 M0c v0.4 升级 + M2 三守门正式启用（formal 轮）

> **Date**: 2026-09-02
> **Reviewer**: Codex（gpt-5.6-sol 风格，xhigh；per `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md` §8）
> **审验对象**: `5010c27`（M2 实施包 + v0.4 升级 audit-scope，30 文件 +6511/-6）+ `794060e`（cc-ready 翻牌 T-M2-EXEC-PASS）；审验基线 HEAD = `794060e`（working tree DO-1 3 文件 M 活跃，diff 增量命中 = 0，不影响矩阵）
> **判定**: **CHANGES REQUIRED** — 0 critical / **4 major / 3 minor**（守门 pattern 校准 + 锚定三源统一 + README 两处交付缺口；实施实质面健康，全部为守门/文档级修复）
> **注**: M2 三守门「预备 → 正式启用」首轮即暴露 pattern 设计缺陷 5 处——启用前「期望值经验证」声明失实，须校准后重测方可宣称正式启用

---

## §1 通过项（verbatim 实跑）

| 检查 | 实测 | 判定 |
|------|------|------|
| H2 DEEPSEEK_API_KEY（CHANGELOG/README/docs/reports） | **0** | ✅ |
| VAPID 私钥不泄漏（wrapper/deploy/env/CHANGELOG/README 全范围） | **0** | ✅ |
| Web Push 端点白名单（FCM/Mozilla/WNS/APNs） | **4 ≥ 4** | ✅ |
| H4 v1.0 runtime 六区域 diff | **0** | ✅ |
| H5 dsh headless profile | 19 ≥ 3 | ✅ |
| H6 dsh web profile | **0** | ✅ |
| H7 STT 音频不留盘（wrapper/deploy 业务源码） | **0** | ✅ |
| §4.5 Tailscale MagicDNS（deploy/ ts.net） | 38 ≥ 1 | ✅ |
| §4.5 Funnel URL（docs/+deploy/ 合并口径） | 11 ≥ 6 | ✅ |
| M2 实施工件 | wrapper 6 文件（6host_client/vapid_keys/whisper_stt/6host_router/stt_worker/webpush_gateway）+ capability 3 SKU + deploy ×10 齐 | ✅ |
| M2 DD-1 报告 | 247 行 / 6 段结构 ✓ | ✅ |
| CHANGELOG `[1.1.0-M2]` 段结构 | 5 子段（Added/Changed/Gates Passed/Hygiene/Notes）+ Link ref 1 | ✅（项数核对见 m-2） |
| cc-ready | `T-M2-EXEC-PASS` JSON valid | ✅ |
| 锚定构成数学 | 97 = 85（v0.3 post-commit）+ 12（BE-1 rep 3 + TG-1 rep 2 + DO-1 rep 2 + QA-1 rep 1 + DD-1 rep 2 + QA-1 test-plan 2），43 文件，**构成闭合** | ◐（见 M-B） |

## §2 Findings

### M-A (major) 前向不锁型号违规 — README.md:342
- **实测**：`grep CHANGELOG.md README.md` = **1 ≠ 0**（README.md:342 M2 段守门对照表 G1 行内嵌 pattern 字面 `` `Fable 5\|GLM 5.3\|MiniMax-M3` ``）——v0.3 时该口径实测 0，v0.4 升级引入回退；且 H1 三文件口径（含 M2 DD-1 报告）实测 **3** ≠ 声明 0（README 1 + DD-1 报告 L106/L233 守门描述/验证字面 2）
- **修法**：README:342 改引用式（「per NORTH-STAR A-4 pattern，见 audit-scope v0.4 §1」）；H1 前向口径收窄 `CHANGELOG.md README.md`（对齐 v0.3 G2 裁定先例），DD-1 报告 2 处走 §1.5 #43 豁免

### M-B (major) 锚定三源三数互斥（第七次锚定事故）
- **实测**：命令 **97 / 43 文件** vs §1 期望 **91** vs §1.5 主表 **89（38 文件）** —— 三数互不相等
- 病灶①：期望公式「85 + M2 5 DISPATCH 6 = 91」**重复计数**（M2 DISPATCH 6 已在 v0.3 #34-38 入列，85 内含——audit-scope L36 自述「per v0.3 §1.5 #34-38 即时入列」仍 +6，公式自相矛盾）
- 病灶②：主表漏列 M2 实施报告群 6 文件 12 行（#40 BE-1 rep 3 / #41 TG-1 rep 2 / #42 DO-1 rep 2 / #43 DD-1 rep 2 / #44 QA-1 rep 1 / #45 QA-1 test-plan 2；M2-DEPLOY-GUIDE 0 命中不入）
- 病灶③：§1.5 表 #3 声明 DD-1 报告「4 命中」实测 **2**
- **修法**：§1 期望 == **97**（构成：85 + M2 实施报告群 12）+ 主表补 #40-#45 → **44 文件 97 行**（37+6 文件…见执行书）+ DD-1 报告改 2 命中；命令/清单/期望三源同值 == 97

### M-C (major) M2 三守门「期望值经验证」声明失实 — 启用即红 ×4（pattern 校准 5 处）
| 守门 | 声明 | 实测 | 定性 |
|------|------|------|------|
| §4.5 容器 IP 不锁 | 0 | **69** | **范围缺陷**：69 处几乎全为 `wrapper/node_modules/` 第三方文档注释（@types/node、proxy-addr、playwright 等）；守门未排除 node_modules |
| §4.6 tmp 目录 | 0 | **3** | **自伤**：3 处全为 `wrapper/test/integration/stt_e2e.test.ts` 守护测试自身断言（断言 whisper_stt 不得含 /tmp/audio）；业务源码 0 |
| §4.6 Whisper 相对路径 | 0 | **1** | **误判**：`deploy/6host-compose.newvps.yml:77` `WHISPER_MODEL_PATH: "${WHISPER_MODEL_PATH}"` env-inject 占位符，pattern 未排除 `${` |
| §4.7 VAPID 公钥 | ≥ 1 | **0** | **期望方向错误**：实施选择公钥亦 env-inject（较「可入 commit」更严，合规方向）；期望应 == 0 |
- **修法**（守门校准后重测全绿，方可宣称「正式启用已验证」）：§4.5 IP 命令范围改 `wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md`（排除 node_modules）+ 保留 compose IPAM/subnet 合例白名单注记；§4.6 tmp 排除 `wrapper/test/`；§4.6 whisper pattern 排除 `${`；§4.7 公钥期望 `== 0（env-inject-only）`；校准说明记入 audit-scope §4.5-4.7 各节
- **流程教训**：「启用前期望值经验证」声明本身未验证（v0.3 教训「先跑后写」复发）——三守门预备→正式的转换条件应附 verbatim 实测输出

### M-D (major) README M2 段缺 5 边缘 Funnel URL
- **实测**：README ts.net URL 5 处**全部为 newvps 主 Funnel**（`harness-newvps.tail1b9878.ts.net`）；§2(A) 声明「README 6 Funnel URL 列表」——5 边缘 host URL（edge-1…edge-5）README 无一出现（§4.5 第三条靠 `docs/` 内 M2-DEPLOY-GUIDE 11 处撑过 ≥ 6）
- **修法**：README M2 段 Funnel 表补 5 边缘 host URL 行（源数据在 M2-DEPLOY-GUIDE / deploy/tailscale-funnel-6host.yaml）

### m-1 (minor) M2 DD-1 报告 §5 声明 grep=0 vs 自身命中 2（L106/L233）——同 v0.3 同型自洽缺口，走 §1.5 #43 豁免并改声明口径
### m-2 (minor) CHANGELOG M2 段项数 26（Added 8/Changed 4/Gates 5/Hygiene 6/Notes 3）未逐项核对 —— fix 轮执行书补 verbatim 逐项计数
### m-3 (minor) prompt §5 `[COMMIT_HASH_PLACEHOLDER]` 待回填 + working tree DO-1 3 文件 M（DISPATCH/DEPLOY-GUIDE/DO-1 报告）活跃中——审验基线 HEAD 已注明；DO-1 收口 commit 后按 §1.5 即时入列协议核对锚定增量

## §3 gate 复跑状态

- tsc/vitest 复跑本轮**未收口**（限时 180s/300s 超时中断；M2 QA-1 commit 5010c27 声明双绿沿袭 v0.3 stabilized 机制）——**列入 fix 轮执行书必跑项**，收口前 v0.4 不得宣称 PASS

## §4 结论与签发

- 实施实质面健康（M2 工件齐、双零保持、headless 19/web 0、STT 音频 0、VAPID 私钥 0、端点 4、MagicDNS 38）；问题集中在**守门 pattern 校准 + 锚定三源 + README 两处交付缺口**，全为文档/守门级
- **签发 `T-M2-V0.4-GATE-CALIB`**（执行书另落；建议承载：M-A README:342 引用式 + M-B 锚定 97 三源 + M-C 五处 pattern 校准重测 + M-D 5 边缘 URL + m-1/2/3 + tsc/vitest 必跑收口）——涉及守门期望值（合同级）与 M2 DD-1 交付物，**留 user/执行端裁定后执行**，本轮不代改
- M-C 校准完成 + 重测全绿 + M-A/M-D 补齐后，v0.4 复审可转 PASS；M3（GA final 准备）在新 audit-scope v0.5 起草纪律下进行（audit-scope 先行 + commit 后立即复审）

---

*codex review done — v0.4 formal 首审 **CHANGES REQUIRED（0C/4M/3m）**：三守门启用即红（node_modules 69/测试自伤 3/env 占位误判 1/公钥期望反向 0）+ 锚定 97/91/89 三数互斥（85+6 重复计数）+ README:342 前向违规 + README 缺 5 边缘 Funnel URL；实施实质面全绿；签发 T-M2-V0.4-GATE-CALIB 待裁定。*
