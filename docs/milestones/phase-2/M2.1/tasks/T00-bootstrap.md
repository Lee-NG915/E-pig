# T00 — 里程碑引导（分支 + 交付闭环 + 冻结契约）

- Milestone: M2.1
- Status: done
- Agent: cursor
- Date: 2026-07-19
- Commit: 0afe24c
- PRD 验收映射: （流程 task，无产品验收行）

## Summary

建立 Phase 2 / M2.1 可溯源交付基线：

- 新增 `docs/engineering/milestone-delivery-loop.md`，并接入 `e-pig-dev-loop`、`AGENTS.md`、engineering README。
- 创建工作区 `docs/milestones/phase-2/M2.1/`（contracts / TASKS / tasks）。
- Align 冻结：PLP=`/collections/[slug]`；Listing 增 `slug`；M2.1 用 `sort` 关门；PDP 仅占位链。

## Tests

- Commands: 无运行时行为变更
- Result: NOT RUN（文档/流程豁免）
- Notes: 属 AGENTS 测试豁免白名单（纯文档）

## AI Test Record

- Behavior changed: 无运行时行为
- Tests added/updated: 无
- Tests run: 无
- Result: NOT RUN
- Failures or gaps: 无
- Next risk: 契约若在实现中被静默改写 → 必须更新 contracts.md 并开溯源

## Follow-ups

- T01 起由 Kimi 按 contracts 改 CatalogPort / mock / 测试
