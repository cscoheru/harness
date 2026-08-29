# Fish Harness PRD v0.4 架构复审报告

> 审核对象：`PRD-v0.4.md`
> 审核日期：2026-08-29
> 审核范围：架构、事务一致性、安全边界、部署与恢复、开放性、扩展性、Codex Harness/SDK 集成路径
> 结论：**有条件不通过；允许继续 Stage 0 spike 与 PRD v0.5 修订，暂不建议冻结为正式实施基线**

---

## 1. 执行摘要

v0.4 对 v0.3 审核意见做出了实质修订，特别是将零散 SQL 收拢为应用层事务函数、明确自然语言不授予权限、补充 Tailscale Serve、不可变镜像、备份验证和 Alembic 迁移章节。总体方向已经从“概念性架构”进入“接近可实施规范”。

但 v0.4 的示例代码和运维流程仍存在四类冻结阻塞：

1. 重试 attempt 编号、失败状态和 reaper 更新仍会破坏 task/attempt/event 一致性；
2. approval 崩溃恢复可能重复执行发布、发送等真实世界副作用；
3. SSRF、路径约束与 PolicyEngine 仍存在可绕过或自相矛盾的安全边界；
4. CI、Compose、迁移和备份验证脚本按当前文档无法可靠复现。

更重要的是，当前 PRD 仍将“研究工作流 + dsh subprocess”写成产品内核。这可以交付一次研究任务，但不足以支撑“数字分身”后续的持续观察、提议、审批、行动、评价和学习闭环。

本报告建议采用 **选择性扩展（Selective Expansion）**：

- v0.5 先修复四个 P0；
- 同时定义六个稳定扩展接口；
- Stage 1 只实现一个 Research WorkflowPack 和一个 CodexSdkDriver；
- 多 Agent、插件市场、分布式 Worker 和开放第三方生态继续留在后续阶段。

### 复审评分

| 维度 | v0.3 | v0.4 | 说明 |
|------|------|------|------|
| 产品价值 | 8/10 | **8/10** | 研究工作流仍是合理切入口 |
| 技术可行性 | 7.5/10 | **7/10** | 事务函数更完整，但新增示例含确定性错误 |
| MVP 可交付性 | 7/10 | **7/10** | 拓扑更清晰，CI/备份/迁移仍不可直接执行 |
| 安全与权限 | 7/10 | **6.5/10** | 信任原则正确，SSRF 与 approval 恢复仍是 P0 |
| 可测试性 | 8/10 | **8/10** | 测试矩阵较好，缺少关键契约与故障注入断言 |
| 可运维性 | 6.5/10 | **7/10** | 增加恢复路径，但验证脚本会误测生产实例 |
| 开放性与扩展性 | 4/10 | **5/10** | 仍以硬编码工作流、工具集和 subprocess 为中心 |

---

## 2. v0.4 已正确关闭的方向性问题

以下决策建议保留：

- 使用 task、attempt、lease token、fence version 四层身份校验；
- 把状态转换封装为事务函数，而不是让调用者直接拼接 SQL；
- 将所有自然语言视为数据，权限由服务端 policy 决定；
- 模型只选择结构化动作，不直接生成 shell 字符串；
- MVP 只通过 Tailscale 暴露控制面；
- Worker Adapter 在 MVP 内保持单进程，降低部署复杂度；
- 应用镜像使用 commit SHA，而不是以 git checkout 作为生产回滚机制；
- 备份目标位于异故障域，并要求定期恢复验证；
- 资源预算和 dsh 能力继续标记为 Stage 0 spike，不虚构数据。

这些方向无需在 v0.5 中重新讨论，修订重点应放在闭环正确性和扩展接口。

---

## 3. P0 冻结阻塞项

### P0-1：重试 attempt 创建逻辑第一次重试即违反唯一约束

**置信度：10/10**

#### 证据

`PRD-v0.4.md:203-210` 固定写入：

```sql
VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'active')
```

而 `task_attempts` 已定义 `UNIQUE(task_id, attempt_no)`。因此同一 task 的第二次 claim 会再次尝试创建 `attempt_no = 1`，直接触发唯一约束错误。

