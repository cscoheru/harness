# Codex 审验报告 — v1.1 M0b 三路径 spike 模板计划

> **Date**: 2026-09-01
> **Reviewer**: Codex (gpt-5.6-sol, reasoning=xhigh)
> **对象**: `docs/v1.1-m0b-three-path-spike-plan.md`（untracked @ HEAD `d332bbe`）
> **判定**: **FAIL（CHANGES REQUIRED）** — 2 critical + 7 major + 5 minor
> **验证方式**: 全部命令实测（非纸面推断）

---

## §1 总判定

**FAIL**。计划方向正确（三姿势候选 + 实测模板 + 守门意识到位，dsh 探测事实与本机 `dsh 0.1.1-rc.2` 一致），但存在 **2 个 critical**：核心交付物 `tmp/` 两文件被现行 `.gitignore:10 /tmp/` 挡死无法 commit（且计划自带的检测正则结构性抓不到这一冲突）；「不锁型号 grep == 0」守门与已 commit 的 5 DISPATCH 现实矛盾（实测 21 行命中，验证清单必失败）。另有 DD-1 插入锚点不存在、worker 档映射 A/B 不一致等 7 个 major。修复后复审，无需推倒重来。

## §2 Critical（必须修，按优先级）

### C1（P0）`tmp/` 被 `.gitignore` 挡死 + 检测正则失效
- **实测**：`git check-ignore -v tmp/x.yaml` → `.gitignore:10:/tmp/` 命中。§1.2「模板本身可立即 commit」、§1.5「目录可 commit」**不成立**。
- **双重缺陷**：§4 check-8 用 `grep -E "^tmp/?$"` 查 .gitignore——匹配不了 `/tmp/`（前导斜杠）→ 检查永远"通过"，掩盖真实冲突。
- **修复**：三选一并同步修 check-8 正则为 `^/?tmp/?$`：(a) 模板改放 `docs/m0b/`（推荐，天然入库）；(b) `.gitignore` 删 `/tmp/` 行并声明 tmp/ 为工件目录；(c) `!tmp/m0b-*` 负向豁免。

### C2（P0）「不锁型号」守门与 5 DISPATCH 现实矛盾，验证清单必失败
- **实测**：`grep -rnE "Fable 5|GLM 5.3|MiniMax-M3" docs/DISPATCH-T-M0b-*.md` → **21 行命中**，来源全是计划自己的样板文本：5 文件 §3.3 的 `Co-Authored-By: Claude Fable 5`、§1.5 硬约束示例行（「不写 model: "Fable 5"」）、§4 守门命令自身、BE-1:169 风险行（「改用 MiniMax-M3 / GLM 5.3」）。
- **后果**：§1.4「grep == 0 已守护」与 §7 self-check「[x] 不锁型号（A-4 grep = 0）」均**失实**；§4 check-3（期望"无输出"）在任何分支上都失败 → 计划不可执行。
- **修复**：守门语义改「除样板行外 == 0」——`grep -E "Fable 5|GLM 5.3|MiniMax-M3" <files> | grep -vE "Co-Authored|不写|❌|grep -E|R-BE-2"` 计数为 0；或收窄到真正承载型号锁定的载体（`spec/capabilities/**/*.json` + `tmp/` 两模板 + ADR 0010），DISPATCH 正文排除。

## §3 Major（必须修）

| # | 问题 | 证据 | 修复建议 |
|---|------|------|---------|
| M1 | **DD-1 无 §6 报告模板段**——报告模板内嵌 §3.1（DONE.md 骨架），§1.1「在现有 §6.2 后插入」对 DD-1 无锚点；且 §1.1 给 DD-1 的是「架构判定段（姿势 C）」，而 §4 check-5 对全部 5 文件期望 3 条姿势行 → DD-1 必挂 | DD-1 目录实测：§3.1 内嵌 `## §1 H-1…§5`，无 `## §6` | DD-1 改为在 §3.1 骨架内插「三姿势数据来源 + 架构判定」段；check-5 对 DD-1 单独期望 |
| M2 | **worker 档模型映射 A/B 不一致**：姿势 A「v4-flash=worker 档、commander 同 worker」；姿势 B `MODELS`「worker=vision-exp、commander=flash」；YAML 注释「worker=flash 或 vision-exp」三处各说各话 | §2.1 vs §2.3 vs §2.2 | 统一一张 class→SKU 表（§6.X 模板 + YAML 注释 + py 三处同源）；worker 主测 `v4-flash`，`vision-exp` 作附加探索臂（视觉≠「低成本批量」，PRD-v1.1 §1.5），否则 H-2 证据跨路径不可比 |
| M3 | **姿势 A 跑命令未按档位换模型**：模板 `dsh --profile web --patch … -- "<prompt>"` 落默认 `v4-flash`；BE-1 是 orch 任务，照抄即用错档模型 → H-1/H-2 证据被污染 | §2.1 run 命令 vs BE-1 §1.3（本任务=orch） | run 命令模板按角色给三行示例（BE-1 加 `--model deepseek-v4-pro` 等），或 patch 内写明 per-task model 覆盖步骤 |
| M4 | **override 漏启 `tool-goal`**：Context#3 自己点名 tool-goal 是「跑 A 类任务必需」且默认禁用，但 §2.2 override 未启 | Context 第 3 条 vs §2.2 YAML | 补 `- id: tool-goal / enabled: true`（或删 Context 的"必需"定性，保持自洽）；以 §4 check-7 `--dump-config` 静态输出为准 |
| M5 | **姿势 B 无法执行 TG-1「改代码」A 类任务**（REST 单轮 completion 无工具循环），但选择指南允许「B 单跑」→ B 单跑时 H-1 覆盖面=2/3 A 类，不支撑 ≥80% 判定 | §2.1 选择指南 vs PRD-v1.1 §4.6（H-1=3 个 A 类任务） | 指南注明「B 单跑只验证文本型 A 任务（调研/摘要）；H-1 覆盖率判定必须含 A 姿势跑 TG-1」 |
| M6 | **rest-spike.py 与自身描述不符**：`--runs` 注释/self-check 称「N 次中位数」但脚本不计算中位数；全部 run 失败仍 exit 0；§2.1 称输出 `.log` 但脚本从不写 | §2.3 脚本 | 补 median 聚合（wall/in/out tokens）入输出 JSON；`failed==runs` 时 exit 1；删 log 描述或真写 log |
| M7 | **ADR 守门 pathspec 失效**：`-- adr/0001-0009.md` 是字面文件名（不存在）→ 恒空过，护不住 ADR 0001-0009 正文 | §1.4/§4 check-4；实测字面与 glob 均空（当前确无漂移 ✓） | 改 `adr/000[1-9]-*.md`（M0b 期间 0010 未建，安全）；check-4 同步修正 |


