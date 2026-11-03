# Koala C 批 — 高级购物能力

更新日期：2026-11-03

用户已确认沿用沙箱示例规则。六项能力已实现、测试并完成本地浏览器验收；代码按依赖顺序分批交付于 `codex/koala-advanced-shopping`。基线为 A/B 批 `828b517`。

| 批次 | 领域 | 可复用内容 |
| --- | --- | --- |
| [C01](tasks/C01-filters.md) | PLP / catalog | 颜色、价格、可售筛选，URL 恢复，同规格 AND 与正确深链 |
| [C02](tasks/C02-comparison.md) | PLP / PDP / catalog | 三项商品规格比较，真实价格/图片/尺寸，缺失信息与无效引用处理 |
| [C03](tasks/C03-delivery.md) | PDP / checkout | 配送示例纯函数与共用组件，AU 测试邮编、未知/不支持分支 |
| [C04](tasks/C04-coupons.md) | cart / checkout / order | DEMO10、服务端折扣、冻结最终金额、取消/支付后状态 |
| [C05](tasks/C05-demo-reviews.md) | PDP / catalog | 明示示例评价、筛选/排序/展开与空态 |
| [C06](tasks/C06-atomic-set.md) | PDP / cart | Bangalow 两件套装、一次原子加购、失败回滚与跨入口安全重试 |

Homepage 继续使用现有 ProductCard，自动获得比较入口。新组件带同目录说明、测试与 Storybook；无新的供应商 SDK、数据库 schema 或全局客户端状态。

验收入口：[validation.md](validation.md)。契约：[contracts.md](contracts.md)。提交索引：[evidence/commits.json](evidence/commits.json)。问题溯源与后续复用注意事项：[retros/milestone.md](retros/milestone.md)。

本地预览：PLP `/au/collections/sofas`，比较 `/au/compare`，评价样本 `/au/products/tamarama-modular-sofa`，套装样本 `/au/products/bangalow-modular-sofa`。购物袋使用 `DEMO10`，配送测试邮编为 `2000`、`3000`、`4000`。

本轮未提交托管支付、未合并主干或手工部署；浏览器证据止于 checkout 表单及金额读回。配送、优惠、评价均为已授权的示例规则。
