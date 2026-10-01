# ProductDetail

## 职责

呈现商品详情页的设计稿区域，并把商品选项与现有 demo cart 连接起来。

## 用户故事 / 场景

- 作为顾客，我希望看到商品主图、缩略图、评分、价格、库存、描述和颜色选项。
- 场景 A：点击缩略图或前后箭头时，主图切换到对应图片。
- 场景 B：点击 `Select Options` 后进入选项状态，选择颜色后点击 `Add to bag`，当前颜色与商品进入当前 market 的 demo cart。
- 场景 C：商品缺货时显示 `Out of Stock`，主按钮不可用。
- 场景 D：收藏、购物篮、预览按钮保持可聚焦并有可读名称，为后续业务接入保留入口。

## 状态矩阵

| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| default | 有库存、未打开选项 | 显示设计稿信息，主按钮为 `Select Options` |
| options-open | 点击 `Select Options` | 颜色选择器进入可选状态，主按钮等待颜色选择 |
| colour-selected | 选择颜色 | 颜色有选中反馈，主按钮变为 `Add to bag` |
| added | 点击 `Add to bag` | 使用所选颜色写入 demo cart，并保持当前详情上下文 |
| out-of-stock | `availability=out-of-stock` | 显示缺货文案，主按钮禁用 |
| gallery-change | 点击缩略图或箭头 | 主图切换，当前缩略图标记为选中 |

## 非目标

- 本次不实现评论列表、收藏持久化、商品预览弹窗或真实库存校验。
- 三个圆形操作入口只提供可访问占位，不改变业务状态。
- 不在组件中直接读取 adapter 或供应商 DTO。

## 依赖

- `ProductDetail`：商品详情、gallery、评分、库存、颜色选项。
- `CartMarketProvider` 与 `addItem`：当前 market 的 demo cart。
- `next/image`、lucide icons、E-pig Tailwind tokens。
