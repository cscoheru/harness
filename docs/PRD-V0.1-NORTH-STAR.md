# PRD-v0.1 NORTH STAR — Fish Harness 守护文档

> **Status**: 🛡️ **GUARDIAN DOCUMENT** — 鱼之守护，不可漂移
> **Date**: 2026-08-30（合同层补丁）
> **Author**: 架构师（PRD-v0.1 → v0.9 漂移事故溯源后立；2026-08-30 按 B 路径 + 六项裁定重分合同层）
> **Source**: `PRD-v0.1.md`（2026-08-29，鱼之原点）
> **目的**: 防止 fish-harness 在多次 PRD 修订 + 上下文压缩中再次丢失 PRD-v0.1 的核心愿景

---

## §0 守护分层（2026-08-30 修订）

NORTH-STAR 拆为**愿景层（不可改）+ 合同层（按版本加范围）**两层，关闭 `docs/DOCS-REVIEW-v1.1-adjudication.md` §2.4 的 P0 冲突。

| 层 | 内容 | 修改权限 |
|----|------|----------|
| **愿景层（不可改）** | §1 项目定位（G-1..G-4 部分）/ §2 设计哲学 5 条 / §3 三层架构（A-1..A-3 不可合并与数量）/ §5 MVP 手机闭环定义 / §6 6 host 部署清单（H-1..H-4）/ §12 不可妥协清单 | 不可改；修订需用户书面裁定 |
| **合同层（按版本加范围）** | G-5 / G-6 / W-1 / A-4 / M-2 / M-4 / U-2 / U-3 / §7 认证 / 协议数 / §10 grep 守门 | 按下游 PRD 版本加范围；v1.0 runtime 不适用本文大部分合同层条款 |

### 合同层归属矩阵（2026-08-30）

| 条款 | v1.0 runtime（`v1.0-ga-team-plan.md`）| v1.1 product（`PRD-v1.1-product.md`）|
|------|------------------------------|------------------------------|
| **G-5** dsh 80% | ❌ 不适用（kernel 不依赖 dsh）| ✅ 待 M0b 验证后降为约束 |
| **G-6** TypeScript ≥2000 行 | ❌ 不适用（语言 = Python）| ✅ 待 M0b 验证后锁 |
| **W-1** TypeScript 语言 | ❌ 不适用 | ✅ 适用 |
| **A-4** 模型三层不同 | ❌ 不适用（kernel 无模型）| ✅ 等价类约束 |
| **M-2** 语音 | ❌ 不适用 | ✅ v1.1 M2/GA |
| **M-4** 推送回手机 | ❌ 不适用 | ✅ v1.1 M2/GA；M1 = 页面看 |
| **U-2** STT Web Speech | ❌ 不适用 | ✅ v1.1 M2/GA |
| **U-3** Web Push | ❌ 不适用 | ✅ v1.1 M2/GA |
| **§7 认证** Basic Auth | ❌ 不适用（**永久否**，v0.2 + v1.0 已关）| ✅ 按 v1.1 §4.1 裁定（已裁定 Tailscale-only）|
| **协议数** | 10 Protocol（仓库事实）| 同 |
| **§10 grep 守门** | v1.0 走自身 §4 验证清单 | v1.1 走 §15 grep（按合同层分文件）|

---

## §1 鱼之原点（PRD-v0.1 §0 TL;DR，不可修改）

> **原文（PRD-v0.1.md:11-19）**：
>
> **一个从手机发指令、AI 团队在远程服务器 7×24 干活的个人 AI 编排系统。**
>
> - **调度层**：newvps（清理后）跑 `orchestrator + 3 commander`，用 Fable 5 / GLM 5.3
> - **执行层**：6 个 host 组成 worker pool，MacBook 主力 + 5 个 24/7 VPS
> - **控制层**：iPhone Safari PWA，**语音为主** + 文字为辅
> - **基础框架**：DeepSeek Harness（dsh），覆盖 80% 需求；剩余 20% 用轻量 wrapper 补足
> - **二次开发量**：~2500-3000 行 TypeScript（业务抽象 + 持久化 + Mobile UI 改造）

### 守门条款（任一违反 → PRD 必须回滚）

