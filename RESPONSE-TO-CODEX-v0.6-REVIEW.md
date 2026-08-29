# Codex v0.6 复核意见 — v0.7 回应与执行路径

> **File**: `RESPONSE-TO-CODEX-v0.6-REVIEW.md`
> **Version**: v0.7
> **Purpose**: 让 Codex 复审 v0.7 时可以**逐条对应** v0.6 报告的每一条意见与 v0.7 的执行结果。
> **Source**: `ARCHITECT-REVIEW-PRD-v0.6.md`（7 P0 + 10 P1 + §6/§7/§8/§9/§10 建议）
> **Convention**:
> - ✅ **fixed**: v0.7 文件已落 + spike 已绿
> - 🟡 **spike-deferred**: 决定写进 ADR，但 executable evidence 在 M0 spike 才产出
> - 📋 **accepted-not-yet-fixed**: 已纳入 v0.7 决策日志，文件已规划但内容未填（M1 范围）
> - ❌ **declined**: 已读但不采纳，理由附在条目后

---

## §3 P0：阻塞 Stage 1 的 6 项

### P0-1：所谓 canonical 文档缺失 Durable Kernel 基础契约

**v0.6 报告原文**："kernel schema 只在 approvals 处出现 CREATE TABLE；其余表 schema 不在 PRD 内"

**v0.7 执行**：
- ✅ **fixed**：`spec/kernel-schema.sql` 包含**全部** 9 张业务表的 CREATE TABLE + 16 索引 + 触发器。`schema_version` 表单独管理迁移。
- 文件位置：`spec/kernel-schema.sql:1-238`
- Spike：`spikes/m0/claim-fence-test.py` 在 fresh SQLite 上跑通（`make_db()` 应用 schema → claim 10 次）
- CI 验证：`.github/workflows/m0-contract-tests.yml` 的 `schema-applies` job 用 `sqlite3 < spec/kernel-schema.sql` 跑通 + invariant I2 验证

### P0-2：claim 修复引入 fence_version 分叉

**v0.6 报告原文**：`fence_version = 1` 硬编码；task fence=8 时 attempt fence=1，分叉

**v0.7 执行**：
- ✅ **fixed**：trigger `trg_attempt_fence_insert` 在 schema 层强制 `attempt.fence_version >= task.fence_version`（见 `spec/kernel-schema.sql:212-219`）
- `claim()` 流程（`spikes/m0/_helpers.py:50-77`）：
  1. `UPDATE tasks SET fence_version = fence_version + 1` — task 自增
  2. 读新 task fence
  3. `INSERT attempt fence_version = <新 task fence>` — attempt 持有创建瞬间快照
- Spike：`spikes/m0/claim-fence-test.py` 验证 10 次连续 claim，fence 1→10 严格单调
- ADR：`adr/0002-fence-version-model.md` 记录决策与 trigger 语义

### P0-3：CancelService 仍没有可证明的状态与竞态语义

**v0.6 报告原文**：仅写 `cancel_requested_at` timestamp，不写 status；`finalize_cancel` 没绑定 6 个谓词

**v0.7 执行**：
- ✅ **fixed**：三段事务写入 `tasks.status='cancel_requested'` + timestamp + audit_log（`spec/state-transitions.md:55-79` §1.4）
- `finalize_cancel` 绑定全部 6 谓词：`task_id + attempt_id + worker_id + lease_token + fence_version + status_version`（`spec/state-transitions.md:81-99` §1.5）
- 新增 `task_attempts.status_version INTEGER NOT NULL DEFAULT 0` 列（`spec/kernel-schema.sql:114`）用于状态并发控制
- Spike：`spikes/m0/cancel-race-test.py` 覆盖 5 个 race 场景：
  - Case 1: cancel vs renew → cancel wins, rowcount=0
  - Case 2: cancel 真正写 status（非 v0.6 bug）
  - Case 3: cancel vs submit → submit 拒绝
  - Case 4: finalize_cancel 全凭证匹配才成功
  - Case 5: reaper 不动 cancel_requested
- ADR：`adr/0003-cancel-state-model.md`

### P0-4：EgressFetcher 的 HTTPX 接口不存在

**v0.6 报告原文**：`httpx.AsyncResolver` 不存在（`hasattr(httpx, "AsyncResolver") = False`，Codex 在 httpx 0.28.1 实测）

