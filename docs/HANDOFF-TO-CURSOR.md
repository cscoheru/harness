# HANDOFF — Cursor 接棒上下文

> **规则 / 禁止不写在这里**——Cursor 必须先读 `.cursor/rules/00-now.mdc` + `docs/NOW.md`（硬起步）。
> 本文件只放**不可从那两个文件推导的信息**：本会话做了什么 / 待审什么 / 下一枪是什么。
> 每次 T-N 完成就覆盖本文件三栏；规则部分保持稳定。

---

## 做了什么

| ID | 状态 | 关键交付 |
|----|------|----------|
| T-BE-5…T-TG-4 | ✅ | 见 NOW.md §2 |
| **T-TG-5** | ✅ done 2026-08-31 | `harness/testing/{__init__,echo_server}.py` — `InProcessEgressServer`（127.0.0.1 hardcoded + ephemeral port + context manager） |
| **T-TG-5 审验** | ✅ 2026-08-31 | `python3 -m harness.testing.echo_server` 5-phase smoke 全过（import / GET-POST 200 / post-exit ConnectError / 连 re-bind 端口不撞 / host==127.0.0.1）；import OK；egress 8/8 + conformance 10/10 无回归；`pip install -e .` OK |

## 需要审验（当前 untracked）

| 文件 | 类型 | 审什么 |
|------|------|--------|
| `harness/testing/__init__.py` | new | export `InProcessEgressServer` |
| `harness/testing/echo_server.py` | new | host hardcoded `127.0.0.1`；port=0 ephemeral；`__exit__` shutdown+server_close+join(2.0)；daemon thread；`__main__` 5-phase smoke |

P1（不挡 T-DO-1）：
1. `python3 -m harness.testing.echo_server` 启动时 `RuntimeWarning`（模块被 `__init__` 预导入 → runpy 重复发现；无害）
2. 仅 `/echo` 端点；`/status` / `/redirect` 留给 T-QA-2 integration tests
3. 无并发上限（每次 `with` 起 1 thread + 1 socket）；T-QA-5 stress_test 验证
4. TG 角色 5 任务全部 done

## 下一步做什么（**T-DO-1**，下一枪；DO 角色首发，建议 Dockerfile）

见用户消息中的 CC 合并任务包。
