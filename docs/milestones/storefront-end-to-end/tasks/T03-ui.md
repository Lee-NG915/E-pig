# T03 — 购物车、结算、回跳与订单界面

更新日期：2026-11-02

状态：本地实现与定向测试已通过；全量质量门、独立评审、浏览器与真实沙箱验收由里程碑统筹记录。

## 范围与领域

- 主域按交易阶段分别为 cart / checkout / order；content 提供现有 Header/Footer。5 个新页面仅做 async params、request-time connection、Suspense 与组件编排。
- CartPanel 为完整页与唯一抽屉复用同一服务端购物袋；CartMarketProvider 保留已有调用方式，同时挂载浏览器共享 QueryClient 的焦点/重连订阅。服务端每次使用全新 QueryClient；请求与本地旧存储检查在 hydration 后启用。
- Query key 包含 market；行金额与小计只取服务端 DTO。较低 revision 或 mutation 之前启动的旧 null 响应不会覆盖新购物车。旧 demo localStorage 保留、不导入、不删除，界面提示重新加购。
- 每个市场的 Web Locks 串行化 mutation；锁内先 GET 以读取最新 cookie 对应的购物车。未确认的 product/variant/quantity/payload 与幂等键存入新的共享 localStorage key，各标签页必须先安全重试该请求，再进行不同更新。这里不保存价格、个人信息或 cookie；不支持 Web Locks 的浏览器显式阻止写入并给出说明。
- AU 表单使用 react-hook-form + 共享 Zod schema，校验州枚举与四位邮编、电话选填。只发送 contact/address、服务端 revision/expectedTotal 及幂等键。网络/5xx 后保留同一请求与表单、冻结字段以便安全重试；服务端已锁定时展示已保存结算入口。
- 回跳仅查询可信 checkout；创建中/待支付最多自动核验 8 次（5 秒间隔），错误后停止自动轮询并保留手动刷新。cancel URL 不解锁；只有显式取消核验接口可改变状态。支付链接只接受 HTTPS checkout.stripe.com，不接受凭据或非默认端口。
- 订单查询由 cookie 归属 API 授权；列表与详情支持刷新，明确同浏览器 / 30 天 / 清 cookie 不承诺恢复。越权错误不展示私有订单信息。
- Backend 标记已失效规格时显示 problem，保留移除控制、禁用数量增加与结算。SG/US 只浏览与购物袋；页面明确支付仅限 AU。所有支付/运费/税费界面注明沙箱，无真实扣款或发货。
- 每个新增业务组件均有 md/spec/stories；现有 cart companions 同步更新。

## AI Test Record

- Behavior changed: 本地 demo cart 替换为服务端权威 Query 数据；新增 AU 结算、可信支付核验、同浏览器订单回查与错误恢复。
- Tests added/updated: cart-store、CartPanel、CartSheet、CartSheetMount、跨 provider 商品→Header→Drawer→增量/移除旅程、CheckoutForm、CheckoutStatus、OrderHistory。HTTP 是组件测试的 mock 边界。
- Tests run: `corepack pnpm test src/modules/cart src/modules/checkout/components src/modules/order/components`；`corepack pnpm exec eslint src/modules/cart src/modules/checkout/components src/modules/order/components 'src/app/[market]/cart' 'src/app/[market]/checkout' 'src/app/[market]/orders'`。
- Result: PASS（10 个测试文件，31 个断言用例；上述定向 ESLint 通过）。首轮 cart-store 3 例在旧 demo 实现失败，再实现后通过；后续组件先记录缺失实现的失败，再完成实现与回归。
- Failures or gaps: 完整 typecheck / lint / verify / build 由父任务统一执行；本记录不把定向 ESLint 当全量完成门。真实两个浏览器标签页 Web Locks、cookie 交接、响应丢失重试、320/375/768/1440 视觉键盘检查、Stripe 页面支付与云端回调尚未由本子任务执行。共享 pending 数据测试使用模拟 Web Locks，不代表真实跨标签页验收。
- Next risk: Web Locks 与共享 localStorage 为安全 mutation 的浏览器前提；不可用时明确失败。已有不可解析 pending 请求保留并阻止写入，以免误建第二购物车。真实上游网络、部署与支付验收仍需后续证据。

## AI Review Record

- Review focus: 独立 Review AI 审查请求丢失、跨标签页、报价/锁状态、取消并发及授权失效后的可见数据。
- Findings: 独立评审复现的 3 个 P2 在修复前全部 RED，修复后永久回归扩展到 6 例并 GREEN：后续 GET 401/403/404 隐藏缓存个人信息与支付链接；取消前中止旧 poll，终态不被旧 open 覆盖；同 revision 的旧 unlocked cart 不再清除新的 checkout lock，更高 revision 仍可合法解锁。取消接口授权拒绝同样隐藏个人信息，成功刷新后恢复。此前本地自检另修复旧 GET null 覆盖新 cart、共享未确认创建键、焦点挂载与失效行移除入口。
- Residual risks: 同 revision 锁保护依赖服务端合法终态解锁递增 revision 的契约；较高 revision 解锁已有客户端回归。全分支复审与整体验证仍由父任务完成，不据此宣布 T03 全部完成。
