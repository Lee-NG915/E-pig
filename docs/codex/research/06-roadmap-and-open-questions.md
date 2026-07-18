# 实施路线图、验收门槛与待确认项

更新日期：2026-07-18

状态：proposal

## 1. 建议实施顺序

### Phase 0：决策冻结

- Review 本目录 7 份文档。
- 确认 P0 页面、目标市场/语言/URL 模式、后端来源、部署环境和设计系统方向。
- 为关键 ADR 标记 accepted/rejected/deferred/needs-spike。

验收：没有影响目录结构或数据模型的未决问题，再初始化代码。

### Phase 1：最小骨架

当前状态：**已完成（2026-07-18）**。

- Next.js 16.2 App Router、`cacheComponents: true`、strict TypeScript、Tailwind 4、基础 tokens。
- env schema、market registry、host/locale 纯函数校验、logger、error model。
- mock `CatalogPort`、`CartPort` 和 capability registry。
- adapter/integration 分层 registry；Docker standalone、CI typecheck/lint/test/Turbopack build。
- 可交互 Home demo、按 market/version 隔离的本地购物车、Testing Library 组件测试。
- env/secret/import 静态门禁、文档同步门禁、非默认市场 standalone smoke。

验收：全新 clone 只需复制 `.env.example`、`pnpm install`、`pnpm dev`；无 SaaS 账号可运行。Node 24 下 typecheck、lint、unit/component tests、doc sync、Turbopack build 与 SG runtime smoke 全绿。

### Phase 2：浏览与加购

当前状态：**未开始**。粗粒度条目保留；**可交付拆分见** [`docs/milestones/phase-2/`](../../milestones/phase-2/README.md)（M2.1–M2.5 PRD）。

- 在 Phase 1 demo 基础上补齐 production-grade Home、PLP、PDP、搜索 query、variant、server cart。
- `use cache`/`cacheLife`/`cacheTag` 策略、SEO metadata、canonical/hreflang、structured data、图片策略。
- 首次 add-to-cart Server Action 懒创建匿名 cart 并签发 cookie；并发请求有幂等测试。
- MSW/contract tests、核心组件测试。

验收：mock catalog 完成浏览 → 加购；刷新后 cart 恢复；无客户端 hydration warning。子里程碑全部完成后做 Phase 2 总评（phase-review rubric v2）。

### Phase 3：Checkout 与支付

- 地址、配送、订单汇总、Stripe sandbox。
- Payment/Checkout port、idempotency、失败恢复、return page。
- Playwright 覆盖成功、拒付、重复提交和返回。

验收：订单最终状态来自服务端/webhook 模拟，不由 success URL 单独决定。

### Phase 4：首个真实 adapter

- 接 custom REST/选定 commerce backend。
- mapper、timeout、retry boundary、health check、contract test。
- optional Sentry/PostHog，在 consent 与 env 开关后加载。

验收：mock 与真实 adapter 可通过配置切换，业务 module 无供应商 import。

### Phase 5：生产准备

- live payment 商务/合规确认。
- CMP、隐私政策、CSP、rate limit、secret rotation、备份、恢复、告警。
- performance budget、依赖与容器扫描、部署回滚。

验收：生产 runbook、数据责任边界、成本预算和回滚演练完成。

## 2. 架构升级门槛

| 决策                         | 触发条件                                 | 之前不要做                  |
| -------------------------- | ------------------------------------ | ---------------------- |
| 升 pnpm workspace/Turborepo | 第二 app、跨仓消费或独立发布                     | 不预建 20 个空 package      |
| 引入 Redis                   | cache 一致性/容量数据证明单机/平台 cache 不足       | 不为“以后可能”维护 Redis       |
| 引入 Redux                   | 多页面复杂客户端状态且 Query/React state 无法清晰表达 | 不复制参考工程的 store/slice   |
| 引入 Storybook               | shared UI 达到约 20 个复杂组件或多人视觉协作        | 不让它阻塞 P0               |
| 独立搜索引擎                     | SKU/facet/相关性/延迟超过 provider 能力       | 不先部署 Elasticsearch     |
| 第二监控平台                     | Sentry/logger 无法满足已定义 SLO            | 不同时接 Datadog           |
| 动态插件系统                     | 有外部插件作者或运行时安装需求                      | 不把 typed registry 过度设计 |

## 3. 你需要重点 Review 的选择

1. 单 Next app 起步，而不是 Nx monorepo。
2. Next.js 16.2 + Node 24 LTS + Cache Components + Turbopack 作为基线，不复用参考工程的 Next 14/Node 20/旧缓存模型；TypeScript 6.0 先做兼容 smoke，必要时回退 5.9。
3. Tailwind + shadcn 源码组件，不复制 Fortress/MUI Joy。
4. RSC + TanStack Query + React/Zustand，不复制 Redux/RTK Query 全局体系。
5. 所有业务 port 实现统一进入 `adapters/`；只有可降级的副作用进入 `integrations/`。
6. mock/custom REST port 为核心，不在架构阶段绑定 Medusa、Shopify 或自有后端。
7. local content 起步；Payload 是优先自建 CMS 候选，但延后安装。
8. Docker 是权威部署；Vercel 只是可选预览/付费部署。
9. Stripe 是唯一 P0 第三方交易 SDK，且只用 sandbox。

## 4. 待确认问题

这些问题不阻塞本轮文档，但会影响下一阶段脚手架：

- E-pig 首个目标是纯前端 demo、连接现有 Castlery API，还是带一个可自建 commerce backend？
- 首发市场/语言/货币是什么？据此在“无前缀 / `[locale]` / 市场子域 / `[market]/[locale]`”中冻结一种 URL 模式；在答案确定前不得创建双动态段。
- 必须支持的 P0 页面：Home、PLP、PDP、Cart、Checkout、Account、Order 中哪些？
- 是否需要管理员编辑内容？如果需要，Payload 应从 P1 提前到 P0。
- 生产目标是公司 Kubernetes/ECS、普通 VPS、Cloudflare、Vercel Pro 还是其他平台？
- UI 是否要视觉参考参考工程的设计系统，还是只参考业务行为并建立新设计系统？
- 首个真实支付国家与主体是什么？它决定 Stripe/PayPal/区域支付可用性。
- 商品、价格、库存、促销、订单、用户分别由哪个系统做真源？
- 公开 catalog/content 可接受的陈旧窗口和 webhook 能力是什么？它决定 `catalog/content` cache profile 是否需要收紧，而不是决定是否回到隐式缓存。

## 5. 建议的下一次产出

你完成 review 后，下一轮只做已接受决策对应的：

- ADR（每个关键选择一页）。
- P0 scope 与页面/领域模型。
- port/adapter TypeScript contract 草案。
- 目录和 import boundary 示例。
- 初始化命令、依赖精确版本和第一批验收测试。

不建议在上述内容确认前直接生成完整商城代码，否则会把待确认的后端、市场和部署假设固化到模板中。
