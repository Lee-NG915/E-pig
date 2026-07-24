# Kimi M2.1 T01–T03 Done Brief

- Branch: `feat/m2.1-home-plp`
- Final commit: `fbc5409`
- Date: 2026-07-19

## 完成范围

| Task | 关键交付 | Commit |
| --- | --- | --- |
| T01 | `ProductListItem.slug`、`ListProductsQuery.collection/sort`；mock adapter 过滤/排序实现；相关 spec fixture 补 `slug` | `ba9b652` |
| T02 | `/collections/[slug]` PLP 路由；`ProductList` 组件（md/spec/stories）含数据/空态/排序 | `6d7fd1d` |
| T03 | `ProductCard` 链向 `/products/[slug]`；Home 首个真实 collection 入口；`/products/[slug]` PDP stub | `fc8a378` |
| 交付记录 | `TASKS.md` 状态更新 + T01/T02/T03 task logs | `fbc5409` |

## 命令结果

```bash
pnpm test
# Test Files  22 passed (22)
# Tests       105 passed (105)

pnpm typecheck
# 通过（无输出）

pnpm lint
# 通过（无输出）

pnpm quality:companions
# [companions] PASS — checked 2 component(s)
```

## 架构合规

- `src/modules/**` 未直接 import `@/adapters/**` 或相对绕到 adapters；取数均经 `getCapabilities().catalog`。
- PLP/PDP 价格/列表走 `await connection()` request-time 边界，未进入 `'use cache'` 共享缓存。
- 新增 `ProductList` 走完整文件夹契约（tsx + md + spec + stories）。

## 残留风险

1. **PDP stub 极简**：`/products/[slug]` 只展示商品名与占位文案，完整 PDP 属 M2.2；stub 使用 `getProduct(slug)`，依赖 mock `slug === id`。
2. **排序为服务端 Link 刷新**：当前通过 `?sort=` URL 触发服务端重渲染，M2.3 搜索页若需无刷新体验需升级为 client 控件。
3. **Home collection 入口未单测**：链接来自 `listCollections()[0]` 的真实数据，行为简单；后续若加入复杂营销位需补 spec。
4. **Storybook runtime 未验证**：stories 文件已存在并通过 companions/typecheck，但未启动 `pnpm storybook:modules` 做视觉确认。

## 下一步

- Leader Review（T04）：跑 `pnpm verify` 并对照 PRD 验收 #1–#6。
