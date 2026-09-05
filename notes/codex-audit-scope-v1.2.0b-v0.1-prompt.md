# Codex Audit-scope v0.1 — v1.2.0b Codex 复审 prompt

> **Date**: 2026-09-04
> **配套**: [codex-audit-scope-v1.2.0b-v0.1.md](./codex-audit-scope-v1.2.0b-v0.1.md)
> **Codex 提交铁律**: Claude 不亲提 Codex CLI; user 亲提 `gpt-5.6-sol` + `reasoning_effort=xhigh`
> **报告落点**: `notes/codex-review-v1.2.0b-v0.1-formal-report.md` (NEW; v1.2.0b 起草继承引用式纪律)
> **预期终态**: 0C/0M/0m + v1.2.0b §4.11 worker 真实现守门全绿 + §4.7.7 server.ts handleWorkerHeartbeat 真接守门全绿 + §4.10.5/§4.10.6 commander.ts TODO(v1.2.0b) + synthetic stub 替换守门全绿 + §3.7 Dockerfile 例外声明合规 + §2.7 better-sqlite3 path 默认值守门全绿 + tracked 锚定 post-v1.2.0b 引用式 + 集成测试 gated 守门全绿

---

## §1 复审范围

v1.2.0b 14 文件改动（per `codex-audit-scope-v1.2.0b-v0.1.md` §1.5 #1-#20）：

- 6 wrapper/orchestrator/ 文件（worker.ts REWRITE + worker_pool.ts NEW + execution_driver.ts NEW + commander.ts Edit + server.ts Edit + orchestrator.ts Edit）
- 1 wrapper/package.json（加 better-sqlite3@^11 dep）
- 1 Dockerfile（加 apk add python3 make g++）
- 1 spec/capabilities/worker.json（model_id 校准 + evidence_uri 新增）
- 6 wrapper/test/ 文件（setup.ts 不变 + worker.test.ts REWRITE + worker_pool.test.ts NEW + execution_driver.test.ts NEW + integration worker_pool.test.ts NEW gated + integration server_heartbeat.test.ts NEW gated + 2 integration M4 fix）
- 2 notes/ v1.2.0b audit-scope/prompt NEW（本 prompt 配套 audit-scope）
- 3 docs/ 文件（cc-ready.json + CHANGELOG.md + README.md Edit）

---

## §2 Codex 必跑验证命令矩阵（14 条 + 11 条自检 = 25 条总命令）

### §2.1 §1 不锁型号守门（NORTH-STAR A-4 等价类 + v1.2.0a §1 锚定 + v1.2.0b §1 wrapper/orchestrator/ 额外守门）

```bash
# tracked 锚定（v1.2.0b 引用式 v1.2.0a §1.5 主表合计）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'

# disk 锚定（v1.2.0b 引用式 v1.2.0a §1.5 主表 disk 行）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0b-v0.1.md | wc -l

# v1.2.0b 前向交付物
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md spec/capabilities/worker.json | wc -l

# v1.2.0b NEW wrapper/orchestrator/ 额外守门（继承 v1.2.0a §1）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l
```

期望：tracked == §1.5 主表合计（v1.2.0a 收口 289e7eb 实测 116 = 引用式不复制数字）+ disk == §1.5 主表 disk 行（v1.2.0b 实测 129 = 116 tracked + 13 本周期自伤；**m2 GATE-CALIB：引用式 ≠ 免实测换算** — 起草时误引 v1.2.0a 127（116+11），自伤源随周期切换须重跑）+ 前向交付物 == 0 + wrapper/orchestrator/ == 0。

### §2.2 §2 不硬编码 API key 守门（含 v1.2.0b §2.7 NEW worker_pool path 默认值守门）