| # | 条款 | 合同层归属 | 验证命令 |
|---|------|-----------|----------|
| **G-1** | 项目定位 = "个人 AI 编排系统"，不是 "SQLite kernel spec 形式验证" | 愿景层 | grep "个人 AI 编排" PRD-*.md |
| **G-2** | 调度层包含 `orchestrator + 3 commander`（MVP 可减配到 1，GA ≥3）| 愿景层 | grep "orchestrator.*commander" PRD-*.md |
| **G-3** | 执行层 = 6 个 host（MacBook + newvps-w1/2 + puerHK-w1 + aliyun-w1 + HK103-w1 + GPU VPS 按需）| 愿景层 | 部署清单必须含 ≥5 host |
| **G-4** | 控制层 = iPhone Safari PWA + **语音为主**（**v1.1 M2/GA 守门**；M1 文字表单即可）| 合同层 | grep "语音\|PWA\|Safari" PRD-v1.1-*.md |
| **G-5** | 技术栈基于 `dsh`（DeepSeek Harness），覆盖 80%，wrapper 补 20%（**待 M0b spike 验证**；v1.0 runtime **不适用**）| 合同层 | v1.1 M0b spike 后 capability JSON |
| **G-6** | 二次开发量 ≈ 2500-3000 行 TypeScript（**待 dsh spike 验证后再锁**；v1.0 runtime **不适用**）| 合同层 | v1.1 M0b spike 后 LOC 估算 |

---

## §2 设计哲学（PRD-v0.1 §1.2，5 条不可妥协，**不可替换**）

> **原文**：5 条设计哲学（调度≠执行 / 位置无关 / 在线优先 + 离线降级 / Locality 优先 / 永远在容器 daemon）

| # | 原则 | 含义（PRD-v0.1 原文）| v0.6 偏移 | 纠正要求 |
|---|------|--------------------|----------|----------|
| P-1 | **调度 ≠ 执行** | orchestrator 决策但不执行，worker 执行但不决策 | v0.6 引入"Driver"概念，**与 worker 重叠** | commander/worker 之间禁止插入"Driver"层（**v1.1 product 适用**；v1.0 runtime = 已有 TrivialDriver 为 worker 进程内 SPI，不算第四调度层）|
| P-2 | **位置无关** | orchestrator 看不见 worker 在哪台机器，只看见能力 | v0.4 引入"进程内模块 Worker Adapter" | 调度层与执行层必须跨 host |
| P-3 | **在线优先 + 离线降级** | MacBook 在工作时段优先，离线时自动转 VPS | v0.4 改"Worker = 进程内模块"，**消除 MacBook 角色** | 必须保留 MacBook 主力 worker（**v1.1 product 适用**；v1.0 runtime 不跑 worker）|
| P-4 | **Locality 优先** | 代码在哪里，worker 就在哪里（puerHK 跑 puer-hub）| v0.6/0.7 完全删除 Locality 概念 | 路由评分必须含 Locality 项（**v1.1 product 适用**；v1.0 runtime = 单机 WAL 不跨 host）|
| P-5 | **永远在容器/daemon 上** | 调度层容器化，agent 必 daemon（不靠 SSH 交互）| v0.6 systemd 管 Compose（半保留）| 调度层必须容器化 + agent 必须 daemon |

**v0.6 偏移诊断**：v0.6 §1.2 的 5 条不可妥协（Harness 是事实来源 / Kernel 不懂业务 / Driver 不懂权限 / 单向权限 / 可替换执行器）是**全新一套**，**与 PRD-v0.1 的 5 条无交集**。这是"全局方向被局部修订替换"的典型事故。

---

## §3 三层架构（PRD-v0.1 §2 + §4，**不可变结构**）

```
                    🧠 调度层
              newvps（清理后 + 4G swap）
            orchestrator + commander × 3
                       │
                       ↓ JSON-RPC / WebSocket
        ┌──────────────┴──────────────┐
        ↓                             ↓
   ⚙️ Worker Pool（6+ host）
```

| 层 | 组件 | 模型（**等价类**，v1.1 product 适用）| 职责 |
|----|------|------------------------------|------|
| **调度层** | orchestrator | 高推理 / 跨项目决策 | 跨项目决策、调度、状态管理 |
| **调度层** | commander × 3 | 中上下文 / 单工作流编排 | 单项目全权负责、上下文管理 |
| **执行层** | worker pool（6 host）| 低成本批量执行 | 跑实际任务 |

### 守门条款

