# 审验签发 — T-DO-3 + T-DO-4（合并大任务）

> **给 CC**：只读本文件。做完 Phase A+B 再 NOW/`cc-ready`/commit/push。  
> **上一枪**：`docs/REVIEW-T-DO-2.md` = **PASS**。  
> 未读完禁止改代码。硬起步：`.cursor/rules/00-now.mdc` → `docs/NOW.md` → 本文件。

---

## 范围（两相，一次交付）

| Phase | ID | 产出 | 估时 |
|-------|-----|------|------|
| **A** | **T-DO-3** | `.dockerignore` | 0.5d |
| **B** | **T-DO-4** | `.github/workflows/deploy.yml`（骨架可跑） | 1.5d |

**不做**：T-DO-5（codex-review）；T-QA-1 全文 mutation lift（B 用 spike smoke **临时代替** mutation gate，并在 workflow 注释标明依赖 T-QA-1）。

---

## Phase A — T-DO-3 `.dockerignore`

### 必须排除（GA plan §2）

```
.git/
.github/
.cursor/
.serena/
adr/
notes/
docs/
spikes/
tests/
__pycache__/
*.pyc
.pytest_cache/
PRD*.md
ARCHITECT*.md
RESPONSE*.md
*.sqlite
uploads/
```

**保留在 context**：`Dockerfile`、`pyproject.toml`、`README.md`、`harness/`、`spec/`（T-DO-2 运行时需要）。

### 验收 A

```bash
docker build -t fish-harness:1.0.0a0 . 2>&1 | tee /tmp/build.log
# build context 不应再把 spikes/ adr/ notes/ .git 打进上传（看 "transferring context" 体积明显下降）
docker run --rm fish-harness:1.0.0a0 python -c "import harness,sqlite3; print(harness.__version__, sqlite3.sqlite_version)"
# 仍须 sqlite>=3.47；gateway/runtime import 仍绿
```

顺手（推荐）：`docs/v1.0-ga-team-plan.md` §2 T-DO-1 行加一句脚注 → base=`python:3.14-alpine`（或 3.12-alpine），sqlite≥3.47；指 `ADJUDICATION-sqlite-raise-T-DO-2.md`。

---

## Phase B — T-DO-4 `deploy.yml`

### 产出

`.github/workflows/deploy.yml`：

- **trigger**：`push` tags `v*`；另加 `workflow_dispatch` 便于 dry-run  
- **jobs（最小）**：
  1. `build`：checkout → `docker build -t ghcr.io/<owner>/fish-harness:${{ github.ref_name }} .`  
  2. `push`（需 `packages: write`）：login GHCR → push（无 token 时 job 可 `if: github.event_name != 'pull_request'` 或 document skip）  
  3. `smoke`：**interim** 跑容器内 spike 子集（与 compose test-runner 同 5 条），**不要**调用尚未存在的 `harness.testing.mutation_suite`  
     - 注释：`# TODO T-QA-1: replace spike smoke with mutation_suite 17/17`

模板可参考现有 `.github/workflows/m0-contract-tests.yml`（actions/checkout@v4 等）。

### 验收 B

```bash
# YAML 合法
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"  # 若无 PyYAML：用 actionlint 或手工审
# 本地 dry：至少 build job 对应命令可手动跑通
docker build -t fish-harness:1.0.0a0 .
# 文档：README 或 workflow 头注释写清 tag 触发与 GHCR 名
```

**不要求**本枪真实打 `v1.0.0a0` 推 GHCR（可无 token）；workflow 文件存在 + 步骤语义正确即可。真 push 留用户/CI。

### CI sqlite 注意（P1，本枪能修则修）

`m0-contract-tests.yml` 的 `apt-get install sqlite3` 可能 &lt;3.47。若你改得到：smoke/schema job 改为 **用本仓库镜像** `docker build` 后 `docker run … sqlite3`/`python` 灌 schema；或注明 follow-up。非硬挡 Phase B。

---

## 总验收（A+B 全过）

```bash
test -f .dockerignore
docker build -t fish-harness:1.0.0a0 .
docker run --rm fish-harness:1.0.0a0 python -c \
  "from harness.runtime import SqliteWorkerPool; from harness.gateway import RealArtifactStore; import sqlite3; assert tuple(map(int,sqlite3.sqlite_version.split('.')))>=(3,47,0); print('ok')"
test -f .github/workflows/deploy.yml
# 可选：等价 test-runner 5 spike 仍绿
```

---

## 完成后

1. `docs/NOW.md`：T-DO-3 ✅、T-DO-4 ✅（或 T-DO-4 partial + 注明 smoke=spike interim）；§4 → **T-DO-5** 或 **T-QA-1**（建议下一枪 **T-QA-1**，因 deploy mutation 依赖）  
2. 写 `docs/poll/cc-ready.json`（填真实 `commit` sha）→ **commit + push**  
3. 更新 `docs/HANDOFF-TO-CURSOR.md`  
4. 停；等 Cursor REVIEW（`docs/REVIEW-T-DO-3.md` 将覆盖本合并包）

---

## 禁止

- 不 Start v1.1 / 不写 TS / dsh  
- 不删 `_helpers.py`；不改 schema 动态 RAISE  
- 不把 SQLite 放 NFS  
- 不把 T-DO-5 / 真 Codex 塞进本包  
- 不 commit 密钥；不 force push
