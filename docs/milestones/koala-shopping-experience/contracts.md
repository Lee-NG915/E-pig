# Koala-inspired shopping experience

更新日期：2026-11-03

状态：accepted-for-implementation — 用户确认按五个领域分批推进；不含报告中需另行确定范围的高级能力。

## Scope

Homepage / PDP / PLP / Cart / Checkout，按 [逆向报告](../../codex/research/10-koala-domain-reverse-engineering.md) 的 A、B 两批执行。catalog 拥有选品和规格；content 拥有首页与导航；cart/checkout 保留现有交易状态机。

### Batch A — selection continuity

- 一个精选系列 Tamarama：核对公开商品事实，提供 Winter Cream / Forest Walk × 2 / 3 Sections、Regular 的本地演示映射。其余目录与 Bangalow 的既有测试选项保留。
- 已有 product ID、default variant ID、测试价格保持兼容；新的本地规格有独立 ID。外部 source IDs 不直接作为本地交易 ID。
- PLP 卡片可预览对应颜色与图片，目标链接携带明确 `variant`；图片切换与链接分开。
- PDP 处理 query variant、显式无效值、颜色与尺寸选择、对应图片/价格/尺寸与移动购买栏。不能在无效选择时静默加购默认款。
- Cart 使用服务端 CartLine 的图片、规格与金额；保持 pending/error/retry/locked，改进空态与商品返回链接。

### Batch B — browsing and confirmation

- Homepage 重新组织文图 Hero、两列移动类目图卡与菜单分组/焦点行为；真实文本 CTA、当前市场链接、原主题。
- PLP 移动单/双列切换，保持既有排序与空态，不增加 facet。
- Checkout 联系/配送字段分组、商品摘要图与规格、返回编辑、沙箱费用说明；仍跳 Stripe Sandbox，不接触卡字段。

## Public interfaces under test

1. CatalogPort 的 list/get：预览和详情的本地 variant、图片、金额保持一致；AU/SG/US 旧默认 ID/金额不变。
2. variant query/option resolution 纯函数：缺省、合法、非法、重复 query 与不存在的组合。
3. React 可见行为：色板→图/链接；PDP query/选项→价格/尺寸/加购参数；移动和主按钮同一状态；缺图、错误、pending 不误导。
4. Postgres commerce 的 PGlite 集成：真实本地 catalog 的新增 variant 经 add/get/start，保留规格/图片/金额快照与已有幂等、锁车语义。
5. Home/nav/Cart/Checkout RTL：市场路径、焦点关闭、末项空态、字段验证、摘要与错误恢复。

Tests use existing Vitest/Testing Library/PGlite. No new runtime dependency. Image mocks must expose `src` as well as `alt` so image consistency is observable.

## Non-goals and invariants

- 不增加真实折扣、配送报价、评价生成、收藏/比较、自由配置器、推荐算法、CMS 或支付渠道。
- 价格/库存/cart/checkout/payment 不进入共享缓存；不改变匿名 cart 签发、revision/expectedTotal、幂等、锁车或订单回查。
- AU Sandbox；SG/US 支付保持关闭。source 内容与本地演示金额/availability 分开。
- 不改品牌 tokens；基础交互沿 happy-dog。组件 md/spec/stories 与实现同 patch。
- 原工作区已有 AGENTS/DESIGN/PRODUCT/README 及研究文档改动保留，不作为本次 task 的实现提交。
- 本地验证与远端部署/UAT分别报告。不会把本次本地测试称为重新完成真实沙箱付款验收。
