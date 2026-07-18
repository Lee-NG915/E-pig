# E-pig 基础组件库 happy-dog（shadcn + Theme + Storybook）

更新日期：2026-07-18

状态：proposal

## 1. 需求澄清（已确认）

在 E-pig 仓库内初始化**独立分包基础组件库 `happy-dog`**：

- 组件实现基于 **shadcn/ui**，配置与目录遵循 **shadcn monorepo / package 最佳实践**。
- **设计语言与颜色系统**独立配置（`theme.tsx` 装配入口），方便后期调整与多主题；当前设计语言未定稿，只留可配置口子，不做特殊组件交互覆盖。
- **参考 Fortress 的工程配套**：独立包、Theme 分层、Storybook 文档/演示环境与相关配置；**禁止生搬硬抄** Fortress/MUI Joy/Emotion 运行时与组件 API。
- 本阶段用 Storybook 作为**基础组件**的使用文档与演示；**业务组件 stories** 与 **Chromatic 视觉回归流水线** 明确延期，只预留扩展位。

### 1.1 决策摘要

| 决策 | 选择 |
| --- | --- |
| 包名 | npm：`@e-pig/happy-dog`；目录：`packages/happy-dog`（不用 `happydog`，避免 cSpell Unknown word） |
| 技术基线 | shadcn/ui（new-york）+ Tailwind CSS 4 CSS variables + Radix + CVA |
| App 形态 | 根目录 Next App 保留；通过 `pnpm` workspace 引入 `packages/happy-dog`（不强制迁到 `apps/web`，避免无必要大搬家） |
| Theme | 包内独立 token + `theme.tsx` 装配 + ThemeProvider 注入 CSS vars |
| 文档/演示 | Storybook（包内 `.storybook`），覆盖基础组件 |
| Chromatic | **延期**；可留 `chromatic.config` stub / script 注释，不接真实 project token |
| Fortress | 只读参考工程配套与 Theme 分层意图；不复制 MUI Joy |

### 1.2 In Scope

| 项 | 说明 |
| --- | --- |
| Workspace | 根目录 `pnpm-workspace.yaml` 纳入 `packages/*`；根 `package.json` 增加 workspace 脚本 |
| happy-dog 包 | 独立 `package.json` / `tsconfig` / `components.json` / `exports` / `#` 或包名 imports |
| 迁移现有 UI | 将现有 `src/shared/ui/{button,badge,sheet}.tsx` 与 `cn` 依赖迁入 happy-dog；App 改为从 `@e-pig/happy-dog` 引用 |
| Theme | `colors` / `typography` / `radii` 独立；`theme.tsx` 装配；`componentOverrides` 空口子；多主题 registry（至少 `default`） |
| App 接线 | Root layout 挂载 ThemeProvider（或包导出的等价注入）；App `globals.css` 消费包样式 / CSS vars |
| shadcn CLI | App 与包各自 `components.json`，`style` / `iconLibrary` / `baseColor` 一致；后续 `pnpm dlx shadcn@latest add <c>` 可装进包 |
| Storybook | 包内配置 Storybook（React + Vite），docs/autodocs、theme toolbar/decorator、现有基础组件 stories |
| 测试 | Theme / token / provider 单测；包可独立 `pnpm --filter @e-pig/happy-dog test`（或根脚本代理） |
| 文档 | 更新本文件「实现备注」；根 `AGENTS.md` 补充 happy-dog / Storybook 命令与边界说明 |

### 1.3 Out of Scope（本阶段不做）

- 不复制 Fortress 组件实现、MUI Joy、Emotion、CssVarsProvider
- 不落地品牌视觉终稿（不把 Fortress terracotta 等定为 E-pig 品牌）
- 不批量新增 shadcn 组件（除迁移现有 button/badge/sheet）
- 不做完整暗色主题设计（允许 `dark` stub）
- 不做市场级主题
- **不接入 Chromatic CI / 真实 project token**（仅预留）
- 不写业务模块（catalog/cart 等）stories
- 不引入 Turborepo / Nx（除非实现证明 shadcn CLI 强依赖；默认 pnpm workspace 即可）

### 1.4 参考与差异

**参考（只读）：**

