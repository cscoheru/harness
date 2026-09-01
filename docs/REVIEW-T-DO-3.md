# REVIEW — T-DO-3 + T-DO-4（合并包）

> **Verdict**: **PASS**（带 P0：deploy `smoke` job 跨 runner 取镜像会挂）  
> **Date**: 2026-08-31  
> **Commits**: `52d272a` + poll stamp `3536fed`  
> **cc-ready**: task `T-DO-3+T-DO-4`, commit `52d272a`

---

## Phase A — T-DO-3 `.dockerignore`

| 检查 | 结果 |
|------|------|
| 文件存在；排除 git/github/cursor/spikes/docs/adr/notes/PRD* 等 | PASS |
| **保留** `harness/` + `spec/`（未误 ignore） | PASS |
| `docker build -t fish-harness:1.0.0a0 .` | PASS（cache HIT，image `945685d5f836`） |
| 容器 import + sqlite≥3.47 (`3.53.2`) | PASS |
| 声称 context ~457kB / 大幅缩小 | 采信（与 ignore 列表一致）；未重测 transfer 日志 |

## Phase B — T-DO-4 `deploy.yml`

| 检查 | 结果 |
|------|------|
| 文件存在；jobs = build / push / smoke | PASS |
| trigger = `push.tags v*` + `workflow_dispatch` | PASS（GHA 语义） |
| push 门控 `if: push && tags/v` | PASS |
| smoke = 5-spike interim + TODO T-QA-1 | PASS（合同允许 interim） |
| 真 GHCR push | 未做（合同允许） |

### P0 — 必须在下一枪修

`smoke` 是 **独立 job**（新 runner），只 `needs: build`，但 `build` 仅 `load: true` 进 **build runner** 的本地 daemon。  
**smoke runner 上没有该镜像** → `docker run $IMAGE` 在 Actions 上会失败。

修法（下一单 Phase 0，任选其一）：
1. 把 smoke **并入 build job** 同 runner；或  
2. `smoke` `needs: [build, push]`，从 GHCR `docker pull` 后再跑（dry-run/dispatch 无 push 时改 `needs: build` + 本 job 内 rebuild）；或  
3. smoke job 自己 `docker build` 再跑 spike。

### P1

- PyYAML 把键 `on` 解析成 `True`（YAML 1.1）；不影响 GHA，文档/校验脚本需 `yaml.safe_load(..., Loader=…)` 或改 `"on":`。  
- T-DO-4 对 mutation 仍为 interim（依赖 T-QA-1）— 已标明。  
- 工作区仍有大量早期 `harness/**` untracked（非本包回归）。

---

## 下一单

已签发：[`docs/DISPATCH-T-QA-1.md`](DISPATCH-T-QA-1.md)  
（含 **Phase 0：修 deploy smoke runner** + **Phase A：mutation_suite lift**）
