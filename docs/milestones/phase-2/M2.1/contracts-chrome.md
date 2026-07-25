# M2.1 增补契约 — 全局 Header / Home / PLP 完善

更新日期：2026-07-25  
状态：frozen  
分支：`feat/m2.1-chrome-home-plp`

对齐：用户验收清单（Menu Bar / Home / PLP）+ Koala 双层 Header 参考 + happy-dog tokens。  
通用规范按 **YAGNI** 裁剪如下。

## 1. 路由（延续市场前缀）

| 路径 | 用途 |
| --- | --- |
| `/{market}` | Home |
| `/{market}/collections/[slug]` | PLP |
| `/{market}/products/[slug]` | PDP stub |

## 2. 导航信息架构（冻结）

一级分类（一行，可点进 PLP）：

| 标签 | handle | Mega 分组 |
| --- | --- | --- |
| Living | `living-room` | Sofas / Tables / Seating |
| Bedroom | `bedroom` | Beds / Mattresses |
| Outdoor | `outdoor` | Outdoor |
| Sofas | `sofas` | Sofas / Sofa Beds |

每个 Mega Menu 必须有 **Shop all →** 父级 PLP。  
Mega 为 absolute 浮层（不推挤页面）；营销位仅文案链接（无图），数据写在 `main-nav.ts`（`promos` 的 image 仍可供 Home 分类卡复用）。

## 3. YAGNI / 本里程碑不做

| 规范项 | 处理 |
| --- | --- |
| 真实 Search | 图标 + `aria-label`；点击 no-op / 提示 Coming soon（M2.3） |
| Account / Wishlist | 图标占位，`aria-disabled`，不假装已登录 |
| 登录态 | 始终 guest；Cart badge 只反映 demo cart |
| 跨市场真实切换 | 本地单进程；Header 展示**当前**市场名+货币；其它市场仅说明需 `MARKET=xx` 重启 |
| Facet 搜索筛选 | PLP 保留 sort；增加简易「相关集合」链接，不做 Elasticsearch facet |
| 分页 | 列表截断提示或「显示全部」；不做完整 page query（除非已有） |
| 第三方 CMS | 无；异常降级 = mock 静态文案 |
| Prefetch 全开 | 主导航 `prefetch={false}` |

## 4. 组件落点（DDD）

| 能力 | 域 | 路径 |
| --- | --- | --- |
| 双层 Header / Mega / Mobile drawer | content | `modules/content/components/site-header/` |
| 导航树纯数据 | content | `modules/content/lib/main-nav.ts` |
| Home hero / 分类入口 / 精选 | content + catalog | 现有 home-* + 新 `home-categories` |
| PLP 列表 / breadcrumb | catalog | `product-list` + `plp-breadcrumb` |
| Cart 图标与 Sheet | cart | 复用 `CartSheetMount` |
| 基础 Sheet/Button/Badge | happy-dog | 已有 |

## 5. 埋点

经 `AnalyticsIntegration.track`（noop 打结构化日志）：

- `nav_primary_click` / `nav_mega_click` / `nav_mobile_open`
- `cart_icon_click`
- `home_hero_cta_click` / `home_category_click`
- `plp_sort_change`

禁止同一交互双发。

## 6. 验收（本增补）

Header：双层结构、Mega 无闪烁、Esc/外点关闭、移动抽屉锁滚、键盘可达、CLS 稳定高度。  
Home：首屏品牌清晰、SSR 主内容、CTA→PLP、metadata/JSON-LD。  
PLP：breadcrumb、sort↔URL、空/404、metadata、卡片价正确。
