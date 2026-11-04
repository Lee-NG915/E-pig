---
status: proposal
last-modified: 2026-11-04
register: engineering
---

# 售后域建设与售后中台对接方案

对接仓库：`Lee-NG915/dtc-support-agent`（FastAPI + LangGraph 售后中台，下称"中台"）。
中台侧权威契约：该仓库 `docs/architecture/modules/after-sales/epig-contract.md`（分支 `codex/2-epig-after-sales`，Issue #2）。本文只负责 E-pig 侧的范围、模块落点与验收，字段语义以中台契约为准，不复制全文。

## 背景

E-pig 已有商品、购物车、订单（`/api/[market]/orders`、订单详情页、postgres adapter），但没有售后能力。方案确认：E-pig 承担消费者入口与售后业务数据，中台承担客服工作台、政策检索、审批与工单流转。两边通过 HTTP API 协作，**不共享数据库、不另建独立售后平台**。

## 范围 / 非目标

做（首期）：

- after-sales 业务域：诉求单（消费者提交的售后申请）与工单（中台审批后创建的正式售后单）。
- 服务视图 API：订单 / 物流查询、诉求提交与队列、工单创建与查询。
- 订单详情页：售后入口（"申请售后"）与工单进度、客服回复展示。

不做（首期）：

- 消费者 AI 自动回复聊天窗、实时客服聊天。
- E-pig 内自建客服处理后台（那是中台的页面）。
- 真实退款、自动取消订单；工单仅记录处理决定与状态。

## 模块落点（遵循现有 Hard Rules）

```text
src/core/contracts/after-sales/     AfterSalesPort + 内部 DTO（诉求 / 工单 / 回执）
src/adapters/after-sales/mock/      合成数据，本地与 CI 默认
src/adapters/after-sales/postgres/  持久实现（后续，随订单 postgres 模式）
src/modules/after-sales/            业务组件：申请售后表单、工单进度、回复展示
src/app/api/[market]/after-sales/   Route Handlers：requests / tickets
src/app/api/[market]/orders/        既有路由，核对并扩充服务视图字段
```

约束：

- `modules` 只依赖 `@/core/contracts/*`，不 import adapters / integrations；adapter 负责 DTO 映射与错误归一化，由 `platform/registry.ts` 装配。
- 所有 request API 按 async 使用；`params` 先 `await`。
- 服务 token（`AFTER_SALES_SERVICE_TOKEN`）只存 server env，进 env schema，禁止 `NEXT_PUBLIC_*`。
- 售后写操作（诉求提交、工单创建）不进共享缓存；价格、订单、工单状态 request-time 读取。

## API 与权限

路径以 `/api/[market]/after-sales/...` 为基准，字段见中台契约：

| 接口 | 调用方 | 权限要点 |
|---|---|---|
| `GET orders/{id}`、`GET orders/{id}/shipment` | 中台 | 服务 token；market 必须与调用方授权市场一致 |
| `POST after-sales/requests` | 消费者 | 登录态 + 订单归属校验，只能给自己的订单提诉求 |
| `GET after-sales/requests?status=pending&cursor=` | 中台 | 服务 token + 市场授权；游标防重复遗漏 |
| `POST after-sales/tickets` | 中台 | 服务 token + 市场授权；幂等键 + 草稿版本校验 |
| `GET after-sales/tickets/{id}` | 中台 / 消费者 | 中台用于回执核验；消费者仅能看自己的工单 |

写约定：同一 `idempotency_key` 重复提交返回原工单，同键不同参数返回 `conflict`；`draft_version` 与中台审批版本一致才创建。错误码沿用统一 error model：`unauthorized / forbidden_market / not_found / conflict / rate_limited / upstream`。

## 页面（消费者侧）

- 订单详情页增加"申请售后"入口：问题类型 + 描述 + 附件，提交后展示 `request_id` 与待处理状态。
- 工单进度区：状态时间线 + 客服回复；无实时聊天，刷新获取最新状态。
- 组件按组件流程规范落文件夹契约（tsx + md + spec），高频/有状态组件一并补 stories。

## 测试策略

- contracts / DTO / 幂等与状态机纯逻辑：Vitest `.spec.ts`（node）。
- Route Handlers：集成级 Vitest，覆盖服务 token 缺失、跨市场、非本人订单、重复提交、版本冲突、未知订单。
- 页面组件：`.spec.tsx` 断言可见行为（提交后状态、进度与回复渲染）。
- 全部 co-located；行为变更与测试同 patch，交付附 AI Test Record。

## 任务拆解

- [ ] contracts：AfterSalesPort、诉求 / 工单 DTO、错误映射
- [ ] mock adapter + fixtures（与 catalog 商品对齐的合成订单诉求）
- [ ] Route Handlers：requests 提交 / 队列、tickets 创建 / 查询，含鉴权与幂等
- [ ] 订单服务视图字段核对扩充 + shipment mock
- [ ] 订单详情页售后入口与进度组件
- [ ] 联调：中台 EpigConnector 打通八步故事线（见中台蓝图），故障演练记录回写中台 Issue #2

## 开放问题（与中台共同评审）

附件存储方式与大小限制；诉求队列轮询 vs webhook（首期倾向轮询）；消费者回复是否支持多轮追加。
