---
name: quality-self-check
description: 任何代码编辑完成后必须按序跑 typecheck → lint → test 并全部通过才能宣告完成。Always-on 规则，经 AGENTS.md @include 加载（CLAUDE.md 通过 @AGENTS.md 委托）。
type: enforcement
version: 1.0.0
---

# Quality Self-Check — 通用编辑后自检规则

完成**任何代码编辑**之后，必须先验证质量再宣告任务完成。本规则适用于所有源码改动，不限于特定目录。

## 核心原则

- **先完成全部编辑，再验证**——绝不中途验证（避免打断批量编辑）。
- 验证不通过就修复后重跑，最多 3 轮；3 轮仍不过 → 结构化 ESCALATE，**不得报告完成**。

## 验证循环

```
先完成全部代码编辑（never verify mid-batch）

attempt = 1
MAX_ATTEMPTS = 3

loop:
  按序执行:
    1. pnpm typecheck        # tsc --noEmit
    2. pnpm lint             # eslint .
    3. pnpm test             # vitest run；大范围改动跑全量，
                             # 小改动可先用 pnpm test <changed spec 路径> 的最小范围，
                             # 但收尾前至少跑一次完整 typecheck + lint
  → 全绿：完成，可报告任务完成
  → 有失败 且 attempt < MAX_ATTEMPTS：修复失败项，attempt++，回到 loop 开头重跑全部
  → 有失败 且 attempt == MAX_ATTEMPTS：退出循环 → ESCALATE
```

注意：任一环节失败即停止当轮后续环节（typecheck 挂了就不用跑 lint/test），修复后从 typecheck 重新开始。

## Loop Invariants（命中任一 → 立即 ESCALATE，不等满 3 轮）

1. **Empty diff**：某轮修复没有产生任何代码 diff → 立即 ESCALATE（问题不是代码编辑能解决的，多半是配置或工具问题）。
2. **No regression**：之前某轮已全绿的检查，被后续修改改挂了 → 立即 ESCALATE（修新问题不许把已通过的检查弄挂）。
3. **Same failure twice**：同一份失败输出连续出现两次 → 立即 ESCALATE（修复没有推进）。

## ESCALATE 输出（固定格式）

```md
## ESCALATE — 质量检查 3 轮后仍未通过

残留失败（file:line 列表）：
- <file>:<line> — <rule / TS error code> — <message>

3 轮各改了什么：
- Attempt 1: <what was changed>
- Attempt 2: <what was changed>
- Attempt 3: <what was changed>

下一步：需要人工调查。**不得报告任务完成。**
```

## 长任务 / 多文件编辑的收尾

编辑跨度大（多文件、长会话）时，收尾收敛改用脚本驱动同一协议，而不是手动跑命令：

```bash
node scripts/quality/remediation-loop.mjs --run-id <uuid> [--attempt N] [--max-attempts 3] ...
```

该脚本实现同一收敛协议（empty-diff / no-regression / same-output / max-attempts 判定），输出单行 JSON，并逐轮 append 到 `logs/remediation-<run-id>.json`。

## 范围

- 适用于全部源码与配置编辑（`src/**`、`scripts/**`、配置文件等）。
- 纯文档编辑（`.md`）不触发本循环，但仍受 `doc-freshness` 规则约束。
- 本规则只做静态检查与单测；E2E 设施 P0 阶段不存在，不要求。
