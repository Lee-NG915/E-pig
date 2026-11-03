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