- 参考工程 `libs/fortress`：独立包、`Theme/{colors,typography,theme.tsx,provider}`、`.storybook/*`、stories 组织、theme toolbar
- shadcn 官方：[Monorepo](https://ui.shadcn.com/docs/monorepo)、[Package Imports](https://ui.shadcn.com/docs/package-imports)

**必须差异：**

| Fortress | happy-dog |
| --- | --- |
| MUI Joy + Emotion | shadcn + Tailwind CSS variables |
| Nx + 重型 Storybook addon 全家桶 | 精简 Storybook（essentials/a11y/themes 等必要项） |
| Chromatic 已接通 | 本阶段仅预留 |
| 品牌色定稿 | 占位默认 token（迁自当前 App `:root`） |

## 2. 目标目录结构

```text
E-pig/
  pnpm-workspace.yaml
  package.json                 # scripts: storybook, happy-dog:test, ...
  components.json              # App workspace：ui -> @e-pig/happy-dog/components
  src/app/                     # Next App（保留）
  src/shared/ui/               # 迁移后删除或仅留 re-export 过渡（优先直接改 import）
  packages/
    happy-dog/
      package.json             # name: @e-pig/happy-dog
      components.json
      tsconfig.json
      src/
        components/            # shadcn 组件（button/badge/sheet）
        lib/utils.ts
        hooks/                 # 可空
        styles/globals.css     # @theme inline + base；色值可由 theme 注入
        theme/
          colors.ts
          typography.ts
          radii.ts
          themes.ts
          theme.tsx            # 装配入口 + componentOverrides 口子
          theme-provider.tsx
          index.ts
        index.ts               # 可选 barrel；优先用 package exports 子路径
      .storybook/
        main.ts
        preview.tsx            # Theme decorator / toolbar
        # mode.ts 等可参考 Fortress，但保持精简
      src/**/*.stories.tsx     # 基础组件 stories
      chromatic.config.json    # stub / TODO，不接真实 token
```

依赖方向：

```text
src/app, src/modules  ->  @e-pig/happy-dog  (components / theme / styles)
@e-pig/happy-dog       -/->  app | modules | adapters | integrations
```

## 3. shadcn 配置要求（最佳实践）

1. **每个 workspace 一份 `components.json`**（根 App + `packages/happy-dog`）。
2. 两边 `style` / `iconLibrary` / `baseColor` 一致（延续现有：`new-york` / `lucide` / `neutral`）。
3. Tailwind v4：`tailwind.config` 留空字符串；CSS 指向包内 `src/styles/globals.css`（App 的 `components.json.tailwind.css` 指向该文件或 App 再 `@import` 包样式——二选一，需文档写明）。
4. 包 `exports` 至少暴露：
   - `./globals.css`
   - `./components/*`
   - `./lib/*`
   - `./theme`（或 `./theme/*`）
5. 包内优先 `package.json#imports`（`#components/*` 等）或统一用 `@e-pig/happy-dog/...` aliases，保证 `shadcn add` 生成的 import 可解析。
6. App 消费示例：

```ts
import { Button } from "@e-pig/happy-dog/components/button";
import { ThemeProvider } from "@e-pig/happy-dog/theme";
import "@e-pig/happy-dog/globals.css";
```

## 4. Theme 需求

### FR-T1 `theme.tsx` 装配入口

- 聚合 colors / typography / radii。
- `componentOverrides` 口子默认空，无行为变更。
- 禁止在组件文件硬编码定稿品牌色。

### FR-T2 颜色 / 设计语言独立

- 语义色覆盖现有 shadcn 变量集（background/foreground/primary/.../ring 等）。
- 默认值迁自当前 App `globals.css` `:root`，避免视觉回归。
- typography：`--font-sans` / `--font-display`（字号阶梯可 stub）。
- radii：`--radius` 及派生。

### FR-T3 多主题口子

- `themes` registry，至少 `default`；可 stub `dark`。
- ThemeProvider 接受 `themeId`，默认 `default`。
- Storybook toolbar 可切换主题（即使 dark 为 stub）。

### FR-T4 注入

- Provider（或 SSR 友好的 `:root` style 注入）写入 CSS variables。
- 首屏尽量无闪烁；token→CSS vars 转换保持纯函数以便单测。

## 5. Storybook 需求

### FR-S1 环境

- 框架：`@storybook/react-vite`（版本与 React 19 兼容，实现时选当前稳定线）。
- 配置位置：`packages/happy-dog/.storybook`。
- 脚本：包内 `storybook` / `build-storybook`；根目录代理 `pnpm storybook`。

### FR-S2 能力（本阶段最小集）

参考 Fortress，但**精简**：

| 能力 | 本阶段 |
| --- | --- |
| autodocs / docs | 要 |
| a11y addon | 要 |
| themes decorator + toolbar | 要（接 happy-dog ThemeProvider） |
| essentials / controls | 要 |
| interactions / coverage / designs | 可选，非必须 |
| Chromatic addon + token | **不要接真**；可 TODO |

### FR-S3 Stories

- 为迁移后的 `Button` / `Badge` / `Sheet` 各至少 1 个 story（含常用 variants）。
- Stories 即基础组件使用文档；MDX 可选。

### FR-S4 延期声明

- 业务组件 stories：后续在 `src/modules/**` 或独立 stories 包扩展。
- Chromatic：后续补 `projectToken`、CI job、modes；本阶段只留配置口子与文档说明。

## 6. App 集成与迁移

1. 根启用 pnpm workspace。
2. App `package.json` 依赖 `"@e-pig/happy-dog": "workspace:*"`。
3. 全局替换 `@/shared/ui/*` → `@e-pig/happy-dog/components/*`（及 theme/utils）。
4. `src/shared/lib/utils.ts`：若仅服务 UI，迁入包；若 App 仍用 `cn`，可再导出或薄包装，避免重复实现分叉。
5. ESLint 边界：modules 仍禁止 adapters/integrations；**允许** modules → `@e-pig/happy-dog`。happy-dog **禁止** import `@/modules` / `@/adapters` / `@/integrations` / `@/app`。
6. 更新根 `AGENTS.md`：Overview 中「不使用 Storybook」改为「业务 App 不强制 Storybook；基础组件库 happy-dog 使用 Storybook 文档」；Commands 增加 storybook 命令。

## 7. 测试与质量

### FR-Q1 单测

- default theme 语义色键完整。
- token→CSS vars 纯函数可测。
- ThemeProvider / 注入：切换 `themeId` 至少改变一个 CSS 变量（stub theme 即可）。
- 纯逻辑 `.spec.ts`；需渲染用 `.spec.tsx`。

### FR-Q2 命令验收

```bash
pnpm install
pnpm --filter @e-pig/happy-dog test   # 或根代理脚本
pnpm typecheck
pnpm test                            # App 既有测试仍绿
pnpm --filter @e-pig/happy-dog build-storybook   # 或等价；确保可构建
```

Storybook dev 可选手动验证：`pnpm storybook`。

## 8. 验收标准

1. 存在 `packages/happy-dog`，包名为 `@e-pig/happy-dog`，可被 App workspace 引用。
2. shadcn `components.json`（App + 包）符合 monorepo 实践，aliases/exports 正确。
3. Theme：`theme.tsx` 装配；colors/typography 独立；overrides 口子为空。
4. 现有三组件已迁入包，App 页面无回归（import 更新）。
5. Storybook 可启动/可 build；基础组件有 stories + theme 切换口子。
6. Chromatic 未接真实 token；文档标明延期。
7. 相关测试与 `typecheck` PASS。
8. `AGENTS.md` 与本文「实现备注」已同步。

## 9. 实现备注

- 实际包：`packages/happy-dog`，npm 名 `@e-pig/happy-dog`；exports 暴露根入口、`./globals.css`、`./components/*`、`./lib/*` 与 `./theme`。
- CSS：App 的 `src/app/globals.css` 通过 `@import "@e-pig/happy-dog/globals.css"` 消费 Tailwind v4 theme 与全局基础样式。
- Storybook：锁文件当前解析为 Storybook 10.5.2 的 `@storybook/react-vite`，启用 docs/autodocs、a11y 与自定义 theme toolbar/decorator；Button、Badge、Sheet 均有 stories。
- 迁移：`src/shared/ui/{button,badge,sheet}.tsx` 已迁至 `packages/happy-dog/src/components`；App 与 modules 直接改用包子路径 import。`cn` 在包内由 `src/lib/utils.ts` 独立维护，App 原工具暂留给非组件调用方。
- Theme：colors、typography、radii 独立，`theme.tsx` 提供 token→CSS variables 纯函数；registry 提供 `default` 与占位 `dark`，`componentOverrides` 当前为空。
- 已知限制：Chromatic 仅有无 token 配置 stub，未接 CI；暗色主题为扩展口占位，非最终视觉；业务组件 stories 延期。
