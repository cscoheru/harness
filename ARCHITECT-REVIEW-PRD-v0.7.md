# Fish Harness PRD v0.7 架构复审

> 复审日期：2026-08-29  
> 复审输入：`RESPONSE-TO-CODEX-v0.6-REVIEW.md` 的复审清单  
> 验证范围：清单指向的 `spec/`、`spikes/`，以及清单明确列出的 `.github/workflows/m0-contract-tests.yml`  
> 未审范围：未重新通读 `PRD-v0.7.md`，未复核 ADR 的产品决策，也不评价清单之外的新需求

## 1. 结论

**结论：CHANGES REQUIRED。v0.7 已从“PRD 中的伪代码”进步到可导入、可执行的契约资产，但 `RESPONSE-TO-CODEX-v0.6-REVIEW.md` 中多项 `✅ fixed` 与实际证据不符，当前仍不满足进入 M1 的硬门槛。**

本轮最重要的结论是：已有 spike 的正常路径退出码不能证明所声明的不变量。补充反例验证后，仍可复现以下阻塞问题：

1. `claim()` 可在终态 task 上创建 active attempt，fence trigger 也允许任意大于 task fence 的值。
2. `finalize_cancel()` 无需经过 `cancel_requested`，还可以用 task A 的 attempt 将 task B 置为 canceled。
3. 同一个 `unknown` approval 可以被重复 supersede；清单声称覆盖的 `supersede × supersede` 实际没有测试且反例成功。
4. `ToolInvocationGateway` spike 只验证对象存在 `invoke()`，没有验证 policy、audit、lease/fence、provider、artifact 和 task link 六步链。
5. state spec 的 reaper SQL 写入不存在的 `attempts_failed` 表，无法在 canonical schema 上执行。
6. trust label 已出现在类型和列中，但 policy spike 完全忽略它，事件 schema 也没有将其设为必填，传播模型尚未形成强制闭环。

因此，v0.6 的 **P0-2、P0-3、P0-5、P0-M2 仍未关闭**；P0-4、P0-6 仍是明确 deferred；P1-10 只有结构占位，没有达到 `fixed`。

## 2. 实测结果

| 验证项 | 结果 | 说明 |
|---|---:|---|
| fresh SQLite 应用 `spec/kernel-schema.sql` | ✅ | 成功创建 9 张业务表、2 张元数据表及 SQLite 内部表 |
| schema 声称的索引数量 | ⚠️ | 实际为 **17 个显式索引**，不是回应文件写的 16 个；另有 10 个自动索引 |
| `import spec.interfaces` | ✅ | Python 3.14.3 下导入成功 |
| 7 个 event JSON Schema 元验证 | ✅ | Draft 2020-12 schema 均为合法 schema；这不等价于验证真实 event instance |
| claim/fence spike | ✅ | 正常路径退出 0，但未覆盖终态 claim 和 oversized fence 反例 |
| cancel race spike | ✅ | 脚本退出 0，但所谓 race 均为顺序调用，且 finalize 反例失败 |
| policy direction spike | ✅ | deny 优先级示例退出 0，但 trust label 参数未参与决策 |
| approval supersede spike | ✅ | 脚本内 5 个 case 退出 0，但未覆盖重复 supersede |
| egress spike | 🟡 | 受限网络中因真实 DNS 查询失败；允许网络后退出 0。它只证明旧 API 不存在，没有证明 pinned egress |
| conformance spike | 🟡 | 退出 0，但只实例化/检查 5 个 Protocol，遗漏 `ToolProvider` 和 `ArtifactStore` |
| CI workflow 静态检查 | 🟡 | 文件包含 9 个 job，而非回应文件所称 8 个；本轮没有把本地文件存在等同于 GitHub-hosted runner 已跑绿 |

实测环境：Python 3.14.3、SQLite 3.50.4、httpx 0.28.1、jsonschema 4.26.0。CI 声明的 Python 3.12 本机不可用，因此没有伪称本地完成 3.12 复现。

## 3. P0 清单逐项复核

