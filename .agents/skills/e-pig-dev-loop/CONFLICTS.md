# Community skills 冲突矩阵（E-pig）

更新日期：2026-07-19

| Skill | 上游默认 | E-pig 定制 | 理由 |
| --- | --- | --- | --- |
| `using-superpowers` | 任何会话强制先 invoke | `disable-model-invocation` + override | 与 Hard Rules / phase-review 手动纪律冲突 |
| `brainstorming` / `writing-plans` / `test-driven-development` / `subagent-driven-development` | 易被 Superpowers 链式拉起 | `disable-model-invocation`；经 orchestrator 调用 | 防止无预算全流程 |
| `ponytail` | ACTIVE EVERY RESPONSE, default full | opt-in、default lite、禁删测试/harness | 过度 YAGNI 会拆掉治理 |
| `grill-me` / `grilling` | 用户触发 | Align 阶段使用 | 与 page DDD 互补 |
| `tdd` (matt) vs `test-driven-development` (obra) | 两套 TDD | 默认 matt；高风险可 obra | 避免双仪式重复 |
| `code-review` vs `requesting-code-review` | 各一套 | Dual-AI 任选其一，写 AI Review Record | 不双跑 |
| `impeccable` | 强设计意见 + PRODUCT/DESIGN | 先读仓库 DESIGN.md；token 以 happy-dog 为准 | 防 AI slop，不重写架构 |
| Saleor Paper skills | GraphQL/channel URL | **不安装**；只吸收 thin router / cache-manifest / verify | 硬约束不绑定 Saleor |
