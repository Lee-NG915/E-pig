# SiteHeader

更新日期：2026-11-02

## 场景

- Desktop：顶栏（促销 + 辅助链 + 市场指示）+ 主栏（Logo、一级分类 Mega Menu、叶子链 Blog、工具图标、Cart）。
- Mobile / Tablet（<1024px）：公告完整换行并独占上排，市场身份与辅助入口位于下一排，顶栏高度随内容伸展；不截断沙箱提示。汉堡打开 Drawer，逐级进入分类 / 返回 / Shop all；Blog 为直接链接；打开时锁滚动。
- Mega：hover/focus 打开；**绝对定位浮层**（不推挤页面）；仅文案 Featured 链，无图片；同级切换无闪烁；指针可移入面板；Esc / 外点关闭。
- 路由变化后关闭所有菜单与 Drawer。

## 状态

| 状态 | 行为 |
| --- | --- |
| mega closed | 仅一级链接；桌面顶栏保持固定高度，窄屏按公告内容伸展 |
| mega open (id) | 浮层面板叠在内容之上，一级 Active |
| mobile closed / open | Drawer |
| mobile drill | 显示子级 + Back |

## 非目标

真实 Search/Account/Wishlist、跨进程市场切换、全量 Prefetch、Mega 内营销图。

## Sandbox storefront

Search links to a GET keyword search page; Orders opens same-browser history. Utility links resolve to real market help routes. Unavailable account and wishlist actions are removed. The banner identifies sandbox checkout with no real payment or delivery.

## 窄屏公告回归

375px 实际浏览器发现公告与右侧市场标签重叠。现移除对整段公告的无效 inline truncate，采用自然文档流上下两排，保留完整的无真实扣款/发货提示、Learn more 与市场名称/币种；1024px 以上保持原横排。单元测试保护公告语义、完整文案、帮助链接与市场信息分离；几何无重叠由 320/375/768/1440px 浏览器检查验证。
