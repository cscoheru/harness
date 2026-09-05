# Codex v0.1 formal review — v1.2.0d 防 OOM（docker memory limits + queue 持久化 + monitoring）

> **Date**: 2026-09-05
> **Scope**: `9c2e325..18acbd1`（v1.2.0d 实施链 4 commits：`deb974d` v1.2.0c 簿记收口 + `de64791` v1.2.0d prompt-review 闭环 + `18acbd1` 核心实施 + `f722988` cc-ready 翻牌）
> **Reviewer**: Claude (Codex formal-review pipeline, per v1.2.0b/c 闭环模式)
> **终态**: **PASS — 0C/6M/5m → 同轮全部清零 → 0C/0M/0m**（6M 中 4M 为双 gate 从未真跑暴露的实现层缺陷）

---

## §1 终态裁定

```yaml
v1.2.0d v0.1 formal review:
  初审: 0C / 6M / 5m
  同轮清零: 6M 全修 + 5m 合同校准全写回 → 0C/0M/0m
  双 gate (修后实测): tsc=0 + vitest 227 passed / 0 failed / 139 gated (366 total)
  三源锚定: tracked 116 / disk 128 / 自伤 12 — verbatim 维持
  cc-ready: T-V1.2.0D-ANTI-OOM-PASS（簿记时序合规）
```

**核心结论**: v1.2.0d 实施链 `18acbd1` 声明「tsc 0 + vitest 230+ pass」但**双 gate 从未真跑**（U2 待跑即翻牌 PASS——簿记超前于实测，本周期最重教训）。初审实测 tsc=2 错误 + vitest 12 failed，全部同轮修复。compose/monitoring 层另有 2 实现缺口（edge graceful drain 字段缺失 + alerts.yml 悬空引用）。

---

## §2 Findings（初审 0C/6M/5m → 全闭）

### M1 — 5 edge compose `stop_grace_period` 缺失（注释撒谎型，v1.2.0b M1 同型）

- **file**: `deploy/6host-compose.edge[1-5].yml` L48 等
- **claim**: `# v1.2.0d NEW per D7 + F27: edge wrapper 1G + 30s graceful drain` — 注释宣称 30s graceful drain，**compose 里无任何对应字段**（全 deploy 仅 newvps×2 有）
- **实测**: `grep -l stop_grace_period deploy/6host-compose.edge*.yml | wc -l` = **0**（H9 红）；stop 复合 2 < 5（H11 红）
- **fix**: 5 文件 memswap_limit 后补 `stop_grace_period: 30s`（compose 原生字段，等价 CLI `--stop-timeout=30`）→ 修后 5/5，复合 9 ≥5 ✓

### M2 — `alerts.yml` 悬空引用（rule_files 指向不存在文件）

- **file**: `deploy/monitoring/prometheus.yml` 尾部
- **claim**: `rule_files: - "alerts.yml"` — **该文件不存在**（monitoring/ 仅 prometheus.yml + runbook.md）。3 条 alert rules 仅存在于 runbook.md 文档描述，可执行规则 **0 条**
- **假绿**: H18 复合 pattern = 5 通过——`alert` 字面全部来自 prometheus.yml 结构行（alerting/alertmanagers/rule_files/注释），掩盖悬空
- **fix**: NEW `deploy/monitoring/alerts.yml`（3 groups：WrapperMemoryHigh / WrapperQueueDepthHigh / WorkerOffline，各 for 5m，metric 名对齐 metrics.ts 真实导出 memory_used_mb/queue_depth/worker_count）+ runbook.md `wrapper_queue_depth` 文档口径校准 → 修后 `grep -c "alert:"` == 3 ✓

### M3 — routedDsh wire 双缺陷：import 指向不存在模块 + F22 fallback 死路径

- **file**: `wrapper/orchestrator/execution_driver.ts` L230 / L214
- **claim 1**: `await import("../dsh/6host_router.js")` — `dsh/6host_router.ts` **不存在**（routedDsh 实际住 `orchestrator/6host_router.ts` 自 v1.2.0c）→ tsc TS2307 + 运行时必炸
- **claim 2**: `if (handle.child) { streamSpawnSubprocess; return; }` — 本机有 dsh 时永不回退；无 dsh 时 ENOENT 直接 failed——**routedDsh fallback 在任何环境不可达**（死路径）
- **fix**: ① import 改 `./6host_router.js`；② spawn `ENOENT` 分支转 `streamRoutedDshFallback`（F22 生产故事：edge 容器无本地 dsh → cross-host 远程）；③ `DSH_FORCE_HTTP=1` 分流保留 v1.2.0b 测试契约（直 fetch(dshHttpUrl)）
- **测试侧**: routedDsh 2 用例自相矛盾（设 FORCE_HTTP=1 却断言 source='routed_dsh'）→ 删 FORCE_HTTP + `dshBin: "/nonexistent/dsh-unit-test"` 注入 ENOENT + URL-aware fetch mock + 合法 JSON body

### M4 — prom-client 未声明未安装（依赖缺失）

- **file**: `wrapper/package.json`
- **claim**: `metrics.ts` L24 `from "prom-client"` — **package.json 无此依赖** → tsc TS2307 + 运行时必炸
- **fix**: `npm install prom-client --save`（^15.1.3）→ tsc 0 ✓

### M5 — queue_store dequeue/reclaim 语义断裂（测试互相矛盾暴露）