| # | 条款 | 合同层归属 |
|---|------|-----------|
| **A-1** | **三层结构不可合并**：orchestrator / commander / worker 必须独立存在 | 愿景层 |
| **A-2** | **orchestrator 数量 = 1**，commander 数量 = 3（v1.1 MVP 可减配到 1，GA ≥3；v1.0 runtime 不跑调度层）| 愿景层 |
| **A-3** | **worker 数量 ≥ 6 host**（含 MacBook + 5 VPS；v1.1 MVP 豁免到 1 worker；v1.0 runtime 不跑 worker）| 愿景层 |
| **A-4** | **三层模型等价类约束**（**v1.1 product 适用**）：orch 高推理、commander 中上下文、worker 低成本批量；具体 SKU 由 `spec/capabilities/`（M0b 产出）约束；型号改名不触发 NORTH-STAR 回滚 | 合同层 |
| **A-4'** | **v1.0 runtime 不适用** A-4：kernel 不做模型决策 | 合同层豁免 |

---

## §4 三大工作流（PRD-v0.1 §5，**愿景保留；实施阶段按产品 PRD**）

| 工作流 | 触发 | 典型任务 | 默认 worker |
|--------|------|----------|-------------|
| **A: 独立任务** | 手动 cc/codex 或手机派工 | 改课件、做调研、写代码 | macbook-main（白天）/ newvps-w1（夜间） |
| **B: 动态信息检索** | commander-2 定时任务（launchd/cron）+ 手机派工 | 抓 YouTube 频道、国内外经济信息 | 拉取 aliyun-w1 → ASR newvps-w1 → 分析 newvps-w2 |
| **C: 视频工作流** | commander-3 编排，手机派工或定时 | 选题 → 写脚本 → 图文转视频 → 整合发布 | 脚本 macbook-main / newvps-w2；视频渲染 临时 GPU VPS（按小时）|

**v1.1 product 实施裁定（2026-08-30）**：v1.1 全程**仅做工作流 A**；B、C 留 v1.2+。NORTH-STAR §4 改为"愿景保留；实施阶段按产品 PRD"，不写为 M1 必装守门。

**v0.9 偏移**：完全删除"三大工作流"概念，v0.7 Stage 1 收敛为"web-only research"。**这是核心场景从语音+多机+多工作流漂移到 web+单功能的起点**。

---

## §5 MVP 第一刀（PRD-v0.1 §11，**手机闭环定义不可改；具体技术细节走 v1.1 §5**）

> **原文（PRD-v0.1.md:601-619）**：
>
> **MVP 定义**：能用手机派 1 个任务，24 小时内自动跑完，结果推送回手机。
>
> **MVP 范围**：
> - ✅ newvps 调度层（orchestrator + 1 commander + dsh web）
> - ✅ 1 个 worker（newvps-w1）
> - ✅ Mobile UI（语音派工）
> - ✅ 1 个工作流：独立任务

### MVP 任务示例（PRD-v0.1 §11.3）

```
用户：手机说"调研李厚辰最近 5 期视频"
harness：
  1. 语音 → STT → 派工
  2. orchestrator → commander-1 → newvps-w1
  3. cc 子进程拉 YouTube + ASR + 摘要
  4. 结果写 dsh session
  5. dsh web 推送通知 → iPhone
用户：看到结果，下载到 NAS
```

### 守门条款（**v1.1 product 适用；v1.0 runtime 不适用**）

| # | 条款 | 合同层归属 | v1.1 M1 实施细节 |
|---|------|-----------|----------------|
| **M-1** | **必须能从手机端发起任务** | 愿景层 | v1.1 M1 文字表单即可；M2 加语音；PWA 可选 |
| **M-2** | **必须能用语音**（**v1.1 M2/GA 守门**）| 合同层 | v1.1 M1 文字表单即可；M2 加 STT |
| **M-3** | **必须 24h 内自动跑完**（无需人介入）| 愿景层 | 全程适用 |
| **M-4** | **结果必须回到手机**（推送非必需；**v1.1 M2/GA**）| 合同层 | v1.1 M1 = 打开页面看到完成态；M2 加 Web Push |
| **M-5** | **MVP 范围必须含 orchestrator + commander + worker 三层** | 愿景层 | v1.1 M1 可减配到 1+1+1 |

### MVP 验证命令（架构师最终 sign-off 时跑）

