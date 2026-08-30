# Fish Harness PRD v1.0 审验反馈报告

> **审核对象**：`docs/fish-harness-prd-v1.0.md` → 已迁至 `docs/VISION-v1.0-supplement.md`（2026-08-30 改名 + SUPERSEDED；详见该文件页眉 + 禁止引用清单）
> **审核日期**：2026-08-30
> **基线**：仓库 `main` / v0.9.5（13 spike PASS、27 trigger、12 event schema、**10** Protocol）
> **对照**：`docs/PRD-V0.1-NORTH-STAR.md`、`docs/v1.0-ga-team-plan.md`、`PRD-v0.6.md`、`spec/` + `spikes/m0/`
> **结论**：**CHANGES REQUIRED。愿景回收有价值，但本文不能作为实施合同；冻结前必须裁定「哪一份才是 v1.0」并修正事实错误与自相矛盾。**
>
> **后续状态（2026-08-30 裁定）**：
> - **P0-1（两份互斥 v1.0）已由拆分关闭**：v1.0 runtime = `v1.0-ga-team-plan.md`（实施合同已冻结）；v1.1 product = `PRD-v1.1-product.md`（讨论稿，吸收六项裁定）；本文（v1.0 总纲合成版）= `VISION-v1.0-supplement.md`（归档，禁止引用）
> - **P0-2..P0-6（章节引用错 / 协议数错 / spike 名错 / 内部打架 / 未验证假设焊守门）已由 NORTH-STAR §0 合同层拆分 + `PRD-v1.1-product.md` §3 H-* 显式标记为待验证 关闭**
> - **详见**：`docs/DOCS-REVIEW-v1.1-adjudication.md`

---

## §1 结论（1 段）

v1.0 总纲把「鱼」（手机派工 → 远程干活）拉回中心，这个意图对。但它把 v0.1 未验证假设（dsh 覆盖 80%、TypeScript wrapper、Fable 5 / GLM 5.3）、v0.6 评审里的**建议**（四平面 / Evidence Graph）和 v0.9.5 **已闭环的 Python kernel** 叠成一份「生产就绪」PRD，同时仓库里还有一份互相否定的 `docs/v1.0-ga-team-plan.md`（Python 包化、5 周、无 dsh）。交叉引用大量指错章节；M0 在 13/13 已绿之后又开 4 周；M1 示例把 YouTube/ASR/Evidence Graph/Web Push 塞进「第一刀」。按可执行标准，**产品方向部分通过，实施规范不通过，不允许按本文开干。**

---

## §2 独立评分

| 维度 | 分 | 说明 |
|------|----|------|
| 产品愿景回收 | 8/10 | 手机 → 远程 7×24 的原点清楚 |
| 范围控制 | 3/10 | 15 周 + 6 host + 三工作流 + 知识层 = 平台，不是 MVP |
| 与仓库事实一致性 | 2/10 | 8 Protocol、v0.6 章节号、不存在的 spike 文件名 |
| 与并存 v1.0 计划一致性 | 1/10 | TS/dsh vs Python/`harness/` 两套 v1.0 |
| 架构可实施性 | 4/10 | 三层 vs 四平面 vs Driver 未和解 |
| 安全 | 3/10 | Basic Auth 在 v0.2 已否；egress/approval 被口号化 |
| 工期可信度 | 3/10 | 4000–4500 行 TS + dsh 80% 无证据 |
| NORTH-STAR 守门有效性 | 2/10 | grep 关键词即可「通过」 |

综合：**约 3.5/10，不冻结。**

---

## §3 P0 阻塞项

### P0-1：仓库里有两份互斥的「v1.0」

| | `docs/fish-harness-prd-v1.0.md` | `docs/v1.0-ga-team-plan.md` |
|--|-------------------------------|----------------------------|
| 语言 | TypeScript（W-1 禁止 Python） | Python `harness/` 包 |
| 底座 | dsh + wrapper | v0.9.5 spec/spike lift |
| M0 | 再做 4 周 spike | 已完成，直接 M1 包化 |
| 完成定义 | 手机语音 + 6 host + 三工作流 + Evidence Graph | `pip install` + Docker + 15 CI |
| 工期 | 4+3+4+4 ≈ 15 周 | ≈ 5 周 |

未裁定前，任何角色开工都会做相反的事。

**必须**：用户二选一（或写 ADR：鱼之产品目标 vs 鱼鳞 runtime 分仓/分阶段），另一份标 SUPERSEDED。

### P0-2：交叉引用指向错误章节（可复现）

本文把 **ARCHITECT-REVIEW-PRD-v0.6.md 的建议**写成 **PRD-v0.6 正文**：

