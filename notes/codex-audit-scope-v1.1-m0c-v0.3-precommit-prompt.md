# Codex Audit-scope Prompt — v1.1 M0c v0.3 升级 + DD-1 实施报告 precommit 轮

> **Date**: 2026-09-02
> **Reviewer**: Cursor（拟 Codex `gpt-5.6-sol` + `reasoning_effort=xhigh` 风格；user 亲提 Codex CLI 复审；per fish-harness-project.md 2026-08-30 立 Codex 提交铁律）
> **复审对象**: v0.3 升级 5 文件改动（2 文件 Edit：CHANGELOG [1.1.0-M1c] 段 + README v1.1 M1c 段；3 文件 NEW：DD-1 实施报告 + 2 audit-scope notes）
> **判定格式**: PASS / CHANGES REQUIRED / PARTIAL（Codex v0.1 风格 0C/0M/Nm 或 N/Nm）
> **配套 hygiene**: 守门聚合在 `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md`（本 prompt 同期落）
> **关系**: 本文件 = Cursor 审验 prompt（precommit 轮；user 提交后走 fix 轮 → formal 轮）

---

## §1 复审范围（v0.3 升级 5 文件）

### 1.1 修改文件 (M)

| # | 文件 | 行数 | 改动概述 |
||---|------|----------|
| 1 | `CHANGELOG.md` | ~60 行 patch | Header Link refs + 新增 `[1.1.0-M1c]` 段（Added 7 项 / Changed 3 项 / Gates Passed 4 项 / Hygiene 3 项 / Notes 3 项）|
| 2 | `README.md` | ~120 行 patch | v1.1 M1c 段 fill in（快速部署 + iPhone Safari E2E + 三档 Profile + 测试 + v1.0 不漂移守门 + Funnel vs 直连延迟）|

### 1.2 新增文件 (A)

| # | 文件 | 行数 | 内容概述 |
||---|------|----------|
| 3 | `docs/reports/T-M1c-DD-1-report.md` | ~250 行 | DD-1 实施报告 6 段（§1 任务定义 / §2 CHANGELOG 填实 / §3 README 填实 / §4 v0.3 audit-scope 准备 / §5 verbatim 验证 6 项 / §6 cross-ref + next）|
| 4 | `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` | ~150 行 | v0.3 升级 hygiene 守门聚合（继承 v0.2 + M2 预备 §4.5/§4.6/§4.7 三守门）|
| 5 | `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md` | 估 ~150 行 | **本文件** = Cursor 审验 prompt |

**总改动：2 文件 Edit + 3 文件 NEW = 5 文件**（v0.3 升级 + DD-1 实施报告；audit-scope 留本地 notes/）

### 1.3 关联不动文件 (Unmodified scope discipline)

- `harness/` + `spec/kernel-schema.sql` + `spikes/` + `_helpers.py` + 9 ADR body + `Dockerfile` + `docker-compose.yml` + `pyproject.toml` + `docs/v1.0-ga-team-plan.md`（ADR 0010 Decision (d) v1.0 runtime 不漂移守门）
- M0c 5 subagent 收口已 commit + push（per plan header M0c PASS 证据）：b768097 (BE-1) / d168217 (TG-1) / 23f976e (QA-1) / 6ea2fae (DO-1) / 7a94ade (DD-1) / 3efe7dc (fix)；另有 M0b 链 4cf0ece/50d4c29/2b0953a/5b3d263（per HYGIENE-FIX H3 更正原「M1c 实施」误标）
- M1c 实施已 commit + push：c4a9192 (EXEC) + 200ded1/5171753/cdd8449 (BE-1/TG-1/DO-1 own) + 5543604 (QA-1 own) + 4 merges 39e6e54/b1477dd/b16cb19/19cade6 + GATE-REPAIR 链（cbc0b98…dc4bc33）+ 3a3157f (formal 归档) + 8d99cd5 (Funnel 证据)
- ADR 0010 v1.1 cycle scope admission Accepted
- `spec/capabilities/{orch,commander,worker,newvps_ram}.json`（M0b 落地 4 SKU）
- `wrapper/` 目录（M1c 5 subagent 实跑落地）
- `docs/v1.1-ga-team-plan.md` v0.2（M1c 实施中）

