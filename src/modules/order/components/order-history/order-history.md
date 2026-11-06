# OrderHistory

Cookie-owned same-browser order list and details.

## 用户故事

用户在当前市场查看服务端确认的交易状态，并在失败时安全重试。该组件不导入供应商 SDK，不在客户端保存价格事实。

## 状态矩阵

有优惠的订单显示其冻结 subtotal、discount、couponCode；已付总额始终读取 Order.total。旧订单无新增可选字段时照常展示，不根据当前商品价格或优惠政策推导历史金额。

| State | Trigger | Visible result |
| --- | --- | --- |
| Loading | GET pending | loading text |
| Empty | successful list empty | browse guidance |
| Rejected | HTTP 404/401 | alert, no private details |
| Ready | trusted paid orders | lines, amounts, detail link |
| Detail | own order selected | saved test contact/address |
| Refresh | user action | no-store request, 30-day cookie caveat |


## 消费者售后增量（实施前规范）

仅在本人订单详情读取成功时挂载AfterSalesPanel，订单列表不展示完整售后表单；以market/cart/order作React key隔离身份和迟到请求。订单读取无权限时不挂载、不显示子组件缓存。面板行为见同domain的after-sales-panel.md；沿用Cookie订单归属，不下发服务凭证。OrderHistory负责订单事实，申请/回执状态归面板；不把浏览器索引当服务端授权或服务器无诉求的证明。
