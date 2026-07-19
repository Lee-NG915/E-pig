---
name: seo-metadata
description: >
  E-pig SEO helpers: metadata builders, JSON-LD, hreflang/canonical via market
  inputs. Use when adding page metadata or structured data.
---

# SEO Metadata

Helpers live in `src/platform/seo/`（可依赖 market registry）。

- `buildPageMetadata` — title/description 截断与默认值
- `buildProductJsonLd` / `jsonLdScriptProps` — 安全序列化，防止 `</script>` 注入
- `buildHreflangAlternates` — 基于 markets registry 的 host/locale（未知 host 不猜测）

## Rules

- shared 层 helpers 若存在，只接受可序列化 market/locale 参数，不反向 import platform
- P0 可无完整多语言文案；仍应保留 canonical 与市场级 hreflang 钩子
- 不复制 Saleor 的 `/{locale}/{channel}` 路径模型
