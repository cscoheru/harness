# Fish Harness PRD v0.1

> **版本**：v0.1（架构对齐完成）
> **日期**：2026-08-29
> **维护者**：cscoheru / Claude Code
> **状态**：架构设计冻结，待 MVP 实施
> **位置**：`/Users/kjonekong/projects/fish-harness/`

---

## 0. TL;DR（一分钟版）

**一个从手机发指令、AI 团队在远程服务器 7×24 干活的个人 AI 编排系统。**

- **调度层**：newvps（清理后）跑 `orchestrator + 3 commander`，用 Fable 5 / GLM 5.3
- **执行层**：6 个 host 组成 worker pool，MacBook 主力 + 5 个 24/7 VPS
- **控制层**：iPhone Safari PWA，**语音为主** + 文字为辅
- **基础框架**：DeepSeek Harness（dsh），覆盖 80% 需求；剩余 20% 用轻量 wrapper 补足
- **二次开发量**：~2500-3000 行 TypeScript（业务抽象 + 持久化 + Mobile UI 改造）

---

## 1. 愿景与设计哲学

### 1.1 核心价值

```
你（人）→ 手机发指令 → harness（AI 团队）→ 产出（代码/调研/视频）
                              ↑
                     24/7 跑在远程 VPS
                     调度/执行分层
                     优雅降级
```

**关键特性**：
- **永远在线**：核心能力跑在 VPS 上，电脑合盖不影响
- **能力匹配**：Xcode 任务只能 MacBook，puer-hub 任务优先 puerHK（代码在身边）
- **弹性扩展**：视频任务临时拉 GPU VPS，跑完释放
- **优雅降级**：MacBook 离线下，任务自动转移到 VPS worker

### 1.2 设计哲学（5 条不可妥协）

| 原则 | 含义 |
|------|------|
| **调度 ≠ 执行** | orchestrator 决策但不执行，worker 执行但不决策 |
| **位置无关** | orchestrator 看不见 worker 在哪台机器，只看见能力 |
| **在线优先 + 离线降级** | MacBook 在工作时段优先，离线时自动转 VPS |
| **Locality 优先** | 代码在哪里，worker 就在哪里（puerHK 跑 puer-hub） |
| **永远在容器/daemon 上** | 调度层容器化，agent 必 daemon（不靠 SSH 交互） |

---

## 2. 三层架构

### 2.1 整体架构图

```
                    🧠 调度层
              newvps（清理后 + 4G swap）
            orchestrator + commander × 3
                       │
                       ↓ JSON-RPC / WebSocket
        ┌──────────────┴──────────────┐
        ↓                             ↓
   ⚙️ Worker Pool（6+ host）
   ┌──────────────────────────────────────────────┐
   │  MacBook Pro M1 16G ⭐ 主力（你工作时段）     │
   │  newvps 4C/7.8G（调度层共址，清理后）        │
   │  puerHK 4C/7.8G（puer-hub 专用，挤 1 worker）│
   │  aliyun 2C/3.4G+4G swap（公网 worker）       │
   │  HK103 2C/3.8G+2G swap（frp 网络 worker）   │
   │  临时 GPU VPS（按需，AutoDL/矩池云）         │
   └──────────────────────────────────────────────┘
        ↑
        │
┌─────────────────┐
│ 📱 控制层       │
│ iPhone Safari   │
│ harness.rana.asia│
│ PWA + 语音输入  │
└─────────────────┘
```

### 2.2 调度层（newvps）

| 组件 | 资源 | 职责 |
|------|------|------|
| orchestrator | 1G | 跨项目决策、调度、状态管理（Fable 5） |
| commander-1 | 1G | 独立任务（GLM 5.3） |
| commander-2 | 1G | 信息检索（GLM 5.3） |
| commander-3 | 1G | 视频工作流（GLM 5.3） |
| dsh web UI | 0.5G | harness.rana.asia 入口 |
| Portainer Server | 0.5G | 可视化管理（保留） |
| **总计** | **~5G** | 7.8G 物理 + 4G swap 够用 |

**部署形态**：Docker Compose stack（跟 rana-portal/guojiao 一致）

### 2.3 执行层（6 host）