---

## §2 复审重点（Cursor 必查）

### (A) v0.3 升级完整性（CHANGELOG + README fill）

- ✅ CHANGELOG [1.1.0-M1c] 段：Added 7 项（wrapper 三档 / dsh client / vitest / newvps 真部署 / Funnel E2E / ADR 0010 / capability JSON）
- ✅ CHANGELOG [1.1.0-M1c] 段：Changed 3 项（plan v0.0→v0.2 / audit-scope v0.1→v0.2 / README v1.1 M1 段）
- ✅ CHANGELOG [1.1.0-M1c] 段：Gates Passed 4 项（M0b / M0c 5 subagent / M1c GATE-REPAIR-2 / Codex formal 终审）
- ✅ CHANGELOG [1.1.0-M1c] 段：Hygiene 3 项（v1.0 runtime 不漂移 / 不锁型号 / 不硬编码 API key）
- ✅ CHANGELOG [1.1.0-M1c] 段：Notes 3 项（v0.3 升级门槛 / M2 阶段准备 / Funnel 延迟）
- ✅ CHANGELOG Link refs：[1.1.0-M1c] + [1.1.0-M0c] + [Unreleased]
- ✅ README v1.1 M1c 段：快速部署 5 步（SSH + docker compose + tailscale up + funnel + curl 验证）
- ✅ README v1.1 M1c 段：iPhone Safari E2E 4 步（打开 / 表单 / 24h / 完成态）
- ✅ README v1.1 M1c 段：三档 Profile 表（orch 19x / commander 7x / worker 1x baseline）
- ✅ README v1.1 M1c 段：vitest 测试 94/5/0 + 三层覆盖（unit / integration / E2E）
- ✅ README v1.1 M1c 段：v1.0 runtime 不漂移守门（git diff v1.0.0..HEAD = 0 行）
- ✅ README v1.1 M1c 段：Funnel vs 直连延迟对比表

### (B) DD-1 实施报告 6 段完整性

- ✅ §1 任务定义（一句话）
- ✅ §2 CHANGELOG 填实（含 [1.1.0-M1c] 段 line:line 引用）
- ✅ §3 README 填实（含 v1.1 M1c 段 line:line 引用）
- ✅ §4 v0.3 audit-scope 准备清单（5 文件 / tracked 锚定 71 / 4 守门聚合）
- ✅ §5 verbatim 验证 6 项
- ✅ §6 cross-ref + next（M2 阶段 5 DISPATCH 起草）

### (C) 不锁型号守门（v0.3 升级前向交付物口径；per HYGIENE-FIX H1 修正）

- ✅ 前向交付物 `CHANGELOG.md + README.md` grep `Fable 5|GLM 5.3|MiniMax-M3` = **0**（实测）
- ✅ DD-1 报告 4 处（§Author/§Co-Authored-By/守门描述/命令字面）走 §1.5 **#33** 自伤豁免（f666e47 commit 声明 0 vs 实测 4 已追认收口）
- ✅ tracked 重锚 == **85**（post-commit：v0.2 主表 71 + funnel 漏列 2 + DD-1 4 + M2 5 DISPATCH 6 + #39 HYGIENE-FIX 执行书 2；命令/清单/期望三源同值）

### (D) v1.0 runtime 不漂移守门（5 文件改动范围）