```bash
grep -rE "sk-[a-z0-9]{32,}" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json | wc -l
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}" wrapper/ deploy/ env/ | wc -l

# v1.2.0b NEW wrapper/orchestrator/ 额外守门（继承 v1.2.0a §2.5）
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/ | wc -l

# v1.2.0b §2.7 NEW better-sqlite3 path 默认值守门
grep -rE "WORKER_POOL_DB\s*=\s*['\"]/data/" wrapper/orchestrator/worker_pool.ts | wc -l
```

期望：前 4 项 == 0 + better-sqlite3 path == 1（默认路径占位 + env override）。

### §2.3 §3 v1.0 runtime 0 行 diff 守门（含 v1.2.0b §3.7 NEW Dockerfile 例外声明）

```bash
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' docker-compose.yml pyproject.toml | wc -l
git diff v1.0.0..HEAD -- Dockerfile | wc -l
```

期望：第一条 == 0（v1.0 runtime 区域 0 漂移）+ Dockerfile ≥ 1（§3.7 NEW 例外声明 — `RUN apk add --no-cache python3 make g++` per F2）。

### §2.4 §4 dsh headless profile 守门（含 v1.2.0b §4 execution_driver 真实现守门）

```bash
grep -rE "profile: ['\"]web['\"]|profile=web" wrapper/ | wc -l
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l

# v1.2.0b NEW ExecutionDriver dsh 调用守门
grep -cE "child_process|callDshHeadless" wrapper/orchestrator/execution_driver.ts wrapper/orchestrator/worker.ts

# v1.2.0b NEW HTTP fallback 守门（per D2）
grep -cE "fetch.*api/v1" wrapper/orchestrator/execution_driver.ts

# v1.2.0a §4 heuristic fallback 维持
grep -cE "plan_metadata.*source|heuristic" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | awk -F: '{s+=$NF} END{print s}'

# v1.2.0a §4 commander 真实现 dsh 调用守门维持
grep -cE "callDshHeadless|dshInvoke" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts | awk -F: '{s+=$NF} END{print s}'
```

期望：web == 0 + headless ≥ 3（实测 50）+ ExecutionDriver dsh ≥ 3 + HTTP fallback ≥ 1 + heuristic ≥ 4 + commander dsh ≥ 2（m3 GATE-CALIB：原命令尾部多套 `| wc -l` 使 awk 输出恒 1 — 管道套管道恒假门）。

### §2.5 §4.5 多 host 守门（v0.7 + v1.2.0a 锚定维持，v1.2.0b 不动 deploy/）

```bash
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md | grep -v "127.0.0.1" | wc -l
grep -rE "ts\.net" deploy/ | wc -l
grep -rE "https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/" docs/ deploy/ | wc -l

# v0.7 §4.5.7 5 edge compose 起草守门（v1.2.0a 锚定维持）
grep -rE "sleep infinity" deploy/ | wc -l  # == 0
grep -rE "harness-edge[1-5]" deploy/ | wc -l  # ≥ 5
grep -rE "tag:harness-edge" deploy/tailscale-acl.yaml | wc -l  # ≥ 1
```

期望：IP 锁 == 0 + ts.net ≥ 6 + Funnel URL ≥ 6 + sleep infinity == 0 + harness-edge ≥ 5 + tag:harness-edge ≥ 1。

### §2.6 §4.6 STT 守门（v0.7 + v1.2.0a 锚定维持）

```bash
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ env/ | wc -l
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l
```

期望：全部 == 0。

### §2.7 §4.7 Web Push 守门 + §4.7.6 server.ts 8 endpoint 守门 + §4.7.7 NEW handleWorkerHeartbeat 真接守门（v1.2.0b）

```bash
grep -rE "hmacSha256\s*\(\s*signingInput" wrapper/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -rE "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1
grep -rE "dsaEncoding\s*:\s*['\"]ieee-p1363['\"]" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1

# server.ts 8 endpoint 守门（v0.7 + v1.2.0a 锚定维持）
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)|app\.use\(\s*\(\s*_req" wrapper/server.ts; grep -cE "registerApiRoute\(['\"]" wrapper/server.ts  # 合计 ≥ 8

# v1.2.0b §4.7.7 NEW server.ts handleWorkerHeartbeat 真接 worker.heartbeat() 守门（per F6）
grep -cE "worker\.heartbeat|worker_pool\.heartbeat" wrapper/server.ts
```

