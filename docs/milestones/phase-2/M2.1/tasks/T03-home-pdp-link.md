# T03 — Home 入口到 PLP；product-card 链向 `/products/[slug]`；PDP stub

- Milestone: M2.1
- Status: done
- Agent: kimi
- Date: 2026-07-19
- Commit: fc8a378
- PRD 验收映射: #2, #3, #6, #7

## Summary
完成 Home 到 PLP 的导航链与 PDP 占位：

- `ProductCard`：图片与标题均链向 `/products/<slug>`，加购按钮保持独立可点；同步更新 `.md` 状态矩阵与 `.spec.tsx` 回归断言。
- Home 页 `MarketProductGrid`：并发的 `listCollections()` 取首个真实 collection，渲染 "Shop {title}" 链接至 `/collections/{handle}`。
- PDP stub `src/app/products/[slug]/page.tsx`：request-time 边界、`getProduct(slug)` 取数、商品未找到时 `notFound()`；页面展示商品名并标明 "Full product details ... coming in M2.2"；保留站点 header/footer 与购物车抽屉。

## Tests

- Commands:
  - `pnpm test src/modules/catalog/components/product-card/product-card.spec.tsx`
  - `pnpm test`（全量）
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm quality:companions`
- Result: PASS
- Notes: 全量 105 测例通过；companions 检查无新增缺失。

## AI Test Record

- Behavior changed: `ProductCard` 增加 PDP 链；Home 商品栅格增加真实 collection 入口；新增 `/products/[slug]` PDP stub。
- Tests added/updated:
  - `src/modules/catalog/components/product-card/product-card.spec.tsx`：新增 "图片与标题均链向 /products/<slug>" 回归测试；fixture 已含 `slug`。
  - `src/modules/catalog/components/product-card/product-card.md`：状态矩阵增加 "可进入 PDP"。
- Tests run: `pnpm test`（全量 105 测例） + `pnpm typecheck` + `pnpm lint` + `pnpm quality:companions`
- Result: PASS
- Failures or gaps: Home collection 链接未单独写 `.spec.tsx`；该链接为 server component 内简单 `Link`，行为由 `ProductCard` 与 PLP 测试覆盖，剩余风险低。
- Next risk: PDP stub 仅展示名称；完整 PDP（gallery、variant、加购）属 M2.2，需重新评估是否引入真实库存/variant 契约。

## Follow-ups
- M2.2 将替换 PDP stub 为完整商品详情页。
