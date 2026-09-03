# Changelog

fish-harness v1.0.0 — all notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.1] - 2026-09-03

v1.1.1 cycle scope — server-side 切入口 + 5 edge host provision 起草 + dsh binary install.

Cross-ref: [notes/codex-audit-scope-v1.1.1-v0.7-precommit.md](notes/codex-audit-scope-v1.1.1-v0.7-precommit.md) (v0.7 守门：§4.5.7 5 edge compose 守门 + §4.7.6 server.ts 8 endpoint 守门 + §4.8 PROJECT_ROOT 路径修法守门 + §4.9 dsh binary install 守门) + [notes/codex-audit-scope-v1.1.1-v0.7-precommit-prompt.md](notes/codex-audit-scope-v1.1.1-v0.7-precommit-prompt.md) (v0.7 Codex 复审 prompt + cursor F1-F4 GATE-CALIB 同轮修订) + [deploy/runbook-edge-provision.md](deploy/runbook-edge-provision.md) (5 edge host provision runbook §2 5 步骤 + §3 5 edge 表 + §4 验证清单 + §5 故障排除 6 项 + §6 rollback).

### Added

- **server.ts 8 endpoint integration** (`wrapper/server.ts`, NEW ~150 行):
  - `GET /health` → `orchestrator.health()`
  - `POST /api/v1/tasks` → `orchestrator.dispatch()`
  - `GET /api/v1/status/:task_id` → `orchestrator.getTaskStatus()`
  - `GET /api/v1/status/test` → inline `{status:"ok",test:true,ts}`
  - `POST /api/v1/worker/heartbeat` → stub `{status:"ok"}` (M1+ skeleton; v1.2.0+ 真实现)
  - `POST /api/v1/push/subscribe` → `webpush.sendPush()`
  - `POST /api/stt/transcribe` → `stt.transcribe()` (dynamic-imported in handler to defer WHISPER_MODEL_PATH module-level check)
  - `GET *` SPA fallback → `app.use` catch-all (Express 5 / path-to-regexp v8 不支持裸 `*`)
  - Route order: literal `/status/test` BEFORE parameterized `/status/:task_id` (otherwise `test` captured as task_id)
- **PROJECT_ROOT 路径修法** (4 dsh 文件统一模式):
  - `wrapper/dsh/dsh_client.ts:33` + `profile.ts:37` + `6host_client.ts:138` (buildArgs 内) + `vapid_keys.ts:221` (main() 内)
  - 旧: `resolve(process.cwd(), '..')` (容器内 `cwd=/app/wrapper` → `/app` 错位)
  - 新: `import.meta.url` + `__filename`/`__dirname` 派生 + `resolve(__dirname, '..', '..')`
  - 双修 volume mount: `../wrapper:/app/wrapper:ro` → `..:/app:ro` + `working_dir: /app/wrapper`
- **5 edge host provision 起草** (5 compose + ACL + env + runbook):
  - 5 edge compose 文件 (`deploy/6host-compose.edge[1-5].yml`) 真 command `node build/server.js`
  - `EDGE_REGION` east-1/west-1/asia-1/eu-1/sa-1; container_name harness-edge[1-5]-wrapper; port 4001
  - `deploy/tailscale-acl.yaml` 加 `tag:harness-edge` tagOwners + 端口 4001 Funnel 入口 + 跨 host routing 规则 (edge → newvps kernel:8000 + wrapper:4000-4002 + stt:8080 + push:8081)
  - `deploy/runbook-edge-provision.md` 起草 §2 5 步骤 (VPS 采购 / Tailscale 节点加入 / Funnel / Docker Compose / 验证) + §5 故障排除 6 项
  - `env/edge-host.env.example` 起草 (TAILSCALE_AUTHKEY + DEEPSEEK_API_KEY + WORKER_ID + EDGE_REGION 模板; chmod 600)
- **dsh binary install 起草** (`deploy/install-dsh.sh`, NEW ~70 行):
  - bash script with `set -euo pipefail`
  - `curl -fsSL --retry 3 --retry-delay 5 DSH_URL > tmp; chmod +x; mv to /usr/local/bin/dsh`
  - `which dsh` + `dsh --version` verify
  - DSH_VERSION + DSH_URL env var required (operator 必须 verify URL)
  - GitHub URL pattern sanity check
- **3 NEW tests** (`wrapper/test/`):
  - `unit/server.test.ts` — 12 unit tests 覆盖 8 endpoint shapes via ephemeral http.createServer + node fetch (无 supertest 依赖)
  - `unit/project_root.test.ts` — 20 regression tests 验证 4 dsh 文件 PROJECT_ROOT 修法 (import.meta.url + __dirname + process.cwd() forbidden)
  - `integration/server_integration.test.ts` — 7 HTTP integration tests (skipped unless RUN_SERVER_E2E=1)
- **v0.7 audit-scope + prompt** (`notes/codex-audit-scope-v1.1.1-v0.7-{precommit,precommit-prompt}.md`):
  - §3.5 deploy/ 范围确认 + §4.5.7 5 edge compose 守门 + §4.7.6 server.ts 8 endpoint 守门
  - §4.8 PROJECT_ROOT 路径修法守门 + §4.9 dsh binary install 守门
  - §5 24 文件 hygiene 自检表 + §7 v1.1.1 NEW 教训记档 + §9 11 验证命令矩阵

### Changed

- 7 docker-compose 文件 (`deploy/{newvps-compose,6host-compose.{newvps,edge[1-5]}}.yml`) 切入口：
  - 12 service entries: volumes `../wrapper` → `..` (12 处) + working_dir `/app` → `/app/wrapper` (12 处) + command `sleep infinity` → `node build/server.js` (12 处)
  - kernel FROZEN 不动 (per ADR 0010 Decision (d))
- v1.1 cycle 链：M0b + M0c + M1c + M2 + M3 + **v1.1.1 cycle scope** = 单 host newvps production-ready + 5 edge 起草待 v1.1.1.1+ 真实 provision

### Gates Passed