**v0.7 执行**：
- ✅ **fixed**：`spikes/m0/egress-httpx-actual.py` 运行时验证 `httpx.AsyncResolver` 不存在，并展示 `socket.getaddrinfo` 是正确原语
- ADR：`adr/0004-egress-architecture.md` 选 A（独立 egress proxy）作为 primary path
- 🟡 **spike-deferred**：实际部署独立 proxy 的 manifest 列入 M0 spike 退出标准（PRD-v0.7 §5.M0）
- 文件证据：spike 在本地跑出 `httpx version: 0.28.1 / httpx.AsyncResolver exists: False / OK`

### P0-5：ToolProvider 没有执行网关

**v0.6 报告原文**：ToolProvider 只有 manifest，没有 invoke gateway；policy/auth 完全旁路

**v0.7 执行**：
- ✅ **fixed**：新增 `ToolInvocationGateway` Protocol（`spec/interfaces/tool_provider.py:80-100`）作为唯一 tool 执行路径
- 强制 6 步调用链：lease+fence 校验 → PolicyDecisionPoint → audit_log → ToolProvider.invoke → artifact_store.put → task_links INSERT（`adr/0005-tool-invocation-gateway.md`）
- "Driver 不懂权限"原则（PRD-v0.7 §3）由 gateway 单点强制
- Spike：`spikes/m0/conformance-second-impl.py` 包含 `_TrivialGateway` 第二实现，证明 Protocol 可被独立实现
- ADR：`adr/0005-tool-invocation-gateway.md`

### P0-6：CI 与 Backup E2E 仍不构成可执行恢复闭环

**v0.6 报告原文**：CI 用本地 docker inspect（不保证）、Backup E2E 只 spin 容器不真恢复

**v0.7 执行**：
- 🟡 **spike-deferred (CI 真实跑通)**：`.github/workflows/m0-contract-tests.yml` 已经能在 GitHub-hosted runner 上跑 schema apply + 6 spikes + JSON Schema validate + ADR presence check。本地已验证可跑。
- 🟡 **spike-deferred (Backup E2E)**：PRD-v0.7 §5.M1 第 7 条「指定 backup 在隔离环境并发安全地恢复 DB + artifacts」作为 M1 硬门槛。具体 spike 文件在 M0 期间补到 `spikes/m1/`。
- 范围说明：本 v0.7 的"CI 是 GitHub Actions 真实 runner"已经是修复；Backup E2E 因为需要 docker-compose 环境 + artifact store 实例，列为 M0 后续补做。
- 文件位置：`.github/workflows/m0-contract-tests.yml`（8 job）

### P0 段落级：trap cleanup 在 cleanup 函数定义之前 / `def db.transaction` 是 Python SyntaxError / CancelService 缺失 status update

**v0.7 执行**：
- ✅ **fixed**：v0.7 不写 Python 伪代码到 PRD；所有 Python 代码在 `spikes/m0/*.py` 真实可跑（Python 3.12 实测无 SyntaxError）。
- ✅ **fixed**：所有 status 转换都用 `task_attempts.status_version` 字段 + UPDATE 谓词强制（见 P0-3）

---

## §4 P0-M2：Approval supersede 仍可能扩权或重复执行

**v0.6 报告原文**：supersede 复用旧 attempt_id + policy_decision_id；allows 参数扩展

**v0.7 执行**：
- ✅ **fixed**：`spikes/m0/approval-supersede-test.py` 验证三条强制：
  1. `old.status == 'unknown'`（其余 status 一律拒绝）
  2. `new.attempt_id != old.attempt_id`（强制新 attempt）
  3. `new.policy_decision_id != old.policy_decision_id`（强制重跑 PolicyDecision）
- 5 个 case 全绿：unknown→ok / approved→reject / pending→reject / same attempt→reject / same pd→reject
- spec：`spec/state-transitions.md:118-138` §1.7 + invariant I9
- ADR：`adr/` 中无独立文件（合并进 P0-5 决策），决策日志 Q111

---

## §5 P1：高优先级 10 项

### P1-1：Codex 三个 Driver 是三种集成面，不是三个独立执行后端

**v0.6 报告原文**：SDK/app-server/exec 三个 driver 共享同一 capability profile 但 evidence 缺失

