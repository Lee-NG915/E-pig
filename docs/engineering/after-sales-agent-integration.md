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
- [x] contracts：AfterSalesPort、诉求 / 工单 DTO、消费者与 service 序列化边界、错误映射
- [x] mock adapter + fixtures（与 catalog 商品对齐的合成订单诉求）
- [x] 消费者 Route Handlers：附件上传/读取、诉求创建/读取、本人工单读取
- [x] service Route Handlers：订单/物流、附件内容、追加式诉求 feed/detail、工单创建/按 ID/按幂等键查询
- [ ] 持久事务：连续发布高水位、原子幂等与 `(market, request_id)` 唯一约束、不可变回复和回执
- [ ] 订单详情页售后入口、真实进度与唯一最终回复组件
- [ ] 按产品蓝图 `AS-ACC-*` 完成中台 EpigConnector 联调与故障演练，结果回写 DTC Issue #2 和 E-pig Issue #2

### 阶段 2：AfterSalesPort、序列化边界与 mock adapter（2026-11-05，阶段范围已验收）

目标：建立唯一内部售后端口及 DTO，以显式白名单序列化器消费 vendored OpenAPI，并提供可用于本地和后续 Route Handler 集成测试的有行为 mock。内部类型和 Zod 都不是新的线路 Schema 正本，禁止修改 vendor 或另写一套线路定义。

内部契约设计：

1. 在 `src/core/contracts/after-sales/` 定义 `AfterSalesPort`、camelCase 内部 DTO 和 typed error。端口覆盖诉求创建/读取、消费者工单读取、附件上传与授权内容读取、service 订单/物流、feed/detail、工单创建/按 ID/按幂等键查询；消费者与 service 两条附件线路共用一个显式 principal 的内容读取方法，不复制领域逻辑。
2. 创建诉求与创建工单返回业务对象及 `replayed` 标记，供后续 Route Handler 选择 200/201 和 replay header。按幂等键查询返回明确的 ticket / in-flight / 当前不可见联合结果；“当前不可见”不得被解释为永久不存在。HTTP 版本头、Cookie/Bearer、状态码和请求体重校验不在 port 内实现。
3. 内部订单金额使用整数最小货币单位；request 只使用线路所需的 `pending / ticket_created`，不复制 DTC 草稿、审批、执行或对账状态。ticket 保存实际收到的审批/版本审计值，但 E-pig 不独立验证 DTC 审批。私密附件内容、稳定 `cartId` 和订单归属只留在内部，不进入公开 metadata。
4. 规范化指纹固定覆盖 OpenAPI 指定字段：消费者附件缺失等同空数组、指纹前排序；工单包含 request/action/reply/draft/approval/policy/order-version。键按市场、已认证主体和操作隔离。游标采用市场绑定、可校验的 base64url 稳定位置，拒绝损坏、跨市场或越过当前高水位的位置。
5. 在 adapter 层提供独立 consumer/service 纯序列化函数，显式列出字段，不直接返回领域对象。消费者 request/ticket/receipt、错误、收件人与 service 订单必须剔除审批/版本审计、完整地址、原始凭据、附件字节和存储字段；service 输出保留契约要求的审计值。纯错误映射保留稳定 code、安全 message、request ID、retryable、recovery action 和允许details，未知错误失败关闭为安全内部错误。
6. mock 使用与现有 catalog 可解析商品/变体对齐的合成订单，不写真实客户数据或完整地址。实现私密字节读取、类型/大小/数量/归属校验、同键当前表示重放、不同指纹冲突、单诉求单工单、当前订单版本守卫、连续发布序号和可重放 feed。输出克隆，日志只含内部关联 ID，不含描述、回复、附件字节或秘密。
7. 按现有 typed registry 装配 mock，本地与 CI 可直接使用；生产 mock 必须有明确告警且不得被描述为真实售后能力。本阶段不新增 adapter 选择框架或服务秘密配置，等真实 adapter / Route Handler 阶段再扩展。

开发计划：

- 先写核心指纹、游标、序列化与错误映射测试，再实现核心类型和纯函数。
- 再实现 mock 的串行/并发行为及 registry 装配，复用现有 AppError、Market、Logger 和测试风格，不新增通用工作流或依赖。
- 以共享 fixtures 对照序列化结果和错误语义；mock 自己生成的数据可以与 fixtures 不同，但字段形状和安全白名单必须一致。
- 保持阶段 1 的 vendor、source lock 和契约检查不变；发现契约缺口停止相关实现并交回 Claude，不得单边改契约。

