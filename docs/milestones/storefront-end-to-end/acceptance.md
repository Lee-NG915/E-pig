# 沙箱商城验收记录

更新日期：2026-11-03

状态：AU 主交易链路及额外 3DS 挑战已完成托管沙箱验收；完整人工 UAT / 实体设备仍未执行。

测试地址：[e-pig AU Sandbox](https://e-pig-au-sandbox.netlify.app/au)。代码分支 `codex/storefront-end-to-end-requirements`，运行提交 `b0dc3a9`；Netlify ready 部署 `6ae8ad643aca6161053b6c32`。未合并主干，未启用真实收款。

## 证据分层

| 层级 | 实际结果 | 证据与边界 |
| --- | --- | --- |
| 最终质量门 | PASS | `VITEST_MAX_WORKERS=4 pnpm verify`：47 文件 / 213 应用测试、7 文件 / 22 基础组件测试、Harness 8 例、docs/typecheck/lint/doctor；`logs/verify-focus-final-20261102.log` |
| 独立评审 | PASS | 3 个 P2 已修复并复核关闭；最终焦点修复另经独立 review，无未解决 finding。见 tasks/T04-final-review.md、T04-fixes.md、T04-focus.md |
| HTTP→实际 SQL 集成 | PASS | 两个 PGlite SQL 旅程、真实 HMAC 验签；支付网络在该层模拟，不冒充 Stripe 实付 |
| 构建 | PASS | 最终 Next/Netlify Functions/Edge 完整 build + deploy；modules Storybook 再次通过，`logs/storybook-focus-final-20261102.log` |
| SG/US 兼容 | PASS（本地运行时 + 契约/HTTP） | 同一 AU 构建分别以 SG/US 启动，路径、重定向、SGD/USD、文案通过；签名 Cookie 市场隔离和 SG/US 禁止支付由集成测试覆盖。没有部署独立 SG/US 站点 |
| 真实云端并发 | PASS | Netlify HTTP → Neon/Stripe，4 个并发首次 mutation 只加一件；4 个并发 checkout 请求复用同一 checkout/支付会话；`logs/cloud-transaction-check.json` |
| 真实云端安全边界 | PASS | 篡改金额不影响服务端 AUD 1,900 报价；跨站写 403、跨市场 404、支付锁定时写入 409、私有响应 no-store；取消核验旧 session 过期后解锁且无订单 |
| 本机直连 Neon suite | 未通过 | 本机 WS/HTTPS 网络超时。迁移经 Neon 连接器执行；云端实际应用连接和并发已另行验证，不能把本机失败改写为通过 |
| 桌面和移动视口付款 | PASS | Chrome 桌面与 375px 各一笔 Stripe 测试卡成功；数据库 paid，订单回查/刷新通过，详见下表 |
| 3DS 额外挑战 | PASS（2026-11-03 补验） | 首轮 iframe 未完成；独立隔离浏览器中官方 3DS 测试卡末四位 3220 触发真实测试认证，完成 COMPLETE 后商城确认 paid，订单刷新可回查。见下方补验记录 |

## 真实支付与订单

全部使用合成姓名、example.com 邮箱、测试地址及官方测试卡；不保存卡号/CVC 到商城。两笔都是 `livemode=false`，并非真实扣款。

| 场景 | Checkout | 持久订单 | 金额与结果 |
| --- | --- | --- | --- |
| 桌面成功 | `b2e7bb8d-2e10-4dc2-b2c9-292c353152ad` | `96a008f6-6e14-495b-9b2e-1d04b6db7512` | AUD 3,800；Bangalow 独立测试规格 ×2；Stripe paid / 380000 分，清空购物车 |
| 拒付与取消恢复 | `ab4bcfd8-827c-42c1-9f9d-d2cc09014169` | 无 | Stripe 显示卡被拒绝；数据库 open、0 订单。3DS 未完成后返回页仍未支付，主动取消核验后 expired；原商品保留，可重新结算 |
| 移动视口成功 | `f1a51979-d813-406b-986f-3967f1258b80` | `85d16698-7aec-4149-81ff-268ac853cfb3` | AUD 8,350；Bangalow 标准规格 ×4 + Module ×1；Stripe paid / 835000 分，清空购物车 |

- 手机流程在 Chrome 模拟 375px CSS 视口操作；跨站跳转会重置浏览器工具的覆盖值，进入 Stripe 和返回商城时重新设置并读取 `innerWidth=375`。不是实体手机/Safari 测试。
- 桌面订单完成后，向正式配置的测试 Webhook 重发同一 `checkout.session.completed` 事件；Stripe 的 pending_webhooks 回到 0，Neon 仍恰好一笔对应订单。集成测试另覆盖伪签名、金额/币种不匹配、乱序、未知结果与重放。
- 发布 `b0dc3a9` 后，同一浏览器的订单列表同时显示两笔 paid；移动订单详情刷新仍可读。新函数部署没有丢失旧订单。
- 订单通过 30 天签名游客 Cookie 授权；订单号不是密码。清除 Cookie 或换设备无法恢复当前游客历史。

## 浏览器检查范围

- 搜索空查询/无结果/正常结果、不同规格分行、不可用规格禁用加购、购物车增减/删除、独立购物车和订单页面已操作。
- 结算空提交显示姓名/邮箱/街道/城市/邮编错误，并将焦点定位到首个错误；成功表单和金额摘要通过。
- PDP 和结算已检查 320/375/768/1440 无横向溢出；顶部公告与市场标签分行修复后无重叠。最终 PDP 四档再次读取 scrollWidth=innerWidth；移动订单 375px 同样无溢出。
- 最终线上 Header 用 Enter 打开购物袋、Escape 关闭，焦点回 Header；PDP 用 Enter 异步加购、Escape 关闭，焦点回 Add to bag。Quick-add/原入口移除回退另由 4 条真实组件交互回归保护。
- 未声称全站所有页面、全部浏览器、实体手机、屏幕阅读器、reduced-motion、完整跨标签页人工 UAT 已逐项验收。无性能/转化率提升结论。

截图（本机交付附件，不含 Cookie、密钥或支付访问链接）：

- `/Users/lidonghai/.codex/visualizations/2026/11/02/01a19c6d-4dd3-7a41-97fb-013638a13cac/sandbox-orders-final.jpg`：最终部署后两笔 paid 订单。
- `/Users/lidonghai/.codex/visualizations/2026/11/02/01a19c6d-4dd3-7a41-97fb-013638a13cac/sandbox-paid-mobile-final.jpg`：移动订单详情刷新。

## 验收解释与功能边界

需求基线的 E01 主链路、E03 幂等并发、E09 持久与权限、E10 多市场兼容已有对应证据；E02/E04/E05/E07/E08 由浏览器指定场景和集成测试共同覆盖，冻结/金额行为按 contracts.md 的精简契约。E06 的额外 3DS 成功挑战已于补验关闭；E11/E12 的全量人工矩阵仍有缺口，不统一标成全部通过。

商品/规格/价格/可售状态为受控沙箱 fixtures；税费与配送为零测试值。未实现真实库存、物流、税务、优惠码、账户/跨设备恢复、真实收款或退款。Netlify primary deploy 只是这个新测试站点的固定地址，未表示生产商城交付。

## 环境与回归说明

- `.netlify/` 为构建生成物，按 `.next/` 同类排除 ESLint/TypeScript 扫描；未放宽源码边界。
- 外部数据库 Vitest 配置改为显式覆盖 include，避免 mergeConfig 数组拼接误跑全仓。
- 高并发打包时曾触发既有 env-policy ESLint 初始化 5 秒超时；最终固定 4 个 Vitest worker 完整通过，没有修改断言或测试超时。
- 测试卡出处：[Stripe 官方测试说明](https://docs.stripe.com/testing)。额外认证失败只记录为未验收，不推断为支付业务代码缺陷。


## 独立 3DS 补验（来源记录日期：2026-11-03）

协调任务在不读取或修改 Stripe 凭证、不改代码、不重新部署的前提下，使用隔离浏览器会话 `overnight-e-pig-qa` 复验当前线上版本。

- 桌面 1440px：首页图片无已加载损坏，scrollWidth=1440；Bangalow Modular Sofa Module ×1 加购，购物袋与结算均为 AUD 750。
- 合成联系资料 `Overnight QA` / `overnight-qa@example.com`。Stripe 页面明确标识沙箱，使用官方 3DS 测试卡（末四位 3220），无真实资金移动。
- 第三方测试窗口实际显示 `3D Secure 2 Test Page`。AX 树未列出跨域控件；用截图确认 Tab 焦点先到 FAIL、再到 COMPLETE，按 Enter 完成官方测试认证，没有跳过认证或伪造支付结果。
- 返回商城后显示 `Payment confirmed`，购物袋 0，订单 `3a8f48ec-87a9-4eda-9768-03cf7282bbff` 为 `PAID · SANDBOX`，商品、规格、数量和 AUD 750 均一致。
- 切到 375×812 移动视口并设置 prefers-reduced-motion 后刷新订单详情，仍可回查已支付订单，scrollWidth=375。
- 补验没有完成实体手机、Safari 或全量人工 UAT，也没有将原来的本机 Neon 直连失败改写为通过。
- 工具实测与截图证据保存在协调线程 `01a19cf0-e142-741d-8088-1f0c37e5302e`，本机汇总文件 `/Users/lidonghai/Documents/Codex/2026-11-02/task/overnight-handoff.md`。先前两笔付款与首次 3DS 失败记录保留作历史证据。

本轮合并前只读复核（2026-11-03）：Neon 对应 checkout/order 均为 paid，金额 AUD 750；Stripe 返回 complete / paid / livemode=false / amount_total=75000，card.three_d_secure.result=authenticated、authentication_flow=challenge、version=2.1.0。补验日期沿用协调记录标签，浏览器操作不归称为本轮重新执行。
