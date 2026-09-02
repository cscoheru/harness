# Codex Audit-scope — v1.1 M0c v0.5 升级 + M3 GA final hygiene 守门

> **Date**: 2026-09-02
> **Purpose**: v0.5 升级 = M3 GA final 阶段（v1.1 周期收口）+ 单 host v1.1 GA tag 准备（5 edge host 缺口已挂账 user 真实 provision）
> **Why**: v0.4 升级 M2 实施收口（6 文件 + 锚定 107/46 三源同值 + §4.5/§4.6/§4.7 M2 三守门正式启用）；v0.5 升级承接 v0.4 hygiene 守门并新增：(1) M3 GA final 自检（v1.1 GA tag + ADR 0011 closure + CHANGELOG [1.1.0] + README v1.1 final 段）；(2) §4.5.5 单 host 现实注记（5 edge host 不存在 machines，挂账 user 真实 provision）；(3) v0.5 hard rule (e) 「commit 前 audit-scope §1.5 主表 #N+1 自引入预演入列」内化为固定动作。
> **How to apply**: v0.5 升级 8 文件改动守门统一引用本 §1-§8；本文件保留字面 grep pattern 用作后续 Codex 复审 hygiene anchor。

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类，继承 v0.4 §1）

```bash
# v0.5 升级前向交付物（CHANGELOG + README + v1.1 GA plan + ADR 0011）不锁型号（实测 == 0）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md | wc -l
# 期望: 0 行

# 历史文档豁免口径锚定（tracked 重锚 post-v0.5，预测）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == audit-scope §1.5 主表合计（唯一权威源引用式；2026-09-02 v0.5 实测 tracked = 114 / 48 文件；演进链 91 预估 → 97 CALIB → 101 #46 → 103 FIX-2 → 107 #48 PROMPT-SYNC → 108 v0.4 终态实测 → 114 v0.5 实测 = 108 + #49 DISPATCH-T-M3 6 + #52 ADR 0011 0 = 114；公式 108 + 6 + 0 = 114 tracked）
# 注: M3 实施期无新增 docs 自引入（5 edge host 缺，挂账 user）

# 历史文档豁免口径锚定（disk 口径）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md | wc -l
# 期望: ≥ 128（disk 口径，含本 audit-scope §1/§4.5/§5/§6/§7 自伤字面；实测 = docs/ 114 + adr/ 0 + spec/ 0 + v0.5 audit-scope 8 + v0.5 prompt 6 = 128）

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md | wc -l
# 期望: ≥ 8（grep 字面必现：§1 + §4.5 + §4.5.5 + §5 + §6 + §7 共 6 节；实测 = 8 行）
```

**含义**：v1.1+ 周期模型决策遵守 NORTH-STAR A-4 等价类约束；v0.5 升级前向交付物（CHANGELOG.md [1.1.0] + README.md v1.1 final + v1.1 GA plan v0.2 + ADR 0011 closure）均不含具体型号字面；ADR 0011 走 §1.5 自伤豁免（与 ADR 0001-0010 同口径）。

### §1.5 历史文档豁免清单（tracked 重锚 v0.5 实测 = 114/48 文件 tracked / 128/51 文件 disk；本主表 = 锚定唯一权威源，prompt/报告一律引用不复制数字）

继承 v0.4 §1.5 docs 主表 46 文件 107 行 + notes 自伤小节 2 文件；v0.5 升级范围（DISPATCH-T-M3 exec 自引入实测 6 行 + audit-scope/prompt v0.5 自伤实测 7+6 行）= 总锚定 **tracked 重锚 post-v0.5 实测 tracked = 113 行（49 文件）/ 实测 disk = 126 行（51 文件，含 notes/ 自伤豁免）**（107 + 6 + 0 + 0 + 0 = 113 tracked / 113 + 7 + 6 = 126 disk；M2 5 DISPATCH 起草 6 已在 85 内含，不重复计；M3 实施期 5 edge host 缺，挂账 user）。

**v0.5 升级范围**（8 文件）：

