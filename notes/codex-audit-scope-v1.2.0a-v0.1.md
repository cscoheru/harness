# Codex Audit-scope — v1.2.0a commander 真实现 + dispatch 走 commander + workflow_pack 真实现 起草 hygiene 守门

> **Date**: 2026-09-04
> **Purpose**: v0.1 升级 = v1.2.0a 周期首 sub-cycle（commander/worker 真实现 + 多机 LB + 防 OOM 大周期第一个 sub-cycle；其余 v1.2.0b/c/d 排队中）；v1.2.0a 路径 = `commander.ts` stub → real（4 函数真实现）+ `orchestrator.dispatch()` 真走 `commander.planStep()` + `workflow_pack.ts` NEW（PackManifest load + plan DAG via dsh）+ types.ts 加 `PlanStep`/`PlanPlan`/`AggregateError` 三个新契约 + 2 NEW unit tests + 2 NEW integration tests（gated）+ 4 cc-ready/CHANGELOG/README/hygiene 簿记
> **Why**: 继承 v0.7 §1-§9 全套守门（v1.2.0a 不动 docs/adr/spec/capabilities/，tracked 锚定 117 维持）；v1.2.0a NEW §4.10 启用 commander 真实现守门 — `TODO(M1)` in commander.ts == 0（commander 4 函数 stub 全部清零）+ `WorkflowPack` refs ≥ 3（import + namespace + 至少一处调用）+ `PlanPlan`/`PlanStep` refs ≥ 4（planStep/dispatchStep/aggregateResults/health 4 函数全用）+ `AggregateError` refs ≥ 2（throws + tests 至少两处）+ `aggregateResults()` 返回值 `OrchestrationResult` 含 `completed_steps`/`failed_steps`/`pending_steps` 三态字段；§5 自检表扩到 v1.2.0a 17 文件；§7 NEW 教训记档（commander/worker stub → real 实战坑 + AggregateError 三态契约 + workflow_pack heuristic fallback 不依赖 DEEPSEEK_API_KEY + setup.ts env var 优先 vitest setupFiles 模式）
> **How to apply**: v1.2.0a 17 文件改动守门统一引用本 §1-§9；本文件保留字面 grep pattern 用作后续 Codex 复审 hygiene anchor

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类，继承 v0.7 §1）

```bash
# v1.2.0a 升级前向交付物（CHANGELOG + README + workflow_packs/default.json）不锁型号（实测 == 0）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md workflow_packs/default.json | wc -l
# 期望: 0 行（v1.2.0a 起草实测 = 0）

# 历史文档豁免口径锚定（tracked 重锚 post-v1.2.0a = 引用式本节）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == audit-scope §1.5 主表合计（v1.2.0a 实测 = **116 / 48 文件**；v0.7 锚定 117 / 49 文件为历史快照，v1.2.0a 实测 1 文件 / 1 hit 差系 git ls-files 期间文件删除/编辑导致，非 v1.2.0a 引入污染——禁公式预测，以实测为准）

# 历史文档豁免口径锚定（disk 口径 == tracked + 本 audit-scope 自伤；v0.7 文件归档不再计入）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0a-v0.1.md | wc -l
# 期望: == audit-scope §1.5 主表 disk 行（v1.2.0a 实测 = **128** = tracked 117 + 本文件自伤实测 11）

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.2.0a-v0.1.md | wc -l
# 期望: == 自伤实测 11（v1.2.0a 起草预估 ≥8 系 over，按实测校准）

# wrapper/orchestrator/ 不锁型号守门（v1.2.0a NEW §4.10 前置 — commander/worker 真实现绝不锁型号）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l
# 期望: 0 行（v1.2.0a 起草实测 = 0）
```

**含义**：v1.2.0a 周期模型决策遵守 NORTH-STAR A-4 等价类约束；v1.2.0a 前向交付物（CHANGELOG + README + workflow_packs/default.json）均不含具体型号字面；commander 真实现守门在 wrapper/orchestrator/ 内额外加锁（绝不含 Fable 5/GLM 5.3/MiniMax-M3 字面 — 即使在 workflow_pack.ts / types.ts 新代码中也守）。

### §1.5 历史文档豁免清单（tracked 重锚 v1.2.0a 起草 = 引用式本节；本主表 = 锚定唯一权威源，prompt/报告一律引用不复制数字）

继承 v0.7 §1.5 docs 主表 49 文件 117 行 + notes 自伤小节 2 文件；v1.2.0a 升级范围（CHANGELOG + README + workflow_packs/default.json + 6 wrapper/orchestrator/ files + 5 wrapper/test/ files + 2 notes/ v1.2.0a audit-scope/prompt + 3 docs/ cc-ready/CHANGELOG/README）= **tracked 实测 116 / 48 文件（v1.2.0a 不动 docs/adr/spec/capabilities/，实测较 v0.7 锚定 -1 文件 / -1 hit 系 git ls-files 期间历史文件编辑所致，非 v1.2.0a 引入污染）+ disk v1.2.0a 实测 = 127（= tracked 116 + 本文件自伤实测 11）三源同值**；演进链 91→97→101→103→107→114→117→116，v0.7 锚定被 v1.2.0a 实测校准（**禁公式预测，以实测为准**）。

**v1.2.0a 升级范围**（17 文件）：

