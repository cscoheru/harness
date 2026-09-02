# DISPATCH-T-M0c-DD-1 — CHANGELOG v1.1 + README v1.1 + v0.2 准备

> **Date**: 2026-09-02
> **Triggered by**: v1.1 GA plan v0.1 升级（user 「选 (a) v0.1 升级 GO」）
> **Source**: `docs/v1.1-ga-team-plan.md` §2.5（v0.1 升级后 T-M0c-DD-1 行）+ §6.2 M0c PR7
> **Status**: 任务书起草完成（等 user 「Start v1.1 M0c」启动实施）

---

## §1 任务定义

为 v1.1+ 周期写实 CHANGELOG `[1.1.0-M0c]` 段 + README v1.1 段（docusaurus 自述安装/启动）+ `docs/v1.1-ga-team-plan.md` v0.2 升级准备清单（M1 通过后 v0.2 升级）。

## §2 输入

- **M0b 总报告**：`docs/DISPATCH-T-M0b-DONE.md`（H-1/H-2/H-3 PASS + capability JSON 4 SKU + LOC 4800-8500 估算）
- **ADR 0010**：`adr/0010-v1.1-cycle-scope-admission.md`（v1.1 cycle scope admission Accepted）
- **M0c 5 任务 commit**：BE-1 / TG-1 / DO-1 / QA-1 实施后 commit
- **v1.0 GA plan**：`docs/v1.0-ga-team-plan.md`（CHANGELOG / README 格式参考）
- **v1.0 CHANGELOG**：`CHANGELOG.md`（v1.0.0 GA 段格式参考）
- **v1.0 README**：`README.md`（v1.0.0 GA 段格式参考）

## §3 产出

### 3.1 文件

- `CHANGELOG.md` 加 `[1.1.0-M0c]` 段（NEW 段，引用 M0b spike 数据 + ADR 0010）
- `README.md` v1.1 段（docusaurus 自述 — 安装 / 启动 / 验证 / 路线图）
- `docs/v1.1-ga-team-plan.md` v0.2 升级准备清单（M1 通过后启 v0.2；本任务仅准备清单）
- `notes/v1.1-m0c-release-notes.md`（NEW — M0c release notes 草稿）

### 3.2 关键约束

- ❌ 不写 v1.1.0 GA tag（M3 通过后由架构师打，不可逆）
- ❌ 不删 v1.0 CHANGELOG 段（v1.0 GA 不可改）
- ❌ 不改 v1.0 README（v1.0 frozen）
- ❌ 不改 v1.1 GA plan v0.1（M1 通过后 v0.2；本任务不升级）
- ✅ CHANGELOG 格式对齐 v1.0 GA 段（Keep a Changelog 1.1.0）
- ✅ README v1.1 段对齐 docusaurus 现有目录结构
- ✅ v0.2 升级准备清单含 M1 阶段任务 + Exit Gate 草稿
- ✅ 不锁型号守门
- ✅ 不硬编码 API key

## §4 验证命令

```bash
# 1. CHANGELOG format 检查（Keep a Changelog 1.1.0）
grep -E "^## \[1\.1\.0-M0c\]|^### (Added|Changed|Deprecated|Removed|Fixed|Security)" CHANGELOG.md
# 期望: ≥ 1 个 ## + ≥ 1 个 ###

# 2. README v1.1 段存在
grep -c "v1.1" README.md
# 期望: ≥ 5（多处 v1.1 引用）

# 3. v0.2 升级准备清单存在
grep -c "v0.2 升级准备\|v0.2 plan" docs/v1.1-ga-team-plan.md
# 期望: ≥ 1

# 4. v1.0 GA 段不动守门
git diff v1.0.0..HEAD -- CHANGELOG.md | head -20
# 期望: 仅 +[1.1.0-M0c] 段 + 不改 v1.0.0 段

# 5. README v1.0 段不动守门
git diff v1.0.0..HEAD -- README.md | head -20
# 期望: 仅 +v1.1 段 + 不改 v1.0 段

# 6. 不锁型号守门：详见 `notes/codex-audit-scope-v1.1-m0c-v0.1.md` §1（grep 范围不含 notes/，避免自伤）

# 7. 不硬编码 API key
grep -rE "sk-[a-z0-9]{32,}" CHANGELOG.md README.md notes/v1.1-m0c-release-notes.md
# 期望: 0 行（仅占位符 / 引用）
```

## §5 估时

- **2-3 天**（DD 工程师 1 人）
- 与 PRD-v1.1 §5 "M0c (2-3 周)" 对齐；本任务占总 M0c 时长 10-15%

## §6 报告模板（实施者填）

```markdown
## §6 实跑报告（实施者填）

- **Wall time**: Xd
- **CHANGELOG diff**: `CHANGELOG.md` +N/-M 行（+[1.1.0-M0c] 段）
- **README diff**: `README.md` +N/-M 行（+v1.1 段）
- **v0.2 plan 准备清单 diff**: `docs/v1.1-ga-team-plan.md` +N/-M 行
- **Release notes 草稿**: `notes/v1.1-m0c-release-notes.md`（NEW）
- **CHANGELOG format**: Keep a Changelog 1.1.0 PASS
- **README format**: docusaurus PASS
- **v1.0 GA 段不动**: PASS
- **不锁型号 grep**: 0 行
- **不硬编码 key grep**: 0 行
- **v0.2 升级准备清单**: 含 M1 阶段任务 + Exit Gate 草稿
```

## §7 cross-ref

- `docs/v1.1-ga-team-plan.md` §2.5 T-M0c-DD-1 行（v0.1 升级后）+ §6.2 M0c PR7 + §10.2 v0.1 → v1.0 升级门槛（M3 通过后 v1.1.0 GA tag 准备）
- `docs/DISPATCH-T-M0b-DD-1.md`（M0b DD — M0b 总报告 + ADR 0010）
- `docs/DISPATCH-T-M0b-DONE.md` §5 ADR 0010 cross-ref
- `adr/0010-v1.1-cycle-scope-admission.md`（v1.1 cycle scope admission Accepted）
- `CHANGELOG.md`（v1.0.0 GA 段格式参考）
- `README.md`（v1.0.0 GA 段格式参考）
- `docs/v1.0-ga-team-plan.md`（CHANGELOG / README 格式参考）
- v1.0.0 GA tag `ab8749a`（immutable）

## §8 禁止

- ❌ 不写 v1.1.0 GA tag（M3 通过后由架构师打，不可逆）
- ❌ 不删 v1.0 CHANGELOG 段（v1.0 GA 不可改）
- ❌ 不改 v1.0 README（v1.0 frozen）
- ❌ 不改 v1.1 GA plan v0.1（M1 通过后 v0.2；本任务仅准备清单）
- ❌ 不锁具体型号（NORTH-STAR A-4）
- ❌ 不硬编码 API key

---

*任务书 ready for Cursor 审阅 — 等 user 「Start v1.1 M0c」启动实施*