# Codex Audit-scope — v1.1.1 v0.7 升级 + server-side 切入口 + 5 edge host provision 起草 hygiene 守门

> **Date**: 2026-09-03
> **Purpose**: v0.7 升级 = v1.1.1 周期收口（24 文件改动：server.ts NEW + PROJECT_ROOT 4 文件修法 + 3 NEW tests + deploy 切入口 7 compose + install-dsh.sh + runbook + env example + ACL + 2 v0.7 audit-scope/prompt + cc-ready + CHANGELOG + README）；v1.1.1 路径 = server-side 切入口（sleep infinity placeholder → server.ts 真实现）+ 5 edge host provision 起草（中期 v1.1.1.1+ 准备）
> **Why**: v0.6 升级 M3 GA final 实施包 PASS hygiene 守门 + §4.7.5 M3-EXEC-3 stub 替换守门 + §2.5 signVapidJwt JWK 合规 + ADR 0011 closure Accepted + v1.1.0 GA tag 准备（commit pending）；v0.7 升级承接 v0.6 hygiene 守门并新增：(1) §4.5.6 NEW 5 edge compose 守门（`sleep infinity` == 0 是 v1.1.1 NEW hygiene 强信号 + `harness-edge[1-5]` ≥ 5 + `tag:harness-edge` ≥ 1）；(2) §4.7.6 NEW server.ts 8 endpoint 守门（app.{get,post,use} ≥ 8）；(3) §4.8 NEW PROJECT_ROOT 路径 bug 修法守门（`import.meta.url` ≥ 4 + `process.cwd` + `'..'` ≤ 4）；(4) §4.9 NEW dsh binary install 守门（`install-dsh.sh` 必含 URL env var + `set -e`）；(5) §5 24 文件 hygiene 自检表（跨 deploy/wrapper/notes/docs/env 五大域）；(6) §7 v1.1.1 NEW 教训记档（volume mount 双修法 + import.meta.url / dsh binary install URL user verify / 5 edge compose 单模板 / v0.7 §1.5 实测前置铁律）
> **How to apply**: v0.7 升级 24 文件改动守门统一引用本 §1-§9；本文件保留字面 grep pattern 用作后续 Codex 复审 hygiene anchor。

---

## §1 不锁型号守门（NORTH-STAR A-4 等价类，继承 v0.6 §1）

```bash
# v0.7 升级前向交付物（CHANGELOG + README + plan v1.1.1 + install-dsh.sh + runbook + env example + 公告 + release notes）不锁型号（实测 == 0）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md deploy/install-dsh.sh deploy/runbook-edge-provision.md env/edge-host.env.example docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md docs/announcements/adr-0011-closure.md | wc -l
# 期望: 0 行（注记 per Codex v0.7 复审 m3：NEW 文件 install-dsh.sh / runbook / env example 实施前 NOT-EXIST，grep 打 3 行 stderr 属预期——wc -l 计数仍 == 0 不受影响）

# 历史文档豁免口径锚定（tracked 重锚 post-v0.7，引用式）：
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == audit-scope §1.5 主表合计（唯一权威源；v0.7 实测 = **117 / 49 文件**；演进链 91→97→101→103→107→114→117→117；禁公式预测，以实测为准）

# 历史文档豁免口径锚定（disk 口径 == tracked + 本 audit-scope 自伤）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1.1-v0.7-precommit.md | wc -l
# 期望: == audit-scope §1.5 主表 disk 行（v0.7 实测 = **126** = tracked 117 + 本文件自伤实测 9；三源同值）
# 口径注记 per Codex v0.7 复审 m4：disk 自伤源随周期切换（v0.6 盘 124 只含 v0.6 文件自伤 7；v0.7 盘 126 只含 v0.7 文件自伤 9）——「换源不累加」机制，v0.6 归档文件仍在盘但不再计入，防 disk 无限膨胀

# notes/ 范围自伤豁免（本文件含 grep pattern 字面）：
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" notes/codex-audit-scope-v1.1.1-v0.7-precommit.md | wc -l
# 期望: == 9 实测（起草预估 ≥8 系 over，按实测校准）

# wrapper/ stub 替换 守门（v0.7 继承 v0.6 §1.4 + §4.7.5）：
grep -c "dsaEncoding: 'ieee-p1363'" wrapper/dsh/vapid_keys.ts  # ≥ 1（实测 2）
grep -ciE "asn1|der\b" wrapper/dsh/vapid_keys.ts  # == 2（实测：JWK/SPKI 编码说明 + 「instead of DER」防 DER 正向注释）
grep -c "signVapidJwt" wrapper/dsh/vapid_keys.ts  # ≥ 1（export function；实测 3）
```

**含义**：v1.1.1 周期模型决策遵守 NORTH-STAR A-4 等价类约束；v0.7 升级前向交付物均不含具体型号字面；install-dsh.sh + runbook + env example 走 §1.5 自伤豁免（与 ADR 0001-0011 同口径）。

### §1.5 历史文档豁免清单（tracked 重锚 v0.7 实测后 = 引用式本节；本主表 = 锚定唯一权威源，prompt/报告一律引用不复制数字）

继承 v0.6 §1.5 docs 主表 49 文件 117 行 + notes 自伤小节 2 文件；v0.7 升级范围（CHANGELOG + README + plan v1.1.1 + install-dsh.sh + runbook + env example + 2 v0.7 audit-scope/prompt + 24 文件主改动）= **tracked 终态 117 / 49 文件（v0.7 实测）+ disk v0.7 实测 = 126（= tracked 117 + 本文件自伤实测 9）三源同值**。

**v0.7 升级范围**（24 文件）：

