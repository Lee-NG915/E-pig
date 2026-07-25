# T06 — Home 重设计 + SEO

更新日期：2026-07-25  
Status: done  
Owner: cursor

## 交付

- `HomeHero`：全宽首屏 + CTA → Sofas / Living PLP + `home_hero_cta_click`
- `HomeCategories`：四分类入口 + `home_category_click`
- `[market]/page.tsx`：`generateMetadata` + WebSite JSON-LD；SSR 主内容 + Suspense 边界
- Header skeleton 高度对齐双层 Header（CLS）

## 测试

`pnpm test src/modules/content/components/home-hero src/modules/content/components/home-categories`
