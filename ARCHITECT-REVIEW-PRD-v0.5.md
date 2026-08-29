# Fish Harness PRD v0.5 架构审验报告

> 审核对象：`PRD-v0.5.md`
> 审核日期：2026-08-29
> 审核范围：产品范围、Durable Kernel、状态机与事务、安全边界、WorkflowPack、Driver/Tool/Event/Artifact 扩展接口、Codex SDK/App Server 集成、部署与恢复
> 结论：**架构方向通过，实施规范不通过；允许继续 Stage 0 spike 与 PRD v0.6 修订，暂不允许按 v0.5 进入 Stage 1**

---

## 1. 执行摘要

v0.5 是目前为止方向最正确的一版。它不再把 Fish Harness 定义成单一研究工作流控制器，而是引入 Durable Kernel、WorkflowPack、ExecutionDriver、ToolProvider、ArtifactStore、PolicyDecisionPoint 和 EventSink，开始形成可以持续演进的 Agent Harness。

这次升级也符合 Codex 当前官方的开放 Harness 思路：产品拥有业务上下文、界面、记录、策略与审批，Codex 提供 agent loop、线程/回合生命周期、工具调用、沙箱和事件流。这个职责划分是对的。

但 v0.5 把“方向已经修正”误写成“实施闭环已经完成”。本轮独立验证发现六个冻结阻塞：

1. claim SQL 在 SQLite 3.51 上可复现语法错误，无法执行；
2. retry、cancel 和 reaper 状态机仍有未定义变量、无限重试和不可达转换；
3. PolicyEngine 的高风险审批判断正好反了，可让审批扩大原本禁止的权限；
4. approval 仍允许复用同一授权，且没有真正绑定消费 attempt；
5. EgressFetcher 的 HTTP/TLS 实现按原样无法工作，也没有可靠的超时和大小边界；
6. CodexSdkDriver 使用的包名、API 和事件协议不是官方 SDK 的实际契约。

因此应把 v0.5 定位为：

```text
产品与架构方向：通过
接口草案：部分通过
示例代码与执行契约：不通过
Stage 0：允许
Stage 1：阻塞
```

### 独立评分

| 维度 | v0.4 | v0.5 | 说明 |
|------|------|------|------|
| 产品价值 | 8/10 | **8.5/10** | 从单次研究扩展为长期数字分身闭环 |
| 架构方向 | 6.5/10 | **8/10** | Durable Kernel 与扩展边界正确 |
| 规范可执行性 | 6/10 | **4.5/10** | 新增样例中存在确定性运行错误 |
| 状态一致性 | 6/10 | **5/10** | attempt/reaper 改进，但 retry/cancel 未闭环 |
| 安全与权限 | 6.5/10 | **5/10** | 理念正确，Policy/Approval/SSRF 实现仍有 P0 |
| Codex 集成可信度 | 5/10 | **5/10** | 选型合理，API 骨架不是官方实际接口 |
| 开放性与扩展性 | 5/10 | **8/10** | 六个扩展面具备平台潜力 |
| MVP 可交付性 | 7/10 | **5.5/10** | 当前 MVP 已膨胀为 12 至 15 周的平台工程 |
| 可测试性 | 8/10 | **8/10** | 测试矩阵较全，但关键断言尚未对应真实契约 |
| 可运维性 | 7/10 | **6/10** | CI/备份方向正确，脚本仍不能直接运行 |

### 对 v0.5 自评的修正

v0.5 自评为“6/10 完整通过、2/10 部分、2/10 spike”。独立审验建议改为：

```text
3/10 完整通过
5/10 部分通过，需修订或契约测试
2/10 待 Stage 0 spike
```

---

## 2. v0.4 审验意见关闭情况

| v0.4 审验项 | v0.5 状态 | 独立判定 |
|-------------|-----------|----------|
| attempt_no 不可写死 | 改为 UPDATE RETURNING | **部分通过，SQL 语法错误** |
| retryable failure 不能等同 interrupted | 新增 failed_retryable | **部分通过，计数和上限仍缺失** |
| retry_wait 必须写 event | 已写 event | **通过，但批量事务描述不实** |
| reaper 三表一致 | 删除锁、逐任务事务 | **部分通过，cancel/状态过滤/审计值仍错** |
| approval 崩溃不得自动重试 | 新增 unknown/reconcile | **方向通过，消费复用仍不安全** |
| SSRF 必须 pinned IP + streaming | 手写 EgressFetcher | **不通过，代码按原样失效** |
| Policy 单向权限 | 已重写 | **不通过，最终分支逻辑反转** |
| canonical 自包含文档 | 声称完成 | **不通过，仍引用 v0.4 未重复章节** |
| 六个扩展接口 | 已定义 | **方向通过，生命周期契约需补** |
| Codex SDK 集成 | 已给骨架 | **不通过，非官方 API** |

