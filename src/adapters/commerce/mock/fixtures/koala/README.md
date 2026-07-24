# Koala catalog fixtures

更新日期：2026-07-19

从 Koala Australia 公开 Shopify JSON（`/collections/all/products.json`，并参考 [sofas-couches](https://au.koala.com/collections/sofas-couches) 等集合语义）筛选的**展示用** mock。不登录、不抓整站 HTML、不下载图片。

拉取时全库约 **146** 条；再按类目规则分桶，每类最多 **30**。公开目录若本身不足 20 条，会在 Note 标明（非脚本截断错误）。

## Collection results

| Fixture | E-pig category | Products | Note |
| --- | --- | ---: | --- |
| `sofas-couches` | Sofas | 29 |  |
| `mattresses` | Mattresses | 16 | Public catalog only has 16 matching products (< 20) |
| `sofa-beds` | Sofa Beds | 10 | Public catalog only has 10 matching products (< 20) |
| `armchairs` | Armchairs | 6 | Public catalog only has 6 matching products (< 20) |
| `coffee-tables-side-tables` | Tables | 6 | Public catalog only has 6 matching products (< 20) |
| `outdoor-furniture` | Outdoor | 6 | Public catalog only has 6 matching products (< 20) |
| `living-room` | Living Room | 30 |  |
| `bedroom` | Bedroom | 26 |  |

## 保留字段

handle/slug、name、category、badge、colour、首图 URL、纯文本 description（≤280）、粗材料、mock 多市场价格、source 元数据。不保留完整 variants / images / tags / HTML。

## 价格

- `au`：首个 variant 价格四舍五入
- `sg` / `us`：本地演示估算 `Math.round(au * 0.88)` / `Math.round(au * 0.72)`（非真实汇率）

## 重新生成

```bash
node scripts/catalog/fetch-koala-fixtures.mjs
# 或：pnpm catalog:fetch-koala
```
