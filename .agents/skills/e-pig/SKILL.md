---
name: e-pig
description: >
  Project-specific patterns for the E-pig Next.js 16 storefront: architecture,
  cache manifest, SEO helpers, markets, and component folder workflow. Use when
  working on catalog, cart, content, caching, SEO, or module boundaries. Read
  SKILL.md then exactly one matching rules/*.md — never load a compiled dump.
metadata:
  author: e-pig
  version: "1.0.0"
---

# E-pig project skill

Saleor Paper 启发的 **thin index**：深度在 `rules/`，按任务加载一条。

## How to use

1. 读本索引，按任务匹配 `description`
2. 只打开 **一条** `rules/<name>.md`
3. 冲突时：Hard Rules > 本 skill > 社区 skills

## Rules index

| Priority | Rule | When |
| --- | --- | --- |
| 0 | `e-pig-architecture` | 不熟悉仓库、跨层改动、边界问题 |
| 1 | `data-caching` | `'use cache'`、cacheTag、catalog/content 缓存 |
| 2 | `seo-metadata` | metadata、JSON-LD、hreflang、canonical |
| 3 | `component-folder` | 业务组件 md/tsx/spec/stories |
| 4 | `markets` | MARKET、host→market、多市场差异 |

## Critical commands

- `pnpm verify` — 完成门（docs + typecheck + lint + test）
- `pnpm doctor` — agent/skill 健康检查
- `pnpm quality:companions` / `pnpm quality:diff`

## Non-goals（明确不从 Saleor 照搬）

- Saleor GraphQL / channel URL 前缀
- checkout 双 surface + session-bridge
- 把价格/库存/cart/checkout 放进共享 cache
