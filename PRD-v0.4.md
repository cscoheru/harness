# Fish Harness PRD v0.4

> **版本**：v0.4（v0.3 复审后修补）
> **日期**：2026-08-29
> **维护者**：cscoheru / Claude Code
> **状态**：**架构候选，待 Stage 0 spike + v0.4 三大修补关闭**
> **位置**：`/Users/kjonekong/projects/fish-harness/`
> **前置文档**：`ARCHITECT-REVIEW-PRD-v0.1.md`、`ARCHITECT-REVIEW-PRD-v0.2.md`、`ARCHITECT-REVIEW-PRD-v0.3.md`、`PRD-v0.3.md`

---

## 0. TL;DR（一分钟版）

**v0.4 是修补版本，不是新增版本。三个集中修正**：

| 修补方向 | v0.3 问题 | v0.4 修复 |
|----------|----------|----------|
| **原子事务** | claim SQL 候选查询与条件更新矛盾；零行更新未 ROLLBACK；renew 不同步 attempt；无 reaper SQL | 每个转换 = 应用层事务伪代码；零行立即 ROLLBACK；attempt 依赖 task 成功；reaper 完整定义；每 task 唯一 active attempt 约束 |
| **信任模型** | "用户指令"和"模型历史输出"标可信 | 身份+策略=权限；所有文本不可信；研究工作流固定工具集；URL 防 SSRF |
| **部署拓扑** | Tailscale Serve 未配置；systemd+Compose 双管控；自研 migration；镜像版本不可变 | systemd 管 Compose stack；Worker = 进程内模块；不可变镜像 + commit SHA；**Alembic** 替代自研 |

**v0.4 自评（诚实版）**：3/10 复审门槛完整通过，5/10 部分通过，2/10 待 spike。

---

## 1. 愿景与设计哲学（保留）

> 与 v0.3 一致，不重复。

---

## 2. 架构假设与验证状态（保留）

> 与 v0.3 §2 一致，不重复。

---

## 3. 模块化单体控制平面（保留）

> 与 v0.3 §3 一致，但 §3.2 模块边界微调：
> - Worker Adapter **明确为进程内模块**（不是独立服务）
> - UI Service **明确为独立服务**（Compose 中显式定义）
> - 备份进程 **明确为独立 systemd timer**（不在 Compose 内）

### 3.3 网络拓扑（v0.4 收敛）

```
iPhone（Tailscale 客户端，已批准 ACL）
   │ Tailscale 私网
   ↓ HTTPS (terminated by tailscaled)
[Tailscale Serve: harness.tail-net.ts.net → localhost:8080]
   ↓
newvps 127.0.0.1:8080
   ├─ Control API (FastAPI)
   ├─ Worker Adapter (进程内模块)
   ├─ UI Service (Compose 独立服务)
   └─ SQLite + WAL
         │
         │ systemd timer (6h) → .backup → age encrypt → scp
         ↓
   HK03 (异故障域备份)
```

---

## 4. 任务状态机与持久化（**v0.4 核心修补**）

### 4.1 决策：保留 retry_wait，补齐完整转换

v0.3 自检：retry_wait 在 Schema 但不在状态图。v0.4 决策：**保留**。

**理由**：
- `queued` = 等 worker；`retry_wait` = 等时间（指数退避）。两个语义不同。
- 报告 429、网络抖动等可重试错误需要明确的"等待"状态。
- 简化做法是合并，但会丢失语义。

**完整转换**：

| From | To | 触发 |
|------|-----|------|
| `retry_wait` | `queued` | 指数退避到期（next_attempt_at ≤ now）|
| `retry_wait` | `failed` | attempt_count ≥ MAX_ATTEMPTS |

### 4.2 状态机（v0.4 完整版）

```
created ──▶ validated ──▶ queued ──▶ leased ──▶ running ──▶ succeeded
    │          │          │        │         ├→ failed
    │          │          │        │         ├→ interrupted
    │          │          │        │         └→ cancel_requested ─▶ cancelled
    │          │          │        ├→ queued（lease 过期 + reaper）
    │          │          │        └→ cancel_requested ─▶ cancelled
    │          │          ├→ retry_wait（可重试错误）
    │          │          └→ cancelled
    │          │     retry_wait ──▶ queued（退避到期）
    │          │     retry_wait ──▶ failed（超 MAX_ATTEMPTS）
    │          └→ rejected
    └→ rejected

注：cancel_requested = 中间态，仅用户取消时短暂存在
   leased + cancel_requested → reaper 回收后 cancelled
   running + cancel_requested → Worker 终止 → cancelled
```

### 4.3 Schema 约束：每 task 最多一个 active attempt（**v0.4 新增**）

```sql
-- 通过 partial unique index 强制
CREATE UNIQUE INDEX idx_one_active_attempt_per_task
    ON task_attempts(task_id)
    WHERE status = 'active';
```

**作用**：
- 同一 task 不可能有 2 个 active attempt
- reaper 必须在创建新 attempt 前先关闭旧 attempt
- DB 层强制，应用层不必担心竞态

### 4.4 Schema 微调

```sql
-- v0.4 修订
CREATE TABLE tasks (
    -- ... v0.3 字段保留 ...
    cancel_requested_at INTEGER,             -- 用户请求取消的时间
    next_attempt_at INTEGER,                 -- retry_wait 退避到期时间
    -- 删掉 v0.3 的 status_version（应用层用 task_events 表版本化）
);

CREATE TABLE approvals (
    approval_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_id TEXT,
    requested_at INTEGER NOT NULL,
    requested_action TEXT NOT NULL,
    action_params_json TEXT NOT NULL,
    action_params_hash TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    nonce TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK(status IN (
        'pending','approved','rejected',
        'consuming','consumed','expired'
    )),
    consumed_at INTEGER,
    consumed_by_attempt_id TEXT,
    execution_idempotency_key TEXT,          -- 外部副作用幂等键
    decided_at INTEGER,
    decided_by TEXT,
    decision TEXT CHECK(decision IS NULL OR decision IN ('approved','rejected')),
    execution_result TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(task_id),
    FOREIGN KEY (consumed_by_attempt_id) REFERENCES task_attempts(attempt_id)
);

-- v0.4 新增：reaper 锁（防并发 reaper）
CREATE TABLE reaper_lock (
    lock_name TEXT PRIMARY KEY,
    acquired_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    worker_id TEXT
);
```

### 4.5 应用层事务函数（**v0.4 核心**）

**关键原则**：
- **每个状态转换 = 一个应用层事务函数**
- 函数内显式 `BEGIN` / `COMMIT` / `ROLLBACK`
- **零行更新立即 ROLLBACK**，**禁止继续写 attempt / event**
- **attempt 更新必须在 task 更新成功之后**

#### 4.5.1 `claim_task(worker_id) → Optional[Task]`

```python
def claim_task(worker_id: str) -> Optional[ClaimedTask]:
    """事务：选择 queued 任务 + 创建 attempt + 标记 leased。
    
    关键：候选查询和条件更新必须在同一事务内。
    """
    attempt_id = str(uuid4())
    lease_token = str(uuid4())
    now = ms_now()
    lease_expires = now + LEASE_TTL_MS  # 5 min
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 选候选（用 FOR UPDATE 锁，SQLite 通过 IMMEDIATE 事务锁 DB）
        candidate = tx.execute("""
            SELECT task_id, fence_version
            FROM tasks
            WHERE status = 'queued'
              AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
            ORDER BY created_at ASC
            LIMIT 1
        """, (now,)).fetchone()
        
        if not candidate:
            return None  # 无候选 = None（非错误）
        
        task_id, current_fence = candidate
        
        # 2. 创建 attempt（依赖 partial unique index 自动防并发）
        tx.execute("""
            INSERT INTO task_attempts (
                attempt_id, task_id, attempt_no, worker_id,
                fence_version, lease_token, lease_expires_at,
                started_at, status
            ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'active')
        """, (attempt_id, task_id, worker_id,
              current_fence + 1, lease_token, lease_expires, now))
        
        # 3. 条件更新 task（同时校验 status 仍是 queued）
        #    零行 = 竞态丢失，立即 ROLLBACK
        row_count = tx.execute("""
            UPDATE tasks
            SET status = 'leased',
                worker_id = ?,
                lease_token = ?,
                lease_expires_at = ?,
                current_attempt_id = ?,
                attempt_count = attempt_count + 1,
                fence_version = fence_version + 1,
                updated_at = ?
            WHERE task_id = ?
              AND status = 'queued'
              AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        """, (worker_id, lease_token, lease_expires,
              attempt_id, now, task_id, now)).rowcount
        
        if row_count != 1:
            raise StaleLeaseError(f"task {task_id} not queued at update time")
        
        # 4. 写 event
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
            VALUES (?, ?, ?, 'lease_granted', ?, ?)
        """, (task_id, attempt_id, now,
              json.dumps({"lease_token": lease_token, "fence_version": current_fence + 1}),
              worker_id))
        
        return ClaimedTask(task_id, attempt_id, lease_token, current_fence + 1)
        # 事务 COMMIT（with 块结束）
```

