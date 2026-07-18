---
name: phase-review
description: >
  MANUAL TRIGGER ONLY. Generates a milestone completion report under
  docs/phase-reviews/: evidence-checked implementation status against the
  roadmap (or milestone PRD) acceptance criteria, unimplemented gaps, measured
  quality gates, multi-dimensional comparison against the reference system,
  phase reference-core coverage, and a rubric-based score. Use ONLY when the
  user explicitly asks — e.g. "跑 phase review", "里程碑评审", "review phase 1",
  "生成阶段评审报告", "重评 phase 1". NEVER trigger automatically after finishing
  development work. Milestone timing is decided by the user, not by you.
---

# Phase Review — 里程碑评审报告生成器

为 E-pig 生成一份**有证据、可复算**的 Phase / 子里程碑完成评审，落盘到 `docs/phase-reviews/`。

## 产品目标对齐（评分哲学）

E-pig 的阶段目标是：**参考参考工程，分阶段复现其核心设计、基础架构与关键功能**（轻量化实现，不复制 Nx/MUI/企业级成本）。

因此本 skill 的分数必须同时回答两件事：

1. **本阶段承诺是否兑现**（验收标准 + 质量门 + Hard Rules）
2. **本阶段该复现的参考工程核心是否覆盖**（能力清单 E 项）

**禁止**把「比参考工程更简单」直接当成「胜」并抬高总分——有意减法只有写进 ADR / 研究文档 / 代码注释时才算合规取舍，且通常记「平」或能力清单 ⏸，而不是用 D 项刷分。

## 触发纪律（最高优先级，不可违反）

1. **只在用户显式要求时运行**。完成开发、测试全绿、自认为到了里程碑——都不是触发理由。
2. 用户要求评审但没指明 Phase / 子里程碑时，**先问清楚**（如 Phase 1，或 M2.4）。
3. 一次评审只评一个 Phase 或一个子里程碑（`docs/milestones/phase-*/M*.md`）。用户说「全部评一遍」时才逐个重复。

## 评审原则

- **无证据不打 ✅**。每条验收标准必须有可验证证据：文件路径、测试名、命令真实输出、必要时浏览器/Story 渲染结果。
- **命令必须真跑**。质量门来自本次评审实际执行，不引用历史结果。
- **UI 声称必须可渲染**。凡验收或能力清单声称「Storybook / 页面 / 组件可用」，`build-storybook` 或 `next build` 通过不够；至少抽 1 个关键 surface 做**运行时渲染证据**（dev server HTTP 200 + 关键 DOM，或 Storybook preview 无 error overlay）。做不到则该条最多 🟡。
- **对比必须诚实**。暴露差距是价值；全胜是红旗。
- **分数可复算**。按 §5 rubric 写出算式。

## 流程

### 1. 确认范围

- 确认评审对象：`Phase N` 或 `M2.x` 等子里程碑。
- 验收来源优先级：
  1. 若存在 `docs/milestones/...` 对应 PRD → 用其验收清单
  2. 否则用 `docs/codex/research/06-roadmap-and-open-questions.md` §1 该 Phase
- 拆成**原子可核对条目**；验收门槛条目权重 ×2。
- 读取 `references/phase-capability-checklists.md` 中本阶段能力行，作为 E 项输入。
- 记录基线：`git log --oneline -1` + `git status --short`。

### 2. 逐条取证（验收 A）

对每个原子条目：Glob/Read/Grep + 必要的运行时验证；✅ / 🟡 / ❌。  
疑似回归先查注释 / commit / docs，有意决策不判 ❌。

### 3. 跑质量门（B）

门集合 = 当前 `package.json` scripts + `.github/workflows/` 质量相关命令，**再加上下列条件门**：

