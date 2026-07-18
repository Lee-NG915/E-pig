# Harness 设计：组件文件夹契约领域

更新日期：2026-07-18

状态：active（H1 warn 已落地）  
领域 ID：`component-folder`  
流程入口：[`component-workflow-guide.md`](./component-workflow-guide.md)  
契约事实源：[`component-folder-contract.md`](./component-folder-contract.md)（行为约定）  
落地节奏：[`component-folder-contract-rollout.md`](./component-folder-contract-rollout.md)

本文件回答：**若严格遵循仓库 Harness Engineering（8 组件范式），这个领域应如何设计。**  
不在此重复目录形状细节；形状以 contract 为准。本文件只定义**治理闭环怎么接上机器**。

---

## 0. 领域边界

| 项 | 定义 |
| --- | --- |
| **要保护的不变量** | 契约组件的公开行为变更，必须伴随可验证的需求（md）、行为证明（spec）、状态展示（stories，按层级强制）；禁止「只改 tsx」。 |
| **保护对象路径** | `packages/happy-dog/src/components/**`；`src/modules/*/components/**` 中列入 allowlist 的试点组件 |
| **非目标** | 页面级 E2E 旅程、强制全仓每个 span 都有 md、用 story 替代 Playwright |
| **与既有 Harness 关系** | 并列于 import 边界 / env 卫生；共享 `quality:diff`、CI、AI Test/Review Record，不重复造第二套 typecheck |

---

## 1. Spec — 什么样算正确？

**单一事实源（只写一处）：**

1. `docs/engineering/component-folder-contract.md` — 目录形状、文件职责、变更协议、适用范围  
2. 本文件 — 8 组件如何强制上述 Spec  
3. AGENTS.md — **仅指针**，不复制细则  

**正确性判定（机器可理解的条款）：**

| ID | 规则 |
| --- | --- |
| CF-1 | 契约组件主实现文件位于 `…/<name>/<name>.tsx`（或 `.ts`） |
| CF-2 | 同目录必须存在 `<name>.spec.ts` 或 `<name>.spec.tsx` |
| CF-3 | happy-dog 契约组件同目录必须存在 `<name>.stories.tsx` |
| CF-4 | allowlist 内业务契约组件同目录必须存在 `<name>.md`，且含标题 `## 状态矩阵`（或 `## 用户故事`） |
| CF-5 | 行为变更 PR 的 AI Test Record 必须声明 companion 已同步；样式-only 须显式豁免 |
| CF-6 | stories 禁止承载跨路由用户旅程（规范约束；早期靠 Review，后期可用 lint 禁 `play` 里 `goto`/多页断言——可选） |

**Allowlist 配置（已落地）：**  
`scripts/quality/component-folder-allowlist.json`

```json
{
  "happyDogComponentsDir": "packages/happy-dog/src/components",
  "moduleComponentDirs": [
    "src/modules/cart/components",
    "src/modules/catalog/components"
  ],
  "requireMdForModuleFolders": true,
  "requireStoriesForModuleFolders": false,
  "legacyFlatFiles": ["…existing flat paths…"],
  "ignoreFilePatterns": [
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "**/*.stories.tsx",
    "**/*.stories.ts",
    "**/*.mock.ts",
    "**/index.ts",
    "**/index.tsx"
  ]
}
```

Phase 2 试点：`requireStoriesForModuleFolders` 先 `false`，R1 末再对 allowlist 升 `true`。

---

## 2. Static — 写代码时机器能抓到吗？

分两层，**先脚本后 ESLint**（与 harness-guide：简单规则先脚本/lint，复杂再 plugin）。

### 2.1 Companion 存在性（主 Static）

`scripts/quality/check-component-companions.mjs`

- 输入：git diff 中的 `.tsx/.ts`（复用 diff-check 的文件枚举逻辑，或被 diff-check 调用）
- 对每个「像主组件」的路径（目录名 === 文件名 stem，且不在 ignore）：
  - 检查 CF-1 / CF-2 / CF-3 / CF-4
- 输出：stdout 人类可读 + `logs/component-folder-companions.json`  
  `{ status, summary, next_actions, violations: [{ file, missing, ruleId }] }`
- 级别：迁移期 `warn`（exit 0）；稳定后 `error`（exit 1）
- CF-1：扁平实现须在 `legacyFlatFiles`；未登记的扁平报 CF-1（堵「新扁平逃 md」）

### 2.2 可选 ESLint（辅助）

- 不强制用 ESLint 查「文件是否存在」（ESLint 不擅长跨文件 companion）。
- 可用：`eslint-plugin-import` 无；保持脚本为主。
- IDE Feedback：在 `post-edit-check.sh` 中调用 companions 检查（见 §5）。