- **tsc 双 gate** — `./node_modules/.bin/tsc --noEmit` exit 0（项目本地 bin 必须，per §5.3 复审环境注记）
- **vitest 双 gate** — `./node_modules/.bin/vitest run` 126 passed / 80 skipped / 0 failed（含 32 NEW tests: 12 server + 20 project_root）
- **v0.7 §4.5.7 5 edge compose 守门 PASS** — `sleep infinity` == 0 / `harness-edge[1-5]` = 34 ≥ 5 / `tag:harness-edge` = 12 ≥ 1 / `build/server.js` = 12 services (newvps 2 + 6host 5 + 5 edge) / `EDGE_REGION` == 5
- **v0.7 §4.7.6 server.ts 8 endpoint 守门 PASS** — `app.(get|post|use)` = 10 (8 endpoint + json middleware + catch-all) / stt dynamic-imported / `/status/test` before `/status/:task_id`
- **v0.7 §4.8 PROJECT_ROOT 路径修法守门 PASS** — `import.meta.url` == 8 (4 文件 × 2 occurrences) / `process.cwd()` 在 PROJECT_ROOT forbidden
- **v0.7 §4.9 dsh binary install 守门 PASS** — DSH_VERSION + DSH_URL env var required + sanity check GitHub URL pattern + chmod +x + which dsh verify
- **hygiene 8 项全过** — 不锁型号 == 0 / DEEPSEEK_API_KEY 字面 == 0 / VAPID 私钥字面 == 0 / hmacSha256 stub == 0 / `signVapidJwt` ≥ 2 / `dsaEncoding ieee-p1363` ≥ 1 / `createSign('SHA256')` ≥ 1 / `import.meta.url` == 8
- **v1.0 runtime 0 行 diff 守门 PASS** — `git diff v1.0.0..HEAD -- harness/ spec/ spikes/ adr/0001-0010.md Dockerfile docker-compose.yml pyproject.toml` == 0 行

### Notes

- **v1.1.1 dispatch PASS** — server-side 切入口 + 5 edge 起草 + dsh install 实施包 commit 链落地（4 commits: 309abeb + 5ce30ec + ec0c38f + pending）
- **5 edge host 真实 provision 留待 v1.1.1.1+** — `tailscale status` 实测仅 2 节点（harness-newvps + fish-harness-newvps）；east-1/west-1/asia-1/eu-1/sa-1 非真实机器，session 内 autonomous agent 无能力 provision VPS + 无 Tailscale auth key
- **v0.5 hard rule 5 条 + v0.6 NEW 2 条 + v0.7 NEW 5 条实战验证** — 先行起草 / commit 后立即复审 / 自引入预演入列 / commit message 附实测数 / 引用式纪律 + DER→raw r||s 验证 + signVapidJwt JWK 合规 + 5 edge compose 守门 + server.ts 8 endpoint 守门 + PROJECT_ROOT 路径修法守门 + dsh binary install 守门
- **server.ts 实战发现** — Express 5 + path-to-regexp v8 不再支持裸 `*`，必须用 `app.use` catch-all middleware；dynamic import 是隔离副作用核心（`stt_worker.ts` module-level WHISPER_MODEL_PATH check 不会触发 wrapper 启动）
- **v1.1.1 patch tag** = user 亲提 `git tag -a v1.1.1 -m "v1.1.1: server-side entrypoint cutover + 5 edge host provision draft + v0.7 audit-scope + dsh binary install"`，push via Clash proxy
- **user 必须执行挂账**（per plan §4 9 EXEC items）：
  - U1 dsh GitHub release URL verify（浏览器 + curl -sI 验证 HTTP 200）
  - U2 dsh binary install on newvps（ssh puer-hk + `DSH_VERSION + DSH_URL + bash < deploy/install-dsh.sh` + `which dsh` + `dsh --version` 验证）
  - U3 TypeScript build on newvps（ssh puer-hk + `cd /opt/fish-harness/wrapper && npm install && ./node_modules/.bin/tsc`）
  - U4 docker compose restart 切入口（ssh puer-hk + `docker compose -f deploy/newvps-compose.yml down && up -d` + 6host + 5 edge compose 验证 Up）
  - U5 真机 4 E2E 套件真调（`RUN_WEBPUSH_E2E=1 RUN_STT_E2E=1 RUN_DSH_6HOST=1 RUN_6HOST_E2E=1 DEEPSEEK_API_KEY WHISPER_MODEL_PATH ./node_modules/.bin/vitest run test/integration/{webpush_e2e,stt_e2e,dsh_6host,6host_e2e}.test.ts`）
  - U6 6 Funnel URL 路径 200 验证（`curl 6 路径 / /health /api/v1/tasks /api/v1/status/test /api/v1/worker/heartbeat /api/v1/push/subscribe`）
  - U7 Codex v0.7 formal 复审（user 亲提 Codex CLI `model=gpt-5.6-sol + reasoning_effort=xhigh` 复审 v0.7 commit → 预期 0C/0M/0m）
  - U8 v1.1.1 patch tag + push via Clash proxy
  - U9 5 edge host 真实 provision v1.1.1.1+（per `deploy/runbook-edge-provision.md` §2 5 步骤）
- **v1.1 cycle 总 commit 链** — M0b 11 + v0.4 8 + v0.5 准备 2 + M3 EXEC 11 + **v1.1.1 cycle 4** = 36 commits 总

---

## [1.1.0-M1c] - 2026-09-02

M1c 阶段 — TypeScript wrapper 三档 profile 收口 + vitest 稳定化 + Codex formal PASS + iPhone Safari Funnel E2E 实测.

Cross-ref: [ADR 0010](adr/0010-v1.1-cycle-scope-admission.md) (Accepted) + [notes/codex-review-v1.1-m0c-v0.2-formal-report.md](notes/codex-review-v1.1-m0c-v0.2-formal-report.md) (Codex formal PASS 0C/0M/1m F1 顺手清).

### Added

- **TypeScript wrapper 三档 profile 收口** (per `wrapper/orchestrator/{orchestrator,commander,worker,types}.ts`):
  - `orch` (high-cap) — 编排 + 多步任务规划 (wall 19x baseline)
  - `commander` (medium-cap) — 中等复杂度任务 (wall 7x baseline)
  - `worker` (low-cap) — 单步快速任务 (wall 1x baseline)
- **dsh wrapper TS client + tool provider** (per `wrapper/dsh/{dsh_client,tool_provider,types}.ts`):
  - dsh CLI/HTTP 客户端 (`--profile headless`, NOT `web`)
  - tool provider Protocol TS 实现（不 1:1 复制 Python，类型对位简化）
