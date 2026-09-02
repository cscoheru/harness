# Codex Audit-scope Prompt — v1.1 M0c v0.4 升级 + M2 三守门正式启用 precommit 轮

> **Date**: 2026-09-02
> **Reviewer**: Cursor（拟 Codex `gpt-5.6-sol` + `reasoning_effort=xhigh` 风格；user 亲提 Codex CLI 复审；per fish-harness-project.md 2026-08-30 立 Codex 提交铁律）
> **复审对象**: v0.4 升级 5 文件改动（2 文件 Edit：CHANGELOG [1.1.0-M2] 段 + README v1.1 M2 段；3 文件 NEW：M2 DD-1 实施报告 + 2 audit-scope notes）
> **判定格式**: PASS / CHANGES REQUIRED / PARTIAL（Codex v0.1 风格 0C/0M/Nm 或 N/Nm）
> **配套 hygiene**: 守门聚合在 `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md`（本 prompt 同期落）
> **关系**: 本文件 = Cursor 审验 prompt（precommit 轮；user 提交后走 fix 轮 → formal 轮）

---

## §1 复审范围（v0.4 升级 5 文件 + M2 三守门正式启用）

### 1.1 修改文件 (M)

| # | 文件 | 行数 | 改动概述 |
||---|------|----------|
| 1 | `CHANGELOG.md` | ~60 行 patch | Header Link refs + 新增 `[1.1.0-M2]` 段（Added 8 项 / Changed 4 项 / Gates Passed 5 项 / Hygiene 6 项 / Notes 3 项）|
| 2 | `README.md` | ~120 行 patch | v1.1 M2 段 fill in（6 host 拓扑 + STT + Web Push + 6 Funnel 性能对比）|

### 1.2 新增文件 (A)

| # | 文件 | 行数 | 内容概述 |
||---|------|----------|
| 3 | `docs/reports/T-M2-DD-1-report.md` | ~250 行 | M2 DD-1 实施报告 6 段（§1 任务定义 / §2 CHANGELOG 填实 / §3 README 填实 / §4 v0.4 audit-scope 准备 / §5 verbatim 验证 8 项 / §6 cross-ref + next）|
| 4 | `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md` | ~170 行 | v0.4 升级 hygiene 守门聚合（继承 v0.3 + 启用 §4.5/§4.6/§4.7 M2 三守门为正式项）|
| 5 | `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md` | 估 ~220 行 | **本文件** = Cursor 审验 prompt |

**总改动：2 文件 Edit + 3 文件 NEW = 5 文件**（v0.4 升级 + M2 DD-1 实施收口；audit-scope 留本地 notes/）

### 1.3 关联不动文件 (Unmodified scope discipline)

- `harness/` + `spec/kernel-schema.sql` + `spikes/` + `_helpers.py` + 9 ADR body + `Dockerfile` + `docker-compose.yml` + `pyproject.toml` + `docs/v1.0-ga-team-plan.md`（ADR 0010 Decision (d) v1.0 runtime 不漂移守门）
- M2 5 DISPATCH 已 commit + push（per M2 实施）：BE-1 / TG-1 / DO-1 / QA-1 / DD-1
- M1c 实施归档已 commit + push（per plan header M1c PASS 证据）
- ADR 0010 v1.1 cycle scope admission Accepted
- `spec/capabilities/{orch,commander,worker,newvps_ram,6host_router,stt_worker,webpush_gateway}.json`（M0b 4 SKU + M2 3 SKU）

---

## §2 复审重点（Cursor 必查）

### (A) v0.4 升级完整性（CHANGELOG + README fill）

- ✅ CHANGELOG [1.1.0-M2] 段：Added 8 项（6 host / STT worker / Web Push gateway / 4 capability JSON / dsh 6 host / whisper.cpp / VAPID key / 6 Funnel iPhone Safari E2E）
- ✅ CHANGELOG [1.1.0-M2] 段：Changed 4 项（plan v0.2 → v0.3 / audit-scope v0.2 → v0.3 / README v1.1 M2 / 6 host 部署骨架）
- ✅ CHANGELOG [1.1.0-M2] 段：Gates Passed 5 项（M2 BE-1/TG-1/DO-1/QA-1 全部 PASS + Codex formal）
- ✅ CHANGELOG [1.1.0-M2] 段：Hygiene 6 项（v1.0 runtime 不漂移 / 不锁型号 / 不硬编码 API key / M2 多 host 守门启用 / M2 STT 守门启用 / M2 Web Push 守门启用）
- ✅ CHANGELOG [1.1.0-M2] 段：Notes 3 项
- ✅ CHANGELOG Link refs：[1.1.0-M2] + [1.1.0-M1c] + [1.1.0-M0c] + [Unreleased]
- ✅ README v1.1 M2 段：6 host 拓扑图
- ✅ README v1.1 M2 段：6 Funnel URL 列表
- ✅ README v1.1 M2 段：STT 真调示例（whisper.cpp）
- ✅ README v1.1 M2 段：Web Push 真发示例（VAPID）
- ✅ README v1.1 M2 段：性能数据 + 与 M1c 单 Funnel 对比

