# CartSheet

## 职责
当前市场购物袋的抽屉视图：展示本地 demo cart 的行项目、数量步进与小计，是 cart 域唯一的购物车面板 UI。

## 用户故事 / 场景
- 作为浏览者，我希望加购后抽屉自动打开并看到刚加的商品，以便确认已放入购物袋。
- 作为浏览者，我希望在抽屉里增减数量（减到 0 即移除），以便调整订单内容。
- 作为浏览者，我希望看到按当前市场 locale/currency 格式化的小计，以便了解应付金额。

## 状态矩阵
| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| 关闭 | `cart.open = false` | 不渲染 dialog，页面无遮挡 |
| 空袋打开 | `open = true` 且 `lines` 为空 | 标题 "Your bag"、空态文案与 "Keep browsing" 按钮；点击后者关闭抽屉 |
| 有行项目 | `lines` 非空 | 每行渲染图片、名称、颜色、数量与该行金额；底部显示小计与禁用的 "Checkout requires backend" 按钮 |
| 数量增加 | 点击行内 "+" | 该行数量 +1，行金额与小计同步更新 |
| 数量减少 | 点击行内 "−" | 该行数量 −1；减到 0 时该行消失，行空后回到空袋态 |
| 手动开关 | 点击遮罩/关闭控件 | 写回 `cart.open`，抽屉随状态开合 |

## 非目标
- 真实 checkout（按钮恒为禁用，文案注明需要后端）。
- 运费/税费计算（仅静态提示未来由后端计算）。
- 价格持久化与服务端同步（P0 为 localStorage demo cart）。

## 依赖
- 基础组件：`@e-pig/happy-dog` 的 Button、Sheet 系列
- 状态：`@/modules/cart/lib/cart-store`（按 market 隔离的模块级 external store）；market 来自 `CartMarketProvider`
- 共享工具：`@/shared/lib/money` 的 `formatPrice`