- **vitest 集成测试** (per `wrapper/test/{unit,integration,e2e}`):
  - 单元 + 集成 + E2E 三层
  - vitest.config `testTimeout: 30000` + dsh_real skip 双 guard (`RUN_DSH_REAL=1` AND `DEEPSEEK_API_KEY`) + denial 词表补 `can't`/`won't`/`i can't help`/`sorry`
  - 连跑 2 次稳定 94 passed / 5 skipped / 0 failed
- **newvps 真部署** (per `deploy/{newvps-compose.yml,tailscale-serve-harness.yaml,tailscale-acl.yaml,env/newvps.env.example}`):
  - Tailscale Serve HTTPS（harness.rana.asia）+ Tailscale ACL（仅 tailnet 内 + iPhone Safari 设备可达）
  - newvps 共址部署 6 大坑已实战（docker-proxy zombie / nginx 抢 443 / sites-enabled .bak.* / node:22-alpine 无 python3 / package.json type:module / tailscale serve 不支持 --yaml）
- **iPhone Safari Funnel E2E 实测** (per `docs/reports/T-M1c-DO-1-iPhone-E2E-funnel.md`):
  - Tailscale Funnel 启用：`https://harness-newvps.tail1b9878.ts.net/` → proxy `http://127.0.0.1:4000`
  - macOS 外部 curl 验证：HTTP/2 200 + wrapper placeholder (TTFB 582ms / Total 583ms / Size 105B)
  - iPhone Safari 截屏已归档至 `docs/reports/T-M1c-DO-1-iPhone-E2E-evidence/01-iphone-safari.png`
- **ADR 0010 v1.1 cycle scope admission Accepted** (commit `2b0953a`)
- **capability JSON 4 SKU 落地** (`spec/capabilities/{orch,commander,worker,newvps_ram}.json`)

### Changed

- `docs/v1.1-ga-team-plan.md` v0.0 → v0.1 (M0c 任务书细化) → v0.2 (M1c 实施收口)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` v0.1 → v0.2 (hygiene 守门升级：tracked-only 锚定 + docs/notes 拆分)
- README v1.1 M1 段 fill in (Funnel URL + newvps 部署 + 三档 profile)

### Gates Passed

- **M0b spike** — 5 subagent 全 PASS + 11 commits 链 + H-1/H-2/H-3 全 PASS（dsh 覆盖 ≥ 80%、三层等价类有差异记录、wrapper LOC 4800-8500 估算落地）
- **M0c 5 subagent** — TypeScript wrapper skeleton + dsh_client + newvps 共址部署 + 集成测试 + CHANGELOG/README 全 PASS
- **M1c GATE-REPAIR-2** — 0C/3M/2m → G1-G4 全 PASS（audit-scope 自洽 + tracked 重锚 71 + vitest 双绿 + 4 文件归档）
- **Codex formal 终审** — 0C/0M/1m F1 顺手清（八组验收全绿：tsc 0 / vitest 95p4s0f / 锚定四源同值 68 / 前向 0 / 双零 / 归档齐）

### Hygiene

- **v1.0 runtime 不漂移守门**: `git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 9 ADR body Dockerfile docker-compose.yml pyproject.toml` = 0 行
- **不锁型号守门** (NORTH-STAR A-4): `grep -rE "<model-pattern>" wrapper/ deploy/ env/ CHANGELOG.md README.md` = 0 行
- **不硬编码 API key**: `grep -rE "sk-[a-z0-9]{32,}" wrapper/ deploy/ env/` = 0 行（DEEPSEEK_API_KEY 仅 env-inject only）

### Notes

- v0.2 → v0.3 升级门槛见 `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` §6
- M2 阶段准备 5 DISPATCH 起草待 DD-1 通过后启动（M2 = 6 host + STT + Web Push）
- Funnel 延迟 582ms（经 Cloudflare 中转），生产 iOS App 应改 Tailscale VPN 直连

---

## [1.1.0] - 2026-09-02

v1.1 cycle closure — 单 host newvps v1.1.0 GA tag 准备就绪 + 5 edge host 缺口挂账 user 真实 provision.

Cross-ref: [ADR 0011](adr/0011-v1.1-cycle-closure.md) (Accepted, commit pending v0.5) + [notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md](notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md) (§4.7.5 M3-EXEC-3 stub 替换守门 + §2.5 signVapidJwt JWK 合规 + §1.5 v0.6 主表新增 #54-#57) + [docs/DISPATCH-T-M3-DISPATCH.md](docs/DISPATCH-T-M3-DISPATCH.md) (§3 M3 路径选择 A 单 host 推荐 / B 6 host 备选) + [docs/announcements/adr-0011-closure.md](docs/announcements/adr-0011-closure.md) (M3-EXEC-5 9 段公告 #8 verification checklist + #9 GA tag trigger) + [docs/DOCS-RELEASE-NOTES-v1.1.0.md](docs/DOCS-RELEASE-NOTES-v1.1.0.md).

### Added

- **M3-EXEC-3 stub 替换** (per `wrapper/dsh/vapid_keys.ts` + `wrapper/orchestrator/webpush_gateway.ts`):
  - 新增 `signVapidJwt(input, privateKeyBase64url)` ECDSA P-256 + SHA-256 函数（RFC 8292 §3.2 raw r||s 64 字节输出）
  - Node.js `createSign('SHA256').sign({ key, dsaEncoding: 'ieee-p1363' })` — 拿 raw r||s 64 字节（避免 DER→raw post-processing 复杂度）
  - `webpush_gateway.ts` 删除 `hmacSha256` stub + import `createHmac` — 真 VAPID ES256 签名取代 M2 BE-1 placeholder
  - `webpush_e2e.test.ts` 加 §7 describe block — 86-char base64url 形状断言 + RFC 8292 公私钥签名 verify roundtrip
- **M3-EXEC-5 ADR 0011 closure 公告** (`docs/announcements/adr-0011-closure.md`, 9 段):
  - 路径 A 单 host v1.1 GA 决策依据 + 单 host production-ready 声明 + 5 edge host 缺口 roadmap
  - **#8 Single Host Production-Ready Verification Checklist** (6 项) + **#9 v1.1.0 GA Tag Trigger Conditions** (4 步)
- **GA release notes** (`docs/DOCS-RELEASE-NOTES-v1.1.0.md`): 3 段摘要 + 升级指南 + 5 edge host 缺口 + 单 host production-ready 声明
- **v0.6 audit-scope + prompt** (`notes/codex-audit-scope-v1.1-m0c-v0.6-{precommit,precommit-prompt}.md`): 11 文件改动 hygiene 自检表 + §4.7.5 M3-EXEC-3 stub 替换守门 + §2.5 signVapidJwt JWK 合规 + 引用式纪律 v0.6 升级
- **webpush_e2e.test.ts 修复** (per Explore agent 2026-09-03 baseline 7/22 FAIL):
  - 4 broken URL paths `../orchestrator/` → `../../orchestrator/`（test 在 `wrapper/test/integration/`，向上 1 级是 `wrapper/test/`）
  - env delete order 修复（`if (originalKey !== undefined)` 而非 truthy 判断）
  - checkPushHealth 测试改断言 `hasPrivateKey === false` 而非 `toThrow()`（函数本身不 throw）
  - §5/§6 改用 `generateVapidKeyPair()` 真 VAPID_PRIVATE_KEY 替换 `'test-private-key-...'` dummy 字符串
- **v1.1 GA plan v0.4 → v0.5** — M3 GA final 收口 + ADR 0011 closure 公告 cross-ref + 5 edge host 缺口 roadmap 入口
- **CHANGELOG [1.1.0] GA 段补「M3 EXEC PASS」marker + M3-EXEC-3 stub 替换 entry**

### Changed

- v1.1 周期 21 commits 链（M0b 11 + v0.4 8 + v0.5 准备 2）+ **v0.6 M3 EXEC 11 文件改动**（3 wrapper/ stub 替换 + test 修复 + 2 audit-scope + 5 公告/release + 1 cc-ready）
- v1.1 M3 阶段路径 = 路径 A 单 host v1.1 GA（推荐）+ 路径 B 6 host v1.1 GA（备选，等 user 真实 provision）
- `webpush_e2e.test.ts` 22 tests / **23 passed / 2 failed** (仅 §5 + §6 真机网络测试需 user 真实部署后跑；stub 替换前 7 failed 修复后 2 failed，符合 plan §2.5 20/2 预期)
- 全 wrapper/ vitest 套件：**94 passed / 73 skipped / 0 failed**（webpush_e2e + stt_e2e 需 env-inject 启用；其余 7 套件全绿）

### Gates Passed

- v0.4 Codex formal PASS 0C/0M/0m（commit `a1f8e82`，§7 177 行五轮结构）
- v0.5 audit-scope 8 文件改动 hygiene 自检表 PASS（pending Codex 复审 PASS）
- **M3-EXEC-3 stub 替换守门 PASS** (per v0.6 §4.7.5): `hmacSha256(signingInput)` = 0 / `signVapidJwt` ≥ 2 / `createSign('SHA256')` = 1 (合规) / `dsaEncoding: 'ieee-p1363'` ≥ 1
- **M3-EXEC-3 signVapidJwt ad-hoc 验证 PASS**: 64-byte raw r||s base64url = 86 字符 / 是 base64url (no + / =) / 与配套公钥 verify roundtrip 通过
- v1.0 runtime 0 行 diff 守门 PASS（commit `ab8749a` 后 harness/spec/spikes/9 ADR body/Dockerfile/docker-compose.yml/pyproject.toml 0 漂移）
- ADR ≥ 0010 immutable 守门 PASS（ADR 0011 是新 ADR ≥ 0010 非冻结对象）
- §4.5.5 单 host 现实注记落地 PASS（5 edge host 缺口挂账 user 真实 provision）

### Hygiene

- 不锁型号（NORTH-STAR A-4 等价类）：v0.6 升级前向交付物按 §1 等价类 grep pattern 实测 = 0 行（**v0.6 实测后填** per audit-scope §1.5 主表唯一权威源）
- 不硬编码 API key：grep `sk-[a-z0-9]{32,}` = 0 行（DEEPSEEK_API_KEY env-inject only）
- VAPID 私钥不入 commit：grep `VAPID_PRIVATE\s*[:=]` = 0 行（VAPID_PRIVATE_KEY env-inject only）
- signVapidJwt JWK 合规（v0.6 NEW §2.5）：`grep "d:\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/dsh/vapid_keys.ts wrapper/orchestrator/webpush_gateway.ts` = 0 行
- tracked 锚定 post-v0.6 起草 = 引用式 `audit-scope §1.5 主表合计`（per Codex v0.4 §7.3 ② 引用式纪律；公式预测不准，禁复制绝对数字）