| ID | Host | 资源 | 角色 | 能力 | 24/7 |
|----|------|------|------|------|------|
| `macbook-main` | MacBook Pro M1 16G | 12G 可用 | **主力**（工作时段）| claude-code, codex, cursor, xcode, gui-debug | ❌ |
| `newvps-w1` | newvps 4C/7.8G | 4G 富余 | 通用 worker | claude-code, codex, ffmpeg | ✅ |
| `newvps-w2` | newvps | 同上 | 通用 worker | claude-code, codex | ✅ |
| `puerHK-w1` | puerHK 4C/7.8G | 1.5G 挤 | **puer-hub 专用** | claude-code, prisma, postgres | ✅ |
| `aliyun-w1` | aliyun 2C/3.4G+4G | 1.5G | 公网 worker | claude-code, codex | ✅ |
| `hk103-w1` | HK103 2C/3.8G+2G | 2G 富余 | frp 网络 worker | claude-code | ✅ |
| `gpu-w-temp` | AutoDL/矩池云 | 8-16G + GPU | 视频/重型（按需）| ffmpeg-gpu, cuda | 按小时 |

### 2.4 控制层（iPhone）

| 项 | 详情 |
|----|------|
| 客户端 | Safari iOS 16.4+ |
| 域名 | `harness.rana.asia` |
| 形态 | PWA（添加到主屏幕） |
| 输入 | **语音为主**（Web Speech API）+ 文字为辅 |
| 网络 | aliyun (公网入口) → frpc → HK103 frps → newvps dsh web |

---

## 3. Worker Pool 调度策略

### 3.1 评分算法

```typescript
function score(worker, task) {
  let s = 0;
  
  // 1. 本地优先（你工作时段）
  if (worker.id === 'macbook-main' && isWorkingHours()) {
    s += 100;
  }
  
  // 2. 代码 locality（数据在身边）
  if (task.workingDir.startsWith('/opt/puer-hub') && worker.id === 'puerHK-w1') {
    s += 50;
  }
  
  // 3. 24/7 在线 worker 给后台任务
  if (task.isAsync && worker.is247) {
    s += 30;
  }
  
  // 4. 资源匹配
  if (task.needsGPU && worker.hasGPU) s += 80;
  if (task.needsXcode && worker.hasXcode) s += 100;
  if (task.needsPublicIP && worker.id === 'aliyun-w1') s += 40;
  
  return s;
}
```

### 3.2 任务派发决策矩阵

| 任务类型 | 首选 worker | 降级链 |
|----------|-------------|--------|
| iOS app 开发 | macbook-main | —（Xcode 独占） |
| GUI 调试 | macbook-main | — |
| puer-hub 维护 | puerHK-w1 | macbook → newvps |
| 通用代码项目 | macbook-main（白天）| puerHK → newvps → aliyun → hk103 |
| 信息检索/爬虫 | aliyun-w1（公网 IP）| newvps → hk103 |
| 视频工作流 | gpu-w-temp（按需）| newvps-w1 |
| 调研报告 | macbook-main（白天）| newvps → puerHK |
| 跨时区长任务 | newvps / puerHK | aliyun → hk103 |
| 实时交互 | macbook-main | — |

### 3.3 Graceful Degradation（优雅降级）

```
MacBook 在线：
  · 评分 +100（工作时段）
  · 主力 worker

MacBook 离线（合盖/睡眠）：
  · dsh agent 心跳失败 3 次（90 秒）
  · orchestrator 标记 offline
  · 活跃任务自动 reassign 到其他 worker
  · 任务不阻塞，继续跑

MacBook 醒来：
  · dsh agent 自动重连
  · orchestrator 更新 worker pool
  · 新任务重新评分，MacBook 重新优先
```

---

## 4. 模型分配矩阵

### 4.1 三层 × 三模型

| 层 | 模型 | 用途 | 成本估算 |
|----|------|------|----------|
| **Orchestrator** | Claude Fable 5 | 跨项目决策、复杂推理、开会 | 高（按需调用）|
| **Commander** | GLM 5.3 | 单项目全权负责、上下文管理 | 中（每任务 1-3 次）|
| **Worker** | MiniMax-M3 | 批量任务、执行、简单推理 | 低（量大）|

**经济学逻辑**：
- Fable 5 调用成本高 → 只用在 orchestrator（决策点少）
- GLM 5.3 中等成本 → commander 处理中等复杂度
- MiniMax-M3 便宜 → worker 跑大量重复任务

### 4.2 模型路由配置（dsh llm 包）

```yaml
# dsh config
models:
  orchestrator:
    provider: anthropic
    model: claude-fable-5
    api_key: ${ANTHROPIC_API_KEY}
    max_tokens: 8000
    
  commander:
    provider: zhipu
    model: glm-5.3-flash
    api_key: ${ZHIPU_API_KEY}
    max_tokens: 4000
    
  worker:
    provider: minimax
    model: MiniMax-M3
    api_key: ${MINIMAX_API_KEY}
    max_tokens: 2000
```