期望：前 4 项命中 + 8 endpoint 合计 ≥ 8（v1.2.0a formal GATE-CALIB per D-9 Option B：SPA fallback 移交 pwa_server.ts L111 `*path`，server.ts = 7 API = 5 经 registerApiRoute 双注册（直连 + Funnel stripped）+ /health + /api/stt；原 ≥8 pattern 只认 app.get 直书实测 2 误报）+ handleWorkerHeartbeat ≥ 2。

### §2.8 §4.8 PROJECT_ROOT 路径修法守门 + v1.2.0b §4.8.5 NEW wrapper/orchestrator/ 5 文件守门

```bash
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 4（v0.7 锚定维持）
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/*.ts | wc -l  # == 0
grep -E "projectRoot\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l  # == 0

# v1.2.0b §4.8.5 NEW wrapper/orchestrator/ 5 文件守门（workflow_pack + commander + worker + worker_pool + execution_driver）
grep -E "import.meta.url" wrapper/orchestrator/workflow_pack.ts wrapper/orchestrator/commander.ts wrapper/orchestrator/worker.ts wrapper/orchestrator/worker_pool.ts wrapper/orchestrator/execution_driver.ts | wc -l
```

期望：import.meta.url in 4 dsh files ≥ 4 + 残留 == 0 + wrapper/orchestrator/ ≥ 2（v1.2.0a 校准：workflow_pack.ts 已含 import.meta.url per v1.2.0a；worker.ts 不需项目根访问；worker_pool.ts SQLite path 绝对路径；execution_driver.ts dsh_client.ts import 路径相对解析）。

### §2.9 §4.9 dsh binary install 守门（v0.7 + v1.2.0a 锚定维持）

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

### §2.10 §4.10 v1.2.0a commander 真实现守门维持 + §4.10.5/§4.10.6 NEW v1.2.0b 守门

```bash
# v1.2.0a §4.10 14 项 commander 真实现守门（引用式 v1.2.0a §2.10 + §9 #5 校准值）
grep -rE "TODO\(M1\)" wrapper/orchestrator/commander.ts | wc -l  # == 0（v1.2.0a 实测）
grep -c "WorkflowPack" wrapper/orchestrator/commander.ts  # ≥ 3
grep -cE "PlanPlan|PlanStep" wrapper/orchestrator/commander.ts  # ≥ 4
grep -c "AggregateError" wrapper/orchestrator/commander.ts  # ≥ 2
grep -cE "commander\.(planStep|dispatchStep|aggregateResults)" wrapper/orchestrator/orchestrator.ts  # ≥ 3
grep -cE "completed_steps|failed_steps|pending_steps" wrapper/orchestrator/commander.ts wrapper/orchestrator/types.ts  # ≥ 4
test -f wrapper/orchestrator/workflow_pack.ts  # NEW
test -f workflow_packs/default.json  # NEW
grep -c "loadManifest" wrapper/orchestrator/workflow_pack.ts  # ≥ 1
grep -c "heuristic" wrapper/orchestrator/workflow_pack.ts  # ≥ 2
grep -E "version.*1\.2\.0a|1\.2\.0a" wrapper/orchestrator/commander.ts | wc -l  # ≥ 1
grep -cE "plan_steps|plan_source" wrapper/orchestrator/orchestrator.ts  # ≥ 2
grep -cE "RUN_ORCH_COMMANDER_E2E|RUN_PACK_PLAN_E2E" wrapper/test/integration/orch_commander.test.ts wrapper/test/integration/pack_plan.test.ts  # ≥ 2
grep -c "describe\|it(" wrapper/test/unit/commander.test.ts wrapper/test/unit/workflow_pack.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 25（m4 GATE-CALIB：v1.2.0b 抄写丢 `\|` 反斜杠 — BRE 下 `|` 为字面恒 0 假门；实测 39）

# v1.2.0b §4.10.5 NEW commander.ts:113-114 TODO(v1.2.0b) 替换守门（per F5）
grep -rE "TODO\(v1\.2\.0b\)" wrapper/orchestrator/commander.ts | wc -l

# v1.2.0b §4.10.6 NEW commander.ts dispatchStep 不再用 synthetic stub-worker 守门（per F5）
grep -rE "stub-worker-\\\$\\{taskId\\}" wrapper/orchestrator/commander.ts | wc -l
```

