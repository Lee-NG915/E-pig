# Joyboy AI 辅助开发资产盘点（面向 E-pig 迁移）

来源：`/Users/lidonghai/castlery/joyboy`（Nx + pnpm + Next.js 14 monorepo）
目标：`/Users/lidonghai/castlery/E-pig`（单 Next.js 16 App + pnpm + Vitest + ESLint flat config）

## 0. 目录结构与符号链接确认

- `.claude/skills/` 下 9 个条目**全部是指向 `../../.agents/skills/<name>` 的符号链接**：alert-harness、find-skills、merge-to-test、sentry-baseline-fix-automation、sentry-biz-fix-automation、sentry-cli、submit-pr、tracking-event-ops、vercel-react-best-practices。源文件只有一份，在 `.agents/skills/`。
- `.claude/commands/` 的 3 个 `.md`（alert-harness / harness-guide / merge-to-test）也是**符号链接**，直接指向对应 skill 的 SKILL.md —— 即 Claude Code 的 slash command 复用同一份文件，零重复维护。
- `vercel-react-best-practices` 真实位置是 `.agents/skills/vercel-react-best-practices/`（经 `.claude/skills` 软链可读，内容完整：SKILL.md + README.md + rules/ 58 个规则文件）。
- `submit-pr` 真实位置是 `.agents/skills/submit-pr/`（含 SKILL.md + references/pr-template.md），`.claude/skills/submit-pr` 同样是软链。
- 用户清单之外的额外发现：
  - `.agents/skills/ec-fe-clickup/`（ClickUp 团队工作流 skill）
  - `.agents/skills/sentry-baseline-fix-automation/`（biz 版的姊妹 skill）
  - `.claude/evals/`（alert-harness 的 hook 评测用例 + 运行脚本）
  - `.claude/statusline.sh`（终端状态栏，与开发流程无关）
- 双目录约定：`.agents/skills/` 是 git 跟踪的源（Cursor 自动扫描），`.claude/skills/` 是软链注册目录（Claude Code 读取）。社区 skill 经 `npx skills add` 安装并锁定在 `skills-lock.json`。


---

## A. 资产逐个盘点

### A1. `AGENTS.md`（428 行，主约定文档）

- **用途**：全仓 AI/人类通用主约定，经顶部 `@.agents/rules/...` @include 链加载两个 always-on 规则（CLAUDE.md 再 @include 它）。
- **触发**：自动（每个会话加载）。
- **内容**：详见 B 节。
- **耦合**：Nx 命令、Sentry/Datadog、Joyboy 目录结构、ClickUp 分支命名；但 AI 测试工作流章节与具体设施无关。

### A2. `.agents/rules/observability-self-check.md`

- **用途**：任何编辑命中 observability 相关路径/符号后，必须跑 lint 自检才能宣告完成。
- **触发**：自动（always-on，AGENTS.md @include）。触发路径：`libs/shared/observability/**`、`apps/web/instrumentation*.ts`、任意 `page.tsx`/`layout.tsx`、任何含 `setGlobalSentryContext`/`captureStructuredError`/`SentryContextProvider` 的文件。
- **核心流程**：先完成全部编辑（绝不中途验证）→ 循环跑 `pnpm lint:observability`：0 违规则完成；有违规且 attempt<3 则修复再来；attempt==3 输出结构化 ESCALATE 块（残留违规列表 + 3 次尝试内容 + "不得报告完成"）。
- **关键细节**：Loop invariant —— 同一修复与上一次无 diff 立即 ESCALATE（说明不是代码能修的问题）。明确排除 E2E、checkout/payment、middleware/edge。
- **耦合**：`pnpm lint:observability` 命令、Sentry 概念。**模式通用**（编辑后 bounded lint 自检循环）。

### A3. `.agents/rules/doc-freshness.md` + `.cursor/rules/doc-freshness.mdc`

- **用途**：编辑任何带 YAML frontmatter 的 md/mdx 时，同一次 Edit 内同步更新元数据。
- **触发**：自动（always-on；`.mdc` 是 Cursor 镜像，`alwaysApply: true` + globs `**/*.md(x)`，指回 canonical）。
- **规则**：`last-reviewed`/`last-modified`/`updated_at` → 今天；`version` → 内容改 patch 递增、新章节 minor 递增；`owner`/`status` 不动；编辑前先读文件头 10 行判断有无 frontmatter。
- **耦合**：无。**完全通用**。

### A4. `.agents/skills/README.md`（skill 治理文档）

- **用途**：skill 生态治理——优先复用 skills.sh 社区 skill，其次才自建内部 skill。
- **要点**：`npx skills find/add/check/update`；安装产物三件（`.agents/skills/<name>`、`.claude/skills/<name>` 软链、`skills-lock.json`）都要提交；内部 skill 应让 AI 调用 create-skill 类 skill 创建而非手搭；SKILL.md ≤500 行、详细内容外置 references/；frontmatter 的 `description` 必须同时回答"做什么+何时触发"（AI 靠它自动触发）。
- **耦合**：无。**通用，建议整套搬**。

### A5. `alert-harness`（最大件，详见 C 节）

- 用途：Sentry 观测合规的多层防护系统（IDE lint → pre-commit → Stop hook → 按需分析修复 → CI 拦截）。
- 触发：hook（PostToolUse / Stop）+ 手动 `/alert-harness` + 定时 routine。
- 耦合：Sentry MCP、`pnpm lint:observability`、`pnpm e2e:sentry-tags:server-capture`、eslint-plugin-observability、docs/ai-specs、ClickUp、`cup` CLI、gh。**骨架通用、肉身强耦合**。

### A6. `find-skills`

- **用途**：当用户问"有没有能做 X 的 skill"时，引导搜索/安装 skills.sh 生态 skill（`npx skills find/add -g -y`）。
- **触发**：自动（description 匹配）。
- **耦合**：无（社区 skill，本身也可 `npx skills add` 重装）。

### A7. `harness-guide`

- **用途**：交互式引导为一个新领域建立"8 组件治理范式"（Harness Engineering Paradigm）。
- **触发**：手动 `/harness-guide` 或关键词（harness/治理/governance/"set up linting for X"）。
- **核心流程**：Step1 扫描现状（rg/eslint/workflows/ai-specs）报告 8 组件缺口 → Phase1 最小闭环（Spec: `docs/ai-specs/{domain}/INDEX.md` + 规则定义；Static: 简单规则用 no-restricted-syntax/imports，复杂规则建 `tools/eslint-plugin-{domain}`；Gate: CI workflow + lint-staged + CODEOWNERS）→ Phase2 可持续性（CONTRIBUTING/CHANGELOG/AGENTS.md 硬规则节）→ Phase3 量化（coverage-scan.sh + baseline.json + CI PR 评论 upsert + 测试）→ Step5 14 项 checklist 打分（x/14）。
- **关键概念**：8 组件 = Spec/Static/Dynamic/Gate/Feedback/Evaluation/Knowledge/Evolution；observability 是 8/8 参考实现。还规定了**凡带 auto-fix 的 skill 必须实现 bounded remediation loop**（batch first、max 3、non-empty diff、ESCALATE 结构化退出），always-on 自检放 `.agents/rules/`。
- **反模式**：spec 多处复制、迁移中代码用 error 级规则（先 warn）、覆盖率门禁阻塞 PR（只发 informational 评论）、跳过 Phase1 直接做量化、有 fix 无 verify。
- **耦合**：例子用 Joyboy（fortress/Nx/ai-specs 路径）；**方法论本身完全通用**。

