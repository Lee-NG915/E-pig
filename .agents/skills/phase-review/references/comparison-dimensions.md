# 对比维度目录 — E-pig vs 参考工程

每个维度给出：参考工程现状（事实来源 `docs/codex/research/01/02/03`，标注节号）、E-pig 现状（本次取证）、判定（胜/平/负）+ 一句理由。

**判定口径**："胜" = 对 E-pig **当前阶段**（轻量、未接后端、AI 协作开发）更有利，不是绝对技术优劣。参考工程在规模化、成熟度上的强项，对现阶段的 E-pig 可能是过度工程——如实分析，但判定时以"对 E-pig 当前目标是否有利"为准。

## 维度列表（10 个）

1. **架构形态与依赖边界**
   - 参考工程：Nx 20 + pnpm workspace，60+ 项目，components/services/domain 三层强制拆包，`@nx/enforce-module-boundaries` error 级约束（01 §1、§2.1）
   - E-pig：单 Next app，`modules → core contracts ← adapters` 单向依赖，ESLint `no-restricted-imports` 强制 + diff-check 兜底
   - 典型判定：E-pig 胜（继承"方向"不继承"每层独立发布单元"，简单功能不用跨 3 个 package）

2. **渲染与缓存模型**
   - 参考工程：Next.js 14 App Router，SSR/ISR 隐式缓存 + Redis cache handler（01 §4）
   - E-pig：Next.js 16 `cacheComponents`，PPR 静态壳 + Suspense 动态区，显式 `'use cache'` 策略（07）
   - 判定口径：模型现代化 + 边界清晰 vs 生态成熟度

3. **多市场机制**
   - 参考工程：SG/US/AU/CA/UK 五市场，`.env.development.{market}` + 构建前脚本注入（01 §4、§5.3）
   - E-pig：typed market registry（au/sg/us）+ env 只做选择，host 纯函数可单测
   - 判定口径：配置治理 vs 市场覆盖面（覆盖少是负，机制清晰是胜——按当前阶段需要权衡）

4. **状态管理与数据获取**
   - 参考工程：Redux Toolkit + RTK Query + next-redux-wrapper + SWR（01 §3）
   - E-pig：RSC 服务端数据 + 局部 client state（demo cart 在 localStorage）
   - 判定口径：P0 阶段无全局 client store 是减法还是欠债——结合验收标准判断

5. **UI 与设计系统**
   - 参考工程：Fortress 内部库（MUI Joy/Material + Emotion）+ Storybook + Chromatic（01 §3，08）
   - E-pig：Tailwind 4 + shadcn/ui 源码组件，无 Storybook
   - 判定口径：轻量可改 vs 视觉协作设施缺失（对照 06 §2 升级门槛：~20 复杂组件前不引入）

6. **测试与质量门**
   - 参考工程：Jest + Testing Library + MSW + Playwright/Cucumber E2E + Husky/lint-staged（01 §3）
   - E-pig：Vitest + co-located spec、diff-check 定向门禁、doc-sync、hooks + 人工评测清单；无 E2E
   - 判定口径：E2E 缺失如实判负或平，AI 工作流门禁是加分项

7. **AI 协作工程治理**
   - 参考工程：有质量脚本与评测框架原始资产（docs/agent-skills-migration-audit.md）
   - E-pig：迁移并适配后的 AGENTS.md + rules + skills + hooks + evals，且已修原件缺陷（ESLint 9 formatter、无 rg 环境回退、untracked 文件门禁漏洞）
   - 典型判定：E-pig 胜（适配修复后更贴合当前工具链）

8. **可观测性**
   - 参考工程：Sentry + Datadog RUM/trace + Pino + web-vitals + 自定义观测 ESLint 插件（01 §5.2）
   - E-pig：结构化 logger + consent 门控 + analytics facade（事件不进第三方）
   - 判定口径：现阶段"够用且不绑定 SaaS" vs 生产级洞察缺失

9. **部署与运维**
   - 参考工程：20 个按市场的 GitHub workflow、release-please、Nx release、Docker standalone（01 §6）
   - E-pig：单 CI（typecheck/lint/test/build）+ Dockerfile standalone
   - 判定口径：满足当前规模 vs 发布自动化差距

10. **功能完整度**
    - 参考工程：真实 PLP/PDP/搜索/多支付 checkout/订单/CMS/促销/归因（01 §2.2、§3）
    - E-pig：Home demo + mock catalog/cart
    - 典型判定：E-pig 负（必须有至少一个负维度；这是阶段差距而非缺陷，但如实记负）

## 使用注意

- 维度可以随 Phase 演进调整权重与增删（如 Phase 3 后"支付"应独立成维），但一次评审内维度集合固定。
- 每个维度的"参考工程"列只写 1–2 句要点并标注文档节号，不复制原文段落。
- 全判胜 = 取证不认真，回去重查；全判负同理。