### 2.3 模板 Static（防空 md）

- 新建组件可用 scaffold：`pnpm gen:component --name product-card --domain catalog`（后期）
- 生成四件套空壳，md 带状态矩阵表头 → 满足 CF-4 结构最小值

---

## 3. Dynamic — 运行时 / 测试能验证吗？

| 层 | 工具 | 验证什么 |
| --- | --- | --- |
| 行为 | Vitest + Testing Library（`.spec.tsx`） | 用户可见交互与状态分支 |
| 可视状态 | Storybook stories | 状态矩阵可渲染（无 error overlay） |
| 契约烟雾 | `build-storybook` + 抽检 iframe（phase-review 已用） | 打包与关键 story 可加载 |
| 视觉回归（R2） | Chromatic 或 Playwright screenshot | 基础组件变更的像素/结构 diff |

**Dynamic 不验证「md 与代码语义一致」**（那是 AI Review + 后期 Evaluation 启发式）。Dynamic 只保证：**声称有行为的组件有自动化证明，声称有 UI 状态的有可渲染 story**。

---

## 4. Gate — 合并前能拦住吗？

```text
本地 / CI 合并门禁链（组件领域增量）
┌─────────────────────────────────────────┐
│ 1. pnpm typecheck / lint / test         │  ← 已有
│ 2. pnpm quality:diff                    │  ← 已有 import/env
│ 3. check-component-companions           │  ← 新增（本领域核心 Gate）
│ 4. happy-dog: test + build-storybook    │  ← 改 packages/happy-dog 时
│ 5. （R2）chromatic / visual gate        │
│ 6. AI Test Record + Review Record       │  ← 流程 Gate（cart/catalog 强制）
└─────────────────────────────────────────┘
```

**接入方式：**

- `package.json`：`"quality:companions": "node scripts/quality/check-component-companions.mjs"`
- `diff-check.sh`：调用 companions，级别由 `COMPANIONS_LEVEL`（默认 `warn`）控制；`warn` 不失败，`error` 时 `quality:diff` 退出 1
- CI：`.github/workflows/ci.yml` 已挂 `pnpm quality:companions -- --report-all`（warn，不阻断 job）
- **风险分级（R3）：**
  - `risk=ui-low`：1–5 全绿可自动合（仍保留 branch 保护）
  - `risk=money|security|cache`：阻断自动合，要求人类 approve

**Gate 绝不做：** 用覆盖率百分比阻塞 PR（harness-guide 反模式）；companions 缺失用明确 violation 列表。

---

## 5. Feedback — 对的人（或 AI）能立刻知道吗？

| 通道 | 机制 |
| --- | --- |
| IDE / Agent 编辑后 | `post-edit-check.sh` 对组件实现路径提醒同步 companion（已落地，永不阻断） |
| Agent 停手前 | `stop-review.sh` 查 companions：**待实现**（勿当作已有能力） |
| PR | CI 已跑 companions warn 全量盘点；annotation / Chromatic 评论（R2） |
| 对话 | AI 被要求先读 `.md`；companions fail 时下一轮必须先补文件 |

Feedback 的「对的人」在本仓库主要是 **正在改代码的 AI agent**；人类通过 CI/Chromatic 接收。

---

## 6. Evaluation — 合规可量化吗？

定期或 `pnpm quality:companions --report-all`：

```json
{
  "status": "success",
  "summary": "contract components 12; compliant 9; missing_spec 2; missing_md 1",
  "metrics": {
    "total_contract_components": 12,
    "with_spec": 10,
    "with_stories": 8,
    "with_md": 7,
    "compliance_rate": 0.75
  },
  "violations": [],
  "generated_at": "…"
}
```

- 写入 `logs/component-folder-evaluation.json`
- **不**做合并硬门槛；给 phase-review / 周报用
- 可选 eval：`.claude/evals/` 放「故意缺 spec 的夹具目录」验证脚本能抓到（防检查器腐烂）

---

## 7. Knowledge — 新人 / 新 AI 能维护吗？

| 资产 | 作用 |
| --- | --- |
| `component-folder-contract.md` | 开发者读的 Spec |
| **本文件** | 治理者读的 Harness 设计 |
| AGENTS.md 指针 | 默认加载 |
| `.agents/skills/harness-guide` 候选表增加本领域 | 发现入口 |
| COMPONENT.md 模板 | 降低空文档摩擦 |
| `gen:component`（后期） | 正确默认比文档更有效 |

Knowledge 原则：**细则不复制**；改规则只改 contract + 本文件 + 脚本，AGENTS 只留链接。

---

## 8. Evolution — 规则怎么安全演进？