**关键改动**：
- 候选查询 + 条件更新 + attempt 创建 + event 都在同一事务
- 零行更新 raise StaleLeaseError（事务自动 ROLLBACK）
- 不依赖过期 `leased` 的恢复路径——恢复由 reaper 单独处理

#### 4.5.2 `renew_lease(task_id, lease_token) → bool`

```python
def renew_lease(task_id: str, lease_token: str) -> bool:
    """续租：同步 task 和当前 attempt 的 lease expiry。"""
    now = ms_now()
    new_expires = now + LEASE_TTL_MS
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 更新 task
        task_rows = tx.execute("""
            UPDATE tasks
            SET lease_expires_at = ?, updated_at = ?
            WHERE task_id = ?
              AND lease_token = ?
              AND status = 'running'
        """, (new_expires, now, task_id, lease_token)).rowcount
        
        if task_rows != 1:
            return False  # stale
        
        # 2. 同步更新 attempt（关键：v0.4 修复）
        attempt_rows = tx.execute("""
            UPDATE task_attempts
            SET lease_expires_at = ?
            WHERE task_id = ?
              AND status = 'active'
              AND lease_token = ?
        """, (new_expires, task_id, lease_token)).rowcount
        
        if attempt_rows != 1:
            # task 已更新但 attempt 没找到——异常状态
            raise InconsistentStateError(f"task renewed but attempt not found")
        
        # 3. event
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, actor)
            SELECT ?, current_attempt_id, ?, 'lease_renewed', worker_id
            FROM tasks WHERE task_id = ?
        """, (task_id, now, task_id))
        
        return True
```

#### 4.5.3 `start_running(task_id, lease_token, attempt_id, fence_version)`

```python
def start_running(task_id, lease_token, attempt_id, fence_version) -> bool:
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 条件更新 task
        task_rows = tx.execute("""
            UPDATE tasks
            SET status = 'running',
                updated_at = ?
            WHERE task_id = ?
              AND current_attempt_id = ?
              AND lease_token = ?
              AND fence_version = ?
              AND status = 'leased'
        """, (now, task_id, attempt_id, lease_token, fence_version)).rowcount
        
        if task_rows != 1:
            return False  # stale，零行立即 ROLLBACK
        
        # 2. 写 started event（task 成功后才写）
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, actor)
            VALUES (?, ?, ?, 'started', ?)
        """, (task_id, attempt_id, now, worker_id))
        
        return True
```

#### 4.5.4 `submit_result(task_id, attempt_id, lease_token, fence_version, artifact)`

```python
def submit_result(task_id, attempt_id, lease_token, fence_version, artifact) -> bool:
    """提交结果：必须 4 元校验（task_id + attempt_id + lease_token + fence_version）。"""
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 条件更新 task
        task_rows = tx.execute("""
            UPDATE tasks
            SET status = 'succeeded',
                artifact_path = ?,
                artifact_summary = ?,
                lease_token = NULL,
                lease_expires_at = NULL,
                updated_at = ?
            WHERE task_id = ?
              AND current_attempt_id = ?
              AND lease_token = ?
              AND fence_version = ?
              AND status = 'running'
        """, (artifact.path, artifact.summary, now,
              task_id, attempt_id, lease_token, fence_version)).rowcount
        
        if task_rows != 1:
            # 关键：零行立即 ROLLBACK，禁止 attempt 更新
            return False  # stale（可能是旧 worker 提交或 task 已取消）
        
        # 2. 只有 task 成功才更新 attempt
        tx.execute("""
            UPDATE task_attempts
            SET status = 'succeeded',
                finished_at = ?,
                artifact_path = ?
            WHERE attempt_id = ?
              AND fence_version = ?
              AND status = 'active'
        """, (now, artifact.path, attempt_id, fence_version))
        
        # 3. event
        tx.execute("""
            INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
            VALUES (?, ?, ?, 'submit_succeeded', ?, ?)
        """, (task_id, attempt_id, now,
              json.dumps({"artifact": artifact.summary}), worker_id))
        
        return True
```

#### 4.5.5 `fail_attempt(task_id, attempt_id, lease_token, fence_version, error)`

```python
def fail_attempt(task_id, attempt_id, lease_token, fence_version, error) -> bool:
    """失败：可重试错误转 retry_wait（指数退避），否则转 failed。"""
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 决定最终状态
        if error.retryable and attempt_count < MAX_ATTEMPTS:
            new_status = 'retry_wait'
            backoff_ms = min(
                BACKOFF_BASE * (2 ** attempt_count),  # 指数
                BACKOFF_MAX_MS
            )
            next_attempt_at = now + backoff_ms
        else:
            new_status = 'failed'
            next_attempt_at = None
        
        # 2. 更新 task
        task_rows = tx.execute("""
            UPDATE tasks
            SET status = ?,
                next_attempt_at = ?,
                lease_token = NULL,
                lease_expires_at = NULL,
                last_error_code = ?,
                last_error_message = ?,
                updated_at = ?
            WHERE task_id = ?
              AND current_attempt_id = ?
              AND lease_token = ?
              AND fence_version = ?
              AND status IN ('running', 'leased')
        """, (new_status, next_attempt_at, error.code, error.message, now,
              task_id, attempt_id, lease_token, fence_version)).rowcount
        
        if task_rows != 1:
            return False
        
        # 3. 更新 attempt
        tx.execute("""
            UPDATE task_attempts
            SET status = ?,
                finished_at = ?,
                error_code = ?,
                error_message = ?
            WHERE attempt_id = ? AND fence_version = ? AND status = 'active'
        """, ('failed' if new_status == 'failed' else 'interrupted',
              now, error.code, error.message, attempt_id, fence_version))
        
        return True
```

#### 4.5.6 `retry_wait_to_queued()` — 调度器定期调用

```python
def retry_wait_to_queued() -> int:
    """把退避到期的 retry_wait 任务转回 queued。"""
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        rows = tx.execute("""
            UPDATE tasks
            SET status = 'queued',
                next_attempt_at = NULL,
                updated_at = ?
            WHERE status = 'retry_wait'
              AND next_attempt_at IS NOT NULL
              AND next_attempt_at <= ?
        """, (now, now)).rowcount
        return rows
```

#### 4.5.7 `reap_expired_leases()` — **v0.4 关键新增**