### A8. `merge-to-test`

- **用途**：把当前 feature 分支合并进一个或多个环境分支（test-sg/uk/us/au/ca、uat-sg/uk/us/au/ca），冲突时 AI 辅助解决。
- **触发**：手动 `/merge-to-test <targets>` 或"合并到测试环境"。
- **核心流程**：Step1 预检（当前分支名 + 未提交改动 → stash/commit/继续/中止四选一）→ Step2 参数归一化（`sg`→`test-sg`、`all`/`uat` 展开）+ 白名单校验 → Step3 每个目标跑 `scripts/run.sh` → Step4 退出码 2 时 AI 解冲突 → Step5 切回 feature 分支、stash pop → Step6 汇总表。
- **run.sh 契约**（bash, `set -euo pipefail`）：`git fetch origin <target>`（失败 exit 4）→ `git checkout -B <target> origin/<target>`（本地重置到远端）→ `git merge <feature> --no-edit`（冲突时列出 `git diff --name-only --diff-filter=U`，exit 2）→ `git push origin <target>`（拒绝 exit 3，**绝不 force-push**）→ 成功 exit 0 并切回 feature。
- **AI 冲突策略**：业务新代码取 incoming；测试环境配置/env/flag 取 HEAD；`pnpm-lock.yaml` 删掉重装再 add；两边都改业务逻辑→问人。
- **耦合**：Joyboy 的多区域环境分支模型。**脚本+退出码契约+冲突策略表的模式通用**。

### A9. `submit-pr`（真实位置 `.agents/skills/submit-pr/`）

- **用途**：按团队约定创建/更新 GitHub PR。
- **触发**：手动"submit PR / create PR"。
- **核心流程**：`git branch --show-current` → 正则 `CU-([a-zA-Z0-9]+)` 解析 ClickUp 任务号 → ClickUp MCP 或 `node ~/.cursor/skills/clickup/query.mjs get <id>` 查任务名和类型（tag/custom field/名称含 bug → `fix`，否则 `feat`，查不到兜底 feat）→ 标题 `{type}: [#<task_id>] {task_title}` → 按 `references/pr-template.md` 填 body（🤔 做什么 / ✔️ 怎么验证 / 💻 预览 / 🔗 related pr & ticket / 🗒️ notes / ☑️ checklist）→ `gh repo view` 拿默认分支 → `gh pr create` 或 `gh pr edit`。
- **Sentry override**（确定性激活规则：仅当有明确的 resolved issue ID 列表）：标题追加 `[fixes JOYBOY-WEB-XXXX]`，描述每行一个 `fixes XXX`，commit message 绝不放；建后校验不符立即 `gh pr edit` 纠正。
- **耦合**：ClickUp（分支命名/MCP/URL 模板）、Sentry issue 前缀。**骨架通用**（分支解析→标题约定→模板→建后格式自纠）。

### A10. `tracking-event-ops`

- **用途**：埋点事件增/改/删/改触发条件的强制执行流程。
- **触发**：自动（"add event/新增埋点/rename event/改 category"等）。
- **核心流程**：Step0 分类 ADD/MODIFY/AMBIGUOUS（先 rg 查常量是否存在，含糊则只问一个问题）。
  - ADD：A1 **触发场景必须人工确认**（列候选：DOM 事件/生命周期/store 变化/路由/IntersectionObserver；频率；去重窗口）→ A2 输出 6 文件同步清单（docs/schema/trigger/domain event/listener/UI dispatch）等"确认" → A3 按序写（schema→trigger→domain event→listener→UI→docs，每步被上一步类型检查）。
  - MODIFY：M1 rg 三连扫（常量声明/全部调用方/docs 条目）→ M2 输出 **Event Diff Report**（before/after、下游 file:line、影响面、兼容性、迁移顺序）**等人工确认才动代码** → M3 按序改，每步一行确认。
  - **Pageview 硬规则**：唯一直连例外——必须用 `usePageViewOnce` hook（组件体第一个 hook），禁止走 redux event→listener→trigger。三条理由：listener 注册时序竞态（useEffect 晚于子组件 useLayoutEffect）、hydration 延迟、pageview 无 fan-out 需求。见到旧模式（`*-page-viewed.event.ts` 等）必须停下提示。
- **耦合**：Joyboy tracking 模块全部路径、6 渠道、`@castlery/modules-tracking-components`。**流程模式通用**（变更前 Diff Report + 人工确认门 + 多文件同步清单）。

### A11. `sentry-biz-fix-automation`（含 references/ 3 文件）

- **用途**：为团队成员生成个性化"每周一 9:03 Sentry 业务错误自动修复"Claude Code Local routine 的 prompt（skill 本身只生成 prompt，不创建任何文件/定时任务）。
- **触发**：手动（"设置 sentry-biz-fix routine"）。
- **SKILL.md 流程**：`gh api user --jq .login` 拿用户名 → 交互式配置 `SENTRY_API_TOKEN` / `CLICKUP_API_TOKEN` 写入 shell env（zsh/bash/PowerShell 三分支，去重检查）→ 读 `references/prompt-template.md` 输出 + 注册指引。
- **prompt-template.md（routine 本体，11 步）**：Step0 source env → Step1 Sentry MCP 拉 `assigned:me is:unresolved` top 20（按 users_affected 降序，跨 5 个 prod 环境）→ Step1b 已处理过滤（有 ClickUp external link 或 `gh pr list --search` 有 PR → 跳过取下一个）→ Step2 分类（baseline → 转 `/alert-harness`；business-error/boundary-caught → 继续）→ Step3 硬约束路径检查（observability 基础设施永不改）→ Step4 rubric 打分（A 文件范围/B 根因清晰度/C 测试覆盖/D 域耦合，各 1-3；总分 4-5→1pt、6-7→2pt、8-9→3pt、10-12→5pt；**总分 10-12 或置信度<70% → 停止交人**）→ Step5 建分支 → Step6 **Dev sub-agent** 实现 → Step6.5 **Reviewer sub-agent** 评审（REJECTED → 带 feedback 重做一轮，再拒 → 停止交人）→ Step7 建 ClickUp 任务 + REST API 设 sprint points + 分支重命名含 `CU-<task_id>` → Step8 commit → Step9 走 submit-pr 建 PR（fixes 格式 + 建后格式校验）→ Step10 Sentry REST 回链 ClickUp → Step11 总结。
- **dev-agent-role.md**：输入 issue_id/root_cause/affected_files/constraint；最小修复；跑 `pnpm lint:observability`（最多 3 次，不过则 `status=BLOCKED`）；输出 JSON `{status: DONE|BLOCKED, changed_files, summary, blocked_reason}`；revision 时只针对 reviewer feedback 改，不rewrite无关代码。
- **reviewer-agent-role.md**：对抗性评审，默认 REJECTED；评估根因对齐（是否只压症状）、回归风险、边界用例、scope 纪律；APPROVED 要求无 CRITICAL/HIGH issue；输出 JSON `{verdict, issues[{severity, description, location}], summary}`。
- **耦合**：Sentry MCP/REST、ClickUp（list ID/字段 ID 硬编码）、Claude Code Routines、`cup` CLI、Joyboy 路径。**Dev+Reviewer 双 agent 循环与打分熔断概念通用**。