---

## 5. 三大工作流定义

### 5.1 工作流 A：独立任务（Case-by-case）

**触发**：你在 MacBook 上手动启动 cc/codex，或手机派工

**特点**：
- 每个项目独立，无关联
- 需要时启动 worker，不需要时释放
- 典型任务：修改课件、做调研报告、写代码

**默认 worker**：macbook-main（白天）/ newvps-w1（夜间）

### 5.2 工作流 B：动态信息检索

**触发**：commander-2 定时任务（launchd / cron）+ 手机派工

**任务画像**：
- 抓取 YouTube 频道（李厚辰马司库、Dan Koe）
- 抓取国内外经济信息
- 增量检测新内容

**Worker 配置**：
- 拉取阶段：aliyun-w1（公网 IP 友好）
- ASR 阶段：newvps-w1（CPU 密集）
- 分析阶段：newvps-w2（MiniMax-M3 批量）

**模型**：MiniMax-M3（worker）

### 5.3 工作流 C：视频工作流

**触发**：commander-3 编排，手机派工或定时

**任务画像**：
- 选题（从工作流 B 来的洞察）
- 写脚本（commander 编排）
- 图文转视频（GPU 渲染）
- 整合 + 发布

**Worker 配置**：
- 脚本撰写：macbook-main 或 newvps-w2
- **视频渲染**：**临时 GPU VPS**（AutoDL，按小时计费）
- 素材存储：本地 NAS 8T（80% 空）

**模型**：commander 用 GLM 5.3，worker 用 MiniMax-M3，渲染用 FFmpeg + GPU

---

## 6. 部署架构图

### 6.1 网络拓扑

```
互联网用户（iPhone Safari）
    │
    ↓ HTTPS (Let's Encrypt SSL)
┌──────────────────────────────────┐
│ aliyun (139.224.42.111:443)      │ ← 公网入口
│  · nginx (SSL 终止)              │
│  · 反代 → harness.rana.asia      │
│  · frpc (→ HK103 frps)           │
└──────────────────────────────────┘
    │
    ↓ FRP 隧道（已有架构）
┌──────────────────────────────────┐
│ HK103 (103.59.103.85)            │ ← FRPS 中转
│  · frps                          │
│  · nginx-gateway (443)            │
│  · portainer_agent               │
└──────────────────────────────────┘
    │
    ↓ FRP 转发到内网
┌──────────────────────────────────┐
│ newvps (207.57.133.177:52134)    │ ← 调度层
│  · orchestrator (Docker)         │
│  · commander × 3 (Docker)        │
│  · dsh web (Docker, 3080)        │
│  · worker × 2 (宿主机 agent)     │
│  · Portainer Server              │
└──────────────────────────────────┘
    │
    ↓ dsh agent (WebSocket)
┌──────────────────────────────────┐
│ 5 个 worker host                 │
│  · MacBook Pro (主力)            │
│  · puerHK (puer-hub 专用)        │
│  · aliyun (公网 worker)          │
│  · HK103 (frp 网络 worker)       │
│  · 临时 GPU VPS (按需)           │
└──────────────────────────────────┘
```

### 6.2 Docker Compose（调度层 stack）

```yaml
# /opt/harness/docker-compose.yml
version: '3.8'

services:
  orchestrator:
    image: node:20-alpine
    container_name: harness-orchestrator
    restart: always
    working_dir: /app
    command: sh -c "dsh orchestrator start"
    ports:
      - "8847:8847"
    volumes:
      - harness-data:/data
      - harness-logs:/logs
      - harness-workspace:/workspace
    environment:
      - DSH_MODEL_ORCHESTRATOR=claude-fable-5
      - DSH_MODEL_COMMANDER=glm-5.3-flash
      - DSH_MODEL_WORKER=MiniMax-M3
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'

  commander-1:  # 独立任务
    image: node:20-alpine
    container_name: harness-commander-1
    restart: always
    command: sh -c "dsh commander start --role independent"
    deploy:
      resources:
        limits:
          memory: 1G

  commander-2:  # 信息检索
    container_name: harness-commander-2
    command: sh -c "dsh commander start --role retrieval"
    # ...

  commander-3:  # 视频工作流
    container_name: harness-commander-3
    command: sh -c "dsh commander start --role video"
    # ...

  worker-newvps-1:  # newvps 本地 worker（也可放宿主机）
    container_name: harness-worker-newvps-1
    command: sh -c "dsh agent start --name worker-newvps-1 --capabilities claude-code,ffmpeg"
    deploy:
      resources:
        limits:
          memory: 2G

  worker-newvps-2:
    # ...

  dsh-web:
    image: node:20-alpine
    container_name: harness-dsh-web
    restart: always
    command: sh -c "dsh web start --port 3080"
    ports:
      - "127.0.0.1:3080:3080"  # 仅 localhost（通过 frp 暴露）

volumes:
  harness-data:
  harness-logs:
  harness-workspace:

networks:
  harness-net:
    driver: bridge
```

