# 组件文件夹契约（Component Folder Contract）

更新日期：2026-07-18

状态：active

## 1. 目标

为 AI 对话驱动开发提供**可机器校验的组件工作单元**：需求（md）→ 实现（tsx）→ 行为证明（spec）→ 可视状态（stories）同目录共存，使改动范围与影响面可审查，并逐步降低对人工 code review 的依赖。

**日常怎么做**见入口指南 [`component-workflow-guide.md`](./component-workflow-guide.md)。  
本契约是行为 Spec。**完整 8 组件 Harness 设计**见 [`component-folder-harness.md`](./component-folder-harness.md)（Static/Gate/Feedback/Evaluation/Evolution 的接法与落地阶段）。

## 2. 适用范围

| 层级 | 是否强制 | 说明 |
| --- | --- | --- |
| `packages/happy-dog` 基础组件 | **强制** stories + spec（行为逻辑时）；md 用简短 COMPONENT.md | 设计系统底座，Chromatic 优先盯这里 |
| `src/modules/**` 高频/有状态业务组件 | **试点强制**（Phase 2 起：cart-sheet、product-card、PLP/PDP 主组件） | 一组件一文件夹 |
| 纯展示无分支叶子 / 一次性布局碎片 | **不强制** md/stories | 有公开行为再升格为契约组件 |
| 私有子组件（仅父组件使用） | 默认同目录文件即可；**仅当**有独立状态矩阵或被单测单独覆盖时再拆子文件夹 | 防止文件夹递归爆炸 |

## 3. 标准目录形状

```text
src/modules/<domain>/components/<component-name>/
  <component-name>.tsx          # 实现
  <component-name>.md           # 组件 PRD（场景/状态/非目标）
  <component-name>.spec.tsx     # 或 .spec.ts（纯逻辑）
  <component-name>.stories.tsx  # Storybook 状态矩阵（非 E2E 旅程）
  <component-name>.mock.ts      # 可选：稳定测试/story 数据
  parts/                        # 可选：仅私有子组件
    <child>.tsx
    <child>.spec.tsx            # 子组件有独立行为时才要
    <child>.stories.tsx         # 同上
```

`packages/happy-dog/src/components/<name>/` 同构（可将现有扁平文件迁入）。

## 4. 各文件职责（防止腐烂）

### 4.1 `.md`（组件 PRD）— 只写行为契约

**写：**

- 用户可见场景与用户故事（Given/When/Then 或场景列表）
- 状态矩阵（default / loading / empty / error / disabled / …）
- 可访问性要点、市场/locale 差异（若有）
- 明确非目标

**不写：**

- 实现细节、具体 className、内部 hook 名
- 跨页完整用户旅程（那是里程碑 PRD / E2E 的事）

模板见 §8。

### 4.2 `.spec` — 行为与交互质量

- 断言用户可观察行为与分支；mock 只在系统边界。
- 与 AGENTS.md「AI 测试与评审工作流」一致。

### 4.3 `.stories` — 状态展示与视觉/交互基线

- **只做状态矩阵**，不做「加购→结账」旅程。
- 旅程：组件级用 Testing Library；跨页用未来 Playwright（Phase 3+）。
- 业务 modules 的 stories 可挂在 happy-dog Storybook 的额外 stories glob，或后续 `apps/storybook`；Phase 2 试点阶段允许先只在 happy-dog 强制，业务 stories 随后开启。

### 4.4 `.mock` — 稳定夹具

- 供 spec/story 共用；禁止把生产秘密放进 mock。

## 5. 变更协议（强交互）

凡改动组件**公开行为或状态**（含新增 props 驱动的 UI 状态），同一次改动必须：

1. 更新 `.md` 场景/状态表  
2. 更新或新增 `.spec` 断言  
3. 更新 `.stories` 对应 story/args  
4. 若改了 happy-dog 基础组件：跑受影响 stories /（有则）Chromatic，并在 AI Test Record 写影响面  

**样式-only 且无行为变化**（纯 token/class 微调）：可只更新 stories 视觉；md 不必改，但 AI Review 须声明「无行为变更」。

## 6. 与「无人 review」目标的关系

| 层级 | 能否弱化人工 review | 条件 |
| --- | --- | --- |
| 基础组件视觉/简单业务 UI | 可以逐步弱化 | Gate：typecheck/lint/test + story 结构检查 + Chromatic/本地视觉 + Dual-AI Review Record |
| 跨模块重构、cache、adapter | 需要 AI Review + 人抽检 | 影响面大 |
| cart cookie / checkout / payment / 安全 | **必须保留人类 gate** | 金钱与安全；契约不能替代 |

「完全不需要人 review」在企业流程中应理解为：**低风险变更默认机器+双 AI 放行；高风险变更强制人审**——而不是消灭人审。

## 7. Harness 映射（8 组件）

| # | 组件 | 本契约对应 | Phase 2 前最低完成 |
| --- | --- | --- | --- |
| 1 | Spec | 本文 + 组件 `.md` 模板 | ✅ 本文 |
| 2 | Static | `check-component-companions.mjs` | ✅ warn 已落地 |
| 3 | Dynamic | `.spec` + `.stories` | 试点组件必须有 |
| 4 | Gate | `quality:companions` + `quality:diff` | ✅ warn；error/CI 待升 |
| 5 | Feedback | Storybook / Chromatic | Chromatic 可后置；先 storybook build |
| 6 | Evaluation | companion 覆盖率扫描 JSON | 后期 |
| 7 | Knowledge | AGENTS.md 指针 + 本文件 | ✅ |
| 8 | Evolution | 改契约须同步 AGENTS + 脚本 + 模板 | ✅ 写明 |

## 8. COMPONENT.md 模板

```markdown
# <ComponentName>

## 职责
一句话。

## 用户故事 / 场景
- 作为…，我希望…，以便…
- 场景 A：…
- 场景 B：…

## 状态矩阵
| 状态 | 触发 | 可见结果 |
| --- | --- | --- |
| default | … | … |
| disabled | … | … |

## 非目标
- …

## 依赖
- 基础组件：…
- ports / 数据：…
```

## 9. 推荐落地顺序（基础设施）

见同目录 `component-folder-contract-rollout.md`。
