# Saleor Paper → E-pig 融合调研报告

> 只读分析，未修改 E-pig 业务代码与 Saleor 克隆。
> 报告日期：2026-07-19

---

## A. Saleor 优秀模式清单

| # | 模式名 | 机制 | 证据路径 |
| --- | --- | --- | --- |
| 1 | **Thin AGENTS router** | 根 `AGENTS.md` 只做轻量路由：指引去哪里读，不堆砌细则；深度规则放在 `skills/<skill>/rules/<task>.md`，按任务按需加载。 | `_refs/saleor-storefront/AGENTS.md:1-65` |
| 2 | **Skill frontmatter 路由** | 每条 rule 带 YAML frontmatter（`name` / `description`），`SKILL.md` 做索引表，AI 按任务匹配 description 读单条 rule，避免加载 ~75k 编译版 `AGENTS.md`。 | `_refs/saleor-storefront/skills/saleor-paper-storefront/SKILL.md:1-151`；`_refs/saleor-storefront/skills/saleor-paper-storefront/rules/*.md` |
| 3 | **编译版 AGENTS 隔离** | `scripts/compile-agents.mjs` 生成完整合并文档供人类离线阅读；`.cursorignore` 将其隔离，防止 AI 自动加载膨胀上下文。 | `_refs/saleor-storefront/scripts/bootstrap-agent-skills.mjs:1-44`；`_refs/saleor-storefront/scripts/paper-doctor.mjs:100-111` |
| 4 | **Cache manifest 真源** | `src/lib/cache-manifest.ts` 统一定义 cache profile、tag pattern、path pattern、失效计划；`applyCacheProfile()` 在 `"use cache"` 函数内统一设置 `cacheLife` + `cacheTag`；webhook handler 调用纯函数 `plan*Revalidation()` 生成 tags/paths。 | `_refs/saleor-storefront/src/lib/cache-manifest.ts:1-455` |
| 5 | **Static / hybrid 页面边界模型** | 静态页：async page 直接渲染缓存 shell，**无 page-level Suspense**；混合页：仅把 `searchParams`/cookies 驱动的动态岛包进 `Suspense`，骨架只作为 per-hole 占位。Layout 同步，`main` 永远不被 chrome Suspense 包裹。 | `_refs/saleor-storefront/skills/saleor-paper-storefront/rules/paper-architecture.md:83-111`；`_refs/saleor-storefront/skills/saleor-paper-storefront/rules/data-caching.md:74-95` |
| 6 | **BFF auth + HttpOnly cookie** | 登录/会话走 `/api/auth/*` Route Handler，cookie 共享 storefront 与 checkout；RSC 通过 `resolveSessionUser` 解析，账户路由用 layout-shell Suspense 做 auth gate。 | `_refs/saleor-storefront/skills/saleor-paper-storefront/rules/data-auth-routes.md`（引用）；`_refs/saleor-storefront/skills/saleor-paper-storefront/rules/paper-architecture.md:37` |
| 7 | **Two surfaces 拆分** | 同一仓库维护 storefront（浏览）与 checkout（交易）两个 surface，route group 隔离，跨 surface URL 通过 `@paper/session-bridge`。 | `_refs/saleor-storefront/skills/saleor-paper-storefront/rules/paper-architecture.md:31`；`_refs/saleor-storefront/skills/saleor-paper-storefront/rules/paper-surfaces.md` |
| 8 | **设计 Token 系统** | `src/styles/brand.css` 作为真源，语义色（background/foreground/muted/primary…）、流体字号角色（display/h1/h2/h3/lead/eyebrow）、容器宽度（container-content/wide/super-wide/full）、section rhythm（py-section-*）、radius/elevation/motion tokens；禁止硬编码颜色。 | `_refs/saleor-storefront/skills/saleor-paper-storefront/rules/ui-design-system.md:1-173`；`_refs/saleor-storefront/src/styles/brand.css`（引用） |
| 9 | **Brand Influence Policy** | 品牌色按层级使用：中性壳大面积使用，品牌色只留给 CTA/链接/选中态/徽章等 Tier-1；禁止默认紫/渐变滥用。 | `_refs/saleor-storefront/skills/saleor-paper-storefront/rules/ui-design-system.md:45-51`；`_refs/saleor-storefront/skills/saleor-paper-storefront/rules/design-quality-rubric.md` |
| 10 | **SEO 集中 helpers** | `src/lib/seo/` 集中管理 config、metadata、JSON-LD、hreflang、OG；`buildPageMetadata()` 截断标题/描述；`jsonLdScriptProps()` 用 `serializeForInlineScript` 转义，避免 `</script>` 注入。 | `_refs/saleor-storefront/src/lib/seo/config.ts:1-67`；`_refs/saleor-storefront/src/lib/seo/metadata.ts:1-214`；`_refs/saleor-storefront/src/lib/seo/json-ld.ts:1-122` |
| 11 | **Agent setup 健康检查** | `pnpm doctor`（`scripts/paper-doctor.mjs`）检查 project skill symlink、外部 skill lockfile 安装、agent docs 是否漂移、编译版 AGENTS 是否被隔离、Next.js agent-rules block 是否存在。 | `_refs/saleor-storefront/scripts/paper-doctor.mjs:1-155` |
| 12 | **统一 verify 门** | `pnpm verify` = docs:check + design-tokens + typecheck + lint + test:run，作为“是否完成”的单一出口。 | `_refs/saleor-storefront/package.json:28` |
| 13 | **Checkout 浅层 step URL** | step 切换用 `updateCheckoutQuery({ step })` 直接写 `history.pushState/replaceState`，避免 `router.replace` 触发 RSC 重取；用 intent 驱动 UI 而不是原始 URL，防止 revalidation 把 step 冲回 Contact。 | `_refs/saleor-storefront/skills/saleor-paper-storefront/rules/checkout-management.md:60-73` |
| 14 | **支付前 live total 校验** | 任何 `transactionInitialize` 前调用 `updateCheckoutBilling()` → `refreshCheckout()` 获取实时 gross total；若展示金额与 live 金额有实质差异，阻断支付并提示价格变化。 | `_refs/saleor-storefront/skills/saleor-paper-storefront/rules/checkout-management.md:81` |
| 15 | **Skills bootstrap / lockfile** | `skills-lock.json` 锁定外部 skill；`pnpm skills:bootstrap` 用 symlink 把 project skill 挂到 `.agents/skills/`，再用 `npx skills experimental_install` 恢复外部 skill。 | `_refs/saleor-storefront/scripts/bootstrap-agent-skills.mjs:1-44`；`_refs/saleor-storefront/skills/saleor-paper-storefront/README.md:7-31` |

