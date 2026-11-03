# C 批能力：范围与冻结契约

更新日期：2026-11-03

状态：implemented-and-locally-validated。用户要求按报告推进 C 批，并明确选择“沿用沙箱示例规则”。沿 A/B 分支 `828b517` 继续，独立分支 `codex/koala-advanced-shopping`。

## Scope

| Task | 能力 | 本轮边界 |
| --- | --- | --- |
| C01 | 高级筛选 | 颜色多选、价格上下限、可售，URL 可重现；同一 variant 满足全部条件；继续现有排序；空态/清除/无效值可解释 |
| C02 | 商品比较 | 最多 3 个明确商品/规格，通过 URL 保存；名称、规格、价格、图、尺寸、材料、可售；缺失写未知，不估算；可返回对应 PDP |
| C03 | 配送估算 | AU 公开测试邮编 2000/3000/4000，演示工作日区间；未知邮编/非 AU 明确无估算；非实际承诺，不改 checkout 的 0 运费/税费 |
| C04 | 优惠码 | AU DEMO10，商品小计 10% 折扣，金额按分四舍五入；单码、不叠加、空码移除；无效/过期示例码不覆盖已有有效码；服务端重算并冻结到 checkout/order/payment total |
| C05 | 评价详情 | Tamarama 少量明显标注的示例评价；评分筛选、排序、展开；非真实客户/Koala 评论，零数据空态 |
| C06 | 套装配置器 | 以既有 Bangalow Sofa + Bangalow Ottoman 为受控样本，从当前商品的本地规格和已存在配套 Ottoman 规格组一个 2-item 套装，明示单品与合计；无额外捆绑折扣；一次原子 addItems，任何无效/缺货/超量整组回滚 |

## Interfaces and failure rules

- `CatalogPort.listProducts` 新增 `colours?: string[]; minPrice?: number; maxPrice?: number; inStockOnly?: boolean`。过滤由 adapter 执行，价格与选中预览必须来自匹配 variant；排序与 limit 在过滤之后。DTO 不泄露供应商字段。
- `ProductDetail.demoReviews?: ProductDemoReview[]`，每项带 `kind: demo`；只在专用示例评价 UI 展示，不作为产品 SEO rating 或已验证购买评价。
- 比较 URL 最多 3 个 product/variant 引用，生成唯一 `item` / `item2` / `item3` 参数（每项为分别编码的 `productId:variantId`）；兼容读取旧重复 `item` 链接。唯一键避免 Next 16 同页导航把重复查询键折叠到末项。无效/重复/过量可见反馈，不 silently compare unrelated defaults；不需要账号或新全局客户端状态。
- CartPort 增加 `addItems(cartId, items: AddCartLineInput[], options)`，最多 2 items；新 route action `addItems` 经完整 schema 校验，复用跨标签 Web Lock、同幂等键和 server transaction。UI 不自己循环发两个 add。
- `applyCoupon` 使用现有 port，空 code 为移除。`Cart.total?` / `Checkout.subtotal?, discount?, couponCode?` / `Order` 相应字段向后兼容旧快照。无字段时回退既有 subtotal/total，不更改历史订单。
- Coupon 影响 server total，不影响 unitPrice/lineTotal/subtotal 的原价语义；Checkout 的 expectedTotal、PaymentRequest.total 和订单总额一致。锁车时禁止修改优惠码；支付成功后清空 cart 优惠；取消后可重新计算。
- 拒绝非 AU coupon；SG/US 保持支付关闭。配送估算不影响费用计算，因此也不影响付款锁车/幂等输入。
- Bundle selection 属 catalog UI；加购原子性属 cart port/postgres adapter。选中无效时不可提交，pending 冻结所有选择；失败保留选择并可复用相同请求重试。
- 未发送的 pending conflict 不得建立新的套装重试或锁；保留原 pending payload/key，并允许原入口恢复。套装成功提示必须绑定实际成功的商品与规格，切换为新组合后不得继续声称新组合已添加。

## Public test seams

沿用户“同样的方式实施和验证”与项目测试规则：纯 query/解析/映射 Vitest；React 可见行为 Testing Library；CatalogPort 和 Cart/Checkout/OrderPort 集成使用真实本地 catalog + PGlite，PaymentPort 边界 mock；UI→真实 store→网络边界验证 IDs/key/payload；市场/响应式由浏览器和 standalone smoke。

金额例：Tamarama 默认 2600 + 三座 3550×2 = subtotal 9700；DEMO10 discount 970；total 8730。价格 12.34 的 10% 为 1.23，total 11.11。无效组合/非法 code/锁车/未知网络结果不能产生部分套装或新支付会话。

## Invariants

比较页的商品/规格选择器须复用已有 happy-dog Select。验收同时覆盖触发器与展开弹层、长列表滚动、窄屏边界、键盘取消，以及真实导航后原触发器焦点；只检查关闭态或原生 select 的功能测试不能替代这项验收。

沿当前 Hard Rules：不缓存价格/库存/cart/checkout/payment；不改供应商支付 SDK/新支付渠道；不改 cookie 创建规则；不新增 CMS/账号/收藏/真实配送/税费，不把 fixture 当官方政策。主题沿 happy-dog；新交互含 md/spec/stories。

原有未提交 AGENTS/DESIGN/PRODUCT/README/研究文档保留，本轮新增契约记录已授权功能范围，不夹带提交这些原有文档。各批提交/推送到本分支，不自动合并或手工部署。
