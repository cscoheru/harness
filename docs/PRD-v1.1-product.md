# Fish Harness PRD v1.1 — 鱼之产品 PRD（手机派工 + 6 host）

> **状态**：🟡 **DRAFT — 范围讨论稿**（六项产品裁定已写入 §4）
> **日期**：2026-08-30（合同层补丁）
> **作者**：架构师（用户裁定 B 路径 + 六项产品裁定后立）
> **关系**：
> - 本文 ≠ `docs/v1.0-ga-team-plan.md`（v1.0 runtime：Python kernel GA，5 周，**当前实施合同**）
> - 本文 ≠ `docs/VISION-v1.0-supplement.md`（v1.0 总纲合成版，已 SUPERSEDED）
> - 本文 = **v1.0 runtime 之后的下一份产品 PRD**，讨论手机/6 host/语音/Web Push 等产品愿景如何落地
> **守护**：受 `docs/PRD-V0.1-NORTH-STAR.md` 愿景层 + 合同层 v1.1 product 分层守护（详见 `NORTH-STAR.md` §0/§14）

---

## §0 为什么另开 v1.1（不写进 v1.0）

2026-08-30 用户裁定 B 路径：
- **v1.0 = 鱼鳞 runtime GA**（Python kernel，5 周，不重开 M0，不引入 dsh）→ 走 `docs/v1.0-ga-team-plan.md`
- **v1.1 = 鱼之产品 PRD**（手机派工、6 host、语音、dsh wrapper）→ 走本文

**为什么不能合一份**：v1.0 runtime 的目标是"Python kernel 包化 + CI + 容器部署"，与 v1.1 product 的目标"手机语音 + 6 host + dsh wrapper"是**两条独立产品路径**——前者讲 kernel 完整性，后者讲产品体验。前者的代码在 Python，后者的代码未来可能是 TypeScript。**合成经验教训**：v1.0 总纲把两者缝合导致事实错乱、章节引用错位、未验证假设被焊成守门（详见 `docs/ARCHITECT-REVIEW-fish-harness-prd-v1.0.md`）。

---

## §1 产品目标（鱼之原点，不可妥协）

### 1.1 一句话

> **一个从手机发指令、AI 团队在远程服务器 7×24 干活的个人 AI 编排系统。**

### 1.2 MVP 定义（从 PRD-v0.1 §11）

> **MVP**：能用手机派 1 个任务，24 小时内自动跑完，结果回到手机。
>
> **v1.1 M1 实施细节**（2026-08-30 裁定 3）：手机浏览器可提交任务 + 查看状态/结果，**文字表单即可**；STT 与 Web Push 走 M2。

### 1.3 必须保留的产品约束（与 PRD-v0.1 一致 + 合同层归属）

| # | 约束 | 来源 | v1.1 M1 实施 |
|---|------|------|-------------|
| **G-1** | 项目定位 = "个人 AI 编排系统"，不是 kernel spec 形式验证 | NORTH-STAR §1 愿景层 | 全程适用 |
| **G-2** | 调度层 = `orchestrator + ≥3 commander`（v1.1 MVP 可减少到 1，GA 必须 ≥3）| NORTH-STAR §1 愿景层 | M1 = 1 orch + 1 commander |
| **G-3** | 执行层 = 6 host（MacBook + newvps-w1/2 + puerHK-w1 + aliyun-w1 + HK103-w1 + GPU 按需）| NORTH-STAR §1 愿景层 | M1 = 1 worker（newvps-w1）；M2 = 6 host 部署 |
| **G-4** | 控制层 = iPhone Safari PWA + **语音为主**（**v1.1 M2/GA 守门**）| NORTH-STAR §1 合同层 | M1 文字表单即可；M2 加 STT |
| **G-5** | 技术栈基于 `dsh`（DeepSeek Harness），覆盖 80%，wrapper 补 20%（**待 M0b spike 验证**；v1.0 runtime **不适用**）| NORTH-STAR §1 合同层 | M0b spike 后降为约束 |
| **G-6** | 二次开发量 ≈ 2500-3000 行 TypeScript（**待 M0b spike 验证后再锁**；v1.0 runtime **不适用**）| NORTH-STAR §1 合同层 | M0b spike 后锁 |

### 1.4 设计哲学（5 条不可妥协）

