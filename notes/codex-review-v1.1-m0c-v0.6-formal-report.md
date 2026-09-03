# Codex 复审报告 — v1.1 v0.6 升级 + M3 GA final 实施收口（formal 轮，首验+同轮收口一体）

> **Date**: 2026-09-03
> **Reviewer**: Codex（gpt-5.6-sol 风格，xhigh；per `notes/codex-audit-scope-v1.1-m0c-v0.6-precommit-prompt.md`）
> **审验对象**: 修复链 4 commits——`c4a4e39`（DISK-CALIB：disk 三源 124）/ `33ab629`（M3-EXEC-3 stub→真 ES256）/ `23e052c`（M3-EXEC-5 ADR 0011 closure + GA release notes）/ `6b3ef7c`（v0.6 audit-scope + 翻牌 `T-M3-EXEC-PASS`）
> **判定**: **终态 PASS（0C/0M/0m）**——首验发现 3 major，同轮 Codex 直改收口，复验全绿（v0.4 §7「发现-修复-终态」同模式）
> **基线**: HEAD = `6b3ef7c`；本报告 + v0.5 报告 + audit-scope 终值 + `deploy/vapid_public.key` 白名单入库随本轮 commit 归档

---

## §1 通过项（verbatim 实跑）

| 检查 | 实测 | 判定 |
|------|------|------|
| v0.6 前向不锁型号（6 文件：CHANGELOG/README/plan/ADR 0011/公告/release notes） | **0** | ✅ |
| **tracked 锚定三源** | 命令 **117 / 49 文件** == §1.5 主表合计 == §1 期望（引用式+实测值） | ✅ |
| **disk 口径三源**（DISK-CALIB 后） | 命令 **124** == 期望 == 主表 disk 行（117 + v0.6 audit-scope 自伤 7） | ✅ |
| 演进链 | 91→97→101→103→107→114→117（引用式机制 + DISK-CALIB 归属修正后全链闭合） | ✅ |
| M3-EXEC-3 实质 | `signVapidJwt` ECDSA P-256 + SHA-256（RFC 8292 §3.2 raw r\\|\\|s，`dsaEncoding: 'ieee-p1363'` ×2）真实现替换 stub；webpush_gateway L156 接线 | ✅ |
| M3-EXEC-5 | ADR 0011 closure 公告 9 段（docs 命中 0）+ `DOCS-RELEASE-NOTES-v1.1.0.md`（命中 0）+ plan v0.5 升级 | ✅ |
| §2 DEEPSEEK_API_KEY / §4.7 VAPID 赋值式 / 私钥落盘 | 0 / 0 / **disk 仅公钥 1 文件** | ✅ |
| §4 dsh profile / §4.6 STT 三条 / §4.5 IP | headless 19 / web 0；音频 0 / tmp 0 / whisper 0；IP 1 白名单 | ✅ |
| §3 v1.0 runtime | 0 | ✅ |
| gate（本地 bin） | tsc exit **0**；vitest **8 文件 p/5 s + 95 tests p/72 s / 0 failed**（M3-EXEC-3 test 修复生效，skipped 69→72） | ✅ |
| cc-ready | `T-M3-EXEC-PASS` JSON valid | ✅ |
| hard rule 5 条 | (a) 先行起草 ✓ (b) DISK-CALIB 三 drift 修完 ✓ (c) #49-#55 入列 ✓ (d) message 附实测 ✓ (e) 引用式 ✓ | ✅ |

## §2 首验 findings（3 major，同轮已收口）

