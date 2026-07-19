# 页面对话开发流程指南

更新日期：2026-07-19

状态：active

本文件是**页面级入口**：开发或改页面时，先用 DDD 判定领域归属，把业务 UI 放进对应 `modules/<domain>`，再进入已定义的[组件开发流程](./component-workflow-guide.md)，由 companions / 测试门禁收口，形成闭环。

---

## 1. 一句话

`app/` 只做路由与编排；业务能力与业务组件落在 `modules/<domain>`；每个业务组件走组件文件夹契约。先定领域，再写页面。

---

## 2. 闭环总览

```text
用户 / 里程碑 PRD（例：M2.1 PLP）
        │
        ▼
① 页面意图拆解：主用户目标、实体、关键状态
        │
        ▼
② DDD 定域：主 owning domain + 协作 domain（下表）
        │
        ▼
③ 组件落点：业务组件 → src/modules/<domain>/components/
           基础 UI → packages/happy-dog
           跨域纯编排（极少）→ 仍由 app 组合 modules，不反向塞业务进 app/
        │
        ▼
④ 触发组件流程（每个新/改业务组件）：
   读/写 .md → tsx + spec（+ stories）→ pnpm quality:companions
   详见 component-workflow-guide.md
        │
        ▼
⑤ app 路由页：async Server Component 组装 modules + registry/port 数据
        │
        ▼
⑥ 门禁：相关 spec + typecheck/lint；cart/checkout 等 Dual-AI Record
        │
        ▼
交付：页面可访问 + AI Test Record（声明域归属与 companion 同步）
```

**禁止短路：** 在 `src/app/**` 里堆业务状态机、长列表卡片实现、或直接 import `@/adapters/*`。

### 2.1 缓存 shell 与动态岛（Saleor Paper 改编）

新建/改页面时显式标出边界：

| 形态 | 做法 |
| --- | --- |
| Static browse | 缓存数据在 data 边界 `'use cache'` + `applyCacheProfile`；页面直接渲染 shell，**无 page-level Suspense** |
| Hybrid | 缓存 shell 急切渲染；仅 `searchParams` / cookies / cart 等动态岛包 `<Suspense>`；骨架是 per-hole，不是整页默认 |
| Cart chrome | **整页只挂一次** `CartSheetMount`（包 SiteHeader）；禁止在多个 Suspense 岛各挂 `<CartSheet />` |
| Layout | 保持同步；header/footer/cart 等 chrome 各自 Suspense；`<main>` 不被 chrome Suspense 包裹 |

价格 / 库存 / cart / checkout / payment **永不**进入共享 cache（见 `src/shared/lib/cache-manifest.ts` 与 Hard Rules）。

---

## 3. 领域目录（DDD 速查）

与 `AGENTS.md` Project Structure 对齐。页面**主域**按「核心业务实体 / 交易阶段」选一；其它域只提供协作组件。

| Domain | 核心实体 / 职责 | 典型页面（主域） | 典型组件 |
| --- | --- | --- | --- |
| `catalog` | Product、Collection、Listing、Variant | Home 精选区、PLP、PDP | `product-card`、列表/筛选、PDP 画廊 |
| `cart` | Cart、LineItem、cart cookie 签发边界 | Cart drawer/页、加购控件 | `cart-sheet`、数量步进、mini-cart |
| `checkout` | Checkout session、地址/配送选择（非支付 SDK） | Checkout 步 | 地址表单、配送选项 |
| `order` | Order、履约状态展示 | 订单确认 / 历史 | order summary、状态条 |
| `account` | Customer identity、资料、地址簿 | 登录后账户区 | profile、地址列表 |
| `content` | 营销/站点壳、CMS 块、页脚页眉 | 全局壳、内容落地页 | `site-header`、`site-footer`、hero（无商品逻辑时） |

**横切（不是 business module）：**