同时，`fail_attempt()` 在 `PRD-v0.4.md:384-388` 使用了未定义的 `attempt_count`；可重试失败又被写成 attempt `interrupted`，把“执行失败”和“Worker 丢失”混成同一语义。

#### 必须修改

1. 在 claim 的同一事务中原子计算下一 attempt 编号；
2. attempt 编号必须来自数据库状态，不得由进程内计数推测；
3. 为 attempt 增加明确终态：`failed_retryable` 或统一使用 `failed` + `retryable` 字段；
4. `interrupted` 只用于 Worker 失联、进程终止或系统中断；
5. claim、fail、retry 三条路径都要校验 task、attempt、event 的受影响行数。

推荐流程：

```text
task.attempt_count = N
        │ BEGIN IMMEDIATE
        ├─ UPDATE task attempt_count = N + 1 WHERE attempt_count = N
        ├─ INSERT attempt(attempt_no = N + 1)
        ├─ UPDATE task current_attempt_id = ...
        └─ INSERT event
          任一步不满足 rowcount == 1 → ROLLBACK
```

#### 通过标准

- 同一 task 连续失败并重试 10 次，attempt_no 单调递增且无重复；
- 可重试失败、不可重试失败和 Worker 失联产生不同的 attempt 语义；
- `retry_wait → queued` 也写入 task event。

### P0-2：Reaper 仍可能产生 task/attempt/event 三方不一致

**置信度：10/10**

#### 证据

`PRD-v0.4.md:495-543` 依次更新 task、attempt、event，但没有检查任何一条 UPDATE 的 row count。

若 Worker 在 reaper 查询过期任务后刚好续租：

```text
reaper UPDATE task WHERE lease_expires_at < now → 0 行
reaper UPDATE attempt WHERE status = active     → 1 行
reaper INSERT event                              → 成功
```

最终 task 仍在运行，attempt 却已 expired/interrupted，event 还宣称 lease 已被回收。

另外，SQLite 的 `BEGIN IMMEDIATE` 已经提供单写者串行化。当前 `reaper_lock`：

- 不删除锁记录；
- 使用固定 `REAPER_WORKER_ID` 时，同 ID 的两个进程可同时通过检查；
- 增加了 TTL、时钟和过期锁的额外故障模式。

#### 必须修改

1. MVP 删除 `reaper_lock`，依赖 `BEGIN IMMEDIATE` 串行执行；
2. 每个任务的回收必须是独立短事务，避免一次大批量事务长期阻塞写入；
3. task 条件更新必须同时校验 attempt ID、lease token、fence version 和 lease expiry；
4. task 更新不为 1 行时，跳过且不得更新 attempt/event；
5. attempt 更新不为 1 行时，整个任务回收事务回滚；
6. event 只能在前两步成功后写入。

#### 通过标准

- renew 与 reaper 在每个故障注入点并发，最终只允许一方成功；
- 不存在 task running 但 attempt interrupted/expired 的组合；
- reaper 可重复执行且不会产生重复 recovery event。

### P0-3：Approval 崩溃恢复会重复执行外部副作用

**置信度：10/10**

#### 证据

`PRD-v0.4.md:944-959` 规定：

```text
consuming → approved
新 attempt 重新消费（幂等键保证外部副作用不重复）
```

问题是 Harness 无法仅凭本地数据库判断进程崩溃发生在：

```text
A. 外部请求发送前
B. 外部请求处理中
C. 外部服务已成功，但本地 complete_approval 写回前
```

若处于 C，自动回到 approved 会再次发布、发送或执行。幂等键只有在外部服务明确支持、持久保存并允许查询时才有效，不能由 Harness 单方面保证。

此外，approval 绑定旧 attempt 后再由新 attempt 消费，需要明确授权是否可以跨 attempt 继承。

#### 必须修改

推荐状态机：

```text
pending → approved → consuming → succeeded
                           ├──→ failed_final
                           └──→ unknown / reconcile_required
```

