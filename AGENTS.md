# AGENTS.md

@.agents/rules/doc-freshness.md
@.agents/rules/quality-self-check.md

## How to get context（thin router）

按问题类型加载，**不要**一次读完全部细则：

1. **项目 Hard Rules / 命令** → 本文件（下文）
2. **任务深度规则** → `.agents/skills/e-pig/SKILL.md`，再读 **一条** matching `rules/<task>.md`
3. **开发闭环（社区 skills 调度）** → `.agents/skills/e-pig-dev-loop/SKILL.md`（统筹 grill-me / ponytail / tdd / impeccable / Superpowers 子集）
4. **页面 / 组件流程** → `docs/engineering/page-workflow-guide.md` → `component-workflow-guide.md`
5. **大里程碑交付** → `docs/engineering/milestone-delivery-loop.md`（分支 / task 推送 / 溯源 / 复盘）
6. **设计契约** → 仓库根 `DESIGN.md` + `packages/happy-dog` tokens
7. **Figma 到代码的 DTC 补充流程** → `.dtc/target-profile.md` → `.agents/skills/dtc-installation.md`（先读取目标项目适配档案，再在上述项目规则与 `e-pig-dev-loop` 下按阶段调用）

**Precedence：** Hard Rules > `e-pig` rules > `e-pig-dev-loop` > 社区 skills。冲突时项目规则胜出。`phase-review` 仅手动触发。

## Overview

E-pig 是轻量电商前端：单 Next.js 16.2 App（App Router + `cacheComponents: true` + Turbopack）+ React 19 + TypeScript 6 strict + Tailwind CSS 4 + shadcn/ui 源码模式 + pnpm 10 + Vitest 4。不使用 monorepo 任务编排、独立可观测性 SaaS，也没有多区域环境分支。业务 App 不强制 Storybook；基础组件库 `@e-pig/happy-dog` 使用 Storybook 作为文档与演示环境。

**Node：** 24 LTS（`.nvmrc` / `engines` 固定） | **包管理：** pnpm 10.34.5（`packageManager` 精确固定）

## Commands

```bash
# 开发（必须带市场；裸 pnpm dev 会失败）
pnpm dev            # 要求已设置 MARKET；否则 exit 1
pnpm dev:au         # MARKET=au next dev → 首页 /au
pnpm dev:sg         # MARKET=sg next dev → 首页 /sg
pnpm dev:us         # MARKET=us next dev → 首页 /us
# 其余市场：先在 src/platform/config/markets.ts 登记，再用 MARKET=<id> pnpm dev 启动

# 构建与启动
pnpm build          # next build（缺省 MARKET=au 仅用于构建；运行时仍以启动 env 为准）
pnpm prestart       # 把 public/.next/static 同步到 standalone（由 pnpm start 自动调用）
pnpm start          # 要求 MARKET；node .next/standalone/server.js（需先 build）

# 质量
pnpm lint           # eslint .（flat config，含 no-restricted-imports 边界规则）
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest run（纯逻辑 node；组件测试文件显式 jsdom）
pnpm test:watch     # vitest watch 模式
pnpm test:after-sales:pg # 专用 Docker 隔离 PG16 多连接测试（非 verify 默认；缺 Docker 明确失败）
pnpm test:harness-evals # post-edit/stop-hook/边界规则 harness 回归（进 CI）
pnpm quality:diff   # bash scripts/quality/diff-check.sh（git diff 定向质量检查；含 companions warn）
pnpm quality:companions # 组件文件夹 companion 检查（.spec/.stories/.md；默认 warn）
pnpm docs:check     # 校验 package scripts、README market marker 与 registry 同步
pnpm verify         # 完成门：docs:check + typecheck + lint + test + happy-dog:test + test:harness-evals + agent-doctor（不含 build/storybook/smoke）
pnpm agent-doctor   # agent/skill 安装与 symlink 健康检查（原 pnpm doctor，改名避免与 pnpm 内置命令撞名）
pnpm smoke:runtime-market # 用 SG 启动同一 standalone，验证运行时 market 未被 AU 构建值污染

# happy-dog 基础组件库
pnpm storybook       # 启动 packages/happy-dog Storybook（端口 6006）
pnpm build-storybook # 构建静态 Storybook
pnpm happy-dog:test  # 运行 happy-dog 独立测试
pnpm catalog:fetch-koala # 从 Koala AU 公开 Shopify JSON 刷新本地 mock fixtures（展示字段）

# storybook-host 业务组件库（modules + happy-dog 聚合，端口 6007）
pnpm storybook:modules       # 启动 packages/storybook-host Storybook
pnpm build-storybook:modules # 构建 storybook-host 静态 Storybook

# Cloudflare Workers 部署（@opennextjs/cloudflare）
pnpm preview        # OpenNext 构建 + 本地 workerd 预览（最接近线上运行时）
pnpm deploy         # bash scripts/deploy-cf.sh：OpenNext 构建 + 部署到 CF Workers（本地需 wrangler 登录态；CI 用 CLOUDFLARE_API_TOKEN）
pnpm cf-typegen     # 生成 cloudflare-env.d.ts 绑定类型声明
```