测试计划：

- 核心纯函数：缺失/空/重排附件指纹一致，业务字段变化冲突；损坏/跨市场/未来游标失败；合法游标稳定；各错误码、恢复动作、敏感 cause/堆栈消毒。
- 序列化：与适用共享正反 fixtures 对照；向领域对象故意注入审批字段、完整地址、存储 URL、附件字节和诊断对象，消费者与安全 DTO 不得泄漏；service 金额、审计值和时间形状正确。
- mock：AU/US/SG 合成订单与 catalog 对齐；JPEG/PNG/WebP magic、5 MiB、3 文件、伪造类型、跨主体/订单/市场读取；空白描述、失效/未知附件。
- 幂等与状态：同键同指纹串行/并发只创建一个对象；工单创建后重放诉求返回当前 `ticket_created`；同键不同指纹、不同键同诉求不同指纹、订单版本冲突均不产生部分写入；回复不可变。
- feed：失败不消耗序号，并发成功序号连续，状态更新不新增项，历史项保留 `ticket_created`，多页、重复页、空页、非空末页游标与 `has_more` 正确。
- 查询恢复：进行中返回 in-flight，成功后按原键返回原工单，当前不可见有显式结果；不得把它当作换键重建许可。
- 实际运行相关 Vitest、`pnpm typecheck`、`pnpm lint`、契约 Node 测试与 check、`pnpm verify`、`git diff --check`。完整 verify 的既有 DTC-skills 环境失败必须单独报告，不能写成全绿。

非目标：不实现 Route Handler、Cookie/Bearer middleware、Postgres 事务、页面、真实私密存储、真实联调或真实外部写入。mock 的并发测试不等于数据库原子事务验收；本阶段完成也不代表 `AS-ACC-001～015` 已通过。

执行状态（2026-11-05）：**Codex 实施及首轮返工完成，Claude 阶段范围验收通过；完整 `pnpm verify` 仍有既有本地环境阻塞。**

- `AfterSalesPort` 以 12 个领域方法覆盖 13 个 HTTP operation，消费者/service 附件内容读取共用领域方法。内部 DTO、typed error、规范化指纹、稳定游标、consumer/service 白名单序列化、mock adapter 和 typed registry 已落地。
- 首轮验收发现订单级附件上限和终态工单可重开两项问题，Codex 已最小返工：上传不再按订单计数，诉求仍最多引用三个附件；工单只允许 `open→processing`、`open→closed`、`processing→closed`，`closed` 为终态。关闭后同键重放返回当前 closed 视图，非法迁移不产生写入。
- Claude 独立复跑聚焦测试 7 个文件、62 个测试通过；契约 Node 测试 17/17、13 个操作、49 个 fixtures 和 51 个 vendor 文件检查通过。Codex 全量 Vitest 71 个文件、538 个测试通过，typecheck、lint、happy-dog 22 个测试、8 个 harness evals 和 `git diff --check` 通过。
- 全部 `expected_valid` 的共享 ErrorResponse fixtures 已参数化执行，保留 code、request ID、retryable、recovery action 和白名单 details；敏感字段、绝对本机路径和硬编码秘密扫描未发现本阶段新增问题。
- 完整 `pnpm verify` 已实际运行但仍在最后的既有 `agent-doctor` 因本机缺少 `../DTC-skills`、20 个 DTC skill 软链找不到 `SKILL.md` 而退出 1，不宣称完整仓库门禁全绿。
- 本阶段未实现 Route Handler、真实 Cookie/Bearer、Postgres 原子事务、页面、真实私密存储或真实联调；mock 通过不等于数据库事务或 `AS-ACC-001～015` 验收。
- 阶段 2 已于 2026-11-05 以 `1980a77c1f00cea6dd34eff7ee30d60f1a0ce7b3` 提交并推送到 `after-sales/agent-integration`；远端回读一致，推送后工作区干净。双仓 Issue #2 已回写。

### 阶段 3：消费者 Route Handlers（2026-11-05，阶段范围已验收）

目标：只实现 `uploadAttachment`、`getAttachmentContent`、`createAfterSalesRequest`、`getAfterSalesRequest`、`getConsumerTicket` 五个消费者 operation。Route Handler 负责 HTTP 校验、认证、防跨站写入、状态码与响应头；业务归属、附件规则、幂等和当前表示继续由已验收的 `AfterSalesPort` 负责。成功 body 直接是 OpenAPI 的 attachment/request/ticket DTO，不增加 `{ data: ... }`、`{ request: ... }` 等包装。

