# T01 — Catalog 契约：`slug` / `collection` / `sort` + mock adapter 测试

- Milestone: M2.1
- Status: done
- Agent: kimi
- Date: 2026-07-19
- Commit: ba9b652
- PRD 验收映射: #4, #6, #7

## Summary
按冻结契约扩展 Listing DTO：

- `ProductListItem` 新增 `slug` 字段（mock 阶段 `slug === id`）。
- `ListProductsQuery` 新增 `collection`（按 `Collection.handle` 过滤）与 `sort`（`price-asc` / `price-desc` / `name`）。
- mock adapter 中统一用 `categoryToHandle` 建立 category ↔ handle 映射，实现 `collection` 过滤与三种排序。
- 同步更新 `catalog.spec.ts`、`product-card.spec.tsx`、`product-card.stories.tsx`、`cart-flow.spec.tsx` 等所有构造 `ProductListItem` 的地方，补全 `slug`。

## Tests

- Commands:
  - `pnpm test src/adapters/commerce/mock/catalog.spec.ts src/modules/catalog/components/product-card/product-card.spec.tsx`
  - `pnpm typecheck`
  - `pnpm lint`
- Result: PASS
- Notes: mock adapter 新增 collection / sort 回归测试；所有消费 `ProductListItem` 的 spec 已补 `slug`。

## AI Test Record

- Behavior changed: `ProductListItem` 增加 `slug`；`ListProductsQuery` 增加 `collection` 与 `sort`；mock adapter 支持按 collection handle 过滤与三种排序。
- Tests added/updated:
  - `src/adapters/commerce/mock/catalog.spec.ts`：新增 slug 断言、collection 过滤测试、sort 排序测试。
  - `src/modules/catalog/components/product-card/product-card.spec.tsx`：测试 fixture 增加 `slug`。
  - `src/modules/catalog/components/product-card/product-card.stories.tsx`：story fixture 增加 `slug`。
  - `src/modules/cart/components/cart-flow.spec.tsx`：cart flow fixture 增加 `slug`。
- Tests run: `pnpm test` 相关 spec + `pnpm typecheck` + `pnpm lint`
- Result: PASS
- Failures or gaps: 无。
- Next risk: 接入真实后端时 `slug` 可能由 adapter 从 `handle` 映射，而非简单等于 `id`；契约不变。

## Follow-ups
- T02 将复用本契约落地 PLP 路由与 `ProductList` 组件。
