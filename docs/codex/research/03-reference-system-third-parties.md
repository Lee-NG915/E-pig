# 参考工程第三方与基础设施清单

更新日期：2026-07-18

## 1. 原则

本清单综合 manifest、环境 schema、应用配置、集成源文件和参考工程原有第三方文档。`存在配置/代码` 不等于所有市场都启用，也不等于 E-pig 必须采用。

## 2. 内容、媒体、搜索与缓存

| 服务 | 参考工程用途 | 接入形态 | E-pig 判断 |
| --- | --- | --- | --- |
| Storyblok | 页面、导航、CMS block、Webhook、fallback | SDK + API + token | 不作为 P0 硬依赖；保留 CMS port |
| Cloudinary | 图片上传、转换、CDN | SDK + remote image | 可选 provider；默认先用 Next Image + 本地/S3 兼容存储 |
| AWS S3 / CloudFront | 静态图片与资产分发 | 远程域名/CDN | 部署 provider，不写入业务层 |
| Elasticsearch | 商品搜索 | server credentials + Searchkit | P0 不自建 ES；先用 commerce API 搜索，后续 Meilisearch/Typesense |
| Searchkit / InstantSearch | 搜索 UI、facet | React SDK | 不复制；内部 Search DTO + UI |
| Redis | Next route/ISR cache | 自定义 cache handler | P0 不需要；先用 Next 16 内建 Cache Components，只有共享/容量证据出现后再评估 Redis |

## 3. 支付、分期、保修

| 服务 | 用途/市场信号 | E-pig 判断 |
| --- | --- | --- |
| Stripe | Payment Element、Express Checkout、Afterpay 等 | P0 唯一支付 adapter；只启用 sandbox |
| PayPal | PayPal provider/element | adapter 预留，P1 再接 |
| Affirm | 分期 | adapter 预留，按市场和商业合同接入 |
| Zip | 分期 | adapter 预留，按市场接入 |
| GrabPay | Checkout callback/页面 | 不进入通用 P0 |
| Mulberry | 保修方案 | 仅定义 warranty provider port |
| Guardsman | 保修 widget | 仅定义 warranty provider port |
| 自有 instalment/SPL | 分期支付流程 | 视为后端/市场特有实现，不复制 |

支付的订单金额、库存锁定、Payment Intent、Webhook 验签和最终订单状态必须在受信任服务端完成，前端 adapter 不能成为交易真源。

## 4. 身份、风控与用户通信

| 服务 | 参考工程用途 | E-pig 判断 |
| --- | --- | --- |
| NextAuth/Auth.js beta | OAuth/session | 不直接复制；先定义 Auth port，确认后端身份源后再选 |
| UMS OIDC | 企业用户系统 | OIDC adapter 预留 |
| Google/Facebook/Apple OAuth | 社交登录 | P1 provider |
| Google reCAPTCHA | 风控/表单 | P1，先用 honeypot/rate limit；生产按风险启用 |
| Klaviyo | 表单、Onsite、营销事件 | 不进入 P0；Email/Marketing event port |
| Gladly / Freshchat | 客服与帮助中心 | 不进入 P0；support widget slot |
| Yotpo | Loyalty、referral、widget | 不进入 P0；loyalty port |
| Friendbuy | Referral | 不进入 P0 |
| Hullabalook | Room designer iframe | 业务特定，不复制 |
| Google Maps API | 地址/地图能力 | checkout address provider 可选 |

## 5. 分析、营销、隐私与验证