| 本文声称 | `PRD-v0.6.md` 实际 |
|----------|-------------------|
| §7.1 = 四平面架构 | §7.1 =「v0.5 问题」（Codex API 伪代码） |
| §7.2 = RuntimeBackend 拆分 | §7.2 = M0 spike 后再锁 Driver |
| §7.4 = Evidence Graph | §7.4 = CodexSdkDriver 伪代码 |
| §7.5 = Evaluator SPI | §7.5 = App Server 边界 |
| §8.2 = 9 项 M0 真实测试 | §8.2 = 里程碑工期表（M0 2–3 周…） |
| §6.3 = p50/p95 用户指标 | §6.3 = EgressFetcher 测试函数名 |
| §10 = 8 条进入 M1 硬门槛 | §10 = 状态不变量 I1–I10 |
| §11 = research.v1 WorkflowPack | §11 = 测试与验收 |

「避免重复漂移」的 §13 本身在制造新漂移。

### P0-3：协议数量写错，且与「鱼鳞是参考」冲突

- 仓库事实：`spec/interfaces/` 为 **10 个 Protocol**（8 个文件里含 ToolInvocationGateway + ContextBudget）。`conformance-second-impl.py` 打印 `10 Protocols`。
- 本文 TL;DR / §10 / §14 一律写 **8 Protocol**。
- 同时规定「不得把 spec/Protocol 当作接口契约」（§14），又要求 T-M0-5 的 `gateway.ts` **通过** `conformance-second-impl.py`（Python Protocol）。TS wrapper 无法 import 这些 Protocol。

### P0-4：M0 在已 PASS 之后重开，且点名不存在的文件

v0.9.5 已：13/13 spike、17/17 mutation、12/12 event schema、10/10 Protocol。

本文 T-M0-3/4 要求：

- `spikes/m0/fence-monotonicity.py` — **不存在**（实际 `claim-fence-test.py`）
- `spikes/m0/cancel-vs-reaper.py` — **不存在**（实际 `cancel-race-test.py`）
- `spikes/m0/egress-real-network.py` — **不存在**（实际 `egress-httpx-actual.py`，且为离线确定性测试）
- `spikes/m0/dsh-spike.py` — **不存在**；dsh 能力在 v0.2–v0.6 一直标「未验证」

§10 又写「鱼鳞不得脱离持久化层独立演进」。T-M0-* 正好是脱离持久化层再开一轮 spike。

### P0-5：NORTH-STAR 与本文内部条款互相打架

| 条款 | 要求 | 本文另一处 |
|------|------|-----------|
| P-1 / NORTH-STAR | commander/worker **之间禁止插入 Driver 层** | §3 ExecutionDriver **M0 必装** |
| A-3 / H-4 | worker ≥ 6 host、至少 5 个 24/7 VPS | §5.2 M1 **只有 1 个 worker** |
| A-2 | commander ≥ 3 | §5.2 M1 **1 个 commander**（NORTH-STAR 允许 MVP 减配，但 A-3 未同样降级） |
| Knowledge Plane | M2 起装 | §5.3 M1 示例步骤 4 **已做** Evidence Graph |
| Channel Adapter | M3 | M1 退出标准 **必须 Web Push**（U-3） |
| research.v1 | Web-only research | 示例是 YouTube + ASR（工作流 B） |

守门脚本（§15）用 `grep 语音|PWA` 即可过 U/M，**不能**抓住上述矛盾。

### P0-6：未验证技术栈被写成事实

1. **dsh 覆盖 80%**：无仓库证据、无版本钉死、无 capability JSON。v0.2 复审已禁止把未 spike 的 dsh 写成事实。
2. **TypeScript 重写已验证的 Python kernel**：W-1 把 5627 行 spike + 873 行 SQL 降为「参考」，却要求 300 行 TS wrapper「覆盖」27 trigger。这是换语言重做形式验证，不是 300 行。
3. **模型名**：`claude-fable-5` / `glm-5.3-flash` / `MiniMax-M3` 无 M0 实测；A-4 还规定「不可互换」。模型下架或改名会直接违反 NORTH-STAR。

---

## §4 P1 项

### P1-1：安全回退到 v0.2 已否方案

§7 / R-6：`Caddy Basic Auth + 强密码`。v0.2 架构复审已判定 Basic Auth 不足（公网域名 + 语音 + 推送）。个人项目也不能用「够用」跳过。至少：Tailscale/独立凭证、session、VAPID 密钥管理、STT 音频不落公网明文。

### P1-2：M1 范围比 v0.6 Stage 1 更大，却更少硬门槛

v0.6 Stage 1 = read-only research、无外部写、Approval 建表不写、进入 Stage 1 有 8 条硬门槛。  
本文 M1 = 语音 PWA + Web Push（外部副作用）+ YouTube/ASR + dsh 部署，**没有** deny 不可扩权、kill/restart 恢复、backup restore、egress 安全集的可执行 gate。