- ✅ v0.3 升级 5 文件全部在 `CHANGELOG.md` + `README.md` + `docs/reports/` + `notes/`（不触及 harness/ + spec/ + spikes/ + 9 ADR body + Dockerfile + docker-compose.yml + pyproject.toml + docs/v1.0-ga-team-plan.md）
- ✅ audit-scope §3 提供 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域> | wc -l` = 0 验证

### (E) DEEPSEEK_API_KEY 不泄漏（GH013 PUSH PROTECTION 教训）

- ✅ audit-scope §2 提供 `grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/reports/ | wc -l` = 0 验证
- ✅ README/CHANGELOG/DD-1 报告用 env-inject only 占位（不写完整 key）
- ✅ VAPID 私钥前瞻守门（M2 启用；v0.3 升级不启用）

### (F) Funnel E2E 实测数据准确性（per DO-1 报告 + Codex formal PASS）

- ✅ Funnel URL = `https://harness-newvps.tail1b9878.ts.net/`
- ✅ macOS 外部 curl 验证：HTTP/2 200 + wrapper placeholder
- ✅ TTFB 582ms / Total 583ms / Size 105B
- ✅ iPhone Safari 截屏已归档至 `docs/reports/T-M1c-DO-1-iPhone-E2E-evidence/01-iphone-safari.png`

### (G) cc-ready.json 事实准确性（per cc-ready §6 守门）

- ✅ task_id = `T-M1c-DD-1`（DD-1 派发 + v0.3 升级 + M2 阶段准备）
- ✅ commit field = `HEAD = v0.3 升级 commit`（待 commit 后更新）
- ✅ status = DD-1 派发 + v0.3 升级 + M2 阶段
- ✅ files_modified 5 文件清单
- ✅ notes 12 项 v0.3 升级说明 + M2 阶段准备

### (H) M2 hygiene 守门预备（§4.5/§4.6/§4.7 in audit-scope）

- ✅ §4.5 多 host 守门预备：容器 IP 不锁 + MagicDNS 域名 + 6 Funnel URL
- ✅ §4.6 STT 守门预备：音频不留盘 + /dev/shm 临时缓存 + Whisper 路径合规
- ✅ §4.7 Web Push 守门预备：VAPID 私钥 env-inject + 公钥可入 commit + 4 Push 端点白名单
- ⚠️ v0.3 升级不启用 M2 守门（预备清单，v0.4 启用）

### (I) 潜在新 finding 风险点（Cursor 主动探查）

- G1 CHANGELOG [1.1.0-M1c] 段 Link refs 是否与 README M1c 段 cross-ref 自洽
- G2 README v1.1 M1c 段安装/启动（line 221-234）是否仍标"待 M1 阶段填实"导致冲突
- G3 DD-1 报告 §Author 字面是否走 §1.5 豁免（避免 grep 自伤）
- G4 v0.3 audit-scope §4.5/§4.6/§4.7 M2 守门预备与 v0.4 升级是否连贯
- G5 cc-ready.json files_modified 是否漏列 README v1.1 M1c 段（line:line 引用）
- G6 CHANGELOG Hygiene 3 项是否漏列 v1.0 runtime 不漂移（已含）+ 不锁型号（已含）+ 不硬编码 API key（已含）

---

## §3 验证命令矩阵（verbatim 实跑）

