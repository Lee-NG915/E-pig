---
name: harness-guide
description: >
  Guide developers through the 8-component Harness Engineering Paradigm for
  setting up governance in a new codebase domain. Use when: creating governance
  for import boundaries, env/secret hygiene, cache rules, market config, or
  test coverage; understanding an existing harness as reference; or auditing
  whether a domain's governance is complete. Triggers on: "harness",
  "governance", "治理", "工程范式", "set up linting for X", "add compliance
  for X", "harness guide".
---

# Harness Engineering Guide — 8 组件治理范式

Harness 是一个多层防护系统，在某个代码领域（domain）上强制架构正确性，覆盖每个阶段：编码 → 提交 → PR → 合并后。

---

## 8 个组件

| #   | 组件         | 回答的问题                     | E-pig 示例（import 边界领域）                                                        |
| --- | ------------ | ------------------------------ | ----------------------------------------------------------------------------------- |
| 1   | **Spec**     | 什么样算正确？                 | `AGENTS.md` § Architecture + Hard Rules 表（依赖方向与禁止项的唯一事实源）          |
| 2   | **Static**   | 写代码时机器能抓到吗？         | `eslint.config.mjs` 的 `no-restricted-imports`（modules 禁 import adapters/integrations） |
| 3   | **Dynamic**  | 测试能在运行时验证吗？         | market registry 纯函数单测、adapter contract 测试（`*.spec.ts` co-located）          |
| 4   | **Gate**     | 合并前能拦住违规吗？           | `pnpm quality:diff`（diff-check.sh）+ Stop hook（stop-review.sh）+ 未来 CI workflow |
| 5   | **Feedback** | 对的人能收到通知吗？           | ESLint IDE 红线 + PostToolUse hook（post-edit-check.sh）实时提醒                     |
| 6   | **Evaluation** | 合规程度可量化吗？           | logs/quality-diff-summary.json 状态记录 + check-doc-sync.mjs 锚点校验               |
| 7   | **Knowledge** | 新人能维护这套东西吗？        | AGENTS.md + CLAUDE.md（@include 链）+ .agents/rules/ + 本 skill                     |
| 8   | **Evolution** | 规则怎么安全演进？            | Hard Rules 标注"已定稿决策不要重开"；改规则必须同步 AGENTS.md + ESLint + hook       |

---

## 交互式流程

当用户要求为领域 X 建治理时，按以下步骤走：

### Step 1 — 评估现状

先问："要治理哪个领域？"（如 import-boundary、env-hygiene、cache-rules、market-config、test-coverage）

然后扫描代码库：

```bash
grep -ri "{domain}" AGENTS.md eslint.config.mjs
ls scripts/quality/ 2>/dev/null
ls .agents/rules/ 2>/dev/null
ls .github/workflows/ 2>/dev/null
```

报告 8 组件中哪些已存在、哪些缺失（用 Step 5 的 checklist）。

### Step 2 — Phase 1：最小闭环（Spec + Static + Gate）

这三个组件构成最小可用 harness——足以**挡住新违规**。先做闭环，再谈量化。

**Spec**：在 AGENTS.md 写清规则（或新建 `.agents/rules/<domain>.md`，经 @include 加载）。同一事实只写一处，其他地方用指针。

**Static**：

- 规则简单（禁模式、禁 import）：用 ESLint flat config 的 `no-restricted-syntax` / `no-restricted-imports`。
- 规则需要 AST 分析：再考虑自建 eslint-plugin。
- 迁移中的代码先用 `warn`，稳定后再升 `error`。

**Gate**：

- 接入 `scripts/quality/diff-check.sh` 的高危签名 fallback（rg/grep 文本扫描）。
- 需要提交门禁时再装 git hooks（simple-git-hooks / Husky，可选）。
- CI workflow 在首个可运行版本后建立，不预装。

### Step 3 — Phase 2：可持续（Knowledge + Evolution）

让 harness 能被别人维护：

- AGENTS.md 增加该领域的 Hard Rules 条目（标注"已定稿决策，不要重开"）。
- 改规则的协议：改 spec 必须同步改 static 规则 + hook 关键词 + 相关文档（doc-freshness 规则管元数据）。
- check-doc-sync.mjs 加锚点：把"同一事实写在两处"的表述收敛成可 grep 的字符串锚点。

### Step 4 — Phase 3：量化（Dynamic + Evaluation + Feedback）

产出数字给管理用（**不能跳过 Phase 1 直接做这步**）：

- 覆盖率/违规数扫描脚本 → 输出机器可读 JSON（遵循 `{status, summary, next_actions, artifacts}` 契约）。
- 评测用例 → `.claude/evals/`（hook 是静默运行的代码，没有 eval 会悄悄烂掉）。
- 单测覆盖规则本身的边界（如 market registry 纯函数、cache tag builder）。

### Step 5 — 完整性校验

对照 8 组件逐项报告状态，打分 {count}/8，指出最优先补的缺口。

---

## 候选治理领域（E-pig）

| 领域              | 现有基础                                                            | 缺口                                   | 建议   |
| ----------------- | ------------------------------------------------------------------- | -------------------------------------- | ------ |
| Import 边界       | ESLint no-restricted-imports（Static ✅）+ diff-check fallback（Gate 雏形 ✅） | Spec 在 AGENTS.md 已写、缺量化         | **推荐第一个** |
| Env / secret 卫生 | env schema（@t3-oss/env-nextjs）+ diff-check 两条 fallback 签名      | 缺完整 Static 规则与量化                | 推荐   |
| 缓存规则          | Hard Rules 已定稿（Spec ✅）                                         | Static（AST 检测 'use cache' 误用）缺失 | 中期   |
| Market 配置       | typed market registry 约定（Spec ✅）                                | 纯函数单测（Dynamic）随实现补齐         | 中期   |
| 测试覆盖          | Vitest 已配                                                          | Gate（changed-path 门槛）与量化         | 低优先 |

---

## AI Remediation Loop（凡带 auto-fix 的 skill 必须实现）

任何包含自动代码修复能力的 skill，**必须**实现 bounded remediation loop。参考实现：`scripts/quality/remediation-loop.mjs` + `.agents/rules/quality-self-check.md`。

必备元素：

- **Batch first**：一轮迭代内先应用全部修复，再统一验证一次；严禁 fix→verify 交错。
- **Bounded**：最多 3 轮；每轮必须产生非空 diff。
- **Verify gate**：typecheck → lint → test 按序执行。
- **三条 invariant**：empty-diff → 立即 ESCALATE；之前全绿的检查被改挂 → 立即 ESCALATE；同一失败输出连续两次 → 立即 ESCALATE。
- **ESCALATE 结构化退出**：达到上限后输出固定格式的失败报告（残留失败 file:line 列表 + 各轮改动 + "不得报告完成"），绝不静默宣称成功。

Always-on 的通用编辑后自检放在 `.agents/rules/`，经 AGENTS.md @include 加载（CLAUDE.md 通过 @AGENTS.md 委托）。

---

## 反模式

- 不要把 spec 内容复制到多个文件——单一事实源 + 指针。
- 不要给迁移中的代码配 error 级规则——先 warn。
- 不要加阻塞 PR 的覆盖率门禁——用 informational 输出。
- 不要跳过 Phase 1 直接做量化——先有规则才谈得上度量合规。
- 不要在 skill 里实现 auto-fix 却不配 remediation loop——有 fix 无 verify 是不完整的。