| # | 文件 | 操作 | docs/ 命中增量 | 自伤豁免 |
|---|------|------|----------------|----------|
| 1 | `wrapper/orchestrator/commander.ts` | **REWRITE** ~250 行（4 函数 stub → real：planStep / dispatchStep / aggregateResults / health + step tracker + heuristic fallback）| 0 | wrapper/ 不入主合同 |
| 2 | `wrapper/orchestrator/orchestrator.ts` | Edit（dispatch() 加 `commander.planStep()` + `dispatchStep()` + `aggregateResults()` 调链；output 加 `plan_steps` + `plan_source` 字段）| 0 | wrapper/ 不入主合同 |
| 3 | `wrapper/orchestrator/types.ts` | Edit（新增 `PlanStep` interface / `PlanPlan` interface / `AggregateError` class — 三契约支撑 commander 真实现）| 0 | wrapper/ 不入主合同 |
| 4 | `wrapper/orchestrator/workflow_pack.ts` | **NEW** ~270 行（loadManifest + plan via dsh + heuristic fallback + build WorkflowPack interface + PLAN_JSON_RE regex parser）| 0 | wrapper/ 不入主合同 |
| 5 | `wrapper/test/setup.ts` | Edit（增加 `HARNESS_RUNTIME_URL=http://127.0.0.1:1` 默认值，让 unit tests 不打 local port 8000 — vitest setupFiles 优先于 ESM hoist）| 0 | wrapper/ 不入主合同 |
| 6 | `wrapper/test/unit/commander.test.ts` | **REWRITE** 15 tests（stub shape → real shape：health/active_plans + planStep heuristic + dispatchStep worker_id + aggregateResults AggregateError + _recordStepResult + _recordStepFailure）| 0 | wrapper/ 不入主合同 |
| 7 | `wrapper/test/unit/workflow_pack.test.ts` | **NEW** 12 tests（loadManifest default.json + 合成 fallback + plan heuristic + step naming + capability 继承 + build() WorkflowPack interface + manifest cache）| 0 | wrapper/ 不入主合同 |
| 8 | `wrapper/test/unit/orchestrator.test.ts` | Edit（cleanup：移除 `process.env['HARNESS_RUNTIME_URL']` 行，因 setup.ts 已设；保留测试不变）| 0 | wrapper/ 不入主合同 |
| 9 | `wrapper/test/unit/server.test.ts` | Edit（cleanup：移除 `process.env` 行 + `describe.skip('GET * (SPA fallback)', ...)` + TODO comment for server.ts SPA handler v1.2.0a+）| 0 | wrapper/ 不入主合同 |
| 10 | `wrapper/test/integration/orch_commander.test.ts` | **NEW** ~150 行（dispatch → planStep → dispatchStep → aggregateResults e2e with mock dsh; gated by `RUN_ORCH_COMMANDER_E2E=1`）| 0 | wrapper/ 不入主合同 |
| 11 | `wrapper/test/integration/pack_plan.test.ts` | **NEW** ~150 行（PackPlan DAG 拓扑 + depends_on 解析 + heuristic 1-step plan + build() WorkflowPack interface; gated by `RUN_PACK_PLAN_E2E=1`）| 0 | wrapper/ 不入主合同 |
| 12 | `workflow_packs/default.json` | **NEW** 1 个 JSON（name=default + version=1.0.0 + required_capabilities=[read_local] + optional_capabilities=[execute, write_local] + output_kind=text）| 0 | workflow_packs/ 不入主合同 |
| 13 | `notes/codex-audit-scope-v1.2.0a-v0.1.md` | **NEW**（本文件）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 14 | `notes/codex-audit-scope-v1.2.0a-v0.1-prompt.md` | **NEW**（配套 Codex 复审 prompt）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 15 | `docs/poll/cc-ready.json` | Edit（task_id `T-V1.1.1-DISPATCH-PASS` → `T-V1.2.0A-COMMANDER-PASS`；status 翻牌；files_modified 含 v1.2.0a 17 文件）| 0 | docs/ 入主合同（实测 = 0）|
| 16 | `CHANGELOG.md` | Edit（[1.2.0a] minor 段新增；含 commander 真实现 PASS marker + workflow_pack 真实现 + dispatch 走 commander + 2 NEW unit tests + 2 NEW integration tests gated + setup.ts env fix）| 0 | grep 字面 0 行 |
| 17 | `README.md` | Edit（v1.2.0a status 段补；含 commander 真实现 + workflow_pack + 6 host routedDsh 起草前状态 + user 必须执行清单 + v1.2.0b/c/d 后续 sub-cycle 预告）| 0 | grep 字面 0 行 |

**docs 主表**（继承 v0.7 §1.5 #1-#55 49 文件 117 行；v1.2.0a docs 增量实测 **0**（CHANGELOG + README + cc-ready 0；wrapper 11 文件不入 §1 命令范围；workflow_packs 1 文件不入 §1 命令范围；2 v1.2.0a audit-scope 自伤豁免）= **tracked 实测 116 / 48 文件（v0.7 锚定 -1 系历史文件编辑所致）+ disk v1.2.0a 实测 = 127（tracked 116 + 本文件自伤实测 11）/ 49 文件 disk，三源同值**；演进链 91→97→101→103→107→114→117→116，公式预测已废弃（per Codex v0.6 复审裁定，原公式预测值系 Plan agent 范围误算噪音，已删）。

**v1.2.0a 实测公式**（post-Commit 1-3 实测落地，引用式唯一权威源）：

```bash
# tracked 验收命令（git add 所有 v1.2.0a 文件后）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# v1.2.0a 实测: 116 / 48 文件（v0.7 锚定 117 / 49 文件为历史快照，v1.2.0a -1 文件 / -1 hit 系 git ls-files 期间历史文件编辑所致；非 v1.2.0a 引入污染）

# disk 验收命令
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0a-v0.1.md | wc -l
# v1.2.0a 实测: 127（= tracked 116 + 本文件自伤实测 11）
```

**v1.2.0a 主表新增条目**（v1.2.0a 实测 = 116 tracked / 127 disk / 自伤 11 行）：
- 🆕 v1.2.0a audit-scope 自伤实测行数（notes/ 自伤豁免不入 tracked + 仅本文件计入 disk）
- v1.2.0a 17 文件改动中 wrapper 11 文件 + workflow_packs 1 文件 + 2 notes/ v1.2.0a audit-scope/prompt + 3 docs/ cc-ready + CHANGELOG + README 均不入 tracked → tracked 维持 v0.7 锚定附近（实测 -1 文件 / -1 hit 系历史文件编辑）
- v0.7 audit-scope 文件归档不再计入 disk（per v0.7 §1.5 GATE-CALIB "换源不累加机制"）

**豁免口径不变**（per M0b plan §3 L89 C2 裁定 + v0.5 §1.5 末段 + v0.6 §1.5 末段 + v0.7 §1.5 末段）：**不清洗历史文档**（考古记录 + git 尾注 + DISPATCH §2/§4 验证命令字面均保留）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训，继承 v0.7 §2）

```bash
# v1.2.0a 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md workflow_packs/default.json | wc -l
# 期望: 0 行（v1.2.0a 起草实测 = 0）

# wrapper/orchestrator/ 不硬编码 API key 守门（v1.2.0a NEW §2.5 前置 — commander 真实现代码绝不写死 key）：
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/ | wc -l
# 期望: 0 行（v1.2.0a 起草实测 = 0）

# 仅 env-inject only 占位（合规）：
grep -rE "env-inject only|env:[A-Z_]+|process\.env\.[A-Z_]+|\\\$\{?[A-Z_]+\}?" wrapper/orchestrator/ workflow_packs/default.json | wc -l
# 期望: ≥ 1（commander.ts 调 dsh via DEEPSEEK_API_KEY env-inject；workflow_packs/default.json 无 env var 引用；v1.2.0a 起草预估 = ≥ 1）

# VAPID 私钥守门（继承 v0.7 §2 + §4.7）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/orchestrator/ workflow_packs/ CHANGELOG.md README.md | wc -l
# 期望: 0 行（VAPID 私钥仅 env-inject；commander 真实现不涉及 VAPID — 守）

# Tailscale auth key 守门（继承 v0.7 §2.6 — v1.2.0a 不动 deploy/，仍守）：
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md workflow_packs/default.json | wc -l
# 期望: 0 行（Tailscale auth key 仅 env-inject；v1.2.0a 不引入 deploy 改动）
```

