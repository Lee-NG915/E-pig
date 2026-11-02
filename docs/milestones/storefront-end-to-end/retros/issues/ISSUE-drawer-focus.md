# 异步加购关闭购物袋后焦点丢失

更新日期：2026-11-02

- 现象：真实浏览器 PDP Enter 加购，异步成功打开抽屉，Escape 关闭后焦点落 BODY，未满足 UI-06。
- 首次引入：T03 异步购物袋交互，集成 `419990e`；T04 浏览器验收首次复现。
- 根因类：实现偏移 / 测试缺口；原按钮在 pending 阶段禁用，打开抽屉时再读取 activeElement 已丢失原触发上下文。
- 修复：`b0dc3a9`，已推送。请求开始、禁用按钮前记录原元素；通过现有 SheetContent onCloseAutoFocus 恢复；原入口移除时回退当前市场 Header 购物袋按钮。无价格/个人信息持久化或交易状态变更。
- 已落地防再发：`cart-sheet-focus.spec.tsx` 4 项 RED→GREEN，覆盖真实 PDP/quick-add、Header 键盘及原按钮移除；测试在请求未完成且按钮禁用时移走焦点。companions 与键盘 story 已同步，最终 verify/review 包含修复。
- 边界：源码及组件回归不替代真实浏览器焦点复验；最终部署/浏览器结论由 acceptance.md / deployment.md 记录，T04 尚未关闭。
