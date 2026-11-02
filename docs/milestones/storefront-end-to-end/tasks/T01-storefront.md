# T01 — 商品、搜索与站点导航

更新日期：2026-11-02

状态：local implementation verified; integrated quality/review/browser acceptance pending

Catalog owns controlled variants, product cards/detail and keyword search. Content owns site chrome, Blog summaries and six sandbox help topics. Existing market registry, page shell and cream/moss tokens remain the basis.

- All 87 unique existing catalog products have an explicit default sandbox SKU in AU/SG/US. There are 89 variants per market: Bangalow Modular Sofa includes a clearly labeled second test option and an unavailable test option. IDs/SKUs are unique; each market uses its own currency; per-line sandbox maximum is 5. This is controlled sellability, not physical inventory or stock reservation.
- PDP selects an actual server variant, updates its image/price/availability, submits identifiers and quantity only, rejects duplicate pending submissions and preserves selection on error. Missing ratings are hidden; a single source image does not become fabricated alternate views. Dead wishlist/basket/preview actions are removed.
- Quick add appears only for a known single variant. Multiple/unknown variants link to PDP option selection. Existing list ordering and price display remain.
- Search GET URL retains trimmed keyword, caps it at 100 characters, reads the catalog at request time, skips blank queries and renders blank/no-result/error states. Search and help routes validate active markets. Header exposes Search and same-browser Orders; footer destinations are real market links.
- Help explains sandbox payment, delivery/returns, privacy/cookie limitations, terms and contact without real fulfillment or fabricated contact promises. Homepage copy drops trial/shipping/material-performance guarantees. Blog summaries use shared tokens and remove unavailable detail/comment affordances. New/changed component docs and stories accompany behavior.

## AI Test Record

- Behavior changed: catalog variant mapping, search, PDP/quick-add interaction, site navigation and sandbox content boundaries as above.
- Tests added/updated: catalog all-product × all-market variant matrix; PDP option/price/image/server-ID/pending/error tests; quick-add/multiple-variant/error tests; search blank/empty/error GET form; help supported destinations; header/footer market navigation; existing Blog/list/benefit tests updated.
- Tests run: RED `corepack pnpm test src/adapters/commerce/mock/catalog.spec.ts` (1 new variant test failed); RED `corepack pnpm test src/modules/catalog/components/product-detail/product-detail.spec.tsx` (4 regression tests failed); GREEN `corepack pnpm test src/adapters/commerce/mock/catalog.spec.ts src/modules/catalog src/modules/content` (18 files / 58 tests passed); GREEN `corepack pnpm exec eslint src/core/contracts/commerce/catalog.ts src/adapters/commerce/mock/catalog.ts src/adapters/commerce/mock/catalog.spec.ts src/modules/catalog src/modules/content 'src/app/[market]/search/page.tsx' 'src/app/[market]/help/[slug]/page.tsx'`; `node scripts/quality/check-component-companions.mjs` (own missing required headings corrected; parallel cart-panel companion warning belongs to T03).
- Result: PASS (scoped local tests/lint); PARTIAL (integrated checks and user acceptance pending).
- Failures or gaps: global typecheck/lint/test/build intentionally coordinated by parent after parallel changes settle; no browser, hosted Stripe, deployment or real-user acceptance evidence from this task.
- Next risk: integrated cart HTTP behavior, deployed routing and narrow-screen appearance require the T03/T04 checks. No independent T01 review claimed yet; parent coordinates whole-branch review.

## Integrated compatibility follow-up

- The later CartMarketProvider query-client mount exposed incomplete hook mocks: the ProductCard/ProductDetail regression run reproduced 12 failures due to missing `getStorefrontQueryClient`. The four affected T01 suites now preserve real module exports with `importOriginal` and override only their test boundary hooks.
- SiteHeader stories now seed typed server-cart query data with an infinite story stale time. Removed demo addItem/setQuantity/DemoCartProduct imports are gone; story rendering performs no cart mutation or local-price write.
- Re-ran `corepack pnpm exec eslint src/modules/catalog src/modules/content/components/site-header` (PASS) and `corepack pnpm test src/adapters/commerce/mock/catalog.spec.ts src/modules/catalog src/modules/content` (18 files / 58 tests PASS). Global typecheck remains with parent; no standalone typecheck result claimed.
