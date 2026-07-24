# Kimi 任务：M2.1 T01–T03（Home + PLP）

## 角色

你是 Implementer。Leader（Cursor）已完成 T00：分支 `feat/m2.1-home-plp`、冻结契约、交付闭环。

**必读（按序）：**

1. `docs/milestones/phase-2/M2.1/contracts.md`（冻结，勿静默改）
2. `docs/milestones/phase-2/M2.1/TASKS.md`
3. `docs/milestones/phase-2/M2.1-home-plp.md`（PRD 验收）
4. `docs/engineering/page-workflow-guide.md` § catalog / Home
5. `docs/engineering/milestone-delivery-loop.md` §4 交付记录格式
6. `AGENTS.md` Hard Rules（价格不缓存；modules 不 import adapters）

## 范围

只做 **T01 + T02 + T03**。不要做 M2.2–M2.5、不要改 harness 升 companions error、不要引入真实后端。

### T01 — Catalog 契约 + mock

- `ProductListItem` 增加 `slug`（mock 可 `slug === id`）
- `ListProductsQuery` 增加 `collection?`、`sort?: "price-asc"|"price-desc"|"name"`
- mock adapter 实现过滤/排序；更新 `catalog.spec.ts` 等同目录测试
- 所有构造 `ProductListItem` 的地方补 `slug`

### T02 — PLP

- 路由：`src/app/collections/[slug]/page.tsx`（async params）
- 经 `getCapabilities().catalog` 取数；`await connection()` 作 request-time 边界（价格不进共享 cache）
- UI 落 `src/modules/catalog/components/`（文件夹契约：tsx + spec + stories + md）
- 有数据列表、空集合空态、排序（URL `?sort=` 或控件）
- 复用 `ProductCard`

### T03 — Home 入口 + PDP 占位链

- Home 至少一处链到真实 collection（来自 `listCollections()`）
- `ProductCard` 链向 `/products/[slug]`（标题或图可点）
- 极简 PDP stub：`src/app/products/[slug]/page.tsx`（可访问 stub，标明 M2.2）
- 加购行为保持现有 local cart store

## 门禁

每完成一个逻辑 task（建议 T01 一次 commit，T02+T03 可合并或分开）：

1. `pnpm test` 相关 spec + `pnpm typecheck` + `pnpm lint`
2. 写 `docs/milestones/phase-2/M2.1/tasks/T0x-*.md`（含 AI Test Record）
3. 更新 `TASKS.md` 状态
4. `git commit`（Conventional Commits）并 **`git push -u origin HEAD`**
5. 交付记录填 Commit sha

全部完成后写 `.tmp/leader-briefs/kimi-m2.1-t01-t03-done.md`（改了什么、命令结果、残留风险）。

## 禁止

- `src/modules/**` import `@/adapters/**` 或相对路径绕到 adapters
- 把价格列表放进 `'use cache'` 共享缓存
- 改 Stop hook / doctor / 无关 harness
- 扩大 scope 到 search / server cart / checkout

## 完成定义

- PRD 验收 #1–#6 可演示；#7 由 Leader 跑全量 verify
- 工作区干净或仅余说明性未跟踪文件
- done brief 已写