## §4 Minor

- m1 计划文档自身不在 §3.1 的 8 文件 commit 清单 → 单 commit 后仍 untracked，建议列为第 9 个文件。
- m2 rest-spike.py 无 `max_tokens` 上限（成本护栏）与 429/5xx 重试；spike 可接受，建议加 `--max-tokens` 默认值。
- m3 §3.3 说 cc-ready 更新「notes 末尾追加 previous task_id」但 §2.4 diff 未体现——两处对齐（旧文本锚点实测存在 ✓）。
- m4 `tmp/` 不在 v1.1-ga-plan §7.3 M0b 产出清单——若模板定为持久工件（C1 选 docs/m0b/ 方案），v0.1 升级时补入。
- m5 QA-1「三姿势跑法说明」/DD-1「架构判定段」与 check-5「每文件 3 条姿势行」的关系需写死：建议 BE/TG/DO/QA 统一插完整三姿势段，DD-1 单独规格（见 M1）。

## §5 五个审验重点逐项结论

| # | 重点 | 结论 |
|---|------|------|
| 1 | 5 DISPATCH §6.X 完整性 | **部分成立**：BE-1/TG-1/DO-1 §6.2（dsh trace）、QA-1 §6.2（H-2 对比表）锚点实测存在 ✓、原 §6.3+ 保留可行 ✓；DD-1 无 §6 段（M1）+ check-5 自相矛盾（M1） |
| 2 | override 工具够不够 A 类任务 | **基本够但不完整**：bash+fs+fs-search+str-replace-editor 覆盖改代码；调研另靠 web profile 默认 web-search ✓；**漏 tool-goal**（M4）；patch 形状（`enabled: true` vs 移除 `disabled: true`）未验证——§4 check-7 静态校验是正确兜底 ✓ |
| 3 | httpx + DeepSeek OpenAI 兼容端点规范性 | **规范** ✓：`https://api.deepseek.com/v1/chat/completions` + Bearer + Content-Type + `model/messages/stream:false` + `usage.prompt_tokens/completion_tokens`、`choices[0].message.content` + `raise_for_status()` 符合 OpenAI 兼容 schema；缺陷在功能层（M6/m2） |
| 4 | 等价类三档选型 | **部分合理**：pro→orch ✓、flash→commander ✓；**vision-exp→worker 依据不足**（视觉实验模型 ≠ PRD-v1.1 §1.5「低成本批量」；QA-1 §6.2 预填 worker 最便宜 $0.00014 属未验证假设）+ A/B 映射不一致（M2） |
| 5 | 不锁型号 + v1.0 runtime 不漂移守门 | **实质无漂移，守门文本失效**：实测 `git diff v1.0.0..HEAD --stat` 仅 5 DISPATCH + NOW.md + cc-ready.json + v1.1-ga-plan（全 docs）✓；但 grep 守门必失败（C2）、ADR pathspec 恒空过（M7）、check-8 抓不到 `/tmp/`（C1）——「守门写了但护不住」 |

## §6 实测通过项（保留）

- dsh 事实核查与本机 `dsh --version` = 0.1.1-rc.2 一致 ✓；静态校验（`--dump-config` 不需 key）设计正确 ✓
- DEEPSEEK_API_KEY 仅走环境变量、缺失 exit 2、禁止 hardcode、「Not run」路径 ✓
- telemetry 显式 DISABLED（与 Context#6 一致）+ sandbox workspace-write/read-only 切换注释 ✓
- Start 门保留用户单独发（PRD-v1.1 §4.6 第 3 条）✓；H-1 失败→「鱼之重新定义」触发链清晰 ✓
- cc-ready §2.4 diff 旧文本锚点实测存在（两处各 1 命中）✓；task_id 与 check-6 期望一致 ✓

## §7 修复后复审口径

修完 C1/C2/M1-M7 即可复审（minor 可转 follow-up）；复审只需：check-ignore 新路径、修正后 grep 守门实测 == 0、check-4 glob pathspec、check-5 分文件期望、脚本无 key dry-run（exit 2 路径）。M2/M3 的 class→SKU 统一表是 H-2 证据有效性的前提，优先级高于文档性 minor。

---

*Codex review done — FAIL（CHANGES REQUIRED）：2 critical + 7 major + 5 minor；核心是 3 个守门检查自身失效（C1/C2/M7）与 DD-1 插入锚点缺失（M1），方向无需推翻。*