1. timeout 后默认进入 `unknown`，不得自动回到 approved；
2. 每种外部动作声明 idempotency capability：`none`、`provider_key`、`queryable_operation`；
3. `provider_key` 必须有契约测试证明供应方按 key 去重；
4. `queryable_operation` 必须保存 external operation ID 并在恢复时查询；
5. 无法查询的副作用必须人工确认后再重试；
6. 明确 approval 的作用域：task、attempt、action hash、有效期与最大消费次数。

#### 通过标准

- 在外部调用前、调用中、调用成功后写库前分别 kill 进程，系统均不会无条件重复副作用；
- UI 能展示 `unknown/reconcile_required`，并提供“查询结果、确认已完成、明确重试”操作；
- 审计记录保留每次恢复决策和 actor。

### P0-4：SSRF 防护存在 DNS rebinding TOCTOU，且响应大小限制发生得过晚

**置信度：10/10**

#### 证据

`PRD-v0.4.md:789-804` 使用 `socket.getaddrinfo()` 校验 IP，随后又让 httpx 按原始 hostname 建立连接。第二次 DNS 解析可能返回不同地址，因此“先校验、后连接”不能防 DNS rebinding。

`PRD-v0.4.md:807-814` 还存在：

- 递归重定向没有最大次数；
- 相对 `Location` 未通过 `urljoin()` 解析；
- `resp.content` 先完整读入内存，之后才检查 `max_bytes`；
- 没有验证实际连接 peer IP；
- IP blocklist 容易漏掉 IPv4/IPv6 特殊范围。

#### 必须修改

优先方案是独立 `EgressFetcher` 服务或受限网络命名空间：

```text
Workflow → Fetch request → Egress policy → DNS + pinned IP connect
                                      ├─ redirect limit
                                      ├─ peer IP validation
                                      ├─ streaming byte limit
                                      └─ audit redirect chain
```

若 Stage 1 仍在进程内实现，则至少要求：

1. 解析后固定连接目标 IP，同时正确保留 Host/SNI；
2. 使用 `ip.is_global` 等完整规则，并对每个实际 peer 再验证；
3. 每次重定向重新授权，限制最大 5 次；
4. 使用流式读取，超过字节上限立即断开；
5. 禁止携带凭据跨 origin 重定向；
6. 增加 DNS 变化、IPv4-mapped IPv6、大响应和重定向环测试。

---

## 4. P1 高优先级问题

### P1-1：PolicyEngine 的原则、数据模型和执行顺序互相冲突

**置信度：10/10**

`PRD-v0.4.md:687-703` 一边根据 `input_source` 修改工具集合，一边又声明 prompt 来源“不影响工具集合”；同时引用已被 approvals 表替代的 `task.approval_status`。

`publish_external` 还在项目 allowlist 过滤后添加，可能绕过项目 allowlist。

建议改成单向权限原则：

```text
身份、项目策略、资源策略提供最大权限
输入来源、数据分类、风险等级只能收缩权限
approval 只能授权一个已在最大权限内的具体动作
任何自然语言均不能扩大权限
```

Policy 决策应返回 `allow/deny/needs_approval`、reason、policy_version 和 matched rules，而不是只返回工具名称集合。

### P1-2：结构化动作的路径校验可被 `..` 和 symlink 绕过

**置信度：10/10**

`PRD-v0.4.md:830-839` 使用字符串 `startswith('/opt/harness/workspace/')`，无法阻止：

- `/opt/harness/workspace/../secrets/x`；
- workspace 内指向外部路径的 symlink；
- 以 `-` 开头、被下游 CLI 解释为 option 的文件名。

建议使用 `Path.resolve()` + `os.path.commonpath()`，默认拒绝 symlink，固定工作目录，并为每个 action 定义独立参数 schema、文件类型、最大尺寸和 option terminator 行为。

### P1-3：事务 context manager 的 rollback 契约没有被定义

**置信度：8/10**

多个示例在 `with db.transaction()` 内通过 `return False` 表示竞态失败，并在注释中声称会 rollback。普通 Python context manager 在无异常退出时通常会 commit。

PRD 必须明确实现方式：

- 条件失败抛出专用 `TransitionConflict`，由 context manager rollback；或
- transaction 对象显式 `tx.rollback()`；或
- context manager 支持结果哨兵并有契约测试。

