# SiteHeader

更新日期：2026-07-25

## 场景

- Desktop：顶栏（促销 + 辅助链 + 市场指示）+ 主栏（Logo、一级分类 Mega Menu、工具图标、Cart）。
- Mobile：汉堡打开 Drawer，逐级进入分类 / 返回 / Shop all；打开时锁滚动。
- Mega：hover/focus 打开；**绝对定位浮层**（不推挤页面）；仅文案 Featured 链，无图片；同级切换无闪烁；指针可移入面板；Esc / 外点关闭。
- 路由变化后关闭所有菜单与 Drawer。

## 状态

| 状态 | 行为 |
| --- | --- |
| mega closed | 仅一级链接；Header 高度恒定 |
| mega open (id) | 浮层面板叠在内容之上，一级 Active |
| mobile closed / open | Drawer |
| mobile drill | 显示子级 + Back |

## 非目标

真实 Search/Account/Wishlist、跨进程市场切换、全量 Prefetch、Mega 内营销图。
