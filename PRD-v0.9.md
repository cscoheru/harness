# PRD-v0.9 — 上下文分层 + 负载均衡（Context Layering + Load Balancing）

> **File**: `PRD-v0.9.md`
> **Version**: v0.9 (v0.9-A + v0.9-B)
> **Date**: 2026-08-30
> **Status**: Stage 1 (Research MVP) — incremental scope over v0.8
> **Supersedes**: PRD-v0.7 §5.2 上下文（v0.7 把 context 当作 blob 流，未分层）
> **Inherits**: PRD-v0.7 Stage gate + M0/M1/M2/M3 退出标准 + Q103-Q116 决策日志
> **Scope (incremental)**:
>   - v0.9-A：上下文 4 层（Context Layering）—— L0/L1/L2/L3 + budget + lineage + append-only
>   - v0.9-B：负载均衡（Load Balancing）—— workers 表 + WorkerPool Protocol + 跨 server dispatch + graceful drain
>   - v0.9-B 增量见本文 §9-§14

---

## §1 背景与动机

### 1.1 v0.7/v0.8 现状

- `blobs` 表存"任意 bytes"，有 `trust_label`，但**没有"层"的概念**
- `artifacts` 表存"命名产物"（kind / schema_ref），但 L0/L1/L2/L3 没有区分
- `task_links` 表存"task ↔ artifact 多对多"，role 只有 `input|output|intermediate|evidence`，没有 `working_set|handoff`
- Claude Code 的上下文机制（200K window、auto-compact、cache breakpoint、tool result truncation、@-mention、sub-agent context）**没有在 harness 层表达**

### 1.2 李厚辰 harness 视频观点

- 上下文机制是 harness 编排的核心，与 commander / worker 同样重要
- 上下文必须基于 Claude Code 上下文机制做"分层设计"
- 简单把"任何内容塞进 working_set"会让 task 越长越撞 Claude Code 上下文上限

### 1.3 为什么 v0.9 而不是 v1.0

- v0.8 M1 八条硬门槛中 1/2/3/4 已 ✅；5/6/7/8 🟡 部分
- 不解决 v0.9-A → Research vertical slice 跑长 task 时会撞 Claude Code 上限
- v0.9-A 增量小（1 张表 + 1 个 Protocol + 1 个 event + 1 个 spike），不破坏 v0.8 已有的 ✅ 状态

---

## §2 范围（Scope）

### 2.1 In-Scope（v0.9-A）

| 项 | 落地位置 |
|----|---------|
| 4 层上下文定义（L0/L1/L2/L3） | `spec/context-layers.md` |
| `tasks.context_budget_tokens INTEGER` | `spec/kernel-schema.sql` |
| 新表 `context_snapshots` | `spec/kernel-schema.sql` |
| 新 Protocol `ContextDistiller` | `spec/interfaces/context_distiller.py` |
| 新 Protocol `ContextBudget` | `spec/interfaces/context_distiller.py` |
| 新事件 `context.snapshot` | `spec/events/context.snapshot.json` |
| 新 spike `context-budget-test.py`（含 I11-I14 反例） | `spikes/m0/context-budget-test.py` |
| ADR 0006（决策依据） | `adr/0006-context-layering.md` |
| 第二实现 `TrivialContextDistiller` | `spikes/m0/conformance-second-impl.py` |
| CI 工作流新增 context tests job | `.github/workflows/m0-contract-tests.yml` |
| v0.9 增量记录 | `RESPONSE-TO-CODEX-v0.7-REVIEW.md` 末尾 §v0.9 增量 |

### 2.2 Out-of-Scope（v0.9-A）

- **v0.9-B 负载均衡**（workers 表 / WorkerPool Protocol / 跨 host dispatch）→ 见 §9-§14
- **distill worker 自动调度**（在 tool 返回时异步 distill L1）→ M3 范围
- **auto-compact 触发器**（当 working_set token 用完自动 L2→L3）→ M3 范围
- **跨 attempt 共享 L1 单元的语义** → M3 范围
- **替换 v0.7 `blobs`/`artifacts`/`task_links` 三层数据模型** → v0.9-A 增量叠加，不替换

### 2.3 与 v0.7/v0.8 的兼容

