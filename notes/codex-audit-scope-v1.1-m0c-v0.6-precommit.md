# Codex Audit-scope — v1.1 M0c v0.6 升级 + M3 GA final 实施 PASS hygiene 守门

> **Date**: 2026-09-03
> **Purpose**: v0.6 升级 = M3 GA final 阶段（v1.1 周期收口）+ M3-EXEC-3 wrapper/ stub 替换守门 + ADR 0011 closure 公告 + v1.1.0 GA tag 准备
> **Why**: v0.5 升级 M3 GA final 阶段准备（8 文件：CHANGELOG [1.1.0] GA + README v1.1 final + plan v0.4 + ADR 0011 NEW + DISPATCH-T-M3 NEW + 2 audit-scope + cc-ready flip；commit `3d24eeb` PASS + DISK-CALIB 收口 commit `c4a4e39`）；v0.6 升级承接 v0.5 hygiene 守门并新增：(1) M3 EXEC 实施包（wrapper/ stub 替换 + 4 broken URL paths + env delete order + §7 ECDSA 断言）；(2) M3-EXEC-5 ADR 0011 closure 公告（9 段含 #8 verification checklist + #9 GA tag trigger）；(3) v0.6 hard rule (f) 「DER→raw r||s 验证命令（grep createSign/asn1 == 0 + node ad-hoc 86 字符）」内化为固定动作；(4) 4 E2E 套件 + 6 Funnel 路径完整枚举（per Plan agent 2026-09-03 review）
> **How to apply**: v0.6 升级 11 文件改动守门统一引用本 §1-§8；本文件保留字面 grep pattern 用作后续 Codex 复审 hygiene anchor。

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类，继承 v0.5 §1）

```bash
# v0.6 升级前向交付物（CHANGELOG + README + v1.1 GA plan + ADR 0011 + 公告 + release notes）不锁型号（实测 == 0）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: 0 行

# 历史文档豁免口径锚定（tracked 重锚 post-v0.6，引用式）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == audit-scope §1.5 主表合计（唯一权威源；v0.6 实测 = **117 / 49 文件**；演进链 91→97→101→103→107→114→117；禁公式预测，以实测为准）

# 历史文档豁免口径锚定（disk 口径 == tracked + 本 audit-scope 自伤）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md | wc -l
# 期望: == audit-scope §1.5 主表 disk 行（v0.6 实测 = **124** = docs/adr/spec tracked 117 + 本文件自伤实测 7；三源同值）

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md | wc -l
# 期望: == 7（实测：§1 ×2 + §1.5 主表 ×1 + §4.5 ×1 + §6 ×1 + §7 ×1；起草预估 ≥8 系 over，按实测校准）

# wrapper/ stub 替换 守门（v0.6 NEW §1.4；per Codex v0.6 复审校准——createSign 系合规 API 不禁，禁的是 DER 编码）：
grep -c "dsaEncoding: 'ieee-p1363'" wrapper/dsh/vapid_keys.ts  # ≥ 1（RFC 8292 §3.2 raw r||s 64B 正确签名编码；实测 2）
grep -ciE "asn1|der\b" wrapper/dsh/vapid_keys.ts  # == 0（禁 DER/ASN.1 编码输出）
grep -c "signVapidJwt" wrapper/dsh/vapid_keys.ts  # ≥ 1（export function；实测 3）
```

**含义**：v1.1+ 周期模型决策遵守 NORTH-STAR A-4 等价类约束；v0.6 升级前向交付物均不含具体型号字面；ADR 0011 + 公告 + release notes 走 §1.5 自伤豁免（与 ADR 0001-0010 同口径）。

### §1.5 历史文档豁免清单（tracked 重锚 v0.6 实测后 = 引用式本节；本主表 = 锚定唯一权威源，prompt/报告一律引用不复制数字）

继承 v0.5 §1.5 docs 主表 49 文件 117 行 + notes 自伤小节 2 文件；v0.6 升级范围（wrapper/ 3 文件不入 §1 命令范围 + 公告/release notes docs 命中实测 0 + audit-scope/prompt v0.6 notes 自伤）= **tracked 终态 117 / 49 文件（v0.6 实测）+ disk 124（= 117 + 本文件自伤实测 7）三源同值**。

