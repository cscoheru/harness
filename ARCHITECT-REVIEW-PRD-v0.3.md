# Fish Harness PRD v0.3 架构复审报告

> 审核对象：`PRD-v0.3.md`
> 审核日期：2026-08-29
> 审核范围：架构、状态一致性、安全边界、测试、性能与运维
> 结论：**有条件不通过；允许 Stage 0 spike 与 PRD 修订，暂不允许进入正式 MVP 实施**

---

## 1. 执行摘要

v0.3 对 v0.2 审核意见的响应是实质性的，不是简单扩写。以下关键方向已经正确关闭：

- MVP 明确不实现 checkpoint；
- 增加 `task_attempts` 与 `interrupted` 状态；
- fencing 扩展为 task、attempt、lease、version 四元校验；
- 网络入口收敛为 Tailscale；
- approval 增加参数哈希、nonce 和有效期；
- 日志改为递归脱敏；
- 审计能力改用准确的“追加式 + 尽力防误改”表述；
- 增加异故障域备份、RPO/RTO、部署和测试章节；
- 资源数据明确标记为待 spike，而不是继续使用未经验证的数字。

与 v0.2 相比，产品边界和总体架构已经接近可实施状态。当前阻塞点主要来自“规范示例按原样实现会失败或产生不一致”，而不是产品方向错误。

### 复审评分

| 维度 | v0.2 | v0.3 | 说明 |
|------|------|------|------|
| 产品价值 | 8/10 | **8/10** | 单一研究工作流保持稳定 |
| 技术可行性 | 7/10 | **7.5/10** | attempt 模型正确，但事务仍有缺口 |
| MVP 可交付性 | 7/10 | **7/10** | 部署草案目前不能按原样启动 |
| 安全与权限 | 6/10 | **7/10** | 网络收敛，但信任边界仍有高风险错误 |
| 可测试性 | 7/10 | **8/10** | 测试分类完整，需补关键负路径 |
| 可运维性 | 5/10 | **6.5/10** | RPO/RTO 明确，但进程管控和回滚冲突 |

---

## 2. P0 阻塞项

### P0-1：任务事务仍可能产生 task/attempt/event 不一致

**置信度：10/10**

#### 证据

`PRD-v0.3.md:394-407` 的 claim 只选择 `queued`：

```sql
FROM tasks
WHERE status = 'queued'
ORDER BY created_at ASC
LIMIT 1;
```

但紧接着的注释和条件更新声称支持过期 `leased`：

```sql
-- 条件更新：lease 过期也允许重试
AND status IN ('queued', 'leased')
AND (status = 'queued' OR lease_expires_at < $now);
```

实际候选查询永远不会选中 `leased`，因此该恢复路径不可达。

此外：

- `start` 在 tasks 条件更新失败后仍展示为无条件插入 `started` event；
- `submit` 在 tasks 更新失败后仍可能把 attempt 更新成 `succeeded`；
- `renew` 只更新 tasks 的 lease，没有同步 `task_attempts.lease_expires_at`；
- 没有规范 SQL 将过期 `leased` attempt 标记成 `expired`；
- 文档用注释写“检查 row count”，但没有定义零行时必须 `ROLLBACK` 并停止后续语句；
- `retry_wait` 存在于 Schema 和状态定义中，却没有进入主状态图或规范转换 SQL。

#### 生产失败场景

任务在 running 时被用户取消，旧 Worker 随后提交结果。tasks 的条件更新返回零行，但 attempt 更新仍可能成功，最终出现：

```text
tasks.status = cancelled
task_attempts.status = succeeded
task_events 包含错误的成功或 started 事件
```

此时数据库不再是单一事实来源，因为三张表对同一次执行给出了不同结论。

#### 必须修改

