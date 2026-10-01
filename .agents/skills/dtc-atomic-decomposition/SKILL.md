---
name: dtc-atomic-decomposition
description: 把复杂组件拆成可复用的原子组件、组合组件、数据适配和交互状态，明确 props/inputs、slots、variants、依赖和不拆分边界。
---

# 原子组件拆分

原子拆分回答“这个组件内部哪些部分应独立维护、组合、测试或复用”。不要把“原子”理解成越小越好；目标是降低耦合、让状态和视觉契约可验证，并控制 API 和维护成本。

## 判断维度

对每个候选部分检查：是否有独立视觉契约、是否跨页面/实例复用、是否有独立交互状态、是否有独立数据映射、是否需要独立无障碍语义、是否能单独测试、是否有不同变体/响应式规则、是否由不同角色维护。满足一项不必立即拆分，至少说明收益、代价和替代方案。

典型层级：

- **Primitive / token consumer**：颜色、间距、字体、图标、按钮、输入等稳定基础能力。
- **Pattern / composite**：卡片、媒体文本组、筛选条、分页、表单字段组等重复组合和局部状态。
- **Feature component**：推荐区、购物操作、复杂表单、数据表、对话框等拥有业务交互和数据契约的组件。
- **Page composition**：把 feature/pattern 按页面任务组合，不把页面数据、全局导航和所有视觉细节塞进一个组件。

## 契约输出

每个拆出的组件记录职责/非目标、输入和输出、props/参数或 slots、默认和空值、变体、状态转换、事件、数据适配边界、无障碍语义、响应式规则、样式作用域、依赖和测试入口。说明数据获取放在页面/feature/adapter 哪一层；组件不应暗中绑定某个 API、路由或平台编辑器。

变体只在真实设计或产品规则有差异时创建；不要为每个示例值生成一个 variant。可配置值、可计算值、业务数据和纯视觉 token 分开。相似但行为不同的组件不要强行共用一个模糊 API；只是一次性组合且没有独立契约的部分也不要为了目录整齐而拆出组件。

先用 [dtc-page-decomposition](../dtc-page-decomposition/SKILL.md) 确认页面组合，再与 [dtc-ui-spec](../dtc-ui-spec/SKILL.md) 的 row 绑定；技术边界交给 [dtc-technical-design](../dtc-technical-design/SKILL.md)，实现交给 [dtc-implementation](../dtc-implementation/SKILL.md)。

## 可交接产物

实施拆分时读取 [契约与记录](references/component-contract.md)，将组件 ID、状态所有权和来源映射写入现有技术稿。已有边界直接沿用；新高影响边界才澄清。