期望：v1.2.0a §4.10 14 项全绿 + §4.10.5 TODO(v1.2.0b) == 0 + §4.10.6 synthetic stub == 0。

### §2.11 §4.11 v1.2.0b worker 真实现守门 NEW（14 项 grep + 2 file exists + 2 dep/file）

```bash
# TODO(M1) stub 清零
grep -rE "TODO\(M1\)" wrapper/orchestrator/worker.ts | wc -l  # == 0
grep -rE "TODO\(M1\)" wrapper/orchestrator/ | wc -l  # == 0（v1.2.0a 实测 16 系 worker.ts 16 处；v1.2.0b 替换后 == 0）

# ExecutionDriver + worker_pool integration
grep -cE "ExecutionDriver|worker_pool" wrapper/orchestrator/worker.ts  # ≥ 6

# worker_pool SQLite 持久化
grep -c "better-sqlite3\|Database" wrapper/orchestrator/worker_pool.ts  # ≥ 4

# WAL mode + busy_timeout
grep -c "WAL\|busy_timeout\|journal_mode" wrapper/orchestrator/worker_pool.ts  # ≥ 3

# ExecutionDriver subprocess spawn + HTTP fallback
grep -c "child_process\|callDshHeadless" wrapper/orchestrator/execution_driver.ts  # ≥ 3
grep -cE "fetch.*api/v1" wrapper/orchestrator/execution_driver.ts  # ≥ 1

# server.ts handleWorkerHeartbeat 真接 worker.heartbeat()
grep -cE "worker\.heartbeat|worker_pool\.heartbeat" wrapper/server.ts  # ≥ 2

# hygiene 净守门
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/orchestrator/worker.ts wrapper/orchestrator/worker_pool.ts wrapper/orchestrator/execution_driver.ts | wc -l  # == 0
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l  # == 0

# worker.health() version="1.2.0b"
grep -E "version.*1\.2\.0b|1\.2\.0b" wrapper/orchestrator/worker.ts | wc -l  # ≥ 1

# spec/capabilities/worker.json model_id 校准
grep -c "deepseek-v4-flash" spec/capabilities/worker.json  # ≥ 1

# 单测增量
grep -c "describe\|it(" wrapper/test/unit/worker.test.ts wrapper/test/unit/worker_pool.test.ts wrapper/test/unit/execution_driver.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 40（m4 同型 GATE-CALIB：BRE `\|` 恢复后实测 89）

# 集成测试 gated
grep -cE "RUN_WORKER_POOL_E2E|RUN_SERVER_HEARTBEAT_E2E" wrapper/test/integration/worker_pool.test.ts wrapper/test/integration/server_heartbeat.test.ts  # ≥ 2

# worker_pool.ts + execution_driver.ts 文件存在
test -f wrapper/orchestrator/worker_pool.ts  # NEW
test -f wrapper/orchestrator/execution_driver.ts  # NEW

# better-sqlite3 dep + Dockerfile build tools
grep -c '"better-sqlite3"' wrapper/package.json  # ≥ 1
grep -c "apk add.*python3.*make.*g++" Dockerfile  # ≥ 1
```

