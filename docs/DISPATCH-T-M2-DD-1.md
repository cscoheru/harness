# T-M2-DISPATCH-DD-1 — CHANGELOG [1.1.0-M2] + README v1.1 M2 段 + v0.4 升级准备

> **Task ID**: T-M2-DD-1
> **Date**: 2026-09-02
> **Role**: DD (Documentation & Deployment)
> **Stage**: v1.1 M2
> **Trigger**: M1c DD-1 收口 + user 「Start v1.1 M2」 + T-M2-BE-1/TG-1/DO-1/QA-1 全部 commit
> **Status**: 🟡 DISPATCH DRAFT
> **Author**: 架构师 Claude Fable 5 (claude-fable-5)
> **Worktree**: 主仓 `main`

---

## §0 元数据

- **触发条件**: T-M2-BE-1 + T-M2-TG-1 + T-M2-DO-1 + T-M2-QA-1 全部 commit + 实测 PASS
- **依赖**: M2 实施 4 DISPATCH 全部 DONE
- **产出**: CHANGELOG [1.1.0-M2] 段 + README v1.1 M2 段 + v0.4 audit-scope + DD-1 实施报告
- **估时**: 4-5 工作日（M1c DD-1 2-3d + 6 host 文档扩展 +2d + v0.4 audit-scope +1d）
- **守门**: 不锁型号 / 不硬编码 API key / v1.0 runtime 0 行 diff / dsh `headless` / **M2 三守门（v0.3 §4.5/§4.6/§4.7 v0.4 启用）**

---

## §1 任务定义（一句话）

完成 M2 DD-1 实施收口：在 `CHANGELOG.md` 新增 `[1.1.0-M2]` 段（6 host + STT + Web Push 三大新特性 + v0.3 → v0.4 升级门槛）+ 在 `README.md` v1.1 M2 段 fill in（6 host 拓扑 + STT 集成 + Web Push 推送 + 6 Funnel 性能对比）+ 创建 v0.4 audit-scope（启用 §4.5/§4.6/§4.7 M2 三新增 hygiene 守门）+ 创建本报告。

---

## §2 输入

| # | 输入 | 来源 | 验证 |
|---|------|------|------|
| 1 | M1c DD-1 实施报告 + 模板 | `docs/reports/T-M1c-DD-1-report.md` §2/§3 骨架 | 已 commit |
| 2 | M2 BE-1/TG-1/DO-1/QA-1 实施报告 | `docs/reports/T-M2-{BE-1,TG-1,DO-1,QA-1}-report.md` | 待 M2 实施 commit |
| 3 | 6 host 拓扑 + 6 Funnel URL | T-M2-DO-1 实施 | 待 commit |
| 4 | STT whisper.cpp 实测数据 | T-M2-TG-1 + T-M2-QA-1 实施 | 待 commit |
| 5 | Web Push 投递成功率 | T-M2-QA-1 实施 | 待 commit |
| 6 | v0.3 audit-scope §4.5/§4.6/§4.7 预备 | `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` | 已 commit |

---

## §3 产出

### 3.1 CHANGELOG [1.1.0-M2] 段

| 文件 | 操作 | 内容 |
|------|------|------|
| `CHANGELOG.md` | Edit（新增 [1.1.0-M2] 段 + Link ref）| L10-60 范围（介于 [1.1.0-M1c] 与 [1.1.0-M0c] 之间）；Added 8 项（6 host / STT worker / Web Push gateway / 4 capability JSON / dsh 6 host / whisper.cpp / VAPID key / 6 Funnel iPhone Safari E2E）/ Changed 4 项（plan v0.2 → v0.3 / audit-scope v0.2 → v0.3 / README v1.1 M2 / 6 host 部署骨架）/ Gates Passed 5 项（M2 BE-1/TG-1/DO-1/QA-1 全部 PASS + Codex formal）/ Hygiene 6 项（v1.0 runtime 不漂移 / 不锁型号 / 不硬编码 API key / **M2 多 host 守门启用 / M2 STT 守门启用 / M2 Web Push 守门启用**）/ Notes 3 项 |

### 3.2 README v1.1 M2 段

| 文件 | 操作 | 内容 |
|------|------|------|
| `README.md` | Edit（v1.1 M2 段 fill in）| L246-330 范围（接续 M1c 段）；6 host 拓扑图 + 6 Funnel URL 列表 + STT 真调示例 + Web Push 真发示例 + 性能数据 + 与 M1c 单 Funnel 对比 |

### 3.3 v0.4 audit-scope + DD-1 报告

| 文件 | 操作 | 内容 |
|------|------|------|
| `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md` | NEW | v0.4 升级 4 文件 hygiene 守门聚合（继承 v0.3 + 启用 §4.5/§4.6/§4.7 M2 三守门为正式项 + tracked 重锚 == ? 视 M2 起草增量定）|
| `notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md` | NEW | 配套 Codex 复审 prompt |
| `docs/reports/T-M2-DD-1-report.md` | NEW | M2 DD-1 实施报告 ~250 行 6 段（§1 任务定义 / §2 CHANGELOG 填实 / §3 README 填实 / §4 v0.4 audit-scope 准备 / §5 verbatim 验证 6 项 / §6 cross-ref + next）|

**总产出：2 文件 Edit + 3 文件 NEW = 5 文件**（与 M1c DD-1 实施对称）

---

## §4 验证

