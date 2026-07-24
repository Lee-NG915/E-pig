---
name: markets
description: >
  Typed market registry, MARKET env selection, host→market pure function.
  Use when touching multi-market behavior or hosts/locales/currency.
---

# Markets

真源：`src/platform/config/markets.ts`

- env 只选市场：`MARKET=au|sg|us`
- `resolveMarketFromHost`：未知 host → `null`，不猜测
- `isLocaleSupported`：locale 必须属于该 market
- 跨市场改动合并前检查每个市场差异

不采用 Saleor channel URL 前缀作为 P0 路由模型。