### A12. `sentry-baseline-fix-automation`（用户未点名，实际存在）

- **用途**：A11 的姊妹版——"每周一 9:06 Sentry observability baseline 自动修复"routine 生成器。
- **区别**：routine 本体是包住 alert-harness SKILL Steps 1-9 的执行 prompt：Phase1 建 ClickUp 任务+分支（分支名必须 `<gh_user>/CU-<task_id>/Auto-fix-Sentry-classification-issues-<date>`，供 PR-merged 自动化识别）→ Phase2 严格按 alert-harness 执行（优先 scripted remediation-loop）→ Phase2.5 rubric 打分 + REST 设 sprint points → Phase3 回写 ClickUp 评论并按结果置状态（PR 建成→in progress；无违规→resolved；ESCALATE→on hold）。硬性规定 source-of-truth 优先级（AGENTS.md > e2e runbook > SKILL.md）、E2E 门（required 时 SKIPPED 不允许）、工具边界（ClickUp 只用 `cup`、PR 只用 `gh`）。
- **耦合**：同上，强耦合。

### A13. `sentry-cli`

- **用途**：`sentry` CLI（v0.38.0）使用手册型 skill。
- **覆盖范围**：24 个命令域——auth / org / project / issue（含 explain/plan Seer AI）/ event / api / alert（issues+metrics 规则 CRUD）/ cli / code-mappings / dart-symbol-map / debug-files / dashboard（含 6 列网格布局规则）/ proguard / replay / release（含 set-commits --auto/--local）/ repo / team / explore / log / monitor / sourcemap / span / trace / trial / init / local（Spotlight 本地捕获）/ schema。每域对应 `references/<domain>.md` 详细 flags。
- **要点**：agent 使用原则（直接跑命令不预认证、优先 CLI 优于裸 API、`--json --fields` 省 token、org/project 自动检测）、语义退出码表（0 成功 / 10-19 auth / 20-29 输入 / 30-39 API / 40-49 功能不可用 / 50-59 操作 / 60-69 命令特定）、安全规则（破坏性命令先确认、不记录 token）。
- **耦合**：Sentry。新项目无 Sentry 则不迁。

### A14. `vercel-react-best-practices`

- **用途**：Vercel 官方 React/Next.js 性能优化规则集（社区 skill，MIT）。
- **内容**：58 条规则、8 大类按影响排序——①消除瀑布 async-（CRITICAL）②bundle-（CRITICAL）③server-（HIGH）④client-（MEDIUM-HIGH）⑤rerender-（MEDIUM）⑥rendering-（MEDIUM）⑦js-（LOW-MEDIUM）⑧advanced-（LOW）。SKILL.md 是索引，每条规则一个 `rules/<area>-<desc>.md`，含错误/正确代码示例。
- **触发**：写/评审/重构 React/Next.js 代码时自动。
- **耦合**：零 Joyboy 耦合。**直接可迁**（注意个别规则基于 Next 14 语义，迁到 Next 16 时抽查 async/server 类）。

### A15. `.claude/commands/`（3 个 .md）

- alert-harness.md / harness-guide.md / merge-to-test.md —— **全部是符号链接**，指向对应 SKILL.md。即 slash command 零成本复用 skill 定义。

### A16. `.claude/evals/`（额外发现）

- `alert-harness.md`：stop-review.sh 的 9 个评测用例（注入 bare captureException / PAGE_TYPES.SEARCH / middleware capture / 未知 BUSINESS_DOMAIN / 缺 context 的 page.tsx / 缺 Provider 的 layout.tsx / 改 skill 文件 / 干净代码通过 / 机器可读 JSON 输出）。
- `run-alert-harness-evals.sh`：评测运行器。**"给 hook 写 eval"这一实践本身值得迁**。

### A17. `.claude/statusline.sh`

- 终端状态栏（上下文用量进度条），与开发流程无关，按需自取。

---

## B. AGENTS.md 章节结构与可迁移规则

### B1. 章节结构 + 每章要点

1. **头部 @include**：`@.agents/rules/doc-freshness.md` + `@.agents/rules/observability-self-check.md`（always-on 规则外挂机制）。
2. **Overview**：技术栈一句话（Nx/pnpm/Next14/TS、双 app）+ 版本锚点（pnpm 9.15.4+ / Node 20.9.0 `.nvmrc` / Nx 20.4.5）。
3. **Commands**：分类命令表（Development 多区域变体 / Build / Quality / Sentry E2E / Storybook）+ 单测单文件跑法。
4. **AI Test And Review Workflow**（全文最通用的一章）：
   - **Default Rule**：凡影响运行时行为的 AI 改动必须同 patch 带测试；混合任务里行为变更部分仍要测试；跑不了也要写出测试并显式声明 NOT RUN 及原因；覆盖率以 changed-path 为先而非全局百分比；bug fix 默认回归测试。
   - **Test Selection By Change Type**：domain/util/slice/service → 就近单测；组件/hooks → Jest+Testing Library 断言用户可见行为与分支态；重交互/视觉状态 → Storybook interaction；跨页/checkout/payment/login 关键旅程 → Playwright；bug fix 先写回归测试再实现。
   - **`.spec.tsx` 何时允许**：被测物渲染 JSX 才用 `.tsx`（组件、hooks、条件渲染、交互、prop 驱动态）；纯逻辑（util/selector/reducer/service/transform）用 `.ts`；机械性改动不新建 `.spec.tsx`。
   - **AI Delivery Record**：固定输出 `AI Test Record`（Behavior changed / Tests added / Tests run / Result: PASS|FAIL|PARTIAL|NOT RUN / Failures or gaps / Next risk）；双人评审追加 `AI Review Record`（Review focus / Findings / Residual risks）。
   - **Single-AI Default Flow 6 步**：动手前列行为变更与测试层级 → 测试与实现同步写（不做尾期清理）→ 首个可运行版本立刻跑最小测试范围 → 失败立即报告并继续修 → 收尾前重跑相关测试（大范围影响跑 quality:affected）→ 最终回复附 Test Record。
   - **Test Discovery 顺序**：先看同目录已有 spec → 抄同库兄弟测试的 mock/渲染/断言风格 → 定位 Nx project → 测试就近放 → 改 bug 先写公开行为的回归断言。
   - **What Makes A Useful Test**：断言用户/调用方/selector/API 边界可观察的行为；覆盖变更分支 + 一个稳定既有行为；mock 只放在系统边界（网络/路由/浏览器 API/Redux dispatch/timer/第三方 SDK）；只断言"mock 被调用"不算数（除非 mock 调用本身就是契约）；禁止纯快照测试。
   - **When Tests Are Not Required**：纯格式化/注释/死码删除/类型-only/无运行时影响的 barrel 调整/纯文档——但要在 Record 里说明。
   - **Dual-AI Enhanced Flow**：Test AI（补边界用例、挑战弱断言与过度 mock）+ Review AI（正确性/回归/架构契合/测试是否真保护行为）。
   - **When To Use Dual AI**：checkout/payment/login/cart/跨页流、多文件跨层重构、复现不明的 bug、异步/重试/缓存/第三方集成、第一个 AI 无法自信解释覆盖率时。
   - **Review Gate**：无测试且无显式豁免说明的行为变更 patch 不算完成；bug fix 无回归测试必须解释；Dual AI 场景两个 Record 齐备才算完。