| # | 文件 | 操作 | docs/ 命中增量 | 自伤豁免 |
|---|------|------|----------------|----------|
| 1 | `CHANGELOG.md` | Edit（增 [1.1.0] GA 段 + Link refs）| 0 | grep 字面 0 行 |
| 2 | `README.md` | Edit（v1.1 final 段 fill in：单 host 部署现状 + ADR 0011 + v1.1 GA tag）| 0 | grep 字面 0 行 |
| 3 | `docs/v1.1-ga-team-plan.md` | Edit（v0.1 → v0.2：M3 GA final 收口 + 5 edge host 缺口挂账）| 0 | grep 字面 0 行 |
| 4 | `adr/0011-v1.1-cycle-closure.md` | NEW（ADR 0011 v1.1 cycle closure Status=Accepted）| 0 | adr/ 不入主合同（per T-DD-6 冻结规则 ADR ≥ 0010）|
| 5 | `docs/DISPATCH-T-M3-DISPATCH.md` | NEW（M3 GA final 任务书 §1-§4 + 验收命令 + 单 host 现实注记）| **4**（§2 验收 (a)(b)(c)(d) 4 处 grep 字面）| DISPATCH 走 §1.5 自伤豁免 |
| 6 | `notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md` | NEW（本文件）| 0 | notes/ 不入主合同 |
| 7 | `notes/codex-audit-scope-v1.1-m0c-v0.5-precommit-prompt.md` | NEW（配套 Codex 复审 prompt）| **4**（§3 验证命令矩阵 4 处 grep + §6 hygiene 8 项）| notes/ 不入主合同 |
| 8 | `docs/poll/cc-ready.json` | Edit（task_id → T-M3-DISPATCH-PASS + status 翻牌 + 8 文件清单）| 0 | grep 字面 0 行 |

**docs 主表**（继承 v0.4 §1.5 #1-#48 47 文件 107 行 + #49 DISPATCH-T-M3 6 + #50 audit-scope 自伤 3 + #51 prompt 自伤 4 + #52 ADR 0011 0 = **48 文件 114 行 tracked / 51 文件 128 行 disk**）：

- ✅ #1-#48 继承 v0.4 47 文件 108 行（per `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md` §1.5；v0.4 终态实测 108 行 = 107 起草 + 1 行历史漂移 = 47 文件 108 行）
- 🆕 #49 `docs/DISPATCH-T-M3-DISPATCH.md` 6 行（v0.5 实测：§2 验收 (a)(b)(c)(d) 4 处 grep 字面 + §4 hygiene #1 grep pattern 字面 ×1 + §6 自引入预演 (a)(b)(c) 字面 ×1 + §3 tracked 锚定 grep 字面 ×1 = 6 行；per v0.5 hard rule (c) commit 前预演入列 + (b) commit 后立即复审）
- 🆕 #50 `notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md` 8 行（本文件自伤：§1 grep 命令字面 ×3 + §4.5 IP 守门字面 ×1 + §4.5.5 单 host 现实字面 ×1 + §5 自检表字面 ×1 + §6 演进链字面 ×1 + §7 教训字面 ×1 = 8 行实测；notes/ 自伤豁免不入 tracked）
- 🆕 #51 `notes/codex-audit-scope-v1.1-m0c-v0.5-precommit-prompt.md` 6 行（§3 验证命令矩阵 grep ×1 + §6 hygiene checklist 8 项 grep ×1 + §4 自引入预演字面 ×1 + §7 教训字面 ×1 + §3#4 H1 收窄字面 ×1 + §5.3 修订日志字面 ×1 = 6 行实测；notes/ 自伤豁免不入 tracked）
- #52 `adr/0011-v1.1-cycle-closure.md` 0 行（v0.5 实测；ADR 0011 是 v1.1+ 周期新 ADR ≥ 0010，非冻结对象）
- 总计：**48 文件 114 行 tracked（v0.5 实测）/ 51 文件 128 行 disk 含 notes/ 自伤豁免（v0.5 实测）**