| # | 文件 | 操作 | docs/ 命中增量 | 自伤豁免 |
|---|------|------|----------------|----------|
| 1 | `wrapper/server.ts` | **NEW** ~130 行（8 endpoint integration：GET /health + POST /api/v1/tasks + GET /api/v1/status/:task_id + GET /api/v1/status/test + POST /api/v1/worker/heartbeat + POST /api/v1/push/subscribe + POST /api/stt/transcribe + GET * SPA fallback）| 0 | wrapper/ 不入主合同 |
| 2 | `wrapper/dsh/dsh_client.ts` L33 | Edit（PROJECT_ROOT 修法：`process.cwd() + '..'` → `import.meta.url` 解析 `__dirname` + `../..`）| 0 | wrapper/ 不入主合同 |
| 3 | `wrapper/dsh/profile.ts` L37 | Edit（同上 #2）| 0 | wrapper/ 不入主合同 |
| 4 | `wrapper/dsh/6host_client.ts` L138 | Edit（同上 #2，函数内 `projectRoot` 局部变量）| 0 | wrapper/ 不入主合同 |
| 5 | `wrapper/dsh/vapid_keys.ts` L221 | Edit（同上 #2，main() 内 `projectRoot`）| 0 | wrapper/ 不入主合同 |
| 6 | `wrapper/test/unit/server.test.ts` | **NEW** ~90 行（unit test 覆盖 8 endpoint shape）| 0 | wrapper/ 不入主合同 |
| 7 | `wrapper/test/unit/project_root.test.ts` | **NEW** ~55 行（验证 4 文件 PROJECT_ROOT 解析正确）| 0 | wrapper/ 不入主合同 |
| 8 | `wrapper/test/integration/server_integration.test.ts` | **NEW** ~70 行（HTTP integration）| 0 | wrapper/ 不入主合同 |
| 9 | `deploy/newvps-compose.yml` | Edit（volumes `../wrapper` → `..`；working_dir `/app` → `/app/wrapper`；command `sleep infinity` → `node build/server.js`）| 0 | deploy/ 不入主合同 |
| 10 | `deploy/6host-compose.newvps.yml` | Edit（6 services 同切入口：stt-worker + web-push-gateway + wrapper-orchestrator + wrapper-commander + wrapper-frontend；kernel FROZEN 不动）| 0 | deploy/ 不入主合同 |
| 11 | `deploy/6host-compose.edge1.yml` | Edit（EDGE_REGION=east-1 + 真 command + HARNESS_API_URL=http://harness-newvps.tail1b9878.ts.net:8000）| 0 | deploy/ 不入主合同 |
| 12 | `deploy/6host-compose.edge2.yml` | Edit（EDGE_REGION=west-1）| 0 | deploy/ 不入主合同 |
| 13 | `deploy/6host-compose.edge3.yml` | Edit（EDGE_REGION=asia-1）| 0 | deploy/ 不入主合同 |
| 14 | `deploy/6host-compose.edge4.yml` | Edit（EDGE_REGION=eu-1）| 0 | deploy/ 不入主合同 |
| 15 | `deploy/6host-compose.edge5.yml` | Edit（EDGE_REGION=sa-1）| 0 | deploy/ 不入主合同 |
| 16 | `deploy/install-dsh.sh` | **NEW** ~35 行（curl 下载 dsh binary + chmod +x + version verify；URL 由 env var 注入）| 0 | deploy/ 不入主合同 |
| 17 | `env/edge-host.env.example` | **NEW** ~30 行（TAILSCALE_AUTHKEY + DEEPSEEK_API_KEY + VAPID_PRIVATE_KEY env var 模板）| 0 | env/ 不入主合同 |
| 18 | `deploy/tailscale-acl.yaml` | Edit（加 `tag:harness-edge` tagOwners + 端口 4001-4005 Funnel 入口 + 跨 host routing 规则）| 0 | deploy/ 不入主合同 |
| 19 | `deploy/runbook-edge-provision.md` | **NEW** ~180 行（5 步骤 + 5 edge host per-host 小节 + Funnel 配置 + env vars 填入 + 验证 + 故障排除）| 0 | deploy/ 不入主合同 |
| 20 | `notes/codex-audit-scope-v1.1.1-v0.7-precommit.md` | **NEW**（本文件）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 21 | `notes/codex-audit-scope-v1.1.1-v0.7-precommit-prompt.md` | **NEW**（配套 Codex 复审 prompt）| 0（notes/ 不入 tracked；自伤豁免）| notes/ 不入主合同 |
| 22 | `docs/poll/cc-ready.json` | Edit（task_id `T-M3-EXEC-PASS` → `T-V1.1.1-DISPATCH-PASS`；status 翻牌；files_modified 含 v1.1.1 24 文件）| 0 | docs/ 入主合同（实测 = 0）|
| 23 | `CHANGELOG.md` | Edit（[1.1.1] patch 段新增；含 v1.1.1 dispatch PASS marker + 5 edge 起草 + v0.7 audit-scope + dsh binary install + server.ts 新建）| 0 | grep 字面 0 行 |
| 24 | `README.md` | Edit（v1.1.1 status 段补；含 server-side 切入口 + 5 edge 起草 + user 必须执行清单）| 0 | grep 字面 0 行 |

**docs 主表**（继承 v0.6 §1.5 #1-#55 49 文件 117 行；v0.7 docs 增量实测 **0**（CHANGELOG + README + cc-ready 0；wrapper 8 文件不入 §1 命令范围；deploy/env 12 文件不入 §1 命令范围；2 v0.7 audit-scope 自伤豁免）= **tracked 终态 117 / 49 文件 + disk v0.7 实测 = 126（tracked 117 + 本文件自伤实测 9）/ 50 文件 disk，实测三源同值**；演进链 91→97→101→103→107→114→117→117，公式预测已废弃（per Codex v0.6 复审裁定，原公式预测值系 Plan agent 范围误算噪音，已删）。

**v0.7 实测公式**（post-Commit 1-4 实测落地，引用式唯一权威源）：

```bash
# tracked 验收命令（git add 所有 v0.7 文件后）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# v0.7 实测: 117 / 49 文件（Codex v0.7 终审后维持）

# disk 验收命令
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1.1-v0.7-precommit.md | wc -l
# v0.7 实测: 126（= tracked 117 + 本文件自伤实测 9；Codex v0.7 终审后维持）
```

