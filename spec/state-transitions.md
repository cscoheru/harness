# Kernel State Transitions

> **File**: `spec/state-transitions.md`
> **Version**: v0.7
> **Owner**: Kernel
> **Status**: Stage gate spec. CI runs `spikes/m0/claim-fence-test.py` and
> `spikes/m0/cancel-race-test.py` to verify these transitions.

---

## 1. 原子转换（Atomic Transitions）

每个转换由**单一** `BEGIN IMMEDIATE` 事务包装。事务结束后，状态在所有读取路径下都立即可见。

### 1.1 `claim(task_id, worker_id) → attempt_id`

**前置**：
- `task.status IN ('pending', 'failed')`（失败任务可被 reclaim）
- 当前 task 没有 active attempt
- `attempt_no = MAX(attempt_id) + 1` for this task

**事务体**：

```sql
BEGIN IMMEDIATE;
SELECT fence_version FROM tasks WHERE task_id = ? AND status IN ('pending','failed');
-- fence_version 是 task 当前 fence + 1（Q107：单一来源）
INSERT INTO task_attempts (task_id, attempt_id, fence_version, status, worker_id, lease_token, lease_expires_at, driver_kind)
VALUES (?, ?, ?, 'claimed', ?, ?, ?, ?);
UPDATE tasks SET status='claimed', fence_version = fence_version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE task_id = ?;
COMMIT;
```

**失败模式**：
- 别的 worker 先 claim → unique partial index `idx_attempts_one_active` 抛 `SQLITE_CONSTRAINT`
- 任务已 canceled/terminal → `task_terminal_lock` 触发器拒绝
- fence 不匹配 → `trg_attempt_fence_insert` 触发器拒绝

### 1.2 `heartbeat(attempt_id, worker_id, lease_token)`

**前置**：
- `attempt.status IN ('claimed', 'running')`
- `attempt.worker_id == worker_id` 且 `attempt.lease_token == lease_token`

**事务体**：

```sql
UPDATE task_attempts SET lease_expires_at = ? WHERE attempt_id = ? AND lease_token = ?;
```

**invariant**: 单行 update 影响行数 = 1。

### 1.3 `fail(attempt_id, failure_code, failure_message)`

**前置**：
- attempt 仍属于当前 worker（lease_token 匹配）
- task 未进入 terminal

**事务体**：

```sql
BEGIN IMMEDIATE;
UPDATE task_attempts SET status='failed', finished_at=?, failure_code=?, failure_message=?
 WHERE attempt_id = ? AND lease_token = ?;
UPDATE tasks SET status='failed', updated_at=?, terminal_at=?, terminal_reason=?
 WHERE task_id = (SELECT task_id FROM task_attempts WHERE attempt_id = ?);
INSERT INTO task_events (event_id, task_id, attempt_id, event_type, payload_json) VALUES (...);
COMMIT;
```

**注意**：v0.6 报告 P0-7 bug 是把 status update 漏掉了——本 spec 显式要求两条 UPDATE 都执行。

### 1.4 `cancel_request(task_id, actor, reason)`

**前置**：
- task 处于 non-terminal

**事务体**（完整三段，v0.6 P0-3 bug 是缺 status update）：

```sql
BEGIN IMMEDIATE;
-- 段 1: 写 cancel_requested status + timestamp
UPDATE tasks SET status='cancel_requested', cancel_requested_at=?, updated_at=?
 WHERE task_id = ? AND status NOT IN ('succeeded','failed','canceled','abandoned');
-- 段 2: 同步 attempt 状态（如果存在 active attempt）
UPDATE task_attempts SET status='cancel_requested'
 WHERE task_id = ? AND status IN ('claimed','running');
-- 段 3: 记录 audit
INSERT INTO audit_log (task_id, actor, action, target, decision, reason) VALUES (?, ?, 'cancel', ?, 'allow', ?);
COMMIT;
```

### 1.5 `finalize_cancel(task_id, attempt_id, worker_id, lease_token, fence_version, status_version)`

**前置**：
- `attempt.status == 'cancel_requested'`
- 所有认证元数据匹配 worker + lease + fence + status_version（v0.6 P0-3 bug 是漏绑定这些参数）

**事务体**：

```sql
BEGIN IMMEDIATE;
UPDATE task_attempts SET status='canceled', finished_at=?
 WHERE attempt_id=? AND worker_id=? AND lease_token=? AND fence_version=? AND status_version=?;
UPDATE tasks SET status='canceled', terminal_at=?, terminal_reason='canceled'
 WHERE task_id=? AND fence_version=?;
COMMIT;
```

### 1.6 `reap_expired_attempts()`

**触发条件**：周期性 task（每 5s）由 reaper worker 调用。

**事务体**：

