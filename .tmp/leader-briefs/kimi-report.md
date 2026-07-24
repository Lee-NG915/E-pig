• # E-pig 开发流程与 Agents/Skills 对照调研

## A. 筛选结果表

| 项目                         | 相似度(1-5) | 为何入选                                                         | 可学流程点                                                       |
| -------------------------- | -------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| saleor/storefront          | 5        | 同为 Next.js 16/RSC headless 电商店面，仓库自带 AGENTS.md + 21 条 skills | PPR/cacheLife 分层、按 tag webhook 即时失效、多 locale/channel 路由     |
| obra/superpowers           | 4        | 方法论级 skill：强制串联 brainstorm→plan→subagent-dev→TDD→review      | RED-GREEN TDD、subagent 两段评审、自动触发工作流                         |
| mattpocock/skills          | 4        | 针对 agent 失效模式设计的细粒度 coding skills                            | `/grill-me` 需求对齐、`/tdd` 红绿重构、user/model 双层触发                |
| DietrichGebert/ponytail    | 4        | 专为抑制 AI 过度工程化的 YAGNI 规则集                                     | 七级取舍阶梯、`/ponytail-review` 收割过度设计                            |
| pbakaus/impeccable         | 4        | AI 设计检测：PRODUCT.md/DESIGN.md + 44 条确定性规则 + hook              | init 生成 DESIGN.md、`detect` CLI JSON 输出、编辑时拦截 AI slop        |
| google-labs-code/design.md | 4        | Google Labs 的 DESIGN.md 结构化设计系统规范 + CLI                      | YAML frontmatter token、`lint`/`diff`/`export` 到 Tailwind v4 |
| microsoft/playwright       | 3        | 前端 E2E 标配，官方提供 MCP 供 Agent 操控浏览器                             | accessibility tree 确定性控制、Trace Viewer、未来跨页旅程自动化             |
| paperclipai/paperclip      | 3        | 多 agent 团队治理：预算、审计、目标对齐                                      | 按项目/token 硬止损、原子任务 checkout、不可变审计日志                         |

---

## B. 开发流程维度

- **需求对齐**：`mattpocock/skills` 的 `/grill-me` 与 `obra/superpowers` 的 brainstorming 环节，比 E-pig 当前的 DDD 模板更能主动暴露歧义 → **别人更好**。
- **计划**：`superpowers` 的 writing-plans + subagent 拆分任务更系统化；E-pig 有 page/component 流程指南，但缺少自动化的计划 skill → **别人更好**。
- **TDD**：E-pig 已要求行为变更同 patch 带测试；`superpowers` 的 RED-GREEN TDD 仪式感更强，且用 subagent 执行 → **可借鉴，E-pig 测试纪律已领先**。
- **Code review**：E-pig 有 Dual-AI Record + PR 模板；`superpowers` 用 subagent 做 spec 合规与代码质量两段评审，`paperclip` 提供审计与汇报线 → **别人在高风险路径自动化 review 上更好**，但 E-pig money/security 必须保留人类 gate，**不可取消**。
- **组件/页面工作流**：E-pig 的 component folder contract + 8 组件 harness + allowlist 扫描，比 saleor/storefront 的 AGENTS.md 更完整 → **E-pig 已领先**。
- **CI 门禁**：E-pig 已覆盖 typecheck/lint/test/companions/docs-check/harness-evals/build/smoke，链路完整；Playwright E2E 是 E-pig 明确留到 Phase 3+ 的缺口 → **现阶段勿引入**。
- **视觉/E2E**：`pbakaus/impeccable` + `google-labs-code/design.md` 提供设计系统机检；E-pig 只有 stories + storybook-host，Chromatic 未做 → **别人更好**。

---

## C. Agents / Skills 维度

