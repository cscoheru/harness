# 签发 — T-M0b-SCOPE-FIX（scope 清单 F1-F4 hygiene 修复）

> **给 CC**：只读本文件。上一枪 `fb429e3`（self-audit 报告 PASS + F1-F4 findings，见 `notes/codex-review-v1.1-m0b-scope-v0.1-report.md`）。  
> 硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。  
> 做完即停 → cc-ready + commit + push → `docs/CC-POLL.md`。

---

## 任务

**T-M0b-SCOPE-FIX** — 按 `notes/codex-review-v1.1-m0b-scope-v0.1-report.md` §4/§6.1 修 4 项 hygiene（单 commit，~15 分钟）。目的：让 scope 清单可被 v0.1 正式复审直接复用（否则照单跑会出 7≠8 假 FAIL 与 exit 2 假信号）。

### 产出

| # | 文件 | 改动 |
|---|------|------|
| 1 | `notes/codex-audit-scope-v1.1-m0b-v0.1.md` | **F1**：§3 M4 验证命令 `grep -c "^- id: tool-" docs/m0b/profile-override-base.yaml`（应 == 8）改为 `grep -cE "^- id: (tool-\|agent-instructions)" docs/m0b/profile-override-base.yaml`（应 == 8）；**F2**：§3 C2 验证命令改为 `grep -rE "Fable 5\|GLM 5.3\|MiniMax-M3" docs/m0b/ adr/ \| wc -l`（应 == 0，并注明 `spec/capabilities/` 落地后再并入 scope），统一 §2.1(E) 的 `adr/001*.md` 与 §3 的 `adr/` 两处写法；**F4**：header「对应 commit：pending …」改为 `9f5ef4b`（v0.1 工件单 commit）+ `fb429e3`（self-audit 报告入库） |
| 2 | `docs/poll/cc-ready.json` | **F3**：`files_unmodified_scope_discipline` 移除 `docs/m0b/ …` 条目（该路径在 `files_modified` 已列，簿记矛盾）；**保留 `tmp/` 条目**；`task_id` → `T-M0b-SCOPE-FIX`（notes 携带 `previous task_id=T-V1.1-M0B-DISPATCH`） |

**不改**：`docs/m0b/` 5 模板、5 DISPATCH §6.X、plan v0.1 正文、`notes/codex-review-v1.1-m0b-scope-v0.1-report.md`（报告是 audit trail，不改历史 findings）。

### 验收（全部实跑）

```bash
# F1（修正后命令 verbatim）
grep -cE "^- id: (tool-|agent-instructions)" docs/m0b/profile-override-base.yaml   # == 8

# F2（修正后命令 verbatim）
grep -rE "Fable 5|GLM 5.3|MiniMax-M3" docs/m0b/ adr/ | wc -l                        # == 0

# F3 + task_id
python3 - <<'EOF'
import json
d = json.load(open("docs/poll/cc-ready.json"))
assert d["task_id"] == "T-M0b-SCOPE-FIX", d["task_id"]
unmod = d.get("files_unmodified_scope_discipline", [])
assert not any("docs/m0b" in x for x in unmod), [x for x in unmod if "docs/m0b" in x]
assert any("tmp/" in x for x in unmod)
print("F3+task_id OK")
EOF

# F4
grep -c "pending" notes/codex-audit-scope-v1.1-m0b-v0.1.md | grep -qv 0 && echo "FAIL: pending 残留" || echo "F4 OK"
grep -c "9f5ef4b" notes/codex-audit-scope-v1.1-m0b-v0.1.md   # ≥ 1
grep -c "fb429e3" notes/codex-audit-scope-v1.1-m0b-v0.1.md   # ≥ 1

# 范围：自 9f5ef4b 起仅 3 文件（scope md + cc-ready.json + 本 DISPATCH）
git --no-pager diff 9f5ef4b..HEAD --stat | cat
```

---

## 完成后

1. 单 commit：`chore(m0b): T-M0b-SCOPE-FIX — scope 清单 F1-F4 hygiene（pre-recheck）`
2. **push**（本任务授权：修完 push 即可送 Codex 复审）
3. cc-ready `task_id=T-M0b-SCOPE-FIX` + notes 已含 previous task_id → 停等
4. 下一站（**不主动走**）：用户亲提 **T-M0b-V0.1-RECHECK**（Codex CLI `gpt-5.6-sol` + `xhigh`，按 `notes/codex-audit-scope-v1.1-m0b-v0.1.md` §4.1 prompt）；若复审者对历史版本跑出 7≠8 / exit 2 疑问，出示 `notes/codex-review-v1.1-m0b-scope-v0.1-report.md` §2/§4 裁决

## 禁止

- 不动 `docs/m0b/` 模板、5 DISPATCH、plan v0.1、v1.0 runtime（harness/spec/spikes）、ADR 0001-0009、Dockerfile/compose/pyproject
- 不创建 `spec/capabilities/`（M0b QA-1 才落地）
- 不执行 M0b 实测（DEEPSEEK_API_KEY 与「Start v1.1 M0b」两信号未发，PRD-v1.1 §4.6 第 3 条）
- 不 force push；不动 `v1.0.0`/`v1.0.0a0`/`v1.0.0a1` tag