- v0.7 `blobs`/`artifacts`/`task_links` 三层数据模型**保持不变**
- v0.9-A 引入的 `context_snapshots` 是**第四张表**，记录 L1/L2/L3 元数据，不替代 v0.7 的 blob 流
- v0.8 M1 八条硬门槛中已有的 ✅ 状态**保持不变**（schema 在原 SQLite 上加列加表，trigger 不动）
- 旧 spike（claim-fence / cancel-race / approval-supersede / conformance / egress / policy-direction）**不需要修改**

---

## §3 Stage Gate（继承自 v0.7）

| Stage | 描述 | v0.9-A 增量 |
|-------|------|------------|
| **Stage 0** | 文档化 + 一致性 | PRD-v0.9 + ADR 0006 + spec/context-layers.md |
| **Stage 1** | Web-only Research MVP（3 capabilities） | 长 task 跑通上下文分层（context budget 不超） |
| **Stage 2** | Multi-tenant + 审计 + retention | 同上 + retention 删除包含 L1/L2 的快照 |
| **Stage 3** | General agents + cost optimization | auto-compact + distill worker |

---

## §4 M0/M1/M2/M3 退出标准（增量部分）

v0.9-A 仅影响 M0 + M1。M2/M3 沿用 v0.7。

### 4.1 M0 增量门槛（v0.9-A 新增）

| # | 硬门槛 | v0.9-A 交付 |
|---:|--------|-------------|
| M0-9 | 4 层上下文在 schema 中可识别 | `spec/kernel-schema.sql` 新表 `context_snapshots` + `tasks.context_budget_tokens` |
| M0-10 | ContextDistiller Protocol + 第二实现 | `spec/interfaces/context_distiller.py` + `conformance-second-impl.py` TrivialContextDistiller |
| M0-11 | context.snapshot 事件 schema 合法 | `spec/events/context.snapshot.json` 通过 check-jsonschema |
| M0-12 | I11-I14 不变量有反例 spike | `spikes/m0/context-budget-test.py` |

### 4.2 M1 八条硬门槛 — v0.9-A 重标

v0.8 已 4 条 ✅ + 4 条 🟡 部分。v0.9-A 不破坏任何 ✅ 状态；新增 M0-9/10/11/12 共 4 条全部需跑通才能 v0.9 提交 Codex。

---

## §5 决策日志（v0.9-A 增量）

### 5.1 Q201：上下文为什么分 4 层而不是 2 层（L0 / L3）？

**选项 A**：2 层（raw + handoff），最简单
**选项 B**：3 层（raw + distilled + handoff）
**选项 C**：4 层（raw_blob / distilled / working_set / handoff）✓
**决策**：**C**
**理由**：
- A 丢掉了"task 运行期间的 working_set"——working_set 跟 handoff 是不同的语义
  - working_set 是 task 正在使用的活跃上下文，需要被裁剪 / 计费 / 计 token
  - handoff 是 task 切换 / cancel 时持久化的压缩包
- B 把"distilled"和"working_set"合一，但两者生命周期不同（distilled 是 idempotent 单元，working_set 是每次 attempt 都有）
- D / 5 层以上冗余：trust_label 在 L1 单元里就标记，没必要单独一层

### 5.2 Q202：working_set token 计数放在哪里？

**选项 A**：在 `task_attempts.context_token_count`（每次 transition 更新）✓
**选项 B**：在 `tasks.context_budget_tokens`（task 级 budget）—— 配合 `task_attempts.current_token_count`
**决策**：**A+B 组合**
**理由**：
- `tasks.context_budget_tokens` 存"该 task 的总预算"（task 创建时由 WorkflowPack 声明）
- `task_attempts.context_token_count` 存"当前 attempt 实际使用量"（每次 charge() 自增）
- kernel 在 `charge()` 时检查 `token_count + delta ≤ task.context_budget_tokens`；越界直接 raise BudgetExceeded

### 5.3 Q203：L1 蒸馏的 idempotency 怎么实现？

