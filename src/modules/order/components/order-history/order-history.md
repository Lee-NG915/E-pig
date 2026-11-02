# OrderHistory

Cookie-owned same-browser order list and details.

## 用户故事

用户在当前市场查看服务端确认的交易状态，并在失败时安全重试。该组件不导入供应商 SDK，不在客户端保存价格事实。

## 状态矩阵

| State | Trigger | Visible result |
| --- | --- | --- |
| Loading | GET pending | loading text |
| Empty | successful list empty | browse guidance |
| Rejected | HTTP 404/401 | alert, no private details |
| Ready | trusted paid orders | lines, amounts, detail link |
| Detail | own order selected | saved test contact/address |
| Refresh | user action | no-store request, 30-day cookie caveat |