| 条目 | 回应状态 | 复审判定 | 证据与原因 |
|---|---:|---:|---|
| P0-1 canonical kernel schema | ✅ fixed | ✅ 核心通过，文案需修正 | schema 可在 fresh SQLite 应用，9 张业务表存在；显式索引实为 17 个。后续状态机引用不存在的表，说明“全部执行契约完整”仍不能由 schema apply 单独推出 |
| P0-2 fence 分叉 | ✅ fixed | ❌ 未关闭 | trigger 在 `spec/kernel-schema.sql:215-223` 只拒绝 `attempt fence < task fence`，并不强制相等；`claim()` 在 `spikes/m0/_helpers.py:60-78` 不检查 task UPDATE 的 rowcount。实测终态 task 可新增 claimed attempt，且 task fence=5 时 attempt fence=999 可插入 |
| P0-3 cancel 状态与竞态 | ✅ fixed | ❌ 未关闭 | `status_version` 只有默认值，没有任何转换递增它；`finalize_cancel()` 未绑定 `task_id` 和 `attempt.status='cancel_requested'`。实测未 request cancel 也能 finalize，并可跨 task 取消另一个任务。reaper spec 还写入不存在的 `attempts_failed` 表 |
| P0-4 HTTPX egress | ✅ + 🟡 deferred | 🟡 部分验证 | 正确证明 `httpx.AsyncResolver` 不存在；但 `pinned_ips` 从未传入 transport，`fetch_with_pinned_resolver()` 也未执行。脚本实际调用公共 DNS，与“CI 不需要网络”的注释相反；安全 egress 仍未证明 |
| P0-5 ToolProvider gateway | ✅ fixed | ❌ 未关闭 | Protocol 已增加，但 `_TrivialGateway` 只返回 denial。它没有 PDP、audit、lease/fence、provider、artifact store、task link，仍能通过 runtime Protocol 检查，因此 spike 不能证明 gateway 是唯一执行路径或六步链被强制 |
| P0-6 CI + Backup E2E | 🟡 deferred | 🟡 未关闭，状态基本诚实 | workflow 文件存在，局部命令可运行；但没有本轮可见的 hosted-runner run 证据，Backup E2E 也明确缺失。不能计为 P0 已修复 |
| P0 段落级语法/status_version | ✅ fixed | 🟡 部分通过 | Python 文件可导入/执行，语法问题消失；但“所有状态转换都 bump status_version”与 schema、state spec、cancel spike 均不符 |
| P0-M2 approval supersede | ✅ fixed | ❌ 未关闭 | `attempt_supersede()` 读取 old 后直接 INSERT，不更新/占用 old，也没有唯一约束。实测同一 old approval 可成功 supersede 两次；`spec/state-transitions.md:188` 声称的第二次失败没有被 spike 覆盖 |

### P0-2 反例

`claim()` 对 `UPDATE ... WHERE status IN ('pending','failed')` 的影响行数不做断言，随后无条件读取 task 并插入 attempt。因此实测得到：

```text
terminal-claim: task_status=succeeded, attempt_status=claimed,
                task_fence=0, attempt_fence=0
oversized-fence: task_fence=5, attempt_fence=999  # INSERT 被 trigger 接受
```

这也说明 `spec/state-transitions.md:37` 所写“终态由 task trigger 拒绝”不成立：该 trigger 只拦截 task UPDATE，不能拦截 attempt INSERT。

### P0-3 反例

`spikes/m0/cancel-race-test.py:60-75` 的 attempt UPDATE 没有 `task_id` 和 `status='cancel_requested'` 谓词，后续 task UPDATE 又只使用调用者传入的 `task_id`。实测以 task A 的合法 attempt/lease 调用 `finalize_cancel(task_id=B, attempt_id=A, ...)` 返回 `True`：attempt A 被 canceled，task B 被 canceled，而 task A 仍为 claimed。

此外：