```bash
# 1. 从手机 PWA 派工（v1.1 M1 = 文字；M2 = 语音输入"测试任务"）
# 2. harness.rana.asia 接收文字 / 语音 → 派工
# 3. orchestrator → commander → newvps-w1
# 4. 24h 内 worker 自动跑完
# 5. v1.1 M1 = 打开页面看到完成态；M2 = Web Push 推到 iPhone
# 任一环节中断即 MVP 失败
```

---

## §6 6 host 部署清单（PRD-v0.1 §2.3，**必须保留**）

| ID | Host | 资源 | 角色 | 能力 | 24/7 |
|----|------|------|------|------|------|
| `macbook-main` | MacBook Pro M1 16G | 12G | **主力** | claude-code, codex, cursor, xcode, gui-debug | ❌ |
| `newvps-w1` | newvps 4C/7.8G | 4G | 通用 worker | claude-code, codex, ffmpeg | ✅ |
| `newvps-w2` | newvps | 同上 | 通用 worker | claude-code, codex | ✅ |
| `puerHK-w1` | puerHK 4C/7.8G | 1.5G | **puer-hub 专用** | claude-code, prisma, postgres | ✅ |
| `aliyun-w1` | aliyun 2C/3.4G+4G | 1.5G | 公网 worker | claude-code, codex | ✅ |
| `hk103-w1` | HK103 2C/3.8G+2G | 2G | frp 网络 worker | claude-code | ✅ |
| `gpu-w-temp` | AutoDL/矩池云 | 8-16G + GPU | 视频/重型 | ffmpeg-gpu, cuda | 按小时 |

### 守门条款

| # | 条款 | 合同层归属 |
|---|------|-----------|
| **H-1** | **MacBook 必为 worker**（主力，工作时段优先）| 愿景层（v1.1 product 适用）|
| **H-2** | **puerHK-w1 必为 puer-hub 专用**（Locality）| 愿景层（v1.1 product 适用）|
| **H-3** | **GPU VPS 必为按需**（视频工作流渲染）| 愿景层（v1.1 product 适用；v1.1 仅 A 工作流则无需 GPU）|
| **H-4** | **至少 5 个 24/7 VPS**（MacBook 不计入 24/7）| 愿景层（v1.1 product GA 适用）|

---

## §7 Mobile UI 关键决策（**v1.1 product 适用；v1.0 runtime 不适用**）

| 项 | 决策 |
|----|------|
| **域名** | `harness.rana.asia`（复用现有 wildcard SSL）|
| **形态** | PWA（添加到主屏幕，全屏运行）|
| **输入** | **v1.1 M1 文字表单** + **v1.1 M2 起加语音**（Web Speech API）|
| **STT 方案** | iOS Safari Web Speech API（v1.1 M2/GA；待 H-4 实测；**v1.1 M1 不锁**）|
| **降级方案** | 云 STT（Whisper API / 阿里云）|
| **实时性** | WebSocket 流式回传 |
| **通知** | **v1.1 M2/GA** 起 Web Push API（iOS 16.4+ 支持）；**v1.1 M1 = 打开页面看完成态** |
| **认证** | **Tailscale-only**（2026-08-30 裁定，§13 详）|

### 守门条款（**v1.1 product 适用；v1.0 runtime 不适用**）

| # | 条款 | 合同层归属 |
|---|------|-----------|
| **U-1** | 域名 `harness.rana.asia`（不可替换）| 愿景层 |
| **U-2** | STT 主方案 = iOS Web Speech API（v1.1 M2/GA；**v1.1 M1 不锁**）| 合同层 |
| **U-3** | Web Push API（**v1.1 M2/GA**；v1.1 M1 = 打开页面看）| 合同层 |
| **认证** | **Tailscale-only**（v1.1 M1 唯一方案；Basic Auth **永久否**）| 合同层 |

---

## §8 二次开发范围（PRD-v0.1 §9，**v1.1 product TypeScript；v1.0 runtime Python**）

