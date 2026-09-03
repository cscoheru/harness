# Codex Audit-scope v0.7 — Codex 复审 prompt

> **Date**: 2026-09-03
> **配套**: [codex-audit-scope-v1.1.1-v0.7-precommit.md](./codex-audit-scope-v1.1.1-v0.7-precommit.md)
> **Codex 提交铁律**: Claude 不亲提 Codex CLI; user 亲提 `gpt-5.6-sol` + `reasoning_effort=xhigh`
> **报告落点**: `notes/codex-review-v1.1.1-v0.7-formal-report.md` (NEW; v0.7 起草继承引用式纪律)
> **预期终态**: 0C/0M/0m + v0.7 §4.5.7 5 edge compose 守门全绿 + §4.7.6 server.ts 8 endpoint 守门全绿 + §4.8 PROJECT_ROOT 路径 bug 修法守门全绿 + §4.9 dsh binary install 守门全绿 + 引用式机制落地验证（5 处 PASS）+ tracked 锚定 post-v0.7 引用式纪律

---

## §1 复审范围

v0.7 升级 24 文件改动（per `codex-audit-scope-v1.1.1-v0.7-precommit.md` §1 #1-#24）：

- 8 wrapper/ 文件（1 server.ts NEW + 4 dsh PROJECT_ROOT 修法 + 3 NEW tests）
- 11 deploy/ + env/ 文件（7 compose Edit + 1 ACL Edit + 1 install-dsh.sh NEW + 1 env example NEW + 1 runbook NEW）
- 2 notes/ v0.7 audit-scope/prompt NEW（本 prompt 配套 audit-scope）
- 3 docs/ 文件（cc-ready + CHANGELOG + README Edit）

---

## §2 Codex 必跑验证命令矩阵（17 条 + 11 条自检 = 28 条总命令）

### §2.1 §1 不锁型号守门（NORTH-STAR A-4 等价类）

```bash
# tracked 锚定
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'

# disk 锚定
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1.1-v0.7-precommit.md | wc -l

# v0.7 升级前向交付物
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md deploy/install-dsh.sh deploy/runbook-edge-provision.md env/edge-host.env.example | wc -l
```

期望：`tracked == §1.5 主表合计` + `disk == §1.5 主表 disk 行` + `前向交付物 == 0`。

### §2.2 §2 不硬编码 API key 守门（含 §2.6 Tailscale auth key NEW）

```bash
grep -rE "sk-[a-z0-9]{32,}" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l
grep -rE "tskey-[a-zA-Z0-9_-]{32,}" wrapper/ deploy/ env/ CHANGELOG.md README.md | wc -l
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}" wrapper/ deploy/ env/ | wc -l
```

期望：全部 == 0。

### §2.3 §3 v1.0 runtime 0 行 diff 守门（含 §3.5 deploy/ 范围确认 NEW；v0.7 GATE-CALIB per Codex 复审 F1）

```bash
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
```

期望：== 0。

### §2.4 §4 dsh headless profile 守门

```bash
grep -rE "profile: ['\"]web['\"]|profile=web" wrapper/ | wc -l
grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
```

期望：web == 0 + headless ≥ 3（起草实测 19 = 源码 5 + test 14；per audit-scope §4 GATE-CALIB F2 空格版 pattern）。

### §2.5 §4.5 多 host 守门 + §4.5.7 5 edge compose 起草守门 NEW

```bash
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ | grep -v "127.0.0.1" | wc -l
grep -rE "ts\.net" deploy/ | wc -l
grep -rE "https://[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.ts\.net/" docs/ deploy/ | wc -l
```

期望：IP 锁 == 0 + ts.net ≥ 6 + Funnel URL ≥ 6。

**v0.7 §4.5.7 NEW 5 edge compose 起草守门（v0.7 周期最显眼的 hygiene 强信号）**：

```bash
grep -rE "sleep infinity" deploy/ | wc -l  # == 0（v0.7 后所有 placeholder 已替换为真 server.ts 启动命令）
grep -rE "harness-edge[1-5]" deploy/ | wc -l  # ≥ 5（5 edge compose 各含 EDGE_REGION + container_name + port）
grep -rE "tag:harness-edge" deploy/tailscale-acl.yaml | wc -l  # ≥ 1（ACL 扩展）
grep -c "EDGE_REGION" deploy/6host-compose.edge[1-5].yml 2>/dev/null | awk -F: '{s+=$NF} END{print s}'  # ≥ 10（起草实测 10；per F4 awk 真命中合计）
grep -c "build/server.js" deploy/*.yml 2>/dev/null | awk -F: '{s+=$NF} END{print s}'  # ≥ 8（起草实测 0 待实施；per F4）
grep -rn -- "- ../wrapper:/app/wrapper" deploy/*.yml | wc -l  # == 0（起草实测 12 待改；per F3 volumes 双修法）
grep -rn -- "- ..:/app:ro" deploy/*.yml | wc -l  # ≥ 12（起草实测 0 待实施；per F3）
```

