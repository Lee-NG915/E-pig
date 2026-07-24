# CartSheetMount

## 职责
在 request-time market 边界内挂载购物袋抽屉的薄 client 组装件：向子树提供 `CartMarket` context，并始终挂载 `CartSheet`。

## 用户故事 / 场景
- 页面在 request-time 解析出 market 后，用它包住站点壳，使壳内任何组件都能读写当前 market 的购物袋。

## 状态矩阵
| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| default | 传入 `market` 与 `children` | children 原样渲染；子树内 `useCartMarket()` 返回该 market；`CartSheet` 已挂载（默认关闭、不可见） |

## 非目标
- 不持有 cart 状态（状态在 `@/modules/cart/lib/cart-store` 的模块级 external store）。
- 不做 market 解析（由 app 层 request-time 边界解析后作为 prop 传入）。

## 依赖
- `../cart-market-context`（provider 与类型）
- `../cart-sheet`（抽屉本体）
