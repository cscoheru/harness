# DISPATCH-T-M0c-DONE — M0c 总报告

> **Date**: 2026-09-02
> **Triggered by**: T-M0c 5 subagent 收口 + v0.2 升级落地
> **Source**: v1.1 GA plan v0.1 §2.1-§2.5 + §6 PR4-7 + §10.4 v0.2 准备清单

---

## §1 5 subagent PASS 判定（M0c 阶段 1 骨架轮）

| 任务 ID | 角色 | 产出 (文件/行) | commit 链 | 验证 | 判定 |
|---------|------|---------------|----------|------|------|
| T-M0c-BE-1 | Role BE | `wrapper/orchestrator/{orchestrator,commander,worker,types}.ts` + tsconfig + package.json + .gitignore = **7 文件 / 723 行** | b768097 (合并 aebbcc6) | `tsc --noEmit` exit 0 + `npm test` exit 0 + 10 Python Protocol 对位 (不 1:1) | **PASS** |
| T-M0c-TG-1 | Role TG | `wrapper/dsh/{dsh_client,tool_provider,types}.ts` + tsconfig/package/.gitignore = **6 文件 / 334 行** | d168217 (合并 b41b2c7 1b0f796) | `tsc --noEmit` exit 0 + profile headless grep 0 + 不锁型号 grep 0 + Python 8 字段 → TS 4 字段简化对位 | **PASS** |
| T-M0c-QA-1 | Role QA | `wrapper/test/{unit/{orchestrator,commander,worker},integration/dsh_client,e2e/skeleton}.test.ts` + vitest.config.ts = **7 文件 / 188 行** | 23f976e (合并 cdd8449 b41b2c7) | vitest 3.2.7 / 4 passed + 1 todo / exit 0 | **PASS** |
| T-M0c-DO-1 | Role DO | `deploy/newvps-compose.yml` + `tailscale-serve-harness.yaml` + `tailscale-acl.yaml` + `env/newvps.env.example` = **4 文件 / 291 行** | 6ea2fae (合并 e99393d) | yaml.safe_load x3 exit 0 + API key grep 0 + Tailscale-only + mem_limit 512m × 3 (1.5 GB in 7.8 GB 余量) | **PASS** |
| T-M0c-DD-1 | Role DD | `CHANGELOG.md` [1.1.0-M0c] 段 + `README.md` v1.1 段 + `docs/v1.1-ga-team-plan.md` §10.4 = **3 文件 / +67 行** | 7a94ade (合并 97f371b) | CHANGELOG format PASS + README format PASS + 不锁型号 grep 0 + v1.0 GA 段保留 | **PASS** |

**收口 fix**: 3efe7dc (M0c dsh_client integration test node16 import path; vi.mock path 改 ../../dsh/dsh_client.ts + 移除未用 import + package-lock.json 落地 1641 行)

**5 subagent 总判定**: **PASS**（全部）

---

## §2 6 commits 链（实测）

```
b768097  feat(m0c): merge T-M0c-BE-1 wrapper skeleton                          (8 files / +827 lines)
d168217  feat(m0c): merge T-M0c-TG-1 dsh wrapper TS client + tool provider     (7 files / +412 / -6 lines)
23f976e  feat(m0c): merge T-M0c-QA-1 TS wrapper 集成测试 + M1 E2E 前置         (7 files / +188 / -3 lines)
6ea2fae  feat(m0c): merge T-M0c-DO-1 Tailscale-only + newvps 共址 + 1 worker    (5 files / +450 lines)
7a94ade  feat(m0c): merge T-M0c-DD-1 CHANGELOG v1.1 + README v1.1 + v0.2 准备    (3 files / +67 lines)
3efe7dc  fix(m0c): dsh_client integration test node16 import path              (2 files / +1643 / -4 lines)
```

**总产出**: 32 文件 / +3587 / -13 行（含 5 merge + 1 fix）

---

## §3 M0c 阶段 1 骨架轮守门（实测）

