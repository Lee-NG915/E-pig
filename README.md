# E-pig

E-pig 是一个基于 Next.js 16（App Router + Cache Components + Turbopack）、React 19、Tailwind CSS 4 和 shadcn/ui 源码模式的轻量电商前端。当前实现是可浏览、可加购并完成测试付款的**沙箱商城**，不是正式收款或真实履约系统。

线上 AU 沙箱：[e-pig-au-sandbox.netlify.app/au](https://e-pig-au-sandbox.netlify.app/au)。商品、价格和可售状态来自受控 fixtures；Stripe 仅使用测试模式，不会真实扣款，也不会安排配送。

## 当前实现

- **商品浏览**：首页、集合列表、搜索、筛选与排序、商品详情、规格选择、演示评价、规格比较和组合商品。
- **服务端购物袋**：通过 Route Handler + TanStack Query 读写；首次 mutation 才创建购物车并签发签名 HttpOnly Cookie。价格与购物车快照以服务端为准，`localStorage` 只保留待确认写操作的恢复信息，不再是购物车数据源。
- **AU 沙箱交易**：Postgres/Neon 持久化购物车、checkout 和订单；Stripe 托管测试支付、签名 Webhook、服务端重新报价、支付锁与幂等处理；支付后可在同一浏览器查询订单。
- **多市场**：本地支持 AU / SG / US 的路径、locale 与币种；只有完整配置的 AU 环境开放沙箱结账。
- **内容页面**：帮助、博客列表及站点导航；目前不依赖外部 CMS、搜索或认证服务。

## 本地运行

要求：Node 24（`.nvmrc`，可运行 `nvm use`）+ pnpm 10.34.5（`corepack enable`）。

```bash
cp .env.example .env.local
pnpm install
pnpm dev:au    # → http://localhost:3000/au；裸 pnpm dev 会失败
```

只浏览商品时使用默认 `COMMERCE_ADAPTER=mock` 即可。若要操作购物袋，还必须在 `.env.local` 配置：

```dotenv
APP_ORIGIN=http://localhost:3000
CART_COOKIE_SECRET=replace-with-a-random-string-at-least-32-chars
```

这两个值在 mock 和 postgres 模式下都需要：前者用于写请求的 Origin 校验，后者用于签名购物车与游客订单凭证。默认 mock 购物袋保存在**服务端进程内存**，重启后丢失；缺少交易配置时付款明确关闭，不模拟支付成功。

### 本地持久沙箱（可选）

要运行完整 AU 结账链路，在 `.env.local` 设置以下 server-only 变量：

```dotenv
MARKET=au
COMMERCE_ADAPTER=postgres
DATABASE_URL=postgresql://USER:PASSWORD@YOUR_NEON_HOST/epig?sslmode=verify-full
CART_COOKIE_SECRET=replace-with-a-random-string-at-least-32-chars
APP_ORIGIN=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

初始化数据库并启动：

```bash
node --env-file=.env.local scripts/database/migrate.mjs
pnpm dev:au
```

Stripe 只接受 `sk_test_` 密钥。Webhook 需处理 `checkout.session.completed` 与 `checkout.session.expired`；托管环境把 `APP_ORIGIN` 改为固定 HTTPS origin。完整配置与发布记录见 [`docs/milestones/storefront-end-to-end/deployment.md`](./docs/milestones/storefront-end-to-end/deployment.md)。

## 多市场本地开发

<!-- MARKET_IDS:au|sg|us -->

非秘密市场配置（货币、locale、host）统一维护在 `src/platform/config/markets.ts`，环境变量只负责选择本进程市场与 adapter。公开 URL 使用 `/{market}/...`；`/` 和其它市场前缀由 proxy 308 到本进程 `MARKET`。

```bash
pnpm dev:au          # MARKET=au → /au（AUD / en-AU）
pnpm dev:sg          # MARKET=sg → /sg（SGD / en-SG）
pnpm dev:us          # MARKET=us → /us（USD / en-US）
MARKET=au pnpm dev   # 也可以直接注入
```

`MARKET` 缺省或非法会在启动时失败，不会静默回退。当前线上只部署 AU 站点，`/sg`、`/us` 会重定向到 `/au`；SG/US 支持通过本地 standalone smoke 与集成测试验证，没有独立线上站点或支付能力。

## 常用命令

```bash
pnpm dev                   # 要求已设置 MARKET
pnpm typecheck             # tsc --noEmit
pnpm lint                  # ESLint（含模块边界与 server secret 规则）
pnpm test                  # Vitest 全量测试
pnpm test src/adapters/commerce/mock/cart.spec.ts  # 跑单个测试文件
pnpm verify                # docs + typecheck + lint + test + happy-dog + harness + doctor
pnpm build                 # Next 生产构建；缺省 MARKET=au 仅用于构建
pnpm start                 # 启动 .next/standalone；运行时仍必须设置 MARKET
pnpm smoke:runtime-market  # 验证同一 AU 构建以 SG 运行时启动未被污染
pnpm docs:check            # 校验 package scripts、README 市场标记与 registry 同步
pnpm quality:diff          # 对 git diff 做定向质量检查
pnpm storybook             # happy-dog 基础组件 Storybook（6006）
pnpm storybook:modules     # 业务组件聚合 Storybook（6007）
pnpm happy-dog:test        # happy-dog 独立测试
```

## 架构

```text
src/
  app/            App Router 与 Route Handler：读取 registry，编排 modules
  modules/        catalog / cart / checkout / order / content 业务垂直切片
  core/           commerce contracts（catalog/cart/checkout/order）、payment port、统一错误模型
  adapters/       commerce/mock、commerce/postgres、payment/stripe
  integrations/   可降级副作用（当前 analytics no-op），不是业务 port
  platform/       env、market registry、HTTP 边界、签名 Cookie、SEO、logger、组合根
  shared/         通用 UI 与工具
packages/
  happy-dog/      @e-pig/happy-dog 基础组件、设计 tokens 与 Storybook
  storybook-host/ modules + happy-dog 聚合 Storybook
scripts/
  database/       显式 Postgres migration 与外部数据库集成测试
```

依赖方向为 `app → modules → core contracts`，adapter 在 `platform/registry.ts` 装配。`modules` 禁止 import `@/adapters/*`、`@/integrations/*` 或供应商 SDK（ESLint 强制）；adapter 负责外部 DTO 映射与错误归一化。价格、购物车、checkout、payment 和私有订单不进入共享缓存，秘密只存在 server env。

## 部署与运行边界

- **Netlify（当前 AU 沙箱）**：`netlify.toml` 使用 Next.js Runtime，运行时为 `COMMERCE_ADAPTER=postgres`，连接 Neon 与 Stripe Sandbox。部署和实际验收证据见 [`deployment.md`](./docs/milestones/storefront-end-to-end/deployment.md) 与 [`acceptance.md`](./docs/milestones/storefront-end-to-end/acceptance.md)。
- **Cloudflare Workers（独立保留路径）**：`pnpm preview` 可用 OpenNext/workerd 本地预览，`pnpm deploy` 发布；`wrangler.jsonc` 当前是 mock 配置，不等同于已验收的 Netlify 交易环境。CI 在 PR/main push 只跑质量门，CF 仅在 `main` 上手动 `workflow_dispatch` 发布。
- **Standalone / Docker**：`next.config.ts` 输出 standalone；市场与 adapter 在运行时注入。容器构建与启动方式见 `Dockerfile`。
- **沙箱限制**：没有真实库存扣减、税费、物流、正式收款、退款或真实售后工单；演示优惠和配送估算不构成真实商业政策。
- **游客订单**：由 30 天签名 Cookie 授权，订单号不是访问凭证；清除 Cookie 或更换设备后无法恢复历史，没有账户或跨设备订单同步。

## AI 辅助开发工作流

本仓库内置 AI 辅助开发约定，详见 `AGENTS.md`：

- `.agents/rules/`：编辑后质量自检与文档日期同步规则。
- `.agents/skills/`：`e-pig-dev-loop`、`e-pig` 及社区 skills 子集。
- `DESIGN.md` / `PRODUCT.md`：设计与产品契约。
- `scripts/quality/`：diff-check、remediation-loop、check-doc-sync 等质量工具。
- `pnpm verify` / `pnpm agent-doctor`：完成门与 agent 安装健康检查。

架构研究见 [`docs/codex/research`](./docs/codex/research/README.md)。