```bash
# === A. CHANGELOG [1.1.0-M1c] 段填实 ===
grep -c "^\[1\.1\.0-M1c\]" CHANGELOG.md
# 期望: 1（标题行）

grep -c "^### \(Added\|Changed\|Gates Passed\|Hygiene\|Notes\)" CHANGELOG.md
# 期望: ≥ 5（5 子段齐全）

grep -c "^\[1\.1\.0-M1c\]:" CHANGELOG.md
# 期望: 1（Link ref 行）

# === B. README v1.1 M1c 段填实 ===
grep -c "### M1c 阶段" README.md
# 期望: 1

grep -c "Funnel URL\|https://harness-newvps.tail1b9878.ts.net" README.md
# 期望: ≥ 2（Funnel URL 引用 ≥ 1 处 + iPhone Safari 段含 1 处）

grep -c "orch\|commander\|worker" README.md
# 期望: ≥ 3（三档 profile 全列）

# === C. DD-1 实施报告存在 ===
test -f docs/reports/T-M1c-DD-1-report.md && echo "DD-1 报告 ✅"

grep -c "^## §" docs/reports/T-M1c-DD-1-report.md
# 期望: ≥ 6（6 段齐全）

# === D. 不锁型号守门（v0.3 升级前向交付物口径；per HYGIENE-FIX H1 收窄）===
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md | wc -l
# 期望: 0（前向交付物 CHANGELOG+README 不含 grep 字面）
# 注: DD-1 报告 4 处（§Author 尾注 / §不锁型号守门描述 / §verbatim 命令字面 / §Co-Authored-By 反向引用）走 audit-scope §1.5 #33 自伤豁免，不入前向范围

# tracked 锚定 == 71（继承 v0.2）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: 71（DD-1 起草后 docs/ 无新增 grep 命中）

# === E. DEEPSEEK_API_KEY 不泄漏 ===
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/reports/ | wc -l
# 期望: 0

# === F. v1.0 runtime 0 行 diff 守门 ===
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0

git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0

# === G. cc-ready.json valid JSON + task_id 正确 ===
jq -e '.task_id == "T-M1c-DD-1"' docs/poll/cc-ready.json
# 期望: true

jq -e '.files_modified_count == 5' docs/poll/cc-ready.json
# 期望: true（v0.3 升级 5 文件）

# === H. M1c 实施归档齐 ===
test -f docs/DISPATCH-T-M1c-DO-1.md && echo "M1c DO-1 任务书 ✅"
test -f docs/DISPATCH-T-M1c-DD-1.md && echo "M1c DD-1 任务书 ✅"
test -f docs/DISPATCH-T-M1c-EXEC.md && echo "M1c EXEC 执行书 ✅"
test -f docs/DISPATCH-T-M1c-GATE-REPAIR.md && echo "M1c GATE-REPAIR 执行书 ✅"
test -f docs/DISPATCH-T-M1c-GATE-REPAIR-2.md && echo "M1c GATE-REPAIR-2 执行书 ✅"
test -f docs/reports/T-M1c-BE-1-report.md && echo "M1c BE-1 实施报告 ✅"
test -f docs/reports/T-M1c-TG-1-report.md && echo "M1c TG-1 实施报告 ✅"
test -f docs/reports/T-M1c-DO-1-report.md && echo "M1c DO-1 实施报告 ✅"
test -f docs/reports/T-M1c-QA-1-report.md && echo "M1c QA-1 实施报告 ✅"
test -f docs/reports/T-M1c-DO-1-iPhone-E2E-funnel.md && echo "M1c DO-1 Funnel 报告 ✅"
test -f docs/reports/T-M1c-GATE-REPAIR-report.md && echo "M1c GATE-REPAIR 报告 ✅"
test -f docs/reports/T-M1c-GATE-REPAIR-2-report.md && echo "M1c GATE-REPAIR-2 报告 ✅"

# === I. v0.3 audit-scope + prompt 存在（留 notes/）===
test -f notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md && echo "v0.3 audit-scope ✅"
test -f notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md && echo "v0.3 prompt ✅"

# === J. v0.3 升级范围 hygiene 自检表（详见 audit-scope §5）===
ls -la CHANGELOG.md README.md docs/reports/T-M1c-DD-1-report.md notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md
```

---

## §4 复审流程（Codex CLI 提交模板）

