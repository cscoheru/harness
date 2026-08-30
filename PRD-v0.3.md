# Fish Harness PRD v0.3

> **版本**：v0.3（v0.2 复审后修订）
> **日期**：2026-08-29
> **维护者**：cscoheru / Claude Code
> **状态**：**架构候选，待 spike 验证 + 复审通过门槛关闭**
> **位置**：`/Users/kjonekong/projects/fish-harness/`
> **前置文档**：`ARCHITECT-REVIEW-PRD-v0.1.md`、`ARCHITECT-REVIEW-PRD-v0.2.md`、`PRD-v0.2.md`

---

## 0. TL;DR（一分钟版）

**一个从手机发指令、AI 团队在远程服务器 7×24 干活的个人 AI 编排系统。**

**v0.3 关键变化（相对 v0.2）**：

| 项 | v0.2 | v0.3 |
|----|------|------|
| 架构标题 | 三层架构 | **模块化单体控制平面** |
| 网络入口 | Tailscale / WireGuard / Cloudflare 三选一 | **Tailscale 唯一**（私网 + 设备身份）|
| 状态机 | 含 checkpoint（未定义） | **MVP 不实现 checkpoint**，明确 interrupted 状态 |
| Attempt 数据 | 无 | **新增 task_attempts 表**，每次执行一条 |
| Fencing | task_id + lease_token | **task_id + attempt_id + lease_token + fence_version** |
| 备份 | "每日增量、每周全量" | **异故障域 HK03 + SQLite `.backup` + RPO 6h / RTO 4h** |
| Approval | 仅 task_id + action | **+ 参数 hash + nonce + 过期**（防重放）|
| 日志脱敏 | 顶层精确字段 | **递归结构化 + allowlist** |
| 审计"不可篡改" | 触发器声明 | **追加式 + 尽力防误改**（准确表述）|
| 部署 | docker compose + tmux fallback | **Dockerfile + Compose + systemd + migration 规则** |
| Worker | "公网 IP worker" | **newvps 本地唯一 Worker**（删除公网 worker 措辞）|
| MVP 状态通知 | "推送回手机" | **刷新/轮询可见** |
| MacBook 角色 | "离线自动转移" | **删除**，只重排 queued 任务 |

---

## 1. 愿景与设计哲学（保留）

### 1.1 核心价值

```
你（人）→ 手机发指令 → harness（AI 团队）→ 产出（代码/调研/视频）
                              ↑
                     24/7 跑在远程 VPS
                     调度/执行分层
                     优雅降级
```

**关键特性**：
- **永远在线**：核心能力跑在 VPS 上，电脑合盖不影响
- **能力匹配**：Xcode 任务只能 MacBook，puer-hub 任务优先 puerHK（代码在身边）
- **弹性扩展**：视频任务临时拉 GPU VPS，跑完释放
- **优雅降级**：MacBook 离线下，任务自动转移到 VPS worker

### 1.2 设计哲学（5 条不可妥协，v0.3 微调）

| 原则 | 含义 |
|------|------|
| **数据库是事实来源** | SQLite 任务账本是唯一事实，WebSocket/Push 只是通知 |
| **控制 ≠ 执行** | 控制平面决策但不执行，Worker 执行但不决策 |
| **位置无关** | 调度器看不见 worker 在哪台机器，只看见能力 |
| **Lease + Fencing** | 调度器只发放有期限 lease；提交结果必须带 task_id + attempt_id + lease_token + fence_version |
| **可替换执行器** | dsh 通过 adapter 接入，业务不依赖 dsh 内部数据结构 |

---

## 2. 架构假设与验证状态（保留 + 修订）

### 2.1 dsh 能力验证矩阵

下表所有"待验证"能力，必须在 **阶段 0（spike）** 中给出可复现证据，否则 fallback 到薄控制层 + cc/codex subprocess adapter。

| 能力 | 验证命令 | 置信度 | 验证通过标准 | 失败后 fallback |
|------|----------|--------|--------------|----------------|
| Web UI 启动 | `dsh web --port 3080` | 高（官方支持）| 浏览器访问 3080，模型配置生效 | 自己写 Next.js UI |
| 命令执行 + 审批 | Web UI 跑 `echo hello` | 高（官方文档）| 审批弹窗、执行成功 | 直接调用 cc subprocess |
| **远程 worker 注册** | `dsh agent start --register` | **未验证** | worker 注册成功、心跳正常 | 单进程 mock + SQLite |
| **daemon worker** | systemd 启 `dsh agent` | **未验证** | daemon 长期在线、崩溃可拉起 | systemd + 自定义 service |
| **WebSocket/JSON-RPC 跨主机协议** | netstat 看监听端口 | **未验证** | 文档明示协议格式 | 自己写 FastAPI |
| **任务持久化与恢复** | kill -9 后重启 | **未验证** | session + task 列表仍在 | 自己用 SQLite |
| **运行中任务重派** | 中途换 worker | **未验证且风险高** | 不出现重复提交、文件覆盖 | **MVP 不实现**，只支持 queued 重派 |
| **多模型路由配置** | dsh config 多 provider | **未验证** | Yaml 格式被 dsh 解析 | 自写 model router |
| `dsh orchestrator start` | CLI 命令 | **未验证存在** | dsh 有此子命令 | 改名：自己写 orchestrator |
| `dsh commander start` | CLI 命令 | **未验证存在** | dsh 有此子命令 | 改名：自己写 commander |

**结论**：**v0.3 假设 dsh 不提供上述"待验证"能力**。所有架构设计必须能在"无 dsh 远程能力"下运行，dsh 仅作为"如果验证通过则启用的加速器"。

### 2.2 dsh 兼容性风险：升级为高

dev preview 阶段，明确告知破坏性变更。adapter 隔离，业务不依赖 dsh 内部数据结构。

### 2.3 不能当事实写的能力

以下能力在 spike 通过前，**禁止**写入 PRD 实施清单：
- 远程多机调度
- daemon worker 自愈
- 运行中任务迁移
- 三层代理抽象（orch/commander/worker 全部用 dsh 实现）

---

## 3. 模块化单体控制平面

> v0.2 称"三层架构"，v0.3 改为"模块化单体控制平面"——准确反映 MVP 只在 newvps 一台机器跑一个进程的事实。

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│ newvps（模块化单体控制平面，MVP 唯一主机）               │
│ ┌─────────────────────────────────────────────────┐     │
│ │ Control API（FastAPI, systemd 管控）              │     │
│ │ ├─ HTTP routes                                    │     │
│ │ ├─ WebSocket（spike 通过后启用）                  │     │
│ │ ├─ validation                                     │     │
│ │ ├─ auth（session + CSRF）                         │     │
│ │ └─ audit log                                      │     │
│ ├─────────────────────────────────────────────────┤     │
│ │ Task Scheduler（进程内单例）                       │     │
│ │ ├─ enqueue / claim / renew                        │     │
│ │ ├─ hard constraint filter + soft score（M4+）     │     │
│ │ └─ expiry reaper                                  │     │
│ ├─────────────────────────────────────────────────┤     │
│ │ SQLite Task Ledger（P0，事实来源）                 │     │
│ │ tasks / task_attempts / approvals / audit_log     │     │
│ ├─────────────────────────────────────────────────┤     │
│ │ Worker Adapter（同进程，subprocess 派发）          │     │
│ │ ├─ dsh adapter（spike 通过后启用）                │     │
│ │ └─ cc/codex subprocess adapter（永远可用）        │     │
│ ├─────────────────────────────────────────────────┤     │
│ │ Research Workflow（唯一工作流）                    │     │
│ │ fetch → transcribe → cite → summarize → persist   │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ 隔离 workspace（每任务独立目录）                        │
│                                                         │
│ 备份进程：cron + SQLite `.backup` → HK03（异故障域）    │
└─────────────────────────────────────────────────────────┘
         ▲
         │ Tailscale 私网（仅已批准设备）
         │
┌────────┴────────┐
│ iPhone Safari   │
│ （文字入口）    │
└─────────────────┘
```

### 3.2 模块边界（v0.3 明确）

| 模块 | 进程内位置 | 状态 |
|------|------------|------|
| Control API | 进程内模块 | MVP 必做 |
| Task Scheduler | 进程内模块（单例）| MVP 必做 |
| SQLite Task Ledger | 独立文件 + WAL 模式 | MVP P0 |
| Worker Adapter | 进程内模块 + 子进程 | MVP 必做 |
| Research Workflow | 进程内模块 | MVP 必做 |
| Backup Service | **独立进程**（systemd）| MVP 必做 |
| WebSocket 推送 | 进程内模块 | 阶段 3 |
| Mobile UI | **独立服务**（Tailscale-only）| MVP 必做 |

### 3.3 网络拓扑（v0.3 收敛）

```
iPhone（Tailscale 客户端，已批准）
   │ Tailscale 私网（100.x.x.x）
   ↓ HTTPS
newvps（harness-control.service）
   ├─ Control API（127.0.0.1:8080，systemd 管控）
   ├─ Worker Adapter（同进程）
   └─ SQLite + backups
         │
         │ cron + ssh（frp 内网隧道）
         ↓
   HK03（异故障域备份目标）
