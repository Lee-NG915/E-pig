# Phase 1 评审：最小骨架

更新日期：2026-07-18

| 项 | 值 |
| --- | --- |
| Phase | 1 — 最小骨架（docs/codex/research/06 §1） |
| 评审日期 | 2026-07-18 |
| 代码基线 | `e079706`（happy-dog 组件库集成）；评审时另有未提交的 phase-review skill 与本文档 |
| 总分 / 等级 | **97.1 / 100 — 优秀** |

## 1. 验收标准核对

来源：docs/codex/research/06 §1 Phase 1 的验收行（**加粗** = 门槛条目，权重 ×2）与范围条目（原子化后共 26 条）。

| # | 验收条目 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | **`.env.example` 复制即可用** | ✅ | `.env.example` 在仓；`env.ts` 默认值（MARKET=au、COMMERCE_ADAPTER=mock）经 `env.spec.ts` 6 用例覆盖 |
| 2 | **install 可复现** | ✅ | `pnpm-lock.yaml` 在仓；`engines.node>=24`、`.nvmrc=24`；本机 `npx pnpm@10.34.5` 实际安装/运行成功 |
| 3 | **`pnpm dev` 无 SaaS 账号可运行** | ✅ | 本评审周期内 au/sg/us 三个 dev server 实际启动并返回 200；默认 `COMMERCE_ADAPTER=mock` |
| 4 | **Node 24 下 typecheck 绿** | ✅ | `npm run typecheck` PASS（2026-07-18 实跑） |
| 5 | **lint 绿** | ✅ | `npm run lint` PASS（2026-07-18 实跑） |
| 6 | **unit/component tests 绿** | ✅ | `npm test`：11 文件 70 用例全过；`packages/happy-dog` 独立 vitest：2 文件 4 用例全过 |
| 7 | **doc sync 门禁绿** | ✅ | `node scripts/quality/check-doc-sync.mjs` → `[doc-sync] PASS` |
| 8 | **Turbopack build 绿** | ✅ | `npm run build` PASS；路由 `/` 为 `◐ Partial Prerender`；`.next/standalone/server.js` 生成 |
| 9 | **SG runtime smoke 绿** | ✅ | `npm run smoke:runtime-market` → `PASS — SG runtime config is consistent`；浏览器 DOM 实测：徽标 `Singapore · SGD`、Alto $2,490、划线价 $2,890 |
| 10 | Next 16.2 App Router + cacheComponents + strict TS + Tailwind 4 + tokens | ✅ | `next.config.ts`：`cacheComponents: true`、`output: "standalone"`；`tsconfig.json` `strict: true`；版本实测 next 16.2.10 / react 19.2.7 / tailwind 4.3.3 / ts 6.0.3；tokens 在 `globals.css` + `packages/happy-dog/src/theme/` |
| 11 | env schema（server/client 分离） | ✅ | `src/platform/config/env.ts`（@t3-oss/env-nextjs）+ `env.spec.ts`、`env-policy.spec.ts`；非法 `MARKET=xx` 启动即抛错（实测） |
| 12 | typed market registry | ✅ | `src/platform/config/markets.ts`（au/sg/us）；文件头明确"不预登记无业务计划的市场" |
| 13 | host/locale 纯函数校验 | ✅ | `resolveMarketFromHost` / `isLocaleSupported` 纯函数；`markets.spec.ts` 覆盖精确匹配、端口剥离、子域回退、未知 host 返回 null |
| 14 | 结构化 logger | ✅ | `src/platform/logging/logger.ts` + `logger.spec.ts` |
| 15 | error model | ✅ | `src/core/errors/errors.ts`（typed error kinds）+ `errors.spec.ts` |
| 16 | mock CatalogPort | ✅ | `src/adapters/commerce/mock/catalog.ts` + 按市场定价数据 + `catalog.spec.ts` |
| 17 | mock CartPort | ✅ | `src/adapters/commerce/mock/cart.ts`（快照模型：line 自带 priceAmount/priceCurrency）+ `cart.spec.ts` |
| 18 | capability registry | ✅ | `src/platform/registry.ts` 按 `COMMERCE_ADAPTER` 装配 |
| 19 | adapter/integration 分层 | ✅ | `adapters/commerce/mock/` 与 `integrations/analytics/` 分目录；ESLint `no-restricted-imports` 强制 modules 不得 import adapters/integrations |
| 20 | Docker standalone | 🟡 | `Dockerfile` 在仓且 standalone 产物（server.js）已由 build 验证；但本机 Docker daemon 不可用，镜像未实际 `docker build` |
| 21 | CI typecheck/lint/test/build | 🟡 | `.github/workflows/ci.yml` 在仓、覆盖四门；未在 GitHub 实际触发过，YAML 正确性未经远端验证 |
| 22 | 可交互 Home demo | ✅ | 浏览器实测三市场渲染（hero/商品网格/徽标/benefits），截图归档 `logs/screenshots/`；`cart-flow.spec.tsx` 覆盖加购交互 |
| 23 | 按 market/version 隔离的本地购物车 | ✅ | `cart-store.ts`：key = `${PREFIX}:${marketId}`，`version` 与 `marketId` 载入时校验、失效即清除；`cart-store.spec.ts` |
| 24 | Testing Library 组件测试 | ✅ | `@testing-library/react` + `user-event` + `jsdom` 已装；`site-header.spec.tsx`、`cart-flow.spec.tsx` |
| 25 | env/secret/import 静态门禁 | ✅ | ESLint 边界规则 + `diff-check.sh` 三条高危签名兜底（NEXT_PUBLIC 秘密 / modules 越界 import / process.env 直读）；含 untracked 文件扫描（本评审周期修复的门禁漏洞） |
| 26 | 文档同步门禁 | ✅ | `check-doc-sync.mjs` PASS；评测用例在 `.claude/evals/README.md` |

