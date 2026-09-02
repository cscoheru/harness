# T-M1c-DO-1-iPhone-E2E-Funnel — Tailscale Funnel 实操 + iPhone Safari 真机 E2E 4 步

> **Task ID**: T-M1c-DO-1-iPhone-E2E-Funnel
> **Date**: 2026-09-02
> **Role**: DO (Deployment Ops) + QA (iPhone E2E)
> **Stage**: v1.1 M1c
> **Trigger**: M1c GATE-REPAIR-2 PASS + Codex formal PASS（0C/0M/1m F1 顺手清）+ DD-1 DISPATCH 起草 + user 2026-09-02 「用方案1（Funnel）跑通 iPhone Safari 真机E2E验证」
> **Status**: 🟡 DISPATCH DRAFT（newvps 端实操 + iPhone Safari E2E 4 步 — user 自执行）
> **Author**: 架构师 Claude Fable 5 (claude-fable-5)
> **Worktree**: 主仓 `main`（无 worktree 隔离；documentation 类改动）

---

## §0 背景与决策

### 0.1 原方案问题（iPhone Tailscale starting 卡死）

**根因**：iOS 一次只允许**一个** VPN profile 处于 active。
- Shadowrocket（小火箭）启动后建 VPN profile 接管所有流量（提供外网通道）
- Tailscale App 启动时想建第二个 VPN profile → iOS 拒绝 → 永远卡在 connecting / starting
- Gmail 国内被墙 → Tailscale 协调服务器（controlplane.tailscale.com / login.tailscale.com）连不上 → 卡 starting

### 0.2 三方案对比（per 前序轮答复）

| 方案 | iPhone 需装 App | 延迟 | 复杂度 | 推荐度 |
|------|------------------|------|--------|--------|
| **A. Tailscale Funnel**（本指南）| ❌ 不需要 Tailscale App | +50-100ms（经 Cloudflare）| 5 min | ⭐⭐⭐⭐⭐ |
| B. Shadowrocket 全局代理 + Tailscale 关闭 VPN | ✅ Tailscale App（仅客户端模式）| 低 | 15 min | ⭐⭐⭐ |
| C. Cloudflare Tunnel（换 DNS）| ❌ | 低 | 30 min + 架构改 | ⭐⭐ |

### 0.3 决策

**选方案 A（Tailscale Funnel）**：
- iPhone 完全不需要 Tailscale App，Shadowrocket 保持 VPN 不冲突
- 5 分钟搞定
- 缺点是流量经 Cloudflare 中转（+50-100ms 延迟），但 E2E 验证够用
- 生产 iOS App 可改直接 Tailscale VPN（无 Funnel 中转）

---

## §1 任务定义（一句话）

在 newvps 上启用 Tailscale Funnel 把 harness 服务的 443 端口暴露到公网 HTTPS，让 iPhone Safari 通过 `https://<node-name>.ts.net` 访问 harness，无需在 iPhone 装 Tailscale App，避免与 Shadowrocket VPN 嵌套冲突。

---

## §2 前提条件

| 条件 | 验证命令 | 期望 |
|------|----------|------|
| newvps 已部署 harness 容器 | `ssh puer-hk 'docker ps \| grep harness'` | 含 `harness-app` 容器 STATUS=Up |
| harness 监听 localhost:8080（或具体端口）| `ssh puer-hk 'curl -s http://localhost:8080/health'` | 200 + 健康检查响应 |
| Tailscale 已登录 newvps | `ssh puer-hk 'tailscale status'` | 含 `100.x.x.x <node-name> user@ linux active` |
| Tailscale 版本 ≥ 1.34（Funnel 支持）| `ssh puer-hk 'tailscale version'` | ≥ 1.34 |
| newvps 节点 MagicDNS 启用 | `ssh puer-hk 'tailscale status --json' | jq '.MagicDNSEnabled'` | true |
| iPhone 已装 Shadowrocket 并连外网 | iPhone → Shadowrocket → 启动 VPN → Safari 访问 https://www.google.com | 通 |
| iPhone Safari 可访问任意 HTTPS | iPhone → Safari → 访问 https://github.com | 通 |

---

## §3 newvps 端 Funnel 启用实操（5 步）

### 步骤 1：SSH 到 newvps（永远用 ssh puer-hk，不是 ssh aliyun！）

```bash
# ⚠️ per ssh-puer-hk-host-agent-server.md 红线
# ssh aliyun -p 16921 是 mail.rana.asia! 不能用
ssh puer-hk

# 确认是新网
hostname  # 期望含 newvps 字样
pwd       # 期望 /root 或 /home/<user>
```

### 步骤 2：检查 Tailscale 节点状态

```bash
tailscale status
```

**期望输出**：
```
100.64.0.2   newvps-1   user@gmail.com   linux   -   active; direct, exit node; offers exit node
```

**关键字段**：
- `100.64.0.2`（Tailscale IP）
- `newvps-1`（**节点名**，决定 Funnel URL `<node-name>.ts.net`）
- `active; direct`（节点在线 + 直连）
- `offers exit node`（可选，不影响 Funnel）

