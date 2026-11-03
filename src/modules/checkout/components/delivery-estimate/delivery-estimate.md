# DeliveryEstimate

更新日期：2026-11-03

## 用户故事

访客可用公开测试邮编查看演示配送时间，理解未配置估算的状态。说明始终标注 Demo、不构成配送承诺，checkout 运费/税额继续为零。无网络请求，不读取精确位置或保存地址。

## 状态矩阵

| 状态 | 可见行为 |
| --- | --- |
| PDP uncontrolled | 输入四位测试邮编，点击 Check estimate 后展示结果 |
| Checkout controlled | `postalCode` 跟随既有地址字段，只显示结果，不增加第二个地址输入 |
| idle | 说明可测试 2000 / 3000 / 4000 |
| invalid | 格式错误提示，不显示估算 |
| unknown | 明确没有示例数据，不推断无法配送；不阻止 checkout |
| estimated | 演示工作日区间，强调非履约承诺 |
| non-AU | 当前市场没有 demo 估算，支付兼容规则不变 |
