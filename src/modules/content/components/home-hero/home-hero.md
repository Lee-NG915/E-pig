# HomeHero

更新日期：2026-11-03

## 职责

首页首屏：可读标题与两条选品入口，桌面文图分区、移动先文案与 CTA 后主视觉。使用现有场景图及 happy-dog 语义颜色，CTA 指向带当前市场前缀的 Sofas/Living PLP。

## 用户故事 / 场景

- 作为首次到访者，我希望一屏内看懂品牌与主营品类，并能进入商品列表。

## 状态矩阵

| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| default | 传入 `marketId` | H1「Furniture for slower days.」、Shop sofas → `/{market}/collections/sofas`、Explore living → living-room |
| narrow | 窄屏 | 文案、按钮与图片按阅读顺序排列；标题不烘焙在图片里 |
| wide | 桌面 | 文案与场景图并排；图片不遮挡标题或操作 |

## 非目标

CMS、A/B、促销或政策承诺；Search 与沙箱购物公告保持由 Header 提供。
