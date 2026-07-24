# E-pig 目标架构与技术选型

更新日期：2026-07-19

状态：accepted

## 1. 设计目标

优先级从高到低：可复制、可本地运行、可用 Docker 部署、第三方可替换、SEO/性能正确、核心交易安全、工具链轻量、最后才是企业级扩展能力。

### 非目标

- P0 不做完整 commerce backend、ERP、OMS、库存真源或支付账本。
- P0 不做 POS、多租户 SaaS、复杂 CMS page builder、实时个性化或数据仓库。
- 不追求与参考工程文件结构一比一对应。

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
| 校验 | Zod 4 或 Valibot 1，二选一 | 建议 Zod 4 | adapter DTO、表单、env 共用；团队熟悉度优先 |
| 环境 | `@t3-oss/env-nextjs` | 最新兼容线 | server/client schema 与启动失败 |
| Server data | RSC + Cache Components | `cacheComponents: true`；显式 `use cache` | Next 16 默认动态，只有声明的数据才缓存 |
| Client server-state | TanStack Query 5 | 只在 cart/checkout/account 使用 | mutation、重试、失效比 Redux 轻 |
| UI state | React state；必要时 Zustand 5 | 按需安装 | drawer、筛选草稿等非服务端状态 |
| i18n | next-intl 4 | 4.x | App Router、路由 locale、消息格式 |
| 日志 | 轻量 logger facade，server 可接 Pino | Pino 9/10 兼容线 | JSON 结构与 adapter 可替换 |
| 单测 | Vitest 4 + Testing Library | 4.x | 快速、配置少 |
| API mock | MSW 2 | 2.x | 本地开发与集成测试共用契约 |
| E2E | Playwright | 当前稳定主版本 | 只覆盖核心交易旅程 |
| 构建 | Turbopack | Next 16 dev/build 默认 | 不引入 Webpack-only 插件；保留显式 Webpack 诊断脚本 |
| 质量 | ESLint flat config + Prettier | 当前兼容线 | Next/React 规则成熟；暂不引入 Nx |
| Git hooks | simple-git-hooks 或 Husky | 可选 | 只在需要提交门禁时安装 |
| 部署 | Next standalone + multi-stage Docker | Node 24 alpine/slim | 平台无关；云 adapter 是可选层 |

初始化时应使用官方脚手架产生精确兼容组合，再把所有直接依赖和 `packageManager` 写入 lockfile。本文不建议写 `latest` 到 manifest。

## 3. 仓库形态

P0 使用单应用，不上 Nx/Turborepo。公开路由目录必须等市场决策冻结后再选用下列其中一种，而不是预先创建双动态段：

```text
E-pig/
  src/
    app/                  P0 单市场时直接放公开页面；多语言/多市场时按 §8 选择一套结构
    modules/
      catalog/
      cart/
      checkout/
      order/
      account/
      content/
    core/
      contracts/
        commerce/
        capabilities/
      errors/
    adapters/
      commerce/
      payment/
      content/
      search/
      auth/
      media/
    integrations/
      analytics/
      observability/
      email/
      feature-flags/
    platform/
      config/
      consent/
      logging/
      registry.ts
    shared/
      ui/
      lib/
      test/
  public/
  tests/e2e/
  docs/
  Dockerfile
```

只有满足任一条件才升级 pnpm workspace/Turborepo：出现第二个可部署 app；adapter 需要独立发布；共享 package 被另一个仓库消费；团队并行造成边界冲突。即便升级，也优先 4–6 个 package，不回到每个 domain 三个 package。

## 4. 依赖方向

```text
app routes -> modules -> core contracts
                    ^
                    | implemented by
                 adapters -> external business APIs / SDKs

modules -> integration event facade -> optional side-effect integrations
```

规则：

- module 不能直接 import Stripe、PostHog、CMS SDK 或供应商 DTO。
- adapter 负责外部 DTO → 内部 DTO 的映射和错误归一化。
- `shared` 不能反向依赖业务 module。
- module 间优先通过显式函数/事件协作；新增 `composite` 仅用于跨 3 个以上领域的页面编排。
- 用 ESLint `no-restricted-imports` 和少量 alias 约束即可，P0 不需要 Nx graph。

## 5. Port、adapter 与 integration 的划分

P0 先定义能力 port，再定义供应商：

```text
commerce:    CatalogPort, CartPort, CheckoutPort, CustomerPort
capability:  PaymentPort, ContentPort, SearchPort, AuthPort, MediaPort
```

