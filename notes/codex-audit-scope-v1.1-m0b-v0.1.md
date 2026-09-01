# Codex 复审 scope + key points — v1.1 M0b 三路径 spike 模板（v0.1 修订版）

> **用途**：Codex CLI 复审 v0.1 修订版的固定 scope + key points 沉淀；未来 Codex 复审轮次可复用本文件作为复审清单。
> **生成时间**：2026-09-01
> **对应 commit**：pending `feat(m0b): 5 DISPATCH §6.X 三姿势候选 + docs/m0b/ 5 模板 + cc-ready 更新`

---

## §1 复审范围（11+1 文件）

### 1.1 v0.0 → v0.1 修订源

v0.0 plan 已由 `gpt-5.6-sol` + `xhigh` 推理 FAIL（详见 `notes/codex-review-v1.1-m0b-plan-report.md`）：**2 critical + 7 major + 5 minor findings**。本 v0.1 修订针对每项 finding 给出修法（详见 §3 覆盖矩阵 + `docs/v1.1-m0b-three-path-spike-plan.md` §0）。

### 1.2 待审文件清单（11+1）

| # | 文件 | 操作 | 关键内容 |
|---|------|------|---------|
| 1 | `docs/v1.1-m0b-three-path-spike-plan.md` | NEW v0.1 | §0 修订对照表（14 findings）+ §1-§7 完整计划 |
| 2 | `docs/m0b/profile-override-base.yaml` | NEW | 共用：启 8 工具 via `disabled: false` + sandbox=workspace-write + telemetry=DISABLED + approval=ask |
| 3 | `docs/m0b/profile-override-orch.yaml` | NEW | BE-1 orch 档：model = `deepseek-v4-pro` |
| 4 | `docs/m0b/profile-override-commander.yaml` | NEW | TG-1/QA-1 commander 档：model = `deepseek-v4-flash` |
| 5 | `docs/m0b/profile-override-worker.yaml` | NEW | DO-1 worker 档：model = `deepseek-v4-flash` + vision-exp 探索臂注释 |
| 6 | `docs/m0b/m0b-rest-spike.py` | NEW | httpx + 3-class mapping + median(wall_s/in/out tokens) + 失败 exit 1 + sidecar `.log` + `--max-tokens 4096` + 429/5xx retry `2^attempt` backoff + `--task code-change` 警告 |
| 7 | `docs/DISPATCH-T-M0b-BE-1.md` | Edit | + §6.X 三姿势候选（BE-1 orch 档 dsh + REST 跑法） |
| 8 | `docs/DISPATCH-T-M0b-TG-1.md` | Edit | + §6.X 三姿势候选（TG-1 commander 档 + B 姿势 TG-1 不作 H-1 证据 警告） |
| 9 | `docs/DISPATCH-T-M0b-DO-1.md` | Edit | + §6.X 三姿势候选（DO-1 worker 档 + newvps RAM 实测并行） |
| 10 | `docs/DISPATCH-T-M0b-QA-1.md` | Edit | + §6.X 三姿势候选（H-2 等价类对比 3 档 + A/B/C 选择指南） |
| 11 | `docs/DISPATCH-T-M0b-DD-1.md` | Edit | + §3.1.5 三姿势数据来源 + 架构判定（M1 修订加段；不是 §6.X） |
| 12 | `docs/poll/cc-ready.json` | Edit | notes 字段替换 + files_modified 加 5 docs/m0b/ + plan doc + files_unmodified_scope_discipline 加 `docs/m0b/` + `tmp/` |
| (R1) | `notes/codex-review-v1.1-m0b-plan-report.md` | NEW（v0.0 阶段生成）| v0.0 Codex FAIL 报告 — audit trail |
| (R2) | `notes/codex-audit-scope-v1.1-m0b-v0.1.md` | NEW（本文件）| Codex 复审 scope + key points 沉淀 |

**总计 12 改动 + 2 reference = 14 文件**（commit 含 12 改动；2 reference 在 commit 范围内 audit trail）。

---

## §2 复审重点（key points）

