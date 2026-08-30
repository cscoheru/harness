# Codex v0.9.3 合并复审指令

> **File**: `notes/codex-review-prompt-v0.9.3.md`
> **Date**: 2026-08-30
> **Source**: `notes/codex-review-prompt-v0.9.2.md` (SUPERSEDED — returned CHANGES REQUIRED)
> **Target**: Codex 对 v0.9.3 (修复 ownership NULL bypass + fence NULL bypass + Case 27d + 真并发 + M0-19 扩展 + CI flag) 做合并复审
> **Supersedes**: `notes/codex-review-prompt-v0.9.2.md` (v0.9.2 合并复审 CHANGES REQUIRED / 17/19 PASS)
>
> **背景**: Codex v0.9.2 合并复审返回 CHANGES REQUIRED（2 FAIL：M0-14 ownership NULL bypass + M0-19 mutation 覆盖盲区）。v0.9.3 修复：
> - ownership + fence 两处 NULL bypass（triggers 改 NOT EXISTS + UPDATE 用 `IS NOT` 替代 `!=`）
> - Case 27d 新增（4 sub-case 真并发）
> - 9 个 case (27a/b/c, 29a/b/c, 30/31/32) 转真并发
> - Case 28c 断言从 `>= 1` 改为 `== 2`
> - M0-19 mutation 从 6 扩到 15
> - CI flag 改 `--check-metaschema`

---

## 主指令（可直接复制粘贴到 Codex）

