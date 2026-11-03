# T01 — 受控规格与展示数据

更新日期：2026-11-03

- Milestone: koala-shopping-experience
- Status: done
- Agent: Codex + independent task agents
- Date: 2026-11-03
- Commit: dd6e4d63354cc5d51ad1dd44c1ec8ed1902f2df1
- Acceptance: [冻结范围](../contracts.md)，对应 T01

## Summary

保留既有商品/default variant ID 和三市场默认金额；Tamarama 补齐两色×两尺寸、对应图片/尺寸、预览 DTO 与纯函数选择规则。来源 ID 仅在 fixture 中追溯。

## AI Test Record

- Behavior changed: 保留既有商品/default variant ID 和三市场默认金额；Tamarama 补齐两色×两尺寸、对应图片/尺寸、预览 DTO 与纯函数选择规则。来源 ID 仅在 fixture 中追溯。
- Tests added/updated: catalog.spec.ts 15；variant-selection.spec.ts 7；行为测试与实现同 patch。最终对比度/Story 修正属于纯样式/示例，不新增行为测试。
- Tests run: 相关 Vitest 红绿与回归；整合 typecheck → lint → 全量 Vitest --maxWorkers=2；详见 [验证记录](../validation.md)。
- Result: PASS（受限并发的完整检查项；默认 verify 命令的环境超时单列记录）。
- Failures or gaps: 图片仍引用公开来源；本地价格与可售状态不是供应商承诺。
- Next risk: 图片仍引用公开来源；本地价格与可售状态不是供应商承诺。

## AI Review Record

- Review focus: 需求、模块边界、可见状态、ID/金额一致、错误恢复与可访问性。
- Findings: 独立审查未留阻断缺陷；三处新增说明对比度与无效移动 Story 已修复。
- Residual risks: 图片仍引用公开来源；本地价格与可售状态不是供应商承诺。