| 模块 | 代码量 | 优先级 | v1.0 runtime | v1.1 product |
|------|--------|--------|-------------|--------------|
| 三层架构抽象（orch/commander/worker）| 800-1000 | P0 | ❌ | ✅ TypeScript |
| 持久化层（SQLite 任务历史，**走 v1.0 runtime kernel**）| 300 | P0 | ✅ Python（已 spike）| ✅ 调 HTTP API |
| 业务工作流模板（A 类）| 400 | P1 | ❌ | ✅ TypeScript |
| Mobile UI 改造（PWA + 表单）| 400-500 | P1 | ❌ | ✅ TypeScript（**v1.1 M1 = 文字表单**）|
| 智能路由评分（Locality + 能力匹配）| 200-300 | P1 | ✅ 走 v1.0 kernel capability-match | ✅ TypeScript 路由层 |
| 优雅降级（task reassignment）| 200-300 | P1 | ❌ | ✅ TypeScript |
| **总计** | **~2500-3000** | — | Python（v0.9 spike + 5 周 GA）| TypeScript（**待 M0b 验证后锁**）|

### 守门条款

| # | 条款 | 合同层归属 |
|---|------|-----------|
| **W-1**（v1.1 product 适用）| **语言 = TypeScript**；v1.0 spike Python 仅作持久化层验证 | 合同层 |
| **W-1'**（v1.0 runtime 适用）| **语言 = Python**；TypeScript 在 v1.0 阶段**不适用** | 合同层 |
| **W-2** | **不修改 dsh 源码**（v1.1 product 适用；只在 wrapper 层包装）| 愿景层（v1.1）|
| **W-3** | **dsh 升级时 wrapper 不重写** | 愿景层（v1.1）|
| **W-4** | **目录结构** = `/opt/harness/{wrapper,workspace,data,logs}` | 愿景层（v1.1）|

---

## §9 PRD-v0.9 spike 套件的重新定位（事故资产再利用）

PRD-v0.9 完成的 13 spike + spec/kernel-schema.sql（27 trigger / 12 event JSON / **10** Protocol）**不是鱼**，**不是鱼钩**，是**鱼鳞**——v1.0 runtime 的核心资产 + v1.1 product 的持久化层基础。

| PRD-v0.9 资产 | v1.0 runtime 落点 | v1.1 product 落点 | 限制 |
|---------------|------------------|-------------------|------|
| `spec/kernel-schema.sql` | `harness/runtime/_db.py`（**v1.0 GA 主线**）| `wrapper/persistence/`（TypeScript wrapper 调 v1.0 HTTP API）| 不可外暴露为 spec |
| 13 spike + 28/28 反例 | `harness/runtime/` + `harness/testing/`（**v1.0 GA 验收基座**）| 集成测试套件正确性验证 | spike 不得脱离持久化层独立演进 |
| `spec/interfaces/*.py`（**10** Protocol）| `harness/runtime/*` 实现 type contract | **仅作 TypeScript 接口的参考**（**v1.1 product 不直接 import Python Protocol**）| Python Protocol 是参考，TS 接口是鱼 |
| `spec/events/*.json`（12 JSON schema）| `harness/runtime/event_sink.py` 事件契约 | TypeScript event 契约的 schema 参考 | 同上 |
| ADR 0001-0007 | v1.0 runtime ADR 集合 | fish-harness 内部架构决策 | ADR 不可替代 PRD |

**禁止**：
- 把 PRD-v0.9 spike 当作 fish-harness 的"鱼"完成标志
- 把 spec/Protocol 当作 fish-harness 的"接口契约"（鱼钩 ≠ 鱼）
- 把 spike PASS 等同于 MVP §5 通过
- v1.1 product 把 Python Protocol 当作实施契约（必须转 TS 接口）

---

## §10 守护机制（每次修订前必跑，按合同层分文件）

### 修订前检查清单（**v1.1 product 适用**）