### 2.1 必查项（per v0.0 FAIL findings）

- **(A) v0.1 是否完整覆盖 v0.0 的 14 findings**：详见 §3 覆盖矩阵 + `docs/v1.1-m0b-three-path-spike-plan.md` §0
- **(B) 4 yaml 拆分（base + 3 role）的 schema 正确性**：已用 `dsh --profile web --patch docs/m0b/profile-override-base.yaml --patch docs/m0b/profile-override-<role>.yaml --dump-config` 静态验证 8 工具 `disabled: false`
- **(C) rest-spike.py 实现与 plan §2.3 描述的一致性**：median / exit 1 / `.log` / `--max-tokens` / retry / code-change 警告
- **(D) 5 DISPATCH §6.X 模板的覆盖完整性 + DD-1 §3.1.5 汇总占位的合理性**（M1 修复）
- **(E) 守门设计**：grep guard 收窄到 `docs/m0b/+spec/capabilities/+adr/001*.md`（DISPATCH 文档允许叙述性引用模型名）
- **(F) cc-ready.json notes 字段的事实准确性**：dsh CLI v0.1.1-rc.2 / `disabled: false` 语法 / 5 docs/m0b/ 文件

### 2.2 必查的潜在新 finding

- **(G) 4 yaml 之间的覆盖冲突**：base.yaml 不含 `agent-default-model`；role.yaml 仅含 model；`--patch` 叠加顺序无关——逻辑上正确但 Codex 可挑战
- **(H) dsh `web` profile 之外是否需要 `plugin` profile**：base.yaml 是否要在其他 profile 下也能用？
- **(I) rest-spike.py 的 sidecar `.log` 命名**：当前用 `args.output.with_suffix('.log')`，若 `--output` 已是 `.log` 会怎样？
- **(J) DD-1 §3.1.5 与 §3.1 主产出（DONE.md 模板）的位置关系**：是否影响 M0b 总报告生成？
- **(K) 5 DISPATCH §6.X 中"姿势 C 架构判定"的内容重叠**：DD-1 §3.1.5 架构判定占位 vs 各 DISPATCH §6.X 姿势 C 段，是否冗余？
- **(L) tmp/ 路径在 §6.X 跑命令示例 + §3.1.5 trace 落地**：跨用户环境的 tmp/ 路径假设（Linux/macOS 一致但 Windows 不一）是否需要绝对路径？
- **(M) cc-ready.json notes 末尾的 "previous task_id" 标记是否需要删除**：m3 minor 修订方向是"保留 task_id + notes 追加"

### 2.3 不应再 FAIL 的项（v0.1 已修）

| ID | 等级 | finding | 修订位置 |
|----|------|---------|---------|
| C1 | critical | `tmp/` 被 `.gitignore` 挡死 | §1.2 路径 → `docs/m0b/`；§4 check-8 改 `docs/m0b/` 入库验证 |
| C2 | critical | grep 守门与样板文本矛盾 | §1.4 + §4 check-3 收窄到 `docs/m0b/ + spec/capabilities/ + adr/001*.md` |
| M1 | major | DD-1 无 §6 段锚点 | §2.1 DD-1 改在 §3.1 骨架内插"三姿势数据来源"段；§4 check-5 分文件期望 |
| M2 | major | worker 档映射 A/B 不一致 | §2.2 + §2.3 + 4 yaml 注释统一：worker = `deepseek-v4-flash` |
| M3 | major | 姿势 A 跑命令未按档位换 model | §2.2 拆 4 个 yaml（base + 3 role） |
| M4 | major | override 漏启 `tool-goal` / `tool-ralph` | §2.2 base.yaml 显式启用两者 + tool-subagent |
| M5 | major | 姿势 B 无法 TG-1 改代码 | §2.1 B 选择指南加"B 单跑只验证文本型"；§2.3 py 脚本 code-change 时警告 |
| M6 | major | rest-spike.py 描述不符 | §2.3 py 脚本加 median + exit 1 + .log + --max-tokens + 429/5xx retry |
| M7 | major | ADR 守门 pathspec 字面 `adr/0001-0009.md` 失效 | §1.4 + §4 check-4 改 glob `adr/000[1-9]-*.md` |
| m1 | minor | 计划文档未在 commit 清单 | §3.1 改为 12 文件清单（含本计划文档自身）|
| m2 | minor | rest-spike.py 缺 `--max-tokens` | §2.3 加 `--max-tokens` 默认 4096 |
| m3 | minor | cc-ready.json diff 旧文本锚点不对齐 | §2.4 改用实际当前文本 |
| m4 | minor | `docs/m0b/` 未列 §7.3 M0b 产出清单 | §5.2 标注 v0.1 升级时补入 |
| m5 | minor | QA-1/DD-1 §6 与 check-5 关系未写死 | §4 check-5 分文件期望 |

