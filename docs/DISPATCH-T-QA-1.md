# 审验签发 — T-QA-1（含 deploy smoke P0 必修）

> **给 CC**：只读本文件。上一枪 [`docs/REVIEW-T-DO-3.md`](REVIEW-T-DO-3.md) = **PASS**（P0 见下）。  
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。  
> 做完 Phase 0+A 即停；写 `cc-ready` → commit/push → 按 `docs/CC-POLL.md` 轮询。

---

## Phase 0 — 修 T-DO-4 `deploy.yml` smoke（P0，先做）

**问题**：`smoke` 与 `build` 分属不同 runner；`load: true` 的镜像只在 build 机上，smoke 机 `docker run` 必挂。

**任选其一（推荐 0a）**：

| 方案 | 做法 |
|------|------|
| **0a** | 把 spike smoke + sqlite assert **挪进 `build` job** 末尾（同 runner，`load` 后立刻 `docker run`）；删独立 `smoke` job 或改成 no-op 文档 |
| **0b** | `smoke` `needs: [push]`，`docker pull` GHCR 后再跑；`workflow_dispatch` 无 push 时在本 job 内 `docker build` |
| **0c** | `smoke` job 自己 `docker build` 再跑（与 push 解耦，多花时间） |

验收 0：目视 YAML 保证 **跑 spike 的步骤与持有该 image 的 docker daemon 在同一 job**。

---

## Phase A — T-QA-1 `mutation_suite`

### 输入

- `spikes/m0/mutation-test.py`（~999 行；17/18 mutations；**M12 已废**，以文件头列表为准）
- `spikes/m0/_helpers.py` — **不删**；生产路径优先 `harness.runtime`（`_db` / `workers` / `context`）
- GA plan §2 T-QA-1；§3 Mutation 契约

### 产出

| 文件 | 内容 |
|------|------|
| `harness/testing/mutation_suite.py` | `run_mutations() -> dict[str, bool]`（或等价 id→结果）；实现 lift 自 spike |
| `harness/testing/__init__.py` | 按需 export |
| CLI | `python -m harness.testing.mutation_suite` → 打印各 mutation PASS/DROP-FAIL；**exit 0 仅当 baseline 全绿** |

### 行为契约

1. 每个 mutation：baseline ON → 正测 PASS；DROP 约束 → 正测 FAIL（证因果）；可选 restore  
2. 覆盖文件头列出的 M1–M11, M13–M18（**无 M12**）  
3. 用 `harness.runtime._db` / workers / context 替代 `_helpers` 处尽量替换；若某 mutation 仍依赖 spike helper，可临时 `sys.path` 进 `spikes/m0`，但 **CLI 入口必须在 `harness.testing`**  
4. schema：`HARNESS_SCHEMA_PATH` 或 `/app/spec/kernel-schema.sql`（容器）  
5. **不**改 `spec/kernel-schema.sql` 动态 RAISE；sqlite 须 ≥3.47（宿主/容器）

### 验收 A

```bash
# 宿主（sqlite≥3.47）
python3 -m harness.testing.mutation_suite
# 期望：17/17（或文件头声明的全集）baseline PASS；摘要清晰

# 容器
docker build -t fish-harness:1.0.0a0 .
docker run --rm -v "$PWD/spikes:/app/spikes:ro" fish-harness:1.0.0a0 \
  python -m harness.testing.mutation_suite
# 若 suite 不需 mount spikes，可去掉 -v
```

可选：改 `deploy.yml` smoke 调用 `python -m harness.testing.mutation_suite`（替换 5-spike），并保留 Phase 0 同-runner 修复。

---

## 总验收

```bash
test -f harness/testing/mutation_suite.py
python3 -m harness.testing.mutation_suite   # exit 0
# deploy.yml：smoke 与 image 同 runner（Phase 0）
```

---

## 完成后

1. NOW：T-QA-1 ✅；§4 → **T-DO-5** 或 **T-QA-2**（建议 **T-QA-2** 集成测试，或 T-DO-5 若优先 review gate）  
2. `docs/poll/cc-ready.json`（填真实 commit）→ commit + push  
3. 更新 HANDOFF  
4. 停，等 `docs/REVIEW-T-QA-1.md`

## 禁止

不删 `_helpers.py`；不开 v1.1/TS/dsh；不扩 T-QA-2/3 全文；不 force push；不 commit 密钥