**选项 A**：靠 `blobs.sha256` UNIQUE 约束（同 input 必同 sha256）✓
**选项 B**：在 `context_snapshots` 表加 UNIQUE `(raw_blob_id, distiller_version)` 约束
**决策**：**A**
**理由**：
- `blobs.sha256` 已有 UNIQUE 约束（v0.7 schema），同 input 字节必同 sha256
- `context_snapshots` 表 `distilled_blob_id` 指向 `blobs.blob_id`，sha256 由 FK 链路保证唯一
- 不需要再加 UNIQUE 索引
- distiller_version 是属性（写入 `context_snapshots` 的 `distiller_version` 字段），不是 key

### 5.4 Q204：cross-attempt handoff 怎么防信任污染？

**选项 A**：handoff blob 在写入时强制 `trust_label` 字段必填，PDP 在 L3 恢复时检查 ✓
**选项 B**：trust_label 在 L1 单元继承（raw_blob 的 trust_label）
**决策**：**A+B 组合**
**理由**：
- L1 单元的 trust_label = 原始 raw_blob 的 trust_label（继承，不可变）
- L2 working_set 的 trust_label = 当前 task 的 owner trust_label（trusted_user_input）
- L3 handoff 的 trust_label 必须显式声明，且 kernel 拒绝 handoff blob trust_label = `untrusted_external`（Q205）

### 5.5 Q205：L3 handoff 能否被 `untrusted_external` 信任级别污染？

**选项 A**：禁止 — kernel 拒绝写入 trust_label=untrusted_external 的 handoff blob ✓
**选项 B**：允许但加审计
**决策**：**A**
**理由**：
- handoff 是 task 切换时"恢复"的入口；如果污染，下个 attempt 拿到的就是攻击者控制的上下文
- 必须 DB 层禁止：`CHECK (trust_label IN ('trusted_user_input','model_generated','internal_secret'))` 加在 handoff 写入路径
- spike 反例：写入 `untrusted_external` 的 handoff 必须被 CHECK 约束 reject

### 5.6 Q206：context budget 超限是 soft fail 还是 hard fail？

**选项 A**：soft fail — 仅警告，由 driver 自己决定裁剪
**选项 B**：hard fail — kernel 直接 raise BudgetExceeded ✓
**决策**：**B**
**理由**：
- soft fail 容易被 worker 忽略；hard fail 强制 worker 必须裁剪或 cancel
- 与 v0.8 fence/cancel 风格一致（kernel 层强制，不依赖 driver 自律）
- spike 反例：charge 超 budget 必须抛 BudgetExceeded（不是返回 None / 不是 warning）

### 5.7 Q207：context snapshot 是 append-only 还是可改？

**选项 A**：append-only（与 task_events / audit_log 一致）✓
**决策**：**A**
**理由**：
- snapshot 是 task 的"历史上下文足迹"，跟 event/audit 一样不可篡改
- 不需要 UPDATE 路径；新一次 snapshot 直接 INSERT
- I11 budget 检查发生在 INSERT 时，不是 UPDATE 时

---

## §6 反例清单（Codex v0.9 必查）

v0.9-A 必跑的反例（spike 必须能复现，spike 必须能拒绝）：

| 编号 | 反例 | 期望拒绝位置 |
|------|------|-------------|
| **P0-9A** | charge 超 budget 的 token 数 | I11 trigger BudgetExceeded |
| **P0-9B** | 写入 L3 handoff 时 trust_label=untrusted_external | I14 CHECK 约束 |
| **P0-9C** | L1 distilled_blob_id 指向不存在的 raw_blob | FK 约束 |
| **P0-9D** | cross-attempt handoff 缺少 task_id | NOT NULL 约束 |
| **P0-9E** | snapshot.token_count < 0 | CHECK 约束 |
| **P0-9F** | snapshot.level 不在 {L0,L1,L2,L3} | CHECK 约束 |

---

## §7 复审门槛（Codex v0.9 提交规则）

v0.9-A 提交 Codex 时，下一轮（v0.9.1）必须满足：

1. 全部 6 个反例（§6）有 spike case 跑通
2. `spec/kernel-schema.sql` 在原 SQLite 上跑 `sqlite3 :memory: < spec/kernel-schema.sql` 不报错
3. `spikes/m0/context-budget-test.py` 6 个 case 全部 OK
4. `spikes/m0/conformance-second-impl.py` 新增 7th Test（ContextDistiller）OK
5. CI workflow 新增 `spike-py-context-budget` job 并跑通
6. ADR 0006 Status: Accepted + Status date ≤ 2026-08-31