期望：sleep infinity == 0 + harness-edge ≥ 5 + tag:harness-edge ≥ 1 + EDGE_REGION ≥ 10 + build/server.js ≥ 8 + 旧 volume 挂载 == 0 + 新项目根挂载 ≥ 12。

### §2.6 §4.6 STT 守门

```bash
grep -rE "audio.*\.wav\s*[:=]|audio.*\.mp3\s*[:=]|audio.*\.m4a\s*[:=]" wrapper/ deploy/ env/ | wc -l
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/dsh/ wrapper/orchestrator/ deploy/ env/ | wc -l
grep -rE "WHISPER_MODEL_PATH\s*[:=]\s*['\"][^/$]" deploy/ env/ | wc -l
```

期望：全部 == 0。

### §2.7 §4.7 Web Push 守门 + §4.7.6 server.ts 8 endpoint 守门 NEW

```bash
grep -rE "hmacSha256\s*\(\s*signingInput" wrapper/ | wc -l  # == 0
grep -rE "signVapidJwt" wrapper/ | wc -l  # ≥ 2
grep -rE "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1
grep -rE "dsaEncoding\s*:\s*['\"]ieee-p1363['\"]" wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 1
```

**v0.7 §4.7.6 NEW server.ts 8 endpoint 守门**：

```bash
grep -cE "app\.(get|post|use)\s*\(\s*['\"](\/|/health|/api/v1/tasks|/api/v1/status/:task_id|/api/v1/status/test|/api/v1/worker/heartbeat|/api/v1/push/subscribe|/api/stt/transcribe)" wrapper/server.ts | wc -l
# 期望: ≥ 8（8 endpoint integration）
```

期望：hmacSha256 == 0 + signVapidJwt ≥ 2 + createSign ≥ 1 + dsaEncoding ≥ 1 + app.{get,post,use} ≥ 8。

### §2.8 §4.8 PROJECT_ROOT 路径 bug 修法守门 NEW

```bash
grep -E "import.meta.url" wrapper/dsh/dsh_client.ts wrapper/dsh/profile.ts wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l  # ≥ 4
grep -E "PROJECT_ROOT\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/*.ts | wc -l  # == 0
grep -E "projectRoot\s*=\s*resolve\(process\.cwd\(\)\s*,\s*['\"]\.\.['\"]\)" wrapper/dsh/6host_client.ts wrapper/dsh/vapid_keys.ts | wc -l  # == 0
```

期望：import.meta.url == 4 + PROJECT_ROOT 残留 == 0 + projectRoot 局部残留 == 0。

### §2.9 §4.9 dsh binary install 守门 NEW

```bash
test -f deploy/install-dsh.sh
grep -E "DSH_URL=.*\?:|set -e|chmod \+x" deploy/install-dsh.sh | wc -l  # ≥ 3
grep -E "https://github\.com/.*dsh.*releases/download" deploy/install-dsh.sh | wc -l  # == 0
grep -E "DSH_VERSION=" deploy/install-dsh.sh | wc -l  # ≥ 1
```

期望：install-dsh.sh 存在 + 3 项核心守卫 ≥ 3 + GitHub URL 硬编码 == 0 + DSH_VERSION ≥ 1。

### §2.10 cc-ready.json 翻牌

```bash
jq -e '.task_id == "T-V1.1.1-DISPATCH-PASS"' docs/poll/cc-ready.json
```

期望：true。

---

## §3 hygiene 自检 checklist（11 项）

