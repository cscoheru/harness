# T-M1c-QA-1 — iPhone Safari 真机 E2E Runbook

> **Status**: M1c smoke complete; full 4-step runbook ready for user execution
> **Date**: 2026-09-02
> **Scope**: M1 E2E 4 步 (PRD-v1.1 §5 收紧版 MVP)
> **Prerequisites**: newvps 部署完成 + Tailscale VPN 连接 + iPhone Safari

---

## §1 前置条件 (Prerequisites)

### 1.1 newvps 部署完成

```bash
# 在 newvps 上确认 harness 服务运行
curl https://harness.rana.asia:443/health
# 期望: {"status":"ok","version":"..."}
```

### 1.2 Tailscale VPN 连接 (iPhone)

1. iPhone 安装 Tailscale App（App Store）
2. 登录 Tailscale 账号（与 newvps 同一 tailnet）
3. 连接 VPN（开启 Tailscale 连接）
4. 确认 Tailscale IP 已分配

### 1.3 iPhone Safari 准备

1. 打开 Safari
2. 访问 `https://harness.rana.asia/`
3. 首次访问需确认进入（忽略证书警告，如提示）

### 1.4 测试任务准备

- 测试任务: `调研 React 19 新特性，列出 3 个要点`
- 预期完成时间: 24h 内（dsh 运行时间通常 30s - 5min）
- 预期产出: Markdown 格式调研报告

---

## §2 执行步骤 (4 步)

### 步骤 1: 打开 PWA 表单 (Step 1)

**操作**:
1. iPhone Safari 访问 `https://harness.rana.asia/`
2. 等待页面完全加载

**期望结果**:
- [ ] 页面显示 PWA 表单（输入框 + 提交按钮可见）
- [ ] 标题或 Logo 可见
- [ ] 无 JavaScript 报错

**验证命令**:
```bash
# Playwright smoke (本地运行)
cd wrapper && npx playwright test test/e2e/pwa_dispatch.test.ts
# 期望: Step 1+2 smoke exit 0
```

---

### 步骤 2: 填写任务 + 提交 (Step 2)

**操作**:
1. 在输入框（name=`prompt`）输入: `调研 React 19 新特性，列出 3 个要点`
2. 点击提交按钮（`type=submit`）

**期望结果**:
- [ ] 页面显示任务已提交（task_id 可见或状态变化）
- [ ] 状态显示: `pending` 或 `running` 或 `dispatched`
- [ ] 页面不再显示输入框，或输入框已清空

**手动验证**:
- 截图保存提交后的页面状态

---

### 步骤 3: 轮询任务状态 (Step 3)

**操作**:
1. 页面应自动轮询状态（前端 JS `setInterval` 每 5s）
2. 等待状态从 `running` 变为 `completed`（最长 24h）
3. 期间可关闭 Safari，任务在服务器继续运行

**自动轮询说明**:
- 前端 JS 应每 5s 调用 `GET /api/status/{task_id}`
- 状态流: `pending` → `running` → `completed`（或 `failed`）
- 若 5min 内状态未变化，刷新页面确认连接正常

**手动验证**:
- [ ] 状态从 pending → running 变化（约 10-30s）
- [ ] 状态从 running → completed 变化（约 30s - 5min）
- [ ] 若 10min 后仍 pending → 刷新页面 + 检查网络

---

### 步骤 4: 验证完成态 (Step 4)

**操作**:
1. 等待状态变为 `completed`
2. 查看结果区域

**期望结果**:
- [ ] 状态显示 `completed` 或 `done`
- [ ] 结果区域可见（Markdown 或文本格式）
- [ ] 结果内容与任务相关（React 19 新特性）

**手动验证**:
- [ ] 结果可读（非乱码）
- [ ] 内容与任务一致（至少 3 个要点）
- [ ] 截图保存完成态

---

## §3 验证清单 (Verification Checklist)

### 3.1 功能验证

| 检查项 | 状态 | 备注 |
|--------|------|------|
| PWA 表单加载 | ☐ | |
| 输入框可填写 | ☐ | |
| 提交按钮响应 | ☐ | |
| task_id 返回 | ☐ | |
| 状态轮询运行 | ☐ | |
| 状态 pending → running | ☐ | |
| 状态 running → completed | ☐ | |
| 结果区域可见 | ☐ | |
| 结果内容相关 | ☐ | |

### 3.2 非功能验证

| 检查项 | 状态 | 备注 |
|--------|------|------|
| 页面加载 < 5s | ☐ | |
| 任务 5min 内完成 | ☐ | |
| Safari 无崩溃 | ☐ | |
| Tailscale 连接稳定 | ☐ | |

---

## §4 排错 (Troubleshooting)

### 4.1 PWA 无法加载

**症状**: Safari 打开 `https://harness.rana.asia/` 无响应

**检查**:
1. Tailscale 已连接?（确认 VPN 图标亮起）
2. newvps 服务运行中?

```bash
# newvps 上检查
ssh puer-hk 'docker ps | grep harness'
```

3. Tailscale serve 路由正常?

```bash
# newvps 上检查
tailscale serve status
```

**解决**: 联系 DO-1 检查 `deploy/tailscale-serve-harness.yaml` 配置

---

### 4.2 提交后无 task_id

**症状**: 点击提交后页面无变化或报错

**检查**:
1. 网络请求是否发出（Safari 开发者工具 → 网络）
2. newvps 日志是否有错误

```bash
# newvps 上查看 harness 日志
ssh puer-hk 'docker logs puer-hub-app --tail 50 2>&1 | grep -i error'
```

**解决**: 联系 BE-1 检查 PWA server `src/app/api/pwa/dispatch/route.ts`

---

### 4.3 状态卡在 pending/running

**症状**: 状态长时间不变

**检查**:
1. dsh 进程是否在 newvps 运行

```bash
ssh puer-hk 'ps aux | grep dsh'
```

2. kernel worker 是否响应

```bash
curl https://harness.rana.asia:443/health
```

**解决**: 重启服务或检查 dsh 日志

---

### 4.4 结果区域为空

**症状**: 状态 completed 但无结果显示

**检查**:
1. 结果是否在数据库但未展示（UI bug）
2. 结果是否因 dsh 拒绝而为空

**解决**: 联系 BE-1 检查 PWA result display 组件

---

## §5 报告模板

执行完成后，请填写以下信息并汇报给架构师:

```
真机 E2E 4 步执行报告
日期: __________
执行人: __________
设备: iPhone Safari (iOS ___)

步骤 1 (PWA 加载): ✅/❌
  - 加载时间: ___s
  - 备注: __________

步骤 2 (提交任务): ✅/❌
  - task_id: __________
  - 备注: __________

步骤 3 (轮询状态): ✅/❌
  - pending → running: ___s
  - running → completed: ___s
  - 总耗时: ___s
  - 备注: __________

步骤 4 (结果可见): ✅/❌
  - 结果字数: ___
  - 内容摘要: __________
  - 备注: __________

问题与解决:
1. __________
2. __________

建议:
1. __________
```

---

## §6 Cross-ref

- `docs/DISPATCH-T-M1c-QA-1.md` — 任务书
- `docs/DISPATCH-T-M1c-EXEC.md` — 派发执行书 §10.4 v0.2 准备清单
- `wrapper/test/e2e/pwa_dispatch.test.ts` — Playwright E2E 脚本
- `docs/reports/T-M1c-QA-1-report.md` — 实施报告（本文档路径）

---

*QA-1 runbook — iPhone Safari 真机 E2E step-by-step; 由 user 真实操作（per DISPATCH-T-M1c-EXEC §8）；QA-1 仅提供脚本 + 验证清单*
