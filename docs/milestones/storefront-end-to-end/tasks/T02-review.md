# T02 + HTTP 边界独立复核

更新日期：2026-11-02

状态：reviewed-after-fixes — 3 项初始 P2 均已修复并完成源码复核；完整验证由主任务统筹

## 范围与依据

复核当前未提交工作树，以 `4f30a6a36058ab565c36cdc512729da18b73ed65` 为已有代码基线。范围包括 commerce/cart/checkout/order 与 payment contracts、Postgres adapter 和 migration、Stripe adapter、签名 cookie、storefront HTTP transport 及对应测试。平台装配仍在并行完成，不把当时尚未接线的文件判作已交付缺陷。

依据：AGENTS.md Hard Rules、e-pig architecture、code-review 的 Standards / Spec 两轴，以及 TASKS.md T02/T03 和已批准的冻结购物车、同 revision 唯一结算、AU test/card/AUD、可信核验后解锁范围。沿用单独 Review AI 的任务分工，本报告不重复启动实现者或重跑已报告通过的全部测试。

## Standards

未发现上述范围存在模块反向依赖、交易共享缓存、客户端提供价格作为事实、请求期 DDL 或生产内存 fallback 等硬规则违规。SQL 参数化，签名 cookie 绑定市场和有效期；订单与 checkout 查询绑定 cart/market；支付凭据不进入客户端契约。Postgres 写路径统一先锁 cart，订单写入、购物车清空、checkout paid 同事务提交，数据库另有 checkout revision、session 和订单唯一约束。

code-review 的重复代码、过度抽象、职责与命名启发式未形成额外阻断项。少量长行及函数长度不足以单独构成应修复的交易缺陷。

## Spec findings

### R1 · P2 · 不可售商品使购物车无法展示和逐项移除

初始位置：`src/adapters/commerce/postgres/commerce.ts:48–71,85–89,99–108`。

`getCart` 和所有 mutation 都通过严格的 `priceLine` 校验全部保留行。一旦目录商品变为不可售，GET 就拒绝返回购物车；若两个行同时不可售，移除其中任意一个也因另一个的重新校验失败而回滚。用户无法按 CART-04 / E04 修正购物车。

最小修复：区分购物车可读/可移除状态与下单/新增的可售校验，保留服务端可信价格和明确的不可售状态；checkout 仍拒绝未解决的商品。回归应覆盖两个已有行同时不可售时的读取和逐行移除，以及残留不可售行禁止支付。

### R2 · P2 · 延迟 webhook 被创建支付的时间窗阻断

初始位置：`src/adapters/commerce/postgres/commerce.ts:149–159,224–231`。

支付商创建成功但 DB 尚未保存 session_id 时发生中断，超过 23 小时后收到正确的已付款/已过期 webhook，handler 先调用 `ensureSession`，在使用 webhook 提供的 session ID 之前就因创建时间窗退出。后续重复投递仍全部失败；此时已有可检索的支付身份，不应继续按“未知 ID、可能重新创建”的分支处理。

最小修复：webhook 直接读取该 checkout、检索事件的 session ID、校验既有 session ID（若有）及 checkout/cart/market/amount/currency/test 元数据，再在原事务中应用可信状态。禁止 webhook 调用 createSession。回归覆盖创建响应丢失后超过窗口收到 paid/expired 事件、错误身份拒绝与重复事件不重复订单；浏览器对真正未知的老创建继续保持冻结。

### R3 · P2 · 合法的带斜杠 origin 配置拒绝所有写请求

初始位置：`src/platform/http/storefront-api.ts:42`；`src/app/api/storefront.ts:8`；`src/platform/config/env.ts:27–31`。

APP_ORIGIN schema 接受 `https://shop.example/`，装配原样传入 HTTP boundary。浏览器 Origin 则为 `https://shop.example`，字符串比较导致加购、更新、checkout 和 cancel 全部返回 403。显式默认端口等等价 origin 也有同类风险。

最小修复：对可信配置值统一使用 `new URL(value).origin`，输入的 Origin header 仍须严格匹配；缺配置继续 fail closed。加 trailing-slash 配置的同源成功/异源拒绝测试。