| 服务 | 参考工程用途 | E-pig 判断 |
| --- | --- | --- |
| Google Tag Manager / GA | 全局事件和渠道脚本 | P1；通过 analytics adapter，禁用时零 SDK |
| Dynamic Yield | 个性化、活动、推荐 | 不进入 P0；推荐 provider port |
| PostHog | 产品分析、服务端/客户端事件 | 可作为 P0 可选插件和本地 feature flag provider |
| Facebook CAPI | 转化事件 | P1，由服务端转发 |
| Pinterest CAPI | 转化事件 | P1，由服务端转发 |
| UTT Impact | 联盟归因 | P1/P2，按市场启用 |
| Emplifi UGC | UGC 与转化 | 不进入通用 P0 |
| PTengine | 分析/体验 | 不进入 P0 |
| Podsights | Podcast pixel | 不进入 P0 |
| CookieYes | Consent Management Platform | P0 只提供 consent port；公开生产前必须选 CMP/合规方案 |
| Trustpilot / Pinterest / Facebook verification | 域名 metadata | 配置化 metadata，不绑定 SDK |
| Google Merchant / Customer Reviews | 商户与评论 | P1 配置化插件 |

值得继承的是参考工程的 tracking 单向事件流，而不是具体供应商。E-pig 内部事件名应保持业务语义，例如 `product_viewed`、`cart_item_added`、`checkout_started`；provider 自己映射 GA/PostHog/Klaviyo 格式。

## 6. 可观测性与交付平台

| 服务 | 参考工程用途 | E-pig 判断 |
| --- | --- | --- |
| Sentry | error、trace、release、source map | P0 可选，默认 sample 且可完全关闭 |
| Datadog RUM | 浏览器性能 | P0 不接 |
| Datadog dd-trace | Node tracing | P0 不接 |
| Pino | 结构化日志 | 保留一个轻量 logger facade |
| Chromatic | Storybook 视觉回归 | P1，组件规模达到门槛后引入 |
| Nx Cloud | task cache | 不采用；单应用无需 |
| GitHub Packages | 私有 npm registry | 不采用作为模板前置 |
| Verdaccio | 本地 registry | 不采用 |
| AWS Secrets Manager | 构建时秘密注入 | provider 预留；P0 使用部署平台 secrets/env |
| GitHub Actions | CI/CD | 保留一条通用 workflow，不按市场复制 10 条 |
| Docker | standalone Node 部署 | 作为权威、可移植部署产物保留 |

## 7. 环境配置族

参考工程的环境键可归为以下类别；这里只列类别与典型名称，不记录值：

- 核心：`APPLICATION_ENV`、`NEXT_PUBLIC_API_HOST`、`NEXT_PUBLIC_BASE_URL`、`NEXT_PUBLIC_COUNTRY`、`NEXT_PUBLIC_LOCALE`、`NEXT_PUBLIC_CURRENCY`、`NEXT_PUBLIC_CHANNEL`。
- 资产/缓存：`ASSETS_PATH`、`NEXT_PUBLIC_ASSETS_PATH`、`REDIS_URL`。
- 身份：`AUTH_SECRET`、UMS/OIDC、Google/Facebook/Apple client id。
- 搜索：`ELASTICSEARCH_HOST`、`ELASTICSEARCH_USERNAME`、`ELASTICSEARCH_PASSWORD`。
- CMS：Storyblok token、revalidate、webhook secret。
- 支付/保修：Affirm、Zip、Mulberry、Guardsman、instalment。
- 监控：Sentry DSN/auth token、Datadog app/client token、log level。
- 分析营销：GTM、DY、PostHog、Klaviyo、Yotpo、Impact、CAPI、PTengine。
- 客服/隐私：Gladly、Freshchat、CookieYes、reCAPTCHA。

E-pig 不应复制这份大 env 表。每个 provider 由独立 schema 管理，只有启用 provider 时才要求它的变量。

## 8. 主要耦合风险

1. 同一能力存在多供应商，容易在 UI 中出现条件分支和 bundle 污染。
2. 全局公开环境变量数量大，容易把“配置”与“秘密”混淆。
3. SaaS 脚本会影响 consent、CSP、性能、错误噪声和测试稳定性。
4. 多市场分别构建增加配置漂移；E-pig 应优先 runtime market config。
5. 免费额度不等于生产合规、SLA 或商业许可；公开商城上线前必须重新评估。