---

## 7. Mobile UI 设计

### 7.1 关键决策

| 项 | 决策 |
|----|------|
| **域名** | `harness.rana.asia`（复用现有 wildcard SSL）|
| **形态** | PWA（添加到主屏幕，全屏运行）|
| **输入** | **语音为主** + 文字为辅 |
| **STT 方案** | iOS Safari Web Speech API（零成本，85-90% 准确率）|
| **降级方案** | 云 STT（Whisper API / 阿里云）|
| **实时性** | WebSocket 流式回传（任务进度实时显示）|
| **通知** | Web Push API（iOS 16.4+ 支持）|
| **认证** | Caddy Basic Auth + 强密码（个人项目够用）|

### 7.2 语音输入实现

```javascript
class VoiceInput {
  async startRecording() {
    // 优先浏览器内置
    if ('webkitSpeechRecognition' in window) {
      return new webkitSpeechRecognition();
    }
    // 降级到云 STT
    return this.cloudSTT();
  }
}
```

### 7.3 Mobile UI 流程

```
1. 用户打开 PWA → harness.rana.asia
2. 看到大麦克风按钮 + 文字输入框
3. 按住麦克风说话 → "帮我调研老茶头市场"
4. STT 转文字 → 显示在输入框（可编辑）
5. 点"派工" → 发送到 orchestrator
6. WebSocket 接收流式回传 → 显示执行进度
7. 完成后推送通知 → 用户收到
```

---

## 8. 关键决策日志

### 8.1 Q&A 校准

| Q | 决策 | 备注 |
|---|------|------|
| **Q1** 多机协同 | C（服务器跑 orchestrator） | 调度/执行分层 |
| **Q2** 开会形态 | **语音为主 + 文字为辅** | Mobile UI 核心 |
| **Q3** 重要博主 | 李厚辰马司库 + Dan Koe + 其他 | 动态检索输入 |
| **Q4** 视频工具链 | a + b + c | 写脚本 + 图文转视频 + 整合 |
| **Q5** NAS 状态 | 80% 空 | 视频素材随便放 |
| **Q6** 模型分配 | minimax-M3=worker, glm-5.3=commander, fable5=orchestrator | 三层三模型 |
| **Q7** 痛点 | B + C（信息检索 + 视频） | 优先解决 |
| **Q8** 第一形态 | B（mobile UI） | 入口先做 |
| **Q14** cc/codex 必装 | 是 | worker runtime 必装 |
| **Q15** iPhone 角色 | controller（不跑 cc/codex） | 跟 Apple 生态设计一致 |

### 8.2 架构修订历史

| 版本 | 修订 | 原因 |
|------|------|------|
| v1 | 服务器 vs Mac mini | 选服务器（便宜、24/7、Linux 更稳）|
| v2 | Mobile UI 必须 | 加 PWA + 语音输入 |
| v3 | 调度/执行分层 | 黄金架构，故障隔离 |
| v4 | cc/codex 必装 | dsh 不自带 runtime |
| v5 | MacBook 不入调度 | ❌ 错，用户纠正 |
| v5.1 | MacBook 入调度 + 优雅降级 | 主力 worker，离线降级到 VPS |
| v6 | 6 host worker pool | MacBook + 5 VPS |
| v7 | 混合部署（容器 + 宿主机）| 调度层容器，agent 宿主机 |

### 8.3 关键决策点

1. **dsh 覆盖度 80%**：调度骨架、LTM、compaction、subagent 多变体 ✅
2. **必须二次开发 20%**：三层架构抽象、持久化、业务工作流、Mobile UI、路由评分
3. **iPhone 不跑 cc/codex**：iOS sandbox 限制，只能 controller
4. **容器 vs 宿主机**：调度层容器化，agent 必宿主机（贴近数据）
5. **Swap 是合法的**：7.8G 物理 + 4G swap = 11.8G 可用
6. **VPS 必须清理才能跑 worker**：HK103 磁盘 100% → 68% 才达标
7. **Vietnam BP 已停**：用户已主动为 harness 腾空间（aliyun 1.5G 富余）