```text
请按以下规则复审 PRD-v0.9.3 (v0.9.2 修复 + NULL bypass 修复 + 真并发升级):

【范围限定（强约束）】
- 只读 spec/ 与 spikes/m0/ 目录
- 不要读 PRD-v0.9.md（除非明确指出要看哪一段）
- 不要读 adr/0006-context-layering.md / adr/0007-worker-pool.md（除非明确指出）
- 不要读 RESPONSE-TO-CODEX-v0.9-MERGED-RESPONSE.md / RESPONSE-TO-CODEX-v0.9.2-REVIEW.md
  (v0.9 / v0.9.2 的 response，anchor bias；本次对应 response 是 RESPONSE-TO-CODEX-v0.9.2-REVIEW.md 仅作参考但不参与判断)
- 不要读 ARCHITECT-REVIEW-PRD-v0.9-MERGED.md（v0.9 review，你这次是 v0.9.3 重审）
- 不要读 notes/v0.9-contemplations.md
（避免你的判断被 v0.9 / v0.9.2 review 话术影响）
- 复审只基于 spike 实际跑出的结果，不基于 PRD 承诺

【反例驱动（核心 — 涵盖 v0.9-A 6 + v0.9-B 9 + v0.9.2 新增 5 + v0.9.3 NULL bypass 2）】
PRD-v0.9.3 共 22 个反例:

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
  - P0-M2-2 (双向 ownership): workers.current_attempt_id 指向的 attempt.worker_id 必须 == self.worker_id
    - NULL-safe (v0.9.3): attempt 不存在 OR attempt.worker_id NULL 也必须被拒
    - Case 27d 4 sub-case: wrong-owner UPDATE + NULL-attempt UPDATE（真并发）
  - P1-1 (lineage level): L2 parent 必须 L0/L1, L3 parent 必须 L2
  - P1-2 (worker events): register/heartbeat/drain 3 类事件必须实际 emit 且 payload 符合 schema
  - P1-3 (round-robin): dispatch_worker() 必须 capability-match 后 least-dispatched 优先 (不是 heartbeat 降序固定取首)

v0.9.3 新增（2 个 NULL bypass 修复）:
  - trg_attempt_fence_insert NULL bypass: task_id 缺失 OR task.fence_version NULL 也必须被拒
  - trg_worker_ownership_update 三值逻辑: OLD.current_attempt_id 为 NULL 时 `!=` 比较是 UNKNOWN，
    v0.9.3 改 `IS NOT` 替代 `!=`

【evidence 要求】
- 每个 P 编号必须有可执行 spike 文件名 + 行号
- 必须指明哪个断言拒绝该反例（trigger 名 / CHECK 名 / FK 名 / partial unique index 名）
- 没有 spike 兜底的修复 = 🟡 spike-deferred，不要标 ✅
- 反例必须用真并发跑（独立 sqlite3.connect + threading.Barrier）— 每个 v0.9-B case 必备
- v0.9.2/v0.9.3 新增：必须用 mutation-test.py 反向 DROP 证明 spike 的因果链
- 不要相信 PRD-v0.9.md 里写的"已实现"——你必须自己跑

【输出格式（强约束）】
§1 结论（PASS / CHANGES REQUIRED，1 段）
§2 v0.9-A P0 清单 (P0-9A..F) + 每条配一个可复现反例（input → 错输出）
§3 v0.9-B P0 清单 (P0-9G..O) + 每条配一个可复现反例 + 真并发文件证据
§4 P0-M2 / P1 清单 (P0-M2-1, P0-M2-2, P1-1, P1-2, P1-3) + 修复证据（含 NULL bypass 验证）
§5 spike coverage matrix（v0.9.3 声明覆盖 vs 实际覆盖）  ← 关键
   行：M0-9 / M0-10 / M0-11 / M0-12 / M0-13 / M0-14 / M0-15 / M0-16
        + v0.8 八条硬门槛（schema 不退化）
        + v0.9.2 三条: M0-17 (lineage level) / M0-18 (worker events emit) / M0-19 (mutation evidence)
        + v0.9.3 一条: M0-20 (NULL bypass 修复 — ownership + fence)
   列：v0.9.3 声明 / 你实际跑过的 spike / PASS 或 FAIL
§6 最小修复清单（如有，按优先级，不分阶段）
§7 复审门槛（v0.9.3 提交什么即可 PASS，明确列出 executable evidence）

【判断标准】
- PASS：所有 22 个反例都有可执行 spike + 反例被拒 + §5 matrix 全 PASS
- CHANGES REQUIRED：任一反例没有 spike 兜底，或反例成功，或 §5 有 FAIL

【具体执行路径】
1. cd 到 fish-harness 项目根
2. 跑 schema 应用（应输出 13/14/24/27/39）:
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
4. 跑 11 个 event schema 验证（用 --check-metaschema，不是 --schemafile）:
   for f in spec/events/*.json; do
     [ "$(basename "$f")" = ".gitkeep" ] && continue
     check-jsonschema --check-metaschema "$f"
   done
5. 跑 conformance 10/10:
   python3 spikes/m0/conformance-second-impl.py | grep "10 Protocols"
6. 跑 mutation-test.py 验证因果链:
   python3 spikes/m0/mutation-test.py
   # 期望：15 mutations all baseline PASS / DROP FAIL
7. 跑 NULL bypass 实际验证（Codex v0.9.2 §7 必看）:
   python3 -c "
import sqlite3, tempfile, os
fd, path = tempfile.mkstemp(suffix='.sqlite'); os.close(fd)
conn = sqlite3.connect(path); conn.execute('PRAGMA foreign_keys=ON')
with open('spec/kernel-schema.sql') as f: conn.executescript(f.read())
conn.execute(\"INSERT INTO workers (worker_id, host, capabilities_json, status, last_heartbeat_at) VALUES ('w-test', 'h1', '[]', 'active', '2026-08-30T12:00:00.000Z')\"); conn.commit()
# ownership NULL attempt UPDATE → must reject
try:
    conn.execute(\"UPDATE workers SET current_attempt_id='att-nonexistent' WHERE worker_id='w-test'\")
    print('FAIL: ownership NULL bypass UPDATE succeeded')
except sqlite3.IntegrityError as e:
    print(f'OK: ownership NULL bypass UPDATE rejected: {e}')
# fence NULL task INSERT → must reject
try:
    conn.execute(
        'INSERT INTO task_attempts (task_id, attempt_id, fence_version, worker_id, status, lease_token, lease_expires_at, status_version, driver_kind) '
        \"VALUES ('t-nonexistent', 'att-fb-test', 999, NULL, 'pending', 'l', '2099-01-01T00:00:00Z', 0, 'codex_sdk')\"
    )
    print('FAIL: fence NULL bypass INSERT succeeded')
except sqlite3.IntegrityError as e:
    print(f'OK: fence NULL bypass INSERT rejected: {e}')
os.unlink(path)
"

【期望输出】
如果 v0.9.3 修复完整，你应能产出:
  - §1 结论 = PASS
  - §5 matrix 20/20 PASS (M0-9..M0-20)
  - 11 event schema 全部 check-jsonschema --check-metaschema 通过
  - 13 spike exit 0
  - 10/10 Protocol conformance
  - 15 reverse-DROP mutations 全部 baseline PASS / DROP FAIL
  - 2 个 NULL bypass 都变 IntegrityError
```

---

## v0.9.3 改动清单（背景参考）

### Schema 变更 (3 trigger 内部 WHERE 子句改写, 总数仍 24)

