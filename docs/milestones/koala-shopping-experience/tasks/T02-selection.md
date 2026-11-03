# T02 — PLP/PDP 选项连续性

更新日期：2026-11-03

- Milestone: koala-shopping-experience
- Status: done
- Agent: Codex + independent task agents
- Date: 2026-11-03
- Commit: e8010e093fff41e01009b9207bd19f0fa9fe0c29
- Acceptance: [冻结范围](../contracts.md)，对应 T02

## Summary

商品卡选色同步图、价与全部深链；PDP 恢复 query，拒绝无效/重复值，结构化选项与移动 CTA 共享同一规格及加购锁。补充真实 cart-store 的网络边界集成。

## AI Test Record

- Behavior changed: 商品卡选色同步图、价与全部深链；PDP 恢复 query，拒绝无效/重复值，结构化选项与移动 CTA 共享同一规格及加购锁。补充真实 cart-store 的网络边界集成。
- Tests added/updated: product-card.spec.tsx 12；product-detail.spec.tsx 9；cart-flow.spec.tsx 2；行为测试与实现同 patch。最终对比度/Story 修正属于纯样式/示例，不新增行为测试。
- Tests run: 相关 Vitest 红绿与回归；整合 typecheck → lint → 全量 Vitest --maxWorkers=2；详见 [验证记录](../validation.md)。
- Result: PASS（受限并发的完整检查项；默认 verify 命令的环境超时单列记录）。
- Failures or gaps: route query 由浏览器直达/刷新验收；暂无自动化浏览器 E2E。
- Next risk: route query 由浏览器直达/刷新验收；暂无自动化浏览器 E2E。

## AI Review Record

- Review focus: 需求、模块边界、可见状态、ID/金额一致、错误恢复与可访问性。
- Findings: 独立审查未留阻断缺陷；三处新增说明对比度与无效移动 Story 已修复。
- Residual risks: route query 由浏览器直达/刷新验收；暂无自动化浏览器 E2E。
