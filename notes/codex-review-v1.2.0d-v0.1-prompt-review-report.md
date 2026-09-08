# Codex review v1.2.0d v0.1 — prompt-review (drafting-contract 审验)

> **Date**: 2026-09-01 (session) / 合同标注 2026-09-08 cycle
> **Scope**: `notes/codex-audit-scope-v1.2.0d-v0.1.md` (252 行, 重写版) + `notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md` (224 行)
> **Verdict**: 初审 **0C/4M/7m** → 同轮全清 → **PASS 0C/0M/0m**
> **Boundary**: `9781dcc` (v1.2.0d.2 cost-mode 收口 = 本轮真起跑点)

---

## §0 终态裁定

| 项 | 初审 | 修后 |
|----|------|------|
| Critical | 0 | 0 |
| Major | 4 (M1-M4) | 0 |
| Minor | 7 (m1-m7) | 0 |

起草态背景: 合同为 v1.2.0d 重启版(DeepSeek HTTP 直调 D16/D17 + Anti-OOM D7/D8/D9 + v1.2.0e 合并), 整份重写覆盖 d.1 旧合同(592→252 行, git 历史留存)。deepseek_client.ts 等 commit 2 NEW 文件未创建 = prompt-only 阶段正常态, 非 finding; 审验对象 = 守门数值/boundary/pattern 在 commit 2 后的可执行性与起草期事实一致性。

## §1 Major (4)

### M1 三源口径崩坏 + §3.2.1 自指恒红
- §1.3/§3.1 声明 self-injury 12 / disk 128「维持」; 重写后实测 **1 / 117**(旧 12 处自伤字面全灭, 唯一残存 = §3.2.1 pattern 行)
- §3.2.1 `grep -rE "MiniMax-M3|GLM 5.3|Fable 5" wrapper/ docs/m0b/ deploy/ notes/` 实测 **143** — notes/ 历史报告/合同全命中, 恒红
- 修: 口径重锚 1/117 + pathspec 去 notes/(三源公式锚定 notes 侧) + F2 行数 `≥320`→`==252`(起草行数声明 320/180 vs 实测 252/224 同源错误)
- 类型: v1.2.0b M2「重写后引用式口径不重锚」复刻

### M2 boundary 双错
- Trigger/D18/§7/cc-ready 全锚 `9c2e325` — 实为 **v1.2.0c formal 收口**; 35fd9d0 已把 d.1 boundary 校准 eff9da8, d.2 收口 9781dcc, 本轮真起跑点 = `9781dcc`(「v1.2.0e 3-host 闭环 @ 9c2e325」事实错, v1.2.0e 内容系 d 链内合并)
- §3.2.2 `git diff HEAD~24..HEAD # == 0` 实测 **170** 行(HEAD~24=0bfa73b 落 v1.2.0c 中段)— v1.0 冻结守门恒红
- tag 计划「@ 9c2e325」改为「@ 本轮收口 commit」
- 类型: v1.2.0c m1「跨周期复制 sha 必须跟着换」复刻

### M3 守门 pattern 抄回旧形态(d.1 formal 校准全丢失)
- `stop-timeout ≥5` 实测 2 红(真字段 stop_grace_period; 复合 10)— d.1 M1 校准丢失
- `memory > 80\|queue_depth > 100\|worker_offline > 5min` in prometheus.yml `≥3` 实测 1 红(条件真身 alerts.yml=4; metric 名 memory_used_mb>819/worker_count<1)— d.1 M2 校准丢失; `alert|Alert ≥3`=7 系结构行假绿
- `grep -c "memory:" ... ≥10` 实测 **0** — compose 全 mem_limit 形态(复合 18), 形态失配恒红
- `cpus: ≥4` 实测 0 — B 块 CPU limits 未实施, 标 post-commit-2 防起草期误判
- 修: 四处 GATE-CALIB 回填 d.1 教训

### M4 cc-ready 起草翻牌违规
- dirty cc-ready task_id `T-V1.2.0D-DEEPSEEK-HTTP-ANTI-OOM-PASS` — 起草 commit 1 期翻 PASS; 且 status/files_modified 行数声明(320/180)与实测(252/224)不符
- 修: `-PASS`→`-DRAFT` + 行数校准 + boundary 同步 + MEMORY.md 幻觉引用改 CHANGELOG.md
- 类型: v1.2.0c prompt-review M1「起草只能 -DRAFT」复刻

