# Phase Reviews — 里程碑评审报告

更新日期：2026-07-18

本目录存放**每个 Phase / 子里程碑完成时**的评审报告。由人显式触发 `phase-review` skill（见 `.agents/skills/phase-review/`），AI 不会在开发结束后自动评审。

## 评分哲学（v2）

服务目标：**参考参考工程，分阶段复现核心设计 / 基础架构 / 关键功能**（轻量实现，不复制企业级成本）。

| 项 | 分值 | 含义 |
| --- | --- | --- |
| A | 40 | 验收标准实现度 |
| B | 20 | 质量门（含条件门：Storybook build / **运行时抽检**） |
| C | 15 | Hard Rules / ADR 符合度 |
| D | 10 | 阶段取舍合理性（禁止「没做重设施=胜」） |
| E | 15 | 阶段参考核心覆盖（`phase-capability-checklists.md`） |

护栏：UI 声称可用但运行时抽检失败 → 总分封顶 74。

子里程碑 PRD：`docs/milestones/`。

## 评分历史

| Phase | 评审日期 | Skill | 得分 | 等级 | 报告 |
| --- | --- | --- | --- | --- | --- |
| 1 — 最小骨架 | 2026-07-18 | v1（已废弃口径） | 97.1 | 优秀 | 同文件初评；**存在 Storybook 运行时漏检** |
| 1 — 最小骨架 | 2026-07-18 | **v2** | 95.1 | 优秀 | [phase-1-minimal-skeleton.md](./phase-1-minimal-skeleton.md) |

## 触发方式

对 AI 说：**「跑一下 phase N 的评审」** / **「重评 phase 1」** / **「评审 M2.1」**。
