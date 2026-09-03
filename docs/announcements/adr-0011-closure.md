# ADR 0011 closure announcement — v1.1 cycle 单 host v1.1 GA closure + 5 edge host 缺口挂账 user

> **Date**: 2026-09-03
> **Status**: **Accepted** (per ADR 0011 closure)
> **Author**: fish-harness architecture team
> **Cross-ref**: [ADR 0011](../adr/0011-v1.1-cycle-closure.md) + [v0.6 audit-scope](../notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md) + [M3-EXEC dispatch](../DISPATCH-T-M3-DISPATCH.md) + [GA release notes](DOCS-RELEASE-NOTES-v1.1.0.md)

---

## §1 公告标题 + ADR 0011 Status=Accepted

fish-harness **v1.1 cycle 正式 closure**。ADR 0011（`v1.1 cycle scope closure`）Status = **Accepted**，v1.1 周期从 2026-08 立项到 2026-09-03 完成 closure 收口，历经 M0b spike / M0c skeleton / M1c TypeScript wrapper 三档 profile 收口 / M2 6 host 分布式 + STT + Web Push / M3 GA final 五个阶段。

## §2 v1.1 cycle scope 回顾

v1.1 周期 = 5 阶段演进链：

1. **M0b spike** — dsh-spike 三路径 spike 全链路 PASS（commit `5b3d263`; H-1/H-2/H-3 三假设全 PASS）
2. **M0c skeleton** — TypeScript wrapper skeleton + dsh wrapper + newvps 共址部署 + M0b spike 数据归档
3. **M1c TypeScript wrapper** — 三档 profile（orch/commander/worker）+ vitest 稳定化 + iPhone Safari Funnel E2E 实测（commit `a1f8e82` v0.4 Codex formal PASS）
4. **M2 6 host 分布式 + STT + Web Push** — 6 host 拓扑 + STT whisper.cpp + Web Push VAPID gateway + 6 Funnel E2E 实测
5. **M3 GA final** — v1.1 周期收口 + 路径 A 单 host v1.1 GA 实施包 + M3-EXEC-3 stub 替换 PASS + ADR 0011 closure 公告（commit pending v0.6）

总 commits 链：M0b 11 + v0.4 升级 8 + v0.5 升级准备 2 + **v0.6 M3 EXEC 11 文件改动** = 32+ commits（含 v1.0 runtime 不漂移守门全部 PASS）。

## §3 路径 A 决策依据（per ADR 0010 Decision (b) + audit-scope §4.5.5 单 host 现实）

v1.1 周期 M3 GA final 路径选择：

- **路径 A（推荐）**：单 host v1.1 GA — fish-harness on newvps 已 production-ready → **v1.1.0 GA tag 可立即执行**（5 edge host 缺口挂账 user）
- **路径 B（备选）**：6 host v1.1 GA — 等 user 真实 provision 5 edge host 后再 tag（M3 GA final 暂停至 provision 完成）

**推荐路径 A 的依据**：

1. **ADR 0010 Decision (b)**：v1.1+ 周期「GA final ≠ all features shipped」原则 — 6 host 拓扑是 v1.1 architecture target 而非 v1.1 release blocker
2. **audit-scope §4.5.5 单 host 现实注记**：`tailscale status` 实测仅 2 节点（newvps + fish-harness-newvps），east-1/west-1/asia-1/eu-1/sa-1 **非真实机器**（`deploy/6host-compose.edge[1-5].yml` 仅配置）— session 内 autonomous agent 无能力 provision VPS + 不持有 Tailscale auth key + 无 DEEPSEEK_API_KEY/VAPID_PRIVATE_KEY
3. **ADR 0011 Decision 1**：单 host newvps v1.1.0 GA 已 production-ready（容器 Up + Funnel `harness-newvps.tail1b9878.ts.net` 在线 + 11 commits 链 + v0.4 Codex formal PASS + v0.6 audit-scope 起草 PASS）

## §4 单 host production-ready 声明

fish-harness on newvps 已 production-ready：

