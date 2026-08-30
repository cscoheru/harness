# docs/ 再审 + v1.0 runtime Start 门

> **日期**：2026-08-30  
> **范围**：`docs/` 6 个文件（合同层补丁之后）  
> **对照**：上一轮 `DOCS-REVIEW-v1.1-adjudication.md` 的 §5/§6 门槛  
> **结论**：**docs 现行合同 PASS。批准 Start v1.0 runtime。不批准 Start v1.1。**

---

## §1 结论

上一轮 P0（NORTH-STAR 否决 Python v1.0）已关闭。六项裁定已写入 `PRD-v1.1-product.md` §4，NORTH-STAR §0/§13 已给 runtime 豁免。`v1.0-ga-team-plan.md` 是唯一实施合同，验证清单可执行，仓库仍无 `pyproject.toml` / `harness/`——这正是 v1.0 要做的事。

**架构师裁定：可以、且应当 Start v1.0 runtime。**  
本文件是审定，不是开工。你回一句 **`Start v1.0 runtime`** 后，按 GA plan §8 从 **T-BE-5**（`pyproject.toml` + `harness/__init__.py`）派发，禁止并行开 v1.1 / dsh / PWA。

---

## §2 上一轮门槛对账

| 门槛（adjudication §6） | 现状 | 结果 |
|------------------------|------|------|
| NORTH-STAR 合同层与 B 路径 + 六项裁定无冲突 | §0 分层 + §13 豁免 + A-4 等价类 + Tailscale + M-2/M-4 标 M2 | **PASS** |
| v1.1 §4 六项均为已裁定 | §4.1–§4.6 均有采用/否 | **PASS** |
| GA plan 页眉不再「等待是否采用 B」 | 「实施合同已冻结；另需一句 Start」 | **PASS** |
| VISION 不可被当成现行方案 | 页眉 SUPERSEDED + 禁止引用清单 | **PASS**（正文仍脏，见 P1） |
| 现行合同文件「8 Protocol」= 0 | 仅 VISION / 历史审验 / 本系列旧段落；NORTH-STAR / GA plan / v1.1 均为 10 | **PASS** |
| mutation 17；NFS 不作 v1.0 GA | T-QA-1 / §4.9 = 17/17；T-DD-5 单 host WAL | **PASS** |

**docs 全量：PASS（残余 P1 不阻塞 Start）。**

---

## §3 分文件（本轮）

| 文件 | 角色 | 判定 |
|------|------|------|
| `v1.0-ga-team-plan.md` | 唯一实施合同 | **通过**。§9 四条勾选仍空，由本次 Start 门关闭第一条 |
| `PRD-V0.1-NORTH-STAR.md` | 守护 | **通过**。v1.0 走自身 §4，不走 G-5/W-1 |
| `PRD-v1.1-product.md` | 讨论稿 | **通过**。明确非实施合同；M0b 仍须另一次 Start |
| `VISION-v1.0-supplement.md` | 归档 | **通过**。禁止引用清单足够；页眉第 9 行仍写「手机语音 + 6 host」，与 v1.1 M1 文字/1 worker 不一致（P1） |
| `ARCHITECT-REVIEW-…v1.0.md` | 历史 | 保留；P0-1 已关闭 |
| `DOCS-REVIEW-v1.1-adjudication.md` | 历史裁定 | 保留；结论已被本文件取代 |

---

## §4 不阻塞 Start 的 P1（开工后顺手改）

1. **GA plan §9**：Start 后把「是否启动实施」勾上；5 角色与 5 周默认采纳，无需再等。不要求先做新 spike（lift 源都在 `spikes/m0/`）。  
2. **「12 原 CI job」**：仓库是 13 个 spike 文件；派 T-QA-4 前数清 `.github/workflows/m0-contract-tests.yml` 的 job 数再写 12 或 13。  
3. **VISION 页眉第 9 行**：改成指向 v1.1「文字 M1 / 仅 A」，避免 Agent 扫到「语音」。  
4. **T-BE-5 在表中排最后、§8 要求最先**：派发顺序以 §8 为准。

---

## §5 Start 门（本轮关闭）

| 问题 | 裁定 |
|------|------|
| **是否 Start v1.0 runtime？** | **是。批准。** |
| 是否 Start v1.1 / M0b-dsh？ | **否。** 须 v1.0 GA + 再一句 `Start v1.1 M0b` |
| 第一枪 | **T-BE-5** → 然后 T-BE-1 与 T-TG-1 可并行（受 §3 handoff 约束） |
| 完成定义 | GA plan §4 十二条全绿 + §6 M3 tag，**不是**手机派工 |

未收到你的 **`Start v1.0 runtime`** 之前，仍不写 `harness/` 代码。
