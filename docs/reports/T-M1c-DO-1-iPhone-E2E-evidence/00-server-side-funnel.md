# iPhone Safari E2E 证据 — server-side Funnel 启用（2026-09-02）

> 本文件由 Claude Code 自动归档（user 授权「你来执行1-2-3」）。

## §1 commit + push
- Commit: `3a3157f` (13 files +1054/-166)
- Push: `dc4bc33..3a3157f main -> main` via Clash proxy

## §2 newvps Funnel 启用
- 节点: `harness-newvps` (100.103.132.72)
- 容器: `harness-wrapper` 0.0.0.0:4000 → 4000/tcp
- Funnel URL: `https://harness-newvps.tail1b9878.ts.net/`
- Funnel status: `https://harness-newvps.tail1b9878.ts.net (Funnel on) |-- / proxy http://127.0.0.1:4000`

## §3 macOS 外部 curl 验证
- HTTP/2 200, content-type text/plain
- Body: `fish-harness wrapper placeholder\nWRAPPER_PORT=4000\nDSH_PROFILE=headless\nWORKER_ID=fishBOT`
- TTFB 582ms / Total 583ms / Size 105B

## §4 iPhone Safari E2E 4 步（待 user 实测）
1. 打开 https://harness-newvps.tail1b9878.ts.net/ → 期望 wrapper placeholder
2. 表单提交（如 wrapper 提供）/api/echo POST → 期望 echo 响应
3. 24h 完成（异步任务，可选）/ 跳过（wrapper 无异步任务）
4. 完成态可见（任务列表，如适用）

> iPhone 端截图 + 网络请求证据待 user 截屏后归档到本目录。
