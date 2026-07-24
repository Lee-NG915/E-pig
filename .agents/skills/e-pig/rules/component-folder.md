---
name: component-folder
description: >
  Business component folder contract: md + tsx + spec + stories, companions
  check, page vs module placement. Use when adding or moving UI components.
---

# Component Folder

权威文档：`docs/engineering/component-workflow-guide.md` + `component-folder-contract.md`。

最小闭环：

1. `src/modules/<domain>/components/<name>/`
2. `<name>.md`（行为 Spec）+ `<name>.tsx` + `<name>.spec.tsx` + `<name>.stories.tsx`
3. `pnpm quality:companions`
4. 基础 UI 进 `packages/happy-dog`，业务 UI 不进 `src/app/_components`

页面落点见 `page-workflow-guide.md`（DDD 定域 → modules → app 组装）。