所有 port 的实现统一放在 `adapters/<capability>/`。因此 Stripe 是 `adapters/payment/stripe`，本地内容和 CMS 是 `adapters/content/local|payload|storyblok`；不再出现同为 port 实现、却一部分在 `commerce/providers/`、另一部分在 `integrations/` 的情况。

判定规则：

1. 页面或业务流程是否等待它的返回值来决定下一业务状态？是 → `core contract + adapter`。
2. 是否拥有、读取或转换 product、cart、payment、content、identity 等业务实体？是 → `adapter`。
3. 是否只是主流程成功后 fan-out，失败时可以降级而不改变订单/支付结果？是 → `integration`。
4. Analytics、observability、非关键通知和 feature flag 属于 integration；支付、CMS、搜索、认证、媒体属于 adapter。
5. production payment 不能使用 no-op；可选 integration 可以 no-op，但必须留下结构化日志或测试断言。

每个 port 使用统一 typed error：`validation`、`unauthorized`、`not_found`、`conflict`、`rate_limited`、`upstream`、`unknown`。UI 只处理内部错误，adapter 保存可观测的原始 cause，但不得泄露给用户。

## 6. Next 16 渲染与缓存决策

### 6.1 P0 决策

P0 **启用** `cacheComponents: true`。采用 Next 16 的显式 opt-in 模型，不再用“默认 ISR”“默认 fetch 缓存”或单参数 `revalidateTag` 来描述架构：

- `fetch` 和动态代码按 request-time 处理；只有明确写入 `'use cache'` 的共享、公开、可复用数据进入 Cache Components。
- `cookies()`、`headers()`、页面/布局/Route Handler 的 `params` 和页面 `searchParams` 全部按异步 API 使用。
- Request-time 价格、库存、cart、account 等区域放在有业务含义的 `<Suspense>` boundary 中；不得为了通过构建而给整页套一个无区分的 fallback。
- `cookies()`/`headers()` 等 request API 不能在 `'use cache'` 内读取；先在动态边界解析，再把可序列化的 market/locale/id 作为缓存函数参数。
- `proxy.ts` 只处理轻量 URL 规范化、redirect/rewrite 和必要 header；不创建购物车、不拉取商品、不做完整 session/auth。
- 价格、库存、购物车、账户、checkout、支付状态默认不缓存。之后只有在数据真源具备事件失效或允许明确陈旧窗口时，才单独提出 ADR。

建议的初始 cache profile：

```ts
// next.config.ts
const nextConfig = {
  cacheComponents: true,
  cacheLife: {
    content: { stale: 300, revalidate: 900, expire: 86_400 },
    catalog: { stale: 30, revalidate: 120, expire: 600 },
    taxonomy: { stale: 3_600, revalidate: 21_600, expire: 86_400 },
  },
}
```

这些数值是 P0 起始预算，不是供应商 SLA。每个缓存函数必须同时表达生命周期和业务 tag：

```ts
async function getProductCard(market: string, productId: string) {
  'use cache'
  cacheLife('catalog')
  cacheTag(`product:${market}:${productId}`)
  return catalog.getPublicProductCard({ market, productId })
}
```

Tag 命名约定：`content:<market>:<locale>:<slug>`、`navigation:<market>:<locale>`、`product:<market>:<id>`、`collection:<market>:<handle>`、`taxonomy:<market>`。Tag 必须稳定、大小写一致且不包含用户标识。

失效约定：

- Server Action 中用户完成一次会影响公开缓存的写操作，并要求 read-your-own-writes：`updateTag(tag)`。
- CMS/commerce webhook 的 Route Handler：`revalidateTag(tag, 'max')`，接受 stale-while-revalidate。
- 要求 webhook 后下一次请求阻塞取新值时：`revalidateTag(tag, { expire: 0 })`，必须在具体业务 ADR 中说明成本。
- 购物车、账户等私有数据不使用公共 cache tag；mutation 后更新 Query cache 或触发服务端刷新。

### 6.2 页面策略

| 场景 | Next 16 默认策略 |
| --- | --- |
| Home/Content | Server Component；稳定 CMS/local content 显式 `use cache` + `cacheLife('content')` + tag |
| PLP/Search | server-render 首屏；query string 表达筛选；分类骨架可缓存，搜索结果默认 request-time |
| PDP | server-render SEO/稳定商品描述；描述/媒体可 `catalog` cache；实时价格与库存分开动态读取 |
| Cart | 动态读取；匿名 id 只在首次 mutation 的 Server Action/Route Handler 签发，见 §7 |
| Checkout | client form + server mutation；所有敏感调用在服务端；不缓存 |
| Payment | 服务端建 session/intent；Webhook 决定最终状态；不缓存 |
| Account | provider session；私有数据 request-time；不进入共享 Cache Component |