---

## 9. 二次开发范围（Wrapper 层）

### 9.1 工程量评估

**总计：~2500-3000 行 TypeScript**

| 模块 | 代码量 | 难度 | 优先级 | 状态 |
|------|--------|------|--------|------|
| 三层架构抽象（orch/commander/worker）| 800-1000 | 中 | P0 | 待开发 |
| 持久化层（SQLite 任务历史）| 300 | 低 | P0 | 待开发 |
| 业务工作流模板（A/B/C 三类）| 800-1000 | 中 | P1 | 待开发 |
| Mobile UI 改造（PWA + 语音）| 400-500 | 低 | P1 | 待开发 |
| 智能路由评分 | 200-300 | 低 | P1 | 待开发 |
| 优雅降级（task reassignment）| 200-300 | 中 | P1 | 待开发 |

### 9.2 关键设计原则

```
不修改 dsh 源码
只在 wrapper 层包装
dsh 升级时 wrapper 不需要重写
```

### 9.3 Wrapper 架构

```
┌─────────────────────────────────┐
│ 应用层（业务代码 ~2500 行）      │  ← 三层抽象 + 工作流 + 路由
├─────────────────────────────────┤
│ wrapper 层（薄适配 ~500 行）     │  ← 把 dsh subagent 包装成 commander
├─────────────────────────────────┤
│ dsh 核心（直接调用，无修改）    │
├─────────────────────────────────┤
│ LLM provider / cc / codex      │
└─────────────────────────────────┘
```

### 9.4 目录结构

```
/opt/harness/
├── docker-compose.yml         # 调度层容器
├── wrapper/                   # 二次开发代码
│   ├── orchestrator/         # 三层架构抽象
│   ├── persistence/          # SQLite 持久化
│   ├── workflows/            # A/B/C 工作流模板
│   ├── routing/              # 智能评分
│   └── mobile-ui/            # PWA 改造
├── workspace/                 # 工作目录（代码/资料）
├── data/                      # 持久化（SQLite DB）
└── logs/                      # 日志
```

---

## 10. 部署 Checklist（v4）

### Phase 1：newvps 准备（容器化部署调度层）
- [ ] 清理镜像 + 加 4G swap
- [ ] 创建 `/opt/harness/{data,logs,workspace}`
- [ ] 写 `docker-compose.yml`
- [ ] `docker compose up -d`
- [ ] Portainer 验证容器都 running

### Phase 2：newvps 本地 worker（agent 宿主机）
- [ ] 装 Node.js 20+
- [ ] 装 cc CLI（npm install -g @anthropic-ai/claude-code）
- [ ] 装 codex CLI
- [ ] 写 systemd unit for dsh agent
- [ ] `systemctl enable dsh-agent`
- [ ] dsh agent 注册到 orchestrator
- [ ] 测试 cc 能跑任务

### Phase 3：puerHK worker
- [ ] 装 cc CLI
- [ ] 启动 dsh agent（puerHK-w1）
- [ ] 测试读 `/opt/puer-hub/`

### Phase 4：MacBook worker（主力）
- [ ] `brew install node`
- [ ] 装 cc + codex
- [ ] `brew install dsh-agent`
- [ ] launchd plist 开机自启
- [ ] dsh agent 注册
- [ ] 配置 capabilities（含 xcode/gui-debug）

### Phase 5：aliyun worker
- [ ] 装 cc CLI
- [ ] 启动 dsh agent（aliyun-w1）
- [ ] 测试公网 IP 优势

### Phase 6：HK103 worker（已清理磁盘 32G→68%）
- [x] ✅ 清理磁盘到 68%（释放 11G，可用 9.8G）
- [ ] 装 cc CLI
- [ ] 启动 dsh agent（hk103-w1）

### Phase 7：Mobile UI
- [ ] aliyun 配置 nginx + SSL（harness.rana.asia）
- [ ] HK103 frps 配置加 harness-web 转发
- [ ] iPhone Safari 访问 + PWA 添加到主屏幕
- [ ] 测试语音输入 + 派工

### Phase 8：业务 wrapper 层（二次开发）
- [ ] 三层架构 wrapper
- [ ] 持久化层（SQLite）
- [ ] 业务工作流模板
- [ ] 智能路由评分
- [ ] 部署 wrapper 到 newvps harness stack

