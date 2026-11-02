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
5. Netlify CLI 使用仓库根 `--cwd`。在 pnpm workspace 中，CLI 自动筛选可能只识别组件包；从仓库外传入绝对 `--cwd` 可明确根 App。完整 deploy 内确认包含 Next Runtime、functions 与 edge functions，无需单独先 build。
6. 将服务端变量安全导入指定测试站点；使用 `netlify deploy --prod --context production --cwd <repo>` 执行完整构建和发布。不要将独立 `build` 后恢复的 `.next` 直接 `deploy --no-build`；该 adapter 在 onPostBuild 临时切换静态发布目录，并在 onEnd 恢复 Next 构建目录。这里 `--prod` 指新测试站点的固定 URL。
7. 以 `acceptance.md` 的实际访问和支付结果判断验收。CLI 登录、构建通过、Webhook 建立均不能代替支付成功证据。

## 已部署并验证

- 当前 ready 部署：`6ae8ad643aca6161053b6c32`，运行提交 `b0dc3a9`；完整 build/deploy 成功，46 个公开文件、1 个函数、3 个 Edge 函数。日志 `logs/netlify-deploy-focus-20261102.log`。
- 先前 ready 部署：`6ae8a82309096ed77364e367`（419990e）、`6ae8aacc224835a3273ca4be`（23835a8）。最终重新部署后原订单继续可读。
- 云端实际 HTTP → Neon/Stripe 独立请求并发通过；本机 WS/HTTPS 直连 suite 网络失败仍保留。迁移不在业务请求中执行。
- 桌面 AUD 3,800 与移动视口 AUD 8,350 两笔真实沙箱卡支付、订单刷新、重复 Webhook 不重复下单、拒付不生成订单及取消核验均通过，详见 [验收记录](./acceptance.md)。
- 无 Cookie 查单返回 401，跨市场查单返回 404，响应均 `private,no-store,max-age=0`；没有读取到订单明细。
- 3DS 额外认证 iframe 未完成加载，完整人工 UAT/实体手机未验收；不宣称全部支付方式或生产环境已通过。

最后的源码质量门为 213 应用测试 +22 基础组件测试，包含 typecheck/lint/docs/Harness/doctor；最终 modules Storybook build 也已通过。代码提交和部署彼此分开记录，后续纯文档提交不改变上述运行代码。

参考：[Netlify Next.js 部署](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)、[Stripe CLI OAuth 登录说明](https://support.stripe.com/questions/sign-in-to-stripe-cli)。

## 部署适配修复

Netlify Edge 打包会在请求环境注入前导入 Proxy。市场 env 改为在实际非 API 请求中异步加载并校验；缺少 MARKET 仍拒绝请求，不固定为 AU。四项真实 env 回归、独立评审与修复后 adapter 构建通过。

CLI 拆分 build/no-build 的两次尝试均停在 uploading 且 published_at=null，已请求取消。后续改用单次完整 deploy 生命周期；只认可最终 ready 的部署。