```bash
# 1. user 亲提 Codex CLI（Claude 不亲提；per fish-harness-project.md 2026-08-30 立）
codex -m gpt-5.6-sol -c model_reasoning_effort=xhigh \
      --input notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md \
      --output notes/codex-review-v1.1-m0c-v0.3-precommit-report.md

# 2. 提交命令前置条件：
#    - git status 含 5 文件改动（M 2 + A 3 + audit-scope 留 notes/）
#    - git log HEAD = v0.3 升级前 commit（M1c 全部归档已推）
#    - working tree 修改未 commit（v0.3 升级待 commit + push）

# 3. Codex 输出落 `notes/codex-review-v1.1-m0c-v0.3-precommit-report.md`
#    格式：PASS / CHANGES REQUIRED / PARTIAL + findings ID/等级/file:line/修法

# 4. 复审结果处理：
#    - PASS → 走 §5.1 v0.3 升级 commit + push（单 commit；归档 commit 分立）
#    - CHANGES REQUIRED → 修 findings → 重新提交 Codex 复审 → 闭环
#    - PARTIAL → 走 §5.2 部分 commit + partial findings 修复轮
```

---

## §5 签发下一枪（v0.3 升级 commit + push + M2 阶段准备）

### 5.1 提交策略（单 commit，方案 A）

```bash
cd /Users/kjonekong/projects/fish-harness

# 1. git add 3 文件（CHANGELOG + README + DD-1 报告；audit-scope notes 不在 commit 范围）
git add CHANGELOG.md \
        README.md \
        docs/reports/T-M1c-DD-1-report.md

# 2. git commit（Co-Authored-By: Claude Code per QA-1 VERIF 4 守门）
git commit -m "feat(v1.1): v0.3 升级 + DD-1 实施收口

- CHANGELOG [1.1.0-M1c] 段填实：Added 7 项（wrapper 三档 / dsh client / vitest / newvps 真部署 / Funnel E2E / ADR 0010 / capability JSON）/ Changed 3 项 / Gates Passed 4 项 / Hygiene 3 项 / Notes 3 项
- README v1.1 M1c 段 fill in：快速部署 5 步 + iPhone Safari E2E 4 步 + 三档 Profile + vitest 测试 + v1.0 runtime 不漂移守门 + Funnel vs 直连延迟
- DD-1 实施报告 6 段：§1 任务定义 / §2 CHANGELOG 填实 / §3 README 填实 / §4 v0.3 audit-scope 准备 / §5 verbatim 验证 6 项 / §6 cross-ref + next

守门:
- 不锁型号 grep (前向交付物): 0 行
- tracked 锚定 == 71（DD-1 起草后 docs/ 无新增命中）
- DEEPSEEK_API_KEY 完整 key grep: 0 行 (env-inject only)
- v1.0 runtime 0 行 diff (ADR 0010 Decision d)
- Funnel E2E 实测数据：HTTP/2 200 + TTFB 582ms

Co-Authored-By: Claude Code <noreply@anthropic.com>"

# 3. git push via Clash proxy（per M0b BE-1 踩坑 + 2026-09-02 GH013 amend 教训）
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin main

# 4. 归档 commit（audit trail）：
git add docs/DISPATCH-T-M1c-DD-1.md \
        notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md \
        notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md \
        notes/codex-review-v1.1-m0c-v0.3-precommit-report.md
git commit -m "chore(m1c): T-M1c-DD-1-FIX 修复 + audit trail

- DISPATCH-T-M1c-DD-1.md: DD-1 任务书
- notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md: hygiene 守门聚合
- notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md: Codex 复审 prompt
- notes/codex-review-v1.1-m0c-v0.3-precommit-report.md: Codex 复审报告

守门: v0.3 precommit fix done
Co-Authored-By: Claude Code <noreply@anthropic.com>"
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin main
```

### 5.2 Codex 复审触发（commit 后 formal 轮）

```bash
# 1. user 亲提 Codex CLI（gpt-5.6-sol + xhigh）
codex -m gpt-5.6-sol -c model_reasoning_effort=xhigh \
      --input notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md \
      --output notes/codex-review-v1.1-m0c-v0.3-formal-report.md

# 2. Codex 输出 PASS → 走 §5.3 M2 阶段 5 DISPATCH 起草
# 3. Codex 输出 CHANGES REQUIRED → 修 F1-F4 hygiene + §3 验证命令失败项 → 重新提交
```

### 5.3 M2 阶段 5 DISPATCH 起草派发（Codex PASS + user 「Start v1.1 M2」）

