# docs/ 全量审定 + 六项裁定

> **日期**：2026-08-30  
> **范围**：`docs/` 现存 5 个文件（拆分后）  
> **结论**：B 路径拆分**通过**；NORTH-STAR 与实施合同仍冲突 → **CHANGES REQUIRED**（改守护条款，不改回合成总纲）  
> **本文件同时记录六项产品裁定（即日起生效）**

---

## §1 总判定

拆分已经关掉上一轮 P0-1（两份互斥 v1.0 抢实施权）：

| 文件 | 角色 | 本轮判定 |
|------|------|----------|
| `v1.0-ga-team-plan.md` | **唯一 v1.0 实施合同** | 内容可执行；页眉仍写「等待是否启动」与 NORTH-STAR「当前实施合同」不一致 |
| `PRD-v1.1-product.md` | v1.1 讨论稿 | 边界清楚、假设已降级为 H-*；§5 与 NORTH-STAR M/U 仍打架 |
| `VISION-v1.0-supplement.md` | SUPERSEDED 归档 | 页眉正确；正文仍是旧错误总纲，Agent 易误读 |
| `PRD-V0.1-NORTH-STAR.md` | 鱼之守护 | **未随 B 路径修订**：G-5/G-6/W-1/A-4/U-2/U-3/Basic Auth 仍锁死 v0.1，会否决 Python v1.0 |
| `ARCHITECT-REVIEW-fish-harness-prd-v1.0.md` | 历史审验 | 保留；对象路径已改名，加一行指针即可 |

**综合**：文件拓扑 PASS；守护未升级 = 下一轮漂移源。未改 NORTH-STAR 前，**只允许启动 v1.0 runtime，不允许启动 v1.1 实现。**

---

## §2 分文件审定

### 2.1 `v1.0-ga-team-plan.md` — 实施合同（有条件通过）

- 目标与仓库事实对齐：10 Protocol、13 spike lift、不重开 M0、不引入 dsh。  
- 验证清单可执行。  
- **P1**：`Status: AWAITING USER ADJUDICATION` 应改为「实施合同已冻结；启动实施另需用户一句 Start」。  
- **P1**：T-QA-1 写 18/18 mutation，仓库现为 17（M12 已废）。  
- **P1**：T-DD-5 写「WAL + NFS-shared production-ready」与同条「multi-region NOT」并置；跨 host SQLite/NFS 不能当 v1.0 GA 事实（v1.0 保持单机 WAL）。  
- **不阻塞** v1.0 包化。

### 2.2 `PRD-v1.1-product.md` — 讨论稿（通过，待吸收本裁定）

- B 路径、未验证假设降级、禁止派发实现：正确。  
- §5 已写「先文字、语音/Push 在 M2」——与本次裁定 3 一致，但与 NORTH-STAR M-2/M-4/U-2/U-3 冲突。  
- **P1**：H-6「6 host NFS 共享 SqliteWorkerPool」与 v1.0 ADR 0009 方向冲突；跨 host 一致性应走 **每 host 本地 SQLite + 调度层 lease**，或等 runtime 明确支持，禁止默认 NFS。  
- **P1**：§6「不反向依赖 v1.0」与 §2「可 HTTP 调用 kernel」需改成「只依赖稳定 HTTP/FFI，不 fork schema」。

### 2.3 `VISION-v1.0-supplement.md` — 归档（通过，需防误用）

- SUPERSEDED 页眉足够。  
- 正文仍含 8 Protocol、错误 v0.6 章节、不存在的 spike 名、Basic Auth「够用」。  
- **要求**：正文顶部加 10 行「禁止引用清单」；或把正文折进 `<details>`。不要在归档里「修完全文」。

### 2.4 `PRD-V0.1-NORTH-STAR.md` — **必须修订（P0）**

冲突以 NORTH-STAR 为准（§10），则当前守护会：

