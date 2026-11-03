# ISSUE-001 — 未发送的套装请求被误判为结果未知

更新日期：2026-11-03

- 首次引入：C06 未提交实现，独立 Review 发现。
- 根因类：失败分类与测试缺口。
- 现象：单品请求丢失响应后，store 保留原请求；用户改点套装，store 在发送前拒绝不同 payload，普通 Error 却被套装 UI 当作“本套装已发送但未确认”，导致原单品入口被锁住。
- 修复：`CartMutationNotSentError` 明确表示本次未发送。套装释放本次选择锁，不保存套装重试，不删除原 pending/key；原单品可按原幂等键重试。
- 证据：`cart-flow.spec.tsx` 使用真实 PDP + store、仅 mock 网络；先丢失单品响应，验证套装不发送、原请求保留、单品可恢复、随后套装使用新 key。store 测试额外覆盖 add/addItems/coupon 冲突。
- 同轮 Review：成功提示现在绑定实际成功的商品与规格，主规格变更后不继续声称当前套装已加入；含 rerender 回归。
- 防再发：冻结契约补充“未发送”和“已发送但结果未知”两种状态，跨入口恢复纳入验收；不以单组件 mock 成功路径代替真实 store 集成。
- 修复提交：见本里程碑 `evidence/commits.json` 中 C04、C06。