内部落点：

1. 在 `src/platform/http/` 新建消费者售后 HTTP handler，复用 `readCartCookie`、现有 `MarketId`、Zod、wire serializer 和 typed error；在 `src/app/api/` 建立单一 composition root，从 server env 读取 `MARKET/APP_ORIGIN/CART_COOKIE_SECRET`，每次请求从 `getCapabilities().afterSales` 取端口。不得新增通用路由器、第二套身份系统或 service token 配置。
2. 新建五条薄 Route Handler：`attachments/route.ts` POST、`attachments/[attachmentId]/content/route.ts` GET、`requests/route.ts` POST、`requests/[requestId]/route.ts` GET、`tickets/[ticketId]/route.ts` GET。所有 `params` 先 `await`；不在消费者路径下实现 `/service/`。
3. 所有请求必须带精确的 `X-After-Sales-Contract-Version: 1`，缺失或其他值返回 400 `UNSUPPORTED_CONTRACT_VERSION`，details 只含 `supported_major: "1"`。所有 JSON/二进制成功和错误响应带同一版本头、`Cache-Control: private, no-store, max-age=0`、`Vary: Cookie`、`X-Content-Type-Options: nosniff`。
4. 消费者身份只从验证后的 `epig_cart_{market}` Cookie 构造 `{ kind: "consumer", market, cartId }`。缺失、签名无效、过期或跨市场 Cookie 返回 401 `UNAUTHORIZED`；非法 market 路径返回 400，合法但非本进程服务市场返回 404；消费者订单/诉求/工单/附件归属失败统一 404 `NOT_FOUND`，不能用 body、query 或原始 Cookie 文本指定主体。
5. POST 继续执行既有可信 Origin 与 `Sec-Fetch-Site` 防跨站边界；缺失/不配置 `APP_ORIGIN`、缺失/过短 Cookie secret 必须失败关闭为安全 500，不进入 port。跨站请求在调用 port 前拒绝为 401 `UNAUTHORIZED`；403 `FORBIDDEN_MARKET` 只保留给契约定义的“已认证主体无该市场权限”，不能拿它表示普通消费者归属失败或 CSRF。
6. 诉求创建只接受 `application/json`，限制 64 KiB（覆盖 5000 个 Unicode code point 的原始 UTF-8 或 JSON surrogate-escape 编码及三个最长附件 ID），拒绝非法 JSON、未知字段、空白描述、非法 ID/type、重复或超过三个附件；描述长度按 JSON Schema 的 Unicode code point 计数，不能按 UTF-16 code unit 错拒合法 Unicode 文本。`Idempotency-Key` 只从请求头读取并按 OpenAPI 格式校验，缺失等同校验失败。新建返回 201；同键同指纹重放返回 200 且仅此时增加 `Idempotency-Replayed: true`；同键不同指纹返回 409。
7. 附件上传只接受契约 multipart 字段 `order_id` 和单个 `file`，拒绝额外/重复字段；先检查声明大小，再读取字节，由 mock 继续校验真实 magic、MIME、非空、5 MiB 和订单归属。上传没有幂等键，不伪造重放语义。内容下载返回实际字节和契约允许的媒体类型、清洗后的 `Content-Disposition`，不返回存储 URL、公开永久链接或附件 metadata 包裹。
8. 状态码只按 vendored OpenAPI 映射，不能复用 storefront 的 `kind` 响应形状。`Retry-After` 仅在契约允许且 details 给出非负秒数时输出。错误统一使用 `toWireError` 的白名单结构和服务端 request ID，不复制 Zod 原始错误、堆栈、cause、Cookie、描述或附件内容。
9. 未知写结果的恢复动作按 operation 区分：消费者诉求创建的 500/503 使用 `retryable: false + RETRY_CREATE_WITH_SAME_KEY`；安全 GET 可用 `RETRY_REQUEST`；无幂等键的上传不使用 `LOOKUP_FIRST` 或盲目重建。service 工单创建的 `LOOKUP_FIRST` 留待 service 阶段，不能泄漏到消费者流程。

开发计划：

