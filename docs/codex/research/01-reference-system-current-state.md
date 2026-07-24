# 参考工程现状与架构盘点

更新日期：2026-07-18

## 1. 项目画像

参考工程是面向多国家站点的 Castlery 电商 monorepo，不是轻量 starter。它同时承载顾客 Web 与 POS，并包含内部设计系统、领域库、CMS、搜索、营销、监控和测试基础设施。

| 维度 | 现状 |
| --- | --- |
| 仓库 | Nx 20.4.5 + pnpm workspace |
| 应用 | Next.js Web、Next.js POS、两套 Playwright E2E |
| 市场 | SG、US、AU、CA、UK |
| 路由 | Next.js 14 App Router，Server/Client Component 混合 |
| 领域 | cart、checkout、cms、composite、dy、order、others、payment、posthog、product、promotion、retails、search、tracking、user |
| 内部库 | `libs/modules`、`libs/shared`、`libs/fortress`、`packages`、`tools` 共 60+ Nx 项目 |
| 代码规模抽样 | `libs/modules` 约 2100 个 TS/TSX；`libs/shared` 约 555；Fortress 约 594；Web App 约 244 |
| 直接依赖 | 根 runtime 90、dev 132；全仓 71 份 `package.json` |
| 构建资源 | Web build 12 GB Node heap；Storybook 16 GB；本地 Web serve 8 GB |

这组数据说明参考工程的很多技术是“规模产生后的治理工具”，不能直接当成新商城的最小起点。

## 2. 目录与边界

```text
apps/
  web/                 顾客商城
  pos/                 门店 POS
  web-e2e/             Web Playwright
  pos-e2e/             POS Playwright
libs/
  fortress/            内部组件库，基于 MUI Joy/Material + Emotion
  modules/<domain>/
    components/        UI 与交互
    services/          API、listener、helper、业务编排
    domain/            entity、slice、事件、类型
  shared/              跨领域组件、Redux、持久化、隐私、SEO、可观测性、工具
  config/              市场、环境、feature 配置
packages/
  monorepo-i18n/
  monorepo-features/
tools/                 Nx 插件、Storyblok/Storybook 工具、观测 lint
```

### 2.1 依赖规则

参考工程通过 `@nx/enforce-module-boundaries` 以 error 级别约束依赖方向：

```text
app / cms / composite
          ↓
components → services → domain → config / util
     ↓          ↓          ↓
shared-components / shared-services / shared-domain
     ↓
base-components (Fortress)
```

价值在于依赖方向明确；代价是简单功能也常跨 3 个 package、多个 barrel export 和路径别名。E-pig 应继承“方向”，暂不继承“每层独立发布单元”。

### 2.2 业务模块

- 核心交易：product、cart、checkout、payment、order、user。
- 内容增长：cms、promotion、search、dy、posthog、tracking。
- 组合层：composite 聚合多个普通领域，避免领域间任意互相引用。
- 其他：retails、others。
- payment 已出现 `actions` 和 `infrastructure`，说明三层模型正因复杂业务继续扩张。

## 3. 主要技术选型

| 类别 | 参考工程选择 | 用途 |
| --- | --- | --- |
| 运行时 | Node 20.9.0 | 构建和 Next.js server |
| 包管理 | pnpm 9.15.4 | workspace、lockfile、依赖安装 |
| Monorepo | Nx 20.4.5 | 项目图、边界、affected、缓存、生成器 |
| Web | Next.js 14.2.35 + React 18.3.1 | App Router、RSC、SSR/ISR、Server Actions |
| 语言 | TypeScript 5.7.3 | 全仓类型系统 |
| UI | Fortress + MUI Joy beta + MUI Material + Emotion | 设计系统与组件 |
| 状态/API | Redux Toolkit 2.5.1、RTK Query、react-redux、next-redux-wrapper、SWR | 客户端全局状态、服务端状态缓存 |
| 表单/校验 | react-hook-form 7.51.3、Valibot 1.4.2、`@t3-oss/env-nextjs` | 表单与环境校验 |
| CMS | Storyblok React 4.3.4 | 页面内容与动态组件 |
| 搜索 | Elasticsearch 8.18.2 client、Searchkit、InstantSearch | PLP/站内搜索 |
| 缓存 | Redis 4.7.0 + `@neshca/cache-handler` | Next 生产缓存 handler |
| 国际化 | i18next、react-i18next、ICU、next-i18n-router | 多市场/多语言 |
| 支付 | Stripe、PayPal、Affirm、Zip 等 | 多市场支付方式 |
| 监控 | Sentry、Datadog RUM、dd-trace、Pino、web-vitals | 错误、性能、日志、追踪 |
| 分析 | GTM、PostHog、Dynamic Yield、多渠道 CAPI | 事件、实验、个性化、归因 |
| 单测 | Jest 29 + Testing Library + MSW | unit/integration/component |
| E2E | Playwright + Cucumber/playwright-bdd | 关键旅程 |
| 组件文档 | Storybook 8.6 + Chromatic | 组件开发与视觉回归 |
| 代码质量 | ESLint 8、Prettier 2、Husky 9、lint-staged | lint、格式化、提交门禁 |
| 打包 | Next/Nx/SWC/Webpack，部分库 Rollup/Vite | 应用与内部库构建 |
| 发布 | GitHub Actions、release-please、Nx release、Docker standalone | CI/CD 与镜像 |

