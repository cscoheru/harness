# Codex Audit-scope — v1.1 M0c v0.4 升级 + M2 三守门正式启用 hygiene 守门

> **Date**: 2026-09-02
> **Purpose**: v0.4 升级 hygiene 守门聚合（继承 v0.1/v0.2/v0.3 守门；启用 §4.5/§4.6/§4.7 M2 三守门从"预备"到"正式"）
> **Why**: v0.4 升级 = M2 实施收口（CHANGELOG [1.1.0-M2] 段 + README v1.1 M2 段 + DD-1 报告 + 本 audit-scope + 配套 prompt = 6 文件）；§4.5/§4.6/§4.7 M2 hygiene 三守门在 v0.3 中作为预备清单（v0.3 起草时 M2 未实施），v0.4 升级时 M2 5 DISPATCH 均已 commit，三守门 grep 期望值经实测验证，正式启用。
> **How to apply**: v0.4 升级前向交付物守门命令统一引用本 §1-§7；本文件保留字面 grep pattern 用作后续 Codex 复审 hygiene anchor。

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类，继承 v0.3 §1）

```bash
# v0.4 升级前向交付物不锁型号（实测 == 0）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md docs/reports/T-M2-DD-1-report.md | wc -l
# 期望: 0 行
# 注: DD-1 报告 §Author/§Co-Authored-By 等尾注字段走 §1.5 豁免

# 历史文档豁免口径锚定（tracked 重锚 post-M2，实测）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == 103（post-commit 演进链：91 预估 → 97 CALIB → 101 FIX-2 自引入 → 103 FIX-2 实测 + PROMPT-SYNC #48 自引入预演 3 = 106；实测 45 文件 103 行 / 2026-09-02 FIX-2 commit ed36bd7 后重测；PROMPT-SYNC commit 后以实测为准）
# 注: 公式 = v0.3 tracked (85) + M2 实施报告群 12 行（#40 BE-1 rep 3 + #41 TG-1 rep 2 + #42 DO-1 rep 2 + #43 DD-1 rep 2 + #44 QA-1 rep 1 + #45 QA-1 test-plan 2）+ #46 GATE-CALIB exec 4 + #47 HYGIENE-FIX-2 exec 自引入 2 = 103

# 历史文档豁免口径锚定（disk 口径）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md | wc -l
# 期望: ≥ 103（disk 口径，含本 audit-scope §1/§4.5/§5 自伤字面；2026-09-02 FIX-2 后重测）

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md | wc -l
# 期望: ≥ 3（grep 字面必现：§1 + §4.5 + §5）
```

**含义**：v1.1+ 周期模型决策遵守 NORTH-STAR A-4 等价类约束；v0.4 升级前向交付物（CHANGELOG.md + README.md + M2 DD-1 报告）均不含具体型号字面；DD-1 报告 §Author/§Co-Authored-By 走 §1.5 豁免。

### §1.5 历史文档豁免清单（tracked 重锚 post-M2 = 103，实测 45 文件 103 行 / 2026-09-02 FIX-2 后重测）

继承 v0.3 §1.5 docs 主表 37 文件 85 行 + notes 自伤小节 2 文件 8 行；v0.4 升级范围（M2 实施报告群 6 文件 12 行 + GATE-CALIB exec 自引入 4 行〔修复 commit 自带执行书 pattern 字面〕+ HYGIENE-FIX-2 exec 自引入 2 行〔修复 commit 自带执行书 pattern 字面，per v0.3 #39 / v0.4 #46 即时入列先例〕+ v0.4 audit-scope/prompt 自伤 ~3 行）= 总锚定 **tracked 重锚 post-M2 实测 = 103**（85 + 12 + 4 + 2 = 103；45 文件；M2 5 DISPATCH 起草 6 已在 85 内含，不重复计；PROMPT-SYNC #48 自引入预演 3 行待 commit 后实测）。

**v0.4 升级范围**（6 文件）：