- 先实现纯 HTTP 输入校验、统一响应/错误映射及消费者 principal，再接五条薄路由；除修复本阶段直接发现的集成缺口外，不改阶段 1 vendor、source lock 或阶段 2 领域语义。
- 集成测试直接调用真实 Route Handler，使用真实签名 Cookie、真实 HTTP handler 和有行为 mock；仅在测试内部用 service principal 创建一张工单，以验证消费者工单视图，不因此提前实现 service Route Handler。
- 复用现有测试中的合成 catalog/订单，不新增生产测试 helper、数据库、页面或真实存储；测试 secret 明确为 fixture，不读取或输出 `.env`。
- 若发现必须修改 vendored 契约才能通过，停止相关实现并交回 Claude；不得单边修改 OpenAPI/fixtures 或把测试改成错误预期。

测试计划：

- 五个 operation 的正向状态、裸 DTO 字段、下载字节和响应头；创建后读取、同键当前表示重放、不同指纹冲突及不重复创建。
- 缺失/错误/过期/跨市场 Cookie、伪造 body 主体、他人订单/诉求/工单/附件、未知资源、非法/非服务市场；所有越权都不能返回受限数据。
- 缺失/错误版本头、非法 key/ID/type、未知 JSON 字段、空白/超长描述、非法 JSON、非 JSON、非法 multipart、重复/额外字段、伪造 MIME、超 5 MiB、四个附件引用；描述必须覆盖 5000 个四字节 Unicode 字符合法、5001 个失败的边界，失败不得产生业务写入。
- POST 的可信 Origin、跨站拒绝和配置失败关闭；所有错误仍带版本/no-store/nosniff，且不含原始错误、Cookie、完整描述、回复或存储信息。
- 500/503 的 operation 恢复动作、429 `Retry-After`、410 附件过期、413/415 和 replay header 精确性；消费者 ticket 不含审批/版本审计字段。
- 实际运行聚焦 Vitest、全量 `pnpm test`、`pnpm typecheck`、`pnpm lint`、契约 Node 测试/check、`pnpm verify`、`git diff --check`。完整 verify 的既有 DTC-skills 环境失败单独记录；mock HTTP 集成不等于 Postgres、真实私密存储、部署或真实 DTC 联调通过。

非目标：不实现 service Route Handler、Bearer、feed、Postgres、页面、真实存储、真实联调、提交或推送。Codex 返回实际 diff、命令、通过/失败结果和未验证范围；Claude 审查后才决定阶段验收。

执行状态（2026-11-05）：任务包和双仓 Issue 计划同步已完成。最初连续三次启动均在 Codex 进程运行前被权限分类服务临时不可用拒绝；第四次启动恢复，后台任务 `byq5sioi5`、Codex session `01a1abbe-12dd-7703-bcc9-6c53b553250c` 完成首轮实施。首轮新增五个真实 Route Handler、HTTP 边界和 32 个集成测试，并修复 Unicode 文件名的 Content-Disposition；Codex 全量 72 个文件、570 个测试通过，typecheck、lint、契约 17/17、happy-dog 22 个测试和 8 个 harness evals 通过，完整 `pnpm verify` 仍仅因既有 agent-doctor/DTC-skills 缺失退出 1。

Claude 独立复核上述检查并审查实际 diff 后，首轮不作验收通过：OpenAPI 的描述 `maxLength: 5000` 按 Unicode code point 计数，首轮 Zod/mock 却按 UTF-16 code unit 计数，且 16 KiB body 上限会拒绝合法的 5000 个四字节字符。已下发最小返工：路由与 mock 统一按 code point 计数，当时 JSON body 上限改为 24 KiB，并通过真实 Route Handler 验证 5000 个 emoji 成功、5001 个失败且不写入。该返工不改变线路 Schema，只修正消费者对既有契约的实现。

最终验收（2026-11-05）：**Claude 阶段范围验收通过。** Codex 返工后，Claude 独立复跑 Route Handler 34 项与 mock 21 项共 55 个聚焦测试通过；最终完整 `pnpm verify` 实际运行，docs、契约 17/17、typecheck、lint、全量 72 个文件/573 个测试、happy-dog 22 个测试及 8 个 harness evals 全部通过，仍仅在最后既有 `agent-doctor` 因 20 个 DTC skill 缺少 `SKILL.md` 退出 1。`git diff --check`、敏感信息/本机路径扫描通过，vendor 目录无改动。阶段 3 尚未提交或推送；service/Bearer、Postgres、页面、真实私密存储、真实 DTC 联调、浏览器 E2E、build 和部署均未验收。

