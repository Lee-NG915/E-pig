---
name: e-pig-architecture
description: >
  E-pig north-star architecture: App Router composition, ports/adapters,
  modules boundaries, Hard Rules summary. Use when unfamiliar with the repo or
  touching cross-layer structure.
---

# E-pig Architecture

## Stance

- Server Components by default；`"use client"` 仅交互/浏览器 API
- 数据：RSC + 显式 `'use cache'`（Cache Components）；无隐式 ISR
- Mutations：Server Actions / Route Handlers；匿名 cart cookie 仅首次 mutation 签发
- 依赖：`app → modules → core`；`adapters` 实现 ports；`modules` **禁止** import adapters/integrations（ESLint）

## Layout

```text
src/app          路由组合
src/modules      业务 UI + 域逻辑（catalog/cart/content…）
src/core         contracts + errors
src/adapters     port 实现
src/integrations 可降级副作用
src/platform     env、markets、registry、seo、logging
src/shared       跨域纯工具（不得依赖 platform/modules）
packages/happy-dog  基础组件 + theme tokens
```

## Hard Rules（摘要，全文见 AGENTS.md）

1. request API 全部 async；不得在 `'use cache'` 内读 cookies/headers
2. 缓存必须显式：`cacheLife` + `cacheTag`（经 cache-manifest）
3. 价格 / 库存 / cart / checkout / payment **不缓存**
4. modules 不碰供应商 SDK / adapter
5. secrets 禁止 `NEXT_PUBLIC_*`
6. 不用 Joyboy 旧基线（Nx、隐式 fetch 缓存、middleware cart 创建）

## Page boundary（Saleor 启发，改编）

- **Static browse**：缓存 shell 直接渲染，无 page-level Suspense
- **Hybrid**：仅动态岛（searchParams/cookies/cart）包 Suspense
- Layout 保持同步；chrome slot 各自 Suspense；`<main>` 不被 chrome Suspense 包裹
