# T02 — 持久交易与 Stripe 沙箱边界

更新日期：2026-11-02

状态：implemented-local — 本地定向测试通过，独立 backend 复核两处 P2 已修复；全局质量门与云端验收由主任务统筹

## 实现范围

- `createPostgresCommerce` 组合 Cart / Checkout / Order ports，Neon PostgreSQL（官方 serverless Pool / WebSocket，保留交互事务）保存购物车、幂等请求、冻结报价、支付请求与订单。没有内存生产 fallback，也没有请求期建表。
- 显式 migration：`scripts/database/001-commerce.sql`。部署者通过安全环境注入 `DATABASE_URL` 后运行 `node scripts/database/migrate.mjs`；脚本不打印凭据或底层连接错误。
- 购物车变更按行锁串行化，写入与幂等结果同事务提交。每次未冻结读取、变更和 checkout 都从受控目录重算价格；规格分行，每规格数量取目录上限与 10 的较小值。
- 同 cart revision 的唯一约束独立于请求幂等键；同键不同 payload 拒绝。短事务冻结报价后释放数据库锁，再以 `checkout:<id>` 调用支付商。
- 支付请求、固定过期时刻与首次尝试时间持久保存。未知创建结果在安全窗口内复用完全相同请求；超过 23 小时停止自动创建并保持冻结，需人工核验，避免 Stripe 24 小时后清理幂等记录造成重复创建。
- Stripe 仅接受 `sk_test_`、验签 secret、AU / AUD / card。金额主单位只在 Stripe 边界转为整数分。使用当前 SDK 的 `allowed_payment_method_types`、`hosted_page` 和关闭 adaptive pricing；不启用真实收款。
- 原始 webhook 字节用 SDK 验签，之后直接检索事件提供的既有支付 session（不触发创建） 并核验 session id、checkout/cart/market 关联、金额、币种及测试模式。返回页查询也走可信检索；重复事件不会重复订单。
- 已支付为终态。订单创建、原购物车清空、revision 递增与 checkout paid 同事务提交；购物车 id 保留，订单绑定原购物车。
- 取消先调用支付商 expire，再读取确认；未知结果不解锁。已确认 expired 才释放锁并递增 revision，让新的结算属于新版本。
- AU contact/address schema 为 core contract 与 UI 共用；客户端提交 `expectedTotal` 只用于确认报价未改变，不作为服务端价格事实。

## 验证证据

首次新增 SQL 与 Stripe 测试分别执行时因为尚无实现文件而失败；补实现后通过。最终定向命令：

```text
corepack pnpm test src/adapters/commerce/postgres/commerce.spec.ts src/adapters/payment/stripe/payment.spec.ts
Test Files 2 passed (2), Tests 24 passed (24)

corepack pnpm exec eslint src/adapters/commerce/postgres src/adapters/payment/stripe src/core/contracts/commerce/cart.ts src/core/contracts/commerce/checkout.ts src/core/contracts/commerce/order.ts src/core/contracts/capabilities/payment.ts src/modules/checkout/lib scripts/database
exit 0
```

独立复核发现两个 P2，新增用例先复现失败后修复：失效/删除商品导致购物车无法读取或移除；创建结果未落库时，迟到事件因创建安全窗口被拒绝。失效行现带 availability / problem 保持可读可删，checkout 仍严格校验；验签事件直接检索给定 session，不新建，已支付和已过期的迟到事件均可恢复。

SQL 测试真实执行 migration、事务、SQL 与唯一约束；包含文件数据库关闭/重开与 migration 重跑保持订单，不只是重建 JavaScript adapter。PGlite 只有单个物理连接，测试连接租约串行化，因此不把该结果表述为 Neon 多连接行锁争用已验收。

覆盖：创建/变更幂等、不同规格、客户端价格篡改无效、数量/可售规则、旧行重新定价、报价变化拒绝、同 revision 不同 key 结算、冻结拒写、请求键复用冲突、创建超时同 payload 重试、超出安全窗口停止重建、订单写入失败回滚与恢复、同 cart 一次清空、重复/乱序事件、返回先于 webhook、不同 owner/market 隔离、错误支付金额、取消不确定与确认失效、AU 表单、签名/原始字节/测试模式/card/currency/redirect 限制。

## 未完成的外部验收

- 已配置 Neon 连接并尝试只读连接检查，但本机 WebSocket 返回 ErrorEvent，主任务进一步发现网络/DNS 不可达；未读取或修改远端交易数据，未执行外部多进程并发和网络中断演练。
- 已准备隔离于默认单测的真实多连接检查：`COMMERCE_DATABASE_TEST=1 corepack pnpm exec vitest run --config scripts/database/vitest.config.ts`。仅在显式启用后读取忽略的 `.env.local`，创建全新专用测试记录，注入模拟 PaymentPort，不调用真实支付、不删除既有数据。此检查尚未执行成功。
- 未调用真实 Stripe Sandbox API、未用浏览器测试卡完成付款、未注册真实 webhook；SDK 网络边界在单测中受控模拟，签名验证使用真实 SDK。
- 全局 typecheck → lint → test / verify / build 和 Netlify 部署由主任务统一执行，不以这里的 scoped lint 替代。
- 不实现真实库存预留、扣减、配送或税费计算。配送/税费为约定的沙箱 0 值。
- 超出 Stripe 幂等安全窗口的未知创建保留冻结，需要有权限的操作人员核验；本任务没有加入后台调度或自动补偿平台。

## 官方接口依据

SDK 23.1.0 的 API 版本固定为 `2026-10-28.endive`；当前 Checkout create 使用 [allowed_payment_method_types](https://docs.stripe.com/api/checkout/sessions/create) 限制 card。请求 payload 固定与超时保护依据 [Stripe 幂等请求规则](https://docs.stripe.com/api/idempotent_requests)；webhook 按 [Stripe 签名与事件管理](https://docs.stripe.com/events/manage-webhook-endpoints) 处理原始请求体并允许重复投递。

## AI Test Record

- Behavior changed: 持久购物车、冻结结算、可信沙箱付款确认、一次性订单和同浏览器归属隔离。
- Tests added/updated: `commerce.spec.ts` 16 项、`payment.spec.ts` 8 项。
- Tests run: 上述 24 项测试与 backend scoped ESLint。
- Result: PASS（定向本地）；全局检查 / 云端 / UAT 未在本子任务运行。
- Failures or gaps: 首次 red 为缺实现；复核发现两处缺陷均新增 red → green 回归；最终定向测试与 lint 无残留失败。外部服务与多连接并发未验收。
- Next risk: 主任务集成后的完整类型检查、外部数据库/Stripe 配置及真实测试付款。

## AI Review Record

- Review focus: 独立 transaction_review 复核持久事务、支付创建未知状态、可信 webhook 关联、单次订单与失效商品恢复。
- Findings: 两项 P2 均已修复且复核者确认源码修复方向正确；回归覆盖两条失效商品逐条删除、商品已移除、超过 25 小时的 paid / expired 事件恢复、错误 checkout 关联拒绝。
- Residual risks: 全分支集成复核与全局质量门由主任务统筹；真实 Neon 多连接和 Stripe Sandbox 网络行为仍待可用运行环境验证。