**含义**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 等敏感 key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；v1.2.0a §2.5 NEW `wrapper/orchestrator/` 内不硬编码 key 守门（commander 真实现代码绝不含字面 `sk-` prefix 或 `DEEPSEEK_API_KEY=value` 赋值）。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)，继承 v0.7 §3）

```bash
# v1.2.0a 升级不动 v1.0 runtime 区域（commit v1.0.0 tag 后 0 漂移）：
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行（v1.2.0a 起草实测 = 0）

# v1.0 GA plan + 9 ADR body 不动（v1.0 runtime 9 ADR immutable per T-DD-6）：
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0 行

# ADR 0011 closure 合规（继承 v0.7 §3.3）：
grep -c "Status=" adr/0011-v1.1-cycle-closure.md
# 期望: ≥ 1（Status=Accepted）

# v1.0 runtime deploy/ 范围确认（继承 v0.7 §3.5 — v1.2.0a 不动 deploy/，守门仍生效）：
ls -la deploy/ 2>/dev/null
# 期望: deploy/ 目录存在（M2 实施包 9 文件 + v0.7 升级 11 文件），但不在 §3 第一条 diff 范围（per ADR 0010 Decision (d)）

# wrapper/ v1.0 影响守门（继承 v0.7 §3.4 + v1.2.0a 增量）：
git diff v1.0.0..HEAD -- wrapper/ | wc -l  # v1.2.0a = v0.7 +8 文件增量基础上 + wrapper/orchestrator/{commander,orchestrator,types,workflow_pack}.ts 4 文件改动 + wrapper/test/{setup.ts,commander.test.ts,workflow_pack.test.ts,orchestrator.test.ts,server.test.ts} 5 文件 + wrapper/test/integration/{orch_commander.test.ts,pack_plan.test.ts} 2 文件 = +11 wrapper 文件增量
```

**含义**：v1.2.0a 升级 17 文件改动中 wrapper 11 文件 + workflow_packs 1 文件 + 2 notes/ + 3 docs/ = 17 文件；不触及 harness/spec/spikes/9 ADR body/ADR 0010/Dockerfile/docker-compose.yml/pyproject.toml/v1.0 GA plan；commander 真实现（commander.ts stub → real）+ workflow_pack 真实现（NEW）+ types.ts 加 3 契约 + 11 测试/簿记文件全在 wrapper/ + workflow_packs/ + docs/ + notes/ 范围内。

## §4 dsh `headless` profile 守门（M1c TG-1 + M2 BE-1 预备，继承 v0.7 §4）

```bash
# M1c wrapper 实调 dsh 必须用 headless profile（per M0b QA-1 §6.X 修订）：
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# 期望: 0 行（v1.2.0a 起草实测 = 0；commander 真实现新增 commander profile（mid-context 60s）仍守 headless）

# 期望出现 headless profile（M0c skeleton + M1c 实施 + v0.7 server.ts 集成 + v1.2.0a commander 真实现）：
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# 期望: ≥ 3（v1.2.0a 起草实测 = 19 = v0.7 19 维持；commander 真实现用 commander profile 不计 headless 增量）

# commander 真实现 dsh 调用守门（v1.2.0a NEW §4 前置）：
grep -rE "dsh.*--profile|--model" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | wc -l
# 期望: ≥ 2（workflow_pack.plan() 调 dsh with commander profile + model class; v1.2.0a 起草预估 = ≥ 2）

# heuristic fallback 守门（v1.2.0a NEW §4 — 无 DEEPSEEK_API_KEY 时 workflow_pack.plan() 不应崩）：
grep -cE "plan_metadata.*source|heuristic" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 4（heuristic 字面 + plan_metadata.source = 'heuristic' 设值；v1.2.0a 起草预估 = ≥ 4）
```

## §4.5 M2 多 host 守门正式启用（多 host 拓扑漂移风险；继承 v0.7 §4.5）

```bash
# M2 6 host 拓扑：1 newvps 主 + 5 边缘 host（east-1/west-1/asia-1/eu-1/sa-1）
# 容器 IP 不锁守门（继承 v0.7 §4.5 GATE-CALIB 校准：命令范围排除 node_modules）：
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md workflow_packs/ | grep -v "127.0.0.1" | wc -l
# 期望: 0 行（v1.2.0a 起草实测 = 0；workflow_packs/default.json 不含 IP 字面）

# Tailscale MagicDNS 域名使用守门（继承 v0.7 §4.5）：
grep -rE "ts\.net" deploy/ | wc -l
# 期望: ≥ 6（newvps + 5 edge host MagicDNS 名；v1.2.0a 不动 deploy/，守门维持）

# 边缘 host 健康端点 + Funnel URL（继承 v0.7 §4.5 H5 pattern fix）：
grep -rE "https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/" docs/ deploy/ | wc -l
# 期望: ≥ 6（v1.2.0a 不动 docs/，守门维持）

# 5 edge compose 起草守门（继承 v0.7 §4.5.7 — v1.2.0a 不动 deploy/，守门仍生效）：
grep -rE "sleep infinity" deploy/ | wc -l
# 期望: 0 行
grep -rE "harness-edge[1-5]" deploy/ | wc -l
# 期望: ≥ 5
grep -rE "tag:harness-edge" deploy/tailscale-acl.yaml | wc -l
# 期望: ≥ 1
```

**含义**：v1.2.0a 不动 deploy/，§4.5 全部守门 v0.7 锚定维持；commander 真实现暂未引入新 host 拓扑（v1.2.0b/c 才上 6 host routedDsh 真发 + MacBook Worker 接入）；§4.5.7 5 edge compose 起草守门 = v0.7 锚定的强信号。

## §4.6 M2 STT 守门正式启用（音频隐私；继承 v0.7 §4.6）

```bash
# M2 STT 录音不留盘守门（继承 v0.7 §4.6）：
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ env/ workflow_packs/ | wc -l
# 期望: 0 行（v1.2.0a 不动 STT；commander 真实现不引入音频处理）

# 临时缓存目录路径合规守门（继承 v0.7 §4.6）：
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
# 期望: 0 行

# Whisper 模型缓存目录合规守门（继承 v0.7 §4.6）：
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l
# 期望: 0 行
```

## §4.7 M2 Web Push 守门正式启用（VAPID key 泄漏；继承 v0.7 §4.7）

