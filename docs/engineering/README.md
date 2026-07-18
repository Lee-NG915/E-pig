# Engineering 流程文档

更新日期：2026-07-18

状态：active

对话驱动开发的推荐阅读顺序（闭环）：

```text
页面任务
  → page-workflow-guide.md          # DDD 定域 → 组件落 module → app 组装
  → component-workflow-guide.md     # 单组件 md / tsx / spec / stories
  → quality:companions + 相关测试     # 机器提醒（默认 warn；升 error 后才阻断）
```

| 文档 | 用途 |
| --- | --- |
| [page-workflow-guide.md](./page-workflow-guide.md) | 页面级：领域归属与落点 |
| [component-workflow-guide.md](./component-workflow-guide.md) | 组件级：日常改法与门禁 |
| [component-folder-contract.md](./component-folder-contract.md) | 组件文件夹契约（行为 Spec） |
| [component-folder-harness.md](./component-folder-harness.md) | 契约的 8 组件 Harness 设计 |
| [component-folder-contract-rollout.md](./component-folder-contract-rollout.md) | R0–R3 落地节奏 |

产品里程碑 PRD 在 `docs/milestones/`；架构硬约束在 `AGENTS.md` 与 `docs/codex/research/`。
