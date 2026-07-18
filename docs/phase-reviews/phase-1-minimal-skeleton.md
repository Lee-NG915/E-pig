# Phase 1 评审：最小骨架

更新日期：2026-07-18

| 项 | 值 |
| --- | --- |
| Phase / 里程碑 | 1 — 最小骨架（docs/codex/research/06 §1） |
| 评审日期 | 2026-07-18（**rubric v2 重评**） |
| Skill 版本 | phase-review rubric v2（A40/B20/C15/D10/E15） |
| 代码基线 | `7ae0ef3`；工作区含 phase-review v2、`docs/milestones/`、happy-dog Storybook preview 修复 |
| 总分 / 等级 | **95.1 / 100 — 优秀** |
| 分数护栏 | 无（Storybook 运行时抽检通过）。说明：若按**修复前** error overlay 状态套用 v2 护栏，总分应封顶 74 |

> **相对初评（同日 97.1 / v1）**：初评在「build-storybook 绿」下把 UI 判胜，但未做 Story 运行时抽检，随后暴露 `theme.colors` TypeError。v2 降低「轻量即胜」权重，新增参考核心覆盖（E），并强制 UI 运行时证据。分数略降，且明确记录治理漏洞。

## 1. 验收标准核对

来源：docs/codex/research/06 §1 Phase 1（原子化 26 条；**加粗** = 门槛 ×2）。状态与初评一致处从略强化证据；变更点见备注。

| # | 验收条目 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | **`.env.example` 复制即可用** | ✅ | `.env.example`；`env.spec.ts` |
| 2 | **install 可复现** | ✅ | lockfile + engines/nvmrc 24 |
| 3 | **`pnpm dev` 无 SaaS 可运行** | ✅ | mock 默认；历史三市场 200（初评） |
| 4 | **typecheck 绿** | ✅ | 本次 `pnpm typecheck` PASS |
| 5 | **lint 绿** | ✅ | 本次 `pnpm lint` PASS |
| 6 | **unit/component tests 绿** | ✅ | 本次 `pnpm test` 11/70 PASS；happy-dog 4 PASS |
| 7 | **doc sync 绿** | ✅ | 本次 `pnpm docs:check` PASS |
| 8 | **Turbopack build 绿** | ✅ | 本次 `pnpm build` PASS；`◐ /` + standalone |
| 9 | **SG runtime smoke 绿** | ✅ | 本次 `pnpm smoke:runtime-market` PASS |
| 10–19 | Next16/env/markets/logger/errors/ports/registry/分层 | ✅ | 同初评路径；未改判 |
| 20 | Docker standalone | 🟡 | Dockerfile + build 产物在；daemon 未实测 `docker build` |
| 21 | CI workflow | 🟡 | `.github/workflows/ci.yml` 在仓；远端未观察 |
| 22–26 | Home demo / cart 隔离 / TL / 静态门禁 / doc-sync | ✅ | 同初评 |

## 2. 未实现清单

| 条目 | 状态 | 原因 | 归属 |
| --- | --- | --- | --- |
| Docker 镜像实测 | 🟡 | 环境无 daemon | 部署演练前补 |
| CI 远端实测 | 🟡 | 未观察 Actions | 下次 push |
| （已修复）Storybook preview theme 崩溃 | ✅ | v1 漏检；已修 decorator + ThemeProvider 回退 + 回归测 | — |

易被误认：PLP/PDP/搜索/server cart（→ `docs/milestones/phase-2/`）。

## 3. 质量门实测

本次执行（2026-07-18 21:33–21:35）：

| 门 | 命令或动作 | 结果 | 备注 |
| --- | --- | --- | --- |
| typecheck | `pnpm typecheck` | PASS | |
| lint | `pnpm lint` | PASS | |
| test | `pnpm test` | PASS | 70 |
| happy-dog test | `pnpm --filter @e-pig/happy-dog test` | PASS | 4 |
| docs:check | `pnpm docs:check` | PASS | |
| build | `pnpm build` | PASS | PPR `/` |
| smoke | `pnpm smoke:runtime-market` | PASS | SG |
| build-storybook | `pnpm --filter @e-pig/happy-dog build-storybook` | PASS | |
| Storybook 运行时抽检 | `storybook dev :6006`；`/iframe.html?id=components-badge--default` 与 button → HTTP 200；`index.json` 含 stories；preview 已去 `useGlobals` 隐患 | PASS | 非 Playwright 截图像素断言；为 v2 最低运行时条 |

