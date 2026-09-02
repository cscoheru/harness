# DISPATCH-T-M1c-TG-1 — dsh 真调 + 3 档 profile 适配

> **Role**: TG (Tool Gateway Engineer — dsh wrapper TS client)
> **Stage**: v1.1 M1c 实施合同（**等 user 「Start v1.1 M1」启动**）
> **Date**: 2026-09-02
> **Source**: `docs/v1.1-ga-team-plan.md` v0.2 §2.2 Role TG / §6.2 M1c PR8 / §10.4 v0.2 准备清单

---

## §1 任务定义

**一句话**: 把 M0c 落地的 `wrapper/dsh/{dsh_client,tool_provider}.ts` skeleton 升级到 dsh 真调（env-inject DEEPSEEK_API_KEY）+ 3 档 profile 适配（orch/commander/worker 各自不同 model class + tier）。

**范围**:
- ❌ 不做: dsh `web` profile (per M0b QA-1 §6.X 修订; M1c 严禁)
- ❌ 不做: dsh 长连接 / streaming (M1c 仅 CLI 单轮任务)
- ✅ 做: dsh 真调 (DEEPSEEK_API_KEY env-inject via env-only 占位) + 3 档 profile 模板 (`docs/m0b/profile-override-{orch,commander,worker}.yaml` M0b 落地) 实读 + `dsh_client.ts` 接受 profile 参数 + tool_provider.ts 按 profile 选择 capability

**关键路径产物**:
1. `wrapper/dsh/dsh_client.ts` 实调 dsh CLI (env-inject DEEPSEEK_API_KEY, `--profile headless`, model class 来自 capability JSON)
2. `wrapper/dsh/profile.ts` (NEW): 读 `docs/m0b/profile-override-{orch,commander,worker}.yaml` profile 模板 (3 档)
3. `wrapper/dsh/tool_provider.ts` 按 profile 选 capability (per `spec/capabilities/{orch,commander,worker}.json` `class` 字段)
4. `wrapper/dsh/types.ts` 扩: 加 `Profile` / `ProfileOverride` 类型 (YAML 反序列化)
5. 集成测试 `wrapper/test/integration/dsh_real.test.ts` (NEW): 真 dsh 调用 (env-inject) + 3 档 profile 各跑 1 次 + 退出码/输出格式验证

## §2 输入

- M0c dsh_client commit `d168217` (`wrapper/dsh/{dsh_client,tool_provider,types}.ts`)
- M0c QA-1 fix commit `3efe7dc` (dsh_client TS2834 node16 import path)
- dsh 调研 (M0b BE-1 报告 commit `fdd10ea`)
- dsh 改代码 (M0b TG-1 报告 commit `6228ff5`)
- dsh 摘要 (M0b DO-1 报告 commit `4cf0ece`)
- `docs/m0b/profile-override-{orch,commander,worker}.yaml` (M0b 落地 3 档 profile 模板)
- `spec/capabilities/{orch,commander,worker}.json` (M0b 落地 capability JSON)
- M0b 等价类对比报告 (commit `50d4c29`, orch 213s / commander 76s / worker 11s 19x/7x/1x 阶梯)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§4 (hygiene 守门)

## §3 产出

| # | 文件 | 行数估 | 内容 |
|---|------|--------|------|
| 1 | `wrapper/dsh/dsh_client.ts` | ~200 行 | 实调 dsh CLI (env-inject DEEPSEEK_API_KEY, `--profile headless`, model class 来自 capability JSON); 返回 `{stdout, stderr, exitCode, trace_id, token_usage}` |
| 2 | `wrapper/dsh/profile.ts` (NEW) | ~80 行 | 读 `docs/m0b/profile-override-{orch,commander,worker}.yaml` + 解析为 `Profile` 类型 |
| 3 | `wrapper/dsh/tool_provider.ts` | ~150 行 | 按 profile 选 capability (orch/commander/worker 各自不同 `class` 字段); 调用 dsh_client.ts |
| 4 | `wrapper/dsh/types.ts` | +30 行 | 加 `Profile` / `ProfileOverride` / `DshInvokeOptions` 类型 |
| 5 | `wrapper/test/integration/dsh_real.test.ts` (NEW) | ~100 行 | 真 dsh 调用 (env-inject) + 3 档 profile 各跑 1 次 + 退出码/输出格式验证 |
| 6 | `docs/reports/T-M1c-TG-1-report.md` (NEW) | ~120 行 | 实跑报告: §1 任务完成度 / §2 实跑数据 (3 档 profile wall time / token / quality_score) / §3 问题与解决 / §4 cross-ref |

## §4 验证命令 (架构师最终验证)

