# 组件对话开发流程指南

更新日期：2026-07-19

状态：active

本文件是**组件级入口**：说明「对话驱动改组件」时怎么做、机器怎么拦、文档怎么读。  
若从**新页面 / 改页面**开始，先走 [`page-workflow-guide.md`](./page-workflow-guide.md)（DDD 定域 → 组件落 module），再进入本文，形成闭环。  
细则与治理设计见同目录其它文档（下文「文档地图」）。

---

## 1. 一句话

改组件公开行为时，把需求（`.md`）、实现（`.tsx`）、证明（`.spec`）、可视状态（`.stories`）当作**同一工作单元**；本地用 `pnpm quality:companions` / `pnpm quality:diff` 检查是否漏 companion。

---

## 2. 文档地图

| 文档 | 读它当… |
| --- | --- |
| [`page-workflow-guide.md`](./page-workflow-guide.md) | 页面定域、落 module、拼 app（上游闭环） |
| **本文** | 单个组件日常怎么做 |
| [`component-folder-contract.md`](./component-folder-contract.md) | 目录形状、文件职责、变更协议、md 模板 |
| [`component-folder-harness.md`](./component-folder-harness.md) | 8 组件 Harness 如何接到脚本/门禁 |
| [`component-folder-contract-rollout.md`](./component-folder-contract-rollout.md) | R0–R3 落地阶段与当前缺口 |
| `AGENTS.md` →「组件文件夹契约」 | AI 硬约束指针（不复制细则） |

配置与脚本：

| 路径 | 作用 |
| --- | --- |
| `scripts/quality/component-folder-allowlist.json` | 扫描范围与是否强制 md/stories |
| `scripts/quality/check-component-companions.mjs` | Static：companion 存在性（CF-2/3/4） |
| `pnpm quality:companions` | 单独跑 companions（默认 warn） |
| `pnpm quality:diff` | ESLint + 签名扫描 + companions（warn） |
| `packages/storybook-host` | 业务 modules + happy-dog 聚合 Storybook（`@storybook/react-vite`，端口 6007） |
| `pnpm storybook:modules` | 启动聚合 Storybook 查看业务组件 stories（`pnpm build-storybook:modules` 出静态产物） |

---

## 3. 标准回路（对话 → 交付）

从页面任务进来时：先完成 page-workflow 的定域与组件清单，再对清单逐项执行本回路。

```text
用户提出细功能（例：product-card 加缺货禁用）
  或：页面流程拆出的组件清单项
        │
        ▼
① 读同目录 .md（没有则先建文件夹 + md，再改代码）
        │
        ▼
② 在 md 里增补「用户故事 / 状态矩阵」（只写行为，不写 className）
        │
        ▼
③ 同一次改动：tsx + spec + stories（allowlist 内组件三者都是强制 companion）
        │
        ▼
④ pnpm quality:companions   # 漏 companion 会报 CF-*
   pnpm test <相关 spec>
   行为面大时：pnpm typecheck && pnpm lint
        │
        ▼
⑤ 交付附 AI Test Record（声明 companion 已同步；样式-only 须豁免）
   cart/catalog 等中高风险另附 AI Review Record
```

### 3.1 什么时候必须走完整回路

- 新增/变更用户可见状态或交互（含 props 驱动 UI）
- happy-dog 基础组件的任何公开 API / 视觉状态矩阵变更

### 3.2 什么时候可以简化

| 情况 | 最少要求 |
| --- | --- |
| 纯样式 / token，无行为变化 | stories（若有）可更新；md 可不动；AI Record 写「无行为变更」 |
| 私有 `parts/` 叶子、无独立状态 | 可不建子文件夹 md/stories |
| 不在 allowlist 的一次性布局碎片 | 不强制契约；有公开行为后再升格 |

---

## 4. 目录形状（速查）

**目标形状（Phase 2 新组件默认）：**

```text
src/modules/<domain>/components/<name>/
  <name>.tsx
  <name>.md            # 业务试点（allowlist）强制
  <name>.spec.tsx      # 或 .spec.ts
  <name>.stories.tsx   # allowlist 内强制（requireStoriesForModuleFolders=true）
  <name>.mock.ts       # 可选
  parts/               # 可选私有子组件
```