| 守门项 | 命令 | 实测 | 期望 | 判定 |
|--------|------|------|------|------|
| TypeScript 编译 | `npx tsc --noEmit -p wrapper/tsconfig.json` | exit 0 | exit 0 | ✅ PASS |
| 单元测试 | `npx vitest run` | 4 passed + 1 todo + 1 skipped | exit 0 | ✅ PASS |
| 不锁型号 (NORTH-STAR A-4) | `grep -rE "Fable 5|GLM 5.3\|MiniMax-M3" wrapper/ deploy/ env/ CHANGELOG.md README.md` | 0 行 | 0 行 | ✅ PASS |
| 不硬编码 API key | `grep -rE "sk-[a-z0-9]{32,}" wrapper/ deploy/ env/` | 0 行 | 0 行 | ✅ PASS |
| dsh `headless` profile | `grep -rE "profile: ['\"]web['\"]" wrapper/` | 0 行 | 0 行 | ✅ PASS |
| Python Protocol 对位 (不 1:1) | types.ts 字段 vs spec/interfaces/*.py | 8 字段 → 4 字段简化 | 不 1:1 | ✅ PASS |
| v1.0 runtime 0 行 diff | `git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml` | 0 行 | 0 行 | ✅ PASS |
| yaml 语法（DO-1） | `python3 -c "import yaml; yaml.safe_load(open('deploy/newvps-compose.yml'))"` | exit 0 | exit 0 | ✅ PASS |
| Tailscale-only (DO-1) | `deploy/newvps-compose.yml` 公网 port 扫描 | 0 行 | 0 行 | ✅ PASS |
| mem_limit 总内存（DO-1） | 512m × 3 容器 = 1.5 GB in 6.0 GB available | 余量 4× | 余量 ≥ 3× | ✅ PASS |

---

## §4 M0c 阶段 1 ≠ M0c 完整任务（关键 caveat）

> **M0c 阶段 1 是骨架轮**：仅落地 stub 函数签名 + 配置 + 验证命令。**M0c 完整实施 = M1c 阶段**（T-M1c-BE-1/TG-1/DO-1/QA-1/DD-1 5 任务书细化，per v1.1 GA plan v0.2 §2.1-§2.5）。

**已落地**（M0c 阶段 1）:
- ✅ wrapper skeleton (3 orchestrator files + types.ts = 723 行)
- ✅ dsh wrapper TS client + tool provider stub (3 files = 334 行)
- ✅ 集成测试 skeleton (5 tests = 188 行)
- ✅ Tailscale + newvps-compose + ACL + env example (4 files = 291 行)
- ✅ CHANGELOG [1.1.0-M0c] + README v1.1 段 + plan §10.4 v0.2 准备清单 (3 files = 67 行)

**留给 M1c**（阶段 2 深度实施）:
- ❌ wrapper 实接 v1.0 kernel HTTP API + dsh invoke + PWA server (per T-M1c-BE-1, 7 工作日)
- ❌ dsh 真调 + 3 档 profile 适配 + profile.ts 读 YAML (per T-M1c-TG-1, 5 工作日)
- ❌ newvps 真部署 runbook + user 上 newvps `docker compose up` + Tailscale serve (per T-M1c-DO-1, 3 工作日, user 执行)
- ❌ iPhone Safari 真机 E2E 4 步 + dsh 真调集成测试 + 单测覆盖率 ≥ 80% (per T-M1c-QA-1, 5 工作日)
- ❌ CHANGELOG [1.1.0-M1c] 段 + README v1.1 M1 段 + v0.3 准备清单 (per T-M1c-DD-1, 2 工作日)

---

## §5 M0c 总判定 + 下一步

**M0c 总判定**: **PASS**（5 subagent 全 PASS + 6 commits 链落地 + 10 项守门全过）

**v0.1 → v0.2 升级门槛**（per v1.1 GA plan §10.4，7/8 ✅）:
- ✅ M0b 全链路 PASS（commit 5b3d263）
- ✅ M0c 阶段 1 骨架 PASS（5 subagent + 6 commits）
- ✅ M0c 5 DISPATCH 任务书细化完成（per T-M0c-DISPATCH）
- ✅ M1c 5 DISPATCH 任务书细化完成（per T-M1c-DISPATCH）
- ✅ hygiene audit-scope v0.2 precommit 落 `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md`（grep 自伤豁免 §1.5 锚定）
- ✅ Codex 复审 prompt v0.2 precommit 落 `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md`
- ✅ v0.2 升级 commit 已 ready（cc-ready.json task_id=T-M1c-GATE-REPAIR；GATE-REPAIR 1C/2M/2m 修复完成）
- ❌ **#3 newvps 真部署**（待 user 上 newvps `git clone` + `docker compose -f deploy/newvps-compose.yml up -d` + `tailscale serve --bg`）

**M0c → M1c 移交**（架构师裁断）:
- M0c 5 subagent 收口 + 6 commits 链 + 守门全过 → M1c 5 角色任务书细化 → v0.2 升级 → 派 T-M1c-{BE-1,TG-1,DO-1,QA-1,DD-1} 5 任务实施
- 真实工程师（非 subagent）接手 M1c 5 任务（DO-1 需 user 上 newvps 真部署）
- M1c 估时 7 + 5 + 3 + 5 + 2 = 22 工作日（并行 4-5 周；与 PRD-v1.1 §5 M1 2 周 + 实施 buffer 对齐）

**下一步**:
- v0.2 升级 commit + Clash proxy push（per `docs/DISPATCH-T-M1c-GATE-REPAIR.md`）
- user 亲提 Codex CLI 走 formal 轮（per `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit-prompt.md` §4）
- user 上 newvps 真部署（per `docs/DISPATCH-T-M1c-DO-1.md` §5）
- user iPhone Safari 真机 E2E（per `docs/DISPATCH-T-M1c-QA-1.md` §5）
- 全部 PASS → v0.3 升级 → M2 阶段（6 host + STT + Web Push）
