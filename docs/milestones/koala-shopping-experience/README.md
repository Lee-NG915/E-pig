# Koala 五领域体验实现

更新日期：2026-11-03

分支：`codex/koala-shopping-experience`。按用户“按报告推进五个领域，分批实施”的确认执行 A/B 两批。

[范围与约束](contracts.md) · [任务清单](TASKS.md) · [验证与限制](validation.md) · [复盘](retros/milestone.md)

| 领域 | 本轮可复用能力 |
| --- | --- |
| Homepage | 文图 Hero、移动两列类目、分组导航与焦点管理 |
| PLP | 颜色缩略图、图片切换、所选规格深链、移动单/双列 |
| PDP | query 恢复、颜色/尺寸配置、对应图/价/尺寸、共享移动购买栏 |
| Cart | 服务端图片/规格、返回所选商品、空态分类入口 |
| Checkout | 联系/配送分组、图文商品摘要、返回购物袋 |

首个完整配置样本为 Tamarama（两色×两尺寸、Regular）；所有价格/可售值仍为沙箱数据。AU 支付链路不变，SG/US 支付保持关闭。

## Task commits

提交映射在任务提交后回填。各任务均附 tests / review / follow-ups。

## Validation

254 项应用测试（两个 worker）、22 项基础组件测试、8 项 Harness 通过；typecheck/lint、生产和业务 Storybook 构建通过。默认全并发 verify 仍有一个既有策略测试超时，详见 validation，不将其写成完整命令 PASS。

浏览器已核验首页/导航、PLP、PDP、真实服务端购物袋与结账表单；本轮未提交支付或部署。研究报告是开始本轮前已有的工作区文档，未与实现一起提交；公开参考入口：[Koala AU](https://au.koala.com/collections/sofas-couches)。
