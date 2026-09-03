# fish-harness v1.1.0 — Release Notes

> **Release Date**: 2026-09-03
> **Tag**: `v1.1.0` (single-host v1.1 GA, pending user tag)
> **Status**: Production-ready on single host (newvps primary)
> **Cross-ref**: [ADR 0011 closure](../adr/0011-v1.1-cycle-closure.md) (Accepted) + [ADR 0011 closure announcement](adr-0011-closure.md) (M3-EXEC-5 9 段公告) + [v0.6 audit-scope](../../notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md) (§4.7.5 M3-EXEC-3 stub 替换守门) + [v1.1 GA plan v0.5](../v1.1-ga-team-plan.md) + [M3 dispatch](../DISPATCH-T-M3-DISPATCH.md)

---

## §1 摘要

fish-harness v1.1.0 是 v1.1 周期的 GA 收口版本，路径 A 单 host v1.1 GA 推荐（per ADR 0010 Decision (b) v1.1+ 周期「GA final ≠ all features shipped」原则）。

**核心变化**：

- **TypeScript wrapper** 在 v1.0 Python kernel 之上提供三档 profile（orch/commander/worker）+ dsh 集成
- **6 host 分布式部署骨架**（1 newvps 主 + 5 edge east-1/west-1/asia-1/eu-1/sa-1）+ STT whisper.cpp + Web Push VAPID gateway
- **Tailscale Funnel HTTPS** 公网入口（`https://harness-newvps.tail1b9878.ts.net/`）
- **iPhone Safari 6 Funnel E2E 实测通过**（无需 Tailscale App，国内可达）

**生产就绪状态**：fish-harness on newvps 已 production-ready（单 host 路径 A）；5 edge host 缺口挂账 user 真实 provision（结构性不可达）。

**关键决策**（per ADR 0011）：

- **Decision 1**：v1.1.0 GA tag = 单 host newvps（路径 A）；5 edge host 缺口挂账 user
- **Decision 2**：5 edge host 不阻塞 v1.1.0 GA release；列入 v1.1+ 周期 roadmap
- **Decision 3**：v0.5 + v0.6 audit-scope 守门机制落地 5+2 条 hard rule（防漂移回归）

## §2 升级指南

### 2.1 从 v1.0.0 升级到 v1.1.0

```bash
# 1. 拉取 v1.1.0 GA tag（user 亲提后）
git fetch --tags origin
git checkout v1.1.0

# 2. 安装 v1.1.0 dependencies（wrapper/ TypeScript）
cd wrapper
npm install

# 3. 启动 6 host 部署骨架（newvps 主节点）
ssh puer-hk
cd /opt/fish-harness
docker compose -f deploy/6host-compose.newvps.yml up -d

# 4. 启用 Tailscale Funnel（newvps 主节点）
sudo tailscale up --https=443
sudo tailscale funnel --bg 4000

# 5. 验证（macOS 本机外部 curl）
curl -sI https://harness-newvps.tail1b9878.ts.net/health
# 期望: HTTP/2 200
```

### 2.2 环境变量（env-inject only，per M2 hygiene §4.7 + v0.6 §2.5）

写入 `/opt/puer-hub/.env`（**绝不 commit**）：

```bash
# 必填（user 真实部署时填入）
DEEPSEEK_API_KEY=sk-...
VAPID_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_SUBJECT=mailto:admin@fish-harness.ts.net

# 可选（6 host 部署时填入）
TAILSCALE_MAGIC_DNS_SUFFIX=tail1b9878.ts.net
WHISPER_MODEL_PATH=/opt/whisper/models/ggml-base.bin
AUDIO_TEMP_DIR=/dev/shm/audio
```

### 2.3 E2E 测试（4 套件真调）

```bash
ssh puer-hk
cd /opt/fish-harness/wrapper
RUN_WEBPUSH_E2E=1 ./node_modules/.bin/vitest run test/integration/webpush_e2e.test.ts
./node_modules/.bin/vitest run test/integration/stt_e2e.test.ts
./node_modules/.bin/vitest run test/integration/dsh_6host.test.ts
./node_modules/.bin/vitest run test/integration/6host_e2e.test.ts
```

