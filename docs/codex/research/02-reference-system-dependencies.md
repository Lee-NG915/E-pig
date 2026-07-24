# 参考工程依赖与版本清单

更新日期：2026-07-18

## 1. 口径

- 版本来自参考工程快照 `5ad622b…` 的直接 manifest 声明，不代表 lockfile 的最终解析版本。
- `^`、`~`、`*` 保持原样，便于识别约束强度。
- 根 `package.json` 有 90 个 runtime、132 个 dev dependency；全仓 71 份 manifest、289 个不同包名。
- 本文列出所有架构相关 runtime 与开发工具族。大量 `@types/*`、内部 `@castlery/*` 0.0.1 包和工具的间接依赖不逐项解释；精确解析以 `pnpm-lock.yaml` 为准。

## 2. 基础版本

| 项目 | 声明版本 |
| --- | --- |
| Node | 20.9.0 |
| pnpm | 9.15.4 |
| Nx | 20.4.5 |
| Next.js | 14.2.35 |
| React / React DOM | 18.3.1 / 18.3.1 |
| TypeScript | 5.7.3 |
| Web / POS / Fortress | 1.98.0 / 1.75.0 / 0.65.0 |

## 3. 根 runtime 依赖

### 3.1 框架、状态、网络与缓存

| 包 | 版本 | 作用 |
| --- | --- | --- |
| `next` | `14.2.35` | Web 框架 |
| `react`, `react-dom` | `18.3.1` | UI runtime |
| `server-only` | `^0.0.1` | server-only 边界标记 |
| `@reduxjs/toolkit` | `^2.5.1` | Redux、RTK Query |
| `react-redux` | `^9.1.2` | React binding |
| `next-redux-wrapper` | `^8.1.0` | Next/Redux 集成 |
| `swr` | `^2.2.5` | 客户端数据抓取 |
| `redis` | `^4.7.0` | Redis client |
| `@neshca/cache-handler` | `^1.7.4` | Next Redis cache handler |
| `graphql` | `^16.9.0` | GraphQL 基础 |
| `async-mutex` | `^0.4.1` | 并发控制 |
| `opossum` | `^9.0.0` | circuit breaker |
| `bloom-filters` | `^3.0.2` | bloom filter |

### 3.2 UI、表单与浏览器能力

| 包 | 版本 |
| --- | --- |
| `@emotion/cache` / `@emotion/react` / `@emotion/styled` | `^11.11.0` / `^11.11.4` / `^11.11.0` |
| `@mui/types` | `^7.4.1` |
| `clsx` | `^2.1.1` |
| `react-hook-form` | `^7.51.3` |
| `react-imask` | `^7.6.0` |
| `@use-gesture/react` | `^10.3.1` |
| `react-intersection-observer` | `^9.16.0` |
| `react-player` | `^2.16.0` |
| `react-slick` | `^0.30.2` |
| `react-spring` | `^10.0.1` |
| `react-use` | `^17.5.0` |
| `swiper` | `^11.2.10` |
| `nextjs-toploader` | `^3.7.15` |
| `qrcode.react` | `^4.2.0` |
| `html2canvas` | `^1.4.1` |
| `html5-qrcode` | `^2.2.1` |
| `lazysizes` | `^5.3.2` |
| `pdf-lib` | `^1.17.1` |
| `xlsx` | `^0.18.5` |

### 3.3 环境、认证、校验与隐私

| 包 | 版本 |
| --- | --- |
| `@t3-oss/env-nextjs` | `^0.13.11` |
| `valibot` | `^1.4.2` |
| `next-auth` | `^5.0.0-beta.4` |
| `oidc-client-ts` | `^3.5.0` |
| `cookies-next` | `^4.3.0` |
| `js-cookie` | `^3.0.5` |
| `crypto-js` | `4.2.0` |
| `crypto` | `^1.0.1` |
| `base-64` | `^1.0.0` |
| `uuid` | `^10.0.0` |
| `ua-parser-js` | `1.0.35` |
| `postcode-validator` | `^3.10.3` |
| `google-libphonenumber` | `^3.2.42` |

### 3.4 日期、货币与国际化

| 包 | 版本 |
| --- | --- |
| `i18next` | `^23.11.5` |
| `react-i18next` | `^14.1.2` |
| `i18next-browser-languagedetector` | `^8.0.0` |
| `i18next-fs-backend` | `^2.6.0` |
| `i18next-resources-to-backend` | `^1.2.1` |
| `next-i18n-router` | `^5.5.1` |
| `@formatjs/intl-localematcher` | `^0.5.4` |
| `date-fns` | `^4.1.0` |
| `date-fns-tz` | `^3.2.0` |
| `@date-fns/tz` | `^1.2.0` |
| `dayjs` | `1.10.7` |
| `luxon` | `^3.5.0` |
| `moment-timezone` | `^0.5.45` |
| `currency.js` | `^2.0.4` |
| `negotiator` | `^0.6.3` |

### 3.5 商业集成、监控与分析 SDK