期望：14 项 grep 全绿 + 2 file exists + 2 dep/file 全命中 + 单测增量 ≥ 40 + 集成测试 gated ≥ 2。

### §2.12 cc-ready.json 翻牌

```bash
jq -e '.task_id == "T-V1.2.0B-WORKER-PASS"' docs/poll/cc-ready.json
```

期望：true。

---

## §3 hygiene 自检 checklist（14 项）

- [ ] §1 不锁型号 grep == 0（前向交付物 + tracked == §1.5 主表 + disk == §1.5 主表 disk 行 + wrapper/orchestrator/ == 0）
- [ ] §2 不硬编码 API key == 0（DEEPSEEK + VAPID + Tailscale auth key + wrapper/orchestrator/ == 0 + §2.7 better-sqlite3 path 默认 == 1）
- [ ] §3 v1.0 runtime 0 行 diff（harness/spec/spikes/9 ADR/docker-compose/pyproject）+ §3.7 NEW Dockerfile ≥ 1（例外声明）
- [ ] §4 dsh headless profile（web == 0 + headless ≥ 3 + ExecutionDriver dsh ≥ 3 + HTTP fallback ≥ 1 + heuristic ≥ 4 + commander dsh ≥ 2）
- [ ] §4.5 多 host 守门（IP 锁 == 0 + ts.net ≥ 6 + Funnel URL ≥ 6 + sleep infinity == 0 + harness-edge ≥ 5 + tag:harness-edge ≥ 1）
- [ ] §4.6 STT 守门（音频留盘 == 0 + 临时目录 == 0 + Whisper 模型路径合规）
- [ ] §4.7 Web Push 守门（VAPID 私钥 == 0 + signVapidJwt ≥ 2 + dsaEncoding ≥ 1 + createSign ≥ 1 + server.ts 8 endpoint ≥ 8 + **§4.7.7 NEW handleWorkerHeartbeat ≥ 2**）
- [ ] §4.8 PROJECT_ROOT 路径修门（4 dsh 文件 import.meta.url ≥ 4 + 残留 == 0 + **§4.8.5 NEW wrapper/orchestrator/ 5 文件 ≥ 2**）
- [ ] §4.9 dsh binary install 守门（DSH_VERSION 强校验 ≥ 2 + set -euo pipefail ≥ 1 + npm 版本 pin ≥ 1 + @latest == 0 + GitHub URL 硬编码 == 0）
- [ ] **§4.10 v1.2.0a commander 真实现守门维持**（TODO(M1) in commander.ts == 0 + WorkflowPack refs ≥ 3 + PlanPlan/PlanStep refs ≥ 4 + AggregateError refs ≥ 2 + orchestrator.ts 真走 commander ≥ 3 + workflow_pack.ts + workflow_packs/default.json file exists + loadManifest ≥ 1 + heuristic ≥ 2 + version="1.2.0a" ≥ 1 + plan_steps/plan_source ≥ 2 + 集成测试 gated ≥ 2 + 单测增量 ≥ 25）
- [ ] **§4.10.5 NEW commander.ts:113-114 TODO(v1.2.0b) 替换守门**（per F5 — TODO marker == 0）
- [ ] **§4.10.6 NEW commander.ts synthetic stub-worker 替换守门**（per F5 — stub-worker-${taskId} 字面 == 0；m5 GATE-CALIB 注释豁免：commander.ts L99 hygiene 注释「NO synthetic stub-worker-... IDs」自身提及字面 — 生产路径 0 处，v0.6 DER 注释豁免同型）
- [ ] **§4.11 v1.2.0b worker 真实现守门 NEW**（TODO(M1) in worker.ts == 0 + TODO(M1) wrapper/orchestrator/ == 0 + ExecutionDriver|worker_pool refs ≥ 6 + better-sqlite3|Database refs ≥ 4 + WAL|busy_timeout|journal_mode ≥ 3 + child_process|callDshHeadless ≥ 3 + fetch.*api/v1 ≥ 1 + server.ts worker.heartbeat|worker_pool.heartbeat ≥ 2 + worker.health() version="1.2.0b" ≥ 1 + spec/capabilities/worker.json deepseek-v4-flash ≥ 1 + 单测增量 ≥ 40 + 集成测试 gated ≥ 2 + worker_pool.ts + execution_driver.ts file exists + better-sqlite3 dep ≥ 1 + Dockerfile apk add ≥ 1）
- [ ] §5 v1.2.0b 20 文件 hygiene 自检表
- [ ] §7 教训记档验证（worker 真实现 stub → real + better-sqlite3 per-host WAL + ExecutionDriver both 模型 + server.ts heartbeat 真接 + M4 hygiene fix 合并 commit 2 + spec 校准 + 7 user must execute items）
- [ ] 双 gate（typecheck + tests；tsc exit 0 + vitest v1.2.0a formal PASS 实测基线 + v1.2.0b commit 2 ≥ 40 单测增量 + 22 gated 集成）

