# 沙箱部署记录

更新日期：2026-11-02

## 环境与边界

- 分支：`codex/storefront-end-to-end-requirements`。
- 唯一首轮部署目标：新建 Netlify 测试站点 `e-pig-au-sandbox`，地址 `https://e-pig-au-sandbox.netlify.app`。站点的 primary deployment 仍是本项目沙箱，不代表正式收款上线。
- Node 24、pnpm 10.34.5、Next.js 16.2.10、Netlify Next.js Runtime 5.16.5。显式 adapter 配置确保 CLI 打包动态路由、图片、Proxy 与服务端函数。
- Neon：`e-pig-sandbox`，Postgres 17，`epig` 数据库；初始迁移 `scripts/database/001-commerce.sql` 已通过连接器逐条执行并检查五张交易表。
- Stripe：用户选择的「沙盒」账号；运行密钥经过账号核对，Webhook `checkout.session.completed` / `checkout.session.expired` 已建立，`livemode=false`。
- 配置 `MARKET=au`、`COMMERCE_ADAPTER=postgres`、`DATABASE_URL`、`CART_COOKIE_SECRET`、`APP_ORIGIN`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`。仅服务端读取，无 `NEXT_PUBLIC_*` 密钥。
- `.env.local`、`.netlify/` 均被 Git 忽略。部署环境值未写进本文或提交；本地配置权限为 0600。

## 可复现操作

1. 在本地环境文件设置上述服务端变量；本机 origin 使用 `http://localhost:3000`，Netlify 使用固定 HTTPS 站点 origin。
2. 迁移：`node --env-file=.env.local scripts/database/migrate.mjs`。本次本地 Neon 连接超时，已改由 Neon 连接器执行同一 SQL；没有在请求中自动建表。
3. 安装：`corepack pnpm install --frozen-lockfile`。
4. 质量：确保 PATH 使用 pnpm 10.34.5 后运行 `pnpm verify`；再执行部署构建。
5. Netlify CLI 使用仓库根 `--cwd`。在 pnpm workspace 中，CLI 自动筛选可能只识别组件包；从仓库外传入绝对 `--cwd` 可明确根 App。先 `netlify build --context production --cwd <repo>`，确认包含 Next Runtime、functions 与 edge functions。
6. 将服务端变量安全导入指定测试站点；使用 `netlify deploy --prod --no-build --context production --cwd <repo>` 发布已检查的包。这里 `--prod` 指新测试站点的固定 URL。
7. 以 `acceptance.md` 的实际访问和支付结果判断验收。CLI 登录、构建通过、Webhook 建立均不能代替支付成功证据。

## 尚待验证

- Netlify adapter 完整打包与发布结果。
- 云端 Neon 连通及独立连接并发；本机 DNS 可解析数据库域名，但 TCP/HTTPS/WS 连接仍失败，不能宣称数据库应用链路已通过。
- 实际托管 Stripe 沙箱卡支付、订单刷新回查、取消与私有响应隔离。

参考：[Netlify Next.js 部署](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)、[Stripe CLI OAuth 登录说明](https://support.stripe.com/questions/sign-in-to-stripe-cli)。