```

**关键变化（v0.3）**：
- ✅ **公网不暴露任何端口**（aliyun 不再是入口）
- ✅ **HK103 → HK03**（备份目标独立，不在控制平面链路）
- ✅ **Tailscale 唯一入口**
- ✅ Control API 只绑 127.0.0.1（外部访问经 Tailscale 转发）

### 3.4 控制层（v0.3 文字优先）

| 项 | v0.2 | v0.3 |
|----|------|------|
| 客户端 | Safari 普通网页 | 同（**不强制 PWA**） |
| 输入 | 文字优先 | ✅ 同 |
| 入口 | harness.rana.asia | **harness.tail-net.ts.net**（Tailscale magic DNS） |
| 实时性 | DB 轮询 | ✅ 同 |

---

## 4. 任务状态机与持久化（P0 重写）

### 4.1 决策：MVP 不实现 checkpoint

报告 §6 给出两条路径：
- (A) 实现 checkpoint + task_checkpoints 表
- (B) **不实现 checkpoint**，running 失联 → interrupted，**只能由用户显式 retry 创建新 attempt**

**v0.3 选择 (B)**：

| 理由 | 说明 |
|------|------|
| MVP 范围最小化 | checkpoint 实现复杂（状态快照、完整性校验、恢复协议）|
| 真实痛点驱动 | MVP 不解决"运行中崩溃恢复"问题（用户重启浏览器就够了）|
| 报告允许 | 报告 §6 明确允许路径 B |
| 工程量可控 | checkpoint 推迟到 v0.4+ |

### 4.2 状态机（v0.3 重写）

```
created ──▶ validated ──▶ queued ──▶ leased ──▶ running ──▶ succeeded
    │          │          │        │         ├→ failed
    │          │          │        │         └→ interrupted
    │          │          │        └→ queued（lease 过期）
    │          │          └→ cancelled
    │          └→ rejected
    └→ rejected

无可用 Worker：queued + task_events.blocked_reason
（不新增 blocked 状态，保持状态机最小）
```

### 4.3 状态定义

| 状态 | 含义 | 可转换到 |
|------|------|----------|
| `created` | 已创建，未校验 | `validated`, `rejected` |
| `validated` | 已校验通过 | `queued` |
| `queued` | 进入队列，等待 worker claim | `leased`, `cancelled` |
| `leased` | worker 已 claim，持有 lease token | `running`, `queued`（lease 过期）, `cancelled` |
| `running` | worker 执行中 | `succeeded`, `failed`, `interrupted` |
| `interrupted` | running 期间失联（无 checkpoint）| `queued`（**仅用户显式 retry**） |
| `retry_wait` | 等待指数退避 | `queued`, `failed`（超过最大次数）|
| `succeeded` | 成功完成 | 终态 |
| `failed` | 失败 | 终态 |
| `cancelled` | 用户取消 | 终态 |
| `rejected` | 校验拒绝 | 终态 |

**关键约束**：
- `interrupted` → `queued` **必须**用户显式 retry（不允许自动重跑）
- `running` → `running`（不同 worker）**禁止**
- `succeeded` / `failed` / `cancelled` / `rejected` **不得**重新进入任何状态
- 任何副作用提交必须带 `task_id + attempt_id + lease_token + fence_version`，任一不匹配 = stale

### 4.4 恢复动作表（v0.3 完整）

| 故障 | 当前状态 | 恢复动作 |
|------|----------|----------|
| 进程重启（控制平面）| `queued` / `leased` / `running` | 扫描 lease_expires_at，**过期 leased 回到 queued**；过期 running → **interrupted** |
| Worker 崩溃 | `leased` / `running` | lease 过期后由 reaper 处理：leased → queued；running → interrupted |
| 数据库锁 | 任意 | 停止接单，进入只读模式 |
| 数据库损坏 | 任意 | 启用最近 backup（HK03），记录 corruption 事件 |
| newvps 永久丢失 | 任意 | 从 HK03 异机 backup 恢复，重新部署 |

**禁止**：
- 自动把 `interrupted` 转回 `queued`
- 自动重跑 `interrupted` 任务
- 在没有 checkpoint 时假装"续跑"

### 4.5 SQLite Schema（v0.3 完整版，含 attempt）

```sql
-- 启用外键和 WAL
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE tasks (
    task_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deadline_at INTEGER,

    raw_instruction TEXT NOT NULL,
    workflow TEXT NOT NULL CHECK(workflow IN ('research', 'video', 'code')),
    params_json TEXT NOT NULL,

    status TEXT NOT NULL CHECK(status IN (
        'created','validated','queued','leased','running',
        'interrupted','retry_wait','succeeded','failed',
        'cancelled','rejected'
    )),
    status_version INTEGER NOT NULL DEFAULT 0,
    fence_version INTEGER NOT NULL DEFAULT 0,  -- 每次 attempt 创建递增

    worker_id TEXT,
    lease_token TEXT,
    lease_expires_at INTEGER,
    current_attempt_id TEXT,                   -- 当前 attempt
    attempt_count INTEGER NOT NULL DEFAULT 0,

    last_error_code TEXT,
    last_error_message TEXT,

    artifact_path TEXT,
    artifact_summary TEXT,

    idempotency_key TEXT UNIQUE,              -- 客户端防双击

    FOREIGN KEY (current_attempt_id) REFERENCES task_attempts(attempt_id)
);

CREATE TABLE task_attempts (
    attempt_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_no INTEGER NOT NULL,
    worker_id TEXT NOT NULL,
    fence_version INTEGER NOT NULL,            -- attempt 创建时的 fence_version
    lease_token TEXT NOT NULL,
    lease_expires_at INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL CHECK(status IN (
        'active','succeeded','failed','interrupted','expired'
    )),
    error_code TEXT,
    error_message TEXT,
    artifact_path TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(task_id),
    UNIQUE(task_id, attempt_no)
);

CREATE TABLE approvals (
    approval_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_id TEXT,                           -- 关联 attempt
    requested_at INTEGER NOT NULL,
    requested_action TEXT NOT NULL,
    action_params_json TEXT NOT NULL,          -- 规范化参数
    action_params_hash TEXT NOT NULL,          -- 规范化参数哈希（防篡改/防重放）
    requested_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL,               -- 过期时间
    nonce TEXT NOT NULL UNIQUE,                -- 单次消费
    decided_at INTEGER,
    decided_by TEXT,
    decision TEXT CHECK(decision IS NULL OR decision IN ('approved','rejected')),
    execution_result TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(task_id)
);

CREATE TABLE task_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    attempt_id TEXT,
    at INTEGER NOT NULL,
    event_type TEXT NOT NULL,                  -- status_change / lease_granted / etc.
    payload_json TEXT,
    actor TEXT,                                -- user / worker_id / system
    blocked_reason TEXT,                       -- 无可用 worker 时的原因（可选）
    FOREIGN KEY (task_id) REFERENCES tasks(task_id)
);

CREATE TABLE audit_log (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    payload_json TEXT,                         -- 已脱敏
    result TEXT,
    ip TEXT,
    user_agent TEXT
);

-- 触发器：阻止 audit_log 被 UPDATE/DELETE（"尽力防误改"，不是真不可篡改）
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_lease ON tasks(lease_expires_at) WHERE status = 'leased';
CREATE INDEX idx_tasks_idemp ON tasks(idempotency_key);
CREATE INDEX idx_attempts_task ON task_attempts(task_id, attempt_no);
CREATE INDEX idx_attempts_status ON task_attempts(status) WHERE status = 'active';
CREATE INDEX idx_events_task ON task_events(task_id, at);
CREATE INDEX idx_approvals_nonce ON approvals(nonce);
```

**审计准确表述（v0.3 修订）**：

> v0.2 写"不可篡改审计"——不准确。
> v0.3 改为"**追加式 + 尽力防误改**"——SQLite 触发器阻止同库误改，但**不防数据库整体丢失/被盗**。
> 真正的不可篡改需要哈希链、签名、异机日志出口——MVP 不实现，v0.4+ 评估。

### 4.6 规范 SQL（v0.3 唯一版本，附录 B 是同源引用）

#### claim（事务 + 条件更新）

```sql
BEGIN IMMEDIATE;

-- 选择候选任务（不含 lease 过期筛选，由后续条件处理）
INSERT INTO task_attempts (
    attempt_id, task_id, attempt_no, worker_id,
    fence_version, lease_token, lease_expires_at,
    started_at, status
)
SELECT
    $attempt_id, task_id, attempt_count + 1, $worker_id,
    fence_version + 1, $lease_token, $now + 300000,
    $now, 'active'
FROM tasks
WHERE status = 'queued'
ORDER BY created_at ASC
LIMIT 1;

-- 条件更新：lease 过期也允许重试
UPDATE tasks
SET status = 'leased',
    worker_id = $worker_id,
    lease_token = $lease_token,
    lease_expires_at = $now + 300000,
    current_attempt_id = $attempt_id,
    attempt_count = attempt_count + 1,
    fence_version = fence_version + 1,
    status_version = status_version + 1,
    updated_at = $now