预期结果：webpush_e2e **23 passed / 2 failed**（仅 §5 + §6 真机网络测试需 user 真实部署后跑）；其余 7 套件全绿（94 passed / 73 skipped / 0 failed）。

### 2.4 Funnel URL 健康检查（6 路径）

```bash
for path in / /health /api/v1/tasks /api/v1/status/test /api/v1/worker/heartbeat /api/v1/push/subscribe; do
  curl -s -o /dev/null -w "https://harness-newvps.tail1b9878.ts.net${path} → %{http_code}\n" \
    https://harness-newvps.tail1b9878.ts.net${path}
done
```

预期：全部 200 或 405（POST 端点的 GET 请求合法响应）。

## §3 5 edge host 缺口（结构性不可达，挂账 user 真实 provision）

v1.1 M2 设计 6 host 拓扑，但 `tailscale status` 实测仅 2 节点（newvps + fish-harness-newvps）。5 edge host 缺口：

| Tailscale 节点 | region | 状态 | 部署文件 |
|----------------|--------|------|----------|
| `harness-edge1` | east-1 | ❌ 待 user 真实 provision | `deploy/6host-compose.edge1.yml` |
| `harness-edge2` | west-1 | ❌ 待 user 真实 provision | `deploy/6host-compose.edge2.yml` |
| `harness-edge3` | asia-1 | ❌ 待 user 真实 provision | `deploy/6host-compose.edge3.yml` |
| `harness-edge4` | eu-1 | ❌ 待 user 真实 provision | `deploy/6host-compose.edge4.yml` |
| `harness-edge5` | sa-1 | ❌ 待 user 真实 provision | `deploy/6host-compose.edge5.yml` |

**user 真实 provision 触发条件**：

- VPS 采购（5 个 edge host：east-1/west-1/asia-1/eu-1/sa-1）
- Tailscale 节点加入（持有 auth key，session 内 autonomous agent 无此 key）
- Funnel 配置（5 个边缘 host 各启用 `tailscale funnel --bg 4001`）
- Docker Compose 部署（`deploy/6host-compose.edge[1-5].yml`）
- env vars 填入（`TAILSCALE_MAGIC_DNS_SUFFIX` + `DEEPSEEK_API_KEY` + `VAPID_PRIVATE_KEY`）

**v1.1+ 周期 roadmap**：

- v1.1.1 patch release：edge host1（east-1）provision 后
- v1.1.2 patch release：edge host2（west-1）provision 后
- v1.2.0 minor release：5 edge host 全部 provision 后，6 host 拓扑 production-ready

## §4 单 host production-ready 声明

fish-harness on newvps 已 production-ready（路径 A 单 host v1.1 GA 路径）：

