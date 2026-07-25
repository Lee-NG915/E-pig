# T07 — PLP Breadcrumb / SEO / 布局

更新日期：2026-07-25  
Status: done  
Owner: cursor

## 交付

- `PlpBreadcrumb` + `ProductList` 集成
- `PlpSortNav`：`sort`↔URL + `plp_sort_change`（单次）
- 相关集合链接（`pickRelatedCollections`，content 域）
- `generateMetadata`：canonical；带 `?sort=` → `noIndex`
- CollectionPage JSON-LD；空态 / `notFound` + 全局 `not-found.tsx`

## 测试

`pnpm test src/modules/catalog/components/product-list src/modules/catalog/components/plp-breadcrumb src/modules/content/lib/related-collections src/platform/seo`