| # | 文件 | 操作 | docs/ 命中增量 | 自伤豁免 |
|---|------|------|----------------|----------|
| 1 | `CHANGELOG.md` | Edit（增 [1.1.0-M2] 段 + Link refs）| 0 | grep 字面 0 行 |
| 2 | `README.md` | Edit（v1.1 M2 段 fill in：6 host 拓扑 + STT + Web Push + 6 Funnel）| 0 | grep 字面 0 行 |
| 3 | `docs/reports/T-M2-DD-1-report.md` | NEW（M2 DD-1 实施报告 ~250 行 6 段）| **2**（§不锁型号守门描述 L106 + §元数据自检 L233；§Author 尾注 + §verbatim 命令字面 + §Co-Authored-By check 实际未命中）| DD-1 报告 L106/L233 走 §1.5 #43 自伤豁免 |
| 4 | `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md` | NEW（本文件）| 0 | notes/ 不入主合同 |
| 5 | `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md` | NEW（配套 Codex 复审 prompt）| 0 | notes/ 不入主合同 |

**docs 主表**（继承 v0.3 §1.5 #1-#39 + M2 实施报告群 6 文件 12 行 + GATE-CALIB exec 自引入 4 行 + HYGIENE-FIX-2 exec 自引入 2 行 = **45 文件 103 行，实测 / 2026-09-02 FIX-2 后重测**）：

- ✅ #1-13 v0.1 历史档案 13 文件 42 行
- ✅ #16-20 v0.2 M1c 5 DISPATCH 5 行
- ✅ #21 M1c EXEC 1 行
- ✅ #22-25 M1c 实施报告 4 行
- ✅ #26 M0c TG-1 报告 1 行
- ✅ #27 M1c GATE-REPAIR 2 行
- ✅ #28 M0c-DONE 1 行
- ✅ #29 GATE-REPAIR-report 4 行
- ✅ #30 GATE-REPAIR-2 3 行
- ✅ #31 GATE-REPAIR-2 report 5 行
- ✅ #32 funnel 报告 2 行（v0.2 §1.5 漏列；v0.3 §1.5 修正补入）
- ✅ #33 DD-1 报告 4 行（v0.3 升级新引入：§Author 尾注 + §不锁型号守门描述 + §verbatim 命令字面 + §Co-Authored-By 反向引用 check）
- ✅ #34 T-M2-BE-1 2 行（§Author 尾注 + §Co-Authored-By check；M2 起草 f666e47 已 commit，即时入主表）
- ✅ #35 T-M2-TG-1 1 行（§Author 尾注）
- ✅ #36 T-M2-DO-1 1 行（§Author 尾注）
- ✅ #37 T-M2-QA-1 1 行（§Author 尾注）
- ✅ #38 T-M2-DD-1 1 行（§Author 尾注）
- ✅ #39 T-M0c-V0.3-HYGIENE-FIX 执行书 2 行（§4 验收命令 grep pattern 字面 ×2）
- ✅ #40 T-M2-BE-1 报告 3 行（v0.4 升级新引入：§Author 尾注 + §Co-Authored-By check + §不锁型号守门描述；M2 实施 5010c27 即时入主表）
- ✅ #41 T-M2-TG-1 报告 2 行（§Author 尾注 + §不锁型号守门描述）
- ✅ #42 T-M2-DO-1 报告 2 行（§Author 尾注 + §不锁型号守门描述）
- ✅ #43 T-M2-DD-1 报告 2 行（§不锁型号守门描述 L106 + §元数据自检 L233；走 §1.5 #43 自伤豁免）
- ✅ #44 T-M2-QA-1 报告 1 行（§Author 尾注）
- ✅ #45 T-M2-QA-1 test-plan 2 行（§Author 尾注 + §不锁型号守门描述）
- ✅ #46 T-M2-V0.4-GATE-CALIB 执行书 4 行（v0.4 GATE-CALIB 修复 commit 277cdf8 自引入：§3 验收命令 grep pattern 字面 ×4；per v0.3 #39 即时入主表先例补列；Codex formal 报告 §5.2 F-1 第八次锚定漂移教训）
- ✅ #47 T-M2-V0.4-HYGIENE-FIX-2 执行书 2 行（v0.4 HYGIENE-FIX-2 commit `ed36bd7` 自引入预演 2 行实测：§2 验收命令 grep pattern 字面 ×2；FIX-2 修复 commit 自带执行书 pattern 字面，按 v0.3 #39 / v0.4 #46 即时入主表先例补列）
- 🆕 #48 T-M2-V0.4-PROMPT-SYNC 执行书 4 行实测（PROMPT-SYNC commit 59ccce0 实测命中 4 行：§2 验收 (a) `grep -cE "Fable 5..."` ×1 + (b) `grep -rE "Fable 5..."` ×1 + (c) `grep -rE "Fable 5..." CHANGELOG.md README.md` ×1（H1 收窄命令同步）+ (d) prompt §3#4 新增 `grep -rE "Fable 5..." CHANGELOG.md README.md` ×1；per v0.5 hard rule (c) commit 前预演入列 + (b) commit 后立即复审；预演 3 行实测 4 行 +1 漂移已修）
- 总计：**47 文件 107 行（FIX-2 实测 / 2026-09-02 + #48 PROMPT-SYNC 实测 4 行）/ commit 后实测 107 / 47 文件**