---

## §8 风险与开放问题

| 编号 | 风险 | 缓解 |
|------|------|------|
| **R9-1** | L1 distilled 单元可能被 driver 缓存，绕过 ContextDistiller Protocol | I12 check 落在 `context_snapshots.distilled_blob_id` 的 FK；任何 working_set 写入必须先 INSERT snapshot |
| **R9-2** | `tasks.context_budget_tokens` 缺省值（NULL = 不限）可能被滥用 | 由 WorkflowPack.manifest.context_requirements 声明，driver 必须传；kernel 在 claim 时若 NULL 警告 |
| **R9-3** | handoff 序列化的格式未定（JSON / msgpack / protobuf） | v0.9-A 仅约束"handoff 必须是一个 blob"；具体格式留给 pack 自己，kind='handoff.*' 由 pack 注册 |
| **R9-4** | ContextBudget Protocol 的 `charge()` 是 async 还是 sync？ | v0.9-A 同步；M2 引入 async pool 时再调整（charge 必须支持 batch） |

---

## §9 v0.9-B 范围（负载均衡）

### 9.1 背景

v0.7-v0.8 已有 `claim(task_id, worker_id)` 接口（`spec/state-transitions.md §1.1`），但：

- **没有 worker 注册表**：worker_id 是任意的字符串，没有 status / heartbeat / capabilities 概念
- **没有公平性保证**：dispatch 由 driver 自己决定，可能把 task 全派给同一 worker
- **没有 graceful drain**：worker 重启 / 维护会让 active attempt 持 lease 不释放
- **跨 server 行为未定义**：v0.7 spike 只验证单进程 SQLite，跨 host 共享 DB 的 fence / lease 语义需要形式化

### 9.2 In-Scope（v0.9-B）

| 项 | 落地位置 |
|----|---------|
| 4 层负载均衡语义（L0 task_dispatch / L1 worker_lifecycle / L2 cross_server / L3 graceful_drain） | `spec/worker-pool.md` |
| 新表 `workers`（worker_id / host / capabilities_json / status / last_heartbeat_at / current_attempt_id） | `spec/kernel-schema.sql` |
| 4 个新不变量触发器（I15 active-attempt / I16 lease-renewal / I17 drain-pause / I18 cross-server） | `spec/kernel-schema.sql` |
| 新 Protocol `WorkerPool`（dispatch / heartbeat / drain / reap_stale） | `spec/interfaces/worker_pool.py` |
| 3 个新事件（`worker.dispatched` / `worker.heartbeat` / `worker.drained`） | `spec/events/worker.{dispatched,heartbeat,drained}.json` |
| ADR 0007（决策依据） | `adr/0007-worker-pool.md` |
| 新 spike `worker-dispatch-test.py`（双 worker 池 + 公平性 + drain race + 真并发） | `spikes/m0/worker-dispatch-test.py` |
| 第二实现 `TrivialWorkerPool` | `spikes/m0/conformance-second-impl.py` |
| CI 工作流新增 `spike-py-worker-dispatch` job | `.github/workflows/m0-contract-tests.yml` |
| `state-transitions.md §1.1` claim 改成 `worker_pool.dispatch → claim` | `spec/state-transitions.md` |

### 9.3 Out-of-Scope（v0.9-B）

- **跨数据中心分片**（按 tenant 路由到不同 SQLite cluster）→ M3 范围
- **Litestream / rqlite 替换 SQLite**（R-B1 决策：v0.9-B 接受 SQLite WAL 限制） → M3 范围
- **动态 worker 自动扩缩容**（K8s-style HPA）→ M3 范围
- **WorkerPool 真实公平性算法**（least-loaded / cost-aware）→ v0.9-B 仅 round-robin + capability-match

### 9.4 与 v0.7/v0.8/v0.9-A 兼容

- v0.7/v0.8 的 `claim(task_id, worker_id)` 接口签名**不变**；v0.9-B 只新增 `WorkerPool.dispatch()` 作为上层入口
- v0.9-A 的 `tasks.context_budget_tokens` 与 `context_snapshots` **不变**；`workers.current_attempt_id` 是新增字段
- `worker_id` 字段在 `task_attempts` 中已存在；v0.9-B 添加 FK 关系（attempt.worker_id → workers.worker_id，可选）
- 旧 spike（claim-fence / cancel-race / supersede / conformance / egress / policy-direction / context-budget / context-event-schema）**不需要修改**

