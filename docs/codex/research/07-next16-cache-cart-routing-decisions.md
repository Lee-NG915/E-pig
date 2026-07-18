# Next 16 缓存、购物车与市场路由决策

更新日期：2026-07-18

状态：proposal

## 1. 本轮结论

| 问题 | 决策 |
| --- | --- |
| P0 是否启用 Cache Components | 是，`cacheComponents: true`；缓存必须逐函数/组件显式 opt-in |
| 哪些数据缓存 | 公开 content、navigation、taxonomy、稳定 catalog 展示数据；价格/库存/购物车/账户/checkout/支付不缓存 |
| 如何表达缓存 | `'use cache'` + `cacheLife(<profile>)` + `cacheTag(<business-key>)`，三者共同评审 |
| 谁签发匿名 cart cookie | 首次 `addItem` Server Action；HTTP 客户端可走 `POST /api/cart` Route Handler |
| `proxy.ts` 做什么 | 轻量 host/路径规范化与 redirect/rewrite；不创建 cart、不取商品、不做完整认证 |
| 路由默认 | 单市场单语言 P0 无 market/locale 前缀；范围确认后再升级 |
| Koala 是否可参考 | 可参考“市场子域 + 市场默认语言 + 稳定资源路径”，不复制 Shopify 主题/实现 |
| provider/integration 边界 | 业务流等待结果 → port/adapter；可降级 fan-out → integration |

## 2. 为什么旧描述不成立

Next 16 的 Cache Components 是显式 opt-in。启用后，动态代码仍在请求时运行，只有声明 `'use cache'` 的部分被缓存；`fetch` 不能再被文档笼统描述为“默认可 ISR/按 tag 缓存”。同时：

- `cookies()`、`headers()`、`draftMode()`、`params`、`searchParams` 已全面异步。
- Cache Components 页面中的 request-time 区域需要有意设计 `<Suspense>` boundary；request API 不能在 `'use cache'` 内读取。
- `middleware.ts` 改名为 `proxy.ts`，且 Proxy 使用 Node.js runtime，不支持 Edge runtime。
- Turbopack 是 `next dev` 和 `next build` 默认 bundler；Webpack-only plugin 不能直接迁移。
- 单参数 `revalidateTag(tag)` 是 deprecated；webhook 应明确使用 `revalidateTag(tag, 'max')` 或明确 expire 行为。

因此 E-pig 不使用“ISR 式短缓存”作为设计语言，而使用“什么数据、哪个 profile、哪个业务 tag、由什么事件失效”。

## 3. 缓存矩阵与失效责任

| 数据 | 默认 | 生命周期 | Tag | 失效来源 |
| --- | --- | --- | --- | --- |
| 本地/CMS 页面 | cache | `content` | `content:<market>:<locale>:<slug>` | CMS webhook `revalidateTag(..., 'max')` |
| 导航 | cache | `content` | `navigation:<market>:<locale>` | CMS webhook |
| taxonomy | cache | `taxonomy` | `taxonomy:<market>` | commerce webhook/deploy |
| 商品稳定展示字段 | cache | `catalog` | `product:<market>:<id>` | commerce webhook |
| collection 稳定字段 | cache | `catalog` | `collection:<market>:<handle>` | commerce webhook |
| 实时价格/库存 | request-time | 无 | 无 | 真源实时返回 |
| 搜索结果 | request-time | 无 | 无 | 每次查询 |
| cart/account/checkout/payment | request-time/private | 无共享 tag | 无 | mutation/Query cache/refresh |

`cacheLife` 的三个值需要按 Next 16 语义理解：`stale` 控制客户端导航可直接使用多久，`revalidate` 控制服务端何时后台更新，`expire` 是未成功刷新时的最长有效期。初始值只是性能预算，必须在接入真实 adapter 后用新鲜度要求、webhook 延迟和故障策略校准。

## 4. 匿名购物车时序

```text
PDP Server Component
  └─ 可读已有 cart cookie，但不写

用户点击 Add to cart
  └─ Server Action addItem
       ├─ const cookieStore = await cookies()
       ├─ cookieStore.get('cart_id')
       ├─ 无 id → CartPort.createCart(idempotencyKey)
       ├─ cookieStore.set(signed opaque id)
       ├─ CartPort.addItem(cartId, line, idempotencyKey)
       └─ 返回 normalized cart / 更新客户端 Query state
```

为什么不在 Proxy 创建：

- 普通 GET 不应产生大量空购物车。
- Proxy 不适合慢数据获取或完整 session 管理。
- host/locale redirect、cookie 写入和 commerce API 一旦串成链，测试与失败恢复都会复杂化。
- cookie 必须在 HTTP streaming 前写；Server Action/Route Handler 是明确的 response 边界。

`createCart + addItem` 最好由后端提供原子或幂等语义；如果只能分两次调用，adapter 必须复用同一个 operation id，并允许清理孤儿空 cart。前端的 disabled/loading 只改善体验，不是幂等保证。

## 5. Koala 路由实测与可借鉴范围

2026-07-18 实测：

| URL | 市场信号 | 路由含义 |
| --- | --- | --- |
| `https://jp.koala.com/` | `content-language: ja-JP`，`localization=JP`，`cart_currency=JPY` | host 表达日本市场，语言和币种由市场隐含 |
| `https://au.koala.com/collections/sofas-couches` | `content-language: en-AU`，`localization=AU`，`cart_currency=AUD` | host 表达澳洲，`/collections/...` 保持 commerce 资源语义 |