不能把“函数提前 return”写成数据库回滚语义。

### P1-4：UI 服务与 Control API 静态托管方案冲突

**置信度：10/10**

`PRD-v0.4.md:1148-1154` 定义独立 `ui` 容器，但又说 UI 由 Control API `/ui` 提供。该容器没有端口、命令或路由，按当前 Compose 没有作用。

MVP 建议删除 ui service，由 Control API 直接托管构建后的静态资源。只有需要独立发布频率或 SSR 时，才拆分 UI 服务并配置真实 Serve 路由。

### P1-5：后台调度器生命周期不应在模块导入时启动

**置信度：9/10**

`PRD-v0.4.md:1163-1177` 在模块级调用 `asyncio.create_task()`，可能在 event loop 尚未建立时失败，也没有关闭、取消和异常监督机制。

应使用 FastAPI lifespan：启动时创建 scheduler task，关闭时发送 stop、等待 lease 清理并捕获任务异常。

### P1-6：CI 和不可变镜像流程不可复现且扩大生产权限

**置信度：10/10**

`PRD-v0.4.md:1215-1221` 存在四个问题：

- self-hosted runner 直接运行在生产 newvps；
- `GITHHA_SHA` 拼写错误；
- `registry.local` 没有 registry 服务或外部定义；
- 同时发布 mutable `latest`，与不可变镜像原则冲突。

建议使用 GitHub-hosted 或独立 builder 构建并签名镜像，生产机只拉取固定 digest。生产部署凭据不得暴露给普通仓库 Workflow。

部署脚本写 `.env.version`，但 Compose 默认读取 `.env`；必须显式 `--env-file .env.version`，或者使用唯一的部署 env 文件。

### P1-7：迁移恢复测试要求了无法成立的数据恢复

**置信度：10/10**

`PRD-v0.4.md:1318-1328` 先 downgrade 删除 `task_attempts`，再 upgrade 并要求 `data_restored()`。除非 downgrade 另行归档数据，否则被删除的数据无法自动恢复。

建议采用 expand/contract 与 forward-only 原则：

- 迁移先添加兼容结构；
- 新旧代码短期可并存；
- 生产回滚应用版本，不自动 downgrade 丢数据表；
- 只有无损、可证明的 migration 才提供 downgrade；
- 恢复数据依赖部署前备份，而不是伪造可逆迁移。

### P1-8：Backup E2E 实际上可能在验证生产服务

**置信度：10/10**

`PRD-v0.4.md:1463-1481` 启动临时容器时没有映射端口或使用 host network，随后却请求 `127.0.0.1:8080`。该请求很可能访问正在运行的生产 Control API，而不是 `harness-verify` 容器。

还需修复：

- 临时验证使用随机空闲端口或独立 Docker network；
- 测试 token 不能被生产实例接受；
- 解密私钥的实际保存位置与“私钥只在 HK03”原则保持一致；
- 清理必须用 trap，失败时也能停止容器和删除临时目录；
- systemd timer 应调用一次性 backup container，不应再保留无限循环 backup image。

### P1-9：数据保留与归档策略缺少产品和隐私依据

**置信度：8/10**

“audit 保留一年”和“任务/产物永久保存”没有对应的合规、隐私、成本和用户删除需求。把归档表放在同一个 SQLite 文件中也不会减小备份或数据库体积。

建议按数据类型定义：用途、默认期限、用户删除、法律保留、归档位置和 vacuum 策略。默认遵循数据最小化，不以“永久”作为无成本默认值。

### P1-10：v0.4 不是自包含实施规范，且自评结论矛盾

**置信度：10/10**

文档大量使用“保留 v0.3，不重复”，导致实施者必须同时解释多份历史 PRD。开头的完成度描述与 `PRD-v0.4.md:1726` 的“8/10 完整通过”也不一致。

建议 v0.5 形成唯一 canonical PRD：

- 主文完整描述当前有效规范；
- 历史取舍写入 ADR；
- changelog 只说明版本差异；
- 自评只保留一个结论，并把未验证项明确列为 blocking spike。

---

## 5. 扩展性结论：从“研究应用”升级为“可扩展 Harness 内核”

