# Codex 复审报告 — v1.1.1 v0.7 实施链 formal 复审（server-side 切入口 + 5 edge 起草 + dsh install）

> **Date**: 2026-09-03（formal 轮）
> **Reviewer**: Codex（gpt-5.6-sol 风格，xhigh；per `notes/codex-audit-scope-v1.1.1-v0.7-precommit-prompt.md`）
> **审验对象**: 实施链 **11 commits**（`3323387..6d5a362`）：计划 4（`309abeb` audit-scope drafting / `5ce30ec` server.ts + PROJECT_ROOT / `ec0c38f` deploy cutover + 5 edge + dsh install / `c262c37` cc-ready + CHANGELOG + README）+ deviation/fix 7（`77f366b` D-1~D-3 npm registry rewrite / `838c2be` deviation record / `8bd6150` D-4 build verify 1-failure / `7571f19` D-5 src/build conditional / `aff74c3` isMain guard / `df0b3bb` VAPID 公钥轮换 / `6d5a362` D-6 U4 环境记录）
> **判定**: **终态 PASS（0C/0M/0m）**——首验 1M/3m 同轮收口，36 条命令矩阵 + 双 gate 全绿
> **基线**: HEAD = `6d5a362`；cc-ready = `T-V1.1.1-DISPATCH-PASS` ✓；树净

---

## §1 通过项（36 条矩阵 verbatim，全绿）

### A 类（继承守门，20 条）
前向 8 文件 **0**；**三源 tracked 117/49 文件 + disk 126 + 自伤 9**（引用式 §1.5 主表同值）；sk- 0 / tskey- 0 / VAPID 私钥赋值 0；v1.0 runtime 修正版 diff **0**；web profile 0 / headless 空格版 **19**；IP 1（白名单）/ ts.net 57 / Funnel 48；STT 音频 0 / tmp 0 / WHISPER 0；FCM 4 端点 4；signVapidJwt 15 / hmac stub 0 / dsaEncoding 2 / createSign 1。

### B 类（v0.7 NEW 守门，16 条——起草态红全部转绿）
**sleep infinity 0**（12→0 全切，v1.1.1 最强 hygiene 信号达成）；harness-edge 34 ≥5；tag:harness-edge 12 ≥1；EDGE_REGION awk **5**（≥5 校准后，见 m2）；build/server.js awk **12** ≥8；**volumes 旧挂载 0（12→0）+ 新挂载 12 ≥12**（§7-1 双修法全落地）；**server 8 endpoint 8**（≥8，含 use-无路径 fallback，见 m1）；import.meta.url **8** ≥4（D-5 src/build conditional 双路径）；旧 PROJECT_ROOT 模块级 0 + 函数级 0；install-dsh.sh 存在 + npm 版守卫 6 条全绿（1/1/2/1/0/0，见 M1）；GitHub URL 0 / @latest 0；cc-ready `T-V1.1.1-DISPATCH-PASS` true。

### 双 gate（本地 bin）
tsc exit **0**；vitest **16 文件 10p+6s / 214 tests：135 passed / 79 skipped / 0 failed**（较 v0.6 95p 增 40p：server.test + project_root.test + server_integration.test 三 NEW 套件）。

### deviation 链合规性
D-1~D-3（npm 渠道）有案（`838c2be`）且守门同轮回写（M1 收口）；D-4（U3 build 1-failure）环境记录（`8bd6150`）；D-5（conditional 解析）+ `aff74c3` isMain guard（防 server.ts import 时误跑 main）良性修复；**VAPID 公钥轮换 `df0b3bb`**：newvps 生成、87B 等长、白名单机制内合法轮换（RFC 8292 commit-safe），私钥零落盘维持；D-6（`6d5a362`）U4 环境记录。kernel/schema 未动（v1.0 diff 0 佐证）。

## §2 首验 findings（1M + 3m，同轮收口）