1. 每个转换定义为应用层事务函数，而不是可独立顺序执行的 SQL 片段。
2. tasks 条件更新 row count 不为 1 时，必须立即 `ROLLBACK`，不得继续写 attempt/event。
3. attempt 更新必须同时验证 tasks 当前状态，或仅在 tasks 更新成功后执行。
4. renew 同步更新 tasks 与当前 attempt 的 lease expiry。
5. 增加明确的 leased-expiry reaper：
   - attempt `active → expired`；
   - task `leased → queued`；
   - 清理当前 lease 和 current attempt；
   - 写入单一 recovery event。
6. 明确 `retry_wait` 是否进入 MVP；保留则补齐完整转换，删除则从 Schema、测试和错误表全部删除。
7. 增加数据库约束或触发器，确保一个 task 最多只有一个 active attempt。

#### 通过标准

- 任意 stale/cancel/reaper 竞态下，task、attempt、event 三者保持一致；
- 所有条件更新零行都能证明后续写入没有发生；
- leased 与 running 的过期路径各有独立测试；
- 不再存在“Schema 有状态、状态图没有”的枚举漂移。

### P0-2：Prompt injection 的信任模型仍然错误

**置信度：10/10**

#### 证据

`PRD-v0.3.md:797-802` 将以下内容标为可信：

```text
用户原始指令         可信             完整权限
模型自己之前的输出   可信但需审计     受限权限
```

自然语言内容不能成为授权来源：

- 已认证用户也可能粘贴恶意或被污染的文本；
- 模型先前输出可能已经吸收网页中的间接 prompt injection；
- “来自用户”不能等价为“允许绕过命令、路径、网络和审批策略”；
- 模型输出永远不能因为是“自己之前生成的”而提升信任等级。

#### 必须修改

信任模型改为：

```text
身份与策略决定权限；文本内容只提供数据，不授予权限。

用户身份 / 设备身份 ──▶ policy engine ──▶ 可调用工具集合
用户文本 / 网页 / 字幕 / 模型输出 ─────▶ 全部作为不可信数据
高副作用动作 ─────────────────────────▶ 参数绑定 approval
```

具体要求：

1. 所有自然语言输入默认不可信，包括用户指令和模型历史输出。
2. 权限来自服务端 policy、项目 allowlist、worker identity 和 approval，不来自 prompt 标签。
3. 研究工作流使用固定工具集合和固定参数 Schema；模型不能动态发明 shell 命令。
4. URL 抓取必须防 SSRF：解析、DNS/IP 校验、重定向后重新校验，并拒绝 loopback、link-local、私网及云 metadata 地址。
5. 用户确实需要执行 shell 时，必须由结构化动作转换层生成 argv，并经过命令/路径策略与必要审批。

#### 通过标准

- 把恶意指令放在用户文本、网页、字幕或模型历史任一位置，都不能扩大工具权限；
- 同一动作无论由哪种文本来源提出，都经过相同 policy；
- 权限测试不再依赖“prompt 来源可信”这一可伪造标签。

### P0-3：Tailscale 与部署拓扑按当前文档无法工作

**置信度：9/10**

#### 证据

PRD 同时规定：

- Control API 只监听 `127.0.0.1:8080`；
- iPhone 通过 Tailscale MagicDNS 地址访问；
- Compose 使用 host network；
- 没有任何 Tailscale Serve、反向代理或 tailnet IP 监听配置。

绑定 loopback 的服务不能直接通过节点的 Tailscale IP 访问。按照 Tailscale 官方文档，若后端只监听 `127.0.0.1`，需要显式配置 `tailscale serve --bg localhost:8080` 或等价 Serve 配置，由 tailscaled 终止 HTTPS 并代理到本地服务。

