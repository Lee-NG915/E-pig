# T05 — 全局双层 Header

更新日期：2026-07-25  
Status: done  
Owner: cursor（Kimi 不可用时由 Leader 落地）

## 交付

- `src/modules/content/lib/main-nav.ts` — 导航 IA + 促销位
- `src/modules/content/components/site-header/` — 双层 Header、Mega、Mobile Drawer
- `src/shared/lib/track.ts` — 客户端埋点入口
- companions：`.md` / `.spec.tsx` / stories（既有）

## 验收对照（YAGNI）

| 项 | 结果 |
| --- | --- |
| 促销 / 辅助 / 商品导航分层 | 顶栏 + 主栏 |
| Mega Shop all、分组、≤2 图 | mega-panel |
| Hover 延迟关闭、Esc/外点、路由关闭 | site-header |
| Mobile 逐级 + 锁滚 | mobile-nav |
| Search/Account/Wishlist 占位 + a11y | disabled + aria-label |
| Cart badge | cart store |
| 市场展示 | 当前 market + currency（非真实切换） |
| prefetch={false} | 主导航 |

## 测试

`pnpm test src/modules/content/components/site-header src/modules/content/lib`