### 阶段 4：service Route Handlers（2026-11-05，阶段范围已验收）

用户已调整后续分工：当前 Codex 负责文档、方案、开发/测试计划、Review、验收验证与最终验收，Claude 负责实现、调试和必要的单元测试。此前阶段执行与验收记录不改写。协作正本为 DTC `docs/guides/ai-collaboration.md` 当前工作区；双仓 Issue #2 已记录本次用户决定。

目标：在现有 mock 上开放 vendored v1 的八个 service operation，供 DTC 后续 Connector 调用。固定源仍为 DTC `2dc37231946b24e00f27c09111fba346a5affc90`；不修改 vendor/source-lock。消费者阶段 3 未提交改动保留，不重置、不混作本轮成果。

方案与文件落点：

- 新建 `src/platform/http/service-after-sales-api.ts`，将 HTTP 校验、Bearer 认证和服务市场授权集中在专用 handler；复用 AfterSalesPort 和 service wire serializers。新建八条 `/service/` 薄 Route Handler，params 先 await。在 `src/app/api/after-sales.ts` 增加独立 service composition root，不能复用消费者身份或 DTO。
- `src/platform/config/env.ts` 增加 server-only `AFTER_SALES_SERVICE_TOKEN` 与 `AFTER_SALES_SERVICE_MARKETS`（逗号分隔的有效市场列表），补 schema 测试。配置可选以保持消费者部署兼容，但 service 请求遇缺失/空白/无效配置必须安全 500；配置 token 至少 32 字符。Bearer 必须精确匹配服务端 token，使用无时序差异的比较；缺失或错误凭证 401。服务 principal 使用稳定 actorId（如 dtc-service），不把 token 当 actorId/日志字段，避免凭据轮换改变幂等作用域。
- 服务请求不依赖 Cookie、Origin 或消费者 cartId；有效凭证但市场不在允许列表返回契约 403；有效授权但非进程 MARKET 返回 404；非法市场 400。所有认证与授权在 port 调用前完成，不能信任请求体中的身份。
- 成功响应使用 OpenAPI 裸 DTO，JSON 与二进制、错误统一返回版本头、private/no-store、nosniff；service Vary 使用 Authorization。版本头精确为 1，错误安全白名单复用 toWireError，不泄漏秘密或原始错误。
- 订单/物流、诉求详情/feed、工单创建与两种查询、附件内容按现有端口实现。feed query cursor/limit、opaque ID、幂等 key、严格 JSON 字段和长度以 OpenAPI 为准；不得另发明线上字段。reply 按 Unicode code point 计数，JSON 大小上限足以容纳最大合法输入；超限按既有契约错误，不引入契约未定义状态。
- 创建工单新建 201、重放 200 且 replay header；同键不同指纹、一诉求多工单、订单版本变化按契约冲突。E-pig 只保存审批审计字段，不自建 DTC 审批校验。写超时或 500/503 使用 LOOKUP_FIRST，不能换键重发；按键查询准确区分 200 ticket、202 IN_FLIGHT 与暂时 404，后两者都指向原键恢复，不声称永久未创建。具体错误字段、retryable/recovery_action 与 Retry-After 以 OpenAPI 和 fixtures 为准。

测试计划与验收：

1. Claude 为八个真实 Route Handler 编写就近集成级 Vitest，使用真实 handler 与现有有行为 mock；覆盖所有成功 DTO/头/附件字节、feed 多页与续读、201/200 重放、当前视图、冲突不写入及按键恢复三态。可以在测试内用 consumer principal 准备合成诉求。
2. 覆盖缺失/错误/畸形 Bearer、Cookie 不能代替 Bearer、市场授权和非服务市场、缺配置失败关闭；拒绝时断言 port 未调用、无数据泄漏。配置测试不得读取 .env。
3. 覆盖版本头、未知/缺字段、非 JSON、非法游标/limit/key/ID、空白/超长 Unicode 回复和最大合法回复、非法请求不写入。确保 service DTO 保留约定审计字段且无完整地址/token/存储字段；消费者既有响应不受影响。
4. 注入 port 错误验证安全错误映射、GET 重试、创建 LOOKUP_FIRST、202/404 原键恢复与 Retry-After。共享 fixtures 原样检查，不能改 vendor 以迁就实现。
5. Claude 执行 typecheck → lint → 聚焦/全量 test，契约 check 与17项隔离测试及 pnpm verify，返回命令退出码、计数和未测边界。完整 verify 的既有 agent-doctor 环境失败单列。
6. Codex 独立审查增量 diff 和关键权限/恢复用例，复跑聚焦测试、类型/静态检查及契约门禁，根据实际证据作通过/不通过/有条件通过结论。mock HTTP 通过不代表 PostgreSQL 事务、真实存储、部署或 AS-ACC 全体验收。

