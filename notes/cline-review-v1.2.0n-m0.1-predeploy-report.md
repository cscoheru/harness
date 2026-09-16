---
name: cline-review-v1.2.0n-m0.1-predeploy-report
description: Pre-deploy review REPORT for v1.2.0n M0.1 (commit 5faffea, tag v1.2.0n.0) — PASS 0C/0M/2m (code) + audit-scope doc accuracy findings
metadata:
  type: project
  originSessionId: 42de653a-6a8f-4659-a360-644587871f16
  modified: 2026-09-16T12:35:00.000Z
---

# Cline Review Report — v1.2.0n M0.1 Pre-Deploy (commit 5faffea)

**Scope doc:** [[cline-audit-scope-v1.2.0n-m0.1-predeploy]]
**Reviewed:** 5faffea9cf59c36b60bff071efdec81eb71b37f5 (= HEAD = tag v1.2.0n.0, verified)
**Mode:** read-only review (no reviewed file modified; this report is the only new file)

## §0 Verdict

**PASS — deploy authorized.** Code: **0 critical / 0 major / 2 minor**(其中 1 条为
pre-existing 相邻注释,1 条为 commit message 卫生项,均不阻塞)。
审计 scope 文档本身另有 4 条准确性 finding(见 §4 F3-F6),不影响 deploy 正确性——
其全部语义主张经实测均为真,仅路径/tag 名/行号漂移。

## §1 必查项 A-E — 全部 CONFIRMED

| # | 项 | 裁决 | 证据 |
|---|----|------|------|
| A | Express route order | ✅ CONFIRMED | `app.use(json)` pwa_server.ts:42 → `app.post("/api/v1/worker/heartbeat")` **:59** → `app.all("/api/v1/*path")` **:182** → get(/health) :241 → post(/api/pwa/dispatch) :249 → static :316 → SPA :320 → error :327。heartbeat 先于 wildcard 注册,grep 实测顺序符合预期 |
| B | Option C double-write | ✅ CONFIRMED | :145-161 `void fetch(\`${ORCH_PROXY_URL}/api/v1/worker/heartbeat\`).catch(...)` fire-and-forget;ECONNREFUSED 被 `.catch` 吞掉,本地 `res.json(resultBody)` :163 照发。T5 (test:180-196) 断言 spy 调用 URL 同时含 `wrapper-orchestrator:4000` + heartbeat 路径,不依赖响应形状 |
| C | Schema validation parity | ✅ CONFIRMED | pwa_server.ts:67-133 与 wrapper/server.ts:340-411(canonical,**注意路径是 wrapper/server.ts,非 wrapper/orchestrator/server.ts**)逐条对齐:extra fields 400 / register 缺 host 400 / 缺 capabilities_json 400 / >10240 413。T1/T4/T6 覆盖 3 个 400 |
| D | SQLite WAL 共享卷并发 | ✅ CONFIRMED(有缓解) | worker_pool.ts:132-134 `journal_mode=WAL` + `busy_timeout=5000` + `synchronous=NORMAL`;task_store.ts:133-134 同。**scope 文档未提的决定性缓解**:F41 host-dedup(worker_pool.ts:277-297)——`register()` 先 `findActiveByHost`,同 host 已有 active 行则 bump heartbeat 并返回原 worker_id → 前端本地写与转发双写落在**同一 orch_pool SQLite 文件**上是幂等的,不会堆重复行(v1.2.0d.4 的 1392 stale rows 教训已修)。残留: better-sqlite3 同步写,锁竞争时最长阻塞事件循环 5s——3 容器 × 10s 心跳间隔下可忽略 |
| E | heartbeat sender env wiring | ✅ CONFIRMED | compose 3 个 wrapper profile 各设 `WORKER_HEARTBEAT_URL=http://wrapper-frontend:4002` + `WORKER_HOST=<container-name>`(orch :179-180 / commander :238-239 / commander-2 :287-288);**wrapper-frontend 自身未设**(无自心跳回环)✓。heartbeat_sender.ts:81-82 `process.env['WORKER_HEARTBEAT_URL']` 早退守卫 ✓;compose `environment:` 在进程启动时注入,先于模块加载 ✓ |