## 2. 未实现清单

| 条目 | 状态 | 原因 | 归属 |
| --- | --- | --- | --- |
| Docker 镜像实际构建 | 🟡 | 本机 Docker daemon 未运行；Dockerfile 与 standalone 产物已验证，剩余是纯环境执行 | Phase 5 部署演练前在有 Docker 的环境补验 |
| CI 远端实测 | 🟡 | 代码基线在本评审前刚提交，workflow 未观察过一次真实运行 | 下次 push 后确认；不阻塞 |

易被误认为属于本 Phase 的后续事项：PLP/PDP/搜索（Phase 2）、server cart cookie（Phase 2）、E2E（Phase 3 起）、真实 commerce adapter（Phase 4）、CMP/CSP/告警（Phase 5）。另注：`lang="en"` 是有意决策（layout 注释：三市场均为英语，非英语市场到来时再升级 `[lang]` layout），不是缺漏。

## 3. 质量门实测

本次评审中实际执行（2026-07-18 15:55–16:00）：

| 门 | 命令 | 结果 | 备注 |
| --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | PASS | 零错误 |
| Lint | `npm run lint` | PASS | 零错误零警告 |
| 单元/组件测试 | `npm test` | PASS | 11 文件 70 用例 |
| 组件库测试 | `npx pnpm --filter @e-pig/happy-dog test` | PASS | 2 文件 4 用例；注意 `npm run happy-dog:test` 依赖 PATH 上的 pnpm 二进制，无 pnpm 时需走 npx |
| 生产构建 | `npm run build` | PASS | `◐ /`（PPR）+ standalone 产物 |
| diff 定向检查 | `bash scripts/quality/diff-check.sh` | PASS | 基线已提交，无未扫描的 TS 变更 |
| 文档同步 | `node scripts/quality/check-doc-sync.mjs` | PASS | AGENTS.md ↔ README 锚点一致 |
| 市场运行时冒烟 | `npm run smoke:runtime-market` | PASS | SG runtime config consistent |

## 4. 与参考工程多维度对比

