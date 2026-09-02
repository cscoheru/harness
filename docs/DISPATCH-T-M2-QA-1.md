# T-M2-DISPATCH-QA-1 — 真 dsh 6 host + STT 真调 + Web Push 端到端 + 6 Funnel 验证

> **Task ID**: T-M2-QA-1
> **Date**: 2026-09-02
> **Role**: QA (Quality Assurance)
> **Stage**: v1.1 M2
> **Trigger**: M1c DD-1 收口 + user 「Start v1.1 M2」 + T-M2-BE-1/TG-1/DO-1 实施 + v0.3 audit-scope §4.5/§4.6/§4.7
> **Status**: 🟡 DISPATCH DRAFT
> **Author**: 架构师 Claude Fable 5 (claude-fable-5)
> **Worktree**: 主仓 `main`

---

## §0 元数据

- **触发条件**: T-M2-BE-1 + T-M2-TG-1 + T-M2-DO-1 全部 commit
- **依赖**: 6 host 部署完成 + wrapper 6 host skeleton + dsh 6 host + STT + Web Push 全部落地
- **产出**: 6 host 集成测试套件 + 6 Funnel 端到端验证 + STT 真调 + Web Push 真发 + 性能数据报告
- **估时**: 7-9 工作日（M1c QA-1 3-5d × 2 倍；6 host × 6 Funnel + STT + Web Push = 14 项验证）
- **守门**: dsh `headless` profile / **M2 多 host 守门 / M2 STT 守门 / M2 Web Push 守门**

---

## §1 任务定义（一句话）

把 M1c QA-1 mock 替换为真 dsh 调通 + iPhone Safari E2E 4 步 扩展为 **6 host 真 dsh 调通 + 6 Funnel iPhone Safari 真机 E2E 4 步 + STT 端到端真转写 + Web Push 端到端真发推送**；产出 6 host 集成测试套件（unit + integration + E2E 三层）+ 6 Funnel 性能数据报告（TTFB / Total / 命中率）。

---

## §2 输入

| # | 输入 | 来源 | 验证 |
|---|------|------|------|
| 1 | M1c vitest 三层测试 94/5/0 | `wrapper/test/{unit,integration,e2e}/` | M1c PASS |
| 2 | M2 BE-1 6host_router API | `wrapper/orchestrator/6host_router.ts` | 待 commit |
| 3 | M2 TG-1 dsh 6 host client | `wrapper/dsh/6host_client.ts` | 待 commit |
| 4 | M2 DO-1 6 host 真部署 | `deploy/6host-compose.*.yml` + Funnel 6 入口 | 待 commit |
| 5 | DEEPSEEK_API_KEY | env-inject（user 亲填；不入 commit）| per GH013 教训 |
| 6 | iPhone Safari 测试设备 | user iPhone（已 Shadowrocket VPN）| M1c 已截屏 |

---

## §3 产出

### 3.1 6 host 集成测试套件

| 文件 | 行数 | 内容 |
|------|------|------|
| `wrapper/test/integration/6host_e2e.test.ts` | ~250 行 | 6 host E2E：依次访问 6 Funnel URL → 表单提交 → 24h 完成 → 完成态可见 |
| `wrapper/test/integration/stt_e2e.test.ts` | ~200 行 | STT E2E：上传 mock 音频流（multipart）→ newvps 转写 → 返回 JSON 转写结果 + 不留盘验证 |
| `wrapper/test/integration/webpush_e2e.test.ts` | ~220 行 | Web Push E2E：mock 订阅 endpoint → VAPID 签名 → 真发推送 → 4 端点投递成功率统计 |
| `wrapper/test/integration/dsh_6host.test.ts` | ~180 行 | dsh 6 host 真调：orch 主 + 5 边缘 fallback / commander 主 / worker 任一边缘 wall time 对比 |

### 3.2 6 Funnel 验证 + 性能数据

| 文件 | 行数 | 内容 |
|------|------|------|
| `docs/reports/T-M2-QA-1-6host-funnel-validation.md` | ~150 行 | 6 Funnel 端到端验证报告：每个 Funnel URL iPhone Safari 4 步实测 + 截屏 |
| `docs/reports/T-M2-QA-1-performance-data.md` | ~120 行 | 6 host 性能数据：6 Funnel TTFB/Total + STT 端到端延迟 + Web Push 投递延迟 + 与 M1c 单 Funnel 对比 |
| `docs/reports/T-M2-QA-1-evidence/` | 目录 | iPhone Safari 6 Funnel 截屏归档（6 host × 4 步 = 24 张截图）|

**总产出：6 文件 + 1 证据目录**

---

## §4 验证

```bash
# === 1. 6 host E2E 全过 ===
for url in "https://harness-newvps.tail1b9878.ts.net/" \
           "https://harness-edge1.tail1b9878.ts.net/" \
           "https://harness-edge2.tail1b9878.ts.net/" \
           "https://harness-edge3.tail1b9878.ts.net/" \
           "https://harness-edge4.tail1b9878.ts.net/" \
           "https://harness-edge5.tail1b9878.ts.net/"; do
  curl -sI "$url/health" | grep "HTTP/2 200"
done
# 期望: 6/6 HTTP/2 200

# === 2. STT 端到端延迟 < 3s（含模型加载）===
# (per wrapper/test/integration/stt_e2e.test.ts 实测)

# === 3. Web Push 4 端点投递成功率 ≥ 95% ===
# (per wrapper/test/integration/webpush_e2e.test.ts 实测)

# === 4. v0.3 §4.5 多 host 守门 ===
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/test/integration/6host_e2e.test.ts | grep -v "127.0.0.1" | wc -l
# 期望: 0

# === 5. v0.3 §4.6 STT 不留盘守门 ===
grep -rE "/tmp/audio|/var/tmp/audio" wrapper/test/integration/stt_e2e.test.ts | wc -l
# 期望: 0（仅 /dev/shm）

# === 6. v0.3 §4.7 VAPID 私钥 env-inject 守门 ===
grep -rE "VAPID_PRIVATE_KEY\s*=\s*['\"][A-Za-z0-9_-]{32,}" wrapper/test/integration/webpush_e2e.test.ts | wc -l
# 期望: 0（仅 process.env.VAPID_PRIVATE_KEY）

# === 7. DEEPSEEK_API_KEY 不泄漏 ===
grep -rE "sk-[a-z0-9]{32,}" wrapper/test/ docs/reports/T-M2-QA-1-*.md | wc -l
# 期望: 0

# === 8. v1.0 runtime 0 行 diff ===
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0
```