- [ ] §1 不锁型号 grep == 0（前向交付物 + tracked == §1.5 主表 + disk == §1.5 主表 disk 行）
- [ ] §2 不硬编码 API key == 0（DEEPSEEK + VAPID + Tailscale auth key + signVapidJwt d 字面）
- [ ] §3 v1.0 runtime 0 行 diff（harness/spec/spikes/9 ADR/Dockerfile/docker-compose/pyproject）
- [ ] §3.5 deploy/ v1.0 runtime 范围确认 NEW（deploy/ 在 v1.0 runtime 外）
- [ ] §4 dsh headless profile（web == 0 + headless ≥ 3）
- [ ] §4.5.7 5 edge compose 起草守门 NEW（sleep infinity == 0 + harness-edge ≥ 5 + tag:harness-edge ≥ 1 + EDGE_REGION ≥ 5 + build/server.js ≥ 8）
- [ ] §4.6 STT 守门（音频留盘 == 0 + 临时目录 == 0 + Whisper 模型路径合规）
- [ ] §4.7 Web Push 守门（VAPID 私钥 == 0 + signVapidJwt ≥ 2 + dsaEncoding ≥ 1 + createSign ≥ 1）
- [ ] §4.7.6 server.ts 8 endpoint 守门 NEW（app.{get,post,use} ≥ 8）
- [ ] §4.8 PROJECT_ROOT 路径修法 NEW（import.meta.url == 4 + 残留 == 0）
- [ ] §4.9 dsh binary install 守门 NEW（DSH_URL env var + set -e + chmod +x ≥ 3 + GitHub URL 硬编码 == 0 + DSH_VERSION ≥ 1）

---

## §4 引用式纪律（5 处 PASS 验证）

按 Codex v0.4 §7.3 ② 升级 + v0.6 §7.4 ④ 延伸至 disk；v0.7 报告凡引用以下数字必走「audit-scope §1.5 主表唯一权威源」引用式，不复制绝对数字：

1. tracked 锚定数字 — 引用 §1.5 主表合计
2. disk 锚定数字 — 引用 §1.5 主表 disk 行
3. 前向交付物 grep 数字 — 引用 §1 第 1 条命令实测
4. volumes 双修法（旧挂载 == 0 + 新挂载 ≥ 12）— 引用 §4.5.7 主表实测（per Codex v0.7 复审 F3 补条目）
5. sleep infinity == 0 + harness-edge ≥ 5 — 引用 §4.5.7 主表实测
6. import.meta.url == 4 — 引用 §4.8 主表实测

**禁止**：(a) 公式预测任何锚定数字；(b) 复制绝对数字（演进链除外，仅作历史）；(c) 「占位后填」模式（实测前不写报告）。

---

## §5 复审预期 + Codex formal 报告格式

**复审预期终态**：0C/0M/0m PASS + §4.5.7 + §4.7.6 + §4.8 + §4.9 全部守门全绿 + 引用式机制落地验证（5 处 PASS）+ tracked 锚定 post-v0.7 引用式纪律。

**Codex formal 报告落点**：`notes/codex-review-v1.1.1-v0.7-formal-report.md`

**报告必含**：
- 0C/0M/0m 终态（CHANGES REQUIRED → 复审 → PASS）
- §1-§4.9 全部 11 项 hygiene checklist 验证结果
- 5 处引用式机制落地 PASS（不复制数字，引用 §1.5 + §4.5.7 + §4.7.6 + §4.8 + §4.9）
- tracked 锚定 post-v0.7 引用式（仅引用 audit-scope §1.5 主表合计，不复制绝对数字）
- v0.7 周期 24 文件改动 verbatim §1.5 主表
- v0.7 §7 教训记档验证（volume mount 双修法 / import.meta.url / dsh URL user verify / 5 edge compose 单模板 / v0.7 §1.5 实测前置 / 4 commits 拆分 / 9 user must execute）
- Codex 提交铁律维持（Claude 不亲提，用户亲提；push via Clash proxy）

---

## §6 复审环境注记（继承 v0.4 §5.3 + v0.6 §5.3 实战校准）

- **tsc**：`cd wrapper && ./node_modules/.bin/tsc --noEmit`（**项目本地 bin 必用**，禁 npx tsc — 会拉假 typosquat 包 exit=0 假绿）
- **vitest**：`cd wrapper && ./node_modules/.bin/vitest run`（**项目本地 bin 必用**，禁 npx --yes vitest — 缺 rolldown binding）
- **typecheck + tests 双 gate**：tsc exit 0 + vitest 0 failed
- **env-inject**：DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY / Tailscale auth key 仅 env var 注入，不入 commit
- **VAPID 公钥**：`deploy/vapid_public.key` 单文件白名单入库（per v0.6 §4.7 GATE-CALIB）

---

*Codex audit-scope v0.7 复审 prompt — 17 条验证命令 + 11 项 hygiene checklist + 5 处引用式机制落地验证 + 复审预期 0C/0M/0m；Codex 提交铁律 user 亲提 `gpt-5.6-sol` + `xhigh`；报告落点 `notes/codex-review-v1.1.1-v0.7-formal-report.md`*

Co-Authored-By: Claude Code <noreply@anthropic.com>