非目标：Postgres、消费者 UI、DTC Connector、真实外部写入、密钥读取、提交推送、修复 DTC-skills 环境、通用路由框架或无关重构。Claude 发现契约缺口须停止相关实现交回 Codex。

阶段 4 最终验收（2026-11-05，当前 Codex）：**阶段范围通过；完整仓库 verify 未通过。**

- Claude session `bb93fb9a-eea6-4391-9701-4f8f8014513f` 使用 `--permission-mode auto` 完成实现与测试，未提交推送。新增八个 service operation、独立 Bearer/市场授权、server-only 配置、service feed serializer 和集成测试。凭据通过 SHA-256 后 timingSafeEqual 比较，principal 使用稳定 `dtc-service`，Cookie 不能代替 Bearer；缺配置在请求时失败关闭。
- Codex 审查专用 handler、配置、composition root、路由、wire 与 mock 增量以及鉴权/恢复测试；未发现本阶段阻断项。工单回复与版本长度按 Unicode code point 校验，JSON 上限 128 KiB，覆盖 10000 emoji 的原始与 surrogate-escape 编码；消费者既有逻辑保留。
- Codex 实际执行 `pnpm typecheck`、`pnpm lint`、service/consumer HTTP + env + wire 四文件聚焦测试，退出 0，**72/72** 通过；`node scripts/after-sales/contract.mjs check`、`node --test scripts/after-sales/contract.spec.mjs`、`git diff --check` 均退出 0，契约 **17/17**，13 operations / 49 fixtures / 51 files 与固定源一致。
- Claude 返回的实际全量执行记录为 **73 文件 / 600 tests**，happy-dog 22、harness 8 通过；完整 `pnpm verify` 退出 1，仍因既有 20 个 DTC skill 缺少 SKILL.md。全量结果是实现方报告，Codex 本轮独立复跑范围见上一项；不把完整 verify 写成全绿。执行报告保留于本机临时文件，不含真实客户数据；临时文件非持久证据，后续需复算可重跑上述命令。
- AI Test Record：行为为八个 mock-backed service HTTP 接口；新增/更新 service HTTP、env、wire 和 mock 测试；阶段检查通过，完整 verify 为 PARTIAL。AI Review Record：Codex 关注身份隔离、市场、白名单、幂等当前视图、202/404 原键恢复与未知写 LOOKUP_FIRST；无本阶段阻断项，数据库原子事务和真实网络故障不在本次证明范围。
- 未验证：PostgreSQL 原子事务/并发、真实附件存储、DTC Connector 联调、浏览器 E2E、build/OpenNext、部署与完整 AS-ACC。阶段 3 和本阶段均保持未提交推送，不改变此前验收执行者。
- 下一步：按现有路线规划 Postgres adapter/迁移及事务测试，之后推进页面与 DTC Connector；本次验收不授权自动开始真实写入或部署。

提交前复核（2026-11-05，Codex）：独立只读审查发现消费者 24 KiB 上限遗漏 JSON surrogate-escape 膨胀：5000 emoji 的合法转义输入为 60061 字节。Claude 使用 auto 模式最小返工为 64 KiB，并新增真实路由 5000 转义字符成功回读、5001 拒绝且零写入回归；原始 Unicode 用例保留。此前 24 KiB 的阶段 3 结论仅保留历史，本次修复后才覆盖该编码形式。Codex 独立复跑 typecheck、lint、两套 HTTP 集成测试 **58/58**、固定源契约检查和 diff-check 全部通过；修复前完整 verify 已由 Codex 独立执行，600 测试及其他步骤通过，最终仅因既有 agent-doctor 环境失败退出 1。未重复把修复前600全量数写成本轮602实际全量结果。

独立 Review 其余未发现权限/恢复阻断项；两个专用 handler 与薄路由沿用既有分层，未新增通用路由器、工作流或依赖，未发现需要进一步抽象的依据。阶段3/4及最小返工可以提交，README 无关改动保留。范围验收不代表所有现实缺陷不存在，也不代表完整 verify、生产或跨仓验收通过。