---

## §5 估时

- **Day 1-2**: 6 host E2E 集成测试套件（mock + 真调）
- **Day 3-4**: STT 端到端真调（whisper.cpp + 模型加载 + 端到端延迟 SLO）
- **Day 5-6**: Web Push 端到端真发（VAPID 签名 + 4 端点投递 + 私钥 env-inject 验证）
- **Day 7**: 6 Funnel iPhone Safari 真机 E2E 4 步 + 截屏归档
- **Day 8-9**: 性能数据报告 + DD-1 协同收口 + verbatim 验证 6 项

**总估时**: 9 工作日（2 周）；与 PRD-v1.1 §5 M2 = 3 周对齐。

---

## §6 报告模板

落点：`docs/reports/T-M2-QA-1-report.md` ~250 行 8 段：

1. **§1 6 host E2E 集成测试套件实证**: 4 个 test file + 6 host × 6 test case = 36 case PASS
2. **§2 6 Funnel iPhone Safari 真机 E2E 4 步实测**: 6 host × 4 步 = 24 张截图归档
3. **§3 STT 端到端真调实证**: 转写延迟（< 3s 含模型加载）+ /dev/shm 内存峰值 + 不留盘验证
4. **§4 Web Push 端到端真发实证**: 4 端点投递成功率（≥ 95%）+ VAPID 签名时延 + 私钥 env-inject 验证
5. **§5 dsh 6 host 真调实证**: orch/commander/worker 三档 wall time 对比
6. **§6 6 host 性能数据**: 6 Funnel TTFB/Total + 与 M1c 单 Funnel 对比 + 边缘 host vs 主节点延迟差
7. **§7 verbatim 验证 8 项结果**
8. **§8 cross-ref + next**: DD-1 M2 段引用本报告作为 M2 QA 实施权威指引

---

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §1 M2 阶段 + §10.5 v0.4 升级门槛
- `docs/DISPATCH-T-M1c-QA-1.md`（M1c QA-1 mock 替换为真 dsh 调通先例）
- `docs/DISPATCH-T-M2-BE-1.md`（M2 BE-1 6host_router API）
- `docs/DISPATCH-T-M2-TG-1.md`（M2 TG-1 dsh 6 host + STT + VAPID）
- `docs/DISPATCH-T-M2-DO-1.md`（M2 DO-1 6 host 真部署 + 6 Funnel）
- `docs/DISPATCH-T-M2-DD-1.md`（M2 DD-1 CHANGELOG/README/v0.4）
- `docs/reports/T-M1c-QA-1-report.md`（M1c QA-1 vitest 94/5/0）
- `docs/reports/T-M1c-DD-1-report.md`（M1c DD-1 收口）
- `docs/reports/T-M1c-DO-1-iPhone-E2E-funnel.md`（M1c iPhone Safari E2E 经验）
- `notes/codex-audit-scope-v1.1-m0c-v0.3-precommit.md` §4.5/§4.6/§4.7

---

## §8 禁止

- ❌ mock dsh 调（必须真调 6 host；M1c 教训）
- ❌ mock STT 转写（必须 whisper.cpp 真模型）
- ❌ mock Web Push 推送（必须 VAPID 真签名 + 4 端点真发）
- ❌ 不锁容器 IP（用 MagicDNS 名）
- ❌ 不落盘 STT 音频（仅 /dev/shm）
- ❌ 不硬编码 VAPID 私钥
- ❌ 不写完整 DEEPSEEK_API_KEY
- ❌ 不动 v1.0 runtime

---

## §9 元数据自检

- [x] §0 元数据
- [x] §1 任务定义
- [x] §2 输入 6 项
- [x] §3 产出 6 文件 + 1 证据目录
- [x] §4 验证 8 项（6 host E2E + STT + Web Push + v0.3 三守门 + DEEPSEEK + v1.0 runtime）
- [x] §5 估时 9 工作日
- [x] §6 报告模板 8 段 ~250 行
- [x] §7 cross-ref 10 引用
- [x] §8 禁止 8 项
- [x] §9 元数据自检
- [x] 不锁型号守门
- [x] v1.0 runtime 不漂移守门
- [x] DEEPSEEK_API_KEY 不入 commit
- [x] Co-Authored-By 用 `Claude Code`

---

*QA-1 DISPATCH — M2 阶段 6 host 端到端真调 + STT + Web Push + 6 Funnel iPhone E2E。依赖 T-M2-BE-1/TG-1/DO-1；产出 6 文件 + 1 证据目录；估时 9 工作日；守门 v0.3 §4.5/§4.6/§4.7。Co-Authored-By: Claude Code <noreply@anthropic.com>*