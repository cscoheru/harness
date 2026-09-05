# Codex Prompt-Review v1.2.0c v0.1 — 合同起草审验报告

> **Date**: 2026-09-05
> **Reviewer**: Codex (`gpt-5.6-sol`, reasoning_effort=xhigh) via Claude 审验代理
> **对象**: `notes/codex-audit-scope-v1.2.0c-v0.1-prompt.md`（331 行）+ `notes/codex-audit-scope-v1.2.0c-v0.1.md`（707 行）— **起草期合同审验**（实施 Commit 2-4 未开始）
> **Boundary**: b5a1d07（v1.2.0c 起跑 = v1.2.0b 收口后 cross-ref）
> **终态**: 合同可执行性 **PASS（修复后）** — 初审 **0C/2M/5m → same-round 全闭**

---

## §0 裁定

本轮为**起草审验**（pre-implementation）：21 文件实施 0 落地（7 NEW 文件 MISSING、wrapper/deploy/spec/harness 无改动），§4.12/§4.13/§4.14 共 36 项 NEW 守门对象不存在，留待 Commit 2 后 formal 轮验证。本轮产出 = 合同自身可执行性 findings + same-round 修复。

---

## §1 Findings（0C/2M/5m → 全闭）

### M1 — cc-ready task_id 预翻 `-PASS`（commit 1 起草态）

**证据**：工作区 `docs/poll/cc-ready.json` 已改 `T-V1.2.0C-CROSSHOST-MACBOOK-PASS`，但其 commit 字段自述「commit 1 起草 ✅ DONE … Commit 4 簿记（cc-ready 翻 PASS）」——**自设流程声明 Commit 4 才翻 PASS，commit 1 即写 -PASS 后缀**，自相矛盾；且违反 F3 红线（cc-ready 翻牌由 Claude 于双 gate 绿后完成）。未提交未固化（工作区 M）→ 可逆，判 M。

**闭环**：task_id 回滚 `T-V1.2.0C-CROSSHOST-MACBOOK-DRAFT` + commit 字段头部追加 M1 闭环说明。

### M2 — cmd 4 v1.0 runtime diff 期望 == 0 与 §1 Edit 两例外文件自爆（pathspec 含待 Edit 对象）

**证据**：§1 文件清单含 `harness/runtime/worker_pool.py (Edit ~30 行 per §3.8)` + `spec/kernel-schema.sql (Edit ~10 行 per §3.9)`；cmd 4 pathspec 为 `harness/ spec/kernel-schema.sql ...`——**两文件均在 pathspec 内**，Commit 2 Edit 后 `git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql ... | wc -l` **必 > 0**，18-hygiene 第一块恒红。§3.8/§3.9 例外声明有「声明」无「pathspec 排除配套」（v1.2.0b Dockerfile 模式：主 pathspec 排除 + 单独 `≥ 1` 例外验证——未复制）。

**闭环**：prompt cmd 4 + audit-scope §3（L119）+ §9（L608）三处主 pathspec 改 `:(exclude)harness/runtime/worker_pool.py` + `:(exclude)spec/kernel-schema.sql`，各补单独 `≥ 1` 例外验证两条。复验：起草期主 diff 0（实施后仍 0）+ 例外两条起草期 0（实施后 ≥1）。

### m1 — U7「tag @ boundary commit 289e7eb」与 §4 提交命令 `git tag -a v1.2.0c b5a1d07` 矛盾

Debian point-release 风格 = tag @ 本周期起跑点：v1.2.0a/v1.2.0b 均 tag @ 289e7eb（各自周期起跑点重合）；v1.2.0c 起跑点 = b5a1d07。文字惯性复制 289e7eb 与命令 b5a1d07 不一致。修：U7 + audit-scope 三处（L525/L570/L706）统一 b5a1d07。

### m2 — §2.4 完整性循环 baseline 注记指错 commit

「21 files 全 exists（commit 1 起草完成后实测）」——commit 1 仅 5 files，7 NEW 文件 Commit 2 落地。修：baseline 改 **Commit 2 实施完成后** + 声明本循环为 §2.1-§2.3 前置 gate（防 NEW 文件 MISSING 被 `grep | wc -l` 掩蔽假绿——起草期实跑 cmd 8 即此型：macbook.json MISSING，grep exit 2 被 wc 吞）。