## 4. 阶段参考核心覆盖（E）

来源：`phase-capability-checklists.md` Phase 1

| ID | 能力 | 状态 | 证据 / 缺口 |
| --- | --- | --- | --- |
| P1-C1 | 无 SaaS 可启动 | ✅ | dev/smoke |
| P1-C2 | 市场配置真源 | ✅ | `markets.ts` + env |
| P1-C3 | 依赖方向可强制 | ✅ | ESLint + diff-check |
| P1-C4 | Catalog/Cart port+mock | ✅ | adapters + specs |
| P1-C5 | 错误与日志基线 | ✅ | errors/logger specs |
| P1-C6 | 设计系统底座 + Story 可渲染 | ✅ | happy-dog + 本次抽检；Chromatic 仍 defer |
| P1-C7 | Home 可交互 demo | ✅ | cart-flow / 页面 |
| P1-C8 | CI + Docker 脚手架 | 🟡 | 文件在；远端/daemon 未跑 |
| P1-C9 | 单测/组件测基线 | ✅ | Vitest + TL |

覆盖：✅ 8 / 🟡 1 / ❌ 0 → (8 + 0.5) ÷ 9 × 15 = **14.2**

## 5. 与参考工程多维度对比（D）

判定口径：v2（服务分阶段复现核心，禁止「没做重设施=胜」）。

| 维度 | 参考工程 | E-pig | 判定 | 理由 |
| --- | --- | --- | --- | --- |
| 架构形态与依赖边界 | Nx 三层拆包（01 §2.1） | 单 app + ESLint 边界 | 胜 | 同向更低成本 |
| 渲染与缓存模型 | Next14 隐式 ISR+Redis（01 §4） | Next16 显式 cache 边界（07） | 胜 | 模型对齐 07 |
| 多市场 | 五市场 env 脚本 | 三市场 registry 可测 | 平 | 机制清、覆盖少 |
| 状态与数据 | Redux/RTK/SWR | RSC + local cart demo | 平 | P1 有意减法；server cart 在 M2.4 |
| UI 与设计系统 | Fortress+SB+Chromatic | happy-dog+SB（无 Chromatic） | 平 | 底座在；视觉回归未接；曾漏运行时缺陷 |
| 测试与质量门 | Jest+MSW+E2E | Vitest+脚本门；无 E2E/MSW | 平 | 匹配 P1；深度不及 |
| AI 协作治理 | 原始资产 | rules/skills；**v2 补运行时条** | 胜 | 针对虚高评分与 SB 漏检做了机制修正 |
| 可观测性 | Sentry+Datadog… | logger+consent facade | 平 | 阶段够用 |
| 部署与运维 | 多 workflow+Docker 实测 | 单 CI+Dockerfile，**未远端/daemon 实测** | 负 | 本阶段清单要求脚手架「至少一端真实执行」，仍欠 |
| 功能完整度（阶段内） | 骨架级能力 | P1 清单 8/9 | 胜 | 阶段内核心已齐 |

对比小结：胜 4 / 平 5 / 负 1。  
D = 5 + 1 × (4 − 1) = **8**（clamp 后仍 8）。

## 6. 评分

| 项 | 满分 | 得分 | 计算 |
| --- | --- | --- | --- |
| A. 验收标准实现度 | 40 | 38.9 | 门槛 9×2 ✅=18；范围 15✅=15；2🟡×0.5=1；34÷35×40 |
| B. 质量门 | 20 | 20 | 9/9 PASS（含 SB build + 运行时抽检） |
| C. 架构决策符合度 | 15 | 15 | 无未说明违反 |
| D. 阶段取舍合理性 | 10 | 8 | 5 + (4−1) |
| E. 阶段参考核心覆盖 | 15 | 14.2 | 8.5÷9×15 |
| **总分** | 100 | **95.1** | 优秀；护栏未触发 |

## 7. 风险与下一步建议

1. **立即**：按 `docs/milestones/phase-2/` 推进 M2.1（Home+PLP），勿在无 PRD 验收清单时直接铺全 Phase 2。
2. push 后观察 CI；有 Docker 时补 `docker build`，消除 P1-C8 🟡。
3. 后续评审严格执行 v2：UI 声称必须运行时抽检；D 项禁止「更轻=胜」。
4. Phase 3+ 开工前补 `phase-capability-checklists.md` 对应章节。