“整改表有对应章节”不能等同于“问题关闭”。v0.6 应把关闭条件改成：规范代码可运行、契约测试通过、状态不变量可证明。

---

## 3. P0 冻结阻塞项

### P0-1：claim SQL 无法在标准 SQLite 语法下执行，retry 仍可能无限循环

**置信度：10/10**

#### 证据一：SQLite 可复现语法错误

`PRD-v0.5.md:369-378` 使用：

```sql
UPDATE tasks
SET attempt_count = attempt_count + 1,
    updated_at = ?
WHERE ...
ORDER BY created_at ASC
LIMIT 1
RETURNING task_id, attempt_count, fence_version
```

本轮使用系统 SQLite 3.51.0 对同形 SQL 做最小复现，得到：

```text
Error: in prepare, near "RETURNING": syntax error
```

SQLite 在启用 `UPDATE/DELETE LIMIT` 扩展时，`RETURNING` 的语法位置也不是文档当前写法；而 Python/系统 SQLite 是否编译该扩展不能作为产品假设。

#### 证据二：retry 仍使用未定义变量

`PRD-v0.5.md:452-457` 继续使用未定义的 `attempt_count`：

```python
backoff_ms = min(BACKOFF_BASE * (2 ** attempt_count), BACKOFF_MAX_MS)
```

同时该函数删除了 `MAX_ATTEMPTS` 判断。任何持续返回 retryable 的错误都可能无限进入 `retry_wait → queued → claim`，造成无限 token、API 和计算成本。

该函数还没有检查 attempt UPDATE 的 rowcount，并在 event 中使用未定义的 `worker_id`。

#### 必须修改

使用 `BEGIN IMMEDIATE` + 子查询选取 task，避免依赖可选的 UPDATE LIMIT 语法：

```sql
UPDATE tasks
SET attempt_count = attempt_count + 1,
    updated_at = :now
WHERE task_id = (
    SELECT task_id
    FROM tasks
    WHERE status = 'queued'
      AND (next_attempt_at IS NULL OR next_attempt_at <= :now)
      AND cancel_requested_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1
)
AND status = 'queued'
RETURNING task_id, attempt_count, fence_version;
```

并要求：

1. 从 `RETURNING` 的 attempt_count 计算退避；
2. `attempt_count >= max_attempts` 时进入 `failed`；
3. task、attempt、event 每一步都检查 rowcount；
4. actor 从函数参数或 attempt.worker_id 读取，不使用隐式全局变量；
5. 用 Fish Harness 实际 Docker Python/SQLite 版本运行语法契约测试。

#### 通过标准

- claim SQL 在目标 Python sqlite3 和部署镜像中执行成功；
- 连续 10 次 claim 的 attempt_no 单调递增；
- 达到 max attempts 后不再产生新 attempt；
- attempt 更新失败时 task/event 全部回滚。

### P0-2：cancel_requested 是不可达状态，Reaper 会误处理非 running 状态

**置信度：10/10**

#### 证据

`PRD-v0.5.md:724-726` 声称 queued、leased、running 都先进入 `cancel_requested`，再由 reaper 处理。

但 `reap_expired_leases()` 在 `PRD-v0.5.md:567-573` 只选择：

```sql
status IN ('leased', 'running')
```

因此：

- queued → cancel_requested 后没有 attempt，也不会被 lease reaper 选中；
- leased/running → cancel_requested 后不再满足 reaper 候选条件；
- 文档没有另一个 cancel reaper 或规范事务把它推进 cancelled。

`_reap_one()` 在 `PRD-v0.5.md:588-605` 读取当前 status 后，用“不是 leased 就当 running”的 else 分支。若状态已经变成 cancel_requested，可能被错误转为 interrupted。

此外：

- event 名拼写为 `lease_expired_requed`；
- event payload 的 `lease_expires_at_was` 实际写入 `now`，不是原 lease expiry；
- 注释声称校验“四元素”，实际没有校验 lease_token 和 fence_version。

#### 必须修改

把取消与 lease 回收分成两个显式服务：

```text
CancelService
queued  ───────────────→ cancelled
leased ─→ cancel_requested ─→ Driver interrupt/attempt cancel ─→ cancelled
running ─→ cancel_requested ─→ Driver interrupt/timeout ───────→ cancelled

LeaseReaper
leased expired  ─→ queued + attempt.expired
running expired ─→ interrupted + attempt.interrupted
```

每个转换必须定义：条件 WHERE、task/attempt 结果、event、超时、Driver interrupt 失败和重复调用语义。

#### 通过标准