响应头还表明两站由 Shopify 驱动。这只能证明公开 URL 和本地化行为，不能推出其内部前端架构。

可借鉴：

- host 只表达 market，不在每个 path 重复 market。
- 单语言市场不额外暴露 locale 段。
- `/collections/...`、`/products/...` 等资源路径在不同市场保持同一结构。
- 市场切换是显式链接，不把用户永久锁在 IP 推断结果里。

不可忽略的成本：

- 每个子域的 DNS/TLS、预览环境、CSP、回调 URL 和监控归属。
- host-only cookie 不共享；即使把部分 cookie 设为 `.example.com`，市场 cart 是否可合并仍是业务问题。
- 各市场商品 id/slug、价格、库存和促销可能不同，alternate URL 必须用稳定映射生成。
- 跨子域 analytics attribution 和 consent 状态需要单独验证。

结论：如果 P0 只有一个市场，先用无前缀路由；如果上线即多市场且一市场一语言，Koala 模式优于 `[market]/[locale]`；如果同一市场有多语言，再在该市场 host 下加显式 locale 路径。

## 6. URL 治理验收表

| 输入 | 预期 |
| --- | --- |
| 已知 host + 默认 locale 内容 | 200，self canonical，正确 `lang`/currency |
| 未知 host/market | 404 或显式 country selector，不猜测 |
| 已知 market + 不支持 locale | 404；只有已登记旧 URL 才 308 |
| 非规范大小写、尾斜杠或旧结构 | 单跳 308 到唯一规范 URL |
| 有等价的跨市场/语言页面 | self + 全量互返 hreflang，绝对 HTTPS URL |
| 无等价商品/页面 | 不生成虚假 hreflang |
| 全球入口 | 可作为 `x-default`，不自动把 crawler 重定向到 IP 市场 |

Google 建议多语言版本使用不同 URL 和 `hreflang`，避免按推测语言自动强制跳转；同语言多地区近似内容应配合 canonical 与 hreflang。E-pig 的 URL 测试应把这些规则当成可验证输出，而不只检查页面能打开。

## 7. Joyboy 证据与取舍

Joyboy 已经有 `REGIONAL_SUPPORTED_LOCALES` 以及“数组首项为默认 locale”的约束，这部分思想应继承；但这些规则与 device/region/locale 解析、地理信息、country select、cookie/header 和 rewrite 混在 middleware 链中。当前 `apps/web/middleware.ts` 串联 13 个 active middleware，典型路径包括：

- `apps/web/middleware/constants.ts`：region→locales 和默认 locale。
- `apps/web/middleware/middlewares/paramResolverMiddleware.ts`：region/locale/device 与 cookie/header 解析。
- `apps/web/middleware/middlewares/geoLocationMiddleware.ts`：地理 header/cookie。
- `apps/web/middleware/middlewares/countrySelectMiddleware.ts`：国家选择与 redirect/rewrite。
- `apps/web/middleware/middlewares/rewriteMiddleware.ts`：内部路径 rewrite。
- `libs/shared/persistence-kit/src/lib/persistenceHandles.ts`：`xCartToken` cookie handle。

E-pig 继承的是 typed market registry、明确默认 locale、匿名 token 持久化和 adapter 思路；不继承 middleware 链。路由校验优先纯函数，Proxy 只调用无 I/O 的解析/规范化逻辑，购物车 cookie 进入 Server Action/Route Handler。

## 8. Adapter 与 integration 示例

| 外部能力 | 分类 | 原因 |
| --- | --- | --- |
| Commerce REST/Shopify/Medusa | adapter | 返回商品、购物车和 checkout 业务实体 |
| Stripe | adapter | 返回 payment session/intent，结果决定交易状态 |
| Payload/Storyblok/local MDX | adapter | 返回页面/导航内容，页面等待其结果 |
| Meilisearch/Algolia | adapter | 返回搜索业务结果 |
| Auth/OIDC | adapter | 返回身份/session，决定权限 |
| PostHog/GA | integration | 业务事件 fan-out；不可阻塞 add-to-cart/order |
| Sentry/OTel | integration | 可观测副作用；失败不改变业务结果 |
| 营销邮件 | integration | 主交易完成后的副作用；可靠投递应由后端/outbox 承担 |

## 9. 主要来源

- [Next.js 16 发布说明](https://nextjs.org/blog/next-16)
- [Next.js 16 升级指南](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Cache Components 配置](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
- [`cacheLife` API](https://nextjs.org/docs/app/api-reference/functions/cacheLife)
- [`cacheTag` API](https://nextjs.org/docs/app/api-reference/functions/cacheTag)
- [`revalidateTag` API](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
- [`updateTag` API](https://nextjs.org/docs/app/api-reference/functions/updateTag)
- [`cookies` API](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Proxy 指南](https://nextjs.org/docs/app/getting-started/proxy)
- [Turbopack API](https://nextjs.org/docs/app/api-reference/turbopack)
- [Next.js package bundling / analyzer](https://nextjs.org/docs/pages/guides/package-bundling)
- [Google 多地区、多语言站点指南](https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites)
- [Koala 日本站](https://jp.koala.com/)
- [Koala 澳洲 sofa collection](https://au.koala.com/collections/sofas-couches)