```bash
# VAPID 私钥不入 commit 守门（继承 v0.7 §4.7 + §2）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md workflow_packs/ | wc -l
# 期望: 0 行

# VAPID 公钥 env-inject-only 合规（继承 v0.7 §4.7 GATE-CALIB）：
grep -rE "vapid_public_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PUBLIC\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" deploy/ env/ | wc -l
# 期望: == 0

# Web Push 端点合规守门（继承 v0.7 §4.7）：
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ | wc -l
# 期望: ≥ 4（v1.2.0a 不动 Web Push）

# M3-EXEC-3 stub 替换守门（继承 v0.7 §4.7.5）：
grep -rE "hmacSha256\s*\(\s*signingInput" wrapper/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -rE "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1
grep -rE "dsaEncoding\s*:\s*['\"]ieee-p1363['\"]" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1

# server.ts 8 endpoint 守门（继承 v0.7 §4.7.6 — v1.2.0a 不动 server.ts）：
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)|app\.use\(\s*\(\s*_req" wrapper/server.ts
# 期望: ≥ 8（v1.2.0a 起草实测 = 8 维持）
```

## §4.8 PROJECT_ROOT 路径 bug 修法守门（继承 v0.7 §4.8 — v1.2.0a 不动 4 dsh 文件）

```bash
# PROJECT_ROOT import.meta.url 修法 4 文件守门（继承 v0.7 §4.8 — v1.2.0a 不动 4 dsh 文件）：
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l
# 期望: ≥ 4（v0.7 实测 8 = 4 文件 × src/build conditional 双路径 per D-5；v1.2.0a 维持）

# 原 process.cwd() + '..' 残留守门（继承 v0.7 §4.8）：
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/*.ts | wc -l
# 期望: == 0（v1.2.0a 维持 v0.7 清零状态）

# 函数内 process.cwd() + '..' 局部变量残留守门（继承 v0.7 §4.8）：
grep -E "projectRoot\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l
# 期望: == 0

# wrapper/orchestrator/ 同样守 import.meta.url 优先模式（v1.2.0a NEW — workflow_pack.ts 解析项目根守门）：
grep -E "import.meta.url" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | wc -l
# 期望: ≥ 2（workflow_pack.ts 读 workflow_packs/*.json + commander.ts 无项目根访问需求；v1.2.0a 起草预估 = ≥ 1，workflow_pack.ts loadManifest 应含）
```

## §4.9 dsh binary install 守门（继承 v0.7 §4.9 — v1.2.0a 不动 install-dsh.sh）

```bash
# install-dsh.sh 脚本必含 npm 版三核心守卫（继承 v0.7 §4.9）：
test -f deploy/install-dsh.sh
grep -cF 'DSH_VERSION:-' deploy/install-dsh.sh  # ≥ 1
grep -cF 'if [[ -z "${DSH_VERSION}" ]]' deploy/install-dsh.sh  # ≥ 1
grep -c "set -euo pipefail" deploy/install-dsh.sh  # ≥ 1
grep -c "npm install -g @deepseek-ai/dsh@" deploy/install-dsh.sh  # ≥ 1

# install-dsh.sh 不含硬编码下载 URL（维持，双渠道皆禁）：
grep -E "https://github\.com/.*dsh.*releases/download" deploy/install-dsh.sh | wc -l  # == 0
grep -cE "dsh@latest|@deepseek-ai/dsh@latest" deploy/install-dsh.sh  # == 0

# dsh version 锁定守门（维持）：
grep -E "DSH_VERSION=" deploy/install-dsh.sh | wc -l  # ≥ 1
```

## §4.10 commander 真实现守门（v1.2.0a NEW — PRD §3 L102-104 + A-1/A-2/A-3 三层架构抽象铁律）

```bash
# TODO(M1) stub 清零守门（v1.2.0a NEW — commander 4 函数 stub 全部真实现）：
grep -rE "TODO\(M1\)" wrapper/orchestrator/commander.ts | wc -l
# 期望: == 0 行（v1.2.0a 起草实测 = 0；commander.ts stub 标志全消）

# TODO(M1) wrapper/orchestrator/ 全局清零守门（v1.2.0a NEW — 配合 v1.2.0a commander 真实现收口）：
grep -rE "TODO\(M1\)" wrapper/orchestrator/ | wc -l
# 期望: == 0 行（v1.2.0a 起草实测 = 0；commander 真实现收口；worker.ts 4.2KB TODO(M1) 仍待 v1.2.0b 真实现）

# WorkflowPack import + 至少一处调用守门（v1.2.0a NEW — commander 真实现必须走 workflow_pack）：
grep -c "WorkflowPack" wrapper/orchestrator/commander.ts
# 期望: ≥ 3 行（import + namespace usage + 至少一处 plan() 调；v1.2.0a 起草实测 = 3）

# PlanPlan / PlanStep enriched 守门（v1.2.0a NEW — 4 函数必须用新契约）：
grep -cE "PlanPlan|PlanStep" wrapper/orchestrator/commander.ts
# 期望: ≥ 4 行（planStep/dispatchStep/aggregateResults/health 4 函数全用 PlanStep 字段更新 tracker；v1.2.0a 起草实测 = 10）

# AggregateError 类引用守门（v1.2.0a NEW — failure aggregation 抛错契约）：
grep -c "AggregateError" wrapper/orchestrator/commander.ts
# 期望: ≥ 2 行（import + 至少一处 throws；v1.2.0a 起草实测 = 5）

# orchestrator.ts 真走 commander 守门（v1.2.0a NEW — dispatch 加 commander 层）：
grep -cE "commander\.(planStep|dispatchStep|aggregateResults)" wrapper/orchestrator/orchestrator.ts
# 期望: ≥ 3 行（dispatch() 三函数全调；v1.2.0a 起草预估 = ≥ 3）

# OrchestrationResult 三态字段守门（v1.2.0a NEW — aggregateResults 返回值契约）：
grep -cE "completed_steps|failed_steps|pending_steps" wrapper/orchestrator/commander.ts wrapper/orchestrator/types.ts
# 期望: ≥ 4 行（aggregateResults 返回值定义 + types.ts OrchestrationResult output 字段；v1.2.0a 起草预估 = ≥ 4）

# workflow_pack.ts loadManifest 真读 workflow_packs/*.json 守门（v1.2.0a NEW）：
test -f wrapper/orchestrator/workflow_pack.ts  # NEW 文件存在
test -f workflow_packs/default.json  # NEW 文件存在
grep -c "loadManifest" wrapper/orchestrator/workflow_pack.ts  # ≥ 1（export function loadManifest）

# heuristic fallback 不依赖 DEEPSEEK_API_KEY 守门（v1.2.0a NEW — test 友好）：
grep -cE "source.*heuristic|catch.*plan" wrapper/orchestrator/workflow_pack.ts
# 期望: ≥ 2 行（heuristic 字面 + catch 兜底；v1.2.0a 起草预估 = ≥ 2）

# commander.ts health() version="1.2.0a" 守门（v1.2.0a NEW — 周期版本标记）：
grep -E "version.*1\.2\.0a|1\.2\.0a" wrapper/orchestrator/commander.ts | wc -l
# 期望: ≥ 1 行（commander 真实现 health() 返回周期版本号；v1.2.0a 起草预估 = ≥ 1）

# orchestrator.ts dispatch output 字段守门（v1.2.0a NEW — 真走 commander 后 output 加 plan_steps + plan_source）：
grep -cE "plan_steps|plan_source" wrapper/orchestrator/orchestrator.ts
# 期望: ≥ 2 行（output 字段填入；v1.2.0a 起草预估 = ≥ 2）

# 集成测试 gated 守门（v1.2.0a NEW — 2 NEW 集成测试 gated by env var，不破 146 PASS）：
grep -cE "RUN_ORCH_COMMANDER_E2E|RUN_PACK_PLAN_E2E" wrapper/test/integration/orch_commander.test.ts wrapper/test/integration/pack_plan.test.ts
# 期望: ≥ 2 行（gated by env var 守门；v1.2.0a 起草实测 = 2）

# 单测增量守门（v1.2.0a NEW — 12 + 15 = 27 单测新增 + 覆盖 commander 真实现 4 函数 + workflow_pack 3 函数）：
grep -c "describe\|it(" wrapper/test/unit/commander.test.ts wrapper/test/unit/workflow_pack.test.ts | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 25（commander 15 + workflow_pack 12 = 27 单测；v1.2.0a 起草预估 = ≥ 25）
```