- **file**: `wrapper/orchestrator/queue_store.ts`
- **claim**: `dequeue()` 只 `inMemory.shift()` 不更新 SQLite → `pendingCount()` 恒不减（该测试红）；reclaim 用例又依赖「dequeue 后行仍可拉回」——**两测试在任何单一 dequeue 语义下不可能同时通过**（实施链从未真跑的直接证据）
- **fix**: 统一生命周期 pending→dispatched→completed：dequeue 同步 `markDispatched`（否则 crash recovery 重复派发）；reclaim 改拉 `status != 'completed'` 行（dispatched-but-never-completed 正是 crash recovery 对象）+ Set 跳过已在内存行 → 11/11 ✓

### M6 — worker_pool registered_at 秒级 + F21 键序错置 + 非单调时钟（v1.2.0b M1 单位契约复刻）

- **file**: `wrapper/orchestrator/worker_pool.ts`
- **claim 1**: `Math.floor(nowMs / 1000)` 写 registered_at（秒），读侧 `row.registered_at * 1000`（×1000 残留）——同秒注册全 tie；drained_at 同病
- **claim 2**: F21 起草键序 `..., worker_id ASC, registered_at ASC`——同 ms tie 时字典序压过注册序，round_robin「先注册先派」失效
- **claim 3**: `unixNowMillis() = Date.now()` 非单调——连续调用同 ms 仍全 tie
- **fix**: ① registered_at/drained_at 全链 ms 化（写 nowMs / 读去 ×1000 / 注释×2）；② 键序改 `last_heartbeat_at ASC, registered_at ASC, worker_id ASC`；③ unixNowMillis 单调化（lastTickMs 严格递增）→ 37/37 ✓

### m1-m5 — 合同层校准（GATE-CALIB 全写回）

- **m1**: H7 服务归属按实际布局写回（newvps-compose 4 + 6host-newvps 6 + monitoring 栈）；H9 补 compose 原生字段说明
- **m2**: H18 改 alerts.yml 落地验证 + 拆条防 `alert` 字面假绿
- **m3**: §3.2.4 `targets.*newvps` 对多行 targets 列表失配（v1.2.0c m2 同型）→ 改锚 `fish-harness.ts.net:300` ≥8
- **m4**: H19 键序写回（registered_at 提前）
- **m5**: alert condition ==3 被 summary 注释同字面多算 → 拆 `expr:` 行 ==3

---

## §3 修后全矩阵实测

| 守门 | 期望 | 实测 | 状态 |
|---|---|---|---|
| H1-H6 净守门（型号/凭据/ACL） | 全 0 | 全 0 | ✓ |
| H7/H8 memory limits（实际布局） | 4+6 | 4+6 | ✓ |
| H9 edge stop_grace_period ×5 | 5/5 | 5/5 | ✓ |
| H10 macbook limit+reservation | 2 | 2 | ✓ |
| H11 stop 复合 | ≥5 | 9 | ✓ |
| H12-H15 queue（NEW/WAL/202·429/max_in_flight） | 全过 | 9/6/1 | ✓ |
| H16-H17 metrics/prometheus NEW | 存在 | 10314B/4247B | ✓ |
| H18 alert rules 落地 | ==3 | 3 | ✓ |
| H19 tertiary sort（校准键序） | ≥1 | 1 | ✓ |
| H20 routedDsh wire | ≥1 | 6 | ✓ |
| §3.2.1-3.2.3 compose/queue/metrics 复合 | ≥27/≥12/≥8 | 36/29/25 | ✓ |
| §3.2.4 prom 复合（校准拆条） | ≥10/≥8/==3/≥3 | 10/10/3/4 | ✓ |
| §3.2.5-3.2.8 tertiary/wire/ACL/声明 | ≥2/≥2/≥4/≥5 | 4/6/13/41 | ✓ |
| 三源 | 116/128/12 | 116/128/12 | ✓ |
| tsc / vitest | 0 / 0f | 0 / 227p·0f·139g | ✓ |
| cc-ready / CHANGELOG / README | PASS/≥1/≥1 | PASS/15/12 | ✓ |

---

## §4 教训记档（供 v1.2.0e+ 教训库）

1. **「双 gate 从未真跑」是本周期最重缺陷类型**: cc-ready 翻 PASS + commit message 声明 ≠ 实测——簿记必须滞后于 gate 实跑（U2 待跑 ≠ 可翻牌）
2. **rule_files 悬空是 monitoring 版「注释撒谎」**: 结构行字面（alert/alerting）喂饱复合 pattern——守门 pattern 必须锚定落地物
3. **单测环境假设容器路径（/data）**: 测试必须 QUEUE_STORE_DB/WORKER_POOL_DB env 指 tmp（实现有 env 覆盖，测试侧漏设）
4. **同 ms tie 三连**: 秒级精度 / 键序错置 / 非单调时钟——round_robin 需写点精度×键序×时钟单调三方对齐（v1.2.0b M1 的时序版）
5. **测试自相矛盾 = 从未真跑的铁证**: 两用例在单一实现语义下不可能同时通过时，先查 gate 是否跑过
6. **spawn ENOENT 回退才是 fallback 真触发器**: 「有本地 bin 走本地、ENOENT 走远程」需显式分支；FORCE_HTTP 保留为测试契约通道

---

## §5 收口

- 同轮修复: 本报告 + 16 文件（5 edge compose + alerts.yml NEW + runbook + 2 合同 + execution_driver/queue_store/worker_pool 3 实现 + 3 测试 + package.json/lock）
- 双 gate 修后实测: tsc=0 + vitest 227p/0f（366 total, 139 gated per U4 真跑）
- 后续 user EXEC U 链: U2 双 gate 确认 + U3 compose 重启（含 alerts.yml 挂载）+ U4 139 gated 真跑 + U10 Prometheus /targets 告警面板真验

*v1.2.0d v0.1 formal review PASS — 0C/0M/0m 同轮清零闭环（per v1.2.0b/c 模式）。*