### 步骤 3：启用 HTTPS 端口（Funnel 必须 443）

```bash
# 如果之前没 up 过
sudo tailscale up --accept-dns=true --https=443

# 如果已经 up 过，加 --https=443 不影响现有设置
sudo tailscale up --https=443
```

**期望输出**：
```
Success.
```

**验证 HTTPS 已启用**：
```bash
tailscale status --json | jq '.Prefs.AllowSingleHosts | {HTTPS: .[443], RunSSH: .[22]}'
# 期望: { "HTTPS": true, ... }
```

### 步骤 4：启用 Funnel

**方式 A（推荐，background + 本地 URL 映射）**：
```bash
sudo tailscale funnel --bg 443 http://localhost:8080
```

**方式 B（仅启用 Funnel，不指定 local URL，用 iptables 自动转发）**：
```bash
sudo tailscale funnel 443 on
```

**期望输出**：
```
Funnel is started.

https://newvps-1.ts.net
  |-- /health  → http://localhost:8080/health
  |-- /*        → http://localhost:8080/*
```

**关键信息**：
- `https://newvps-1.ts.net` ← **这就是 iPhone Safari 要访问的 URL**
- Tailscale 自动通过 Let's Encrypt 申请 HTTPS cert（首次启用需 30-60s 签发）

### 步骤 5：验证 Funnel 工作

```bash
# 5.1 查看 Funnel 状态
tailscale funnel status
# 期望输出含:
# - https://newvps-1.ts.net (port 443) 状态: active
# - cert 由 Let's Encrypt 签发

# 5.2 本地验证（newvps 内部 curl，绕开外网）
curl -sI https://newvps-1.ts.net/health
# 期望:
# HTTP/2 200
# server: Tailscale Funnel
# content-type: application/json

# 5.3 外部验证（必须从 iPhone 或非 Tailscale 网络访问，证明 Funnel 真暴露）
# 在 macOS 本机（无 Tailscale）执行：
curl -sI https://newvps-1.ts.net/health
# 期望同上（HTTP/2 200）
```

**如果步骤 5.2 通过但 5.3 失败**：Funnel 配置正确但 Let's Encrypt cert 还在签，等 60s 后重试 5.3。

**如果步骤 5.2 也失败**：
- 检查 harness 容器：`docker ps | grep harness`
- 检查 harness 健康端点：`curl -s http://localhost:8080/health`
- 检查 Funnel 端口：`tailscale funnel status` 看端口是否 active

---

## §4 iPhone Safari 真机 E2E 4 步

### 步骤 1：打开 Safari 访问 Funnel URL

- 打开 iPhone Safari
- 地址栏输入 `https://newvps-1.ts.net`（替换 `<node-name>` 为实际节点名）
- 期望：看到 harness 首屏 UI（标题 + 主功能入口）

### 步骤 2：表单提交（核心交互）

- 在 Safari 上找到一个表单（比如登录、提交数据、创建任务等）
- 填写表单 + 提交
- 期望：表单提交成功 + 服务端响应（200/201 + JSON 或 HTML）

### 步骤 3：24h 完成（异步任务验证 — 可选）

- 如果 harness 有异步任务（如后台处理、定时任务）
- 等 24 小时（或任务 SLA 时间）
- iPhone Safari 刷新页面或重新查询
- 期望：任务状态从 pending → completed

### 步骤 4：完成态可见

- iPhone Safari 检查任务/订单/记录列表
- 期望：新提交的内容可见，状态正确

### E2E 验证证据收集

| 步骤 | 截图 | 网络请求证据 |
|------|------|--------------|
| 1 打开 | 截 Safari 首屏 | iPhone 设置 → Safari → Advanced → Web Inspector 可看请求（macOS Safari Develop 菜单可连）|
| 2 表单提交 | 截提交后页面 | 同上 |
| 3 24h 完成 | 截完成后页面 | 同上 |
| 4 完成态 | 截列表页 | 同上 |

---

## §5 验证清单（verbatim 6 项）

```bash
# 1. newvps harness 容器运行
ssh puer-hk 'docker ps | grep harness'
# 期望: STATUS=Up 含 harness-app

# 2. harness localhost 健康检查
ssh puer-hk 'curl -sI http://localhost:8080/health'
# 期望: HTTP/1.1 200

# 3. Tailscale 节点 online
ssh puer-hk 'tailscale status'
# 期望: 100.x.x.x <node-name> ... active; direct

# 4. Tailscale Funnel active
ssh puer-hk 'tailscale funnel status'
# 期望: https://newvps-1.ts.net active + cert issued

# 5. Funnel 本地 curl 通
ssh puer-hk 'curl -sI https://newvps-1.ts.net/health'
# 期望: HTTP/2 200 + server: Tailscale Funnel

# 6. Funnel 外部 curl 通（macOS 本机无 Tailscale）
curl -sI https://newvps-1.ts.net/health
# 期望: HTTP/2 200（证明 Funnel 真公网可达）
```

