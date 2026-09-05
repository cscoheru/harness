# Codex Review v1.2.0c v0.1 — Formal Report

> **Date**: 2026-09-05
> **Reviewer**: Codex (`gpt-5.6-sol`, reasoning_effort=xhigh) via Claude 审验代理
> **Boundary**: b5a1d07（v1.2.0c 起跑）— 审验链 `e735a8d..HEAD` + 工作区收编
> **Scope**: v1.2.0c cross-host 真发 + MacBook Worker + host-id fencing（3 实施 commits：`3844243` 核心 / `a6d6e06` version 修 / `e08fe9d` 簿记翻牌）
> **终态**: **PASS — 0C/0M/0m**（初审 0C/0M/5m → same-round 全闭）

---

## §0 终态裁定

| 轮次 | C | M | m | 裁定 |
|---|---|---|---|---|
| 初审 | 0 | 0 | 5 | CHANGES REQUIRED |
| 同回合闭环后 | **0** | **0** | **0** | **PASS** |

预期达成：§3.8 MagicDNS 命名裂痕修复全绿 + §4.12 cross-host 16 项全绿 + §4.13 MacBook 12 项全绿 + §4.14 fencing 8 项全绿 + tracked 116 + disk 128 verbatim + 双 gate 绿（tsc 0 / vitest 205p-0f-130g）。

---

## §1 Findings（0C/0M/5m → 同回合闭环；全部 pattern/测试层，零实现 bug）

### m1 — 测试断言漂移：a6d6e06 改 health() 版本未同步测试（1 failed）

`orchestrator.test.ts` L96 期望 `version: '0.0.0-stub'`，实现已改 `'1.2.0c'`（a6d6e06）→ vitest 1 failed（204p/1f/130s）。改实现不同步测试 = 同回合纪律破口。**闭环**：断言 + 测试名同步 `1.2.0c` → **205p/0f**。

### m2 — F12 fetch 真发 pattern 要求三段同行（表驱动架构下恒 0 假门）

原 pattern `fetch.*fish-harness\.ts\.net.*api/v1/tasks` 要求 fetch/域名字面/path 同行；实现为**表驱动**（L75-87 `magicDnsName` 表 63 处 canonical）+ L307 `fetch(\`${getHostUrl(decision.targetHost, 4001)}/api/v1/tasks?...\`)` —— 真发存在但 pattern 必然 0。**闭环**：pattern 校准 `fetch\(.*getHostUrl.*api/v1/tasks`（4 处：prompt ×2 + audit-scope ×2），域名字面由 cmd 6（63 ≥ 20）独立守门，实测 1 ✓。

### m3 — recordDispatch/checkFencing 方法形态 pattern 恒 0（class 方法无 function/= 语法）

原 pattern `function recordDispatch|export function recordDispatch|recordDispatch\s*=` 匹配不了 **class HostFence 方法定义**（L104 `recordDispatch(task_id: string, ...)` / L131 `checkFencing(task_id: string)`——无 function 关键字无 = 赋值）。实现完全符合 F13 三件套（HostIdFencingError class ✓ + 两方法 ✓）。**闭环**：pattern 增方法形态 `recordDispatch\(task_id`（6 处），实测各 1 ✓。

### m4 — §4.13 b4 文件范围错 + camelCase 漏（二次校准）

原 pattern 列 `worker.ts`（host_class/working_hours 0 处——正当分工：spec 归 macbook.json、评分归 orchestrator.ts）；一次校准换 orchestrator.ts 后仍 2 < 3——**orchestrator 用 camelCase `isWorkingHours`** 非 `working_hours` 字面。**闭环**：pattern = `host_class.*macbook-main\|working_hours\|isWorkingHours` @ orchestrator.ts + macbook.json，实测 **6 ≥ 3** ✓（json 2 + orchestrator 4）。

### m5 — wrapper/orchestrator/ 型号守门撞 hygiene 注释（注释豁免第三例）

`host_fencing.ts` L20「No model-specific identifiers (Fable 5 / GLM 5.3 / MiniMax-M3)」——**防锁型号声明注释自身提及字面**（v0.6 DER + v1.2.0b stub-worker 同型第三例）。生产路径 0 锁型号。**闭环**：cmd 5 期望行补注释豁免声明（命中 1 处须核对为注释行）。

---

## §2 验证矩阵结果

### 三源锚定（verbatim）

| 口径 | 实测 | 期望 | 判定 |
|---|---|---|---|
| tracked | **116** | 116 | ✅ |
| disk | **128 = 116 + 12** | 128 verbatim | ✅（起草期预校准精确命中，F5 纪律二次成功） |
| 自伤 | **12** | 12 | ✅（同回合合同修改未引入新 pattern 字面） |

### §2.1 hygiene 1-13

