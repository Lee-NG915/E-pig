# ISSUE-001 — PLP/PDP 双挂载 CartSheet

- Date: 2026-07-19
- Found in: T04 Claude Review（相对 T02/T03）
- First introduced: `6d7fd1d` / `fc8a378`

## 现象

`/collections/[slug]` 与 `/products/[slug]` 在 header 与列表/详情区各挂一次 `<CartSheet />`，打开购物袋可能出现重复抽屉。

## 根因类

实现偏移

## 证据

- Home 已用 `CartSheetMount` 单挂载（Phase 1 模式）
- Claude Review major；文件 `src/app/collections/[slug]/page.tsx` 原 30–32 / 47–53 行

## 修复

统一为 `CartSheetMount` 包住 `SiteHeader`（与 Home 一致）；列表区不再二次挂载。

## 防再发

- 在 `page-workflow-guide.md` 增加「购物车抽屉只挂一次，优先 CartSheetMount」一句（随本 issue 同 PR）
- Kimi/Claude page brief 模板默认写：chrome 用 CartSheetMount，勿在多个 Suspense 岛各挂 CartSheet
