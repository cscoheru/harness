# DISPATCH — T-M3-DISPATCH（M3 GA final 阶段准备：单 host v1.1 GA + 5 edge host 缺口挂账）

> **Date**: 2026-09-02
> **触发**: user 「请自行部署，start v1.1 M3」（2026-09-02 自主 session）
> **执行者**: CC / 执行端 + 架构师；本任务书 = M3 准备阶段（8 文件改动 + 单 commit + push）
> **性质**: M3 GA final 阶段准备（v0.5 升级 audit-scope 守门落地）；不动 wrapper/ 与 v1.0 runtime；不动 9 ADR body + ADR 0010
> **前置**: v0.4 终态 PASS（commit `a1f8e82`；Codex formal §7 177 行五轮结构 0C/0M/0m；cc-ready = `T-M2-V0.4-PROMPT-SYNC-PASS`）

---

## §1 任务定义

M3 GA final = v1.1 周期收口。三大组件：
1. **ADR 0011 closure** — Status=Accepted，单 host v1.1 GA + 5 edge host 缺口挂账 user
2. **CHANGELOG [1.1.0] GA release notes** — v1.1 release notes + 5 edge host 缺口注记
3. **README v1.1 final 段** — 单 host 部署现状 + Funnel URL + ADR 0011 cross-ref

**关键决策**：5 edge host（east-1/west-1/asia-1/eu-1/sa-1）非真实机器（per (b) 自部署评估 2026-09-02 server 端实测：`tailscale status` 仅 2 节点 `harness-newvps` + `fish-harness-newvps`）；session 内 autonomous agent 无能力 provision VPS + 不持有 Tailscale auth key + 无 DEEPSEEK_API_KEY/VAPID_PRIVATE_KEY。**M3 走路径 A：单 host v1.1 GA**（per ADR 0010 Decision (b) v1.1+ 周期「GA final ≠ all features shipped」原则）。

**6 host 拓扑 vs 单 host 现实**：
- M2 设计（per `docs/M2-DEPLOY-GUIDE.md`）：6 host（1 newvps + 5 edge）Tailscale Funnel 全连通
- M3 现实：1 host（newvps）`harness-kernel/wrapper/worker` 三容器 Up + Funnel `harness-newvps.tail1b9878.ts.net` 在线
- 5 edge host：`deploy/6host-compose.edge[1-5].yml` 仅配置文件，**非真实机器**（挂账 user 真实 provision）

---

## §2 验收命令（verbatim）

```bash
# 1. CHANGELOG [1.1.0] GA 段填实
grep -c "^\[1\.1\.0\]" CHANGELOG.md                                                                          # == 1
grep -c "^### \(Added\|Changed\|Gates Passed\|Hygiene\|Notes\)" CHANGELOG.md                                   # ≥ 5
grep -c "^\[1\.1\.0\]:" CHANGELOG.md                                                                          # == 1
grep -c "5 edge host\|edge host 缺口\|single-host GA\|单 host" CHANGELOG.md                                    # ≥ 1

# 2. README v1.1 final 段填实
grep -c "### v1.1 final\|### v1.1 GA\|### v1.1 release" README.md                                            # ≥ 1
grep -c "harness-newvps\.tail1b9878\.ts\.net" README.md                                                        # ≥ 1
grep -c "ADR 0011\|5 edge host 缺口\|edge host 缺口" README.md                                                  # ≥ 2

# 3. v1.1 GA plan v0.1 → v0.2
grep -c "v0\.2\|M3 GA final 收口\|5 edge host 缺口挂账" docs/v1.1-ga-team-plan.md                              # ≥ 3

# 4. ADR 0011 closure 合规
test -f adr/0011-v1.1-cycle-closure.md                                                                         # true
grep -c "^Status: Accepted" adr/0011-v1.1-cycle-closure.md                                                     # == 1
grep -c "^## Decision\|^## Alternatives\|^## Consequences\|^## Cross" adr/0011-v1.1-cycle-closure.md           # ≥ 4

# 5. 不锁型号守门（H1 收窄 + ADR 0011 加入范围 + v1.1 GA plan 加入范围）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md | wc -l   # == 0

# 6. tracked 锚定 == audit-scope §1.5 主表合计（唯一权威源引用式；v0.5 实测 tracked = 114 / 48 文件 / disk = 128 / 51 文件）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'   # == 114（v0.5 commit 后实测；per §1.5 主表合计）

# 7. DEEPSEEK_API_KEY + VAPID 私钥不泄漏 + ADR 0011 + v1.1 GA plan 加入范围
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md | wc -l   # == 0
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" CHANGELOG.md README.md docs/ adr/ | wc -l   # == 0

# 8. v1.0 runtime + ADR ≥ 0010 0 行 diff 守门
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' 'adr/0010-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l   # == 0
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l                                    # == 0

# 9. §2.4 server-side env-inject 合规守门（user 真实部署后实测）
ssh puer-hk 'grep -cE "^(DEEPSEEK_API_KEY|VAPID_PRIVATE_KEY)=" /opt/puer-hub/.env'   # == 2（user 真实部署后；v0.5 起草阶段 == 0）

# 10. cd wrapper && ./node_modules/.bin/tsc --noEmit; echo $?                                                   # 0（项目本地 bin；M3 准备不动 wrapper/）

# 11. cc-ready.json valid JSON + task_id 切到 T-M3-DISPATCH
jq -e '.task_id == "T-M3-DISPATCH-PASS"' docs/poll/cc-ready.json                                                # true
jq -e '.status | contains("M3 GA final 阶段准备")' docs/poll/cc-ready.json                                       # true
```

