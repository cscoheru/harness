# Codex 复审 prompt — v1.1 v0.6 升级 + M3 GA final 实施 PASS（formal 轮配套）

> **Date**: 2026-09-03
> **配套**: `notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md`（v0.6 升级 11 文件改动 hygiene 守门）
> **用途**: Codex CLI 复审 v0.6 升级 commit 的 prompt；user 亲提 `gpt-5.6-sol` + `reasoning_effort=xhigh`
> **审验对象**: v0.6 commit 后 11 文件（3 wrapper/ stub 替换 + 2 audit-scope + 5 公告/release + 1 cc-ready）
> **预期结果**: 0C/0M/0m PASS + 引用式机制落地验证 + M3-EXEC-3 stub 替换守门 §4.7.5 全绿

---

## §1 复审任务陈述

请按以下顺序审查 v0.6 commit（11 文件改动）：

1. **v0.6 audit-scope hygiene 自检表**（per `notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md` §5）
2. **tracked 锚定三源同值**（per v0.6 §1.5 主表 — **只引用不复制数字**）
3. **M3-EXEC-3 stub 替换守门**（per v0.6 §4.7.5 + §1.4 新增命令）
4. **M3-EXEC-5 ADR 0011 closure 公告 9 段完整性**（per v0.6 §2.3 段落清单）
5. **commit message 附实测数**（per v0.5 hard rule (d) + v0.6 §6）

## §2 验证命令矩阵（verbatim — Codex 必须实跑）

### §2.1 不锁型号守门（NORTH-STAR A-4 等价类）

```bash
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: 0
```

### §2.2 tracked 锚定（v0.6 §1.5 主表实测）

```bash
git ls-files docs/ adr/ spec/capabilities/ | xargs grep -cE "Fable 5|GLM 5.3|MiniMax-M3" 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$NF} END{print s}'
# 期望: == audit-scope §1.5 主表 tracked 实测行数（v0.6 post-commit 实测后填；不复制公式预测）
```

### §2.3 disk 锚定（v0.6 §1.5 主表实测）

```bash
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/ adr/ spec/capabilities/ notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md | wc -l
# 期望: == audit-scope §1.5 主表 disk 实测行数
```

### §2.4 不硬编码 API key（GH013 PUSH PROTECTION）

```bash
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md docs/v1.1-ga-team-plan.md adr/0011-v1.1-cycle-closure.md docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: 0
```

### §2.5 VAPID 私钥 + signVapidJwt JWK 合规（v0.6 §4.7 + §2.5）

```bash
grep -rE "vapid_private_key\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]|VAPID_PRIVATE\s*[:=]\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/ deploy/ env/ CHANGELOG.md README.md docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: 0

grep -E "d:\s*['\"][A-Za-z0-9_-]{32,}['\"]" wrapper/dsh/vapid_keys.ts wrapper/orchestrator/webpush_gateway.ts | wc -l
# 期望: 0
```

### §2.6 v1.0 runtime 0 行 diff 守门

```bash
git diff v1.0.0..HEAD -- harness/ spec/kernel-schema.sql spikes/ 'adr/000[1-9]-*.md' 'adr/0010-*.md' Dockerfile docker-compose.yml pyproject.toml | wc -l
# 期望: 0
```

### §2.7 dsh headless profile 守门

```bash
grep -rE "profile: ['\"]web['\"]|profile['\"]: ['\"]web['\"]|profile=web" wrapper/ | wc -l
# 期望: 0

grep -rE "profile: ['\"]headless['\"]|--profile headless" wrapper/ | wc -l
# 期望: ≥ 3
```

### §2.8 M3-EXEC-3 stub 替换守门（v0.6 §4.7.5 NEW）

```bash
grep -rE "hmacSha256\s*\(\s*signingInput" wrapper/ | wc -l
# 期望: 0（stub 删除确认）

grep -rE "signVapidJwt" wrapper/ | wc -l
# 期望: ≥ 2（vapid_keys.ts export + webpush_gateway.ts 调用）

grep -rE "createSign\s*\(\s*['\"]SHA256" wrapper/dsh/vapid_keys.ts | wc -l
# 期望: 0（避免默认 DER 输出）

grep -c "asn1\|DER→raw\|derToRaw\|dsaEncoding" wrapper/dsh/vapid_keys.ts
# 期望: ≥ 1（post-processing 必须有）
```

### §2.9 broken URL paths 修复守门（v0.6 §5.5 NEW）

