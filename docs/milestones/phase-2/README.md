# Phase 2 — 浏览与加购（子里程碑总览）

更新日期：2026-07-18

状态：proposal

## 1. Phase 目标

在 Phase 1 Home demo 与 mock Catalog/Cart 之上，复现参考工程 **浏览 → 详情 → 搜索 → 服务端购物车** 的核心顾客路径（对应参考工程 `product` / `search` / `cart` 与 Web 的 PLP/PDP/search/cart 路由），并补齐 Cache Components 与 SEO/图片的生产级基线。

总验收（06 §1 Phase 2，拆分后仍作为 Phase 关门条件）：

- mock catalog 完成浏览 → 加购
- 刷新后 cart 恢复（server cart + cookie）
- 无客户端 hydration warning

## 2. 子里程碑

| ID | 名称 | PRD | 主要能力 ID |
| --- | --- | --- | --- |
| M2.1 | Home 升级 + PLP | [M2.1-home-plp.md](./M2.1-home-plp.md) | P2-C1, P2-C2 |
| M2.2 | PDP + Variant | [M2.2-pdp-variants.md](./M2.2-pdp-variants.md) | P2-C3, P2-C4 |
| M2.3 | 搜索 | [M2.3-search.md](./M2.3-search.md) | P2-C5 |
| M2.4 | Server Cart | [M2.4-server-cart.md](./M2.4-server-cart.md) | P2-C6, P2-C7, P2-C11（cart） |
| M2.5 | Cache / SEO / 媒体 | [M2.5-cache-seo-media.md](./M2.5-cache-seo-media.md) | P2-C8–C11 |

## 3. 与参考工程的边界（本 Phase 统一）

| 做 | 不做 |
| --- | --- |
| modules/catalog、cart、search（可先 search 挂 catalog） | 复制 Elasticsearch / InstantSearch 全家桶 |
| mock adapter 扩展 listing/detail/search | 真实 commerce backend（Phase 4） |
| Server Action + 签名 cookie 懒创建 cart（07） | Checkout / Stripe（Phase 3） |
| `'use cache'` + cacheTag 显式策略 | Redis cache handler |
| happy-dog 增补 listing/pdp 所需基础组件 + stories | Chromatic 生产流水线 |
| Vitest + MSW contract | Playwright 全旅程（Phase 3） |

## 4. 跨里程碑契约（先冻结再编码）

实现任一 M2.x 前，先在 PR / ADR 草稿确认：

1. **Listing DTO**：PLP 与 Search 共用的列表项字段（id、slug、title、price、image、badges…）。
2. **PDP DTO**：variant 维度、可售状态、加购所需 sku/variantId。
3. **Cart cookie 名与签名**：只在首次 mutation 签发；禁止 proxy/middleware 建 cart（07）。
4. **路由形态**：P0 仍无 `[market]/[locale]` 双动态段；市场靠 `MARKET` / 未来 host 解析。

## 5. Phase 2 关门评审

全部 M2.1–M2.5 完成后，再跑一次 **Phase 2 总评**（phase-review），验收以 06 Phase 2 验收行为门槛，E 项覆盖 P2-C1–C11。
