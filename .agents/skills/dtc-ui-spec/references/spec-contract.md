# 参数、状态与断言契约

## 同一条参数的字段

| 字段 | 含义 |
| --- | --- |
| rowId / componentId / element | 稳定身份；换来源节点不自动换逻辑身份，匹配需核对 |
| sourceRef / original | 来源 ID、原值/单位、提取方式与 source version；不是实现 computed 值 |
| property / coordinateSpace | 例如 font.size、layout.width；frame、viewport、container、item、asset、glyph 分开 |
| target | 采用值/单位或 fixed/max/min/auto/ratio/fluid 的完整公式及适用区间 |
| viewport / state | 适用平台、视口/容器、方向/缩放（适用时）、实例及状态 |
| extraction | extracted、partial、excluded、not-applicable；每种有依据 |
| decision | adopted、proposed、assumption、unknown；reason 及现有决定引用 |
| implementation | 源码位置、selector/平台定位、输入/样式映射；尚未实现留 null |
| acceptance | 独立于实现的预期、方法、证据和结果；未执行为 not-run |

不要用一列 status 同时表示提取完成、用户批准、代码完成和测试通过。Figma node、设计 frame、viewport、item 的 ID 和尺寸意义不同。

## 属性覆盖

- 几何：宽/高、max/min、比例与自适应、容器、单项、间距关系（from/to edge）、对齐、换行、溢出和滚动。
- 文字：内容分段、family、size、weight、style、line-height、letter spacing、装饰和实际可读范围。
- 绘制：颜色、渐变/色标方向、透明度、边框、圆角、shadow、blur、mask、clip、层级；记录是否嵌在图片中。
- 资源：自然/可见尺寸、透明/纯色留白、变换、焦点/裁切、清晰度、双端独立素材和 fallback。
- 布局变化：desktop/mobile 各自取证，断点/插值/重排是决定；页面根是否允许溢出与局部滚动分开。
- 状态：默认、选中、悬停、聚焦、禁用、loading/empty/error 和动画阶段仅按真实契约适用。

来源值允许精确、近似或未知。截图可作视觉基准，但不能伪造节点测量精度；未读属性不是 0/none。平台单位映射记录理由，不强制把所有目标转 px。

## 行为与输入契约分表

行为：初始项、触发输入、转换、完成条件、首尾/顺序、重复快速操作、模式/视口切换和恢复。只有多个静态示例不能推断轮播；有歧义先获得回复。

输入：ID、归属、类型、默认、未提供/null/空串/0/false、范围/步长、条件适用、消费者与可见结果。固定值可以没有可配字段；预览辅助值不能冒充生产输入。

## 审阅表及版本差异

| rowId | 元素/属性 | 桌面原值 | 移动原值 | 来源/精度 | 采用目标/单位 | 差异理由/决定 | 待确认 |
| --- | --- | --- | --- | --- | --- | --- | --- |

未知格写原因，不能用空白或横杠掩盖。JSON 等结构化数据为单一数值来源；表格是视图。版本变化列 old/new、影响组件/参数/断言、变更性质、重审范围，保留旧运行对应版本。

## 交接断言

row → component → 输入/样式 → 实际定位 → 预期 → 量测/视觉 → 结果。整图内部不制造控件或 DOM 断言，改测外部布局、比例、清晰度和图内可见内容。未知或缺正式素材只能验已有部分，不能靠更换基准使差异消失。