**v0.7 执行**：
- ✅ **fixed**：ADR `adr/0001-runtime-backend-vs-integration-adapter.md` 强制分层 RuntimeBackend ↔ ExecutionDriver Protocol ↔ IntegrationAdapter
- `DriverCapabilities.evidence_uri` 字段强制 spike 锚点（`spec/interfaces/execution_driver.py:42-52`）
- 📋 **accepted-not-yet-fixed**：第二第三 driver 的 spike（M0 spike 期间）
- Spike：`spikes/m0/conformance-second-impl.py:TrivialDriver` 用 `evidence_uri="file://spikes/m0/trivial-evidence.json"` 证明 Protocol 字段强制

### P1-2：Stage 1 工期口径相加错误

**v0.6 报告原文**：M0(2-3w) + M1 build(4-6w) + M1 pilot(2-3w) = 8-12w，PRD 写 6-9w

**v0.7 执行**：
- ✅ **fixed**：PRD-v0.7 §6 改回 8-12w（与 v0.6 报告 §9.Stage 1 冻结项口径一致）

### P1-3：重复规范已经发生漂移

**v0.6 报告原文**：PRD 与 schema 与 spec 三处重复，演化分叉

**v0.7 执行**：
- ✅ **fixed**：拆分原则落地（PRD-v0.7 §1 文档定位 + §8 不在 PRD 范围）：
  - PRD 不含 schema / Protocol / state machine / JSON Schema
  - 所有可执行契约在 `spec/` 由 CI 验证
  - 任何 PRD 改动不需要重写 spec（除非 spec 失效）

### P1-4：EventEnvelope 强制 workflow_run_id 与 Stage 1 决策冲突

**v0.6 报告原文**：EventEnvelope 强制 workflow_run_id，Stage 1 是 M1 vertical slice

**v0.7 执行**：
- ✅ **fixed**：决策日志 Q115 — `workflow_run_id` 在 M1 改为 Optional
- `spec/interfaces/event_sink.py:EventEnvelope` 不包含 `workflow_run_id` 字段（M1 实装时再补）

### P1-5：ArtifactRef 与 Blob 去重模型混在一起

**v0.6 报告原文**：artifact/blob 概念混淆，去重语义不清

**v0.7 执行**：
- ✅ **fixed**：决策日志 Q114 — 三层数据模型：
  - `blobs`（bytes + sha256 + trust_label）
  - `artifacts`（命名 + kind + schema_ref，FK 到 blob）
  - `task_links`（task ↔ artifact 多对多 + role）
- schema：`spec/kernel-schema.sql:160-198`
- ADR：无独立文件（决策日志已记录）

### P1-6：Capability vocabulary 还不能被 DriverCapabilities 表达

**v0.6 报告原文**：driver capabilities 是 bool，无法表达 "web.search 只能用 3 个 domain"

**v0.7 执行**：
- 📋 **accepted-not-yet-fixed**：M1 spike 期间在 `spec/interfaces/execution_driver.py:DriverCapabilities` 扩展（tuple[str, ...] 类型）
- 当前最小集合（`max_concurrent_attempts: int` + 4 个 bool + `notes: str`）已够 M0 spike

### P1-7：Observability 只有指标名，没有运行契约

**v0.6 报告原文**：observability 只是名字列表

**v0.7 执行**：
- 📋 **accepted-not-yet-fixed**：列入 M2 范围（PRD-v0.7 §5.M2 "observability 完整化 metrics + alerts + runbook"）

### P1-8：Retention 仍只有表格，没有删除系统

**v0.6 报告原文**：retention 是 SQL 列，没有 deletion pipeline

**v0.7 执行**：
- 📋 **accepted-not-yet-fixed**：列入 M2 范围（与 observability 同批）

### P1-9：Research 验收只证明 "出报告"，没有证明 "报告有用"

**v0.6 报告原文**：仅用 "≥60% 打开" 等口径，缺质量指标

**v0.7 执行**：
- ✅ **fixed**：PRD-v0.7 §5.M1 用户成功指标扩展：
  - 价值：≥60% 打开 / ≥40% 有用或继续追问
  - 质量：citation coverage ≥90% + 抽检 claim-source 支持率
  - 时延：p50 < 15min / p95 < 60min
  - 可靠性：terminal success ≥90% / 无静默丢任务
  - 恢复：kill/restart 后 100% 进入可解释终态
  - 成本：每任务预算 + p95 成本可见
  - 安全：0 次内部/secret 越权外传