**v0.7 主表新增条目**（v0.7 实测 = 117 tracked / 126 disk / 自伤 9 行）：
- 🆕 v0.7 audit-scope 自伤实测行数（notes/ 自伤豁免不入 tracked + 仅本文件计入 disk）
- v0.7 24 文件改动中 wrapper/deploy/env/notes 22 文件均不入 tracked + CHANGELOG/README 实测 = 0 + cc-ready 实测 = 0 → tracked 维持 117

**豁免口径不变**（per M0b plan §3 L89 C2 裁定 + v0.5 §1.5 末段 + v0.6 §1.5 末段）：**不清洗历史文档**（考古记录 + git 尾注 + DISPATCH §2/§4 验证命令字面均保留）。

## §2 不硬编码 API key 守门（GH013 PUSH PROTECTION 教训，继承 v0.6 §2 + v0.7 §2.6 install-dsh.sh 强化）

```bash
# v0.7 升级前向交付物（不含 notes/）不含完整 DEEPSEEK_API_KEY：
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md deploy/install-dsh.sh deploy/runbook-edge-provision.md env/edge-host.env.example docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md docs/announcements/adr-0011-closure.md | wc -l
# 期望: 0 行

# 仅 env-inject only 占位（合规）：
grep -rE "env-inject only|env:[A-Z_]+|process\.env\.[A-Z_]+|\\\$\{?[A-Z_]+\}?" deploy/install-dsh.sh deploy/runbook-edge-provision.md env/edge-host.env.example CHANGELOG.md README.md docs/v1.1-ga-team-plan.md | wc -l
# 期望: ≥ 6（install-dsh.sh + runbook + env example + CHANGELOG + README + plan 各含 env-inject 字样）

# VAPID 私钥守门（继承 v0.6 §2 + §4.7）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md docs/announcements/adr-0011-closure.md | wc -l
# 期望: 0 行（VAPID 私钥仅 env-inject）

# signVapidJwt 内部 JWK 处理守门（继承 v0.6 §2.5 — 不硬编码 d 参数）：
grep -E "d:\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/dsh/vapid_keys.ts wrapper/orchestrator/webpush_gateway.ts wrapper/server.ts | wc -l  # == 0

# Tailscale auth key 守门（v0.7 NEW §2.6 — 不硬编码 tskey）：
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" CHANGELOG.md README.md deploy/install-dsh.sh deploy/runbook-edge-provision.md env/edge-host.env.example | wc -l
# 期望: 0 行（Tailscale auth key 仅 env-inject；user 持有）
```

**含义**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 等敏感 key 仅通过环境变量 + inline prefix on dsh/REST commands 注入；v0.7 §2.6 新增 Tailscale auth key 守门（install-dsh.sh + runbook + env example 必须 env-inject only）。

## §3 v1.0 runtime 0 行 diff 守门（ADR 0010 Decision (d)，继承 v0.6 §3 + v0.7 §3.5 deploy/ 扩展确认）

```bash
# v0.7 升级不动 v1.0 runtime 区域（commit v1.0.0 tag 后 0 漂移）：
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行
# v0.7 GATE-CALIB（per Codex v0.7 复审 F1）：去掉 v0.6 版误纳的 `'adr/0010-*.md'`——ADR 0010 系 v1.1 周期 NEW 文件（`2b0953a`），不入 v1.0 immutable 范围（v0.6 §3 注记「ADR 0010/0011 是 v1.1+ 新增不入此检查」与命令 glob 自相矛盾 → v0.6 报告 §3「== 0」系假绿未暴露，实测 0010 diff +95 行）；修正版实测 == 0 ✓

# v1.0 GA plan + 9 ADR body 不动（v1.0 runtime 9 ADR immutable per T-DD-6）：
git diff v1.0.0..HEAD -- docs/v1.0-ga-team-plan.md 'adr/000[1-9]-*.md' | wc -l
# 期望: 0 行

# ADR 0011 closure 合规（继承 v0.6 §3.3）：
grep -c "Status=" adr/0011-v1.1-cycle-closure.md
# 期望: ≥ 1（Status=Accepted）

# v1.0 runtime deploy/ 范围确认（v0.7 NEW §3.5 — deploy/ 不在 v1.0 runtime 内）：
ls -la deploy/ 2>/dev/null
# 期望: deploy/ 目录存在（M2 实施包 9 文件 + v0.7 升级 11 文件），但不在 §3 第一条 diff 范围（per ADR 0010 Decision (d) v1.0 runtime = harness/spec/spikes/9 ADR body/ADR 0010/Dockerfile/docker-compose.yml/pyproject.toml）

# wrapper/ v1.0 影响守门（继承 v0.6 §3.4）：
git diff v1.0.0..HEAD -- wrapper/ | wc -l  # v0.6 = +5010c27 实施包 6 文件 + 277cdf8 GATE-REPAIR-2 + M3-EXEC-3 3 文件 = 增量实测；v0.7 + wrapper/server.ts NEW + 4 dsh PROJECT_ROOT 修法 + 3 NEW tests = +8 文件增量
```

**含义**：v0.7 升级 wrapper/ server.ts 新建 + 4 dsh PROJECT_ROOT 修法 + 3 NEW tests（8 文件）+ deploy/ 切入口（11 文件）+ notes/ 2 v0.7 audit-scope/prompt + docs/ 3 cc-ready + CHANGELOG + README = 24 文件；不触及 harness/spec/spikes/9 ADR body/ADR 0010/Dockerfile/docker-compose.yml/pyproject.toml/v1.0 GA plan。

## §4 dsh `headless` profile 守门（M1c TG-1 + M2 BE-1 预备，继承 v0.6 §4）

```bash
# M1c wrapper 实调 dsh 必须用 headless profile（per M0b QA-1 §6.X 修订）：
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# 期望: 0 行（M0c skeleton 已用 headless；M1c 严禁 web profile）

# 期望出现 headless profile（M0c skeleton + M1c 实施 + v0.7 server.ts 集成）：
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# 期望: ≥ 3（v0.7 GATE-CALIB per Codex 复审 F2：起草实测 19 = 源码 5（dsh_client/6host_client/whisper_stt/6host_router 注释）+ test 14；v0.6 版 `--profileheadless` 无空格 typo 实测 1 必红，已修空格版）
```

