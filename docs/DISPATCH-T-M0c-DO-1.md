# DISPATCH-T-M0c-DO-1 — Tailscale-Only + newvps 共址 + 1 worker 部署

> **Date**: 2026-09-02
> **Triggered by**: v1.1 GA plan v0.1 升级（user 「选 (a) v0.1 升级 GO」）
> **Source**: `docs/v1.1-ga-team-plan.md` §2.3（v0.1 升级后 T-M0c-DO-1 行）+ §6.2 M0c PR5
> **Status**: 任务书起草完成（等 user 「Start v1.1 M0c」启动实施）

---

## §1 任务定义

在 newvps 上部署 v1.1 product-foundation（M0c）的最小可用拓扑：
- v1.0 runtime kernel 容器（Python，frozen）
- dsh wrapper 容器（TypeScript，BE-1/TG-1 产出）
- 1 worker（同机）
- Tailscale Serve HTTPS（不走公网）
- Tailscale ACL（严格限制）

## §2 输入

- **M0b RAM 报告**：`docs/DISPATCH-T-M0b-DO-1.md` §newvps RAM verdict（total 7.8 GB / available 6.0 GB / M1 估测 1.7 GB / 余量 3.5x PASS）
- **capability JSON**：`spec/capabilities/newvps_ram.json`
- **Tailscale 拓扑**：v0.6 Stage 1 已有 Tailscale 拓扑（PRD-v1.1 §4.1 引用）
- **PRD-v1.1 §4.1 认证 = Tailscale-only**：v1.0 runtime 走 Tailscale Serve HTTPS
- **v1.0 容器基础**：`Dockerfile` + `docker-compose.yml`（v1.0 GA 容器，**不动**）
- **Tailscale Serve config**：从 v0.6 Stage 1 复制扩展

## §3 产出

### 3.1 文件

- `deploy/newvps-compose.yml`（newvps 拓扑编排）
- `deploy/tailscale-serve-harness.yaml`（Tailscale Serve 配置 — harness.rana.asia）
- `deploy/tailscale-acl.yaml`（ACL 限制 — 仅允许 owner + 1 worker 设备）
- `deploy/env/newvps.env.example`（env 模板 — DEEPSEEK_API_KEY 等敏感变量仅占位，不硬编码）
- `deploy/README.md`（部署流程 + 验证命令 + 回滚步骤）

### 3.2 部署拓扑

```
[Owner iPhone Safari]
    ↓ Tailscale (走内网 HTTPS)
[harness.rana.asia :443]
    ↓ Tailscale Serve
[newvps (10.x.y.z)]
    ├── harness v1.0 runtime 容器 (Python kernel, /health + API)
    ├── dsh wrapper 容器 (TypeScript, M0c 产出)
    └── 1 worker (orchestrator/commander/worker skeleton 实接)
```

### 3.3 关键约束

- ❌ 不走公网 HTTPS（仅 Tailscale 内网）
- ❌ 不开放 Basic Auth（PRD-v1.1 §4.1 删 Basic Auth，仅 Tailscale）
- ❌ 不暴露端口（除 Tailscale 443）
- ❌ 不硬编码 DEEPSEEK_API_KEY（env-inject only）
- ✅ Tailscale ACL 严格（owner + 1 worker 设备 ID）
- ✅ v1.0 runtime kernel **不动**（容器化已 frozen）
- ✅ newvps RAM 余量 ≥ 2.5x（M0b 已验 3.5x）
- ✅ curl https://harness.rana.asia:443 exit 0 + import harness 1.0.0

## §4 验证命令

```bash
# 1. Tailscale 拓扑走通（owner 设备 + 1 worker 设备 + newvps）
ssh newvps 'tailscale status'
# 期望: 3 个设备 + harness.rana.asia 已 serve

# 2. v1.0 runtime kernel /health 端点
ssh newvps 'docker exec harness-kernel python -c "import harness; print(harness.__version__)"'
# 期望: 1.0.0

# 3. Tailscale Serve HTTPS 走通
curl https://harness.rana.asia:443/health
# 期望: HTTP 200 + JSON {"status": "ok"}

# 4. 不走公网（验证仅 Tailscale 内网可访问）
curl https://harness.rana.asia:443/health  # 走 Tailscale
# 期望: HTTP 200

# 5. newvps RAM 余量实跑（M0b 后确认）
ssh newvps 'free -h'
# 期望: available ≥ 4 GB（M1 估测 1.7 GB）

# 6. 1 worker 健康
ssh newvps 'docker exec harness-dsh-wrapper npm run worker:status'
# 期望: worker online

# 7. 不硬编码 API key 守门
grep -rE "sk-[a-z0-9]{32,}" deploy/
# 期望: 0 行（仅占位符）

# 8. 不锁型号守门：详见 `notes/codex-audit-scope-v1.1-m0c-v0.1.md` §1（grep 范围不含 notes/，避免自伤）

# 9. v1.0 runtime 0 行 diff 守门
git diff v1.0.0..HEAD -- harness/ Dockerfile docker-compose.yml
# 期望: 0 行
```

## §5 估时

- **3-5 天**（DO 工程师 1 人）
- 与 PRD-v1.1 §5 "M0c (2-3 周)" 对齐；本任务占总 M0c 时长 15-25%

## §6 报告模板（实施者填）

```markdown
## §6 实跑报告（实施者填）

- **Wall time**: Xd
- **代码/部署 diff**: `deploy/*` +N/-M 行
- **Tailscale 拓扑**: 3 设备（owner + 1 worker + newvps）确认
- **v1.0 runtime kernel**:
  - `python -c "import harness; print(harness.__version__)"`: 1.0.0
  - HTTP `/health`: 200
- **Tailscale Serve HTTPS**:
  - `curl https://harness.rana.asia:443/health`: 200
- **newvps RAM 实跑**:
  - total / available / M1 估测: X / Y / Z GB
  - 余量: Nx
- **不硬编码 API key**: PASS
- **不锁型号**: PASS
- **v1.0 runtime 0 行 diff**: PASS
- **回滚步骤测试**: PASS（部署 + 验证 + 回滚 3 步演练）
```

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.3 T-M0c-DO-1 行（v0.1 升级后）+ §6.2 M0c PR5
- `docs/DISPATCH-T-M0b-DO-1.md`（M0b DO 实跑报告 — newvps RAM verdict PASS）
- `docs/DISPATCH-T-M0b-DONE.md` §4 capability JSON newvps_ram.json
- `PRD-v1.1 §4.1 认证 = Tailscale-only`（裁定 1）
- `NORTH-STAR §7` 认证改 Tailscale-only（删 Basic Auth）
- `spec/capabilities/newvps_ram.json`
- v0.6 Stage 1 Tailscale 拓扑（PRD-v1.1 §4.1 引用）
- v1.0 Tailscale Serve 配置（如有）

## §8 禁止

- ❌ 不走公网 HTTPS（仅 Tailscale 内网）
- ❌ 不开放 Basic Auth（PRD-v1.1 §4.1 删 Basic Auth）
- ❌ 不暴露端口（除 Tailscale 443）
- ❌ 不硬编码 DEEPSEEK_API_KEY（env-inject only；GH013 教训）
- ❌ 不动 v1.0 runtime kernel（ADR 0010 Decision (d) 0 行 diff 守门）
- ❌ 不锁具体型号

---

*任务书 ready for Cursor 审阅 — 等 user 「Start v1.1 M0c」启动实施*