# Codex v0.9.4 合并复审指令

> **File**: `notes/codex-review-prompt-v0.9.4.md`
> **Date**: 2026-08-30
> **Source**: `notes/codex-review-prompt-v0.9.3.md` (SUPERSEDED — returned CHANGES REQUIRED / 14/20 PASS / 6 FAIL)
> **Target**: Codex 对 v0.9.4 (attempt-side ownership 双向 + 事件语义拆分 + 真并发 dispatch 原子性 + 反例/突变全闭环) 做合并复审
> **Supersedes**: `notes/codex-review-prompt-v0.9.3.md` (v0.9.3 合并复审 CHANGES REQUIRED)
>
> **背景**: Codex v0.9.3 合并复审返回 CHANGES REQUIRED（6 FAIL: P0-M2-2 attempt-side / P1-2 事件语义混淆 / P1-3 真并发 dispatch 丢更新 / Case 27d 缺 INSERT 路径 / Case 33 注释矛盾 / I15 三值逻辑）。v0.9.4 修复：
> - 新增 `trg_attempt_owner_consistent_update`（bidirectional ownership，closes P0-M2-2 完整闭环）
> - 拆分事件：`worker.registered`（注册）+ `worker.dispatched`（真正派单），
>   原 `trg_worker_dispatched_event_emit` 重命名为 `trg_worker_registered_event_emit`
>   + 新增 `trg_attempt_dispatched_event_emit_insert` / `_update`
> - `dispatch_worker()` 改用 `BEGIN IMMEDIATE` 序列化并发，避免 lost update
> - `trg_attempt_worker_exists_update` 三值逻辑修复：`NEW.worker_id != OLD.worker_id` → `NEW.worker_id IS NOT OLD.worker_id`
> - Case 27d 扩展：4 sub-case (UPDATE/INSERT × wrong-owner/NULL-attempt)
> - Case 33 变量 `w_bypass` → `w_idle` 注释修正
> - 新增 spike `fence-missing-task-test.py`（F1/F2/F3 NULL-safe + causal chain）
> - 新增 Case 35（真并发 dispatch race）+ Case 36（worker.dispatched 事件）
> - mutation 17 个 (M12 移除，M16/M17/M18 新增)
> - trigger 数 24 → 27, event schema 数 11 → 12

---

## 主指令（可直接复制粘贴到 Codex）