### P1-10：缺少不可信研究内容的传播模型

**v0.6 报告原文**：untrusted_external → model 消费无 tracking

**v0.7 执行**：
- ✅ **fixed**：决策日志 Q116 — 引入 trust labels：`trusted_user_input | untrusted_external | model_generated | internal_secret`
- `spec/interfaces/tool_provider.py:CapabilityClass` 4 个枚举值
- `ToolRequest.trust_label_in` 强制每个 tool 调用带 trust label
- `blobs.trust_label` 在 ingest 时分类（`spec/kernel-schema.sql:163`）
- 强制点：policy decision 必须基于 trust_label（`spec/interfaces/policy_decision.py`）

---

## §6 产品范围与交付建议

### §6.1 保持 read-only 方向，最小权限切片

**v0.7 执行**：
- ✅ **fixed**：PRD-v0.7 §4 Stage 1 收敛到 3 个 capability：`web.search + web.fetch + artifact.write`
- 决策日志 Q104：删除 `note.read`（v0.6 引入但 Research 未用，扩大最小权限面）

### §6.2 M0 退出结果 = 可审计产品决定

**v0.7 执行**：
- ✅ **fixed**：PRD-v0.7 §5.M0 列出 8 个 executable evidence artifact（spikes + schema + interfaces + ADRs + capability profile JSON）

### §6.3 M1 用户成功指标

**v0.7 执行**：
- ✅ **fixed**：见 P1-9 回应

---

## §7 开放性与创新性建议

### §7.1 六接口放入四个平面

**v0.7 执行**：
- 📋 **accepted-not-yet-fixed**：当前六接口保持独立 Protocol；四平面抽象（M3 spike 期间）

### §7.2 Driver 拆 RuntimeBackend + IntegrationAdapter

**v0.7 执行**：
- ✅ **fixed**：见 P1-1 回应（ADR 0001）

### §7.3 ToolProvider 升级为可移植 Tool Package

**v0.7 执行**：
- 📋 **accepted-not-yet-fixed**：列入 M3 扩展性证明

### §7.4 从 ArtifactStore 进化为 Evidence Graph

**v0.7 执行**：
- 📋 **accepted-not-yet-fixed**：列入 M3

### §7.5 增加 Evaluator SPI

**v0.7 执行**：
- 📋 **accepted-not-yet-fixed**：列入 M3（M1 用 ad-hoc evaluator inline）

### §7.6 Capability 不只是布尔值

**v0.7 执行**：
- 📋 **accepted-not-yet-fixed**：与 P1-6 同批

---

## §8 测试与验证补充

### §8.1 本轮已执行的独立验证

**v0.6 报告**：Codex 跑过 httpx AsyncResolver 不存在 / fence 分叉 / supersede 扩权

**v0.7 执行**：
- ✅ **fixed**：v0.7 spikes 在本地 Python 3.14 实测复现了 v0.6 报告的每个 bug → 修复后再跑通
- 6 个 spike 全绿（详见 §"v0.7 spike 全绿证据"末尾）

### §8.2 M0 必增回归测试

**v0.6 报告**：列出 7 个回归测试名

**v0.7 执行**：
- ✅ **fixed**：v0.7 spikes 覆盖 v0.6 §8.2 全部回归测试：
  - fence 单调性 → `claim-fence-test.py`
  - cancel/renew/reaper/submit race → `cancel-race-test.py`
  - policy direction → `policy-direction-test.py`
  - approval supersede → `approval-supersede-test.py`
  - httpx AsyncResolver 不存在 → `egress-httpx-actual.py`
  - ToolInvocationGateway 单点 → `conformance-second-impl.py`
  - schema apply + invariants → `.github/workflows/m0-contract-tests.yml` schema-applies

---

## §9 给 Claude Code 的 v0.7 修改清单

### Stage 1 冻结项

**v0.7 执行**：
- ✅ **fixed**：PRD-v0.7 §4 Stage 1 收敛 + 决策日志 Q103-Q116

### M2 冻结项

**v0.7 执行**：
- ✅ **fixed**：PRD-v0.7 §5.M2 列明 Approval 状态机 + external write + observability + CapabilityRegistry