- `status_version` 在 schema 中默认 0，却没有状态转换递增；spike 甚至明确依赖它始终为 0。
- state spec 的 finalize SQL 没写 rowcount 检查，两个 UPDATE 也没有通过 task-attempt 关系绑定。
- race 表宣称覆盖 claim/reaper、heartbeat/reaper、cancel/interrupt-ack；对应 spike 没有这些 case。
- 当前 cancel/renew、cancel/submit 都是先 cancel 再调用另一个函数，不是并发事务 race。

### P0-M2 反例

`approvals.supersedes_approval_id` 没有 FK 或唯一约束，supersede 流程也不原子消费 old approval。连续调用两次的实测结果：

```text
first supersede:  (True, '')
second supersede: (True, '')
children of old approval: 2
```

这与 `spec/state-transitions.md:188` 的“第二次必须失败”直接矛盾。

## 4. P1 清单逐项复核

| 条目 | 回应状态 | 复审判定 | 限定范围内的证据 |
|---|---:|---:|---|
| P1-1 RuntimeBackend / IntegrationAdapter 分层 | ✅ + deferred | 🟡 证据不足 | `ExecutionDriver` Protocol 存在，但 spec 中没有 `RuntimeBackend` 或 `IntegrationAdapter` 契约；trivial evidence URI 指向不存在的 `spikes/m0/trivial-evidence.json` |
| P1-2 工期口径 | ✅ fixed | ⚪ 未复核 | 仅存在于 PRD，按用户限定未读取 PRD 正文 |
| P1-3 重复规范漂移 | ✅ fixed | ⚪ 未复核 | 需要比较 PRD/ADR/spec，超出本轮范围 |
| P1-4 Optional workflow_run_id | ✅ fixed | ✅ 通过 | `EventEnvelope` 没有强制 `workflow_run_id` |
| P1-5 blob/artifact/task_link 三层 | ✅ fixed | ✅ 通过 | canonical schema 中三层实体与 FK/unique link 已落地 |
| P1-6 非布尔 capability vocabulary | 📋 deferred | 🟡 尚未实现，状态诚实 | `DriverCapabilities` 当前仍为 bool + int + notes |
| P1-7 observability 运行契约 | 📋 deferred | 🟡 尚未实现 | spec/spike 无对应运行契约 |
| P1-8 retention 删除系统 | 📋 deferred | 🟡 尚未实现 | `ArtifactStore.delete()` 只是接口方法，不是 retention pipeline |
| P1-9 Research 有用性指标 | ✅ fixed | ⚪ 未复核 | PRD-only，且本轮没有 vertical-slice 结果可验证 |
| P1-10 不可信内容传播模型 | ✅ fixed | ❌ 仅有字段，未形成强制模型 | `ToolRequest` 有 label，blob 有 TEXT 列；但 DB 无枚举 CHECK，三个相关 event schema 均不要求 trust label，policy spike 对 trusted/internal_secret 返回相同 allow |

## 5. §6/§7/§8/§9 清单复核

- §6 的 Stage 1 capability、M0 产物和 M1 用户指标主要是 PRD 内容，本轮按限定不复核。
- §7 中 deferred 的四平面、Tool Package、Evidence Graph、Evaluator SPI、非布尔 capability，当前 spec/spike 确实没有实现；`accepted-not-yet-fixed` 描述是诚实的。
- §7.2 的 RuntimeBackend/IntegrationAdapter 不能仅由一个 `ExecutionDriver` Protocol 证明，仍需要对应接口或可运行 adapter evidence。
- §8.1 的“6 个 spike 全绿”在有 DNS 网络时可复现，但 egress spike 并非离线测试，且“绿”只代表脚本内断言通过。
- §8.2 的“覆盖全部回归测试”不成立：至少终态 claim、oversized fence、真正并发 cancel race、claim/reaper、heartbeat/reaper、interrupt-ack、重复 supersede、gateway 六步链、trust-label policy 均缺测试，其中多项反例已失败。
- §9 的 Stage/M2/M3 冻结项属于 PRD 决策追溯，本轮不复核。

## 6. M1 八条硬门槛复核