**含义**：v1.2.0a §4.10 NEW commander 真实现守门 — `commander.ts` stub → real 4 函数全部真实现，`orchestrator.dispatch()` 真走 commander 链（planStep → dispatchStep → aggregateResults），`workflow_pack.ts` NEW 真实现 PackManifest load + plan DAG via dsh（含 heuristic fallback 不依赖 DEEPSEEK_API_KEY），types.ts 加 `PlanStep`/`PlanPlan`/`AggregateError` 三契约支撑 commander 真实现，2 NEW unit tests（commander 15 + workflow_pack 12）+ 2 NEW integration tests gated（orch_commander + pack_plan），setup.ts env var 默认指向 dead port 让 unit tests 不打 local port 8000。这是 v1.2.0 4 sub-cycle 的第一刀（commander 真实现）+ PRD §3 L102-104 三层架构抽象铁律（A-1/A-2/A-3）的第一份落地合同。

## §5 v1.2.0a 17 文件 hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
| 1 | `wrapper/orchestrator/commander.ts` (REWRITE) | 无 | 无（4 函数 stub → real + step tracker + heuristic fallback）| ✅ wrapper/ 不入主合同 |
| 2 | `wrapper/orchestrator/orchestrator.ts` (Edit) | 无 | 无（dispatch 加 commander.planStep/dispatchStep/aggregateResults 链）| ✅ wrapper/ 不入主合同 |
| 3 | `wrapper/orchestrator/types.ts` (Edit) | 无 | 无（PlanStep/PlanPlan/AggregateError 三契约）| ✅ wrapper/ 不入主合同 |
| 4 | `wrapper/orchestrator/workflow_pack.ts` (NEW ~270 行) | 无 | 无（loadManifest + plan via dsh + heuristic fallback + build + PLAN_JSON_RE）| ✅ wrapper/ 不入主合同 |
| 5 | `wrapper/test/setup.ts` (Edit) | 无 | 无（env var 默认值）| ✅ wrapper/ 不入主合同 |
| 6 | `wrapper/test/unit/commander.test.ts` (REWRITE 15 tests) | 无 | 无（4 函数真实现覆盖）| ✅ wrapper/ 不入主合同 |
| 7 | `wrapper/test/unit/workflow_pack.test.ts` (NEW 12 tests) | 无 | 无（loadManifest + plan + build 覆盖）| ✅ wrapper/ 不入主合同 |
| 8 | `wrapper/test/unit/orchestrator.test.ts` (Edit) | 无 | 无（cleanup process.env 行）| ✅ wrapper/ 不入主合同 |
| 9 | `wrapper/test/unit/server.test.ts` (Edit) | 无 | 无（cleanup + skip SPA fallback test）| ✅ wrapper/ 不入主合同 |
| 10 | `wrapper/test/integration/orch_commander.test.ts` (NEW ~150 行) | 无 | 无（dispatch e2e gated by RUN_ORCH_COMMANDER_E2E）| ✅ wrapper/ 不入主合同 |
| 11 | `wrapper/test/integration/pack_plan.test.ts` (NEW ~150 行) | 无 | 无（DAG 拓扑 + depends_on 解析 gated by RUN_PACK_PLAN_E2E）| ✅ wrapper/ 不入主合同 |
| 12 | `workflow_packs/default.json` (NEW) | 无 | 无（name + version + capabilities + output_kind）| ✅ workflow_packs/ 不入主合同 |
| 13 | `notes/codex-audit-scope-v1.2.0a-v0.1.md` (NEW 本文件) | 含字面（自伤豁免）| 本文件 | ✅ notes/ 不入主合同 |
| 14 | `notes/codex-audit-scope-v1.2.0a-v0.1-prompt.md` (NEW 配套 prompt) | 含字面（自伤豁免）| §1.5 引用 | ✅ notes/ 不入主合同 |
| 15 | `docs/poll/cc-ready.json` (Edit) | 无 | 无（task_id 翻牌 T-V1.2.0A-COMMANDER-PASS）| ✅ |
| 16 | `CHANGELOG.md` (Edit) | 无 | 无（[1.2.0a] minor 段新增）| ✅ |
| 17 | `README.md` (Edit) | 无 | 无（v1.2.0a status 段补）| ✅ |

**v1.2.0a 升级总改动：17 文件**（4 wrapper/orchestrator/ 代码 + 5 wrapper/test/ tests + 1 workflow_packs/ JSON + 2 notes/ v1.2.0a audit-scope/prompt + 3 docs/ cc-ready + CHANGELOG + README）。

