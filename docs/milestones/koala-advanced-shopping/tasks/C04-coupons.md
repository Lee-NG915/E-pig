# C04 — 优惠与服务端金额

更新日期：2026-11-03

- Milestone: koala-advanced-shopping
- Status: done
- Agent: Codex + independent Test AI / Review AI
- Domain: cart / checkout / order
- Commit: see ../evidence/commits.json (C04)
- 验收映射: contracts.md 的 C04 与 failure rules

## Summary

AU DEMO10 按分计算 10% 折扣，空码移除，无效/过期码不覆盖旧优惠。最终金额贯通 checkout/payment request/order，兼容旧快照、支付成功清优惠、取消后重新计算。

## Tests

Postgres 27 tests，交易相关 10 specs / 100 tests 切片通过，另含半分 12.35 → 1.24 → 11.11 回归；真实浏览器 2350 → 2115 并在 checkout 读回。

最终执行的命令、数量与限制统一见 [validation.md](../validation.md)，此处切片数字不是全量测试总数。

## AI Test Record

- Behavior changed: 优惠与服务端金额。
- Tests added/updated: 就近 spec 与 companions；覆盖公开行为、失败与恢复。
- Tests run: 上述定向测试；最终全量检查见 validation.md。
- Result: PASS；最终完整记录见 validation.md。
- Failures or gaps: 共享 CartPort/API/store 同时落地 C06 atomic addItems 基础；未执行新的 Stripe 托管支付。
- Next risk: 示例策略与真实业务服务之间仍需独立集成/验收。

## AI Review Record

- Review focus: 边界契约、状态恢复、当前市场数据、真实可观察断言。
- Findings: 已处理的问题统一记录于 retros/issues；最终复核见 validation.md。
- Residual risks: 本轮本地验证不等于远程发布或真实支付验收。
