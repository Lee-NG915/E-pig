# E-pig 项目最佳实践审查报告

更新日期：2026-07-19

## 结论摘要

**总体判断：当前实现适合作为 Phase 1 的轻量电商基线，运行时架构质量较高，但治理系统尚未达到其文档所宣称的“可信完成门”。**

| 领域 | 评价 | 结论 |
| --- | ---: | --- |
| 运行时架构 | 8.5/10 | ports/adapters、市场隔离、RSC 边界、secret 管理基本正确 |
| 测试与构建 | 7.5/10 | 当前测试和构建全绿，但根完成门漏跑包级测试 |
| Harness 治理 | 6/10 | 8 个组件均有雏形，但 Static、Gate、Evaluation 未真正闭环 |
| workflow / skills | 5.5/10 | 调度理念正确，但实际 Claude skill 副本与权威版本发生漂移 |
| Phase 1 交付状态 | 可接受 | 没有发现 P0 运行时缺陷 |
| 生产上线状态 | 尚不适用 | 真实 commerce、server cart、checkout/payment 本来就属于后续阶段 |

因此，**不建议重构应用架构，也不建议引入更多工具**。下一步应优先修复现有治理的可执行性，而不是增加新的规范。

---

## 一、与项目背景和初始规范的符合度

当前实现正确保留了初期设计中的核心取舍：

- 单个 Next.js 16 App，而非 Nx/Turborepo 企业级编排。
- `app → modules → core contracts`，adapter 实现 port，integration 只承担可降级副作用。
- Server Components 优先，客户端边界主要集中在 cart、Radix Sheet 和浏览器持久化。
- `process.env` 集中在 `src/platform/config/env.ts`，没有发现 `NEXT_PUBLIC_*` secret。
- typed market registry 已覆盖 AU、SG、US，运行时 SG market smoke 通过。
- 当前没有启用生产共享缓存，价格和购物车没有错误进入 Cache Components。
- 没有 `middleware.ts`/`proxy.ts` 在 GET 请求中创建 cart。
- mock catalog DTO 被限制在 adapter 内，未泄漏到 module。
- 当前浏览器 cart 与未来 Server Cart 的阶段边界总体清楚。

这些实现符合：

- `AGENTS.md` 的 Hard Rules。
- `docs/codex/research/04-e-pig-target-architecture.md` 的轻量架构方向。
- `docs/codex/research/07-next16-cache-cart-routing-decisions.md` 的缓存、cart 和市场决策。
- `PRODUCT.md` 当前 mock catalog + localStorage cart 的产品阶段。
- `DESIGN.md` 与 happy-dog token 的设计真源。

**重要判断：**未实现 Server Cart、checkout、payment、真实 adapter、host→market 和生产缓存，不应当视为缺陷；它们是明确延期的 Phase 2–4 工作。

---

## 二、已确认的主要问题

## P0——治理完成门实际失效

### 1. Stop hook 在质量错误时 fail-open

`.claude/settings.json:14-20` 注册了 Stop hook，最终由：

- `scripts/quality/stop-review.sh:31-33` 捕获 `diff-check` 状态；
- `scripts/quality/stop-review.sh:82` 原样执行 `exit "$EXIT_CODE"`。

`diff-check.sh` 发现错误时通常返回 `1`。Claude Code Stop hook 的阻断协议要求返回 `exit 2`，或输出 `{"decision":"block","reason":"..."}`。普通 `exit 1` 表示 hook 出错，并不等价于阻止 Claude 停止。

因此，现在的 Stop hook 能生成日志和错误信息，但不能可靠阻止 AI 宣告完成。这直接违背了项目对“完成门”和 AI 自检的定位，是本次审查中优先级最高的问题。