---

## B. 可融合到 E-pig 的项

| 项 | 建议 | 落地形态 | 优先级 | 风险 |
| --- | --- | --- | --- | --- |
| Thin AGENTS.md router + skill 索引 | **采纳** | 把现有 AGENTS.md 后半段细则拆成 `.agents/skills/e-pig/SKILL.md` + `rules/*.md`，AGENTS.md 只保留指针 | H1 | 低；不触碰运行时 |
| Skill frontmatter 描述路由 | **采纳** | 新 project skill 的 rule 文件全部加 YAML frontmatter（name/description），SKILL.md 做分类索引 | H1 | 低 |
| 编译版 AGENTS 隔离 | **采纳** | 若未来生成合并版 AGENTS，加 `.cursorignore` 隔离；当前先建立 quarantine 惯例 | H2 | 低 |
| Cache manifest 真源 | **改编** | 在 `src/shared/lib/cache-manifest.ts` 建立 content/navigation/taxonomy/catalog-stable 的 profile/tag/path 定义；**价格/库存/cart/checkout/payment 不进入**。配合 `applyCacheProfile()` helper | H1 | 中；需与现有 07 决策对齐，避免引入 cart 缓存 |
| Static/hybrid 页面边界模型 | **采纳** | 在 `docs/engineering/page-workflow-guide.md` 增加“缓存 shell 与动态岛”章节；新建/改页面时显式标出 `<Suspense>` 边界 | H1 | 低；纯文档 + 代码 review 口径 |
| Layout sync + per-slot Suspense | **采纳** | Root layout 保持同步；header/footer/cart drawer 等 chrome 分别包独立 Suspense，`main` 不包 | H2 | 中；需重构现有 layout，但符合 07 决策 |
| BFF auth + HttpOnly cookie | **拒绝（当前）** | E-pig P0 无认证需求；未来 account 域再评估，不提前引入 | H3 | — |
| Two surfaces（storefront/checkout） | **拒绝** | E-pig 是单 surface P0；不引入 session-bridge 与 checkout route group | H3 | — |
| Locale/channel URL 前缀路由 | **拒绝** | E-pig 用 host → market，P0 单市场无前缀；不复制 Saleor 的 `/{locale}/{channel}` | H3 | — |
| next-intl / 三字符串系统 | **拒绝（当前）** | E-pig P0 市场均为英语，区域差异用 market registry；不提前引入 i18n 库 | H3 | — |
| 设计 token 系统文档化 | **改编** | 把 Tailwind 4 CSS variables / happy-dog tokens 整理成一份 `packages/happy-dog/docs/design-tokens.md` 或 `.agents/rules/design-tokens.md`，明确语义色、流体字号、容器宽度规则 | H1 | 低 |
| Brand Influence Policy | **采纳** | 写入 design-tokens rule：品牌色只用于 CTA/链接/选中/徽章；禁止默认紫色与 body 渐变 | H2 | 低 |
| SEO helpers 集中化 | **采纳** | 新建 `src/shared/lib/seo/`：config.ts、metadata.ts、json-ld.ts、hreflang.ts；适配 E-pig market registry 生成 canonical/hreflang | H1 | 中；需绑定 market/host 逻辑，但无运行时风险 |
| `pnpm verify` 统一出口 | **采纳** | `package.json` 新增 `"verify": "pnpm docs:check && pnpm typecheck && pnpm lint && pnpm test"`；AGENTS.md Commands 同步 | H1 | 低 |
| `pnpm doctor` agent 健康检查 | **采纳** | 新增 `scripts/e-pig-doctor.mjs`：检查 `.agents/skills/` symlink、外部 skill 存在、`docs:check` 通过、env schema 可解析 | H2 | 低 |
| Skills bootstrap + lockfile | **改编** | E-pig 不引入外部 skill lockfile 机制；但可保留 `scripts/bootstrap-agent-skills.mjs` 用于 symlink project skill | H2 | 低 |
| Checkout 浅层 step URL | **改编（未来）** | 进入 checkout 域后，step 切换优先用 `history.pushState` 浅更新，避免 Server Action revalidation 冲掉 step | H3 | 中；需结合实际 checkout 实现评估 |
| 支付前 live total 校验 | **改编（未来）** | checkout 接入真实 adapter 后，支付前刷新 live total，金额变化时阻断并提示 | H3 | 中；金钱路径，必须人审 |
| Saleor GraphQL / DTO / webhook 事件映射 | **拒绝** | 硬约束：不绑定 Saleor 后端、不引入 Saleor GraphQL/DTO | — | — |
| Client-side urql / browser SDK | **拒绝** | 硬约束：E-pig 用 RSC + Server Actions + port/adapter | — | — |
| Nx / monorepo 编排 | **拒绝** | 硬约束：不用 Nx；E-pig 已是 pnpm workspace 轻量结构 | — | — |