---

## §10 v0.9-B 不变量（I15-I18）

| ID | 内容 | 强制方式 |
|----|------|---------|
| **I15** | 每 task 最多一个 active attempt，跨 server 也成立（已由 v0.8 partial unique index `idx_attempts_one_active` 保证；v0.9-B 在 `workers.current_attempt_id` 上加 UNIQUE 约束防止同一 worker 同时接两个 active attempt） | partial unique index + UNIQUE(worker_id) WHERE status IN active |
| **I16** | worker 的 lease_token 必须周期性 renew；超过 lease_expires_at 的 attempt 必须被 reaper 处理 | trigger `trg_attempt_lease_renewal` + 触发 `worker.heartbeat` 事件 |
| **I17** | drain 期间不再派发新 task 给该 worker；active attempt 允许完成或被 cancel | trigger `trg_worker_drain_pause` 在 status='draining' 时拒绝 dispatch |
| **I18** | 跨 server dispatch 靠 SQLite WAL 文件共享（不是 SQLite 集群）；同 host 内 / NFS 共享 / Litestream follower 都视为 "WAL sync 后的可见性" | 文档约束 + spike 真并发验证 `connect_with_fk(path)` 共享 file-DB |

### 10.1 I15 详细语义

`task_attempts` 上已有 `idx_attempts_one_active`（partial unique, status IN ('claimed','running','cancel_requested')）。v0.9-B 增加：

```sql
-- 同一 worker 不能同时持有多于一个 active attempt
CREATE UNIQUE INDEX idx_worker_one_active_attempt
    ON task_attempts(worker_id)
    WHERE worker_id IS NOT NULL
      AND status IN ('claimed', 'running', 'cancel_requested');
```

worker_id 已有可空性；v0.9-B 让 trigger 在 attempt 状态变 active 时强制 worker_id IS NOT NULL：

```sql
CREATE TRIGGER trg_attempt_active_needs_worker
BEFORE INSERT ON task_attempts
FOR EACH ROW
WHEN NEW.status IN ('claimed', 'running', 'cancel_requested') AND NEW.worker_id IS NULL
BEGIN
    SELECT RAISE(ABORT, 'I15: active attempt must reference a worker_id');
END;
```

### 10.2 I16 详细语义

lease_token 在 v0.7 schema 已存 `task_attempts.lease_token` + `lease_expires_at`（renewable by heartbeat）。

v0.9-B 添加的触发器：worker heartbeat 写入 `workers.last_heartbeat_at`，由 `WorkerPool.reap_stale()` 周期性扫描，超过 N 倍 heartbeat 间隔的 worker 标 stale → 不再 dispatch。

```sql
CREATE TRIGGER trg_worker_heartbeat_renew
BEFORE UPDATE ON workers
FOR EACH ROW
WHEN NEW.status = 'active'
     AND (OLD.last_heartbeat_at IS NULL OR NEW.last_heartbeat_at = OLD.last_heartbeat_at)
BEGIN
    SELECT RAISE(ABORT, 'I16: worker heartbeat must advance last_heartbeat_at');
END;
```

### 10.3 I17 详细语义

drain 是 worker 主动声明的状态变化（admin / SIGTERM handler）。在 drain 期间：

- **不允许** dispatch 新 task 给该 worker（`idx_worker_not_draining` 在 `dispatched_attempt_id` 上的拒绝语义由 `trg_worker_drain_pause` 实现）
- **允许** active attempt 完成或 cancel（drain 不强制 kill）

```sql
CREATE TRIGGER trg_worker_drain_pause
BEFORE UPDATE ON workers
FOR EACH ROW
WHEN OLD.status = 'active' AND NEW.status = 'draining'
     AND NEW.current_attempt_id IS NOT NULL
     AND (SELECT status FROM task_attempts WHERE attempt_id = NEW.current_attempt_id) IN ('succeeded', 'failed', 'canceled', 'expired')
BEGIN
    SELECT RAISE(ABORT, 'I17: cannot drain worker with already-terminal current_attempt_id (stale reference)');
END;
```

