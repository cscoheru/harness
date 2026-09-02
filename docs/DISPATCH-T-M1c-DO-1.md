# DISPATCH-T-M1c-DO-1 — newvps 真部署 (Tailscale-only + 1 worker 同机 + wrapper 容器)

> **Role**: DO (DevOps Engineer — Multi-Host Deployment)
> **Stage**: v1.1 M1c 实施合同（**等 user 「Start v1.1 M1」启动**；**部署由 user 真实操作，DO-1 仅写部署脚本 + runbook**）
> **Date**: 2026-09-02
> **Source**: `docs/v1.1-ga-team-plan.md` v0.2 §2.3 Role DO / §6.2 M1c PR9 / §10.4 v0.2 准备清单

---

## §1 任务定义

**一句话**: 编写 newvps 真部署 runbook（含 `git clone` + `docker compose -f deploy/newvps-compose.yml up -d` + `tailscale serve --bg --yaml=tailscale-serve-harness.yaml`）+ Tailscale ACL 配置文件 + env 模板（含 DEEPSEEK_API_KEY env-only 占位）+ 验证命令。**部署本身由 user 真实执行**（subagent 不能上 newvps；per PRD-v1.1 §4.1 Tailscale-only）。

**范围**:
- ❌ 不做: 6 host 部署 (M2) / STT 容器 (M2) / Web Push VAPID (M2)
- ❌ 不做: 真实 git clone + docker compose up (DO-1 仅写 runbook; user 真部署)
- ✅ 做: newvps 共址部署 runbook + Tailscale Serve HTTPS 配置 + Tailscale ACL 配置 + env 模板 + 验证命令清单

**关键路径产物**:
1. `deploy/runbook-newvps-m1c.md` (NEW): step-by-step 部署 runbook（user 真实执行）
2. `deploy/newvps-compose.yml` (M0c DO-1 已建 `e99393d`, M1c 扩: 加 wrapper 容器 + PWA server 端口映射)
3. `deploy/tailscale-serve-harness.yaml` (M0c DO-1 已建): Tailscale Serve HTTPS 配置（端口 443 + 自签证书路径）
4. `deploy/tailscale-acl.yaml` (M0c DO-1 已建): Tailscale ACL 严格限制（仅 user 设备 + newvps 内网）
5. `env/newvps.env.example` (M0c DO-1 已建 `4cf0ece`, M1c 扩: 加 DEEPSEEK_API_KEY env-only 占位 + WRAPPER_PORT + PWA_PORT)

## §2 输入

- M0c DO-1 部署骨架 commit `e99393d` + `6ea2fae` (Tailscale-only + newvps 共址 + 1 worker 部署骨架)
- M0c RAM 报告 commit `4cf0ece` (newvps 7.8/6.0 GB 余量 3.5x PASS)
- newvps 拓扑 (Tailscale v0.6 Stage 1 已有)
- PRD-v1.1 §4.1 Tailscale-only 约束
- `Dockerfile` + `docker-compose.yml` (v1.0 frozen, 不动; newvps 复用 v1.0 容器)
- `spec/capabilities/newvps_ram.json` (M0b 落地)
- `wrapper/` (M0c BE-1 + TG-1 产出, M1c 在 newvps 容器内 build)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§3 (hygiene 守门)

## §3 产出

| # | 文件 | 行数估 | 内容 |
|---|------|--------|------|
| 1 | `deploy/runbook-newvps-m1c.md` (NEW) | ~150 行 | step-by-step 部署 runbook: §1 前置 (Tailscale 登录 + git clone + docker login) / §2 部署 (docker compose up) / §3 验证 (curl /health + Tailscale HTTPS) / §4 排错 (常见问题) |
| 2 | `deploy/newvps-compose.yml` (M1c 扩) | ~80 行 | 加 wrapper 容器 + PWA server 端口映射 (3000 → host) + Tailscale network attach |
| 3 | `deploy/tailscale-serve-harness.yaml` (M0c 已建, M1c 微调) | ~30 行 | Tailscale Serve HTTPS 配置: port 443 → wrapper:3000 + cert path |
| 4 | `deploy/tailscale-acl.yaml` (M0c 已建, M1c 微调) | ~50 行 | Tailscale ACL: 仅 user 设备 + newvps 内网 + 拒绝公网 |
| 5 | `env/newvps.env.example` (M1c 扩) | ~30 行 | 加 `DEEPSEEK_API_KEY=env-only-placeholder` + `WRAPPER_PORT=3000` + `PWA_PORT=3001` + `TS_AUTHKEY=env-only-placeholder` |
| 6 | `docs/reports/T-M1c-DO-1-report.md` (NEW) | ~100 行 | 实跑报告: §1 runbook 完成度 / §2 user 真部署验证 (待 user 上 newvps 后填) / §3 问题与解决 / §4 cross-ref |

## §4 验证命令 (架构师 + user 部署后验证)

