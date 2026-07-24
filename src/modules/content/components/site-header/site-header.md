# SiteHeader

## 职责
站点顶部壳：主导航、品牌标识与当前市场购物袋入口（数量徽标 + 打开抽屉）。

## 用户故事 / 场景
- 作为浏览者，我希望随时看到购物袋里有多少件商品，并能一键打开购物袋抽屉。

## 状态矩阵
| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| 空袋 | 当前 market cart 行数为 0 | bag 按钮 aria-label 为 "Open bag with 0 items"，无数量角标 |
| 有商品 | 行数量合计为 n（1–9） | aria-label 为 "Open bag with n items"，角标显示 n |
| 数量超 9 | 合计数量 > 9 | 角标显示 "9+" |
| 打开抽屉 | 点击 bag 按钮 | 写回当前 market 的 `cart.open = true`，抽屉打开 |
| 多 market 并存 | 页面挂多个 market provider | 各 header 只反映自己 market 的 cart 数量 |
| storage 不可用 | localStorage 写入抛错（如 quota） | 内存 cart 仍更新，徽标照常变化 |

## 非目标
- 搜索、账户等未实现的入口不渲染占位按钮。
- 不做 cart 数据获取（状态来自 cart 域 external store）。

## 依赖
- 基础组件：`@e-pig/happy-dog` 的 Button
- cart 域：`useCartMarket`、`useCartStore`、`setCartOpen`
