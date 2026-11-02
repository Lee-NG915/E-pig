# 全站优化与沙箱交易闭环 — 决策及契约记录

更新日期：2026-11-02

状态：implementation — 用户已批准评审后的精简方案，执行中

主文档：[需求文档](./requirements.md)。本文件用于保留本轮用户决定与未决边界，不替代需求审核。

## 已确认的用户决定

| ID | 决定 | 来源 |
| --- | --- | --- |
| C01 | 新开分支，按照当前设计规范优化整个电商项目 | 2026-11-02 用户原始请求 |
| C02 | 先设计需求文档，用户审核后再进行下一步 | 2026-11-02 用户原始请求 |
| C03 | 验收终点：沙箱支付成功，并生成可回查订单 | 2026-11-02 用户选择“沙箱支付成功并生成可回查订单（建议）” |
| C04 | AU 完整闭环；SG/US 做路由、币种与购物车隔离兼容检查 | 2026-11-02 用户选择“AU 完整闭环，SG/US 做兼容检查（建议）” |

## 继承的项目约束

- `DESIGN.md` + happy-dog tokens 作为设计依据；不自行将 proposal 文档改为 accepted。
- 单 Next.js App；`app → modules → core`；ports/adapters 与 integration 分工不变。
- 市场路径前缀与 typed registry；价格/库存/cart/checkout/payment 不缓存；私有订单不进入共享缓存。
- 匿名 cart 只在首次 mutation 创建，request API 全部 async；server secret 不进入客户端。
- 运行时行为变更同 patch 带测试；cart/checkout/payment/跨层实现必须走 Dual-AI 和质量门。

## 本轮批准与技术契约（2026-11-02）

用户“可以，按照这个方案开始执行”批准前文 Netlify Free + Neon Free + Stripe Sandbox 与 review.md 精简范围；随后选择“新建测试站点”。不包含正式收款或付费计划升级。

- D01/D02：Stripe 托管 card 沙箱、游客、签名 Cookie 30 天、同浏览器 orders 列表与明细。清除凭证不可自动恢复。
- D03：保留本地展示目录，明确标识受控 SANDBOX SKU、价格、可售状态及每规格数量上限；覆盖每个购买入口，至少一个多规格样本。没有真实库存扣减或发货。
- D04/D06/D08：基本关键词搜索与已有排序、帮助页、Blog 列表设计统一；优惠码、新筛选、Blog 详情、账号/收藏与旧车迁移延后。旧 localStorage 不导入也不删除。
- D05：AU 测试收件姓名/邮箱/地址/城市/州/四位邮编必填，电话选填；配送和税额为 0，醒目标注沙箱测试值，不构成真实政策。服务端根据规格重查价格，与用户确认金额比较后才能支付。
- D07：Netlify 新测试站点 + Neon 独立 Postgres 17 数据库；凭据仅本机忽略文件与托管平台机密配置。账号连接和真实支付验收单独记录。
- 同 cart revision 最多一个活跃 checkout；支付期间 server 锁车；取消跳转不解锁，只有 Stripe 确认已过期才能解锁。paid 后原子清空对应 revision，保留 cart identity 供查历史订单。
- 持久化 cart/checkout/order 与请求幂等；网络调用在数据库短事务之外。支付创建响应未知时重用相同参数和 key；超过 23 小时不盲目重新创建，可信 webhook 可按已有 session 恢复。
- Cookie 首次加购签发，GET 不创建。首个 mutation 跨标签页 Web Lock 串行；未知响应的操作 key 暂存在独立存储键，只含操作标识/商品/规格/数量，不含价格或联系方式。浏览器不支持 Web Locks 时明确限制写操作。
- 商品金额 DTO 沿用主单位，支付 adapter 唯一转换为整数分。Webhook 签名、金额、币种、session、checkout、market 全部核验。
- API `/api/{market}/cart|checkout|orders` 自己校验 active market 与凭证；不经市场重定向。Webhook `/api/payments/stripe` 接受原始签名正文。
- 沙箱数据用于验收；测试结束后应主动清理，未实施自动保留期/清理任务；付款前提示仅使用测试地址。真实个人信息治理不在此沙箱上线承诺内。

实施清单与文件接口见 [TASKS.md](./TASKS.md)。上列决策覆盖旧草案中“待审/建议”的对应项。

## 当前分支与证据范围

- 分支：`codex/storefront-end-to-end-requirements`。
- 基于本轮开始时干净的 `feat/skill-test`，SHA `4f30a6a36058ab565c36cdc512729da18b73ed65`；未切回 main 或同步远端。
- 原需求阶段仅静态盘点；当前进入实现。实际测试与云端验收见各 task 记录，不以实现存在作为支付完成证据。
- 下一阶段需重新确认依赖工具链：package.json 固定 pnpm 10.34.5，本次环境中 `pnpm --version` 因固定版本解析目录不可写而回退为 12.4.2；本轮未修改包管理器配置，也未用该版本安装依赖。
- pnpm 10.34.5 已通过 Corepack 安装验证；后续安装和命令均使用固定版本。

## 审核记录

| 日期 | 审核内容 | 结果 |
| --- | --- | --- |
| 2026-11-02 | C03 支付终点、C04 市场范围 | 已确认 |
| 2026-11-02 | 评审后的精简范围与 Netlify + Neon + Stripe Sandbox | 用户批准执行 |
| 2026-11-02 | Netlify 站点选择 | 用户确认新建测试站点 |