---

## §4 引用式纪律（6 处 PASS 验证）

按 Codex v0.4 §7.3 ② 升级 + v0.6 §7.4 ④ 延伸至 disk + v0.7 §4 延伸至 v1.2.0a + v1.2.0b 延伸至 worker 真实现守门；v1.2.0b 报告凡引用以下数字必走「audit-scope §1.5 主表唯一权威源」引用式，不复制绝对数字：

1. tracked 锚定数字 — 引用 §1.5 主表合计（v1.2.0a 收口 289e7eb 实测 = 引用式不复制）
2. disk 锚定数字 — 引用 §1.5 主表 disk 行（同引用式）
3. 前向交付物 grep 数字 — 引用 §2.1 第 3 条命令实测
4. wrapper/orchestrator/ 不锁型号 — 引用 §2.1 第 4 条命令实测
5. v1.2.0a §4.10 14 项 commander 真实现守门 — 引用 §2.10 各 grep 实测（v1.2.0a 收口 289e7eb 实测 = 引用式不复制）
6. v1.2.0b §4.11 14 项 worker 真实现守门 — 引用 §2.11 各 grep 实测（commit 2 后实测 = 引用式不复制）

**禁止**：(a) 公式预测任何锚定数字；(b) 复制绝对数字（演进链除外，仅作历史）；(c) 「占位后填」模式（实测前不写报告）。

---

## §5 复审预期 + Codex formal 报告格式

**复审预期终态**：0C/0M/0m PASS + §4.11 worker 真实现守门 14 项全绿 + §4.7.7 server.ts handleWorkerHeartbeat 真接守门全绿 + §4.10.5/§4.10.6 commander.ts TODO(v1.2.0b) + synthetic stub 替换守门全绿 + §3.7 Dockerfile 例外声明合规 + §2.7 better-sqlite3 path 默认值守门全绿 + tracked 锚定 post-v1.2.0b 引用式 + 集成测试 gated 守门全绿。

**Codex formal 报告落点**：`notes/codex-review-v1.2.0b-v0.1-formal-report.md`

**报告必含**：
- 0C/0M/0m 终态（CHANGES REQUIRED → 复审 → PASS）
- §1-§4.11 全部 14 项 hygiene checklist 验证结果
- 6 处引用式机制落地 PASS（不复制数字，引用 §1.5 + §2.1 + §2.10 + §2.11 + §4.10 + §4.11）
- tracked 锚定 post-v1.2.0b 引用式（仅引用 audit-scope §1.5 主表合计，不复制绝对数字）
- v1.2.0b 周期 14 文件改动 verbatim §1.5 主表
- v1.2.0b §7 教训记档验证（worker 真实现 stub → real + better-sqlite3 per-host WAL + ExecutionDriver both 模型 + server.ts heartbeat 真接 + M4 hygiene fix 合并 commit 2 + spec 校准 + 7 user must execute）
- Codex 提交铁律维持（Claude 不亲提，用户亲提；push via Clash proxy）

