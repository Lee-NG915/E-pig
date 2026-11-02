# T04 — 购物袋关闭后的焦点恢复

更新日期：2026-11-02

状态：implemented / reviewed / pushed `b0dc3a9` — 最终质量门与独立源码复核通过；线上 Header/PDP 焦点复验通过。

- Commit：`b0dc3a9`，已推送里程碑分支；原集成为 `419990e`，表单文案为 `23835a8`。
- 主任务最终完整 verify：213 应用 / 47 文件 + 22 基础 / 7 文件、Harness 8 例及 doctor PASS；独立最终 review 已包含本焦点修复，无未解决 finding。Next / Netlify 构建 PASS。部署版本及真实浏览器焦点复验以 acceptance.md / deployment.md 为准，不将本地测试直接记为浏览器通过。
- 最终部署 `6ae8ad643aca6161053b6c32` 上，Header Enter→Escape 返回购物袋按钮，PDP Enter→异步加购→Escape 返回 Add to bag，均实际读取 activeElement 确认。桌面/375px 普通卡付款与回查通过；3DS 与完整人工 UAT 缺口另见 acceptance.md。

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

## AI Review Record

- Review focus: 最终独立 review 包含异步加购触发记录、关闭恢复、Header 回退及回归断言。
- Findings: 最终源码复核无未解决 finding；修复已包含于 `b0dc3a9` 和最终完整 verify。
- Residual risks: 真实浏览器验收与源码评审分别记录，T04 未关闭；浏览器焦点复验以 acceptance.md 为准。
