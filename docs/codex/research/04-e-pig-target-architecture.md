# E-pig 目标架构与技术选型

更新日期：2026-07-18

状态：proposal

## 1. 设计目标

优先级从高到低：可复制、可本地运行、可用 Docker 部署、第三方可替换、SEO/性能正确、核心交易安全、工具链轻量、最后才是企业级扩展能力。

### 非目标

- P0 不做完整 commerce backend、ERP、OMS、库存真源或支付账本。
- P0 不做 POS、多租户 SaaS、复杂 CMS page builder、实时个性化或数据仓库。
- 不追求与 Joyboy 文件结构一比一对应。

## 2. 推荐基线

| 类别 | 选择 | 版本策略 | 原因 |
| --- | --- | --- | --- |
| Runtime | Node.js | 24 LTS，`.nvmrc`/engine 固定 | 2026-07 最新 LTS；部署镜像一致 |
| 包管理 | pnpm | 10.x，`packageManager` 精确固定 | 安装快、lockfile 稳定、未来可升 workspace |
| 框架 | Next.js App Router | 16.2.x Active LTS | 2026-07 官方 Active LTS；16.3 仍是 preview，不采用 |
| UI runtime | React | 由 Next 16 兼容版本精确固定 | 避免自行跨版本组合 |
| 语言 | TypeScript | 6.0.x compatibility smoke；不兼容则暂用 5.9.x，strict | 6.0 刚发布，先验证 Next/ESLint/test 生态；不忽略 build type errors |
| 样式 | Tailwind CSS 4 + CSS variables | 4.x | 小 bundle、tokens、复制组件方便 |
| 组件 | shadcn/ui 源码模式 + Radix primitives | 初始化时锁定 | 组件进入仓库，可修改、无运行时平台锁定 |
| 表单 | react-hook-form 7 | 7.x | 成熟、适合 checkout |
| 校验 | Zod 4 或 Valibot 1，二选一 | 建议 Zod 4 | provider DTO、表单、env 共用；团队熟悉度优先 |
| 环境 | `@t3-oss/env-nextjs` | 最新兼容线 | server/client schema 与启动失败 |
| Server data | RSC + `fetch`/cache tags | Next 内建 | 首页/PLP/PDP 少发客户端 JS |
| Client server-state | TanStack Query 5 | 只在 cart/checkout/account 使用 | mutation、重试、失效比 Redux 轻 |
| UI state | React state；必要时 Zustand 5 | 按需安装 | drawer、筛选草稿等非服务端状态 |
| i18n | next-intl 4 | 4.x | App Router、路由 locale、消息格式 |
| 日志 | 轻量 logger facade，server 可接 Pino | Pino 9/10 兼容线 | JSON 结构与 provider 可替换 |
| 单测 | Vitest 4 + Testing Library | 4.x | 快速、配置少 |
| API mock | MSW 2 | 2.x | 本地开发与集成测试共用契约 |
| E2E | Playwright | 当前稳定主版本 | 只覆盖核心交易旅程 |
| 质量 | ESLint flat config + Prettier | 当前兼容线 | Next/React 规则成熟；暂不引入 Nx |
| Git hooks | simple-git-hooks 或 Husky | 可选 | 只在需要提交门禁时安装 |
| 部署 | Next standalone + multi-stage Docker | Node 24 alpine/slim | 平台无关；云 adapter 是可选层 |

初始化时应使用官方脚手架产生精确兼容组合，再把所有直接依赖和 `packageManager` 写入 lockfile。本文不建议写 `latest` 到 manifest。

## 3. 仓库形态

P0 使用单应用，不上 Nx/Turborepo：

```text
E-pig/
  src/
    app/[market]/[locale]/
    modules/
      catalog/
      cart/
      checkout/
      order/
      account/
      content/
    commerce/
      contracts/          领域 DTO 与 port
      providers/
        mock/
        custom-rest/      示例/占位
      registry.ts
    integrations/
      analytics/
      payment/
      cms/
      search/
      media/
      auth/
      observability/
    shared/
      ui/
      config/
      lib/
      test/
  public/
  tests/e2e/
  docs/
  Dockerfile
```

只有满足任一条件才升级 pnpm workspace/Turborepo：出现第二个可部署 app；provider 需要独立发布；共享 package 被另一个仓库消费；团队并行造成边界冲突。即便升级，也优先 4–6 个 package，不回到每个 domain 三个 package。

## 4. 依赖方向

```text
app routes
   ↓ compose
modules (catalog/cart/checkout/...)
   ↓ depend on
commerce contracts + shared UI/config
   ↑ implemented by
provider adapters
   ↓ call
external APIs / SDKs
```

规则：

- module 不能直接 import Stripe、PostHog、CMS SDK 或供应商 DTO。
- provider 负责外部 DTO → 内部 DTO 的映射和错误归一化。
- `shared` 不能反向依赖业务 module。
- module 间优先通过显式函数/事件协作；新增 `composite` 仅用于跨 3 个以上领域的页面编排。
- 用 ESLint `no-restricted-imports` 和少量 alias 约束即可，P0 不需要 Nx graph。

