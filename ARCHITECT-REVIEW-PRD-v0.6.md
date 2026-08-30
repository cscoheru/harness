# Fish Harness PRD v0.6 架构审验报告

> 审核对象：`PRD-v0.6.md`
> 审核日期：2026-08-29
> 审核姿态：HOLD SCOPE；严格审查当前 read-only Research MVP，同时给出不进入 Stage 1 实现范围的长期扩展建议
> 核验范围：产品目标、Durable Kernel、状态机与事务、安全与数据边界、六个扩展接口、Codex SDK/App Server/exec、CI、备份恢复、可观测性与长期演进
> 总体判定：**产品范围通过，M0 计划通过，Stage 1 实施规范不通过；允许进入 M0 spike，不允许按当前示例直接进入 M1 实现**

---

## 1. 执行摘要

v0.6 是一次有效的方向修正：它把 Stage 1 从平台 v1 收敛为 read-only Research MVP，明确把 external write、Approval reconcile、通用 UI、CapabilityRouter 和 Catalog 推迟，并把 Codex 主 Driver 的决定放回 M0 实测。这些产品与架构决策是正确的。

与 v0.5 相比，以下问题确实取得了实质进展：

- Policy 判定顺序已改为 `deny → needs_approval → allow`；
- retry 上限与逐 task 短事务已经补回；
- WorkflowPack 不再绑定 `codex_sdk` ID；
- ArtifactStore 改为 async，并定义了原子写方向；
- EventEnvelope 增加来源、因果、去重和脱敏字段；
- Codex 附录明确标记为未验证伪代码；
- App Server 远程 WebSocket 没有进入生产方案；
- 数据保留文字矛盾得到修正；
- M0 evidence gate 比“代码写完即关闭”更可信。

但本轮独立运行验证发现，v0.6 又把部分“修订意图”写成了“已修复事实”。目前有六个直接阻塞 Stage 1 的 P0，以及一个阻塞 M2 的 Approval P0：

1. 文档自称 canonical，但基础 task/attempt/event/artifact/audit schema 缺失，六接口中的 ToolProvider 也没有执行协议；
2. claim 会把每次 attempt 的 fence_version 重置为 1，与 task fence 分叉；
3. CancelService 没有真正写入 cancel_requested 状态，finalize 也没有绑定当前 attempt/fence；
4. EgressFetcher 使用不存在的 HTTPX API，目标 Python 3.11 下样例无法导入；
5. “read-only”没有覆盖数据外传、prompt injection、云端模型、成本和本地写入，Tool Policy 没有强制执行点；
6. CI digest/signing 与 Backup E2E 仍不能按样例工作，Backup 脚本甚至没有恢复待验证备份；
7. M2 的 Approval supersede 复用旧 attempt 和旧 policy decision，允许任意参数变化且可并发创建多个后继。

因此 v0.6 的准确定位应是：

```text
产品范围：通过
架构方向：通过
M0 spike 计划：通过
接口草案：部分通过
canonical 实施规范：不通过
Stage 1：阻塞
M2 Approval：阻塞
```

### 独立评分

| 维度 | v0.5 | v0.6 | 说明 |
|------|------|------|------|
| 产品价值 | 8.5/10 | **8.5/10** | 手机研究闭环仍有明确价值 |
| 范围控制 | 5.5/10 | **7.5/10** | read-only 收敛正确，但估算口径仍矛盾 |
| 架构方向 | 8/10 | **8.5/10** | 六接口和 M0 evidence gate 更成熟 |
| 规范自包含性 | 5/10 | **3.5/10** | 宣称 canonical，却缺少基础 schema 与关键执行契约 |
| 状态一致性 | 5/10 | **4.5/10** | retry 改进，但 fence/cancel 新回归是 P0 |
| 安全与数据边界 | 5/10 | **4.5/10** | Policy 修正，但 Egress/Tool/Data flow 未闭环 |
| Codex 集成可信度 | 5/10 | **6.5/10** | 不再假装已验证，但仍混淆集成面与独立后端 |
| 开放性与扩展性 | 8/10 | **8/10** | 接口方向好，Tool Runtime/Memory/Eval 仍缺 |
| 可测试性 | 8/10 | **8.5/10** | M0 证据计划好，但样例尚未进入 CI |
| 可运维性 | 6/10 | **5/10** | 指标补充明显，CI/Backup 仍有确定性错误 |
| MVP 可交付性 | 5.5/10 | **6/10** | 范围变小，但实际总周期应为 8–12 周 |

---

## 2. v0.5 审验意见关闭矩阵

### 2.1 六个 P0