| # | 原则 | v1.1 适用 | v1.0 runtime |
|---|------|----------|---------------|
| **P-1** | 调度 ≠ 执行 | ✅ commander/worker 之间禁止插入 Driver 层 | kernel 已有 TrivialDriver 为 worker 进程内 SPI |
| **P-2** | 位置无关 | ✅ 调度层与执行层跨 host | kernel 单机 WAL 不跨 host |
| **P-3** | 在线优先 + 离线降级 | ✅ MacBook 主力 | kernel 不跑 worker |
| **P-4** | Locality 优先 | ✅ 路由评分含 Locality 项 | kernel capability-match |
| **P-5** | 永远在容器/daemon 上 | ✅ 调度层容器化 + agent daemon | ✅ systemd 管 Compose |

### 1.5 三层模型等价类约束（**v1.1 product 适用**；v1.0 runtime 不适用）

| 层 | 等价类（能力）| 禁止 |
|----|---------------|------|
| **Orchestrator** | 高推理 / 跨项目决策 | 用 worker 档便宜模型当 orch |
| **Commander** | 中上下文 / 单工作流编排 | 与 orch 同模型且无分层理由 |
| **Worker** | 低成本批量执行 | 无 |

具体 SKU 只存在 `spec/capabilities/`（M0b 产出），改名不触发 NORTH-STAR 回滚。

---

## §2 与 v1.0 runtime 的边界（双轨分工）

| 维度 | v1.0 runtime（`v1.0-ga-team-plan.md`）| v1.1 product（本文）|
|------|---------------------------------|---------------------|
| **路径** | Python kernel lift | dsh + TypeScript wrapper |
| **代码语言** | Python（已有 spike + schema）| TypeScript（**未开工**）|
| **模型** | 不依赖模型（kernel 不做模型决策）| §1.5 等价类约束，具体 SKU 待 M0b |
| **底座** | `harness/` Python 包 + Dockerfile + deploy.yml | dsh CLI + `wrapper/` TypeScript（**待 spike**）|
| **目标** | kernel GA（包化、CI、容器、benchmark）| 产品 GA（手机派工 + 6 host + 语音）|
| **依赖关系** | **先 v1.0 runtime GA → 后 v1.1 product M0** | 不阻塞 v1.0 |
| **包边界** | `harness/{runtime,gateway,drivers,testing,benchmark}/` | `wrapper/{orchestrator,commander,agents,mobile-ui}/` |
| **共享** | v1.1 product **可调用** v1.0 runtime 的 Python kernel via 稳定 HTTP/FFI | **不 fork schema**；用 v1.0 schema + Python HTTP API |

**禁止**：
- v1.0 runtime 阶段不写 TypeScript、不引入 dsh、不改模型决策代码
- v1.1 product 阶段不重写 v1.0 kernel、不引入新的 SQLite schema（用 v1.0 schema + Python HTTP API）、**不 fork Python Protocol 当 TS 接口契约**

---

## §3 未验证假设（必须先 spike 才能锁）

PRD-v0.1 / VISION v1.0 写了多条**未验证**的事实，本节把它们**显式标记为待验证**，禁止在 spike 通过前写为实施条款。

| # | 假设 | 验证手段 | 触发：v1.1 M0b-dsh-spike |
|---|------|---------|--------------------|
| **H-1** | dsh 覆盖鱼之需求 80% | dsh spike 在 3 个 A 类任务上跑（**裁定 6 收窄**：调研 / 改代码 / 摘要）| 必跑 |
| **H-2** | 三层等价类各跑同一 A 任务能力差异成立（**裁定 5**：等价类约束，不锁具体型号）| 三档模型各跑同一任务，记录 token/质量/延迟差异 | 必跑 |
| **H-3** | TypeScript wrapper 缺失点 → LOC 估计 | dsh spike 完成后，按缺失功能点估算 TypeScript wrapper LOC（**不预设 300-400**）| 必跑 |
| **H-4** | Web Speech API iOS Safari 准确率 ≥85%（中文 + 英文）| 5 人 × 50 句实测 | **v1.1 M2 必跑**（**裁定 3 推迟**）|
| **H-5** | Web Push API iOS 16.4+ 推送可用 | 真机实测 + VAPID 流程跑通 | **v1.1 M2 必跑**（**裁定 3 推迟**）|
| **H-6**（**裁定 6 取消**）| ~~6 host 跨网 fence/lease 一致性~~ | ~~NFS 共享 SqliteWorkerPool~~ | **❌ 取消**（v1.0 ADR 0009 方向冲突；走每 host 本地 SQLite + 调度层 lease 或等 runtime 明确支持）|
| **H-7**（**裁定 6 推迟到 v1.2**）| ~~GPU VPS 视频渲染成本~~ | ~~AutoDL/矩池云实测~~ | **❌ 推迟**（v1.1 仅工作流 A，无 GPU 需求）|

