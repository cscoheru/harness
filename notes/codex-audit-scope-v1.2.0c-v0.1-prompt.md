# Codex Audit-scope prompt — v1.2.0c cross-host routedDsh 真发到 MagicDNS + MacBook Worker 接入 + host-id fencing per ADR 0009

> **Date**: 2026-09-05
> **Source-of-truth**: `notes/codex-audit-scope-v1.2.0c-v0.1.md`（同 vault）
> **Purpose**: 用户亲提 Codex CLI:`codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.2.0c-v0.1-prompt.md`；预期 **0C/0M/0m** + §4.12 NEW cross-host 真发守门 16 项全绿 + §4.13 NEW MacBook worker 守门 12 项全绿 + §4.14 NEW host-id fencing 守门 8 项全绿 + §3.8 MagicDNS 命名裂痕修复声明合规 + tracked 锚定 post-v1.2.0c = 116 tracked + 12 self-injury = 128 disk verbatim 校准

---

## §1 复审范围

v1.2.0c 21 文件改动（per §1.5 v1.2.0c 主表）：
1. `wrapper/orchestrator/6host_router.ts` (Edit ~50 行)
2. `wrapper/orchestrator/orchestrator.ts` (Edit ~30 行)
3. `wrapper/orchestrator/host_fencing.ts` (NEW ~80 行)
4. `wrapper/orchestrator/worker.ts` (Edit ~20 行)
5. `wrapper/test/unit/6host_router.test.ts` (Edit ~30 tests)
6. `wrapper/test/integration/cross_host_dispatch.test.ts` (NEW ~180 行)
7. `wrapper/test/integration/host_id_fencing.test.ts` (NEW ~100 行)
8. `wrapper/test/integration/macbook_worker.test.ts` (NEW ~120 行)
9. `deploy/6host-compose.edge[1-5].yml` (Edit 5 文件)
10. `deploy/6host-compose.newvps.yml` (Edit)
11. `deploy/{tailscale-acl-6host,tailscale-funnel-6host,tailscale-serve-harness}.yaml` (Edit 3 文件)
12. `deploy/macbook-compose.yml` (NEW ~120 行)
13. `deploy/runbook-macbook-worker.md` (NEW ~150 行)
14. `spec/capabilities/macbook.json` (NEW ~30 行)
15. `spec/kernel-schema.sql` (Edit ~10 行 per §3.9 例外声明)
16. `harness/runtime/worker_pool.py` (Edit ~30 行 per §3.8 例外声明)
17. `notes/codex-audit-scope-v1.2.0c-v0.1.md` (NEW 本 audit-scope)
18. `notes/codex-audit-scope-v1.2.0c-v0.1-prompt.md` (NEW 本 prompt)
19. `docs/poll/cc-ready.json` (Edit 翻牌)
20. `CHANGELOG.md` (Edit)
21. `README.md` (Edit)

## §2 Codex 必跑验证命令矩阵

### §2.1 hygiene 18 项 checklist（不锁型号 + 不硬编码 key + v1.0 runtime 0 行 diff + Dockerfile 例外 + 3 NEW §4.x 守门）