官方参考：[Tailscale Serve command](https://tailscale.com/docs/reference/tailscale-cli/serve)

同时，部署章节存在双重进程管理：

- §14.1 声称 control、worker、backup 都由 systemd 管理；
- Compose 又对 control 和 backup 使用 `restart: always`；
- 部署命令重启 `harness-worker.service`，再用 Compose 启动 control；
- 架构图说 Worker Adapter 与 Control API 同进程，但进程表又存在独立 worker service。

#### 必须修改

1. 选择唯一的进程管理模型，建议：
   - systemd 只管理一个 `docker compose` stack；
   - Compose 管理 control、worker、UI；
   - 备份只保留 systemd timer 或 Compose loop 二选一。
2. 明确 Worker 是进程内模块还是独立服务，不得同时成立。
3. 增加 Tailscale Serve 的命令、持久化、ACL、MagicDNS 实际主机名和健康检查：

```bash
tailscale serve --bg localhost:8080
tailscale serve status --json
```

4. 明确 UI 与 API 的路由关系；当前 Mobile UI 被定义为独立服务，但 Compose 中没有 UI 服务。
5. 增加从 iPhone 经 tailnet HTTPS 到 API 的真实 E2E 连通性测试。

#### 通过标准

- 干净 newvps 按部署文档启动后，iPhone 能通过唯一的 tailnet URL 打开 UI；
- 主机重启后 Tailscale Serve、Compose 服务和备份定时器均可恢复；
- 同一个进程不会同时被 systemd 和 Compose 两套 restart policy 重复管理。

---

## 3. P1 高优先级问题

### P1-1：Approval 的“一次性消费”缺少可持久化状态

**置信度：9/10**

`approvals` Schema 有 nonce，但没有 `consumed_at`、`consumed_by_attempt` 或明确的 execution 状态。`execution_result` 不能可靠区分“尚未执行”“执行中”“成功”“失败后能否重试”。

建议增加：

- `status CHECK(status IN ('pending','approved','rejected','consuming','consumed','expired'))`；
- `consumed_at`、`consumed_by`；
- 原子条件更新 `approved → consuming`；
- 外部副作用 idempotency key；
- 进程在占用 approval 后、外部调用前后崩溃的恢复规则。

### P1-2：取消状态与状态机定义冲突

**置信度：10/10**

§9.3 声称运行中可取消，并将 attempt 标记为 `interrupted`；但状态表没有 `running → cancelled`，且 `cancelled` 被定义为终态。task 是 cancelled、attempt 是 interrupted 还是两者都 cancelled，目前没有唯一答案。

建议增加规范 cancel 转换，并区分：

- 用户取消：task/attempt `cancelled`；
- Worker 失联：task/attempt `interrupted`；
- 子进程终止超时：`cancel_requested → cancelled` 或明确失败。

### P1-3：文档仍有已声明删除的范围残留

**置信度：10/10**

`PRD-v0.3.md:52` 仍写“MacBook 离线下，任务自动转移到 VPS worker”，但后文和整改表声称该措辞已经删除。这会继续误导后续实现。

此外，多 worker 软评分仍保留“公网 IP 需求”，应明确它只是未来阶段能力，不是 MVP Worker 描述。

### P1-4：Dockerfile 与 backup 容器缺少运行依赖

**置信度：9/10**

- `python:3.11-slim` Dockerfile 没有安装 `curl`，但镜像和 Compose 健康检查都调用 curl；
- `alpine:3.19` 默认没有 `sqlite3`、`age` 和 `scp`，但 backup 脚本依赖全部三项；
- backup 容器没有挂载 `/etc/harness/secrets`，也没有展示 SSH known_hosts 或目标配置来源。

建议使用专用 backup 镜像，在构建时安装并锁定依赖；健康检查改用 Python 标准库，或显式安装 curl。

### P1-5：回滚和镜像发布步骤不可复现

**置信度：9/10**

Compose 的 control 只有 `build: .`、没有 `image:`，因此 `docker compose pull` 不会获得新的 control 镜像。回滚又使用 `git checkout v0.2.1`，但没有规定 tag、构建步骤或不可变镜像 digest。

建议：

- CI 构建并发布带 commit SHA 的镜像；
- Compose 使用 `image: registry/...:${HARNESS_VERSION}`；
- 部署和回滚只切换不可变镜像版本；
- migration 与应用版本建立兼容矩阵，禁止把数据库回滚等同于代码回滚。

### P1-6：不应为迁移再造一个自研工具

**置信度：8/10**

PRD 计划自研约 100 行 migration 工具，但项目已经选择 Python/FastAPI。Alembic 已提供 upgrade、downgrade、history、offline SQL 和 SQLite batch migration，覆盖当前需求。

官方参考：[Alembic documentation](https://alembic.sqlalchemy.org/en/latest/)

建议直接采用 Alembic，并为每个 downgrade 编写恢复测试。只有在 spike 证明 Alembic 不满足约束时，才保留自研方案。

### P1-7：实施顺序无法完成声明的产品验收

**置信度：8/10**

Stage 2 要求 20 个真实任务达到产品验收线，但 Tailscale 入口和移动体验在 Stage 3。产品验收包含手机派工和连续四周使用，因此 Stage 2 在 Stage 3 之前无法按定义验收。

建议调整为：

1. Stage 0：spikes；
2. Stage 1：任务账本与 Worker 闭环；
3. Stage 2：Tailscale + 最小文字 UI；
4. Stage 3：研究工作流 + 20 任务产品验收；
5. 后续才进入体验增强和第二 Worker。

---

## 4. 测试复审

v0.3 已经覆盖单元、集成、E2E、混沌、安全、恢复和 LLM eval 七类测试，方向通过。当前项目尚无实现和测试框架，因此这里审核的是计划覆盖面，不是实际覆盖率。

### 关键路径覆盖图

```text
CODE PATHS                                      USER FLOWS
创建任务                                       手机经 Tailscale 访问
├─ [PLANNED] 输入校验                          ├─ [GAP][E2E] Serve 未配置/重启恢复
├─ [PLANNED] idempotency key                    ├─ [PLANNED] session/CSRF/撤销
└─ [GAP] 相同 key + 不同 payload                └─ [GAP] UI 服务部署与 API 路由

claim / lease / attempt                         执行与恢复
├─ [PLANNED] queued → leased                    ├─ [PLANNED] 正常研究任务
├─ [GAP] leased expiry → queued + expired       ├─ [GAP] 用户取消与 Worker 同时提交
├─ [GAP] renew 同步 task + attempt              ├─ [GAP] reaper 与 renew 同时发生
└─ [GAP] 零行更新必须整体 rollback              └─ [PLANNED] interrupted 手动 retry

LLM / research                                  部署与灾备
├─ [PLANNED][EVAL] 引用真实性                   ├─ [GAP][E2E] 干净主机完整安装
├─ [PLANNED][EVAL] fallback 质量                ├─ [PLANNED] 异机恢复
├─ [GAP] SSRF 与重定向后二次校验                 ├─ [GAP] backup 工具/凭证缺失
└─ [GAP] 用户文本不能授予工具权限               └─ [GAP] 前滚后应用回滚兼容性
```

### 必须补充的测试

1. 相同 idempotency key 搭配不同 payload 时返回冲突，不得静默复用旧任务。
2. claim/start/submit/cancel 每个零行更新后，验证 attempt 和 event 均未变化。
3. renew 与 reaper 并发时最多一个成功，task/attempt lease 一致。
4. leased 过期后旧 attempt 变为 expired，新 claim 才能创建新 attempt。
5. running cancel 与旧 Worker submit 并发时，最终状态唯一且可解释。
6. 用户指令、模型历史、网页、字幕四种来源使用同一权限测试矩阵。
7. URL 抓取覆盖 IPv4/IPv6 loopback、RFC1918、link-local、DNS rebinding、重定向和 metadata endpoint。
8. 干净容器验证 healthcheck、sqlite3、age、scp、known_hosts 和密钥挂载。
9. 主机重启后验证 Tailscale Serve、应用服务、UI 和备份定时器全部恢复。
10. Alembic upgrade/downgrade 与旧/新应用版本兼容性测试。

---

## 5. 性能与容量复审

### 已通过

- 单 Worker 串行执行符合当前物理资源限制；
- 资源数字明确标记为暂定；
- 将 ASR、抓取、AI CLI、临时文件、FD 和 OOM 纳入 spike；
- SQLite 作为单机、低并发 MVP 的事实账本是合理选择；
- 备份采用 `.backup` 而不是直接复制活动数据库文件。

### 待补充

1. `BEGIN IMMEDIATE` 会序列化写事务，所有事务必须保持极短，禁止在事务内进行文件、网络或模型调用。
2. task_events 和 audit_log 需要保留期、归档或分页策略，否则轮询列表与备份体积会持续增长。
3. 研究产物不应作为大文本长期重复存入 tasks、attempts 和 events；DB 保存索引与摘要，正文保存在受控 artifact store。
4. 资源 spike 应分别测量 Control、Worker、ASR 的峰值，避免把可重叠进程的 RSS 简单相加或重复计算。
5. CPU 暂定总需求已经高于 4 核，Stage 0 必须给出限流和负载降级阈值，而不只是记录峰值。

---

## 6. 复审门槛状态

| 门槛 | v0.3 自评 | 本次复审 |
|------|-----------|----------|
| lease/attempt/checkpoint 无冲突 | ✅ | **未通过：事务与过期路径仍冲突** |
| Schema 保留执行历史 | ✅ | **部分通过** |
| 旧 Worker/attempt/approval 无副作用 | ✅ | **未通过：零行后续写与 approval 消费未闭合** |
| 网络、session、设备撤销确定 | ✅ | **部分通过：Tailscale Serve 未定义** |
| 异故障域备份 | ✅ | **方案通过，容器实现草案未通过** |
| 资源预算实测 | 待 spike | **待 spike** |
| 主文/附录/测试无矛盾 | ✅ | **未通过：MacBook、cancel、retry_wait 残留** |
| 部署/升级/migration/回滚可复现 | ✅ | **未通过** |
| dsh spike 证据 | 待 spike | **待 spike** |
| 测试进入实施计划 | ✅ | **通过，需补负路径** |

因此，v0.3 的“8/10 门槛满足”自评偏高。本次独立复审结论为：

- **完整通过：2 项**
- **部分通过：3 项**
- **未通过：3 项**
- **待 spike：2 项**

---

## 7. 给 Claude Code 的修改清单

- [ ] 将所有状态转换改写为明确的应用层事务伪代码
- [ ] 零行条件更新立即 rollback，禁止后续 attempt/event 写入
- [ ] 实现并描述 leased-expiry reaper
- [ ] renew 同步 task 与 attempt lease
- [ ] 决定 `retry_wait` 留或删，并全局统一
- [ ] 增加“每 task 最多一个 active attempt”的约束
- [ ] 将所有自然语言输入改为不可信数据
- [ ] 权限改由 identity + policy + approval 决定
- [ ] 增加 URL SSRF 与重定向安全策略
- [ ] 为 approval 增加消费状态及崩溃恢复规则
- [ ] 统一 cancel、interrupted、failed 三类语义
- [ ] 删除仍残留的 MacBook 自动转移承诺
- [ ] 增加持久化的 Tailscale Serve 配置
- [ ] 明确 UI 服务及 UI/API 路由
- [ ] 选择唯一进程管理模型
- [ ] 补齐 Docker healthcheck 与 backup 镜像依赖
- [ ] 使用不可变镜像版本实现部署和回滚
- [ ] 用 Alembic 替代自研 migration，或提供必须自研的 spike 证据
- [ ] 调整阶段顺序，使手机入口先于 20 任务产品验收
- [ ] 补齐 §4 所列关键负路径测试

---

## 8. 最终结论

v0.3 已经把 Fish Harness 从“架构方向不可信”推进到了“核心方案基本成立，但工程契约尚需最后一轮收口”。推荐继续保持：

> **架构候选，允许 Stage 0 spike 与 PRD v0.4 修订；暂不允许正式 MVP 实施。**

下一版不需要继续增加大章节，应集中修正：

1. task/attempt/event 的原子事务；
2. 内容不授予权限的安全模型；
3. 单一、可启动、可回滚的部署拓扑。

这三项关闭并完成 Stage 0 证据后，可以进行下一次冻结复审。
