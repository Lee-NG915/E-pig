---
status: proposal
last-modified: 2026-11-05
register: engineering
---

# 售后域建设与售后中台对接方案

对接仓库：`Lee-NG915/dtc-support-agent`（FastAPI + LangGraph 售后中台，下称"中台"）。产品行为以该仓库 `docs/architecture/modules/after-sales/product-blueprint.md` 为准，跨仓协作语义以 `epig-contract.md` 为准；HTTP 路径、字段、状态码、请求头和错误结构只以 `contracts/epig-after-sales/v1/openapi.json` 为正本。本文只描述 E-pig 内部落点，不复制线路定义。

## 背景

E-pig 已有商品、购物车、订单和订单详情页，但没有售后能力。计划边界是：E-pig 承担消费者入口与售后业务数据，中台承担客服工作台、政策检索、审批与工单流转。两边通过 HTTP API 协作，**不共享数据库、不另建独立售后平台**。

## 范围 / 非目标

做（首期）：

- after-sales 业务域：诉求单（消费者提交的售后申请）与工单（中台审批后创建的正式售后单）。
- 消费者与服务两套独立 API 视图：订单 / 物流查询、诉求提交与追加式 feed、工单创建与查询。
- 订单详情页：售后入口（"申请售后"）、真实进度与唯一最终回复展示。

不做（首期）：

- 消费者 AI 自动回复聊天窗、实时客服聊天或追加回复。
- E-pig 内自建客服处理、审批或对账后台。
- 真实退款、自动取消订单、webhook；工单仅记录处理决定与状态。

## 模块落点（遵循现有 Hard Rules）

```text
src/core/contracts/after-sales/                 AfterSalesPort + 内部 DTO（诉求 / 工单 / 回执）
src/adapters/after-sales/mock/                  合成数据，本地与 CI 默认
src/adapters/after-sales/postgres/              持久实现（后续，随订单 postgres 模式）
src/modules/after-sales/                        业务组件：申请售后表单、进度、最终回复
src/app/api/[market]/after-sales/               消费者 Route Handlers：attachments / requests / tickets
src/app/api/[market]/after-sales/service/       DTC 专用 Route Handlers：orders / requests / tickets / attachments
contracts/epig-after-sales/v1/                  原样 vendor 的契约包与 source-lock.json
```

约束：

- `modules` 只依赖 `@/core/contracts/*`，不 import adapters / integrations；adapter 负责 DTO 映射与错误归一化，由 `platform/registry.ts` 装配。
- 所有 request API 按 async 使用；`params` 先 `await`。
- 服务 token（`AFTER_SALES_SERVICE_TOKEN`）只存 server env，进 env schema，禁止 `NEXT_PUBLIC_*`。
- 消费者订单路由和 DTO 保持现有兼容与脱敏边界；service 订单视图由独立 Route Handler 和序列化器映射整数最小货币单位、`order_version` 与脱敏收件人，不能复用消费者响应。
- 售后写操作不进共享缓存；价格、订单、诉求和工单状态 request-time 读取。
- vendor 只能来自 DTC 的不可变源提交；`source-lock.json` 记录源提交、逐文件 SHA-256、同步时间和双仓 Issue/PR，禁止直接编辑 vendor 副本。

## API 与权限

具体接口和 wire 错误直接执行 OpenAPI 与共享 fixtures，本文不另列路由或错误码。实现边界如下：

- 消费者身份只来自已验证的签名 `epig_cart_{market}` Cookie：校验签名、有效期和精确市场，从稳定 `cart_id` 检查订单、诉求、工单和附件归属。Cookie 合法不等于同市场任意订单都属于该消费者；越权按 `not_found` 处理。
- DTC 服务接口统一位于 `/service/` 边界，使用 Bearer 凭证并绑定允许市场列表；不得与消费者 Cookie、DTO 或附件下载路由混用。
- 诉求同步使用包含所有当前状态的追加式 feed、连续已提交高水位和游标；不得增加 `status=pending` 偏移过滤。发布序号与业务记录同事务分配和提交，回滚不能留下永久阻塞高水位的序号空洞；v1 不裁剪 feed 历史。
- DTC 是审批权威。E-pig 保存实际收到的 `approval_id/draft_version/policy_version/order_version` 作为审计值，不另验 DTC 审批版本；只在创建事务中校验自身当前 `order_version`、诉求状态和业务约束。
- 消费者创建诉求与 DTC 创建工单都遵循契约的规范化参数指纹、原子唯一约束和幂等作用域。重放返回原业务对象的**当前表示**及契约规定的 replay 标记；不确定结果先按原幂等键查询，`202 IN_FLIGHT` 与 `404` 均不得被解释为可以换键重建。
- 工单、不可变最终回复、回执、幂等结果及诉求状态在同一事务落库；附件指纹按契约规范化，缺失附件列表等同空列表，指纹前按附件 ID 排序。