## 4. 渲染、数据和缓存

- App Router 默认使用 Server Components；交互区域拆为 Client Components。
- Home、PLP、PDP 以服务端抓取为主；Cart、Checkout 更依赖 Redux/RTK Query 和客户端交互。
- Next 生产配置为 `output: 'standalone'`，可构建 Node Docker 镜像。
- 生产关闭 Next 默认内存缓存，改用 Redis cache handler。
- 远程媒体主要来自 Cloudinary、S3、CloudFront 与自有图片域名。
- 多市场环境分别存在 `.env.development.{us,sg,au,ca,uk}`，构建前通过脚本初始化秘密配置。
- `next.config.js` 包含 bundle analyzer、Sentry source map、内部 package 优化、构建期 bloom filter、资产前缀、重定向和图片域名。

## 5. 横切设计

### 5.1 Tracking

参考工程已形成值得保留的单向链路：

```text
UI → 领域交互事件 → tracking listener → channel trigger → 第三方
```

UI 不直接调用 GTM、DY、Klaviyo、CAPI 等 SDK；事件 payload 必须携带 trigger 所需数据。这个思想适合 E-pig，但可用更小的 typed event bus + integration facade 实现，不需要 Redux listener 起步。

### 5.2 可观测性

- Sentry 负责异常与 trace，具有统一包装、page/domain tag、采样和错误分类。
- Datadog 同时承担 RUM 与 server trace。
- Pino 用于结构化日志。
- 有独立 ESLint 插件、diff lint 和 Sentry E2E，治理成熟但成本高。

E-pig P0 只需要结构化 logger + 可选 Sentry adapter，不应同时接 Datadog。

### 5.3 多市场

- 国家、货币、时区、支付、保修、功能开关和 API host 都按市场变化。
- 路由中同时出现 device theme、region、locale，导致路径结构和页面组合复杂。
- E-pig 应保留 market/locale，使用响应式 CSS 代替 device theme 路由维度。

## 6. 配置清单

| 配置 | 文件/机制 |
| --- | --- |
| Node/pnpm | `.nvmrc`、`packageManager` |
| workspace | `pnpm-workspace.yaml` |
| Nx | `nx.json`、各 `project.json`、tags |
| TypeScript | `tsconfig.base.json`、各项目 tsconfig、约 80 个 alias |
| ESLint | `.eslintrc.base.json`、项目 `.eslintrc.json` |
| Prettier | `.prettierrc`、`.prettierignore` |
| Git hooks | `.husky`、`.lintstagedrc.json` |
| Next | Web/POS `next.config.js` |
| 测试 | `jest.preset.js`、Jest configs、Playwright configs、MSW setup |
| Storybook | Fortress/host `.storybook`、Chromatic config |
| 环境 | `libs/config/src/ec-env.ts`、市场 env 文件、AWS Secrets Manager 脚本 |
| Docker | Web/POS standalone Dockerfile |
| CI/CD | 20 个 GitHub workflow，按市场维护 test/uat 部署 |
| 发布 | release-please、Nx release |
| 本地代理 | HTTPS 代理与证书脚本 |
| 私有包 | GitHub Packages、Verdaccio 本地 registry |

值得单独修正的遗留信号：`.nvmrc` 要求 Node 20.9.0，但 `.pnpmrc` 仍出现 `node-engine=">=8 <9"`；Next 配置允许忽略 production TypeScript build errors；部分工具版本与 runtime 版本存在跨代组合。这些都不应进入新模板。

## 7. 对 E-pig 的可继承与应删除项

### 必须继承

- 按 catalog/cart/checkout/order/account/content 划分业务边界。
- 服务端优先、客户端交互最小化。
- 业务代码依赖内部 port，不依赖第三方 SDK。
- 市场配置与秘密配置分离并校验。
- payment、checkout、tracking 有明确事件和失败路径。
- Docker 可移植部署、关键流程 E2E、结构化日志。

### P0 删除或延后

- Nx 与 60+ 独立项目。
- Web + POS 双应用。
- 每个 domain 强制拆 components/services/domain 三个 package。
- Redux 作为所有状态与事件的中枢。
- Redis 自定义 Next cache handler。
- Storybook + Chromatic 作为开发前置条件。
- Sentry + Datadog 双栈以及自定义观测 ESLint 插件。
- Storyblok、Dynamic Yield、Klaviyo、Yotpo、Gladly 等 SaaS 硬依赖。
- 多支付、多归因渠道、多市场独立 CI workflow。

## 8. 风险结论

1. 参考工程的最大价值是成熟边界与真实电商场景，不是依赖数量。
2. 如果 E-pig 直接复制 Nx/Redux/Storyblok/Redis，会在业务成立前先承担平台维护成本。
3. 如果过度“轻量”而取消 commerce port、支付服务端边界、事件模型和市场配置，又会失去可替换性。
4. 正确折中是单应用垂直切片 + adapter seam；等出现第二应用、第二团队或独立发布需求后再拆 workspace package。
