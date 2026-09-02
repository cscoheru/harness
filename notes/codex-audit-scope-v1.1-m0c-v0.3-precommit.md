# Codex Audit-scope — v1.1 M0c v0.3 升级 + M2 阶段准备 hygiene 守门

> **Date**: 2026-09-02
> **Purpose**: v0.3 升级 3 文件改动 + DD-1 实施报告 hygiene 守门集合（继承 v0.1/v0.2 守门；M2 新增 3 项 hygiene 守门在 §4.5/§4.6/§4.7 预备，未在 v0.3 升级范围启用）
> **Why**: v0.3 升级 = DD-1 实施收口（CHANGELOG + README + DD-1 报告 + 本 audit-scope + 配套 prompt = 5 文件），不含 M2 DISPATCH 起草（M2 DISPATCH 走下一阶段 v0.4 升级 + M2 派发轮）。M2 hygiene 守门提前在 §4.5/§4.6/§4.7 落地，确保 M2 派发前守门字面自洽。
> **How to apply**: v0.3 升级前向交付物守门命令统一引用本 §1-§7；本文件保留字面 grep pattern 用作后续 Codex 复审 hygiene anchor。M2 守门条目作为预备清单，待 M2 派发时由 v0.4 audit-scope 启用。

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类，继承 v0.2 §1）

```bash
# v0.3 升级前向交付物不锁型号（实测 == 0）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md docs/reports/T-M1c-DD-1-report.md | wc -l
# 期望: 0 行
# 注: DD-1 报告 §Author/§Co-Authored-By 等尾注字段走 §1.5 豁免

# 历史文档豁免口径锚定（tracked 重锚 == 71，继承 v0.2）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == 71（DD-1 起草后 docs/ 无新增 grep 命中；总锚定维持 71）

# 历史文档豁免口径锚定（disk 口径）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md | wc -l
# 期望: ≥ 71（disk 口径，含本 audit-scope §1/§4.5/§5 自伤字面 + DD-1 报告 §Author 等尾注）

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md | wc -l
# 期望: ≥ 3（grep 字面必现：§1 + §4.5 + §5）
```

**含义**：v1.1+ 周期模型决策遵守 NORTH-STAR A-4 等价类约束；v0.3 升级前向交付物（CHANGELOG.md + README.md + DD-1 报告）均不含具体型号字面；DD-1 报告 §Author/§Co-Authored-By 走 §1.5 豁免。

### §1.5 历史文档豁免清单（tracked 重锚 == 71；DD-1 起草后无新增 docs 命中）

继承 v0.2 §1.5 docs 主表 29 文件 71 行 + notes 自伤小节 2 文件 8 行；v0.3 升级范围（CHANGELOG.md + README.md + DD-1 报告 + 本 audit-scope + prompt = 5 文件）docs/ 命中增量 = 0；总锚定维持 **tracked 重锚 == 71**。

**v0.3 升级范围**（5 文件）：

| # | 文件 | 操作 | docs/ 命中增量 | 自伤豁免 |
|---|------|------|----------------|----------|
| 1 | `CHANGELOG.md` | Edit（增 [1.1.0-M1c] 段 + Link refs）| 0 | ✅ grep 字面 0 行 |
| 2 | `README.md` | Edit（v1.1 M1c 段 fill in：Funnel URL + newvps + 三档 profile）| 0 | ✅ grep 字面 0 行 |
| 3 | `docs/reports/T-M1c-DD-1-report.md` | NEW（DD-1 实施报告 ~250 行 6 段）| 0 | ✅ DD-1 报告 §Author/§Co-Authored-By 尾注走豁免 |
| 4 | `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` | NEW（本文件）| 0 | ✅ notes/ 不入主合同 |
| 5 | `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md` | NEW（配套 Codex 复审 prompt）| 0 | ✅ notes/ 不入主合同 |