跑单个测试文件：

```bash
pnpm test src/modules/cart/cart-totals.spec.ts   # 等价于 vitest run <path>
```

## AI 测试与评审工作流

本章约束 AI 生成的改动，目的是塑造 AI 交付质量，不给人类 PR 或 CI 流程增加硬性要求。

### 默认规则

- 凡影响运行时行为的 AI 改动，必须在同一个 patch 里带测试代码。
- 一个任务里既有行为变更又有机械性编辑时，行为变更部分仍必须带测试。
- 测试跑不了也要把测试写出来，并在交付记录里显式声明 NOT RUN 及原因。
- 覆盖率以 changed-path 优先判断，不看全局百分比。
- bug fix 默认先写回归测试：先让旧 bug 可复现，再落实现。

### 按变更类型选测试

- 纯逻辑（util / mapper / contract / DTO / 错误映射 / market registry 纯函数）：就近加或改 Vitest 单测（`.spec.ts`，node 环境）。
- React 组件与 hooks：加或改 Vitest + Testing Library 测试（`.spec.tsx`），断言用户可见行为与分支状态。
- 跨页关键旅程（checkout / payment / cart 完整链路）：P0 阶段无 E2E 设施，用集成级 Vitest 覆盖 Server Action / Route Handler 行为；将来引入 Playwright 后补关键旅程。
- bug fix：优先先写回归测试再实现。

### 何时允许 `.spec.tsx`

- 只有被测物渲染 JSX 或通过 React 渲染行为被检验时才用 `.spec.tsx`：组件、用 React helper 测试的自定义 hook、条件渲染、用户交互、prop 驱动的 UI 状态。
- 纯逻辑一律用 `.spec.ts`：工具函数、selector、DTO mapper、数据变换、contract 校验。
- 机械性改动、文案修改、纯类型更新不新建 `.spec.tsx`。
- bug fix 只有回归可通过渲染 UI 行为观察时才建 `.spec.tsx`，否则用 `.spec.ts`。

### AI 交付记录

AI 完成代码任务时，最终回复里必须附以下固定格式记录：

```md
## AI Test Record

- Behavior changed: ...
- Tests added/updated: ...
- Tests run: ...
- Result: PASS / FAIL / PARTIAL / NOT RUN
- Failures or gaps: ...
- Next risk: ...
```

若有第二个 AI 做评审，追加：

```md
## AI Review Record

- Review focus: ...
- Findings: ...
- Residual risks: ...
```

### Single-AI 默认流程（6 步）

1. 动手前：列出行为变更清单，决定每个变更对应的测试层级。
2. 写码中：测试与实现同步写，不做尾期清理。
3. 首个可运行版本一出现，立刻跑最小相关测试范围（`pnpm test <相关 spec 路径>`）。
4. 测试失败立即报告，可行则继续修。
5. 收尾前重跑任务相关测试；改动跨模块或影响面大时跑全量 `pnpm test`，并按 `quality-self-check` 规则跑 `pnpm typecheck` → `pnpm lint`。
6. 最终回复附 `AI Test Record`，含通过状态、跑过的命令、未覆盖区域及原因。

### 测试发现顺序

1. 先看被改文件同目录是否已有 `.spec.ts` / `.spec.tsx` 覆盖该对象。
2. 没有就看同模块兄弟测试，复用其 mock 风格、渲染 helper 与断言模式。
3. 测试就近放在被测文件旁边（co-located），不新建集中测试目录。
4. 改 bug 或分支条件时，先围绕公开行为写回归断言，再调整实现。

### 什么是有用的测试

- 断言用户、调用方或 API 边界可观察的行为。
- 覆盖变更的分支或回归点，外加一个稳定的既有行为以防意外破坏。
- mock 只放在系统边界：网络、路由、浏览器 API、计时器、第三方 SDK、adapter 端口。
- 优先断言清晰的输入输出而非实现细节；只断言"mock 被调用过"不算数，除非 mock 调用本身就是契约。
- 行为变更禁止纯快照测试；快照只能作为视觉结构的补充，不能是唯一保护。

### 何时不需要测试

