# Codex v0.9.5 合并复审指令

> **File**: `notes/codex-review-prompt-v0.9.5.md`
> **Date**: 2026-08-30
> **Status**: v0.9.4 review PASS；v0.9.5 为文档收尾版，无代码变更
> **Source**: `notes/codex-review-prompt-v0.9.4.md` (PASS — v0.9.3 → v0.9.4 CHANGES REQUIRED 修复闭环完成)
> **Target**: Codex 对 v0.9.5 做最终确认（无代码变更，验证 v0.9.4 PASS 结论未被推翻）

> **背景**: Codex v0.9.4 复审返回 **PASS / 28/28**。v0.9.5 无代码变更，
> 仅为文档收尾：SUPERSEDE v0.9.4 prompt 标记 + formalize review report。
> 若复审仍为 PASS，建议合并 codex/prd-v0.3-review 到 main。

---

## 主指令（可直接复制粘贴到 Codex）

```text
请按以下规则对 PRD-v0.9.5 做最终确认复审（无代码变更）:

【范围限定（强约束）】
- 只读 spec/ 与 spikes/m0/ 目录
- 不要读 RESPONSE-TO-CODEX-v0.9-*-REVIEW.md / ARCHITECT-REVIEW-PRD-*.md / notes/cursor-review-*.md（review 结论话术）
- 不要读 notes/v0.9-contemplations.md
- 复审只基于 spike 实际跑出的结果，不基于 PRD 承诺

【背景】
v0.9.4 已 PASS（28/28 反例 / 17/17 mutation / 13/13 spike / 12/12 schema / 10/10 conformance）。
v0.9.5 无代码变更。复审目标：验证 PASS 结论未被推翻。

【具体执行路径】
1. cd 到 fish-harness 项目根
2. 跑 schema 应用（应输出 13/14/27/27/39）:
   rm -f /tmp/harness-test.sqlite
   sqlite3 /tmp/harness-test.sqlite < spec/kernel-schema.sql
   sqlite3 /tmp/harness-test.sqlite "SELECT 'triggers=' || count(*) FROM sqlite_master WHERE type='trigger';"
   # 期望: triggers=27
3. 跑 13 spike:
   for f in spikes/m0/*.py; do
     [ "$(basename "$f")" = "__init__.py" ] && continue
     [ "$(basename "$f")" = "_helpers.py" ] && continue
     python3 "$f"
   done
   # 期望：13/13 exit 0
4. 跑 12 event schema 验证:
   for f in spec/events/*.json; do
     [ "$(basename "$f")" = ".gitkeep" ] && continue
     check-jsonschema --check-metaschema "$f"
   done
5. 跑 mutation-test.py:
   python3 spikes/m0/mutation-test.py
   # 期望：17 mutations all baseline PASS / DROP FAIL
6. 跑 conformance:
   python3 spikes/m0/conformance-second-impl.py | grep "10 Protocols"

【输出格式】
§1 结论（PASS / CHANGES REQUIRED，1 段）
§2 若发现任何 FAIL，列出具体文件:行号 + 可执行复现命令
§3 若全 PASS，确认 v0.9.4 PASS 结论未被推翻，建议合并 codex/prd-v0.3-review

【判断标准】
- PASS：无 FAIL，v0.9.4 PASS 结论维持
- CHANGES REQUIRED：发现新的可复现 FAIL

【如果你发现 PASS】
输出格式示例：
  §1 PASS
  §2 无 FAIL 发现
  §3 v0.9.4 复审结论维持。codex/prd-v0.3-review 可以合并到 main。
  v0.9.5 本次无代码变更，仅文档收尾。
```