---

## §6 复审环境注记（继承 v0.4 §5.3 + v0.6 §5.3 + v0.7 §5.3 + v1.2.0a §8 + v1.2.0b §8 实战）

- **tsc**：`cd wrapper && ./node_modules/.bin/tsc --noEmit`（**项目本地 bin 必用**，禁 npx tsc — 会拉假 typosquat 包 exit=0 假绿）
- **vitest**：`cd wrapper && ./node_modules/.bin/vitest run`（**项目本地 bin 必用**，禁 npx --yes vitest — 缺 rolldown binding）
- **typecheck + tests 双 gate**：tsc exit 0 + vitest 0 failed（**v1.2.0b 起草 baseline = v1.2.0a formal PASS 实测** — 引用式 v1.2.0a §9 命令 #12 校准值，不复制绝对数字）
- **env-inject**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 仅 env var 注入，不入 commit
- **VAPID 公钥**：`deploy/vapid_public.key` 单文件白名单入库（per v0.6 §4.7 GATE-CALIB）
- **vitest setupFiles 优先模式**（v1.2.0a NEW §7-4）：`test/setup.ts` 在所有 test file 加载前执行（hoist-safe），env var mutation 必须在此层
- **commander 真实现 heuristic fallback 不依赖 DEEPSEEK_API_KEY**（v1.2.0a NEW §7-2）：unit test 默认场景下 plan() 走 heuristic 1-step plan；production env var 注入后才走 dsh 真调
- **集成测试 gated by env var**（v1.2.0a NEW §7-5 + v1.2.0b NEW）：`RUN_WORKER_POOL_E2E=1 RUN_SERVER_HEARTBEAT_E2E=1 DEEPSEEK_API_KEY=<key> ./node_modules/.bin/vitest run test/integration/{worker_pool,server_heartbeat}.test.ts`
- **better-sqlite3 native build**（v1.2.0b NEW）：per F2 `npm install better-sqlite3` 触发 node-gyp native 编译，node:22-alpine 默认无 python3/make/g++；Dockerfile 加 `RUN apk add --no-cache python3 make g++` per F2
- **Dockerfile 例外声明**（v1.2.0b §3.7 NEW）：Dockerfile 修改不破 v1.0 runtime 0 行 diff 守门（§3 第一条 diff 范围排除 Dockerfile；v1.2.0b 是首次 Dockerfile 修改 + 仅 build tools 不影响 v1.0 runtime kernel image）
- **wrapper 镜像 bind mount 部署**（v1.2.0b NEW 实战校准）：per deploy/6host-compose.newvps.yml `..:/app:ro` + command `node build/server.js`，wrapper 走 bind mount 不重建 wrapper image；v1.2.0b U3 npm install 触发 better-sqlite3 native build in container 内（host-side 已 npm install 完毕 → bind mount 进容器时已含 better-sqlite3 native binary）；U3 Docker build 视情况可省
- **M4 hygiene fix 合并 commit 2**（v1.2.0b §7-5 NEW）：per D3 = 合并进 commit 2 — `vi.restoreAllMocks()` → `vi.clearAllMocks()` in afterEach（restoreAllMocks 破坏 vi.mock factory 而 clearAllMocks 仅清状态保 factory）；commit 2 合并 push + v1.2.0b tag 涵盖，避免 v1.2.0a tag 缺 hygiene

---

*Codex audit-scope v0.1 复审 prompt — 25 条验证命令 + 14 项 hygiene checklist + 6 处引用式机制落地验证 + 复审预期 0C/0M/0m；Codex 提交铁律 user 亲提 `gpt-5.6-sol` + `xhigh`；报告落点 `notes/codex-review-v1.2.0b-v0.1-formal-report.md`*

Co-Authored-By: Claude Code <noreply@anthropic.com>
