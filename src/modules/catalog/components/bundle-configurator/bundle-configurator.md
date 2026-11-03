# BundleConfigurator

更新日期：2026-11-03

## 用户故事

用户在 PDP 确定主商品规格，再选择已配置配套商品规格，把两件单品各一件作为套装一次加入购物袋。价格取内部 catalog variant，没有额外套装折扣；最终服务端重新核算。Bangalow Sofa + Ottoman 为当前受控样本。

## 状态矩阵

| 状态 | 行为 |
| --- | --- |
| valid | 图/规格/两项金额/合计清楚，调用一次 addItems |
| invalid/unavailable | 未选主规格、缺货、币种不匹配或数量上限不足时禁止加入 |
| pending | 所有选择冻结，两次点击仅一个请求；通知父 PDP 锁定主规格 |
| 4xx failure | 显示错误，保留选择，可修改后重试 |
| pending conflict / not sent | 其它未确认请求阻止本次发送；释放本次套装锁，不保存错误的套装重试，不删除原请求或幂等键 |
| unknown failure | 结果不确定时保留原 payload 和规格，冻结选择；Retry set addition 复用原请求 |
| success | 统一 cart action 打开购物袋并释放锁定；仅当前商品/规格对与实际成功请求一致时显示成功状态，切换主规格不误报已添加 |

父组件通过 `onSelectionLockChange` 让主配置和单品购买入口同步冻结；组件不循环执行两个 addItem，不修改优惠码或自行创建 cart。