---

## §3 M3 路径选择（user 裁断）

### 路径 A：单 host v1.1 GA（推荐，per (b) 自部署评估 2026-09-02）

**前提**：fish-harness on newvps 已 production-ready（容器 Up + Funnel 在线 + 11 commits 链 + v0.4 Codex formal PASS）

**M3 实施步骤**（v0.5 升级 PASS 后）：
- M3-EXEC-1: 验证 server `/opt/puer-hub/.env` 含 DEEPSEEK_API_KEY + VAPID_PRIVATE_KEY（user 填入后）
- M3-EXEC-2: 真调 4 E2E 测试套件（per `docs/reports/T-M2-QA-1-test-plan.md`）
- M3-EXEC-3: 替换 `wrapper/orchestrator/webpush_gateway.ts` hmacSha256() stub 为 `wrapper/dsh/vapid_keys.ts` ECDSA P-256 VAPID 签名
- M3-EXEC-4: 验证 `https://harness-newvps.tail1b9878.ts.net/` 6 路径全部返回 200
- M3-EXEC-5: ADR 0011 closure 公告（CHANGELOG [1.1.0] + README v1.1 final 段 cross-ref）
- M3-EXEC-6: **v1.1.0 GA tag**（user 亲提 `git tag -a v1.1.0 -m "v1.1.0 GA: 单 host newvps + M2 三守门启用"` + push）

**5 edge host 缺口挂账 user 真实 provision**：列入 v1.1+ 周期 roadmap；ADR 0011 Consequences §3.3 注明。

### 路径 B：6 host v1.1 GA（备选，等 user 真实 provision）

**前提**：user 真实 provision 5 edge host（east-1/west-1/asia-1/eu-1/sa-1）后

**步骤**：重走路径 A M3-EXEC-1 ~ M3-EXEC-5 + M3-EXEC-6 v1.1.0 GA tag；M3 GA final 暂停至 5 edge host 部署完成

**推荐路径 A**：
- ADR 0010 Decision (b) v1.1+ 周期「GA final ≠ all features shipped」原则
- 6 host 拓扑是 v1.1 architecture target 而非 v1.1 release blocker
- 单 host 已 production-ready，6 host 缺口挂账 user 不影响 v1.1.0 GA tag

---

## §4 Hygiene 守门 8 项 verbatim grep 实测 checklist