---

## C. Skill 配置可学点

### C1. Thin AGENTS router

Saleor Paper 的 `AGENTS.md` 只有 ~65 行，核心只做三件事：
1. 指明按问题类型去哪里读（Next.js bundled docs → SKILL.md → 单条 rule）。
2. 声明 precedence：Paper rules > 外部 skills。
3. 列出 critical commands 与 non-negotiable rules。

E-pig 当前 AGENTS.md 已经把大量细则直接写入（AI 测试工作流、Hard Rules、多市场注意等），虽然可读，但每次会话默认加载的 token 较多。可学习把“日常参考深度”迁到 `.agents/skills/e-pig/` 与 `rules/`，AGENTS.md 只留**指针 + 硬约束摘要**。

### C2. Rules on-demand

Saleor 的 `SKILL.md` 按 priority 分类（Architecture / Data / Product / Checkout / Design / UI / SEO / Dev），每个 category 下是独立 `rules/<name>.md`。每条 rule 文件头带：

```yaml
---
name: data-caching
description: Paper caching decisions: Cache Components (PPR), ...
---
```

AI 收到具体任务时，读 `SKILL.md` 索引，再读**一条**匹配的 rule，而不是读全部。E-pig 可以按现有领域（import-boundary / component-folder / cache / market / seo / test）拆分 rule，降低上下文占用。