### 5.1 推荐架构

```text
Channels / Schedules / Webhooks / Manual UI
                       │
                       ▼
              Goal / Task / Workflow API
                       │
                       ▼
 ┌──────────────── Durable Kernel ────────────────┐
 │ state · lease · approval · policy · budget    │
 │ event · artifact · provenance · audit         │
 └──────────────────────┬─────────────────────────┘
                        ▼
               Versioned WorkflowPack
                        │
                        ▼
                ExecutionDriver SPI
       ┌────────────────┼──────────────────┐
       ▼                ▼                  ▼
 CodexSdkDriver   CodexExecDriver   DeterministicDriver
       │                │                  │
       └────────────────┼──────────────────┘
                        ▼
          ToolProvider / Skills / MCP / APIs
```

关键边界是：Durable Kernel 不知道“研究报告怎么做”，WorkflowPack 不知道“线程如何由 Codex 运行”，ExecutionDriver 不决定权限。

### 5.2 v0.5 应定义的六个稳定扩展接口

#### 1. ExecutionDriver

建议最小接口：

```python
class ExecutionDriver(Protocol):
    def capabilities(self) -> DriverCapabilities: ...
    async def start(self, execution: ExecutionRequest) -> ExternalRunRef: ...
    async def resume(self, ref: ExternalRunRef, input: TurnInput) -> ExternalRunRef: ...
    async def interrupt(self, ref: ExternalRunRef) -> None: ...
    async def stream_events(self, ref: ExternalRunRef) -> AsyncIterator[DriverEvent]: ...
    async def collect_artifacts(self, ref: ExternalRunRef) -> list[ArtifactRef]: ...
```

数据库保存 `driver_id`、`driver_version`、`external_thread_id`、`external_turn_id` 和 protocol version。核心不得依赖 dsh 输出文本或某个 Codex CLI 子命令。

#### 2. WorkflowPack

每个工作流包至少声明：

- `id`、`version`；
- `input_schema`、`output_schema`；
- steps 或状态机；
- capability requirements；
- policy profile；
- retry/cancel policy；
- eval suite；
- UI schema；
- 版本迁移策略。

Research 应是第一个 WorkflowPack，而不是 kernel 中的特殊分支。

#### 3. ToolProvider

工具 manifest 需要声明：

- JSON Schema 输入输出；
- network class；
- side-effect class；
- approval requirement；
- idempotency capability；
- timeout、最大输入输出；
- secrets scope；
- compatible runtime versions。

后续 MCP、Codex skills、内部函数和外部 API 都通过 provider adapter 进入，不直接污染 kernel。

#### 4. ArtifactStore

所有报告、引用、网页快照、补丁、决策和执行结果都应是 typed artifact，带：

- content hash；
- producer/workflow/driver/model version；
- source 与引用；
- parent/child lineage；
- visibility、retention 和 sensitivity；
- preview/rendering type。

这样 UI 和知识层可围绕 artifact 扩展，而不是解析聊天文本。

#### 5. PolicyDecisionPoint

输入 actor、requested action、resource、context labels 和 policy version，输出：

```json
{
  "decision": "allow | deny | needs_approval",
  "reason": "...",
  "policy_version": "...",
  "constraints": {}
}
```

Policy 必须是可单测、可回放的纯决策层，执行层只消费结果。

#### 6. EventSink

定义统一、版本化的 event envelope：

```text
event_id, event_version, task_id, attempt_id, workflow_run_id,
driver_ref, event_type, occurred_at, actor, trace_id, payload
```

task 表保存当前状态投影；暂时不需要完整 Event Sourcing，但所有 UI、审计、指标和 trace 应从统一事件规范消费。

### 5.3 扩展性验收标准

v0.5 应增加三个架构测试：

1. 新增第二个 WorkflowPack 不修改 Durable Kernel；
2. 新增第二个 ExecutionDriver 不修改 task 状态机；
3. 新增工具只增加 manifest、handler 和 policy，不增加散落的硬编码条件分支。

---

## 6. Codex Harness 与 SDK 集成建议

### 6.1 推荐使用稳定 Python SDK 作为主 Driver