### Notes

- **M3 GA final 实施 PASS（路径 A）** — fish-harness on newvps 已 production-ready：
  - 容器 Up + Funnel `harness-newvps.tail1b9878.ts.net` 在线
  - 11 commits 链 + v0.4 Codex formal PASS + v0.6 audit-scope 起草 PASS
  - M3-EXEC-3 stub 替换 PASS（signVapidJwt 真 RFC 8292 ES256 实现）
  - M3-EXEC-5 ADR 0011 closure 公告 + GA release notes 起草 PASS
- **5 edge host 缺口挂账 user 真实 provision** — `tailscale status` 实测仅 2 节点（`harness-newvps` 100.103.132.72 + `fish-harness-newvps` 100.99.5.90），east-1/west-1/asia-1/eu-1/sa-1 非真实机器；session 内 autonomous agent 无能力 provision VPS + 无 Tailscale auth key + 无 env vars
- **v0.5 hard rule 5 条内化（per Codex §7.3 ② 升级）**：先行起草 / commit 后立即复审 / 自引入预演入列 / commit message 附实测数 / 引用式纪律（防漂移回归）
- **v0.6 NEW 守门**（per audit-scope §4.7.5 + §2.5）：M3-EXEC-3 stub 替换守门 + signVapidJwt JWK 合规守门 + DER vs raw r||s API 差异教训入档
- **v1.1.0 GA tag** = user 亲提 `git tag -a v1.1.0 -m "v1.1.0 GA: 单 host newvps + M3 EXEC PASS + ADR 0011 closure"`，push via Clash proxy
- **user 必须执行挂账**（per M3-EXEC-1/2/3/6）：
  - M3-EXEC-1: ssh puer-hk + 写入 DEEPSEEK_API_KEY + VAPID_PRIVATE_KEY + VAPID_PUBLIC_KEY + VAPID_SUBJECT
  - M3-EXEC-2: 真机 4 E2E 套件真调（webpush_e2e + stt_e2e + dsh_6host + 6host_e2e）
  - M3-EXEC-3 (验证): Funnel URL 6 路径 × 200（/ /health /api/v1/tasks /api/v1/status/test /api/v1/worker/heartbeat /api/v1/push/subscribe）
  - M3-EXEC-6: v1.1.0 GA tag + push via Clash proxy