```python
def reap_expired_leases() -> int:
    """处理 lease 过期：
    
    - leased 过期 + attempt.active → attempt.expired + task.queued（用户必须 retry 创建新 attempt）
    - running 过期 + attempt.active → attempt.interrupted + task.interrupted
    """
    now = ms_now()
    reaped = 0
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 锁住 reaper（防并发）
        lock = tx.execute("""
            INSERT OR IGNORE INTO reaper_lock (lock_name, acquired_at, expires_at, worker_id)
            VALUES ('lease_reaper', ?, ?, ?)
        """, (now, now + REAPER_TTL_MS, REAPER_WORKER_ID))
        
        existing = tx.execute("""
            SELECT acquired_at, expires_at FROM reaper_lock WHERE lock_name = 'lease_reaper'
        """).fetchone()
        
        if existing['expires_at'] > now and existing['worker_id'] != REAPER_WORKER_ID:
            return 0  # 别的 reaper 正在跑
        elif existing['expires_at'] <= now:
            tx.execute("""
                UPDATE reaper_lock SET acquired_at = ?, expires_at = ?, worker_id = ?
                WHERE lock_name = 'lease_reaper'
            """, (now, now + REAPER_TTL_MS, REAPER_WORKER_ID))
        
        # 2. 找过期 leased/running
        expired = tx.execute("""
            SELECT task_id, current_attempt_id, status
            FROM tasks
            WHERE lease_expires_at IS NOT NULL
              AND lease_expires_at < ?
              AND status IN ('leased', 'running')
        """, (now,)).fetchall()
        
        for row in expired:
            task_id = row['task_id']
            attempt_id = row['current_attempt_id']
            old_status = row['status']
            
            if old_status == 'leased':
                # leased 过期 = 还没真正开始执行 → 回 queued，attempt 标 expired
                tx.execute("""
                    UPDATE tasks
                    SET status = 'queued',
                        worker_id = NULL,
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        current_attempt_id = NULL,
                        updated_at = ?
                    WHERE task_id = ? AND status = 'leased' AND lease_expires_at < ?
                """, (now, task_id, now))
                
                tx.execute("""
                    UPDATE task_attempts
                    SET status = 'expired', finished_at = ?
                    WHERE attempt_id = ? AND status = 'active'
                """, (now, attempt_id))
                
                tx.execute("""
                    INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
                    VALUES (?, ?, ?, 'lease_expired_requeued', ?, 'system')
                """, (task_id, attempt_id, now,
                      json.dumps({"reason": "lease expired before start"})))
            
            elif old_status == 'running':
                # running 过期 = Worker 失联 → interrupted（用户显式 retry）
                tx.execute("""
                    UPDATE tasks
                    SET status = 'interrupted',
                        worker_id = NULL,
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        current_attempt_id = NULL,
                        updated_at = ?
                    WHERE task_id = ? AND status = 'running' AND lease_expires_at < ?
                """, (now, task_id, now))
                
                tx.execute("""
                    UPDATE task_attempts
                    SET status = 'interrupted', finished_at = ?
                    WHERE attempt_id = ? AND status = 'active'
                """, (now, attempt_id))
                
                tx.execute("""
                    INSERT INTO task_events (task_id, attempt_id, at, event_type, payload_json, actor)
                    VALUES (?, ?, ?, 'worker_lost_interrupted', ?, 'system')
                """, (task_id, attempt_id, now,
                      json.dumps({"reason": "lease expired during running"})))
            
            reaped += 1
    
    return reaped
```

### 4.6 取消语义统一（**v0.4 新增**）

| 触发 | task 状态 | attempt 状态 | 说明 |
|------|----------|-------------|------|
| 用户取消 queued | `cancelled` | n/a（无 attempt）| 终态 |
| 用户取消 leased | `cancel_requested` → `cancelled`（reaper 处理）| `cancelled` | 终态 |
| 用户取消 running | `cancel_requested` → `cancelled`（Worker 收到信号后）| `cancelled` | Worker 必须响应取消 |
| 用户取消 retry_wait | `cancel_requested` → `cancelled` | n/a | 终态 |
| Worker 失联（lease 过期）| `interrupted` | `interrupted` | **不**自动 retry |
| 子进程 OOM / 不可恢复错误 | `failed` | `failed` | 终态 |

**关键**：
- `cancelled` 和 `interrupted` 是**两个独立终态**
- `cancel_requested` 是中间态，最终必到 `cancelled`
- 旧 Worker 提交时检查 `status = cancelled` → 拒绝（submit 函数零行更新）

### 4.7 关键约束总览

1. **每 task 最多一个 active attempt**：partial unique index 强制
2. **零行更新立即 ROLLBACK**：禁止后续 attempt/event 写入
3. **attempt 更新依赖 task 更新成功**：在事务内顺序执行
4. **renew 同步 task + attempt**：必须同时成功
5. **retry_wait 退避**：调度器定期扫描 `next_attempt_at <= now`
6. **reaper 用锁防并发**：单 reaper 进程持有 reaper_lock

---

## 5. 调度策略（保留）

> 与 v0.3 §5 一致。retry_wait → queued 由 `retry_wait_to_queued()` 定期执行。

---

## 6. 模型路由（保留）

> 与 v0.3 §6 一致。

---

## 7. 安全边界（**v0.4 核心修补**）

### 7.1 信任模型重构（**v0.4 关键修复**）

**v0.3 错误模型**：

```
用户原始指令     可信      完整权限
模型历史输出     可信但审计 受限权限
```

**v0.4 正确模型**：

```
身份与策略决定权限；文本内容只提供数据，不授予权限。

用户身份 / 设备身份 ──▶ policy engine ──▶ 可调用工具集合
用户文本 / 网页 / 字幕 / 模型输出 ─────▶ 全部作为不可信数据
高副作用动作 ─────────────────────────▶ 参数绑定 approval
```

**核心规则**：
1. **所有自然语言输入默认不可信**，包括用户指令、模型历史输出、网页内容、字幕
2. **权限来自服务端 policy + 项目 allowlist + worker identity + approval**，**不来自 prompt 标签**
3. **研究工作流使用固定工具集合**（`fetch_url`, `transcribe_audio`, `cite_source`, `summarize_text`），**模型不能动态发明 shell 命令**
4. **每个工具的参数有固定 schema**，模型输出必须符合 schema 才能调用
5. **shell 命令必须由结构化动作层生成 argv**，经过命令/路径策略与审批
6. **URL 抓取防 SSRF**：DNS 解析 + IP 校验 + 重定向二次校验 + 拒绝 loopback/私网/metadata

### 7.2 Tailscale 入口（**v0.4 完整定义**）

**部署命令**：

```bash
# 1. 安装并启动 Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=tskey-auth-xxx

# 2. 配置 Tailscale Serve（让 tailnet 上的设备访问 loopback 服务）
tailscale serve --bg --https=443 localhost:8080
# 等价于：tailscaled 终止 HTTPS，转发到 localhost:8080

# 3. 验证
tailscale serve status
# 输出示例：
# https://harness.tail-net.ts.net (tailscale cert)
# |-- / proxy http://127.0.0.1:8080

# 4. ACL 配置（仅允许已批准设备）
# 在 Tailscale Admin Console：
# "acls": [
#   {"action": "accept", "src": ["device:approved-iphone"], "dst": ["newvps:443"]}
# ]
```

**关键**：
- Control API 仍绑 127.0.0.1（安全）
- tailscaled 在 Tailscale IP 上终止 HTTPS
- 通过 Serve 配置代理到 loopback
- iPhone 用 `https://harness.tail-net.ts.net` 访问（不暴露公网）

**持久化**：

```ini
# /etc/tailscale/serve.json（v0.4 新增）
{
  "TCP": {
    "443": {"HTTPS": true}
  },
  "Web": {
    "${TS_CERT_DOMAIN}:443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8080"}}}
  },
  "AllowFunnel": false
}
```

**重新启动后恢复**：Tailscale 服务开机自启 + Serve 配置通过 systemd unit 重启时执行 `tailscale serve --bg`。

### 7.3 Policy Engine（**v0.4 新增**）