参考：[Claude Code Hooks 文档](https://docs.anthropic.com/en/docs/claude-code/hooks)

---

## P1——应在 Phase 2 开始前修复

### 2. 权威 skill 与 Claude 实际加载副本发生漂移

项目约定 `.agents/skills` 是唯一真源，并通过 `e-pig-dev-loop` 统一调度。但当前 `.claude/skills` 有 17 个实体目录，并非统一软链；其中确认有 5 个 skill 内容不一致：

- `brainstorming`
- `ponytail`
- `subagent-driven-development`
- `test-driven-development`
- `using-superpowers`

最明显的例子：

- `.agents/skills/ponytail/SKILL.md:18,23-44` 禁止模型自动调用，规定 opt-in、默认 lite；
- `.claude/skills/ponytail/SKILL.md:26-30` 仍写着 `ACTIVE EVERY RESPONSE`、默认 full。

这使 `.agents/skills/e-pig-dev-loop/CONFLICTS.md:7-12` 的冲突裁决在实际 Claude Code 中可能完全没有生效。

### 3. `doctor` 对上述漂移给出假健康结果

`scripts/e-pig-doctor.mjs:75-85` 只验证 `.claude/skills` 路径能否 `stat`，不检查：

- 是否为指向 canonical source 的软链；
- 链接目标是否正确；
- skill 内容/hash 是否一致；
- frontmatter 和 `disable-model-invocation` 是否存在；
- `.claude` 是否完整注册所有预期 skill。

所以在 5 个 skill 已漂移的情况下，`node scripts/e-pig-doctor.mjs --json` 仍返回：

```json
{"status":"ok","errors":[],"warnings":[]}
```

此外，文档推荐的 `pnpm doctor` 与 pnpm 自带命令冲突：实测 `pnpm doctor` 无输出并返回 0，却没有执行项目脚本；只有 `pnpm run doctor` 才真正运行 `scripts/e-pig-doctor.mjs`。对应脚本定义在 `package.json:26`。

### 4. import boundary 可被相对路径和供应商 import 绕过

当前 ESLint 规则只限制 alias：

- module：`eslint.config.mjs:74-87`
- shared：`eslint.config.mjs:91-104`
- happy-dog：`eslint.config.mjs:107-120`

例如只匹配：

```text
@/adapters/*
@/integrations/*
@/platform/*
```

没有限制：

- `../../adapters/...`
- `../../integrations/...`
- shared 相对导入 module；
- module 直接导入 `stripe`、CMS SDK、PostHog 等供应商包。

`diff-check.sh:124-129` 的 fallback 同样只扫描 `@/adapters` 和 `@/integrations`。

本次通过 ESLint stdin 探针验证：包含相对 adapter import 和 `stripe` import 的 module 文件没有触发 lint 错误。这意味着项目最重要的 ports/adapters Hard Rule 目前仍可机械绕过。

### 5. `diff-check` 在 ESLint 失败时可能误报成功

`scripts/quality/diff-check.sh:150-165` 只有在 `ESLINT_EXIT != 0` 且 `RESULT` 为空时，才判定无法安全检查。

如果 ESLint 崩溃，同时已有一个非阻断 warning——例如 `src/app/_components` 放置警告——`RESULT` 就不为空，脚本会绕过失败分支。随后 `scripts/quality/diff-check.sh:191-239` 会把 warning-only 结果作为成功退出。

因此存在以下场景：

1. ESLint 执行失败；
2. fallback 产生一条 warning；
3. `quality:diff` 返回 0；
4. Stop hook 又无法阻断。

这两层 fail-open 会叠加。

### 6. “完成门”在本地、AI 和 CI 中定义不一致

`package.json:25` 的 `pnpm verify` 只运行：

- `docs:check`
- `typecheck`
- `lint`
- root Vitest

但它没有运行：

- `happy-dog:test`
- `test:harness-evals`
- companions
- production build
- runtime market smoke
- Storybook builds
- doctor

CI 在 `.github/workflows/ci.yml:31-55` 又额外运行 harness eval、companions、build 和 smoke，但仍未运行：

- `happy-dog:test`
- 两个 Storybook build
- doctor

根 Vitest 配置 `vitest.config.ts:13-16` 只包含 `src/**/*.spec.*`，因此 happy-dog 的 2 个测试文件、4 个测试不会进入 `pnpm verify` 或 CI。

不要求日常本地 `verify` 执行所有重型构建是合理的；问题在于它被描述为统一“完成门”，而实际上存在三个不同口径。

建议明确拆分：

- 快速开发门：typecheck + lint + changed tests；
- 项目完成门：docs + root tests + package tests + harness；
- CI 发布门：上述全部 + build + runtime smoke，按变更范围追加 Storybook build。

### 7. companion 规则仍有真实债务且是非阻断的

实测：

```text
[companions] WARN — 3 component(s) missing companions
```

缺少行为测试的基础组件：

- `packages/happy-dog/src/components/badge.tsx`
- `packages/happy-dog/src/components/button.tsx`
- `packages/happy-dog/src/components/sheet.tsx`

当前 warn-only 策略符合项目渐进治理阶段，但还不能宣称组件 Harness 已闭环。

另外，changed-file 检查主要围绕实现文件：

- 单独删除 spec 而不修改组件，可能不被检查；
- 只验证 companion 存在，不验证 spec/story 是否有效；
- content 组件未完整进入 module allowlist；
- 行为改变但旧 companion 内容未更新，无法机械识别。

这不是要求立刻构建复杂“文档语义检测器”；合理路径是先补 3 个基础组件测试，再对新改组件逐步升为 error。

### 8. 初始决策文档的状态管理已经过期

`docs/codex/research/README.md:40-42` 仍声明所有决策都是 `proposal`，建议 review 后再开始脚手架实现；但：

- AGENTS 已将 04/07 定义为已定稿 Hard Rules；
- Phase 1 已完成；
- 多市场、Docker、happy-dog 和 Storybook 已实现。

`docs/codex/research/06-roadmap-and-open-questions.md:89-113` 仍把首发市场、页面、部署方式和设计系统列为待确认问题。

组件治理文档也存在状态冲突：

- `docs/engineering/component-folder-contract-rollout.md:37-44` 仍称业务 Storybook 入口和 Stop companions 尚未实现；
- 实际 storybook-host 已聚合业务 stories；
- `quality:diff` 已调用 companions；
- `docs/engineering/component-workflow-guide.md:124-135` 已描述当前规则。

这里的问题不是“日期旧一天”，而是 proposal、accepted、deferred 和 implemented 没有形成一致状态链。

---

## P2——可随 Phase 2 按需处理

### 9. 非默认主题无法完整作用于 portaled Sheet

`packages/happy-dog/src/theme/theme-provider.tsx:15-23` 将主题变量挂在包装 div 上，而 Radix Portal 在 `packages/happy-dog/src/components/sheet.tsx:21-32` 默认挂到 `document.body`。Portal 会离开 ThemeProvider 的 CSS 变量作用域。

当前生产只使用默认主题，所以不是 Phase 1 阻断；但 Storybook 切换 dark theme 后，Sheet 可能仍使用根节点浅色 token。补 Sheet 行为测试时应一并覆盖该场景。

### 10. `getActiveMarket` 的未来扩展承诺与 registry 不一致

- `src/platform/config/active-market.ts:7-13` 声称未来 host 解析只需修改该入口；
- `src/platform/registry.ts:35-39` 仍直接读取 `env.MARKET`。

未来接入 host→market 时，如果只修改 `getActiveMarket()`，registry 仍可能保留进程级 market，导致 UI market 与 catalog currency 不一致。

当前单市场进程模式没有运行时问题，但应在 Phase 2 host routing 设计中明确统一调用链。

### 11. 首页 route 比“只做编排”略厚

`src/app/page.tsx:35-52` 仍持有标题、市场 badge、grid 和商品迭代展示。Phase 1 规模下可以接受，不值得现在重构；等 PLP/PDP 或空状态、错误态出现后，再将 catalog 展示收进 owning domain。

### 12. Demo 内容不满足生产资产要求

当前主要图片来自 Unsplash，footer 使用 `href="#"`，库存、Bestseller、delivery、120-night trial 等是静态演示内容。

这符合当前 demo 定位，但在进入真实产品阶段前需要：

- 本地/CDN 资产策略；
- 实际政策和导航目标；
- inventory/marketing claims 的真实数据来源；
- CSP 和上游图片故障处理。

---

## 三、Harness 8 组件评估

**覆盖面：8/8 都有雏形；有效成熟度：约 6/8。**

| 组件 | 状态 | 评价 |
| --- | --- | --- |
| Spec | 良好 | AGENTS Hard Rules 和 thin router 清晰 |
| Static | 部分 | env 规则较好；import 和 cache 规则可绕过或未机械化 |
| Dynamic | 部分 | market/cart/helper 测试较好；app wiring、package、治理脚本覆盖不足 |
| Gate | 较弱 | CI 存在，但 Stop fail-open、companions warn、完成门口径不一致 |
| Feedback | 部分 | PostToolUse 与 Stop 有输出；负向阻断反馈不可靠 |
| Evaluation | 较弱 | harness eval 只有 2 个 PostToolUse 用例 |
| Knowledge | 良好但漂移 | 文档丰富，但 proposal/implemented 与组件 rollout 状态不一致 |
| Evolution | 部分 | 有 doc-freshness/remediation 规则，但 skill canonical source 未真正保证 |

分领域看：

- **Import 边界：** Spec 强，Static/Gate 部分，缺规则回归测试。
- **Env/secret：** 当前最成熟；ESLint + fallback + env schema 已形成基本闭环。
- **Cache：** Spec 很强，但 AST/运行时 enforcement 尚未落地。
- **Market：** registry 和 smoke 良好，但 smoke 目前主要验证 SG。
- **组件契约：** Spec/Knowledge 完整，Gate 仍 warn，存在 3 个已知债。
- **AI Test/Review workflow：**提示词契约很强，但没有可靠机械完成门。

---

## 四、workflow / skills 的最佳实践判断

`e-pig-dev-loop` 的阶段路由本身是合理的：

- 不默认跑满全流程；
- 高风险路径才启用 Dual-AI；
- UI 才调用 impeccable；
- phase-review 保持手动；
- 项目规则优先于社区 skill。

真正的问题不是设计方向，而是**安装和执行模型过重且发生副本漂移**。

建议精简为：

1. **Orient**：AGENTS + 一条主 e-pig rule；跨关注点任务允许再加载一条。
2. **Align**：需求不清时直接调用 `grilling`，无需 `grill-me` 双跳。
3. **Implement**：统一一套默认 `tdd`；高风险差异由 Dual-AI 规则承担。
4. **Design QA**：仅 UI 任务调用 impeccable。
5. **Verify**：一个明确的本地完成门；组件改动追加 companions。
6. **Review**：统一一个代码评审入口，高风险只增加一次独立 review。
7. **Registration**：`.agents/skills` 唯一真源，`.claude/skills` 全部使用可验证软链。

不建议现在：

- 再安装更多社区 skills；
- 自动串联全部 brainstorming → planning → TDD → review；
- 为 AI Test Record 建复杂自然语言解析器；
- 把所有 Storybook build 塞进每次本地快速验证；
- 删除 Phase 2 即将使用的 cache/SEO/market scaffolding；
- 引入覆盖率百分比阻断门。

---

## 五、建议修复顺序

### 第一批：立即修复治理可信度

1. 按 Claude Code 协议修复 Stop hook 阻断语义，并增加失败负向 eval。
2. 消除 `.claude/skills` 实体副本，统一为 canonical 软链。
3. 扩展 doctor：检查预期集合、链接目标、内容/hash 和关键 frontmatter。
4. 将文档命令改为 `pnpm run doctor`，或把 script 改成不与 pnpm 内置命令冲突的名字。

### 第二批：Phase 2 开始前

5. 封堵相对路径边界和 module 供应商 SDK import，并给 lint 规则添加 fixture/eval。
6. 修复 `diff-check` 的 ESLint fail-open 分支。
7. 统一 `verify`、AI 完成门和 CI 的职责；至少纳入 happy-dog tests。
8. 补 Badge、Button、Sheet 的行为测试，再考虑 scoped companions error。
9. 将 04/07 和实际采纳的关键决策标记为 accepted；清理 roadmap/rollout 过期状态。

### 第三批：随实际功能推进

10. 接入真实缓存时再增加 cache AST/static enforcement。
11. 接入 host routing 时统一 active market 与 registry。
12. 增加 dark theme + portal 测试。
13. 扩展 runtime market smoke 到 AU 构建→SG/US 运行及价格/货币断言。
14. PLP/PDP 出现后再收薄首页 route，不提前抽象。

---

## 六、实际验证记录

已执行：

| 命令 | 结果 |
| --- | --- |
| `pnpm verify` | PASS：21 个测试文件，99 个测试 |
| `pnpm happy-dog:test` | PASS：2 个测试文件，4 个测试 |
| `pnpm build` | PASS |
| `pnpm build-storybook` | PASS；仅 bundle size warning |
| `pnpm build-storybook:modules` | PASS；仅 bundle size warning |
| `pnpm smoke:runtime-market` | PASS |
| `pnpm test:harness-evals` | PASS：2/2 |
| `pnpm quality:companions -- --report-all` | WARN：3 个 happy-dog 组件缺 spec |
| `node scripts/e-pig-doctor.mjs --json` | PASS，但属于假健康 |
| 边界 ESLint 探针 | 未拦截相对 adapter/vendor import |
| Docker deps 等价安装 | PASS |
| 完整 Docker build | NOT RUN：Docker daemon 未启动 |
| `git status --short` | clean（报告落盘前） |

关于 Docker：静态审查曾怀疑缺少 `pnpm-workspace.yaml` 会导致 deps 阶段失败，但使用只包含 Docker deps 阶段文件的临时目录复现后，`pnpm install --frozen-lockfile` 成功。因此该怀疑没有保留为正式 finding；完整镜像构建仍因本机 Docker daemon 未运行而未验证。

## AI Test Record

- Behavior changed: 无；本次仅新增审查报告文档。
- Tests added/updated: 无。
- Tests run: `pnpm verify`、`pnpm happy-dog:test`、两个 Storybook build、production build、runtime market smoke、harness eval、companions、doctor 及边界 lint 探针。
- Result: PARTIAL
- Failures or gaps: companions 报 3 个已知 warning；完整 Docker 镜像未运行；未启动浏览器做视觉交互审查。
- Next risk: Stop hook 和 skill canonical source 修复前，AI 完成门仍不可被视为可靠阻断。

## AI Review Record

- Review focus: 初期架构规范、运行时边界、缓存/市场/cart、安全、测试、Harness 8 组件、workflow/skills 协同及过度设计。
- Findings: 无 P0 运行时缺陷；确认 1 个 P0 治理缺陷、多个 P1 enforcement/一致性缺口及若干 Phase 2 风险。
- Residual risks: 真实 adapter、Server Cart、checkout/payment 尚未进入可审范围；Docker 和浏览器视觉行为未完成端到端验证。

---

**最终建议：保留当前应用架构，暂停增加新规范；先把 Stop、skills、doctor、边界 lint 和完成门这五个已有机制修到真正可执行，再进入 Phase 2。**