iPhone Safari 4 步验证 + 截图 + 网络请求证据另存为 `docs/reports/T-M1c-DO-1-iPhone-E2E-evidence/` 子目录（待 user 实测后归档）。

---

## §6 回滚与备选

### 6.1 Funnel 不通回滚

```bash
# 关闭 Funnel
ssh puer-hk 'sudo tailscale funnel 443 off'

# 或关闭 HTTPS
ssh puer-hk 'sudo tailscale up --https=0'

# Funnel 关闭后 iPhone Safari 访问 https://newvps-1.ts.net 应报"无法连接"
```

### 6.2 备选方案（如 Funnel 长期不通）

| 备选 | 切换命令 |
|------|----------|
| 方案 B（Shadowrocket 全局代理 + Tailscale 关闭 VPN）| 见前序轮答复 0.2 节 |
| 方案 C（Cloudflare Tunnel 换 DNS）| `cloudflared tunnel create harness && cloudflared tunnel route dns harness harness.rana.asia && cloudflared tunnel run --url http://localhost:8080 harness` |

---

## §7 估时

- **newvps 端实操（§3 5 步）**：10 min（含 Let's Encrypt cert 签发等待 30-60s）
- **iPhone Safari E2E（§4 4 步）**：5 min（不含 24h 异步等待）
- **总估时**：15 min + 24h 异步任务等待（可选步骤 3）

---

## §8 报告模板

落点：`docs/reports/T-M1c-DO-1-iPhone-E2E-funnel-report.md` ~150 行 6 段：

1. **§1 Funnel 启用实证**：5 步命令实测输出（节点名、URL、cert 状态）
2. **§2 iPhone Safari E2E 4 步截图**：步骤 1-4 各 1 截图（嵌入 base64 或引用 `docs/reports/T-M1c-DO-1-iPhone-E2E-evidence/` 子目录）
3. **§3 网络请求证据**：iPhone Safari Web Inspector 抓包（关键请求 URL + 状态码）
4. **§4 性能数据**：首屏 TTFB、Funnel 中转延迟（与直连 Tailscale VPN 对比）
5. **§5 verbatim 验证 6 项结果**
6. **§6 cross-ref + next**：DD-1 README M1 段引用本报告作为 iPhone 部署/启动步骤

---

## §9 cross-ref

- `docs/v1.1-ga-team-plan.md` §1 M1c 阶段 + §10.4 v0.3 升级门槛
- `docs/DISPATCH-T-M1c-DO-1.md`（DO 角色模板；M1c DO-1 实施报告 6ea2fae 已有先例）
- `docs/DISPATCH-T-M1c-DD-1.md`（DD-1 任务书 §3.2 README M1 段引用本报告作为 iPhone 部署步骤）
- `docs/reports/T-M1c-DO-1-report.md`（M1c DO-1 实施报告，newvps 真部署 6 大坑）
- `deploy/tailscale-serve-harness.yaml`（Tailscale Serve 配置；Funnel 是 Serve 的公网扩展）
- `deploy/newvps-compose.yml`（newvps harness 容器编排）
- `newvps-harness-deploy-gotchas.md`（newvps 部署 6 大坑实战 + ssh-puer-hk 红线）
- `ssh-puer-hk-host-agent-server.md`（永远 ssh puer-hk，不要 ssh aliyun -p 16921）

---

## §10 元数据自检

- [x] §0 背景与决策（3 方案对比 + 选 Funnel）
- [x] §1 任务定义（一句话）
- [x] §2 前提条件 7 项（newvps/Tailscale/harness/iPhone Shadowrocket/Safari HTTPS）
- [x] §3 newvps 端 5 步实操（SSH → 节点状态 → HTTPS → Funnel → 验证）
- [x] §4 iPhone Safari 4 步 E2E（打开 / 表单 / 24h / 完成态）
- [x] §5 verbatim 验证 6 项
- [x] §6 回滚与备选（Funnel off + 方案 B/C）
- [x] §7 估时 15 min + 24h 异步
- [x] §8 报告模板 6 段 ~150 行
- [x] §9 cross-ref 8 引用（含 ssh-puer-hk 红线）
- [x] 不锁型号守门（无 grep pattern 字面）
- [x] v1.0 runtime 不漂移守门（仅 docs/ + deploy/，不触及 harness/）
- [x] DEEPSEEK_API_KEY 不入 commit（env-inject only 字样）
- [x] Co-Authored-By 用 `Claude Code` 不写 `Claude Fable 5`
- [x] 1 文件 NEW < 3 文件 → /review 强制线（per global CLAUDE.md）将由 DD-1 实施前 Codex precommit 触发

---

*iPhone E2E 实操指南 — Tailscale Funnel 5 步启用 + iPhone Safari 4 步验证 + 截图 + 网络证据 + 备选回滚。user 自执行（newvps 端命令 + iPhone Safari 实操），架构师仅写 playbook + 等 evidence 归档。DD-1 通过后 README M1 段引用本报告作为 iPhone 部署/启动步骤权威指引。Co-Authored-By: Claude Code <noreply@anthropic.com>*