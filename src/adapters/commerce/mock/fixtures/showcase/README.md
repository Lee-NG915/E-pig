# Curated showcase fixtures

更新日期：2026-11-03

`tamarama.json` 是原始 catalog fixtures 之上的受控演示数据，不由全量抓取脚本覆盖。来源：Koala AU 公开商品 JSON（2026-11-03）及同日 REA D1 / T1 / L3 页面证据，见仓库 Koala 逆向报告。

- Source variant ID 仅用于追溯，adapter 不把它暴露为本地交易 ID。
- 颜色、Size / Section width、商品图来自公开商品 JSON。两座宽 190 cm、三座宽 267 cm，深 104 cm、高 93 cm 来自 D1 / T1 的 Regular 配置；场景图按捕获页面中的对应规格关联，不推测其它颜色图片。
- Winter Cream 三座只保留经过核对的商品首图；不使用两座场景图充当三座图。
- 价格为冻结的本地沙箱金额：旧默认 AU 2600 / SG 2288 / US 1872 保持不变；三座 AU 3550 / SG 3124 / US 2556。不是当前销售价、汇率或促销承诺。availability/maxQuantity 由 adapter 控制，非供应商库存。
- 图片沿用原站公开 URL 用于 demo 研究；未将外部素材授权状态推断为可商用授权。
- 既有 raw fixtures、默认 variant ID 和 Bangalow 测试选项不变。后续刷新须重新验证图片/规格对应关系以及跨市场兼容测试。

`demo-reviews.ts` 是用户批准的 C 批沙箱内容：四条作者编写的评价展示示例，全部带 `kind: demo` 与 Example reviewer 名称。日期/评分/文字均为测试输入，不是从 Koala 获取的客户评价，也不进入产品 SEO rating。

Bangalow Sofa 的 `bundleCompanionId` 指向现有 `bangalow-modular-sofa-ottoman`。关系依据现有 fixture 描述的 companion piece；套装只是两件本地 SKU 各一件，没有新增供应商 bundle ID 或折扣。
