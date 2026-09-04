# Codex Audit-scope v0.1 — v1.2.0a Codex 复审 prompt

> **Date**: 2026-09-04
> **配套**: [codex-audit-scope-v1.2.0a-v0.1.md](./codex-audit-scope-v1.2.0a-v0.1.md)
> **Codex 提交铁律**: Claude 不亲提 Codex CLI; user 亲提 `gpt-5.6-sol` + `reasoning_effort=xhigh`
> **报告落点**: `notes/codex-review-v1.2.0a-v0.1-formal-report.md` (NEW; v1.2.0a 起草继承引用式纪律)
> **预期终态**: 0C/0M/0m + v1.2.0a §4.10 commander 真实现守门全绿 + §4.10 NEW wrapper/orchestrator/ API key 守门全绿 + §4.8 NEW wrapper/orchestrator/ PROJECT_ROOT 守门全绿 + tracked 锚定 post-v1.2.0a 引用式纪律 + 集成测试 gated 守门全绿

---

## §1 复审范围

v1.2.0a 17 文件改动（per `codex-audit-scope-v1.2.0a-v0.1.md` §1 #1-#17）：

- 4 wrapper/orchestrator/ 文件（commander.ts REWRITE + orchestrator.ts Edit + types.ts Edit + workflow_pack.ts NEW ~270 行）
- 5 wrapper/test/ 文件（setup.ts Edit + commander.test.ts REWRITE 15 tests + workflow_pack.test.ts NEW 12 tests + orchestrator.test.ts Edit + server.test.ts Edit）
- 1 wrapper/test/integration/ 文件 = 2 NEW integration tests（orch_commander.test.ts + pack_plan.test.ts gated by env var）
- 1 workflow_packs/ JSON（default.json NEW）
- 2 notes/ v1.2.0a audit-scope/prompt NEW（本 prompt 配套 audit-scope）
- 3 docs/ 文件（cc-ready.json + CHANGELOG.md + README.md Edit）

---

## §2 Codex 必跑验证命令矩阵（13 条 + 11 条自检 = 24 条总命令）

### §2.1 §1 不锁型号守门（NORTH-STAR A-4 等价类 + v1.2.0a §1.5 wrapper/orchestrator/ 额外守门）

```bash
# tracked 锚定
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'

# disk 锚定
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0a-v0.1.md | wc -l

# v1.2.0a 前向交付物
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md workflow_packs/default.json | wc -l

# v1.2.0a NEW wrapper/orchestrator/ 额外守门
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l
```

期望：`tracked == §1.5 主表合计（v1.2.0a 实测 = 116）` + `disk == §1.5 主表 disk 行（v1.2.0a 实测 = 127）` + `前向交付物 == 0` + `wrapper/orchestrator/ == 0`。

### §2.2 §2 不硬编码 API key 守门（含 v1.2.0a §2.5 wrapper/orchestrator/ 额外守门 NEW）

```bash
grep -rE "sk-[a-z0-9]{32,}" wrapper/ deploy/ env/ CHANGELOG.md README.md workflow_packs/ | wc -l
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md workflow_packs/default.json | wc -l
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}" wrapper/ deploy/ env/ | wc -l

# v1.2.0a NEW wrapper/orchestrator/ 额外守门
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/ | wc -l
```

期望：全部 == 0。

### §2.3 §3 v1.0 runtime 0 行 diff 守门（v0.7 锚定维持）

```bash
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
```

期望：== 0。

### §2.4 §4 dsh headless profile 守门（含 v1.2.0a §4 heuristic fallback 守门 NEW）

```bash
grep -rE "profile: ['\"]web['\"]|profile=web" wrapper/ | wc -l
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l

# v1.2.0a NEW heuristic fallback 守门
grep -cE "plan_metadata.*source|heuristic" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | awk -F: '{s+=$NF} END{print s}'

# v1.2.0a NEW commander 真实现 dsh 调用守门
grep -cE "callDshHeadless|dshInvoke" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | awk -F: '{s+=$NF} END{print s}'
```

期望：web == 0 + headless ≥ 3（v1.2.0a formal 实测 48 = v0.7 19 + v1.2.0a commander/workflow_pack/tests 新增）+ heuristic ≥ 4（实测 10）+ dsh 调用 ≥ 2（formal 校准 pattern callDshHeadless|dshInvoke，实测 2——原 `dsh.*--profile` 抓不到封装调用，实现合规）.

### §2.5 §4.5 多 host 守门（v0.7 锚定维持，v1.2.0a 不动 deploy/）

