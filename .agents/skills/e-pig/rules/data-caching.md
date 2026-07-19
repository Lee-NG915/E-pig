---
name: data-caching
description: >
  E-pig caching decisions: cached browse vs live commerce, cache-manifest as
  source of truth, forbidden transactional caches. Use when adding use cache,
  cacheTag, or debugging stale catalog/content.
---

# Data Caching

> **Browse may be cached. Commerce is always live.**

| Bucket | Examples | Policy |
| --- | --- | --- |
| Allowed (opt-in) | CMS/content blocks, navigation chrome, stable product presentation **without** price/inventory | `'use cache'` + `applyCacheProfile` from `@/shared/lib/cache-manifest` |
| Forbidden | price, inventory, cart, checkout, payment, private user data | request-time only；无公共 cache tag |

## Manifest

单一真源：`src/shared/lib/cache-manifest.ts`

- 在 cached 函数内调用 `applyCacheProfile("content" | "navigation" | …, params)`（仅 allowlist id）
- **禁止**散落的 raw `cacheLife("…")` / 手写 tag 字符串 / 临时拼装的 profile 对象
- market/locale 作为函数参数传入；不在 `'use cache'` 内读 cookies/headers

## Anti-patterns

- 为了快把 `getCart` / price 放进 `'use cache'`
- 用隐式 fetch revalidate / 单参数 ISR 语义描述架构
- 从 client barrel re-export server cached helpers