WHERE task_id = (SELECT task_id FROM task_attempts WHERE attempt_id = $attempt_id)
  AND status IN ('queued', 'leased')
  AND (status = 'queued' OR lease_expires_at < $now);

-- 检查 row count，零行 = stale
INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
VALUES (
    (SELECT task_id FROM task_attempts WHERE attempt_id = $attempt_id),
    $attempt_id, $now, 'lease_granted',
    json_object('lease_token', $lease_token, 'worker_id', $worker_id),
    $worker_id
);

COMMIT;
```

#### renew（lease 续租）

```sql
BEGIN IMMEDIATE;

UPDATE tasks
SET lease_expires_at = $now + 300000,
    status_version = status_version + 1,
    updated_at = $now
WHERE task_id = $task_id
  AND lease_token = $lease_token
  AND status = 'running';

-- row count = 0 时返回 stale-lease

COMMIT;
```

#### start（leased → running）

```sql
BEGIN IMMEDIATE;

UPDATE tasks
SET status = 'running',
    status_version = status_version + 1,
    updated_at = $now
WHERE task_id = $task_id
  AND lease_token = $lease_token
  AND status = 'leased';

-- row count = 0 时返回 stale-lease

INSERT INTO task_events (task_id, attempt_id, at, event_type, actor)
VALUES ($task_id, $attempt_id, $now, 'started', $worker_id);

COMMIT;
```

#### submit（running → succeeded，必须带完整 fencing）

```sql
BEGIN IMMEDIATE;

UPDATE tasks
SET status = 'succeeded',
    artifact_path = $artifact_path,
    artifact_summary = $artifact_summary,
    lease_token = NULL,
    lease_expires_at = NULL,
    status_version = status_version + 1,
    updated_at = $now
WHERE task_id = $task_id
  AND current_attempt_id = $attempt_id
  AND lease_token = $lease_token
  AND fence_version = $fence_version
  AND status = 'running';

-- row count = 0 时返回 stale（原因：lease/attempt/fence 不匹配或状态已变）

UPDATE task_attempts
SET status = 'succeeded',
    finished_at = $now,
    artifact_path = $artifact_path
WHERE attempt_id = $attempt_id
  AND fence_version = $fence_version
  AND status = 'active';

COMMIT;
```

#### fail / interrupt

```sql
-- running → failed
UPDATE tasks
SET status = 'failed',
    lease_token = NULL,
    lease_expires_at = NULL,
    last_error_code = $error_code,
    last_error_message = $error_message,
    status_version = status_version + 1,
    updated_at = $now
WHERE task_id = $task_id
  AND current_attempt_id = $attempt_id
  AND lease_token = $lease_token
  AND fence_version = $fence_version
  AND status = 'running';

UPDATE task_attempts
SET status = 'failed',
    finished_at = $now,
    error_code = $error_code,
    error_message = $error_message
WHERE attempt_id = $attempt_id
  AND fence_version = $fence_version
  AND status = 'active';

-- running → interrupted（reaper 检测到 lease 过期但有 attempt）
UPDATE tasks
SET status = 'interrupted',
    lease_token = NULL,
    lease_expires_at = NULL,
    status_version = status_version + 1,
    updated_at = $now
WHERE task_id IN (
    SELECT task_id FROM tasks
    WHERE status = 'running' AND lease_expires_at < $now
);

UPDATE task_attempts
SET status = 'interrupted',
    finished_at = $now
WHERE attempt_id IN (
    SELECT current_attempt_id FROM tasks WHERE status = 'interrupted'
) AND status = 'active';
```

#### 用户显式 retry（interrupted → queued，**新 attempt**）

```sql
BEGIN IMMEDIATE;

UPDATE tasks
SET status = 'queued',
    worker_id = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    current_attempt_id = NULL,
    status_version = status_version + 1,
    updated_at = $now,
    last_error_code = NULL,
    last_error_message = NULL
WHERE task_id = $task_id
  AND status = 'interrupted'
  AND $user_initiated = 1;  -- 仅 API 显式 retry 调用可设置

-- row count = 0 时返回 invalid_state

INSERT INTO task_events (task_id, at, event_type, actor, payload_json)
VALUES ($task_id, $now, 'user_retry', $user_id,
        json_object('previous_attempt', $prev_attempt_id));

COMMIT;
```

**关键**：
- 不使用 `UPDATE ... ORDER BY ... LIMIT`（依赖非默认 SQLite 编译选项）
- 所有条件更新在事务内执行
- 每次转换递增 status_version
- 用括号明确 AND/OR 优先级
- 每个操作检查 row count，零行 = 明确 stale 错误
- 每次状态变化产生 task_event

---

## 5. 调度策略（保留 + 简化）

### 5.1 v0.3 简化

MVP 阶段 1 个 worker，调度策略就是：
1. 优先 claim `queued` 状态任务
2. 如果 lease 过期且 attempt.status = 'active'，reaper 标记 `interrupted`
3. 用户显式 retry 后重新入队

### 5.2 多 worker 时的硬约束过滤 + 软评分

阶段 4 加第二 worker 时启用（代码框架预留）：

```
任务规范化 → 硬约束过滤（在线/能力/架构/工作目录/凭证/内存/网络）
   │ 无候选
   ├────────▶ queued + task_events.blocked_reason + 通知用户
   ▼
软评分（locality、成本、负载、时延、可靠性、工作时段）
   │
   ▼
原子 lease ──▶ 执行 ──▶ submit / fail / interrupt
```

**硬约束**：

| 约束 | 例子 |
|------|------|
| 在线 | worker 心跳 ≤ 60 秒 |
| 能力 | 需要 Xcode 的任务只能派给有 Xcode 的 worker |
| 架构 | arm64 任务不能派给 x86 worker |
| 工作目录存在 | 路径可访问、权限足够 |
| 凭证 | API key 可用、未过期 |
| 内存 | 任务预估内存 ≤ worker 可用 |
| 网络策略 | 内部任务不能走公网 worker |

**软评分**：

| 维度 | 权重 |
|------|------|
| 本地优先（工作时段 MacBook） | +100 |
| Locality（代码在身边） | +50 |
| 24/7 在线（后台任务） | +30 |
| 资源匹配（GPU/Xcode） | +80~100 |
| 公网 IP 需求 | +40 |
| 负载（空闲 worker 优先） | +20 |

---

## 6. 模型路由（能力等级，保留）

```yaml
model_tiers:
  high_quality:
    primary: anthropic/claude-fable-5
    fallback: zhipu/glm-5.3
  cost_optimized:
    primary: minimax/MiniMax-M3
    fallback: zhipu/glm-5.3
  realtime:
    primary: zhipu/glm-5.3-flash
    fallback: minimax/MiniMax-M3
```

9 个路由维度（风险/上下文/工具调用/JSON/延迟/预算/provider/地区/eval）保留。每次 fallback 重新校验工具权限和输出格式。

---

## 7. 安全边界（P0 重写：MVP 基线收敛）

### 7.1 网络入口：**Tailscale 唯一**

**v0.3 决策**：MVP 只用 Tailscale，不再保留 WireGuard / Cloudflare Access 候选。

| 项 | 决策 |
|----|------|
| **网络** | Tailscale 私网（100.x.x.x）|
| **公网暴露** | **零**（aliun 不再是入口）|
| **Control API 绑定** | 127.0.0.1:8080（仅 Tailscale 接口可达）|
| **设备身份** | Tailscale 节点身份（每设备独立 key）|
| **设备撤销** | Tailscale Admin 控制台移除节点 |
| **设备批准** | 预批准列表（首次添加需要 Admin 操作）|

### 7.2 Session + CSRF

| 项 | 决策 |
|----|------|
| **签发** | 登录后服务端签发 session |
| **存储** | HttpOnly + Secure + SameSite=Strict Cookie |
| **有效期** | 12 小时滑动过期；30 天硬过期 |
| **撤销** | 服务端 session 表 + Tailscale 设备撤销 |
| **CSRF** | Double Submit Cookie + SameSite=Strict |
| **Origin 校验** | 仅允许 tail-net.ts.net 和 localhost |

### 7.3 Approval 加固（v0.3 重写）

approval 必须绑定以下字段，**任一不匹配即拒绝**：

| 字段 | 作用 |
|------|------|
| `task_id` | 关联任务 |
| `attempt_id` | 关联当前 attempt（**v0.3 新增**）|
| `requested_action` | 规范化动作（publish / delete / db_migrate / etc.）|
| `action_params_json` | 规范化参数（用于哈希）|
| `action_params_hash` | SHA-256 哈希（**v0.3 新增**，参数变化 → 旧 approval 失效）|
| `requested_by` | 请求人 |
| `expires_at` | 有效期（默认 1 小时）|
| `nonce` | 单次消费 UUID |
| `decided_by` | 审批人 |
| `decision` | approved / rejected |
| `execution_result` | 执行结果（成功/失败/原因）|

**防重放规则**：
- approval 一次性消费（执行后 `nonce` 标记 consumed）
- 参数变化后 `action_params_hash` 不匹配 → 拒绝执行
- `expires_at` 过期 → 拒绝执行
- 不同 `attempt_id` → 拒绝执行（attempt 重试需要新 approval）

### 7.4 日志脱敏（v0.3 重写：递归 + 结构化 + allowlist）

```python
import re