Fish Harness 当前采用 Python/FastAPI，最适合优先实现 `CodexSdkDriver`。官方 Python SDK 可以控制本地 Codex app-server，支持启动、继续和恢复 thread；发布包包含固定版本的 Codex CLI runtime，有利于降低协议漂移。

官方参考：

- Codex SDK：<https://learn.chatgpt.com/docs/codex-sdk>
- Codex App Server：<https://learn.chatgpt.com/docs/app-server>
- Codex non-interactive mode：<https://learn.chatgpt.com/docs/codex/noninteractive>

推荐映射：

| Fish Harness | Codex |
|--------------|-------|
| workflow run / task | thread |
| attempt | turn 或一次 driver execution |
| task event | normalized thread/turn/item event |
| artifact | item 输出、patch、structured result |
| Harness approval | Codex approval bridge 的最终授权源 |
| retry/resume | thread resume + 新 turn |
| alternative plan | thread fork |

每个 attempt 都必须保存外部引用，不能只保存 stdout。

### 6.2 Stage 0 先用 `codex exec --json` 做契约 spike

在 SDK 集成前，可用：

```bash
codex exec --json --output-schema <schema>
```

验证：

- JSONL 事件是否能稳定映射到 Harness event；
- structured output 无效、缺失或 refusal 时如何失败；
- interrupt、resume、进程 kill 后如何恢复；
- sandbox preset 是否按 turn 生效；
- CLI/SDK 升级后 contract tests 能否及时发现协议变化。

该路径只作为 adapter spike 或降级方案，不应成为业务内核。

### 6.3 App Server 的适用边界

App Server 提供 thread、turn、item、approval、review、skills/hooks discovery 和 schema generation，适合未来构建深度交互客户端。

但官方当前明确把远程 WebSocket 和部分 code-mode/plugin/app 能力标为实验性或仍在开发。因此：

- Stage 1 只使用本地 stdio 或 Unix socket；
- 不通过公网/Tailscale 直接暴露 app-server；
- 根据固定版本生成 JSON Schema/TS binding；
- 所有实验能力放入 `CapabilityRegistry`，不得成为 kernel 的静态假设。

### 6.4 不要基于已弃用的 Codex MCP Server 构建执行内核

官方已建议使用 App Server 代替 `codex mcp-server`：

<https://learn.chatgpt.com/docs/mcp-server>

MCP 仍可作为工具生态接口，但 Codex 执行和 thread 生命周期应由 SDK/App Server adapter 管理。

### 6.5 Harness 应吸收的 Codex 设计成果

- Thread/Turn/Item 分层，避免把一次任务等同于一个进程；
- resume、fork、compact 作为能力，而不是特殊命令；
- 每 turn sandbox，支持规划只读、实施可写、评审只读；
- approval event bridge，但 Harness 保持最终 policy authority；
- model/provider capability discovery，避免硬编码模型名称；
- version-specific schema generation + contract test；
- 有界事件队列、背压和 overload 错误，而不是无限缓存流式事件。

---

## 7. 产品开放性与创新路线

### 7.1 数字分身的长期领域闭环

仅有 Task 不足以描述数字分身。长期领域模型应能表达：

```text
Goal → Observation → Proposal → Approval → Action → Outcome
  ↑                                                     │
  └──────────── Evaluation ← Memory / Learning ─────────┘
```

v0.5 不需要实现所有实体，但应预留稳定 ID、事件类型和 artifact lineage，避免未来把 Goal、Observation 和 Decision 都塞进 task payload。

### 7.2 建议进入路线图的创新能力

#### 连续情报订阅

按主题、人物、仓库、RSS 或页面变化触发，只输出增量和变化原因，而不是反复生成全量报告。

#### Branch-and-Judge

利用 Codex thread fork 生成多个研究或实施方案，由 evaluator 按质量、来源、成本和风险选择。该模式比固定“指挥官 + 多 Agent 层级”更轻，也更容易预算控制。

#### Schema-driven UI

WorkflowPack 提供 input/output/ui schema，Harness 自动生成任务表单、进度视图和 artifact renderer。新工作流不应每次都开发一套专属前端。

