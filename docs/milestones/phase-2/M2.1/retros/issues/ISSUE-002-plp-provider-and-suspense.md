# ISSUE-002 — PLP 卡在 skeleton：缺 CartMarketProvider + params 在 Suspense 外

- Date: 2026-07-19
- Found in: 本地 `pnpm dev` 访问 `/collections/sofas`（用户反馈）
- First introduced: T04 `0792954`（修 ISSUE-001 双 CartSheet 时引入）

## 现象

PLP 长期显示 ProductListSkeleton；终端报：

1. `useCartMarket must be used inside CartMarketProvider`（ProductCard）
2. `params` / `searchParams` accessed outside `<Suspense>`（blocking-route）

**不是**缺少 mock 数据。

## 根因类

实现偏移（修双 Sheet 时把列表岛的 `CartMarketProvider` 一并删掉）+ 契约缺口（params 必须在 Suspense 内 await 未写入验收/测试）

## 修复

- 列表岛恢复 `CartMarketProvider`（仍只由 MarketChrome 挂一次 CartSheet）
- `params`/`searchParams` 传入 Suspense 内子树再 await；页面根改为同步组件
- PDP stub 同步修 params 边界
- `page-workflow-guide` 补充 Cart market / params 两行

## 防再发

- page brief：区分「CartSheet 单挂载」与「CartMarketProvider 可多岛」
- 后续可对 PLP 加一条冒烟（dev/runtime）或组件级断言「有数据时不渲染 empty/skeleton 文案」——本修复优先行为正确
