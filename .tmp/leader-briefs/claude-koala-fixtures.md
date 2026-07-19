# Claude 任务：从 Koala AU 拉取展示用 mock 商品

## 目标

从 `https://au.koala.com` 的 Shopify 公开接口拉取商品，**只保留展示相关字段**，落到本地供 E-pig mock Catalog 使用。

接口（已验证可用）：
```
GET https://au.koala.com/collections/{handle}/products.json?limit=30&page=1
```

## 类目（每个 20–30 条，够用即停）

| collection handle | E-pig category 标签 |
| --- | --- |
| sofas-couches | Sofas |
| mattresses | Mattresses |
| sofa-beds | Sofa Beds |
| armchairs | Armchairs |
| coffee-tables-side-tables | Tables |
| outdoor-furniture | Outdoor |

若某 handle 404，试相近 handle 或跳过并在 README 说明。

## 输出字段（精简，不要整包 Shopify JSON）

每条产品只保留：

```ts
{
  id: string;            // = handle
  slug: string;          // = handle
  name: string;          // title
  category: string;      // 上表 E-pig 标签
  badge?: string;        // 从 tags 映射：bestsellers→Bestseller, new→New 等，可无
  colour: string;        // variant.option1 或 options Colour 的首值，缺省 "Default"
  image: string;         // images[0].src（可去 query 或保留）
  description: string;   // body_html 去标签后截断 ≤280 字
  materials: string[];   // 若能从描述/tags 粗提取则填，否则 []
  priceByMarket: { au: number; sg: number; us: number };
  // au = Math.round(Number(variants[0].price))
  // sg/us：mock 估算 sg=round(au*0.88), us=round(au*0.72)（仅本地演示，写进 README）
  compareAtByMarket?: { au?: number; sg?: number; us?: number }; // 仅当 compare_at_price 有值
  source: { vendor: "Koala"; collection: string; scrapedAt: string };
}
```

## 落盘路径

1. 写可重复执行脚本：`scripts/catalog/fetch-koala-fixtures.mjs`
2. 跑脚本生成：
   - `src/adapters/commerce/mock/fixtures/koala/{handle}.json`（每类一个数组）
   - `src/adapters/commerce/mock/fixtures/koala/index.json`（合并摘要：counts）
   - `src/adapters/commerce/mock/fixtures/koala/README.md`（来源、字段、价格估算、再跑命令）
3. 更新 `src/adapters/commerce/mock/catalog-data.ts`：用 fixtures 生成 `mockProducts`（可 import JSON；保留或替换旧 4 条 demo——**以 koala fixtures 为主**，旧 demo 可删以免混用）。
4. 更新相关 spec（slug、collection handle、排序用例中的商品名可能变——按新数据改断言）。
5. `pnpm test` 相关 catalog + `pnpm typecheck` 绿。

## 约束

- 只读公开 products.json；不要登录、不要爬整站 HTML、不要下图片到仓库。
- 尊重合理速率：类目间 sleep 300–500ms。
- 不要把完整 variants/images 数组写入仓库。
- modules 仍不得 import fixtures；仅 mock adapter 数据层用。
- 完成后写 `.tmp/leader-briefs/claude-koala-fixtures-done.md`。

## 完成定义

- 至少 4 个类目有数据，每类约 20–30
- PLP `/collections/sofas` 等仍能工作（注意 category→handle 映射：Sofas→sofas）
- 测试绿
