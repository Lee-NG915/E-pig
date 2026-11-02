# 沙箱商城实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

更新日期：2026-11-02

**Goal:** AU 浏览、选规格、服务端购物车、游客结算、Stripe 沙箱卡支付与同浏览器订单回查闭环；SG/US 兼容检查。

**Architecture:** 保留单 Next.js App。受控本地目录提供沙箱商品，Postgres 保存交易状态，Stripe 托管卡支付；平台 registry 装配 port，Route Handler 注入业务能力。Netlify 为唯一首轮验收部署目标。

**Tech Stack:** Node 24、pnpm 10.34.5、Next.js 16.2、React 19、TypeScript 6、happy-dog、TanStack Query 5、react-hook-form、Zod、Postgres、Stripe。

## Global Constraints

- modules 不 import adapter / integration / 供应商 SDK。
- 价格 / 库存 / cart / checkout / payment 不缓存。
- 匿名 cart id 只在首次 mutation 签发；普通 GET 不创建购物车。
- 市场配置唯一真源为 markets.ts；只有 AU 可发起沙箱支付。
- 首轮使用游客、同浏览器订单回查、Stripe 托管 card 支付；不启用真实收款。
- 采用现有 DESIGN.md 与 happy-dog tokens，不修改其 proposal 状态。
- 不做优惠码、价格/库存新筛选、Blog 详情、登录、跨设备恢复、旧购物车自动迁移、真实库存预留。
- 可交易目录覆盖现有全部可购买入口；至少一个商品两种独立沙箱规格。测试规格不冒充供应商真实 SKU。
- AU 测试地址：姓名、邮箱、地址、城市、州、四位邮编；电话选填。配送与税费为 0，仅为沙箱测试值，无实际发货或税务承诺。
- 同一 cart revision 最多一个未终结 checkout；支付期间冻结购物车，cancel URL 不解锁；核验旧支付不能完成后才解锁。
- Cookie 30 天、HttpOnly、SameSite=Lax、生产 Secure、市场绑定；订单凭证清除后不能承诺恢复。
- 所有运行时变更同 patch 带测试；交易功能先写失败用例，再实现，再独立 Test AI / Review AI 复核。
- 所有缺少凭据、云端未执行、浏览器未覆盖的验收必须显式保留，不以本地单测代替。

## T01 — 商品、搜索与设计统一

**Files:** `src/core/contracts/commerce/catalog.ts`；`src/adapters/commerce/mock/catalog*.ts`；`src/modules/catalog/components/{product-card,product-detail}/`；`src/modules/content/components/{site-header,site-footer,blog-card,blog-list,home-benefits,home-editorial}/`；`src/app/[market]/{search,help/[slug]}/page.tsx`。

**Interfaces:** `ProductVariant { id, sku, label, price: Money, image, availability, maxQuantity }`；`ProductDetail.variants: ProductVariant[]`；`ProductListItem.variantCount?: number` 与 `defaultVariantId?: string`。PDP 通过 `useCartActions(market).addItem({ productId, variantId, quantity: 1 })` 加购；列表多规格跳转 PDP。

- [ ] 先添加 catalog 与 PDP 回归断言：每个目录商品存在有效规格；不同规格 id 唯一；无评分隐藏；单图无重复视角；空搜索不抛错页面。
- [ ] 运行对应 `corepack pnpm test` 文件，记录失败；实现受控 SKU 映射与 UI，然后重复测试通过。
- [ ] Header 搜索、订单入口、有效帮助链接；移除虚假承诺、无行为按钮和 Blog 详情诱导；保留既有排序。
- [ ] 基于现有 tokens 编排详情、帮助与搜索；新增/更新组件 companions；组件测试覆盖选择、请求失败、无结果。
- [ ] Review、task 记录、commit + push。

验收断言示例：

```ts
const detail = await catalog.getProduct(product.id);
expect(detail.variants.length).toBeGreaterThan(0);
expect(new Set(detail.variants.map(v => v.id)).size).toBe(detail.variants.length);
expect(detail.variants.every(v => v.price.currency === market.currency)).toBe(true);
```

## T02 — 持久交易与支付边界

**Files:** `src/core/contracts/commerce/{cart,checkout,order}.ts`；`src/core/contracts/capabilities/payment.ts`；`src/adapters/commerce/postgres/`；`src/adapters/payment/stripe/`；`src/modules/checkout/lib/`；`scripts/database/`。

**Interfaces:** 现有 `Money.amount` 保留主货币单位；支付边界唯一转换为整数分。Cart 增加 `revision`、`lockedCheckoutId`，CartLine 增加 `variantId`、规格文案。`CheckoutPort.start(cartId, {revision, contact/address}, {idempotencyKey})` 返回持久 checkout 的 id/status/paymentUrl；`get/reconcile/cancel` 均带 cartId 校验归属。`OrderPort.list(cartId)` / `get(cartId, orderId)`。PaymentPort 接收内部报价快照，返回标准化 test session；不得泄露 SDK DTO。