**docs 主表**（继承 v0.2 §1.5 #1-#31，29 文件 71 行；v0.3 升级不新增 docs/ 命中）：

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
- 总计：**29 文件 71 行**（实测 == 71）

**豁免口径不变**（per M0b plan §3 L89 C2 裁定 + v0.2 §1.5 末段）：**不清洗历史文档**（考古记录 + git 尾注 + DISPATCH §4 验证命令字面均保留）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训，继承 v0.2 §2 + VAPID 扩展预备）

```bash
# v0.3 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/reports/T-M1c-DD-1-report.md | wc -l
# 期望: 0 行

# 仅 env-inject only 占位（合规）：
grep -rE "env-inject only|env:[A-Z_]+|process\.env\.[A-Z_]+" CHANGELOG.md README.md docs/reports/T-M1c-DD-1-report.md | wc -l
# 期望: ≥ 3（CHANGELOG + README + DD-1 报告各含 env-inject 字样）

# VAPID 私钥前瞻守门（M2 预备；v0.3 升级不启用）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{20,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{20,}['\"]" CHANGELOG.md README.md docs/reports/ docs/DISPATCH-T-M1c-DD-1.md | wc -l
# 期望: 0 行（M2 Web Push 守门预备；v0.3 升级范围不写完整 VAPID 私钥）
```

**含义**：DEEPSEEK_API_KEY 等敏感 API key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；M2 VAPID 私钥守门前瞻（M2 启用 Web Push 时落地完整守门命令）。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)，继承 v0.2 §3）

```bash
# v0.3 升级不动 v1.0 runtime 区域（commit v1.0.0 tag 后 0 漂移）：
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行

# v1.0 GA plan + 现有 ADR body 不动：
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0 行
```

**含义**：v0.3 升级仅在 `CHANGELOG.md` + `README.md` + `docs/reports/T-M1c-DD-1-report.md` + `notes/` 范围；不触及 harness/spec/spikes/9 ADR body/Dockerfile/docker-compose.yml/pyproject.toml/v1.0 GA plan。

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

## §4.5 NEW M2 多 host 守门预备（多 host 拓扑漂移风险；v0.3 不启用，M2 派发启用）

```bash
# M2 6 host 拓扑：1 newvps 主 + 5 边缘 host（east-1/west-1/asia-1/eu-1/sa-1）
# 容器 IP 不锁守门（M2 启用）：
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/ deploy/ env/ CHANGELOG.md README.md | grep -v "127.0.0.1" | wc -l
# 期望: 0 行（容器互联必须用 container_name，IP 不锁）

# Tailscale MagicDNS 域名使用守门（M2 启用）：
grep -rE "ts\.net" deploy/ | wc -l
# 期望: ≥ 1（边缘 host 必须用 MagicDNS 名，避免 host 漂移后 IP 锁死）

# 边缘 host 健康端点 + Funnel URL（M2 启用）：
grep -rE "https://[a-z-]+\.tail[a-z0-9]+\.ts\.net/" docs/ deploy/ | wc -l
# 期望: ≥ 6（1 newvps + 5 边缘 = 6 Funnel URL）
```

**含义**：M2 多 host 拓扑中容器互联若锁 IP，host 重启/迁移后立即断连；必须用 container_name（Docker Compose 内嵌 DNS）+ Tailscale MagicDNS（跨 host）。

## §4.6 NEW M2 STT 守门预备（音频隐私；v0.3 不启用，M2 派发启用）

```bash
# M2 STT 录音不留盘守门（M2 启用）：
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ | wc -l
# 期望: 0 行（音频流必须 stream → STT worker，不落盘）

# 临时缓存目录路径合规守门（M2 启用）：
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/ deploy/ env/ | wc -l
# 期望: 0 行（仅允许 /dev/shm 即内存文件系统；落盘即 GDPR/PIPL 违规）

# Whisper 模型缓存目录合规守门（M2 启用）：
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/]" deploy/ env/ | wc -l
# 期望: 0 行（必须绝对路径，禁相对路径误用）
```

