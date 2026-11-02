# CartPanel

Server-authoritative bag used by both the page and drawer.

## 用户故事

用户在当前市场查看服务端确认的交易状态，并在失败时安全重试。该组件不导入供应商 SDK，不在客户端保存价格事实。

## 状态矩阵

| State | Trigger | Visible result |
| --- | --- | --- |
| Loading | request pending | status text |
| Empty | successful GET returns no lines | browse link |
| Unavailable | HTTP/network error | alert and retry, no false empty state |
| Legacy demo | prior storage exists | re-add notice, old storage untouched |
| Ready | server lines | variant quantities and server subtotal |
| Locked | lockedCheckoutId | controls disabled, payment status link |

同 revision 的旧 unlocked GET 不覆盖已确认的 checkout lock；服务端更高 revision 的合法解锁仍被接受。
