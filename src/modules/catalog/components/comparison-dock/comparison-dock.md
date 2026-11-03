# ComparisonDock

更新日期：2026-11-03

Catalog-owned, market-layout-mounted comparison list. Selection persists across browsing routes and refreshes in the current browser. It does not require an account or alter the cart. The floating icon and count appear after the first addition; adding never opens the drawer automatically.

## 状态矩阵

| State / action | Behavior |
| --- | --- |
| Added / updated / duplicate / full | Live status with View your list and dismiss; expires after six seconds, paused on pointer hover or focus |
| Floating entry | Opens the happy-dog Sheet, keeps the current page and scroll position |
| List | Loads only the selected references when opened; name, image, selected option, remove, exact-option PDP link |
| One product | Allows entering details, encourages adding another for meaningful comparison |
| Three products | Capacity explanation; users can remove one before continuing |
| Remove | Updates all entry buttons/counts and persistence; focus moves to the next removal action or Continue browsing |
| Last removal | In-drawer empty state and browse/continue actions; dock disappears on close |
| Failed load / missing product | Selection remains removable; request failure offers retry |
| Close / Escape | Restores floating trigger focus; after the last removal, returns to the original product action or the page heading. Continue browsing does not navigate |
| Cart opens | Comparison unmounts and yields focus; closing the bag does not reopen comparison |
| Checkout / cart / order / compare page | Floating UI hidden; stored selection retained |
| Mobile PDP | Compact 48px icon/count above the existing fixed purchase bar and safe area; drawer footer respects safe area |

The drawer displays no persisted price or stock snapshots. The detailed comparison reads fresh market data through the same selected-reference endpoint. No whole-catalog endpoint, product picker, new design token, or generic toast dependency is introduced.

线上部署为托管标识保留底部 80px 空间；移动 PDP 继续避让购买条。验证以真实浏览器点击命中比较入口为准，不能只验证按钮存在。