| v0.5 P0 | v0.6 声明 | 独立判定 |
|----------|----------|----------|
| claim SQL / retry 无限循环 | 子查询、MAX_ATTEMPTS、DB 读计数 | **部分关闭；SQL 方向正确，但 fence_version 重置为 1** |
| cancel_requested / Reaper | 独立 CancelService | **未关闭；没有真正切换 status，finalize 可取消错误 attempt** |
| Policy 判定反转 | deny → approval → allow | **核心逻辑关闭；重复样例存在构造错误** |
| Approval 复用 | supersede chain + attempt 绑定 | **consume 改进；supersede 仍复用旧 attempt/decision** |
| EgressFetcher | HTTPX + pinned resolver | **未关闭；所用 HTTPX API 不存在，样例无法导入** |
| CodexSdkDriver 虚构 API | 标记伪代码，M0 再锁定 | **治理方式通过；能力仍未验证，Stage 1 保持阻塞** |

### 2.2 十个 P1

| v0.5 P1 | v0.6 状态 | 独立判定 |
|----------|-----------|----------|
| durable workflow/step 缺失 | Stage 1 单 Driver run | **方向通过；EventEnvelope 仍强制 workflow_run_id** |
| EventSink 字段不足 | 增加 source/sequence/causation/dedupe/redaction | **部分通过；无实际表约束与来源降级规则** |
| WorkflowPack 绑定 driver ID | 改为 capability | **通过** |
| ArtifactStore 原子/async 缺失 | async + atomic write | **部分通过；blob 与逻辑 artifact 仍混为一层** |
| retry scheduler 长事务 | 每 task 短事务 | **通过；但 retry_wait 没有取消入口** |
| CI / Backup 不可运行 | login、digest、cosign、ephemeral port | **未关闭；产生新的 digest、trap、并发和恢复缺口** |
| retention 矛盾 | audit/approval 一年 | **文字关闭；schema、legal hold、清理 job 缺失** |
| canonical 不自包含 | 声称完全 canonical | **未关闭且回归更明显** |
| observability 缺失 | 指标列表 + runbook 模板 | **部分通过；仍无 SLO、标签、阈值和实际 runbook** |
| DB 是唯一事实来源 | 改为 orchestration authority | **通过** |

---

## 3. P0：阻塞 Stage 1

### P0-1：所谓 canonical 文档缺失 Durable Kernel 基础契约

**置信度：10/10**

`PRD-v0.6.md:6-7` 和 `PRD-v0.6.md:2509` 声明 v0.6 是 canonical、自包含文档。

但全文检索 `CREATE TABLE` 只得到：

```text
PRD-v0.6.md:1096 CREATE TABLE approvals (
```

没有 canonical 定义：

- tasks；
- task_attempts；
- task_events；
- artifacts / blobs；
- audit_log；
- active attempt partial unique index；
- status CHECK；
- foreign_keys / WAL / busy_timeout；
- schema version 与 migration baseline。

状态机样例大量引用这些未定义字段，Approval 的外键甚至指向文档中不存在的基础表。

同样，`PRD-v0.6.md:271-323` 只给出 ToolProvider YAML manifest。全文没有 `ToolProvider` Protocol，也没有 `invoke/execute` 请求、响应、取消、超时、错误和事件协议。所谓“六个稳定扩展接口”实际只有五个半契约。

#### 风险

- CC 必须回看旧 PRD 猜 schema，canonical 声明失真；
- 不同实现者会生成不兼容状态枚举、索引和迁移；
- Policy 无法证明在每次 tool invocation 前被执行；
- executable examples 无法进入同一 CI baseline。

#### 必须修改

不要继续把产品 PRD、架构规格和实现代码塞进一个文件。建议 v0.7 拆成：

```text
PRD-v0.7.md                    产品目标、范围、用户流程、指标、Stage gate
spec/kernel-schema.sql         完整 schema + index + pragma
spec/state-transitions.md      每个原子转换与不变量
spec/interfaces/*.py           六接口可导入 Protocol
spec/events/*.jsonschema       Event/payload schemas
spikes/m0/                     Codex/Egress/SQLite 可执行证据
adr/                           已决定且稳定的架构决定
```

PRD 可以引用这些**当前版本内的 canonical artifact**，但不能引用历史 PRD 补齐缺失契约。

#### 通过标准

- 从空目录只用 v0.7 当前版本文件即可创建数据库并运行 10 次 claim；
- 六接口全部能 import，并有最小第二实现 conformance test；
- 所有 status、index、FK、retention 和 migration baseline 只有一个定义源。

### P0-2：claim 修复引入 fence_version 分叉

**置信度：10/10**

`PRD-v0.6.md:559-567` 创建 attempt 时把 fence_version 写死为 `1`；`PRD-v0.6.md:569-584` 又把 task 的既有 fence_version 加 1；event 与返回值在 `PRD-v0.6.md:589-597` 继续写死为 1。

最小 SQLite 复现：先让 task fence_version=7，再执行同形 claim，结果为：

```text
task.fence_version | attempt.fence_version
8                  | 1
```