## 修复后复核

- R1 已修复：读取按服务端目录重新计价，并用 `availability/problem` 保留不可售/已下架行供用户修正；mutation 只严格校验新增或改动的非零行；checkout 对全部行严格校验。新回归覆盖两个不可售行可读、逐行移除、残留行不可付款和整个商品下架。实现者报告先 red 后 green。
- R2 已修复：webhook 直接检索事件 session ID 并交给事务内 `verifySession/applySession`，不经过创建路径；返回 ID 另有相等检查。新增 25 小时后未知创建恢复与重复事件测试，断言不再调用 createSession 且仅有一个订单。实现者报告先 red 后 green。
- R3 已修复：HTTP boundary 将可信配置规范化为 URL origin，保留对来访 Origin 的严格比较。新回归使用带显式 443 与尾斜杠的 HTTPS 配置。源码和新增断言已复核；主任务确认该回归修复前返回 403（RED），修复后 7 项 HTTP 测试通过（GREEN）。
- Backend 实现者报告修复后 22 项定向测试通过；本 Review AI 没有重复运行，保持执行证据归属。

## 测试质量与剩余证据

现有测试实际执行 migration、事务和 SQL，而非 SQL 文本快照；包含持久库关闭重开、订单写失败回滚、不同 key 同 revision、冻结拒写、金额不匹配、归属隔离、取消不确定等有意义断言。Stripe SDK 用于真实签名算法，HTTP 测试证明 cookie/来源/市场/私有错误边界。

- PGlite 测试连接租约串行化，不能证明 Neon 多连接 `FOR UPDATE` 争用；真实数据库并发检查仍由主任务完成。
- 当前 HTTP 单测对 commerce ports 使用 mocks，不能代替 TASKS.md 要求的 HTTP → SQL → payment callback → order 完整集成测试。
- 缺少凭据 fail closed 在 adapter 层有覆盖，最终 registry/env/route 组合仍需主任务核验。
- 返回先于回调、重复回调和原子订单写覆盖较强；本轮 R2 对应的“丢失 session_id + 超窗口 webhook”此前没有覆盖。
- 本轮没有调用真实 Stripe API，也没有声称签名单测等于沙箱付款、部署或 UAT。

## Complexity

实现维持一个 Postgres adapter、一个 card-only Stripe adapter和单个冻结结算状态机，未加入 OMS、库存预留、优惠引擎、通用补偿调度或多数据库框架。唯一结算与幂等 SQL、冻结报价、外部调用移出数据库锁都是本目标所需复杂度。上述修复可局限在现有职责内，不需要扩展业务范围。

## AI Test Record

- Behavior changed: 无；本 Review AI 仅新增复核文档。
- Tests added/updated: 无；纯文档评审豁免，实现者负责各缺陷的回归测试。
- Tests run: 本轮未重跑实现者已经报告通过的 20 项 backend 与 15 项 cookie/HTTP/schema 定向测试；不将转述计为独立运行证据。
- Result: PASS（独立源码复核，3 项 P2 已修复）；本 Review AI 测试 NOT RUN，不能代表全局/云端验收。
- Failures or gaps: R1–R3 初始发现均已完成源码复核；真实多连接数据库、Stripe、完整 HTTP 集成和 UAT 未在此审查执行。
- Next risk: 最终主任务质量门与全 HTTP 集成；数据库驱动正在改为 Neon WSS，此后变更需继续复核，不属于当前报告已检查快照。

## AI Review Record

- Review focus: Standards / Spec / complexity；并发冻结、持久幂等、崩溃恢复、支付可信来源、归属、金额与来源检查。
- Findings: Standards 无新增硬规则阻断项；Spec 初始 3 项 P2（不可售购物车恢复、超窗口 webhook 恢复、origin 规范化）均已修复并完成源码复核；未发现残留 P1/P2。
- Residual risks: 本报告保留初始缺陷位置及修复后复核结果。完整 HTTP 集成、主任务全局检查和外部验收仍需各自证据；PGlite 串行租约不代表 Neon 行锁和真实 Stripe 支付已验收。
