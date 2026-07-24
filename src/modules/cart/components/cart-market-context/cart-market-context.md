# CartMarketContext

## 职责
向 cart/catalog/content 的 client 子树广播当前 request-time 解析出的 market 身份（id / currency / locale），是业务组件读写"当前市场"的唯一入口。

## 用户故事 / 场景
- 作为商品卡/购物袋组件，我需要知道当前 market 的 id、currency 与 locale，以便读写对应 market 的购物车并格式化金额。

## 状态矩阵
| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| provider 内 | 组件树被 `CartMarketProvider` 包裹 | `useCartMarket()` 返回传入的 market 对象 |
| provider 外 | 未包裹 provider 直接调用 `useCartMarket()` | 抛出 "useCartMarket must be used inside CartMarketProvider" |
| 多 provider 并存 | 页面挂多个不同 market 的 provider | 各子树读到各自的 market，互不串值 |

## 非目标
- 不负责 market 的解析与持久化（app 层 request-time 边界解析后传入）。
- 不持有 cart 行项目状态（见 `cart-store`）。

## 依赖
- 类型 `CartMarketIdentity` 来自 `@/modules/cart/lib/cart-store`