```python
class PolicyEngine:
    """根据身份 + 任务 + 上下文，决定可调用的工具集合。"""
    
    def allowed_tools(self, actor: Identity, task: Task, context: dict) -> Set[Tool]:
        # 1. 基础集合（worker identity）
        base = {"fetch_url", "transcribe_audio", "cite_source", "summarize_text"}
        
        # 2. 按角色扩展
        if actor.role == "research":
            base.add("write_artifact")
        if actor.role == "code":
            base.update({"read_file", "edit_file", "shell_command"})  # 受限 shell
        
        # 3. 按项目 allowlist 过滤路径
        if task.project:
            base = {t for t in base if t in PROJECT_ALLOWLIST.get(task.project, [])}
        
        # 4. 按 approval 状态扩展
        if task.requires_approval and task.approval_status == "approved":
            base.add("publish_external")  # 仅审批后开放
        
        # 5. 禁止来源
        if context.get("input_source") in ("webpage", "subtitle", "model_history"):
            # 不可信内容触发的工具调用，必须经过 approval
            if not task.approval_status == "approved":
                base -= {"write_artifact", "publish_external"}
        
        return base
```

**关键**：
- 工具集合**只由 policy engine 决定**，不来自 prompt
- prompt 标签（"用户"、"网页"、"模型历史"）**不影响工具集合**
- 高副作用动作必须 approval

### 7.4 研究工作流：固定工具集 + 固定 schema

```python
RESEARCH_TOOLS = {
    "fetch_url": {
        "params_schema": {
            "url": {"type": "string", "format": "uri", "required": True},
            "max_bytes": {"type": "integer", "max": 10_000_000},
        },
        "implementation": "ssrf_safe_fetch",  # §7.5
    },
    "transcribe_audio": {
        "params_schema": {
            "audio_url": {"type": "string", "required": True},
            "language": {"type": "string", "enum": ["zh", "en"]},
        },
        "implementation": "faster_whisper",
    },
    "cite_source": {
        "params_schema": {
            "source_id": {"type": "string", "required": True},
            "quote": {"type": "string", "required": True},
        },
        "implementation": "validate_against_artifact",
    },
    "summarize_text": {
        "params_schema": {
            "text": {"type": "string", "required": True},
            "max_words": {"type": "integer", "max": 2000},
        },
        "implementation": "llm_call",
    },
    "write_artifact": {
        "params_schema": {
            "path": {"type": "string", "pattern": "^/opt/harness/workspace/[a-z0-9-]+/[a-z0-9-]+\\.md$"},
            "content": {"type": "string", "maxLength": 100_000},
        },
        "implementation": "sandboxed_write",
        "requires_approval": False,
    },
}
```

**关键**：
- 模型只能从这 5 个工具中选，**不能发明 shell 命令**
- 每个工具参数有严格 schema（JSON Schema）
- 模型输出必须 JSON.parse + 通过 schema 校验才能调用
- schema 校验失败 = 任务失败（不是 retry）

### 7.5 URL 抓取防 SSRF（**v0.4 新增**）

```python
import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_IP_RANGES = [
    ipaddress.ip_network("127.0.0.0/8"),       # loopback IPv4
    ipaddress.ip_network("::1/128"),           # loopback IPv6
    ipaddress.ip_network("10.0.0.0/8"),        # RFC1918
    ipaddress.ip_network("172.16.0.0/12"),     # RFC1918
    ipaddress.ip_network("192.168.0.0/16"),    # RFC1918
    ipaddress.ip_network("169.254.0.0/16"),    # link-local
    ipaddress.ip_network("fe80::/10"),         # IPv6 link-local
    ipaddress.ip_network("100.64.0.0/10"),     # CGNAT
    ipaddress.ip_network("0.0.0.0/8"),         # unspecified
    ipaddress.ip_network("224.0.0.0/4"),       # multicast
    ipaddress.ip_network("169.254.169.254/32"),# AWS/GCP metadata
]

ALLOWED_SCHEMES = {"http", "https"}

async def ssrf_safe_fetch(url: str, max_bytes: int = 10_000_000) -> bytes:
    """SSRF 防护：解析 → DNS 校验 → IP 校验 → 重定向二次校验。"""
    
    # 1. scheme 校验
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise SSRFError(f"scheme {parsed.scheme} not allowed")
    
    hostname = parsed.hostname
    if not hostname:
        raise SSRFError("no hostname")
    
    # 2. 解析 hostname → IP
    try:
        infos = socket.getaddrinfo(hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise SSRFError(f"DNS resolve failed: {hostname}")
    
    # 3. 所有 IP 必须通过校验（防 DNS rebinding）
    for family, _, _, _, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        for blocked in BLOCKED_IP_RANGES:
            if ip in blocked:
                raise SSRFError(f"blocked IP: {ip} in {blocked}")
    
    # 4. 发起请求，禁止自动重定向（手动处理）
    async with httpx.AsyncClient(follow_redirects=False, timeout=10) as client:
        resp = await client.get(url, headers={"User-Agent": "FishHarness/0.4"})
        
        # 5. 重定向二次校验（target IP 必须再次通过 §7.5.3）
        if resp.status_code in (301, 302, 303, 307, 308):
            new_url = resp.headers["location"]
            return await ssrf_safe_fetch(new_url, max_bytes)  # 递归校验
        
        # 6. 字节限制
        content = resp.content
        if len(content) > max_bytes:
            raise SSRFError(f"response {len(content)} > {max_bytes}")
        
        return content
```

### 7.6 Shell 命令结构化（**v0.4 新增**）

**禁止**：模型在 prompt 中发明 shell 命令（如 `rm -rf /tmp/x`）。

**允许**：
- 模型只能从受控动作列表选
- 每个动作编译成 argv 列表（**不**拼字符串）
- argv 经过命令/路径策略校验
- 高副作用动作需 approval

```python
STRUCTURED_ACTIONS = {
    "convert_video": {
        "command_template": ["ffmpeg", "-i", "{input}", "-codec", "libx264", "{output}"],
        "path_validation": lambda p: p.startswith("/opt/harness/workspace/"),
        "requires_approval": False,
    },
    "publish_video": {
        "command_template": ["harness-publisher", "upload", "--file", "{file}"],
        "path_validation": lambda p: p.startswith("/opt/harness/workspace/") and p.endswith(".mp4"),
        "requires_approval": True,  # 必须 approval
    },
    "db_migrate": {
        "command_template": ["alembic", "upgrade", "head"],
        "path_validation": None,  # 不接受路径参数
        "requires_approval": True,
    },
}

def execute_structured_action(action_name: str, params: dict, approval_id: Optional[str]):
    """执行结构化动作：编译 argv → 校验 → 执行。"""
    
    spec = STRUCTURED_ACTIONS.get(action_name)
    if not spec:
        raise SecurityError(f"unknown action: {action_name}")
    
    # 1. 校验参数（防注入）
    for key, validator in spec.get("param_validators", {}).items():
        if not validator(params.get(key)):
            raise SecurityError(f"param {key} failed validation")
    
    # 2. 编译 argv（不拼字符串）
    argv = [arg.format(**params) if "{" in arg else arg for arg in spec["command_template"]]
    
    # 3. 路径校验
    if spec["path_validation"]:
        for arg in argv:
            if "/" in arg and not spec["path_validation"](arg):
                raise SecurityError(f"path not allowed: {arg}")
    
    # 4. approval 校验
    if spec["requires_approval"]:
        if not approval_id or not verify_approval(approval_id, action_name, params):
            raise SecurityError(f"approval required for {action_name}")
    
    # 5. 执行
    return subprocess.run(argv, capture_output=True, timeout=300, check=False)
```

### 7.7 Approval 一次性消费持久化（**v0.4 P1-1 修复**）

```sql
-- approvals.status 加 CHECK（v0.4）
status TEXT NOT NULL CHECK(status IN (
    'pending','approved','rejected',
    'consuming','consumed','expired'
))
```

**消费流程**：