下一步 `fail_attempt()` 在 `PRD-v0.6.md:645-672` 同时用调用者 fence 校验 task 和 attempt。无论调用者拿 1 还是 8，总有一侧失败。因此第二次及后续 attempt 无法正常提交失败、成功或 renew。

另外：

- `PRD-v0.6.md:518` 仍声称从 RETURNING 读取 attempt_count，当前实现已经没有 RETURNING；
- `PRD-v0.6.md:992-1040` 写成 `def db.transaction(...)`，这是 Python SyntaxError；
- `BEGIN {mode}` 没有将 mode 限定为枚举。

#### 必须修改

claim 必须只计算一次 `new_fence = current_fence + 1`，并把同一个值写入：

```text
tasks.fence_version
task_attempts.fence_version
lease_granted payload
ClaimedTask.fence_version
```

candidate SELECT 必须同时读取 current fence。Transaction 应成为数据库类的方法，或合法的顶层 contextmanager，并将 mode 限定为 `DEFERRED | IMMEDIATE | EXCLUSIVE`。

#### 通过标准

- 连续 10 次 claim，task/attempt/returned/event fence 每次都相等且单调递增；
- stale worker 的 renew/submit/fail 全部返回 conflict；
- PRD 声称 executable 的 Python 样例在目标 Python 3.11 下 compile/import。

### P0-3：CancelService 仍没有可证明的状态与竞态语义

**置信度：10/10**

`cancel_leased_or_running()` 在 `PRD-v0.6.md:792-828` 声称执行：

```text
leased/running → cancel_requested
```

实际 UPDATE 只写 `cancel_requested_at`，没有写 `status='cancel_requested'`。task 仍显示 leased/running，文档的状态图与数据库事实不一致。

`finalize_cancel_requested()` 在 `PRD-v0.6.md:831-860` 又存在更严重的竞态：

- task UPDATE 没校验 `current_attempt_id = attempt_id`；
- 没校验 lease_token / fence_version / status_version；
- attempt UPDATE 没校验该 attempt 属于 task；
- 旧 interrupt 回调可以取消后来启动的新 attempt；
- 没有定义 interrupt 请求的 outbox、重试、deadline 或超时强制终止。

此外，`retry_wait_to_queued()` 的最终 UPDATE 在 `PRD-v0.6.md:733-742` 没有再次检查 cancel_requested_at，CancelService 也没有 retry_wait 取消路径。用户无法可靠取消正在退避的任务。

#### 推荐状态模型

```text
cancel_requested_at = 用户意图时间
status               = 当前编排状态
cancel_generation    = 单调版本

queued/retry_wait ──CAS──▶ cancelled
leased/running ──CAS──▶ cancelling
cancelling ──outbox──▶ driver.interrupt(expected attempt/fence)
cancelling ──ack/timeout──▶ cancelled
```

状态名可以用 `cancelling` 或 `cancel_requested`，但数据库、API、UI、Reaper 和 Driver 回调必须使用同一个事实模型。

#### 通过标准

- queued、retry_wait、leased、running 都有取消路径；
- finalize 必须绑定 task_id + current_attempt_id + lease/fence + cancel_generation；
- 旧 attempt 的 interrupt ack 不能取消新 attempt；
- interrupt 丢失、重复、超时、Driver 已结束均有确定结果和用户可见状态。

### P0-4：EgressFetcher 的 HTTPX 接口不存在，目标 Python 下无法导入

**置信度：10/10**

`PRD-v0.6.md:1514` 继承 `httpx.AsyncResolver`，`PRD-v0.6.md:1560-1563` 向 `httpx.AsyncHTTPTransport` 传 `resolver=`。

本轮在当前环境 HTTPX 0.28.1 实测：

```text
hasattr(httpx, "AsyncResolver") = False
AsyncHTTPTransport(..., local_address, retries, socket_options)
没有 resolver 参数
```

因此样例在 class definition / transport construction 时即失败。

此外还有确定性错误：

- `PRD-v0.6.md:1539` 的 `family == socket.AF_INET6 or "https"` 永远为真；
- async resolver 内调用同步 `socket.getaddrinfo()`，会阻塞 event loop；
- `FetchResult` 在 Python 3.11 中先被返回类型引用、后定义，且没有 future annotations；实测得到 NameError；
- `dataclass` 与 `sha256` 未导入；
- `resp.extensions["peer"]` 不是文档保证的 HTTPX 公共契约，校验可能永远不运行；
- blocked_networks 构造参数没有被 `is_blocked()` 使用；
- client 没有生命周期关闭；
- audit_chain 保存完整 URL，可能把 query token 写入审计。

这不是“待网络测试”的边角问题，而是样例不能启动。

#### 必须修改

在 M0 做明确选型，不要把内部 resolver hook 伪装成 HTTPX 公共 API：

