# DTC skills 项目接入

E-pig 不复制 DTC skills。`.agents/skills/dtc-*` 是指向本地兄弟项目 `../DTC-skills/skills/dtc-*` 的软链，DTC-skills 是唯一源目录；来源和软链见 [接入清单](../dtc-skills-install.json)。目标项目适配档案是 [.dtc/target-profile.md](../../.dtc/target-profile.md)，它同样指向 DTC-skills 的 `targets/e-pig.md`。

## 使用与优先级

在 E-pig 新开对话，先读取 `.dtc/target-profile.md`，再按任务加载 DTC skill。例如：“使用 dtc-design-evidence、dtc-page-decomposition 和 dtc-ui-spec 分析这个 Figma 页面，先保存设计证据、拆分结构和详细参数，再按 E-pig 组件契约实现并验证。”

优先级为：`AGENTS.md Hard Rules > e-pig rules > e-pig-dev-loop > community skills > DTC target profile`。DTC target profile 只提供技术栈、目录、命令、Storybook 和交付边界等上下文，不覆盖项目规则，不授予外部写入、发布或业务验收权限。DTC skills 的通用流程由 DTC-skills 源目录维护，E-pig 的适配通过 target profile 生效。

## 阶段组合

| 阶段 | Skills | E-pig 产出 |
| --- | --- | --- |
| 定位与需求 | dtc-context、dtc-requirements-analysis | 读取 target profile，确定 Next/React/TS、市场、领域、范围和验收条件 |
| 设计取证 | dtc-design-evidence | Figma 节点、素材、字体、视口、状态与目标项目能力差异 |
| 两级拆分 | dtc-page-decomposition、dtc-atomic-decomposition | 页面组件树、领域归属、原子边界与复用判断 |
| 方案与参数 | dtc-technical-design、dtc-ui-spec | props、tokens、响应式规则、数据边界和逐项 UI 规格 |
| 实现 | dtc-implementation | `src/modules/<domain>/components` 或 `packages/happy-dog` 下的实现 |
| 验证与优化 | dtc-component-testing、dtc-visual-validation、dtc-scoped-validation、dtc-optimization | Vitest/Testing Library、Storybook 状态、视觉对照、前后测量与范围化复测 |
| 评审与交付 | dtc-workflow-review、dtc-ci-monitor、dtc-delivery、dtc-evidence-log | 本地构建、预览、验收和发布边界的分层证据 |
| 按需辅助 | dtc-data-tracking、dtc-exception-handling、dtc-privacy-redaction、dtc-recording-analysis | 埋点、异常恢复、公开脱敏和录屏分析 |

详细参数先落盘再实现；新业务组件默认同一 patch 交付 `.md`、`.tsx`、`.spec.tsx` 和 `.stories.tsx`。不得把 Storybook 构建通过写成视觉验收、页面接入或生产发布。

## E-pig 适配摘要

- Next.js 16.2 App Router、React 19、TypeScript 6 strict、Tailwind CSS 4、pnpm 10、Vitest 4、Node 24 LTS。
- 页面路由和编排在 `src/app`；业务组件按 owning domain 放在 `src/modules/<domain>/components`；基础 UI 放在 `packages/happy-dog`。
- 业务组件遵循组件文件夹契约：行为说明、实现、测试和 stories 同步维护；`pnpm quality:companions` 检查 companion。
- 业务 Storybook 入口是 `pnpm storybook:modules`，使用 React Vite，端口 6007；`next/image` 和 `next/link` 是轻量 mock，不等价于完整 Next 运行时。
- 价格、库存、cart、checkout、payment 保持 request-time；modules 不直接 import adapters、integrations 或供应商 SDK。
- 市场必须显式选择 `au`、`sg` 或 `us`；市场配置以 typed registry 为准。
- 完成检查按实际改动执行 `pnpm test <path>`、`pnpm quality:companions`、`pnpm typecheck`、`pnpm lint`、`pnpm build-storybook:modules` 和项目质量门。

## 目录与更新

E-pig 只维护软链和本地接入说明：

- `.agents/skills/dtc-*` → `../DTC-skills/skills/dtc-*`，DTC-skills 改动会直接在 E-pig 生效。
- `.claude/skills/dtc-*` → `../../.agents/skills/dtc-*`，遵循 Claude 的项目发现约定。
- `.dtc/target-profile.md` → `../DTC-skills/targets/e-pig.md`，记录 E-pig 的技术栈和业务边界。
- `.agents/dtc-skills-install.json` 记录源目录、目标档案和软链，不记录复制文件哈希。

更新 DTC 流程时直接修改 `/Users/lidonghai/a4x/DTC-skills` 的源文件，并运行其 `ruby scripts/validate.rb`；不在 E-pig 的软链目录中改出第二份副本。修改 target profile 后重新运行 `pnpm agent-doctor`、`pnpm docs:check`，再按实际影响执行组件和 Storybook 验证。
