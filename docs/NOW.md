# NOW — v1.0 runtime 温卡

> 改阶段只改本页。超过 200 行 = 在复制合同，改回指针。  
> 冷文档禁止整本常驻。

## 1. 阶段 / 退出

- **阶段**：v1.0 M1 Foundation（包化）。Start 门：**已开**。T-BE-5 done。
- **本阶段退出**：`pip install -e .` 成功；`import harness` 可用；原 spike suite 全绿。全里程碑见 `docs/v1.0-ga-team-plan.md` §1 / §6。
- **v1.0 完成 ≠ 手机派工**。完成 = GA plan §4 十二条 + §6 M3 tag。

## 2. 进行中

| ID | 状态 | 完成条件 |
|----|------|----------|
| T-BE-5 | ✅ done 2026-08-31 | `pyproject.toml`（name=harness, version=1.0.0a0, python>=3.12, deps=httpx>=0.28,<0.29 / jsonschema>=4.0,<5, packages find = harness*）；`harness/__init__.py` 暴露 5 Protocol（WorkerPool/EventSink/ContextManager/ArtifactStore/ToolInvocationGateway）+ ContextDistiller/ContextBudget；ContextManager = ContextDistiller & ContextBudget Protocol 组合；`pip install -e .` OK；`python3 -c "import harness; print(harness.__version__)"` → `1.0.0a0`（环境用 `python3`，NOW.md §4 命令文本不变）|
| **T-BE-1** | ✅ done 2026-08-31 | `spikes/m0/_helpers.py` (530 行) lift → `harness/runtime/{__init__,_db,workers,context}.py`；`_db.py` 暴露 `make_db/connect_with_fk/seed_task/claim/ClaimRejected`（含 schema 路径解析：`HARNESS_SCHEMA_PATH` env → `../../spec/kernel-schema.sql`）；`workers.py` 暴露 `register_worker/heartbeat_worker/drain_worker/reap_stale_workers/dispatch_worker/claim_via_pool`；`context.py` 暴露 `insert_snapshot/working_set_total/VALID_TRUST_LABELS×4`；`_helpers.py` 完整保留未删；runtime smoke + spike suite 全绿（worker-dispatch 21 cases + context-budget 全绿）|
| **T-BE-2** | ✅ done 2026-08-31 | `harness/runtime/worker_pool.py` — `SqliteWorkerPool` 实现 `WorkerPool` Protocol（6 方法：register/dispatch/heartbeat/drain/reap_stale/claim_via_pool）；内部单调时钟（offset 自 anchor 2026-08-30T12:00:00Z，heartbeat +5s, dispatch +1s）保证 I16 forward-only；`LookupError → NoWorkerAvailable` 转译；smoke 全过 + conformance 10/10 Protocols 全绿 + worker-dispatch 21 cases 无回归 |
| **T-BE-3** | ✅ done 2026-08-31 | `harness/runtime/event_sink.py` — `SqliteEventSink` 实现 `EventSink` Protocol（2 方法：`kind() -> SinkKind`、`async emit(envelope) -> SinkResult`）；写入侧由 SQLite trigger `trg_*_event_emit` 自动发 4 类 worker.* 事件到 `task_events`；sink 提供 ack 入口（per-sink 单调 seq），audit 永不失败；v1.0 仅支持 `SinkKind.AUDIT`；smoke 全过 + worker-events-emit-test 6 cases 全绿 + conformance 10/10 Protocols 全绿 |
| **T-TG-1** | ✅ done 2026-08-31 | `harness/gateway/{__init__,egress}.py` — `HttpEgressService`（pinned DNS / allowlist / 私网阻断 / redirect re-pin / 指数退避 base 0.5s factor 2 cap 8s / proxy-must-be-configured SSRF 拒绝）；`PinnedResolver` lift 自 `spikes/m0/egress-httpx-actual.py`（12 BLOCKED_NETWORKS + resolve/validate_ip/reject_rebinding 行为零变化）；`PermissionError → RedirectBlocked` 统一包装；spike 8 cases 全绿（行为零变化）+ HttpEgressService smoke（pinned / backoff / SSRF refusal / allowlist violation / redirect re-pin blocked / redirect success / ConnectError ×2 → success）全过 |
| **T-BE-4** | ✅ done 2026-08-31 | `harness/runtime/context_manager.py` — `SqliteContextManager` 实现 `ContextDistiller` + `ContextBudget` Protocol 双接口（6 方法：`distill/charge/snapshot_for_handoff/restore_handoff/remaining/total`）；写入侧走 I11（budget）trigger / I14（handoff trust）trigger；`distill` 复用 `blobs.byte_size` 列存 token_count 让 `charge` 不二次除 4；`snapshot_for_handoff` L3 parent = 最近 L2（I15 lineage）非 L1 anchor；lineage 通过 `_ensure_l1_anchor` lazy build L0+L1；compressed_token_count = `budget - ws_total`（spike L179-188 pattern）；`BudgetExceeded` / `HandoffTrustViolation` / `ContextError` 触发器异常→Protocol 异常；`python3 spikes/m0/context-budget-test.py` + `python3 spikes/m0/lineage-level-test.py` 全绿；`python3 spikes/m0/conformance-second-impl.py` 10/10 Protocols 全绿；dedicated smoke（Phase A charge 80 / Phase B handoff=20 / Phase C I11 拒绝 / Phase D remaining / Phase E restore 新 task / Phase F restore 超 budget 拒绝 / Phase G 缺失 blob）全过 |
| **T-TG-2** | ✅ done 2026-08-31 | `harness/gateway/gateway.py` — `ToolInvocationGatewayImpl` 实现 ADR 0005 6 步链（lease/fence → PDP → audit → provider → artifact_store → task_links）；写入侧 5 表持久化（`audit_log` 永写含 deny / `policy_decisions` / `approvals` 仅 needs_approval / `artifacts` 仅 allow / `task_links` 仅 allow）；lease/fence 校验走 `task_attempts` DB 读（I1 fence_version 一致性）；deny 不调 provider 且不写 artifact/link；needs_approval 写 `approvals(status='pending')` 返回 `approval_id` 不调 provider；provider-level denial 透传不写 artifact；artifact_store.put 与 artifacts.blob_id FK 解耦（gateway 分配新 blob_id）；`harness/gateway/__init__.py` export `ToolInvocationGatewayImpl` + `GatewayError`（保留 T-TG-1 的 6 export）；`python3 spikes/m0/conformance-second-impl.py` 10/10 Protocols + gateway 6 步链 全绿无回归；dedicated smoke 7 phases 全过（allow / deny / needs_approval / bad lease / bad fence / provider deny 透传 / Protocol isinstance） |
| **T-TG-3** | ✅ done 2026-08-31 | `harness/gateway/artifact_store.py` — `RealArtifactStore` 实现 `ArtifactStore` Protocol（4 方法：put/get/stat/delete，local_fs 后端）；`put` 算 sha256 → atomic temp+fsync+rename → UPSERT `blobs` 行（REAL sha256，非假值）；幂等（同 id + 同 bytes no-op）；conflict（同 id + 不同 bytes）→ `BlobConflictError`；`expected_sha256` 不匹配 → `Sha256MismatchError`（rename 前拒）；`get` 读文件重 hash → 不匹配 raise；`delete` 删文件 + blobs 行（`artifacts` FK ON DELETE RESTRICT → IntegrityError 由调用方处理）；`__init__.py` export `RealArtifactStore` + 3 异常类（保留前序 8 export）；同步重构 `gateway.py:_store_artifact` 用 PutResult 真值（删除假 sha256 预插）；`python3 -m harness.gateway.artifact_store` minimal smoke OK；8-phase dedicated smoke（put/幂等/conflict/get+篡改/stat/delete/Protocol isinstance/gateway allow 联调）全过；`pip install -e .` OK → `harness.__version__`=1.0.0a0；conformance 10/10 + 4 其他 spike suite 无回归 |
| **T-TG-4** | ✅ done 2026-08-31 | `harness/drivers/{_stub,codex_sdk,codex_exec,__init__}.py` + 2 evidence 文件 — `CodexSdkDriver` (`DriverKind.CODEX_SDK`) + `CodexExecDriver` (`DriverKind.CODEX_EXEC`) 共享 `StubDriverBase`（capability/run/interrupt/heartbeat 4 法）；`run()` 幂等缓存 `(attempt_id, fence_version) → [STARTED, FINISHED]`；`interrupt()` / `heartbeat()` 安全 no-op（FINISHED 后 interrupt 也不抛）；`capability()` 报 `supports_tool_gateway=False`（Q112：无证据 driver MUST NOT claim True）+ `max_concurrent_attempts=1` + `supports_{streaming=False,interrupt=True,heartbeat=True}`；`evidence_uri = file://harness/drivers/evidence-{sdk,exec}-stub.json`（两文件实存，3B 空 JSON）；10-phase dedicated smoke 全过（isinstance + capability 字段 + run→2 events + interrupt/heartbeat no-raise + duplicate run cached 同 identity + namespace 单类 + evidence 文件存在）；`python3 -c "from harness.drivers import CodexSdkDriver, CodexExecDriver; print('ok')"` OK；`python3 spikes/m0/conformance-second-impl.py` 10/10 Protocols + TrivialDriver driver 部分无回归；`spikes/m0/egress-httpx-actual.py` 8/8 无回归；`pip install -e .` OK |
| **T-TG-5** | ✅ done 2026-08-31 | `harness/testing/{__init__,echo_server}.py` — `InProcessEgressServer`（stdlib `ThreadingHTTPServer` + daemon thread；零新依赖）；host **hardcoded `127.0.0.1`**（fixture 性质，不是生产 egress；BLOCKED_NETWORKS 不动）；`port=0` → ephemeral（多次 `with` 不撞）；`__enter__` 起 thread / `__exit__` `shutdown()`+`server_close()`+`join(2.0)`；GET/POST `/echo` 200（POST body 原样回显 = 等价契约）；post-exit 连拒（`httpx.ConnectError`）；5-phase dedicated smoke (`python3 -m harness.testing.echo_server`) 全过；`from harness.testing import InProcessEgressServer` OK；egress 8/8 + conformance 10/10 无回归；`pip install -e .` OK |