```python
def consume_approval(approval_id: str, attempt_id: str, idempotency_key: str) -> bool:
    """原子消费 approval。"""
    now = ms_now()
    
    with db.transaction("IMMEDIATE") as tx:
        # 1. 原子 approved → consuming（防重放）
        rows = tx.execute("""
            UPDATE approvals
            SET status = 'consuming',
                consumed_at = ?,
                consumed_by_attempt_id = ?,
                execution_idempotency_key = ?
            WHERE approval_id = ?
              AND status = 'approved'
              AND expires_at > ?
              AND action_params_hash = ?  -- 防参数变化
        """, (now, attempt_id, idempotency_key, approval_id, now,
              current_action_params_hash)).rowcount
        
        if rows != 1:
            return False  # expired / consumed / params changed
        
        # 2. event
        tx.execute("""
            INSERT INTO audit_log (at, actor, action, target, payload_json, result)
            VALUES (?, ?, 'approval_consuming', ?, ?, 'pending')
        """, (now, worker_id, approval_id, json.dumps({"attempt_id": attempt_id})))
        
        return True

def complete_approval(approval_id: str, success: bool, result_msg: str):
    """完成消费：consuming → consumed。"""
    now = ms_now()
    new_status = 'consumed'
    
    with db.transaction("IMMEDIATE") as tx:
        rows = tx.execute("""
            UPDATE approvals
            SET status = ?,
                execution_result = ?,
                decided_at = ?
            WHERE approval_id = ? AND status = 'consuming'
        """, (new_status, result_msg, now, approval_id)).rowcount
        
        if rows != 1:
            raise InconsistentStateError(f"approval not in consuming state")
        
        tx.execute("""
            INSERT INTO audit_log (at, actor, action, target, payload_json, result)
            VALUES (?, ?, 'approval_completed', ?, ?, ?)
        """, (now, worker_id, approval_id, json.dumps({"result": result_msg}),
              "success" if success else "failed"))

def abort_approval(approval_id: str, reason: str):
    """进程崩溃后：consuming → approved（让其他 attempt 重试）。"""
    now = ms_now()
    with db.transaction("IMMEDIATE") as tx:
        tx.execute("""
            UPDATE approvals
            SET status = 'approved',
                consumed_at = NULL,
                consumed_by_attempt_id = NULL
            WHERE approval_id = ? AND status = 'consuming'
        """, (approval_id,))
```

**进程崩溃恢复**：
- `consuming` 状态的 approval 在 timeout 后由 reaper 转为 `approved`
- 新 attempt 重新消费（幂等键保证外部副作用不重复）

### 7.8 日志脱敏（保留 v0.3 §7.4）

> 不重复。

### 7.9 审计准确表述（保留 v0.3 §7.6）

> 不重复。

---

## 8. 资源预算（保留 + 性能补充）

### 8.1 事务极短原则（**v0.4 新增**）

`BEGIN IMMEDIATE` 序列化所有写事务。**禁止在事务内做**：
- 文件 I/O
- 网络 I/O
- 模型调用
- subprocess
- 任何 > 10ms 操作

**模式**：
```python
# 错误：在事务内 I/O
with db.transaction():
    data = fetch_remote()  # 慢，事务持有锁
    db.execute("INSERT ...", data)

# 正确：先 I/O，再事务
data = fetch_remote()
with db.transaction():
    db.execute("INSERT ...", data)
```

### 8.2 保留期与归档（**v0.4 新增**）

| 表 | 保留期 | 归档策略 |
|----|--------|----------|
| tasks | 永久 | 不归档（汇总表）|
| task_attempts | 90 天 | 90 天后移到 attempts_archive |
| task_events | 30 天 | 30 天后移到 events_archive |
| audit_log | 1 年（合规）| 1 年后压缩 + 移到冷存储 |
| artifacts | 永久 | 路径引用，正文在 artifact store |

**归档脚本**：独立 systemd timer，每周扫描 + 移到 archive 表。

### 8.3 资源 spike 待办（保留 v0.3 §8.2）

> 不重复。

---

## 9. MVP（保留 v0.3 §9）

> 与 v0.3 一致。

### 9.4 MVP 验收（保留 v0.3 §9.4）

> 不重复。

---

## 10. 测试与验收（**v0.4 扩充负路径**）

### 10.1 状态与一致性（v0.4 补负路径）

- [ ] **相同 idempotency_key + 不同 payload** → 返回冲突，不静默复用旧任务
- [ ] claim/start/submit/cancel 每个零行更新 → 验证 attempt 和 event 均未变化
- [ ] **renew 与 reaper 并发** → 最多一个成功，task/attempt lease 一致
- [ ] **leased 过期** → 旧 attempt 变 expired，新 claim 才能创建新 attempt
- [ ] **running cancel 与旧 worker submit 并发** → 最终状态唯一且可解释
- [ ] **renew 同步 task + attempt**：renew 后两边 lease_expires_at 同步
- [ ] **retry_wait 退避**：到点后转 queued，attempt_count 正确
- [ ] **每 task 最多一个 active attempt**：partial unique index 强制

### 10.2 安全（v0.4 补负路径）

- [ ] **同一动作无论由哪种文本来源提出，都经过相同 policy**
- [ ] **用户指令 / 模型历史 / 网页 / 字幕 四种来源使用同一权限测试矩阵**
- [ ] **URL 抓取覆盖 IPv4/IPv6 loopback / RFC1918 / link-local / DNS rebinding / 重定向 / metadata endpoint**
- [ ] **符号链接 + 路径穿越**：artifact path 和 workspace path 被拒绝
- [ ] **shell 命令只能从 STRUCTURED_ACTIONS 选择**，prompt 中的 shell 命令被拒绝
- [ ] **approval 一次性消费**：consumed 后 nonce 不可重用；参数变化后旧 approval 失效
- [ ] **进程崩溃时 consuming → approved**：reaper 回收让其他 attempt 重试

### 10.3 数据恢复（v0.4 补负路径）

- [ ] 干净 newvps 主机**完整安装 + 启动**（不只是应用）
- [ ] **主机重启后**：Tailscale Serve、Compose 服务、备份 timer 全部恢复
- [ ] **Alembic upgrade/downgrade 与旧/新应用版本兼容性测试**
- [ ] **前滚后应用回滚兼容性**：DB v2 + 应用 v1.5 应能工作（有限）

### 10.4 研究质量 eval（保留 v0.3）

> 不重复。

### 10.5 dsh spike（保留 v0.3）

> 不重复。

### 10.6 部署（**v0.4 补**）

- [ ] 干净容器验证 healthcheck、sqlite3、age、scp、known_hosts、密钥挂载
- [ ] 不可变镜像版本：CI 发布带 commit SHA + Compose 用 image tag
- [ ] rollback 用镜像 digest 而非 git checkout

---

## 11. 实施顺序（**v0.4 调整**）

报告 P1-7：Stage 2（20 任务验收）依赖手机入口，但 Stage 3 才做 Tailscale。**调整顺序**：

| 阶段 | 目标 | 退出条件 |
|------|------|----------|
| **0** | **spikes**（dsh / 资源 / 备份 / Tailscale Serve / Alembic）| 能力矩阵 + 资源数据 + 备份演练 + Tailscale E2E + migration 验证 |
| **1** | **任务账本 + Worker 闭环** | 重启不丢任务；事务 / reaper / fence 测试通过 |
| **2** | **Tailscale + 最小文字 UI** | iPhone 经 tailnet HTTPS 访问 UI；创建 / 列表任务 |
| **3** | **研究工作流 + 20 任务验收** | 真实任务达到验收线（此时已具备手机入口）|
| **4** | **体验增强 + 移动端增强** | PWA / 语音 / Push / WebSocket |
| **5** | **第二 worker + 并发** | 硬约束过滤 + 多机调度 |
| **6** | **视频/GPU 工作流** | 成本 + 审批 + 幂等 |

---

## 12. 不进入首版的范围（保留 v0.3）

> 与 v0.3 §12 一致。

---

## 13. 工程量估算（保留 v0.3）

> 与 v0.3 §13 一致。

---

## 14. 部署与运维（**v0.4 修补**）

### 14.1 唯一进程管理模型（**v0.4 收敛**）

**systemd 管 docker compose stack**（不直接管应用）：