drain 完成（active attempt 自然结束）→ worker 状态自动转 'drained'。

### 10.4 I18 详细语义

跨 server 共享 DB 的 fence / lease 语义：

- SQLite WAL 文件被多个 host 同时 open = 可能 stale read（除非 explicit sync）
- v0.9-B 要求：跨 server dispatch 之前必须确认 SQLite 在所有 host 上已 fsync 写入（WAL 已 checkpoint）
- spike 通过 `connect_with_fk(path)` 共享 file-DB + threading.Barrier 验证真并发下的 fence/lease 一致性

**这是文档约束，不是 SQL 约束**：SQLite 本身不支持跨 host 分布式共识。

---

## §11 v0.9-B 4 层定义

### 11.1 L0 task_dispatch

- 入口：`WorkerPool.dispatch(task_id) -> worker_id`
- 策略：v0.9-B 默认 round-robin；可选 capability-match（`workers.capabilities_json` 包含 task 所需 capability 时优先）
- 输出：worker_id（必填）；调用方随后 `claim(task_id, worker_id)` 走 v0.7 接口

### 11.2 L1 worker_lifecycle

- 注册：worker 启动时 `WorkerPool.register(host, capabilities_json, status='active')` → INSERT INTO workers
- 心跳：worker 每 5s 调用 `WorkerPool.heartbeat(worker_id)` → UPDATE last_heartbeat_at
- 退役：worker 关闭时 `WorkerPool.drain(worker_id)` → UPDATE status='draining'
- Reaper：周期性 `WorkerPool.reap_stale(now)` → 标 stale worker 为 'stale'

### 11.3 L2 cross_server

- fence_version 是 task-local（已是 v0.7 决策 Q107）
- lease_token 是 task-attempt-local（worker 重启不影响 in-flight attempt 的 lease）
- 跨 server dispatch 必须靠 SQLite WAL sync2（同 host 或 NFS 共享）

### 11.4 L3 graceful_drain

- drain 流程：
  1. worker 收到 SIGTERM
  2. worker 调 `WorkerPool.drain(worker_id)` → status='draining'
  3. WorkerPool 不再 dispatch 新 task
  4. worker 等待 active attempt 自然完成（status in succeeded/failed/canceled）
  5. worker 退出
- drain 超时：M3 范围（v0.9-B 不强制超时）

---

## §12 v0.9-B 反例清单（Codex v0.9-B 必查）

| 编号 | 反例 | 期望拒绝位置 |
|------|------|-------------|
| **P0-9G** | 同一 task 被两个 worker 并发 dispatch 真并发 | partial unique index `idx_attempts_one_active` + 真并发 spike Case 25 |
| **P0-9H** | 同一 worker 同时持两个 active attempt | new partial unique index `idx_worker_one_active_attempt` + Case 26 |
| **P0-9I** | worker 在 active 状态没填 worker_id | `trg_attempt_active_needs_worker` + Case 27 |
| **P0-9J** | worker heartbeat 不更新 last_heartbeat_at | `trg_worker_heartbeat_renew` + Case 28 |
| **P0-9K** | drain 时 worker.current_attempt_id 引用已 terminal 的 attempt | `trg_worker_drain_pause` + Case 29 |
| **P0-9L** | worker 的 last_heartbeat_at 是 NULL | NOT NULL 约束（不依赖 worker_status）+ Case 30 |
| **P0-9M** | worker_status 不在合法枚举 | CHECK 约束 + Case 31 |
| **P0-9N** | worker 的 current_attempt_id 指向不存在的 attempt | FK 约束 + Case 32 |
| **P0-9O** | worker dispatch 时绕过 kernel 直接 INSERT attempt（违反 v0.7 claim 协议） | spike Case 33 验证 claim-via-pool 等价路径 |

---

## §13 v0.9-B 决策日志

### 13.1 Q208：worker 状态机怎么设计？

**选项 A**：3 状态（active / draining / stale）
**选项 B**：5 状态（registered / active / draining / drained / stale）
**选项 C**：4 状态（active / draining / drained / stale）✓
**决策**：**C**
**理由**：
- "registered" 与 "active" 是同一瞬间（注册即 active），无需独立
- "drained" 是 "draining" 的终态，保留作 audit
- "stale" 是 reaper 标的，不该混进 drain 流程