```bash
# 1. user signal "Start v1.1 M2" (per PRD-v1.1 §4.6 第 3 条)

# 2. 真实工程师接手（非 subagent；DO-1 必须上 newvps + 5 边缘 host 实部署）：
#    - BE-1: TypeScript wrapper 6 host 适配 + STT worker + Web Push gateway（subagent 可辅助原型）
#    - TG-1: dsh 真调（6 host 路由）+ STT 集成（whisper.cpp）+ VAPID key 生成（真实工程师）
#    - DO-1: user 上 6 host 部署（newvps + 5 边缘）+ Tailscale Funnel 6 入口（user 真实部署）
#    - QA-1: mock 替换为真 dsh 6 host + STT 真调 + Web Push 端到端 + 6 Funnel 验证（真实工程师 + 真机）
#    - DD-1: CHANGELOG 增 [1.1.0-M2] 段 + README v1.1 段补 M2 实施细节 + v0.4 升级准备（subagent 可辅助）

# 3. 实施者按各自 DISPATCH §6 报告模板填实跑数据

# 4. 架构师按 §4.1 M2 Exit Gate + v0.4 升级门槛验证

# 5. 全部 PASS → v0.4 升级 → 走 M3 阶段（GA final）
```

---

## §6 沉淀机制（per Codex 复审流水线模式）

### 6.1 已落地沉淀

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
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit-prompt.md`（**本文件** = Cursor 审验 prompt，precommit 轮）

### 6.2 待生成沉淀（Codex 复审后）

- `notes/codex-review-v1.1-m0c-v0.3-precommit-report.md`（v0.3 升级 precommit 轮复审报告）
- `notes/codex-review-v1.1-m0c-v0.3-formal-report.md`（v0.3 升级 formal 轮复审报告）
- 若 Codex FAIL → `notes/codex-audit-scope-v1.1-m0c-v0.3-scope-fix.md`（F1-F4 hygiene fix 派工）
- 若 Codex PASS → 进入 §5.3 M2 阶段 5 DISPATCH 起草派发流程

### 6.3 未来复用

- v0.4 / M3 升级时按本模式建新 audit-scope-prompt 文件
- 引用 v0.3 audit-scope 作为模板
- 提交前必走 self-audit + 必修 F1-F4 hygiene findings（per fish-harness-project.md 2026-09-01 立）

---

## §7 审验 checklist（Cursor 必填）

- [ ] (A) v0.3 升级完整性 — CHANGELOG 5 子段 + README M1c 6 子段
- [ ] (B) DD-1 实施报告 6 段齐全
- [ ] (C) 不锁型号守门 — §3 验证 #D + tracked 锚定 == 71
- [ ] (D) v1.0 runtime 不漂移守门 — §3 验证 #F
- [ ] (E) DEEPSEEK_API_KEY 不泄漏 — §3 验证 #E
- [ ] (F) Funnel E2E 实测数据准确性 — §3 验证 #G + 链接 + 截屏证据
- [ ] (G) cc-ready.json 事实准确性 — 7 子项
- [ ] (H) M2 hygiene 守门预备 — §4.5/§4.6/§4.7 三守门到位
- [ ] (I) 潜在新 finding — G1-G6 主动探查

**判定**: ☐ PASS  ☐ CHANGES REQUIRED（findings ___） ☐ PARTIAL（___ PASS / ___ FAIL）

**findings 列表**（如有）：

| ID | 等级 | file:line | 描述 | 修法建议 |
|----|------|-----------|------|----------|
| | | | | |

---

*audit-scope-prompt — v1.1 M0c v0.3 升级 + DD-1 实施报告 precommit 轮审验 prompt for Cursor（Codex v0.3 风格）；grep 自伤豁免机制由 `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` 提供；本 prompt 含完整 §1-§7 审验框架 + 下一枪 commit/push + Codex 复审 + M2 阶段 5 DISPATCH 起草派发流程*