**H-1 / H-2 / H-3 未通过前**：
- ❌ 禁止在本文中写"TypeScript 总量 2500-3000 行"为事实
- ❌ 禁止把具体模型名（`Fable 5` / `GLM 5.3` / `MiniMax-M3`）写为守门（A-4 改等价类）
- ❌ 禁止把 dsh 覆盖率 80% 写为产品约束

**H-1 失败（dsh ≪ 80%）处理**（裁定 6）：启动「鱼之重新定义」专项讨论（NORTH-STAR §10 冲突 5），**禁止**假装 80% 继续写 TS 总量。

---

## §4 六项产品裁定（2026-08-30 即日起生效）

详见 `docs/DOCS-REVIEW-v1.1-adjudication.md` §3。本节为 v1.1 product 实施依据。

### 4.1 安全方案 → **(a) Tailscale-only**（v1.1 M1 唯一方案）

| 选项 | 裁定 |
|------|------|
| **(a) Tailscale-only** | **✅ 采用**。控制面不进公网；iPhone 走 Tailscale；HTTPS 用 Tailscale Serve / 内网证书 |
| (b) Cloudflare Tunnel | M2 候补（仅当 H-4/H-5 证明必须公网 PWA/Push）|
| (c) 自签 CA mTLS | **❌ 否**（iOS PWA 装企业 CA 成本高）|
| (d) Basic Auth + 加固 | **❌ 永久否**（v0.2 + v1.0 已关）|

理由：单用户、语音/任务指令敏感、已有 Tailscale 拓扑。Web Push 不在 M1，避开"公网 origin + VAPID"压力。

### 4.2 调度层部署 → **(a) newvps 共址**（M1）；超内存再升 (b)

| 选项 | 裁定 |
|------|------|
| **(a) newvps 共址** | **✅ M1 采用**。与 v1.0 kernel 同机：1 orch + 1 commander + kernel 容器 + 1 worker。**必须写内存上限**；超限先减 commander/worker，不先加机器 |
| (b) 独立 VPS | M0b 测 RAM 后可选（dsh 实测常驻 > newvps 余量再拆）|
| (c) MacBook 白天跑 | **❌ 禁止作主调度**（违反 P-3/P-5；MacBook 只当 worker）|

### 4.3 Web Push / STT 是否 v1.1 M1 必装 → **否**

- **M1 必装**：手机浏览器可提交任务 + 查看状态/结果（**文字表单即可**；PWA 安装可选）
- **STT（Web Speech / 云）**：**v1.1 M2**，且 H-4 真机通过后才能守门
- **Web Push**：**v1.1 M2**，且 H-5 + Tailscale/公网 origin 方案选定后才能守门
- **M1 "结果回到手机"** = 打开页面看见完成态，**不是**系统推送

NORTH-STAR M-2 / M-4 / U-2 / U-3 改为适用 **v1.1 M2/GA**。

### 4.4 三工作流顺序 → **(3) 仅 A**（v1.1 全程）

- v1.1 M1–GA：**只做工作流 A**（独立任务 / research.v1 量级）
- B、C **不进 v1.1**（留 v1.2+）。若以后做，顺序为 **A → B → C**，不做 A→C→B（C 有 GPU 与外部发布，成本与副作用最高）
- NORTH-STAR §4 改为"愿景保留；实施阶段按产品 PRD"

### 4.5 模型守门 → **(a) 等价类约束**

替换 A-4 型号锁定（详见 §1.5）：SKU 只存在 `spec/capabilities/`（M0b 产出），改名不触发 NORTH-STAR 回滚。

| 选项 | 裁定 |
|------|------|
| **(a) 等价类约束** | **✅ 采用** |
| (b) 删除 A-4 | ❌ 丢失分层 |
| (c) 保留型号锁定 | ❌ 厂商改名时误爆守护 |

### 4.6 v1.0 GA 后是否启动 M0b-dsh-spike → **有条件启动**

**启动前置（全部满足）**：
1. v1.0 runtime GA（`v1.0-ga-team-plan.md` §4 清单全绿）
2. 本文件裁定已写入 + NORTH-STAR 合同层补丁已合并
3. 用户再发一句 **Start v1.1 M0b**（不自动开工）

**M0b 范围收窄**（只验底座，不验完整产品）：

| 做 | 不做 |
|----|------|
| H-1 dsh：3 个 A 类任务（调研 / 改代码 / 摘要）| H-4 STT 五人语料（随 M2）|
| H-2 三层等价类各跑同一 A 任务 | H-5 Web Push 真机（随 M2）|
| H-3 wrapper 缺失点 → LOC 估计 | H-7 GPU 视频成本（v1.2）|
| | H-6 六机 NFS（**取消**）|

