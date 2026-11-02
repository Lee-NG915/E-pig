# T04 — 购物袋关闭后的焦点恢复

更新日期：2026-11-02

状态：本地实现、回归与静态检查通过；浏览器复验由父任务执行，未部署或提交。

父任务浏览器验收复现：在 PDP 用 Enter 加购，异步成功后自动打开购物袋，再按 Escape 关闭，焦点落到 BODY。该行为未满足 UI-06 的焦点返回要求。

修复复用现有 happy-dog/Radix SheetContent 的 `onCloseAutoFocus`。异步加购开始时、pending 禁用按钮前，同步记住原焦点元素；Header 购物袋入口显式提供触发按钮。抽屉关闭后，恢复到原触发元素并避免滚动跳动；原元素已移除或不可用时，回退到当前市场 Header 的购物袋按钮。DOM 引用仅保存在浏览器 UI 内存 Map 中，不进入 Query 数据、localStorage、请求或服务端状态。未更改购物车查询、mutation 事务、支付或结算规则。

同步更新 CartSheet/Header companion md；增加可用键盘打开并按 Escape 返回焦点的 CartSheet story。

## AI Test Record

- Behavior changed: Header、PDP 和商品卡异步加购打开的购物袋关闭后恢复焦点；移除原按钮时提供安全 Header 回退。
- Tests added/updated: `cart-sheet-focus.spec.tsx` 共 4 例：真实 PDP、真实 quick-add 商品卡、Header 键盘入口、原加购按钮移除。异步测试在请求未完成、原按钮已 disabled 时主动移走焦点，验证记录的是请求开始时的触发元素。
- Tests run: `corepack pnpm typecheck`；`corepack pnpm exec eslint src/modules/cart/lib/cart-store.ts src/modules/cart/components/cart-sheet src/modules/content/components/site-header`；`corepack pnpm test src/modules/cart src/modules/content/components/site-header/site-header.spec.tsx src/modules/catalog/components/product-detail/product-detail.spec.tsx src/modules/catalog/components/product-card/product-card.spec.tsx`。
- Result: PASS — typecheck、定向 ESLint、10 个相关测试文件 / 39 例全部通过。新增 4 例在修复前均复现 BODY 焦点失败，修复后全部 GREEN。
- Failures or gaps: 本子任务未打开、操作或部署浏览器站点；真实浏览器 Enter→异步成功→Escape 流程仍由父任务复验。全量 lint/test 与云端支付验收不在本次定向结果内。
- Next risk: 导航已移除原按钮时的焦点返回以当前页 Header 为回退；页面同时移除所有有效入口时不能承诺返回已不存在的元素。