**tracked 重锚 post-M2 实测公式**（2026-09-02 FIX-2 后重测）：
- v0.3 post-stage: 85（37 文件 docs/adr/spec/capabilities + 2 文件 notes 自伤 = 39 文件 85 行；M2 5 DISPATCH 起草 6 行已含入 85，不重复计）
- + M2 实施报告群 12: BE-1 rep 3 + TG-1 rep 2 + DO-1 rep 2 + DD-1 rep 2 + QA-1 rep 1 + QA-1 test-plan 2
- + #46 GATE-CALIB exec 自引入 4（per v0.3 #39 即时入列先例；Codex formal 报告 §5.2 F-1 复审确认）
- + #47 HYGIENE-FIX-2 exec 自引入 2（per v0.3 #39 / v0.4 #46 即时入列先例；FIX-2 commit `ed36bd7` 自带执行书 pattern 字面实测）
- + #48 PROMPT-SYNC exec 自引入预演 3（per v0.5 hard rule (c) commit 前预演入列；PROMPT-SYNC commit 后实测以终态 103 + 4 = 107 为准，预演 3 实测 4 +1 漂移已修）
- + v0.4 audit-scope/prompt 自伤 ~3（notes 自伤豁免，不入主合同）
- **实测 post-commit: 85 + 12 + 4 + 2 = 103 行（45 文件）→ 实测终态 103 + 4 = 107 行（47 文件）PROMPT-SYNC commit 59ccce0 后**
- 验收命令：`git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'` 实测 == 103

**豁免口径不变**（per M0b plan §3 L89 C2 裁定 + v0.3 §1.5 末段）：**不清洗历史文档**（考古记录 + git 尾注 + DISPATCH §4 验证命令字面均保留）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训，继承 v0.3 §2 + VAPID 私钥正式启用）

```bash
# v0.4 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/reports/T-M2-DD-1-report.md | wc -l
# 期望: 0 行

# 仅 env-inject only 占位（合规）：
grep -rE "env-inject only|env:[A-Z_]+|process\.env\.[A-Z_]+" CHANGELOG.md README.md docs/reports/T-M2-DD-1-report.md | wc -l
# 期望: ≥ 3（CHANGELOG + README + DD-1 报告各含 env-inject 字样）

# VAPID 私钥守门正式启用（M2 Web Push；v0.4 升级启用）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{20,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{20,}['\"]" CHANGELOG.md README.md docs/reports/ docs/DISPATCH-T-M2-DD-1.md | wc -l
# 期望: 0 行（VAPID 私钥仅 env-inject；M2 DD-1 DISPATCH 起草不使用完整私钥字面）
```

