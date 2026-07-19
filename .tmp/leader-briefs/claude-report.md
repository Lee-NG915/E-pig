### A. 筛选结果表

| 项目 | 相似度(1-5) | 为何入选 | 主要可学点维度 |
|---|---:|---|---|
| saleor/storefront | 5 | Next 16、RSC、Server Actions、Cache Components、多 locale/channel、Checkout v2 | 缓存、SEO、多市场、结账、Agent 规则 |
| vercel/commerce | 5 | 轻量 Next/RSC headless 店面；commerce provider 隔离 | Provider 抽象、Suspense、乐观交互 |
| spree/spree | 4 | Next 16 店面、多市场/币种/支付，配套 SDK、OpenAPI、Agent skills | 跨境能力、契约与 AI 文档 |
| medusajs/medusa | 3 | 商品、购物车、订单、支付能力可组合、可替换 | 后端能力边界、组合性 |
| shadcn-ui/ui | 4 | 源码所有权、Tailwind、Radix、默认 a11y，与 happy-dog 同路线 | 组件源码治理、可定制性 |
| storybookjs/storybook | 4 | stories 同时承担隔离开发、文档和用例 | 组件文档、a11y、交互与视觉反馈 |
| radix-ui/primitives | 4 | 无样式、WAI-ARIA、键盘与焦点行为底座 | 无障碍交互原语 |
| pbakaus/impeccable | 4 | 生成 PRODUCT.md/DESIGN.md，44 条确定性规则及 CI JSON/hook | AI 可消费设计约束、自动审计 |

证据来自 `collection/domains/{frontend,design,backend}.md`；未由条目明确说明的能力均按“证据不足”处理。

### B. UI/UX 维度对比

| 项目 | 他们更好 | E-pig 已持平或更好 | 不宜照搬 |
|---|---|---|---|
| Saleor Storefront | AI skills 与多市场 SEO 规则更成体系 | E-pig 已有组件状态文档、双 Storybook；其 token/a11y 证据不足 | 不绑定 Saleor DTO、路由及支付实现 |
| Vercel Commerce | RSC、Suspense、`useOptimistic` 店面范式成熟 | E-pig 的组件 folder contract、Theme 分层更明确 | 不退化成单个 `lib/shopify` 供应商中心 |
| Spree | 多市场/币种及 Agent 文档覆盖更广 | E-pig 的 UI companion 与领域落点更严格 | 不引入完整 Ruby 平台或全部支付集成 |
| Medusa | 商业原语组合性强 | E-pig 前端 UI 工作流更具体 | 不把后端模块系统搬进前端 |
| shadcn/ui | 组件供给面与源码分发经验更成熟 | happy-dog 已同样拥有源码、CSS token 与 Radix 基座 | 不把默认视觉直接当品牌设计语言 |
| Storybook | a11y、viewport、交互、自动文档生态更完整 | E-pig 已有 happy-dog 与 modules 两个宿主 | stories 不能替代结账旅程测试 |
| Radix | ARIA、键盘、焦点行为更专业 | E-pig 已通过 shadcn/Radix复用该能力 | 不直接暴露 primitive，绕过品牌组件层 |
| Impeccable | DESIGN.md 与确定性 AI UI 检测领先 | E-pig 的行为 `.md`、测试和 companions 更贴近代码交付 | 不直接采用其风格偏好或一次性 44 条全阻断 |

总体上，E-pig 的**工程闭环已较强**：Theme token、组件行为文档、测试、stories、Storybook host 均已存在。主要差距是品牌设计语言未定稿、companions 仍为 warn、无视觉回归，以及缺少 AI 可直接读取的全局 DESIGN.md。

### C. 架构维度对比

| 维度 | 对照结论 |
|---|---|
| ports-adapters | Vercel Commerce 展示 provider 可替换性，Medusa 展示能力组合；E-pig 的 typed port、DTO 映射、ESLint 依赖边界更严格，应保持。 |
| 缓存模型 | Saleor 的 `cacheLife` 分层与 webhook tag 失效最接近。可学失效责任表，不改变 E-pig 的显式 opt-in 模型。 |
| 多市场/locale | Saleor、Spree 更成熟；E-pig 已有 typed market registry，但需补 URL、hreflang、跨市场商品映射验收。 |
| cart/checkout | Saleor 的 URL 驱动步骤、支付注册表值得参考；不得改变匿名 cart 仅首次 mutation 签发，也不得缓存交易数据。 |
| Provider 抽象 | 可借鉴 Vercel 的接入简洁度，但继续由 `core contract + adapter + registry` 承载，不让 modules 接触供应商。 |
| monorepo | 外部条目不足以证明对 E-pig 有收益。继续单 App + 小型 pnpm workspace，不引入 Nx/Turborepo 编排。 |

应继续坚持全部 Hard Rules：异步 request API、request API 不进 `'use cache'`、显式 `cacheLife/cacheTag`、交易数据不缓存、modules 禁止越层、secret 不进 `NEXT_PUBLIC_*`、cart cookie 只在 mutation 签发，以及不复制旧基线。

### D. 给 Leader 的可落地建议

| 建议 | 借鉴来源 | ROI | 阶段 | 风险 |
|---|---|---:|---|---|
| 新增项目级 DESIGN.md：品牌原则、语义 token、排版/间距/动效、禁用模式，并由组件 `.md` 引用 | Impeccable | 高 | P1 | 过早冻结视觉；先标 proposal |
| 选 5–8 个高频组件接视觉回归 CI，覆盖主题、viewport、交互态 | Storybook | 高 | P1 | 基线噪声与维护成本 |
| 清零 allowlist 缺口后，将 companions 从 warn 升为 error | E-pig 工作流、Storybook | 高 | P0 | 旧扁平组件造成集中迁移压力 |
| 为 Button、Sheet、cart drawer、筛选控件增加键盘、焦点和 axe 验收 | Radix、Storybook | 高 | P0 | jsdom 与真实浏览器存在差异 |
| 建立缓存责任清单：profile、tag、失效事件、市场参数、禁止缓存字段 | Saleor Storefront | 高 | P1 | webhook 尚未接入时只能先定义契约 |
| 将 host→market、canonical、hreflang、无等价商品规则做成纯函数矩阵测试 | Saleor、Spree | 高 | P1 | 商品跨市场映射依赖真实 adapter |
| 设计 URL 驱动 checkout step contract 与 PaymentPort registry，不提前接具体网关 | Saleor Storefront | 高 | P2 | 状态暴露和回退路径需安全评审 |
| 给每个新 commerce adapter 建统一契约测试：DTO、错误归一化、市场隔离、幂等性 | Vercel Commerce、Medusa | 高 | P1 | 不同供应商能力不完全对称 |

本次仅进行了本地只读调研，未修改仓库。
