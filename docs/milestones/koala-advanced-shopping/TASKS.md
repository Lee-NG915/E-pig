# C 批任务

更新日期：2026-11-03

范围：[contracts.md](contracts.md)。分支 `codex/koala-advanced-shopping`。

| Task | Owning domain / files | 验证 | 状态 |
| --- | --- | --- | --- |
| C01 | catalog query、mock adapter、PLP filter component/route | 同 variant AND、URL、清除/排序/空态 | done |
| C02 | catalog selection store/API、浮动清单、卡片/PDP入口与比较表 | 原地加入、跨页恢复、3件不同商品、错误/焦点、仅所选详情 | done（购物旅程重做，见 tasks/C02-browse-comparison.md） |
| C03 | checkout delivery estimate helper/component、PDP/Checkout 挂载 | test postcodes / unknown / market | done |
| C04 | cart/postgres/coupon totals、checkout/order展示 | money/reprice/lock/retry/paid snapshots | done |
| C05 | catalog demo review fixture/component | label/filter/sort/empty | done |
| C04-recovery | cart store/receipt API/adapters、恢复 UI、catalog/checkout 协作 | 同 key 自动恢复、身份保护、明确恢复入口、套装旧 Retry | implemented；自动化通过，浏览器视觉待验（tasks/C04-cart-recovery.md） |
| C06 | catalog bundle UI、cart atomic batch、store/API | rollback/idempotency/max/pending/network | done |

Test AI、红绿切片与独立 Review 已完成。最终 typecheck → lint → 全量测试首轮通过，其余 verify 项、build/Storybook、浏览器/市场检查通过，详见 validation.md。六批按依赖顺序 C02 → C01 → C03 → C04 → C05 → C06 提交；共享 DTO/data 和事务基础在各 task 记录中注明。测试最多 2 workers，默认全并发 verify 本轮未重跑，逐项完成组成检查。