任务全文：`docs/v1.0-ga-team-plan.md` §2。派发顺序：§8（**T-BE-5 最先**）。

## 3. 禁止（本阶段）

- dsh、TypeScript wrapper、PWA、STT、Web Push、6 host、工作流 B/C
- 引用 VISION 正文作条款
- 跨 host SQLite / NFS
- 扩大范围到当前「下一枪」以外（做完一枪即停）；T-TG-2 可并行但不自动开

## 4. 下一验收（T-DO-1）

```bash
docker build -t fish-harness:1.0.0a0 . && docker run --rm fish-harness:1.0.0a0 python -c "import harness; print(harness.__version__)"
# 期望：python:3.12-slim base；COPY pyproject.toml → pip install → COPY harness/；
# 容器内 import OK → 1.0.0a0
```

## 5. 冷指针（按需 Read，勿预载）

| 要干什么 | 读 |
|----------|----|
| 任务/验收/角色 | `docs/v1.0-ga-team-plan.md` |
| v1.0 豁免哪些守门 | `docs/PRD-V0.1-NORTH-STAR.md` §13 |
| 产品愿景 / v1.1（未开工） | `docs/PRD-v1.1-product.md`（讨论稿） |
| 六项裁定 | `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 |
| Start 门 | `docs/DOCS-REVIEW-v1.0-start-gate.md` |
| 接口 | `spec/interfaces/*.py`（10 Protocol） |
| schema / spike | `spec/kernel-schema.sql`；`spikes/m0/` |
| 归档（禁止当合同） | `docs/VISION-v1.0-supplement.md` |