不引入 Redux hydration。RSC 获得的首屏数据通过 props 或 Query hydration 传给必要的 client island。

### 6.3 Turbopack 与构建工具链

- `next dev`、`next build` 接受 Turbopack 默认值；`next.config.ts` 不新增无对应能力的 Webpack plugin。
- Webpack loader 通常可通过 `turbopack.rules` 迁移，但 Webpack plugin 不受支持；引入此类依赖前必须有替代方案或 ADR。
- Next 16.1+ 的常规 bundle 分析优先使用 `next experimental-analyze`；产物可输出到 `.next/diagnostics/analyze`。
- `@next/bundle-analyzer` 仅保留为显式 `next build --webpack` 的兼容/诊断脚本，不能作为默认构建门槛。
- CI 至少跑默认 Turbopack production build。若保留 Webpack fallback，可低频或发布前额外运行，防止两条工具链在 PR 上都变成硬成本。
- 不在 `package.json` 再写冗余的 `--turbopack`；如第三方偷偷注入 `webpack` 配置，默认 build 应直接暴露并处理该冲突。
- 评估第三方包时记录：是否依赖 Webpack plugin、自定义 loader、Node native binary、动态 require；这些比旧版 bundle 配置复制更重要。

## 7. 匿名购物车生命周期

Server Component 只能 `await cookies()` 读取 cookie，不能在渲染期间签发。P0 采用“首次写操作懒创建”，而不是访问 PDP/Cart 页面就创建空购物车：

1. 用户首次 `addItem` 调用 app 自有 Server Action。
2. Action `await cookies()` 读取签名的、不含 PII 的 opaque `cart_id`。
3. 没有 id 时，以客户端 request id/服务端幂等键调用 `CartPort.createCart`；随后在同一 Action 中设置 cookie，再执行 add。
4. Cookie 默认 `httpOnly: true`、`secure: production`、`sameSite: 'lax'`、`path: '/'`、有限 `maxAge`。浏览器 JS 不读取 token。
5. 重复提交和并发首加购由 commerce backend/adapter 的 idempotency contract 收敛，不能只靠前端按钮 disabled。
6. 登录合并购物车由 Server Action/Route Handler 完成，成功后旋转或删除 guest cookie。

外部客户端或纯 HTTP 接入可调用 `POST /api/cart` Route Handler，规则相同。`proxy.ts` 明确禁止创建 cart：它会把一次普通 GET 变成写操作，也会重演参考工程“市场路由 + 边缘 cookie + rewrite” 的耦合。

## 8. 多市场、多语言与公开 URL

`[market]/[locale]` 是条件性方案，不是默认目录。先冻结首发范围，再选择且只选择一种模式：

| 首发范围 | 推荐公开 URL | App Router 形态 | 建议 |
| --- | --- | --- | --- |
| 单市场 + 单语言 | `/products/...`、`/collections/...` | 无动态 market/locale 段 | **P0 默认**；最轻，未来可迁移 |
| 单市场 + 多语言 | `/<locale>/...` | `[locale]` | 每种语言使用独立 URL；建议全部显式前缀以保持对称 |
| 多市场且多数市场单语言 | `jp.example.com/...`、`au.example.com/...` | host→market；通常无 locale 段 | 可参考 Koala；清晰隔离价格/库存/内容 |
| 多市场 + 多语言且要求单域名 | `/<market>/<locale>/...` | `[market]/[locale]` | 只有明确需求时使用；组合治理成本最高 |

Koala 实测为市场子域模式：`jp.koala.com/` 对应 `ja-JP/JPY/JP`，`au.koala.com/collections/sofas-couches` 对应 `en-AU/AUD/AU`，资源路径不再重复 market/locale。E-pig 可以参考这个决策，不复制 Shopify 实现。代价是 DNS/TLS、跨 host 预览、分析归因、cookie/session 和部署配置更复杂；默认应按市场隔离 cart，不能假定 host-only cart cookie 自动跨域共享。

无论采用哪一模式，都必须只有一个 typed market registry：

```ts
const markets = {
  jp: { hosts: ['jp.example.com'], locales: ['ja-JP'], defaultLocale: 'ja-JP', currency: 'JPY' },
  au: { hosts: ['au.example.com'], locales: ['en-AU'], defaultLocale: 'en-AU', currency: 'AUD' },
  ca: { hosts: ['ca.example.com'], locales: ['en-CA', 'fr-CA'], defaultLocale: 'en-CA', currency: 'CAD' },
} as const
```

治理规则：