### C3. Precedence 声明

Saleor 明确写：“Paper rules are authoritative on architecture. On any conflict, Paper wins.” 这避免了多个 skill（如 Vercel 通用最佳实践）与项目定制规则冲突时 AI 选错。E-pig 也应在 AGENTS.md / project skill 中声明：
- E-pig Hard Rules > 通用 Vercel/React skill。
- `docs/codex/research/04` / `07` > 任何外部经验。

### C4. Verify / doctor

Saleor 的 `verify` 是“am I done?” 单一出口；`doctor` 是“agent setup 是否健康”的独立检查。两者职责分离：

- `verify`：代码质量门（docs:check + lint + typecheck + test）。
- `doctor`：agent 环境健康（skill symlink、外部 skill 安装、docs 编译同步、`.cursorignore` quarantine、env）。

E-pig 当前有 `docs:check` / `quality:diff` / `quality:companions`，但缺少一个总入口 `verify`；也没有检查 AI 是否能正确发现 project skill 的 `doctor`。直接移植 `doctor` 模式可以解决“agent  silently dumber”问题。

### C5. Skills bootstrap / lockfile / quarantine

Saleor 用 `skills-lock.json` + `npx skills experimental_install` 管理外部 skill；project skill 用 symlink 挂到 `.agents/skills/`，避免 copy drift；合并版 `AGENTS.md` 用 `.cursorignore` 隔离。E-pig 可以：
- 保留 symlink 方式挂 project skill（如果未来有）。
- 若生成任何“合并参考文档”，一律 quarantine。
- 不引入 Saleor 的 `skills-lock.json` 机制（E-pig 外部 skill 目前只有 Vercel skill，数量可控）。

---

## D. 建议本轮直接落地的最小 diff 清单（≤10 文件级任务）

以下任务全部**不修改业务运行时行为**，只补治理/文档/脚手架。落地后不影响现有 mock adapter、localStorage cart 或单市场路由。

### T1. 新增 `pnpm verify` 统一出口
- **文件**：`package.json`（scripts）、`AGENTS.md`（Commands 章节）
- **内容**：`"verify": "pnpm docs:check && pnpm typecheck && pnpm lint && pnpm test"`
- **原因**：Saleor 的 `verify` 模式；让 AI 和人类有单一“是否完成”命令。
- **风险**：低。

### T2. 新增 `pnpm doctor` 与 `scripts/e-pig-doctor.mjs`
- **文件**：`package.json`、`scripts/e-pig-doctor.mjs`（新建）
- **检查项**：
  1. `.agents/skills/` 下 project skill 是否存在（若有）。
  2. 外部 skill（vercel-react-best-practices）是否已安装。
  3. `pnpm docs:check` 通过。
  4. `.env.example` 与 `src/platform/config/env.ts` schema 关键字段一致（可选）。
  5. 若生成过合并版 AGENTS，检查是否被 `.cursorignore` 隔离。
- **原因**：解决 agent setup 静默损坏问题。
- **风险**：低；纯诊断脚本。

### T3. 创建 E-pig project skill 骨架
- **文件**：`.agents/skills/e-pig/SKILL.md`（新建）、`.agents/skills/e-pig/rules/` 目录（新建）
- **内容**：
  - `SKILL.md`：frontmatter（name/description/version），rules 索引表（architecture / cache / component-folder / market / seo / test）。
  - 至少一条 rule：`.agents/skills/e-pig/rules/e-pig-architecture.md`（把 AGENTS.md 中 Hard Rules / 架构摘要迁移过来）。
- **原因**：建立 thin router + on-demand rules 结构。
- **风险**：低；新文件不影响既有路径。

### T4. 在 AGENTS.md 增加 project skill 指针
- **文件**：`AGENTS.md`
- **内容**：顶部 `@.agents/skills/e-pig/SKILL.md` 或“如何获取上下文”段落，引导读 SKILL.md 再读单条 rule。
- **原因**：完成 thin router 改造第一步。
- **风险**：低。

