# ProductComparison

更新日期：2026-11-03

## 用户故事

用户可在当前市场比较最多三个明确商品/规格，独立添加、换商品、换规格或移除。状态保存在 `/{market}/compare?item=productId:variantId&item2=...&item3=...`；ID 分别 encodeURIComponent，再由 URLSearchParams 编码。三个位置使用唯一参数名，兼容读取旧版重复 `item` 分享链接；后续操作统一生成唯一键，避免 Next 16 的页面键折叠。无账号或 localStorage。商品名、图片、价格、库存和规格来自 request-time CatalogPort，缺尺寸/材料/选项写 `Not provided`，不推测。

四处选择入口统一使用 happy-dog Select：触发器、焦点、选中态与 portal 弹层沿组件库设计；长列表限高滚动，长名称不撑宽窄屏。键盘可打开、选项移动、确认、Escape 取消并返回触发器。变更同步 URL 并保留其它列；比较中缺货仍可查看，但不显示虚假可购状态。每列 PDP 链接保留该规格。窄屏按列纵向排列，避免全页横向滚动。

换规格保留当前选择器焦点，移除列后回到添加商品入口。导航期间控件冻结，响应后恢复焦点。

## 状态矩阵

| 状态 | 可见行为 |
| --- | --- |
| 空比较 | Add product 表单与浏览分类链接 |
| 1–2 项 | 可继续添加，独立更换/移除 |
| 3 项 | 提示已满，添加禁用；现有列仍可改 |
| 无 variant | 明示 Default option selected，采用 catalog 首规格 |
| 显式未知商品/规格 | 错误列可更换或移除，不静默换默认 |
| 非法、重复、超过三项 | 显示处理说明；最多读取前三个引用 |
| 缺货 | Out of stock，与图片/价格/规格一致 |
| 缺规格资料 | 显示 Not provided |
| 路由更新中 | 控件禁用，状态文字可读 |
| 选择弹层 | happy-dog 统一样式；长列表内部滚动；Escape 不修改 URL，返回原触发器 |

比较页 `noindex`；无共享 cache，不提交 cart/payment，不复用其它市场价格。