| 条款 | 与 B 路径 / 本裁定冲突 |
|------|------------------------|
| G-5 / G-6 / W-1 | 锁 dsh 80% + TypeScript ≥2000；否决 Python `harness/` v1.0 |
| A-4 | 锁死 Fable5/GLM5.3/MiniMax-M3 型号 |
| M-2 / M-4 / U-2 / U-3 | 锁死 M1 必须语音 + Web Push |
| §7 认证 | 仍写 Basic Auth |
| §9「8 Protocol」 | 与仓库 10 Protocol 不符 |
| grep 守门 | 关键词在即可过 |

**修订原则（本裁定强制）**：NORTH-STAR 拆成两层——

1. **愿景层（不可改）**：G-1、P-1..P-5、手机闭环定义、三层 orch/commander/worker。  
2. **合同层（可按版本加范围）**：  
   - **v1.0 runtime**：W-1 不适用；语言 = Python；G-5/G-6 不适用。  
   - **v1.1 product**：G-5/G-6 降为「待 M0b 验证」；A-4 改为等价类（裁定 5）；M-2/M-4/U-2/U-3 改为 **v1.1 M2/GA**，M1 豁免。  
   - 认证：删除 Basic Auth 守门，改为裁定 1。

未提交上述补丁前，NORTH-STAR 继续否决自己刚承认的实施合同。

### 2.5 `ARCHITECT-REVIEW-fish-harness-prd-v1.0.md`

历史有效。页眉应注明对象已迁至 `VISION-v1.0-supplement.md`，P0-1 已由拆分关闭。

---

## §3 六项裁定（即日起生效）

写入 `PRD-v1.1-product.md` §4 对应项，并回写 NORTH-STAR 合同层。

### 1. 安全方案 → **(a) Tailscale-only**（v1.1 M1 唯一方案）

| 选项 | 裁定 |
|------|------|
| **(a) Tailscale-only** | **采用**。控制面不进公网；iPhone 走 Tailscale；HTTPS 用 Tailscale Serve / 内网证书。 |
| (b) Cloudflare Tunnel | **M2 候补**。仅当 H-4/H-5 证明必须公网 PWA/Push，且接受音频经 CF。 |
| (c) 自签 CA mTLS | **否**。iOS PWA 装企业 CA 成本高于收益。 |
| (d) Basic Auth + 加固 | **永久否**。v0.2 与 v1.0 审验已关；不得再写「个人项目够用」。 |

理由：单用户、语音/任务指令敏感、已有 Tailscale 拓扑（v0.6 Stage 1）。Web Push 本就不在 M1（裁定 3），避开「公网 origin + VAPID」压力。

### 2. 调度层部署 → **(a) newvps 共址**（M1）；超内存再升 (b)

| 选项 | 裁定 |
|------|------|
| **(a) newvps 共址** | **M1 采用**。与 v1.0 kernel 同机：1 orch + 1 commander + kernel 容器 + 1 worker。必须写内存上限；超限先减 commander/worker，不先加机器。 |
| (b) 独立 VPS | **M0b 测 RAM 后可选**。dsh 实测常驻 > newvps 余量再拆。 |
| (c) MacBook 白天跑 | **禁止作主调度**。违反 P-3/P-5（合盖即死）。MacBook 只当 worker。 |

### 3. Web Push / STT 是否 v1.1 M1 必装 → **否**

- **M1 必装**：手机浏览器可提交任务 + 查看状态/结果（文字表单即可；PWA 安装可选）。  
- **STT（Web Speech / 云）**：M2，且 H-4 真机通过后才能守门。  
- **Web Push**：M2，且 H-5 + Tailscale/公网 origin 方案选定后才能守门。  
- M1「结果回到手机」= 打开页面看见完成态，**不是**系统推送。

NORTH-STAR M-2/M-4/U-2/U-3 改为适用 **v1.1 M2/GA**。

### 4. 三工作流顺序 → **(3) 仅 A**（v1.1 全程）

