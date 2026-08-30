# Fish Harness PRD v0.2 架构复审反馈

> 接收方：Claude Code（CC）  
> 审核对象：`PRD-v0.2.md`  
> 审核日期：2026-08-29  
> 结论：**有条件不通过；允许 Stage 0 dsh spike 和 PRD 修订，不允许进入正式 MVP 实施**

---

## 1. 给 Claude Code 的执行指令

请基于本反馈修订 `PRD-v0.2.md`，建议版本提升为 `v0.2.1` 或 `v0.3`。

执行约束：

1. 不扩大 MVP 范围，继续保持“单 worker + 单研究简报工作流 + 文字入口”。
2. 不把尚未经过 spike 的 dsh 能力写成事实。
3. 优先关闭本文全部 P0；P0 未关闭前，不进入正式 MVP 编码。
4. 所有状态转换、恢复动作和 SQL 示例必须使用同一份规范，不得在主文与附录中保留两套互相冲突的定义。
5. 安全要求必须落到一个明确的 MVP 方案，而不是保留多个待选项。
6. 修订完成后，在 PRD 末尾新增“v0.2 复审整改记录”，逐条链接到修改章节。

---

## 2. 总体评价

v0.2 已经正确完成以下方向调整：

- dsh 从完整控制平面降级为可替换 adapter；
- 持久化提升为 MVP P0；
- MVP 收敛为单一研究简报工作流；
- 运行中任务不再承诺透明迁移；
- Basic Auth 不再被视为充分安全措施；
- 语音、Push、多机和 GPU 工作流移出 MVP；
- 工程量改用里程碑和三点估算。

这些变化使方案从“不可实施”提升为“可以开展 Stage 0 spike”。但任务恢复、安全落地和灾难恢复仍未形成闭合的工程契约，因此暂不能恢复“架构冻结”。

---

## 3. P0 阻塞项

### P0-1：统一 lease、attempt、checkpoint 和恢复语义

#### 当前问题

PRD 同时给出以下互相冲突的规则：

- `running` 任务只能从已确认 checkpoint 恢复；
- 控制平面重启后，过期的 `running` 任务进入 `retry_wait`；
- Worker 崩溃后，`leased` 和 `running` 任务都回到 `queued`；
- Schema 中没有 attempt 和 checkpoint 数据结构。

这会导致没有 checkpoint 的任务被另一 Worker 从头重复执行，也无法保留每次执行的错误、产物和资源记录。

#### 必须修改

1. 新增 `task_attempts` 表，至少包含：
   - `attempt_id`
   - `task_id`
   - `attempt_no`
   - `worker_id`
   - `fence_version`
   - `lease_token`
   - `lease_expires_at`
   - `started_at` / `finished_at`
   - `status`
   - `error_code` / `error_message`
   - `artifact_path`
2. 如果 MVP 确实支持 checkpoint，新增 `task_checkpoints` 表并定义 checkpoint 的完整性校验和恢复协议。
3. 如果 MVP 不实现 checkpoint，明确写成：
   - `leased` 过期可以重新排队；
   - `running` 失联后进入 `interrupted` 或 `failed`；
   - 只能由用户显式创建新 attempt，不得自动假装“续跑”。
4. 结果提交必须同时校验：
   - `task_id`
   - `attempt_id`
   - 当前 `lease_token`
   - 当前 `fence_version`
   - 允许的来源状态
5. 所有条件更新必须检查受影响行数；零行更新必须返回明确的 stale-lease 错误并记录事件。

#### 通过标准

- 主状态机、恢复表、Schema、SQL 示例、错误表使用同一套转换规则；
- 能解释 Worker 在 `leased` 和 `running` 两个阶段分别崩溃时发生什么；
- 旧 attempt 无法覆盖新 attempt 的状态或产物；
- 没有 checkpoint 时，不再承诺运行中任务自动恢复。

### P0-2：修正单机故障与“不丢任务”的矛盾

#### 当前问题

SQLite、控制 API 和唯一 Worker 都部署在 newvps。PRD 却声称 newvps 故障时“任务保留在 DB，恢复后继续”，但没有说明磁盘损坏、主机永久丢失或数据库损坏时的数据来源。

“每日增量、每周全量”也不是可直接执行的 SQLite 备份方案。

#### 必须修改

1. 指定异故障域备份位置，不能只保存在 newvps 本机。
2. 使用 SQLite Online Backup API、`.backup` 或经过验证的一致性快照；不得直接复制正在写入的数据库文件。
3. 明确定义：
   - MVP RPO；
   - MVP RTO；
   - 备份加密与密钥位置；
   - 备份保留期；
   - 恢复责任和操作命令。
4. 区分以下故障：
   - 进程重启；
   - Worker 崩溃；
   - 数据库锁；
   - 数据库损坏；
   - newvps 主机或磁盘永久丢失。
