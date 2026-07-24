# T02 — PLP 页 `/collections/[slug]` + 列表/空态/排序 + 组件 companions

- Milestone: M2.1
- Status: done
- Agent: kimi
- Date: 2026-07-19
- Commit: 6d7fd1d
- PRD 验收映射: #1, #2, #4, #5, #6, #7

## Summary
落地 PLP 路由与列表组件：

- 新增 `src/app/collections/[slug]/page.tsx`：async params/searchParams、`await connection()` request-time 边界、`getCapabilities().catalog` 取数；非法 collection 走 `notFound()`。
- 新增 `src/modules/catalog/components/product-list/` 文件夹契约组件：
  - `product-list.tsx`：集合标题/件数、排序链接（URL `?sort=`）、空集合空态、复用 `ProductCard`。
  - `product-list.spec.tsx`：覆盖有数据态、空态、排序链接与高亮态。
  - `product-list.stories.tsx`：Default / SortedByName / Empty 三态。
  - `product-list.md`：职责、用户故事、状态矩阵。
- 排序采用服务端 Link 方案，避免客户端路由依赖，保证 Storybook（已有 `next/link` mock）与测试稳定。
- 页面通过 `CartMarketProvider` 包裹列表与购物车抽屉，满足 `ProductCard` 和 `SiteHeader` 的 market context 需求。

## Tests

- Commands:
  - `pnpm test src/modules/catalog/components/product-list/product-list.spec.tsx`
  - `pnpm test`（全量）
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm quality:companions`
- Result: PASS
- Notes: `quality:companions` 报告 checked 2 component(s) 通过，无新增 companion 缺失。

## AI Test Record

- Behavior changed: 新增 `/collections/[slug]` PLP 路由；新增 `ProductList` 组件负责集合列表、排序入口、空态；复用 `ProductCard` 展示单品。
- Tests added/updated:
  - `src/modules/catalog/components/product-list/product-list.spec.tsx`：有数据态、空态、排序链接 href 与 `aria-current` 高亮。
- Tests run: `pnpm test`（全量 105 测例） + `pnpm typecheck` + `pnpm lint` + `pnpm quality:companions`
- Result: PASS
- Failures or gaps: 无。
- Next risk: 当前排序为服务端 Link 刷新；M2.3 搜索页若需无刷新排序可升级为 client select + `router.push`。

## Follow-ups
- T03 将为 `ProductCard` 增加 PDP 链接，并在 Home 增加进入 PLP 的入口。