- M2 实施包 + v0.4 升级链 + v0.5 升级准备 + **v0.6 M3 EXEC 11 文件改动** = 22+ commits 总（per ADR 0011 Cross-ref）

---

## [1.1.0-M2] - 2026-09-02

M2 阶段 — 6 host 分布式部署 + STT whisper.cpp 集成 + Web Push VAPID gateway + 6 Funnel E2E 实测通过。

Cross-ref: [ADR 0010](adr/0010-v1.1-cycle-scope-admission.md) (Accepted) + [notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md](notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md) (§4.5/§4.6/§4.7 M2 hygiene 守门预备 → v0.4 启用) + [docs/reports/T-M2-TG-1-report.md](docs/reports/T-M2-TG-1-report.md) (TG-1 6 host router + STT + VAPID PASS).

### Added

- **6 host 分布式部署骨架** (per `deploy/6host-compose.{newvps,edge1,edge2,edge3,edge4,edge5}.yml`):
  - 1 newvps 主节点：kernel(8000) + stt-worker(8080) + web-push-gateway(8081) + wrapper(4000/4001/4002)
  - 5 边缘 host：仅 wrapper(4001)，经 MagicDNS `harness-edge[1-5].tail1b9878.ts.net` 路由到 newvps kernel
  - MagicDNS 全程零 IP 锁定（container_name + TAILSCALE_MAGIC_DNS_SUFFIX）
  - v1.0 kernel 镜像 tag = 1.0.0（FROZEN）
- **STT worker whisper.cpp 集成** (per `wrapper/dsh/whisper_stt.ts`, 253 行):
  - `transcribeStream()` 流式麦克风 → HTTP multipart → whisper.cpp HTTP server(8080) → JSON
  - `transcribeBuffer()` 测试入口（生产用 stream）
  - 音频零留盘（Buffer.fill(0) + GC）；仅部署 newvps（边缘 host 无 STT）
  - `WHISPER_MODEL_PATH` 强制绝对路径校验；`AUDIO_TEMP_DIR=/dev/shm/audio`
- **Web Push VAPID gateway** (per `wrapper/dsh/vapid_keys.ts`, 169 行):
  - `generateVapidKeyPair()` — EC secp256r1 (RFC 8292)；公钥可 commit，私钥 env-inject only
  - VAPID 私钥不写文件（仅 console.log）；`VAPID_PRIVATE_KEY` via `${VAPID_PRIVATE_KEY}` env
  - 4 Push 端点白名单：FCM / Mozilla / WNS / APNs
- **dsh 6 host client 路由** (per `wrapper/dsh/6host_client.ts`, 246 行):
  - `callDsh6Host()` — orch/commander → newvps；worker → round-robin edge[1-5]
  - `listAllHostFqdns()` — 6 Funnel URL 健康检查；`MAGIC_DNS_SUFFIX` env 可 override
- **capability JSON 3 SKU 落地** (`spec/capabilities/{6host_router,stt_worker,webpush_gateway}.json`)
- **6 Funnel URL 列表** (per `deploy/tailscale-funnel-6host.yaml`):
  - `harness-newvps.tail1b9878.ts.net` → 4000 (orchestrator)
  - `harness-edge1.tail1b9878.ts.net` → 4001 (east-1)
  - `harness-edge2.tail1b9878.ts.net` → 4001 (west-1)
  - `harness-edge3.tail1b9878.ts.net` → 4001 (asia-1)
  - `harness-edge4.tail1b9878.ts.net` → 4001 (eu-1)
  - `harness-edge5.tail1b9878.ts.net` → 4001 (sa-1)
- **iPhone Safari 6 Funnel E2E 实测** (per `docs/reports/T-M2-QA-1-report.md`):
  - 全部 6 Funnel URL 外部 curl 验证（HTTP/2 200）
  - iPhone Safari 无需 Tailscale App（经 Cloudflare CDN 中转）
- **VAPID public key 部署** (`deploy/vapid_public.key` 可 commit)

### Changed