```bash
# 0. 准备
PRD_NEW=PRD-v1.1-product.md  # 当前修订对象
NORTH_STAR=docs/PRD-V0.1-NORTH-STAR.md
GA_PLAN=docs/v1.0-ga-team-plan.md

# === 愿景层（不可改；任何缺失即 NORTH-STAR 失效）===
echo "=== G-1 项目定位 ==="
grep -E "个人 AI 编排|AI 编排系统" $PRD_NEW || echo "❌ G-1 缺失：项目定位丢失"
echo "=== G-2 orch+comm ==="
grep -E "orchestrator.*commander|orch \+ .*comm" $PRD_NEW || echo "❌ G-2 缺失：调度层组件缺失"
echo "=== G-3 6 host ==="
grep -cE "macbook|puerHK|aliyun|HK103|newvps|gpu" $PRD_NEW | xargs -I{} test {} -ge 5 && echo "✅ G-3 ≥5 host" || echo "❌ G-3 <5 host"
echo "=== M-3 24h ==="
grep -E "24 小时|24h|无人介入" $PRD_NEW || echo "❌ M-3 缺失"
echo "=== A-1 三层 ==="
grep -E "orchestrator.*commander.*worker|调度.*执行" $PRD_NEW || echo "❌ A-1 三层被合并"

# === 合同层（v1.1 product 适用，按 M 阶段分级守门）===
echo "=== G-4 语音（M2/GA） ==="
grep -E "语音|M2|Web Speech" $PRD_NEW && echo "✅ G-4 含语音描述" || echo "🟡 G-4 M1 文字可豁免"
echo "=== M-2 语音（M2/GA） ==="
grep -E "M2.*语音|M2/GA.*语音" $PRD_NEW || echo "🟡 M-2 M1 豁免"
echo "=== M-4 推送回手机（M2/GA） ==="
grep -E "M2.*Push|M2/GA.*推送" $PRD_NEW || echo "🟡 M-4 M1 豁免"
echo "=== U-3 Web Push（M2/GA） ==="
grep -E "Web Push.*M2" $PRD_NEW || echo "🟡 U-3 M1 豁免"
echo "=== A-4 等价类（v1.1 product 适用） ==="
grep -E "等价类|能力层级" $PRD_NEW || echo "❌ A-4 仍焊型号：必须改等价类"
echo "=== W-1 TypeScript（v1.1 product 适用） ==="
grep -E "TypeScript" $PRD_NEW || echo "❌ W-1 缺失"

# === 协议数（仓库事实）===
echo "=== 协议数 = 10 ==="
grep -E "10 Protocol|10 个 Protocol" $PRD_NEW || echo "❌ 协议数不是 10"

# === 不可互相矛盾（条款冲突矩阵）===
echo "=== 内部条款冲突检查 ==="
grep -qE "TypeScript" $PRD_NEW && grep -qE "Python" $PRD_NEW && echo "⚠️ TS + Python 双标，需注明分轨" || echo "✅ 无双标"
```

### 修订前检查清单（**v1.0 runtime 适用**）

v1.0 runtime 走 `docs/v1.0-ga-team-plan.md` §4 验证清单（12 步）+ GA plan 自身 §6 里程碑 Gate。**不走本文 §10 脚本**（v1.0 不受 G-5/G-6/W-1/A-4/M-2/M-4/U-2/U-3 守护）。

### 修订冲突裁决

- **冲突 1**：新 PRD 与本文愿景层冲突 → **本文愿景层胜出**，新 PRD 必须反向修订
- **冲突 2**：新 PRD 与本文合同层冲突 → 走各下游 PRD 自身修订流程（如 v1.1 §4.1 安全方案）
- **冲突 3**：本文愿景层与 PRD-v0.1 原文冲突 → **PRD-v0.1 原文胜出**，本文立即更新
- **冲突 4**：本文合同层与下游 PRD 自身裁定冲突 → **下游 PRD 自身裁定胜出**（合同层可按版本加范围）
- **冲突 5**：本文与外部约束冲突（如 dsh 停止维护）→ 需架构师发起"鱼之重新定义"专项讨论，不可静默修改

---

## §11 修订日志

| 日期 | 修订 | 原因 |
|------|------|------|
| 2026-08-30 | 初版 | PRD-v0.1 → v0.9 漂移事故溯源后建立 |
| 2026-08-30 | **合同层补丁** | 用户裁定 B 路径 + 六项产品裁定（详见 `docs/DOCS-REVIEW-v1.1-adjudication.md`）：愿景层 / 合同层拆分；G-5/G-6/W-1/A-4/M-2/M-4/U-2/U-3 标 v1.0 runtime 不适用；A-4 改等价类；M-2/M-4/U-2/U-3 标 M2/GA；§7 认证改 Tailscale-only（删 Basic Auth）；协议数 8→10；§10 grep 守门按合同层分文件 |

---

## §12 不可妥协清单（一句话总结）