cmd4 v1.0 主 diff **0**（pathspec 排除后）✅ + 例外 a `harness/runtime/worker_pool.py` **106 ≥ 1** ✅ + 例外 b `spec/kernel-schema.sql` **34 ≥ 1** ✅ + Dockerfile 20 ≥ 1 ✅；orch 型号 1（m5 注释豁免后合规）✅；**fish-harness.ts.net 63 ≥ 20** ✅；**tail1b9878 残留 0** ✅（55→0，F11 修复落地）；sk/orchkey/VAPID/tskey/kjonemacbook-tskey 全 0 ✅；web 0 / headless **53 ≥ 3** ✅；完整性前置 26 文件全 exists ✅。

### §3.8 MagicDNS 命名裂痕修复（F11/D5）

canonical `.fish-harness.ts.net` 跨 11 文件 63 处；旧 `tail1b9878.ts.net` **0 残留**（起草期基线 55 → 实施后 0）✅。

### §4.12 cross-host 真发守门 16 项

fetch 真发 1（m2 校准后）✅ / callDshHeadless 残留 0 ✅ / MACBOOK_HOST 16 ≥4 ✅ / host_id 双文件 24 ≥5 ✅ / unique-index 2 ≥1 ✅ / host_fencing.ts NEW 7111B ✅ / hf host_id 28 ≥5 ✅ / gated 6 ≥2 ✅ / kjonemacbook 6 ≥4 ✅ / HostId union 1 ≥1 ✅ / cross+fence ts NEW ✅ / macbook.json NEW ✅ / 4 文件净 key 0 ✅ / recordDispatch+checkFencing 1+1（m3 校准后）✅ / HostIdFencingError 1 ≥1 ✅ —— **16/16 全绿**。

### §4.13 MacBook worker 守门 12 项

compose NEW 2726B ✅ / runbook NEW 6493B ✅ / macbook.json NEW 424B ✅ / host_class+working_hours+isWorkingHours **6 ≥ 3**（m4 校准后）✅ / isWorkingHours+100 3 ≥2 ✅ / tag:macbook 5 ≥3 ✅ / kjonemacbook 6 ≥4 ✅ / node:24-slim 2 ≥1 ✅ / WORKER_HOST 等 4 ≥3 ✅ / bind mount 4 ≥2 ✅ / sleep infinity 0 ✅ / macbook ts NEW ✅ / deepseek-v4-flash 1 ≥1 ✅ / pmset 10 ≥2 ✅ —— **12/12 全绿**。

### §4.14 host-id fencing 守门 8 项

py host_id 19 ≥3 ✅ / sql unique 2 ≥1 ✅ / hf host_id 28 ≥5 ✅ / hf exists ✅ / recordDispatch 1（m3）✅ / checkFencing 1（m3）✅ / HostIdFencingError 1 ✅ / fence ts NEW ✅ —— **8/8 全绿**。

### 继承守门（§4.10/§4.11 抽查）

completed_steps 10 / TODO(M1) 0 / better-sqlite3 16 / headless 53 —— 维持 ✅。

### 双 gate

`tsc --noEmit` **exit 0** ✅；`vitest run` **205 passed | 0 failed | 130 skipped (335, 52.5s)** ✅（v1.2.0b 基线 191p → +14；gated 池 107 → 130 = 3 NEW 套件 23 入池，与 prompt-review m3 口径一致）。

### cc-ready

`T-V1.2.0C-CROSSHOST-MACBOOK-PASS`（Commit 4 簿记后翻，流程自洽 ✓）。

---

## §3 新坑记档

1. **改实现必同步测试断言**（m1：版本号字符串是最易漂移的断言——建议测试引用实现常量而非字面）
2. **同行多段 pattern 对表驱动架构天然失配**（m2：域名入表后 fetch 行只剩变量——pattern 应锚定调用形态 + 表独立守门）
3. **class 方法形态逃逸 function/= pattern**（m3：TS 方法定义无关键字——API 守门 pattern 须含 `方法名\(` 形态）
4. **snake_case/camelCase 双拼写**（m4：json 字段 vs TS 标识符——跨语言守门 pattern 并列两形）
5. **注释豁免第三例**（m5：hygiene 声明注释自提禁用字面——建议注释改写为不含 pattern 字面的表述，如「model-specific identifiers per §1」）

---

## §4 遗留（user EXEC U1-U9 中未验证项）

- U1 newvps tsc / U3 compose 重启 / U4 130 gated 真跑 / U5 7 Funnel 200 / U8 MacBook 真部署 / U9 5 edge provision —— 真机链待用户
- v1.2.0c tag @ **b5a1d07**（U7 已于 prompt-review 校准；user 亲提 + Clash proxy push）
- U6 本 formal 复审 PASS 落定 ✓

---

*Codex review v1.2.0c v0.1 formal — 0C/0M/5m（全 pattern/测试层，零实现 bug）→ same-round 全闭 → PASS 0C/0M/0m；三源 116/128/12；双 gate tsc 0 + vitest 205p-0f-130g。*

Co-Authored-By: Claude Code <noreply@anthropic.com>
