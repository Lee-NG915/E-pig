# Kimi 任务：Saleor Paper → E-pig 融合清单（只读调研 + 写出报告文件）

只读分析，禁止修改 E-pig 业务代码与 Saleor 克隆。允许写入一份报告到：
`/Users/lidonghai/castlery/E-pig/.tmp/leader-briefs/kimi-saleor-fusion-report.md`

## 输入

1. Saleor Paper（只读克隆）：`/Users/lidonghai/castlery/_refs/saleor-storefront`
   - 必读：`AGENTS.md`、`skills/saleor-paper-storefront/SKILL.md`、`README.md`（skill 目录内）
   - 必读 rules：`rules/paper-architecture.md`、`rules/data-caching.md`、`rules/ui-design-system.md`、`rules/seo-metadata.md`、`rules/checkout-management.md`（若存在）
   - 必读代码：`src/lib/cache-manifest.ts`（若存在）、`src/lib/seo/` 目录列表、`package.json` scripts（verify/doctor/skills）
2. E-pig：`/Users/lidonghai/castlery/E-pig`
   - 必读：`AGENTS.md`、`docs/engineering/*.md`、`docs/codex/research/07-*.md`、`src/platform/config/markets.ts`、`src/platform/registry.ts`、现有 `.agents/skills/`

## 硬约束（融合时不得建议推翻）

- modules 不 import adapters/integrations
- 价格/库存/cart/checkout/payment 不进共享 cache
- 匿名 cart 仅首次 mutation 签发
- 不用 Nx；不用 Saleor GraphQL/DTO；不绑定 Saleor 后端
- 不把 75k 编译 AGENTS 整文件塞进上下文

## 输出（写到报告文件）

### A. Saleor 优秀模式清单（每条：模式名 / 机制 / 证据路径）
### B. 可融合到 E-pig 的项（采纳 / 改编 / 拒绝）表
列：项 | 建议 | 落地形态（文档/skill/代码脚手架） | 优先级 H1/H2/H3 | 风险
### C. Skill 配置可学点（thin AGENTS router、rules on-demand、precedence、verify/doctor）
### D. 建议本轮直接落地的最小 diff 清单（≤10 文件级任务）

全文中文，务实，禁止空话。