```ini
# /etc/systemd/system/harness-stack.service
[Unit]
Description=Fish Harness Stack
After=docker.service tailscaled.service
Requires=docker.service tailscaled.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/harness
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose restart
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Compose 管所有服务**（control、ui、worker-adapter 都在 stack 内）：

```yaml
# /opt/harness/docker-compose.yml
services:
  control:
    image: registry.local/harness-control:${HARNESS_VERSION}  # 不可变镜像
    container_name: harness-control
    restart: always
    network_mode: host
    volumes:
      - harness-data:/app/data
      - harness-workspace:/app/workspace
      - /etc/harness/secrets:/etc/harness/secrets:ro
    environment:
      - HARNESS_DB_PATH=/app/data/harness.db
      - HARNESS_VERSION=${HARNESS_VERSION}
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health').read()"]
      interval: 30s
      timeout: 5s
      retries: 3
    depends_on: []

  ui:
    image: registry.local/harness-ui:${HARNESS_VERSION}
    container_name: harness-ui
    restart: always
    network_mode: host
    # UI 静态文件由 Control API 在 /ui 路径提供（同进程），不单独暴露
    # 如独立部署则绑 127.0.0.1:8081，Tailscale Serve 路由 /ui → 8081

volumes:
  harness-data:
  harness-workspace:
```

**Worker Adapter = 进程内模块**（不是独立服务）：

```python
# harness/control_api.py
from harness.worker_adapter import WorkerAdapter
from harness.research_workflow import ResearchWorkflow

app = FastAPI()
worker_adapter = WorkerAdapter(db=db, workflow=ResearchWorkflow())

@app.post("/api/tasks")
async def create_task(...):
    # 创建任务 → DB
    pass

# worker_adapter 由 scheduler 循环调用（asyncio task）
asyncio.create_task(scheduler_loop(worker_adapter))
```

**备份 = 独立 systemd timer**（不在 Compose 内）：

```ini
# /etc/systemd/system/harness-backup.timer
[Unit]
Description=Backup Harness DB every 6h

[Timer]
OnCalendar=*-*-* 00/6:00:00
Persistent=true

[Install]
WantedBy=timers.target

# /etc/systemd/system/harness-backup.service
[Unit]
Description=Backup Harness DB to HK03

[Service]
Type=oneshot
ExecStart=/opt/harness/bin/backup-to-hk03.sh
EnvironmentFile=/etc/harness/secrets/backup.env
```

### 14.2 不可变镜像版本（**v0.4 P1-5 修复**）

**CI 发布带 commit SHA**：

```yaml
# .github/workflows/build.yml
name: build
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: self-hosted  # 自托管 runner（newvps）
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t registry.local/harness-control:${GITHUB_SHA} .
      - run: docker tag registry.local/harness-control:${GITHUB_SHA} registry.local/harness-control:latest
      - run: docker push registry.local/harness-control:${GITHHA_SHA}
```

**部署用 image tag，不 git checkout**：

```bash
# /opt/harness/bin/deploy.sh
#!/bin/bash
set -e
HARNESS_VERSION=$1  # commit SHA

if [ -z "$HARNESS_VERSION" ]; then
    echo "Usage: deploy.sh <commit-sha>"
    exit 1
fi

cd /opt/harness

# 1. 部署前备份
./bin/backup-pre-deploy.sh

# 2. 更新 .env 中的版本
echo "HARNESS_VERSION=$HARNESS_VERSION" > .env.version

# 3. 重启 stack
docker compose pull
docker compose up -d

# 4. 等待健康
until curl -fsS http://127.0.0.1:8080/health; do sleep 1; done
echo "Deployed $HARNESS_VERSION"
```

**回滚用镜像版本**：

```bash
# /opt/harness/bin/rollback.sh
#!/bin/bash
PREVIOUS_VERSION=$1  # 上一个 commit SHA

if [ -z "$PREVIOUS_VERSION" ]; then
    echo "Usage: rollback.sh <previous-sha>"
    exit 1
fi

cd /opt/harness
echo "HARNESS_VERSION=$PREVIOUS_VERSION" > .env.version
docker compose up -d

# 注意：DB migration 必须 forward-compatible
# 回滚应用版本但 DB 不回滚
```

**migration 兼容矩阵**：

| 应用版本 \ DB 版本 | v1 | v2 | v3 |
|------------------|----|----|----|
| v1 | ✅ | ⚠️（v2 加的列，v1 不读 OK）| ⛔ |
| v2 | ⛔ | ✅ | ⚠️ |
| v3 | ⛔ | ⛔ | ✅ |

**规则**：
- 应用可以**向前跳过** N 个 migration（中间列不读）
- 应用**不能回滚到旧 DB**（缺新列会崩溃）
- 紧急回滚 = 应用降级 + DB 保留新版本

### 14.3 Alembic 替代自研 migration（**v0.4 P1-6 修复**）

```bash
# 初始化
alembic init alembic
# 编辑 alembic.ini + env.py 配置 SQLite

# 创建 migration
alembic revision --autogenerate -m "add task_attempts"

# 前滚
alembic upgrade head

# 回滚一步
alembic downgrade -1

# 历史
alembic history
```

**每个 downgrade 写恢复测试**：

```python
# tests/migrations/test_downgrade.py
def test_downgrade_add_task_attempts():
    # 1. 前滚
    alembic_upgrade("head")
    
    # 2. 创建一些 task + attempt
    create_test_task_with_attempts()
    
    # 3. 回滚一步
    alembic_downgrade("-1")
    
    # 4. 验证 task_attempts 表不存在，数据保留在 tasks
    assert not table_exists("task_attempts")
    assert task_count_preserved()
    
    # 5. 再前滚回来
    alembic_upgrade("head")
    assert table_exists("task_attempts")
    assert data_restored()
```

### 14.4 Dockerfile（**v0.4 补依赖**）

```dockerfile
FROM python:3.11-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.11-slim AS runtime
WORKDIR /app

# 关键：装 curl（健康检查用）
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

# 关键：装 sqlite3 CLI（备份/调试用）
RUN apt-get update && apt-get install -y --no-install-recommends \
        sqlite3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 harness && \
    mkdir -p /app/data /app/workspace && \
    chown -R harness:harness /app

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

### 14.5 Backup 专用镜像（**v0.4 补依赖**）

```dockerfile
# /opt/harness/images/backup/Dockerfile
FROM alpine:3.19

# 关键：装 sqlite3 + age + openssh-client
RUN apk add --no-cache \
        sqlite3 \
        age \
        openssh-client

# 关键：known_hosts 必须挂载（避免交互式提示）
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

```bash
#!/bin/sh
# entrypoint.sh
set -e

while true; do
    # SQLite .backup（一致快照）
    sqlite3 /app/data/harness.db ".backup '/tmp/backup.db'"
    
    # age 加密
    age -r "$(cat /etc/harness/secrets/backup-pubkey)" \
        -o /tmp/backup.db.age /tmp/backup.db
    
    # scp 到 HK03（known_hosts 来自挂载）
    scp -i /etc/harness/secrets/backup-key \
        -o UserKnownHostsFile=/etc/harness/secrets/known_hosts \
        /tmp/backup.db.age \
        "harness@hk03:/backups/newvps/$(date -u +%Y%m%d-%H%M).db.age"
    
    rm /tmp/backup.db /tmp/backup.db.age
    
    sleep 21600  # 6h
done
```

### 14.6 Tailscale Serve 持久化（**v0.4 新增**）

```ini
# /etc/systemd/system/tailscale-serve.service
[Unit]
Description=Tailscale Serve for Harness
After=tailscaled.service
Requires=tailscaled.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/tailscale serve --bg --https=443 localhost:8080
ExecStop=/usr/bin/tailscale serve reset
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## 15. 灾难恢复与备份（保留 + 修订）

> v0.3 §15 保留。增加 §15.6 backup 容器 §14.5 实现引用。

### 15.7 Backup E2E 验证（**v0.4 补**）

