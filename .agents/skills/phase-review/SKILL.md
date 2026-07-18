---
name: phase-review
description: >
  MANUAL TRIGGER ONLY. Generates a milestone completion report under
  docs/phase-reviews/ : evidence-checked implementation status against the
  roadmap acceptance criteria, unimplemented gaps, measured quality gates,
  a multi-dimensional comparison against the reference system (参考工程),
  and a rubric-based score. Use ONLY when the user explicitly asks — e.g.
  "跑 phase review", "里程碑评审", "review phase 1", "生成阶段评审报告".
  NEVER trigger automatically after finishing development work, even when a
  phase appears complete. Milestone timing is decided by the user, not by you.
---

# Phase Review — 里程碑评审报告生成器

为 E-pig 生成一份**有证据、可复算**的 Phase 完成评审，落盘到 `docs/phase-reviews/`。

## 触发纪律（最高优先级，不可违反）

1. **只在用户显式要求时运行**。完成开发任务、测试全绿、自认为到了里程碑——都不是触发理由。
2. 用户要求评审但没指明 Phase 时，**先问清楚评审哪个 Phase**，不要猜。
3. 一次评审只评一个 Phase。用户说"全部评一遍"时才逐 Phase 重复本流程。

## 评审原则

- **无证据不打 ✅**。每条验收标准必须有可验证证据：文件路径、测试名、命令真实输出。读不到的代码、没跑的命令，只能给 🟡 或 ❌。
- **命令必须真跑**。质量门结果来自本次评审中的实际执行，不引用历史结果、不推测。
- **对比必须诚实**。与参考工程对比时，E-pig 落后的维度如实判负；评审的价值在于暴露差距，不是庆祝。
- **分数可复算**。按 §5 的 rubric 打分，每项写出计算过程，别人能独立重算。

## 流程

### 1. 确认范围

- 向用户确认评审的 Phase 编号。
- 读 `docs/codex/research/06-roadmap-and-open-questions.md` §1 找到该 Phase 的范围条目与"验收"行。
- 把验收标准拆成**原子可核对条目**（一条只验证一件事）。范围 bullets 是输入，验收行是门槛；两者都要覆盖。
- 记录评审基线：`git log --oneline -1` + `git status --short`。有未提交改动时，在报告"代码基线"行写明评审覆盖到哪些未提交文件。

### 2. 逐条取证

对每个原子条目：

- 用 Glob/Read/Grep 确认代码或配置真实存在且实现了条目要求的行为（不是只存在同名文件）。
- 需要运行时证据的（如 dev server 行为、standalone 产物），用 Bash 实际验证。
- 标注：✅ 已实现（附证据）/ 🟡 部分实现（说明缺哪部分）/ ❌ 未实现。
- **疑似回归先查决策**：发现与既有预期不符的行为（如某属性值变了），先查代码注释、近期 commit 与 docs，确认是否为有意决策；是有记录/注释的决策则不判 ❌，在报告中注明该决策及出处。

### 3. 跑质量门

**门集合以项目当前声明为准，不用固定清单**：先读 `package.json` scripts 与 `.github/workflows/`，列出全部质量类命令（typecheck / lint / test / build / docs:check / smoke:* / 子包测试等），逐一实际执行并记录结果。

- 任何一门失败：报告必须写 FAIL 详情，评分对应项记 0；不得先修复再假装首跑通过（修复后重跑可以，但要在报告里注明"首次失败 → 修复 → 复跑通过"）。
- **环境差异 ≠ 项目失败**：脚本存在但环境缺二进制（如 pnpm 不在 PATH）时，用等价方式验证（如 `npx pnpm@<packageManager 版本>` …），结果记 PASS 并在备注写明环境差异；无等价方式时记 NOT RUN 及原因，对应项不得分。

### 4. 未实现清单

- 汇总 ❌ / 🟡 条目，写明原因与归属（后续哪个 Phase / 明确 deferred / 超范围）。
- 检查有没有**被误以为属于本 Phase** 的后续 Phase 事项，显式列出以避免误解。

### 5. 评分（rubric，总分 100）

| 项 | 分值 | 算法 |
| --- | --- | --- |
| A. 验收标准实现度 | 50 | Σ(条目权重 × 状态系数) ÷ Σ权重 × 50。状态系数：✅=1、🟡=0.5、❌=0。默认等权重；验收行的条目权重 ×2（它是门槛） |
| B. 质量门 | 20 | 按 §3 确定的项目当前门集合，20 ÷ 门数每门计分；PASS 得分，FAIL / NOT RUN 记 0 |
| C. 架构决策符合度 | 15 | 对照 `AGENTS.md` Hard Rules 与 `docs/codex/research/04`、`07` 的已定稿决策逐项检查；每个无 ADR 说明的违反 −3，最低 0 |
| D. 对比净优势 | 15 | 7.5 + 1.5 × (胜维度数 − 负维度数)，clamp 到 [0, 15]。平记 0。维度目录见 `references/comparison-dimensions.md` |

等级：≥90 优秀 / 75–89 良好 / 60–74 合格 / <60 不合格。报告中写出每项的算式。

### 6. 与参考工程对比

按 `references/comparison-dimensions.md` 的维度目录逐维对比。每个维度给出：

- 参考工程现状（事实来源：`docs/codex/research/01`、`02`、`03`，引用要点即可，不复制大段原文）
- E-pig 现状（本次取证的实际情况）
- 判定：胜 / 平 / 负 + 一句理由（"胜"指在该维度上对 E-pig 当前阶段更有利，不是绝对技术优劣）

### 7. 写报告与索引

- 用 `references/report-template.md` 的结构写 `docs/phase-reviews/phase-<N>-<slug>.md`；文件头含 `更新日期：YYYY-MM-DD`（doc-freshness 规则）。
- 同 Phase 重评：就地更新同一文件，不新建。
- 更新 `docs/phase-reviews/README.md` 的评分历史表（同一 Phase 多行，保留历史）。

### 8. 交付摘要

最终回复包含：得分与等级、A–D 各项得分、Top 3 优势、Top 3 缺口、报告路径。

## 反模式

- ❌ 没有跑命令就写"质量门全绿"。
- ❌ 把"文件存在"当"功能实现"（如 env.ts 存在 ≠ env 校验行为正确）。
- ❌ 对比维度全判胜——这是红旗，说明取证不认真；真实评审必有负维度。
- ❌ 报告里出现参考工程的原名（用户已定名为"参考工程"，全仓统一术语）。
- ❌ 完成后顺手把报告 commit 或触发下一轮开发——评审到此为止，下一步由用户决定。

## References

- `references/report-template.md` — 报告固定结构，生成时严格遵循。
- `references/comparison-dimensions.md` — 与参考工程对比的维度目录与判定指引。