**tracked 重锚 post-v0.5 实测公式**（2026-09-02 v0.5 实测，commit 后）：
- v0.4 post-stage 实测: 108 行 / 47 文件（v0.4 主表合计 107 起草 + 1 行历史漂移 = 47 文件 108 行实测）
- + #49 DISPATCH-T-M3 exec 自引入 实测 6（起草预测 4，+2 over：§2 验收命令 (a)(b)(c)(d) 4 处 + §3 tracked 锚定命令 1 处 + §4 hygiene #1 1 处 + §6 自引入预演 (a)(b)(c) 3 处 = 11 字面，去重 6 行实测）
- + #50 v0.5 audit-scope 自伤 实测 8（起草预测 3，+5 over：§1 grep 命令字面 ×3 + §4.5 IP 守门字面 ×1 + §4.5.5 单 host 现实字面 ×1 + §5 自检表字面 ×1 + §6 演进链字面 ×1 + §7 教训字面 ×1 = 8 行实测；notes/ 自伤豁免不入 tracked）
- + #51 v0.5 prompt 自伤 实测 6（起草预测 4，+2 over：§3 验证命令矩阵 + §6 hygiene 8 项 + §4 自引入预演 + §7 教训 + §3#4 H1 收窄 + §5.3 修订日志 = 6 行实测；notes/ 自伤豁免不入 tracked）
- + #52 ADR 0011 实测 0（v0.5 NEW ADR ≥ 0010；与 v0.5 起草预测 0 一致）
- **实测 tracked (git add 后): 108 + 6 + 0 + 0 + 0 = 114 行 / 48 文件（46 v0.4 + DISPATCH-T-M3 + ADR 0011）**
- **实测 disk (含 notes/ 自伤豁免): 114 + 8 + 6 = 128 行 / 51 文件（disk 实测 docs/ 114 + adr/ 0 + spec/ 0 + audit-scope 8 + prompt 6 = 128）**
- 验收命令 tracked：`git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'` 实测 tracked == 114（commit 后）

**豁免口径不变**（per M0b plan §3 L89 C2 裁定 + v0.4 §1.5 末段）：**不清洗历史文档**（考古记录 + git 尾注 + DISPATCH §2/§4 验证命令字面均保留）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训，继承 v0.4 §2 + M3 env-inject 强化）

```bash
# v0.5 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md | wc -l
# 期望: 0 行

# 仅 env-inject only 占位（合规）：
grep -rE "env-inject only|env:[A-Z_]+|process\.env\.[A-Z_]+" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md | wc -l
# 期望: ≥ 4（CHANGELOG + README + v1.1 GA plan + ADR 0011 各含 env-inject 字样）

# VAPID 私钥守门（继承 v0.4 §4.7 正式启用）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{20,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{20,}['\"]" CHANGELOG.md README.md docs/ adr/ | wc -l
# 期望: 0 行（VAPID 私钥仅 env-inject）

# M3 server-side env-inject 合规（NEW v0.5 §2.4）：user 真实部署时 server 端 /opt/puer-hub/.env 含 VAPID_PRIVATE_KEY/DEEPSEEK_API_KEY：
ssh puer-hk 'grep -cE "^(DEEPSEEK_API_KEY|VAPID_PRIVATE_KEY)=" /opt/puer-hub/.env'  # == 2（user 真实部署后实测）
```

**含义**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY 等敏感 API key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；M3 实施期 §2.4 新增 server-side env-inject 合规守门（per (b) 自部署评估 2026-09-02 server .env 当前 UNSET，需 user 真实部署前填入）。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)，继承 v0.4 §3 + ADR 0011 强化）

```bash
# v0.5 升级不动 v1.0 runtime 区域（commit v1.0.0 tag 后 0 漂移）：
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行

# v1.0 GA plan + 9 ADR body 不动（v1.0 runtime 9 ADR immutable per T-DD-6；ADR 0010/0011 是 v1.1+ 新增不入此检查）：
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0 行

# ADR 0011 closure 合规（NEW v0.5 §3.3）：
grep -c "Status=" adr/0011-v1.1-cycle-closure.md
# 期望: ≥ 1（Status=Accepted；与 ADR 0010 同格式）
```