## §4.5 M2 多 host 守门正式启用（多 host 拓扑漂移风险；v0.6 §4.5 继承 + §4.5.6 单 host 现实注记继承 + v0.7 §4.5.7 5 edge compose 起草守门 NEW）

```bash
# M2 6 host 拓扑：1 newvps 主 + 5 边缘 host（east-1/west-1/asia-1/eu-1/sa-1）
# 容器 IP 不锁守门（继承 v0.4 §4.5 GATE-CALIB 校准：命令范围排除 node_modules）：
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md docs/announcements/adr-0011-closure.md | grep -v "127.0.0.1" | wc -l
# 期望: 0 行

# Tailscale MagicDNS 域名使用守门（继承 v0.4 §4.5）：
grep -rE "ts\.net" deploy/ docs/announcements/adr-0011-closure.md | wc -l
# 期望: ≥ 6（newvps + 5 edge host MagicDNS 名）

# 边缘 host 健康端点 + Funnel URL（继承 v0.5 §4.5 H5 pattern fix）：
grep -rE "https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/" docs/ deploy/ | wc -l
# 期望: ≥ 6（newvps + 5 edge host Funnel URL）

# 5 edge compose 起草守门（v0.7 NEW §4.5.7）：
grep -rE "sleep infinity" deploy/ | wc -l
# 期望: 0 行（v0.7 后所有 deploy/ sleep infinity placeholder 已替换为真 server.ts 启动命令；v0.7 周期最显眼的 hygiene 强信号）

grep -rE "harness-edge[1-5]" deploy/ | wc -l
# 期望: ≥ 5（5 edge compose 各含 EDGE_REGION + container_name + port）

grep -rE "tag:harness-edge" deploy/tailscale-acl.yaml | wc -l
# 期望: ≥ 1（ACL 扩展 tag:harness-edge tagOwners）

grep -c "EDGE_REGION" deploy/6host-compose.edge[1-5].yml 2>/dev/null | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 5（5 edge compose 各含 EDGE_REGION env var 1 处；v0.7 formal 实测 5。GATE-CALIB 演进：起草实测 10 = env 1 + echo placeholder 字样 1/文件——echo 随 `sleep infinity` placeholder 同步删除（§4.5.7 第一条 == 0 的同一改动），期望按实施实况校准 ≥ 5；awk 真命中合计语义不变 per F4）

grep -c "build/server.js" deploy/*.yml 2>/dev/null | awk -F: '{s+=$NF} END{print s}'
# 期望: ≥ 8（newvps 2 + 6host 6 + edge 5 = 13 services 至少 8 切入口；起草实测 0 待实施。同 F4 校准：原 `| wc -l` 数 yml 文件数（共 7 文件）与命中无关——实施后必假红，已改 awk 真命中合计）

# volumes mount 双修法守门（v0.7 NEW per Codex 复审 F3 补——§7-1 教训宣称的机制条款此前无命令落地）：
grep -rn -- "- ../wrapper:/app/wrapper" deploy/*.yml | wc -l
# 期望: == 0（12 services 旧 wrapper-only 挂载全替换；起草实测 12 全待改）

grep -rn -- "- ..:/app:ro" deploy/*.yml | wc -l
# 期望: ≥ 12（项目根只读挂载切入口；起草实测 0。12 services：newvps 2 + 6host 6 + edge 5 共 13 services 其中 12 含 wrapper volume——实施后以实测校准 12/13 口径）
```

**含义**：v0.7 §4.5.7 NEW 5 edge compose 起草守门 — `sleep infinity` == 0 是 v1.1.1 周期最显眼的 hygiene 强信号（plan §4.5.7 v1.1.1 NEW 守门），意味着所有 placeholder 已替换为真 server.ts 启动命令。

## §4.6 M2 STT 守门正式启用（音频隐私；v0.6 §4.6 继承）

```bash
# M2 STT 录音不留盘守门（继承 v0.6 §4.6）：
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ env/ | wc -l
# 期望: 0 行

# 临时缓存目录路径合规守门（继承 v0.6 §4.6 GATE-CALIB 校准）：
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
# 期望: 0 行

# Whisper 模型缓存目录合规守门（继承 v0.6 §4.6 GATE-CALIB）：
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l
# 期望: 0 行
```

## §4.7 M2 Web Push 守门正式启用（VAPID key 泄漏；v0.6 §4.7 继承 + v0.7 §4.7.6 server.ts 集成强化）