**v0.6 升级范围**（11 文件）：

| # | 文件 | 操作 | docs/ 命中增量 | 自伤豁免 |
|---|------|------|----------------|----------|
| 1 | `wrapper/dsh/vapid_keys.ts` | Edit（加 `signVapidJwt` ECDSA P-256 函数 + import `sign`）| 0 | wrapper/ 不入 §1 命令范围 |
| 2 | `wrapper/orchestrator/webpush_gateway.ts` | Edit（L156 stub → signVapidJwt + L180-187 删 stub + L23 import 删 createHmac）| 0 | wrapper/ 不入 §1 命令范围 |
| 3 | `wrapper/test/integration/webpush_e2e.test.ts` | Edit（4 broken URL paths `../` → `../../` + env delete order + §7 ECDSA 断言 describe block）| 0 | wrapper/ 不入 §1 命令范围 |
| 4 | `notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md` | NEW（本文件）| 0 | notes/ 不入主合同 |
| 5 | `notes/codex-audit-scope-v1.1-m0c-v0.6-precommit-prompt.md` | NEW（配套 Codex 复审 prompt）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 6 | `docs/announcements/adr-0011-closure.md` | NEW（ADR 0011 closure 公告 9 段）| **0（v0.6 实测）** | docs/ 入主合同（#54）|
| 7 | `CHANGELOG.md` | Edit（[1.1.0] GA 段补「M3 EXEC PASS」+ M3-EXEC-3 stub 替换条 + cross-ref）| 0 | grep 字面 0 行 |
| 8 | `README.md` | Edit（v1.1 final 段补 M3 EXEC 状态 + stub 替换说明 + GA tag 命令升级）| 0 | grep 字面 0 行 |
| 9 | `docs/v1.1-ga-team-plan.md` | Edit（v0.4 → v0.5 升级：M3 GA final 收口 + ADR 0011 公告 cross-ref）| 0 | grep 字面 0 行 |
| 10 | `docs/DOCS-RELEASE-NOTES-v1.1.0.md` | NEW（GA release notes）| **0（v0.6 实测）** | docs/ 入主合同（#55）|
| 11 | `docs/poll/cc-ready.json` | Edit（task_id → T-M3-EXEC-PASS + status 翻牌 + 11 文件清单）| 0 | grep 字面 0 行 |

**docs 主表**（继承 v0.5 §1.5 #1-#53 49 文件 117 行；v0.6 docs 增量实测 **0**（公告 #54 0 + release notes #55 0 + CHANGELOG/README/plan/cc-ready 0；wrapper 3 文件不入 §1 命令范围）= **tracked 终态 117 / 49 文件 + disk 124（117 + audit-scope 自伤 7）/ 50 文件 disk，实测三源同值**；演进链 91→97→101→103→107→114→117，公式预测已废弃（per Codex v0.6 复审裁定，原「~214」系 Plan agent 范围误算噪音，删）。

**v0.6 实测公式**（post-M3-EXEC-3 + M3-EXEC-5 commit 后实测）：

```bash
# tracked 验收命令（git add 所有 v0.6 文件后）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 实测后填入本节 tracked 行

# disk 验收命令
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md | wc -l
# 实测后填入本节 disk 行
```

**v0.6 主表新增条目**（实测后填）：
- 🆕 #54 `wrapper/dsh/vapid_keys.ts` +1 `signVapidJwt` 函数（不在 docs/ 范围，不入 tracked；wrapper/ 不入 §1 命令）
- 🆕 #55 `wrapper/test/integration/webpush_e2e.test.ts` 4 URL path 修复 + §7 describe block（不在 docs/ 范围，不入 tracked）
- 🆕 #56 `docs/announcements/adr-0011-closure.md` NEW 实测行数（入 tracked）
- 🆕 #57 `docs/DOCS-RELEASE-NOTES-v1.1.0.md` NEW 实测行数（入 tracked）
- v0.6 audit-scope 自伤实测行数（notes/ 自伤豁免不入 tracked + 仅本文件计入 disk）

