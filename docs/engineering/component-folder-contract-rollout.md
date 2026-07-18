# 组件文件夹契约 — 落地与基础设施路线图

更新日期：2026-07-18

状态：active（R0 完成；R1 warn + CI 盘点已落地，error 阻断待升）

配合：入口指南 [`component-workflow-guide.md`](./component-workflow-guide.md) / [`page-workflow-guide.md`](./page-workflow-guide.md) + `component-folder-contract.md`（行为）+ `component-folder-harness.md`（8 组件治理设计）。  
目标支持「对话完善细功能」；**不**承诺消灭所有人类 review。落地阶段与 Harness Guide 的 H1/H2/H3 对齐（先 Spec+Static+Gate，再量化）。

## 阶段 R0 — 文档 + AI 纪律（已完成）

**做：**

1. 冻结契约文档（已完成）。
2. AGENTS.md 增加「组件文件夹契约」指针 + 流程入口。
3. Phase 2 新业务组件**默认**按一组件一文件夹创建；旧扁平组件改到时再迁（不一次性搬家）。
4. happy-dog：新组件必须落在 `components/<name>/`；既有 button/badge/sheet 在 M2.x 空隙迁一次。
5. AI 工作流（对话）：见 `component-workflow-guide.md`；改组件前先读同目录 `.md`；无 md 则先补 md 再改代码。

**验收：** 任意新试点组件目录含 md + tsx + spec；happy-dog 改动必动 stories。

**不做：** Chromatic、全仓强制 stories、业务 Storybook glob。

---

## 阶段 R1 — Gate 最小闭环（进行中）

**已做：**

1. 脚本 `scripts/quality/check-component-companions.mjs` + `component-folder-allowlist.json`（含 `legacyFlatFiles` / CF-1）
2. `pnpm quality:companions`；`pnpm quality:diff` 内置调用（默认 **warn**，由 `COMPANIONS_LEVEL` 控制）
3. `post-edit-check.sh` 对组件实现路径提醒 companion
4. 流程入口：`component-workflow-guide.md` + `page-workflow-guide.md`
5. CI：`pnpm quality:companions -- --report-all`（warn，不阻断 job）
6. 页面落点签名：`diff-check.sh` 对 `src/app/_components/**`、`src/components/**` 报 **WARN**

**仍待：**

1. 默认升 `COMPANIONS_LEVEL=error`（待试点债清零 / 显式豁免后）
2. Storybook：业务试点 stories 纳入 happy-dog（或根）stories glob
3. Dual-AI：cart/catalog 改动强制 Test Record + Review Record（AGENTS 已有条款）
4. `stop-review.sh` 接 companions（仍为待实现）

**验收：** 故意只改 tsx 不同步 spec 时，本地 `pnpm quality:companions` / `quality:diff` 报 warning（error 模式可阻断）；未登记扁平报 CF-1。

---

## 阶段 R2 — Feedback（视觉影响面）

**做：**

1. 本地 Chromatic **或** Playwright screenshot diff（二选一，优先 Chromatic 与参考工程对齐）。
2. 基线范围：happy-dog 全量 + 试点业务 stories；避免全仓噪音。
3. 基础组件 PR 必须附视觉 diff 摘要（AI 可生成）。

**验收：** 改 Button variant 能列出受影响 story 列表（工具输出或 Chromatic）。

---

## 阶段 R3 — Evaluation + 弱化人审

**做：**

1. 定期扫描：契约组件覆盖率、md 新鲜度（可选：md 与导出 props/状态关键字粗匹配）。
2. 低风险标签：`risk=ui-low` 的 PR 可「双 AI + 全绿门禁」合并；`risk=money|security|cache` 强制人审。
3. 对话模板：「先改 md 场景表 → 列影响文件 → 实现 → 跑 companion 检查 → 输出 AI Test/Review Record」。

**验收：** 至少一个真实细功能（如 product-card 禁用/缺货态）纯对话交付且门禁全绿；人只抽检报告不读全 diff。

---

## 当前架构缺口（必须先补的）

相对「对话改细功能、默认可信」：

| 缺口 | 为何挡路 | 归属阶段 |
| --- | --- | --- |
| companions 仍为 warn（含 CI） | 可忽略警告继续合并 | R1 末升 error |
| 试点 companion 债（缺 spec/md） | 升 error 会常态红灯 | R1 |
| 业务组件无统一 stories 入口 | 影响面不可见 | R1 |
| 无视觉回归 | 基础组件改动的业务冲击靠人眼 | R2 |
| 无风险分级合并策略 | 「完全无人审」不安全 | R3 |
| md 无腐烂检测 | PRD 与代码脱节后 AI 会双错 | R3（先靠纪律） |

**结论：R0 + R1(warn + CI 盘点 + CF-1 + 页面路径 warn) 已可用；升 error 前先清试点债；R2 视觉后再谈弱化人审。**
