# 阶段能力清单 — 参考工程核心覆盖

本清单服务评分项 **E. 阶段参考核心覆盖**。目标不是一比一复制参考工程，而是：**在当前 Phase 声明的范围内，核心设计 / 基础架构 / 关键能力是否按路线图落地，且能追溯到参考工程对应能力。**

使用规则：

1. 只评**本 Phase 清单内**的能力；后续 Phase 的能力缺席不扣 E 分（可在报告「易被误认」列出）。
2. 每条能力状态：✅ 已落地且有证据 / 🟡 部分落地 / ❌ 未落地 / ⏸ 有意 defer（须有文档或 ADR 出处，计 0.5）。
3. 事实来源：参考工程侧用 `docs/codex/research/01–03`；E-pig 侧用本次取证。
4. 新 Phase 开工前应先补本文件对应章节，再开发。

---

## Phase 1 — 最小骨架

参考工程对应：可运行 Web 壳、市场配置、领域边界雏形、mock 数据、设计系统底座、质量/部署脚手架（01 §1–3、§6）。

| ID | 能力 | 参考工程锚点 | E-pig 期望落地 |
| --- | --- | --- | --- |
| P1-C1 | 单应用可本地启动（无 SaaS） | apps/web + env 市场变体 | `pnpm dev` + mock adapter |
| P1-C2 | 市场配置真源 | libs/config 市场/env | typed `markets.ts` + env schema |
| P1-C3 | 依赖方向可强制 | Nx module boundaries | ESLint + diff-check |
| P1-C4 | Catalog/Cart 端口 + mock | modules/product、cart + services | `CatalogPort`/`CartPort` + mock adapters |
| P1-C5 | 错误与日志基线 | Pino / 观测栈简化版 | typed errors + structured logger |
| P1-C6 | 设计系统底座（非完整 Fortress） | fortress 包 + Storybook | happy-dog 包 + tokens/theme；Storybook 可**渲染**基础组件 |
| P1-C7 | Home 级可交互 demo | Home 服务端抓取 + 加购入口 | Home + 本地 cart demo |
| P1-C8 | CI + Docker 脚手架 | workflows + standalone Docker | `ci.yml` + Dockerfile；至少一端有真实执行证据 |
| P1-C9 | 单测/组件测基线 | Jest + TL | Vitest + TL co-located |

**不在 Phase 1 清单（缺席不扣 E）**：PLP/PDP/搜索、server cart cookie、Checkout/支付、真实 adapter、E2E、Chromatic CI、CMP/CSP。

---

## Phase 2 — 浏览与加购（总览）

参考工程对应：product/search/cart 浏览加购主路径（01 §2.2、§4；apps/web PLP/PDP/search/cart）。

细分里程碑见 `docs/milestones/phase-2/`。评审某个 M2.x 时只用该里程碑 PRD 的验收清单作 A；E 分用下表中标注属于该 M2.x 的行。

| ID | 能力 | 参考工程锚点 | 归属里程碑 |
| --- | --- | --- | --- |
| P2-C1 | Production-grade Home（非纯 demo） | Home RSC + CMS/商品区块 | M2.1 |
| P2-C2 | PLP（列表、筛选/排序最小集、分页或等价） | `(PLP)/`、product services | M2.1 |
| P2-C3 | PDP（详情、图库、价格、加购） | `(pdp)/products/[slug]` | M2.2 |
| P2-C4 | Variant 选择与价格/库存展示规则 | product domain/services | M2.2 |
| P2-C5 | 搜索 query（结果列表 + 空态） | `(PLP)/search`、search module | M2.3 |
| P2-C6 | Server cart + 匿名 cookie 懒签发 | cart actions + cookie | M2.4 |
| P2-C7 | 刷新恢复 cart；并发幂等 | cart services | M2.4 |
| P2-C8 | `use cache` / cacheTag / cacheLife 策略 | 显式缓存（对照 07，非 Redis 复制） | M2.5 |
| P2-C9 | SEO metadata / canonical / structured data | shared SEO 能力 | M2.5 |
| P2-C10 | 图片策略（尺寸/优先加载） | next/image 实践 | M2.5 |
| P2-C11 | MSW/contract tests（catalog/cart 边界） | MSW | M2.4–M2.5 |

**不在 Phase 2**：Checkout/Stripe、真实 commerce backend、Playwright 全旅程、CMS page builder、Chromatic 生产流水线。

---

## Phase 3+ 

Checkout/支付、真实 adapter、生产准备的清单在进入该 Phase 前再补，避免空表误导评分。