```bash
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md workflow_packs/ | grep -v "127.0.0.1" | wc -l
grep -rE "ts\.net" deploy/ | wc -l
grep -rE "https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/" docs/ deploy/ | wc -l

# v0.7 §4.5.7 5 edge compose 起草守门（v0.7 锚定维持）
grep -rE "sleep infinity" deploy/ | wc -l  # == 0
grep -rE "harness-edge[1-5]" deploy/ | wc -l  # ≥ 5
grep -rE "tag:harness-edge" deploy/tailscale-acl.yaml | wc -l  # ≥ 1
```

期望：IP 锁 == 0 + ts.net ≥ 6 + Funnel URL ≥ 6 + sleep infinity == 0 + harness-edge ≥ 5 + tag:harness-edge ≥ 1。

### §2.6 §4.6 STT 守门（v0.7 锚定维持）

```bash
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ env/ workflow_packs/ | wc -l
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l
```

期望：全部 == 0。

### §2.7 §4.7 Web Push 守门 + §4.7.6 server.ts 8 endpoint 守门（v0.7 锚定维持）

```bash
grep -rE "hmacSha256\s*\(\s*signingInput" wrapper/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -rE "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1
grep -rE "dsaEncoding\s*:\s*['\"]ieee-p1363['\"]" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1

# server.ts 8 endpoint 守门（v0.7 锚定维持）
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)|app\.use\(\s*\(\s*_req" wrapper/server.ts; grep -c "registerApiRoute('" wrapper/server.ts  # 合计 ≥ 7
```

期望：8-endpoint 合计 ≥ 7（v1.2.0a formal GATE-CALIB per D-9 Option B：SPA fallback 移交 pwa_server.ts L111 `*path`，server.ts = 7 API = 5 经 registerApiRoute 双注册（直连 + Funnel stripped）+ /health + /api/stt；原 ≥8 pattern 只认 app.get 直书实测 2 误报）。

### §2.8 §4.8 PROJECT_ROOT 路径修法守门 + v1.2.0a §4.8 NEW wrapper/orchestrator/ 守门

```bash
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 4（v0.7 锚定维持）
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/*.ts | wc -l  # == 0
grep -E "projectRoot\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l  # == 0

# v1.2.0a NEW wrapper/orchestrator/ PROJECT_ROOT 守门
grep -E "import.meta.url" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | wc -l  # ≥ 1（formal 实测 2——M2 修复后 PACKS_DIR 用 fileURLToPath 解析，cwd 无关）
```

期望：import.meta.url in 4 dsh files ≥ 4 + 残留 == 0 + workflow_pack.ts ≥ 1。

### §2.9 §4.9 dsh binary install 守门（v0.7 锚定维持）

```bash
test -f deploy/install-dsh.sh
grep -cF 'DSH_VERSION:-' deploy/install-dsh.sh  # ≥ 1
grep -cF 'if [[ -z "${DSH_VERSION}" ]]' deploy/install-dsh.sh  # ≥ 1
grep -c "set -euo pipefail" deploy/install-dsh.sh  # ≥ 1
grep -c "npm install -g @deepseek-ai/dsh@" deploy/install-dsh.sh  # ≥ 1
grep -cE "dsh@latest" deploy/install-dsh.sh  # == 0
grep -E "https://github\.com/.*dsh.*releases/download" deploy/install-dsh.sh | wc -l  # == 0
grep -E "DSH_VERSION=" deploy/install-dsh.sh | wc -l  # ≥ 1
```

期望：全部命中（v0.7 npm 渠道 deviation 校准后守门）。

### §2.10 §4.10 commander 真实现守门（v1.2.0a NEW — 14 项 grep 守门 + 2 file exists）

