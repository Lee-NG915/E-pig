# Kimi 任务：happy-dog 设计系统落地（tokens + 基础组件 + Storybook）

你是 E-pig 实现工程师。工作目录：`/Users/lidonghai/castlery/E-pig`  
当前分支：`feat/happy-dog-design-system`（不要切分支）

## 权威输入（先读完再写码）

1. `packages/happy-dog/design-system/happy-dog.design-system.json` — **唯一设计契约**
2. `packages/happy-dog/design-system/README.md`
3. 根目录 `DESIGN.md`
4. 现有实现：`packages/happy-dog/src/**`（Button / Badge / Sheet + theme）

Figma 已由 Leader 抽成 JSON。**禁止**把 Figma MCP 生成的 React/Tailwind dump 当生产代码粘贴。

## 目标

把 happyDog Foundations + ShadCN 基础组件落到 `@e-pig/happy-dog`，并补齐 Storybook 预览。

### A. Tokens（必须）

- 按 JSON `foundations` 更新 `colors` / `radii` / spacing（如需要）/ `globals.css` CSS 变量
- semantic：`primary` ≈ moss-700 `#495133`，`background` ≈ cream-200 `#FAF7EF`，`foreground` ≈ mono-900
- 增加 sale / success / warning / info 语义（badge 与状态需要）
- control sizes：sm 32 / md 40 / lg 48；radius md=10、lg=12、xl=16
- 保留 theme.tsx 的可配置口子；默认主题对齐 Figma
- 颜色可用 oklch 实现，但要与 hex 契约视觉一致；在 theme 或 design-system 旁保留 hex 注释/映射即可
- 更新/扩展 `theme.spec.ts` 覆盖关键 semantic keys

### B. 组件（按优先级）

**P0（本轮必须完成）**

| 组件 | 要求 |
| --- | --- |
| Button | 对齐 style×size；高度 32/40/48；不破坏现有导出 |
| Badge | 含 Sale / Success / Info |
| Sheet | **必须** `side`: `right` \| `bottom`（移动端底栏） |
| Input | state Default/Focus/Error/Disabled；size Sm/Md |
| Checkbox | Radix；checked × state |
| Radio Group | Radix；含 Error |
| Switch | Radix |

**P1（本轮尽量完成；时间不够也要至少 stubs + stories 骨架并在交付说明列出缺口）**

Tabs (Underline/Segmented)、Card (+ Interactive)、Dialog、Tooltip、Separator、Skeleton、Quantity Stepper、Select

**P2（可选，勿阻塞 P0）**

Choice Card、Option Swatch、Accordion、Pagination、Icon

### C. Storybook（必须）

- 每个公开组件：`*.stories.tsx`，覆盖 JSON 中的 variants
- `pnpm --filter @e-pig/happy-dog storybook` 能起（或 `build-storybook` 成功）
- 沿用现有 `.storybook` + ThemeProvider decorator

### D. 包导出

- 更新 `packages/happy-dog/src/index.ts`
- 需要的 Radix 依赖加到 `packages/happy-dog/package.json`，然后在仓库根 `pnpm install`

## 硬约束

- 只改 `packages/happy-dog/**`（及为装依赖必要的根 lockfile）；**不要**改 `src/modules` 去消费新组件
- 不要引入紫色/靛渐变 AI slop；商品卡默认无阴影
- modules 边界：本任务不碰 adapters/modules
- 组件模式对齐现有 button/badge/sheet（CVA + cn + Radix）
- 行为变更带测试（variant/token 纯逻辑用 `.spec.ts`；必要时 `.spec.tsx`）
- 最终回复附 `AI Test Record`

## 验收命令（跑完并报告）

```bash
pnpm --filter @e-pig/happy-dog test
pnpm --filter @e-pig/happy-dog typecheck
pnpm --filter @e-pig/happy-dog build-storybook
```

（若 build-storybook 太慢，至少保证 storybook 配置与 stories 齐全，并说明）

## 完成定义

1. P0 组件全部实现 + stories
2. Tokens 对齐 design-system JSON
3. Sheet 支持 bottom
4. 上述命令 PASS（或显式 NOT RUN + 原因）
5. 简短中文交付说明：做了什么、P1/P2 缺口、如何预览 Storybook