### (B) M2 DD-1 实施报告 6 段完整性

- ✅ §1 任务定义（一句话）
- ✅ §2 CHANGELOG 填实（含 [1.1.0-M2] 段 line:line 引用）
- ✅ §3 README 填实（含 v1.1 M2 段 line:line 引用）
- ✅ §4 v0.4 audit-scope 准备清单（5 文件 / tracked 锚定 / 11 守门聚合）
- ✅ §5 verbatim 验证 8 项
- ✅ §6 cross-ref + next（M3 阶段 GA final 准备）

### (C) 不锁型号守门（v0.4 升级前向交付物口径）

- ✅ 前向交付物 `CHANGELOG.md + README.md + M2 DD-1 报告` grep `Fable 5|GLM 5.3|MiniMax-M3` = **0**（实测）
- ✅ DD-1 报告 4 处（§Author/§Co-Authored-By/守门描述/命令字面）走 §1.5 自伤豁免
- ✅ tracked 重锚 post-M2 = **audit-scope §1.5 主表合计（唯一权威源；2026-09-02 终态 107 / 46 文件，演进链：91 预估 → 97 CALIB → 101 #46 → 103 FIX-2 实测 → 107 #48 PROMPT-SYNC 实测 4）**（引用式；prompt 不复制绝对数字，防第九次漂移回归）

### (D) v1.0 runtime 不漂移守门（5 文件改动范围）

- ✅ v0.4 升级 5 文件全部在 `CHANGELOG.md` + `README.md` + `docs/reports/` + `notes/`（不触及 harness/ + spec/ + spikes/ + 9 ADR body + Dockerfile + docker-compose.yml + pyproject.toml + docs/v1.0-ga-team-plan.md）
- ✅ audit-scope §3 提供 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域> | wc -l` = 0 验证

### (E) DEEPSEEK_API_KEY + VAPID 私钥不泄漏（GH013 PUSH PROTECTION 教训）

- ✅ audit-scope §2 提供 `grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/reports/` = 0 验证
- ✅ VAPID 私钥正式启用守门（v0.3 预备 → v0.4 正式）：`grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]"` = 0 验证
- ✅ README/CHANGELOG/DD-1 报告用 env-inject only 占位（不写完整 key）

### (F) M2 三守门正式启用（§4.5/§4.6/§4.7 in v0.4 audit-scope）

- ✅ §4.5 M2 多 host 守门：容器 IP 不锁 + MagicDNS 域名 + 6 Funnel URL（v0.3 预备 → v0.4 正式）
- ✅ §4.6 M2 STT 守门：音频不留盘 + /dev/shm 临时缓存 + Whisper 路径合规（v0.3 预备 → v0.4 正式）
- ✅ §4.7 M2 Web Push 守门：VAPID 私钥 env-inject + 公钥可入 commit + 4 Push 端点白名单（v0.3 预备 → v0.4 正式）
- ✅ v0.4 audit-scope §4.5/§4.6/§4.7 grep pattern verbatim 继承 v0.3（一字不差；仅"预备"→"正式启用"）

### (G) 潜在新 finding 风险点（Cursor 主动探查）

- G1 CHANGELOG [1.1.0-M2] 段 Link refs 是否与 README M2 段 cross-ref 自洽
- G2 README v1.1 M2 段是否与 M2 5 DISPATCH 实施细节对齐（BE-1 6 host / TG-1 dsh + STT / DO-1 6 host 部署 / QA-1 端到端）
- G3 M2 DD-1 报告 §Author 字面是否走 §1.5 豁免（避免 grep 自伤）
- G4 §4.5/§4.6/§4.7 grep pattern 是否与 v0.3 verbatim（一字不差）
- G5 tracked 重锚 103 是否合理（演进链：91 预估 → 97 CALIB → 101/103 FIX-2 实测；M2 DD-1 报告 + FIX-2 commit 后补计）
- G6 v0.4 prompt §3 验证命令矩阵 8 项是否与 audit-scope §1-§4.7 verbatim 对齐