## 页面（消费者侧）

- 订单详情页增加"申请售后"入口：问题类型 + 描述 + 附件，提交后展示 `request_id` 与待处理状态。
- v1 每个诉求最多 3 个 JPEG/PNG/WebP 文件，每个不超过 5 MiB；上传与内容读取分别校验订单和稳定消费者主体归属，文件进入私密存储，不生成永久公开 URL。
- 进度区只展示 E-pig 真实持有的诉求与工单业务状态，以及创建工单时写入的一条不可变最终回复；无实时聊天、内部审批状态或追加回复入口。
- 组件按组件流程规范落文件夹契约（tsx + md + spec），高频/有状态组件一并补 stories。

## Review 与剃刀裁决

2026-11-05 已由本机 Codex CLI 对 DTC 已提交/未提交改动及本计划做只读 Review，主会话逐条复核后采纳本版修正：独立 `/service/` 边界、追加式高水位 feed、DTC 单一审批权威、原键恢复、不可变 source lock 和共享 fixtures。此前复用消费者订单路由、手写第二套路由/错误语义、`status=pending` 队列、E-pig 校验 DTC 审批版本及开放多轮回复均已删除，不进入实现。

保留 `AfterSalesPort + mock/postgres adapter` 是为了沿用本仓依赖方向并提供本地/CI 可控实现，不再增加第二套售后平台或通用工作流抽象。消费者真实进度是产品蓝图要求，不视为过度设计；仅展示 E-pig 自有 request/ticket 状态和唯一最终回复，不暴露 DTC 内部审批或对账状态。权限、幂等、连续高水位、`order_version`、DTO 白名单和附件隔离都有明确故障或验收依据，不以“简化”为由删除。

本文仍是 proposal；上述 Review 只修正计划，不表示 vendor、Route Handler、adapter、页面或联调已经实现。

## 测试策略

- 原样执行共享正反 fixtures，并校验 vendor digest、源提交、生成物新鲜度及 wire 主版本；不支持的主版本必须失败关闭。
- contracts / DTO / 幂等与状态逻辑：Vitest `.spec.ts`（node）。覆盖消费者与 service DTO 隔离、非空白文本、诉求状态与 `ticket_id` 一致性、缺失/重排附件的相同指纹、同键当前表示重放及不同指纹冲突。
- Route Handlers：集成级 Vitest，覆盖 Cookie/订单/附件归属、跨市场、服务 token、重复提交、版本冲突、未知订单及私密附件类型/大小/内容读取。
- feed 与建单事务：覆盖序号分配后回滚、乱序提交、非空末页游标、历史重放、并发 `(market, request_id)` 唯一约束、`IN_FLIGHT` 查询和迟到请求恢复。
- 页面组件：`.spec.tsx` 断言可见行为（提交后状态、真实进度与唯一最终回复），不出现内部审批或追加聊天入口。
- 全部 co-located；行为变更与测试同 patch，交付附 AI Test Record。共享 fixtures 通过不等于数据库并发和真实联调已通过。

## 任务拆解

### 阶段 1：契约 vendor 与验证门禁（2026-11-05，阶段范围已验收）

不可变源固定为 DTC 提交 `2dc37231946b24e00f27c09111fba346a5affc90`，源目录为 `contracts/epig-after-sales/v1/`；源 `SHA256SUMS` 文件自身 SHA-256 为 `b27f002fc639f0e5fee730651fdbf18c515a51a04de41324e6cfdf930f626752`，包含 13 个操作、49 个共享 fixtures 和 51 个契约文件。旧提交和旧 digest 不得用于本次 vendor。

开发计划：