5. 将“不可接单但不丢任务”改成与实际 RPO 一致的承诺。

#### 通过标准

- 在一台与 newvps 隔离的环境中，可以仅依赖备份恢复任务账本；
- 恢复演练能够验证任务、attempt、审批、审计和产物索引的一致性；
- Stage 1 退出条件包含一次可复现的灾难恢复演练。

### P0-3：把安全要求收敛为可实施的 MVP 安全基线

#### 当前问题

PRD 仍将 Tailscale、WireGuard 和 Cloudflare Access 并列为候选，没有确定实际入口。审批记录没有绑定操作参数，日志脱敏只处理顶层精确字段，同库 SQLite 触发器也不能真正提供“不可篡改”保证。

#### 必须修改

1. MVP 只选择一个网络入口方案。建议：
   - 使用 Tailscale 私网；
   - Control API 不直接暴露公网端口；
   - 只允许已批准设备访问；
   - 定义设备撤销流程。
2. 明确 session 的签发、有效期、撤销、Cookie 属性和 CSRF 保护。
3. approval 必须绑定：
   - `task_id` 和 `attempt_id`；
   - 规范化后的 action；
   - 完整参数摘要或哈希；
   - 请求人和审批人；
   - 有效期；
   - 单次消费 nonce；
   - 执行结果。
4. 参数变化后旧 approval 必须失效，禁止审批重放。
5. 日志改为递归、结构化、allowlist 优先的序列化策略；覆盖嵌套对象、Header、URL 查询参数和常见密钥别名。
6. 将“不可篡改审计”改为准确表述：
   - MVP 若只做同库触发器，应称“追加式、尽力防误改”；
   - 若保留“防篡改”承诺，则增加哈希链、签名或异机日志出口。
7. Prompt injection 防护需要明确内容与指令的信任边界，外部网页、字幕和模型输出都不得直接授权工具调用。

#### 通过标准

- PRD 中不再保留未决的入口方案；
- 修改危险操作参数后，旧审批无法执行；
- 嵌套凭证和 Authorization Header 不进入日志；
- 未经授权的外部内容不能扩大命令、路径、网络或密钥权限。

---

## 4. P1 高优先级修订

### P1-1：补齐并约束状态集合

- `blocked` 已被调度逻辑使用，但不在任务状态机和 Schema 中；应正式加入或改成不新增状态的错误表达。
- 为 `status`、`workflow`、`decision` 等字段增加数据库 `CHECK` 约束。
- 启用并测试 SQLite foreign keys。
- 删除 `tasks.approval_status` 与 `approvals` 表之间的双事实来源，或定义严格的一致性维护方式。
- 明确运行中取消是否支持；如不支持，在 MVP 范围中明确排除。

### P1-2：只保留一份规范 SQL

主文和附录当前存在不同的 claim SQL。请只保留一份规范版本，并满足：

- 不依赖 SQLite 非默认的 `UPDATE ... ORDER BY ... LIMIT` 编译选项；
- 在事务中选择候选任务并执行条件更新；
- 每次转换递增版本号；
- 使用明确括号避免 `AND`/`OR` 优先级歧义；
- 对 claim、renew、start、submit、expire、retry 分别定义条件更新；
- 每个操作检查 row count，并产生 task event。

### P1-3：重算真实执行进程资源

当前 `Worker Adapter = 1G` 没有覆盖 cc/codex、浏览器、下载、ASR 和模型辅助进程的峰值。

请在 spike 中实测：

- 空闲 RSS；
- 单次抓取峰值；
- ASR 峰值；
- cc/codex 子进程峰值；
- 磁盘临时文件峰值；
- 僵尸进程与 FD 泄漏；
- OOM 后任务账本是否保持一致。

同时重新验证 `newvps` 的真实磁盘容量，禁止复用其他主机的数据。

### P1-4：清理 MVP 范围矛盾

请统一修订：

- “MacBook 离线自动转移”必须明确只适用于尚未开始执行的任务；
- MVP 不应写“结果推送回手机”，应写“通过轮询或刷新在结果页可见”；
- MVP 唯一 Worker 是 newvps 本地 Worker，不应再写模糊的“公网 IP worker”；
- WebSocket、Web Push、第二 Worker 的测试必须标记为后续阶段，不能计入 MVP 完成条件；
- 标题“三层架构”应改为“模块化单体控制平面”或与实际组件一致的名称。

### P1-5：补齐部署和升级架构

回滚方案使用了 `docker compose down`，但没有定义可构建和可发布的部署产物。请增加：

- Dockerfile 和 Compose 服务边界；
- 镜像版本和依赖锁定策略；
- 配置与 secret 注入方式；
- SQLite migration 的前滚与回滚规则；
- 健康检查和进程自启方式；
- 部署前备份、升级、失败回滚的命令级步骤；
- Stage 0/1 是否需要 CI，以及最低 lint/test gate。

