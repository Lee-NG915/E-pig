# ProductCard

更新日期：2026-11-03

## 用户故事

Displays catalog imagery, category, name, option label and market price. Image and heading link to the market PDP. A known single variant has quick add; multiple or unknown variants link to Choose options so the customer selects before adding.

Quick add submits product/variant IDs and quantity only. Pending requests disable addition and reject duplicates. Failures remain visible as alerts. Default, compare price and optional badge display remain supported; catalog data does not manufacture promotional badges.

When the catalog supplies at least two colour previews, customers can select a real product thumbnail. Selection updates the displayed colour, image, price and every PDP link to the preview's explicit variant. Until a colour is selected, the original product display and default link are preserved. Multiple variants still require Choose options; colour previews never enable quick add.

## 状态矩阵

| 状态 | 可见行为 |
| --- | --- |
| 无预览或仅一色 | 保留原商品信息，不显示多余色板 |
| 两色及以上 | 原生 radio + 实物缩略图，可键盘选择；选中态可感知 |
| 切换颜色 | 图片、价格、颜色及 PDP 深链同步；图集从首图开始 |
| 多张有效图片 | 上一张/下一张按钮及图片位置说明；切图不导航、不加购 |
| 单张或重复图片 | 不显示无效图集控件 |
| 未提供所选规格原价 | 不沿用另一规格的划线价 |
| Compare | 当前市场的比较 URL 始终保留选中色板或明确 defaultVariantId；缺默认规格时由比较页明示默认 |
| 筛选后的默认预览 | `linkToDefaultVariant` 为 true 时，未点色板的 PDP 链接也保留当前匹配的 defaultVariantId |

Colour previews use catalog images, not invented colour values. They do not add ratings, discounts, inventory or delivery promises.
