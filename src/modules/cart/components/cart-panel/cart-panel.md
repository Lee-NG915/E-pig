# CartPanel

Server-authoritative bag used by both the page and drawer.

## 用户故事

用户在当前市场查看服务端确认的交易状态，并在失败时安全重试。该组件不导入供应商 SDK，不在客户端保存价格事实。

商品行展示服务端选定的图片、完整规格和行金额。名称链接使用内部 product ID 与编码后的 variant query，返回当前市场的详情；浏览链接关闭抽屉，但不修改购物车。图片字段缺失时显示占位说明，数量和删除仍可用。空袋提供当前市场的沙发、卧室分类与首页入口。

## 状态矩阵

AU 的非空购物车支持单个示例优惠码 DEMO10；输入框与移除入口经现有 CartPort mutation / Web Lock 发出请求。优惠仅由服务端按分计算，展示原始 Subtotal、Discount 和最终 Total；失败保留现有优惠并提供安全重试。空码表示移除。锁车或 pending 时禁止改码，SG/US 不展示入口。

| State | Trigger | Visible result |
| --- | --- | --- |
| Loading | request pending | status text |
| Empty | successful GET returns no lines | market collection links and home browse link |
| Unavailable | HTTP/network error | alert and retry, no false empty state |
| Legacy demo | prior storage exists | re-add notice, old storage untouched |
| Ready | server lines | selected image, full variant label, exact variant PDP link, quantities and server subtotal |
| Coupon applied | server coupon snapshot | original subtotal, discount, final total and removal action |
| Coupon rejected | invalid/expired code | previous server discount remains; actionable error |
| Missing image | line has no image | stable placeholder; item controls remain available |
| Locked | lockedCheckoutId | controls disabled, payment status link |

同 revision 的旧 unlocked GET 不覆盖已确认的 checkout lock；服务端更高 revision 的合法解锁仍被接受。