### P1-3：行数与「生产就绪」不匹配

§9 合计 4000–4500 行 TS，含三层抽象、PWA、三工作流、Evidence Graph、Evaluator、Memory、registry。与「dsh 80% + 薄 wrapper」和「生产就绪 Agent Harness」同时成立，则至少有一句是假的。

### P1-4：CI digest/signature 再次当作 M0 退出条件

v0.6 审验已证明当时 workflow 样例不能按文档工作。本文 §11 M0 退出标准原样搬回，无新 evidence 路径。

### P1-5：资源账对不上

调度层：orch 1G + commander×3 1G + dsh 0.5G + Portainer 0.5G = 5G，另加 newvps-w1/w2 各 4G，写在 7.8G + 4G swap 的同一台 newvps 上。未给出同机编排与 OOM 预算。

---

## §5 做得对的部分（保留）

1. 明确「spike PASS ≠ 鱼活了」——对 v0.9 漂移的诊断成立。  
2. 三层（orch / commander / worker）与位置无关、Locality、离线降级，作为**产品约束**仍然有效。  
3. 手机可演示闭环（派工 → 完成 → 回传）应是真正的 GA 定义，而不是 kernel trigger 数。  
4. 回滚按阶段降级（保留 M1 / 关 Knowledge）方向合理。  
5. 状态栏写「待裁定」是对的——本文目前只该当讨论稿。

---

## §6 建议裁定（选一条，不要并行）

**方案 A — 产品 v1.0（鱼）**  
冻结 NORTH-STAR 的演示目标：M1 = 1 orch + 1 commander + 1 worker + 文字或语音择一 + 一种回传（先不必 Web Push）。语言与底座先 **dsh spike 4 周**，未出 capability JSON 之前不写 TypeScript 总量、不写「80%」。四平面 / Evidence Graph / 视频 / 6 host 全部标 M2+。删除错误的 v0.6 章节引用。

**方案 B — Runtime v1.0（鱼鳞投产）**  
采用 `docs/v1.0-ga-team-plan.md`：Python lift、不重开 M0、不引入 dsh。手机/多 host 另开 `PRD-v1.1-product.md`。本文件标 SUPERSEDED 或改名为愿景附录。

**方案 C — 双轨**  
两个仓库或两个 package：`harness-kernel`（Python，已有）+ `harness-product`（dsh/TS，新开）。NORTH-STAR 只约束 product；kernel 不受 W-1 管辖。本文必须拆成两份 PRD，禁止再合成一份「总纲」。

未选 A/B/C 之前：**不派发实现、不改 spec、不加新 spike。**

---

## §7 若坚持修订本文：最小修补清单

按优先级，不分阶段：

1. 文首增加「与 `v1.0-ga-team-plan.md` 的关系」+ 用户裁定记录。  
2. 全文「8 Protocol」改为「10 Protocol / 8 接口文件」。  
3. §13 每条引用改为真实文件:节（评审建议标 `ARCHITECT-REVIEW-…`，禁止标 `PRD-v0.6 §7.1`）。  
4. 删除或改写不存在的 spike 文件名；承认 v0.9.5 M0 已关闭，新 dsh/Codex spike 另立 M0b。  
5. 和解 P-1 与 ExecutionDriver：Driver 是 worker **进程内** SPI，不是第四调度层——写进 NORTH-STAR，或从 M0 必装表拿掉。  
6. A-3/H-4 增加「M1 豁免：1 worker；M3 才满 6 host」。  
7. §5.3 示例改为与 research.v1 / M1 范围一致（去掉 Evidence Graph、YouTube/ASR，或标「M2 示例」）。  
8. Basic Auth 改为待定安全方案，不写「够用」。  
9. 守门脚本从 grep 改为：对照表 + 禁止冲突条款并存（A-3 vs M1 主机数等）。  
10. 模型 ID 改为「M0 锁定，A-4 暂缓」。

---

## §8 复审门槛（下次什么算 PASS）

- [ ] 用户书面裁定 A / B / C  
- [ ] 只剩一份有效 v1.0 实施合同  
- [ ] 所有「PRD-v0.6 §x」抽检 10 条，章节名与内容一致  
- [ ] Protocol 数与 `conformance-second-impl.py` 一致  
- [ ] M0 任务只引用仓库里存在的路径，或明确「新建」  
- [ ] M1 范围、示例、守门条款三者无矛盾  
- [ ] dsh / 模型 / 行数均标「未验证」或附 spike 证据  

**本次判定：CHANGES REQUIRED。不建议合并、不建议按本文排期。**
