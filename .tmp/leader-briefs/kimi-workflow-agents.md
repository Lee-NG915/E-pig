# Kimi Code 任务：开发流程 + Agents/Skills 对照（只读调研，禁止改仓库）

你是研究员，不是实现者。只读分析，输出结构化 Markdown。不要修改任何文件，不要安装依赖。

## E-pig 基线（必须先读）

工作区：`/Users/lidonghai/castlery/E-pig`

必读：
- `AGENTS.md`（尤其 AI 测试与评审工作流、Dual-AI、Hard Rules）
- `docs/engineering/page-workflow-guide.md`
- `docs/engineering/component-workflow-guide.md`
- `docs/engineering/component-folder-contract.md`（前半）
- `docs/engineering/component-folder-harness.md`（摘要）
- `docs/agent-skills-migration-audit.md`
- `.agents/skills/` 目录列表与各 `SKILL.md` 前 40 行
- `scripts/quality/` 下脚本名与用途（diff-check / companions / post-edit / harness-evals）
- `.github/workflows/ci.yml`、`.github/PULL_REQUEST_TEMPLATE.md`（若存在）

E-pig 画像：
- 对话驱动：页面 DDD → module 组件 → app 组装；组件 folder = md/tsx/spec/stories
- AI 交付：AI Test Record 必填；cart/checkout 等高风险 Dual-AI
- Skills：harness-guide / submit-pr / vercel-react-best-practices；rules 在 `.agents/rules`
- Harness：import 边界 ESLint、companions warn、doc freshness、质量自检

## 收录库（唯一外部证据源）

`/Users/lidonghai/castlery/nb-project/collection/`
- `domains/ai-agents.md`（agent-skill / agent-rule / code-assistant）
- `domains/devtools.md`（debug-test / productivity 中与质量门禁相关）
- `domains/frontend.md` 中带 AGENTS.md/skills 的电商项（saleor/storefront、spree 等）
- `domains/design.md` 中 gen-design（impeccable、ui-ux-pro-max、open-design、design.md）

禁止编造；证据不足要标明。

## 筛选任务

筛 **6–8 个**与「AI 辅助电商前端工程化」最近的项目/技能包：
建议候选（可论证增减）：
- saleor/storefront（仓库内 AGENTS.md + skills）
- obra/superpowers
- mattpocock/skills
- DietrichGebert/ponytail
- pbakaus/impeccable
- google-labs-code/design.md
- microsoft/playwright（E2E / Agent MCP 视角）
- paperclipai/paperclip 或 Yeachan-Heo/oh-my-claudecode（多 agent 治理，仅流程借鉴）
- ant-design/ant-design-pro（Claude skills，作反差对照）

## 输出格式（严格）

### A. 筛选结果表
| 项目 | 相似度(1-5) | 为何入选 | 可学流程点 |

### B. 开发流程维度
相对 E-pig：需求对齐、计划、TDD、code review、组件/页面工作流、CI 门禁、视觉/E2E。
标出：别人更好 / E-pig 已领先 / 现阶段勿引入。

### C. Agents / Skills 维度
相对 E-pig：skill 粒度、强制工作流 vs 按需触发、DESIGN.md、YAGNI、subagent 编排、PR/评审模板、evals。
标出可组合叠加 vs 会冲突（例如与 E-pig Hard Rules / 少依赖原则冲突）。

### D. 给 Leader 的可落地建议（最多 8 条）
每条：建议 / 借鉴来源 / ROI / 阶段 / 风险。
必须可变成 E-pig 下一迭代任务；不要建议推翻已定稿架构硬规则。

全文中文，控制在 2500 字内。