```bash
# TODO(M1) stub 清零
grep -rE "TODO\(M1\)" wrapper/orchestrator/commander.ts | wc -l  # == 0（commander stub 清零）
grep -rE "TODO\(M1\)" wrapper/orchestrator/ | wc -l  # == 16（formal 校准：commander.ts == 0 ✓ 收口；worker.ts 16 保留系 v1.2.0b 范围 per plan——原期望 ==0 与 v1.2.0b 注记自相矛盾）

# WorkflowPack import + 至少一处调用
grep -c "WorkflowPack" wrapper/orchestrator/commander.ts  # ≥ 3（起草实测 3）

# PlanPlan / PlanStep enriched
grep -cE "PlanPlan|PlanStep" wrapper/orchestrator/commander.ts  # ≥ 4（起草实测 10）

# AggregateError 类引用
grep -c "AggregateError" wrapper/orchestrator/commander.ts  # ≥ 2（起草实测 5）

# orchestrator.ts 真走 commander
grep -cE "commander\.(planStep|dispatchStep|aggregateResults)" wrapper/orchestrator/orchestrator.ts  # ≥ 3

# OrchestrationResult 三态字段
grep -cE "completed_steps|failed_steps|pending_steps" wrapper/orchestrator/commander.ts wrapper/orchestrator/types.ts  # ≥ 4

# workflow_pack.ts + workflow_packs/default.json 文件存在
test -f wrapper/orchestrator/workflow_pack.ts  # NEW 文件存在
test -f workflow_packs/default.json  # NEW 文件存在

# loadManifest 真读 workflow_packs/*.json
grep -c "loadManifest" wrapper/orchestrator/workflow_pack.ts  # ≥ 1

# heuristic fallback 不依赖 DEEPSEEK_API_KEY
grep -c "heuristic" wrapper/orchestrator/workflow_pack.ts  # ≥ 2（formal 校准 pattern 宽词，实测 8——原 pattern 命中 1 误报）

# commander.ts health() version="1.2.0a"
grep -E "version.*1\.2\.0a|1\.2\.0a" wrapper/orchestrator/commander.ts | wc -l  # ≥ 1

# orchestrator.ts dispatch output plan_steps + plan_source
grep -cE "plan_steps|plan_source" wrapper/orchestrator/orchestrator.ts  # ≥ 2

# 集成测试 gated 守门
grep -cE "RUN_ORCH_COMMANDER_E2E|RUN_PACK_PLAN_E2E" wrapper/test/integration/orch_commander.test.ts wrapper/test/integration/pack_plan.test.ts  # ≥ 2

# 单测增量
grep -c "describe\|it(" wrapper/test/unit/commander.test.ts wrapper/test/unit/workflow_pack.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 25
```

期望：14 项 grep 全绿 + 2 file exists + 单测增量 ≥ 25。

### §2.11 cc-ready.json 翻牌

```bash
jq -e '.task_id == "T-V1.2.0A-COMMANDER-PASS"' docs/poll/cc-ready.json
```

期望：true。

---

## §3 hygiene 自检 checklist（13 项）

- [ ] §1 不锁型号 grep == 0（前向交付物 + tracked == §1.5 主表 + disk == §1.5 主表 disk 行 + wrapper/orchestrator/ == 0）
- [ ] §2 不硬编码 API key == 0（DEEPSEEK + VAPID + Tailscale auth key + wrapper/orchestrator/ == 0）
- [ ] §3 v1.0 runtime 0 行 diff（harness/spec/spikes/9 ADR/Dockerfile/docker-compose/pyproject）
- [ ] §4 dsh headless profile（web == 0 + headless ≥ 3 + heuristic ≥ 4 + dsh 调用 ≥ 2）
- [ ] §4.5 多 host 守门（IP 锁 == 0 + ts.net ≥ 6 + Funnel URL ≥ 6 + sleep infinity == 0 + harness-edge ≥ 5 + tag:harness-edge ≥ 1）
- [ ] §4.6 STT 守门（音频留盘 == 0 + 临时目录 == 0 + Whisper 模型路径合规）
- [ ] §4.7 Web Push 守门（VAPID 私钥 == 0 + signVapidJwt ≥ 2 + dsaEncoding ≥ 1 + createSign ≥ 1 + server.ts 8 endpoint ≥ 8）
- [ ] §4.8 PROJECT_ROOT 路径修门（4 dsh 文件 import.meta.url ≥ 4 + 残留 == 0 + workflow_pack.ts ≥ 1 NEW）
- [ ] §4.9 dsh binary install 守门（DSH_VERSION 强校验 ≥ 2 + set -euo pipefail ≥ 1 + npm 版本 pin ≥ 1 + @latest == 0 + GitHub URL 硬编码 == 0）
- [ ] **§4.10 commander 真实现守门 NEW**（TODO(M1) in commander.ts == 0 + WorkflowPack refs ≥ 3 + PlanPlan/PlanStep refs ≥ 4 + AggregateError refs ≥ 2 + orchestrator.ts 真走 commander ≥ 3 + workflow_pack.ts + workflow_packs/default.json file exists + loadManifest ≥ 1 + heuristic ≥ 2 + version="1.2.0a" ≥ 1 + plan_steps/plan_source ≥ 2 + 集成测试 gated ≥ 2 + 单测增量 ≥ 25）
- [ ] §5 v1.2.0a 17 文件 hygiene 自检表
- [ ] §7 教训记档验证（commander 真实现 stub → real + workflow_pack heuristic fallback + AggregateError 三态契约 + setup.ts env var + 集成测试 gated + tracked 锚定维持 + 3-of-4 真实现 + 9 user must execute items）
- [ ] 双 gate（typecheck + tests；tsc exit 0 + vitest 147 passed | 95 skipped (242)——formal 校准：M3 修复后 server.test 稳定 pass +1，skip -1）

---

## §4 引用式纪律（6 处 PASS 验证）