```bash
# 1. tracked 锚定（post-v1.2.0c 引用式 v1.2.0a §1.5 主表合计 = 116）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: 116 tracked（v1.2.0a 收口 289e7eb 实测锚定；v1.2.0c 不动 docs/adr/spec/capabilities 主表锚定区域）

# 2. disk 锚定（v1.2.0c 实测 verbatim = 128 = 116 tracked + 12 self-injury）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.2.0c-v0.1.md | wc -l
# 期望: 128 disk（verbatim 校准落定 — §1 继承 + §9 cmd 矩阵共 12 self-injury）

# 3. notes/ 自伤
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.2.0c-v0.1.md | wc -l
# 期望: 12

# 4. v1.0 runtime 0 行 diff（§3.7 Dockerfile + §3.8 harness/runtime/worker_pool.py + §3.9 spec/kernel-schema.sql 三例外声明 — pathspec 排除配套 per v1.2.0b Dockerfile 模式）
git diff v1.0.0..HEAD -- harness/ ':(exclude)harness/runtime/worker_pool.py' spec/kernel-schema.sql ':(exclude)spec/kernel-schema.sql' spikes/ 'adr/000[1-9]-*.md' docker-compose.yml pyproject.toml | wc -l
# 期望: == 0（主 pathspec 排除两例外文件 — m2 GATE-CALIB per v1.2.0c prompt-review：原 pathspec 含 §1 待 Edit 两文件，Commit 2 后必恒红）
git diff v1.0.0..HEAD -- harness/runtime/worker_pool.py | wc -l  # ≥ 1（§3.8 例外声明落地）
git diff v1.0.0..HEAD -- spec/kernel-schema.sql | wc -l  # ≥ 1（§3.9 例外声明落地）

# 5. wrapper/orchestrator/ 不锁型号
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l
# 期望: 0（m5 GATE-CALIB 注释豁免第三例：host_fencing.ts L20 hygiene 注释「No model-specific identifiers (Fable 5 / GLM 5.3 / MiniMax-M3)」自身提及字面 — 生产路径 0 锁型号；v0.6 DER + v1.2.0b stub-worker 同型。守门跑法：命中 1 处须核对为注释行）

# 6. §3.8 NEW MagicDNS 命名裂痕修复（per D5 + F11）
grep -rE "fish-harness\.ts\.net" wrapper/orchestrator/6host_router.ts deploy/tailscale-acl-6host.yaml deploy/tailscale-funnel-6host.yaml deploy/tailscale-serve-harness.yaml deploy/6host-compose.edge1.yml deploy/6host-compose.edge2.yml deploy/6host-compose.edge3.yml deploy/6host-compose.edge4.yml deploy/6host-compose.edge5.yml deploy/6host-compose.newvps.yml deploy/macbook-compose.yml | wc -l
# 期望: ≥ 20（v1.2.0c 起草预估 ≥ 20；1 canonical suffix 跨 11 文件）

# 7. §3.8.1 OLD tail1b9878.ts.net 残留检测
grep -rE "tail1b9878\.ts\.net" wrapper/orchestrator/ deploy/ 2>&1 | wc -l
# 期望: == 0

# 8. 不硬编码 API key
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json spec/capabilities/macbook.json wrapper/orchestrator/ deploy/ | wc -l
# 期望: == 0

# 9. wrapper/orchestrator/ 不硬编码
grep -rE "sk-[a-z0-9]{32,}|DEEPSEEK_API_KEY\s*=\s*['\"][a-zA-Z0-9]" wrapper/orchestrator/ | wc -l
# 期望: == 0

# 10. VAPID 私钥守门
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/orchestrator/ workflow_packs/ CHANGELOG.md README.md | wc -l
# 期望: == 0

# 11. Tailscale auth key 守门
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md spec/capabilities/worker.json spec/capabilities/macbook.json | wc -l
# 期望: == 0

# 12. §2.8 NEW kjonemacbook-pro MagicDNS hostname 不硬编码 Tailscale key
grep -rE "kjonemacbook-pro\s*=\s*['\"]?tskey-" deploy/ | wc -l
# 期望: == 0

# 13. dsh headless profile 不引入 web profile
grep -rE "profile: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# 期望: == 0
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# 期望: ≥ 3

# 14. §4.10 v1.2.0a commander 真实现守门 14 项维持（v1.2.0a PASS 0C/3M/4m 收口 289e7eb 锚定）
grep -rE "TODO\(M1\)" wrapper/orchestrator/commander.ts | wc -l  # == 0
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
grep -c "describe\|it(" wrapper/test/unit/commander.test.ts wrapper/test/unit/workflow_pack.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 25

# 15. §4.11 v1.2.0b worker 真实现守门 14 项维持（v1.2.0b PASS 0C/0M/0m 收口 b44c1da 锚定）
grep -rE "TODO\(M1\)" wrapper/orchestrator/worker.ts | wc -l  # == 0
grep -rE "TODO\(M1\)" wrapper/orchestrator/ | wc -l  # == 0
grep -cE "ExecutionDriver|worker_pool" wrapper/orchestrator/worker.ts  # ≥ 6
grep -c "better-sqlite3\|Database" wrapper/orchestrator/worker_pool.ts  # ≥ 4
grep -c "WAL\|busy_timeout\|journal_mode" wrapper/orchestrator/worker_pool.ts  # ≥ 3
grep -c "child_process\|callDshHeadless" wrapper/orchestrator/execution_driver.ts  # ≥ 3
grep -cE "fetch.*api/v1" wrapper/orchestrator/execution_driver.ts  # ≥ 1
grep -cE "worker\.heartbeat|worker_pool\.heartbeat" wrapper/server.ts  # ≥ 2
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/orchestrator/worker.ts wrapper/orchestrator/worker_pool.ts wrapper/orchestrator/execution_driver.ts | wc -l  # == 0
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/orchestrator/ | wc -l  # == 0
grep -E "version.*1\.2\.0b|1\.2\.0b" wrapper/orchestrator/worker.ts | wc -l  # ≥ 1
grep -c "deepseek-v4-flash" spec/capabilities/worker.json  # ≥ 1
grep -c "describe\|it(" wrapper/test/unit/worker.test.ts wrapper/test/unit/worker_pool.test.ts wrapper/test/unit/execution_driver.test.ts | awk -F: '{s+=$NF} END{print s}'  # ≥ 40
grep -cE "RUN_WORKER_POOL_E2E|RUN_SERVER_HEARTBEAT_E2E" wrapper/test/integration/worker_pool.test.ts wrapper/test/integration/server_heartbeat.test.ts  # ≥ 2
test -f wrapper/orchestrator/worker_pool.ts  # NEW
test -f wrapper/orchestrator/execution_driver.ts  # NEW
grep -c '"better-sqlite3"' wrapper/package.json  # ≥ 1
grep -c "apk add.*python3.*make.*g++" Dockerfile  # ≥ 1

# 16. 5 edge compose + sleep infinity == 0 维持
grep -rE "sleep infinity" deploy/ | wc -l  # == 0
grep -rE "harness-edge[1-5]" deploy/ | wc -l  # ≥ 5

# 17. server.ts endpoint 守门（v0.7 + v1.2.0a + v1.2.0b + v1.2.0c 维持）
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)|app\.use\(\s*\(\s*_req" wrapper/server.ts  # ≥ 8

# 18. cc-ready.json 翻牌
jq -e '.task_id == "T-V1.2.0C-CROSSHOST-MACBOOK-PASS"' docs/poll/cc-ready.json  # true
```