```bash
# 1. TypeScript wrapper 实跑
cd wrapper && npm run tsc            # 期望: exit 0
cd wrapper && npm test               # 期望: exit 0 + 含 dsh_real.test.ts

# 2. dsh 真调 (env-inject DEEPSEEK_API_KEY via env-only 占位, 不写完整 key)
DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" npm run test:integration
# 期望: 3 档 profile (orch/commander/worker) 各跑过 1 次, 退出码 0

# 3. dsh headless profile 守门 (per v0.2 §4)
grep -rE "profile: ['\"]web['\"]" wrapper/ | wc -l
# 期望: 0 行 (用 headless, 非 web)

# 4. 3 档 profile 模板实读
test -f docs/m0b/profile-override-orch.yaml && echo "orch ✅"
test -f docs/m0b/profile-override-commander.yaml && echo "commander ✅"
test -f docs/m0b/profile-override-worker.yaml && echo "worker ✅"

# 5. capability JSON 字段对齐
jq -e '.orch.class != .commander.class and .commander.class != .worker.class' \
  spec/capabilities/*.json
# 期望: true (3 档 class 必须不同, per NORTH-STAR A-4 等价类 + capability JSON 守门)

# 6. 不锁型号守门 (per v0.2 §1)
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" wrapper/dsh/ | wc -l
# 期望: 0 行 (capability JSON 用 class/tier 字段, 不硬编码型号)

# 7. DEEPSEEK_API_KEY 不泄漏 (per v0.2 §2)
grep -rE "sk-[a-z0-9]{32,}" wrapper/dsh/ | wc -l
# 期望: 0 行 (仅 env-inject via env-only 占位)
```

## §5 估时

**5 工作日** (与 BE-1 并行):
- Day 1-2: dsh_client.ts 实调 dsh CLI (env-inject, `--profile headless`)
- Day 3: profile.ts 读 YAML 模板 + types.ts 扩
- Day 4: tool_provider.ts 按 profile 选 capability
- Day 5: 集成测试 dsh_real.test.ts + 3 档 profile 各跑 1 次

## §6 报告模板 (docs/reports/T-M1c-TG-1-report.md)

```markdown
# T-M1c-TG-1 — dsh 真调 + 3 档 profile 适配 实施报告

## §1 任务完成度
- [ ] §3 产出 6 文件全部落地
- [ ] §4 验证命令 #1-#7 全 exit 0

## §2 实跑数据
- TypeScript wrapper 实跑: tsc --noEmit exit 0 + vitest run N passed / M todo
- dsh 真调: DEEPSEEK_API_KEY env-inject, headless profile, 3 档 profile 各跑 1 次:
  - orch (调研 A 任务): wall Xs + token Y + quality_score Z/5 + 退出码 0
  - commander (改代码 A 任务): wall Xs + token Y + quality_score Z/5 + diff 一致
  - worker (摘要 A 任务): wall Xs + token Y + quality_score Z/5 + 190 字摘要
- 等价类对比: 与 M0b 报告 (orch 213s / commander 76s / worker 11s) 对比, 阶梯差异保留

## §3 问题与解决
- (列实跑中遇到的问题 + 修法)

## §4 cross-ref
- docs/v1.1-ga-team-plan.md v0.2 §2.2 + §6.2 PR8
- docs/DISPATCH-T-M0c-TG-1.md
- docs/DISPATCH-T-M1c-{BE-1,DO-1,QA-1}.md
- notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md §1-§4

## §5 守门自检
- [ ] 不锁型号 grep = 0
- [ ] DEEPSEEK_API_KEY 完整 key grep = 0
- [ ] v1.0 runtime 0 行 diff
- [ ] dsh headless profile (无 web profile)
- [ ] 3 档 profile 模板实读 (orch/commander/worker YAML)
- [ ] capability JSON 3 档 class 不同
```

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` v0.2 §2.2 + §6.2 PR8 + §10.4 v0.2 准备清单
- `docs/DISPATCH-T-M0c-TG-1.md` (M0c skeleton 输入)
- `docs/DISPATCH-T-M0c-V0.1-PRECOMMIT-FIX.md` (M0c §4 验证命令修订)
- `docs/DISPATCH-T-M1c-BE-1.md` (BE-1 wrapper 调 dsh_client)
- `docs/DISPATCH-T-M1c-DO-1.md` (DO-1 newvps 部署 dsh 容器)
- `docs/DISPATCH-T-M1c-QA-1.md` (QA-1 真机 E2E 调 dsh)
- `docs/DISPATCH-T-M1c-DD-1.md` (DD-1 CHANGELOG/README 同步)
- `wrapper/dsh/` (M0c skeleton 输入)
- `docs/m0b/profile-override-{orch,commander,worker}.yaml` (M0b 落地)
- `spec/capabilities/{orch,commander,worker}.json` (M0b 落地)
- `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md` §1-§4

## §8 禁止

- ❌ 不做 dsh `web` profile (per M0b QA-1 §6.X 修订; 用 headless)
- ❌ 不做 dsh 长连接 / streaming (M1c 仅 CLI 单轮任务)
- ❌ 不硬编码 DEEPSEEK_API_KEY (仅 env-inject via env-only 占位)
- ❌ 不锁具体模型型号 (per NORTH-STAR A-4; capability JSON class 字段)
- ❌ 不动 dsh CLI 本身 (M1c 仅 wrapper 层; dsh 升级由 dsh 自己 release)
- ❌ 不写完整 sk-* key 入 commit (per GH013 PUSH PROTECTION 教训; M0b 已踩坑)
- ❌ 不直接 commit 到 main (实施者 PR → 架构师 merge)

---

*DISPATCH-T-M1c-TG-1 — dsh 真调 + 3 档 profile 适配 任务书；M1c 严禁 dsh `web` profile；hygiene 守门见 `notes/codex-audit-scope-v1.1-m0c-v0.2-precommit.md`*