# HomeBenefits

## 职责
首页权益条：静态展示三条服务承诺（配送、试睡、材料）。无商品逻辑，属 content 壳。

## 用户故事 / 场景
- 作为浏览者，我希望在商品区之后看到配送、试用与材料承诺，以便降低购买顾虑。

## 状态矩阵
| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| default | 页面渲染 | 三条权益卡片：Easy delivery / 120-night trial / Considered materials，各配图标与一句说明 |

## 非目标
- 无交互与状态；权益内容硬编码，不接 CMS。

## 依赖
- `lucide-react` 图标
