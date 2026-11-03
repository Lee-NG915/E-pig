# T04 — 首页与移动导航

更新日期：2026-11-03

- Milestone: koala-shopping-experience
- Status: done
- Agent: Codex + independent task agents
- Date: 2026-11-03
- Commit: f03293c24d9e6ffabef598dd40ac06ae075e51b1
- Acceptance: [冻结范围](../contracts.md)，对应 T04

## Summary

文图 Hero、真实文本 CTA、移动两列类目；复用 happy-dog Sheet，分组、drill/back 焦点、Escape 恢复及桌面自动关闭。

## AI Test Record

- Behavior changed: 文图 Hero、真实文本 CTA、移动两列类目；复用 happy-dog Sheet，分组、drill/back 焦点、Escape 恢复及桌面自动关闭。
- Tests added/updated: home-hero/home-categories/mobile-nav/site-header 共 17；行为测试与实现同 patch。最终对比度/Story 修正属于纯样式/示例，不新增行为测试。
- Tests run: 相关 Vitest 红绿与回归；整合 typecheck → lint → 全量 Vitest --maxWorkers=2；详见 [验证记录](../validation.md)。
- Result: PASS（受限并发的完整检查项；默认 verify 命令的环境超时单列记录）。
- Failures or gaps: 浏览器 emulation 而非实体手机；原有 Outdoor promo 室内配图未纳入本轮。
- Next risk: 浏览器 emulation 而非实体手机；原有 Outdoor promo 室内配图未纳入本轮。

## AI Review Record

- Review focus: 需求、模块边界、可见状态、ID/金额一致、错误恢复与可访问性。
- Findings: 独立审查未留阻断缺陷；三处新增说明对比度与无效移动 Story 已修复。
- Residual risks: 浏览器 emulation 而非实体手机；原有 Outdoor promo 室内配图未纳入本轮。