```bash
grep -rE "new URL\('\.\./orchestrator/" wrapper/test/integration/ | wc -l
# 期望: 0

grep -rE "new URL\('\.\./\.\./orchestrator/" wrapper/test/integration/ | wc -l
# 期望: ≥ 4
```

### §2.10 signVapidJwt ad-hoc 输出验证（v0.6 §4.7.5 ad-hoc 关键命令）

```bash
cd wrapper && node -e "
import('./dsh/vapid_keys.js').then(({ signVapidJwt }) => {
  const sig = signVapidJwt('test', 'dGVzdC1wcml2YXRlLWtleS0zMi1jaGFycy1taW5pbXVtISEh');
  console.log('Length:', sig.length, '(expect 86)');
  console.log('Is base64url:', !/[+/=]/.test(sig), '(expect true)');
});
"
# 期望: Length: 86, Is base64url: true
```

### §2.11 双 gate 复跑（per v0.5 §5.3 复审环境注记 — 项目本地 bin 必须，禁 npx）

```bash
cd wrapper && ./node_modules/.bin/tsc --noEmit; echo $?
# 期望: 0

cd wrapper && ./node_modules/.bin/vitest run 2>&1 | grep -E 'Tests '
# 期望: 0 failed（含 webpush_e2e ECDSA 断言 + 4 broken URL paths 修复后 20/22 passed）
```

### §2.12 E2E test stub 替换后实测（per Explore agent 2026-09-03 baseline 7/22 FAIL）

```bash
cd wrapper && RUN_WEBPUSH_E2E=1 VAPID_PRIVATE_KEY=test-key VAPID_PUBLIC_KEY=test-pub VAPID_SUBJECT=mailto:t@x ./node_modules/.bin/vitest run test/integration/webpush_e2e.test.ts 2>&1 | grep -E 'Tests '
# 期望: 20 passed / 2 failed（仅 §5 §6 真机网络测试 user 必须）
```

### §2.13 多 host IP 不锁守门（继承 v0.5 §4.5）

```bash
grep -rE "172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+" wrapper/dsh/ wrapper/orchestrator/ wrapper/test/ deploy/ env/ CHANGELOG.md README.md docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | grep -v "127.0.0.1" | wc -l
# 期望: 0
```

### §2.14 Web Push 端点白名单（继承 v0.5 §4.7）

```bash
grep -rE "https://fcm\.googleapis\.com|https://updates\.push\.services\.mozilla\.com|https://wns\.windows-push\.com|https://api\.push\.apple\.com" deploy/ wrapper/ docs/announcements/adr-0011-closure.md docs/DOCS-RELEASE-NOTES-v1.1.0.md | wc -l
# 期望: ≥ 4
```

### §2.15 ADR 0011 closure 合规

```bash
grep -c "Status=" adr/0011-v1.1-cycle-closure.md
# 期望: ≥ 1（Status=Accepted）
```

### §2.16 cc-ready.json 翻牌

```bash
jq -e '.task_id == "T-M3-EXEC-PASS"' docs/poll/cc-ready.json
# 期望: true
```

### §2.17 公告 + release notes 落地

```bash
test -f docs/announcements/adr-0011-closure.md && echo "公告 OK"
test -f docs/DOCS-RELEASE-NOTES-v1.1.0.md && echo "release notes OK"

grep -c "Status=Accepted\|路径 A\|单 host" docs/announcements/adr-0011-closure.md
# 期望: ≥ 3
```

## §3 H1 收窄（引用式纪律实测 — 5 处 PASS）

prompt 中**绝对数字引用**：
- §1.5 主表合计实测 → 引用 `audit-scope §1.5 主表` 不复制数字
- 演进链 117 → 公式预测 ~214 → 引用 `audit-scope §1.5 主表实测` 不复制
- E2E test 7/22 → 20/22 → 引用 Explore agent 实测不复制
- Plan agent 公式预测 → 引用 `audit-scope §2.2 v0.6 实测公式`

**期望**: prompt 中**绝对数字 ≤ 3 处**（§1 审计日期 + §2 验收命令字面 + §3 H1 收窄本身计数），其余全引用式。

## §4 自引入预演字面（per v0.5 hard rule (c)）

prompt 本身含以下字面（会进入 grep pattern 命中）：
- §1 + §2 + §2.1-§2.17 + §3 + §4 + §5 + §6 + §7 = 8 节，grep pattern 在多处出现
- §2.8 stub 替换守门命令字面 4 处
- §2.9 broken URL paths 修复命令字面 2 处
- §2.10 signVapidJwt ad-hoc 命令字面 1 处