`packages/happy-dog/src/components/<name>/` 同构。

**过渡形状（现状允许）：** 扁平 `components/foo.tsx` + 同目录 `foo.spec.*` / `foo.stories.*`。  
旧扁平迁到时再改，禁止一次性全仓搬家。

---

## 5. 机器检查怎么用

```bash
# 只查 git 触及的组件实现（默认 warn，exit 0）
pnpm quality:companions

# 扫 allowlist 下全部组件（盘点缺口）
pnpm quality:companions -- --report-all

# 升为阻断（本地/CI 试点）
COMPANIONS_LEVEL=error pnpm quality:companions
# 或
pnpm quality:companions -- --level=error

# 与 ESLint 定向检查一起（quality:diff 内置 companions，默认 warn）
pnpm quality:diff
```

规则摘要：

| 规则 | 含义 |
| --- | --- |
| CF-1 | 扁平 `components/foo.tsx` 必须在 `legacyFlatFiles`；新组件请用文件夹形状 |
| CF-2 | 同目录必须有 `.spec.ts` 或 `.spec.tsx` |
| CF-3 | happy-dog 必须有 `.stories.tsx`；业务文件夹已强制（allowlist `requireStoriesForModuleFolders=true`） |
| CF-4 | 业务**文件夹形状**且 allowlist `requireMdForModuleFolders` 时，必须有 `.md` 且含 `## 状态矩阵` 或 `## 用户故事` |

日志：`logs/component-folder-companions.json`（已 gitignore）。

当前默认 **warn**：漏 companion 会打印，但不会让 `quality:diff` 失败。CI 已跑 `--report-all`（仍 warn）。稳定后把 `COMPANIONS_LEVEL=error` 接进阻断（见 rollout R1）。

---

## 6. AI / 人类分工

| 角色 | 职责 |
| --- | --- |
| 对话 AI | 先 md 后代码；companion 同 patch；跑 companions + 相关 test；写 AI Test Record |
| Gate | companions + lint/typecheck/test；不替代人审金钱/安全路径 |
| 人类 | 抽检报告与高风险路径（cart cookie / checkout / payment / cache / adapter） |

「弱化人审」前提是 R1 Gate 稳定 +（R2）视觉 Feedback；**不是**消灭人审。

---

## 7. 最小示例：给已有扁平组件加一态

以 `product-card` 加「缺货禁用」为例（扁平过渡期）：

1. 若仍是扁平：同目录补/改 `product-card.spec.tsx`；试点升格时再迁到 `product-card/product-card.*` 并补 `product-card.md`。
2. md（文件夹后）：状态矩阵增加一行 `outOfStock | inventory=0 | CTA disabled + 文案`。
3. 实现与测试同 patch；`pnpm quality:companions` 无缺失；`pnpm test src/modules/catalog/components/...`。
4. AI Test Record 写清行为变更与 companion 同步。

新组件请直接用文件夹形状，避免再堆扁平债。

---

## 8. 当前成熟度（对照）

| 阶段 | 状态 |
| --- | --- |
| R0 文档 + AI 纪律 | ✅ |
| R1 companions Gate（warn） | ✅ 已挂 `quality:companions` + `quality:diff` |
| R1 companions 升 error / CI | ⏳ |
| R2 Chromatic / 视觉 | 未做 |
| R3 风险分级弱化人审 | 未做 |

详细勾选见 `component-folder-harness.md` §9–§10 与 rollout。

---

## 9. 常见问题

**Q: 只改了文案算行为变更吗？**  
用户可见文案/状态变了 → 算；同步 spec（必要时 md）。纯内部注释不算。

**Q: stories 能不能写加购到结账？**  
不能。stories = 状态矩阵；旅程用 Testing Library / 未来 Playwright。

**Q: content 模块的 header/footer 要不要强制？**  
默认不在 cart/catalog allowlist；有复杂状态再升格并加入 allowlist。

**Q: 为什么 happy-dog 现在会 warn 缺 spec？**  
H1 已开始扫描；既有 button/badge/sheet 有 stories、缺行为 spec 时会 warn，迁移文件夹或补 spec 时再清零，不阻塞日常提交（warn 模式）。