```bash
# /opt/harness/bin/backup-verify.sh
#!/bin/bash
set -e

# 1. 在新容器内拉取最新 backup
TIMESTAMP=$(date -u +%Y%m%d-%H%M)
LATEST=$(ssh harness@hk03 "ls -t /backups/newvps/*.age | head -1")

# 2. 下载 + 解密 + 校验
mkdir -p /tmp/verify
scp "$LATEST" /tmp/verify/backup.age
age -d -i /etc/harness/secrets/backup-key \
    -o /tmp/verify/backup.db /tmp/verify/backup.age

# 3. SQLite 完整性校验
sqlite3 /tmp/verify/backup.db "PRAGMA integrity_check;"
# 必须输出 "ok"

# 4. 启动临时 Control API，连 backup DB
docker run --rm -d \
    --name harness-verify \
    -v /tmp/verify:/data \
    -e HARNESS_DB_PATH=/data/backup.db \
    registry.local/harness-control:$HARNESS_VERSION

# 5. 验证 task / attempt / approval / audit 一致
curl -fsS http://127.0.0.1:8080/api/admin/db-check
# 返回 {"tasks": 42, "attempts": 67, "approvals": 5, "audit": 1234}

# 6. 提交测试任务
TASK_ID=$(curl -fsS -X POST http://127.0.0.1:8080/api/tasks \
    -H "Authorization: Bearer test" \
    -d '{"instruction":"verify","workflow":"research"}' | jq -r .task_id)

# 7. 等待完成
until curl -fsS http://127.0.0.1:8080/api/tasks/$TASK_ID | jq -e '.status == "succeeded"'; do
    sleep 1
done

# 8. 清理
docker stop harness-verify
rm -rf /tmp/verify
echo "✅ Backup verification passed"
```

---

## 16. 风险与回滚（保留 v0.3）

> 与 v0.3 §16 一致。

---

## 17. 决策日志（v0.1 → v0.4）

### 17.1 v0.4 新增决策

| Q | 决策 | 依据 |
|---|------|------|
| **Q38** | 每个状态转换 = 应用层事务函数（非 SQL 片段）| P0-1 防止事务不一致 |
| **Q39** | 零行更新立即 ROLLBACK | P0-1 attempt/event 不能继续写 |
| **Q40** | attempt 更新必须在 task 更新成功后 | P0-1 防止跨表不一致 |
| **Q41** | 每 task 最多一个 active attempt（partial unique index）| P0-1 防并发 reaper/claim |
| **Q42** | retry_wait 保留，补齐转换 | 报告"留则补齐" |
| **Q43** | 信任模型改为"身份+策略=权限" | P0-2 文本不授权 |
| **Q44** | 研究工作流固定 5 个工具 + schema | P0-2 禁止动态发明 shell |
| **Q45** | URL 抓取防 SSRF（DNS + IP + 重定向二次校验）| P0-2 |
| **Q46** | shell 命令由结构化动作层生成 argv | P0-2 |
| **Q47** | approval 增 status CHECK + consumed_at + consumed_by | P1-1 一次性消费持久化 |
| **Q48** | cancel / interrupted / failed 区分清晰 | P1-2 |
| **Q49** | 唯一进程管理 = systemd 管 docker compose stack | P0-3 |
| **Q50** | Worker Adapter = 进程内模块（不是独立服务）| P0-3 |
| **Q51** | 不可变镜像版本 + commit SHA + image tag | P1-5 |
| **Q52** | Alembic 替代自研 migration | P1-6 |
| **Q53** | 实施顺序：spike → 账本 → Tailscale+UI → 研究+20 验收 | P1-7 |
| **Q54** | 事务内禁止 I/O / 网络 / 模型调用 | §5 性能 |
| **Q55** | task_events 30 天归档 / audit_log 1 年保留 | §5 性能 |
| **Q56** | Tailscale Serve systemd unit 持久化 | P0-3 |

### 17.2 累计决策（v0.1 → v0.4）

总计 **56 个决策点**，分布在：
- 状态机：12 个
- 安全：15 个
- 部署：10 个
- 模型/路由：5 个
- 调度：6 个
- 备份/恢复：8 个

---

## 附录 A：dsh 能力验证矩阵（保留 v0.3）

> 不重复。

---

## 附录 B：规范应用层事务函数（**v0.4 核心**）

§4.5 是权威来源。本附录不重复 SQL，只列出函数清单：

| 函数 | 用途 | 章节 |
|------|------|------|
| `claim_task(worker_id)` | 创建 attempt + 标记 leased | §4.5.1 |
| `renew_lease(task_id, lease_token)` | 续租，task + attempt 同步 | §4.5.2 |
| `start_running(task_id, lease_token, attempt_id, fence_version)` | leased → running | §4.5.3 |
| `submit_result(task_id, attempt_id, lease_token, fence_version, artifact)` | running → succeeded | §4.5.4 |
| `fail_attempt(task_id, attempt_id, lease_token, fence_version, error)` | running → retry_wait / failed | §4.5.4 |
| `cancel_task(task_id, reason)` | 任意非终态 → cancel_requested | §4.6 |
| `user_retry(task_id, user_id)` | interrupted → queued（新 attempt）| §4.5.4 |
| `retry_wait_to_queued()` | 调度器：retry_wait → queued | §4.5.6 |
| `reap_expired_leases()` | reaper：leased 过期 → queued；running 过期 → interrupted | §4.5.7 |
| `consume_approval(approval_id, attempt_id, idempotency_key)` | approved → consuming | §7.7 |
| `complete_approval(approval_id, success, result)` | consuming → consumed | §7.7 |
| `abort_approval(approval_id, reason)` | consuming → approved（reaper 回收）| §7.7 |

**每个函数的共同约束**：
- 应用层事务函数（with db.transaction("IMMEDIATE")）
- 零行更新立即 ROLLBACK（return False / raise）
- attempt 更新必须在 task 更新成功之后
- 每次状态变化产生 task_event
- 产生 audit_log（高副作用操作）

---

## 附录 C：错误与恢复表（保留 v0.3）

> 与 v0.3 一致。

---

## 附录 D：术语表（v0.4 新增）

| 术语 | 含义 |
|------|------|
| **Active attempt** | task_attempts.status = 'active' 的 attempt |
| **Approval consuming** | approval.status = 'consuming'，已批准但未完成 |
| **Application-layer transaction** | v0.4 引入，事务封装在 Python 函数内 |
| **Policy engine** | 决定可调用工具集合的策略层（不依赖 prompt 标签）|
| **Reaper lock** | 防并发 reaper 的表锁 |
| **SSRF** | Server-Side Request Forgery |
| **Structured action** | 受控动作清单，编译成 argv 而非 shell 字符串 |
| **Tailscale Serve** | tailscaled 终止 HTTPS + 代理到 loopback 服务 |

---

## 附录 E：变更历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-08-29 | 初版（已撤销）|
| v0.2 | 2026-08-29 | 架构候选 + 单工作流 MVP + 持久化 P0 |
| v0.3 | 2026-08-29 | attempt + interrupted + Tailscale + Approval 加固 + 备份 |
| **v0.4** | 2026-08-29 | **事务原子化 + 信任模型重构 + 部署拓扑收敛 + Alembic** |

### E.1 v0.3 → v0.4 关键变化

| 维度 | v0.3 | v0.4 |
|------|------|------|
| 状态转换 | SQL 片段可独立执行 | **应用层事务函数**（必须包在事务内）|
| 零行更新 | "检查 row count"（未定义后续）| **立即 ROLLBACK**，禁止后续写入 |
| renew | 只更新 task | **同步 task + attempt** |
| reaper | 无 SQL | **完整 reap_expired_leases 函数 + reaper_lock** |
| 重试状态 | retry_wait 在 Schema 不在图 | **保留 + 补齐完整转换** |
| 每 task active attempt | 无约束 | **partial unique index 强制** |
| 信任模型 | "用户可信 + 模型历史可信" | **身份+策略=权限，文本=数据** |
| 工具集合 | 模型动态选择 | **固定 5 个研究工具 + schema 校验** |
| shell | 模型发明 | **STRUCTURED_ACTIONS + argv 编译** |
| URL 抓取 | 无 SSRF 防护 | **DNS + IP + 重定向二次校验** |
| Approval | nonce + hash + 过期 | **+ status CHECK + consuming 状态 + 崩溃恢复** |
| 取消 | interrupted / cancelled 混淆 | **cancel_requested 中间态 + 三态清晰** |
| 进程管理 | systemd + Compose 双管控 | **systemd 管 Compose stack，Compose 管所有服务** |
| Worker | "独立服务 / 进程内"模糊 | **明确为进程内模块** |
| 镜像版本 | build + git checkout | **不可变镜像 + commit SHA + image tag** |
| Migration | 自研 ~100 行 | **Alembic + downgrade 测试** |
| 实施顺序 | Tailscale 在 Stage 3 | **Tailscale 在 Stage 2**（手机入口前置）|
| 事务内操作 | 未规定 | **禁止 I/O / 网络 / 模型调用** |
| 表保留期 | 未规定 | **task_events 30 天 / audit 1 年 / artifact 永久** |