**含义**：DEEPSEEK_API_KEY 等敏感 API key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；M2 VAPID 私钥守门正式启用（v0.3 预备，v0.4 启用）。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)，继承 v0.3 §3）

```bash
# v0.4 升级不动 v1.0 runtime 区域（commit v1.0.0 tag 后 0 漂移）：
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行

# v1.0 GA plan + 现有 ADR body 不动：
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0 行
```

**含义**：v0.4 升级仅在 `CHANGELOG.md` + `README.md` + `docs/reports/T-M2-DD-1-report.md` + `notes/` 范围；不触及 harness/spec/spikes/9 ADR body/Dockerfile/docker-compose.yml/pyproject.toml/v1.0 GA plan。

## §4 dsh `headless` profile 守门（M1c TG-1 + M2 BE-1 预备）

```bash
# M1c wrapper 实调 dsh 必须用 headless profile（per M0b QA-1 §6.X 修订）：
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# 期望: 0 行（M0c skeleton 已用 headless；M1c 严禁 web profile）

# 期望出现 headless profile（M0c skeleton + M1c 实施）：
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# 期望: ≥ 3（orchestrator + dsh_client + tool_provider 三处）
```

**含义**：dsh `web` profile 是 Web UI server（per M0b QA-1 修订），不是 CLI 单轮任务。v1.1 wrapper 实调必须用 `headless`（CLI 单轮任务）。

## §4.5 M2 多 host 守门正式启用（多 host 拓扑漂移风险；v0.3 预备 → v0.4 正式启用）