- queued cancel 不依赖 lease reaper；
- cancel_requested 有唯一消费者和超时；
- reaper 只接受 leased/running，不存在 else 兜底误判；
- cancel、interrupt、submit、renew、reaper 两两竞态均有不变量测试。

### P0-3：PolicyEngine 把“高风险审批”和“最大权限”判断写反

**置信度：10/10**

#### 证据

`PRD-v0.5.md:1197-1213` 当前逻辑：

```python
if context.risk_level == "high":
    if requested_action not in max_permissions:
        return PolicyDecision(decision="needs_approval", reason="high risk")

if requested_action in max_permissions:
    return PolicyDecision(decision="allow", reason="in max permissions")
else:
    return PolicyDecision(decision="deny", reason="not in max permissions")
```

这会产生两个相反结果：

1. 不在最大权限内的高风险动作返回 `needs_approval`，允许 approval 扩大权限；
2. 已在最大权限内的高风险动作直接 `allow`，反而不要求审批。

它直接违反文档自己的原则：“approval 只能授权一个已在最大权限内的具体动作”。

#### 必须修改

判定顺序必须是：

```python
if requested_action not in max_permissions:
    return deny("outside maximum authority")

if requires_approval(requested_action, context):
    return needs_approval("allowed but consequential")

return allow("within authority and no approval required")
```

`PolicyDecision` 的所有返回还必须填入 `policy_version` 和 `constraints`，并把 matched rule IDs 写入审计事件。

#### 通过标准

- approval 永远不能把 deny 变成 allow；
- 高风险且有权限的动作进入 needs_approval；
- 低风险且有权限的动作才直接 allow；
- 四种 input source 只收紧，不改变最大权限上界。

### P0-4：Approval 仍可复用同一授权，消费并未绑定 attempt

**置信度：10/10**

#### 证据一：reconcile 可把同一 approval 重新变成 pending

`PRD-v0.5.md:899-922` 允许：

```text
unknown / consuming → pending
```

但它没有清理：

- consumed_at；
- consumed_by_attempt_id；
- idempotency_key；
- external_operation_id；
- timeout_at。

这既违反一次性消费，也和 UI 所写“创建新 attempt + 新 approval”矛盾。

#### 证据二：消费 SQL 没有绑定 approval.attempt_id

`consume_approval()` 的 WHERE 只校验 approval_id、status、expires_at 和 action_params_hash，没有校验：

```sql
attempt_id = :attempt_id
```

`PRD-v0.5.md:1992-1993` 的附录 D 声称“action_params_hash 绑定 attempt_id”，但 Schema 和 SQL 都没有实现该绑定。

#### 证据三：状态机缺少 reject/expire

新的 CHECK 移除了 rejected 和 expired，但产品仍需要用户拒绝、审批到期和撤销能力。`pending/approved` 过期也没有调度器。

#### 其他风险

- 固定 30 秒 timeout 不适合上传视频等长操作；
- `idempotency_key` 没有唯一约束或 provider scope；
- `external_operation_id` 没有在发起外部调用前后的持久化协议；
- 示例直接声称 YouTube 支持 provider key，没有可引用的供应方契约证据；
- 人工 reconcile 可直接处理仍在 consuming 的动作，可能与活跃 Worker 竞争。

#### 必须修改

1. 同一 approval 永远不能回到 pending/approved；
2. 重试必须创建新 approval，并通过 `supersedes_approval_id` 建立链；
3. approval 绑定 task_id + attempt_id + action + canonical params hash + actor + policy_version；
4. 恢复状态包含 rejected、expired、revoked；
5. timeout 由 action manifest/SLA 决定，长操作使用 heartbeat 或 queryable operation；
6. unknown 只能在外部查询或人工确认后进入 succeeded/failed_final；
7. 所有 UI reconcile 使用 status_version/ETag 防陈旧操作。

#### 通过标准

- 原 approval 不能被第二次 consume；
- 旧 attempt 不能消费新 attempt 的 approval；
- unknown retry 产生新 approval ID 和新 idempotency key；
- 外部调用前、中、成功后写库前 kill 进程均不会自动重复副作用。

### P0-5：EgressFetcher 的 HTTP/TLS 样例按原样无法工作

**置信度：10/10**

#### 已验证错误

`PRD-v0.5.md:1049` 使用：

```python
socket.getaddrinfo(hostname, parsed.port or 443, ...)
```

这让普通 `http://` URL 默认连接 443，而不是 80。

`PRD-v0.5.md:1066-1072` 使用：

```python
writer = await writer.start_tls(ctx, server_hostname=hostname)
```

本轮读取 Python `asyncio.StreamWriter.start_tls()` 的实际实现：它原地替换 transport，没有返回新的 writer。该赋值会把 `writer` 变成 `None`，下一行 `writer.write()` 立即失败。