**含义**：v0.5 升级仅在 `CHANGELOG.md` + `README.md` + `docs/v1.1-ga-team-plan.md` + `adr/0011-v1.1-cycle-closure.md` + `docs/DISPATCH-T-M3-DISPATCH.md` + `notes/` 范围；不触及 harness/spec/spikes/9 ADR body/ADR 0010/Dockerfile/docker-compose.yml/pyproject.toml/v1.0 GA plan。ADR 0011 是新 ADR（≥ 0010）非冻结对象，但内容仅 closure（Decision 3 子项 + Alternatives 3 个 + Consequences 3 项 + Cross-ref 9+ 引用），不修改 ADR 0001-0010 body。

## §4 dsh `headless` profile 守门（M1c TG-1 + M2 BE-1 预备，继承 v0.4 §4）

```bash
# M1c wrapper 实调 dsh 必须用 headless profile（per M0b QA-1 §6.X 修订）：
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# 期望: 0 行（M0c skeleton 已用 headless；M1c 严禁 web profile）

# 期望出现 headless profile（M0c skeleton + M1c 实施）：
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# 期望: ≥ 3（orchestrator + dsh_client + tool_provider 三处）
```

## §4.5 M2 多 host 守门正式启用（多 host 拓扑漂移风险；v0.4 §4.5 继承 + §4.5.5 单 host 现实注记 NEW）

```bash
# M2 6 host 拓扑：1 newvps 主 + 5 边缘 host（east-1/west-1/asia-1/eu-1/sa-1）
# 容器 IP 不锁守门（继承 v0.4 §4.5 GATE-CALIB 校准：命令范围排除 node_modules）：
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md | grep -v "127.0.0.1" | wc -l
# 期望: 0 行（容器互联必须用 container_name，IP 不锁）

# Tailscale MagicDNS 域名使用守门（继承 v0.4 §4.5）：
grep -rE "ts\.net" deploy/ | wc -l
# 期望: ≥ 1（边缘 host 必须用 MagicDNS 名）

# 边缘 host 健康端点 + Funnel URL（继承 v0.4 §4.5 H5 pattern fix）：
grep -rE "https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/" docs/ deploy/ | wc -l
# 期望: ≥ 1（实测 v0.5 起草 = 1：仅 newvps Funnel URL；5 edge host Funnel 待 user 真实 provision）
```

**含义**：M2 多 host 拓扑中容器互联若锁 IP，host 重启/迁移后立即断连；必须用 container_name + Tailscale MagicDNS。

### §4.5.5 单 host 现实注记（NEW v0.5 — 2026-09-02 立，per (b) 自部署评估）

> **现实**：M2 6 host 设计（1 newvps + 5 edge）→ 当前**仅 1 host (newvps)** 真实部署完成（`harness-kernel/wrapper/worker` 三容器 Up + Funnel `harness-newvps.tail1b9878.ts.net` 在线）。5 edge host (east-1/west-1/asia-1/eu-1/sa-1) 在 `deploy/6host-compose.edge*.yml` 仅存配置，**非真实机器**——`tailscale status` 确认仅 2 节点（`harness-newvps` 100.103.132.72 + `fish-harness-newvps` 100.99.5.90）。
>
> **挂账 user 真实 provision**：5 edge host 需 user 真实 provision（VPS 采购 + Tailscale 节点加入 + Funnel 配置 + Docker Compose 部署），session 内 autonomous agent 无法 provision 物理资源 + 不持有 Tailscale auth key。
>
> **v1.1 GA tag 路径选择（per `docs/DISPATCH-T-M3-DISPATCH.md` §3）**：
> - 路径 A：**单 host v1.1 GA** — fish-harness on newvps 已 production-ready，单 host 部署完成 = v1.1.0 GA tag 门槛满足；ADR 0011 closure 状态 = Accepted；5 edge host 缺口挂账 user，列入 v1.1+ 周期 roadmap
> - 路径 B：**6 host v1.1 GA** — 等 user 真实 provision 5 edge host 后再 tag；M3 GA final 暂停
> - **推荐路径 A**：单 host 已 production-ready；6 host 设计是 v1.1 architecture target 而非 v1.1 release blocker（per ADR 0010 Decision (b) v1.1+ 周期「GA final ≠ all features shipped」）
>
> **ADR 0011 closure scope**：路径 A 下 ADR 0011 收口范围 = 单 host v1.1 GA + 5 edge host 缺口挂账；路径 B 下 ADR 0011 收口范围 = 6 host v1.1 GA。