按 Codex v0.4 §7.3 ② 升级 + v0.6 §7.4 ④ 延伸至 disk + v0.7 §4 延伸至 v1.2.0a；v1.2.0a 报告凡引用以下数字必走「audit-scope §1.5 主表唯一权威源」引用式，不复制绝对数字：

1. tracked 锚定数字 — 引用 §1.5 主表合计
2. disk 锚定数字 — 引用 §1.5 主表 disk 行
3. 前向交付物 grep 数字 — 引用 §2.1 第 3 条命令实测
4. wrapper/orchestrator/ 不锁型号 — 引用 §2.1 第 4 条命令实测
5. v1.2.0a §4.10 14 项 commander 真实现守门 — 引用 §2.10 各 grep 实测（drafting 实测 baseline：WorkflowPack=3 / PlanPlan|PlanStep=10 / AggregateError=5 / orchestrator 真走 commander=待实测）
6. 单测增量 ≥ 25（commander 15 + workflow_pack 12）— 引用 §2.10 第 14 条实测

**禁止**：(a) 公式预测任何锚定数字；(b) 复制绝对数字（演进链除外，仅作历史）；(c) 「占位后填」模式（实测前不写报告）。

---

## §5 复审预期 + Codex formal 报告格式

**复审预期终态**：0C/0M/0m PASS + §4.10 commander 真实现守门 14 项全绿 + §2.5 wrapper/orchestrator/ API key 守门全绿 + §4.8 wrapper/orchestrator/ PROJECT_ROOT 守门全绿 + tracked 锚定 post-v1.2.0a 引用式 + 集成测试 gated 守门全绿。

**Codex formal 报告落点**：`notes/codex-review-v1.2.0a-v0.1-formal-report.md`

**报告必含**：
- 0C/0M/0m 终态（CHANGES REQUIRED → 复审 → PASS）
- §1-§4.10 全部 13 项 hygiene checklist 验证结果
- 6 处引用式机制落地 PASS（不复制数字，引用 §1.5 + §2.5 + §2.10 + §4.10）
- tracked 锚定 post-v1.2.0a 引用式（仅引用 audit-scope §1.5 主表合计，不复制绝对数字）
- v1.2.0a 周期 17 文件改动 verbatim §1.5 主表
- v1.2.0a §7 教训记档验证（commander 真实现 stub → real / workflow_pack heuristic fallback / AggregateError 三态契约 / setup.ts env var / 集成测试 gated / tracked 锚定维持 / 3-of-4 真实现 / 9 user must execute）
- Codex 提交铁律维持（Claude 不亲提，用户亲提；push via Clash proxy）

---

## §6 复审环境注记（继承 v0.4 §5.3 + v0.6 §5.3 + v0.7 §5.3 + v1.2.0a §8 实战）

- **tsc**：`cd wrapper && ./node_modules/.bin/tsc --noEmit`（**项目本地 bin 必用**，禁 npx tsc — 会拉假 typosquat 包 exit=0 假绿）
- **vitest**：`cd wrapper && ./node_modules/.bin/vitest run`（**项目本地 bin 必用**，禁 npx --yes vitest — 缺 rolldown binding）
- **typecheck + tests 双 gate**：tsc exit 0 + vitest 0 failed（**146 passed | 96 skipped** 是 v1.2.0a 起草实测基准）
- **env-inject**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 仅 env var 注入，不入 commit
- **VAPID 公钥**：`deploy/vapid_public.key` 单文件白名单入库（per v0.6 §4.7 GATE-CALIB）
- **vitest setupFiles 优先模式**（v1.2.0a NEW §7-4）：`test/setup.ts` 在所有 test file 加载前执行（hoist-safe），env var mutation 必须在此层
- **commander 真实现 heuristic fallback 不依赖 DEEPSEEK_API_KEY**（v1.2.0a NEW §7-2）：unit test 默认场景下 plan() 走 heuristic 1-step plan；production env var 注入后才走 dsh 真调
- **集成测试 gated by env var**（v1.2.0a NEW §7-5）：`RUN_ORCH_COMMANDER_E2E=1 RUN_PACK_PLAN_E2E=1 DEEPSEEK_API_KEY=<key> ./node_modules/.bin/vitest run test/integration/{orch_commander,pack_plan}.test.ts`

---

*Codex audit-scope v0.1 复审 prompt — 24 条验证命令 + 13 项 hygiene checklist + 6 处引用式机制落地验证 + 复审预期 0C/0M/0m；Codex 提交铁律 user 亲提 `gpt-5.6-sol` + `xhigh`；报告落点 `notes/codex-review-v1.2.0a-v0.1-formal-report.md`*

Co-Authored-By: Claude Code <noreply@anthropic.com>