5. **Project Structure**：apps/ + libs/（fortress 设计系统、modules 域模块 components/domain/services 三层、shared、config）+ 14 个域清单。
6. **Architecture**：分层图（Component→Service→Domain→Foundation，层内 shared/regular/composite 横向规则）、13 行依赖矩阵（type:* 标签）、scope 跨域规则、`@nx/enforce-module-boundaries` = error、ESLint overrides（no-console off、unused-vars warn 且 `_` 前缀豁免、no-non-null-assertion off）。
7. **Code Conventions**：PascalCase 组件 + kebab-case 文件名；`.server.tsx`/`.client.tsx` 后缀；域文件后缀 `.entity/.slice/.api/.helper/.listener.ts`；测试 `.spec.ts(x)`；import 顺序（React/Next → 外部库 → `@castlery/*`（fortress→modules→shared）→ 相对路径）；Prettier（单引号/分号/es5 trailing comma/2 空格/120 列）；状态选型（RTK+RTK Query / SWR / react-hook-form+Zod）。
8. **Observability**：Sentry（error_bucket 分类、trace 0.1%）+ Datadog RUM；ai-specs 为权威源；**11 条 Hard Rules 表**（middleware/edge 禁 Sentry capture、page.tsx 必须 setGlobalSentryContext、layout 用 Provider、async layout 例外、Server Action 双路径、禁裸 captureException、DY domain 可选、PAGE_TYPES.SEARCH 已删除、checkout/payment/cart 冻结、禁新 per-domain alert 规则、error-bucket.ts 是第三方域名单唯一源）——每条标注"已定稿架构决策，不要再提替代方案"。
9. **Sentry Auto-Resolve**：`fixes ISSUE-ID` 只上 PR 标题+描述、不进 commit；标题方括号后缀格式；关键词统一 `fixes`；只在真正根因修复时加（降噪不加）；声明本节为该规则唯一权威源。
10. **Multi-Region Configuration**：`.env.development.{us,sg,au,ca,uk}`。
11. **Key Path Aliases**：`@castlery/<module>` 约 80 个别名。
12. **Tracking Module Rules**：单向事件流（UI → domain event → listener → trigger → 渠道）；反模式（UI 直接 import trigger、手搓 `_event` payload、listener 里回读 store）；Co-location（事件与 UI 同模块、payload 自带全部参数）；Three-File Sync（docs/schema/trigger+listener 同 PR）；**Diff Report**（改/删事件必须先在 PR 描述贴报告并**等人工确认**）；**Trigger Scenario 人工确认**（不得从旧代码/截图推断）；指向 tracking-event-ops skill。
13. **Multi-Market Deployment**：跨市场改动需考虑每市场行为。

### B2. 可迁移的通用规则（逐条）

**强烈建议迁移（与 Joyboy 设施无关）：**

1. AI 行为变更必须同 patch 带测试；跑不了也要写并声明 NOT RUN。
2. 覆盖率看 changed-path 优先，不看全局百分比。
3. bug fix 默认先写回归测试。
4. `.spec.tsx` 仅用于渲染 JSX 的被测物；纯逻辑用 `.spec.ts`。
5. AI Test Record / AI Review Record 固定输出模板。
6. 测试与实现同步写，不做尾期清理；首个可运行版本立刻跑最小测试范围。
7. 有用测试的标准（可观察行为、边界 mock、禁纯快照、禁"只断言 mock 被调用"）。
8. Dual-AI（Test AI + Review AI）用于中高风险任务的触发条件清单。
9. Review Gate：无测试/无豁免说明不算完成。
10. 测试不需要的场景白名单（格式化/注释/类型-only 等）+ 需显式说明。
11. 命名约定：kebab-case 文件 + PascalCase 组件、`.server/.client` 后缀、`.spec.ts(x)`。
12. import 顺序约定 + Prettier 具体配置（单引号/分号/trailing comma/120 列）。
13. `@include` 外挂 always-on 规则文件的机制（主文档保持精简，规则独立演化）。
14. "Hard Rules 表"写法：已定稿决策显式标注"不要再提替代方案"，防止 AI 反复重开已关闭的决策。
15. 文档元数据纪律（doc-freshness 规则本体）。
16. 变更直播数据/事件前必须出 Diff Report 并等人工确认（适用于任何"对外有下游消费者"的契约变更）。
17. 触发条件不得从旧代码推断、必须人工确认（适用于埋点、告警阈值等语义性决策）。

**需改造后迁移（概念通用、绑定需替换）：**

18. 架构分层与依赖方向规则 → 去掉 Nx 标签体系，单 app 可用 ESLint `no-restricted-imports` + 目录约定表达"components → services → domain → utils"方向。
19. Sentry Auto-Resolve 规则 → 若新项目用别的错误平台，保留"修复关联只上 PR 不上 commit + 建后格式自纠"的骨架。
20. 多区域/多市场注意事项 → 单 app 若有多 locale 可保留提醒句式。

---

## C. alert-harness 深挖

### C0. 文件组成