纯格式化、注释、死码删除、纯类型变更、无运行时影响的 barrel export 调整、纯文档编辑——通常不需要测试，但必须在 `AI Test Record` 里显式说明属于豁免白名单。

### Dual-AI 增强流程

中高风险任务在实现之上叠加两个 AI 环节：

1. **Test AI**：评审行为增量与拟定测试，补边界用例、状态迁移、失败模式、回归场景；挑战弱断言、过度 mock、只镜像实现细节的测试。
2. **Review AI**：以 code review 视角评审最终 patch，关注正确性、回归、架构契合度、风险假设、测试是否真保护行为；产出 `AI Review Record`。

### 何时启用 Dual-AI

- checkout / payment / cart 相关改动。
- 多文件、跨层重构（跨 modules / core / adapters 边界）。
- 复现路径不明的 bug 或有前科的回归。
- 异步逻辑、重试、缓存（`'use cache'` / cache tag / 失效）、第三方集成（adapter / integration）。
- 第一个 AI 无法自信解释测试覆盖率时。

### Review Gate

- 没有测试、也没有在 `AI Test Record` 里显式豁免说明的行为变更 patch，不算完成。
- bug fix 没有回归测试时，必须解释为什么回归测试不可行。
- 启用 Dual-AI 时，`AI Test Record` 与 `AI Review Record` 齐备才算完成。

## Project Structure

```text
src/
  app/                  # Next.js App Router；公开页在 `[market]/` 下（proxy 规范化前缀）
  modules/              # 业务域模块
    catalog/
    cart/
    checkout/
    order/
    account/
    content/
  core/
    contracts/          # port 接口与内部 DTO
      commerce/         # CatalogPort, CartPort, CheckoutPort, CustomerPort
      capabilities/     # PaymentPort, ContentPort, SearchPort, AuthPort, MediaPort
    errors/             # 统一 typed error（validation/unauthorized/not_found/conflict/rate_limited/upstream/unknown）
  adapters/             # port 实现，按能力分目录（commerce/payment/content/search/auth/media）
  integrations/         # 可降级副作用（analytics/observability/email/feature-flags）
  platform/
    config/             # env schema、typed market registry（markets.ts）
    consent/
    logging/
    registry.ts         # capabilities + integrations 的 typed registry
  shared/
    ui/                 # shadcn/ui 组件与通用 UI
    lib/                # 跨域工具
public/
packages/
  happy-dog/             # @e-pig/happy-dog：shadcn 基础组件、Theme tokens、Storybook
  storybook-host/        # @e-pig/storybook-host：modules + happy-dog 聚合 Storybook（6007，react-vite）
tests/e2e/              # 预留（P0 暂无 E2E 设施）
docs/
```

`src/app` 与 `src/modules` 可依赖 `@e-pig/happy-dog`；happy-dog 不得反向依赖 App、modules、adapters、integrations 或 platform。基础组件新增与迁移优先落在 `packages/happy-dog/src/components`，并同步基础 stories。

## Architecture

依赖方向（单向，不可反向）：

```text
app routes -> modules -> core contracts
                    ^
                    | implemented by
                 adapters -> 外部业务 API / SDK

modules -> integration event facade -> 可降级的副作用 integrations
```

规则：

- module 不得直接 import 供应商 SDK（Stripe、PostHog、CMS SDK 等）或供应商 DTO。
- adapter 负责外部 DTO → 内部 DTO 映射与错误归一化。
- `shared` 不得反向依赖任何业务 module、adapter、integration。
- module 间优先通过显式函数/事件协作。
- **边界已由 ESLint `no-restricted-imports` 强制**：`src/modules/**` 禁止 import `@/adapters/*` 与 `@/integrations/*`，违规直接 lint error；`scripts/quality/diff-check.sh` 另有一份 grep fallback 在 ESLint 崩溃时兜底。

adapter / integration 划分判定：

1. 页面或业务流程是否等待它的返回值来决定下一业务状态？是 → core contract + adapter。
2. 是否拥有、读取或转换 product / cart / payment / content / identity 等业务实体？是 → adapter。
3. 是否只是主流程成功后 fan-out、失败可降级且不改变订单/支付结果？是 → integration。
4. production payment 不允许 no-op；可选 integration 可以 no-op，但必须留下结构化日志或测试断言。

## Code Conventions

**命名：**

- 组件：PascalCase 函数，放在 kebab-case 文件里（`product-card.tsx`）。
- 测试：`*.spec.ts` / `*.spec.tsx`，与被测文件同目录（co-located）。

**页面与组件开发闭环（Phase 2 起）：**