1. 先核对本仓 package scripts、依赖和测试约定，复用现有工具，不新增通用契约框架。
2. 从上述不可变提交原样 vendor 完整契约包，保留 OpenAPI、fixtures、二进制附件和 `SHA256SUMS`；禁止手工编辑 vendor 内容。
3. 新建最小 `source-lock.json`，记录源仓库、完整提交、跟踪源分支、契约版本、源路径、源 sums digest、逐文件 SHA-256、同步时间和双仓 Issue；source lock 自身不属于上游 bundle。
4. 提供显式 sync/check。sync 只能接受不可变提交，不得跟随分支或硬编码本机路径；check 只读，不得隐式改写 vendor、source lock 或生成物。独立 freshness 检查显式比较跟踪源并在源前进时报告陈旧，普通测试和构建不得隐式联网。
5. 检查缺失、额外、内容漂移、错误 digest、source lock 不一致、跟踪源前进和生成物过期；原样解析并执行 49 个共享 fixtures 的适用正反断言及二进制 digest，不能只生成 TypeScript 类型代替运行时检查。
6. 按现有脚本结构把契约检查纳入 `pnpm verify`，不绕过既有 lint、类型检查或测试。

测试计划：

- 正向：完整 vendor/source-lock/digest/fixtures/freshness 检查通过，`pnpm verify` 实际运行并记录结果。
- 负向：只在隔离临时副本中注入缺文件、额外文件、内容/digest 漂移、无效 source commit、跟踪源前进和损坏 fixture，检查必须失败且不修改正式 vendor。
- 复核 49 个 manifest 项无游离/缺失文件，响应版本头、状态码、安全 DTO、非空白文本和状态联动按各 fixture 的既有语义执行；68 字节 PNG 样例同时校验内容和大小。
- Review 最终 diff，确认没有服务 token、原始 Cookie、本机绝对路径、真实客户数据或手写第二套线路 Schema。

非目标：本阶段不实现 AfterSalesPort、adapter、Route Handler、页面、数据库事务或真实联调，不调用真实外部写入。Codex 返回实际文件、命令、通过/失败结果和未验证范围，由 Claude 审查后决定是否验收；Codex 自测不等于最终验收。

执行状态（2026-11-05）：**Codex 实施完成，Claude 阶段范围验收通过；完整 `pnpm verify` 仍有既有本地环境阻塞。**

- 已从 DTC 不可变提交 `2dc37231946b24e00f27c09111fba346a5affc90` 原样 vendor 51 个文件；Claude 独立按字节比对上游 archive、vendor 和 source lock，全部一致。`SHA256SUMS` 自身摘要为 `b27f002fc639f0e5fee730651fdbf18c515a51a04de41324e6cfdf930f626752`。
- 显式 `sync`、只读 `check` 和独立 `freshness` 已实现；普通检查不联网、不改写 vendor 或 lock。13 个操作、49 个 manifest fixtures、二进制内容/大小及关键 OpenAPI 安全语义均纳入运行时检查。
- Codex 与 Claude 分别运行契约正向检查和 17 个隔离负向测试，均通过；freshness 通过。`pnpm typecheck`、`pnpm lint`、`pnpm test`（64 个文件、476 个测试）、happy-dog（22 个测试）和 8 个 harness evals 通过，`git diff --check` 通过。
- 完整 `pnpm verify` 已实际运行但退出码为 1：上述步骤全部通过后，最后的既有 `agent-doctor` 因本机缺少 `../DTC-skills`、20 个已跟踪 DTC skill 软链无法找到 `SKILL.md` 而失败。本阶段没有修改这些软链、doctor 或其安装清单；文档记录的另一实际源路径也不存在。因此这里只验收阶段实现，不宣称完整仓库门禁全绿。恢复该本地依赖后仍需重跑完整 `pnpm verify`。
- 本阶段未实现 AfterSalesPort、adapter、Route Handler、页面、数据库事务或真实联调，未执行部署或真实外部写入。

- [x] vendor OpenAPI 与共享 fixtures，建立不可变 `source-lock.json`、digest/freshness 检查和 `pnpm verify` 门禁（完整 verify 的既有 DTC-skills 环境阻塞见上）
- [ ] contracts：AfterSalesPort、诉求 / 工单 DTO、消费者与 service 序列化边界、错误映射
- [ ] mock adapter + fixtures（与 catalog 商品对齐的合成订单诉求）
- [ ] 消费者 Route Handlers：附件上传/读取、诉求创建/读取、本人工单读取
- [ ] service Route Handlers：订单/物流、附件内容、追加式诉求 feed/detail、工单创建/按 ID/按幂等键查询
- [ ] 持久事务：连续发布高水位、原子幂等与 `(market, request_id)` 唯一约束、不可变回复和回执
- [ ] 订单详情页售后入口、真实进度与唯一最终回复组件
- [ ] 按产品蓝图 `AS-ACC-*` 完成中台 EpigConnector 联调与故障演练，结果回写 DTC Issue #2 和 E-pig Issue #2