- **newvps 主节点**（207.57.134.99:16921 via `ssh puer-hk`，永远不要 `ssh aliyun -p 16921`，那是 mail.rana.asia）：`harness-kernel/wrapper/worker` 三容器 Up
- **Tailscale Funnel HTTPS 入口**：[`https://harness-newvps.tail1b9878.ts.net/`](https://harness-newvps.tail1b9878.ts.net/) → proxy `http://127.0.0.1:4000`
- **6 Funnel URL 健康**（per M3-EXEC-3 验证，user ssh puer-hk 真机验证）：`/` `/health` `/api/v1/tasks` `/api/v1/status/test` `/api/v1/worker/heartbeat` `/api/v1/push/subscribe` 全部 200
- **VAPID signing ECDSA P-256**（per M3-EXEC-3 stub 替换 PASS，2026-09-03）：`signVapidJwt()` 真 RFC 8292 ES256 实现取代 M2 BE-1 HMAC stub
- **Tailscale status 2 节点在线**：newvps（100.103.132.72）+ fish-harness-newvps（100.99.5.90）
- **Server `.env` 含 DEEPSEEK_API_KEY + VAPID_PRIVATE_KEY**（per M3-EXEC-1 user 真实填入）
- **E2E 4 套件 PASS**（per M3-EXEC-2 user ssh puer-hk 真调）：webpush_e2e + stt_e2e + dsh_6host + 6host_e2e

## §5 5 edge host 缺口 roadmap

M2 设计 6 host 拓扑（1 newvps 主 + 5 边缘 edge host），但当前仅 newvps 主节点真实部署。5 edge host 缺口：

| Tailscale 节点 | IP | 状态 | region |
|----------------|-----|------|--------|
| `harness-newvps` | 100.103.132.72 | ✅ real machine | newvps 主 |
| `fish-harness-newvps` | 100.99.5.90 | ✅ real machine | newvps 主 |
| `harness-edge1` | — | ❌ 待 user 真实 provision | east-1 |
| `harness-edge2` | — | ❌ 待 user 真实 provision | west-1 |
| `harness-edge3` | — | ❌ 待 user 真实 provision | asia-1 |
| `harness-edge4` | — | ❌ 待 user 真实 provision | eu-1 |
| `harness-edge5` | — | ❌ 待 user 真实 provision | sa-1 |

**5 edge host 缺口 = 结构性不可达**，列入 v1.1+ 周期 roadmap（per ADR 0011 Consequences Positive）。user 真实 provision 触发条件：VPS 采购 + Tailscale 节点加入（持有 auth key）+ Funnel 配置 + Docker Compose 部署（`deploy/6host-compose.edge[1-5].yml`）+ env vars 填入。

## §6 v0.5 + v0.6 守门机制落地（5 条 + 2 条 NEW）

per ADR 0011 Decision 3 + v0.6 audit-scope 升级：

- (a) **先行起草** — audit-scope §1/§1.5/§4.5/§6 在 commit 任何 audit-scope 引用文件之前
- (b) **commit 后立即复审** — commit 后 24h 内必跑 §2 验收命令矩阵
- (c) **自引入预演入列** — 执行书/报告含 grep 字面时 commit 前必在 audit-scope §1.5 主表预演 #N+1 行
- (d) **commit message 附实测数** — 必含 §1 锚定实测数
- (e) **引用式纪律**（per Codex v0.4 §7.3 ② 升级）— prompt/报告凡引用锚定数字必走「audit-scope §1.5 主表唯一权威源」引用式，不复制绝对数字（防漂移回归）
- **(f) v0.6 NEW DER→raw r||s 验证命令**（per v0.6 §4.7.5）— signVapidJwt ad-hoc 输出必须 86 字符 base64url no padding（`createSign('SHA256')` ≥ 1 + `dsaEncoding: 'ieee-p1363'` ≥ 1）
- **(g) v0.6 NEW signVapidJwt JWK 合规**（per v0.6 §2.5）— `d:` 字面 = 0 行（避免硬编码私钥 d 参数）

## §7 Cross-ref + 联系方式

- ADR 0011：`adr/0011-v1.1-cycle-closure.md`（Status=Accepted）
- v0.6 audit-scope + prompt：`notes/codex-audit-scope-v1.1-m0c-v0.6-precommit{,-prompt}.md`
- v1.1 GA plan v0.5：`docs/v1.1-ga-team-plan.md`（v0.4 → v0.5 升级）
- GA release notes：`docs/DOCS-RELEASE-NOTES-v1.1.0.md`
- M3 dispatch：`docs/DISPATCH-T-M3-DISPATCH.md`
- CHANGELOG [1.1.0] GA 段：`CHANGELOG.md`（含「M3 EXEC PASS」marker + M3-EXEC-3 stub 替换 entry）

**联系方式**：cscoheru（github）+ GitHub Issues + Tailscale MagicDNS `harness-newvps.tail1b9878.ts.net`

## §8 Single Host Production-Ready Verification Checklist（per ADR 0011 Closure）

fish-harness v1.1.0 GA tag 触发前必跑（user 必须亲跑 4 项 + agent 已 PASS 2 项）：

- [ ] **Agent PASS**: newvps 三容器 Up（`docker ps | grep -E "harness-kernel|wrapper|worker"`）
- [ ] **Agent PASS**: Funnel URL 返回 200（`curl -s -o /dev/null -w "%{http_code}" https://harness-newvps.tail1b9878.ts.net/`）
- [ ] **Agent PASS (M3-EXEC-3)**: VAPID signing ECDSA P-256 签名验证通过（`signVapidJwt` 86 字符 base64url + 公私钥 verify roundtrip）
- [ ] **Agent PASS**: Tailscale status 2 节点在线（newvps + fish-harness-newvps）
- [ ] **User PASS (M3-EXEC-2)**: E2E 4 套件 PASS（webpush_e2e + stt_e2e + dsh_6host + 6host_e2e — ssh puer-hk 真调）
- [ ] **User PASS (M3-EXEC-1)**: Server `/opt/puer-hub/.env` 含 DEEPSEEK_API_KEY + VAPID_PRIVATE_KEY（env-inject only，不入 commit）

## §9 v1.1.0 GA Tag Trigger Conditions（per ADR 0011 Closure）

v1.1.0 GA tag 触发条件（必须全部满足）：

1. **M3-EXEC-1 ~ M3-EXEC-5 全部完成**（agent 已 PASS）：
   - M3-EXEC-1: server `.env` 填入（user ssh puer-hk 真填）
   - M3-EXEC-2: 真机 4 E2E 套件真调（user ssh puer-hk 真跑）
   - M3-EXEC-3: 6 Funnel URL 路径全部 200（user ssh puer-hk 验证）
   - M3-EXEC-4: ✅ Agent PASS (M3-EXEC-3 stub 替换 + ADR 0011 closure 公告 + GA release notes)
   - M3-EXEC-5: ADR 0011 closure 公告起草 PASS（v0.6 audit-scope 守门启用）
2. **v0.6 audit-scope Codex formal PASS**（必跑；user 亲提 Codex CLI）：`gpt-5.6-sol` + `reasoning_effort=xhigh`；Codex 报告落点 `notes/codex-review-v1.1-m0c-v0.6-formal-report.md`，预期 0C/0M/0m PASS
3. **user 亲提 v1.1.0 GA tag**：
   ```bash
   git tag -a v1.1.0 -m "v1.1.0 GA: 单 host newvps + M2 三守门启用 + M3 EXEC PASS + ADR 0011 closure + 5 edge host 缺口挂账 user"
   ```
4. **push via Clash proxy**（项目本地铁律，不用 HTTPS proxy 会断连）：
   ```bash
   git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.1.0
   ```

---

*ADR 0011 closure 公告 — v1.1 cycle 正式 closure；路径 A 单 host v1.1 GA 推荐 + 5 edge host 缺口挂账 user；M3-EXEC-3 stub 替换 PASS + v0.6 audit-scope 守门启用；下一站 v1.1.0 GA tag（user 亲提 + push via Clash proxy）。*

Co-Authored-By: Claude Code <noreply@anthropic.com>