```bash
# 1. runbook 文件存在 + 内容完整
test -f deploy/runbook-newvps-m1c.md && grep -c "^## §" deploy/runbook-newvps-m1c.md
# 期望: ≥ 4 (前置/部署/验证/排错)

# 2. compose 文件 valid YAML + 含 wrapper 容器
docker compose -f deploy/newvps-compose.yml config --quiet
# 期望: exit 0

# 3. Tailscale Serve 配置 valid YAML
yq eval '.services.harness' deploy/tailscale-serve-harness.yaml
# 期望: 非空 (含 port 443 + handler)

# 4. Tailscale ACL 严格限制 (per PRD-v1.1 §4.1)
grep -c "src:.*user-tag\|dst:.*newvps-tag" deploy/tailscale-acl.yaml
# 期望: ≥ 1 (含 user-tag + newvps-tag)

# 5. env 模板 env-inject only (per v0.2 §2)
grep -E "DEEPSEEK_API_KEY=" env/newvps.env.example
# 期望: 1 行, 内容为 `DEEPSEEK_API_KEY=env-only-placeholder` 或 `DEEPSEEK_API_KEY=__SET_ME_AT_DEPLOY__`

# 6. user 真部署后 (待 user 上 newvps 执行):
ssh newvps "cd /opt/fish-harness && docker compose -f deploy/newvps-compose.yml up -d"
# 期望: 容器启动成功 (kernel + wrapper + worker)

ssh newvps "curl -s http://localhost:3000/health"
# 期望: {"status": "ok"} HTTP 200

# 7. Tailscale HTTPS 走通 (走 Tailscale, 非公网)
curl -s https://harness.rana.asia:443/health
# 期望: {"status": "ok"} HTTP 200 (走 Tailscale)

# 8. v1.0 runtime 不漂移 (per v0.2 §3)
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行 (compose/yaml 不动 v1.0 容器)

# 9. DEEPSEEK_API_KEY 不泄漏 (per v0.2 §2)
grep -rE "sk-[a-z0-9]{32,}" deploy/ env/ | wc -l
# 期望: 0 行 (env-only 占位)

# 10. 不锁型号 (per v0.2 §1)
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" deploy/ env/ | wc -l
# 期望: 0 行
```

## §5 估时

**3 工作日** (依赖 BE-1/TG-1 部分产出):
- Day 1: runbook-newvps-m1c.md 起草 + 验证命令清单
- Day 2: newvps-compose.yml 扩 wrapper 容器 + tailscale-serve-harness.yaml 微调 + tailscale-acl.yaml 微调
- Day 3: newvps.env.example 扩 env-only 占位 + 实跑验证 (本地 docker compose config)

**user 真部署**: 等 user 上 newvps 执行 runbook (per PRD-v1.1 §4.6 第 3 条; user 真实部署). DO-1 报告 §2 留空待 user 部署后填。

## §6 报告模板 (docs/reports/T-M1c-DO-1-report.md)

```markdown
# T-M1c-DO-1 — newvps 真部署 runbook + Tailscale-only 配置 实施报告

## §1 任务完成度
- [ ] §3 产出 6 文件全部落地 (runbook + compose 扩 + tailscale-serve 微调 + tailscale-acl 微调 + env 扩 + 报告)
- [ ] §4 验证命令 #1-#5 + #8-#10 本地 exit 0 (runbook + 配置层)
- [ ] §4 验证命令 #6-#7 待 user 上 newvps 后填 (per §10.4 v0.2 准备清单 #3)

## §2 user 真部署验证 (待 user 上 newvps 后填)
- [ ] §4 #6 docker compose up -d 容器启动成功
- [ ] §4 #6 curl http://localhost:3000/health HTTP 200
- [ ] §4 #7 curl https://harness.rana.asia:443/health HTTP 200 (走 Tailscale)
- [ ] RAM 余量 ≥ 估测值 2.5x (per M0b 报告 7.8/6.0 GB 余量 3.5x)

## §3 问题与解决
- (列实跑中遇到的问题 + 修法)

## §4 cross-ref
- docs/v1.1-ga-team-plan.md v0.2 §2.3 + §6.2 PR9 + §10.4 #3
- docs/DISPATCH-T-M0c-DO-1.md
- deploy/runbook-newvps-m1c.md (NEW runbook)
- notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md §1-§3

## §5 守门自检
- [ ] 不锁型号 grep = 0
- [ ] DEEPSEEK_API_KEY 完整 key grep = 0 (env-only 占位)
- [ ] v1.0 runtime 0 行 diff (compose/yaml 不动 v1.0 容器)
- [ ] Tailscale-only 严格限制 (per PRD-v1.1 §4.1)
- [ ] runbook step-by-step 完整 (前置/部署/验证/排错)
```

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` v0.2 §2.3 + §6.2 PR9 + §10.4 #3 (newvps 真部署)
- `docs/DISPATCH-T-M0c-DO-1.md` (M0c 部署骨架输入)
- `docs/DISPATCH-T-M1c-BE-1.md` (BE-1 wrapper 在 newvps 容器内跑)
- `docs/DISPATCH-T-M1c-TG-1.md` (TG-1 dsh_client 容器化)
- `docs/DISPATCH-T-M1c-QA-1.md` (QA-1 真机 E2E 走 Tailscale)
- `docs/DISPATCH-T-M1c-DD-1.md` (DD-1 CHANGELOG/README 同步部署细节)
- `deploy/` (M0c DO-1 已建 compose + tailscale; M1c 扩)
- `env/newvps.env.example` (M0c DO-1 已建)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§3

## §8 禁止

- ❌ 不做 6 host 部署 (M2) / STT 容器 (M2) / Web Push VAPID (M2)
- ❌ 不做真实 git clone + docker compose up (DO-1 仅写 runbook; user 真部署 per §10.4 #3)
- ❌ 不硬编码 DEEPSEEK_API_KEY (仅 env-only 占位 in env/newvps.env.example)
- ❌ 不动 Dockerfile + docker-compose.yml (v1.0 frozen)
- ❌ 不开公网端口 (Tailscale-only per PRD-v1.1 §4.1)
- ❌ 不直接 commit 到 main (实施者 PR → 架构师 merge)

---

*DISPATCH-T-M1c-DO-1 — newvps 真部署 runbook + Tailscale-only 配置 任务书；部署由 user 真实执行 (per §10.4 #3 待 user 上 newvps 后勾)；hygiene 守门见 `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md`*