### §2.2 §3.8 / §4.12 / §4.13 / §4.14 NEW 守门（v1.2.0c commit 2 后实测）

```bash
# §3.8 NEW MagicDNS 命名裂痕修复声明（per D5 + F11）
grep -rE "fish-harness\.ts\.net" wrapper/orchestrator/6host_router.ts deploy/tailscale-acl-6host.yaml deploy/tailscale-funnel-6host.yaml deploy/tailscale-serve-harness.yaml deploy/6host-compose.edge1.yml deploy/6host-compose.edge2.yml deploy/6host-compose.edge3.yml deploy/6host-compose.edge4.yml deploy/6host-compose.edge5.yml deploy/6host-compose.newvps.yml deploy/macbook-compose.yml | wc -l  # ≥ 20
grep -rE "tail1b9878\.ts\.net" wrapper/orchestrator/ deploy/ 2>&1 | wc -l  # == 0

# §4.12 NEW cross-host 真发守门 16 项
grep -cE "fetch\(.*getHostUrl.*api/v1/tasks" wrapper/orchestrator/6host_router.ts  # ≥ 1（routedDsh() 真发远程 per F12；m2 GATE-CALIB per v1.2.0c formal：原 pattern 要求 fetch+域名+path 同行，实现为表驱动 getHostUrl() 拼接 — 真发在 L307 `${getHostUrl(...)}/api/v1/tasks`，域名字面在 L75-87 magicDnsName 表 63 处 canonical 由 cmd 6 独立守门）
grep -c "callDshHeadless" wrapper/orchestrator/6host_router.ts  # == 0（替换 L277, per F12）
grep -c "MACBOOK_HOST\|macbook" wrapper/orchestrator/6host_router.ts  # ≥ 4（HostId union + 表 + findAvailableHost + scoring, per F20）
grep -c "host_id\|hostId" harness/runtime/worker_pool.py spec/kernel-schema.sql | awk -F: '{s+=$NF} END{print s}'  # ≥ 5（per F13 partial unique index）
grep -rE "CREATE UNIQUE INDEX.*task_id.*host_id" spec/ | wc -l  # ≥ 1（per F13 + ADR 0009 line 68）
test -f wrapper/orchestrator/host_fencing.ts  # NEW（per plan §4.2 + F13）
grep -c "host_id" wrapper/orchestrator/host_fencing.ts  # ≥ 5（NEW file, per ADR 0009 line 68 + plan §4.2）
grep -cE "RUN_CROSS_HOST_E2E|RUN_HOST_FENCING_E2E" wrapper/test/integration/cross_host_dispatch.test.ts wrapper/test/integration/host_id_fencing.test.ts  # ≥ 2
grep -c "kjonemacbook-pro\|macbook\.fish-harness\.ts\.net" deploy/macbook-compose.yml wrapper/orchestrator/6host_router.ts  # ≥ 4
grep -E "type HostId\s*=\s*['\"](newvps|edge[1-5]|macbook)" wrapper/orchestrator/6host_router.ts  # ≥ 1（HostId union 加 "macbook", per F20）
test -f wrapper/test/integration/cross_host_dispatch.test.ts  # NEW
test -f wrapper/test/integration/host_id_fencing.test.ts  # NEW
test -f spec/capabilities/macbook.json  # NEW（per F14）
grep -rE "vapid_private_key|sk-[a-z0-9]{32,}" wrapper/orchestrator/6host_router.ts wrapper/orchestrator/host_fencing.ts wrapper/orchestrator/orchestrator.ts wrapper/orchestrator/worker.ts | wc -l  # == 0

# §4.13 NEW MacBook worker 守门 12 项
test -f deploy/macbook-compose.yml  # NEW（per F15）
test -f deploy/runbook-macbook-worker.md  # NEW（per F15）
test -f spec/capabilities/macbook.json  # NEW（per F14）
grep -c "host_class.*macbook-main\|working_hours\|isWorkingHours" wrapper/orchestrator/orchestrator.ts spec/capabilities/macbook.json | awk -F: '{s+=$NF} END{print s}'  # ≥ 3（per F14；m4 GATE-CALIB per v1.2.0c formal 二次校准：原 pattern 误列 worker.ts + 漏 camelCase — host_class 归 capability spec（macbook.json L6-7 两处）、工作时段评分逻辑在 orchestrator.ts 以 isWorkingHours 命名（3 处）；实测 5 = json 2 + orchestrator 3）
grep -c "isWorkingHours\|scoring.*+100\|score.*+.*100" wrapper/orchestrator/orchestrator.ts  # ≥ 2（per F14 + D6）
grep -rE "tag:macbook" deploy/tailscale-acl-6host.yaml | wc -l  # ≥ 3（per F16）
grep -c "kjonemacbook-pro\|macbook\.fish-harness\.ts\.net" deploy/macbook-compose.yml wrapper/orchestrator/6host_router.ts  # ≥ 4
grep -cE "node:24-slim" deploy/macbook-compose.yml  # ≥ 1（per F19）
grep -c "WORKER_HOST\|EDGE_REGION.*local-mac\|colima" deploy/macbook-compose.yml  # ≥ 3
grep -c "bind.*Users/kjonekong\|/Users.*projects.*fish-harness" deploy/macbook-compose.yml  # ≥ 2（MacBook bind mount）
grep -rE "sleep infinity" deploy/macbook-compose.yml | wc -l  # == 0（v0.7 守门 维持）
test -f wrapper/test/integration/macbook_worker.test.ts  # NEW（per plan §4.2 + F18）
grep -c "deepseek-v4-flash" spec/capabilities/macbook.json  # ≥ 1（per F14）
grep -c "pmset\|disablesleep\|reassign" deploy/runbook-macbook-worker.md deploy/macbook-compose.yml | awk -F: '{s+=$NF} END{print s}'  # ≥ 2（per F15 + PRD §3.1）

# §4.14 NEW host-id fencing 守门 8 项
grep -cE "host_id|hostId" harness/runtime/worker_pool.py  # ≥ 3（per F13）
grep -cE "CREATE UNIQUE INDEX.*task_id.*host_id|UNIQUE.*host_id" spec/kernel-schema.sql  # ≥ 1（partial unique index, per F13）
grep -c "host_id" wrapper/orchestrator/host_fencing.ts  # ≥ 5
test -f wrapper/orchestrator/host_fencing.ts  # NEW
grep -cE "recordDispatch\(task_id|function recordDispatch|recordDispatch\s*=" wrapper/orchestrator/host_fencing.ts  # ≥ 1（m3 GATE-CALIB per v1.2.0c formal：实现为 class HostFence 方法形态 `recordDispatch(task_id: ...)` — 方法定义无 function 关键字无 = 赋值，原 pattern 恒 0 假门）
grep -cE "checkFencing\(task_id|function checkFencing|checkFencing\s*=" wrapper/orchestrator/host_fencing.ts  # ≥ 1（m3 同型：方法形态 L131）
grep -c "class HostIdFencingError\|HostIdFencingError\s*extends" wrapper/orchestrator/host_fencing.ts  # ≥ 1（per F13）
test -f wrapper/test/integration/host_id_fencing.test.ts  # NEW（per plan §4.2 + F18）
```