### T5. 新增 `.cursorignore` 隔离未来合并文档
- **文件**：`.cursorignore`（新建）
- **内容**：`.agents/skills/e-pig/AGENTS.md`（若未来生成）、`logs/`。
- **原因**：预防未来 compiled AGENTS 被 AI 自动加载。
- **风险**：低。

### T6. 建立 `src/shared/lib/seo/` 脚手架
- **文件**：
  - `src/shared/lib/seo/config.ts`：站点名、默认描述、noIndexPaths、`getBaseUrl()`。
  - `src/shared/lib/seo/metadata.ts`：`rootMetadata`、`buildPageMetadata(options)`、`buildBrowsePageMetadata(options)`（适配 market registry）。
  - `src/shared/lib/seo/json-ld.ts`：`buildProductJsonLd(options)`、`jsonLdScriptProps(data)`，用安全的 inline script 序列化（可复用现有 `@/lib/html/inline-script` 或新建等效函数）。
  - `src/shared/lib/seo/hreflang.ts`：基于 `src/platform/config/markets.ts` 生成 canonical/hreflang alternates。
  - `src/shared/lib/seo/index.ts`：barrel export。
- **原因**：集中 SEO helpers；PDP/PLP/Home 接入时无需各自拼 metadata。
- **风险**：中；注意 `shared` 不得反向依赖 modules/platform——metadata helpers 应接收 market/locale 作为参数，而不是直接 import registry。

### T7. 建立 `src/shared/lib/cache-manifest.ts` 脚手架
- **文件**：`src/shared/lib/cache-manifest.ts`（新建）
- **内容**：
  - `CACHE_PROFILES`：content、navigation、taxonomy、product-stable、collection-stable 等 profile（profile → `cacheLife` name + tag pattern + path pattern）。
  - `applyCacheProfile(profile, params)`：在 `"use cache"` 函数内调用，禁止 raw `cacheLife`/`cacheTag`。
  - `buildTag()` / `buildPath()` / `buildPathsForAllMarkets()`：基于 market registry 生成 tag 与路径。
  - 明确排除：price、inventory、cart、checkout、payment 不进入共享 cache。
- **原因**：把 07 决策里的缓存矩阵变成可执行的单一真源。
- **风险**：中；必须严格遵守 Hard Rules，price/inventory/cart/checkout/payment 不得出现；建议加 ESLint 或脚本扫描做二次防护。

### T8. 新增一条 `.agents/rules/cache-rules.md`
- **文件**：`.agents/rules/cache-rules.md`（新建）
- **内容**：重申 E-pig Hard Rules 中的缓存条款，并给出正确/错误示例；与 `src/shared/lib/cache-manifest.ts` 和 07 文档保持一致。
- **原因**：把缓存规则变成 agent 可读的 on-demand rule。
- **风险**：低。

### T9. 更新 `check-doc-sync.mjs` 校验 `verify`/`doctor`
- **文件**：`scripts/quality/check-doc-sync.mjs`
- **内容**：AGENTS.md Commands 章节除了检查现有 scripts，还要检查新增的 `verify`、`doctor`。
- **原因**：保持 docs 与 package.json 同步。
- **风险**：低。

### T10. 更新 `README.md` 常用命令
- **文件**：`README.md`
- **内容**：在“常用命令”中新增 `pnpm verify` 与 `pnpm doctor`。
- **原因**：人类开发者也能看到新命令。
- **风险**：低。

---

## 本轮落地范围总结

- **不触碰**：adapters、modules 业务组件、cart 实现、支付、真实后端集成、多市场 URL 结构。
- **主要收益**：建立与 Saleor Paper 对齐的 agent 治理薄层（thin AGENTS router、project skill、verify/doctor）、SEO 与 cache manifest 脚手架，为 Phase 2 PDP/PLP/page 开发提供可复用基础。
- **下一步（非本轮）**：待 SEO/cache helpers 接入真实页面后，再补充对应 `.spec.ts`；checkout 域实现后引入浅层 step URL 与 live total 校验。