- [ ] Test AI 先审并发、金额、状态及授权测试清单。
- [ ] 先写服务测试：篡改价格无效、规格分行、数量限制、同操作重试、不同 key 同 revision 只一支付、支付期间拒绝 mutation、错误 owner/market 拒绝。
- [ ] Postgres 事务/唯一约束持久化，禁止生产用内存 fallback；显式幂等 SQL migration，不在请求中建表；测试实际 SQL 与重启后读取。
- [ ] Stripe adapter 限 test key、card、AUD；幂等创建 session，签名核验 webhook，金额/币种/checkout 关联核验；成功页不可设置 paid。
- [ ] 服务测试覆盖重复/乱序 webhook、返回早于回调、创建支付超时后的恢复、支付已完成但落库失败后的重试、取消核验失败继续锁定。
- [ ] Review、task 记录、commit + push。

验收断言示例：

```ts
const [first, retry] = await Promise.all([
  checkout.start(cart.id, input, { idempotencyKey: "request-a" }),
  checkout.start(cart.id, input, { idempotencyKey: "request-b" }),
]);
expect(first.id).toBe(retry.id);
expect((await orders.list(otherCart.id))).toEqual([]);
```

## T03 — HTTP、购物车、结算和订单界面

**Files:** `src/app/api/`；`src/platform/{registry,config/env}.ts`；`src/modules/cart/lib/cart-store.ts`；`src/modules/cart/components/`；`src/modules/{checkout,order}/components/`；`src/app/[market]/{cart,checkout,checkout/return,orders,orders/[orderId]}/page.tsx`；`src/proxy.ts`。

**Interfaces:** JSON API `/api/{market}/cart`、`/api/{market}/checkout`、`/api/{market}/checkout/{id}`、`/api/{market}/orders`、`/api/{market}/orders/{id}`，支付 webhook `/api/payments/stripe`。HTTP 客户端绝不接受价格作为事实；API 从签名 cookie 取 cartId，拒绝跨站写请求，所有私有响应 no-store。Query key 包含 market；UI open 状态独立保留，旧 localStorage cart 不导入也不删除。

- [ ] 签名 cookie、过期、跨市场、普通 GET 无 Set-Cookie 的失败测试先行；处理并发首次加购与安全重试。
- [ ] 替换 localStorage 价格状态；统一 Header/Drawer/Cart 的查询与错误、loading、empty、锁定、重试状态。
- [ ] checkout 桌面表单+摘要两列，移动纵向；react-hook-form + Zod 校验，服务器复核；只发送商品/规格/数量与用户表单。
- [ ] return 页以可信查询显示处理中/已支付/已过期，提供继续支付或核验取消入口；同浏览器 orders 列表与明细支持刷新重开。
- [ ] Route Handler 集成测试串联匿名购物车→报价→支付→回调→订单，并断言越权与 forged success 不推进状态。
- [ ] Review、task 记录、commit + push。

验收断言示例：

```ts
expect(response.headers.get("cache-control")).toContain("no-store");
expect(readWithoutCookie.headers.get("set-cookie")).toBeNull();
expect(forgedSuccess.order?.status).not.toBe("paid");
```

## T04 — Netlify 配置、整体质量与真实沙箱验收

**Files:** `netlify.toml`、`.env.example`、`.gitignore`、`package.json` / lockfile、`docs/milestones/storefront-end-to-end/{deployment,acceptance}.md`、task 记录。

- [ ] 安装固定 pnpm 10.34.5 所需依赖；配置 Netlify Node 24 / pnpm build / MARKET=au；保留现有 CF 作为历史独立路径，不误称已验证。
- [ ] 新建测试站点（用户已选择）；安全配置 Neon / Stripe test key / webhook secret / cookie secret / 固定 origin；不把密钥写到 Git 或聊天。
- [ ] 顺序 typecheck → lint → test，全量 verify；build、storybook modules 与 runtime-market smoke 按影响运行。
- [ ] 浏览器 375/768/1440 与 320 溢出检查；购物、错误恢复、键盘、表单验证与长内容。
- [ ] 真正访问测试站点支付测试卡，等待可信确认并重开查单；SG/US 路由/币种/隔离验证，支付禁用。
- [ ] Whole-branch independent review、修复、报告本地/预览/UAT 的分别结论。未取得账号连接则保持真实云端验收未完成。

## 当前看板

| Task | 状态 | 记录 |
| --- | --- | --- |
| T01 | implemented / reviewed | tasks/T01-storefront.md；浏览器复测并入 T04 |
| T02 | implemented / reviewed | tasks/T02-commerce.md；云端并发待 T04 |
| T03 | implemented / reviewed | tasks/T03-ui.md、T03-http-tests.md；回归见 T04-fixes.md |
| T04 | in progress | deployment.md、acceptance.md；真实支付未验收 |

需求覆盖：NAV/CNT/CAT/PDP/UI→T01；CART/CHK/PAY/ORD→T02+T03；NFR/E01–E12→T04。评审中延后的项以 contracts.md 为准。尚未通过的云端证据绝不标记 done。

交付说明：T01–T03 在实施时共享新规格、购物车与支付契约，按同一集成 patch 验证并推送，避免中间接口不兼容提交。各 task 的测试和独立评审记录分别保留；T04 部署证据另行提交。
