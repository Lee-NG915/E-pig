# C06 — 原子套装与 PDP 集成

更新日期：2026-11-03

- Milestone: koala-advanced-shopping
- Status: done
- Agent: Codex + independent Test AI / Review AI
- Domain: catalog / cart
- Commit: `d83853449915e3b18e329c6f5219cc50d3dadab6`
- 验收映射: contracts.md 的 C06 与 failure rules

## Summary

Bangalow Sofa + Ottoman 两项各一件，显示单价与合计。一次 addItems 事务整组校验与回滚，pending 冻结，未知结果相同 key/payload 重试。PDP 挂载配送、比较、评价与套装。

## Tests

真实 Postgres + store/API 回归、Bundle + PDP 行为、跨入口真实 store 旅程通过；浏览器一次成功 POST 得到两条正确规格并读回 2350 小计。

最终执行的命令、数量与限制统一见 [validation.md](../validation.md)，此处切片数字不是全量测试总数。

## AI Test Record

- Behavior changed: 原子套装与 PDP 集成。
- Tests added/updated: 就近 spec 与 companions；覆盖公开行为、失败与恢复。
- Tests run: 上述定向测试；最终全量检查见 validation.md。
- Result: PASS；最终完整记录见 validation.md。
- Failures or gaps: Review 修复跨入口未发送冲突与旧成功提示；见 ISSUE-001。套装无额外捆绑折扣。
- Next risk: 示例策略与真实业务服务之间仍需独立集成/验收。

## AI Review Record

- Review focus: 边界契约、状态恢复、当前市场数据、真实可观察断言。
- Findings: 已处理的问题统一记录于 retros/issues；最终复核见 validation.md。
- Residual risks: 本轮本地验证不等于远程发布或真实支付验收。