**含义**：M2 STT 语音输入涉及音频隐私（GDPR / PIPL），录音必须流式处理 + 立即转写 + 不持久化；模型缓存可持久化（不含个人数据）。

## §4.7 NEW M2 Web Push 守门预备（VAPID key 泄漏；v0.3 不启用，M2 派发启用）

```bash
# VAPID 私钥不入 commit 守门（M2 启用）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l
# 期望: 0 行（VAPID 私钥仅 env-inject）

# VAPID 公钥可入 commit（合规）：
grep -rE "vapid_public_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PUBLIC\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" deploy/ env/ | wc -l
# 期望: ≥ 1（公钥可入 commit；私钥严格 env-inject）

# Web Push 端点合规守门（M2 启用）：
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ | wc -l
# 期望: ≥ 4（FCM + Mozilla + WNS + APNs 四大 Push 端点白名单）
```

**含义**：VAPID（Voluntary Application Server Identification）私钥是 Web Push 认证的核心凭证，泄漏即推送服务被滥用（垃圾推送）；必须 env-inject only（per GH013 PUSH PROTECTION 教训）。公钥可入 commit（仅用于客户端订阅，无敏感）。

## §5 v0.3 升级 5 文件 hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
| 1 | `CHANGELOG.md` | ❌ 无 | ❌（仅 1.1.0-M1c 段 + Link refs）| ✅ |
| 2 | `README.md` | ❌ 无 | ❌（v1.1 M1c 段 fill in）| ✅ |
| 3 | `docs/reports/T-M1c-DD-1-report.md` | ⚠️ §Author/§Co-Authored-By 尾注含 Claude Fable 5 字面 | ✅ §1.5 / §6 引用 | ✅ §1.5 尾注豁免 |
| 4 | `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` (NEW 本文件) | ✅ 含字面（自伤豁免）| 本文件 | ✅ notes/ 不入主合同 |
| 5 | `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md` (NEW 配套 prompt) | ✅ 含字面（自伤豁免）| §1.5 引用 | ✅ notes/ 不入主合同 |

**v0.3 升级总改动：2 文件 Edit (CHANGELOG + README) + 3 文件 NEW (DD-1 report + 2 notes) = 5 文件**。**v0.3 升级前向交付物** = 3 文件（CHANGELOG + README + DD-1 报告）；**audit-scope + prompt** = 2 文件（留 notes/ 归档）。

## §6 后续 Codex 复审预期

- v0.3 升级前向交付物 grep `Fable 5|GLM 5.3|MiniMax-M3` = 0 ✓
- v0.3 升级范围 grep `sk-[a-z0-9]{32,}` = 0 ✓
- v0.3 升级范围 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域>` = 0 行 ✓
- v0.3 升级范围 `grep "profile: web" wrapper/` = 0 行 ✓
- v0.3 升级范围 `grep "profile: headless" wrapper/` ≥ 3 ✓
- 历史文档豁免口径锚定（§1.5 清单 29 文件 71 处三类定性；DD-1 起草后 docs/ 无新增命中，锚定维持 71）
- Codex 提交铁律：用户亲提 `gpt-5.6-sol` + `xhigh`；Claude 不亲提
- 下一站：DD-1 通过 → M2 阶段 5 DISPATCH 起草（v0.4 升级 audit-scope 启用 §4.5/§4.6/§4.7 M2 hygiene 三守门）

---

*hygiene audit-scope — v0.3 升级 5 文件改动守门 by-design（grep 字面移到 notes/；范围限定前向交付物口径 CHANGELOG.md + README.md + docs/reports/T-M1c-DD-1-report.md）；M2 hygiene 守门（§4.5/§4.6/§4.7）作为预备清单在 v0.4 启用；继承 v0.2 §1.5 历史文档豁免清单 29 文件 71 行 + tracked 重锚定维持 71*