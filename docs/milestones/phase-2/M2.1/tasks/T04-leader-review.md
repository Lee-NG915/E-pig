# T04 — Leader Review + Claude Dual-AI + 修复合入

- Milestone: M2.1
- Status: done
- Agent: claude (review) + cursor (fix)
- Date: 2026-07-19
- Commit: 0792954
- PRD 验收映射: #1–#7

## Summary

Claude Review 结论 `REQUEST_CHANGES`，已修复：

1. PLP/PDP 双挂载 CartSheet → 统一 `CartSheetMount`（溯源 ISSUE-001）
2. 空集合不可达 → mock 增加 `coming-soon`；contracts 同步
3. 路由相关逻辑可测 → `plp-query` + spec；Home 入口用 `pickHomeCollectionLink`
4. Header Shop/Rooms 链到真实 collection（非无效 `#collection`）
5. `page-workflow-guide` 增加 Cart chrome 单挂载规则

## Tests

- Commands: `pnpm verify`
- Result: PASS（含 105+ 主仓测试与 harness-evals）
- Notes: Storybook 视觉未跑（与 Kimi residual 一致，非关门阻塞）

## AI Test Record

- Behavior changed: Cart chrome 单挂载；空集合 URL；sort 解析；header 导航
- Tests added/updated: `plp-query.spec.ts`；mock `coming-soon` 断言
- Tests run: `pnpm verify`
- Result: PASS
- Failures or gaps: 无 Playwright；PDP 仍 stub（M2.2）
- Next risk: `getProduct(slug)` 依赖 mock slug===id，M2.2 需正式 getBySlug

## AI Review Record

- Review focus: M2.1 验收、契约、边界、缓存、路由测试
- Findings: 见 Claude 输出（双 CartSheet / 空态不可达 / 缺路由级测试）→ 本 task 已修
- Residual risks: PDP stub；无 E2E；Storybook 未目视
- Verdict after fix: APPROVE_WITH_NITS

## Follow-ups

- M2.2：完整 PDP + variant；`getProduct` by slug 正式化
- 可选：人手动 phase-review 评 M2.1