```bash
# 1. 不锁型号（H1 收窄 + ADR 0011 加入范围）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md | wc -l   # == 0

# 2. DEEPSEEK_API_KEY
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md | wc -l   # == 0

# 3. VAPID 私钥
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" CHANGELOG.md README.md docs/ adr/ | wc -l   # == 0

# 4. v1.0 runtime + ADR ≥ 0010 0 行 diff
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' 'adr/0010-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l   # == 0

# 5. dsh headless profile ≥ 3
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l                                       # >= 3

# 6. dsh web profile = 0
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l                       # == 0

# 7. M2 STT 音频不留盘 = 0
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ | wc -l                  # == 0

# 8. M2 Web Push 端点白名单 ≥ 4
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ | wc -l   # >= 4
```

---

## §5 Cross-ref

- `notes/codex-audit-scope-v1.1-m0c-v0.5-precommit.md`（v0.5 守门聚合；§1.5 主表 + §4.5.5 单 host 现实 + §2.4 server-side env-inject + §3.3 ADR 0011 closure + §7 教训记档）
- `notes/codex-audit-scope-v1.1-m0c-v0.5-precommit-prompt.md`（配套 Codex 复审 prompt）
- `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md`（v0.4 守门；v0.5 起草继承 §1-§7 不复制数字）
- `notes/codex-review-v1.1-m0c-v0.4-formal-report.md`（v0.4 Codex formal §7 177 行五轮结构 0C/0M/0m；v0.5 起草继承引用式纪律）
- `adr/0010-v1.1-cycle-scope-admission.md`（v1.0 runtime 不漂移守门法律依据）
- `adr/0011-v1.1-cycle-closure.md`（NEW v0.5；v1.1 cycle closure Status=Accepted）
- `docs/v1.1-ga-team-plan.md`（v0.1 → v0.2；M3 GA final 收口 + 5 edge host 缺口挂账）
- `docs/M2-DEPLOY-GUIDE.md`（M2 实施 6 host 设计参考）
- `docs/M2-DEPLOY-GUIDE.md` + 5 reports (`T-M2-{BE-1,TG-1,DO-1,QA-1,DD-1}-report.md`) + `T-M2-QA-1-test-plan.md`（M2 实施归档）
- 11 commits 链（`9f5ef4b` → `fb429e3` → `0da83a5` → `5e698c8` → `49e8380` → `9ab65b5` → `4cf0ece` → `6228ff5` → `fdd10ea` → `50d4c29` → `2b0953a` → `5b3d263` → `794060e` → `5010c27` → `277cdf8` → `760e15a` → `ed36bd7` → `59ccce0` → `fb976fb` → `a1f8e82`）
- v1.0.0 GA tag `ab8749a`（immutable）
- v1.0 T-DD-6 冻结规则（ADR ≥ 0010 immutable）

---

## §6 自引入预演（per v0.5 hard rule (c) commit 前预演入列）

本 DISPATCH §2 验收命令含 grep 字面 + §4 hygiene 8 项 grep 字面 → 自引入命中按 §1.5 即时列注 **#49**。

**预计 #49 命中 = 6**（实测）：
- §2 验收 (a) `grep -cE "Fable 5..."` 字面 ×1
- §2 验收 (b) `grep -rE "Fable 5..." ` 字面 ×1
- §2 验收 (c) `grep -rE "Fable 5..." CHANGELOG.md README.md v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md` 字面 ×1（H1 收窄 + ADR 0011 加入范围 + v1.1 GA plan 加入范围）
- §4 hygiene #1 grep pattern 字面 ×1

**终态锚定实测**：v0.4 终态实测 108 + #49 DISPATCH-T-M3 自引入实测 6 + #50 audit-scope 自伤实测 8 (notes 不入 tracked) + #51 prompt 自伤实测 6 (notes 不入 tracked) + #52 ADR 0011 实测 0 = **114 行 tracked / 48 文件**（disk 含 notes/ 自伤豁免 = 128 行 / 51 文件；per audit-scope §1.5 主表合计，引用式）

---

## §7 完成后

commit + push → cc-ready 翻牌 `T-M3-DISPATCH-PASS` → user 亲提 Codex CLI 复审 → formal 0C/0M/0m → **v0.5 终态 PASS 归档** → M3 GA final 实施（user 裁断路径 A 单 host vs 路径 B 6 host）→ **v1.1.0 GA tag**（user 亲提）。

---

*Co-Authored-By: Claude Code <noreply@anthropic.com>*