#### 来源优先的个人知识图谱

把 claim、source、artifact、decision 和 outcome 建立关系。长期记忆保存可验证事实和用户决策，不直接把整段模型对话当作可信记忆。

#### Budget-aware Capability Router

根据质量、延迟、价格、隐私、上下文长度和数据位置选择 driver/model/tool。真实 eval 结果反馈路由，而不是静态模型排行榜。

#### Human Control Tower

统一展示：

- 待审批动作；
- 为什么提出该动作；
- 权限和参数差异；
- 预算消耗；
- 事件时间线；
- replay/fork；
- 全局和项目级 kill switch。

#### Workflow Catalog

未来允许安装签名 WorkflowPack，安装前展示权限、工具、网络、数据保留和预算清单。第三方开放市场应晚于内部 catalog 和签名验证。

#### Feedback-to-Eval

用户的接受、拒绝、编辑、复用和最终结果应成为 eval 数据，而不是未经筛选写入长期记忆。这样 Harness 才能逐步学会“什么对这个用户有效”。

### 7.3 明确暂缓的范围

以下能力现在实现会显著拖慢 MVP，建议只保留接口或 ADR：

- 开放第三方 WorkflowPack 市场；
- 复杂分布式调度和 Worker 市场；
- 固定多 Agent 组织层级；
- 远程 App Server WebSocket 生产接入；
- 全量 Event Sourcing；
- 自动执行不可逆外部操作；
- 自主修改自身 policy 或核心代码。

---

## 8. 推荐实施分期

### Stage 0：证据与契约

- 修复 PRD 中的确定性事务错误；
- 比较 `codex exec --json` 与 Python SDK；
- 测量 dsh/Codex 的资源占用、恢复和中断行为；
- 建立 event、structured output、approval、sandbox contract tests；
- 验证真实备份恢复，而非仅验证备份文件存在。

### Stage 1：可扩展但克制的 Durable Kernel

- task/attempt/event/approval/policy/artifact；
- ExecutionDriver SPI；
- CodexSdkDriver；
- Research WorkflowPack；
- 单 Worker、单 SQLite、Tailscale、进程内 scheduler。

### Stage 2：控制塔与 Schema-driven UI

- 自动表单和 artifact renderer；
- approval inbox；
- timeline、预算、失败诊断和 kill switch；
- 真实 iPhone/Tailscale E2E。

### Stage 3：连续研究闭环

- schedule/webhook/change trigger；
- observation 与 delta report；
- provenance graph；
- eval 与 feedback ingestion。

### Stage 4：第二 Driver 与智能路由

- 第二种 ExecutionDriver；
- CapabilityRegistry；
- budget-aware routing；
- thread fork + branch-and-judge。

### Stage 5：生态化

- 内部 Workflow Catalog；
- 签名 pack；
- memory provider；
- 经验证后再考虑第三方开放生态和分布式 Worker。

---

## 9. v0.5 必须新增的验证矩阵

### 事务与并发

- claim 第 2 至第 10 次重试的 attempt_no；
- claim/renew/start/submit/fail/cancel/reaper 任意两者竞态；
- 每个条件 UPDATE 返回 0 行后的 rollback 证明；
- task/attempt/event 不变量检查；
- scheduler 重启和重复执行的幂等性。

### 外部副作用

- approval 在外部调用前、中、后 kill 进程；
- provider 不支持幂等键时进入 reconcile_required；
- provider 支持幂等键时重复请求只产生一次结果；
- approval 跨 attempt 是否允许的策略测试。

### 安全

- DNS rebinding、redirect loop、相对 Location；
- IPv4、IPv6、mapped IPv6 和 metadata 地址；
- 大响应流式中断；
- `../`、symlink、option injection；
- 用户、网页、字幕、模型历史四种来源不能扩大权限；
- approval action hash、resource、actor 和 policy version 绑定。

### Driver 契约

- start/resume/interrupt/stream/collect_artifacts；
- malformed/empty/refusal structured output；
- event 重复、乱序、缺失和背压；
- driver runtime 版本升级兼容性；
- Codex thread/turn 外部引用可恢复。

### 部署与恢复

