# MobileNav

更新日期：2026-11-03

## 职责

SiteHeader 的移动导航：复用现有导航树，以房间分组和辅助入口帮助访客进入当前市场的列表与内容页。使用 happy-dog Sheet 提供模态焦点管理，不持有购物或支付状态。

## 用户故事

- 使用键盘打开菜单后，焦点留在菜单中；关闭后回到打开菜单的按钮。
- 进入某个房间后可以查看子分类，返回上一级，或进入当前市场的商品列表。
- 当前页面有明确标识；菜单内仍能看到沙箱说明与帮助入口。

## 状态矩阵

| 状态 | 可见行为 |
| --- | --- |
| closed | 无菜单 dialog |
| open | Shop furniture、More to explore 与辅助入口；焦点位于 dialog 内 |
| drill | 当前分类标题、Shop all 与子分类；Back 返回上一级 |
| current page | 目标链接有 aria-current=page |
| Escape / close / navigate | 关闭并恢复打开入口的焦点 |

## 非目标

新增导航分类、市场切换、促销、账户或支付能力。移动到桌面宽度时关闭移动菜单。
