# Five-domain implementation tasks

更新日期：2026-11-03

分支：`codex/koala-shopping-experience`。范围：[contracts.md](contracts.md)。

| Task | Batch | Files / deliverable | Gate | Status |
| --- | --- | --- | --- | --- |
| T01 | A | core catalog DTO、精选 fixture、mock catalog adapter 与 variant selection helper | CatalogPort 旧 ID/金额与新规格；纯函数回归 | done |
| T02 | A | product-card/product-detail + PDP searchParams 编排；md/spec/stories | 卡片预览→deep link→选中款→add payload，invalid/pending/缺货 | done |
| T03 | A/B | cart-panel、checkout-form 及 companions | 图片规格/末项空态/分组/摘要；失败、锁车、幂等回归 | done |
| T04 | B | home-hero/home-categories/mobile-nav 及 companions | 文本CTA、市场链接、菜单焦点、两种视口 | done |
| T05 | B | product-list density、集成证据、记录与复盘 | verify、browser smoke、独立 Review | done |

## Execution

- 按公开行为做红→绿切片；最小相关测试先跑，集成后 typecheck → lint → 全量 test，最后 pnpm verify。
- Cart/Checkout/catalog 跨层变更包含 Test AI 设计审查与独立最终 Review。
- 只提交本任务文件；记录每个 task 的代码、验证与残余风险。分支推送不等于生产部署。
- 不把新增筛选、优惠码等高级候选扩入本轮。
