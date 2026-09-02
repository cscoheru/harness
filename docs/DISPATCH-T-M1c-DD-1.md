# DISPATCH-T-M1c-DD-1 — CHANGELOG v1.1 `[1.1.0-M1c]` + README v1.1 M1c 段 + v0.3 准备清单

> **Role**: DD (ADR & Docs & Reports Engineer)
> **Stage**: v1.1 M1c 实施合同（**等 user 「Start v1.1 M1」启动**）
> **Date**: 2026-09-02
> **Source**: `docs/v1.1-ga-team-plan.md` v0.2 §2.5 Role DD / §6.2 M1c PR11 / §10.4 v0.2 准备清单

---

## §1 任务定义

**一句话**: 在 M0c DD-1 commit `7a94ade` 的 CHANGELOG `[1.1.0-M0c]` + README v1.1 段 基础上, M1c 通过后 (待 user 「Start v1.1 M1」 + 实施完成) 增 `[1.1.0-M1c]` 段 + README v1.1 段补 M1 实施细节 + v1.1 GA plan v0.3 准备清单 (M2 任务书细化)。

**范围**:
- ❌ 不做: CHANGELOG `[1.1.0-GA]` 段 (M3 通过后才写 GA 段)
- ❌ 不写 M1 实施报告 (各角色 BE-1/TG-1/DO-1/QA-1 各自写报告; DD-1 写 CHANGELOG/README 总览段)
- ✅ 做: CHANGELOG `[1.1.0-M1c]` 段 (M1c 实施完成后) + README v1.1 段补 M1 实施细节 + v1.1 GA plan v0.3 准备清单 (M2 任务书细化)

**关键路径产物**:
1. `CHANGELOG.md` 增 `[1.1.0-M1c]` 段 (Keep a Changelog 1.1.0 格式, 引用 M1c 实施 5 commits + 新vps 真部署证据 + iPhone Safari E2E 4 步 + Tailscale HTTPS exit 0)
2. `README.md` v1.1 段补 M1 实施细节 (docusaurus 自述安装/启动 + Tailscale 登录 + iPhone Safari PWA 访问 + 文字表单提交示例)
3. `docs/v1.1-ga-team-plan.md` v0.3 准备清单 (M2 任务书细化: 6 host 部署 + STT + Web Push + Locality)
4. `notes/v1.1-m1c-release-notes.md` (NEW M1c release notes 草稿, 待 M3 GA 时合并到 `[1.1.0-GA]`)

## §2 输入