```text
请按以下规则复审 PRD-v0.9.4 (v0.9.3 修复 + attempt-side ownership + 事件语义拆分 + 真并发 dispatch 原子性):

【范围限定（强约束）】
- 只读 spec/ 与 spikes/m0/ 目录
- 不要读 PRD-v0.9.md / PRD-v0.9-B.md / PRD-v0.9.2.md / PRD-v0.9.3.md（除非明确指出要看哪一段）
- 不要读 adr/0006-context-layering.md / adr/0007-worker-pool.md（除非明确指出）
- 不要读 RESPONSE-TO-CODEX-v0.9-*-REVIEW.md（v0.9 / v0.9.2 / v0.9.3 的 response，anchor bias；
  本次对应 response 是 RESPONSE-TO-CODEX-v0.9.3-REVIEW.md 仅作参考但不参与判断）
- 不要读 ARCHITECT-REVIEW-PRD-v0.9-MERGED.md / ARCHITECT-REVIEW-PRD-v0.9.3.md（v0.9/v0.9.3 review 话术）
- 不要读 notes/v0.9-contemplations.md
（避免你的判断被 v0.9 / v0.9.3 review 话术影响）
- 复审只基于 spike 实际跑出的结果，不基于 PRD 承诺

【反例驱动（核心 — 涵盖 v0.9-A 6 + v0.9-B 9 + v0.9.2 新增 5 + v0.9.3 NULL bypass 2 + v0.9.4 attempt-side + dispatch race + event split）】
PRD-v0.9.4 共 28 个反例:

v0.9-A（6 个，spec/context-layers.md）:
  - P0-9A: charge 超 budget 的 token 数 → I11 trigger BudgetExceeded
  - P0-9B: L3 handoff trust_label=untrusted_external → I14 trigger
  - P0-9C: L1 distilled_blob_id 引用不存在的 raw_blob → FK 约束
  - P0-9D: cross-attempt snapshot 缺 task_id → NOT NULL 约束
  - P0-9E: snapshot.token_count < 0 → CHECK 约束
  - P0-9F: snapshot.level 不在 {L0,L1,L2,L3} → CHECK 约束

v0.9-B 原始（9 个，spec/worker-pool.md）:
  - P0-9G: 双 worker 并发 dispatch 同一 task → idx_attempts_one_active 拒绝
  - P0-9H: 同 worker 同时持两个 active attempt → idx_worker_one_active_attempt 拒绝
  - P0-9I: active attempt worker_id NULL → trg_attempt_active_needs_worker 拒绝 (INSERT + UPDATE)
  - P0-9J: heartbeat 不推进 last_heartbeat_at → trg_worker_heartbeat_renew 拒绝 (strict monotonic, 双拒)
  - P0-9K: drain 时 current_attempt_id 指向已 terminal 的 attempt → trg_worker_drain_pause 拒绝
  - P0-9L: last_heartbeat_at NULL → NOT NULL 约束
  - P0-9M: worker.status 不在 {active,draining,drained,stale} → CHECK 约束
  - P0-9N: workers.current_attempt_id 指向不存在的 attempt → FK 或 ownership trigger (defense in depth)
  - P0-9O: dispatch 绕过 claim() 直接 INSERT attempt → partial unique index 仍 reject

v0.9.2 新增（5 个修复点）:
  - P0-M2-1 (I11/I14/append-only): context.snapshot 实际 payload 必须含 task_id + attempt_id 且通过 schema 验证
  - P0-M2-2 (双向 ownership, v0.9.4 完整闭环):
      workers.current_attempt_id 指向的 attempt.worker_id 必须 == self.worker_id (worker-side, trg_worker_ownership_update)
      task_attempts.worker_id UPDATE 必须不能让 other workers.current_attempt_id 留下 dangling pointer (attempt-side, trg_attempt_owner_consistent_update 新增)
      NULL-safe: attempt 不存在 OR attempt.worker_id NULL 也必须被拒 (NOT EXISTS + IS NOT 模式)
  - P1-1 (lineage level): L2 parent 必须 L0/L1, L3 parent 必须 L2
  - P1-2 (worker events, v0.9.4 语义拆分):
      worker.registered 事件：worker INSERT → emit 含 worker_id+host+capabilities_json+status+registered_at
      worker.dispatched 事件：task_attempts INSERT/UPDATE with active worker → emit 含 task_id+worker_id+attempt_id+strategy+dispatched_at
      两事件互不混淆（v0.9.3 的 worker.dispatched 实际是注册事件 = 错误）
  - P1-3 (round-robin, v0.9.4 真并发 lost update 修复):
      dispatch_worker() 必须 capability-match 后 least-dispatched 优先（via harness_meta UPSERT）
      真并发 2 threads × 2 distinct tasks: 必须得到 2 distinct winners 且 harness_meta dispatch:worker:* total = 2 (no lost update)
      必须用 BEGIN IMMEDIATE 序列化，避免 read-then-write 之间的窗口被另一连接覆盖

v0.9.3 新增（2 个 NULL bypass 修复，已在 v0.9.3 修复）:
  - trg_attempt_fence_insert NULL bypass: task_id 缺失 OR task.fence_version NULL 也必须被拒（NOT EXISTS 模式）
  - trg_worker_ownership_update 三值逻辑: OLD.current_attempt_id 为 NULL 时 != 比较是 UNKNOWN → silent skip；
    v0.9.3 改 IS NOT 替代 !=
  - v0.9.4 新增：trg_attempt_worker_exists_update 同样的三值逻辑修复 (IS NOT OLD.worker_id)

v0.9.4 新增（4 项补充覆盖）:
  - Case 27d 完整 4 sub-case 真并发: wrong-owner UPDATE + NULL-attempt UPDATE + wrong-owner INSERT path + NULL-attempt INSERT path
  - Case 33 注释修正: w_idle 实际是 IDLE 不是 "bypass"，测试证明直接 INSERT bypasses claim() 仍被 partial unique index 拒绝
  - Case 35 真并发 dispatch race: 2 threads × 2 tasks → BEGIN IMMEDIATE 序列化 → 2 distinct winners + total count = 2
  - Case 36 worker.dispatched 事件在 task_attempts INSERT 时正确发射，payload 含 task_id+worker_id+attempt_id+strategy+dispatched_at

【evidence 要求】
- 每个 P 编号必须有可执行 spike 文件名 + 行号
- 必须指明哪个断言拒绝该反例（trigger 名 / CHECK 名 / FK 名 / partial unique index 名）
- 没有 spike 兜底的修复 = 🟡 spike-deferred，不要标 ✅
- 反例必须用真并发跑（独立 sqlite3.connect + threading.Barrier）— 每个 v0.9-B case 必备
- v0.9.2/v0.9.3/v0.9.4 新增：必须用 mutation-test.py 反向 DROP 证明 spike 的因果链
- 不要相信 PRD-v0.9.md / v0.9.3.md 里写的"已实现"——你必须自己跑

【输出格式（强约束）】
§1 结论（PASS / CHANGES REQUIRED，1 段）
§2 v0.9-A P0 清单 (P0-9A..F) + 每条配一个可复现反例（input → 错输出）
§3 v0.9-B P0 清单 (P0-9G..O) + 每条配一个可复现反例 + 真并发文件证据
§4 P0-M2 / P1 清单 (P0-M2-1, P0-M2-2-bid, P1-1, P1-2-split, P1-3-race) + 修复证据（含 NULL bypass + 真并发验证）
§5 spike coverage matrix（v0.9.4 声明覆盖 vs 实际覆盖）  ← 关键
   行：M0-9 / M0-10 / M0-11 / M0-12 / M0-13 / M0-14 / M0-15 / M0-16
        + v0.8 八条硬门槛（schema 不退化）
        + v0.9.2 三条: M0-17 (lineage level) / M0-18 (worker events emit) / M0-19 (mutation evidence)
        + v0.9.3 一条: M0-20 (NULL bypass 修复 — ownership + fence)
        + v0.9.4 三条: M0-21 (attempt-side ownership) / M0-22 (worker.registered rename + payload split) / M0-23 (dispatch_worker 真并发 atomicity)
   列：v0.9.4 声明 / 你实际跑过的 spike / PASS 或 FAIL
§6 最小修复清单（如有，按优先级，不分阶段）
§7 复审门槛（v0.9.4 提交什么即可 PASS，明确列出 executable evidence）

【判断标准】
- PASS：所有 28 个反例都有可执行 spike + 反例被拒 + §5 matrix 全 PASS
- CHANGES REQUIRED：任一反例没有 spike 兜底，或反例成功，或 §5 有 FAIL

【具体执行路径】
1. cd 到 fish-harness 项目根
2. 跑 schema 应用（应输出 13/14/27/27/39）:
   rm -f /tmp/harness-test.sqlite
   sqlite3 /tmp/harness-test.sqlite < spec/kernel-schema.sql
   sqlite3 /tmp/harness-test.sqlite "SELECT 'tables_project=' || count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
   sqlite3 /tmp/harness-test.sqlite "SELECT 'tables_total=' || count(*) FROM sqlite_master WHERE type='table';"
   sqlite3 /tmp/harness-test.sqlite "SELECT 'triggers=' || count(*) FROM sqlite_master WHERE type='trigger';"
   sqlite3 /tmp/harness-test.sqlite "SELECT 'indexes_named=' || count(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';"
   sqlite3 /tmp/harness-test.sqlite "SELECT 'indexes_total=' || count(*) FROM sqlite_master WHERE type='index';"
3. 跑 13 spike（每个 case 一行）:
   for f in spikes/m0/*.py; do
     [ "$(basename "$f")" = "__init__.py" ] && continue
     [ "$(basename "$f")" = "_helpers.py" ] && continue
     python3 "$f"
   done
   # 期望：13/13 exit 0
4. 跑 12 个 event schema 验证（用 --check-metaschema，不是 --schemafile）:
   for f in spec/events/*.json; do
     [ "$(basename "$f")" = ".gitkeep" ] && continue
     check-jsonschema --check-metaschema "$f"
   done
5. 跑 conformance 10/10:
   python3 spikes/m0/conformance-second-impl.py | grep "10 Protocols"
6. 跑 mutation-test.py 验证因果链:
   python3 spikes/m0/mutation-test.py
   # 期望：17 mutations all baseline PASS / DROP FAIL (M12 已废弃，被 M17 取代)
7. 跑 attempt-side ownership NULL bypass 实际验证（Codex v0.9.3 §7 必看）:
   python3 -c "
import sqlite3, tempfile, os
fd, path = tempfile.mkstemp(suffix='.sqlite'); os.close(fd)
conn = sqlite3.connect(path); conn.execute('PRAGMA foreign_keys=ON')
with open('spec/kernel-schema.sql') as f: conn.executescript(f.read())
conn.execute(\"INSERT INTO workers (worker_id, host, capabilities_json, status, last_heartbeat_at) VALUES ('w-test', 'h1', '[]', 'active', '2026-08-30T12:00:00.000Z')\"); conn.commit()
# attempt-side ownership: UPDATE task_attempts.worker_id 必须拒（attempt 都不存在）
try:
    conn.execute(\"UPDATE task_attempts SET worker_id='w-test' WHERE attempt_id='att-nonexistent'\")
    print('FAIL: attempt-side UPDATE succeeded (no attempt exists)')
except sqlite3.IntegrityError as e:
    print(f'OK: attempt-side UPDATE rejected: {e}')
os.unlink(path)
"
8. 验证 worker.dispatched 与 worker.registered 拆分:
   python3 -c "
import sys; sys.path.insert(0, 'spikes/m0')
import _helpers, os, tempfile
from _helpers import connect_with_fk, register_worker, seed_task, claim
fd, path = tempfile.mkstemp(suffix='.sqlite'); os.close(fd)
conn = connect_with_fk(path=path, apply_schema=True)
register_worker(conn, host='h1', worker_id='w-evt')
task_id = seed_task(conn)
claim(conn, task_id, 'w-evt')
conn.commit()
events = conn.execute(\"SELECT event_type FROM task_events ORDER BY event_id\").fetchall()
print('events:', [r['event_type'] for r in events])
assert any(r['event_type']=='worker.registered' for r in events), 'expected worker.registered'
assert any(r['event_type']=='worker.dispatched' for r in events), 'expected worker.dispatched'
os.unlink(path)
print('OK: worker.registered AND worker.dispatched both emitted (split semantics)')
"

【期望输出】
如果 v0.9.4 修复完整，你应能产出:
  - §1 结论 = PASS
  - §5 matrix 28/28 PASS
  - 所有 mutation 17/17 PASS (M12 已废)
  - 所有 spike 13/13 exit 0
  - 所有 event schema 12/12 有效
  - conformance 10 Protocols

【如果你发现 CHANGES REQUIRED】
  - 每个 FAIL 必须指向具体文件:行号
  - 必须能复现（给出可执行的 sqlite3 / python3 一行命令）
  - 必须区分 FAIL 类型：①反例未拒 ②反例拒但无 spike 兜底 ③spike 兜底但 mutation 缺因果链
  - 不要给"看起来有问题"或"建议改进"——只有可复现的 FAIL
```