```
.agents/skills/alert-harness/
├── SKILL.md            # 439 行，命令/流程的权威源（version 2.10.5）
├── README.md           # 架构总览（分层 + 周边设施清单），明确"SKILL.md 为权威，README 只是运营视图"
├── CHANGELOG.md        # 行为变更日志
├── references/
│   ├── checks.md             # 违规→修复映射表、Route→File 查找、报告输出格式、JSON 契约
│   ├── fetch-decision-tree.md# Step 2c 渐进式 Sentry 取数决策树
│   ├── e2e-layer-b-params.md # Layer B 定向 E2E 参数矩阵与能力边界
│   ├── escalate-template.md  # ESCALATE 输出模板 + 3 条 loop invariant + JSON schema
│   └── manual-only-scenarios.md # 禁止自动修的 4 类场景
├── scripts/
│   ├── post-edit-check.sh    # Claude Code PostToolUse hook：单文件编辑实时提醒
│   ├── stop-review.sh        # Claude Code Stop hook：会话结束 git diff 扫描（wrapper）
│   ├── remediation-loop.mjs  # remediation 循环的"单次执行校验器"（循环由调用方驱动）
│   ├── diff-issues.mjs       # Sentry issue 增量门控（NEW/CHANGED/UNCHANGED）
│   ├── check-doc-sync.mjs    # SKILL.md 与 README.md 的漂移锚点校验
│   └── log-metric.mjs        # 追加一条运行指标到 metrics.jsonl
├── assets/
│   ├── .gitattributes        # issue-snapshots.json 和 metrics.jsonl 用 merge=union
│   ├── issue-snapshots.json  # 增量快照状态（git tracked，供跨机定时任务共享）
│   └── metrics.jsonl         # 每跑一次追加一行指标
└── logs/                     # review-YYYYMMDD.log、review-summary-latest.json、
                              # observability-diff-summary.json、remediation-<run-id>.json
```

配套的项目级设施（不在 skill 目录内）：`scripts/lint/observability-diff-check.sh`（核心 diff 检查逻辑，`pnpm lint:observability` 也指向它）、`tools/eslint-plugin-observability/`（8 条 ESLint 规则）、`.github/workflows/observability-lint.yaml`（PR CI 门）、`apps/web-e2e/src/sentry/`（envelope 拦截 E2E）、`scripts/e2e/sentry/*`（本地 mock ingest + runner）。

### C1. 五层防护架构

| 层 | 触发点 | 设施 | 失败语义 |
|---|---|---|---|
| 1 IDE 实时 | 文件保存 | eslint-plugin-observability 8 条 AST 规则 | 编辑器红线；critical 页面/路径升级为 error，checkout/payment/cart 全部 warn |
| 2 Pre-commit | git commit | lint-staged 跑 ESLint | 阻断提交 |
| 3 Stop hook | 会话结束 | stop-review.sh → observability-diff-check.sh | exit 1 = 有 error 级违规 |
| 4 按需 | /alert-harness | Sentry MCP 分析 + 自动修复 | 默认 analyze-only，fix/PR 需显式 |
| 5 CI 门 | PR | observability-lint.yaml | exit 1 阻塞 merge（配 branch protection required check）|

### C2. Post-edit 校验完整链路

**触发点 A —— PostToolUse hook（`post-edit-check.sh`，每次 Edit/Write/MultiEdit 后）：**

1. stdin 收 Claude Code 的 hook JSON，用 python3 提取 `tool_input.file_path`（兼容 `file_path`/`path` 两种字段）；取不到 → `exit 0` 静默。
2. **守卫 1（spec 自保护）**：路径命中 `\.agents/skills/(alert-harness|harness-guide)/` 或 `docs/ai-specs/observability/` → 打印"[WARN] SKILL FILE MODIFIED"横幅（提示这是全组规则定义文件，确认有意修改/同步更新 CLAUDE.md/团队评审，误改则 revert）→ `exit 0`（**只警告不阻断**）。
3. **守卫 2（相关性过滤）**：路径不匹配关键词正则 `(sentry|observability|monitoring|alert|error-bucket|captureStructured|logger|domains|page-types|priorities|BUSINESS_DOMAIN|PAGE_TYPES|withServerAction)`（大小写不敏感）→ `exit 0`。
4. 命中 → 打印 `[WARN] [Alert Harness]` + 按关键词分组列出该去看的 spec 指针（sentry/capture→sentry-practices.md；logger/skipSentry→logger.md；alert/error-bucket/domains→alert-metrics.md）→ 提示"对照 spec 检查改动，立即修违规" → `exit 0`。
5. **注意：post-edit hook 本身从不跑 lint、从不阻断**（全部 exit 0）。真正的 lint 由 always-on 规则 `observability-self-check.md` 约束 AI 在"全部编辑完成后"执行（避免中途打断批量编辑）。

**触发点 B —— Stop hook（`stop-review.sh`，会话结束）：**