| # | 硬门槛 | 回应标记 | 证据判定 |
|---:|---|---:|---:|
| 1 | 完整、唯一、可执行 kernel schema | ✅ | 🟡 schema 可应用，但 state spec 引用缺表，关键不变量未被 schema 强制 |
| 2 | fence/cancel/retry 不变量在目标环境通过 | 🟡 | ❌ 终态 claim、oversized fence、cross-task finalize 反例失败；未在本机复现 Python 3.12 |
| 3 | Gateway 与数据分类强制可证明 | 🟡 | ❌ trivial gateway 绕过所有强制步骤仍通过 conformance |
| 4 | Egress 通过真实网络安全测试 | 🟡 | ❌ 只验证旧 API 不存在和普通 DNS 可用，未验证 pinned DNS、redirect、rebinding、代理隔离 |
| 5 | Codex capability profile 由 runtime evidence 产生 | 🟡 | ❌ `trivial-evidence.json` 不存在，`codex-sdk-capability.json` 也明确未产出 |
| 6 | CI image digest/signature/attestation | 🟡 | ❌ 未实现 |
| 7 | Backup E2E 隔离恢复 | 🟡 | ❌ 未实现 |
| 8 | Research vertical slice 通过质量/成本/恢复/安全门槛 | ✅ | ❌ spec/spike 中没有 vertical-slice 执行结果，仅有 PRD 指标不能视为通过 |

**本轮没有一条硬门槛获得“完整证据通过”；第 1 条为部分通过，其余 7 条未满足。**

## 7. 给 Claude Code 的最小修复清单

按阻塞优先级处理：

1. **修 claim/fence 原子性**：task UPDATE 必须断言 rowcount=1；attempt INSERT 必须绑定同一 task 且 fence 严格等于刚返回的新 fence；增加终态 claim、超大 fence、双 worker 并发用例。
2. **修 cancel/finalize 认证绑定**：每次状态变化递增 `status_version`；finalize attempt UPDATE 同时绑定 `task_id + attempt_id + worker_id + lease_token + fence_version + status_version + status='cancel_requested'`；只有该 UPDATE rowcount=1 才能更新同一 task，否则整事务 rollback。
3. **修 reaper 契约**：移除不存在的 `attempts_failed`，改为 schema 中真实存在的 `task_events`/task 状态转换，并补 claim/reaper、heartbeat/reaper 的双连接并发测试。
4. **修 supersede 单消费**：在同一 `BEGIN IMMEDIATE` 中原子占用 old approval；为 `supersedes_approval_id` 增加 FK 和唯一性约束；绑定新 policy decision、attempt、task；补连续与并发双 supersede 测试。
5. **让 gateway 测试验证行为而非形状**：补 `ToolProvider`、`ArtifactStore` 第二实现；用可观测 fake PDP/audit/provider/store 验证调用顺序、deny 不触发 provider、错误 lease/fence 被拒绝、成功才写 artifact/link；CI 增加静态类型检查。
6. **完成 trust-label 闭环**：DB 加枚举 CHECK，关键 event schema 将 trust label 设为 required，PDP 测试必须证明不同 label 产生不同决策且 `internal_secret` 不能流向 remote capability。
7. **重写 egress spike 的退出标准**：真正让请求使用 pinned IP，覆盖 redirect 后再次校验、DNS rebinding、私网/metadata IP、IPv6、代理不可达和无网络情形；不要用未消费的 `pinned_ips` 作为修复证据。
8. **校正回应文件**：把 P0-2/P0-3/P0-5/P0-M2/P1-10 从 `✅ fixed` 改为未关闭；将 16 indexes 改为 17，将 8 jobs 改为 9；在 CI 真正跑绿前不要写“GitHub-hosted runner 已跑通”。

## 8. 复审门槛

下一轮无需再次扩写 PRD。只要提交以下可执行证据即可重新审验：

- 上述反例全部转为预期拒绝；
- state transition SQL 可直接在 canonical schema 上运行；
- race matrix 中每一行都有对应测试，且并发项使用独立连接/真实事务竞争；
- gateway 测试能够让违规实现失败，而不是只检查方法名；
- M1 八条硬门槛按“已有证据”重新标记，不用未来计划替代完成状态。