## §2 Minor (7)

| # | 发现 | 修 |
|---|------|----|
| m1 | F2 `wc -l ≥320` vs 实测 252 自打脸; §3.2.1 pathspec 扩 wrapper/ 引入 host_fencing 自检注释 3 处(d.1 原版精确 pathspec 无 wrapper/) | `==252`; 去 notes/ + 豁免 host_fencing |
| m2 | §8 F1 引用 `notes/MEMORY.md` 不存在(grep 报错恒红; cc-ready files_modified 同幻觉) | pathspec 改 CHANGELOG.md+README.md |
| m3 | `task_id.*v1.2.0d` 小写 pattern 实测 0(真值 `T-V1.2.0D-` 大写) | `grep -cE "task_id.*V1\.2\.0D"` |
| m4 | §3.7「`--profile\|--model` == 0 (注释除外)」不可 grep 验证(实测 6 = 4 注释+2 活代码) | 排注释行判活代码, post-commit-2 |
| m5 | F9 `model.*deepseek-v4-flash # == 3` 实测 4(commander 2+worker 2; base/orch 0) | `==4` |
| m6 | §2 B 块 9 `3host-compose.worker.yml Edit` — 实为 ?? NEW 未跟踪(v1.2.0e 新建) | 标 NEW |
| m7 | §9「§4.14 v1.2.0d.2 cost-mode 守门」编号与 v1.2.0c fencing 冲突 | 顺延 §4.19 |

## §3 修正后实测(全绿)

| 守门 | 期望 | 实测 |
|------|------|------|
| 三型号(去notes/豁免host_fencing) | ==0 | 0 ✓ |
| profile-override flash 计数 | ==4 | 4 ✓ |
| git diff 9781dcc..HEAD(v1.0 五路径) | ==0 | 0 ✓ |
| mem_limit(4 文件) | ≥10 | 18 ✓ |
| stop 复合 | ≥5 | 10 ✓ |
| alerts.yml alert: | ==3 | 3 ✓ |
| alerts.yml 条件 | ≥3 | 4 ✓ |
| targets 复合 | ≥7 | 19 ✓ |
| queue/metrics/compose 其余 | 各阈值 | 12/7/8/0*/5/15/10/1/12 ✓(cpus=0 系 post-commit-2 预期) |
| F1 cc-ready/CHANGELOG/README | ≥3 | 3 ✓ |
| F2 wc -l audit-scope | ==252 | 252 ✓ |
| F3 task_id V1.2.0D | ≥1 | 1 ✓ |
| 三源 | 116/1/117 | 116/1/117 ✓ |
| 双 gate | tsc=0 | 沿用 d.2 态(本轮无代码改动, 未触 gate) |

## §4 教训记档

1. **重写合同必须重锚三源**: 整份重写后 self/disk 口径是「维持」声明而非实测声明 — 每次重写 = 口径重算
2. **守门数值是 commit-2 后态**: `cpus: 0` 等实施前守门须标 post-commit-2, 防起草期误判恒红
3. **d.1 校准的宿命**: 被整份重写覆盖即全灭 — 校准记档必须同时写进 GATE-CALIB 注记(本轮已如此), 让下轮重写者可回溯
4. **覆盖式重写的代价**: 同名文件覆盖 d.1 旧合同(592→252) — git 历史留存但工作区失忆; sub-cycle 重启宜另开 d.3 文件名

## §5 修后文件清单

- `notes/codex-audit-scope-v1.2.0d-v0.1.md`: Trigger/§1.3/§3.1/§3.2.1/§3.2.2/§3.4/§3.6/§3.7/§4.1/§7 GATE-CALIB(M1/M2/M3/m1/m2/m4/m5)
- `notes/codex-audit-scope-v1.2.0d-v0.1-prompt.md`: Trigger/§2/§3/§4/§6/§7/§8/§9/§11 GATE-CALIB(同步 M1-M4 + m1-m7)
- `docs/poll/cc-ready.json`: -DRAFT 翻牌 + 行数/boundary/文件清单校准(M4)

*Prompt-review 闭环: 0C/4M/7m → 同轮全清 → PASS。等 Codex formal 轮(commit 2 后)再验实施态。*