| 位置 | 放什么 |
| --- | --- |
| `packages/happy-dog` | Button、Badge、Sheet 等无业务语义基础组件 |
| `src/shared` | 跨域纯工具 / 通用 UI 碎片（不得反向依赖 modules） |
| `src/platform` | env、market registry、logging、registry 装配 |
| `src/core/contracts` | Port / 内部 DTO（modules 只依赖这里，不依赖 adapters） |
| `src/adapters` | Port 实现（仅 registry / app 服务边界装配，modules 禁止 import） |

---

## 4. 定域决策（先问这几个问题）

按顺序回答；答案指向**一个主 owning domain**。

1. **页面离开后，用户主要带走的业务结果是什么？**  
   浏览/选品 → `catalog`；改购物车 → `cart`；提交结账 → `checkout`；查单 → `order`；管身份资料 → `account`；读内容/壳 → `content`。
2. **状态矩阵主要由谁拥有？**  
   组件状态表写在**拥有该状态的 domain** 的组件 `.md` 里，不写在路由文件旁的杂记里。
3. **数据从哪个 Port 来？**  
   `CatalogPort` → catalog；`CartPort` → cart；以此类推。取数在 app/module 服务边界经 `getCapabilities()` / registry，不进 module 直连 adapter。
4. **若一页多个域（Home、Checkout）？**  
   - 定一个**页面主域**（信息架构上的主目标）。  
   - 每个区块的组件仍放回**自己的 domain**。  
   - `app/page.tsx`（或路由段）只负责 `import` 组合与 Suspense/cache 边界。  
   - 跨 3 个以上领域的复杂编排才考虑后续 `composite`（见架构研究 §4）；P0/Phase 2 优先显式组合，不新建杂物抽屉。

### 4.1 反例（避免）

| 错误 | 正确 |
| --- | --- |
| 把 `ProductCard` 放进 `src/app/_components` | `src/modules/catalog/components/product-card/` |
| 在 `content` 里实现加购与 cart cookie | 加购控件属 `cart`；content 只链到入口 |
| 在页面里 `import` Stripe / CMS SDK | 经 port + adapter；页面只消费内部 DTO |
| 为「方便」新建 `src/components` 大杂烩 | 禁止；域不清时先停下来定域 |

机器兜底（warn）：`pnpm quality:diff` 对变更路径命中 `src/app/_components/**` 或 `src/components/**` 会报签名警告（不阻断）。定域语义仍靠纪律。

---

## 5. `app/` vs `modules/` 职责

| 层 | 做 | 不做 |
| --- | --- | --- |
| `src/app/**` | 路由段、`layout`、metadata、async 取数编排、`<Suspense>`、组合 modules 导出的组件 | 业务状态机、领域规则、大段 JSX 业务卡片、供应商 SDK |
| `src/modules/<domain>/**` | 领域组件、领域 lib/store、（后续）domain services | import `@/adapters/*` / `@/integrations/*` |
| happy-dog | 视觉与无障碍基础件 | 价格规则、cart id、市场业务分支 |

缓存硬规则仍适用：价格 / 库存 / cart / checkout / payment **不进**共享 Cache Component；request API 不在 `'use cache'` 内读取（见 AGENTS Hard Rules）。

---

## 6. 标准回路（对话模板）

复制给 AI / 自己执行：

```text
1. 页面目标（一句话）+ 里程碑 PRD 链接（若有）
2. 主 owning domain = ___；协作 domain = ___
3. 路由路径草案 = ___（写入实现说明，不散落魔法字符串）
4. 组件清单（每项：域名 / 文件夹路径 / 新建|扩展）：
   - …
5. 对清单中每一项执行 component-workflow-guide（md → tsx+spec → companions）
6. 在 app 路由中组装；标明 cache / Suspense / request-time 边界
7. 跑：相关 pnpm test；pnpm quality:companions；必要时 typecheck/lint
8. AI Test Record：域归属 + companion 同步 + 页面验收点
```

### 6.1 何时必须走完整页面回路

- 新路由或新页面信息架构
- 页面主用户目标或主实体变化
- 从页面拆出/迁入业务组件（触及 modules）

