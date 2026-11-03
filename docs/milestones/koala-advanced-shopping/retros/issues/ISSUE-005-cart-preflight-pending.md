# ISSUE-005 — Failed cart preflight incorrectly left a pending write

更新日期：2026-11-03

- Trigger: user asked why `Your previous bag update is unconfirmed. Retry that update before making another change.` appears.
- Evidence boundary: source and regression tests confirm the false-pending path below. The user's own pending record and original failed response were not accessible; this is not a confirmed diagnosis of that individual request. A read-only local cart API request returned 200 in an isolated test context.
- Source history: `419990e58591cf71f1817ff7188682b040e93e76` introduced the cart refresh/recovery flow; C04/C06 later reused it.
- Root cause: implementation and test gap. The client saved a fresh mutation/key before its preflight GET. A failed GET therefore left a pending mutation although no POST had been sent; a different next action was rejected as a pending conflict.
- Repair: under the same Web Lock, resolve the intended input, read the current cart, then persist the fresh request immediately before POST. Existing pending inputs/keys survive a failed retry preflight. A failed storage write still prevents POST.
- Prevention: contracts.md explicitly separates failed reads from ambiguous writes. Six new regressions protect fresh network/503 failures, persistence timing, storage failure, and original-pending preservation during network/503 retry failures.
- User recovery: open the bag and use Retry last update. It replays the original payload and idempotency key. Refresh bag only reads state and does not resolve a pending write. No automatic deletion of existing recovery records is performed.
