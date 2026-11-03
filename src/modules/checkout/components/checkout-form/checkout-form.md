# CheckoutForm

AU sandbox contact/address form and authoritative bag summary.

## 用户故事

用户在当前市场查看服务端确认的交易状态，并在失败时安全重试。该组件不导入供应商 SDK，不在客户端保存价格事实。

联系信息和澳大利亚配送地址分为有可访问名称的 Contact、Delivery 两组；地址按街道、城市、州、邮编顺序填写。摘要展示服务端确认的规格图片、完整规格、数量及行金额；无图时保留占位和商品文本。Edit bag 返回当前市场购物车。运费和税费仍明确为 sandbox 的 0，不表达真实配送报价。

## 状态矩阵

| State | Trigger | Visible result |
| --- | --- | --- |
| Loading | GET pending | loading message |
| Ready | valid AU bag | Contact and Delivery groups, selected variant image, totals and Edit bag |
| Missing image | line has no image | image placeholder; specification and amount remain readable |
| Unavailable | payment service disabled | informative notice |
| SG/US | non-AU market | no payment form |
| Invalid | missing fields or invalid postcode | associated field errors and focus |
| Submitting | valid input | expected server total + revision, frozen form |
| Ambiguous failure | network/5xx | preserve form and same request key |
| Locked | saved checkout | link to trusted reconciliation and saved snapshot |