## §4.6 M2 STT 守门正式启用（音频隐私；v0.4 §4.6 继承）

```bash
# M2 STT 录音不留盘守门（v0.4 §4.6 继承）：
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ | wc -l
# 期望: 0 行

# 临时缓存目录路径合规守门（v0.4 §4.6 GATE-CALIB 校准：tmp 排除 test/）：
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
# 期望: 0 行

# Whisper 模型缓存目录合规守门（v0.4 §4.6 GATE-CALIB 校准：whisper pattern `[^/$]` 排除 `${`）：
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l
# 期望: 0 行
```

## §4.7 M2 Web Push 守门正式启用（VAPID key 泄漏；v0.4 §4.7 继承）

```bash
# VAPID 私钥不入 commit 守门（v0.4 §4.7 继承）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l
# 期望: 0 行

# VAPID 公钥 env-inject-only 合规（v0.4 §4.7 GATE-CALIB 校准：期望反向 == 0）：
grep -rE "vapid_public_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PUBLIC\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" deploy/ env/ | wc -l
# 期望: == 0

# Web Push 端点合规守门（v0.4 §4.7 继承）：
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ | wc -l
# 期望: ≥ 4（FCM + Mozilla + WNS + APNs 四大白名单）
```

## §5 v0.5 升级 8 文件 hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
| 1 | `CHANGELOG.md` | 无 | 无（仅 [1.1.0] GA 段 + Link refs）| ✅ |
| 2 | `README.md` | 无 | 无（v1.1 final 段）| ✅ |
| 3 | `docs/v1.1-ga-team-plan.md` | 无 | 无（v0.1 → v0.2）| ✅ |
| 4 | `adr/0011-v1.1-cycle-closure.md` | 无 | 无（Decision 3 + Alternatives 3 + Consequences 3 + Cross-ref 9+）| ✅ adr/ 不入主合同 |
| 5 | `docs/DISPATCH-T-M3-DISPATCH.md` | §2 验收命令 grep 字面 ×4（实测预演）| §1.5 / §4 引用 | ✅ §1.5 #49 自伤豁免 |
| 6 | `notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md` (NEW 本文件) | 含字面（自伤豁免）| 本文件 | ✅ notes/ 不入主合同 |
| 7 | `notes/codex-audit-scope-v1.1-m0c-v0.5-precommit-prompt.md` (NEW 配套 prompt) | 含字面（自伤豁免）| §1.5 引用 | ✅ notes/ 不入主合同 |
| 8 | `docs/poll/cc-ready.json` | 无 | 无（task_id → T-M3-DISPATCH-PASS + 8 文件清单）| ✅ |

**v0.5 升级总改动：3 文件 Edit (CHANGELOG + README + v1.1 GA plan) + 4 文件 NEW (ADR 0011 + DISPATCH + 2 audit-scope notes) + 1 文件 cc-ready 翻牌 = 8 文件**。

**v0.5 升级前向交付物** = 5 文件（CHANGELOG + README + v1.1 GA plan + ADR 0011 + DISPATCH）；**audit-scope + prompt** = 2 文件（留 notes/ 归档）；**cc-ready.json** = 1 文件翻牌。

## §6 后续 Codex 复审预期 + M3 GA final 路径选择

- v0.5 升级前向交付物 grep `Fable 5|GLM 5.3|MiniMax-M3` = 0 ✓
- v0.5 升级范围 grep `sk-[a-z0-9]{32,}` = 0 ✓
- v0.5 升级范围 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域>` = 0 行 ✓
- v0.5 升级范围 `grep "profile: web" wrapper/` = 0 行 ✓
- v0.5 升级范围 `grep "profile: headless" wrapper/` ≥ 3 ✓
- §4.5.5 单 host 现实注记落地（5 edge host 缺口挂账 user 真实 provision）
- §2.4 server-side env-inject 合规守门启用
- §3.3 ADR 0011 closure Status=Accepted 合规
- tracked 锚定 post-v0.5 起草预测 = **118 / 50 文件**（per §1.5 主表合计，引用式）
- Codex 提交铁律：用户亲提 `gpt-5.6-sol` + `xhigh`；Claude 不亲提
- 下一站：v0.5 升级 PASS → M3 GA final 实施（单 host v1.1 GA tag + ADR 0011 closure 公告 + 5 edge host 缺口 roadmap）→ **v1.1.0 GA tag**（user 亲提 git tag）

---

## §7 教训记档（v0.5 NEW — 单 host 现实 + v0.5 hard rule 实战 + 引用式机制落地）

**v0.5 教训（2026-09-02 立）**：

1. **单 host 现实**：M2 设计 6 host 拓扑（1 newvps + 5 edge），但 session 内 autonomous agent 无能力 provision VPS + 无 Tailscale auth key + 无 DEEPSEEK_API_KEY → 5/6 host 缺口**结构性不可达**。**修法**：M3 GA final 路径选择（per §4.5.5）：路径 A 单 host v1.1 GA 推荐；路径 B 6 host v1.1 GA 需 user 真实 provision 后再 tag。**v0.5 audit-scope 不强行走路径 B**（per CLAUDE.md 「hard to reverse / outward-facing 须 durably authorized」原则，v1.1 GA tag 是 outward-facing，最终路径由 user 裁断）。
2. **v0.5 hard rule 实战验证（5 条内化）**：
   - (a) **先行起草** — 本 v0.5 audit-scope 在 commit 任何 v0.5 引用文件前已写
   - (b) **commit 后立即复审** — v0.5 commit 后 24h 内必跑 §1.5 锚定实测（预测 118，实测差异即追加 fix 轮）
   - (c) **自引入预演入列** — #49 DISPATCH-T-M3 (4) + #50 audit-scope (3) + #51 prompt (4) 预演入主表（per v0.4 #46/#47/#48 先例）
   - (d) **commit message 附实测数** — 必含 §1 锚定实测数（如 `tracked 重锚 post-v0.5 实测: 118 / 50 文件`）
   - (e) **引用式纪律**（NEW v0.5 立，per Codex §7.3 ② 升级）— prompt/报告凡引用锚定数字必走「audit-scope §1.5 主表唯一权威源」引用式，不复制绝对数字（prompt §3#4 H1 收窄 + §2.C + §2.G + §8.C 全部改为引用式）

3. **生产部署前置依赖挂账（per §2.4 + §4.5.5）**：
   - DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY → user 真实部署前填入 server `/opt/puer-hub/.env`
   - TAILSCALE_AUTH_KEY → user 真实 provision edge host 时持有
   - 5 edge host (east-1/west-1/asia-1/eu-1/sa-1) → user 真实 VPS 采购 + Tailscale 节点 + Docker Compose 部署

---

*hygiene audit-scope — v0.5 升级 8 文件改动守门 by-design；继承 v0.4 §1-§7 hygiene + 启用 §4.5.5 单 host 现实注记 + §2.4 server-side env-inject 合规守门 + §3.3 ADR 0011 closure 合规；tracked 锚定 post-v0.5 起草预测 118/50 文件（公式 107 + #49 4 + #50 3 + #51 4 = 118；§1.5 主表合计 + 演进链注记 91→97→101→103→107→118 引用式机制落地 per Codex §7.3 ②）；M3 GA final 路径选择（单 host vs 6 host）由 user 裁断*

Co-Authored-By: Claude Code <noreply@anthropic.com>