```bash
# === 1. CHANGELOG [1.1.0-M2] 段存在 ===
grep -c "^\[1\.1\.0-M2\]" CHANGELOG.md
# 期望: 1

# === 2. README v1.1 M2 段存在 ===
grep -c "### M2 阶段\|### v1.1 M2" README.md
# 期望: 1

# === 3. 6 Funnel URL 引用齐全 ===
grep -c "harness-newvps\|harness-edge[1-5]" README.md
# 期望: ≥ 6

# === 4. STT/Web Push capability JSON 引用 ===
grep -c "stt_worker\|webpush_gateway" README.md
# 期望: ≥ 2

# === 5. v0.4 audit-scope + prompt 存在 ===
test -f notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md && echo "v0.4 audit-scope ✅"
test -f notes/codex-audit-scope-v1.1-m0c-v0.4-precommit-prompt.md && echo "v0.4 prompt ✅"

# === 6. v0.3 §4.5/§4.6/§4.7 守门启用验证（v0.4 audit-scope 中 §4.5/§4.6/§4.7 标题去"预备"）===
grep -c "M2 多 host 守门\b\|M2 STT 守门\b\|M2 Web Push 守门\b" notes/codex-audit-scope-v1.1-m0c-v0.4-precommit.md
# 期望: ≥ 3（守门启用）

# === 7. DEEPSEEK_API_KEY 不泄漏 ===
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/reports/T-M2-DD-1-report.md | wc -l
# 期望: 0

# === 8. v1.0 runtime 0 行 diff ===
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0
```

---

## §5 估时

- **Day 1**: CHANGELOG [1.1.0-M2] 段填实（8 项 Added + 4 项 Changed + 5 项 Gates Passed + 6 项 Hygiene + 3 项 Notes + Link ref）
- **Day 2**: README v1.1 M2 段 fill in（6 host 拓扑 + 6 Funnel + STT + Web Push + 性能对比）
- **Day 3**: v0.4 audit-scope + prompt 起草（启用 M2 三守门）
- **Day 4**: DD-1 实施报告 6 段 ~250 行
- **Day 5**: verbatim 验证 8 项 + Codex formal precommit + fix 轮闭环

**总估时**: 5 工作日（1 周）；与 PRD-v1.1 §5 M2 = 3 周对齐，余 2 周给 BE-1/TG-1/DO-1/QA-1 实施。

---

## §6 报告模板

落点：`docs/reports/T-M2-DD-1-report.md` ~250 行 6 段：

1. **§1 DD-1 任务定义**: M2 阶段 DD 实施收口
2. **§2 CHANGELOG [1.1.0-M2] 段填实**: line:line 引用 + 6 子段齐全
3. **§3 README v1.1 M2 段填实**: line:line 引用 + 6 host 拓扑 + STT + Web Push
4. **§4 v0.4 audit-scope 准备清单**: 5 文件 + 11 hygiene 守门（v0.3 §1-§4 + v0.4 启用 §4.5/§4.6/§4.7）+ tracked 重锚
5. **§5 verbatim 验证 8 项结果**
6. **§6 cross-ref + next**: M3 阶段（GA final）准备

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §1 M2 阶段 + §10.5 v0.4 升级门槛
- `docs/DISPATCH-T-M1c-DD-1.md`（M1c DD-1 任务书模板）
- `docs/reports/T-M1c-DD-1-report.md`（M1c DD-1 收口报告 6 段骨架）
- `docs/reports/T-M2-BE-1-report.md`（M2 BE-1 6 host 实证）
- `docs/reports/T-M2-TG-1-report.md`（M2 TG-1 dsh + STT + VAPID 实证）
- `docs/reports/T-M2-DO-1-report.md`（M2 DO-1 6 host 部署实证）
- `docs/reports/T-M2-QA-1-report.md`（M2 QA-1 端到端实证）
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` §4.5/§4.6/§4.7（M2 守门预备 → v0.4 启用）
- `adr/0010-v1.1-cycle-scope-admission.md`（v1.1 cycle scope admission）
- `spec/capabilities/{orch,commander,worker,newvps_ram,6host_router,stt_worker,webpush_gateway}.json`（M0b 4 SKU + M2 3 SKU）

---

## §8 禁止

- ❌ 不锁容器 IP（用 container_name + MagicDNS）
- ❌ 不落盘 STT 音频
- ❌ 不硬编码 VAPID 私钥
- ❌ 不写完整 DEEPSEEK_API_KEY
- ❌ 不切 dsh `web` profile
- ❌ 不动 v1.0 runtime
- ❌ 不在 6 host 部署骨架中硬编码任何端点 IP（必须 MagicDNS 名）

---

## §9 元数据自检

- [x] §0 元数据
- [x] §1 任务定义
- [x] §2 输入 6 项
- [x] §3 产出 5 文件（2 Edit + 3 NEW）
- [x] §4 验证 8 项
- [x] §5 估时 5 工作日
- [x] §6 报告模板 6 段 ~250 行
- [x] §7 cross-ref 10 引用
- [x] §8 禁止 7 项
- [x] §9 元数据自检
- [x] 不锁型号守门
- [x] v1.0 runtime 不漂移守门
- [x] DEEPSEEK_API_KEY 不入 commit
- [x] Co-Authored-By 用 `Claude Code`

---

*DD-1 DISPATCH — M2 阶段文档收口 + v0.4 升级准备。依赖 T-M2-BE-1/TG-1/DO-1/QA-1 全部 PASS；产出 5 文件；估时 5 工作日；守门 v0.3 §4.5/§4.6/§4.7 v0.4 启用 + 继承 v0.1/v0.2/v0.3 hygiene 守门。下枪：M3 阶段 GA final 准备。Co-Authored-By: Claude Code <noreply@anthropic.com>*