```text
A. 独立 egress proxy，Harness 只连接代理                最稳定
B. 版本锁定的 httpcore AsyncNetworkBackend             可行但维护成本高
C. 每请求建立到已验证 IP 的 transport，同时保留 Host/SNI 需严格实现
```

无论选哪种，都要验证 resolved set、actual peer、redirect target、Host/SNI、压缩后大小、连接池复用与 DNS TTL。URL 审计必须去除 userinfo 和敏感 query。

#### 通过标准

- 目标 Docker Python/HTTPX 版本下 import/construct 成功；
- http:80、https:443、自定义端口、IPv4/IPv6 有真实服务测试；
- keep-alive 连接不会跨 host/policy 错复用；
- DNS rebinding、redirect、gzip bomb、slowloris、max+1 和 peer mismatch 全部可复现拒绝。

### P0-5：ToolProvider 没有执行网关，“read-only”也不是安全边界

**置信度：9/10**

`PRD-v0.6.md:271-323` 只定义 manifest；没有实际调用契约，也没有说明工具由谁执行：

- Harness 先跑 steps，再把结果交给 Codex；
- Codex 通过 MCP 调 Harness tool；
- Driver 直接注册原生工具；
- Worker 进程内动态 import implementation。

这些方案的审批、sandbox、secret、取消、event 和故障恢复语义完全不同。

同时，`PRD-v0.6.md:1935-1937` 与 `PRD-v0.6.md:2002-2007` 把 Stage 1 描述为 read-only、无外部副作用，却包含：

- web.search / web.fetch 的网络请求与第三方日志；
- Codex 云端模型的数据传输和 token 成本；
- audio.transcribe 可能向外部服务上传音频；
- note.read 读取本地 vault；
- artifact.write 写本地持久化数据。

“没有 external write API”不等于“无副作用”或“不会泄露数据”。尤其 note.read 在 Research pack 中没有使用，却扩大了最小权限面。

#### 必须修改

定义唯一的 ToolInvocationGateway：

```text
ToolCallRequest
  tool_id/version + canonical args hash
  task/attempt/fence + actor/project
  policy_decision_id/version
  data labels + secret refs
  timeout/budget/idempotency key

ToolInvocationGateway
  validate schema → enforce policy → resolve secret refs
  → execute in declared sandbox/network boundary
  → emit start/progress/result/error events
  → return small result or ArtifactRef
```

Stage 1 应删除未使用的 note.read。若 audio.transcribe 不是纯本地实现，必须明确供应方、数据保留、地区和 egress policy。网页与字幕内容标记为 untrusted/tainted，不得通过 prompt 指令扩大工具或数据权限。

#### 通过标准

- 每个真实 tool call 都能证明经过 PolicyDecision；
- prompt/web content 不能选择 secret、扩大 scope 或改变 policy；
- data classification 能阻止 internal/secret 内容发往不允许的模型、工具或域名；
- Stage 1 capability allowlist 只包含 Research vertical slice 实际使用能力。

### P0-6：CI 与 Backup E2E 仍不构成可执行恢复闭环

**置信度：10/10**

#### CI digest/signing

`PRD-v0.6.md:2139-2155` 使用 build-push-action 推送镜像，随后用本地 `docker inspect` 读取 digest。但 build-push-action 的 `load` 默认 false，推送后的镜像不保证在本地 Docker daemon 中。