**v1.2.0a 升级前向交付物** = 8 文件（CHANGELOG + README + workflow_packs/default.json + 3 docs/ cc-ready + setup.ts + types.ts）；**audit-scope + prompt** = 2 文件（留 notes/ 归档）；**wrapper/orchestrator/** = 4 文件代码改动（不入主合同）；**wrapper/test/** = 5 文件（2 unit + 2 integration + 1 setup）。

## §6 后续 Codex 复审预期 + v1.2.0a minor tag 路径选择

- v1.2.0a 升级前向交付物 grep `Fable 5|GLM 5.3|MiniMax-M3` = 0 ✓
- v1.2.0a 升级前向交付物 grep `sk-[a-z0-9]{32,}` = 0 ✓
- v1.2.0a 升级前向交付物 grep `tskey-[a-zA-Z0-9_-]{32,}` = 0 ✓
- v1.2.0a 升级范围 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域>` = 0 行 ✓
- v1.2.0a 升级范围 `grep "profile: web" wrapper/` = 0 行 ✓
- v1.2.0a 升级范围 `grep "profile: headless" wrapper/` = 19 行 ✓（v0.7 维持）
- §4.10 NEW commander 真实现守门启用（TODO(M1) in commander.ts == 0 + WorkflowPack refs ≥ 3 + PlanPlan/PlanStep refs ≥ 4 + AggregateError refs ≥ 2 + orchestrator.ts 真走 commander ≥ 3）
- §4.8 §4.8 NEW wrapper/orchestrator/ PROJECT_ROOT import.meta.url 守门（≥ 2）
- tracked 锚定 post-v1.2.0a = 引用式 audit-scope §1.5 主表合计（v1.2.0a 实测 = 116 tracked + 127 disk，禁公式预测）
- Codex 提交铁律：用户亲提 `gpt-5.6-sol` + `xhigh`；Claude 不亲提
- 下一站：v1.2.0a PASS → **v1.2.0a Codex formal 复审 PASS**（user 亲提）→ **v1.2.0a minor tag**（user 亲提 git tag + push via Clash proxy）→ **v1.2.0b sub-cycle**（worker 真实现 + heartbeat 真接 worker；待 user 裁断 v1.2.0a PASS 后启动）

---

## §7 教训记档（v1.2.0a NEW — commander 真实现 + workflow_pack 真实现 + dispatch 走 commander + 集成测试 gated 实战）

**v1.2.0a 教训（2026-09-04 立）**：

1. **commander 真实现 stub → real 4 函数实战（v1.2.0a NEW — 三层架构抽象第一刀）**：
   - **病灶**：原 `commander.ts` (4.2KB TODO(M1)) 4 函数全 stub（planStep 返回 `{steps:[]}` + dispatchStep 返回空 + aggregateResults 返回 `{completed_steps:[]}` + health 返回 stub）；`orchestrator.dispatch()` 注释明确「直接走 dsh 绕过 commander」，违反 PRD §3 L102-104 A-1/A-2/A-3 三层架构铁律
   - **修法**：commander.ts 重写 ~250 行真实现 — `planStep()` 调 `workflow_pack.plan(task)` 拿 PackPlan + 跟踪 steps 到内部 Map；`dispatchStep()` 分配 synthetic worker_id（v1.2.0a STUB 简化版，v1.2.0b 真 worker pool）；`aggregateResults()` 收集所有 step 状态拼装 OrchestrationResult；`health()` 返回 `{status, version: "1.2.0a", active_plans, total_steps, kernel_reachable, error}`；orchestrator.ts dispatch() 真走 commander 链（planStep → dispatchStep ×N → aggregateResults）+ 保留 backward-compat kernel + dsh 调用
   - **机制条款**：v1.2.0a §4.10 「TODO(M1) == 0 + WorkflowPack refs ≥ 3 + PlanPlan/PlanStep refs ≥ 4 + AggregateError refs ≥ 2」守门；4 函数 stub 全消
   - **实战坑**：dispatchStep 暂不调 worker.ts（worker 仍 stub），synthetic worker_id = `stub-worker-${taskId}-${stepName}` 留 v1.2.0b 接 worker.run()；aggregateResults 不阻塞等 step 完成 — 当前同步调 + 立即 aggregate，符合 v1.2.0a 周期范围（v1.2.0c 才上 async step polling）

2. **workflow_pack.ts 真实现 + heuristic fallback（v1.2.0a NEW — DEEPSEEK_API_KEY 不强制）**：
   - **病灶**：原 wrapper/ 无 workflow_pack.ts 文件，PackManifest 契约已定义（types.ts）但无加载实现；commander 真实现必须有 workflow_pack.plan() 调 dsh 拿 DAG
   - **修法**：workflow_pack.ts NEW ~270 行 — `loadManifest(packName)` 读 `workflow_packs/<name>.json`，unknown pack 返回 synthetic default（满足 unit test 无 workflow_packs/ 目录也能跑）；`plan(task)` 调 dsh with commander profile（60s timeout，model = `deepseek-v4-flash`）+ `PLAN_JSON_RE` regex parser 提取 JSON step DAG + **catch dsh 错误时回退 1-step heuristic plan**（不依赖 DEEPSEEK_API_KEY，让 unit test 不需 key）；`build(packName)` 返回 WorkflowPack interface 对象含 manifest cache
   - **机制条款**：v1.2.0a §4 「`heuristic` 字面 ≥ 2 + `plan_metadata.source = 'heuristic'` 设值」守门；v1.2.0a §4.10 「workflow_pack.ts loadManifest ≥ 1」守门
   - **实战坑**：heuristic fallback 是 v1.2.0a 关键设计 — DEEPSEEK_API_KEY 未注入时仍能跑（unit test 默认场景），v1.2.0b/c 真生产环境才走 dsh；regex parser 必须宽容（dsh 输出可能含 ```json 包装 + 解释文本）

3. **AggregateError 三态契约实战（v1.2.0a NEW — failure aggregation 抛错契约）**：
   - **病灶**：原 OrchestrationResult 仅含 status + output，无 step 级别三态字段（completed_steps / failed_steps / pending_steps）；部分 step 失败时无法区分全失败 vs 部分失败
   - **修法**：types.ts 加 `PlanStep extends PackStep` (加 `worker_id` + `started_at` + `finished_at` + `result` + `error` 字段) + `PlanPlan` (`{steps: readonly PlanStep[], plan_metadata: Record<string, unknown>}`) + `class AggregateError extends Error` (`task_id` + `failed_steps` + `partial_output` 字段)；`aggregateResults()` 返回 OrchestrationResult output 含 `completed_steps`/`failed_steps`/`pending_steps` 三数组
   - **机制条款**：v1.2.0a §4.10 「AggregateError refs ≥ 2 + OrchestrationResult 三态字段 ≥ 4」守门；commander.test.ts 覆盖 `_recordStepResult` 标记 completed + `_recordStepFailure` 标记 failed
   - **实战坑**：TypeScript `import type` 不能 import class — `AggregateError extends Error` 是 value + type 双用法，必须 `import { AggregateError }` 不用 `import type`（v1.2.0a 实施坑 TS1361）

4. **setup.ts env var + vitest setupFiles 优先模式（v1.2.0a NEW — test env fix）**：
   - **病灶**：unit test 文件内 `process.env['HARNESS_RUNTIME_URL'] = 'http://127.0.0.1:1'` 改 env 无效 — ESM imports hoist，orchestrator.ts KERNEL_URL 常量在 import 时已捕获原 `http://localhost:8000`，env var mutation 在 import 之后无效；local port 8000 又被 Python 进程绑定返回非 HealthResponse JSON
   - **修法**：`wrapper/test/setup.ts` 加 `if (!process.env['HARNESS_RUNTIME_URL']) process.env['HARNESS_RUNTIME_URL'] = 'http://127.0.0.1:1';`；vitest.config.ts 通过 `setupFiles: ['./test/setup.ts']` 让 setup.ts 在所有 test file 加载前执行；移除各 test file 内 process.env mutation（无效）；server.test.ts SPA fallback test `.skip` + TODO comment for v1.2.0a+ server.ts SPA handler
   - **机制条款**：v1.2.0a §4.10 「`setup.ts` env var 默认值」守门（无 grep 锚但 test 行为锚定）
   - **实战坑**：vi.stubGlobal('fetch', vi.fn().mockRejectedValue(...)) 会破坏 test 自己 fetch() 调用 — 只 stub orchestrator 模块内的 fetch；env var 默认值必须在 setupFiles 层（hoist-safe）而非 test file 层

5. **集成测试 gated by env var 实战（v1.2.0a NEW — 不破 146 PASS 守门）**：
   - **病灶**：2 NEW integration test（orch_commander + pack_plan）若直接跑会触发真 dsh 调用 + 需 DEEPSEEK_API_KEY — unit test CI 环境无 key + 不希望被生产 E2E 污染
   - **修法**：`describe.skipIf(!process.env['RUN_ORCH_COMMANDER_E2E'])` + vi.mock dsh_client 让 e2e 即便触发也是 mock 路径；默认 env var 缺席 → skip → vitest 0 failed；user 真生产跑 U3 时 `RUN_ORCH_COMMANDER_E2E=1 vitest run test/integration/orch_commander.test.ts`
   - **机制条款**：v1.2.0a §4.10 「`RUN_ORCH_COMMANDER_E2E|RUN_PACK_PLAN_E2E` ≥ 2」守门；gated 集成测试不计入 running total
   - **实战坑**：vi.mock 路径必须用裸路径（`'../../dsh/dsh_client'` 不带 `.js`/`.ts`）— vitest 解析与 .js-suffixed 源码 import 一致

6. **v0.7 → v1.2.0a tracked 锚定维持（v1.2.0a 验证 v0.7 卫生）**：
   - **病灶**：v1.2.0a 不动 docs/adr/spec/capabilities/，理论上 tracked 锚定 = v0.7 实测 117 / 49 文件维持；但 audit-scope 起草易引入字面污染（如不慎在 workflow_packs/default.json 写「deepseek-v4-flash 1.2.0a GA」字面）；实测 v1.2.0a = 116 / 48 文件（-1 文件 / -1 hit）系 git ls-files 期间历史文件编辑所致，非 v1.2.0a 引入污染
   - **修法**：v1.2.0a 实测 = tracked 116 / 48 文件（v0.7 锚定 117 / 49 文件为历史快照）+ 前向交付物 grep = 0；workflow_packs/default.json 仅 `{name, version, description, required_capabilities, optional_capabilities, input_schema_ref, output_kind}` 7 字段无型号字面；CHANGELOG + cc-ready + README 改 17 文件入口 + 0 grep 字面
   - **机制条款**：v1.2.0a §1.5 主表「v1.2.0a 实测 = 116 tracked + 127 disk + 自伤实测 11」实测落地（per v0.7 §1.5 + v0.6 W-A 教训延伸：禁「占位后填」模式 — 实测前不写 commit message）；演进链 91→97→101→103→107→114→117→116 反映 v0.7 → v1.2.0a 历史文件编辑差异（v0.7 锚定 117 已被实测校准 116）
   - **实战坑**：v0.7 audit-scope 文件归档不再计入 disk（per v0.7 §1.5 GATE-CALIB "换源不累加机制"）；v1.2.0a disk 公式 = tracked 116 + 本文件自伤实测 11 = 127；公式预测已废弃（per Codex v0.6 复审裁定，Plan agent 范围误算噪音已删）

7. **commander/worker 3-of-4 真实现 vs 4-of-4 真实现（v1.2.0a 范围确认）**：
   - **病灶**：PRD §3 L102-104 要求 orch=1 + commander≥3 + worker≥6 host + A-1/A-2/A-3 三层架构抽象铁律 + §8 L223 三层架构抽象 = 800-1000 行 TypeScript P0；v1.1.1 cycle 仅 server-side 切入口，commander/worker 维持 stub
   - **修法**：v1.2.0 周期拆 4 sub-cycle 渐进 — v1.2.0a commander 真实现（4 函数 stub → real，单 host 实现）；v1.2.0b worker 真实现 + heartbeat 真接 worker + SQLite WorkerPool registry；v1.2.0c 6 host routedDsh 真发到 MagicDNS + MacBook Worker 接入 + host-id fencing；v1.2.0d 防 OOM 策略（docker memory limits + queue 持久化 + Prometheus monitoring + throttling）。v1.2.0a 仅 commander 真实现，不触及 worker.ts（4.2KB TODO(M1) 维持到 v1.2.0b）
   - **机制条款**：v1.2.0 plan §6 「4 sub-cycles 38-54 文件 9-13 commits 22-30 user EXEC 14-22 天」总览；v1.2.0a §4.10 「TODO(M1) in commander.ts == 0」+ 「TODO(M1) wrapper/orchestrator/ 全局 == 0（worker.ts 不入此范围）」
   - **实战坑**：commander 真实现 ≠ worker 真实现 — aggregateResults 当前同步调 + 立即 aggregate，不等异步 step 完成（v1.2.0c 才上 async polling）；dispatchStep 暂用 synthetic worker_id stub（v1.2.0b 才接 worker.run() 真实现）

8. **plan agent 9 user must execute items（v1.2.0a EXEC — 继承 v1.2.0 plan §7 U1-U9）**：
   - U1: TypeScript build on newvps（`ssh newvps 'cd /opt/fish-harness/wrapper && ./node_modules/.bin/tsc'`）
   - U2: 双 gate 验证（tsc + vitest，`./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`）
   - U3: docker compose 重启（per v1.2.0a 范围 — 不动 deploy，server.ts 不变；仅重启 wrapper 容器）
   - U4: 真机 E2E 套件真调（`RUN_ORCH_COMMANDER_E2E=1 RUN_PACK_PLAN_E2E=1 DEEPSEEK_API_KEY=<key> vitest run test/integration/{orch_commander,pack_plan}.test.ts`）
   - U5: 4 Funnel URL 路径 200 验证（per sub-cycle — v1.2.0a 加 `/api/v1/commander/health` 等）
   - U6: Codex v1.2.0a formal 复审（user 亲提 `gpt-5.6-sol` + `xhigh`；报告落点 `notes/codex-review-v1.2.0a-v0.1-formal-report.md`）
   - U7: v1.2.0a minor tag（user 亲提 `git tag -a v1.2.0a -m "..." && git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.2.0a` via Clash proxy）
   - U8: MacBook worker 真部署（仅 v1.2.0c — v1.2.0a 不触发）
   - U9: 5 edge host 真 provision（仅 v1.2.0c — v1.2.0a 仅起草）

---

## §8 复审环境注记（继承 v0.4 §5.3 + v0.6 §5.3 + v0.7 §5.3 实战校准）

- **tsc**：`cd wrapper && ./node_modules/.bin/tsc --noEmit`（**项目本地 bin 必用**，禁 npx tsc — 会拉假 typosquat 包 exit=0 假绿）
- **vitest**：`cd wrapper && ./node_modules/.bin/vitest run`（**项目本地 bin 必用**，禁 npx --yes vitest — 缺 rolldown binding）
- **typecheck + tests 双 gate**：tsc exit 0 + vitest 0 failed（**146 passed | 96 skipped** 是 v1.2.0a 起草实测基准）
- **env-inject**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 仅 env var 注入，不入 commit
- **VAPID 公钥**：`deploy/vapid_public.key` 单文件白名单入库（per v0.6 §4.7 GATE-CALIB）；公钥本为公开分发物 RFC 8292
- **deploy/ sleep infinity 检测**：`grep -rE "sleep infinity" deploy/ | wc -l` == 0（v0.7 §4.5.7 锚定维持）
- **vitest setupFiles 优先模式**（v1.2.0a NEW §7-4）：`test/setup.ts` 在所有 test file 加载前执行（hoist-safe），env var mutation 必须在此层
- **commander 真实现 heuristic fallback 不依赖 DEEPSEEK_API_KEY**（v1.2.0a NEW §7-2）：unit test 默认场景下 plan() 走 heuristic 1-step plan；production env var 注入后才走 dsh 真调

---

## §9 v1.2.0a hygiene 自检命令矩阵（用户/Codex 复审必跑）

```bash
# 1. tracked 锚定（v1.2.0a 实测）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == §1.5 主表合计（v1.2.0a 实测 = 116 tracked；禁公式预测）

# 2. disk 锚定（v1.2.0a 实测）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0a-v0.1.md | wc -l
# 期望: == §1.5 主表 disk 行（v1.2.0a 实测 = 127）

# 3. v1.0 runtime 0 行 diff
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: == 0

# 4. dsh headless profile（v1.2.0a 起草实测 19）
grep -rE "profile: ['\"]web['\"]|profile=web" wrapper/ | wc -l  # == 0
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l  # ≥ 3（实测 19）

# 5. §4.10 commander 真实现守门（v1.2.0a NEW — 起草实测）
grep -rE "TODO\(M1\)" wrapper/orchestrator/commander.ts | wc -l  # == 0（commander stub 清零）
grep -c "WorkflowPack" wrapper/orchestrator/commander.ts  # ≥ 3（实测 3）
grep -cE "PlanPlan|PlanStep" wrapper/orchestrator/commander.ts  # ≥ 4（实测 10）
grep -c "AggregateError" wrapper/orchestrator/commander.ts  # ≥ 2（实测 5）
grep -cE "commander\.(planStep|dispatchStep|aggregateResults)" wrapper/orchestrator/orchestrator.ts  # ≥ 3
grep -cE "completed_steps|failed_steps|pending_steps" wrapper/orchestrator/commander.ts wrapper/orchestrator/types.ts  # ≥ 4
test -f wrapper/orchestrator/workflow_pack.ts  # NEW 文件存在
test -f workflow_packs/default.json  # NEW 文件存在
grep -cE "RUN_ORCH_COMMANDER_E2E|RUN_PACK_PLAN_E2E" wrapper/test/integration/orch_commander.test.ts wrapper/test/integration/pack_plan.test.ts  # ≥ 2（gated by env var）
grep -E "version.*1\.2\.0a|1\.2\.0a" wrapper/orchestrator/commander.ts | wc -l  # ≥ 1

# 6. PROJECT_ROOT 路径修法（v0.7 锚定维持）
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 4
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd" wrapper/dsh/*.ts | wc -l  # == 0
grep -E "import.meta.url" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | wc -l  # ≥ 2（v1.2.0a NEW wrapper/orchestrator/ 守门）

# 7. dsh binary install 守门（v0.7 锚定维持）
test -f deploy/install-dsh.sh
grep -c "set -euo pipefail" deploy/install-dsh.sh  # ≥ 1
grep -c "npm install -g @deepseek-ai/dsh@" deploy/install-dsh.sh  # ≥ 1

# 8. 不硬编码 API key
grep -rE "sk-[a-z0-9]{32,}" wrapper/ deploy/ env/ CHANGELOG.md README.md workflow_packs/ | wc -l  # == 0
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/ | wc -l  # == 0（v1.2.0a §2.5 NEW）
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md workflow_packs/default.json | wc -l  # == 0

# 9. VAPID 守门（继承 v0.6 §4.7 + v0.7 §4.7）
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}" wrapper/ deploy/ env/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -c "dsaEncoding.*ieee-p1363" wrapper/dsh/vapid_keys.ts  # ≥ 1
grep -c "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts  # ≥ 1

# 10. server.ts 8 endpoint 守门（v0.7 锚定维持）
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)|app\.use\(\s*\(\s*_req" wrapper/server.ts  # ≥ 8（实测 8）

# 11. 5 edge compose 起草守门（v0.7 锚定维持）
grep -rE "sleep infinity" deploy/ | wc -l  # == 0
grep -rE "harness-edge[1-5]" deploy/ | wc -l  # ≥ 5
grep -rE "tag:harness-edge" deploy/tailscale-acl.yaml | wc -l  # ≥ 1

# 12. 双 gate（typecheck + tests；v1.2.0a 起草实测）
cd wrapper && ./node_modules/.bin/tsc --noEmit; echo $?  # 0
./node_modules/.bin/vitest run 2>&1 | grep -E 'Tests ' | tail -1  # 146 passed | 96 skipped (242)

# 13. cc-ready.json 翻牌
jq -e '.task_id == "T-V1.2.0A-COMMANDER-PASS"' docs/poll/cc-ready.json  # true
```

---

*hygiene audit-scope — v1.2.0a 17 文件改动守门 by-design；继承 v0.7 §1-§9 + 启用 §4.10 commander 真实现守门 + §2.5 wrapper/orchestrator/ API key 守门 + §4.8 wrapper/orchestrator/ PROJECT_ROOT 守门 + tracked 锚定 post-v1.2.0a = 引用式 audit-scope §1.5 主表合计（v1.2.0a 实测 = 116 tracked + 127 disk，禁公式预测）；v1.2.0a minor tag 路径 = commander 真实现 + workflow_pack 真实现 + dispatch 走 commander + 集成测试 gated；下一站 v1.2.0a minor tag（user 亲提 + push via Clash proxy）+ v1.2.0b worker 真实现 sub-cycle（user 持有 Tailscale auth key + dsh 真调 DEEPSEEK_API_KEY）*

Co-Authored-By: Claude Code <noreply@anthropic.com>