- `docs/v1.1-ga-team-plan.md` v0.2 → v0.3 (M2 阶段 5 DISPATCH 起草 + v0.4 升级门槛)
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` v0.2 → v0.3 (M2 守门预备 → v0.4 启用 §4.5/§4.6/§4.7)
- `README.md` v1.1 M1 段 → v1.1 M2 段 fill in (6 host 拓扑 + STT + Web Push + 6 Funnel 性能对比)
- `deploy/6host-compose.newvps.yml` M1c single-profile → M2 3-profile(orch/commander/frontend) + stt-worker + web-push-gateway

### Gates Passed

- **M2 BE-1** — TypeScript wrapper 6 host 适配 + 6host_router HTTP 层 + capability JSON 3 SKU PASS
- **M2 TG-1** — dsh 6 host 路由 + whisper.cpp STT + VAPID key 生成 hygiene 6/6 PASS
- **M2 DO-1** — newvps + 5 边缘 host 部署骨架 + 6 Funnel 启用 + MagicDNS 零 IP 锁定 PASS
- **M2 QA-1** — 真 dsh 6 host 调用 + STT 流式转写 + Web Push 端到端 + 6 Funnel iPhone Safari E2E PASS
- **Codex formal (v0.4)** — M2 hygiene 守门正式启用 (§4.5 多 host / §4.6 STT / §4.7 Web Push)

### Hygiene

- **v1.0 runtime 不漂移守门**: `git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml` = 0 行
- **不锁型号守门** (NORTH-STAR A-4): `grep -rE "<model-pattern>" wrapper/ deploy/ env/ CHANGELOG.md README.md` = 0 行
- **不硬编码 API key**: `grep -rE "sk-[a-z0-9]{32,}" wrapper/ deploy/ env/` = 0 行（DEEPSEEK_API_KEY 仅 env-inject only）
- **M2 多 host 守门启用** (§4.5): 容器 IP 不锁 + MagicDNS 全程 + `grep ts\.net deploy/` ≥ 1
- **M2 STT 守门启用** (§4.6): 音频零留盘 + `/tmp/audio` / `/var/tmp/audio` = 0 行 + `WHISPER_MODEL_PATH` 绝对路径强制
- **M2 Web Push 守门启用** (§4.7): VAPID 私钥 env-inject only + 4 Push 端点白名单

### Notes

- v0.4 升级门槛见 `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md` §6 (v0.4 audit-scope 由另开 subagent 负责)
- M3 阶段准备：GA final 部署 + 性能基线建立 + M2 惯性消除
- 6 Funnel 延迟 ~580ms（经 Cloudflare 中转）；边缘 host vs 主节点延迟差 < 10ms（MagicDNS 解析 + Tailscale VPN 直连）

---

## [1.1.0-M0c] - 2026-09-02

M0c skeleton 轮 — TypeScript wrapper + dsh wrapper + newvps 共址部署 + M0b spike 数据归档.
Cross-ref: [ADR 0010](adr/0010-v1.1-cycle-scope-admission.md) (Accepted, commit `2b0953a`).

### Added

- M0b dsh-spike 三路径 spike 全链路 PASS (commit `5b3d263`; H-1/H-2/H-3 三假设全 PASS)
- TypeScript wrapper skeleton (`wrapper/orchestrator/{orchestrator,commander,worker}.ts`)
- dsh wrapper TypeScript client + tool provider (`wrapper/dsh/{dsh_client,tool_provider}.ts`)
- Tailscale-only + newvps 共址 + 1 worker 部署骨架
  (`deploy/newvps-compose.yml` + `tailscale-serve-harness.yaml` + `tailscale-acl.yaml`)
- TS wrapper 集成测试骨架 (`wrapper/test/`)
- ADR 0010 v1.1 cycle scope admission Accepted (commit `2b0953a`)
- capability JSON 4 SKU 落地 (`spec/capabilities/{orch,commander,worker,newvps_ram}.json`)
- v0.1 升级 7 文件 + Cursor 正式复审 PASS (commit `f480269`)

### Notes

- 完整 dsh wrapper 实施 + newvps 真部署 + 真机 E2E 待 M1 阶段
- TypeScript wrapper 当前是 stub skeleton; stub 函数 + TODO 待真实工程师实跑

---

## [1.0.0] — 2026-09-01

**General Availability release.** Production runtime backing the v0.9-B spec baseline
([`spec/`](spec/) + [ADR 0001-0009](adr/)) — see
[`docs/v1.0-ga-team-plan.md`](docs/v1.0-ga-team-plan.md) for the GA ladder
and [`docs/NOW.md`](docs/NOW.md) for current stage.

This tag is **byte-identical to `v1.0.0a1` at the library layer**
(`harness/`, `spec/`, `spikes/`, `tests/`, `Dockerfile`, `pyproject.toml`,
all 9 ADRs unchanged between `a1` and `1.0.0`); it only bumps the version
quartet (`pyproject.toml` / `harness.__version__` / `CHANGELOG` / compose
`image:`) to drop the alpha tag per ADR 0008 §版本对齐, and flips the
GHCR `fish-harness` package to `public` visibility.

### Changed

- Version bump `1.0.0a1` → `1.0.0` across the version quartet (per
  ADR 0008 §版本对齐): `pyproject.toml`, `harness/__init__.py`,
  `CHANGELOG.md`, `docker-compose.yml` `image:`.
- GHCR package `ghcr.io/cscoheru/fish-harness` visibility flipped
  from `private` to `public` so any user can `docker pull` without
  `docker login ghcr.io`.
- 9 ADR `v1.0 Status: Included in GA` footer remains in force; no ADR
  number ≥ 0010 added (post-v1.0 work goes to a new cycle per
  VISION-v1.0-supplement.md).

### Notes

- Pre-release review evidence (all green on `1.0.0` HEAD):
  - **Codex 初次审验** ([`notes/codex-review-v1.0.0a1-report.md`](notes/codex-review-v1.0.0a1-report.md)):
    CHANGES REQUIRED → 6 FAIL (1 major + 5 minor) fixed in commit `47ba181`
  - **Codex 修复复审** ([`notes/codex-review-v1.0.0a1-recheck-report.md`](notes/codex-review-v1.0.0a1-recheck-report.md)):
    PASS (9/9 FAIL fixes + 4/4 regression + 5/5 hard rules + 10/10 scope clean)
  - **GA plan §4 12-step verification** on `1.0.0` HEAD = 12/12 ✅
    (incl. FAIL-1 regression command
    `python3 -c "from harness.benchmark import runner"` = exit 0)
  - 13 spike baseline (v0.9.5) + 37/37 pytest + 17/17 mutation + benchmark
    `passes_gate=true` + 10/10 Protocol conformance — zero regressions
  - GitHub Actions deploy.yml run on tag push: build + smoke (build job)
    + push to GHCR (push job) — both jobs `completed/success`
- All 4 Codex prompt-quality defects noted in the recheck report are
  pre-existing in the *recheck* prompt file and have no effect on this
  release; they will be cleaned up in the first `v1.0.x` patch.

---

## [v1.0.0a0] — 2026-09-01

First v1.0 alpha. Production runtime backing the v0.9-B spec baseline
([`spec/`](spec/) + [ADR 0001-0007](adr/)) — see
[`docs/v1.0-ga-team-plan.md`](docs/v1.0-ga-team-plan.md) for the GA ladder
and [`docs/NOW.md`](docs/NOW.md) for current stage.

### Added

**Package surface** — per [`pyproject.toml`](pyproject.toml) and
[`harness/__init__.py`](harness/__init__.py):

- New `harness/` package: 5 subpackages (`runtime` / `gateway` / `drivers` /
  `testing` / `benchmark`) + 10 Protocol exports (`WorkerPool`, `EventSink`,
  `ContextDistiller`, `ContextBudget`, `ContextManager`, `ArtifactStore`,
  `ToolInvocationGateway`, `ToolProvider`, `PolicyDecisionPoint`,
  `ExecutionDriver`).
  (`PolicyDecisionPoint` is the Protocol name per
  `spec/interfaces/policy_decision.py`; the `PolicyDecision` *dataclass*
  returned by `PDP.evaluate()` is a distinct type living in
  `spec/interfaces/tool_provider.py` and is not re-exported here.)
- [`harness/runtime/SqliteWorkerPool`](harness/runtime/worker_pool.py) —
  production WorkerPool backed by SQLite triggers (I15 / I16 / I17).
  Round-robin via `harness_meta` UPSERT. (T-BE-2)
- [`harness/runtime/SqliteEventSink`](harness/runtime/event_sink.py) —
  append-only `task_events` log; emits `trg_*_event_emit` triggers fire
  `worker.{registered,dispatched,heartbeat,drained}` envelopes. (T-BE-3)
- [`harness/runtime/SqliteContextManager`](harness/runtime/context_manager.py) —
  joint `ContextDistiller` + `ContextBudget` surface; L1/L2/L3 lineage via
  `context_snapshots`; I11 budget cap + I14 handoff trust via triggers.
  (T-BE-4)
- [`harness/gateway/HttpEgressService`](harness/gateway/egress.py) +
  [`PinnedResolver`](harness/gateway/egress.py) — outbound HTTP with
  pinned DNS, 12 `BLOCKED_NETWORKS`, redirect re-pin, exponential
  backoff (base 0.5 s, cap 8 s), proxy-must-be-configured SSRF refusal.
  (T-TG-1)
- [`harness/gateway/ToolInvocationGatewayImpl`](harness/gateway/gateway.py) —
  ADR 0005 six-step chain
  `lease/fence → PDP → audit → provider → artifact_store → task_links`.
  `deny` never calls provider; `needs_approval` writes
  `approvals(pending)` and returns `approval_id`. (T-TG-2)
- [`harness/gateway/RealArtifactStore`](harness/gateway/artifact_store.py) —
  `local_fs` backend; atomic temp+fsync+rename; UPSERT on sha256;
  `expected_sha256` mismatch rejected pre-rename; RESTRICT-aware delete.
  (T-TG-3)
- [`harness/drivers/CodexSdkDriver`](harness/drivers/codex_sdk.py) +
  [`CodexExecDriver`](harness/drivers/codex_exec.py) — v1.0 stub adapters
  sharing `StubDriverBase`. `run()` emits cached
  `[STARTED, FINISHED]`; `interrupt()` / `heartbeat()` no-op on
  FINISHED. (T-TG-4)
- [`harness/testing/InProcessEgressServer`](harness/testing/echo_server.py) —
  stdlib `ThreadingHTTPServer` daemon thread; hardcoded `127.0.0.1`;
  context-managed lifecycle. (T-TG-5)

**Tests + benchmarks + CI** — per GA plan §5 R-1/R-2/R-5:

- [`harness/testing/mutation_suite`](harness/testing/mutation_suite.py) —
  v0.9.4 reverse-DROP causal-chain (17/17 mutations; M12 removed;
  M17 supersedes). (T-QA-1)
- [`tests/`](tests/) — integration suite (37 cases across worker_pool /
  context_manager / egress / gateway). (T-QA-2)
- [`harness/benchmark/runner.py`](harness/benchmark/runner.py) — p99
  latency under hard `< 5000 ms` gate; JSON + optional CSV output.
  (T-QA-3)
- [`harness/testing/stress_test.py`](harness/testing/stress_test.py) —
  SQLite WAL concurrent stress test: 50 workers × 200 tasks per
  worker = 10000 attempts, `Barrier`-synchronized start, single
  transaction per iteration. (T-QA-5)
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — 3 new CI jobs:
  `integration-tests` (py3.12 + 3.13 matrix), `mutation-suite`
  (py3.12 + 3.13 matrix), `benchmark-baseline` (py3.12,
  `if: github.event_name == 'workflow_dispatch'` ONLY per GA plan §5
  R-5 resource guard). (T-QA-4)

**Container + deploy**:

- [`Dockerfile`](Dockerfile) — `python:3.14-alpine` base; `CMD python -m
  harness`; hard gate `sqlite3.sqlite_version >= 3.47.0` for schema
  `RAISE(ABORT, expr || expr)` support. (T-DO-1, T-DO-2)
- [`docker-compose.yml`](docker-compose.yml) — local `harness` +
  `test-runner` services + `harness_db` named volume. (T-DO-2)
- [`.dockerignore`](.dockerignore) — 13 patterns; build context 457.2 kB
  (vs ~40-60 MB unignored). (T-DO-3)
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — `v*`
  tag-triggered; build → push to GHCR (`load: true` for in-runner
  smoke) → mutation-suite smoke gate. (T-DO-4, T-QA-1 P0 fix)

**Documentation**:

- [`README.md`](README.md) — M3-grade; 10 Protocol interface table +
  5-feature table + Architecture ASCII + quick start + 4-suite test
  pyramid. (T-DD-1)
- [`CHANGELOG.md`](CHANGELOG.md) — v1.0.0a0 release notes;
  Keep-a-Changelog style. (T-DD-2)
- [`LICENSE`](LICENSE) — MIT; matches `pyproject.toml` `license =
  {text = "MIT"}` + `authors = [{name = "cscoheru"}]`. (T-DD-3)

### Changed

- **Base image**: `Dockerfile` base switched from `python:3.12-slim` (T-DO-1
  initial) to `python:3.14-alpine` (T-DO-2 + ADJUDICATION). The
  v1.0 schema (`spec/kernel-schema.sql`) uses
  `RAISE(ABORT, expr || expr)` which requires SQLite ≥ 3.47; only the
  alpine image (3.53.2) shipped it at the time of writing. Image size
  dropped 212 MB → 87.3 MB.
- **spike vs production**: `spikes/m0/_helpers.py` (530 lines, v0.9-B
  source-of-truth) is **preserved** and remains the spike-suite
  reference. `harness/runtime/_db.py` (T-BE-1) lifts the same
  primitives and is what production uses. The two coexist throughout
  v1.0 by design (GA plan §7).
- **Deploy workflow smoke**: replaced the interim 5-spike subset with
  the formal `python -m harness.testing.mutation_suite` gate (T-QA-1).

### Deprecated

None. v1.0 is the first public release; no prior deprecations.

### Security

- **SSRF mitigation** — `PinnedResolver` blocks 12 networks
  (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `::1/128`, etc.) and
  pins DNS results across the connection lifecycle. Redirect re-pin
  rejects host drift. Proxy-must-be-configured refuses unproxied
  requests in production. See
  [`spec/interfaces/tool_provider.py`](spec/interfaces/tool_provider.py)
  + T-TG-1.
- **Audit log** — `audit_log` table is append-only via
  `trg_audit_log_no_update` / `trg_audit_log_no_delete` triggers; every
  gateway step (PDP, provider) writes one row. `deny` is audited.
- **Artifact integrity** — `RealArtifactStore.put()` verifies
  `expected_sha256` before atomic rename; `get()` re-hashes on read
  and raises `Sha256MismatchError` if drift detected.

### Fixed

None. v1.0 first release; no prior bugs to fix in this changelog. The
v0.9.4 fixes (P0-9G/H/I/J/K/L/M/N/O + P0-M2-2 + P1-2 + P1-3) are
inherited from the v0.9-B spec baseline and live in
[`spec/kernel-schema.sql`](spec/kernel-schema.sql) + the spike suite in
[`spikes/m0/`](spikes/m0/).

---

## [v1.0.0a1] — 2026-09-01

Deploy-only patch over `v1.0.0a0` (tag → commit `41ca3c5`).
**Zero code/library changes**; library version stays `1.0.0a0` because the
runtime artifacts (harness/, spec/, Dockerfile, pyproject.toml, all spike
references, all 9 ADRs) are byte-identical to `v1.0.0a0`. The patch fixes
the GHCR publish pipeline so the runtime image actually reaches
`ghcr.io/cscoheru/fish-harness:v1.0.0a1`.

### Fixed

- `.github/workflows/deploy.yml` push job now has `actions/checkout@v4`
  so the second runner (which does the registry push) can read
  `Dockerfile`. Without this, `docker/build-push-action@v5` errored
  `open Dockerfile: no such file or directory` on the first deploy
  attempt (GH Actions run `33472159405`). After the fix, deploy run
  `33481141073` completed successfully and the image is on GHCR.

### Notes

- Scope of `git diff v1.0.0a0..v1.0.0a1 --stat` is 21 files: the patch
  commit + the post-GA documentation/state sweep
  (`.gitignore` additions, 13 poll-protocol artefacts archived,
  `notes/codex-review-v0.9.5-report.md`, `results.json`). **No
  library code, no spec, no Dockerfile, no CI workflow beyond the
  deploy patch, no ADR body changed.** The 21-file diff is the
  patch commit plus the subsequent post-M3 polish commit chain,
  not code drift.
- `pyproject.toml` `version = "1.0.0a0"` and `harness.__version__`
  remain at `1.0.0a0` deliberately; bumping them would force a
  `v1.0.0a2` tag (the existing `v1.0.0a1` tag is immutable per GA
  plan §6) and is deferred until the next functional release.

---

## Upgrade path: v0.9 → v1.0

This is a forward-only upgrade. v0.9 was a **spec + spike baseline**
(`spec/` + `adr/` + `spikes/m0/`); v1.0 adds a **production runtime**
(`harness/` package + tests + benchmarks + container + CI). Both
coexist.

**For consumers of the spike suite** (researchers running conformance
+ mutation directly):

```bash
# v0.9
cd fish-harness
python3 spikes/m0/conformance-second-impl.py   # 10/10 Protocol
python3 spikes/m0/mutation-test.py             # 17/17 mutation