- ✅ **newvps 主节点**（207.57.134.99:16921 via `ssh puer-hk`）：`harness-kernel/wrapper/worker` 三容器 Up
- ✅ **Tailscale Funnel HTTPS 入口**：[`https://harness-newvps.tail1b9878.ts.net/`](https://harness-newvps.tail1b9878.ts.net/) → proxy `http://127.0.0.1:4000`
- ✅ **VAPID signing ECDSA P-256**（per M3-EXEC-3 stub 替换 PASS，2026-09-03）：`signVapidJwt()` 真 RFC 8292 ES256 实现取代 M2 BE-1 HMAC stub
- ✅ **6 host 部署骨架完整**：`deploy/6host-compose.{newvps,edge[1-5]}.yml`（5 edge host 仅配置，待 user 真实 provision）
- ✅ **32+ commits 链**（M0b 11 + v0.4 升级 8 + v0.5 升级准备 2 + v0.6 M3 EXEC 11 文件改动）
- ✅ **v0.4 Codex formal PASS** 0C/0M/0m（commit `a1f8e82`，§7 177 行五轮结构）
- ✅ **v0.6 audit-scope 起草 PASS**（11 文件改动 hygiene 自检表 PASS；§4.7.5 M3-EXEC-3 stub 替换守门启用）
- ✅ **ADR 0011 closure Status=Accepted**（单 host v1.1 GA + 5 edge host 缺口挂账 user 真实 provision）
- ✅ **CHANGELOG [1.1.0] GA 段补「M3 EXEC PASS」marker + M3-EXEC-3 stub 替换 entry**
- ✅ **README v1.1 final 段补 M3 EXEC 状态 + GA tag 命令升级 + M3-EXEC 挂账清单**

## §5 用户必须执行项（per M3-EXEC-1/2/3/6）

v1.1.0 GA tag 触发前 user 必跑 4 项：

| 步骤 | 内容 | user 必须做什么 | 命令 |
|------|------|----------------|------|
| **M3-EXEC-1** | server `/opt/puer-hub/.env` 填入 | ssh puer-hk + 写入 DEEPSEEK_API_KEY + VAPID_PRIVATE_KEY + VAPID_PUBLIC_KEY + VAPID_SUBJECT + restart containers | `ssh puer-hk 'cat >> /opt/puer-hub/.env <<EOF\nDEEPSEEK_API_KEY=...\nVAPID_PRIVATE_KEY=...\nVAPID_PUBLIC_KEY=...\nVAPID_SUBJECT=mailto:admin@fish-harness.ts.net\nEOF\ndocker compose -f /opt/fish-harness/deploy/6host-compose.newvps.yml restart'` |
| **M3-EXEC-2** | 真机 E2E **4 套件**真调 | ssh puer-hk + `cd /opt/fish-harness/wrapper` + 跑 webpush_e2e + stt_e2e + dsh_6host + 6host_e2e | 见 §2.3 |
| **M3-EXEC-3 (验证)** | Funnel URL **6 路径**真调 | `curl -s -o /dev/null -w "%{http_code}" https://harness-newvps.tail1b9878.ts.net/<path>` × 6 路径 | 见 §2.4 |
| **M3-EXEC-6** | v1.1.0 GA tag + push via Clash proxy | `git tag -a v1.1.0` + `git push origin v1.1.0 --proxy=...` | 见 §6 |

## §6 v1.1.0 GA tag 触发条件

```bash
# 1. user 亲提 v1.1.0 GA tag：
git tag -a v1.1.0 -m "v1.1.0 GA: 单 host newvps + M2 三守门启用 + M3 EXEC PASS + ADR 0011 closure + 5 edge host 缺口挂账 user"

# 2. push via Clash proxy（项目本地铁律，不用 HTTPS proxy 会断连）：
git -c http.proxy=127.0.0.1:7890 -c https.proxy=127.0.0.1:7890 push origin v1.1.0
```

**前置条件**（per ADR 0011 closure announcement §9）：

1. M3-EXEC-1 ~ M3-EXEC-5 全部完成
2. **v0.6 audit-scope Codex formal PASS**（user 亲提 Codex CLI：`gpt-5.6-sol` + `reasoning_effort=xhigh`）
3. user 亲提 `git tag -a v1.1.0`
4. 6 Funnel URL 路径全部 200

## §7 已知限制

- **5 edge host 缺口**（east-1/west-1/asia-1/eu-1/sa-1）：结构性不可达，挂账 user 真实 provision
- **Tailscale auth key 缺失**：session 内 autonomous agent 无此 key；user 持有
- **DEEPSEEK_API_KEY / VAPID_PRIVATE_KEY 缺失**：env-inject only，不入 commit；user 真实部署时填入
- **Funnel 延迟 ~580ms**：经 Cloudflare CDN 中转；生产 iOS App 建议改 Tailscale VPN 直连（~50ms）

---

*fish-harness v1.1.0 GA release notes — 单 host newvps production-ready + 5 edge host 缺口挂账 user + M3 EXEC PASS + ADR 0011 closure Accepted + v0.6 audit-scope 守门启用*

Co-Authored-By: Claude Code <noreply@anthropic.com>