- 开发/改页面：先按 DDD 定主 owning domain 与协作 domain，业务组件放入 `src/modules/<domain>/components/`，`src/app/**` 只做路由与编排。入口：`docs/engineering/page-workflow-guide.md`。
- 定域后的每个业务/基础组件走组件流程：`docs/engineering/component-workflow-guide.md`（文件夹契约 + companions）。
- 高频/有状态业务组件与 happy-dog 采用「一组件一文件夹」：`tsx` + `.md` + `.spec` +（基础组件强制）`.stories`；旧扁平迁到时再改，禁止一次性全仓搬家。
- 契约 / Harness / 落地：同目录 `component-folder-contract.md`、`component-folder-harness.md`、`component-folder-contract-rollout.md`。

**import 顺序：**

React/Next → 外部库 → `@/core/*` → `@/platform/*` → `@/adapters/*` 与 `@/integrations/*` → `@/modules/*` → `@/shared/*` → 相对路径。

**状态与数据：**

- Server data：RSC + Cache Components，显式 `'use cache'`。
- Client server-state（cart/checkout/account）：TanStack Query 5。
- UI state：React state，必要时 Zustand。
- 表单：react-hook-form + Zod；env / DTO / 表单共用 Zod schema。

## Hard Rules

以下是已定稿架构决策，不要重开、不要提替代方案。详细推理见 `docs/codex/research/04-e-pig-target-architecture.md` 与 `07-next16-cache-cart-routing-decisions.md`。

| 规则 | 细节 |
| --- | --- |
| **request API 全部 async** | `cookies()`、`headers()`、页面/布局/Route Handler 的 `params`、页面 `searchParams` 全部按异步 API 使用（`await`）。 |
| **request API 不得在 `'use cache'` 内读取** | `cookies()`/`headers()` 等先在动态边界解析，再把可序列化的 market/locale/id 作为缓存函数参数传入。 |
| **不用隐式 fetch 缓存 / ISR 语义** | 缓存必须显式：`'use cache'` + `cacheLife(profile)` + `cacheTag(...)`。不使用"默认 ISR""默认 fetch 缓存"或单参数 `revalidateTag` 描述架构。 |
| **modules 不 import adapter / integration / 供应商 SDK** | module 只依赖 `@/core/contracts/*`；port 实现统一在 `adapters/<capability>/`，由 `platform/registry.ts` 装配。ESLint 已强制。 |
| **server secret 禁止放进 `NEXT_PUBLIC_*`** | 秘密只在 server env；`NEXT_PUBLIC_` 前缀变量会打进客户端 bundle。env 统一经 `@t3-oss/env-nextjs` schema（`src/platform/config/env.ts`），不在业务代码里直接读 `process.env`。 |
| **匿名 cart id 只在首次 mutation 签发** | 用户首次 `addItem` 的 Server Action / Route Handler 里，没有 cookie 才创建 cart 并设置签名 cookie；`proxy.ts` 不得创建 cart（会把普通 GET 变成写操作）。 |
| **价格 / 库存 / cart / checkout / payment 不缓存** | 这些区域默认 request-time 读取，不进共享 Cache Component；私有数据不用公共 cache tag。如需缓存须单独提 ADR。 |
| **不照搬任何旧项目基线** | 架构与技术选型以 `docs/codex/research/04` 与 `07` 为准；不引入 Pages Router、全局客户端状态 hydration、monorepo 编排层、旧版隐式 fetch/ISR 缓存、`middleware.ts` 等上一代模式。 |

## 多市场注意

- typed market registry（`src/platform/config/markets.ts`）是非秘密市场配置的**唯一真源**（hosts / locales / defaultLocale / currency）。
- env 只做两件事：市场选择（`MARKET=au|sg|us`）与 adapter 选择；其余配置进 registry。
- **本地开发必须显式带市场**：`pnpm dev:au` / `pnpm dev:sg` / `pnpm dev:us`（或 `MARKET=xx pnpm dev`）。裸 `pnpm dev` 会失败。
- **公开 URL 使用市场路径前缀**（MUJI 式）：`/{market}/collections/...`、`/{market}/products/...`。`/` 与其它市场前缀由 `src/proxy.ts` 308 到本进程 `MARKET`（纯函数见 `planMarketPath`）。生产日后可叠加 Koala 式 host→market，不改资源路径语义。
- 多语言预留：先稳定 `/{market}/...`；同一市场多语言时再加可选 `/{market}/{locale}/...`，不要回退成 Joyboy 式 middleware 链。
- host→market 解析必须是纯函数并可单测（`resolveMarketFromHost`）；业务取数不得藏进 `proxy.ts`。
- 跨市场改动（`src/platform/config/**`、`src/modules/**` 共享逻辑）合并前必须考虑每个市场的行为差异。