1. 先扫 `git diff HEAD` + `--cached` 的全部变更文件，命中 skill/spec 路径 → 打印 SKILL/SPEC FILES CHANGED 警告并记日志。
2. 调用项目级 `scripts/lint/observability-diff-check.sh`：
   - 收集变更的 `.ts/.tsx` 文件（`git diff --name-only HEAD` ∪ `--cached` 去重；`--staged-only` 则只看 staged）。无文件 → `[OK] No TypeScript files changed.` exit 0。
   - 对这批文件跑 `npx eslint --format unix`，grep 出 `observability/` 规则的行。
   - **Fallback**：若 ESLint 没给出结构化结果且输出里没有"0 problems/no problems"（即 ESLint 可能崩了）→ 对 `apps/web/` 文件用 rg 扫 3 个高危签名：裸 `Sentry\.captureException`、middleware.ts/*.edge.ts 里的 `captureStructuredError|withServerActionInstrumentation|Sentry\.captureException`、`PAGE_TYPES\.SEARCH`。命中即按 `[ERR][grep-fallback]` 计入。
   - ESLint 非零退出且 fallback 也无结果 → "cannot safely determine observability compliance"，写 summary JSON（status=error + root_cause + safe_retry），**exit 1**。
   - 分级统计：结果里数 ` error |/[ERR]` 和 ` warning |/[WARN]`。errors>0 → exit 1；仅 warnings → exit 0；干净 → exit 0。
   - 每次运行都写 `logs/observability-diff-summary.json`：`{status, summary, next_actions[], artifacts[], fallback_triggered, fallback_confidence(high/low), root_cause, safe_retry, generated_at}`。
3. wrapper 追加：写 `logs/review-YYYYMMDD.log`；失败时打印 root cause hint、safe retry（`pnpm lint:observability`）、下一步升级命令（`/alert-harness sentry`）、stop condition（同一失败 3 次→人工）；用内联 node 脚本写 `logs/review-summary-latest.json`（含 output 前 80 行摘要）；透传 exit code。

**失败分级语义汇总**：`[ERR]` 必须立即修、无需确认；`[WARN]` 先解释并问是否有意；hook 的 exit 1 只由 error 级违规（或"无法判定"）触发；warn 不阻断。ESLint 规则本身的 severity 由 `apps/web/.eslintrc.json` 按路径 override（critical 页面/布局 error，blocked 路径 warn）。

### C3. `/alert-harness` 主流程（Steps 1-9）与 remediation loop 收敛

**子命令模式契约**（高影响动作必须显式）：

| 模式 | 编辑文件 | 跑验证 | 建/更新 PR |
|---|---|---|---|
| analyze-only（默认）| 否 | 否 | 否 |
| fix | 是 | 是 | 否 |
| verify-only | 否 | 是 | 否 |
| pr-only | 否 | 否 | 是 |
| fix --with-pr | 是 | 是 | 是 |

**主流程**：
1. **Step 1 加载 spec 基线**：4 个 ai-specs 文档 + `error-bucket.ts` 实现。
2. **Step 2 取 issue**：2a 解析 org/project；2b 单查询 `is:unresolved !error_bucket:third_party`、sort=users、limit=5；2c 渐进式取数（决策树：error_bucket 已可见→停；culprit 是路由→补取 domain/page_type；分类存疑→`search_issue_events(limit=1)` 看栈帧；仍不明→`analyze_issue_with_seer`；**硬规则：永不给每个 issue 拉全部 4 个 tag**）；2d diff-issues 增量门（可选加速）；2e **强制**已处理过滤（issue 有 ClickUp external link，或 `gh pr list --search "{ISSUE_ID}" --state all` 有 PR → 打 `⏭ ... skipping` 日志跳过；取第一个通过两项检查的候选；全部已处理 → 输出"无可处理 issue"停止）。
3. **Step 3 分类推断**：用 spec 分类逻辑+`error-bucket.ts` 代码，以 title/message/stack 推断应有 bucket，与实际 `error_bucket` tag 对比；不符 → 按 checks.md 的 Violation→Fix 映射定位文件与修法。
4. **Step 4/5**：对照 11 条互斥分层 alert 规则矩阵（只落 Sev-4 且高频 = 缺 context 注入）、dashboard widget 归因检查。
5. **Step 6 自动修**：`[ERR]` 直接 Edit 不用问；`[WARN]` 先解释问是否有意；根因→修复路径映射（THIRD_PARTY_PATTERNS 补域名/正则调整/status 提取修复/路由补 Provider 或 setGlobalSentryContext/mechanism 修复）；**禁修** checkout/payment、middleware/edge。
6. **Step 7 验证**：7a `pnpm lint:observability` 必须 0 违规；7b E2E 决策门（改动影响 tag 输出的 5 类修复 → 必须跑 Layer A+B，`SKIPPED` 不允许；全是结构性小改且满足 4 条件——改动小且结构性/相关单测存在/本轮单测跑过且通过/无 tag 逻辑变更——才可跳过，且必须在 Step 9 报告里给出证据）。Layer A = 4 核心页回归；Layer B = 用 `generate-fix-test.mjs` 为受影响路由生成定向测试、跑完删除；url 取 issue 的 `transaction` tag 去掉 region 前缀，生成的测试运行时读 `REGION_PREFIX`（默认 `/sg`），可配 `fallbackUrl` 应对本地无此页面（404 自动重试）。
7. **Step 8 commit+PR**：分支名强制 `<gh_user>/CU-<task_id>/Auto-fix-Sentry-classification-issues-<date>`（供 PR-merged 自动化识别）；`fixes` 只上 PR 标题（方括号后缀）+描述（每行一个）；8c 建后强制格式校验，错了立即 `gh pr edit`；8d 每个被 fixes 的 issue 建 ClickUp 任务（`cup` CLI 优先）+ Sentry REST external-issues 回链（`SENTRY_API_TOKEN` 未设则**静默跳过**，只在报告里写一行提示）。无文件改动 → "No changes — skipping PR"。
8. **Step 9 报告**：人读格式（checks.md § Report Output Format）+ 机器可读 JSON（`status/summary/next_actions/artifacts` 必含，`mode/fallback_triggered/fallback_confidence/generated_at` 可选）。

**Remediation loop（Steps 6+7 的收敛协议）：**

- **Batch 原则**：每轮迭代内先应用全部修复，再统一验证一次；严禁 fix→verify 交错。
- 循环：`attempt=1..MAX_ATTEMPTS(=3)`：全量修 → lint 一次 → 不过且 attempt<3 继续，attempt==3 → ESCALATE → 过 E2E 决策门（需跑则跑一次，失败同样计数）→ 全绿 break。
- **3 条 loop invariant**（escalate-template.md）：
  1. **Empty diff**：某轮修复没产生代码改动 → 立即 ESCALATE（根因不是代码可修的，多半配置/工具问题）。
  2. **No regression**：lint 之前过过、之后又挂 → ESCALATE（修新问题不许把已通过的检查弄挂）。
  3. **Retry accounting**：只有 transient 失败（超时/网络）消耗重试次数；**hard-rule 违反、blocked 路径、同一 lint 输出连续出现两次 → 直接 ESCALATE 不烧次数**。连续两轮 diff 完全相同也立即 ESCALATE。
- **ESCALATE 输出**：固定模板（残留违规 `file:line — rule — message` 列表、E2E 失败 `page — expected tag=value, got actual`、3 次尝试各改了什么、"需要人工调查，**不得往 PR 加 fixes ISSUE-ID**"）+ 机器可读 JSON（`status:error, escalate:true, escalate_reason, attempt, max_attempts, violations_remaining[], e2e_failures[], changed_files[], next_actions, artifacts`）。
- **Manual-only 场景**（references/manual-only-scenarios.md，不许自动修）：仅生产态可复现的症状（需 Replay 人工调查）、跨团队边界（checkout/payment/cart、middleware capture）、非确定性环境失败（3 次相同失败后 ESCALATE）、破坏性/策略敏感操作（force push、批量越界改动 → 需人工批准）。

**`remediation-loop.mjs` 的精确语义（脚本化收敛器）：**

- 定位：**单次执行校验器**。调用方（agent）持有循环状态，每轮修完重新调用本脚本并传回状态 flags；脚本只验证不改代码。
- 必填：`--run-id <uuid>`、`--mode`、`--e2e-required true|false`。状态：`--attempt`（默认 1）、`--max-attempts`（默认 3）、`--previous-diff-hash`、`--previous-lint-output`、`--previous-e2e-output`、`--lint-passed-before`。E2E 跳过证据（required=false 时必填三件套，缺一直接 escalate `missing-e2e-skip-evidence`）：`--e2e-skip-reason`、`--e2e-unit-test-command`、`--e2e-unit-test-result`。
- 执行顺序与判定：
  1. `git diff --name-only HEAD` 取变更文件、`git diff HEAD | sha256sum` 算 diff hash、`git diff --quiet HEAD` 判空 diff → 空则 ESCALATE(`empty-diff`)。
  2. 与 `--previous-diff-hash` 相同 → ESCALATE(`same-diff-consecutive-attempts`)。
  3. 跑 `pnpm lint:observability`（maxBuffer 1MB）。失败时按序判定：
     - `--lint-passed-before` 已设 → ESCALATE(`no-regression-lint-reverted`)；
     - 压缩输出（去 ANSI、取前 30 个非空行）与 `--previous-lint-output` 相同 → ESCALATE(`same-lint-output-twice`)；
     - 命中 hard-rule 正则 `(hard-rule|hard rule|blocked path|must not|forbidden|do not add|integration blocked)` → ESCALATE(`hard-rule-or-blocked-path`)；
     - attempt>=max → ESCALATE（transient 与否只影响 reason 字符串：`transient-lint-failure-at-max-attempts` vs `lint-still-failing-after-max-attempts`）；
     - 否则 retryable（transient 正则 `(timeout|timed out|econnreset|eai_again|enotfound|network error|socket hang up|temporar)` 只改变 reason），返回 retry record（`escalate:false` + `current_lint_compact_output` + `current_diff_hash` 供下一轮传回）。
  4. lint 过且 `--e2e-required=true` → 跑 `pnpm e2e:sentry-tags:server-capture`（超时 600s，maxBuffer 10MB）。失败判定同上结构：`same-e2e-output-twice` ESCALATE、max attempts ESCALATE、否则 retryable（返回 `current_e2e_compact_output`）。E2E 失败解析正则：`expected <tag>=<value>, got <actual>` 或 `expected X got Y`。
  5. lint 违规解析：`<file>.<ext>:<line>)?: <msg>` → `{file, line, rule:'lint_violation', message}`。
  6. 全绿 → success record（含 `lint_attempts`、`duration_seconds`、E2E 跳过证据回显）。
- 退出码：**0 = 全绿可进 commit/PR；1 = 失败**（看 JSON `escalate` 字段：true 停止，false 修复后带 increment 的 `--attempt` 重调）。
- 每次调用都 append 一行 JSON 到 `logs/remediation-<run-id>.json`；崩溃兜底也输出 `escalate:true, escalate_reason:'runtime_crash'`。
- 注意：`git diff HEAD | sha256sum` 在 macOS 无 sha256sum（应 `shasum -a 256`）——迁移时顺手修的可移植性 bug。

### C4. `check-doc-sync.mjs` 校验逻辑

- 目的：防 SKILL.md 与 README.md 之间文档漂移（只锚定两处高频漂移点：子命令矩阵、Sentry 取数策略）。
- 机制：**硬编码锚点片段的存在性校验**（非语义 diff）：
  - SKILL.md 必须含 4 个命令行：`/alert-harness`、`/alert-harness sentry`、`/alert-harness dashboard`、`/alert-harness diff`（正则 `^\s*<cmd>\s+`，多行模式）+ 2 个 fetch 策略片段：`Single entry point. No pre-filtering by tag`、`query="is:unresolved !error_bucket:third_party"`（substring includes）。
  - README.md 必须含：`SKILL.md § Sub-commands`、`single-query baseline`。
- 输出：缺失 → exit 1 + JSON `{status:error, root_cause, safe_retry, mismatches:[{file, missing[]}]}`；全过 → exit 0。`--json` 控制机器/人读输出。
- 本质：把"两份文档对同一事实的表述"收敛为可 grep 的字符串锚点，谁改漏了就红。

### C5. `diff-issues.mjs` 校验逻辑

- 目的：在昂贵的分析/修复循环之前，跳过字段无变化的 issue（省 API/省 token）。
- 输入：`--input <issues.json>`（数组或 `{issues:[...]}` 或 `{data:[...]}`）；`--state`（默认 `assets/issue-snapshots.json`）、`--output`、`--ttl-days 14`、`--max-issues`、`--process-activity-changes`、`--force`、`--json`。
- Normalize：每个 issue 提取 `issueId`（依次试 issueId/shortId/id/issue.id/...）、`title`、`culprit`、`transaction`、`level`、`lastSeen`(ISO)、`events`、`users`、`errorBucketTop`（多种字段名兜底）。
- 双快照 + sha1 稳定哈希（key 排序后 JSON stringify）：
  - `stableSnapshot = {title, culprit, transaction, level, errorBucketTop}` —— 字段级语义变化。
  - `activitySnapshot = {lastSeen, events, users}` —— 活跃度变化。
- 分类：无历史记录 → `NEW`；stableHash 不同 → `CHANGED`；相同 → `UNCHANGED`；UNCHANGED 但 activityHash 不同 → 另计 `ACTIVITY_ONLY`。
- 处理决策：`shouldProcess = --force || status !== 'UNCHANGED' || (--process-activity-changes && activityChanged)`。输出 `processIssueIds` / `skippedIssueIds` + 六类计数。
- 状态写回：UNCHANGED 且未开 activity 处理 → **不重写该行**（保持 repo diff 最小）；TTL 剪枝：不在本次 seen 集合且 `updatedAt` 早于 cutoff 的记录删除；最终按 key 排序写回 state 文件。
- 错误输出也带 `root_cause / safe_retry / stop_condition("3 次相同失败 → ESCALATE")`。
- 定位边界（README/SKILL 反复强调）：它只能检测字段变化，**检测不了 issue 是否已关联 ClickUp/PR**——Step 2e 的实时过滤才是权威去重门，2d 只是可选加速层。

### C6. metric 记录（`log-metric.mjs` + `assets/metrics.jsonl`）

- 每次 `/alert-harness` 运行结束追加一行：`{run_id, timestamp, mode, issuesAnalyzed, fixesApplied, lintAttempts, e2eRequired, e2ePassed, escalated, prCreated, durationSeconds, errorMessage?}`（CLI flag 自动 kebab→camelCase）。
- 消费方式：收敛分析——若 `lintAttempts` 均值 >2，说明 Violation→Fix 映射或 Step 3 推断逻辑需要修；escalation 率、E2E 通过率同理。
- `assets/` 两个状态文件 git tracked + `.gitattributes merge=union`，跑完若变化需单独 commit（`chore(alert-harness): refresh issue snapshots cache`），供跨机定时任务共享增量状态。

### C7. 迁移时需要知道的隐式依赖

- hook 机制是 Claude Code 特有（PostToolUse stdin JSON、Stop hook）；其他 agent 工具需等价接线。
- `pnpm lint:observability` = `scripts/lint/observability-diff-check.sh`；`pnpm e2e:sentry-tags:server-capture` 依赖生产构建 + 本地 mock ingest（:8123）+ API 代理（:8010）+ standalone app（:3000）。
- 所有脚本遵循统一 JSON 输出契约 `{status, summary, next_actions, artifacts, ...}`——这是跨脚本/跨 agent 互操作的关键设计。

---

## D. 迁移建议（按优先级）

### D0. 判断标准

新项目没有 Nx、Sentry、Vercel、Storybook、ClickUp（假定）、多区域环境分支。凡是把 80% 篇幅花在描述这些设施用法上的资产，迁移收益为负；凡是"流程协议/循环收敛/输出契约/防漂移"类的资产，与设施无关，值得改造迁移。

### P0 —— 直接可用，几乎零改造

1. **`vercel-react-best-practices`**：纯社区 skill，零 Joyboy 耦合，58 条 React/Next 性能规则对 Next.js 16 直接有效。也可选择 `npx skills add vercel-labs/agent-skills@vercel-react-best-practices` 重装而非拷贝（便于后续 `npx skills update`）。抽查 `server-after-nonblocking`、`server-cache-react` 等规则在 Next 16 的语义时效。
2. **AGENTS.md 的 "AI Test And Review Workflow" 整章**：把 Jest/`pnpm nx test` 替换为 Vitest 命令即可整体搬运。包含：行为变更必带测试、`.spec.tsx` 使用边界、AI Test/Review Record 模板、Single/Dual-AI 流程、Review Gate、"有用的测试"标准。这是全套资产里单位迁移成本收益最高的部分。
3. **`doc-freshness` 规则**（`.agents/rules/doc-freshness.md` canonical + `.cursor/rules/doc-freshness.mdc` 镜像）：零耦合，直接拷。
4. **`.agents/skills/README.md` 治理文档 + 双目录软链结构**：skill 生态约定（skills.sh 优先、源文件+软链、skills-lock.json、SKILL.md ≤500 行、description 写法规范）完全通用。

### P1 —— 概念通用，值得改造迁移（改命令/路径绑定）

5. **alert-harness 的"骨架"**（不要它的 Sentry 肉身）：
   - `remediation-loop.mjs`：把 `pnpm lint:observability` / `pnpm e2e:sentry-tags:server-capture` 两个硬编码命令抽成 CLI flag 或 env（如 `--lint-cmd`、`--e2e-cmd`），即成通用的"修复-验证收敛器"。三 invariant（empty-diff/no-regression/retry accounting）、transient 正则、ESCALATE JSON schema 全部原样保留。顺手修 `sha256sum` 的 macOS 可移植性问题。
   - `observability-diff-check.sh` 的"git diff 变更文件 → eslint 定向检查 → grep 高危签名 fallback → 机器可读 summary JSON"模式：换成新项目的 ESLint flat config 与高危签名（例如禁 `console.log`、禁裸 `fetch` 未封装等），即成通用 pre-commit/stop 检查。
   - `post-edit-check.sh` 的 hook 骨架：stdin JSON 解析 → spec 自保护守卫 → 关键词相关性过滤 → 分组打印 spec 指针。改造成新项目的"编辑后即时提醒"hook。
   - 统一 JSON 输出契约 `{status, summary, next_actions, artifacts}`：所有自写脚本遵循它，agent 之间才可互操作。
   - `log-metric.mjs` + metrics.jsonl：任何自动修复类流程都值得记指标（lintAttempts 均值>2 即修复映射有问题）。
6. **`harness-guide` 的 8 组件范式**：作为方法论 skill 迁移，把例子从 observability 换成新项目要治理的第一个领域（如"数据访问层"或"i18n"）。Phase1（Spec+Static+Gate 最小闭环）→ Phase2（Knowledge+Evolution）→ Phase3（量化）的推进顺序和 14 项 checklist 直接可用；"凡 auto-fix 必须有 bounded remediation loop"的元规则尤其值得保留。
7. **`submit-pr` 骨架**：去掉 ClickUp/Sentry，保留"分支名解析元数据 → 标题约定 → PR body 模板 → `gh pr create/edit` → 建后格式校验错了立即 `gh pr edit` 自纠"流程。PR 模板六段（做什么/怎么验证/预览/关联/notes/checklist）可直接用。
8. **`check-doc-sync.mjs` 的锚点校验模式**：新项目里凡有"同一事实写在两处"的文档（如 AGENTS.md 与 README、SKILL.md 与 references），都可用这种硬编码 substring 锚点脚本防漂移。
9. **`.claude/evals/` 的"给 hook 写评测"实践**：hook 是静默运行的代码，没有 eval 就会悄悄烂掉。为新项目的关键 hook 各写 5-10 个注入式用例。

### P2 —— 视新项目情况可选

10. **`merge-to-test` 的 run.sh 契约模式**：确定性的 git 操作脚本 + 语义化退出码（0/1/2/3/4）+ AI 只处理退出码 2 的分工方式，是"AI×脚本协作"的好范式。但只有新项目引入环境分支模型（如 staging/release 分支流）时才需要整个 skill。
11. **`tracking-event-ops` 的流程概念**：Diff Report + 人工确认门 + 多文件同步清单 + "触发场景不得从旧代码推断"。新项目若将来建埋点/事件体系再迁；现在迁没有落点。
12. **`find-skills`**：社区 skill，`npx skills add` 重装即可，不用拷。
13. **AGENTS.md 的分层架构约定**：单 app 不需要 Nx 标签矩阵，但"components → services → domain → utils 单向依赖"可用 ESLint flat config 的 `no-restricted-imports` 表达，值得在 E-pig 的 AGENTS.md 里写一节精简版。

### 不迁 —— 与 Joyboy 设施强耦合

14. **`alert-harness` 的业务肉身**：Steps 1-9 的 Sentry 分析流程、error_bucket 分类、11 条 alert 规则矩阵、Sentry E2E envelope 捕获、Sentry auto-resolve、ClickUp 回链——没有 Sentry 就没有存在意义。
15. **`observability-self-check.md`**：绑死 `pnpm lint:observability` 与 Sentry 概念；其"编辑后 bounded 自检循环"的模式已由 P1-5 覆盖。
16. **`sentry-biz-fix-automation` / `sentry-baseline-fix-automation`**：Sentry + ClickUp + Claude Code Routines + Joyboy 路径四位一体。仅"Dev sub-agent 实现 + Reviewer sub-agent 对抗评审 + rubric 打分熔断（总分≥10 或置信度<70% 交人）"的编排概念值得记住，将来做自动修复流程时可参照，不必迁文件。
17. **`sentry-cli`**：新项目无 Sentry；将来若接入可从社区重装。
18. **`ec-fe-clickup`**：团队 ClickUp 空间/List/字段/成员 ID 全部硬编码，纯 Joyboy 团队资产。
19. **`tracking-event-ops` 的具体路径与规则**、AGENTS.md 的 Observability/Tracking/Multi-Region/Architecture 具体章节：路径与设施专属。
20. **Sentry E2E 相关命令与脚本**（`e2e:sentry-tags:*`、`generate-fix-test.mjs`、`mock-ingest.mjs`、本地代理）：整套围绕 Sentry envelope 捕获。

### 迁移落地清单（建议执行顺序）

1. 拷 `vercel-react-best-practices`（或 npx 重装）→ 零改动。
2. 写 E-pig 的 `AGENTS.md`：Overview/Commands（Vitest）+ 改造版 AI Test And Review Workflow + 命名/import/格式约定 + 精简依赖方向规则。
3. 建 `.agents/rules/doc-freshness.md` + `.cursor/rules/doc-freshness.mdc`。
4. 建 `.agents/skills/` + `.claude/skills/` 双目录约定 + README 治理文档。
5. 改造通用 remediation-loop.mjs（命令参数化）+ 统一 JSON 契约，作为后续所有自动修复流程的基座。
6. 按 harness-guide 范式为 E-pig 选第一个治理领域建最小闭环（Spec + ESLint 规则 + lint-staged/CI 门）。
7. 改造 submit-pr 骨架（去 ClickUp/Sentry）。
8. 给关键 hook 写 eval 用例。