```bash
# M2 6 host 拓扑：1 newvps 主 + 5 边缘 host（east-1/west-1/asia-1/eu-1/sa-1）
# 容器 IP 不锁守门（M2 正式启用，命令范围排除 node_modules）：
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md | grep -v "127.0.0.1" | wc -l
# 期望: 0 行（容器互联必须用 container_name，IP 不锁）
# 校准说明（v0.4 GATE-CALIB M-C 5 处校准之一，2026-09-02）：原命令范围 `wrapper/` 含 node_modules（@types/node / proxy-addr / playwright 第三方文档注释），69 处几乎全 node_modules 误报。修订命令范围为 wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md（业务源码口径；不含 wrapper/node_modules/）

# Tailscale MagicDNS 域名使用守门（M2 正式启用）：
grep -rE "ts\.net" deploy/ | wc -l
# 期望: ≥ 1（边缘 host 必须用 MagicDNS 名，避免 host 漂移后 IP 锁死）

# 边缘 host 健康端点 + Funnel URL（M2 正式启用，H5 pattern bug 修正）：
grep -rE "https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/" docs/ deploy/ | wc -l
# 期望: ≥ 6（1 newvps + 5 边缘 = 6 Funnel URL）
# 校准说明（v0.4 GATE-CALIB H5 fix，2026-09-02）：原 pattern `[a-z-]+\.tail[a-z0-9]+\.ts\.net/` 第一段 `[a-z-]+` 不允许数字 → `harness-edge1.tail1b9878.ts.net` 漏检。修订为 `[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/`（首字符字母，后续允数字/连字符）
```

**含义**：M2 多 host 拓扑中容器互联若锁 IP，host 重启/迁移后立即断连；必须用 container_name（Docker Compose 内嵌 DNS）+ Tailscale MagicDNS（跨 host）。v0.3 起草时 M2 未实施，grep 期望值基于 DISPATCH §8 禁止条款；v0.4 启用时 M2 5 DISPATCH 均已 commit，期望值经验证。

**§4.5 期望值经验证（2026-09-02 GATE-CALIB 重测 verbatim）**：
- IP 命令（含排除 node_modules）：实测 **1** 行（`CHANGELOG.md` L326 RFC1918/回环网段**说明文案**——含 `10.0.0.0/8` / `127.0.0.0/8` / `169.254.0.0/16` / `::1/128` 等公网/私网说明，非锁 IP；详见 §4.5 白名单注记）
- ts.net 域名：实测 ≥ 1（deploy/tailscale-funnel-6host.yaml）
- Funnel URL：实测 ≥ 6（docs/M2-DEPLOY-GUIDE.md 6 + deploy/tailscale-funnel-6host.yaml 6）

**§4.5 白名单注记（2026-09-02 v0.4 HYGIENE-FIX-2 F-2 落合同）**：
- **白名单：RFC1918/回环网段/ULA 说明文案豁免**——CHANGELOG.md L326 列举的 `10.0.0.0/8` / `127.0.0.0/8` / `169.254.0.0/16` / `::1/128` 等均为文档说明文案（VPC subnet + 链路本地 + IPv6 ULA 边界定义），**非容器互联锁 IP**
- 守门期望口径：**业务源码 0 + 说明文案白名单 1（实测全为 CHANGELOG.md L326，合规）**
- 实测总数 = 1：CHANGELOG.md L326 1 处文案白名单；业务源码（wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/）0 处锁 IP

## §4.6 M2 STT 守门正式启用（音频隐私；v0.3 预备 → v0.4 正式启用）

```bash
# M2 STT 录音不留盘守门（M2 正式启用）：
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ | wc -l
# 期望: 0 行（音频流必须 stream → STT worker，不落盘）

# 临时缓存目录路径合规守门（M2 正式启用，命令范围排除 wrapper/test/）：
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
# 期望: 0 行（仅允许 /dev/shm 即内存文件系统；落盘即 GDPR/PIPL 违规）
# 校准说明（v0.4 GATE-CALIB M-C 5 处校准之一，2026-09-02）：原命令范围 `wrapper/` 含 wrapper/test/integration/stt_e2e.test.ts 守护测试自身断言（断言 whisper_stt 不得含 /tmp/audio），3 处全自伤。修订命令范围为 wrapper/dsh/ wrapper/orchestrator/ deploy/ env/（业务源码口径；wrapper/test/ 走 §1.5 自伤豁免）

# Whisper 模型缓存目录合规守门（M2 正式启用，pattern 排除 env-inject 占位符）：
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l
# 期望: 0 行（必须绝对路径，禁相对路径误用；env-inject `${WHISPER_MODEL_PATH}` 占位符亦合规）
# 校准说明（v0.4 GATE-CALIB M-C 5 处校准之一，2026-09-02）：原 pattern `[^/]` 含 `$`（env-inject `${VAR}` 占位符误判）。修订为 `[^/$]`（排除 `$`，env 占位符合规）
```

**含义**：M2 STT 语音输入涉及音频隐私（GDPR / PIPL），录音必须流式处理 + 立即转写 + 不持久化；模型缓存可持久化（不含个人数据）。v0.3 起草时 M2 未实施，grep 期望值基于 DISPATCH §8 禁止条款；v0.4 启用时 M2 5 DISPATCH 均已 commit，期望值经验证。

**§4.6 期望值经验证（2026-09-02 GATE-CALIB 重测 verbatim）**：
- 音频不留盘：实测 0（业务源码 wrapper/dsh/whisper_stt.ts 0 行）
- tmp 缓存（排除 test/）：实测 0（业务源码 0 行；wrapper/test/integration/stt_e2e.test.ts L11/L89/L98 守护测试自伤 3 行走 §1.5 自伤豁免）
- Whisper 路径（排除 `${`）：实测 0（deploy/6host-compose.newvps.yml L77 `${WHISPER_MODEL_PATH}` 是 env-inject 合规占位符）

## §4.7 M2 Web Push 守门正式启用（VAPID key 泄漏；v0.3 预备 → v0.4 正式启用）

```bash
# VAPID 私钥不入 commit 守门（M2 正式启用）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l
# 期望: 0 行（VAPID 私钥仅 env-inject）

# VAPID 公钥 env-inject-only 合规（M2 正式启用，期望方向反转）：
grep -rE "vapid_public_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PUBLIC\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" deploy/ env/ | wc -l
# 期望: == 0（实施选择公钥亦 env-inject-only，较"可入 commit"更严，合规方向）
# 校准说明（v0.4 GATE-CALIB M-C 5 处校准之一，2026-09-02）：原期望 ≥ 1（"公钥可入 commit"宽松口径）；M2 TG-1 实施选择公钥亦 env-inject（per `deploy/env/edge-host.env.example`），实测 0 行。期望反向为 == 0（合规方向，不变严：私钥公钥统一 env-inject）

# Web Push 端点合规守门（M2 正式启用）：
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ | wc -l
# 期望: ≥ 4（FCM + Mozilla + WNS + APNs 四大 Push 端点白名单）
```

**含义**：VAPID（Voluntary Application Server Identification）私钥是 Web Push 认证的核心凭证，泄漏即推送服务被滥用（垃圾推送）；必须 env-inject only（per GH013 PUSH PROTECTION 教训）。公钥亦 env-inject-only（实施选择更严口径，私钥/公钥统一 env-inject）。v0.3 起草时 M2 未实施，grep 期望值基于 DISPATCH §8 禁止条款；v0.4 启用时 M2 5 DISPATCH 均已 commit，期望值经验证。

**§4.7 期望值经验证（2026-09-02 GATE-CALIB 重测 verbatim）**：
- VAPID 私钥：实测 0（env-inject-only 合规）
- VAPID 公钥：实测 0（env-inject-only 合规；`deploy/env/edge-host.env.example` 公钥亦走 env，未硬编码）
- Web Push 端点：实测 ≥ 4（FCM + Mozilla + WNS + APNs 四大白名单全合规）

## §5 v0.4 升级 6 文件 hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
| 1 | `CHANGELOG.md` | 无 | 无（仅 [1.1.0-M2] 段 + Link refs）| ✅ |
| 2 | `README.md` | 无 | 无（v1.1 M2 段 fill in）| ✅ |
| 3 | `docs/reports/T-M2-DD-1-report.md` | §不锁型号守门描述 L106 + §元数据自检 L233 字面（实测 2 行）| §1.5 / §6 引用 | ✅ §1.5 #43 自伤豁免 |
| 4 | `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md` (NEW 本文件) | 含字面（自伤豁免）| 本文件 | ✅ notes/ 不入主合同 |
| 5 | `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md` (NEW 配套 prompt) | 含字面（自伤豁免）| §1.5 引用 | ✅ notes/ 不入主合同 |

**v0.4 升级总改动：2 文件 Edit (CHANGELOG + README) + 3 文件 NEW (DD-1 report + 2 notes) = 5 文件；M2 DD-1 报告 commit 后总计 6 文件（DD-1 报告 commit 即更新 tracked 重锚）**。**v0.4 升级前向交付物** = 3 文件（CHANGELOG + README + M2 DD-1 报告）；**audit-scope + prompt** = 2 文件（留 notes/ 归档）。

## §6 后续 Codex 复审预期

- v0.4 升级前向交付物 grep `Fable 5|GLM 5.3|MiniMax-M3` = 0 ✓
- v0.4 升级范围 grep `sk-[a-z0-9]{32,}` = 0 ✓
- v0.4 升级范围 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域>` = 0 行 ✓
- v0.4 升级范围 `grep "profile: web" wrapper/` = 0 行 ✓
- v0.4 升级范围 `grep "profile: headless" wrapper/` ≥ 3 ✓
- §4.5 M2 多 host 守门正式启用（v0.3 §4.5 "预备" → v0.4 §4.5 "正式启用"；GATE-CALIB 校准：IP 排除 node_modules + H5 pattern `[a-z][a-z0-9-]*`）
- §4.6 M2 STT 守门正式启用（v0.3 §4.6 "预备" → v0.4 §4.6 "正式启用"；GATE-CALIB 校准：tmp 排除 test/ + whisper pattern `[^/$]` 排除 `${`）
- §4.7 M2 Web Push 守门正式启用（v0.3 §4.7 "预备" → v0.4 §4.7 "正式启用"；GATE-CALIB 校准：VAPID 公钥期望反向 == 0，env-inject-only 较"可入 commit"更严）
- 历史文档豁免口径锚定（tracked 重锚 post-M2 = 103，实测 45 文件 103 行 / 2026-09-02 FIX-2 后重测；演进链：91 预估 → 97 CALIB → 101/103 FIX-2 → 107 PROMPT-SYNC 实测；v0.3 85 + M2 实施报告群 12 + GATE-CALIB exec 4 + FIX-2 exec 2 + PROMPT-SYNC exec 4 = 107；47 文件；M2 起草 6 已在 85 内含不重复计）
- Codex 提交铁律：用户亲提 `gpt-5.6-sol` + `xhigh`；Claude 不亲提
- 下一站：v0.4 升级 PASS → M3 阶段 GA final 准备（v1.1 周期收口）

---

## §7 教训记档（v0.4 HYGIENE-FIX-2 F-3）

**教训（v0.4，第八次锚定事故）**：修复 commit 自带的执行书/报告含 grep pattern 字面 → **commit 前必须预演自引入增量**（v0.3 #39 / v0.4 #46/#47 先例），锚定期望值以 **post-commit 实测** 为准，**禁止** 仅按公式预估。

**事故复盘**：
- v0.4 GATE-CALIB 修复 commit `277cdf8` 包含 16 文件改动，其中 `docs/DISPATCH-T-M2-V0.4-GATE-CALIB.md` §3 验收命令含 grep pattern 字面 ×4
- 该自引入未在 commit 前按 v0.3 #39 先例即时入列 audit-scope 主表，导致实测锚定 101/44 文件 ≠ 声明 97/43 文件（第八次锚定漂移）
- Codex formal 复审 `notes/codex-review-v1.1-m0c-v0.4-formal-report.md` §5.2 F-1 检出
- 修法：audit-scope 主表补 #46 GATE-CALIB exec 4 行；本次 HYGIENE-FIX-2 commit 预演 #47 FIX-2 exec 2 行 → 终态 101 + 2 = 103（commit 后以实测为准）

**v0.5 audit-scope 纪律（前置 hard rule）**：
- **先行起草**：commit 任何 audit-scope 引用文件前，必先起草 audit-scope §1/§1.5/§4.5 §6
- **commit 后立即复审**：commit 后 24h 内必跑 §2 验收命令矩阵（特别 §1 锚定命令），实测 ≠ 预期即追加 fix
- **自引入预演入列**：执行书/报告含 grep 字面时，**commit 前** 必在 audit-scope §1.5 主表预演 #N+1 行（按 v0.3 #39 / v0.4 #46/#47 先例）
- **commit message 附实测**：commit message 必含 §1 锚定实测数（如 `tracked 重锚 post-M2 实测: 103 / 45 文件`）

---

*hygiene audit-scope — v0.4 升级 6 文件改动守门 by-design（grep 字面移到 notes/；范围限定前向交付物口径 CHANGELOG.md + README.md + docs/reports/T-M2-DD-1-report.md）；启用 §4.5/§4.6/§4.7 M2 三守门从"预备"到"正式"（v0.3 起草时 M2 未实施，v0.4 启用时 M2 5 DISPATCH 均已 commit）；继承 v0.3 §1.5 历史文档豁免清单 37 文件 85 行 + tracked 重锚 post-M2 实测 107（v0.4 PROMPT-SYNC commit `59ccce0` 后实测 47 文件 / 预演 3 实测 4 +1 漂移已修）+ §4.5 IP 白名单注记 + §7 教训记档（第八次锚定事故）+ §1.5 #46/#47/#48 即时入列先例*

Co-Authored-By: Claude Code <noreply@anthropic.com>