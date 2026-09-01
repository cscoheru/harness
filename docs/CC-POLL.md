# CC 轮询（5 min）— 仅 commit/push 后

1. 交付一枪 → 更新 NOW ✅ → 写 `docs/poll/cc-ready.json` → **commit + push**
2. 然后循环：`git pull`；有 `docs/REVIEW-T-<本枪>.md` 则读；PASS 则读 `docs/DISPATCH-T-<下一枪>.md` 执行；FAIL 则修完重推；无 REVIEW 则等 5 分钟
3. **未 commit/push → 不要轮询**

协议全文：`docs/POLL-PROTOCOL.md`
