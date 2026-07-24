# 里程碑交付闭环（Milestone Delivery Loop）

更新日期：2026-07-19

状态：active

大里程碑（Phase / `M*.*`）的分支、task 推送、问题溯源与流程演进协议。  
与会话级 `e-pig-dev-loop` 互补：后者管「一次对话怎么写码」；本文件管「一个里程碑怎么可复盘交付」。

---

## 1. 一句话

**一个大里程碑一条分支；每个 task 一次可溯源推送；发现问题先溯源再修规则；里程碑结束做复盘迭代。**

---

## 2. 角色分工（本地多 Agent）

| 角色 | 谁 | 职责 |
| --- | --- | --- |
| Leader | Cursor（本会话）或人类 | Align 冻结契约、拆 task、派工、Review、溯源裁决、复盘 |
| Implementer | Kimi Code 或 Claude Code | 按 task brief 实现 + 测试 + task 交付记录 |
| Reviewer | 另一 Agent（默认 Dual-AI：实现用 Kimi → Claude Review，或反之） | 对照 PRD/Hard Rules/验收表；产出 AI Review Record |
| Gate | `pnpm verify` + Stop hook + companions | 机器门禁；不替代人类/Leader Review |

`phase-review` **永远手动触发**，不在 task 闭环里自动跑。

---

## 3. 生命周期

```text
① 开里程碑分支
        │
        ▼
② Align：冻结契约 / 路由 / 非目标（grill-me 按需）
        │
        ▼
③ 拆 task 看板（可独立验收、可回滚）
        │
        ▼
④ 循环：实现 → verify 相关范围 → 写 task 交付记录 → commit → push
        │
        ├── 后续 task 发现前面有问题 → ⑤ 问题溯源
        │
        ▼
⑥ 里程碑关门：phase-review（人手动）+ 复盘笔记 → 迭代 skill/prompt/flow
```

### 3.1 分支规则

| 粒度 | 分支命名 | 说明 |
| --- | --- | --- |
| 子里程碑（推荐） | `feat/m2.1-home-plp` | 一个 `M*.*` 一条分支；PR 对齐单一 PRD |
| Phase 收口（可选） | `feat/phase-2` | 仅在需要 Phase 级集成分支时使用；默认仍按 M 拆 |

- 从当前已通过 verify 的主干 tip（或约定基线）拉出，**不要**在杂乱 WIP 上直接开干。
- 里程碑进行中禁止把无关重构混进同一分支；发现要修 harness → 另开 `fix/` / `chore/` 小 PR，或记入溯源后再排期。

### 3.2 Task 规则

每个 task 必须满足：

1. **单一目标**（例：冻结 Listing DTO；落地 PLP 路由；Home→PLP 入口）。
2. **可验收**（对照 PRD 验收表若干行，或明确「契约-only」）。
3. **同 patch 带测试**（行为变更；豁免写进交付记录）。
4. **完成后推送**：`commit` + `push`，并附交付目录（见 §4）。

不要求每个微编辑都 push；**完成一个看板 task 再 push**。

### 3.3 Agent 调度（与 e-pig-dev-loop 对齐）

| 阶段 | 调用 |
| --- | --- |
| Align | `grill-me` / `grilling`（契约不清时）；产出写入 `contracts.md` |
| Plan | 文件级 task 列表进 `TASKS.md` |
| Implement | page → `page-workflow-guide`；组件 → `component-workflow-guide`；逻辑 TDD |
| Verify | `pnpm verify`（或最小相关 `pnpm test <path>` + typecheck/lint） |
| Review | Dual-AI；高风险强制（cart/checkout/跨层） |

---

## 4. 可溯源交付物（每个 task push 必带）

根目录（按里程碑）：

```text
docs/milestones/phase-2/M2.1/
  README.md           # 看板状态、冻结决策指针
  contracts.md        # 本里程碑冻结契约（Listing/路由等）
  TASKS.md            # task 列表与状态
  tasks/
    T01-<slug>.md     # 单 task 交付记录
  retros/
    issues/           # 问题溯源卡（跨 task 发现时）
    milestone.md      # 里程碑结束后复盘（关门时写）
```

### 4.1 Task 交付记录模板（`tasks/Txx-*.md`）

```markdown
# Txx — <标题>

- Milestone: M2.1
- Status: done | blocked
- Agent: kimi | claude | cursor
- Date: YYYY-MM-DD
- Commit: <sha>
- PRD 验收映射: #1, #3 …

## Summary
做了什么、为什么。

## Tests
- Commands: …
- Result: PASS | FAIL | PARTIAL | NOT RUN
- Notes: …

## AI Test Record
（同 AGENTS.md 固定字段）

## Follow-ups
留给后续 task 的缺口（不得假装已完成）。
```

### 4.2 Push 说明

- Commit message：Conventional Commits，聚焦 **why**（例：`feat(catalog): add PLP route with sort`）。
- Push 到里程碑分支；人类可随后开/更新 PR。
- 交付记录里的 `Commit` 填 push 后的 sha。

---

## 5. 问题溯源（Regression / Drift）

后续 task 或 Review 发现「前面已经合入的行为不对」时：

1. **停扩 scope**：先开溯源卡，再决定是否热修当前分支。
2. 写 `retros/issues/ISSUE-xxx.md`：

| 字段 | 内容 |
| --- | --- |
| 现象 | 可观察错误行为 |
| 首次引入 | commit / task id |
| 根因类 | `需求` / `实现偏移` / `契约缺口` / `测试缺口` / `流程/skill` / `其他` |
| 证据 | 测试、日志、diff 指针 |
| 修复 | 代码修复 commit |
| 防再发 | 改 PRD / 改 eval / 改 skill / 改 Soft Rule / 改 harness（勾选并落地） |

3. **防再发必须落到仓库**（至少一项）：提示词/brief 模板、skill、`e-pig-dev-loop`、harness eval、或 PRD 验收行收紧。
4. 仅口头「下次注意」不算完成溯源。

---

## 6. 里程碑复盘

`M*.*` PRD 验收过关且（可选）phase-review 完成后，写 `retros/milestone.md`：

- 实际 vs PRD 偏差
- 溯源卡汇总与已落地的流程改动
- 下一里程碑应继承的契约 / 应避免的做法
- 对 `e-pig-dev-loop` / harness 的具体补丁列表（有则链到 commit）

---

## 7. Phase 2 起步约定

| 项 | 决定 |
| --- | --- |
| 首个分支 | `feat/m2.1-home-plp` |
| 首个 PRD | `docs/milestones/phase-2/M2.1-home-plp.md` |
| 实现前必冻 | 见该里程碑 `contracts.md`（Listing DTO、PLP 路由、排序/筛选取舍） |
| 不做 | 在本分支做 M2.2–M2.5 全量；把 companions 默认升 error；引入真实后端 |

顺序仍以 `docs/milestones/README.md` 为准：M2.1 → M2.2 →（设计 cookie）M2.4 → M2.3 → M2.5。