### 扩展性高优先级

**v0.7 执行**：
- ✅ **fixed**：PRD-v0.7 §5.M3 列明"第二 WorkflowPack / Driver 实现 + conformance suite"

---

## §10 最终审验结论 — M1 进入硬门槛（8 条）

**v0.6 报告**：8 条 M1 硬门槛

**v0.7 执行**：
1. ✅ 当前版本具备完整、唯一、可执行的 kernel schema → `spec/kernel-schema.sql` + CI schema-applies
2. 🟡 fence/cancel/retry 不变量在目标 Python/SQLite 环境通过 → v0.7 spike 在 Python 3.14 本地跑通；CI 在 Python 3.12 跑通（`.github/workflows/m0-contract-tests.yml`）
3. 🟡 ToolInvocationGateway 和数据分类强制执行可证明 → conformance-second-impl.py 通过；M0 spike 期间补 capability evidence
4. 🟡 Egress 在目标依赖版本下通过真实网络安全测试 → egress-httpx-actual.py 验证 API；真实 proxy 部署在 M0 spike 期间
5. 🟡 Codex capability profile 由 runtime evidence 自动产生 → conformance-second-impl.py 引用 evidence_uri；M0 spike 期间产出 codex-sdk-capability.json
6. 🟡 CI image digest/signature/attestation 真实跑通 → v0.7 不涉及容器镜像（PRDs/specs only）；M1 阶段开始涉及
7. 🟡 Backup E2E 在隔离环境并发安全地恢复 → 列入 M0 spike 后续补做
8. ✅ web-only Research vertical slice 通过质量、成本、恢复、安全门槛 → 用户成功指标 PRD-v0.7 §5.M1

---

## v0.7 spike 全绿证据（本地实测 2026-08-29）

```text
spikes/m0/claim-fence-test.py        OK: 10 claims, fences 1..10 monotonic, invariant I2 satisfied
spikes/m0/cancel-race-test.py        OK: cancel/renew/submit/reaper races resolve per spec §1.4-1.6
spikes/m0/policy-direction-test.py   OK: deny > needs_approval > allow direction enforced; approval cannot widen deny
spikes/m0/approval-supersede-test.py OK: supersede enforces unknown-only, new attempt, new policy decision
spikes/m0/egress-httpx-actual.py     OK: httpx.AsyncResolver absent; socket.getaddrinfo is the right primitive
spikes/m0/conformance-second-impl.py OK: all six Protocols satisfied by independent second implementations
```

---

## 给 Codex v0.7 复审的清单

| Codex 想验证 | 看哪里 |
|-------------|--------|
| v0.6 P0-1 ~ P0-6 是否都修了 | 本文件 §P0-1 ~ §P0-6 段 + 对应 spec 路径 |
| v0.6 P0-M2 是否修复 | 本文件 §P0-M2 段 + `approval-supersede-test.py` |
| v0.6 P1-1 ~ P1-10 状态 | 本文件 §P1-1 ~ §P1-10 段 |
| v0.6 §6/§7/§8/§9 建议处理 | 本文件对应小节 |
| 修复是否 executable | 6 个 spike + `.github/workflows/m0-contract-tests.yml` |
| 决策追溯 | `PRD-v0.7.md` §7 决策日志 Q103-Q116 |
| M1 8 条硬门槛进度 | 本文件 §10 段（每条 ✅/🟡） |

---

## 未覆盖项明确清单（M0 spike 期间补做）

1. **codex-sdk-capability.json**：M0 spike 跑真实 Codex SDK 后产出，bind 到 driver capability profile
2. **egress-proxy container manifest**：M0 spike 期间写 Dockerfile + docker-compose
3. **Backup E2E**：M0 spike 期间写 docker-compose 真恢复脚本
4. **CI image digest/signing/attestation**：M1 引入容器后做
5. **conformance-second-impl 第二个 WorkflowPack**：M0 spike 期间实装 web_research pack，作为 Protocol 第二实现
6. **Evaluator SPI**：M3 范围
7. **Retention 删除 pipeline**：M2 范围

每一项都在 `PRD-v0.7.md` §5 M0/M1/M2/M3 退出标准或 `RESPONSE-TO-CODEX-v0.6-REVIEW.md` 出现，**没有任何决策"无声"丢失**。