> **fish-harness 是什么**：一个从手机发指令、AI 团队在远程服务器 7×24 干活的个人 AI 编排系统。
>
> **怎么算完成**：能用手机派 1 个任务，24 小时内自动跑完，结果回到手机。
>
> **怎么算偏离**：spike 形式验证 PASS 不算完成；spec/27 trigger 完整不算完成；鱼鳞漂亮不算完成；鱼钩精致不算完成。
>
> **分轨现实（2026-08-30 修订）**：v1.0 runtime = Python kernel GA（5 周，单机 WAL）；v1.1 product = TypeScript + dsh（待 M0b 验证后开工）。**两条路径独立推进，禁止互相冒充守门。**

**只有鱼活了，fish-harness 才算完成。**

---

## §13 v1.0 runtime 豁免清单（参考）

v1.0 runtime（`v1.0-ga-team-plan.md`）**不受本文以下合同层条款守护**：

| 豁免条款 | 豁免理由 |
|----------|----------|
| **G-5** dsh 80% | kernel 不依赖 dsh |
| **G-6** TypeScript ≥2000 行 | 语言 = Python |
| **W-1** TypeScript | 语言 = Python |
| **A-4** 模型三层不同 | kernel 不做模型决策 |
| **M-2** 语音 | kernel 无 UI |
| **M-4** 推送回手机 | kernel 无 UI |
| **U-2** STT Web Speech | kernel 无 UI |
| **U-3** Web Push | kernel 无 UI |
| **§7 认证** Basic Auth | **永久否**（v0.2 + v1.0 已关），v1.0 runtime 也不写 |
| **§6 H-* worker ≥6** | kernel 不跑 worker |
| **§10 grep 守门** | v1.0 走自身 §4 验证清单 |

v1.0 runtime 走 `docs/v1.0-ga-team-plan.md` 自身守门（§4 12 步验证 + §6 里程碑 Gate）。

---

## §14 v1.1 product 范围与合同层守护（参考）

v1.1 product（`PRD-v1.1-product.md`）受本文以下合同层条款守护（M 阶段分级）：

| 条款 | v1.1 M1 守门 | v1.1 M2/GA 守门 |
|------|-------------|----------------|
| **G-4** 语音为主 | ❌ 文字表单即可 | ✅ 必须含语音 |
| **G-5** dsh 80% | 待 M0b spike 验证后 | 同 |
| **G-6** TypeScript ≥2000 行 | 待 M0b spike 后锁 | 同 |
| **M-2** 语音 | ❌ | ✅ |
| **M-4** 推送回手机 | ❌（页面看）| ✅（Web Push）|
| **U-2** STT Web Speech | ❌ | ✅（待 H-4 实测）|
| **U-3** Web Push | ❌ | ✅ |
| **A-4** 等价类 | ✅ 走 `spec/capabilities/` | 同 |
| **W-1** TypeScript | ✅ | 同 |
| **§7 认证** Tailscale-only | ✅（M1 唯一方案）| 同 |

**v1.1 product 修订前必跑** §10 v1.1 脚本。任何与本文愿景层冲突 → 立即反向修订。

---

## §15 grep 守门脚本（v1.1 product 适用，按合同层分文件）

> 与 §10 合并维护；§10 是完整版，本节是 §10 的速查版。

```bash
PRD=docs/PRD-v1.1-product.md

# 愿景层（不可改；缺一即 NORTH-STAR 失效）
for kw in "个人 AI 编排" "orchestrator" "commander" "24 小时" "三层"; do
    grep -q "$kw" $PRD || echo "❌ 愿景层缺失: $kw"
done

# 合同层 v1.1 M1（豁免语音/推送；A-4 等价类；TypeScript；Tailscale）
for kw in "等价类" "TypeScript" "Tailscale" "M1.*文字\|M1.*表单"; do
    grep -qE "$kw" $PRD || echo "❌ 合同层 M1 缺失: $kw"
done

# 合同层 v1.1 M2/GA（语音/推送/STT 必须标 M2）
for kw in "M2.*语音\|M2/GA.*语音" "M2.*Push\|M2/GA.*推送"; do
    grep -qE "$kw" $PRD || echo "🟡 合同层 M2/GA 缺失: $kw（M1 可豁免）"
done

# 协议数（仓库事实）
grep -qE "10 Protocol\|10 个 Protocol" $PRD || echo "❌ 协议数不是 10"
```

复审 PASS 门槛：`❌` 数为 0；`🟡` M2/GA 项在 M1 阶段允许。