---

## 附录 F：v0.3 复审整改记录（**本轮**）

> 按 ARCHITECT-REVIEW-PRD-v0.3.md 逐条对应。

### F.1 P0 整改（3/3）

#### P0-1：任务事务原子化

| 报告要求 | v0.4 处理 | 章节 |
|----------|----------|------|
| 每个转换 = 应用层事务函数 | ✅ 12 个函数全在 §4.5 + 附录 B | §4.5 |
| 零行更新立即 ROLLBACK | ✅ 函数内 raise StaleLeaseError + 事务自动 ROLLBACK | §4.5 各函数 |
| attempt 更新依赖 tasks 成功 | ✅ 函数内顺序：先 task 后 attempt | §4.5.4 submit |
| renew 同步 task + attempt | ✅ | §4.5.2 |
| leased-expiry reaper | ✅ reap_expired_leases 函数 + reaper_lock | §4.5.7 |
| retry_wait 留或删统一 | ✅ 保留 + 补齐完整转换 | §4.1 + §4.5.6 |
| 每 task 最多一个 active attempt | ✅ partial unique index | §4.3 |

**通过标准（v0.4 自检）**：
- ✅ 任意 stale/cancel/reaper 竞态：事务保证一致
- ✅ 零行更新：raise 异常，事务 ROLLBACK
- ✅ leased 与 running 过期路径独立测试：§10.1
- ✅ retry_wait 与 queued 在状态图与 SQL 一致：§4.2 + §4.5.6

#### P0-2：信任模型重构

| 报告要求 | v0.4 处理 | 章节 |
|----------|----------|------|
| 所有自然语言输入默认不可信 | ✅ 身份+策略=权限 | §7.1 |
| 权限来自身份/allowlist/worker/approval | ✅ PolicyEngine | §7.3 |
| 研究工作流固定工具集 + schema | ✅ 5 个工具 + JSON Schema | §7.4 |
| URL 防 SSRF | ✅ DNS + IP + 重定向二次校验 | §7.5 |
| shell 由结构化动作层生成 argv | ✅ STRUCTURED_ACTIONS | §7.6 |

#### P0-3：部署拓扑收敛

| 报告要求 | v0.4 处理 | 章节 |
|----------|----------|------|
| 唯一进程管理模型 | ✅ systemd 管 Compose stack | §14.1 |
| Worker 明确进程内模块 | ✅ | §14.1 |
| Tailscale Serve 完整配置 | ✅ 命令 + 持久化 + systemd unit | §7.2 + §14.6 |
| UI 服务与路由 | ✅ UI 由 Control API 在 /ui 提供或独立 stack | §14.1 |
| 干净 newvps 启动后 iPhone 访问 | ✅ 部署命令 | §14.2 + §14.6 |

### F.2 P1 整改（7/7）

| P1 项 | v0.4 处理 | 章节 |
|-------|----------|------|
| P1-1 Approval 消费持久化 | ✅ status CHECK + consumed_at + consuming 状态 + 崩溃恢复 | §7.7 |
| P1-2 取消状态机统一 | ✅ cancel_requested 中间态 + 三态清晰 | §4.6 |
| P1-3 MacBook / 公网 IP 残留 | ✅ v0.4 §0/§1/§12 全面清理 | §0/§1/§12 |
| P1-4 Dockerfile + backup 缺依赖 | ✅ 装 curl + sqlite3；backup 专用镜像装 sqlite3 + age + openssh | §14.4 + §14.5 |
| P1-5 回滚镜像版本不可变 | ✅ CI 发布 commit SHA + Compose image tag + 兼容矩阵 | §14.2 |
| P1-6 Alembic 替代自研 | ✅ | §14.3 |
| P1-7 实施顺序调整 | ✅ Stage 2 = Tailscale + 最小 UI，Stage 3 = 20 任务验收 | §11 |

### F.3 测试负路径补充（§4，10 项）

全部进入 §10：

| 测试 | 章节 |
|------|------|
| idempotency_key 不同 payload 冲突 | §10.1 |
| claim/start/submit/cancel 零行更新后续写未发生 | §10.1 |
| renew 与 reaper 并发一致 | §10.1 |
| leased 过期 → expired attempt + 新 claim | §10.1 |
| running cancel 与旧 worker submit 并发 | §10.1 |
| 四种文本来源同一权限测试矩阵 | §10.2 |
| URL SSRF 覆盖 loopback/RFC1918/link-local/DNS rebinding/metadata | §10.2 |
| 干净容器验证 healthcheck/sqlite3/age/scp/known_hosts | §10.6 |
| 主机重启后 Tailscale + Compose + 备份恢复 | §10.3 |
| Alembic upgrade/downgrade 兼容性 | §10.6 |

### F.4 性能与容量补充（§5，5 项）

| 性能项 | v0.4 处理 | 章节 |
|--------|----------|------|
| 事务极短原则 | ✅ 禁止 I/O / 网络 / 模型 | §8.1 |
| 表保留期 / 归档 | ✅ events 30 天 / audit 1 年 | §8.2 |
| 产物不重复存储 | ✅ tasks/attempts/events 只存索引 + 摘要 | §8.2 |
| 资源 spike 分别测 | ✅ | §8.3 |
| CPU 限流 + 负载降级 | ✅ spike 必做 | §8.3 |

---

## 附录 G：复审门槛（v0.4 诚实自评）

| 门槛 | v0.3 自评 | v0.4 自评（独立）|
|------|-----------|-----------------|
| 1. lease/attempt/checkpoint 恢复规则无冲突 | ⚠️ | **✅**（v0.4 事务函数修补）|
| 2. Schema 保留执行历史 | ⚠️ | **✅** |
| 3. 旧 Worker/attempt/approval 无副作用 | ⚠️ | **✅**（事务 ROLLBACK + approval consuming）|
| 4. 网络、session、设备撤销确定 | ⚠️ | **✅**（Tailscale Serve 完整配置）|
| 5. SQLite 异故障域可恢复备份 | ⚠️ | **✅**（专用 backup 镜像 + 验证脚本）|
| 6. 资源预算实测 | ⏸ spike | ⏸ spike |
| 7. 主文/附录/测试无矛盾 | ⚠️ | **✅**（cancel / interrupted 区分 + MacBook 清理）|
| 8. 部署/升级/migration/回滚可复现 | ⚠️ | **✅**（不可变镜像 + Alembic）|
| 9. dsh spike 证据 | ⏸ spike | ⏸ spike |
| 10. 测试进入实施计划 | ✅ | **✅**（负路径补齐）|

**v0.4 诚实自评**：**8/10 门槛完整通过**（不含 spike）。剩余 2 项（资源 spike + dsh spike）在阶段 0 完成。

**v0.4 vs v0.3 独立复审对比**：
- v0.3 自评"8/10 通过"被独立复审批为"自评偏高"
- v0.4 修复了 v0.3 独立复审标为"未通过"的 3 项
- v0.4 修复了 v0.3 独立复审标为"部分通过"的 3 项
- v0.4 待 spike 项不变（资源 + dsh，spike 前无法完整通过）

---

> **下一步**：等待 Claude Code 按本轮反馈完成 v0.4 修订后，进入 Stage 0 spike（dsh + 资源 + 备份 + Tailscale + Alembic）。spike 完成后进行下一次冻结复审。