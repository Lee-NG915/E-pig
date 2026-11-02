# CheckoutStatus

Trusted payment reconciliation; a return URL never marks paid or unlocks a cart.

## 用户故事

用户在当前市场查看服务端确认的交易状态，并在失败时安全重试。该组件不导入供应商 SDK，不在客户端保存价格事实。

## 状态矩阵

| State | Trigger | Visible result |
| --- | --- | --- |
| Creating | server creating | preparing state, bounded polling |
| Open | server open | pending, trusted Stripe payment link, explicit cancel |
| Paid | server paid | confirmed state and order link |
| Expired | server expired | bag link |
| Unknown | reconciliation/cancel failure | retry, keep freeze |
| Missing ID | no checkoutId | return-to-bag guidance |

授权拒绝（GET 或 cancel 的 401/403/404）清除共享 Query 中的个人信息与支付入口，跨组件重挂载仍不可见，新的成功刷新确认归属后才恢复。取消操作先中止旧轮询；已核验的终态不会被旧 open 响应回退。

可信 GET 返回 paid / expired 后立即刷新共享购物车，让 Header / Drawer / Cart 读取清空或解锁后的状态。刷新沿用 revision / lock 单调性保护；刷新失败不改变可信支付终态，下一次支付状态读取可重试购物车刷新。