- **Skill 粒度**：E-pig 偏粗（`harness-guide`、`submit-pr`、`vercel-react-best-practices`）；`mattpocock/skills`、`ponytail`、`impeccable` 提供细粒度命令 → **可组合叠加**。
- **强制工作流 vs 按需触发**：`superpowers` 自动触发完整方法论闭环；E-pig 靠 AGENTS.md 与 rules 默认加载，依赖 agent 自律 → **别人在自动编排上更好**，但与 `phase-review` 的 MANUAL TRIGGER ONLY 纪律**可能冲突**，需限定范围。
- **DESIGN.md**：`google-labs-code/design.md` 与 `impeccable` 提供结构化设计上下文；E-pig 组件 `.md` 只写行为 → **可叠加到 happy-dog，不冲突**。
- **YAGNI**：`ponytail` 的七级取舍阶梯与 E-pig Hard Rules（少依赖、不装未用库）高度一致 → **可组合**。
- **Subagent 编排**：`superpowers`/`paperclip` 做多 agent 流水线；E-pig 仅 Dual-AI Record，无运行时 subagent → **可借鉴，但现阶段勿全量引入**，建议在 cart/checkout 高风险任务试点。
- **PR/评审模板**：E-pig 已有 PR 模板 + AI Test/Review Record；`superpowers` 的 code-review loop 可补全 AI Review 执行 → **可组合**。
- **Evals**：E-pig 有 harness-evals 与 companions 指标；`paperclip` 的成本/审计治理可补充 → **可叠加 token 预算与审计日志**。

---

## D. 给 Leader 的可落地建议（8 条）

1. **引入** `ponytail` **作为可选 coding skill，在组件/工具函数实现前跑** `/ponytail-review`

- 借鉴来源：DietrichGebert/ponytail  
- ROI：高（降 LOC/tokens/依赖）  
- 阶段：H1-H2，先在 `happy-dog` 试点  
- 风险：过度抑制可能影响可读性，需保留测试硬规则

1. **为** `happy-dog` **引入 DESIGN.md 规范与 44 条确定性 detect 规则**

- 借鉴来源：google-labs-code/design.md + pbakaus/impeccable  
- ROI：高（设计系统一致、可机检）  
- 阶段：H2  
- 风险：design.md 尚处 alpha，格式可能变动，只读引用不锁死

1. **在 cart/checkout 高风险任务试点 superpowers 的 spec→subagent→TDD→review 闭环**

- 借鉴来源：obra/superpowers  
- ROI：中（补强 Dual-AI 执行）  
- 阶段：H2  
- 风险：token 成本增加，需限定任务大小与预算

1. **在需求对齐环节加入** `/grill-me` **检查清单**

- 借鉴来源：mattpocock/skills  
- ROI：中（减少返工）  
- 阶段：H1  
- 风险：需本地化为 E-pig 组件/页面流程

1. **将 Playwright MCP 纳入 P3 E2E 路线图，先以 checkout 关键旅程试点**

- 借鉴来源：microsoft/playwright  
- ROI：中  
- 阶段：P3（P0 不引入）  
- 风险：基础设施与维护成本

1. **为 AI 任务增加 token/时间硬止损与不可变审计日志**

- 借鉴来源：paperclipai/paperclip  
- ROI：中（成本可控、可复盘）  
- 阶段：H2  
- 风险：需轻量实现，避免引入 SaaS

1. **完善 catalog/content 的 PPR/cacheLife 分层与 tag 失效文档/脚本**

- 借鉴来源：saleor/storefront  
- ROI：高（与 E-pig cache 硬规则一致，仅用于非价格区）  
- 阶段：H2  
- 风险：严禁误用于 cart/checkout/price 等禁止缓存区域

1. **升级 PR 模板，在 AI Review Record 中增加 subagent 两段评审 checklist**

- 借鉴来源：obra/superpowers + E-pig 现有 PR 模板  
- ROI：中  
- 阶段：H1  
- 风险：模板变长，需保持可执行而非形式主义