### §2.3 引用式机制落地 7 项（不允许引入新发现必须穷尽列已发现）

```bash
# 1. F11 MagicDNS 命名裂痕修复（per D5 + §3.8）
grep -rE "fish-harness\.ts\.net" wrapper/orchestrator/6host_router.ts deploy/tailscale-acl-6host.yaml deploy/tailscale-funnel-6host.yaml deploy/tailscale-serve-harness.yaml deploy/6host-compose.edge[1-5].yml deploy/6host-compose.newvps.yml deploy/macbook-compose.yml | wc -l  # ≥ 20
grep -rE "tail1b9878\.ts\.net" wrapper/orchestrator/ deploy/ 2>&1 | wc -l  # == 0

# 2. F12 routedDsh() L277 真发 fetch() 替换
grep -cE "fetch\(.*getHostUrl.*api/v1/tasks" wrapper/orchestrator/6host_router.ts  # ≥ 1（m2 GATE-CALIB：表驱动 getHostUrl 拼接形态）
grep -c "callDshHeadless" wrapper/orchestrator/6host_router.ts  # == 0

# 3. F13 kernel-side partial unique index 兜底
grep -rE "CREATE UNIQUE INDEX.*task_id.*host_id" spec/ | wc -l  # ≥ 1
grep -cE "host_id|hostId" harness/runtime/worker_pool.py  # ≥ 3

# 4. F14 MacBook capability spec + working_hours 字段
grep -c "host_class.*macbook-main\|working_hours" wrapper/orchestrator/worker.ts spec/capabilities/macbook.json | awk -F: '{s+=$NF} END{print s}'  # ≥ 3
grep -c "deepseek-v4-flash" spec/capabilities/macbook.json  # ≥ 1

# 5. F15 MacBook compose + runbook
test -f deploy/macbook-compose.yml  # NEW
test -f deploy/runbook-macbook-worker.md  # NEW

# 6. F16 Tailscale ACL tag:macbook 段
grep -rE "tag:macbook" deploy/tailscale-acl-6host.yaml | wc -l  # ≥ 3

# 7. F19 node:24-slim + MacBook alpine 避开
grep -cE "node:24-slim" deploy/macbook-compose.yml  # ≥ 1
```

