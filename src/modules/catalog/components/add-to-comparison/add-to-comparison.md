# AddToComparison

更新日期：2026-11-03

Catalog-owned browsing action shared by homepage/PLP/search cards and PDP. It adds the currently displayed product/variant to the market's comparison selection without navigation, scrolling or cart mutation. The happy-dog Button preserves focus and exposes its selected state with `aria-pressed`.

## 状态矩阵

| State | Visible behavior |
| --- | --- |
| New product | Compare action; added status through the global ComparisonDock |
| Exact selection already present | Check icon and Added to compare; another click explains that it is already included |
| Same product, different option | Update comparison; replaces the existing column without occupying a new slot |
| Three different products | Fourth addition leaves selection intact and explains how to make room |
| Before client hydration | Disabled until the saved selection is restored |

The action stores identifiers only. Status messages are ephemeral and market-scoped; they do not claim that browser storage is guaranteed or that any purchase occurred.