---

## 11. MVP 第一刀

### 11.1 MVP 定义

**最小可用产品**：能用手机派 1 个任务，24 小时内自动跑完，结果推送回手机。

### 11.2 MVP 范围

```
✅ 必要：
  · newvps 调度层（orchestrator + 1 commander + dsh web）
  · 1 个 worker（newvps-w1）
  · Mobile UI（语音派工）
  · 1 个工作流：独立任务

⏸ 后续：
  · 5 个其他 worker host
  · 2 个其他 commander
  · 信息检索 + 视频工作流
  · 持久化（用 session-scoped 临时）
  · 智能路由（用默认轮询）
```

### 11.3 MVP 任务示例

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

---

## 12. 风险与回滚

### 12.1 风险清单

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| newvps OOM | 中 | 高 | 加 swap + commander 数限制 |
| MacBook 长期离线 | 低 | 中 | 任务自动转 VPS |
| dsh API 变更 | 低 | 中 | wrapper 隔离，不直接依赖 dsh 内部 |
| 微信/CC API 限流 | 中 | 中 | 多模型 fallback（GLM → DeepSeek）|
| VPS 突然宕机 | 低 | 中 | 任务有 retry + 持久化 |
| Mobile UI 安全问题 | 中 | 高 | Caddy Basic Auth + 强密码 |
| 视频工作流 GPU 成本失控 | 中 | 中 | 设置月度预算上限 |

### 12.2 回滚方案

```
阶段 1（MVP 没跑通）：
  · docker compose down
  · 恢复 newvps 原状
  · 零成本回滚

阶段 2（MVP 跑通但 v0.2 失败）：
  · 保留容器化调度层
  · 关闭 wrapper 层
  · 降级为"纯 dsh web UI"
  · 1 小时回滚

阶段 3（v0.2 跑通但 v1.0 失败）：
  · 保留 worker pool
  · 关闭 commander
  · 降级为"裸 dsh subagent pool"
  · 半小时回滚

完全回滚：
  · 关闭所有 dsh agent
  · docker compose down
  · 移除 harness stack
  · 恢复 VPS 原始用途
```

### 12.3 监控

```
健康检查：
  · orchestrator 心跳 → 失败告警
  · worker pool size → < 3 告警
  · commander 任务队列 → > 10 告警
  · 内存使用 → > 80% 告警
  · 磁盘使用 → > 80% 告警

告警通道：
  · Web Push → iPhone
  · 邮件 → rana.asia（如果有）
  · 微信（可选，通过 Server酱）
```

---

## 附录 A：资源现状快照（2026-08-29）

### A.1 服务器资源

| 机器 | 内存空闲 | 磁盘空闲 | 状态 |
|------|----------|----------|------|
| newvps | 待清理 | 待清理 | 大多数容器已 stop |
| puerHK | 3.8G | 53G/88G | puer-hub 满载 |
| aliyun | 1.5G | 14G/40G | Vietnam BP 已停 |
| HK103 | 2.1G | 9.8G/32G | mail/org-diagnosis 已下线（清理） |

### A.2 dsh 现状

- 仓库：https://github.com/deepseek-ai/deepseek-harness
- Stars：202k（截至 2026-08-29）
- License：MIT
- 状态：dev preview（50+ packages）
- 关键包：llm, subagent, compaction, web, sdk

### A.3 三模型 API

| 模型 | Provider | 用途 |
|------|----------|------|
| Claude Fable 5 | Anthropic | orchestrator |
| GLM 5.3 Flash | 智谱 | commander |
| MiniMax-M3 | MiniMax | worker |

---

## 附录 B：术语表

| 术语 | 含义 |
|------|------|
| **Orchestrator** | 总指挥，跨项目决策 |
| **Commander** | 指挥官，单项目全权负责 |
| **Worker** | 执行者，跑实际任务 |
| **Subagent** | dsh 子代理（cc/codex/aider 等）|
| **Agent** | dsh daemon，跑在 worker host |
| **PWA** | Progressive Web App |
| **STT** | Speech-to-Text |
| **Locality** | 数据/代码在哪里，worker 就在哪里 |
| **Graceful Degradation** | 优雅降级，MacBook 离线时任务自动转移 |
| **Wrapper** | dsh 之上的薄包装层，封装业务逻辑 |

---

## 附录 C：变更日志

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-08-29 | 初版，架构对齐完成 |

---

> **下一步**：MVP 第一刀实施
> **优先级**：1 → 3（PRD） → 2（实施），按用户决定