# 顶层 + 嵌套 key 列表（小写匹配）
SENSITIVE_KEYS = {
    "api_key", "apikey", "api-key",
    "password", "passwd", "pwd",
    "token", "access_token", "refresh_token", "bearer",
    "secret", "client_secret",
    "authorization", "cookie", "set-cookie",
    "private_key", "ssh_key",
}

# 字符串值内嵌的凭证正则（Authorization header / URL query）
PATTERNS = [
    re.compile(r'(?i)(authorization\s*:\s*bearer\s+)([A-Za-z0-9\-_.]+)'),
    re.compile(r'(?i)(api[_-]?key\s*=\s*)([A-Za-z0-9\-_.]+)'),
    re.compile(r'(?i)(password\s*=\s*)([^\s,;&]+)'),
    re.compile(r'(?i)(token\s*=\s*)([A-Za-z0-9\-_.]+)'),
]

MAX_DEPTH = 10

def sanitize(obj, depth=0, _seen=None):
    """递归脱敏：处理 dict / list / str / 基础类型"""
    if _seen is None:
        _seen = set()
    if depth > MAX_DEPTH:
        return "[MAX_DEPTH]"
    obj_id = id(obj)
    if obj_id in _seen:
        return "[CIRCULAR]"
    _seen.add(obj_id)
    try:
        if isinstance(obj, dict):
            return {
                k: ("[REDACTED]" if k.lower() in SENSITIVE_KEYS
                    else sanitize(v, depth + 1, _seen))
                for k, v in obj.items()
            }
        if isinstance(obj, list):
            return [sanitize(x, depth + 1, _seen) for x in obj]
        if isinstance(obj, str):
            result = obj
            for p in PATTERNS:
                result = p.sub(r'\1[REDACTED]', result)
            return result
        return obj
    finally:
        _seen.discard(obj_id)


def sanitize_headers(headers: dict) -> dict:
    """专门处理 HTTP Header"""
    out = {}
    for k, v in headers.items():
        if k.lower() in SENSITIVE_KEYS:
            out[k] = "[REDACTED]"
        else:
            out[k] = sanitize(v)
    return out


def sanitize_url(url: str) -> str:
    """处理 URL query string 中的凭证"""
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
    parsed = urlparse(url)
    if not parsed.query:
        return url
    qs = parse_qs(parsed.query)
    safe_qs = {k: ("[REDACTED]" if k.lower() in SENSITIVE_KEYS else v)
               for k, v in qs.items()}
    return urlunparse(parsed._replace(query=urlencode(safe_qs)))