---

## §5 范围（非实施条款，仅记录可能工作）

| 阶段 | 工作 | 触发条件 | 退出标准 |
|------|------|---------|---------|
| **v1.1 M0b-dsh-spike** | §3 H-1/H-2/H-3 spike（**H-4/H-5/H-6/H-7 不在 M0b**）；产出 capability JSON | v1.0 runtime GA + 用户发 Start v1.1 M0b | spike exit 0 + capability JSON 落地 `spec/capabilities/` |
| **v1.1 M0c-product-foundation** | TypeScript wrapper skeleton + dsh 集成 | M0b 通过 | `wrapper/orchestrator` spawn 流程跑通 |
| **v1.1 M1-product-MVP** | 手机派工（**文字表单**）+ 1 worker + 1 工作流（**仅 A**）+ newvps 共址 + Tailscale-only | M0c 通过 | iPhone PWA 派工 → 24h 完成 → 打开页面看到完成态；**无 STT、无 Web Push** |
| **v1.1 M2-product-extension** | 6 host 部署 + 智能路由 + 优雅降级 + 语音（STT）+ Web Push + Locality | M1 通过 | NORTH-STAR §3/§6/§7/§8 v1.1 M2 条款全过 |
| **v1.1 M3-product-GA** | commander ≥3 + Evidence Graph + MemoryStore + CapabilityProfile + 第三方 Tool Package（v1.2 候选）| M2 通过 | 长期闭环可用 |

**v1.1 M1 范围 = 收紧版 MVP**（无 STT、无 Web Push、仅 A、1 worker、newvps 共址、Tailscale）。**v1.1 M1 退出标准**：

```bash
# 1. iPhone Safari 走 Tailscale 打开 harness.rana.asia PWA
# 2. 文字表单输入"调研 XXX"提交
# 3. newvps 同机 orch → commander → kernel → newvps-w1
# 4. 24h 内 A 类任务自动跑完（research.v1 量级）
# 5. 打开 PWA 看到完成态（无推送）
# 任一环节中断即 v1.1 M1 失败
```

**以上阶段退出标准全部为草稿**——M0b spike 完成后才能写为实施条款。

---

## §6 与 NORTH-STAR 的关系

本文受 `docs/PRD-V0.1-NORTH-STAR.md` 守护：

- **愿景层**（§1 G-1/G-2/G-3 + §2 P-1..P-5 + §3 A-1..A-3 + §5 M-3 + §6 H-*）→ 全程适用，**任何冲突以 NORTH-STAR 为准**
- **合同层**（G-5/G-6/W-1/A-4/M-2/M-4/U-2/U-3/§7 认证）→ 按 M 阶段分级守护（详见 §1.3 + §5）

**新增条款**（v1.1 product 特有，与 NORTH-STAR 不冲突）：
- 产品目标 = 手机派工（vs NORTH-STAR 守的"鱼之原点"）
- 范围 = 不引入 dsh 之外的 harness（vs NORTH-STAR §1 G-5 锁 dsh）
- 双轨边界 = 不反向依赖 v1.0 runtime 的代码（用稳定 HTTP/FFI，不 fork schema）
- v1.1 M1 范围 = 收紧版 MVP（详见 §5）

---

## §7 修订日志

| 日期 | 修订 | 原因 |
|------|------|------|
| 2026-08-30 | 初版（讨论稿，非实施合同）| 用户裁定 B 路径：v1.0 runtime = Python kernel GA；v1.1 product = 鱼之产品 PRD 另议 |
| 2026-08-30 | **合同层补丁** | 吸收 `docs/DOCS-REVIEW-v1.1-adjudication.md` §3 六项裁定：①安全 Tailscale-only ②调度 newvps 共址 ③Web Push/STT 推迟 M2 ④三工作流仅 A ⑤模型等价类 ⑥M0b 有条件启动。H-6 取消、H-7 推迟到 v1.2、M1 范围收紧。 |

---

## §8 复审门槛（下次 v1.1 product PASS）

- [ ] §4 六项均为已裁定（不在 §3 待验证假设）
- [ ] §5 M1 范围与 §4.3 + §4.4 一致（无 STT/Push，仅 A）
- [ ] §1.5 A-4 等价类约束（不锁具体型号）
- [ ] §2 双轨边界含"不 fork schema"
- [ ] 协议数 = 10（与仓库 `conformance-second-impl.py` 一致）
- [ ] NORTH-STAR §10 v1.1 grep 脚本全绿
- [ ] M0b 未启动 + 用户未发 Start 之前，**禁止**派发任何 v1.1 实现任务

**未达上述门槛前，本文不作为实施合同。**