官方 [docker/build-push-action v5](https://github.com/docker/build-push-action/tree/v5#outputs) 已直接提供 `digest` output。当前 workflow 没给 build step 设置 id，反而增加了会失败的 inspect 步骤。它还没有安装 cosign；`subject-digest` 也不应传完整 `repo@digest` 字符串。

正确方向是：

```yaml
- id: build
  uses: docker/build-push-action@v5
  with:
    push: true
    tags: ...
- uses: sigstore/cosign-installer@...
- run: cosign sign ...@${{ steps.build.outputs.digest }}
```

并把 verify identity 固定到具体 repository/workflow/ref 与 OIDC issuer，而不是宽泛的 `https://github.com/cscoheru` regexp。

#### Backup E2E

`PRD-v0.6.md:2186-2235` 的脚本没有任何一步把某个备份恢复为 `/tmp/verify/backup.db`。它只启动一个指向固定目录的容器，因此无法证明“备份可恢复”。

脚本还有：

- `trap cleanup` 在 cleanup 函数定义之前注册；若早期命令失败，实测为 `cleanup: command not found`；
- 固定 container name `harness-verify`；
- 固定 host path `/tmp/verify`；
- 并发运行会互相停止容器、删除目录或验证错误数据；
- health loop 30 次都失败后没有显式失败断言，仍继续 db-check；
- `rm -rf /tmp/verify` 目标过宽，不应出现在恢复验证样例；
- 没有验证 backup manifest、checksum、schema version、artifact blobs 和 point-in-time 一致性。

`PRD-v0.6.md:2316` 还写“env 文件 + Compose 配置在 git 内”。含 secret 的 env 文件绝不能进入 Git；只能提交无 secret 的模板和 secret reference。

#### 通过标准

- CI 使用 action 原生 digest output，签名和 attestation 输入格式经 workflow lint/真实 run 验证；
- restore job 使用 `mktemp -d`、唯一 container/network 名，并先复制/解密/校验指定 backup；
- 两个 restore verify 并发运行互不影响；
- 在隔离主机上从空目录恢复 DB + artifacts，并运行业务不变量查询；
- Git 只保存 `.env.example` / secret names，不保存生产 secret 值。

---

## 4. P0-M2：Approval supersede 仍可能扩权或重复执行

**置信度：10/10**

这是 M2 阻塞项，不阻止 read-only M1，但不能标记为“v0.6 已关闭”。

`supersede_approval()` 在 `PRD-v0.6.md:1355-1402`：

- 不要求 old approval 为 unknown；pending、approved、succeeded 都能被 supersede；
- 新 approval 继续使用 old attempt_id；
- 接受任意 new_action_params；
- 复用 old policy_decision_id，却允许传入新的 policy_version；
- 没有重新执行 PolicyDecision；
- supersedes_approval_id 没有 UNIQUE/CAS，一个 old approval 可并发产生多个 child；
- old approval 没有进入 terminal `superseded` 状态。

这违反上一轮要求的“新 attempt + 新 approval + 新 policy decision”，并可能让已审批的小参数动作变成不同的大参数动作。

#### 必须修改

supersede 应是 Kernel service，而不是复制行：

```text
确认 old.status == unknown
→ 外部状态查询/人工决定允许 retry
→ 创建 new attempt
→ 对 canonical action/resource/params/actor 重新做 PolicyDecision
→ 创建唯一 child approval
→ CAS old: unknown → superseded
```

数据库增加 `UNIQUE(supersedes_approval_id) WHERE supersedes_approval_id IS NOT NULL`，并为 consumed_by_attempt_id 增加 FK。approved 过期也必须进入 expired；revoked 状态必须有合法入口。

---

## 5. P1 高优先级问题

### P1-1：Codex 三个 Driver 是三种集成面，不是三个独立执行后端

当前官方 Python SDK 文档说明：Python SDK 通过 JSON-RPC 控制本地 Codex app-server。也就是说：

```text
CodexSdkDriver ─┐
                ├─ 同一个 Codex runtime / app-server failure domain
AppServerDriver ┘
CodexExecDriver ── 同一 CLI runtime 的 batch surface
```

`PRD-v0.6.md:1730-1738` 把它们写成三选一“主 Driver”可以用于 M0 比较 API 易用性，但不能把 exec 当成真正的高可用 fallback。

建议分成：

- RuntimeBackend：Codex local runtime、未来其他 agent runtime；
- IntegrationAdapter：Python SDK、raw app-server、exec JSONL；
- CapabilityEvidence：版本、schema hash、实测用例、通过时间。

官方 Python SDK 当前示例是 `thread_start(...)` 后 `thread.run(prompt)`，sandbox preset 为 `Sandbox.read_only`；而 `PRD-v0.6.md:1803-1857` 仍把全部 capability 预设 true，并使用 `thread_start(input=...)`、`Sandbox.workspace_read()`、`resume_thread()`、`interrupt_thread()`、`events()` 等未由当前官方页面确认的接口。

因为文档明确标为伪代码，这不是新的实现 P0；但 `capabilities()` 在 spike 前不得返回 true。应改为 generated evidence manifest，未验证一律 false/unknown。

官方参考：

- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex MCP Server deprecation](https://learn.chatgpt.com/docs/mcp-server)

### P1-2：Stage 1 工期口径相加错误

`PRD-v0.6.md:1952-1959` 写：

```text
M0 2–3 周
M1 6–9 周
Stage 1 总投入 6–9 周
```

若 M0 是进入 M1 的前置，端到端总投入应是 8–12 周；只有在“6–9 周已含 M0”时才成立，但表格没有这样写。

建议把计划写成：

```text
M0：2–3 周
M1 build：4–6 周
M1 pilot：2–3 周
Stage 1 total：8–12 周，或明确哪些工作并行
```

并分别给出 human effort、CC+Codex effort 和 calendar time。

### P1-3：重复规范已经发生漂移

`PRD-v0.6.md:398-425` 的 PolicyDecision 构造缺少 dataclass 在 `PRD-v0.6.md:435-436` 声明为必填的 expires_at 与 decision_id；`PRD-v0.6.md:1405-1454` 的第二版才补齐。

WorkflowPack 也在正文与附录重复定义。重复的 executable sample 会继续产生 v0.5/v0.6 这种“修了 A、遗漏 B”的漂移。

解决方式不是再复制一份，而是把可执行定义移到 spec 文件，PRD 只引用唯一源和关键片段。

### P1-4：EventEnvelope 强制 workflow_run_id 与 Stage 1 决策冲突

`PRD-v0.6.md:444-483` 把 workflow_run_id 定义为必填 string；同一文档又明确 Stage 1 不创建 workflow_run/step_run。Codex adapter 在 `PRD-v0.6.md:1894-1897` 只能从 metadata 读取，通常得到 None。

Stage 1 应使用必填 execution_id/attempt_id；workflow_run_id 在真正 Workflow Runtime 出现前为 Optional。不要制造一个没有持久化 authority 的伪 run ID。

### P1-5：ArtifactRef 与 Blob 去重模型混在一起

`PRD-v0.6.md:326-376` 要求 content_hash UNIQUE，但 ArtifactRef 同时携带 producer、source、visibility、retention 和 sensitivity。同一正文可能由不同任务、来源和敏感度产生；直接让 ArtifactRef content_hash 唯一会丢失逻辑 provenance 或错误复用保留策略。

建议两层：

```text
blobs(content_hash PK, bytes, media_type, storage_key, encryption_key_ref)
artifacts(artifact_id PK, blob_hash FK, producer, source, sensitivity, retention, lineage)
task_artifacts(task_id, artifact_id, role)
```

### P1-6：Capability vocabulary 还不能被 DriverCapabilities 表达

WorkflowPack 要求 `sandbox_workspace_read`，但 `DriverCapabilities` 只有 resume/interrupt/stream/fork/structured_output 五个 bool。没有 sandbox、tool transport、network、approval bridge、event replay、max context、model class和 data residency。

短期不需要 CapabilityRouter，但 M0 必须用同一 typed vocabulary 比较 adapter，否则“按 capability 选择”仍是文档口号。

### P1-7：Observability 只有指标名，没有运行契约

`PRD-v0.6.md:2262-2288` 是良好清单，但没有：

- counter/gauge/histogram 类型；
- labels 与基数上限；
- SLI/SLO；
- warning/critical 阈值；
- owner 与 runbook URL；
- trace/correlation propagation；
- 用户可见降级状态。

M1 最小集合建议只保留 queue age、task terminal ratio、driver error、artifact failure、backup/restore age、disk free，并为每项写一个可执行告警和 runbook。

### P1-8：Retention 仍只有表格，没有删除系统

`PRD-v0.6.md:2244-2258` 提到 legal_hold，但 Approval schema 没有该字段，其他表也未定义；没有 sweeper、归档、级联顺序、backup 中的删除传播或用户删除 tombstone。

另外，tasks 永久保存不是数据最小化默认值。更合理的是可配置期限或保留摘要，原输入与大 artifact 使用更短期限。

### P1-9：Research 验收只证明“出报告”，没有证明“报告有用”

`PRD-v0.6.md:2000-2013` 的 M1 退出标准只有 20 个任务、一小时内可见和重启可恢复。建议增加：

- citation coverage；
- source validity / fetch success；
- claim-source entailment 抽检；
- source diversity 与 freshness；
- 用户采用率 / 二次编辑率；
- p50/p95 latency；
- 单任务 token、现金成本和失败成本；
- 用户标记“有用/无用/需重做”的反馈闭环。

否则 Durable Kernel 可能非常可靠地生产没人使用的报告。

### P1-10：缺少不可信研究内容的传播模型

安全测试提到 secret 和 SSRF，但没有定义网页、字幕、笔记中的 prompt injection 如何传播。建议在 Artifact/Event/ToolCall 上增加 trust labels：

```text
trusted_user_input
internal_data
untrusted_external_content
model_generated
verified_fact
```

Policy 必须依据数据来源和目标 sink 做信息流判断。网页中的文本永远不能提升权限、选择 secret 或改变 Tool manifest。

---

## 6. 产品范围与交付建议

### 6.1 保持 read-only 方向，但进一步做最小权限切片

建议 Stage 1 只交付：

```text
一个入口：Tailscale Web UI
一个工作流：Research
一个 Codex integration adapter
三个能力：web.search + web.fetch + artifact.write
一个结果：带引用的 Markdown report
一个恢复目标：进程重启后任务可继续或明确失败
```

audio.transcribe 可作为 M1.1，note.read 等真正出现用户场景后再加入。这样既保留六接口，又减少数据泄露面和测试矩阵。

### 6.2 把 M0 的退出结果变成可审计产品决定

M0 不应只输出“选了 SDK”。建议输出：

```text
capabilities.json
runtime-version.txt
app-server-schema/
exec-events.jsonl
sdk-contract-tests.xml
egress-contract-tests.xml
sqlite-invariants.xml
ADR-xxxx-driver-selection.md
```

CapabilityProfile 必须由这些 evidence 生成，而不是手写 bool。

### 6.3 M1 用户成功指标

| 类别 | 最小指标 |
|------|----------|
| 价值 | ≥60% pilot 报告被打开，≥40% 被标记有用或继续追问 |
| 质量 | citation coverage ≥90%，抽检 claim-source 支持率达门槛 |
| 时延 | p50 < 15 分钟，p95 < 60 分钟 |
| 可靠性 | terminal success ≥90%，无静默丢任务 |
| 恢复 | kill/restart 后 100% 进入可解释终态 |
| 成本 | 每任务预算和 p95 成本可见，超预算明确停止 |
| 安全 | 0 次 internal/secret 数据越权外传 |

具体数字可在 pilot 后调整，但指标类别不能缺。

---

## 7. 开放性与创新性建议

以下建议用于预留契约，不要求全部进入 Stage 1。

### 7.1 把六接口放入四个平面

```text
Edge Plane
  ChannelAdapter · TriggerSource
          │
Control Plane
  Goal · Task · Attempt · Policy · Budget · Event
          │
Execution Plane
  WorkflowPack · ToolInvocationGateway · RuntimeAdapter
          │
Knowledge Plane
  Artifact/Evidence Graph · ContextProvider · MemoryStore · Evaluator
```

当前六接口覆盖了 Control/Execution 的大部分，但数字分身长期闭环所需的 Channel、Context/Memory 和 Evaluator 尚未有归属。现在只预留稳定 ID、Event 类型与数据 ownership，等第二真实场景出现再实现。

### 7.2 Driver 拆成 RuntimeBackend 与 IntegrationAdapter

SDK/App Server/exec 是同一 Codex runtime 的不同集成面。拆层后可以真正支持：

- Codex runtime + Python SDK adapter；
- Codex runtime + raw app-server adapter；
- 未来其他 runtime + 自身 adapter；
- 同一 conformance suite 比较 integration surface；
- 明确哪些 fallback 共享 failure domain。

### 7.3 ToolProvider 升级为可移植 Tool Package

长期包结构可以包含：

```text
manifest.yaml
input/output JSON Schema
runtime adapter
policy defaults
egress/secrets declaration
conformance fixtures
signature/provenance
```

先实现本地 registry；只有出现第二团队或第三方包后再做 catalog/marketplace。

### 7.4 从 ArtifactStore 进化为 Evidence Graph

Research 的差异化不应只是生成 Markdown，而应保存：

```text
Source → Snapshot → Claim → Citation → Report → User feedback
```

这能支持：

- 引用失效检测；
- 增量研究与 freshness refresh；
- 冲突来源对照；
- branch-and-judge；
- 报告局部重算；
- evaluator 和用户反馈回写。

### 7.5 增加 Evaluator SPI，而不是把质量写死在 WorkflowPack

Evaluator 可以检查 citation coverage、结构完整性、来源多样性、claim support 和成本。它应输出 versioned EvaluationArtifact，不直接修改原报告。

这为数字分身的 `Outcome → Evaluation → Memory` 闭环提供稳定扩展点，也方便未来替换模型或引入人类审阅。

### 7.6 Capability 不只是布尔值

建议 CapabilityProfile 支持：

```text
feature          structured_output / event_replay / approval_bridge
limits           context / concurrency / artifact bytes
trust            sandbox / data residency / network policy
economics        latency class / price class
evidence         runtime version / schema hash / contract test ID
```

这样未来的 Router 才能依据质量、成本、信任和可用性选择，而不只是 supports_streaming=true。

---

## 8. 测试与验证补充

### 8.1 本轮已执行的独立验证

| 验证 | 结果 |
|------|------|
| HTTPX 0.28.1 API introspection | 无 AsyncResolver；AsyncHTTPTransport 无 resolver 参数 |
| Python 3.11 forward annotation | Egress 样例的 FetchResult 前置引用触发 NameError |
| Python transaction snippet compile | `def db.transaction` 触发 SyntaxError |
| SQLite fence simulation | task fence=8、attempt fence=1，确认分叉 |
| Bash early failure + late cleanup definition | trap 执行时报 cleanup command not found |
| 全文 schema 检索 | 只有 approvals 一个 CREATE TABLE |
| Tool execution contract 检索 | 无 ToolProvider Protocol / invoke / execute contract |
| 本机 Codex CLI | 0.149.0-alpha.4.1；app-server 支持 schema generation 与 stdio/unix/ws |
| 官方 Codex SDK | Python stable SDK，thread_start + thread.run，SDK 控制本地 app-server |

### 8.2 M0 必增回归测试

- fence monotonicity across 10 attempts；
- cancel vs renew/reaper/submit/fail/interrupt-ack 全竞态；
- retry_wait cancel；
- ToolGateway policy token、taint、secret 和 timeout；
- Egress target-version import/construct test；
- two concurrent backup restore verification jobs；
- CI workflow dry run / actionlint；
- SDK/AppServer schema compatibility；
- report citation quality eval；
- data classification → model/tool/domain information-flow tests。

---

## 9. 给 Claude Code 的 v0.7 修改清单

### Stage 1 冻结项

- [ ] 补齐 canonical kernel schema、index、pragma 与 migration baseline；
- [ ] 把 executable spec 移出 PRD，消除重复代码；
- [ ] claim 使用同一个 new_fence 写 task/attempt/event/return；
- [ ] 修正 Transaction contextmanager 语法并限制 mode；
- [ ] CancelService 真正定义 cancelling 状态或明确 flag-only 模型；
- [ ] finalize cancel 绑定 current attempt + lease/fence + generation；
- [ ] 增加 retry_wait cancel 与 interrupt outbox/timeout；
- [ ] 重做 Egress 技术选型，禁止使用不存在的 HTTPX resolver API；
- [ ] 定义 ToolInvocationGateway 与 policy enforcement point；
- [ ] Stage 1 删除未使用 note.read，明确 audio.transcribe 数据边界；
- [ ] 修复 CI：build step id + native digest output + cosign install + identity pin；
- [ ] 重写 Backup E2E：真实 restore、mktemp、唯一资源、并发安全；
- [ ] 删除“env 文件在 git 内”，改为 template + secret reference；
- [ ] 修正 Stage 1 总工期为一致口径；
- [ ] 用质量、成本、安全指标补齐 20-task pilot。

### M2 冻结项

- [ ] supersede 仅允许 old unknown；
- [ ] new approval 必须绑定 new attempt；
- [ ] 新参数重新跑 PolicyDecision，不复用旧 decision ID；
- [ ] old approval CAS 到 superseded；
- [ ] 一个 old approval 最多一个 child；
- [ ] approved expiry、revoked、consumed_by_attempt FK 闭环。

### 扩展性高优先级

- [ ] 把 ToolProvider 从 manifest 补成可调用接口；
- [ ] RuntimeBackend 与 IntegrationAdapter 分层；
- [ ] blob / artifact / task link 三层数据模型；
- [ ] EventEnvelope 的 workflow_run_id 在 M1 改为 Optional；
- [ ] CapabilityProfile 绑定 evidence，而不是手写 bool；
- [ ] 预留 ContextProvider / MemoryStore / Evaluator / ChannelAdapter ID 与事件；
- [ ] 第二真实 pack 出现前不实现 Catalog/Marketplace。

---

## 10. 最终审验结论

### 判定

**产品范围通过，M0 计划通过，Stage 1 实施规范不通过。**

v0.6 最大的进步不是某段代码，而是承认尚需 spike，并把 Stage 1 收回到 read-only Research。这个变化显著提高了成功概率。六接口、orchestration authority、evidence gate 和可替换执行层仍值得保留。

但当前文档仍把“计划在 M0 验证”与“示例已经修复”混在一起。Fence、Cancel、Egress、Tool invocation、CI/Backup 都存在可以立即复现的错误；canonical 声明也与基础 schema 缺失冲突。

### 允许继续

- 按 M0 建立真实、可执行的 evidence artifacts；
- 选择 Codex Python SDK 或 raw App Server 集成面；
- 实现最小 SQLite transition tests；
- 选定真实可行的 Egress 架构；
- 定义 ToolInvocationGateway；
- 把 v0.7 拆成 PRD + canonical executable spec。

### 暂不允许

- 复制当前 claim/cancel/Egress 样例进入生产代码；
- 宣布六个接口已经稳定；
- 按当前 CI/Backup 样例部署或验证恢复；
- 开放 note.read 给 Research Agent；
- 把 Codex exec 当成独立高可用 fallback；
- 在 M2 使用当前 Approval supersede；
- 以“6 P0 + 10 P1 已关闭”为由进入 M1。

### 进入 M1 的硬门槛

```text
1. 当前版本具备完整、唯一、可执行的 kernel schema
2. fence/cancel/retry 不变量在目标 Python/SQLite 环境通过
3. ToolInvocationGateway 和数据分类强制执行可证明
4. Egress 在目标依赖版本下通过真实网络安全测试
5. Codex capability profile 由 runtime evidence 自动产生
6. CI image digest/signature/attestation 真实跑通
7. 指定 backup 在隔离环境并发安全地恢复 DB + artifacts
8. web-only Research vertical slice 通过质量、成本、恢复和安全门槛
```

推荐下一版叫 v0.7，并把目标限定为：**一份可信的 M0 executable contract，而不是继续扩写单体 PRD。** 这样能同时提高可交付性、开放性和后续创新速度。