---

## §3 14 findings 覆盖矩阵

| ID | finding | v0.1 修法 | 验证命令 |
|----|---------|----------|----------|
| C1 | tmp/ 被 .gitignore | `docs/m0b/` 路径（不入 .gitignore）| `grep "^docs/m0b/?$" .gitignore` 应 exit 1 |
| C2 | grep 守门矛盾 | 收窄到 `docs/m0b/+spec/capabilities/+adr/001*.md` | `grep -rE "Fable 5\|GLM 5.3\|MiniMax-M3" docs/m0b/ spec/capabilities/ adr/` 应 exit 2 |
| M1 | DD-1 无 §6 锚点 | DD-1 在 §3.1 骨架内插 §3.1.5 | `grep -c "^### §3.1.5" docs/DISPATCH-T-M0b-DD-1.md` 应 == 1 |
| M2 | worker 档映射不一致 | 4 yaml 统一 worker = v4-flash | `grep "model: deepseek-v4-flash" docs/m0b/profile-override-worker.yaml` 应 == 1（无 vision-exp 替代）|
| M3 | 姿势 A 未按档位 | 拆 4 yaml；§6.X 跑命令按档位 3 行 | `ls docs/m0b/profile-override-*.yaml` 应 == 4 |
| M4 | 漏启 tool-goal / tool-ralph | base.yaml 含两者 + tool-subagent | `grep -c "^- id: tool-" docs/m0b/profile-override-base.yaml` 应 == 8 |
| M5 | 姿势 B 无法 TG-1 改代码 | §6.X B 选择指南 + rest-spike.py code-change 警告 | `grep -c "code-change" docs/m0b/m0b-rest-spike.py` 应 ≥ 2 |
| M6 | rest-spike.py 描述不符 | median + exit 1 + .log + --max-tokens + retry | `python3 docs/m0b/m0b-rest-spike.py --help` 应 exit 0 |
| M7 | ADR pathspec 字面失效 | 改 glob `adr/000[1-9]-*.md` | `git diff v1.0.0..HEAD -- 'adr/000[1-9]-*.md'` 应 == 0 lines |
| m1 | 计划文档未在清单 | §3.1 加 12 文件清单（含自身）| `grep "v1.1-m0b-three-path-spike-plan.md" docs/v1.1-m0b-three-path-spike-plan.md` 应 ≥ 1 |
| m2 | 缺 --max-tokens | `--max-tokens 4096` 默认 | `grep "default=4096" docs/m0b/m0b-rest-spike.py` 应 == 1 |
| m3 | cc-ready.json 锚点不对齐 | §2.4 改用当前实际文本 | `grep "@deepseek-ai/dsh" docs/poll/cc-ready.json` 应 ≥ 1 |
| m4 | docs/m0b/ 未列 §7.3 | §5.2 v0.1 升级时补入 | （不在 v0.1 验证范围；post-pass 兜底）|
| m5 | QA-1/DD-1 §6 与 check-5 | check-5 分文件期望（BE/TG/DO/QA = 3 姿势行；DD-1 = "三姿势数据来源"）| `for f in BE-1 TG-1 DO-1 QA-1; do grep -cE "姿势 A.*dsh\|姿势 B.*DeepSeek\|姿势 C.*架构" $f; done` 应 ≥ 3/file |

