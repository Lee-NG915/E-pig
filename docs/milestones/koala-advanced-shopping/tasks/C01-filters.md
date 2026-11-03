# C01 — 高级筛选

更新日期：2026-11-03

- Milestone: koala-advanced-shopping
- Status: done
- Agent: Codex + independent Test AI / Review AI
- Domain: catalog
- Commit: `a8bd7cf25cdeddafc4794d97c567ae94ad032b18`
- 验收映射: contracts.md 的 C01 与 failure rules

## Summary

颜色多选、价格边界、可售按同一 variant AND 过滤，匹配规格成为展示与深链目标；过滤后排序与 limit，URL 异常不偷偷执行部分条件。

## Tests

query、adapter、ProductFilters、ProductList、collection metadata 共 5 specs / 61 tests 通过；浏览器表单提交、非法范围、清除保留排序、390px 测量通过。

最终执行的命令、数量与限制统一见 [validation.md](../validation.md)，此处切片数字不是全量测试总数。

## AI Test Record

- Behavior changed: 高级筛选。
- Tests added/updated: 就近 spec 与 companions；覆盖公开行为、失败与恢复。
- Tests run: 上述定向测试；最终全量检查见 validation.md。
- Result: PASS；最终完整记录见 validation.md。
- Failures or gaps: 本 task 的 catalog DTO/data 同时提供 C05 demo review fixture 与 C06 companion ID；它们不增加真实评价或库存声明。
- Next risk: 示例策略与真实业务服务之间仍需独立集成/验收。

## AI Review Record

- Review focus: 边界契约、状态恢复、当前市场数据、真实可观察断言。
- Findings: 已处理的问题统一记录于 retros/issues；最终复核见 validation.md。
- Residual risks: 本轮本地验证不等于远程发布或真实支付验收。
