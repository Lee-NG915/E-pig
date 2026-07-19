# Claude Code 任务：UI/UX + 架构对照（只读调研，禁止改仓库）

你是研究员，不是实现者。只读分析，输出结构化 Markdown。不要修改任何文件。

## E-pig 基线（必须先读）

工作区：`/Users/lidonghai/castlery/E-pig`

必读：
- `AGENTS.md`
- `docs/engineering/README.md`
- `docs/engineering/page-workflow-guide.md`
- `docs/engineering/component-workflow-guide.md`
- `docs/codex/research/04-e-pig-target-architecture.md`（前 120 行 + Hard Rules）
- `docs/codex/research/07-next16-cache-cart-routing-decisions.md`（摘要级）
- `docs/codex/research/08-shadcn-theme-component-library.md`
- `package.json`、`src/platform/registry.ts`、目录 `src/{app,modules,core,adapters,platform,shared}`

E-pig 画像：
- 轻量多市场电商前端：Next.js 16 App Router + Cache Components + React 19 + TS strict + Tailwind 4 + shadcn 源码模式（happy-dog）+ Vitest
- 架构：ports/adapters、modules 禁直接 import adapters/integrations、显式 cache、匿名 cart 首次 mutation 签发
- UI：基础组件库已初始化，**设计语言未定稿**；业务组件 folder contract + Storybook host
- 明确不做：Nx、隐式 ISR、Joyboy 旧基线复制

## 收录库（唯一外部证据源）

`/Users/lidonghai/castlery/nb-project/collection/`
- `INDEX.md`
- `domains/frontend.md`（重点 ecommerce / ui-kit / engineering）
- `domains/design.md`
- `domains/backend.md` 中 ecommerce 相关（medusa 等，仅架构对照）
- 需要时可查 `collection.json` 条目

禁止：凭空编造星数/特性；只能用收录库条目 + E-pig 本地文件。若信息不足，写「证据不足」。

## 筛选任务

从收录库筛出与 E-pig **工作流+业务场景最近** 的 **6–8 个**对照项目，优先级：
1. Next/RSC/headless commerce 店面或同类架构
2. 设计系统 / DESIGN.md / shadcn/Radix/Storybook 实践
3. 明确排除：微信小程序商城、纯 PHP/Java 全栈国货模板、与电商前端无关的 admin 脚手架（最多 1 个作反例）

建议候选（可增删，需论证）：
- saleor/storefront
- vercel/commerce
- spree/spree（Next storefront 侧）
- medusajs/medusa（后端组合性对照）
- shadcn-ui/ui + radix-ui/primitives + storybookjs/storybook（设计系统底座）
- google-labs-code/design.md
- pbakaus/impeccable / nextlevelbuilder/ui-ux-pro-max-skill（设计语言如何被 agent 消费）
- penpot/penpot（仅当讨论 token/设计-开发一体化时）

## 输出格式（严格）

### A. 筛选结果表
| 项目 | 相似度(1-5) | 为何入选 | 主要可学点维度 |

### B. UI/UX 维度对比
相对 E-pig：token/主题、组件规范文档、Storybook/视觉回归、DESIGN.md 或等价物、a11y、AI 友好设计约束。
对每个对照项目给：他们更好 / E-pig 已持平或更好 / 不宜照搬。

### C. 架构维度对比
ports-adapters、缓存模型、多市场/locale、cart/checkout 边界、provider 抽象、monorepo 取舍。
明确：E-pig Hard Rules 哪些仍应坚持（不要建议推翻已定稿决策）。

### D. 给 Leader 的可落地建议（最多 8 条）
每条：建议 / 借鉴来源 / ROI(高中低) / 阶段(P0/P1/P2) / 风险。
禁止空洞口号；必须能变成 E-pig 下一迭代任务。

全文中文，控制在 2500 字内。