## 5. Commerce contract

P0 至少定义以下 port，而不是先定义供应商：

```text
CatalogPort
  listProducts, getProduct, listCollections, suggest
CartPort
  getCart, addItem, updateItem, removeItem, applyCoupon
CheckoutPort
  getCheckout, setAddress, setShipping, placeOrder
PaymentPort
  createSession/intent, confirm, handleReturn
CustomerPort
  getSession, login/logout, profile, orders
ContentPort
  getPage, getNavigation
```

每个 port 有 typed error：`validation`、`unauthorized`、`not_found`、`conflict`、`rate_limited`、`upstream`、`unknown`。UI 只处理内部错误，provider 保存可观测的原始 cause，但不得泄露给用户。

## 6. 页面与数据策略

| 场景 | 默认策略 |
| --- | --- |
| Home/Content | Server Component；按 tag 缓存；CMS 可缺省为本地内容 |
| PLP/Search | server-render 首屏；query string 表达筛选；客户端只增强交互 |
| PDP | server-render 商品与 SEO；库存/价格可短缓存或实时 |
| Cart | cookie 中保存匿名 cart id；Query 管服务端 cart；乐观更新仅限可回滚操作 |
| Checkout | client form + server mutation；敏感调用不在浏览器直连后端密钥 |
| Payment | Stripe hosted/Elements；服务端建 session/intent；Webhook 决定最终状态 |
| Account | provider session；私有数据 `no-store` |

不引入 Redux hydration。RSC 获得的首屏数据通过 props 或 Query hydration 传给必要的 client island。

## 7. 多市场与配置

- 路由仅保留 `[market]/[locale]`；设备响应由 CSS 完成。
- 非秘密市场配置放 `markets/<market>.ts`：货币、locale、配送、功能开关、支付 provider id。
- 秘密只在 server env：API secret、Stripe secret、Webhook secret。
- 浏览器变量必须经过 public schema，命名清晰；禁止把 server secret 转成 `NEXT_PUBLIC_*`。
- provider 使用 discriminated config，例如 `PAYMENT_PROVIDER=stripe|mock`；未启用 provider 时不加载其 SDK。
- 默认提供 `.env.example`，只含名称和说明，不含可用密钥。

## 8. 第三方插件机制

不构建动态插件平台；使用静态 typed registry：

```ts
const integrations = {
  commerce: createCommerceProvider(env.COMMERCE_PROVIDER),
  payment: createPaymentProvider(env.PAYMENT_PROVIDER),
  analytics: createAnalyticsProvider(env.ANALYTICS_PROVIDER),
};
```

适配器要求：

- 配置校验、lazy import、timeout、统一错误、日志、health check。
- 禁用时使用 no-op，不在各页面散布 `if (provider)`。
- browser SDK 必须在 consent 后加载。
- 一个业务事件可 fan-out 到多个 analytics provider，但 UI 只发一次。
- provider contract test 使用同一套测试验证 mock、自建与 SaaS adapter。

## 9. 默认 provider 组合

| 能力 | P0 默认 | 可选扩展 |
| --- | --- | --- |
| Commerce | 内置 mock + custom REST contract | Medusa/Vendure/Shopify/custom adapter |
| CMS | 本地 typed JSON/MDX | Payload、Storyblok adapter |
| Search | Commerce provider filter/search | Meilisearch、Typesense、Algolia adapter |
| Payment | mock + Stripe sandbox | PayPal/区域支付 adapter |
| Auth | guest + commerce session | OIDC/Auth.js/Better Auth adapter |
| Media | `next/image` + local/remote URL | S3/R2/Cloudinary adapter |
| Analytics | no-op；可开 PostHog | GTM/GA、Klaviyo、CAPI server adapter |
| Error | console/JSON logger；可开 Sentry | OpenTelemetry/Datadog later |
| Email | 后端/no-op | Resend adapter |
| Feature flag | local typed config | PostHog adapter |

## 10. 质量门槛

- `tsc --noEmit` 与 production build 不允许忽略错误。
- unit：价格、折扣、market config、DTO mapper、错误映射。
- component：cart line、variant picker、checkout 表单关键状态。
- contract：每个 provider 跑同一套成功/失败/timeout/invalid payload 测试。
- E2E：浏览商品 → 加购 → checkout → Stripe sandbox 成功；另加支付失败回归。
- 无真实 secret 的 CI；MSW/mock provider 可完成全部 PR 验证。
- Lighthouse budget、bundle analyzer 和依赖审计在首个可运行版本后建立，不预装整套企业观测治理。

## 11. 明确不选

- 不以 Next.js 14、React 18、MUI Joy beta、Redux hydration、Nx、Redis cache handler 为新基线。
- 不将 Storyblok、Elastic、Datadog、Dynamic Yield、Klaviyo、Yotpo 设为启动必需。
- 不把 Vercel Hobby 当商业商城生产方案；可用于个人、非商业预览，商业部署走 Docker 或付费/合规平台。
- 不在第一阶段实现“万能插件市场”；typed adapter 足够且更可测试。