- 干净主机部署；
- 镜像 digest 和签名校验；
- migration expand/contract；
- 生产代码回滚但数据库不 downgrade；
- 临时恢复服务使用独立端口/网络；
- 主机重启后 Compose、scheduler、Tailscale Serve、backup timer 恢复。

---

## 10. 给 Claude Code 的明确修改清单

### 必须修改后才能冻结

- [ ] 修正 claim 的 `attempt_no = 1`；
- [ ] 修正 `attempt_count` 未定义和 retryable failure 状态；
- [ ] 为 `retry_wait → queued` 增加事件；
- [ ] 重写 reaper，逐条校验 row count，删除不必要的固定 ID 锁；
- [ ] 明确 transaction context manager 的 rollback 契约；
- [ ] approval timeout 改为 `unknown/reconcile_required`；
- [ ] 为外部动作定义 idempotency capability 与 reconciliation；
- [ ] SSRF 改为 pinned-IP/独立 egress、流式限制和有限重定向；
- [ ] 路径校验改为 canonical path + symlink policy；
- [ ] 重写 PolicyEngine 的单向权限原则；
- [ ] 删除无效 UI service 或明确独立部署；
- [ ] scheduler 改用 FastAPI lifespan；
- [ ] CI 移出生产 newvps，修复 SHA、registry、digest 和 env 文件；
- [ ] migration 改为 expand/contract，不承诺无依据的数据恢复；
- [ ] 修复 Backup E2E 的端口、网络、密钥位置和清理流程；
- [ ] 合并为自包含 canonical PRD，并统一自评结论。

### v0.5 应定义但 Stage 1 只做最小实现

- [ ] ExecutionDriver；
- [ ] WorkflowPack；
- [ ] ToolProvider manifest；
- [ ] typed ArtifactStore；
- [ ] PolicyDecisionPoint；
- [ ] versioned EventSink；
- [ ] Codex thread/turn/item 映射；
- [ ] capability registry 与版本契约测试；
- [ ] Research WorkflowPack；
- [ ] CodexSdkDriver。

### 暂不实现

- [ ] 第三方插件市场；
- [ ] 分布式 Worker 调度；
- [ ] 固定多 Agent 层级；
- [ ] 远程 App Server WebSocket；
- [ ] 完整 Event Sourcing；
- [ ] 自主不可逆外部操作。

---

## 11. 最终复审结论

### 判定

**有条件不通过。**

v0.4 已经证明 Fish Harness 的单机 MVP 方向可行，但尚未证明事务一致性、外部副作用恢复、SSRF 防护和部署恢复流程可以按文档安全运行。附录 G 的“8/10 完整通过”结论偏高，建议调整为：

```text
4/10 已通过
4/10 部分通过，需按本报告修订
2/10 等待 Stage 0 spike
```

### 允许继续的工作

- PRD v0.5 修订；
- `codex exec --json` 与 Python SDK 的 Stage 0 adapter spike；
- 事务、approval、SSRF 和恢复的最小原型及故障注入测试；
- 六个扩展接口的契约设计。

### 暂不允许

- 以 v0.4 原文冻结正式实现；
- 启用自动外部副作用；
- 把生产 newvps 作为普通 CI runner；
- 基于远程 App Server WebSocket 或弃用的 Codex MCP Server 建立生产内核；
- 在缺少 driver/workflow/tool 扩展边界时继续增加硬编码工作流。

### 推荐架构选择

| 方案 | 复杂度 | 短期速度 | 长期扩展性 | 建议 |
|------|--------|----------|------------|------|
| A. 继续硬编码研究工作流 + subprocess | 低 | 快 | 低 | 不推荐作为长期内核 |
| B. Durable Kernel + 六个扩展接口 + Codex SDK | 中 | 中 | 高 | **推荐** |
| C. 立即建设完整多 Agent/插件/分布式平台 | 极高 | 慢 | 理论高、现实风险高 | 延后 |

推荐选择 **B**。它保留 v0.4 单机、单 Worker、SQLite 的交付优势，同时让新的工作流、执行器、工具、UI 和记忆能力可以通过稳定接口演进，而不是反复修改核心任务状态机。
