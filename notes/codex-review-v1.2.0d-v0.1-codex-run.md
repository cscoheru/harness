# Codex v0.1 codex-run — v1.2.0d prompt 反馈(跑 prompt 实测)

> **Date**: 2026-09-01 (session) / 合同 cycle 2026-09-08
> **对象**: `notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md` (224 行, 040db2e prompt-review 后态)
> **CLI**: codex 二进制不在机 — 按管线惯例由 Cline 会话代跑 Codex 审阅者角色, 逐条实测 prompt §3-§10 守门矩阵
> **Verdict**: 初审 **0C/1M/1m** → 同轮全清 → **PASS 0C/0M/0m — 合同就绪, 可启动 commit 2**

---

## §0 终态裁定

| 项 | 初审 | 修后 |
|----|------|------|
| Critical | 0 | 0 |
| Major | 1 (M5) | 0 |
| Minor | 1 (m8) | 0 |

## §1 §3-§7 NEW 守门 grep 实测(commit 2 前可跑项)

| 块 | 守门 | 期望 | 实测 | 判 |
|----|------|------|------|----|
| §3.2.1 | 三型号(去notes/豁免host_fencing) | ==0 | 0 | PASS |
| §3.2.2 | v1.0 diff 9781dcc..HEAD | ==0 | 0 | PASS |
| §3 3.7 | F9 profile-override flash | ==4 | 4 | PASS |
| §4 4.1 | mem_limit 4 文件 | ≥10 | 17 | PASS |
| §4 4.2 | mem 复合 deploy/*.yml | ≥7 | 18 | PASS |
| §4 4.4 | stop 复合 | ≥5 | 10 | PASS |
| §4 4.5 | 256M kernel | ≥1 | 1 | PASS |
| §4 4.6 | memswap | ≥7 | 18 | PASS |
| §5 5.2 | better-sqlite3/Database | ≥4 | 12 | PASS |
| §5 5.3 | WAL/busy_timeout | ≥3 | 7 | PASS |
| §5 5.4 | 202/Retry-After/Location | ≥3 | 8 | PASS |
| §5 5.6 | queue_depth/active | ≥4 | 5 | PASS |
| §6 全 10 项 | metrics/prometheus/runbook/prom-client/4metric/scrape/targets/alert:/条件/tag | 各阈 | 15/10/1/19/3/4/12 + 3 文件 Y | PASS |
| **§5 5.5** | **max_in_flight in orchestrator.ts** | **≥1** | **0** | **FAIL → M5** |

## §2 N/A-post-commit-2(commit 2 前不判红, 合同语义正确)

deepseek_client.ts 系(3.1/3.3/3.6/3.8-3.14 计 10 项) / cpus: B 块(4.3, 现测 0) / spawn dsh 迁移系(3.4 现测 2, 7.1 现测 1) / execution_driver deepseekInvoke(3.5 现测 0) / orch+wf deepseekInvoke(7.4) / @deprecated(7.5) / re-export(7.6) / dsh 活代码(7.2 现测 1 = L44 DEFAULT_DSH_BIN, commit 2 迁移目标) — 共 17 项, 全部正确标注待实施, 无误判红。

## §3 §8 v0.7 hygiene 8 项

8.1 vapid/sk=0 ✓ 8.2 WHISPER=0 ✓ 8.3 VAPID==0 ✓ 8.4 sleep=0 ✓ 8.5 container_name=8≥7 ✓ 8.6 F1=70≥3 ✓ 8.7 F2=252==252 ✓ 8.8 F3=1≥1 ✓ — **8/8 PASS**

## §4 §9 维持守门

§4.10-§4.13 引 v1.2.0d.1 formal report 绿态(eff9da8)维持; §4.19 (原误挂 §4.14, m7 已顺延) DEEPSEEK_COST_MODE @ v1.2.0d.2 (9781dcc) 维持; 本轮 diff 未触 wrapper 代码(除合同/簿记), 维持成立。

## §5 三源 + gate

- tracked 116 / disk 117 / self 1 — 锚定 ✓ (m1 口径)
- tsc = 0 维持(exit 0); 本轮无代码改动, vitest 不重跑(簿记滞后于 gate 实跑原则, commit 2 后双 gate 真跑)

## §6 §10 引用式 8 处

全部真机项 → 转 user EXEC 链(U 系列), 起草期 N/A-不判; commit 3 (7 host 真接 + gated 真跑) 后由 formal 轮验。

## §7 findings 明细

### M5 — 守门锚错落地物: max_in_flight
- 起草: `grep -cE "max_in_flight" wrapper/orchestrator/orchestrator.ts # ≥ 1`
- 实测 0; d.1 已落地 backpressure 全链但真身在 **queue_store.ts** L41-92(`DEFAULT_MAX_IN_FLIGHT = 50` + `QUEUE_MAX_IN_FLIGHT` env + `maxInFlight` field), orchestrator 侧走 `tryEnqueueOrThrottle()` 间接链(L249)
- 该守门 **post-commit-2 也恒 0 红**(commit 2 不会在 orchestrator.ts 加此字面) — v1.2.0d.1 M2 rule_files 悬空同型
- 修: 改锚 `grep -cE "MAX_IN_FLIGHT|maxInFlight" wrapper/orchestrator/queue_store.ts ≥ 1`, 修后实测 **10** PASS

### m8 — m4 注记活代码数小误
- 上轮 prompt-review m4 注记写「6 处中 4 注释 2 活代码」— 6 系 `--profile|--model` 计数串写; dsh 字面活代码实测 **1** 处(L44 `DEFAULT_DSH_BIN = "dsh"`)
- 修: 两份合同注记数字校准

## §8 教训记档

1. **守门必须锚已落地物**: d.1 已实施的 C 块, 其字面在 queue_store 非 orchestrator — 起草守门前先 grep 真身, 勿按 plan 章节名想当然
2. **两轮校准的接力**: prompt-review(040db2e) 清 drafting 错误后, codex-run 仍能捞出 1M — 每轮审阅视角不同(合同自洽 vs 合同-落地物对齐), 不可互相替代

## §9 修后文件

- `notes/codex-audit-scope-v1.2.0d-v0.1.md`: §3.5 L139 max_in_flight 改锚(M5) + L164 m4 注记数字(m8)
- `notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md`: §5 L105 同步(M5) + §7 L134 同步(m8)

*v0.1 codex-run 闭环: 0C/1M/1m → 同轮全清 → PASS。合同就绪, commit 2 (24 文件改动) 可启动 — 实施时须双 gate 真跑后翻牌(v1.2.0d.1「从未真跑」教训)。*