- M0c DD-1 commit `7a94ade` (CHANGELOG `[1.1.0-M0c]` + README v1.1 + v0.2 准备清单)
- ADR 0010 v1.1 cycle scope admission Accepted (commit `2b0953a`)
- M1c 5 任务 commit (BE-1/TG-1/DO-1/QA-1) — **待实施完成**
- newvps 真部署证据 (待 user 上 newvps 部署后; per §10.4 v0.2 准备清单 #3)
- iPhone Safari E2E 4 步证据 (待 user 真机执行; per T-M1c-QA-1 §4 #2)
- Tailscale HTTPS exit 0 证据 (待 user 真部署)
- `CHANGELOG.md` (v1.0.0 GA 段格式参考)
- `README.md` (v1.0.0 GA 段格式参考)
- `docs/v1.0-ga-team-plan.md` (格式参考)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§4 (hygiene 守门)

## §3 产出

| # | 文件 | 行数估 | 内容 |
|---|------|--------|------|
| 1 | `CHANGELOG.md` 增 `[1.1.0-M1c]` 段 | +50 行 | Keep a Changelog 1.1.0 格式: ### Added (iPhone PWA 派工 + TypeScript wrapper 实接 + dsh 真调 + Tailscale HTTPS + newvps 共址部署) / ### Changed / ### Fixed (per M1c 实施情况填) |
| 2 | `README.md` v1.1 段补 M1 实施细节 | +80 行 | docusaurus 自述安装/启动 + Tailscale 登录 + iPhone Safari PWA 访问 + 文字表单提交示例 (curl 或截图) + 4 步 E2E 说明 |
| 3 | `docs/v1.1-ga-team-plan.md` v0.3 准备清单 (M2 任务书细化) | +40 行 | §10.5 v0.3 准备清单 (M2 任务书细化: 6 host 部署 + STT + Web Push + Locality; 待 M1c 通过后 v0.3 升级) |
| 4 | `notes/v1.1-m1c-release-notes.md` (NEW) | ~80 行 | M1c release notes 草稿: §1 实施总结 / §2 用户视角 (Tailscale 登录 + PWA 访问 + 派工) / §3 已知限制 / §4 下一步 (M2 计划) |
| 5 | `docs/reports/T-M1c-DD-1-report.md` (NEW) | ~100 行 | 实跑报告: §1 任务完成度 / §2 实跑数据 (CHANGELOG format check + README build) / §3 问题与解决 / §4 cross-ref |

## §4 验证命令 (架构师最终验证)

```bash
# 1. CHANGELOG [1.1.0-M1c] 段存在 + Keep a Changelog 格式
grep -A 20 "## \[1.1.0-M1c\]" CHANGELOG.md | head -25
# 期望: ### Added / ### Changed / ### Fixed 三段齐全

# 2. CHANGELOG format check
grep -c "^### Added\|^### Changed\|^### Fixed\|^### Deprecated\|^### Removed\|^### Security\|^### Internal" CHANGELOG.md
# 期望: ≥ 3 ([1.1.0-M0c] + [1.1.0-M1c] 段各 ≥ 3 子段)

# 3. README v1.1 段存在 + 含 M1c 实施细节
grep -c "Tailscale\|iPhone Safari\|文字表单\|4 步" README.md
# 期望: ≥ 4 (M1c 实施细节关键词)

# 4. README build exit 0
npm run build  # 或 docusaurus build, per README 配置
# 期望: exit 0

# 5. v1.1 GA plan v0.3 准备清单新增 §10.5
grep -c "v0.3 准备清单\|10.5" docs/v1.1-ga-team-plan.md
# 期望: ≥ 1

# 6. M1c release notes 草稿存在
test -f notes/v1.1-m1c-release-notes.md && grep -c "^## §" notes/v1.1-m1c-release-notes.md
# 期望: ≥ 4 (实施总结/用户视角/已知限制/下一步)

# 7. v1.0 runtime 不漂移 (per v0.2 §3)
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0 行

# 8. 不锁型号 (per v0.2 §1)
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md notes/v1.1-m1c-release-notes.md | wc -l
# 期望: 0 行

# 9. DEEPSEEK_API_KEY 不泄漏 (per v0.2 §2)
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md notes/v1.1-m1c-release-notes.md | wc -l
# 期望: 0 行

# 10. M0c 总报告 + ADR 0010 不动
test -f docs/DISPATCH-T-M0b-DONE.md && echo "M0b 总报告 ✅"
test -f docs/DISPATCH-T-M0c-DONE.md && echo "M0c 总报告 ✅"
test -f adr/0010-v1.1-cycle-scope-admission.md && echo "ADR 0010 ✅"
```

## §5 估时

**2 工作日** (与 BE-1/TG-1/DO-1/QA-1 并行; **依赖 M1c 实施完成**):
- Day 1: CHANGELOG `[1.1.0-M1c]` 段 + README v1.1 段补 M1 实施细节
- Day 2: v1.1 GA plan §10.5 v0.3 准备清单 + notes/v1.1-m1c-release-notes.md 草稿

## §6 报告模板 (docs/reports/T-M1c-DD-1-report.md)

```markdown
# T-M1c-DD-1 — CHANGELOG v1.1 [1.1.0-M1c] + README v1.1 M1c 段 + v0.3 准备清单 实施报告

## §1 任务完成度
- [ ] §3 产出 5 文件全部落地
- [ ] §4 验证命令 #1-#10 全 exit 0

## §2 实跑数据
- CHANGELOG [1.1.0-M1c] 段: ### Added N 项 / ### Changed M 项 / ### Fixed K 项
- README v1.1 段补: Tailscale 登录 + iPhone Safari PWA 访问 + 文字表单提交示例 + 4 步 E2E 说明
- v1.1 GA plan §10.5 v0.3 准备清单: M2 任务书细化 (6 host + STT + Web Push + Locality)
- notes/v1.1-m1c-release-notes.md: M1c release notes 草稿 (实施总结/用户视角/已知限制/下一步)

## §3 问题与解决
- (列实跑中遇到的问题 + 修法)

## §4 cross-ref
- docs/v1.1-ga-team-plan.md v0.2 §2.5 + §6.2 PR11 + §10.4 v0.2 准备清单 + §10.5 v0.3 准备清单 (NEW)
- docs/DISPATCH-T-M0c-DD-1.md (M0c CHANGELOG/README 输入)
- docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1}.md (M1c 实施 commit 引用)
- notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md §1-§3

## §5 守门自检
- [ ] CHANGELOG format check (Keep a Changelog 1.1.0)
- [ ] README v1.1 段含 M1c 实施细节
- [ ] v0.3 准备清单 §10.5 新增
- [ ] M1c release notes 草稿 (notes/v1.1-m1c-release-notes.md)
- [ ] 不锁型号 grep = 0
- [ ] DEEPSEEK_API_KEY 完整 key grep = 0
- [ ] v1.0 runtime 0 行 diff
```

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` v0.2 §2.5 + §6.2 PR11 + §10.4 v0.2 准备清单 + §10.5 v0.3 准备清单 (NEW)
- `docs/DISPATCH-T-M0c-DD-1.md` (M0c CHANGELOG/README 输入)
- `docs/DISPATCH-T-M1c-{BE-1,TG-1,DO-1,QA-1}.md` (M1c 实施 commit 引用)
- `CHANGELOG.md` (v1.0.0 GA 段格式参考; M0c [1.1.0-M0c] 段输入)
- `README.md` (v1.0.0 GA 段格式参考; M0c v1.1 段输入)
- `adr/0010-v1.1-cycle-scope-admission.md` (v1.1 第一份 ADR)
- `notes/v1.1-m0c-release-notes.md` (M0c release notes 草稿; M1c 草稿同位)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§3

## §8 禁止

- ❌ 不写 CHANGELOG `[1.1.0-GA]` 段 (M3 通过后才写; per plan §6.2 v1.1.0 GA tag 流程)
- ❌ 不写 M1 实施报告 (各角色 BE-1/TG-1/DO-1/QA-1 各自写报告; DD-1 写 CHANGELOG/README 总览段)
- ❌ 不硬编码 DEEPSEEK_API_KEY (CHANGELOG/README 不写完整 key)
- ❌ 不锁具体模型型号 (per NORTH-STAR A-4)
- ❌ 不动 v1.0 GA CHANGELOG/README 段 (per T-DD-6 冻结规则 v1.0 已 GA)
- ❌ 不写 ADR 0011+ (本任务不新增 ADR; M2+ 才考虑新 ADR)
- ❌ 不直接 commit 到 main (实施者 PR → 架构师 merge)

---

*DISPATCH-T-M1c-DD-1 — CHANGELOG v1.1 `[1.1.0-M1c]` + README v1.1 M1c 段 + v0.3 准备清单 任务书；待 M1c 实施完成 + user 真部署 + iPhone Safari 真机 E2E 全过后执行；hygiene 守门见 `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md`*