| 条件 | 额外门 |
| --- | --- |
| 存在 `packages/*/package.json` 且含 `build-storybook` | 必须跑对应 `build-storybook` |
| 本阶段验收/能力清单声称 Storybook 可用 | 必须做 **Storybook 运行时抽检**（启动或已启动的 preview：打开 1 个基础 story，确认无 `TypeError`/error overlay；记录 URL 与结果） |
| 本阶段验收含多市场页面 | 保持/增加 `smoke:runtime-market` 或等价 |

规则：

- FAIL → 记 0，写详情；可修复后复跑但必须注明「首次失败 → 修复 → 复跑」。
- 环境缺二进制时用等价方式；否则 NOT RUN，该门 0 分。
- **环境未能验证 ≠ 半套实现**：验收条目可因「脚手架在、环境未跑」标 🟡，但 **不得**在 B 项对未执行的门给分。

### 4. 未实现清单

汇总 ❌ / 🟡；标注归属后续 Phase / milestone / deferred；列出易被误认进本阶段的后续事项。

### 5. 评分（rubric，总分 100）

| 项 | 分值 | 算法 |
| --- | --- | --- |
| A. 验收标准实现度 | 40 | Σ(权重 × 状态系数) ÷ Σ权重 × 40。✅=1、🟡=0.5、❌=0；门槛条目权重 ×2 |
| B. 质量门 | 20 | 20 ÷ 门数；PASS 得分，FAIL / NOT RUN = 0 |
| C. 架构决策符合度 | 15 | 对照 `AGENTS.md` Hard Rules + `docs/codex/research/04`、`07`、`08`；每个无说明的违反 −3，最低 0 |
| D. 阶段取舍合理性 | 10 | 按 `references/comparison-dimensions.md` 打胜/平/负；得分 = `5 + 1 × (胜 − 负)`，clamp `[0,10]`。**胜的口径见维度文档（已修订）** |
| E. 阶段参考核心覆盖 | 15 | 对本阶段能力清单：✅=1、⏸=0.5、🟡=0.5、❌=0；Σ ÷ 条数 × 15 |

等级：≥90 优秀 / 75–89 良好 / 60–74 合格 / <60 不合格。

**分数护栏（防止虚高）：**

1. 若存在任一「声称 UI 可用但运行时抽检失败」→ 总分封顶 **74（合格）**，并在报告醒目标注。
2. 若 D 项胜维度 ≥ 8 且负维度 = 0 → 视为取证不合格，重做对比（禁止交卷）。
3. 同 Phase 重评须在 README 评分历史追加一行，保留旧分。

### 6. 与参考工程对比（D 的输入）

按 `references/comparison-dimensions.md` 逐维给出：参考工程现状 / E-pig 现状 / 胜·平·负 + 理由。

### 7. 阶段参考核心覆盖表（E 的输入）

按 `references/phase-capability-checklists.md` 输出能力覆盖表（ID、状态、证据、缺口）。

### 8. 写报告与索引

- 结构遵循 `references/report-template.md`。
- 路径：`docs/phase-reviews/phase-<N>-<slug>.md`；子里程碑可用 `phase-<N>-M<x>-<slug>.md`。
- 同对象重评：就地更新 + 改 `更新日期`；历史分写入 `docs/phase-reviews/README.md`。

### 9. 交付摘要

最终回复：得分与等级、A–E 各项、Top 3 优势、Top 3 缺口、是否触发分数护栏、报告路径。

## 反模式

- ❌ 没有跑命令就写「质量门全绿」。
- ❌ 把「文件存在」当「功能实现」。
- ❌ `build-storybook` / `next build` 成功就宣称 Storybook/页面可用。
- ❌ 对比维度全判胜，或用「我们更轻」刷 D 分。
- ❌ 报告出现参考工程原名（统一称「参考工程」）。
- ❌ 评完顺手 commit 或自动开下一阶段开发。

## References

- `references/report-template.md`
- `references/comparison-dimensions.md`
- `references/phase-capability-checklists.md`
- 子里程碑 PRD：`docs/milestones/`