- v1.1 M1–GA：**只做工作流 A**（独立任务 / research.v1 量级）。  
- B、C **不进 v1.1**（留 v1.2+）。若以后做，顺序为 **A → B → C**，不做 A→C→B（C 有 GPU 与外部发布，成本与副作用最高）。  
- NORTH-STAR §4「不可删除」改为「愿景保留；实施阶段按产品 PRD」。

### 5. 模型守门 → **(a) 等价类约束**

替换 A-4 型号锁定：

| 层 | 等价类（能力） | 禁止 |
|----|----------------|------|
| Orchestrator | 高推理 / 跨项目决策 | 用 worker 档便宜模型当 orch |
| Commander | 中上下文 / 单工作流编排 | 与 orch 同模型且无分层理由 |
| Worker | 低成本批量执行 | 无 |

具体 SKU 只存在 `spec/capabilities/`（M0b 产出），改名不触发 NORTH-STAR 回滚。**(b) 删除**丢失分层；**(c) 保留**会在厂商改名时误爆守护。

### 6. v1.0 GA 后是否启动 M0b-dsh-spike → **有条件启动**

**启动前置（全部满足）**：

1. v1.0 runtime GA（`v1.0-ga-team-plan.md` §4 清单全绿）  
2. 本文件裁定已写入 `PRD-v1.1-product.md` + NORTH-STAR 合同层补丁已合并  
3. 用户再发一句 **Start v1.1 M0b**（不自动开工）

**M0b 范围收窄**（只验底座，不验完整产品）：

| 做 | 不做 |
|----|------|
| H-1 dsh：3 个 A 类任务（调研 / 改代码 / 摘要） | H-4 STT 五人语料（随 M2） |
| H-2 三层等价类各跑同一 A 任务 | H-5 Web Push 真机（随 M2） |
| H-3 wrapper 缺失点 → LOC 估计 | H-7 GPU 视频成本（v1.2） |
| | H-6 六机 NFS（取消；见 §2.2） |

H-1 失败（dsh ≪ 80%）→ 启动「鱼之重新定义」（NORTH-STAR 冲突 3），**禁止**假装 80% 继续写 TS 总量。

---

## §4 文档修补清单（按序）

1. **NORTH-STAR**：加「v1.0 runtime 豁免 W-1/G-5/G-6」；A-4 → 等价类；M-2/M-4/U-* 标 M2/GA；删 Basic Auth；8 Protocol → 10；grep 脚本按合同层分文件。  
2. **`v1.0-ga-team-plan.md`**：状态改为实施合同已冻结；mutation 17；NFS 不作为 v1.0 GA。  
3. **`PRD-v1.1-product.md`**：§4 填入本裁定；§5 M1 与裁定 3/4 对齐；删或改 H-6。  
4. **VISION**：禁止引用框。  
5. **历史审验**：对象改名指针。

---

## §5 现在可以做什么 / 不可以做什么

| 可以 | 不可以 |
|------|--------|
| 用户说 Start 后按 `v1.0-ga-team-plan.md` 派发 Python runtime | 派发任何 v1.1 TS / dsh / PWA 实现 |
| 提交 NORTH-STAR 合同层补丁 | 再合成一份「v1.0 总纲」 |
| 把本裁定抄进 v1.1 §4 | 把 VISION 正文当实施来源 |
| | 未 GA + 未补丁 + 未 Start 就开 M0b |

---

## §6 复审门槛（下次 docs/ 全量 PASS）

- [ ] NORTH-STAR 合同层与 B 路径 + 六项裁定无冲突  
- [ ] v1.1 §4 六项均为「已裁定」而非待选项  
- [ ] GA plan 页眉不再写「等待是否采用 B」  
- [ ] VISION 正文不可被 grep 成现行方案（页眉或 details 隔离）  
- [ ] 全库「8 Protocol」在现行合同文件中为 0（归档除外可保留）
