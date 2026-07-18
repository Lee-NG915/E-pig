# E-pig 架构研究索引

更新日期：2026-07-18

## 目标

本目录记录从 Joyboy 提炼轻量级、可复制、可快速部署电商前端系统的第一轮研究。文档只做架构和选型评估，不包含实现代码，也不假设 Joyboy 的企业级复杂度都应复制。

## 研究基线

- Joyboy 本地路径：`/Users/lidonghai/castlery/joyboy`
- Joyboy Git 快照：`5ad622b576837b78e18c7dae6fd0de14b7335aff`
- 快照最后提交：2026-07-16 `chore: release master (#1624)`
- Joyboy 根版本：`1.180.0`；Web：`1.98.0`；POS：`1.75.0`
- 调研日期：2026-07-18
- 版本写法：Joyboy 使用其 manifest 中的声明范围；新系统使用建议的主版本线，初始化时再由 lockfile 固定精确版本。
- 安全原则：只记录环境变量名称，不复制 Joyboy 的 token、密钥、内部接口值或私有配置。

## 文档导航

1. [Joyboy 现状与架构盘点](./01-joyboy-current-state.md)
2. [Joyboy 依赖与版本清单](./02-joyboy-dependencies.md)
3. [Joyboy 第三方与基础设施清单](./03-joyboy-third-parties.md)
4. [E-pig 目标架构与技术选型](./04-e-pig-target-architecture.md)
5. [第三方、开源替代与免费额度决策](./05-provider-decision-matrix.md)
6. [实施路线图、验收门槛与待确认项](./06-roadmap-and-open-questions.md)
7. [Next 16 缓存、购物车与市场路由决策](./07-next16-cache-cart-routing-decisions.md)

## 第一轮结论

- 继承 Joyboy 的领域边界、服务端优先渲染、市场配置、第三方事件解耦、可观测性和测试意识。
- 不复制 Nx、双应用、60+ 内部项目、三层拆成独立 package、80+ 路径别名、Redis ISR、完整 Storybook/Chromatic、Datadog + Sentry 双监控等企业级成本。
- E-pig 第一阶段采用单个 Next.js 应用、按业务垂直切片、port/adapter、mock adapter、Docker 标准部署和可选 SaaS integration。
- P0 不依赖付费 CMS、搜索、个性化、客服、忠诚度和营销平台。支付只接 Stripe sandbox；生产支付、税务、物流和订单真源必须由后端/provider 承担。
- 第三方 SDK 不允许散落在页面或业务组件中：会决定业务结果的实现统一经过 `adapters`，可降级副作用经过 `integrations`。
- P0 启用 Next 16 Cache Components，但只显式缓存公开、共享、稳定的数据；私有和交易数据默认 request-time。
- 公开 URL 不是预设的 `[market]/[locale]`。单市场 P0 默认无前缀；多市场单语言可参考 Koala 的市场子域模式。

## 结论状态

当前全部为 `proposal`。你 review 后，建议把每个关键选择分别标记为：`accepted`、`rejected`、`deferred` 或 `needs-spike`，再开始脚手架实现。