- 先由可信 host 解析 market，再校验 locale 是否属于该 market；`/us/zh-CN` 不能进入页面数据层。
- 未知 market/host 返回 404 或进入显式国家选择页；不能静默猜测。
- 合法 market 下出现不支持的 locale：仅在明确的旧 URL/默认语言规范化场景做 308，否则 404。所有结构性 redirect 必须单跳。
- 不根据 IP 或 `Accept-Language` 强制改写已有内容 URL；它们只能用于根入口建议，用户必须可手动切换。
- canonical 指向当前 market + locale 的唯一规范 URL；`hreflang` 只列实际存在、内容等价的页面，并包含 self-reference。可用 `x-default` 指向全球/市场选择页。
- 不用 slug 字符串推断跨市场等价页；由稳定 product/content id 建立 alternate 映射。每个 host/locale 生成自己的 sitemap。

`proxy.ts` 只做 host→内部 market context、旧 URL 单跳 308、明显无效组合拒绝。市场注册表校验必须可由纯函数单测覆盖，业务取数不能藏在 proxy 中。

## 9. Typed registry

不构建动态插件平台；注册表分为“业务能力”和“可降级副作用”：

```ts
const capabilities = {
  commerce: createCommerceAdapter(env.COMMERCE_ADAPTER),
  payment: createPaymentAdapter(env.PAYMENT_ADAPTER),
  content: createContentAdapter(env.CONTENT_ADAPTER),
}

const integrations = {
  analytics: createAnalyticsIntegration(env.ANALYTICS_INTEGRATION),
  observability: createObservabilityIntegration(env.OBSERVABILITY_INTEGRATION),
}
```

要求：

- 配置校验、lazy import、timeout、统一错误、结构化日志和 health check。
- 业务 adapter 只有在确有本地实现时才能选择 mock；production 必需能力缺失时启动失败。
- 可选 integration 禁用时使用 no-op，不在各页面散布 `if (integration)`。
- browser SDK 必须在 consent 后加载。
- 一个业务事件可 fan-out 到多个 analytics integration，但 UI 只发一次。
- adapter contract test 使用同一套测试验证 mock、自建与 SaaS 实现。

## 10. 默认实现组合

| 能力 | P0 默认 | 可选扩展 |
| --- | --- | --- |
| Commerce adapter | 内置 mock + custom REST contract | Medusa/Vendure/Shopify/custom adapter |
| Content adapter | 本地 typed JSON/MDX | Payload、Storyblok adapter |
| Search adapter | Commerce filter/search | Meilisearch、Typesense、Algolia adapter |
| Payment adapter | mock + Stripe sandbox | PayPal/区域支付 adapter |
| Auth adapter | guest + commerce session | OIDC/Auth.js/Better Auth adapter |
| Media adapter | `next/image` + local/remote URL | S3/R2/Cloudinary adapter |
| Analytics integration | no-op；可开 PostHog | GTM/GA、Klaviyo、CAPI server integration |
| Observability integration | console/JSON logger；可开 Sentry | OpenTelemetry/Datadog later |
| Email integration | 后端/no-op | Resend integration |
| Feature flag integration | local typed config | PostHog integration |

## 11. 质量门槛

- `tsc --noEmit` 与默认 Turbopack production build 不允许忽略错误。
- unit：价格、折扣、market/locale 组合、canonical/hreflang、cache tag builder、DTO mapper、错误映射。
- component：cart line、variant picker、checkout 表单关键状态。
- contract：每个 adapter 跑同一套成功/失败/timeout/invalid payload 测试。
- E2E：浏览商品 → 首次加购并签发 cookie → 刷新恢复 → checkout → Stripe sandbox；另加并发首加购与支付失败回归。
- 无真实 secret 的 CI；MSW/mock adapter 可完成全部 PR 验证。
- Lighthouse budget、Turbopack analyzer 和依赖审计在首个可运行版本后建立，不预装整套企业观测治理。

## 12. 明确不选

- 不以 Next.js 14、React 18、旧版隐式 fetch/ISR 缓存、`middleware.ts`、MUI Joy beta、Redux hydration、Nx、Redis cache handler 为新基线。
- 不将 Storyblok、Elastic、Datadog、Dynamic Yield、Klaviyo、Yotpo 设为启动必需。
- 不把 Vercel Hobby 当商业商城生产方案；可用于个人、非商业预览，商业部署走 Docker 或付费/合规平台。
- 不在第一阶段实现“万能插件市场”；typed adapter 足够且更可测试。

Next 16、Koala、参考工程的证据和迁移约束见 [07 Next 16 缓存、购物车与市场路由决策](./07-next16-cache-cart-routing-decisions.md)。