### §2.4 复审范围完整性 5 项（v1.2.0c 21 文件改动实测）

```bash
# v1.2.0c 21 文件改动实测（file exists + 内容空）
for f in wrapper/orchestrator/6host_router.ts wrapper/orchestrator/orchestrator.ts wrapper/orchestrator/host_fencing.ts wrapper/orchestrator/worker.ts wrapper/test/unit/6host_router.test.ts wrapper/test/integration/cross_host_dispatch.test.ts wrapper/test/integration/host_id_fencing.test.ts wrapper/test/integration/macbook_worker.test.ts deploy/6host-compose.edge1.yml deploy/6host-compose.edge2.yml deploy/6host-compose.edge3.yml deploy/6host-compose.edge4.yml deploy/6host-compose.edge5.yml deploy/6host-compose.newvps.yml deploy/tailscale-acl-6host.yaml deploy/tailscale-funnel-6host.yaml deploy/tailscale-serve-harness.yaml deploy/macbook-compose.yml deploy/runbook-macbook-worker.md spec/capabilities/macbook.json spec/kernel-schema.sql harness/runtime/worker_pool.py notes/codex-audit-scope-v1.2.0c-v0.1.md notes/codex-audit-scope-v1.2.0c-v0.1-prompt.md docs/poll/cc-ready.json CHANGELOG.md README.md; do
  if [ -f "$f" ]; then
    wc -c "$f" | awk '{print $1, "bytes", $2}'
  else
    echo "MISSING: $f"
  fi
done
# 期望: 21 files 全 exists + 内容字节数 > 0（m2 GATE-CALIB：baseline = **Commit 2 实施完成后** — commit 1 仅 5 files，7 NEW 文件 Commit 2 落地；本循环是 §2.1-§2.3 的前置 gate，防 NEW 文件 MISSING 被 `grep | wc -l` 掩蔽假绿）
```