### m3 — U2「vitest ≥220」增量算式缺失 + U4「107 gated」口径过时

≥220 需算式支撑（191 现状 + 6host_router.test.ts Edit 增量 ~30；3 NEW 集成套件默认 gated-skip 不入 passed）；3 NEW gated 套件入池后 skip 池 ≠ 107。修：U2 补算式 + U4 改「107 现状 + 3 NEW 套件入池」。

### m4 — F4 红线要求报告含 boundary commit 但 §3.1 模板无该字段

红线与模板不配套。修：模板 §0 补 `> **Boundary**: b5a1d07` 行。

### m5 — §4.12 两处 `grep -E`（无 -c）数字不规范

`type HostId` 等 2 条裸 `grep -E` 输出匹配行而非计数，「≥ 1」语义靠肉眼。轻微——实施 formal 轮统一以 `grep -cE` 口径复跑（本报告不改正文，formal 轮校准）。

---

## §2 起草质量正面确认（免修项）

| 项 | 实测 | 判定 |
|---|---|---|
| tracked 锚定 | **116** == 期望 | ✅ |
| disk verbatim 校准 | **128 = 116 + 12** 精确命中起草声明（F5 红线起草期即实测落定——v1.2.0b M2 教训吸收） | ✅ |
| 自伤 | **12** == 期望 | ✅ |
| v1.0 runtime diff（修复后主 pathspec） | 0 == 期望 | ✅ |
| wrapper/orchestrator/ 型号 | 0 | ✅ |
| sk-/orchkey/VAPID/kjonemacbook-tskey | 0/0/0/0 | ✅ |
| web profile 0 / headless 50 ≥3 | ✅ |
| §4.10 继承抽查（completed_steps 10 ≥4 / TODO(M1) 0 / describe 39 口径） | ✅ |
| §4.11 继承抽查（better-sqlite3 16 / describe 89） | ✅ |
| tail1b9878 残留 55（实施前预期红 → Commit 2 F11 修复后 == 0） | 起草期基线记录 |
| fish-harness.ts.net 现状 17（Commit 2 后 ≥20） | 起草期基线记录 |
| 双 tag @289e7eb（v1.2.0a+v1.2.0b force-update 同点） | 用户 Debian 风格决策已锁，tag message 自声明，非缺陷 |

---

## §3 formal 轮（Commit 2-4 后）验证路径

1. §2.4 完整性循环先行（21 files 全 exists，Commit 2 后）
2. 18 hygiene + 28 commands 全矩阵（§4.12 16 项 + §4.13 12 项 + §4.14 8 项 NEW 守门激活）
3. 双 gate（tsc 0 + vitest ≥220p/0f）
4. U4 gated 真跑（107+3 套件入池，RUN_CROSS_HOST_E2E 等 3 env）
5. F11 后 tail1b9878 == 0 + fish-harness.ts.net ≥ 20
6. cc-ready Commit 4 翻 `-PASS`（本轮回滚 DRAFT 后流程自洽）

---

## §4 新坑记档

1. **cc-ready 预翻**：task_id `-PASS` 后缀是完成信号，起草 commit 只能 `-DRAFT`（自设流程与信号位一体两面，起草者易忘）
2. **例外声明须配 pathspec 排除**：声明「例外」不改变 diff 命令行为——v1.2.0b Dockerfile 模式（排除+单独验证）是完整套路，只抄「声明」不抄「排除」必恒红
3. **boundary 一词单义化**：每周期 boundary = 本周期起跑点（上周期收口后最后 commit）；跨周期复制 U 项文字时 sha 必须跟着换
4. **NEW 文件守门的 wc 假绿**：grep 缺文件 exit 2 被 `| wc -l` 吞成 0 通过——完整性前置 gate 必须先于内容守门

---

*Codex prompt-review v1.2.0c v0.1 — 0C/2M/5m same-round 全闭；合同修复后可执行；formal 轮待 Commit 2-4。*

Co-Authored-By: Claude Code <noreply@anthropic.com>