| 维度 | 参考工程 | E-pig | 判定 | 理由 |
| --- | --- | --- | --- | --- |
| 架构形态与依赖边界 | Nx + 60+ 项目，三层强制拆包（01 §1-2） | 单 app + workspace 单组件包；ESLint 边界 + diff-check 兜底 | 胜 | 继承依赖方向，不继承每层独立发布单元的成本 |
| 渲染与缓存模型 | Next 14 隐式 ISR + Redis handler（01 §4） | Next 16 PPR + 显式 cache 边界（07） | 胜 | 静态壳 + Suspense 动态区语义明确，无隐式缓存猜谜 |
| 多市场机制 | 五市场 env 文件 + 构建前脚本（01 §4-5.3） | typed registry 三市场 + host 纯函数可单测 | 平 | 机制清晰可测是胜面；市场覆盖与 runtime host 解析未到是负面 |
| 状态与数据获取 | Redux + RTK Query + SWR（01 §3） | RSC + 局部 client state + localStorage 演示 cart | 胜 | P0 无全局 store 是有意减法，契合 06 §3-4 决策 |
| UI 与设计系统 | Fortress（MUI Joy/Emotion）+ Storybook + Chromatic（01 §3，08） | Tailwind 4 + shadcn 源码 + happy-dog workspace 包 + Storybook | 胜 | 按 08 路径落地，无 MUI 遗留；视觉回归缺失可接受 |
| 测试与质量门 | Jest + MSW + Playwright/Cucumber（01 §3） | Vitest + TL 组件测试 + diff-check/doc-sync/smoke 脚本 + evals 清单 | 平 | P0 明确不要 E2E；门禁链完整但深度不及 |
| AI 协作工程治理 | 原始脚本/评测资产（migration-audit） | 适配修复后的 rules/skills/hooks/evals + phase-review | 胜 | 修复了原件三个缺陷（ESLint 9 formatter、无 rg 回退、untracked 门禁漏洞） |
| 可观测性 | Sentry + Datadog + Pino + web-vitals（01 §5.2） | 结构化 logger + consent 门控 + analytics facade | 平 | 当前够用且不绑 SaaS；生产洞察是 Phase 4-5 的债 |
| 部署与运维 | 20 workflows + release-please + Docker（01 §6） | 单 CI + Dockerfile standalone | 平 | 规模匹配；CI/Docker 未经远端/ daemon 实测记入风险 |
| 功能完整度 | 真实 PLP/PDP/搜索/多支付/CMS（01 §2.2） | Home demo + mock catalog/cart | 负 | 阶段差距，Phase 2-4 补齐；如实记负 |

对比小结：胜 5 / 平 4 / 负 1。负维度应对：功能完整度按 06 路线图逐 Phase 补齐，无需额外动作；平维度中的可观测性与部署运维在 Phase 4-5 有明确升级计划。

## 5. 评分

| 项 | 满分 | 得分 | 计算 |
| --- | --- | --- | --- |
| A. 验收标准实现度 | 50 | 48.6 | 门槛 9 条 ×2 全 ✅ = 18；范围 15 条 ×1 ✅ = 15；🟡 2 条 ×1 ×0.5 = 1；计 34 ÷ 35 × 50 |
| B. 质量门 | 20 | 20 | 8 门全过（typecheck/lint/test/happy-dog test/build/diff-check/doc-sync/smoke），按 20/8 每门计 |
| C. 架构决策符合度 | 15 | 15 | 无违反：happy-dog workspace 包有 08 文档依据；`lang="en"` 有 layout 注释决策记录；Hard Rules 逐条过 |
| D. 对比净优势 | 15 | 13.5 | 7.5 + 1.5 × (5 胜 − 1 负) |
| **总分** | 100 | **97.1** | 等级：优秀 |

## 6. 风险与下一步建议

1. Docker 镜像与 CI 各欠一次真实环境验证；建议下次 push 时一并确认，成本极低。
2. `happy-dog:test` 等 filter 脚本依赖 PATH 上的 pnpm；新成员文档可补一句 corepack 启用指引（`corepack enable` 即得 pnpm）。
3. Phase 2 的 server cart cookie 会让"匿名 cart 只在首次 mutation 签发"成为可测行为，建议评审前先看 07 §4 的约束清单。
