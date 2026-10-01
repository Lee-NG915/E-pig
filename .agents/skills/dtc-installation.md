# DTC skills 项目接入

安装日期：2026-10-01。安装来源为 [DTC-skills GitHub 仓库](https://github.com/Lee-NG915/DTC-skills) `main` 快照（提交 `82561832b84e2b2211c189cf96618da0ed666b95`），共 20 个通用 skill。各文件来源与安装后 SHA-256 见 [快照清单](../dtc-skills-install.json)，许可见 [MIT LICENSE](dtc-skills-LICENSE.txt)。

## 使用与优先级

在 E-pig 新开对话，按任务指定 skill，例如：“使用 dtc-design-evidence、dtc-page-decomposition 和 dtc-ui-spec 分析这个 Figma 页面，先保存设计证据、拆分结构和详细参数，再实现并验证。”

先遵循 [项目入口](../../AGENTS.md)、[e-pig](e-pig/SKILL.md) 的匹配规则和 [e-pig-dev-loop](e-pig-dev-loop/SKILL.md)，再按阶段加载 DTC skills。DTC 是补充流程，不替换项目调度、Hard Rules 或质量门；冲突以 E-pig 规则为准。已有需求确认和授权沿用，不因切换 skill 重复审批；phase-review 仍仅手动触发。

## 阶段组合

| 阶段 | Skills | 交付给下一环节 |
| --- | --- | --- |
| 定位与需求 | dtc-context、dtc-requirements-analysis | 项目能力映射、范围、验收条件 |
| 设计取证 | dtc-design-evidence | 设计来源、测量、素材、状态与缺口 |
| 两级拆分 | dtc-page-decomposition、dtc-atomic-decomposition | 页面组件树、组件内部原子边界、复用判断 |
| 方案与参数 | dtc-technical-design、dtc-ui-spec | 数据和交互契约、响应式规则、详细参数表 |
| 实现 | dtc-implementation | 按依赖顺序落地的组件和页面 |
| 验证与优化 | dtc-component-testing、dtc-visual-validation、dtc-scoped-validation、dtc-optimization | 状态测试、同条件视觉对比、差异修复和复测证据 |
| 评审与交付 | dtc-workflow-review、dtc-ci-monitor、dtc-delivery、dtc-evidence-log | 审查结论、实际检查结果、交付边界与证据索引 |
| 按需辅助 | dtc-data-tracking、dtc-exception-handling、dtc-privacy-redaction、dtc-recording-analysis | 场景埋点、异常恢复、公开脱敏和录屏分析 |

完整页面按上述依赖推进，详细参数先落盘再实现；单组件可从原子拆分进入，局部修复复用已有契约，只重跑受影响验证。不得把“安装了技能”视为实现完成、视觉通过或远端交付。

## E-pig 能力映射

- 页面归属与路由遵循 [页面流程](../../docs/engineering/page-workflow-guide.md)：路由入口在 src/app，领域业务组件在 src/modules/<domain>/components。
- 原子组件优先复用 packages/happy-dog 和 [DESIGN.md](../../DESIGN.md) 的设计契约；组件目录、文档、测试与 Storybook 要求以 [组件流程](../../docs/engineering/component-workflow-guide.md) 为准，不对每个内部小片段强制建公共组件。
- 技术栈和命令以项目 package.json / AGENTS.md 为准。使用当前 Next.js、React、TypeScript、Tailwind、Vitest 能力；不引入源 monorepo 的 Nx、Theme Sync、上传脚本或凭据。
- Storybook 使用项目已有基础库和业务组件宿主；按项目 allowlist 判断必需范围。视觉校验保留设计与实现的相同视口、字体、素材、状态和版本，工具不足时记录未验证项，不假定存在浏览器自动化套件。
- 开发预览须显式选择目标 MARKET。组件行为变更同步测试；完成检查沿用项目质量门。设计、实现、测试与优化使用同一份任务证据，避免另造重复的“已通过”记录。
- 公开录屏或分享前执行脱敏；本地测试、视觉验收、远端发布分别记录。安装与调用 skill 本身不授予外部写入或发送消息的权限。

## 目录与更新

.agents/skills/dtc-*/ 是项目内副本，.claude/skills/dtc-* 是指向这些副本的相对软链，不依赖个人机器上的源目录。skill.json 是说明性元数据，不是可执行 API；其 Schema 在本目录 skill.schema.json。

更新时先比较源文件、已安装文件和快照清单，保留本地修改，再同步已确认的差异；重新适配 Schema 与上下文链接并刷新清单哈希。GitHub 仓库的 ref 和 commit 记录在清单中，逐文件哈希标识本次安装快照。社区来源的 skills-lock.json 保持原有用途，本地 DTC 安装由独立清单记录。

安装后运行 pnpm agent-doctor 和 pnpm docs:check，并核对全部 DTC 引用和相对软链。技能发现缓存由客户端管理，更新后新开项目对话。