### W-A (major) v0.6 audit-scope 期望/主表「实测后填」占位 + 噪音——合同未闭合即翻牌
- 首验实测：§1 L19/L23/L38/L56 + 表 #5/#6/#10 全为「v0.6 实测后填」占位；L19/L56 残留「公式预测 ~214」「Plan agent 风险评估 MEDIUM」草稿噪音（~214 系把 wrapper/ 误算入锚定范围）；L27 自伤期望 ≥8 vs 实测 7——**`6b3ef7c` 翻牌 PASS 时三源中期望源缺失**（hard rule (b)「commit 后立即复审」未完成即 flip）
- **收口**：终值全填——tracked == **117/49**、disk == **124**、自伤 == **7**（§1×2 + §1.5×1 + §4.5×1 + §6×1 + §7×1）；表 #54 公告 0 / #55 release notes 0；删 ~214/Plan agent 噪音行；演进链闭合至 117

### W-B (major) §1.4 stub 守门反禁合规 API——pattern 设计错误
- 首验实测：`grep -c "createSign\|asn1" vapid_keys.ts` = **2 ≠ 0 FAIL**——实现合规使用 `createSign('SHA256').sign({key, dsaEncoding:'ieee-p1363'})`（raw r||s 正确路径），守门却把 createSign 本身列为禁词（意图防 DER 默认输出，错禁 API）
- **收口**：§1.4 校准为 `dsaEncoding: 'ieee-p1363'` ≥ 1（实测 2）+ `asn1|der` == 0（真禁 DER）+ `signVapidJwt` ≥ 1（实测 3）——守门意图与实现契约对齐

### W-C (major) `deploy/vapid_public.key` untracked 裸放——守门盲区 + 口径矛盾 + 误入库风险
- 首验实测：真公钥（87B base64url）untracked + NOT-IGNORED 裸放 deploy/；§4.7 赋值式 pattern 期望 == 0 对裸 key 文件**不命中**（盲区）；v0.5 校准「公钥 env-inject-only == 0」与 wrapper 实现契约（vapid_keys.ts L8/L80「SAFE to commit / committed」）**口径互斥**；未来 `git add -A` 将误入库
- **收口（架构师裁定：回归 RFC 8292 公钥公开分发本义 + 实现契约）**：公钥以**单文件白名单入库**（本 commit `git add deploy/vapid_public.key`）；§4.7 加白名单注记——赋值式 pattern 期望仍 == 0（防字面散布）、私钥文件严禁落盘（实测 disk 仅公钥 1 文件）、公钥文件在锚定范围外（deploy/ 不入 §1 命令）

## §3 终态验收（收口后 verbatim 复跑）

tracked 命令 == 117 == 主表 117/49 == 期望；disk 命令 == 124 == 期望 == 主表；§1.4 三命令 2/0/3（≥1/==0/≥1）✓；前向 6 文件 == 0；`deploy/vapid_public.key` 入库（`git ls-files deploy/vapid_public.key` 命中）；私钥 disk 0；tsc 0 / vitest 0f；v1.0 runtime 0；本轮 commit 自引入预演 **+0**（audit-scope 收口改动与报告均无 pattern 字面）→ post-commit 三源不变 117/124

## §4 终态判定与遗留

**v0.6 升级 + M3 GA final 实施收口 终态 PASS（0C/0M/0m）**（user 预期达成）：首验 3M（W-A/W-B/W-C）全部同轮收口复验全绿；修复链 4 commits + 本轮归档 commit 全链 hard rule 合规；**v1.1 GA 唯二 pending（非本轮范围）**：①`v1.1.0` tag 打tag（user/执行端动作，release notes 已备）②5 edge host 缺口路径 A/B user 决策（ADR 0011 挂账）。

---

*codex review done — v0.6 终态 **PASS（0C/0M/0m）**：M3 实施链 4 commits（DISK-CALIB 124 三源 / stub→真 ES256 / ADR closure + release notes / 翻牌）实质全绿 + tracked 117·disk 124 双口径三源同值；首验 3M（audit-scope 占位未闭合即翻牌 / §1.4 守门反禁合规 API / VAPID 公钥裸放口径矛盾）同轮 Codex 收口复验全绿；tsc 0 / vitest 95p-72s-0f；GA 仅余 v1.1.0 tag + 路径 A/B 两 user pending。*
