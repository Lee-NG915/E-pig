# M2.1 Task 看板

更新日期：2026-07-19

| ID | 标题 | Owner | Status | 交付记录 |
| --- | --- | --- | --- | --- |
| T00 | 里程碑引导：分支 + 交付闭环文档 + 冻结契约 | cursor | done | [tasks/T00-bootstrap.md](./tasks/T00-bootstrap.md) |
| T01 | Catalog 契约：`slug` / `collection` / `sort` + mock adapter 测试 | kimi | done | [tasks/T01-catalog-contract.md](./tasks/T01-catalog-contract.md) |
| T02 | PLP 页 `/collections/[slug]` + 列表/空态/排序 + 组件 companions | kimi | done | [tasks/T02-plp.md](./tasks/T02-plp.md) |
| T03 | Home 入口到 PLP；product-card 链向 `/products/[slug]`；PDP stub | kimi | done | [tasks/T03-home-pdp-link.md](./tasks/T03-home-pdp-link.md) |
| T04 | Leader Review（Claude）+ `pnpm verify` + 里程碑验收对照 | claude / cursor | todo | — |

## 验收映射（PRD §4）

| PRD # | 门槛 | 覆盖 task |
| --- | --- | --- |
| 1 | PLP 路由 + 非空列表 | T02 |
| 2 | 名/价/图 + PDP slug 链 | T01–T03 |
| 3 | Home → PLP | T03 |
| 4 | 排序之一 + 测试 | T01–T02 |
| 5 | 空态 | T02 |
| 6 | modules 不碰 adapters | 全程 |
| 7 | typecheck / 测试绿 | T04 |