### 13.2 Q209：worker_id 是 PK 还是 NATURAL KEY？

**选项 A**：PK = 自增 INTEGER
**选项 B**：PK = worker_id TEXT（hostname:port:uuid 形式）✓
**决策**：**B**
**理由**：
- 跨 server dispatch 需要 worker_id 可在网络上唯一标识（自增 INTEGER 不能跨 host）
- 选 TEXT 让 driver / reaper 自己生成（如 `worker-host01:pid:uuid`）

### 13.3 Q210：dispatch 公平性算法怎么选？

**选项 A**：round-robin（最简单）
**选项 B**：least-loaded（按 worker.current_attempt_id 是否非空）
**选项 C**：capability-match（按 workers.capabilities_json 包含 task 所需 capability）✓
**选项 D**：cost-aware（按 budget_cents）
**决策**：**C**（capability-match 优先，fallback round-robin）
**理由**：
- v0.9-B 的 task 多由 WorkflowPack 声明 required_capabilities（v0.7 Q113）
- capability-match 让 driver_kind=codex_app_server 的 task 不被派给只支持 codex_exec 的 worker
- A/B 太简单；D 需要 budget 数据（v0.9-B workers 表暂不存 cost 数据）

### 13.4 Q211：graceful drain 是否需要超时？

**选项 A**：无限等待（worker 自然完成）
**选项 B**：可配置超时（超时就 cancel active）
**决策**：**A**
**理由**：
- v0.9-B 是 MVP；超时配置是运维需求，不是 correctness 需求
- spike 不验证超时（out-of-scope）；M3 引入 K8s-style HPA 时再考虑

### 13.5 Q212：worker 心跳间隔是固定还是可配置？

**选项 A**：硬编码 5 秒
**选项 B**：worker 自声明 heartbeat_interval_seconds
**决策**：**A**（v0.9-B）；M3 可加 B
**理由**：
- v0.9-B 是 MVP；5 秒足够小，reaper 用 30 秒阈值（6× 心跳）
- 灵活性由 driver 实现层控制，不进 schema

### 13.6 Q213：跨 server 共享 DB 用什么传输？

**选项 A**：NFS 共享（最简单）✓
**选项 B**：SSHFS / rsync（自己造轮子）
**选项 C**：Litestream / rqlite（专业方案）
**决策**：**A**（v0.9-B）；M3 评估 C
**理由**：
- v0.9-B 是 MVP；NFS 共享 SQLite WAL 满足 spike 真并发验证
- 跨数据中心 / 跨 region 是 M3 范围（out-of-scope §9.3）

---

## §14 v0.9-B Stage Gate 增量

### 14.1 M0 增量门槛（v0.9-B 新增）

| # | 硬门槛 | v0.9-B 交付 |
|---:|--------|-------------|
| M0-13 | workers 表 + 4 个新不变量触发器（I15-I18）在 schema 可应用 | `spec/kernel-schema.sql` + `sqlite3 :memory:` 不报错 |
| M0-14 | WorkerPool Protocol + 第二实现 | `spec/interfaces/worker_pool.py` + `conformance-second-impl.py` TrivialWorkerPool |
| M0-15 | worker.{dispatched,heartbeat,drained} 事件 schema 合法 | `spec/events/*.json` 通过 check-jsonschema |
| M0-16 | I15-I18 不变量有反例 spike | `spikes/m0/worker-dispatch-test.py` Case 25-33 |

### 14.2 v0.9-B 提交 Codex 时需满足

1. 全部 9 个反例（§12）有 spike case 跑通
2. `spec/kernel-schema.sql` 在原 SQLite 上跑 `sqlite3 :memory: < spec/kernel-schema.sql` 不报错（11 + 4 = 15 个 trigger / 22 + N 个 index / 10 + 1 = 11 个 table）
3. `spikes/m0/worker-dispatch-test.py` Case 25-33 全部 OK
4. `spikes/m0/conformance-second-impl.py` 新增 TrivialWorkerPool second impl + runtime_checkable 通过
5. CI workflow 新增 `spike-py-worker-dispatch` job 并跑通
6. ADR 0007 Status: Accepted + Status date ≤ 2026-08-31
7. v0.9-A 之前的 8 个 spike 全绿（无回归）