```

**覆盖**：
- ✅ 嵌套 dict / list（递归）
- ✅ HTTP Header（含 `Authorization: Bearer`）
- ✅ URL query string（`?api_key=xxx`）
- ✅ 字符串值内嵌（key=value 形式）
- ✅ 循环引用防护（`id` + set）
- ✅ 深度限制（防止栈溢出）

### 7.5 Prompt Injection 防护（v0.3 明确信任边界）

| 输入源 | 信任等级 | 工具调用权限 |
|--------|----------|--------------|
| 用户原始指令 | **可信** | 完整权限 |
| 网页正文、RSS、字幕 | **不可信** | **禁止工具调用** |
| 模型自己之前的输出 | **可信但需审计** | 受限权限 |
| 其他模型输出 | **不可信** | **禁止工具调用** |

**实现机制**：
- 工具调用层检查 prompt 来源
- 不可信内容被标记后只能进入"信息提取"工作流（如引用、摘要），不能触发 file_write / shell / db_write
- approval 强制用于任何不可信内容触发的副作用

### 7.6 审计日志（v0.3 准确表述）

| v0.2 表述 | v0.3 准确表述 |
|----------|--------------|
| "不可篡改审计" | **"追加式 + 尽力防误改"** |
| 同库 SQLite 触发器 | ✅ 阻止误 UPDATE/DELETE |
| **不防**数据库整体丢失/被盗 | ✅ 准确 |
| **不防**root 入侵 | ✅ 准确 |
| 真不可篡改需哈希链/签名/异机日志 | v0.4+ 评估 |

### 7.7 威胁模型（v0.3 收紧）

| 威胁 | 可能性 | 影响 | 必须措施 |
|------|--------|------|----------|
| 控制入口凭证泄露 | **低**（Tailscale 私网）| 极高 | 设备身份、短期 session、撤销、限流 |
| Prompt injection | 高 | 极高 | 信任边界（§7.5）、工具 allowlist、审批 |
| 路径穿越读取其他项目 | 中 | 高 | 工作区 allowlist、真实路径校验、symlink 拒绝 |
| Worker 被攻陷后横向移动 | **低**（单机 + 隔离 workspace）| 极高 | workspace 隔离、网络分段 |
| WebSocket 劫持或重放 | **低**（MVP 不启用 WebSocket）| 高 | spike 通过后再评估 |
| 重试造成重复发布/付费 | 中 | 高 | 幂等键（idempotency_key UNIQUE）、外部副作用审批 |
| 日志泄露 API Key 或代码 | 中 | 高 | 递归脱敏（§7.4）、保留期 90 天、访问控制 |
| 供应链依赖被污染 | 中 | 高 | lockfile 锁定、镜像扫描、SBOM |

---

## 8. 资源预算（spike 待实测）

### 8.1 v0.2 问题

`Worker Adapter = 1G` 未覆盖 cc/codex、ASR、下载、临时文件的峰值。

### 8.2 v0.3 spike 必测项（阶段 0/1）

```
□ 空闲 RSS（Control API + Scheduler + SQLite）
□ 单次抓取峰值（yt-dlp / requests）
□ ASR 峰值（faster-whisper 不同模型）
□ cc/codex 子进程峰值（不同任务类型）
□ 磁盘临时文件峰值（视频/音频缓存）
□ 僵尸进程与 FD 泄漏（长跑 7 天）
□ OOM 后任务账本是否一致（模拟 OOM）
```

### 8.3 v0.3 资源预算（暂定，待 spike 修订）

| 服务 | RSS（暂定）| CPU | 磁盘 | FD | 并发 |
|------|------------|-----|------|-----|------|
| Control API | 0.3G | 0.5 | 1G | 100 | 10 req/s |
| Scheduler | 0.2G | 0.3 | 0.1G | 30 | - |
| SQLite | 0.1G | 0.1 | 10G（含备份）| 50 | - |
| Worker Adapter | **2G（暂定）**| 2.0 | 10G（workspace + 临时）| 500 | 1 重型任务 |
| Research Workflow | 1G | 1.5 | 5G | 200 | - |
| Backup Service | 0.1G | 0.1 | 5G | 20 | - |
| **总计（常驻）** | **3.7G** | **4.5** | **31G** | **900** | - |
| **newvps 物理** | **7.8G** | **4** | **重新验证** | - | - |
| **富余** | **4.1G** | **负** | **?** | - | - |

**待 spike 修订**：
- Worker Adapter 真实峰值
- newvps 实际可用磁盘（不再借用其他主机数据）
- CPU 争抢实测（4 核同时跑 AI 子进程）

### 8.4 newvps 磁盘重新验证（v0.3 待办）

```bash
ssh newvps "df -h / && du -sh /opt/* /var/* 2>/dev/null | sort -h | tail -20"
```

**禁止**复用 HK103 / aliyun / MacBook 的磁盘数据估算。

### 8.5 故障域（v0.3 区分）

| 故障 | 系统动作 | RPO 影响 |
|------|----------|----------|
| 进程重启 | 启动时扫描 lease 过期，回收任务 | 0 |
| Worker 崩溃 | lease 过期重排；当前 running → interrupted | 0 |
| 数据库锁 | 停止接单，进入只读 | 0 |
| 数据库损坏 | 启用最近 backup（HK03），记录 corruption 事件 | < 6h |
| newvps 永久丢失 | 从 HK03 异机 backup 恢复；重新部署 | < 6h |

---

## 9. MVP（v0.3 范围清理）

### 9.1 MVP 定义（v0.3 不变）

**最小可用产品**：从手机派 1 个研究简报任务，1 小时内自动跑完，结果通过轮询/刷新在结果页可见。

### 9.2 MVP 范围（v0.3 清理矛盾）

| 项 | 状态 |
|----|------|
| Control API（FastAPI） | ✅ MVP 必做 |
| SQLite 任务账本 + attempt 表 | ✅ MVP P0 |
| 1 个 worker（newvps 本地唯一）| ✅ MVP 必做 |
| Worker Adapter（cc subprocess 优先） | ✅ MVP 必做 |
| Research Workflow | ✅ MVP 必做 |
| Tailscale 私网入口 | ✅ MVP 必做 |
| 文字输入网页 | ✅ MVP 必做 |
| 任务列表页 | ✅ MVP 必做 |
| 任务结果页（轮询/刷新）| ✅ MVP 必做 |
| 站内通知（DB 标记已读）| ✅ MVP 必做 |
| Approval 系统（基本动作）| ✅ MVP 必做 |
| Backup Service（HK03 异机）| ✅ MVP 必做 |
| 语音输入 | ⛔ 不进 MVP |
| Web Push | ⛔ 不进 MVP |
| PWA 安装 | ⛔ 不进 MVP |
| WebSocket 流式 | ⛔ 不进 MVP |
| 第二 worker | ⛔ 不进 MVP |
| 多机调度 | ⛔ 不进 MVP |
| 视频/GPU 工作流 | ⛔ 不进 MVP |
| MacBook worker | ⛔ 不进 MVP |
| "公网 IP worker" | ⛔ **删除该措辞**（v0.2 残留）|

### 9.3 MVP 关键约束（v0.3 明确）

- **结果通知**：用户通过刷新/轮询在结果页可见，**不是"推送回手机"**
- **离线转移**：MacBook 离线**不影响 MVP**（MVP 唯一 worker 在 newvps）；只重排 queued 任务，**不重排 running**
- **Worker 数量**：MVP 永远只有 1 个 worker（newvps 本地）
- **取消支持**：运行中可取消（cancel API + attempt 标记 interrupted）；不在 MVP 排除范围

### 9.4 MVP 验收（20 任务样本）

| 指标 | 目标 |
|------|------|
| 任务状态丢失 | **0 次** |
| 无人工介入完成率 | **≥ 80%** |
| 失败原因可解释率 | **100%** |
| 可恢复失败比例 | **≥ 95%** |
| 危险操作审批覆盖率 | **100%** |
| 结果包含可核验来源 | **100%** |
| 用户每周真实使用 | **≥ 3 次，连续 4 周** |
| 节省时间 | 相对人工流程中位数 **≥ 50%** |

---

## 10. 测试与验收（v0.3 扩充）

### 10.1 状态与一致性（v0.3 新增）

- [ ] `leased` 阶段崩溃后可安全回收
- [ ] `running` 无 checkpoint 时不会自动重复执行
- [ ] 有 checkpoint 时只能从已确认 checkpoint 创建新 attempt（MVP 不实现此路径）
- [ ] stale lease / stale attempt / stale fence 提交失败
- [ ] 条件更新零行时返回明确错误
- [ ] 控制面崩溃发生在"产物写入后、DB 更新前"时可恢复
- [ ] 客户端重复提交使用 idempotency_key，不生成两个任务
- [ ] interrupted 任务只能由用户显式 retry 创建新 attempt（不复用旧 attempt）

### 10.2 安全（v0.3 新增）

- [ ] approval 参数被修改、过期或重放时执行失败
- [ ] 嵌套 JSON、Authorization Header、URL 查询参数中的密钥被脱敏
- [ ] artifact path 和 workspace path 的符号链接及路径穿越被拒绝
- [ ] 外部网页、字幕、模型输出不能扩大工具权限
- [ ] Worker 凭证只能访问被授权项目
- [ ] Tailscale 私网外无法访问 Control API
- [ ] session 过期/撤销后旧 cookie 被拒
- [ ] audit_log 的 UPDATE/DELETE 被触发器拒绝

### 10.3 数据恢复（v0.3 新增）

- [ ] 在线 backup 可以恢复
- [ ] 损坏的主数据库可以从异机 backup 恢复
- [ ] 恢复后 task / attempt / approval / audit / artifact 索引保持一致
- [ ] 实际 RPO ≤ 6h，RTO ≤ 4h 验证
- [ ] HK03 备份文件加密，密钥不在 newvps 本机

### 10.4 研究质量 eval（v0.3 新增）

- [ ] 引用链接真实存在且与结论相关
- [ ] 摘要中的关键事实可以定位到来源
- [ ] 缺失、删除或抓取失败的来源被明确标注
- [ ] 模型 fallback 后仍满足相同结构和引用质量门槛
- [ ] 防止模型生成不存在的来源（幻觉检测）

### 10.5 dsh spike（阶段 0）

- [ ] 从干净环境启动官方 Web UI
- [ ] 验证模型配置、工作区选择、命令执行和审批
- [ ] 验证官方是否存在远程 worker/daemon API；保存版本、命令和原始输出
- [ ] 验证进程重启后 session、任务和结果是否恢复
- [ ] 验证 API/SDK 能否被薄 adapter 稳定调用
- [ ] 证明升级或失败时可以切换为 cc/codex subprocess adapter

### 10.6 单元测试

- [ ] 任务输入校验：nil、空、超长、Unicode、错误工作流类型
- [ ] 状态机所有合法和非法转换
- [ ] 硬约束过滤与无候选 worker
- [ ] lease 获取、续租、到期和 fencing token
- [ ] 重试分类、指数退避、最大预算
- [ ] 凭证和日志脱敏（含嵌套、Header、URL query）
- [ ] idempotency_key 唯一性约束

### 10.7 集成测试

- [ ] API → task ledger → worker claim → result 完整链路
- [ ] 控制平面重启后任务不丢失（queued / leased 状态正确恢复）
- [ ] worker 执行中退出，running → interrupted（不自动 retry）
- [ ] 两个 worker 同时 claim 时只允许一个成功（M4+）
- [ ] 旧 worker 不能覆盖新 attempt 的结果（fence_version 校验）
- [ ] 重复提交相同 idempotency_key 返回相同 task_id

### 10.8 E2E 与混沌测试

- [ ] iPhone 创建研究任务并最终看到带来源结果
- [ ] 双击派工不会生成两个任务（idempotency）
- [ ] 页面关闭、网络切换、session 过期后可恢复查看
- [ ] 模型 429、抓取 403、进程 OOM、磁盘接近满时行为符合错误表
- [ ] 未授权设备、路径穿越和 prompt injection 攻击被拒绝并产生审计记录

### 10.9 部署与升级（v0.3 新增）

- [ ] Dockerfile 可在干净环境构建
- [ ] docker-compose.yml 启动后所有服务健康
- [ ] SQLite migration 可前滚和回滚
- [ ] 健康检查端点 /health 返回 200
- [ ] 部署前自动备份当前 DB
- [ ] 升级失败可一键回滚到上一个镜像版本

---

## 11. 实施顺序（保留 + 微调）

| 阶段 | 目标 | 退出条件 |
|------|------|----------|
| **0** | **dsh spike + 资源 spike + 备份 spike** | 能力矩阵有证据；资源数据有数据；备份方案演练通过 |
| **1** | **持久化单机任务闭环** | 重启不丢任务，状态机 + attempt + recovery 测试通过 |
| **2** | **单一研究工作流** | 20 个真实任务达到产品验收线 |
| **3** | **Tailscale 入口 + 移动端体验** | 文字入口稳定，再评估语音与 Push |
| **4** | **第二 worker + lease 并发** | 并发 claim、离线、stale 提交测试通过 |
| **5** | **多机调度 + 硬约束过滤** | 资源预算、审计、跨域备份完整 |
| **6** | **视频/GPU 工作流** | 成本、审批、素材与发布幂等策略通过 |

**并行策略**（阶段 1 后）：

- Lane A：Control API → 任务账本 → attempt → lease
- Lane B：Research Workflow adapter → 产物格式 → 来源校验
- Lane C：Tailscale + 文字 UI → 状态页 → 审批页

三条 lane 依赖统一任务协议和错误码。

---

## 12. 不进入首版的范围（v0.3 扩充）

| 项 | 状态 |
|----|------|
| WebSocket 流式回传 | ⛔ MVP 排除（DB 轮询足够）|
| PWA 安装到主屏幕 | ⛔ MVP 排除（先网页能用）|
| Web Push 通知 | ⛔ MVP 排除（站内通知足够）|
| 第二 worker | ⛔ MVP 排除 |
| 多机调度 | ⛔ MVP 排除 |
| GPU 自动创建/销毁 | ⛔ 永不进 MVP（付费 + 凭证 + API）|
| 自动发布视频/代码 | ⛔ 永不进 MVP（高副作用，需审批成熟后）|
| 语音优先 | ⛔ MVP 排除 |
| 跨项目 commander | ⛔ 永不进 MVP |
| **MacBook 作为 Worker** | ⛔ MVP 排除（v0.3 明确：MVP 唯一 worker 在 newvps）|
| **"公网 IP worker"** | ⛔ **删除该措辞** |
| **Checkpoint 机制** | ⛔ MVP 排除（v0.3 决策）|

---

## 13. 工程量估算（v0.3 修订 M0-M11）

| 里程碑 | 接口 | 乐观 | 基准 | 悲观 | 验收 |
|--------|------|------|------|------|------|
| **M0** | dsh spike + 资源 spike + 备份 spike | 1 周 | 2 周 | 3 周 | §10.5 + §8.2 + §15.4 |
| **M1** | 持久化 + 任务账本 + attempt + lease + recovery | 1 周 | 2 周 | 3 周 | §10.1 + §10.7 |
| **M2** | Thin Control API（Tailscale 私网） | 1 周 | 1.5 周 | 2 周 | §10.2（认证部分）|
| **M3** | Worker Adapter（cc subprocess 优先）| 3 天 | 5 天 | 1 周 | §10.7 claim/submit 链路 |
| **M4** | Research Workflow | 1 周 | 1.5 周 | 2 周 | §10.4 研究质量 |
| **M5** | 文字 UI（列表 + 详情 + 审批） | 1 周 | 1.5 周 | 2 周 | §10.8 E2E |
| **M6** | Approval 系统 + 递归脱敏 | 3 天 | 5 天 | 1 周 | §10.2 完整 |
| **M7** | Backup Service + 异故障域 | 3 天 | 5 天 | 1 周 | §10.3 完整 |
| **M8** | 部署架构（Dockerfile + Compose + systemd） | 2 天 | 3 天 | 5 天 | §10.9 完整 |
| **M9** | 20 任务产品验收 | 持续 | 持续 | 持续 | §9.4 |
| **M10** | 阶段 3：移动端体验 + WebSocket | 1 周 | 2 周 | 1 月 | - |
| **M11** | 阶段 4：第二 worker + 并发 | 1 周 | 2 周 | 1 月 | - |

**MVP 总投入（基准）**：M0-M9 完成 MVP，**约 8-10 周**（乐观 6 周，悲观 4 月）。

---

## 14. 部署与运维（v0.3 新增）

### 14.1 进程管理

| 进程 | 管控方式 |
|------|----------|
| harness-control.service | **systemd** unit（Restart=always）|
| harness-worker.service | **systemd** unit（依赖 control）|
| harness-backup.service | **systemd** timer（每 6h）+ service |
| harness-backup.target | HK03 异机拉取（独立 systemd）|

**禁止**用 tmux / nohup / 自定义 daemon 脚本作为生产 fallback。

### 14.2 Dockerfile（v0.3 草案）

```dockerfile
# Multi-stage build
FROM python:3.11-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.11-slim AS runtime
WORKDIR /app
RUN useradd -m -u 1000 harness && mkdir -p /app/data /app/workspace && chown -R harness:harness /app
COPY --from=builder /root/.local /home/harness/.local
COPY --chown=harness:harness . /app
USER harness
ENV PATH=/home/harness/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1
CMD ["uvicorn", "harness.control_api:app", "--host", "127.0.0.1", "--port", "8080"]
```

### 14.3 docker-compose.yml（v0.3 草案）

```yaml
version: '3.8'
services:
  control:
    build: .
    container_name: harness-control
    restart: always
    network_mode: host  # 监听 127.0.0.1:8080
    volumes:
      - harness-data:/app/data
      - harness-workspace:/app/workspace
      - /etc/harness/secrets:/etc/harness/secrets:ro
    environment:
      - HARNESS_DB_PATH=/app/data/harness.db
      - HARNESS_CONFIG=/etc/harness/config.yaml
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    depends_on: []

  backup:
    image: alpine:3.19
    container_name: harness-backup
    restart: always
    volumes:
      - harness-data:/app/data:ro
      - ./scripts/backup.sh:/backup.sh:ro
    entrypoint: ["sh", "-c", "while true; do /backup.sh; sleep 21600; done"]
    # 6h 一次 SQLite .backup 到 HK03