---

## §4 复审流程

### 4.1 Codex CLI 提交（用户亲提，gpt-5.6-sol + reasoning xhigh）

```bash
# 用户在自己终端执行（Claude 不亲提 Codex CLI）
codex --model gpt-5.6-sol --reasoning-effort xhigh <<'PROMPT'
你是 Codex CLI 评审员。本次复审 v1.1 M0b 三路径 spike 模板计划的 v0.1 修订版。
v0.0 你已 FAIL（2 critical + 7 major + 5 minor；详见 notes/codex-review-v1.1-m0b-plan-report.md）。
v0.1 修订对照表见 docs/v1.1-m0b-three-path-spike-plan.md §0 + 本文件 §3 覆盖矩阵。

复审范围（11+1 文件全套）：
1. docs/v1.1-m0b-three-path-spike-plan.md (v0.1 修订版；含 §0 修订对照表)
2-5. docs/m0b/profile-override-{base,orch,commander,worker}.yaml
6. docs/m0b/m0b-rest-spike.py
7-10. docs/DISPATCH-T-M0b-{BE-1,TG-1,DO-1,QA-1}.md (各 +§6.X 三姿势候选)
11. docs/DISPATCH-T-M0b-DD-1.md (+§3.1.5 三姿势数据来源)
12. docs/poll/cc-ready.json (notes + files_modified + files_unmodified)
R1. notes/codex-review-v1.1-m0b-plan-report.md (v0.0 FAIL audit trail)
R2. notes/codex-audit-scope-v1.1-m0b-v0.1.md (本文件)

复审重点（per 本文件 §2）：
(A) v0.1 是否完整覆盖 v0.0 的 14 findings — 对照本文件 §3 矩阵
(B) 4 yaml 拆分 schema 正确性（已用 dsh --dump-config 静态验证 8 工具 disabled: false）
(C) rest-spike.py 实现与 plan §2.3 一致性
(D) 5 DISPATCH §6.X 覆盖 + DD-1 §3.1.5 汇总占位（M1 修复）
(E) 守门设计：grep guard 收窄到 docs/m0b/+spec/capabilities/+adr/001*.md
(F) cc-ready.json notes 事实准确性

潜在新 finding（请评估）：
(G) 4 yaml 覆盖冲突；base.yaml 不含 model
(H) dsh web profile 之外是否需要 plugin profile
(I) rest-spike.py sidecar .log 命名（--output 已是 .log 会怎样）
(J) DD-1 §3.1.5 与 §3.1 主产出（DONE.md）位置关系
(K) 5 DISPATCH §6.X 姿势 C 与 DD-1 §3.1.5 架构判定占位冗余？
(L) tmp/ 路径跨平台（Linux/macOS/Windows）一致性
(M) cc-ready.json notes 末尾 "previous task_id" 标记是否需要删除

请用 FAIL/PASS + finding 编号 + 严重等级 给出结论。
如有新 finding，引用具体 file:line。
PROMPT
```

### 4.2 复审后处理

- **PASS**：commit + push 完成；M0b 进入等用户 "Start v1.1 M0b" 阶段（PRD-v1.1 §4.6 第 3 条）
- **FAIL**：按 finding 修法迭代 v0.2 → 再提交复审
- **PARTIAL**：架构师裁断哪些 finding 必修、哪些 follow-up

---

## §5 沉淀机制（future Codex cycles）

未来 Codex 复审轮次按以下模式沉淀（**当前会话已立**）：

1. **修改/新增代码后**：先写 `notes/codex-audit-scope-v<round>-<cycle>-<topic>.md`（scope + key points + findings 覆盖矩阵 + 复审流程）
2. **用户提交 Codex 复审**（user 亲提；gpt-5.6-sol + xhigh）
3. **Codex 报告落 `notes/codex-review-<cycle>-<topic>-report.md`**（FAIL/PASS + findings）
4. **feedback 整合到 plan §0 修订对照表 + 下版本修订**
5. **commit + push**（per fish-harness-project.md 自动 commit/push 授权）

参考本文件作为模板。
