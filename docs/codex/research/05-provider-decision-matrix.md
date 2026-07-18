# 第三方、开源替代与免费额度决策

更新日期：2026-07-18

状态：proposal；额度为 2026-07-18 官方页面快照，供应商可随时变更。

## 1. 决策规则

1. 开发期必须能在无付费账号下完成核心流程。
2. provider 必须可关闭、可替换、可用 mock 验证。
3. 免费额度只判断“能否完成开发”，不承诺生产成本、商业许可、数据合规或 SLA。
4. 生产选择同时评估交易地区、数据驻留、合同、退款/争议、税务、备份和退出成本。

## 2. 推荐矩阵

| 能力 | Joyboy | E-pig P0 | 开源/自建替代 | 开发期是否足够 | 生产决策 |
| --- | --- | --- | --- | --- | --- |
| Commerce API | 自有后端 | mock + custom REST port | Medusa/Vendure/Payload commerce | 是，完全本地 | 确认业务后选真源 |
| CMS | Storyblok | local JSON/MDX | Payload MIT 自建 | 是 | 内容团队出现后评估 Payload/Storyblok |
| Search | Elasticsearch + Searchkit | provider 自带/basic filter | Meilisearch/Typesense | 是 | SKU/搜索质量达到门槛再独立部署 |
| Payment | 多 provider | Stripe sandbox + mock | 无合理通用自建平替 | 是，sandbox 不移动资金 | 上线前按国家、费率、合规签约 |
| Auth | NextAuth beta + OIDC | guest/session port | Better Auth/Auth.js/Keycloak | 是 | 由 commerce/customer 真源决定 |
| Database/demo backend | 自有 API | 可选 Supabase Free | Postgres 自建 | 是 | 生产备份、休眠、出口流量另评估 |
| Media | Cloudinary/S3/CDN | local + Next Image | S3-compatible/R2/MinIO | 是 | 量大后比较 Cloudinary 与对象存储 |
| Product analytics | GTM/PostHog/DY | no-op 或 PostHog Free | PostHog self-host/Umami | 是 | 保留 consent 与采样 |
| Error monitoring | Sentry + Datadog | Sentry Free 可选 | GlitchTip/OTel stack | 是 | 多人协作或高事件量升级 |
| Email | Klaviyo | Resend Free 可选 | SMTP/Mailpit 本地 | 是 | 营销与交易邮件分开决策 |
| Consent | CookieYes | consent port + dev disabled | Klaro!/自建 UI | 开发是 | 公开生产前由法务/市场确认 CMP |
| Hosting | 企业容器/CDN | Docker 本地/任意 Node host | 自建 VPS/Kubernetes 非 P0 | 是 | 不使用 Vercel Hobby 商业生产 |

## 3. 已核对的官方免费额度

### Supabase Free

- 50,000 MAU、500 MB database、5 GB egress、1 GB file storage、最多 2 个 active project。
- 一周不活跃会暂停，适合开发/演示，不应当作无运维生产数据库。
- 结论：足够完成开发与 demo backend；核心模板仍不得依赖 Supabase 专有调用。
- 官方来源：<https://supabase.com/pricing>

### PostHog Cloud Free

- 1 个 project、无限 team member、1 年 retention。
- 每月 1M analytics events、5K session recordings、1M feature flag requests、100K exceptions。
- 结论：远超早期开发需要；默认仍为 no-op，只有配置 key 后加载。
- 官方来源：<https://posthog.com/pricing>

### Sentry Developer Free

- 1 个 user、无限 project；每月 5K errors、5 GB logs、5M spans、50 replays、1 个 uptime monitor。
- 结论：个人开发足够；团队协作和生产告警能力需重新评估。
- 官方来源：<https://sentry.io/pricing/>

### Cloudinary Free

- 3 users / 1 account、每月 25 credits；1 credit 大致对应 1,000 transformations、1 GB storage 或 1 GB image bandwidth，实际按组合消耗。
- 结论：开发样图足够；模板默认不用，以免媒体 URL 和转换参数绑定供应商。
- 官方来源：<https://cloudinary.com/pricing>、<https://cloudinary.com/documentation/billing_and_plans>

### Resend Free

- 每月 3,000 封、每日 100 封、1 个 domain、30 天 retention。
- 结论：开发交易邮件足够；本地测试优先 Mailpit，避免测试误发真实用户。
- 官方来源：<https://resend.com/pricing>、<https://resend.com/docs/knowledge-base/what-is-resend-pricing>

### Stripe sandbox

- Sandbox 使用测试 key 和测试 payment method，模拟交易不会移动资金。
- 结论：足够开发 checkout、3DS、decline、refund 等流程；不是“生产免费额度”，live 交易仍有费率、开户与地区限制。
- 官方来源：<https://docs.stripe.com/testing>

### Payload self-hosted

- Payload 为 MIT 开源，可在能运行 Node.js 的环境自托管；数据库、对象存储、邮件和 CDN 成本仍由部署方承担。
- 结论：比 Storyblok 更符合“可复制与数据可控”，但 P0 没有内容团队时 local content 更轻。
- 官方来源：<https://payloadcms.com/get-started>、<https://payloadcms.com/docs/production/deployment>

### Vercel Hobby 限制

- Hobby 为 $0，但官方条款明确仅限 personal、non-commercial use；不能作为商业电商生产默认方案。
- 结论：个人原型预览可用；公司开发/生产使用 Docker、自有环境或 Vercel Pro。
- 官方来源：<https://vercel.com/pricing>、<https://vercel.com/legal/terms>

## 4. 分阶段接入

### P0：无需购买

- mock commerce、local content、local media、no-op analytics、JSON logger。
- Stripe sandbox、MSW、Mailpit。
- 可选 Supabase Free/PostHog Free/Sentry Free/Cloudinary Free/Resend Free，任何一个都不能成为 `pnpm dev` 必需条件。

### P1：有可用商城后

- 选 commerce backend/custom API。
- 选 CMS、对象存储、交易邮件、error monitoring。
- 根据目标国家签约 live payment。
- 完成 consent/CSP/privacy review。

### P2：有流量和团队后

- 独立搜索、推荐、feature flags、客服、loyalty、营销自动化。
- Redis/CDN cache、OTel/APM、视觉回归。
- 每个 provider 以真实用量重新核价，不依据本文件旧额度自动续用。

## 5. 退出策略

- 所有外部数据先映射为内部 DTO；禁止把 Storyblok blok、Stripe object 或 PostHog payload 传遍 UI。
- 内容与商品必须有 export/backup 路径。
- analytics 事件 schema 归 E-pig 所有，供应商映射独立版本化。
- env key 按 provider 命名；删除 provider 时能搜索到全部引用。
- provider contract test 是替换供应商的验收标准。