### 6.2 何时可简化

| 情况 | 最少要求 |
| --- | --- |
| 只改路由文案/metadata，无组件行为变化 | 无需新组件流程；Test Record 声明豁免 |
| 只改已有组件一态 | 直接[组件流程](./component-workflow-guide.md)；页面文档可不新建 |
| 只换 happy-dog 视觉 token | happy-dog 组件流程；业务 md 不动 |

---

## 7. 与组件流程的衔接点

页面流程**不替代**组件流程，只负责定域与落点：

| 页面步骤产出 | 交给组件流程 |
| --- | --- |
| 「需要 `product-card` 缺货态」 | catalog 下该组件的 `.md` 状态矩阵 + spec +（可选）stories |
| 「需要 cart sheet 展示运费提示」 | cart 下对应组件 companion 同步 |
| 「需要新 Button variant」 | `packages/happy-dog`（强制 stories） |

机器门禁复用：`pnpm quality:companions` / `pnpm quality:diff`（见组件指南 §5）。  
页面级旅程测试：P0 无 Playwright；用相关组件 `.spec.tsx` +（必要时）薄的路由/集成 Vitest。跨页 E2E 留 Phase 3+。

---

## 8. 最小示例：PLP（M2.1）

1. **意图：** 按集合浏览商品并进入 PDP。  
2. **主域：** `catalog`（Listing / Product）。协作：`content`（壳）、日后链接 `cart`（加购若在卡上）。  
3. **落点：**  
   - `src/modules/catalog/components/product-card/`（或扩展现有）  
   - 列表容器/空态：`catalog`（如 `product-list`）  
   - Header/Footer：已有 `content`  
4. **组件流程：** 每个新建/改行为的 catalog 组件走 md+spec+companions。  
5. **app：** 例如 `src/app/collections/[slug]/page.tsx` 只负责 `await` 参数、取 CatalogPort 数据、渲染 modules 组件。  
6. **验收：** M2.1 PRD 条目 + AI Test Record 写明主域 `catalog`。

### Home（跨域页）

- 主域按「站点入口 + 选品」可标 `catalog`（精选）或 `content`（纯营销壳）——以本迭代主目标为准，并在 Test Record 写死。  
- Hero 无商品逻辑 → `content`；商品栅格 → `catalog`；开 cart → `cart` 的 mount 组件。  
- 不把三者实现揉进单个 `app/_components/home-everything.tsx`。

---

## 9. 文档地图

| 文档 | 读它当… |
| --- | --- |
| **本文** | 页面如何定域、落 module、拼 app |
| [`component-workflow-guide.md`](./component-workflow-guide.md) | 单个业务/基础组件怎么改 |
| [`component-folder-contract.md`](./component-folder-contract.md) | 组件目录形状与变更协议 |
| `docs/milestones/**` | 页面级产品验收（PRD） |
| `docs/codex/research/04-e-pig-target-architecture.md` | 分层与 composite 边界 |
| `AGENTS.md` | 硬约束与依赖方向 |

---

## 10. 常见问题

**Q: 页面 md 要和组件 md 分开吗？**  
要。里程碑 / 页面 PRD 写用户旅程与验收；组件 `.md` 只写该组件状态矩阵。页面流程先读里程碑 PRD，再拆到组件 md。

**Q: 搜索页算 catalog 还是独立 search module？**  
Phase 2 可先挂 `catalog`（或薄 `search` module 只包 SearchPort UI）。一旦出现独立搜索实体与 facet 状态矩阵，再升格 `modules/search`，并更新本表。

**Q: 定域争论不休怎么办？**  
选「拥有持久业务状态」的一方为主域；另一域只导出协作组件。把争议写进 AI Test Record，避免下次重开。

**Q: 闭环如何自检完成？**  
(1) 主域写进交付记录；(2) 新业务 UI 不在 `app/` 内实现；(3) 触及的 allowlist 组件 `quality:companions` 无新增缺失；(4) 相关 spec 绿。