## §2 F-H / I-K — 裁决

- **F fetchSpy isolation:** 非问题,scope-appropriate。test:100-108 `vi.spyOn(globalThis,"fetch")` 默认 calls-through(grep 实测:fetch spy 无 mockResolvedValue;mockImplementation 仅 console spy :101-103)。前瞻警示(未来第 7 例若需 canned response 须改造)成立但属 forward scope。
- **G PWA_PORT="0":** 非问题。build/orchestrator/pwa_server.js:301 `app.listen(PORT` 实测存在(scope 引用 build 行号正确);且测试内 `isMain=false`(vitest 入口),pwa_server 自身 listen 根本不执行,test:55-56 用自己的 `createServer(app).listen(0)` ephemeral 绑定。PWA_PORT="0" 仅为防御性设置。
- **H ORCH_PROXY_URL 默认值:** 非问题。源码 pwa_server.ts:36 + build:32 均有 `?? "http://wrapper-orchestrator:4000"`;测试中真实 fetch ECONNREFUSED 被 handler `.catch` 吞掉,T5 只查 URL 模式。
- **I M0.2/M0.3 不回滚:** PASS。.gitignore:27 `/node_modules/`、vitest.config.ts:51 `!build/**` 在位;全量 260 PASS 佐证 ripple 修复未回滚。
- **J 不加 tenant validation:** PASS。pwa_server heartbeat handler 无 tenant 校验(worker tenant-agnostic,正确);server.ts:188-205(handleStatusById kernel fallback)未被触碰。

## §3 覆盖矩阵实测(11/11)

| # | 期望 | 实测 | 结果 |
|---|------|------|------|
| 1 | 6/6 PASS | pwa_server.test.ts 6/6(含于全量 vitest) | ✅ |
| 2 | URL match | T5 spy URL 含 wrapper-orchestrator:4000 + 路径 | ✅ |
| 3 | 3 个 400 | T1/T4/T6 全 400 | ✅ |
| 4 | string/number | T3 断言 `["number","string"].toContain(typeof)` | ✅ |
| 5 | 0 matches | `git diff 5faffea^..5faffea -U0 \| grep -E 'sk-..|api[_-]key|SECRET\|TOKEN\|PASSWORD'` → 无输出 | ✅ |
| 6 | tag=HEAD=5faffea | HEAD=tag=5faffea9cf59c36b60bff071efdec81eb71b37f5 | ✅ |
| 7 | 0 | **scope 命令坏(tag 名)**;改用正确口径 `git diff 5faffea^..5faffea -- harness/server.py spec/ kernel-schema.sql \| wc -l` = **0**(累计 v1.0.0..HEAD 为 +392/7 files,见 Finding 4) | ✅* |
| 8 | exit 0 | `tsc --noEmit` exit 0 | ✅ |
| 9 | 260 PASS / 0 FAIL | vitest run: **260 passed / 0 failed / 147 skipped**,exit 0(3.14s) | ✅ |
| 10 | exit 0 | python3 yaml.safe_load OK | ✅ |
| 11 | 6 matches | WORKER_HEARTBEAT_URL ×3 + WORKER_HOST ×3 | ✅ |

## §4 Findings(编号,severity / file:line / 描述 / 建议)

**针对 commit 5faffea(计入 pass 判据):**

1. **minor** — `commit 5faffea message body` — v0.5 hard rule (d) 要求 commit message 附实测数,但 body 只有 "L8 secrets: 0 in diff" 与 L19 注记,**无 "260 PASS / 0 FAIL / 147 SKIP"**。scope 文档 §7(d) 标 ✅ 与事实不符。Fix: 本次无需 amend(实测数已由本报告 §3 复跑钉死);若因其他原因 amend,补上实测数即可。
2. **minor(pre-existing,非 5faffea 引入)** — `deploy/6host-compose.newvps.yml:365-366` — 注释 "pwa_server.ts 暂无 G8.1 SIGTERM handler (forward scope §6.b)" 已过时:`registerShutdown` 存在且已接线(pwa_server.ts:338-346,`node build/orchestrator/pwa_server.js` 入口 isMain=true 时调用)。Fix: 下次触碰 compose 时顺带改注释;不阻塞。