**豁免口径不变**（per M0b plan §3 L89 C2 裁定 + v0.5 §1.5 末段）：**不清洗历史文档**（考古记录 + git 尾注 + DISPATCH §2/§4 验证命令字面均保留）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训，继承 v0.5 §2 + M3-EXEC-3 stub 替换强化）

```bash
# v0.6 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: 0 行

# 仅 env-inject only 占位（合规）：
grep -rE "env-inject only|env:[A-Z_]+|process\.env\.[A-Z_]+" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: ≥ 6（CHANGELOG + README + v1.1 GA plan + ADR 0011 + 公告 + release notes 各含 env-inject 字样）

# VAPID 私钥守门（M3-EXEC-3 stub 替换后实测 = 0）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: 0 行（VAPID 私钥仅 env-inject）

# signVapidJwt 内部 JWK 处理守门（v0.6 NEW §2.5 — 不硬编码 d 参数）：
grep -E "d:\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/dsh/vapid_keys.ts wrapper/orchestrator/webpush_gateway.ts | wc -l  # == 0
```

**含义**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY 等敏感 API key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；M3 EXEC §2.5 新增 signVapidJwt JWK 处理合规守门（不得硬编码 d 参数）。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)，继承 v0.5 §3 + ADR 0011 强化）

```bash
# v0.6 升级不动 v1.0 runtime 区域（commit v1.0.0 tag 后 0 漂移）：
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' 'adr/0010-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行

# v1.0 GA plan + 9 ADR body 不动（v1.0 runtime 9 ADR immutable per T-DD-6；ADR 0010/0011 是 v1.1+ 新增不入此检查）：
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0 行

# ADR 0011 closure 合规（继承 v0.5 §3.3）：
grep -c "Status=" adr/0011-v1.1-cycle-closure.md
# 期望: ≥ 1（Status=Accepted）

# wrapper/ stub 替换 v1.0 runtime 影响守门（v0.6 NEW §3.4）：
git diff v1.0.0..HEAD -- wrapper/ | wc -l  # v0.5 已 = +5010c27 实施包 6 文件 + 277cdf8 GATE-REPAIR-2；v0.6 + M3-EXEC-3 3 文件 = 增量实测
```

**含义**：v0.6 升级 wrapper/ stub 替换（M3-EXEC-3 3 文件）+ docs/announcements + docs/release-notes + 2 notes + cc-ready = 11 文件；不触及 harness/spec/spikes/9 ADR body/ADR 0010/Dockerfile/docker-compose.yml/pyproject.toml/v1.0 GA plan。

## §4 dsh `headless` profile 守门（M1c TG-1 + M2 BE-1 预备，继承 v0.5 §4）

```bash
# M1c wrapper 实调 dsh 必须用 headless profile（per M0b QA-1 §6.X 修订）：
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# 期望: 0 行（M0c skeleton 已用 headless；M1c 严禁 web profile）

# 期望出现 headless profile（M0c skeleton + M1c 实施）：
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# 期望: ≥ 3（orchestrator + dsh_client + tool_provider 三处）
```

## §4.5 M2 多 host 守门正式启用（多 host 拓扑漂移风险；v0.5 §4.5 继承 + §4.5.5 单 host 现实注记继承）

```bash
# M2 6 host 拓扑：1 newvps 主 + 5 边缘 host（east-1/west-1/asia-1/eu-1/sa-1）
# 容器 IP 不锁守门（继承 v0.4 §4.5 GATE-CALIB 校准：命令范围排除 node_modules）：
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | grep -v "127.0.0.1" | wc -l
# 期望: 0 行

# Tailscale MagicDNS 域名使用守门（继承 v0.4 §4.5）：
grep -rE "ts\.net" deploy/ docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: ≥ 1（边缘 host 必须用 MagicDNS 名；公告 + release notes 引用 Funnel URL）

# 边缘 host 健康端点 + Funnel URL（继承 v0.5 §4.5 H5 pattern fix）：
grep -rE "https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/" docs/ deploy/ | wc -l
# 期望: ≥ 1（实测 v0.5 起草 = 1：仅 newvps Funnel URL；5 edge host Funnel 待 user 真实 provision）
```