```text
v0.9.2 → v0.9.3:
  ~ trg_attempt_fence_insert: (SELECT fence_version FROM tasks WHERE ...) != NEW.fence_version
                              → NOT EXISTS (SELECT 1 FROM tasks WHERE task_id=NEW.task_id AND fence_version=NEW.fence_version)
                              (v0.9.3 新发现, NULL bypass — Codex medium 漏掉, xhigh 必暴露)
  ~ trg_worker_ownership_insert: (SELECT worker_id FROM task_attempts WHERE attempt_id=NEW.current_attempt_id) != NEW.worker_id
                                  → NOT EXISTS (SELECT 1 FROM task_attempts WHERE attempt_id=NEW.current_attempt_id AND worker_id IS NOT NULL AND worker_id=NEW.worker_id)
  ~ trg_worker_ownership_update: 同上 + NEW.current_attempt_id != OLD.current_attempt_id
                                  → NEW.current_attempt_id IS NOT OLD.current_attempt_id (NULL-safe 不等)
终态: 24 triggers
```

### Spike 变更

```text
spikes/m0/worker-dispatch-test.py
  + case_27d_worker_ownership_nullsafe: 4 sub-case 真并发 (wrong-owner UPDATE + NULL-attempt UPDATE)
  ~ case_27a/b/c: 单连接 make_db() → file-DB + Barrier(2) + 独立 connect
  ~ case_29a/b/c: 单连接 → 真并发
  ~ case_30/31/32: 单连接 → 真并发
  ~ case_28c: 断言从 >= 1 改为 == 2 (两 backward heartbeat 必双拒)
  终态: 19 cases 全真并发

spikes/m0/mutation-test.py
  + m7-m15: 9 new mutations
    M7-M8: ownership_insert/update
    M9-M10: lineage_l2/l3_needs_parent
    M11: snapshot_no_update
    M12-M14: worker_dispatched/heartbeat/drained_event_emit
    M15: dispatch_worker monkey-patch (heartbeat-first → all 6 funnel)
  终态: 15 mutations
```

### CI 变更

```yaml
# .github/workflows/m0-contract-tests.yml line 234
# OLD: check-jsonschema --schemafile "$f"
# NEW: check-jsonschema --check-metaschema "$f"
```

---

## 复审门槛 (§7 期望 Codex 输出)

```text
§1 结论：PASS
§2 v0.9-A P0 6 个 — 全 PASS，每个有独立 spike case
§3 v0.9-B P0 9 个 — 全 PASS，每个有真并发文件证据
§4 P0-M2 + P1 共 5 个 — 全 PASS，包含 ownership + fence 两处 NULL bypass
§5 matrix 20/20 PASS:
     M0-9  (context schema)             PASS
     M0-10 (context A-F 真并发)         PASS
     M0-11 (snapshot 事件 payload)      PASS
     M0-12 (Context Protocol)          PASS
     M0-13 (worker schema)             PASS (24 triggers / FK / 双向 ownership NULL-safe)
     M0-14 (worker P0-9G-O + Case 27d) PASS (19 真并发 cases)
     M0-15 (WorkerPool Protocol)       PASS
     M0-16 (worker event emit)         PASS
     M0-17 (lineage level P1-1)        PASS
     M0-18 (worker events P1-2)        PASS
     M0-19 (mutation evidence)         PASS (15 reverse-DROP)
     M0-20 (NULL bypass fix)           PASS (ownership + fence 两处都变 IntegrityError)
     + v0.8 八条硬门槛 全 PASS
§6 最小修复清单: 空 (no new blockers)
§7 复审门槛: v0.9.3 已是 PASS 状态
```

如果在 §5 仍有 FAIL，按 FAIL 行号定位修复。

---

## 与 v0.9.2 prompt 的差异

| 项 | v0.9.2 (SUPERSEDED) | v0.9.3 (本文件) |
|---|---|---|
| Trigger 数 | 24 | 24 (3 internal NULL-safe rewrite) |
| Spike 数 | 12 | 13 (worker-dispatch-test 加 Case 27d) |
| Worker-dispatch cases | 18 | 19 (+Case 27d 4 sub-case) |
| 真并发 cases | 16 (27a/b/c + 29a/b/c + 30/31/32 是单连接) | 19 (全部) |
| Mutation evidence | 6 | 15 (+9) |
| Fence trigger NULL bypass | 未提及 | ✅ v0.9.3 新发现, NOT EXISTS 修复 |
| Ownership UPDATE NULL bypass | 未提及 (Codex medium 漏) | ✅ `IS NOT` 替代 `!=` |
| CI flag 错 | `--schemafile` (Codex 已 flag) | `--check-metaschema` |
| §5 matrix | 19/19 (自报, 实际 17/19) | 20/20 (M0-20 = NULL bypass) |

---

## 历史版本

- `notes/codex-review-prompt-v0.9.md` (superseded by merged)
- `notes/codex-review-prompt-v0.9-merged.md` (superseded by v0.9.2)
- `notes/codex-review-prompt-v0.9.2.md` (superseded by v0.9.3, returned CHANGES REQUIRED)
- `notes/codex-review-prompt-v0.9.3.md` ← **当前权威**