```sql
BEGIN IMMEDIATE;
UPDATE task_attempts SET status='expired', finished_at=?
 WHERE status IN ('claimed','running') AND lease_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now');
-- 这些 attempts 进入 failed（因为 lease 失效）
INSERT INTO attempts_failed SELECT task_id, attempt_id, 'lease_lost', 'reaped' FROM task_attempts WHERE status='expired';
COMMIT;
```

### 1.7 `supersede_approval(old_approval_id, new_attempt_id, new_policy_decision_id)`

**前置**（v0.6 P0-M2 修复）：
- `old_approval.status == 'unknown'`（**必须**，不允许从其他 status supersede）
- `new_attempt_id != old.attempt_id`（强制新 attempt）
- `new_policy_decision_id != old.policy_decision_id`（强制重跑 PolicyDecision）

**事务体**：

```sql
BEGIN IMMEDIATE;
SELECT attempt_id, policy_decision_id, status FROM approvals WHERE approval_id = ?;
-- 校验: status='unknown', attempt_id != new, policy_decision_id != new
INSERT INTO approvals (approval_id, task_id, attempt_id, policy_decision_id, status, supersedes_approval_id)
VALUES (?, ?, ?, ?, 'pending', ?);
COMMIT;
```

### 1.8 `submit_artifact(task_id, attempt_id, artifact_id, role)`

**前置**：
- attempt active
- 通过 ToolInvocationGateway（不允许绕过）

**事务体**：

```sql
BEGIN IMMEDIATE;
INSERT INTO task_links (task_id, artifact_id, role) VALUES (?, ?, ?);
INSERT INTO task_events (event_id, task_id, attempt_id, event_type, payload_json) VALUES (?,?,?, 'artifact.submitted', ?);
COMMIT;
```

---

## 2. 不变量（Invariants）

| ID | 内容 | 强制方式 |
|----|------|----------|
| **I1** | task.fence_version 与最新 active attempt 一致 | trigger `trg_attempt_fence_insert` + `trg_task_fence_bump` |
| **I2** | 任一 task 至多一个 active attempt | partial unique index `idx_attempts_one_active` |
| **I3** | 终态 task 不可回到非终态 | trigger `trg_task_terminal_lock` |
| **I4** | 单调递增 fence_version | trigger + Python 代码双重防御 |
| **I5** | cancel_requested 状态可由 worker 观察到，且不可被本地"假装完成" | `tasks.status` 真值检查 |
| **I6** | 每个 attempt 的 lease_token 唯一且不可预测 | UUIDv7 / secrets.token_urlsafe(32) |
| **I7** | policy decision 必须先于 execution attempt 持久化 | 代码顺序 + audit_log |
| **I8** | approval 必须 reference 一个 attempt + policy_decision | FK 约束 |
| **I9** | supersede chain 中 old 必须 status='unknown' | 显式校验（v0.6 P0-M2 修复） |
| **I10** | 任何绕过 ToolInvocationGateway 的 tool 调用必须被拒绝 | gateway 单点 + 审计日志 |

---

## 3. Race 矩阵（CI 必须覆盖）

| OpA | OpB | 期望结果 | 验证文件 |
|-----|----|----------|----------|
| claim | claim (同 task) | 一个成功、一个 SQLITE_CONSTRAINT | `claim-fence-test.py` |
| claim | reaper | reaper 已过期 attempt 不阻塞新 claim | `cancel-race-test.py` |
| heartbeat | reaper | 最后一次写入决定生死 | `cancel-race-test.py` |
| cancel | renew | cancel 优先；renew 之后必失败 | `cancel-race-test.py` |
| cancel | submit | submit 拒绝（attempt 已 cancel_requested）| `cancel-race-test.py` |
| cancel | interrupt-ack | interrupt-ack 仍然 finish 写终态 | `cancel-race-test.py` |
| supersede | supersede | 第二次必须因 status != unknown 失败 | `approval-supersede-test.py` |
| policy.deny | approval.requested | deny 不能被 approval 扩权 | `policy-direction-test.py` |

---

## 4. 不可接受的 v0.6 模式

**v0.6 报告缺陷集中区**（spec 层必须明确禁止）：

- ❌ `fence_version = 1` 硬编码 → 必须从 `task.fence_version + 1` 派生
- ❌ `cancel_requested` 仅写 timestamp 不写 status → 必须双写
- ❌ `finalize_cancel` 不绑定 `current_attempt_id/lease_token/fence_version/status_version` → 必须全部绑定
- ❌ `supersede_approval` 复用 old attempt_id/policy_decision_id → 必须新建
- ❌ `httpx.AsyncResolver`（不存在）→ 必须用 `getaddrinfo` 替代
- ❌ `trap cleanup` 在 cleanup 函数定义之前 → spec 不涉及 shell，但 ADR 中明令禁止
- ❌ "宣称已修复"但无 executable evidence → spec 必须把测试文件名列入