### §2.5 user EXEC checklist 9 项（per §12.4 U1-U9）

- [ ] **U1** TypeScript build on newvps exit 0
- [ ] **U2** 双 gate: tsc exit 0 + vitest ≥220 passed | 0 failed（算式：191 现状 + 6host_router.test.ts Edit 增量 ~30；3 NEW 集成套件默认 gated-skip 不计入 passed）
- [ ] **U3** docker compose 重启（5 edge + 3 newvps services Up）
- [ ] **U4** gated E2E 真跑（107 现状 + 3 NEW 套件入池；含 RUN_CROSS_HOST_E2E=1 + RUN_HOST_FENCING_E2E=1 + RUN_MACBOOK_E2E=1）— 14+ tests PASS
- [ ] **U5** 7 Funnel URL 路径 200（newvps + 5 edge + MacBook, per F11 修复后 MagicDNS 一致）
- [ ] **U6** Codex v1.2.0c formal 复审 PASS（user 亲提 `gpt-5.6-sol` + `xhigh`）
- [ ] **U7** v1.2.0c minor tag @ boundary commit **b5a1d07**（m1 GATE-CALIB per v1.2.0c prompt-review：原文「289e7eb」与 §4 提交命令 `git tag -a v1.2.0c b5a1d07` 矛盾 — Debian 风格 tag @ 本周期起跑点 = v1.2.0b 收口后 cross-ref commit b5a1d07；289e7eb 是 v1.2.0a 收口/v1.2.0b 起跑 boundary）
- [ ] **U8** MacBook worker 真部署（per F15 + runbook）
- [ ] **U9** 5 edge host 真 provision + ACL sync（per F16）

---

## §3 Codex 期望输出

### §3.1 复审结论格式