volumes:
  harness-data:
  harness-workspace:
```

### 14.4 镜像版本与依赖锁定

| 项 | 策略 |
|----|------|
| 基础镜像 | `python:3.11-slim` 锁定 minor 版本 |
| Python 依赖 | `requirements.txt` + `pip install --require-hashes` |
| System deps | `apt` 锁定在 Dockerfile 中 |
| SQLite | Debian 包版本，**不重新编译**（不依赖 `UPDATE...ORDER BY`）|
| dsh | **MVP 不使用**（adapter 隔离） |

### 14.5 配置与 Secret 注入

| 类型 | 方式 |
|------|------|
| Config（YAML） | `/etc/harness/config.yaml`（read-only mount）|
| API keys | `/etc/harness/secrets/*.env`（单独目录，700 权限）|
| DB path | 环境变量 `HARNESS_DB_PATH` |
| 备份目标 | `/etc/harness/secrets/backup.env`（含 SSH key + HK03 地址）|

### 14.6 SQLite Migration

```sql
-- migrations/001_init.sql
-- ...

-- migrations/MIGRATION_LOG 表
CREATE TABLE migration_log (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL,
    description TEXT,
    forward_sql TEXT,
    rollback_sql TEXT
);
```

**migration 工具**（自研，~100 行）：
- `harness-migrate forward [N]`：前滚 N 个 migration
- `harness-migrate rollback`：回滚最近一个
- `harness-migrate status`：查看已应用版本

### 14.7 健康检查

```
GET /health → 200 {status: "ok", db: "ok", workers: 1}
GET /ready → 200 / 503
```

### 14.8 部署命令级步骤

```bash
# 1. 部署前备份
ssh newvps "/opt/harness/bin/backup-pre-deploy.sh"

# 2. 拉取新镜像
ssh newvps "cd /opt/harness && docker compose pull"

# 3. 滚动重启（先 worker 后 control）
ssh newvps "systemctl restart harness-worker.service"
ssh newvps "cd /opt/harness && docker compose up -d control"

# 4. 等待健康
ssh newvps "until curl -fsS http://127.0.0.1:8080/health; do sleep 1; done"

# 5. 回滚（如失败）
ssh newvps "cd /opt/harness && docker compose down"
ssh newvps "cd /opt/harness && git checkout v0.2.1 && docker compose up -d"
```

### 14.9 CI 最低门槛

```yaml
# .github/workflows/ci.yml（Stage 1 启用）
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - run: ruff check src/
      - run: mypy src/
      - run: pytest tests/ -v --cov=src --cov-fail-under=70
```

**MVP 最低门槛**：
- ✅ ruff（lint）
- ✅ mypy（type check）
- ✅ pytest ≥ 70% 覆盖

---

## 15. 灾难恢复与备份（v0.3 新增）

### 15.1 RPO / RTO

| 指标 | 值 | 备注 |
|------|-----|------|
| **RPO** | **6 小时** | 备份频率（cron 6h + 关键操作前）|
| **RTO** | **4 小时** | 人工恢复时间（异机部署 + 备份恢复 + 验证）|

### 15.2 备份目标

**HK03**（103.59.103.85，独立于控制平面链路）：
- 已有 frp 隧道可达
- 独立电源 / 网络
- 磁盘充足

### 15.3 备份方式

**SQLite Online Backup API**（不用文件系统复制）：

```bash
# /opt/harness/bin/backup.sh（在 backup 容器中运行）
sqlite3 /app/data/harness.db ".backup '/tmp/backup.db'"

# 加密（age / gpg）
age -r age1hk03backup... < /tmp/backup.db > /tmp/backup.db.age

# 上传到 HK03（scp over frp 内网）
scp -P 2200 /tmp/backup.db.age harness@hk03:/backups/newvps/$(date +%Y%m%d-%H%M).db.age

# 清理 7 天前本地临时
rm /tmp/backup.db /tmp/backup.db.age
```

**关键约束**：
- ✅ 使用 `.backup` API（一致快照）
- ❌ 禁止 `cp harness.db harness.db.bak`（可能复制到写入一半的 DB）

### 15.4 备份验证（v0.3 spike 必做）

- [ ] 在 HK03 拉取最新 backup
- [ ] 解密 + 校验完整性
- [ ] 在隔离环境启动 Control API，连接恢复的 DB
- [ ] 验证 task / attempt / approval / audit / artifact 索引一致
- [ ] 提交一个测试任务，确认能正常 claim / submit
- [ ] **每月一次完整演练**（不依赖 dev 环境）

### 15.5 加密与密钥

| 项 | 位置 |
|-----|------|
| 加密算法 | age（chacha20-poly1305）|
| 加密密钥 | `/etc/harness/secrets/backup-pubkey.age`（pub）+ HK03 持有 priv |
| **私钥不在 newvps** | ✅ 关键约束 |
| 备份保留期 | 30 天滚动 |
| 备份访问审计 | 独立 audit_log（HK03 本地）|

### 15.6 故障矩阵（v0.3 完整）

| 故障 | 持续时间 | RPO 损失 | RTO 目标 |
|------|----------|----------|----------|
| 进程重启 | < 1 分钟 | 0 | < 5 分钟（自动拉起）|
| Worker 崩溃 | < 5 分钟 | 0 | < 5 分钟（reaper 回收）|
| 数据库锁 | < 30 分钟 | 0 | < 30 分钟（重启或排查）|
| 数据库损坏 | 数小时 | < 6 小时（最近 backup）| < 4 小时 |
| newvps 主机丢失 | 数小时-数天 | < 6 小时 | < 4 小时（HK03 backup + 新主机部署）|

---

## 16. 风险与回滚（v0.3 收紧）

### 16.1 风险清单

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| **dsh 能力不满足** | 高 | 高 | adapter 隔离，业务不依赖 dsh |
| **newvps OOM（AI 子进程）** | 高 | 高 | spike 实测，单 worker 串行，资源监控告警 |
| **任务迁移失败** | 高 | 高 | **MVP 不迁移**，interrupted 由用户显式 retry |
| **公网入口泄露** | 低 | 极高 | Tailscale 私网（不再依赖 Basic Auth）|
| **Prompt injection** | 高 | 极高 | 信任边界（§7.5）、工具 allowlist、审批 |
| **重复发布/付费** | 中 | 高 | idempotency_key UNIQUE、外部副作用审批 |
| **日志泄露** | 中 | 高 | 递归脱敏（§7.4）、保留期 90 天、访问控制 |
| **数据库损坏** | 低 | 高 | 异故障域 backup + 演练 |
| **newvps 主机丢失** | 低 | 极高 | HK03 异机 backup + 部署文档 |
| **dsh API 变更** | 高 | 中 | adapter 隔离 |
| **CC API 限流** | 中 | 中 | 多模型 fallback |
| **视频 GPU 成本失控** | 中 | 中 | 月度预算上限 + 审批 |

### 16.2 回滚方案（按阶段）

```
阶段 0（spike 没通过）：
  · 不进入实施
  · dsh 仅作为可选执行器，业务用 cc subprocess
  · 零成本回滚

阶段 1（持久化没跑通）：
  · docker compose down
  · 恢复 newvps 原状
  · 零代码损失（schema 通过 migration 管理）

阶段 2（MVP 跑通但 v0.3 失败）：
  · 保留持久化层
  · 关闭研究工作流
  · 降级为"通用任务派工 + 手动接管"
  · 半天回滚

完全回滚：
  · systemctl stop harness-*
  · docker compose down
  · 移除 harness stack
  · 恢复 VPS 原始用途
```

---

## 17. 决策日志（v0.1 → v0.2 → v0.3）

### 17.1 v0.3 新增决策

| Q | 决策 | 依据 |
|---|------|------|
| **Q23** | MVP 不实现 checkpoint | 报告 §6 允许路径 B；MVP 范围最小化 |
| **Q24** | 引入 task_attempts 表 | 每次执行一条 attempt，保留完整历史 |
| **Q25** | Fencing 升级为 task_id + attempt_id + lease_token + fence_version | 报告 P0-1 防 stale 提交 |
| **Q26** | interrupted 状态仅用户显式 retry 创建新 attempt | 报告 P0-1 不允许自动续跑 |
| **Q27** | 网络入口收敛到 Tailscale 唯一 | 报告 P0-3 删除多候选 |
| **Q28** | Approval 绑定参数 hash + nonce + 过期 | 报告 P0-3 防重放 + 防参数变化 |
| **Q29** | 日志脱敏改为递归结构化 | 报告 P0-3 覆盖嵌套 + Header + URL query |
| **Q30** | 审计"不可篡改"改为"追加式 + 尽力防误改" | 报告 P0-3 准确表述 |
| **Q31** | 备份异故障域 → HK03 + RPO 6h / RTO 4h | 报告 P0-2 |
| **Q32** | "MacBook 离线转移"措辞删除 | 报告 P1-4 MVP 唯一 worker 在 newvps |
| **Q33** | "结果推送回手机"改为"轮询/刷新可见" | 报告 P1-4 |
| **Q34** | 标题"三层架构"改为"模块化单体控制平面" | 报告 P1-4 准确反映单进程 |
| **Q35** | 部署用 systemd + Docker restart policy，不用 tmux | 报告 P1-5 |
| **Q36** | 资源预算待 spike 实测修订 | 报告 P1-3 |
| **Q37** | blocked 状态不新增，用 task_events.blocked_reason | 报告 P1-1 状态机最小化 |

### 17.2 v0.2 决策（保留）

| Q | 决策 |
|---|------|
| Q16 | dsh 是可替换执行器，不是完整控制平面 |
| Q17 | MVP 只做研究简报工作流 |
| Q18 | 持久化是 MVP P0 |
| Q19 | 运行中任务不可自动迁移 |
| Q20 | 设备身份 > Basic Auth |
| Q21 | 文字优先 > 语音优先 |
| Q22 | 1 worker 起步 |

### 17.3 v0.1 决策（保留）

| Q | 决策 | 状态 |
|---|------|------|
| Q1 | C（服务器跑 orchestrator）| ✅ |
| Q2 | 文字优先（原"语音为主"已改）| ❌ 修订 |
| Q3 | 李厚辰马司库 + Dan Koe + 其他 | ✅ |
| Q4 | a + b + c（延后到阶段 6）| ✅ |
| Q5 | NAS 80% 空 | ✅ |
| Q6 | 模型分配改为能力等级 | ❌ 修订 |
| Q7 | B + C（信息检索 + 视频）| ✅ |
| Q8 | Mobile UI 文字优先 | ❌ 修订 |
| Q14 | cc/codex 必装 | ✅ |
| Q15 | iPhone 是 controller | ✅ |

---

## 附录 A：dsh 能力验证矩阵（详细版）

> 见 §2.1 表格。

### A.1 spike 结果记录模板

```yaml
# /opt/harness/spike/dsh-capabilities.yaml
verified_at: 2026-08-29
dsh_version: v0.1.1-rc.2

capabilities:
  web_ui:
    status: verified
    command: dsh web --port 3080
    evidence: screenshot-001.png
    raw_output: |
      [2026-08-29 10:00:00] dsh web listening on :3080
      [2026-08-29 10:00:05] GET / → 200
    notes: 模型配置生效，命令执行正常

  remote_worker:
    status: not_found
    command: dsh agent start
    evidence: stderr
    raw_output: |
      $ dsh agent start --name w1
      error: unknown command 'agent'
    notes: dsh 没有 agent 子命令

  daemon:
    status: not_applicable

  websocket:
    status: unknown
    notes: netstat 未见 dsh 监听端口

  persistence:
    status: unknown
    notes: spike 未验证

fallback_decision:
  orchestrator: self_implemented_fastapi
  worker: cc_subprocess_adapter
  persistence: sqlite
  audit: append_only_sqlite
  backup: shell_script_age_scp
```

---

## 附录 B：规范 SQL（唯一版本）

> §4.6 的 SQL 是唯一权威版本，本附录同源引用，不重复。

所有 claim / renew / start / submit / fail / interrupt / retry 操作：
- 事务包裹（`BEGIN IMMEDIATE`）
- 条件更新 + row count 检查
- 每次转换递增 status_version
- 每次转换产生 task_event
- 不使用 `UPDATE...ORDER BY...LIMIT`（依赖非默认 SQLite 编译选项）
- 用括号明确 AND/OR 优先级

---

## 附录 C：错误与恢复表

| 路径 | 失败模式 | 系统动作 | 用户看到 |
|------|----------|----------|----------|
| 创建任务 | 空输入、过长输入、非法工作流 | 拒绝并记录校验错误 | 可修正的明确提示 |
| 创建任务 | 重复 idempotency_key | 返回原 task_id，不创建新任务 | 无感知 |
| 模型调用 | 超时、429、空响应、拒答、畸形 JSON | 分类重试；超过预算转人工 | 当前尝试和下一步 |
| Worker claim | 零行更新（任务已被其他 worker 抢走）| 返回 stale-lease + 记录事件 | 重新查询 |
| Worker heartbeat | worker 离线 | lease 过期；reaper 检查 → queued 或 interrupted | "执行中断，等待恢复" |
| 任务执行 | OOM、磁盘满、子进程退出 | 终止 attempt，保存 stderr + 资源数据 → failed | 失败原因与重试入口 |
| 任务执行 | worker 失联，无 checkpoint | running → interrupted；**用户显式 retry 创建新 attempt** | "中断，需手动 retry" |
| 结果提交 | 旧 worker 晚到提交（fence_version 不匹配）| 拒绝 + 记录 stale-fence 事件 | 保留有效结果 |
| 结果提交 | 旧 attempt 提交（attempt_id 不匹配）| 拒绝 + 记录 stale-attempt 事件 | 保留有效结果 |
| 外部抓取 | 403、限流、内容删除 | 退避或标记部分成功 | 缺失来源列表 |
| 通知 | 站内通知刷新失败 | 任务仍为成功；下次打开可见 | 下次打开可见 |
| 数据库 | 锁 | 停止接单，进入只读模式 | "系统暂不可接单" |
| 数据库 | 损坏 | 启用 HK03 backup，记录 corruption | "系统已恢复，可能丢失最近 6h 数据" |
| Approval | 参数变化 | action_params_hash 不匹配 → 拒绝 | "审批已失效，请重新申请" |
| Approval | 重放 | nonce 已消费 → 拒绝 | "审批已被使用" |
| Approval | 过期 | expires_at 已过 → 拒绝 | "审批已过期" |
| Tailscale | 节点撤销 | session 失效 + audit 记录 | "设备已撤销，请重新登录" |
| Prompt injection | 不可信内容试图触发工具 | 信任边界拒绝 + 记录事件 | "内容被标记不可信" |

**禁止**：记录日志后吞掉错误并继续。

---

## 附录 D：术语表

| 术语 | 含义 |
|------|------|
| **Adapter** | dsh 与业务代码之间的隔离层 |
| **Append-only audit** | 追加式审计日志，触发器阻止误改 |
| **Attempt** | 任务的一次执行尝试，每次 attempt 独立 lease + fence |
| **Blocked reason** | 无可用 worker 时记录在 task_events 中的原因 |
| **Checkpoint** | 任务执行中保存的状态快照（**MVP 不实现**）|
| **Dead state** | 任务状态机的终态 |
| **Fence version** | task 上的版本号，每次 attempt 创建递增 |
| **Fencing token** | lease_token + attempt_id + fence_version 组合 |
| **Hard constraint** | 调度硬约束 |
| **Idempotency key** | 客户端防双击的唯一键（UNIQUE 约束）|
| **Interrupted** | running 期间失联，无 checkpoint 时的新增状态 |
| **Lease** | worker 持有任务的限时令牌 |
| **Soft score** | 通过硬约束后的软评分 |
| **Spike** | 验证关键能力的小型原型 |
| **Tailscale** | MVP 唯一网络入口（私网 + 设备身份）|
| **Worker adapter** | worker 与任务账本之间的接口层 |

---

## 附录 E：变更历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-08-29 | 初版，架构对齐完成（**已撤销**）|
| v0.2 | 2026-08-29 | 架构师审验后修订：架构候选待 spike、单工作流 MVP、持久化 P0、安全边界、状态机 |
| **v0.3** | 2026-08-29 | v0.2 复审后修订：attempt 数据模型 + interrupted 状态 + Tailscale 唯一入口 + Approval 加固 + 递归脱敏 + 异故障域备份 + 部署架构 + MVP 范围矛盾清理 |

---

## 附录 F：v0.2 复审整改记录（**本轮新增**）

> 本节按 ARCHITECT-REVIEW-PRD-v0.2.md 逐条对应整改。

### F.1 P0 整改（3/3）

#### P0-1：统一 lease、attempt、checkpoint 和恢复语义

| 报告要求 | v0.3 处理 | 章节 |
|----------|----------|------|
| 新增 task_attempts 表 | ✅ | §4.5 |
| 决定 checkpoint 是否进入 MVP | ✅ **不实现**（路径 B）| §4.1 |
| 结果提交校验 task_id + attempt_id + lease_token + fence_version + 来源状态 | ✅ | §4.6 submit SQL |
| 条件更新零行返回 stale-lease 错误 | ✅ | §4.6 各操作 row count 检查 |
| 任务保存当前汇总状态，attempt 保存每次执行完整事实 | ✅ | §4.5 双表设计 |
| Worker 在 leased/running 崩溃分别处理 | ✅ | §4.4 恢复动作表 |
| 旧 attempt 无法覆盖新 attempt | ✅ | §4.6 submit SQL 校验 attempt_id + fence_version |

#### P0-2：修正单机故障与"不丢任务"的矛盾

| 报告要求 | v0.3 处理 | 章节 |
|----------|----------|------|
| 异故障域备份位置 | ✅ HK03 | §15.2 |
| SQLite Online Backup API / .backup | ✅ | §15.3 |
| MVP RPO | ✅ 6h | §15.1 |
| MVP RTO | ✅ 4h | §15.1 |
| 备份加密与密钥位置 | ✅ age + HK03 持私钥 | §15.5 |
| 备份保留期 | ✅ 30 天 | §15.5 |
| 区分 5 类故障 | ✅ | §15.6 故障矩阵 |
| "不可接单但不丢任务"承诺与 RPO 一致 | ✅ | §8.5 + §15.6 |
| Stage 1 退出条件含灾难恢复演练 | ✅ | §11 + §15.4 |

#### P0-3：MVP 安全基线收敛

| 报告要求 | v0.3 处理 | 章节 |
|----------|----------|------|
| MVP 只选一个网络入口 | ✅ **Tailscale** | §7.1 |
| Control API 不直接暴露公网 | ✅ 绑 127.0.0.1 | §3.3 |
| 只允许已批准设备访问 | ✅ Tailscale ACL | §7.1 |
| 设备撤销流程 | ✅ Tailscale Admin | §7.1 |
| session 签发/有效期/撤销/Cookie/CSRF | ✅ | §7.2 |
| approval 绑定 task_id + attempt_id + 参数 hash + nonce + 过期 | ✅ | §7.3 |
| 参数变化旧 approval 失效 | ✅ | §7.3 防重放规则 |
| 日志递归结构化 allowlist 优先 | ✅ | §7.4 |
| 覆盖嵌套 / Header / URL query | ✅ | §7.4 |
| "不可篡改"准确表述 | ✅ "追加式 + 尽力防误改" | §7.6 |
| Prompt injection 信任边界 | ✅ | §7.5 |

### F.2 P1 整改（5/5）

#### P1-1：补齐状态集合

| 报告要求 | v0.3 处理 | 章节 |
|----------|----------|------|
| blocked 正式加入或改成不新增状态 | ✅ **不新增**，用 task_events.blocked_reason | §4.2 + §4.5 |
| CHECK 约束 | ✅ status / workflow / decision | §4.5 |
| 启用并测试 foreign keys | ✅ `PRAGMA foreign_keys = ON` | §4.5 |
| 删除 tasks.approval_status 与 approvals 双事实 | ✅ 删除 tasks.approval_status（仅用 approvals 表）| §4.5 |
| 明确运行中取消是否支持 | ✅ MVP 支持 cancel API | §9.3 |

#### P1-2：只保留一份规范 SQL

| 报告要求 | v0.3 处理 | 章节 |
|----------|----------|------|
| 不依赖 UPDATE...ORDER BY...LIMIT | ✅ | §4.6 |
| 事务 + 条件更新 | ✅ | §4.6 |
| 每次转换递增版本号 | ✅ status_version | §4.6 |
| 括号明确优先级 | ✅ | §4.6 |
| claim / renew / start / submit / expire / retry 分别定义 | ✅ | §4.6 |
| 每个操作检查 row count + 产生 task_event | ✅ | §4.6 |
| 附录 B 与主文同源引用 | ✅ | 附录 B |

#### P1-3：重算真实执行进程资源

| 报告要求 | v0.3 处理 | 章节 |
|----------|----------|------|
| 实测空闲 RSS / 单次抓取峰值 / ASR 峰值 / cc-codex 子进程峰值 / 磁盘临时峰值 / 僵尸进程 / OOM 后账本一致性 | ✅ **spike 必做** | §8.2 |
| 重新验证 newvps 真实磁盘 | ✅ | §8.4 |

#### P1-4：清理 MVP 范围矛盾

| 报告要求 | v0.3 处理 | 章节 |
|----------|----------|------|
| MacBook 离线自动转移仅适用于未开始执行 | ✅ **删除措辞**，明确只重排 queued | §9.3 |
| MVP 不写"结果推送回手机"，写"轮询/刷新可见" | ✅ | §9.3 |
| MVP 唯一 Worker 是 newvps 本地，不写"公网 IP worker" | ✅ | §9.2 + §12 |
| WebSocket / Web Push / 第二 Worker 测试标后续阶段 | ✅ | §10 + §12 |
| "三层架构"改为"模块化单体控制平面" | ✅ | §3 标题 |

#### P1-5：补齐部署和升级架构

| 报告要求 | v0.3 处理 | 章节 |
|----------|----------|------|
| Dockerfile 和 Compose 服务边界 | ✅ | §14.2 + §14.3 |
| 镜像版本和依赖锁定 | ✅ | §14.4 |
| 配置与 secret 注入方式 | ✅ | §14.5 |
| SQLite migration 前滚和回滚 | ✅ | §14.6 |
| 健康检查和进程自启方式 | ✅ | §14.7 + §14.1 |
| 部署前备份、升级、失败回滚命令级步骤 | ✅ | §14.8 |
| Stage 0/1 CI 与 lint/test gate | ✅ | §14.9 |
| tmux + daemon 脚本不应作为生产 fallback | ✅ **删除**，用 systemd + Docker restart | §14.1 |

### F.3 测试计划补充（§5，4/4）

#### 状态与一致性（5.1）

7 项全部进入 §10.1 测试清单。

#### 安全（5.2）

5 项进入 §10.2 + 递归脱敏测试。

#### 数据恢复（5.3）

4 项进入 §10.3 + §15.4 备份验证。

#### 研究质量 eval（5.4）

5 项进入 §10.4。

### F.4 状态机（§6）

v0.3 §4.2 采用报告建议路径 B 状态机（不含 checkpoint）。

### F.5 复审通过门槛（§7，10 项）

| 门槛 | v0.3 状态 |
|------|----------|
| 1. lease/attempt/checkpoint 恢复规则无冲突 | ✅ |
| 2. Schema 保留每次执行历史和产物 | ✅ |
| 3. 旧 Worker/attempt/approval 不能产生有效副作用 | ✅ |
| 4. MVP 网络入口、session、设备撤销唯一确定 | ✅ |
| 5. SQLite 异故障域可恢复备份方案 | ✅ |
| 6. MVP 资源预算含真实 AI CLI / 抓取 / ASR 峰值 | ⏸ 待 spike |
| 7. 主文/附录/实施顺序/测试计划无范围矛盾 | ✅ |
| 8. 部署/升级/migration/回滚可复现 | ✅ |
| 9. dsh spike 记录版本/命令/原始输出/adapter 决策 | ⏸ 待 spike |
| 10. 新增一致性/安全/恢复/研究质量测试进入实施计划 | ✅ §10 |

**当前状态**：8/10 门槛满足。**门槛 6 + 9 必须在阶段 0（spike）完成后才能关闭**。

---

> **下一步**：等待 Claude Code 按本轮反馈完成 v0.3 修订后，复审门槛 6 + 9 通过（spike 完成），即可进入阶段 1（持久化单机任务闭环）。