```bash
# VAPID 私钥不入 commit 守门（继承 v0.6 §4.7 + §2）：
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l
# 期望: 0 行

# VAPID 公钥 env-inject-only 合规（继承 v0.6 §4.7 GATE-CALIB）：
grep -rE "vapid_public_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PUBLIC\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" deploy/ env/ | wc -l
# 期望: == 0（白名单：公钥裸文件 `deploy/vapid_public.key` 仍入库 — per v0.6 §4.7 GATE-CALIB）

# Web Push 端点合规守门（继承 v0.6 §4.7）：
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ | wc -l
# 期望: ≥ 4（FCM + Mozilla + WNS + APNs 四大白名单）

# M3-EXEC-3 stub 替换守门（继承 v0.6 §4.7.5）：
grep -rE "hmacSha256\s*\(\s*signingInput" wrapper/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -rE "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1
grep -rE "dsaEncoding\s*:\s*['\"]ieee-p1363['\"]" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1

# server.ts 8 endpoint 守门（v0.7 NEW §4.7.6；v0.7 formal GATE-CALIB：SPA fallback 实施为 `app.use((_req, res) =>` 无路径兜底——Express 5 path-to-regexp v8 拒绝 `app.get('*')`（server.ts L168 注释已记），pattern 补 use-无路径分支）：
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)|app\.use\(\s*\(\s*_req" wrapper/server.ts
# 期望: ≥ 8（8 endpoint integration: GET /health + POST /api/v1/tasks + GET /api/v1/status/:task_id + GET /api/v1/status/test + POST /api/v1/worker/heartbeat + POST /api/v1/push/subscribe + POST /api/stt/transcribe + use-无路径 SPA fallback；v0.7 formal 实测 8 = 具名 7 + fallback 1）
```

**含义**：v0.7 §4.7.6 NEW server.ts 8 endpoint 守门 — app.{get,post,use} 必须 ≥ 8 处，验证 server.ts 真整合 8 endpoint 而非 stub placeholder。

## §4.8 PROJECT_ROOT 路径 bug 修法守门（v0.7 NEW — volume mount + 代码双修）

```bash
# PROJECT_ROOT import.meta.url 修法 4 文件守门（v0.7 NEW）：
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l
# 期望: ≥ 4（4 文件 PROJECT_ROOT 修法统一模式：fileURLToPath + dirname + resolve）

# 原 process.cwd() + '..' 残留守门（v0.7 NEW — 4 文件 PROJECT_ROOT 必须全替换）：
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/*.ts | wc -l
# 期望: == 0（所有 4 文件已替换为 import.meta.url 模式）

# 函数内 process.cwd() + '..' 局部变量残留守门（v0.7 NEW）：
grep -E "projectRoot\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l
# 期望: == 0（6host_client.ts:138 + vapid_keys.ts:221 函数内 projectRoot 局部变量已替换）
```

**含义**：v0.7 §4.8 NEW PROJECT_ROOT 路径 bug 修法守门 — volume mount 改法（`..:/app:ro`）+ 代码 4 文件 import.meta.url 模式必须同步落地；残留 `process.cwd() + '..'` 必须 == 0。

## §4.9 dsh binary install 守门（v0.7 NEW — install-dsh.sh + URL env var 强校验；**v0.7 formal GATE-CALIB per D-1/D-2/D-3 deviation（`838c2be`/`77f366b`）：官方分发渠道实为 npm 包 `@deepseek-ai/dsh`（bin: dsh），binary 下载 + DSH_URL/chmod 语义自然消失，守门按 npm 版校准**）

```bash
# install-dsh.sh 脚本必含 npm 版三核心守卫（v0.7 formal 校准）：
test -f deploy/install-dsh.sh
grep -cF 'DSH_VERSION:-' deploy/install-dsh.sh
# 期望: ≥ 1（DSH_VERSION env var 默认空声明，后接空值守卫；formal 实测 1。注：用 -F 字面匹配——ERE 版 `$`/`[`/`{` 元字符须逐个转义，字面版免坑）
grep -cF 'if [[ -z "${DSH_VERSION}" ]]' deploy/install-dsh.sh
# 期望: ≥ 1（空值守卫 fail-fast；formal 实测 1）
grep -c "set -euo pipefail" deploy/install-dsh.sh
# 期望: ≥ 1（fail-fast：未定义变量/管道错即退；formal 实测 1——涵盖起草版 set -e 语义）
grep -c "npm install -g @deepseek-ai/dsh@" deploy/install-dsh.sh
# 期望: ≥ 1（版本 pin 精确安装，禁 @latest 漂移；formal 实测 1）

# install-dsh.sh 不含硬编码下载 URL（维持，双渠道皆禁）：
grep -E "https://github\.com/.*dsh.*releases/download" deploy/install-dsh.sh | wc -l
# 期望: == 0（GitHub release URL 不硬编码；npm 渠道同理无 URL 硬编码——registry 由 npm config 管）
grep -cE "dsh@latest|@deepseek-ai/dsh@latest" deploy/install-dsh.sh
# 期望: == 0（禁 latest 漂移；formal 实测 0）

# dsh version 锁定守门（维持）：
grep -E "DSH_VERSION=" deploy/install-dsh.sh | wc -l
# 期望: ≥ 1（version 锁定到具体 npm tag（如 0.1.2-rc.1，match GitHub release tag）；formal 实测 2）
```

**含义**：v0.7 §4.9 dsh install 守门（npm 版）— install-dsh.sh 必须 fail-fast（set -euo pipefail）+ DSH_VERSION 强校验 + `npm install -g @deepseek-ai/dsh@<exact>` 版本 pin + 禁 @latest + 无 URL 硬编码；user 必须 `npm view @deepseek-ai/dsh versions` verify 版本后注入 DSH_VERSION 亲跑（U1/U2）。起草版 DSH_URL binary 路径经 D-1/D-2/D-3 deviation 转npm 渠道（deviation 记录 `838c2be`），守门同步校准——**实施 deviation 回写守门合同**（v0.5 disk 口径同型教训：口径首用即裂须同轮收口）。

## §5 v0.7 升级 24 文件 hygiene 自检表

| # | 文件 | 含字面 grep pattern? | 引用本 audit-scope? | 自伤豁免 |
|---|------|----------------------|---------------------|----------|
| 1 | `wrapper/server.ts` (NEW) | 无 | 无（8 endpoint 整合）| ✅ wrapper/ 不入主合同 |
| 2 | `wrapper/dsh/dsh_client.ts` | 无 | 无（PROJECT_ROOT 修法 = import.meta.url）| ✅ wrapper/ 不入主合同 |
| 3 | `wrapper/dsh/profile.ts` | 无 | 无（同上 #2）| ✅ wrapper/ 不入主合同 |
| 4 | `wrapper/dsh/6host_client.ts` | 无 | 无（同上 #2，函数内 projectRoot）| ✅ wrapper/ 不入主合同 |
| 5 | `wrapper/dsh/vapid_keys.ts` | 无 | 无（同上 #2，main() 内 projectRoot）| ✅ wrapper/ 不入主合同 |
| 6 | `wrapper/test/unit/server.test.ts` (NEW) | 无 | 无（unit test 覆盖 8 endpoint）| ✅ wrapper/ 不入主合同 |
| 7 | `wrapper/test/unit/project_root.test.ts` (NEW) | 无 | 无（PROJECT_ROOT 路径回归测试）| ✅ wrapper/ 不入主合同 |
| 8 | `wrapper/test/integration/server_integration.test.ts` (NEW) | 无 | 无（HTTP integration）| ✅ wrapper/ 不入主合同 |
| 9 | `deploy/newvps-compose.yml` | 无 | 无（volume + working_dir + command 切入口）| ✅ deploy/ 不入主合同 |
| 10 | `deploy/6host-compose.newvps.yml` | 无 | 无（6 services 同切入口）| ✅ deploy/ 不入主合同 |
| 11 | `deploy/6host-compose.edge1.yml` | 无 | 无（EDGE_REGION=east-1）| ✅ deploy/ 不入主合同 |
| 12 | `deploy/6host-compose.edge2.yml` | 无 | 无（EDGE_REGION=west-1）| ✅ deploy/ 不入主合同 |
| 13 | `deploy/6host-compose.edge3.yml` | 无 | 无（EDGE_REGION=asia-1）| ✅ deploy/ 不入主合同 |
| 14 | `deploy/6host-compose.edge4.yml` | 无 | 无（EDGE_REGION=eu-1）| ✅ deploy/ 不入主合同 |
| 15 | `deploy/6host-compose.edge5.yml` | 无 | 无（EDGE_REGION=sa-1）| ✅ deploy/ 不入主合同 |
| 16 | `deploy/install-dsh.sh` (NEW) | 无 | §2.6 / §4.9 引用 | ✅ deploy/ 不入主合同 |
| 17 | `env/edge-host.env.example` (NEW) | 无 | §2 / §4.9 引用 | ✅ env/ 不入主合同 |
| 18 | `deploy/tailscale-acl.yaml` | 无 | §4.5.7 引用 | ✅ deploy/ 不入主合同 |
| 19 | `deploy/runbook-edge-provision.md` (NEW) | 无 | §4.5.7 引用 | ✅ deploy/ 不入主合同 |
| 20 | `notes/codex-audit-scope-v1.1.1-v0.7-precommit.md` (NEW 本文件) | 含字面（自伤豁免）| 本文件 | ✅ notes/ 不入主合同 |
| 21 | `notes/codex-audit-scope-v1.1.1-v0.7-precommit-prompt.md` (NEW 配套 prompt) | 含字面（自伤豁免）| §1.5 引用 | ✅ notes/ 不入主合同 |
| 22 | `docs/poll/cc-ready.json` | 无 | 无（task_id 翻牌 T-V1.1.1-DISPATCH-PASS）| ✅ |
| 23 | `CHANGELOG.md` | 无 | 无（[1.1.1] patch 段新增）| ✅ |
| 24 | `README.md` | 无 | 无（v1.1.1 status 段补）| ✅ |

**v0.7 升级总改动：24 文件**（5 wrapper/ 代码 + 3 wrapper/ tests + 7 deploy/ compose + 1 deploy/ ACL + 1 deploy/ install-dsh.sh + 1 env/ edge-host.env.example + 1 deploy/ runbook + 2 notes/ v0.7 audit-scope/prompt + 3 docs/ cc-ready + CHANGELOG + README）。

**v0.7 升级前向交付物** = 8 文件（CHANGELOG + README + 7 deploy/env 文件）；**audit-scope + prompt** = 2 文件（留 notes/ 归档）；**cc-ready.json** = 1 文件翻牌；**wrapper/** = 8 文件代码改动（不入主合同）。

## §6 后续 Codex 复审预期 + v1.1.1 patch tag 路径选择

- v0.7 升级前向交付物 grep `Fable 5|GLM 5.3|MiniMax-M3` = 0 ✓
- v0.7 升级范围 grep `sk-[a-z0-9]{32,}` = 0 ✓
- v0.7 升级范围 grep `tskey-[a-zA-Z0-9_-]{32,}` = 0 ✓（§2.6 NEW 守门）
- v0.7 升级范围 `git diff v1.0.0..HEAD -- <v1.0 runtime 区域>` = 0 行 ✓
- v0.7 升级范围 `grep "profile: web" wrapper/` = 0 行 ✓
- v0.7 升级范围 `grep "profile: headless" wrapper/` ≥ 3 ✓
- §4.5.7 5 edge compose 起草守门启用（`sleep infinity` == 0 + `harness-edge[1-5]` ≥ 5 + `tag:harness-edge` ≥ 1）
- §4.7.6 server.ts 8 endpoint 守门启用
- §4.8 PROJECT_ROOT 路径 bug 修法守门启用（`import.meta.url` ≥ 4 + `process.cwd() + '..'` == 0）
- §4.9 dsh binary install 守门启用（`set -e` + `DSH_URL` env var + `chmod +x` ≥ 3）
- §3.5 deploy/ v1.0 runtime 范围确认
- tracked 锚定 post-v0.7 = 引用式 audit-scope §1.5 主表合计（v0.7 实测 = 117 tracked + 126 disk，禁公式预测）
- Codex 提交铁律：用户亲提 `gpt-5.6-sol` + `xhigh`；Claude 不亲提
- 下一站：v0.7 升级 PASS → **v0.7 Codex formal 复审 PASS**（user 亲提）→ **v1.1.1 patch tag**（user 亲提 git tag + push via Clash proxy）→ **v1.1.1.1+ 5 edge host 真实 provision**（user 持有 Tailscale auth key + VPS 采购）

---

## §7 教训记档（v0.7 NEW — server-side 切入口 + 5 edge 起草实战 + PROJECT_ROOT 路径 bug + dsh binary install URL user verify）

**v0.7 教训（2026-09-03 立）**：

1. **volume mount 双修法（v0.7 NEW — Plan agent 关键发现）**：
   - **病灶**：原 deploy/newvps-compose.yml + 6host-compose.newvps.yml + 5 edge compose 全部用 `volumes: - ../wrapper:/app/wrapper:ro`，导致容器内 `/app/wrapper/build/server.js` 之外 `/app/docs/m0b/profile-override-*.yaml` 不可访问（dsh profile YAML 在项目根而非 wrapper/）
   - **修法**：`volumes: - ..:/app:ro`（相对 deploy/ = 项目根 → 容器内 /app）+ `working_dir: /app/wrapper`（让 node 启动相对路径正确）+ `command: ["node", "build/server.js"]`（编译后启动，非 npx tsx）
   - **机制条款**：v0.7 §5 「`volumes: - ../wrapper` 必须 == 0 + `volumes: - ..` 必须 ≥ 8」守门；同步改 12 service entries（newvps 2 + 6host 6 + 5 edge 5）
   - **实战坑**：不能只改 1 个 service，必须 12 个 service 同步改；plan agent 推荐 `volumes: - .:/app/wrapper:ro` 是错的（`.` 相对 deploy/ = deploy/，不是项目根）

2. **PROJECT_ROOT import.meta.url 修法（v0.7 NEW — 4 文件统一模式）**：
   - **病灶**：原 4 dsh 文件用 `const PROJECT_ROOT = resolve(process.cwd(), '..')` — 容器内 `process.cwd() = /app/wrapper`（working_dir 设了）→ `resolve('/app/wrapper', '..') = /app`（项目根，正确）；但若 working_dir 未设或路径漂移则错位
   - **修法**：用 `import.meta.url` 解析到文件实际位置，再 `resolve(__dirname, '../..')` 拿到项目根 — 与 working_dir 无关，绝对鲁棒
   - **机制条款**：v0.7 §4.8 「`import.meta.url` ≥ 4 + `process.cwd() + '..'` == 0」守门；4 文件统一模式：fileURLToPath + dirname + resolve
   - **实战坑**：vitest `import.meta.url` 解析到文件实际位置（通过 stripJsExtensionPlugin 处理 `.js` → `.ts`），不依赖 cwd；`__dirname` 在 ESM 下需 fileURLToPath 转换

3. **dsh binary install URL user verify（v0.7 NEW — agent 无法 verify GitHub URL）**：
   - **病灶**：agent 不知道 dsh 项目确切 GitHub URL（session 内无 GitHub 访问能力 + 不持有 dsh 项目 knowledge）+ 不能硬编码 URL（违反 hygiene）
   - **修法**：install-dsh.sh 用 `DSH_URL="${DSH_URL:?DSH_URL env var required}"` 强制 env var 注入；user SSH verify GitHub release URL + 填入 DSH_VERSION=v1.0.0 + 跑脚本
   - **机制条款**：v0.7 §4.9 「`DSH_URL=.*\?:` + `set -e` + `chmod +x` ≥ 3」守门；user must execute step U1（verify URL）+ U2（install）
   - **实战坑**：URL 不能 hardcode（违反 §2.6 Tailscale auth key 类似 hygiene）；version 锁定到具体 release tag 不用 latest（防 reproducible 漂移）

4. **5 edge compose 单模板法（v0.7 NEW — deploy/ 已存在但全部 sleep infinity placeholder）**：
   - **病灶**：M2 实施包已写 `deploy/6host-compose.edge[1-5].yml` 5 文件，但 command 全部 `sh -c "echo 'edgeN-wrapper (region-XXX)' && sleep infinity"` — placeholder 而非真启动
   - **修法**：5 edge compose 共享同一模板（差异只在 EDGE_REGION env var + container_name + port + EDGE_HOSTNAME），volume mount + working_dir + command 统一改法
   - **机制条款**：v0.7 §4.5.7 「`sleep infinity` == 0 + `harness-edge[1-5]` ≥ 5」守门；plan agent 推荐「单模板法」节省 4×50 行重复
   - **实战坑**：5 edge host 起草 ≠ 真实 provision；user 真实 provision 触发条件（VPS 采购 + Tailscale auth key + Funnel 配置）挂账 v1.1.1.1+ 周期

5. **commander/worker stub 维持（v0.7 范围确认 — M1+ 真实现不在 v1.1.1 scope）**：
   - **病灶**：v1.1.1 cycle scope 明确 = server-side 切入口 + 5 edge 起草，**非 M1 commander/worker 真实现**
   - **修法**：commander.ts (4.2KB TODO M1) + worker.ts (4.2KB TODO M1) 维持 stub 不变；orchestrator.ts 已 ready 真实现 + 6host_router.ts ready + stt + webpush + pwa 5 endpoint 足够支撑 server.ts 8 endpoint 真实现
   - **机制条款**：plan §2.2 「v1.1.1 周期维持 stub」决策；stub 行为 commander.planStep 返回 `{steps:[]}`、worker.run 返回 empty async generator、heartbeat inline 返回 200
   - **实战坑**：commander/worker 真实现是 v1.2.0+ 周期工作；不在 v1.1.1 范围，避免 scope creep

6. **v0.7 §1.5 实测前置铁律（v0.6 W-A 教训延伸至 v0.7）**：
   - **病灶**：原 v0.5 公式预测 disk = tracked + audit-scope 自伤行数不准 — Plan agent 范围误算噪音
   - **修法**：v0.7 §1.5 主表「v0.7 实测 = 117 tracked + 126 disk + 自伤 9」实测落地（per v0.6 W-A 教训延伸：禁「占位后填」模式 — 实测前不写 commit message）
   - **机制条款**：v0.7 §1.5 + §5 「引用式纪律（per v0.4 §7.3 ② 升级 + v0.6 §7.4 ④ 延伸至 disk）」；prompt/报告凡引用锚定数字必走「audit-scope §1.5 主表唯一权威源」引用式
   - **实战坑**：禁止「占位后填」模式 — 实测前不写 commit message；公式预测已废弃，演进链仅作历史参考

7. **4 commits 拆分（v0.7 NEW — Plan agent 推荐）**：
   - commit 1 `chore(v1.1.1): v0.7 audit-scope drafting` — 2 文件 notes/
   - commit 2 `feat(v1.1.1): server.ts orchestration API + PROJECT_ROOT fix` — 8 文件 wrapper/（1 server.ts NEW + 4 dsh PROJECT_ROOT + 3 tests）
   - commit 3 `feat(v1.1.1): deploy cutover + 5 edge host provision + dsh install` — 11 文件 deploy/ + env/
   - commit 4 `chore(v1.1.1): cc-ready flip + CHANGELOG + README` — 3 文件 docs/
   - 4 commits 全部 push via Clash proxy；user 必须亲提每个 commit（per CLAUDE.md 不主动 commit）

8. **plan agent 9 user must execute items（v1.1.1 EXEC）**：
   - U1: dsh GitHub release URL verify
   - U2: dsh binary install on newvps
   - U3: TypeScript build on newvps
   - U4: docker compose restart (切入口)
   - U5: 真机 4 E2E 套件真调
   - U6: 6 Funnel URL 路径 200 验证
   - U7: Codex v0.7 formal 复审 (user 亲提)
   - U8: v1.1.1 patch tag (user 亲提 + push via Clash)
   - U9: 5 edge host 真实 provision (v1.1.1.1+ 周期)

---

## §8 复审环境注记（继承 v0.4 §5.3 + v0.6 §5.3 实战校准）

- **tsc**：`cd wrapper && ./node_modules/.bin/tsc --noEmit`（**项目本地 bin 必用**，禁 npx tsc — 会拉假 typosquat 包 exit=0 假绿）
- **vitest**：`cd wrapper && ./node_modules/.bin/vitest run`（**项目本地 bin 必用**，禁 npx --yes vitest — 缺 rolldown binding）
- **typecheck + tests 双 gate**：tsc exit 0 + vitest 0 failed
- **env-inject**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 仅 env var 注入，不入 commit
- **VAPID 公钥**：`deploy/vapid_public.key` 单文件白名单入库（per v0.6 §4.7 GATE-CALIB）；公钥本为公开分发物 RFC 8292
- **deploy/ sleep infinity 检测**：`grep -rE "sleep infinity" deploy/ | wc -l` == 0（v0.7 NEW §4.5.7 守门）

---

## §9 v0.7 升级 hygiene 自检命令矩阵（用户/Codex 复审必跑）

```bash
# 1. tracked 锚定（v0.7 实测）
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == §1.5 主表合计（v0.7 实测 = 117 tracked；禁公式预测）

# 2. disk 锚定（v0.7 实测）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1.1-v0.7-precommit.md | wc -l
# 期望: == §1.5 主表 disk 行（v0.7 实测 = 126）

# 3. v1.0 runtime 0 行 diff
git diff v1.0.0..HEAD -- harness/ spec/ spikes/ 'adr/000[1-9]-*.md' 'adr/0010-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: == 0

# 4. 5 edge compose 起草守门 + volumes 双修法（v0.7 GATE-CALIB per Codex 复审 F3/F4：awk 真命中合计替代 wc -l 数文件数；补 volumes 双守门）
grep -rE "sleep infinity" deploy/ | wc -l  # == 0
grep -rE "harness-edge[1-5]" deploy/ | wc -l  # ≥ 5
grep -rE "tag:harness-edge" deploy/tailscale-acl.yaml | wc -l  # ≥ 1
grep -c "EDGE_REGION" deploy/6host-compose.edge[1-5].yml 2>/dev/null | awk -F: '{s+=$NF} END{print s}'  # ≥ 10（起草实测 10）
grep -c "build/server.js" deploy/*.yml 2>/dev/null | awk -F: '{s+=$NF} END{print s}'  # ≥ 8（起草实测 0 待实施）
grep -rn -- "- ../wrapper:/app/wrapper" deploy/*.yml | wc -l  # == 0（起草实测 12 待改）
grep -rn -- "- ..:/app:ro" deploy/*.yml | wc -l  # ≥ 12（起草实测 0 待实施）

# 5. server.ts 8 endpoint 守门（formal 校准：含 use-无路径 SPA fallback 分支，per §4.7.6 GATE-CALIB）
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api|/api/stt)|app\.use\(\s*\(\s*_req" wrapper/server.ts  # ≥ 8（formal 实测 8）

# 6. PROJECT_ROOT 路径修法
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l  # == 4
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd" wrapper/dsh/*.ts | wc -l  # == 0

# 7. dsh binary install 守门
test -f deploy/install-dsh.sh
grep -E "DSH_URL=.*\?:|set -e|chmod \+x" deploy/install-dsh.sh | wc -l  # ≥ 3

# 8. 不硬编码 API key
grep -rE "sk-[a-z0-9]{32,}" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l  # == 0
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l  # == 0

# 9. VAPID 守门（继承 v0.6 §4.7）
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}" wrapper/ deploy/ env/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -c "dsaEncoding.*ieee-p1363" wrapper/dsh/vapid_keys.ts  # ≥ 1
grep -c "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts  # ≥ 1

# 10. 双 gate（typecheck + tests）
cd wrapper && ./node_modules/.bin/tsc --noEmit; echo $?  # 0
./node_modules/.bin/vitest run 2>&1 | grep -E 'Tests ';  # 0 failed

# 11. cc-ready.json 翻牌
jq -e '.task_id == "T-V1.1.1-DISPATCH-PASS"' docs/poll/cc-ready.json  # true
```

---

*hygiene audit-scope — v0.7 升级 24 文件改动守门 by-design；继承 v0.6 §1-§8 + 启用 §4.5.7 5 edge compose 起草守门 + §4.7.6 server.ts 8 endpoint 守门 + §4.8 PROJECT_ROOT 路径 bug 修法守门 + §4.9 dsh binary install 守门 + §3.5 deploy/ v1.0 runtime 范围确认 + §9 11 验证命令矩阵；tracked 锚定 post-v0.7 = 引用式 audit-scope §1.5 主表合计（v0.7 实测 = 117 tracked + 126 disk，禁公式预测）；v1.1.1 patch tag 路径 = server-side 切入口 + 5 edge host provision 起草 + dsh binary install + v0.7 audit-scope 守门启用；下一站 v1.1.1 patch tag（user 亲提 + push via Clash proxy）+ v1.1.1.1+ 5 edge host 真实 provision（user 持有 Tailscale auth key + VPS 采购）*

Co-Authored-By: Claude Code <noreply@anthropic.com>