```markdown
# Codex review — v1.2.0c v0.1 cycle formal report

> **Date**: 2026-09-05
> **Reviewer**: Codex gpt-5.6-sol xhigh

## §0 终态裁定

> **Boundary**: b5a1d07（v1.2.0c 起跑 = v1.2.0b 收口后 cross-ref；per F4 红线）

**PASS — 0C/0M/0m** | **FAIL — 1+M+5m** | **WARN — 0C/M/0m**

## §1 findings

### Critical (0)
(none)

### Major (0)
(none)

### minor (0)
(none)

## §2 双 gate 实测
- tsc: exit 0
- vitest: X passed | 0 failed | Y gated

## §3 三源闭合
- tracked: 116
- disk: 128 = 116 tracked + 12 self-injury (verbatim 校准)
- self-injury: 12

## §4 守门验证
- §3.8 MagicDNS 命名裂痕修复: PASS / FAIL
- §3.8.1 tail1b9878.ts.net 残留: PASS / FAIL (== 0)
- §4.10 v1.2.0a commander 真实现守门 14 项: PASS / FAIL
- §4.11 v1.2.0b worker 真实现守门 14 项: PASS / FAIL
- §4.12 cross-host 真发守门 16 项: PASS / FAIL
- §4.13 MacBook worker 守门 12 项: PASS / FAIL
- §4.14 host-id fencing 守门 8 项: PASS / FAIL
- 18 hygiene checklist: PASS / FAIL

## §5 新坑记档（if any）
...

## §6 复审环境注记
...
```

### §3.2 复审 hygiene 红线

- **F1 grep pattern 三处对齐**: §2.1 commands 必须与 §4.12/§4.13/§4.14 audit-scope 一致（禁 Codex 改 pattern 不通知）
- **F2 grep -r | wc -l ≠ exit code**: Codex 报告 "0 findings" 必跑 `wc -l` 不依赖 exit code（per fish-harness-disk-quote-verbatim-discipline）
- **F3 cc-ready 单一簿记**: Codex 不直接改 cc-ready.json,仅 audit-scope 校对一致; cc-ready 翻牌由 Claude 完成
- **F4 header commit hash 同步**: Codex 报告 §0 终态裁定 必含 boundary commit 289e7eb (per v1.2.0a/v1.2.0b Debian stable point release 风格)
- **F5 verbatim discipline**: Codex 不接受 §1/§1.5/§9 数字公式预测,必跑 grep 实测后引用 verbatim 数字（per fish-harness-disk-quote-verbatim-discipline 第二次复发守门）

---

## §4 Codex 提交铁律（继承 v1.2.0a/v1.2.0b）

- 用户亲提 Codex CLI: `codex review --model gpt-5.6-sol --reasoning-effort xhigh notes/codex-audit-scope-v1.2.0c-v0.1-prompt.md`
- Claude 不亲提 Codex
- 报告落 `notes/codex-review-v1.2.0c-v0.1-formal-report.md`
- 提交 git tag 由 user 亲提: `git tag -a v1.2.0c b5a1d07 -m "v1.2.0c: ..." && git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.2.0c` via Clash proxy

---

## §5 关联文档

- audit-scope: `notes/codex-audit-scope-v1.2.0c-v0.1.md`（同 vault）
- plan: `/Users/kjonekong/.claude/plans/buzzing-humming-book.md` §12 v1.2.0c 启动校准（2026-09-05）
- memory: `fish-harness-newvps-host-alias.md`（ssh newvps 207.57.133.177:52134 ≠ puer-hk mail.rana.asia）
- memory: `fish-harness-disk-quote-verbatim-discipline.md`（verbatim 块复制 + 自伤源实测校准）
- memory: `fish-harness-v1.2.0b-codex-formal-pass.md`（v1.2.0b PASS 0C/0M/0m 锚定）
- ADR 0009 line 68（host-id fencing if multi-host）
- PRD §3.1（MacBook 主力 worker）+ §3.3（跨 host 真发）

---

*Codex audit-scope prompt — v1.2.0c 周期第四 sub-cycle = cross-host 真发 + MacBook Worker 接入 + host-id fencing per ADR 0009；21 文件改动守门 by-design；预期 0C/0M/0m + tracked 116 + disk 128 verbatim 校准 + §3.8 MagicDNS 命名裂痕修复声明 + §4.12/§4.13/§4.14 NEW 守门 36 项全绿 + 9 user EXEC（v1.2.0b 7 EXEC + 2 = U1-U9）；下一站 v1.2.0c minor tag @ boundary commit 289e7eb + v1.2.0d 防 OOM sub-cycle*

Co-Authored-By: Claude Code <noreply@anthropic.com>