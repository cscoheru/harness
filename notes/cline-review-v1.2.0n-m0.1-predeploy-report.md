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

## §7 补充 — scope 文档本体复审(第二轮,2026-09-16)

对 [[cline-audit-scope-v1.2.0n-m0.1-predeploy]] 文档自身的逐节核。总评:**语义层 0 错**(全部技术主张实测为真)、**自检层 1 虚标**、**引用层 8 处坏**、**数据层 ~15 处漂移**——作为指令文档可用,照抄执行会踩 3 个坑(pager / bad revision / 错路径),但不会误判 PASS。

新增 finding(补充 §4 的 F3-F6):

7. **minor** — scope §7(e) — 引用 "§1.5 主表唯一权威源",但本文档**无 §1.5 节**(标题结构为 §1-§8,§1 无子节)。落空锚点,引用式纪律的自证失效。
8. **minor** — scope §8 — 5 个 wikilink(`fish-harness-v1-2-0l-cycle-closure` / `fish-harness-auto-commit-push` / `fish-harness-newvps-kex-workaround` / `fish-harness-newvps-deploy-gotchas` / `codex-manager-project`)在 repo 内**均不可解析**:文件名与 notes/ frontmatter `name:` 全无匹配。若指向外部 memory vault,应显式标注外部位点,否则后续审验者无从追溯。
9. **info** — 引用精度分层统计 — 实测**恰好正确**的引用:heartbeat_sender.ts:81-82(E 项)、compose L150(D 项 orch 卷)、build/orchestrator/pwa_server.js L301(G 项)、build:32(H 项)、server.ts:340-348 行号(对 wrapper/server.ts 而言,C 项——仅路径前缀错);**漂移**的引用:§1 表 4 组行号 + 3 个总行数、§2 A/B/C/F/G/H 共 8 组、§2-K L329→L187/L349;坏引用:server.ts 路径、tag `1.0.0`、§1.5 锚点、5 wikilink。模式:build 产物行号对、源码/测试/compose 行号系统性漂(疑为起草时按旧快照写、commit 后未回填)。

修订建议(scope v1.3 时一并):§1 行数列改 `git show --stat` 实测值;所有 file:line 在 commit 后用 `grep -n` 回填;§3-#7 改 `v1.0.0` 且口径改"本 commit 对 runtime 零改动";§4 git 命令统一加 `--no-pager`;§7(d) 复核 commit message 后再标 ✅;§7(e) 锚点改"§1 主表";§8 标注外部 vault 或改相对链接;收录 F41 host-dedup(worker_pool.ts:277-297)为 D 项决定性缓解。

## §8 收口审验(第三轮,2026-09-16 — cycle closure + v1.3 修订)

**对象**: `34cf5c5`(归档:scope 227 行 + report 87 行 + closure 132 行) + `165364a`(v1.3 修订 +84/-47)+ `notes/v1.2.0n-m0.1-cycle-closure.md`。工作区 clean,tag v1.2.0n.0 仍指 5faffea ✓。

**结论: 收口不通过原样存档 — 1 major 必须修正后归档(notes fix-forward,无需 amend);v1.3 修订 14/16 项正确落地。**

### ✅ 核验通过项
- 4-commit 链全对: 4753149(+10/-1)/ 49b4de7(+66/-17)/ 41fb6d5(+65/-30)/ 5faffea(+356/-2),tag→5faffea9cf… ✓
- baseline 表当前列 ✓(27 files/260/0/147,本轮复跑过); 两 notes commit 均纯 notes、零代码触碰 ✓
- v1.3 修订实测正确: §1 行数 385/205/395、compose L179/180/238/239/287/288/150/332、out-of-scope 改 wrapper/server.ts:324-425、§2A build 行号(35/51/167/228/284 全 grep 吻合)、§2E/F/G/H/I/J/K、§3#7 改 v1.0.0+commit 级口径、§4 统一 --no-pager、§7(e) 锚点、§8 外部 vault 注记(vault 目录实测存在)、§9 修订溯源表 ✓
- closure 流程新铁律(归档→Cline 审验→deploy)方向正确

### ❌ Findings

10. **major** — `closure L99-102` + `scope §7(d)` — **伪引文驳回已证实的 finding**。closure 称 `git log -1 --format=%B 5faffea` 含 "**测试 baseline: 260 PASS / 0 FAIL / 147 SKIP**(之前 254 → +6…)"并据此判 Cline finding 1 "误报 — 不修"。实测 `git cat-file commit 5faffea | grep -cE '260 PASS|测试 baseline|260'` = **0**;tag annotation 0;git notes 0;全链 6 commit 中仅两个 notes commit 含该字样(笔记自身)。**该引文不存在于任何 git 元数据——Finding 1 成立**。且 (d) 行把 ⚠️ 误标到 M0.2 列(Finding 1 针对的是 M0.1/5faffea)。Fix: notes fix-forward——scope §7(d) 改 ❌(v0.5 rule (d) M0.1 未落地,实测数在 §7(b)+report §3 钉死);closure (d) 行 M0.1→⚠️、M0.2 去掉误挂;L102 段替换为 cat-file 实证。
11. **minor** — `scope §2 B` + `§9` — v1.3 新引入: 标 "build:L145-161 / build:L163 res.json"——实测 build `void fetch`@**L135**、`res.json(resultBody)`@**L148**(是把 report 的 source 行号 145-161/163 换前缀,§9 标"实测 grep"不实)。§1 "source:67-181 handler block" 亦偏松(实际 handler 59-168)。Fix: 改 build:L135-148/L148。
12. **minor** — `closure L88` — 复用已证坏的口径 `git diff 1.0.0..HEAD …= 0`(tag `1.0.0` fatal;正确 tag 累计 +392≠0)。Fix: 改 commit 级 `git diff 5faffea^..5faffea --no-pager -- …| wc -l` = 0(同 v1.3 scope §3#7)。
13. **minor** — `closure L29-31` — M0.1 表沿用 v1.3 前旧行号(L42-167、L174-178 等),与归档 scope v1.3 不一致。Fix: 同步 v1.3 行号或删该列引用 scope。
14. **info** — closure Cross-ref 6 个 wikilink 无外部 vault 注记(scope v1.3 已加);deploy 证据(8 容器/workers_count 6/current_worker_id==wrk-d45500f9)远端不可本地复核,内部自洽(6=3 wrappers+edge2/3+3host)✓,按用户实测记录采信。

### 处置
1 major → 修正 closure §(d)/L102 + scope §7(d) + §2B 行号 + closure L88,一个 notes fix-forward commit(如 `fix(notes): v1.2.0n closure audit-trail correction — 5faffea message has no test-count (cat-file verified)`),不动 tag、不 amend。修后 v1.2.0n cycle 收口即可判定 CLOSED。

---
**Audit trail:** 全部 §4 命令于 2026-09-16 在 /Users/kjonekong/projects/fish-harness 实跑;tsc/vitest 用 wrapper 本地 bin;git 操作需 `--no-pager`(scope 原命令在 pager 下会挂起,实操注意)。

