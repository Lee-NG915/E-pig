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

| Task | 提交 | 范围 |
| --- | --- | --- |
| T01 | [dd6e4d6](https://github.com/Lee-NG915/E-pig/commit/dd6e4d63354cc5d51ad1dd44c1ec8ed1902f2df1) | 受控规格 / DTO / 图片来源 |
| T02 | [e8010e0](https://github.com/Lee-NG915/E-pig/commit/e8010e093fff41e01009b9207bd19f0fa9fe0c29) | 卡片 / PDP / 深链 |
| T03 | [bbc817c](https://github.com/Lee-NG915/E-pig/commit/bbc817c4898684e1c86e46dfee4dcb8bf54c1132) | 购物袋 / 结账表单 |
| T04 | [f03293c](https://github.com/Lee-NG915/E-pig/commit/f03293c24d9e6ffabef598dd40ac06ae075e51b1) | 首页 / 移动导航 |
| T05 | [004bfc5](https://github.com/Lee-NG915/E-pig/commit/004bfc55fe4a722048c6d0b3759c15f2efe59e0f) | 密度切换 / 集成验证 |

各任务均附 tests / review / follow-ups。五批已推送到同一分支，未合并主干。

## Validation

254 项应用测试（两个 worker）、22 项基础组件测试、8 项 Harness 通过；typecheck/lint、生产和业务 Storybook 构建通过。默认全并发 verify 仍有一个既有策略测试超时，详见 validation，不将其写成完整命令 PASS。

浏览器已核验首页/导航、PLP、PDP、真实服务端购物袋与结账表单；本轮未提交支付或部署。研究报告是开始本轮前已有的工作区文档，未与实现一起提交；公开参考入口：[Koala AU](https://au.koala.com/collections/sofas-couches)。