**针对审计 scope 文档本身(不计入 commit pass 判据,建议下版修正):**

3. **minor** — scope §1/§2-C/§5 — 引用 `wrapper/orchestrator/server.ts` **该路径不存在**(ENOENT);canonical heartbeat handler 在 `wrapper/server.ts:324-425`(route 注册 :425)。所有 "server.ts:340-348" parity 主张语义正确,仅路径前缀错。
4. **minor** — scope §3-#7 / §4-cmd5 — tag `1.0.0` 不存在(`fatal: bad revision`;实际 tag 为 `v1.0.0`);且即使修正 tag 名,累计 `v1.0.0..HEAD` 对 harness/server.py + spec/ + kernel-schema.sql 是 **+392 insertions / 7 files**(v1.1/v1.2 周期增量:spec/capabilities/orch.json+17、worker.json+20、kernel-schema.sql+23 等),"期望 0" 口径不成立。M0.1 正确不变式 = **本 commit 对 runtime 零改动**,已实测 0。
5. **minor** — scope §1/§5 元数据漂移 — test "195 lines" → 实际 **205**;pwa_server.ts "357 total" → **385**;compose "384 total" → **395**;行号漂移:test:64→45、96-101→100-108、178-186→180-196;pwa_server.ts:32→36、54-63→67-76、130-148→145-161;compose L174-178→L176-180、L227-231→L235-239、L275-279→L286-288、L312-316→L326-332、L329(WORKFLOW_PACKS_DIR)→L187/L349。(build/orchestrator/pwa_server.js L301 对 build 产物的引用是正确的。)
6. **info** — scope §2-D — 未引用决定性缓解 F41 host-dedup(worker_pool.ts:277-297):共享 orch_pool 卷上的双写因此幂等(bump 而非重复 INSERT),这才是 D 项"双进程写同一 WAL 文件"真正的安全边界,建议后续 scope 收录;§2-D 引 "task_store.ts:133-136" 的 pragma 实际在 worker_pool.ts:132-134 与 task_store.ts:133-134。

## §5 hygiene 抽验(对应 scope §7)

- (a) 先行起草 ✅(scope 文件 git 状态 `??` untracked)
- (b) commit 后复审 ✅(tsc exit 0 + vitest 260/0/147 本报告复跑)
- (c) 自引入不入 tracked ✅(`git grep cline-audit-scope-v1.2.0n` 无匹配;5faffea 五文件清单内无它)
- (d) commit message 附实测数 ❌ → 见 Finding 1
- (e) 引用式纪律 ✅(§1.5 主表 + §4 命令单点,本报告全数复跑)

## §6 处置建议(对应 scope §6)

- **无 critical/major → 无需 amend + force push。**
- Deploy 授权路径照 scope §6:`docker compose -f deploy/6host-compose.newvps.yml up -d --force-recreate wrapper-frontend wrapper-orchestrator wrapper-commander wrapper-commander-2`(注意 wrapper-orchestrator/commander 心跳目标已切到 wrapper-frontend:4002,frontend 必须同批 up,否则心跳 404;好在 `.catch` 只记日志、worker 侧下个 tick 重注册,风险可控)。
- Forward scope 不变:v1.2.0n M1 depends_on 并行 + `${step.*.stdout}`;外加本报告 Finding 2/3/4/5 的文档修正(下次 scope 起草时)。

---
**Audit trail:** 全部 §4 命令于 2026-09-16 在 /Users/kjonekong/projects/fish-harness 实跑;tsc/vitest 用 wrapper 本地 bin;git 操作需 `--no-pager`(scope 原命令在 pager 下会挂起,实操注意)。

