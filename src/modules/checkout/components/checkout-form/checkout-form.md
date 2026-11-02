# CheckoutForm

AU sandbox contact/address form and authoritative bag summary.

## 用户故事

用户在当前市场查看服务端确认的交易状态，并在失败时安全重试。该组件不导入供应商 SDK，不在客户端保存价格事实。

## 状态矩阵

| State | Trigger | Visible result |
| --- | --- | --- |
| Loading | GET pending | loading message |
| Unavailable | payment service disabled | informative notice |
| SG/US | non-AU market | no payment form |
| Invalid | missing fields or invalid postcode | associated field errors and focus |
| Submitting | valid input | expected server total + revision, frozen form |
| Ambiguous failure | network/5xx | preserve form and same request key |
| Locked | saved checkout | link to trusted reconciliation and saved snapshot |