| 包 | 版本 |
| --- | --- |
| `@stripe/react-stripe-js` | `^5.4.1` |
| `@stripe/stripe-js` | `^8.6.1` |
| `@paypal/react-paypal-js` | `^8.8.3` |
| `@sentry/nextjs` | `^10.43.0` |
| `@datadog/browser-rum` | `^5.18.0` |
| `dd-trace` | `^5.24.0` |
| `posthog-js` | `^1.194.3` |
| `posthog-node` | `^4.3.2` |
| `next-cloudinary` | `^6.16.0` |
| `@next/third-parties` | `^14.1.4` |
| `web-vitals` | `^5.3.0` |

### 3.6 工具型 runtime

| 包 | 版本 |
| --- | --- |
| `date-fns` / `lodash.clonedeep` / `lodash.debounce` / `lodash.throttle` | `^4.1.0` / `^4.5.0` / `^4.0.8` / `^4.1.1` |
| `schema-dts` | `^1.1.2` |
| `tslib` | `^2.7.0` |
| `undici-types` | `^7.8.0` |
| `rollup-plugin-preserve-directives` | `^0.4.0` |
| `chromatic` | `^11.28.2` |
| `create-nx-workspace`, `@nx/devkit` | `20.4.5` |

## 4. 子包新增的关键依赖

根 manifest 不能反映全部技术，以下依赖只在特定库中声明：

| 能力 | 包与版本 |
| --- | --- |
| 设计系统 | `@mui/joy ^5.0.0-beta.30`、`@mui/material ^5.15.3`、`@mui/base ^5.0.0-beta.40`、`@mui/system ^5.15.15` |
| CMS | `@storyblok/react 4.3.4`、`@storyblok/richtext ^3.0.0`、`storyblok ^3.35.2` |
| 媒体 | `@cloudinary/react 1.11.2`、`@cloudinary/url-gen 1.10.0` |
| 搜索 | `@elastic/elasticsearch ^8.18.2`、`searchkit ^4.15.0`、`@searchkit/api 4.11.1`、`react-instantsearch ^7.17.0`、`instantsearch.js ^4.81.0` |
| 日志 | `pino ^9.10.0` |
| i18n | `i18next-icu ^2.3.0`、`locale-currency ^0.0.4` |
| CMS UI | `react-lazyload ^3.2.1`、`stickybits ^3.7.11` |
| Product UI | `react-autosuggest ^10.0.4` |
| Fortress | `react-datepicker ^6.3.0`、`react-day-picker ^9.9.0` |

## 5. 开发、构建与测试工具

| 工具族 | 声明版本 |
| --- | --- |
| Nx plugins | `@nx/{devkit,eslint,eslint-plugin,jest,js,next,playwright,plugin,react,rollup,storybook,vite,web,workspace}` 全部 `20.4.5` |
| TypeScript | `5.7.3` |
| ESLint | `8.57.0`；typescript-eslint `7.18.0`；React `7.35.0`；hooks `5.0.0`；import `2.31.0`；jsx-a11y `6.10.1` |
| Prettier | `^2.6.2` |
| Jest | `^29.7.0`；ts-jest `^29.1.0`；jsdom env `^29.7.0`；SWC Jest `0.2.36` |
| Testing Library | React `16.1.0`；DOM `^10.4.0`；jest-dom `^6.5.0` |
| Playwright | `@playwright/test ^1.36.0`；playwright-bdd `^7.2.2`；Cucumber `^10.3.1` |
| Vitest/Vite | Vitest `^1.3.1`；Vite `~5.3.1`；React plugin `^4.2.0` |
| Storybook | 主线 `^8.6.15`；test-runner `0.20.0`；coverage addon `1.0.4` |
| Visual testing | Chromatic `^11.28.2`、jest-image-snapshot `^6.4.0` |
| Mock | MSW `^2.4.9`、msw-storybook-addon `^2.0.0`、jest-fetch-mock `^3.0.3` |
| Compiler | SWC core `1.5.7`、helpers `0.5.12`、cli `0.3.14`；Babel core/preset React `^7.14.5` |
| Library build | Rollup plugin、SVGR 8、vite-plugin-dts `~3.8.1` |
| Git quality | Husky `^9.0.11`、lint-staged `^15.2.2` |
| Registry/release | Verdaccio `^5.0.4`、Nx release、release-please config |
| Build analysis | `@next/bundle-analyzer ^14.2.32`、code-inspector `^1.2.3` |
| Secrets | `@aws-sdk/client-secrets-manager ^3.540.0`、dotenv `^16.4.5` |

## 6. 版本与维护风险

- Node.js 20 已于 2026-03-24 EOL，Next.js 14 也已不在 2026 年官方支持版本列表中；新系统不应继续以这两者为基线。
- MUI Joy 仍是 beta 版本线，同时混用 Base、Material、System 和 Emotion，增加 UI 体积与升级面。
- NextAuth 使用早期 v5 beta；不应无条件复制其认证模型。
- Jest、Vitest、Playwright、Storybook、Vite 并存，覆盖面强但工具链重叠。
- 多个日期库同时存在：date-fns、dayjs、luxon、moment-timezone。
- 搜索 UI 出现 Searchkit 4.11/4.15 混合；CMS 内 `react-slick` 0.28、根/其他包 0.30 混合。
- `crypto` npm 包、`xlsx 0.18.5` 等遗留依赖不应进入新模板，除非有明确需求并重新审计。
- 根依赖放置过多，实际归属分散；E-pig 应按功能安装，P0 不预装未来可能使用的 SDK。
