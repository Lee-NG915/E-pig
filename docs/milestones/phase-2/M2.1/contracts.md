# M2.1 冻结契约

更新日期：2026-07-25

状态：frozen（实现中勿静默改；要改先开溯源或更新本文件并记 task）

对齐：`docs/milestones/phase-2/README.md` §4 + M2.1 PRD。

## 1. 路由

| 路由 | 用途 | 本里程碑 |
| --- | --- | --- |
| `/` | 308 → `/{MARKET}` | proxy |
| `/{market}` | Home（升级入口到 PLP） | 改 |
| `/{market}/collections/[slug]` | PLP：按 collection handle 列表 | **新增** |
| `/{market}/products/[slug]` | PDP | **仅占位链**（可 404 或极简 stub；完整页属 M2.2） |

市场段 `/{market}` 必须等于进程 `MARKET`；其它市场前缀与裸 `/collections/...` 由 `src/proxy.ts` 308 纠正。locale 段尚未启用（为多语言预留）。

**选定：** PLP 用 `/collections/[slug]`（与 `Collection.handle` 对齐），不用 `/products` 扁平列表作主 PLP。

## 2. Listing DTO（PLP 与未来 Search 共用）

扩展 `ProductListItem`（`src/core/contracts/commerce/catalog.ts`）：

| 字段 | 要求 |
| --- | --- |
| `id` | 稳定内部 id（可与 mock 现网 id 相同） |
| `slug` | **新增**；URL 段；mock 阶段允许 `slug === id` |
| `name` | 展示名 |
| `category` | 人类可读类目；用于映射 collection |
| `price` / `compareAt?` | Money；request-time，不进共享 cache |
| `image` | 主图 URL 或占位 |
| `badge?` / `colour` | 已有字段保留 |

`ListProductsQuery` 扩展：

| 字段 | 语义 |
| --- | --- |
| `category?` | 已有；按 product.category 过滤 |
| `collection?` | **新增**；按 `Collection.handle` 过滤（adapter 内映射到 category） |
| `sort?` | **新增**：`price-asc` \| `price-desc` \| `name`（M2.1 关门用排序，筛选可 stub） |
| `limit?` | 已有 |

`Collection` 保持 `{ handle, title }`；`listCollections()` 为 Home/PLP 导航数据源。

Mock 额外提供空集合 `coming-soon`（无商品），用于演示 PLP 空态；未知 handle → `notFound()`。

## 3. 缓存 / 边界

- PLP 列表价：**不**进共享 Cache Component（Hard Rules）。
- `modules/catalog` 只依赖 `@/core/contracts`；经 `getCapabilities().catalog` 取数。
- 不加真实搜索后端；不加 server cart cookie（M2.4）。

## 4. UI 最小集

- `product-card`：展示名/价/图；**链向** `/products/[slug]`；加购行为保持 Phase 1（本地 cart store）。
- PLP：有数据栅格 + 空集合空态 + 排序控件（或 URL `?sort=`）。
- Home：至少一处链到某个 `/collections/[slug]`。
