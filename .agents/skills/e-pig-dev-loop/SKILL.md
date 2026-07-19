---
name: e-pig-dev-loop
description: >
  E-pig orchestrator for AI coding sessions. Routes grill-me, ponytail, TDD,
  impeccable, Superpowers, and project e-pig rules without letting them conflict.
  Use when starting feature work, page/component tasks, UI polish, or when the
  user mentions e-pig-dev-loop / 开发闭环 / 统筹 skill.
metadata:
  author: e-pig
  version: "1.0.0"
---

# E-pig Dev Loop（统筹 skill）

本 skill 是社区 skills 与项目 Hard Rules 之间的**唯一调度入口**。

## Precedence（冲突时按此裁决）

1. `AGENTS.md` Hard Rules + `.agents/rules/*`（最高）
2. `.agents/skills/e-pig/rules/*`（项目架构/缓存/SEO/组件）
3. 本文件的阶段路由
4. 社区 skill（grill-me / ponytail / tdd / impeccable / Superpowers 子集）
5. 通用外部经验（含 Saleor Paper 启发）——只借鉴模式，不绑定 Saleor DTO/GraphQL

`phase-review`：**永远手动触发**，本 loop 不得自动拉起。

## 阶段路由

按任务选阶段；**不要**默认跑满全流程。

| 阶段 | 何时 | 调用 | 不做 |
| --- | --- | --- | --- |
| 0. Orient | 任何任务开始 | 读 `AGENTS.md` Hard Rules；需要深度时读 `e-pig` skill 索引 → **一条** matching rule | 不加载编译版巨型文档 |
| 1. Align | 需求不清 / 新页面 / 新里程碑 | `grill-me` → `grilling` | 不开始写码 |
| 2. Plan | 中大型或跨模块 | `writing-plans`（可选）；输出文件级计划 | 不装新依赖除非计划批准 |
| 3. YAGNI gate | 即将写实现 | `ponytail` **lite** | 不跳过测试/companions/Hard Rules |
| 4. Implement | 写代码 | 页面→`page-workflow-guide`；组件→`component-workflow-guide`；逻辑用 `tdd` 或（高风险）`test-driven-development` | modules 不碰 adapters |
| 5. Design QA | UI/视觉变更 | `impeccable`（先读仓库根 `DESIGN.md` / `PRODUCT.md`） | 不覆盖品牌 token 为紫色渐变 |
| 6. Verify | 声称完成前 | `pnpm verify`；可选 `verification-before-completion` | 未跑测试不得宣称完成 |
| 7. Review | cart/checkout/支付/跨层 或用户要求 | Dual-AI：`requesting-code-review` 或 `code-review`；保留人类 gate | 不取消 AI Test/Review Record |

## 高风险任务（强制 Dual-AI 口径）

触发：`cart` / `checkout` / `payment` / 跨 `modules↔adapters` / 缓存失效 / 异步重试。

额外：

- 可用 `subagent-driven-development`，但**预算有限**，任务必须可切小
- Review checklist：Hard Rules、禁缓存字段、companion、测试、无供应商泄漏进 modules

## 社区 skill 冲突表（摘要）

详见同目录 `CONFLICTS.md`。

| 冲突 | 裁决 |
| --- | --- |
| Superpowers「任何对话先 invoke」 | **关闭**；仅本 loop 点名调用 |
| Ponytail「ACTIVE EVERY RESPONSE / full」 | **lite + 按阶段**；不得删测试与 harness |
| matt `tdd` vs obra `test-driven-development` | 默认 `tdd`；高风险 Dual-AI 可用 obra TDD |
| impeccable 要重做品牌 | 以 `DESIGN.md` + happy-dog tokens 为准 |
| Saleor 的 locale/channel URL | **不采用**；E-pig 用 host→market |

## 完成定义

1. `pnpm verify` 绿（或显式 NOT RUN + 原因）
2. 行为变更有测试 + AI Test Record
3. 高风险任务有 AI Review Record
4. UI 变更未引入 Hard Rules / DESIGN.md 禁用模式
