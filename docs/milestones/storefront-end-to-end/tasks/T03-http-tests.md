# T03 — HTTP 与持久化交易集成测试

更新日期：2026-11-02

状态：本地定向验证通过；全量质量门、独立评审、部署与真实支付验收由父任务统筹。

`src/platform/http/storefront-api.integration.spec.ts` 将真实 Request/Response、签名 Cookie、`createPostgresCommerce` 与迁移后的 PGlite PostgreSQL SQL 连起来。每个请求重新创建 commerce adapter，通过公共 HTTP 查询验证持久化结果。仅展示目录和外部支付网络使用测试 fixture；没有 mock SQL、事务或 commerce ports。

- 第一次 POST 签发 Cookie，后续请求回传；两个规格分行，重复 mutation 不重复加购，客户端价格无效，过时报价拒绝创建支付。伪造成功查询保持未支付；可信模拟支付状态确认后生成可回查订单、清空同一购物袋。另一有效购物袋不能读取该订单/checkout，篡改凭证返回 401，跨 Origin 写操作返回 403。
- Webhook 调用真实 Route Handler，经真实 Stripe SDK 对原始含空白正文验签。正文变化返回 401 且无订单；事件宣称已支付而可信查询仍 open 时无订单；可信查询变为 paid 后重复投递仍仅一个订单，购物袋仅清空一次。
- 本次新增覆盖在现有实现上首轮即通过，未暴露需改运行时的集成缺陷；未为制造 RED 修改已有实现。

## AI Test Record

- Behavior changed: 无运行时变更；新增 HTTP→真实 SQL 的交易与归属回归保护。
- Tests added/updated: 新增 `src/platform/http/storefront-api.integration.spec.ts`，2 个完整集成旅程。
- Tests run: `corepack pnpm test src/platform/http/storefront-api.integration.spec.ts`；`corepack pnpm exec eslint src/platform/http/storefront-api.integration.spec.ts`。
- Result: PASS（2/2；定向 ESLint 通过）。
- Failures or gaps: 本任务未运行全量 typecheck/lint/verify，由父任务统一执行。Request/Response 在进程内执行；没有启动真实 HTTP 服务、浏览器、Neon 或远程 Stripe。PGlite 不等于云端数据库验收。Stripe SDK 签名算法是真实的，支付状态与网络是明确模拟的外部边界。
- Next risk: 部署配置、真实 Cookie 浏览器交接、网络响应丢失、云端 webhook 到达及真实 Stripe 沙箱支付仍需独立验收证据。