**实测预演**: notes/audit-scope 自伤不入 tracked；仅本 prompt 文件计入 disk §1 命令范围。

## §5 v0.6 升级范围 11 文件清单（per plan §1）

```text
1. wrapper/dsh/vapid_keys.ts (+ signVapidJwt 函数)
2. wrapper/orchestrator/webpush_gateway.ts (- hmacSha256 stub + import + 调用点替换)
3. wrapper/test/integration/webpush_e2e.test.ts (4 URL paths + env delete order + §7 ECDSA 断言)
4. notes/codex-audit-scope-v1.1-m0c-v0.6-precommit.md (NEW)
5. notes/codex-audit-scope-v1.1-m0c-v0.6-precommit-prompt.md (NEW)
6. docs/announcements/adr-0011-closure.md (NEW 9 段)
7. CHANGELOG.md (Edit [1.1.0] GA 段 + M3 EXEC PASS marker)
8. README.md (Edit v1.1 final 段 + M3 EXEC 状态 + GA tag 命令升级)
9. docs/v1.1-ga-team-plan.md (Edit v0.4 → v0.5)
10. docs/DOCS-RELEASE-NOTES-v1.1.0.md (NEW)
11. docs/poll/cc-ready.json (task_id → T-M3-EXEC-PASS)
```

## §6 复审 hygiene checklist（8 项）

| # | 项 | 期望 |
|---|----|------|
| 1 | §2.1 grep pattern 前向交付物 | 0 |
| 2 | §2.2 tracked 三源同值 | == audit-scope §1.5 主表 |
| 3 | §2.3 disk 三源同值 | == audit-scope §1.5 主表 |
| 4 | §2.4 DEEPSEEK_API_KEY 字面 | 0 |
| 5 | §2.5 VAPID 私钥 + signVapidJwt JWK | 0 |
| 6 | §2.6 v1.0 runtime diff | 0 |
| 7 | §2.8 stub 替换守门 | hmacSha256 调用 == 0 / signVapidJwt ≥ 2 / createSign('SHA256') == 0 / DER→raw ≥ 1 |
| 8 | §2.11 双 gate | tsc exit=0 / vitest 0 failed |
| 9 | §2.12 webpush_e2e 修复后 | 20 passed / 2 failed |
| 10 | §2.16 cc-ready.json task_id | T-M3-EXEC-PASS |

## §7 教训字面（per v0.5 §7.3 ② 升级 + v0.6 §7 NEW）

- DER vs raw r||s API 差异（Node.js 20+ `dsaEncoding: 'ieee-p1363'` 选项或 DER→raw post-processing）
- vitest stripJsExtensionPlugin + broken URL paths 副作用（test 在 wrapper/test/integration/，向上 1 级是 wrapper/test/，不是 wrapper/）
- env delete order + vitest env 隔离（`if (originalKey !== undefined)` 而非 truthy 判断）
- 公式预测不准（v0.6 §1.5 实测后填，不复制 Plan agent 公式预测数字）
- 3 commits 拆分（commit 1 stub / commit 2 公告+release / commit 3 audit-scope+cc-ready）

## §8 复审输出格式（per v0.4 §7.3 ② 引用式纪律）

Codex 报告落点：`notes/codex-review-v1.1-m0c-v0.6-formal-report.md`

**报告必须包含**：
- §1 通过项（verbatim 实跑 + 判定）
- §2 Findings（critical / major / minor / 提示级）
- §3 结论与签发（终态 PASS 预期 0C/0M/0m + 引用式机制落地验证 + M3-EXEC-3 stub 替换守门全绿）
- **所有数字引用走 audit-scope §1.5 主表唯一权威源，不复制绝对数字**

**Co-Authored-By**: Claude Code <noreply@anthropic.com>（prompt 文件末尾）

---

*Codex 复审 prompt — v0.6 升级 11 文件改动守门 by-design；继承 v0.5 §7.3 ② 引用式纪律 + 启用 §4.7.5 M3-EXEC-3 stub 替换守门 + §2.5 signVapidJwt JWK 合规 + §3.4 wrapper/ v1.0 影响实测；tracked 锚定走 audit-scope §1.5 主表唯一权威源；M3 GA final 路径 A 推荐（单 host v1.1 GA）+ 5 edge host 缺口挂账 user 真实 provision*

Co-Authored-By: Claude Code <noreply@anthropic.com>