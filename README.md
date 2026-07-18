# E-pig

一个基于 Next.js 16（Cache Components + Turbopack）、Tailwind CSS 4 和 shadcn/ui 源码模式的轻量电商前端。当前阶段不连接后端：商品走 `mock` commerce adapter，购物车保存在浏览器 `localStorage`。

## 本地运行

要求：Node 24（`.nvmrc`，`nvm use` 即可）+ pnpm 10（`corepack enable`）。

```bash
cp .env.example .env.local   # 首次；默认值即可运行
pnpm install
pnpm dev                     # 默认市场 au → http://localhost:3000
```

## 多市场本地开发

非秘密市场配置（货币、locale、host）维护在 `src/platform/config/markets.ts`，环境变量只负责"选哪个市场"：

```bash
pnpm dev:sg    # MARKET=sg，新加坡市场（SGD / en-SG）
pnpm dev:us    # MARKET=us
MARKET=uk pnpm dev   # 也可以直接注入
```

`MARKET` 非法值会在启动时直接失败（env schema），不会静默回退。可选市场：`au | sg | us | ca | uk`。

## 常用命令

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint（含 modules/shared 依赖方向规则）
pnpm test          # vitest run
pnpm build         # Turbopack 生产构建（Cache Components）
pnpm quality:diff  # 对 git diff 中的 TS 文件做定向质量检查
```

## 架构（Phase 1 骨架）

```text
src/
  app/            路由（组合层）：读 registry，把 port DTO 传给 module 组件
  modules/        业务垂直切片：catalog / cart / content（只依赖 core contracts + shared）
  core/           contracts（CatalogPort、CartPort…）+ 统一 error model
  adapters/       port 实现：commerce/mock（P0）；真实后端按同契约扩展
  integrations/   可降级副作用：analytics no-op…（不是业务 port）
  platform/       env schema、market registry、logger、consent、registry.ts（组合根）
  shared/         ui（shadcn 源码组件）、lib、test
```

关键规则：`modules` 禁止 import `@/adapters/*`、`@/integrations/*`（ESLint 强制）；adapter 负责外部 DTO → 内部 DTO 映射与错误归一化；秘密只在 server env。

## 当前边界

- 单市场单语言、无 URL 前缀；多市场运行时解析（host → market）见 `docs/codex/research/07`。
- 不连接 commerce、CMS、搜索、认证或支付服务；`COMMERCE_ADAPTER=mock`。
- demo cart 存浏览器 `localStorage`；接入后端后用 `CartPort` adapter + 匿名 cart cookie（Server Action 签发）替换，UI 职责不变。
- Docker：`docker build -t e-pig . && docker run -e MARKET=sg -p 3000:3000 e-pig`。

## AI 辅助开发工作流

本仓库内置一套 AI 辅助开发工作流（详见 `AGENTS.md`）：

- `AGENTS.md`：主约定（命令、AI 测试与评审工作流、命名/import 约定、Hard Rules）
- `.agents/rules/`：always-on 规则（编辑后质量自检循环、文档日期同步）
- `.agents/skills/`：submit-pr、harness-guide、vercel-react-best-practices
- `scripts/quality/`：diff-check、remediation-loop、check-doc-sync（机器可读 JSON 契约）

架构研究见 [`docs/codex/research`](./docs/codex/research/README.md)。
