# HomeHero

## 职责
首页首屏营销区：呈现品牌价值主张、主视觉图，并提供指向商品栅格（`#collection`）的锚点 CTA。无商品逻辑，属 content 壳。

## 用户故事 / 场景
- 作为首次到访者，我希望一屏内看懂品牌主张并能一键跳到商品区，以便快速决定继续浏览。

## 状态矩阵
| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| default | 页面渲染 | 主标题 "Furniture for slower days."、副文案、季节徽标、主视觉图；"Shop the collection" 与圆形 "View the collection" 两个锚点链接均指向 `#collection` |

## 非目标
- 无交互状态、无 market/cart 依赖；内容当前为硬编码英文（P0 三市场均英语）。
- 不做 A/B 或 CMS 接入（未来由 ContentPort 接管时再升格）。

## 依赖
- 基础组件：`@e-pig/happy-dog` 的 Badge、Button
- `next/image`、`next/link`