---

## §3 验证命令矩阵（verbatim 实跑；8 项）

```bash
# === 1. CHANGELOG [1.1.0-M2] 段填实 ===
grep -c "^\[1\.1\.0-M2\]" CHANGELOG.md
# 期望: 1（标题行）

grep -c "^### \(Added\|Changed\|Gates Passed\|Hygiene\|Notes\)" CHANGELOG.md
# 期望: ≥ 5（5 子段齐全）

grep -c "^\[1\.1\.0-M2\]:" CHANGELOG.md
# 期望: 1（Link ref 行）

# === 2. README v1.1 M2 段填实 ===
grep -c "### M2 阶段\|### v1.1 M2" README.md
# 期望: 1

grep -c "harness-newvps\|harness-edge[1-5]" README.md
# 期望: ≥ 6（6 Funnel URL 引用）

grep -c "stt_worker\|webpush_gateway" README.md
# 期望: ≥ 2（STT + Web Push capability 引用）

# === 3. M2 DD-1 实施报告存在 ===
test -f docs/reports/T-M2-DD-1-report.md && echo "M2 DD-1 报告 ✅"

grep -c "^## §" docs/reports/T-M2-DD-1-report.md
# 期望: ≥ 6（6 段齐全）

# === 4. 不锁型号守门（v0.4 升级前向交付物口径）===
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md | wc -l
# 期望: 0（前向交付物不含 grep 字面）
# 注: M2 DD-1 报告 4 处（§Author 尾注 / §不锁型号守门描述 / §verbatim 命令字面 / §Co-Authored-By 反向引用）走 audit-scope §1.5 #43 自伤豁免，不入前向范围；本命令收窄为 `CHANGELOG.md README.md` 与 §1.(C) 注记自洽

# tracked 锚定 == audit-scope §1.5 主表合计（唯一权威源引用式；2026-09-02 终态 107 / 46 文件；演进链：91 预估 → 97 CALIB → 101 #46 → 103 FIX-2 实测 → 107 #48 PROMPT-SYNC 实测 4；M2 5 DISPATCH 起草 6 已在 85 内含不重复计）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == audit-scope §1.5 主表合计（唯一权威源引用式；2026-09-02 终态 107 / 46 文件；演进链 91 → 97 → 101 → 103 → 107；M2 实施报告群 #40-#45 + #46/#47/#48 详 §1.5 表）

# === 5. DEEPSEEK_API_KEY + VAPID 私钥不泄漏 ===
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/reports/ | wc -l
# 期望: 0

grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" CHANGELOG.md README.md docs/reports/ | wc -l
# 期望: 0（M2 VAPID 私钥 env-inject only）

# === 6. v1.0 runtime 0 行 diff 守门 ===
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0

git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0

# === 7. M2 三守门正式启用验证（v0.3 预备 → v0.4 正式）===
# §4.5 多 host 守门启用（标题去"预备"；GATE-CALIB 校准：IP 排除 node_modules + H5 pattern fix）：
grep -c "M2 多 host 守门\b" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md
# 期望: ≥ 1（正式启用标题）

grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md | grep -v "127.0.0.1" | wc -l
# 期望: ≤ 1（业务源码 0；deploy/6host-compose.newvps.yml IPAM subnet 合例白名单 1）

grep -rE "ts\.net" deploy/ | wc -l
# 期望: ≥ 1（MagicDNS 域名）

grep -rE "https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/" docs/ deploy/ | wc -l
# 期望: ≥ 6（6 Funnel URL；H5 pattern 修 `[a-z][a-z0-9-]*` 允许数字）

# §4.6 STT 守门启用（标题去"预备"；GATE-CALIB 校准：tmp 排除 test/ + whisper pattern 排除 `${`）：
grep -c "M2 STT 守门\b" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md
# 期望: ≥ 1（正式启用标题）

grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ | wc -l
# 期望: 0（音频不留盘）

grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
# 期望: 0（仅 /dev/shm；wrapper/test/ 守护测试自伤 3 行走 §1.5 自伤豁免）

# §4.7 Web Push 守门启用（标题去"预备"；GATE-CALIB 校准：VAPID 公钥期望反向 == 0）：
grep -c "M2 Web Push 守门\b" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md
# 期望: ≥ 1（正式启用标题）

grep -rE "vapid_public_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PUBLIC\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" deploy/ env/ | wc -l
# 期望: == 0（GATE-CALIB 校准后；公钥亦 env-inject-only，较"可入 commit"更严，合规方向）

grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ | wc -l
# 期望: ≥ 4（4 Push 端点白名单）

# === 8. v0.4 audit-scope + prompt 存在（留 notes/）===
test -f notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md && echo "v0.4 audit-scope ✅"
test -f notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md && echo "v0.4 prompt ✅"

# grep pattern 自伤验证（本文件 + audit-scope 含 grep 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md | wc -l
# 期望: ≥ 5（自伤豁免；§1/§4.5/§4.6/§4.7/§5 多处字面）
```

---

## §4 签发下一枪（v0.4 升级 commit + push + M3 阶段准备）

### 4.1 提交策略

```bash
cd /Users/kjonekong/projects/fish-harness

# 1. git add 3 文件（CHANGELOG + README + M2 DD-1 报告；audit-scope notes 不在 commit 范围）
git add CHANGELOG.md \
        README.md \
        docs/reports/T-M2-DD-1-report.md

# 2. git commit（Co-Authored-By: Claude Code per QA-1 VERIF 4 守门）
git commit -m "feat(v1.1): v0.4 升级 + M2 实施收口

- CHANGELOG [1.1.0-M2] 段填实：Added 8 项（6 host / STT / Web Push / 4 capability JSON / dsh 6 host / whisper.cpp / VAPID key / 6 Funnel E2E）/ Changed 4 项 / Gates Passed 5 项 / Hygiene 6 项（含 M2 三守门启用）/ Notes 3 项
- README v1.1 M2 段 fill in：6 host 拓扑 + 6 Funnel + STT 真调 + Web Push 真发 + 性能对比
- M2 DD-1 实施报告 6 段：§1 任务定义 / §2 CHANGELOG 填实 / §3 README 填实 / §4 v0.4 audit-scope 准备 / §5 verbatim 验证 8 项 / §6 cross-ref + next

守门:
- 不锁型号 grep (前向交付物): 0 行
- tracked 锚定 post-M2: 91（预估；M2 DD-1 报告 commit 后补计）
- DEEPSEEK_API_KEY 完整 key grep: 0 行 (env-inject only)
- VAPID 私钥 grep: 0 行 (env-inject only)
- v1.0 runtime 0 行 diff (ADR 0010 Decision d)
- §4.5/§4.6/§4.7 M2 三守门正式启用（v0.3 预备 → v0.4 正式）

Co-Authored-By: Claude Code <noreply@anthropic.com>"

# 3. git push via Clash proxy（per M0b BE-1 踩坑 + GH013 amend 教训）
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin main

# 4. 归档 commit（audit trail）：
git add docs/DISPATCH-T-M2-DD-1.md \
        notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md \
        notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md \
        notes/codex-review-v1.1-m0c-v0.4-precommit-report.md
git commit -m "chore(m2): T-M2-DD-1-FIX 修复 + audit trail

- DISPATCH-T-M2-DD-1.md: M2 DD-1 任务书
- notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md: hygiene 守门聚合（启用 M2 三守门）
- notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md: Codex 复审 prompt
- notes/codex-review-v1.1-m0c-v0.4-precommit-report.md: Codex 复审报告

守门: v0.4 precommit fix done
Co-Authored-By: Claude Code <noreply@anthropic.com>"
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin main
```

### 4.2 Codex 复审触发（commit 后 formal 轮）

```bash
# 1. user 亲提 Codex CLI（gpt-5.6-sol + xhigh）
codex -m gpt-5.6-sol -c model_reasoning_effort=xhigh \
      --input notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md \
      --output notes/codex-review-v1.1-m0c-v0.4-formal-report.md

# 2. Codex 输出 PASS → 走 §4.3 M3 阶段 GA final 准备
# 3. Codex 输出 CHANGES REQUIRED → 修 F1-F4 hygiene + §3 验证命令失败项 → 重新提交
```

### 4.3 M3 阶段 GA final 准备（v0.4 升级 PASS 后）

- 全部 M2 DISPATCH 实施 + Codex formal PASS → v0.4 升级 → 进入 M3 阶段
- M3 阶段目标：v1.1 周期 GA final 收口
- 触发条件：user 说「Start v1.1 M3」+ v0.4 升级 commit + push 已完成

---

## §5 沉淀机制（per Codex 复审流水线模式）

### 5.1 已落地沉淀

- `notes/codex-audit-scope-v1.1-m0b-v0.1.md`（M0b 模板阶段 audit-scope，Codex v0.1 复审 PASS — 0C/0M/1m）
- `notes/codex-review-v1.1-m0b-v0.1-report.md`（M0b 模板阶段 Codex v0.1 PASS 报告）
- `notes/codex-audit-scope-v1.1-m0c-v0.1.md`（v0.1 升级 hygiene 守门聚合，grep 自伤豁免）
- `notes/codex-audit-scope-v1.1-m0c-v0.1-prompt.md`（v0.1 升级 Codex 复审 prompt）
- `notes/codex-review-v1.1-m0c-v0.1-precommit-report.md`（v0.1 升级 precommit 轮 CHANGES REQUIRED 1M/3m）
- `notes/codex-review-v1.1-m0c-v0.1-report.md`（v0.1 升级 formal 轮 PASS 0C/0M/2m+1ud）
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md`（v0.2 升级 hygiene 守门聚合，tracked 重锚 71）
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md`（v0.2 升级 Codex 复审 prompt）
- `notes/codex-review-v1.1-m0c-v0.2-formal-report.md`（Codex formal PASS 0C/0M/1m F1 顺手清）
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md`（v0.3 升级 hygiene 守门聚合 + M2 守门预备 §4.5/§4.6/§4.7）
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md`（v0.3 升级 Codex 复审 prompt）
- `notes/codex-review-v1.1-m0c-v0.3-formal-report.md`（v0.3 升级 Codex formal PASS）
- `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md`（**本文件配套** = v0.4 audit-scope，M2 三守门正式启用）
- `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md`（**本文件** = Cursor 审验 prompt，precommit 轮）

### 5.2 待生成沉淀（v0.4 升级 Codex 复审后）

- `notes/codex-review-v1.1-m0c-v0.4-precommit-report.md`（v0.4 升级 precommit 轮复审报告）
- `notes/codex-review-v1.1-m0c-v0.4-formal-report.md`（v0.4 升级 formal 轮复审报告）
- 若 Codex FAIL → `notes/codex-audit-scope-v1.1-m0c-v0.4-scope-fix.md`（F1-F4 hygiene fix 派工）
- 若 Codex PASS → 进入 §4.3 M3 阶段 GA final 准备流程

### 5.3 修订日志格式

v0.4 升级 commit hash 回填：`277cdf8` (T-M2-V0.4-GATE-CALIB) → `ed36bd7` (T-M2-V0.4-HYGIENE-FIX-2) → `59ccce0` (T-M2-V0.4-PROMPT-SYNC) → `fb976fb` (cc-ready flip + #48 漂移修正) —— hash 链全回填，占位符零残留（per S2 验收）

Codex formal report 落点：`notes/codex-review-v1.1-m0c-v0.4-formal-report.md`（已落 — 首审 0C/4M/3m CHANGES REQUIRED → §5 复审轮 0C/1M/1m → §6 prompt 复审轮 0C/2M/2m → T-M2-V0.4-PROMPT-SYNC 修完即终态 PASS）

v0.4 升级沉淀记录：
```
v0.4 升级 | 277cdf8 (GATE-CALIB) → ed36bd7 (FIX-2) → 59ccce0 (PROMPT-SYNC) → fb976fb (flip) | 2026-09-02 | §4.5/§4.6/§4.7 M2 三守门正式启用（GATE-CALIB 校准：IP 排除 node_modules / tmp 排除 test/ / whisper 排除 `${` / VAPID 公钥期望反向 == 0 / H5 pattern `[a-z][a-z0-9-]*`）| Codex formal: CHANGES REQUIRED (0C/4M/3m) → GATE-CALIB fix 轮 (0C/1M/1m) → PROMPT-SYNC 收口 → **终态 PASS 0C/0M/0m（formal 报告 §7）**
```

**先跑后写铁律第三次失守教训（2026-09-02 立，per §6 P-2）**：commit message / report 声明「已回填 / 已验证 / 已实测」类必须附**行号证据**（如「L295/L301 已回填 277cdf8/ed36bd7」+ grep `277cdf8 file` ≥ 1 实测），否则被 Codex 复审检出。前科三次同型失守：
- (a) `f666e47` commit message 声明「grep=0」实测 4 命中（v0.3 DD-1）
- (b) M-C 「启用前期望值经验证」声明失实（v0.4 GATE-CALIB）
- (c) C5「placeholder 已回填」声明失实，本 §5.3 L295/L301 当时仍占位符 ×2（v0.4 PROMPT-SYNC 轮回填）

**修法**：commit message + audit-scope/report 声明「已 X」类必走 (i) 实测 grep 命中行号 + (ii) 三源同值（命令==清单==期望），任一未跑即不得 commit。

### 5.4 未来复用

- v1.0 GA final / v1.2 升级时按本模式建新 audit-scope-prompt 文件
- 引用 v0.4 audit-scope 作为模板
- 提交前必走 self-audit + 必修 F1-F4 hygiene findings（per fish-harness-project.md 2026-09-01 立）

---

## §6 Hygiene 守门 8 项 verbatim grep 实测 checklist（precommit 必跑）

```bash
# precommit 必跑 8 项 verbatim grep（每项必须 PASS 才提交）：

# H1: 前向交付物不锁型号 = 0
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md docs/reports/T-M2-DD-1-report.md | wc -l
# PASS 条件: == 0

# H2: DEEPSEEK_API_KEY 不泄漏 = 0
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/reports/ | wc -l
# PASS 条件: == 0

# H3: VAPID 私钥不泄漏 = 0
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" CHANGELOG.md README.md docs/reports/ | wc -l
# PASS 条件: == 0

# H4: v1.0 runtime 0 行 diff
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# PASS 条件: == 0

# H5: dsh headless profile ≥ 3
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# PASS 条件: >= 3

# H6: dsh web profile = 0
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# PASS 条件: == 0

# H7: M2 STT 音频不留盘 = 0
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ | wc -l
# PASS 条件: == 0

# H8: M2 Web Push 端点白名单 ≥ 4
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ | wc -l
# PASS 条件: >= 4
```

---

## §7 Cross-ref（v0.3 prompt + v0.4 audit-scope + M2 DISPATCH + CHANGELOG + ADR 0010）

| 引用 | 文件 | 关系 |
|------|------|------|
| v0.3 prompt | `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md` | 模板继承（v0.3 §1-§4 → v0.4 §1-§4；v0.3 §4.5/§4.6/§4.7 预备 → v0.4 正式启用）|
| v0.4 audit-scope | `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md` | 本 prompt 配套；含完整 §1-§7 hygiene 守门 + tracked 重锚 |
| M2 DISPATCH | `docs/DISPATCH-T-M2-{BE-1,TG-1,DO-1,QA-1,DD-1}.md` | §4.5/§4.6/§4.7 grep pattern verbatim 来源 |
| CHANGELOG [1.1.0-M2] | `CHANGELOG.md` | §1.3 不动文件 + Hygiene 6 项（含 M2 三守门启用）|
| ADR 0010 | `adr/0010-v1.1-cycle-scope-admission.md` | v1.0 runtime 不漂移守门法律依据 |
| M3 DISPATCH | `docs/DISPATCH-T-M3-*.md`（待起草）| §4.3 M3 阶段 GA final 准备下一枪 |

---

## §8 审验 checklist（Cursor 必填）

- [x] (A) v0.4 升级完整性 — CHANGELOG 5 子段 + README M2 5 子段
- [x] (B) M2 DD-1 实施报告 6 段齐全
- [x] (C) 不锁型号守门 — §3 验证 #4 + tracked 锚定 == audit-scope §1.5 主表合计（唯一权威源引用式，终态 107 / 46 文件）
- [x] (D) v1.0 runtime 不漂移守门 — §3 验证 #6
- [x] (E) DEEPSEEK_API_KEY + VAPID 私钥不泄漏 — §3 验证 #5
- [x] (F) M2 三守门正式启用 — §3 验证 #7（§4.5/§4.6/§4.7 三项全部 PASS）
- [x] (G) §4.5/§4.6/§4.7 grep pattern verbatim 继承 v0.3（一字不差）
- [x] (H) §6 hygiene checklist 8 项全部 PASS
- [x] (I) 潜在新 finding — G1-G6 主动探查

**判定**: ☑ PASS（FIX-2 + PROMPT-SYNC 后 v0.4 终态）

**findings 列表**（如有）：

| ID | 等级 | file:line | 描述 | 修法建议 |
|----|------|-----------|------|----------|
| | | | | |

---

*audit-scope-prompt — v1.1 M0c v0.4 升级 + M2 三守门正式启用 precommit 轮审验 prompt for Cursor（Codex v0.4 风格）；grep 自伤豁免机制由 `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md` 提供；本 prompt 含完整 §1-§8 审验框架 + 下一枪 commit/push + Codex 复审 + M3 阶段 GA final 准备流程。Co-Authored-By: Claude Code <noreply@anthropic.com>*