**含义**：M2 多 host 拓扑中容器互联若锁 IP，host 重启/迁移后立即断连；必须用 container_name + Tailscale MagicDNS。

## §4.6 M2 STT 守门正式启用（音频隐私；v0.5 §4.6 继承）

```bash
# M2 STT 录音不留盘守门（v0.5 §4.6 继承）：
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ | wc -l
# 期望: 0 行

# 临时缓存目录路径合规守门（v0.5 §4.6 GATE-CALIB 校准：tmp 排除 test/）：
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
# 期望: 0 行

# Whisper 模型缓存目录合规守门（v0.5 §4.6 GATE-CALIB 校准：whisper pattern `[^/$]` 排除 `${`）：
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l
# 期望: 0 行
```

## §4.7 M2 Web Push 守门正式启用（VAPID key 泄漏；v0.5 §4.7 继承 + M3-EXEC-3 stub 替换强化）

```bash
# VAPID 私钥不入 commit 守门（v0.5 §4.7 继承 + v0.6 §2.5 强化）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: 0 行

# VAPID 公钥 env-inject-only 合规（v0.5 §4.7 GATE-CALIB 校准：期望反向 == 0）：
grep -rE "vapid_public_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PUBLIC\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" deploy/ env/ | wc -l
# 期望: == 0
# 白名单（per Codex v0.6 复审裁定 2026-09-03）：公钥**裸文件** `deploy/vapid_public.key`（87B base64url，RFC 8292 公钥本为公开分发物，per wrapper/dsh/vapid_keys.ts L8/L80「SAFE to commit」实现契约）以单文件白名单入库——赋值式 pattern 期望仍 == 0（防字面散布）；公钥文件不入锚定范围（deploy/ 在 §1 命令范围外）；私钥文件严禁落盘（实测 disk 仅公钥 1 文件）

# Web Push 端点合规守门（v0.5 §4.7 继承）：
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: ≥ 4（FCM + Mozilla + WNS + APNs 四大白名单）

# M3-EXEC-3 stub 替换守门（v0.6 NEW §4.7.5）：
grep -rE "hmacSha256\s*\(\s*signingInput" wrapper/ | wc -l  # == 0（stub 删除确认）
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2（vapid_keys.ts export + webpush_gateway.ts 调用）
grep -rE "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1（合规的 createSign 配合 dsaEncoding 选项）
grep -rE "dsaEncoding\s*:\s*['\"]ieee-p1363['\"]" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1（raw r||s 输出必填）
grep -c "asn1\|DER→raw\|derToRaw" wrapper/dsh/vapid_keys.ts  # ≥ 0（post-processing 可选；dsaEncoding 选项是首选合规路径）
```

**含义**：v0.6 §4.7.5 新增 stub 替换守门 — `hmacSha256` 调用必须消失（stub 删除）+ `signVapidJwt` 必须 ≥ 2 处（export + 调用）+ `createSign('SHA256')` 必须消失（避免默认 DER 输出）+ DER→raw post-processing 必须存在（asn1/derToRaw/dsaEncoding 任一关键字）。

## §5 v0.6 升级 11 文件 hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
| 1 | `wrapper/dsh/vapid_keys.ts` | 无 | 无（+ signVapidJwt 函数）| ✅ wrapper/ 不入主合同 |
| 2 | `wrapper/orchestrator/webpush_gateway.ts` | 无 | 无（- stub + - import + 调用点替换）| ✅ wrapper/ 不入主合同 |
| 3 | `wrapper/test/integration/webpush_e2e.test.ts` | 无 | 无（4 URL paths + env delete order + §7 ECDSA 断言）| ✅ wrapper/ 不入主合同 |
| 4 | `notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md` (NEW 本文件) | 含字面（自伤豁免）| 本文件 | ✅ notes/ 不入主合同 |
| 5 | `notes/codex-audit-scope-v1.1-m0c-v0.6-precommit-prompt.md` (NEW 配套 prompt) | 含字面（自伤豁免）| §1.5 引用 | ✅ notes/ 不入主合同 |
| 6 | `docs/announcements/adr-0011-closure.md` (NEW) | v0.6 实测后填 | §1.5 / §4 引用 | ✅ §1.5 自伤豁免 |
| 7 | `CHANGELOG.md` | 无 | 无（[1.1.0] GA 段补「M3 EXEC PASS」）| ✅ |
| 8 | `README.md` | 无 | 无（v1.1 final 段补 M3 EXEC 状态）| ✅ |
| 9 | `docs/v1.1-ga-team-plan.md` | 无 | 无（v0.4 → v0.5 升级）| ✅ |
| 10 | `docs/DOCS-RELEASE-NOTES-v1.1.0.md` (NEW) | v0.6 实测后填 | §1.5 引用 | ✅ §1.5 自伤豁免 |
| 11 | `docs/poll/cc-ready.json` | 无 | 无（task_id → T-M3-EXEC-PASS + 11 文件清单）| ✅ |

**v0.6 升级总改动：3 文件 wrapper/ stub 替换 + test 修复（vapid_keys + webpush_gateway + webpush_e2e test）+ 2 文件 v0.6 audit-scope + 5 文件公告/release + 1 文件 cc-ready = 11 文件**。

**v0.6 升级前向交付物** = 6 文件（CHANGELOG + README + v1.1 GA plan + ADR 0011 + 公告 + release notes）；**audit-scope + prompt** = 2 文件（留 notes/ 归档）；**cc-ready.json** = 1 文件翻牌；**wrapper/** = 3 文件代码改动（不入主合同）。

## §6 后续 Codex 复审预期 + M3 GA final 路径选择

- v0.6 升级前向交付物 grep `Fable 5|GLM 5.3|MiniMax-M3` = 0 ✓
- v0.6 升级范围 grep `sk-[a-z0-9]{32,}` = 0 ✓
- v0.6 升级范围 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域>` = 0 行 ✓
- v0.6 升级范围 `grep "profile: web" wrapper/` = 0 行 ✓
- v0.6 升级范围 `grep "profile: headless" wrapper/` ≥ 3 ✓
- §4.5.5 单 host 现实注记落地（5 edge host 缺口挂账 user 真实 provision）
- §2.5 signVapidJwt JWK 处理合规守门启用
- §4.7.5 M3-EXEC-3 stub 替换守门启用
- §3.3 ADR 0011 closure Status=Accepted 合规
- tracked 锚定 post-v0.6 实测后填 = 引用式 audit-scope §1.5 主表合计（v0.6 + DISK-CALIB 实测）
- Codex 提交铁律：用户亲提 `gpt-5.6-sol` + `xhigh`；Claude 不亲提
- 下一站：v0.6 升级 PASS → **v0.6 Codex formal 复审 PASS**（user 亲提；plan §5.3 复审环境注记）→ **v1.1.0 GA tag**（user 亲提 git tag）

---

## §7 教训记档（v0.6 NEW — M3-EXEC-3 stub 替换实战 + DER→raw r||s 复杂度 + broken URL paths + 引用式纪律延伸至 disk）

**v0.6 教训（2026-09-03 立）**：

1. **DER vs raw r||s API 差异（v0.6 NEW — Plan agent 关键修正）**：
   - **病灶**：原 plan 用 `createSign('SHA256').sign(key)` 默认 DER 输出（~70-72 字节）— 错误选择；RFC 8292 ES256 VAPID JWT 需要 raw r||s 64 字节
   - **修法**：用 `sign('SHA256', data, key, { dsaEncoding: 'ieee-p1363' })` 选项直接拿 raw，或 `createSign('SHA256').sign({ key, dsaEncoding: 'ieee-p1363' })`，或 DER→raw post-processing（兜底）
   - **机制条款**：v0.6 §4.7.5 「`createSign('SHA256')` 必须消失」守门 + 验证命令「`signVapidJwt` ad-hoc 输出必须 86 字符 base64url no padding」；Node.js 20+ 支持 dsaEncoding 选项，但保险起见可写 DER→raw 转换函数作为 fallback
   - **实战坑**：vapid_keys.ts L121-125 `privateKeyBase64url = Buffer.from(jwkPrivate.d, 'base64').toString('base64url')` 实际是 identity（decode → encode）但保持 base64url 格式——signVapidJwt 入参与 generateVapidKeyPair 出参格式对齐，OK

2. **broken URL paths + vitest stripJsExtensionPlugin 副作用**：
   - **病灶**：Explore agent 2026-09-03 实测 webpush_e2e.test.ts 当前 7 FAIL/22 PASS — 4 个 broken URL paths（`new URL('../orchestrator/...')` 应 `../../orchestrator/...`，因 test 在 `wrapper/test/integration/`）
   - **vitest.config.ts stripJsExtensionPlugin 影响**：L28 `importer.startsWith('/')` 判断 — vitest `import.meta.url` 解析为 `file://...` URL 形式（绝对路径），所以走 `dirname(importer)` 路径；但若 `importer` 是 `node_modules` 内的模块则 baseDir = rootDir（cwd）
   - **修法**：4 处 replace_all 改 URL 字符串即可；与 stripJsExtensionPlugin 无关（plugin 只处理 `.js` 扩展名替换）
   - **机制条款**：v0.6 §5 「`new URL('../orchestrator/'` 必须 == 0 + `new URL('../../orchestrator/'` 必须 ≥ 4」守门

3. **env delete order + vitest env 隔离**：
   - **病灶**：原代码 `const originalKey = process.env['VAPID_PRIVATE_KEY']; delete process.env[...]` — delete 在 has-check 之前，但 finally 恢复时 `if (originalKey)` 用 truthy 判断 — 当 originalKey 是空字符串时会丢失
   - **修法**：`if (originalKey !== undefined) delete` + finally `if (originalKey !== undefined) restore`
   - **机制条款**：v0.6 §5 「env-inject 守门」+ vitest setup file `.env.local` 加载顺序文档化

4. **引用式纪律延伸至 disk 口径（v0.5 §7.3 ② 升级）**：
   - v0.5 立 disk 口径纳入「命令 == 期望 == 主表」三源同值 + 权威源单点维护
   - v0.6 立公式预测不准（Plan agent 风险评估 MEDIUM）— v0.6 §1.5 主表新增条目行数 **实测后填**，不复制 Plan agent 公式预测数字
   - prompt/DISPATCH/公告/release notes 引用演进链终值时**只引用 audit-scope §1.5 主表唯一权威源**

5. **3 commits 拆分（Plan agent 推荐，单 commit 大改）**：
   - commit 1 `feat(v1.1): M3-EXEC-3 stub 替换 + test 修复` — 3 文件 wrapper/
   - commit 2 `docs(v1.1): M3-EXEC-5 ADR 0011 closure + release notes` — 5 文件公告/release
   - commit 3 `chore(v1.1): v0.6 audit-scope + cc-ready flip` — 3 文件 audit-scope + cc-ready
   - 3 commits 全部 push via Clash proxy

6. **Plan agent 4 E2E 套件 + 6 Funnel 路径枚举（user 必须执行）**：
   - **4 E2E 套件**：webpush_e2e.test.ts（22 tests / stub 替换 + URL paths 修复后预期 20 passed / 2 failed 仅 §5 §6 真机网络）+ stt_e2e.test.ts + dsh_6host.test.ts + 6host_e2e.test.ts
   - **6 Funnel 路径**：/ + /health + /api/v1/tasks + /api/v1/status/test + /api/v1/worker/heartbeat + /api/v1/push/subscribe

---

*hygiene audit-scope — v0.6 升级 11 文件改动守门 by-design；继承 v0.5 §1-§7 hygiene + 启用 §2.5 signVapidJwt JWK 合规 + §4.7.5 stub 替换守门 + §3.4 wrapper/ v1.0 影响；tracked 锚定 post-v0.6 实测后填（公式预测不准，禁复制绝对数字）；M3 GA final 路径 A 推荐（单 host v1.1 GA）+ 5 edge host 缺口挂账；下一站 v1.1.0 GA tag（user 亲提）*

Co-Authored-By: Claude Code <noreply@anthropic.com>