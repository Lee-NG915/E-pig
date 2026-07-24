# HomeEditorial

## 职责
首页设计理念编辑区：场景图 + 设计理念文案 + 指向页脚 `#about` 锚点的 CTA。无商品逻辑，属 content 壳。

## 用户故事 / 场景
- 作为浏览者，我希望了解品牌的设计理念，并能跳到页脚的品牌信息区。

## 状态矩阵
| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| default | 页面渲染 | 场景图、标题 "Designed to be lived in, not looked after."、说明文案；"Our design approach" 链接指向 `#about` |

## 非目标
- 无交互状态、无 market/cart 依赖；内容硬编码。

## 依赖
- 基础组件：`@e-pig/happy-dog` 的 Button
- `next/image`、`next/link`
