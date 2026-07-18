# 对比维度目录 — E-pig vs 参考工程

每个维度给出：参考工程现状（事实来源 `docs/codex/research/01/02/03`，标注节号）、E-pig 现状（本次取证）、判定（胜/平/负）+ 一句理由。

## 判定口径（v2，服务「分阶段复现参考工程核心」）

| 判定 | 含义 |
| --- | --- |
| **胜** | 在**本阶段目标内**，E-pig 用更可持续的方式达到了与参考工程**同等或更清晰**的核心意图（例如：同样的依赖方向，更低的拆包成本；同样的显式缓存意图，更现代的 API）。 |
| **平** | 有意取舍或阶段差距：核心意图部分对齐，或文档已记录「本阶段不做」；**不能**仅因「没做参考工程的重设施」就判胜。 |
| **负** | 本阶段**应该**覆盖的参考工程核心能力缺失、名存实亡，或实现与已定稿 ADR/Hard Rules 冲突。 |

**明确禁止：**

- 把「没有 Nx / 没有 Redis / 没有 E2E / 没有 Chromatic」直接判胜——除非本阶段清单本来就不包含，且轻量替代已完整兑现意图。
- 把「功能完整度」以外的维度全部判胜来抬 D 分。

「对当前阶段有利」仍然成立，但「有利」= **更利于逼近参考工程核心的正确路径**，不是 **更少代码就算赢**。

## 维度列表（10 个）

1. **架构形态与依赖边界**
   - 参考工程：Nx 20 + 60+ 项目，三层拆包，`enforce-module-boundaries`（01 §1、§2.1）
   - E-pig：单 app + 可选 workspace 组件包；`modules → contracts ← adapters`；ESLint + diff-check
   - 典型：意图对齐且成本更低 → 胜；边界可被绕过 → 负

2. **渲染与缓存模型**
   - 参考工程：Next 14 隐式 ISR + Redis handler（01 §4）
   - E-pig：Next 16 `cacheComponents` + 显式 `'use cache'`（07）
   - 有策略文档且代码边界清晰 → 胜；仍无策略却声称 PPR 完成 → 平/负

3. **多市场机制**
   - 参考工程：五市场 env + 构建前脚本（01 §4、§5.3）
   - E-pig：typed registry + host 纯函数
   - 机制可测 → 胜面；覆盖/runtime 解析未完成 → 与胜面冲抵多为平

4. **状态管理与数据获取**
   - 参考工程：Redux + RTK Query + SWR（01 §3）
   - E-pig：RSC + 局部 client state；cart/checkout 规划 TanStack Query
   - P0 减法且 demo 自洽 → 平或有限胜；该进 server cart 仍停在 localStorage → 对 Phase 2+ 判负

5. **UI 与设计系统**
   - 参考工程：Fortress（MUI Joy）+ Storybook + Chromatic（01 §3）
   - E-pig：Tailwind 4 + shadcn + `@e-pig/happy-dog` + Storybook（08）
   - **Storybook/页面必须有运行时渲染证据**才能谈胜；仅有包脚手架或 build 通过 → 最多平；error overlay → 负

6. **测试与质量门**
   - 参考工程：Jest + MSW + Playwright/Cucumber（01 §3）
   - E-pig：Vitest + TL + diff-check/doc-sync/smoke；E2E 按 Phase 引入
   - 门禁链完整 → 平/小胜；缺本阶段要求的 contract/MSW/E2E → 负

7. **AI 协作工程治理**
   - 参考工程：原始 scripts/evals 资产
   - E-pig：AGENTS/rules/skills/hooks/evals + phase-review
   - 适配且真能拦住问题 → 胜；评分虚高却漏运行时缺陷 → 平或负（治理失效）

8. **可观测性**
   - 参考工程：Sentry + Datadog + Pino + web-vitals（01 §5.2）
   - E-pig：logger + consent + analytics facade
   - Phase 1–2 通常平；声称生产级却无错误上报 → 负

9. **部署与运维**
   - 参考工程：多 workflow + release-please + Docker（01 §6）
   - E-pig：单 CI + Dockerfile standalone
   - 脚手架在但从未真实执行 → 平（不得因「有文件」判胜）

10. **功能完整度（阶段内）**
    - 对照**本阶段能力清单**，不是对照参考工程全集
    - 清单内大面积缺失 → 负；清单外缺失 → 不在此维惩罚（放到「易被误认」）

## 使用注意

- Phase 演进可增删维度（如 Phase 3 增加「支付与幂等」），但单次评审维度集合固定。
- 参考工程列 1–2 句 + 文档节号；E-pig 列必须能被同报告取证支撑。
- 全胜或全负 = 取证不合格。