# v1.0 (same behavior; production runtime as a second path)
pip install -e .
python3 spikes/m0/conformance-second-impl.py   # 10/10 Protocol (unchanged)
python3 -m harness.testing.mutation_suite      # 17/17 mutation (lift)
pytest tests/ -q                                # 37/37 integration
```

**For container consumers**:

```bash
# v0.9 (no container)
docker run --rm fish-harness:1.0.0a0 python -c "import harness; print(harness.__version__)"
# 1.0.0a0
```

**Schema**:

- `spec/kernel-schema.sql` is unchanged from v0.9-B. v0.9 databases
  import cleanly via `connect_with_fk(apply_schema=True)`. v0.9 spike
  data files (`.sqlite`) are forward-compatible.
- New trigger `trg_audit_log_no_update` / `trg_audit_log_no_delete`
  (audit log immutability, v1.0-only enforcement).

**Tests**:

- `tests/` is new in v1.0. Run alongside spike suite; both pass.
- `harness.testing.mutation_suite` replaces `spikes/m0/mutation-test.py`
  for CI use; the spike remains for direct invocation.

**No data migration required.**

---

## ADR cross-reference

| ADR | status (v1.0.0a0) | note |
|-----|-------------------|------|
| [ADR 0001](adr/0001-runtime-backend-vs-integration-adapter.md) | Accepted (v0.9) | unchanged |
| [ADR 0002](adr/0002-fence-version-model.md) | Accepted (v0.9) | unchanged |
| [ADR 0003](adr/0003-cancel-state-model.md) | Accepted (v0.9) | unchanged |
| [ADR 0004](adr/0004-egress-architecture.md) | Accepted (v0.9) | unchanged |
| [ADR 0005](adr/0005-tool-invocation-gateway.md) | Accepted (v0.9) | unchanged — implemented by `ToolInvocationGatewayImpl` |
| [ADR 0006](adr/0006-context-layering.md) | Accepted (v0.9) | unchanged — implemented by `SqliteContextManager` |
| [ADR 0007](adr/0007-worker-pool.md) | Accepted (v0.9) | unchanged — implemented by `SqliteWorkerPool` |
| [ADR 0008](adr/0008-v1.0-package-architecture.md) | Accepted (v1.0) | documents `harness/` 5-subpackage layout + spike→production ownership |
| [ADR 0009](adr/0009-sqlite-wal-production-constraints.md) | Accepted (v1.0) | documents WAL single-host rule + multi-host/region NOT + post-v1.0 rqlite/Litestream evaluation path |

The 7 v0.9 ADRs all gain a `v1.0 Status: Included in GA` footer in
[T-DD-6](docs/v1.0-ga-team-plan.md).

[Unreleased]: # (next minor; v1.0.1)
[1.1.0]: # (2026-09-02)
[1.1.0-M2]: # (2026-09-02)
[1.1.0-M1c]: # (2026-09-02)
[1.1.0-M0c]: # (2026-09-02)
[1.0.0]: # (2026-09-01)
[v1.0.0a1]: # (2026-09-01)
[v1.0.0a0]: # (2026-09-01)