`tmux + 自定义 daemon 脚本` 不应作为生产 fallback。请使用 systemd、容器 restart policy 或等价的受管进程方式。

---

## 5. 测试计划补充

在现有测试清单基础上增加：

### 5.1 状态与一致性

- `leased` 阶段崩溃后可安全回收；
- `running` 无 checkpoint 时不会自动重复执行；
- 有 checkpoint 时只能从已确认 checkpoint 创建新 attempt；
- stale lease、stale attempt 和 stale fence 均提交失败；
- 条件更新零行时返回明确错误；
- 控制面崩溃发生在“产物写入后、DB 更新前”时可恢复；
- 客户端重复提交使用 idempotency key，不生成两个任务。

### 5.2 安全

- approval 参数被修改、过期或重放时执行失败；
- 嵌套 JSON、Authorization Header、URL 查询参数中的密钥被脱敏；
- artifact path 和 workspace path 的符号链接及路径穿越被拒绝；
- 外部网页、字幕和模型输出不能扩大工具权限；
- Worker 凭证只能访问被授权项目。

### 5.3 数据恢复

- 在线备份可以恢复；
- 损坏的主数据库可以从异机备份恢复；
- 恢复后 task、attempt、approval、audit、artifact 索引保持一致；
- 明确验证实际 RPO 和 RTO。

### 5.4 研究质量 eval

- 引用链接真实存在且与结论相关；
- 摘要中的关键事实可以定位到来源；
- 缺失、删除或抓取失败的来源被明确标注；
- 模型 fallback 后仍满足相同结构和引用质量门槛；
- 防止模型生成不存在的来源。

---

## 6. 修订后的建议状态机

若 MVP 不实现 checkpoint，建议使用以下最小状态：

```text
created → validated → queued → leased → running → succeeded
    │          │          │        │         ├→ failed
    │          │          │        │         └→ interrupted
    │          │          │        └→ queued       │
    │          │          │          lease 过期    └→ 用户显式 retry
    │          │          └→ cancelled
    │          └→ rejected
    └→ rejected

无可用 Worker：queued + blocked_reason
或正式增加 blocked 状态，但只能选择一种表达方式。
```

关键规则：

- `leased` 表示任务尚未产生不可重复副作用，可以在 lease 过期后回收；
- `running` 表示已经开始执行，没有 checkpoint 时不得自动重新排队；
- retry 创建新的 attempt，不复用旧 attempt；
- task 保存当前汇总状态，attempt 保存每次执行的完整事实；
- 任何终态变化和副作用都必须由条件更新及幂等键保护。

---

## 7. 复审通过门槛

以下条件全部满足后，PRD 才可进入“架构冻结，允许实施”：

1. lease、attempt、checkpoint 和恢复规则无冲突；
2. Schema 能保留每次执行的历史和产物；
3. 旧 Worker、旧 attempt、旧 approval 都不能产生有效副作用；
4. MVP 网络入口、安全 session 和设备撤销方案已经唯一确定；
5. SQLite 有异故障域、可恢复、经过演练的备份方案；
6. MVP 资源预算包含真实 AI CLI、抓取和 ASR 子进程峰值；
7. 主文、附录、实施顺序和测试计划没有范围矛盾；
8. 部署、升级、migration 和回滚步骤可以在干净环境复现；
9. dsh spike 记录版本、命令、原始输出和明确的 adapter 决策；
10. 上述新增一致性、安全、恢复和研究质量测试进入实施计划。

在这些门槛关闭前，允许的工程活动仍限于：

- 隔离环境中的 dsh 能力 spike；
- 资源测量 spike；
- 备份恢复 spike；
- PRD 和接口契约修订。

---

## 8. Claude Code 完成清单

- [ ] 统一状态机和恢复规则
- [ ] 增加 task attempt 数据模型
- [ ] 决定 checkpoint 是否进入 MVP
- [ ] 修正 fencing 和 stale update 处理
- [ ] 正式定义或移除 `blocked` 状态
- [ ] 删除重复、冲突的 SQL 示例
- [ ] 锁定唯一 MVP 网络入口
- [ ] 补齐 approval 参数绑定、过期和防重放
- [ ] 改为递归、结构化的日志脱敏策略
- [ ] 修正审计日志的安全承诺
- [ ] 增加异故障域 SQLite 备份与恢复方案
- [ ] 重测 newvps 磁盘和执行进程资源
- [ ] 清理迁移、Push、公网 Worker 等范围矛盾
- [ ] 增加部署、升级、migration 和回滚设计
- [ ] 补齐一致性、安全、恢复和研究质量测试
- [ ] 在 PRD 末尾逐条记录本轮整改结果