| 变更类型 | 必须同步 |
| --- | --- |
| 改目录形状 / 强制级别 | contract.md + 本文件 + allowlist + companions 脚本 + AGENTS 指针日期 |
| warn → error | rollout.md 记录日期；先全仓扫零 violation |
| 扩大 allowlist | 先迁目录再进名单，禁止「名单已强制但文件仍扁平」 |
| 引入 Chromatic | 本文件 §3/§4 补工具名与 token 策略；不进业务 secret |

**已定稿决策（不要重开）：**

- stories ≠ E2E  
- md 只写行为不写实现  
- 金钱/安全路径保留人类 gate  

---

## 9. 按 Harness Guide 的三阶段落地（对照）

与 harness-guide Step 2–4 对齐：

### Phase H1 — 最小闭环（warn 已完成；error/CI 待升）

**Spec + Static + Gate**

- [x] Spec：contract + 本设计  
- [x] Static：`check-component-companions.mjs`（warn）  
- [x] Gate：挂入 `quality:diff` + `pnpm quality:companions`（warn；CI error 待升）  
- [x] Knowledge：AGENTS.md + [`component-workflow-guide.md`](./component-workflow-guide.md)  

**完成定义：** 故意删除某试点组件的 `.spec` 后跑检查能报出 CF-2。  
**验证：** `pnpm quality:companions -- --report-all`；日志 `logs/component-folder-companions.json`。

### Phase H2 — 可持续

**Knowledge + Evolution**

- [x] allowlist 文件落地  
- [ ] scaffold 脚本（可选）  
- [ ] 规则变更 checklist 写入 rollout  
- [x] eval 清单含 companions 正/负例（见 `.claude/evals/README.md`）  

### Phase H3 — 量化与弱化人审

**Dynamic 加强 + Evaluation + Feedback**

- [ ] 业务 stories glob + build-storybook 条件门  
- [ ] Chromatic / 视觉 Feedback  
- [ ] evaluation JSON + 风险分级合并  

**禁止：** 跳过 H1 直接上 Chromatic 或覆盖率门禁。

---

## 10. 完整性自检（当前设计成熟度）

| # | 组件 | 设计是否完整 | 实现状态 |
| --- | --- | --- | --- |
| 1 | Spec | ✅ | 文档已有 |
| 2 | Static | ✅ | companions（CF-1~4）+ 页面路径 warn |
| 3 | Dynamic | ✅ 已设计 | Vitest/SB 部分有；业务 stories 未铺 |
| 4 | Gate | ✅ | `quality:diff` warn + CI `--report-all` warn；error 未开 |
| 5 | Feedback | ✅ 已设计 | post-edit 已提醒；stop-review companions 待实现 |
| 6 | Evaluation | ✅ 已设计 | 未实现 |
| 7 | Knowledge | ✅ | AGENTS + workflow guide + docs |
| 8 | Evolution | ✅ 已设计 | 待第一次规则变更验证 |

**得分：设计 8/8；实现约 5.5/8（Spec + Static + Gate(warn+CI 盘点) + Feedback(post-edit) + Knowledge；Evaluation 仍缺）。**  
下一步：试点债清零 → 升 `COMPANIONS_LEVEL=error` → H3 视觉。

---

## 11. 对话开发时的标准回路（设计意图）

人类/AI 操作说明见 [`component-workflow-guide.md`](./component-workflow-guide.md)。Harness 视角摘要：

```text
用户：给 product-card 加缺货禁用
        │
        ▼
AI：读 product-card.md → 增补状态矩阵
        │
        ▼
AI：改 tsx + spec + stories（+ mock）
        │
        ▼
Static/Gate：pnpm quality:companions + typecheck/lint/test
        │
        ▼
Dynamic：相关 spec；若动 happy-dog → build-storybook / Chromatic
        │
        ▼
Feedback：失败则回修（remediation loop ≤3）
        │
        ▼
AI Review Record → risk=ui-low 则可弱化人审
```

H1 warn 已堵住「完全静默只改 tsx」；升 error 后才阻断合并。

---

## 12. H1 落地清单（对照）

1. [x] `scripts/quality/check-component-companions.mjs` + `component-folder-allowlist.json`  
2. [x] `package.json` → `quality:companions`  
3. [x] `diff-check.sh` 调用（warn）  
4. [x] `post-edit-check.sh` 组件路径提醒  
5. [x] `.claude/evals/README.md` companions 用例  
6. [x] harness-guide 候选表指向本领域  
7. [x] 流程入口 `component-workflow-guide.md`  

**下一步（非 H1）：** 迁 1–2 个业务组件到文件夹形状；补 happy-dog 行为 spec；升 error/CI。
