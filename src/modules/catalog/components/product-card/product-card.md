# ProductCard

## 职责
商品栅格中的单品卡片：展示商品图片、类目、名称、颜色与按市场 locale 格式化的价格，并提供加购入口。

## 用户故事 / 场景
- 作为浏览者，我希望看到商品图片、名称与格式化后的市场价，以便快速比较商品。
- 作为浏览者，我希望点一次加购按钮就把商品放进当前市场的购物袋，以便不打断浏览继续挑选。

## 状态矩阵
| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| default | 正常商品数据 | 渲染图片、类目、名称、颜色与现价；图片与名称均可点击跳转 PDP；加购按钮可用，aria-label 为 "Add <name> to bag" |
| 可进入 PDP | `product.slug` 非空 | 图片与标题均链向 `/products/<slug>` |
| 有徽标 | `product.badge` 非空 | 图片左上角叠加徽标文案 |
| 无徽标 | `product.badge` 为空/缺省 | 不渲染徽标 |
| 有划线价 | `product.compareAt` 非空 | 现价下方显示划线原价 |
| 无划线价 | `product.compareAt` 为空/缺省 | 只渲染现价 |
| 加购成功 | 点击加购按钮 | 商品进入当前 market 的本地购物袋，购物袋随之打开 |

## 非目标
- 缺货/库存禁用态（P0 mock 数据无库存概念）。
- 价格/库存数据缓存（价格区域按 Hard Rules 走 request-time，不进共享缓存）。

## 依赖
- 基础组件：`@e-pig/happy-dog` 的 Badge、Button
- 数据：`ProductListItem`（`@/core/contracts/commerce/catalog`）；market 来自 cart 域的 `CartMarketProvider`
- 共享工具：`@/shared/lib/money` 的 `formatPrice`
