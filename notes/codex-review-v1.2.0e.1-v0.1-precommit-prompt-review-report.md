# v1.2.0e.1 v0.1 precommit-prompt 审验报告

> **Date**: 2026-09-09
> **审验对象**: `notes/codex-audit-scope-v1.2.0e.1-v0.1-precommit-prompt.md` (452→457 行) + 配套合同镜像 `notes/codex-audit-scope-v1.2.0e.1-v0.1.md`
> **审验方式**: 全 §4.19-§4.22 + D7/D8 + L7 + hygiene 守门矩阵对**当前工作区** (commit 2 物料 20 M + 6 NEW 未提交) verbatim 实测 + 双 gate 复跑
> **判定**: 初审 **0C/3M/5m** → 同轮全清 (GATE-CALIB 19 处编辑: prompt 15 + 合同 4) → 修后全绿 → **PASS 0C/0M/0m**

---

## 1. 实测基线 (审验时工作区)

- 物料: 20 modified (+457/-11) + 6 NEW (814 行) = 26 文件,与 §2 清单**逐文件精确一致** (diffstat 全等;NEW 行数 209/26/58/25/244/252 全对)
- 双 gate 声明**属实**: `tsc --noEmit` exit 0 ✓;`vitest run` 189 passed / 0 failed / 165 skipped (13 file) ✓ 精确
- L7 memory 引用 ✓;D8 auto-init 测试安全 (console.error + return,无 process.exit;幂等 flag) ✓;`^\s*it\(` 锚定 9/4 与 A6 声明精确一致 ✓

## 2. Findings

### Major

| # | 发现 | 实证 | 修法 |
|---|------|------|------|
| **M1** | hy1 型号锁守门锚全 docs/ 域 = **119 恒红**,intent 却是 "本 commit 不引入" (diff 引入 = 0、NEW 文件 = 0 实证) — 门域 ≠ 意图域 | 119 hits 全为 docs/ 历史文档 (VISION×12 + DISPATCH + reports) pre-existing | GATE-CALIB 双锚: 配套合同形态 (`docs/m0b/` + host_fencing 豁免,实测 0) + `git diff` intent 锚 (实测 0) |
| **M2** | L7 P0 守门 timer.unref `==0` **双写恒红** (§4.20#4 + §4.7#3): src 2 hits 均为**注释本体** (edge-pull.ts L14 + heartbeat_sender.ts L87 — L7-lesson 注释引用 timer.unref 字面解释删除原因,m4-pattern 复刻) + wrapper/build stale 编译产物 2 + node_modules 污染 | 排除后活代码 = 0 | 门加 `-n` 行号前缀 + 排 build/node_modules + 排注释行 (`[[:space:]]` POSIX 形态) |
| **M3** | `already_active` 状态对象**三处声明 vs impl 不交付**: §2 M13/§3(A)/§6-F (及合同 F41/§2-F) 声明 register() 返回 `{worker_id, status}`;impl 实际 = 命中 findActiveByHost 直接 return 已存在 worker_id (同 id 即 dedup),RegisterStatus 仅 types.ts 导出零消费 → 原守门锚 worker_pool = 0 恒红 (M5 同型) | types.ts L155/L158 = 2;worker_pool.ts already_active = 0;189/0 全绿佐证 impl 自洽 | GATE-CALIB: 守门改锚 `RegisterStatus` types.ts ≥2 + 措辞 5 处改 "dedup = return 已存在 worker_id" |

### minor

| # | 发现 | 实证 | 修法 |
|---|------|------|------|
| m1 | §4.20#2 `workerCount\.` ≥3 (declared+set+reset) → 实测 **1** (声明行无尾点、无 reset path) | L88 唯一;交叉锚 bare workerCount = 4 | ≥1 + 形态注记 (合同 L92 镜像同步) |
| m2 | §4.21#3 精确串 `docker network create deploy_harness_net` = **0** — doc 实际带 `--driver bridge` flag | 放宽 `create.*deploy_harness_net` = 2 (L38 直建 + L51 幂等) | pattern 放宽 ≥2 |
| m3 | §4.7#4 Funnel `https://+字面主机` 正则 = **2 恒红** — CI L180 用 `${HOST}` 模板变量、doc 用 http://;且原命令缺 -r 对目录不可跑 | 裸域名计数 = 7 (压线 ≥7) | 裸 `fish-harness\.ts\.net` + -r |
| m4 | §4.7#5 `./node_modules/.bin/tsc` 从 repo root 不可跑 (root 无 node_modules) | ls 报 No such file | `cd wrapper &&` 前缀 |
| m5 | 合同 L91 `workerCount.set\|countActive` ≥2 → 实测 **1** (L88 单行同含双 pattern,grep 计行不计次) | 1 | ≥1 + 注记 |
| m6 | §2.3 "不在范围" 列有 M15 已改文件 (deepseek_e2e),双列易误读 | — | 措辞归位 "唯一例外,已列入 M15" |

### 审验过程自纠 (记档)

- M2 校准首版自踩**双坑**: ① 门命令漏 `-n` — 无行号前缀则 `:[0-9]:` 注释排除**永不匹配** (实测仍 2);② macOS BSD grep -E 的 `\s` 不可靠 → 终版双保险 `-n` + `[[:space:]]` = 0 ✓
- m3 注记首写 "实测 8",复核实为 **7** (workflow L180 + doc ×6),已纠

## 3. 修后全矩阵 (19 项全绿)

M1 hy1 = 0/0/0 · M2 timer.unref 活代码 = 0 · M3 RegisterStatus = 2 · m1 = 1 (bare 4) · m2 = 2 · m3 = 7 · 维持: findActiveByHost 3 / INSERT 1 / dedup tests 5 / concurrent 4 / circular 0 / HMAC 4 / git+compose 5 / CI 5 / it( 9 / describe 4 / D8 3 / D8 tests 2 / D7 dns 10 / ACL 20 / newvps 5 / monitoring 8 / aliases 1 · 双 gate tsc 0 + vitest 189/0/165

## 4. 结论

**PASS** — 合同与工作区实态零漂移,prompt 就绪可交 Codex CLI (`gpt-5.6-sol` + `xhigh`) precommit 复审。impl 侧零改动 (3M 全为守门/措辞校准,189/0 全绿佐证)。

### 遗留给 Codex 的 I-finding 参考

- RegisterStatus/WorkerRegisterResult 类型当前零消费 (API 消费者预留) — 可标注不阻塞
- deepseek_e2e 顺手修 (M15) 已在 §2.3 显式声明
