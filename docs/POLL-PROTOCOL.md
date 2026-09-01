# 双端轮询协议 — Cursor 审验 ↔ CC 执行

> 状态只靠**仓库文件 + git**，不靠聊天粘贴。  
> 停轮询：对本会话说「停止轮询」或删 `docs/poll/ACTIVE`。

---

## 角色

| 端 | 节奏 | 何时动 |
|----|------|--------|
| **Cursor（本会话）** | 每 **30 min** | 检查 CC 是否交付完毕；完毕则审验 → 写报告 → 签发下一单 |
| **CC** | 交付并 **commit + push 之后** 才启动；每 **5 min** | 查审验是否完成；读报告 + 下一单并执行。**未 commit/push → 不轮询** |

---

## 文件约定

| 路径 | 谁写 | 含义 |
|------|------|------|
| `docs/poll/ACTIVE` | Cursor 建 / 用户删即停 | 轮询开关（存在 = 开） |
| `docs/poll/state.json` | Cursor | 机器状态：当前枪、上次审验、等待中 |
| `docs/poll/cc-ready.json` | **CC**（commit 进仓） | 「本枪已交付并 push」信号 |
| `docs/DISPATCH-T-*.md` | Cursor | 下一单任务书（CC 只读此文件开工） |
| `docs/REVIEW-T-*.md` | Cursor | 审验报告（PASS/FAIL + 证据） |
| `docs/NOW.md` | CC 完成时改 ✅；Cursor 签发时改 §4 | 温卡 |
| `docs/HANDOFF-TO-CURSOR.md` | 双方收尾更新 | 三栏交接 |

### `docs/poll/cc-ready.json`（CC 在 push 前写入并一并提交）

```json
{
  "task_id": "T-DO-2",
  "commit": "<full-or-short-sha>",
  "pushed_at": "2026-08-31T21:00:00+08:00",
  "branch": "main",
  "notes": "optional"
}
```

### `docs/poll/state.json`（Cursor 维护）

```json
{
  "active": true,
  "issued_task": "T-DO-2",
  "dispatch_file": "docs/DISPATCH-T-DO-2.md",
  "awaiting": "cc_ready",
  "last_tick_at": null,
  "last_reviewed_task": "T-DO-1",
  "last_review_file": null,
  "cursor_interval_sec": 1800,
  "cc_interval_sec": 300
}
```

`awaiting` 枚举：`cc_ready` | `review_done` | `idle` | `blocked`

---

## Cursor 每 tick（30 min）做什么

1. `git fetch`（若有 remote）；读 `docs/NOW.md`、`docs/poll/state.json`、`docs/poll/cc-ready.json`（若有）
2. **未就绪**（无 `cc-ready`，或 NOW 未把 issued_task 标 ✅，或 commit 对不上）→ 更新 `last_tick_at`，写一行 `docs/poll/ticks.log`，**不审验**
3. **已就绪**且尚未写过对应 `REVIEW-T-*.md` →
   - 按 DISPATCH / GA plan 跑验收
   - 写 `docs/REVIEW-T-<id>.md`
   - PASS：写 `docs/DISPATCH-T-<next>.md`；更新 NOW §2/§4、HANDOFF、`state.json`（`issued_task=next`, `awaiting=cc_ready`）
   - FAIL：只写 REVIEW（含 blockers）；`awaiting=blocked`；**不签发**下一单
4. 本会话对用户给**短摘要**（PASS/FAIL + 下一单路径）

---

## CC 流程（短命令）

### 开工（未 push 前不要轮询）

```text
读 docs/DISPATCH-T-<当前>.md（或 docs/NOW.md §4 指向的 DISPATCH），按文件执行，做完一枪即停。
```

### 交付后（必须）

1. 更新 `docs/NOW.md` 该枪 → ✅  
2. 写 `docs/poll/cc-ready.json`  
3. `git add` 相关文件 → `commit` → `push`  
4. **此后**才开始 5 min 轮询：

```text
每 5 分钟：git pull；若存在 docs/REVIEW-T-<本枪>.md：
  - FAIL → 停，按报告修，修完重新 cc-ready + commit/push
  - PASS 且存在 docs/DISPATCH-T-<下一枪>.md → 读并执行下一枪；清掉旧轮询，完成后再 cc-ready+push
  - 尚无 REVIEW → 再等 5 分钟
无 commit/push → 禁止启动该轮询
```

---

## 给 CC 的最短粘贴（开工）

```text
读 docs/POLL-PROTOCOL.md §CC + 当前 docs/DISPATCH-T-*.md，执行一枪；交付后写 docs/poll/cc-ready.json 并 commit/push；然后每 5 分钟 git pull 读 REVIEW/下一单 DISPATCH。
```

## 给本 Cursor 会话

- 已建 `docs/poll/ACTIVE` + `state.json`
- 后台 **1800s** loop：sentinel `AGENT_LOOP_TICK_harness_review`
- 停：说「停止轮询」或删除 `docs/poll/ACTIVE`