#### 其他确定性缺口

- 没有 connect、header、body、total timeout；
- 手写 HTTP/1.1 未处理 chunked transfer、content-length、压缩和中间响应；
- `while len(content) < max_bytes` 在恰好读满 max_bytes 时不会再读第 N+1 字节，可能把超限响应静默截断为成功；
- 没有校验实际 connected peer；
- redirect 计数存在边界歧义；
- `_read_headers()` 没有规范；
- 4xx/5xx、畸形 header、慢速发送和半关闭连接没有错误模型。

#### 推荐修改

不要在 PRD 中发明一个不完整的 HTTP 客户端。优先级如下：

```text
A. 独立 Egress Proxy/Fetcher + 网络策略       推荐长期方案
B. 成熟 HTTP 栈 + 可测试的 pinned resolver    Stage 1 可接受
C. 手写 asyncio HTTP/1.1                      不建议
```

无论选 A/B，都必须提供：解析并固定地址、Host/SNI、peer 校验、有限重定向、凭据剥离、流式 max+1 检测、连接/读取/总超时和内容类型/解压后大小限制。

#### 通过标准

- http:80、https:443 和自定义端口均有真实服务测试；
- TLS hostname/certificate 校验真实生效；
- chunked、gzip bomb、slowloris、redirect loop 和 max+1 均失败可见；
- DNS/peer/redirect 审计信息完整且不包含 secret。

### P0-6：CodexSdkDriver 不是官方 SDK 的实际 API，主 Driver 选型尚未完成

**置信度：10/10**

#### 官方契约核对

当前官方 Python SDK 文档使用：

```python
from openai_codex import AsyncCodex, Codex, Sandbox

async with AsyncCodex() as codex:
    thread = await codex.thread_start(...)
    result = await thread.run(...)
```

官方还说明 `openai-codex` 是 stable release，发布包包含 pinned Codex CLI runtime。

而 `PRD-v0.5.md:1726-1813` 使用不存在于官方文档的：

```python
import codex_sdk
codex_sdk.start_thread(...)
codex_sdk.resume_thread(...)
codex_sdk.interrupt_thread(...)
codex_sdk.stream_thread(...)
codex_sdk.get_thread(...)
```

因此附录 A 不能标为“实现骨架”，只能标为待 spike 的伪代码。

#### 事件协议也混用了两套命名

- `codex exec --json` 使用 `thread.started`、`turn.started`、`item.*`；
- App Server JSON-RPC notification 使用 `thread/started`、`turn/started`、`item/completed`；
- PRD 的映射表和 approval event 名称没有标明协议来源。

直接混用会让 adapter 无法解析或重复映射事件。

#### 官方集成层建议

当前官方材料给出的边界是：

- `codex exec`：脚本、CI、一次性后台任务；
- Codex SDK：程序化 start/resume/stream 工作流；
- App Server：Agent 是产品组成部分，需要持久线程、事件、interrupt 和 approval handling；
- App Server 远程 WebSocket 仍是实验性且不支持生产，本地 stdio/Unix socket 可用于集成；
- `codex mcp-server` 当前官方页面明确标记 deprecated。

Fish Harness 同时需要持久线程、事件和 approval bridge，因此不能在 spike 前锁死“主 Driver 必然是 SDK”。应比较：

```text
CodexSdkDriver       简单自动化 API，能力以 stable SDK 实测为准
CodexAppServerDriver 深度生命周期控制，本地 stdio/Unix only
CodexExecDriver      bounded job/fallback，不承担深度 approval lifecycle
```

官方参考：

- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex MCP Server deprecation](https://learn.chatgpt.com/docs/mcp-server)
- [Codex as a platform: build on the open agent harness](https://learn.chatgpt.com/blog/codex-as-a-platform)

#### 必须修改

1. 附录 A 改成“伪代码 + 未验证 capability”；
2. Stage 0 从真实安装的 `openai-codex` 生成/读取类型与接口；
3. 每个 adapter 单独定义 source protocol 和 event decoder；
4. 用官方 app-server schema generation 锁定版本并生成契约；
5. DriverCapabilities 只能报告实测通过的能力；
6. 若 SDK 不暴露完整 approval/interrupt/stream，则使用本地 AppServerDriver，而不是虚构 API；
7. 禁止把本机 `codex-cli 0.149.0-alpha` 的实验命令当成长期生产契约。

#### 通过标准

- 用实际 SDK 包运行 start/run/resume；
- interrupt、stream、fork、approval 分别给出“支持/不支持/通过 app-server”结论；
- exec JSONL 和 app-server JSON-RPC decoder 完全隔离；
- runtime/schema 升级契约测试能检测 breaking change。

---

## 4. P1 高优先级问题

### P1-1：WorkflowPack 有静态 steps，但没有 durable workflow/step 生命周期

**置信度：9/10**

EventEnvelope 引入 `workflow_run_id`，但全文没有 `workflow_runs`、`step_runs` 或对应状态机。

当前无法回答：

- 一个 task 可有几个 workflow run；
- attempt 是整个 workflow 的一次执行，还是单个 step 的执行；
- 第 3 步失败后重试整条 workflow 还是只重试该 step；
- step output 如何原子绑定 artifact；
- pack 升级时运行中的 task 使用哪个版本；
- scheduler 重启后如何知道下一个可运行 step。

必须二选一：

```text
Stage 1 简化：每 task/attempt 只调用一次 Driver，steps 只是 Driver 输入计划
真正 Workflow Runtime：增加 workflow_run + step_run 持久化状态机
```

不要保留“看起来像 DAG、实际不可恢复”的中间形态。

### P1-2：EventSink 缺少来源序号、幂等键、因果关系和脱敏边界

**置信度：9/10**

测试要求处理事件重复、乱序和缺失，但 EventEnvelope 没有：

- source_event_id；
- source_sequence；
- causation_id / parent_event_id；
- dedupe_key；
- payload schema ID；
- ingestion timestamp。

Codex adapter 又直接把 `raw_event.to_dict()` 写入 payload。原始 command/tool event 可能包含路径、prompt、输出、环境片段或大块内容，造成 secret 泄露和 SQLite 膨胀。

建议事件只保存白名单元数据和 ArtifactRef，大内容进入 ArtifactStore；所有 payload 经过 schema validation、递归脱敏、大小限制和唯一去重约束。

### P1-3：WorkflowPack 锁定具体 driver_id，削弱了可替换执行器

**置信度：9/10**

`PRD-v0.5.md:1918-1921` 的 Research WorkflowPack 要求：

```python
[CapabilityRequirement.DRIVER, "codex_sdk"]
```

这让工作流直接绑定 CodexSdkDriver，与“可替换执行器”原则冲突。WorkflowPack 应声明能力，如 structured_output、streaming、sandbox_workspace_write、max_context，而不是具体 driver ID。

Driver 选择由 CapabilityRouter/Kernel 根据 capability、policy、budget 和 availability 决定。

### P1-4：ArtifactStore 的完整性、原子写入和异步边界未定义

**置信度：8/10**

当前 ArtifactStore 是同步接口，却运行在异步 FastAPI/Driver 流程中；正文存文件系统、DB 存 ref，但没有定义：

- 临时文件 → fsync → atomic rename → DB link 的顺序；
- 文件成功、DB 失败时的 orphan 清理；
- DB 成功、文件损坏时的校验；
- content_hash 唯一性和 dedup；
- 加密、权限、路径布局和 symlink 防护；
- sensitivity/visibility/retention 的枚举与强制执行。

SDK adapter 还把所有 artifact retention 硬编码为 permanent，违反按 task/policy 保留的设计。

### P1-5：retry_wait 调度器仍在一个 IMMEDIATE 事务中批量处理

**置信度：9/10**

`PRD-v0.5.md:510-543` 注释写“每个 task 独立更新”，实际却在一个 `BEGIN IMMEDIATE` 中 select 全部并循环更新。任务积压时会长时间占据 SQLite 单写锁。

应仿照修订后的 reaper：先有限批量读候选，再每 task 一个短事务，或使用一次有界 UPDATE RETURNING 后批量写结构化事件。

### P1-6：CI 与 Backup E2E 仍不能直接运行

**置信度：10/10**

CI 的 `docker push ghcr.io/...` 没有执行 GHCR login；部署要求签名校验，但 Workflow 没有签名步骤。

Backup 脚本仍有：

- 继续引用已经废弃的 `registry.local`；
- `HARNESS_VERSION` 与 digest/tag 规则不一致；
- 生成 TEST_TOKEN 但没有传给容器；
- `trap` 不删除 Docker network；
- `comm` 的第一组输入经过 shuf，未排序，不满足 comm 输入契约；
- 可以直接让 Docker 分配 ephemeral host port，却手写复杂端口扫描。

建议 CI 使用 `docker/login-action`、buildx、digest 输出和签名/attestation；恢复验证使用 `-p 127.0.0.1::8080` 后 inspect 实际端口，trap 清理 container/network/temp。

### P1-7：数据保留表与文字结论互相冲突

**置信度：10/10**

表格写 audit_log 保留 1 年，紧接着又写 audit_log 永久保留。tasks 永久、approvals 永久和“默认数据最小化”也没有形成一致规则。

“合规要求”没有对应法规、业务合同或用户需求，不能成为永久保留个人数据的依据。建议定义可配置 policy：默认期限、legal hold、用户删除、匿名化、archive backup 和删除审计。

### P1-8：v0.5 仍不是 canonical 自包含文档

**置信度：10/10**

文档声称“不再保留 v0.3/v0.4 章节”，但仍存在：

- `PRD-v0.5.md:1444-1446`：资源预算保留 v0.4，不重复；
- `PRD-v0.5.md:1599-1601`：不进入首版的范围与 v0.4 一致；
- `PRD-v0.5.md:1623-1637`：部署章节只引用修补；
- `PRD-v0.5.md:1651-1657`：灾难恢复继续引用 v0.4；
- `PRD-v0.5.md:1674-1676`：回滚方案与 v0.4 一致。

只要实施者还必须同时打开 v0.4，v0.5 就不是 canonical。v0.6 应完整合并当前有效规范，历史版本只用于审计。

### P1-9：可观测性与故障救援图缺失

**置信度：9/10**

新的 Durable Kernel/Driver/Workflow/Event 架构没有定义首日指标、告警和 runbook。至少需要：

- queue age / queued count；
- lease expired / transition conflict；
- retry count / max-attempt failure；
- approval unknown age；
- driver start/resume/interrupt error；
- event ingest lag / duplicate / schema reject；
- token/cost/runtime budget；
- artifact write/orphan/hash mismatch；
- backup age / restore verification age；
- SQLite lock wait / WAL size / disk free。

每个异常需要名字、捕获位置、用户可见状态、重试策略和告警阈值。

### P1-10：主张“数据库是唯一事实来源”过强

**置信度：8/10**

Codex thread、外部 operation、artifact 文件和供应方记录都存在数据库之外。SQLite 可以是“编排状态的权威来源”，但不能成为所有事实的唯一来源。

建议写成：

```text
SQLite 是 Harness orchestration state 的 authority。
外部系统状态通过 ExternalRunRef/operation ID/artifact hash 对账。
无法确认时进入 unknown，不伪造本地确定性。
```

---

## 5. 产品与范围审验

### 5.1 v0.5 出现了平台先行风险

MVP 用户结果仍然是：“手机派一个研究任务，一小时内看到报告”。但当前 MVP 同时要求：

- 六个扩展接口；
- CodexSdkDriver；
- Workflow runtime；
- 5 个 ToolProvider；
- typed ArtifactStore；
- versioned EventSink；
- schema-driven UI；
- approval reconcile UI；
- EgressFetcher；
- CI、签名镜像、备份和迁移。

工程估算已经达到 12 至 15 周。这不是最小产品，而是平台 v1。

平台方向应保留，但实现应按真实需求激活，避免在还没有第二个 workflow/driver/tool 时把所有抽象做成通用框架。

### 5.2 三种实施路径

| 方案 | 内容 | 风险 | 评价 |
|------|------|------|------|
| A. Thin Research Slice | task/attempt/event + 一个真实 Codex adapter + Research pack + artifact + Tailscale；只读、不做外部写 | 未来需逐步抽接口 | 最快验证用户价值 |
| B. Extensible Core | 六个接口先定契约，但 Stage 1 只实现被 Research 使用的最小子集；第二实现出现时再泛化 | 需要严格防止接口过早固化 | **推荐** |
| C. Full Platform First | 按 v0.5 当前 MVP 一次实现全部通用机制 | 周期长、验证晚、错误面大 | 不推荐 |

推荐 B，但应增加一条架构纪律：

```text
接口现在定义，registry/marketplace/router/runtime 只在第二个真实实现出现时建设。
```

### 5.3 推荐重新划分里程碑

#### M0：Integration Proof

- 运行真实 openai-codex 和本地 app-server；
- 决定 SDK/AppServer/exec 的能力矩阵；
- 固化一个真实事件 decoder；
- 验证 interrupt、resume、approval 和崩溃恢复；
- 修正 SQLite/SSRF/Policy 的 P0。

#### M1：Read-only Research MVP

- task/attempt/event；
- 一个 Driver；
- 一个 Research WorkflowPack；
- read-only ToolProvider；
- ArtifactStore 最小实现；
- Tailscale UI；
- 不启用外部 write side effect。

#### M2：Durable Control Plane

- approval/reconcile；
- external write tools；
- observability/runbooks；
- backup/restore；
- policy/version/event hardening。

#### M3：证明扩展性

- 增加第二个 WorkflowPack 或 Driver；
- 只有在此时才验收“kernel 零修改”；
- 根据真实差异调整接口，而不是靠 mock 证明抽象正确。

### 5.4 对“扩展性测试”的修正

`assert kernel_supports(mock)` 和 grep “没有 tool_id if/else”不能证明扩展性。真正验收应是：

1. 在独立 package 中实现第二 WorkflowPack；
2. 不修改 kernel 即通过 conformance suite；
3. 安装/注册后自动生成 UI 和 policy preview；
4. 卸载后不破坏历史 task replay；
5. pack/driver 升级有兼容失败和迁移测试。

Mock 和 grep 可保留为快速测试，但不能作为架构通过证据。

---

## 6. 扩展接口改进建议

### 6.1 ExecutionDriver

补充以下契约：

- start/resume 的幂等键；
- interrupt 是请求已接受还是执行已停止；
- terminal result 与事件流的唯一完成信号；
- event cursor/replay；
- source protocol 与 schema version；
- driver crash/reconnect；
- capability negotiation；
- 同一 ExternalRunRef 是否允许换 Driver。

明确禁止在同一 external thread 中跨 Driver resume。fallback 只能从新 attempt 开始，并记录 lineage。

### 6.2 WorkflowPack

补充：

- pack ID/version/schema hash 在 task 创建时固定；
- input/output schema 的 strict validation；
- step graph cycle/missing-output validation；
- step retry/cancel/timeout；
- pack 升级与运行中实例兼容；
- eval fixtures 与最低质量门槛；
- capability requirement 只描述能力，不绑定实现 ID。

### 6.3 ToolProvider

工具输出不要把 10MB content 直接放进 JSON。`web.fetch` 应返回 ArtifactRef + metadata：

```json
{
  "artifact_id": "...",
  "content_hash": "...",
  "media_type": "text/html",
  "bytes": 12345,
  "source_url": "..."
}
```

manifest 再增加：schema_version、egress policy、data classification、rate limit、cost hint、redaction policy 和 health probe。

### 6.4 ArtifactStore

使用 content-addressed blob + metadata record：

```text
write temp → fsync → hash verify → atomic rename → DB metadata/link
                                    │
                                    └─ orphan sweeper / integrity scan
```

大内容、原始 driver payload 和 tool output 均通过 ArtifactStore，不进入 task_events。

### 6.5 PolicyDecisionPoint

Policy 决策输入需增加：tenant/project、task owner、workflow version、tool manifest version、approval history、budget state。输出增加 matched_rules、decision_id 和 expires_at，确保执行时能验证“这是同一个决定”。

### 6.6 EventSink

建议 envelope 增加：

```text
source_protocol
source_event_id
source_sequence
ingested_at
causation_id
correlation_id
payload_schema
dedupe_key
redaction_version
```

EventSink 是扩展性最重要的接口之一，但不要走完整 Event Sourcing。tasks/attempts 仍是当前状态投影，events 服务于审计、UI、重放和集成。

---

## 7. 测试与验证补充

### 7.1 规范代码编译/执行测试

PRD 中所有声称“实现骨架”的 Python、SQL、YAML 和 shell 都必须进入 `examples/` 或 `spikes/`，由 CI 实际执行。不能继续让伪代码看起来像可复制实现。

最低要求：

- SQLite schema + transition SQL integration test；
- Python snippets import/compile；
- Docker/Compose config validation；
- GitHub Actions lint；
- shellcheck；
- generated app-server schema compatibility test。

### 7.2 状态不变量

```text
I1: 一个 task 最多一个 active attempt
I2: task.current_attempt_id 非空时指向 active attempt
I3: terminal task 不持有 lease
I4: succeeded task 对应唯一 succeeded attempt
I5: retry_wait 对应最近 failed_retryable attempt
I6: cancelled task 不再接受 submit/renew
I7: approval 只能消费一次
I8: deny 永远不能被 approval 扩权
I9: event source ID 在同一 driver/protocol 内唯一
I10: artifact hash 与正文一致
```

为每条不变量做数据库 property test 和故障注入。

### 7.3 Codex adapter conformance suite

同一套测试运行在 CodexSdkDriver、CodexAppServerDriver 和 CodexExecDriver：

- start；
- resume；
- event ordering/replay；
- structured output；
- interrupt；
- approval pause/resume；
- process crash；
- runtime upgrade；
- malformed/unknown event；
- sandbox escalation rejection。

不支持的能力必须显式返回 capability false 或 `UnsupportedCapability`，不能静默降级。

### 7.4 安全与混沌测试

- policy deny + approval 绕过；
- stale approval/ETag；
- Driver 事件包含 secret/超大 payload；
- EgressFetcher DNS/peer/redirect/timeout/zip bomb；
- artifact symlink/swap/orphan；
- SQLite lock contention/WAL/disk full；
- kill -9 在每个跨系统写入点；
- backup 成功但 restore 失败；
- GHCR/digest/signature 不匹配。

---

## 8. 给 Claude Code 的 v0.6 修改清单

### 必须修复后才能进入 Stage 1

- [ ] 重写 claim SQL，删除无效的 UPDATE LIMIT RETURNING 顺序；
- [ ] `fail_attempt` 从 DB 读取 attempt_count，恢复 MAX_ATTEMPTS；
- [ ] 检查 attempt/event rowcount，删除未定义 worker_id；
- [ ] 单独定义 CancelService，不让 lease reaper 处理 cancel_requested；
- [ ] 修正 reaper status filter、event typo 和旧 lease 审计值；
- [ ] 修正 PolicyEngine 判定顺序，禁止 approval 扩权；
- [ ] approval 增加 rejected/expired/revoked；
- [ ] approval 永不回 pending，重试创建 superseding approval；
- [ ] consume SQL 绑定 attempt_id、actor、policy_version 和 canonical params hash；
- [ ] timeout 改为 action-specific，长操作用 heartbeat/query；
- [ ] 删除手写不完整 HTTP 客户端，采用可验证的 egress 实现；
- [ ] 修复 HTTP 默认端口、TLS、timeout、max+1、chunked/gzip；
- [ ] Codex 附录改用真实 `openai_codex` API 或明确标为伪代码；
- [ ] 分离 exec JSONL 与 app-server JSON-RPC event decoder；
- [ ] Stage 0 后再决定 SDK 或本地 App Server 为主 Driver；
- [ ] 补 workflow_run/step_run，或明确 Stage 1 每 task 单 Driver run；
- [ ] EventEnvelope 增加 source ID/sequence/dedupe/causation/redaction；
- [ ] WorkflowPack capability 不绑定 `codex_sdk` ID；
- [ ] 合并所有 v0.4 引用，形成真正自包含 v0.6。

### 高优先级修复

- [ ] ArtifactStore 定义 atomic write、integrity、orphan 和 async 契约；
- [ ] retry scheduler 改为逐 task 短事务；
- [ ] CI 增加 GHCR login、digest、signature/attestation；
- [ ] Backup E2E 统一 GHCR image ref、token 注入、ephemeral port 和完整 trap；
- [ ] 统一 audit/approval/task retention 及用户删除规则；
- [ ] 增加 metrics、alerts、dashboard 和 runbooks；
- [ ] 把 PRD 可执行样例放进 CI 验证；
- [ ] 用真实第二 pack/driver 验收扩展性，而不只依赖 mock/grep。

### 建议调整范围

- [ ] Stage 1 收敛为 read-only research MVP；
- [ ] 外部 write + approval reconcile 延至 M2；
- [ ] schema-driven 通用 UI、CapabilityRouter、catalog 延至第二真实实现；
- [ ] 保留六个接口，但只实现 Research 当前使用的最小能力；
- [ ] 明确 v0.6 是产品 PRD、架构规格还是可执行实施规范，避免三者混写。

---

## 9. 最终审验结论

### 判定

**架构方向通过，实施规范不通过。**

v0.5 已经找到 Fish Harness 值得长期坚持的主轴：应用拥有业务状态、策略、审批、制品和用户界面，Codex 提供可替换的 agent execution layer。六个扩展接口也足以支撑后续连续情报、branch-and-judge、schema-driven UI、能力路由和 Workflow Catalog。

但本轮复现证明，当前文档还不能作为可复制的实施基线。多个标为“P0 已修复”的代码仍会在第一条真实请求上失败，或在高风险动作上给出相反的授权结果。

### 允许继续

- PRD v0.6 修订；
- SQLite transition spike；
- Codex SDK/App Server/exec capability spike；
- EgressFetcher 技术选型与真实网络测试；
- Policy/Approval 状态机原型；
- 六个接口的 conformance contract。

### 暂不允许

- 按附录 A 直接实现 CodexSdkDriver；
- 启用 external write ToolProvider；
- 把 approval reconcile 作为已完成能力；
- 按当前手写 EgressFetcher 上线；
- 按当前 CI/backup shell 部署；
- 以“P0/P1 全部关闭”进入 Stage 1。

### 进入 Stage 1 的硬门槛

```text
1. PRD 中所有 executable example 进入 CI 并通过
2. 六个 P0 全部有复现测试和修复证据
3. SDK/AppServer/exec 能力矩阵由真实 runtime 产生
4. read-only research vertical slice 从手机到 artifact 跑通
5. kill/restart 后 task/attempt/event/driver ref 可恢复
6. backup 在隔离环境真实 restore 成功
7. deny 无法被 approval 扩权
8. EgressFetcher 通过网络安全测试集
```

建议继续选择 **Extensible Core**，但把“开放性”放在稳定契约和真实 conformance 上，而不是在 MVP 阶段一次性实现所有平台组件。这样既保留数字分身的长期创新空间，也能更早验证用户是否真的愿意持续从手机派发研究任务并使用结果。