### M1 (major) §4.9 install 守门与 D-1~D-3 npm deviation 未同步——实施漂移未回写合同
- 首验实测：起草版三守卫（DSH_URL:? / set -e / chmod +x）实测 **2/3 ≠ ≥3 必红**——deviation 已将 dsh 安装重写为 npm 全局安装（`npm install -g @deepseek-ai/dsh@exact` + `set -euo pipefail`），DSH_URL/chmod 语义自然消失且 deviation 有案，但守门合同未回写（v0.5 disk 口径同型：实施漂移须同轮回写口径）
- **收口**：§4.9 + §9-7 + prompt §2.9 全量重写为 npm 版 6 条（DSH_VERSION 强校验双命令 -F 字面 / set -euo pipefail / 版本 pin / @latest ==0 / GitHub URL ==0 / DSH_VERSION ≥1），终验 1/1/2/1/0/0 全绿

### m1 §4.7.6 pattern 缺 use-无路径 fallback 分支
- 首验 7 ≠ ≥8——第 8 endpoint 实施为 `app.use((_req, res) =>` 无路径兜底（**Express 5 path-to-regexp v8 拒绝 `app.get('*')`**，server.ts L168 注释已记适配理由），pattern 只认具名路径 → 补 `app\.use\(\s*\(\s*_req` 分支，实测 **8**（功能 8/8 本就齐）

### m2 EDGE_REGION 期望时点漂移
- 起草实测 10 = env 1 + echo placeholder 字样 1（每文件）；echo 随 `sleep infinity` 同一改动删除 → formal 实测 **5**。期望校准 ≥5（每文件 env var 1 处；awk 真命中语义不变）

### m3 import.meta.url「== 4」字面失实
- prompt §2.8/§4-6 写 == 4，formal 实测 **8**（4 文件 × D-5 src/build conditional 双路径）→ 校准 ≥ 4（实测 8）

### 复审者自纠记档（第 13 次同型病灶变体）
M1 回写首版守门 pattern `DSH_VERSION="${DSH_VERSION:-}"` 用 ERE 且 `$`/`[`/`{` 元字符未转义 → **永不匹配（实测 0）**，自查发现后改 `-F` 字面匹配（1/1）——「守门命令本身要先跑后写」铁律对 grep 方言同样生效。

## §3 终验（收口后 verbatim 复跑）

8-endpoint **8** ✓；npm 守卫 1/1/2/1/0/0 ✓；EDGE_REGION 5 ✓；sleep infinity 0 ✓；volumes 0/12 ✓；v1.0 diff 0 ✓；三源 **117/126/9** 稳定（守门校准零自引入）✓；tsc 0 / vitest 0 failed ✓。

## §4 判定与下一步

**v0.7 实施链 formal 复审 终态 PASS（0C/0M/0m）**：11 commits 全链合规（含 7 deviation 全有案 + 守门同轮回写）；server-side 切入口真实落地（sleep infinity 清零 + 12 services volume 双修法 + 8 endpoint + 3 NEW test 套件 40p）；dsh 安装经 npm 渠道 deviation 收敛。**pending（user 动作，非本轮范围）**：U8 `v1.1.1` tag（亲提 + push via Clash）；U5 真机 4 E2E + U6 6 Funnel URL 200 验证；v1.1.1.1+ 5 edge 真实 provision（VPS 采购 + Tailscale auth key）。

---

*codex review done — v0.7 formal **PASS（0C/0M/0m）**：11 commits 实施链（计划 4 + deviation 7）36 条矩阵全绿 + tsc 0 / vitest 135p-79s-0f（+40p）；首验 1M（§4.9 npm deviation 未回写守门）+ 3m（endpoint fallback pattern / EDGE_REGION 时点漂移 / import.meta.url ==4→8）同轮收口；sleep infinity 12→0 + volumes 旧 12→0 新 12 + 8 endpoint + 三源 117·126·9 稳定；ERE 元字符坑自纠记档（-F 字面版）；GA 余 v1.1.1 tag + U5/U6 真机 + 5 edge provision 三 user pending。*
---

## 附：起草轮记录（2026-09-03 早轮，已被上文 formal 轮取代）

起草双文件复审（audit-scope + prompt，untracked 态）：**0C/4M/4m → 同轮收口**——F1 §3 命令双重错（ADR 0010 误纳 + spec 整目录化，连带坐实 v0.6 报告 §3 假绿）/ F2 headless pattern typo（空格版实测 19）/ F3 volumes 双守门空头条款补齐 / F4 grep -c|wc -l 数文件假绿 ×2 awk 化；起草者实测前置达标（disk 126/自伤 9）。详文随 `309abeb` 入库（git 历史可考）。
