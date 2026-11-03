# ProductComparison

更新日期：2026-11-03

## 用户故事

用户先在首页、列表或详情页选择最多三个不同商品，再到比较页查看这些商品。每市场 browser compare-store 是唯一选择真源；页面只接收 marketId，不从 URL 导入选择，也不列出或请求整个 catalog。

比较页通过 useComparisonDetails 只读取已选 IDs 的当前规格、价格、图片、尺寸、材料和可售状态。更换规格调用 addCompareItem 更新该商品并重新请求事实；移除调用 removeCompareItem。没有价格写入 localStorage，也不修改购物车或支付。

桌面采用原生 table，使同一属性逐行对齐。商品图片固定紧凑高度，避免两列比较时图片挤走规格与价格。移动端只在有可访问名称的表格区域内横向滚动，属性列和商品名称保持可见；区域可用键盘聚焦。页面本身不横向溢出。商品规格选择器复用 happy-dog Select，只有该商品自己的规格，明确标注缺货；仅提供 View details，不把缺货表现为可购买。

## 状态矩阵

| 状态 | 可见行为 |
| --- | --- |
| 尚未 hydration | Loading your comparison，不错误显示空态 |
| 无选择 | Your comparison is empty，Browse products 回当前市场首页 |
| 仅一件 | 展示已选事实，鼓励继续浏览添加另一件 |
| 两或三件 | 同属性逐行对齐，不出现添加/更换商品目录表单 |
| 初次取数/更换规格/后台刷新 | 只请求已选 IDs；Loading/Updating 反馈，本次请求完成前不展示旧价格、库存或其它事实 |
| 请求失败 | 选择保留，提供 Retry loading products；事实行显示 Not available，即使 Query 仍保留上次成功数据；仍可移除 |
| 商品失效 | 错误可见且可移除，不猜价格或替换为另一商品 |
| 显式未知规格 | 不静默回默认；可用该商品 Select 修正 |
| 缺资料 | Not provided；不估算尺寸/材料/评价 |
| 不可售或数量上限为零 | Unavailable for sandbox checkout；详情链接保留明确规格，不暗示真实库存 |
| 键盘交互 | Select 支持打开、移动、确认、Escape；规格刷新后恢复原选择器焦点；移除后立即回 Browse products，不等待网络或在迟到响应时抢回焦点 |

## 边界与验证

路由只在 Suspense 下解析 market，保留站点 chrome 和 noindex；没有 catalog.listProducts。规格/价格详情由独立 API request-time 获取。URL 不是选择状态，也没有旧分享链接导入交互。

组件测试使用真实 compare-store、useComparisonDetails 与 QueryClient，仅 mock fetch/Next image/缺失的 jsdom 浏览器方法。移动滚动、sticky 与完整 Select 弹层边界需实际浏览器确认，DOM class 断言不替代视觉验证。

Stories 通过 installComparisonStoryData 仅模拟 /api/au/compare 并在清理时恢复 fetch；可互动变更规格，不用 seed 缓存掩盖实时请求。
