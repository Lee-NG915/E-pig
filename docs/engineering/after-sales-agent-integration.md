---
status: proposal
last-modified: 2026-11-06
register: engineering
---

# 售后域建设与售后中台对接方案

对接仓库：`Lee-NG915/dtc-support-agent`（FastAPI + LangGraph 售后中台，下称"中台"）。产品行为以该仓库 `docs/architecture/modules/after-sales/product-blueprint.md` 为准，跨仓协作语义以 `epig-contract.md` 为准；HTTP 路径、字段、状态码、请求头和错误结构只以 `contracts/epig-after-sales/v1/openapi.json` 为正本。本文只描述 E-pig 内部落点，不复制线路定义。

## 当前交付状态（2026-11-06）

阶段1～5b已推送并完成各自范围验收；阶段5c真实PG多连接和环境收敛已范围验收，并以 `dc80e637b847907700f33b0f9195329951a6c5d8` 推送，远端SHA已回读一致。阶段3/4、5a、5b提交分别为8438254、bdfc9fb、d162859，交付记录为a72371f。下文历史“计划/未提交/环境失败”保留为当时事实，以本节和最新阶段记录判断当前状态。

消费者5个及service8个Route Handler已实现，运行时仍用mock。持久adapter已通过PGlite和隔离PostgreSQL16多连接测试，但尚未切换registry或执行线上迁移；专用PG测试与普通verify由Codex独立复跑通过，旧agent-doctor技能环境阻塞已消除。当前锁定源只在[source-lock](../../contracts/epig-after-sales/source-lock.json)维护；本章因DTC文档/环境提交前进进行显式源交接，51契约文件、摘要和版本均未改变，不是线上契约变更。下一步5d做显式迁移、adapter切换与HTTP验证；消费者页面、DTC Connector/持久审批和完整跨仓旅程尚未完成。

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
- [x] 隔离持久实现：连续发布高水位、原子幂等与 `(market, request_id)` 唯一约束、不可变回复和回执（PGlite范围，真实PG多连接/运行时接入未验收）
- [ ] 真实PG多连接故障验证、显式迁移及持久adapter运行时接入（阶段5c/5d）
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

### 阶段 5a：持久诉求发布基础（2026-11-05，阶段范围已验收）

目的：先证明进程重启后诉求仍可读，以及发布回滚不消耗高水位，再接完整 Postgres AfterSalesPort。由 Codex 设计与验收、Claude auto 模式实现。基线为阶段3/4本地提交 `8438254`，固定源契约不变。

采用最小专用存储模块，复用现有 CommercePool/query/transaction 和 PostgreSQL；不建通用 repository、任务框架或新依赖。只新增 `scripts/database/002-after-sales-requests.sql`、`src/adapters/after-sales/postgres/request-store.ts` 及就近 `.spec.ts`。不改 registry、HTTP、env、现有订单表或原迁移脚本，不执行外部数据库迁移；完整 adapter 将来显式接入。

存储设计：一张每市场发布计数器表，一张诉求表。诉求表保留 id、market、稳定 consumer/cart 主体、order_id、creation_key、fingerprint、sequence 和 request JSONB；主键/唯一约束保证 ID 唯一、(market,cart_id,creation_key) 唯一、(market,sequence) 唯一，sequence用bigint且正数。计数器非负。JSONB为当前内部 AfterSalesRequest；不存token、地址或附件字节。不建立未来工单、审批、事件或私密存储表。

模块仅三个行为：发布已验证的诉求、按市场和稳定主体与创建键查当前表示、按市场和数字位置/limit读取feed。接口是adapter内部存储，不是线上DTO正本，不负责HTTP身份/业务/附件校验。发布接受内部AfterSalesRequest及cartId/key/fingerprint，序号由DB覆盖分配，返回request/replayed。使用每市场计数器行锁在同一事务序列化发布；先锁后查键，同键同指纹返回当前对象，同键异指纹使用既有typed IDEMPOTENCY_CONFLICT。新发布分配序号并存记录，一并提交；失败回滚不耗号。新市场初始化须并发安全。禁止nextval、MAX+1或网络调用持锁。不存在按键返回null，不能把null解释为允许换键。不要引入假in-flight状态。

feed接受可信内部数字位置字符串（验证非负十进制，超过高水位失败）及1..200 limit，返回已有内部ServiceRequestFeed；复用当前游标编码工具，不造第二套cursor。高水位和页面在一致读快照中读取（单条SQL或REPEATABLE READ），读当前JSONB表示并强制sequence来自列；非空末页nextCursor可继续，空页保持有效位置。不删除历史。当前阶段无状态写入方法，不提前建工单；后续工单事务需要在同一数据库中更新当前表示。

测试计划：使用现有PGlite真实SQL及串行连接lease，明确不证明外部Postgres多连接并发。验证幂等DDL重复执行、发布读回、同键同指纹重放不增号、同键异指纹冲突、主体/市场隔离、ID冲突导致事务回滚后下一条序号连续、多页与非空末页/空页、无效位置/limit。用文件支持的PGlite关闭重开及重建store验证真实持久读取；不得把重建对象的内存测试称为数据库重启。迁移与存储都只在隔离合成数据库执行。

Claude先运行typecheck→lint→相关测试及契约check，返回证据；Codex独立Review与复跑。未完成完整adapter/订单映射/附件/建单事务/真实PG并发，不宣称Postgres上线或完整AS-ACC通过。此阶段完成不自动提交推送，返回Codex验收。

阶段5a最终验收（2026-11-05，Codex）：**阶段范围通过**。Claude auto新增002 SQL、request-store与spec三个文件，没有修改运行时接入、旧迁移脚本或契约。独立Codex只读Review确认两表/三个存储行为无额外框架，counter行锁覆盖查重与分配，回滚不耗号，feed单语句一致快照；发现超PG bigint位置先抛22003的问题，Claude最小返工在SQL前返回INVALID_CURSOR并补两类越界回归。返工中首次BigInt字面量不兼容target的类型检查失败，改为BigInt构造后通过，失败历史保留。

Codex实际独立复跑typecheck、lint、request-store **11/11**（包含文件PGlite关闭重开、回滚后连续序号、幂等/市场主体隔离和分页）、契约check、docs:check、diff-check均退出0。Claude返工前全量为74文件/612测试，返工后聚焦11通过，不把新增1测试倒算成613全量已运行。完整verify既有agent-doctor阻塞未修复；本阶段不接HTTP/registry，不执行真实数据库迁移、不证明外部Postgres多连接并发。阶段3/4已本地提交8438254；无关README仍保留，未推送。

AI Test Record：持久发布基础与SQL约束，新增11项就近测试；上述Codex实际命令通过，完整仓库门禁仍受既有环境失败限制。AI Review Record：独立Codex审查事务/快照/幂等/边界及抽象规模，溢出缺陷已修复并复验；无本阶段剩余阻断项。后续需设计完整Postgres adapter、可信订单版本映射、附件私密存储及建单/回执原子事务，再切换registry并开展真实多连接故障验证；不将本阶段称为完整售后持久化完成。

### 阶段5b：完整持久adapter（2026-11-06，阶段范围已验收）

基线bdfc9fb；Claude auto实现及必要测试，Codex Review/验证/最终验收。固定源2dc3723不变，不改vendor。目标是完成可注入隔离数据库的AfterSalesPort，不接registry/env，不执行真实迁移/写入/支付，不提交推送。保留无关README。复用现有pool/transaction/request-store/fingerprints/cursor/typed errors，无新依赖、审批系统、任务框架或通用存储抽象。

文件落点：新增003 SQL及postgres/after-sales.ts（过长时只按order mapping与业务adapter拆两个明确职责文件）及就近spec。允许最小扩展request-store使publish可在调用者现有事务中执行（一个专用函数接CommerceQuery，既有store.publish仍用transaction，禁止嵌套事务或假pool）。允许CartLine增加可选sku和commerce postgres reprice填充真实variant.sku，补原commerce回归；新订单保留sku，旧订单不补造。

数据与订单：只读commerce_orders，使用行列id/market/cart_id校验当前主体；禁止外部查询替换已付款订单快照。service order映射整数分金额、现有paid状态、时间和版本，版本由服务端对规范排序后的完整存储订单快照SHA256派生（含所有业务变化，不用客户端字段）。order.items的sku必须来自快照，缺sku/无效金额或currency/不一致total失败为安全UPSTREAM_UNAVAILABLE，不能回查当前catalog伪装历史。当前sandbox税/运费为0且total=subtotal-discount，验证该不变量；无subtotal时可从已付款lines合计，仍核对总数。recipient只输出脱敏姓名、国家、地区及部分掩码邮编；无完整地址/邮箱/电话。没有真实物流表，getServiceOrderShipment验证订单存在/授权后返回NOT_FOUND，不生成假物流。旧订单缺必要快照字段的限制必须测试并报告。

新增表仅附件、工单和工单幂等键记录：附件存id/market/order/cart归属、私有bytea与metadata/expiry，最大5MiB、JPEG/PNG/WebP magic+MIME匹配，非空；文件名清洗code point<=255。不公开URL，不落日志内容。不做无根据加密/对象存储SDK框架。上传绑定真实本人订单，每诉求最多3附件而非每订单上限。附件到期读410，越主体/订单/市场404；service凭证和允许市场单独验证。引用附件缺失=空数组、排序与指纹复用既有函数。查看诉求时按可信now计算当前附件expiry状态，过期不改发布序号。

工单表以market/request_id唯一，并关联after_sales_requests；不可变reply/audit/receipt保持在JSONB，关系字段id/market/request/order用于约束与归属。幂等键表以market/actor/key唯一，保存fingerprint与ticket_id，指向同一业务工单。不要另建审批或事件表。createTicket在单事务按固定锁顺序：市场counter行锁（和发布一致）→request FOR UPDATE→真实commerce订单FOR SHARE（或FOR UPDATE）。先检查已有幂等键：同指纹返回工单当前表示，异指纹409，不用旧订单版本阻止已经成功的重放。新键对已建单诉求按既有mock行为复用/冲突；只有同完整指纹可关联原工单，不能创建第二张或修改回复。新建须验证当前order_version、当前pending及业务/附件有效；E-pig只保存DTC审批审计值，不验证DTC审批。工单、reply、receipt、键记录和request.ticket_created/ticketId/progress/data更新同事务，发布sequence不增加。失败不得部分落库。

findTicketByIdempotencyKey只看当前市场+稳定actor，已提交返回ticket，不可见返回currently_unavailable；单事务未提交对外不可见，不伪造IN_FLIGHT，也不能把404当永久不存在。真正多连接进行中行为留外部PG验证，HTTP现有202分支保留。有授权的consumer只能读本人ticket，service只能读允许市场。所有方法验证principal，不能依赖HTTP层已经做了身份校验。输入长度按Unicode code point、非空白、key/ID与状态遵从现有contract和mock。

测试：真实SQL PGlite，复用现有隔离lease池，先执行001/002/003，合成commerce订单含sku。覆盖全部12领域方法：真实订单归属/版本/金额/脱敏，缺sku失败、无物流404；附件magic/type/大小/expiry/多次上传/跨主体订单；创建诉求附件和幂等重放/冲突/连续feed；建单后重放返回当前状态与consumer脱敏；stale版本拒绝、不同key同request避免重复、回复不可变、键恢复当前不可见。注入SQL事务失败（测试pool边界）验证工单插入后request更新前失败全部回滚，再原键恢复仅一工单；重建adapter及文件PGlite关闭重开仍能读工单/回执与feed。测试不冒充真实PG多连接并发。最小新订单sku回归有用，不改既有金额逻辑。

Claude运行typecheck→lint→聚焦/全量tests，contract check/17隔离tests，docs check/diff check；verify既有环境问题单列，禁止修改doctor绕过门禁。返回文件/命令/失败/未测范围供Codex验收，方案或契约缺口立即报告；实现报告不等于最终验收。

阶段5b最终验收（2026-11-06，当前Codex）：**阶段范围通过，完整verify因既有本机技能环境失败未全绿。** Claude以auto完成12方法持久AfterSalesPort、003三表迁移、真实订单映射/快照版本、附件bytea、建单/回执/诉求同事务；最小扩展request-store以复用调用者事务及新订单SKU快照。未接registry/env/HTTP，不执行外部迁移或真实写入。

独立Codex Review发现新key同指纹复用已有ticket时遗漏key关联，导致成功后按key仍404且key可被另一诉求复用；Claude同事务补存关联，补查询/不同指纹/跨诉求冲突/adapter重建及文件数据库重开回归。原审查者只读复查关闭，无新增抽象。首轮Claude629全量是修复前记录；返工后16项adapter和150项关联回归通过。

Codex返工后独立完整`pnpm verify`：docs、契约17/17、固定源13操作/49fixtures/51files、typecheck、lint、**75文件/630测试**、happy-dog22、harness8全部通过，最终agent-doctor仍因20个既有DTC skill缺SKILL.md退出1；diff-check通过，vendor/source-lock无改动。未把该环境失败隐藏或视为完整verify成功。AI Test Record：覆盖12方法、归属、附件、订单快照失败关闭、回滚、幂等与文件持久恢复；AI Review Record：关注事务锁序、版本、DTO隔离、恢复和抽象规模，已报告缺陷修复复验，无本阶段剩余阻断。

限制：旧订单缺SKU或快照金额不一致返回安全UPSTREAM_UNAVAILABLE，不回查当前catalog伪造历史；当前订单只有paid且无真实物流，授权订单的shipment返回NOT_FOUND。收件人脱敏由既有wire白名单完成；内部adapter持有的订单信息不得直返浏览器。PG单事务未提交不可见按键查询返回currently_unavailable，不伪造IN_FLIGHT且不得换键重建。PGlite单连接/lease测试不证明真实PG多连接锁竞争；未测真实迁移/数据库故障、生产存储、运行时adapter切换、DTC Connector、跨仓旅程、build与部署。

下一阶段：先验证隔离真实Postgres多连接事务与故障场景，再设计显式after-sales adapter选择/迁移运行指南及HTTP接入；缺条件时保持mock默认，不在真实订单上试验。已存在README无关改动保留，提交不等于推送或部署。

## 2026-11-06 后续开发顺序（用户已确认）

保留阶段1～5b的实现与验收历史。跨仓整体执行窗口、证据分层、容量/运维前提和学习交付只由DTC `docs/project-plan.md`维护；六个核心故事及原AS-ACC映射由DTC产品蓝图13.1维护。本节只列E-pig落点，不复制线上Schema、不新增需求。DTC本次计划调整仍为工作区候选，契约源/49 fixtures/source-lock保持2dc3723；普通检查不隐式更新vendor，跟踪源分支前进时须按既有freshness流程显式核对。

| 顺序 | E-pig责任与完成条件 | DTC配合及边界 |
|---|---|---|
| 5c 真实PG隔离验证（本地范围已验收） | 独立连接、锁等待/竞争、回滚无空洞、唯一工单、订单版本竞争、事务失败后原键恢复；有可重跑命令和实际输出 | 不等于持久审批/跨仓旅程通过；不使用现有线上数据库 |
| 5d 显式迁移与运行时接入 | 复用001～003迁移，新增清晰adapter选择/缺配置失败关闭，mock默认保持，真实HTTP对隔离PG跑通；空库/重复迁移/重启与回退边界可验证 | 不自动部署；旧SKU缺失和无物流行为保持事实，不伪造历史数据 |
| 6 最小消费者页面 | 订单申请/附件/进度/唯一回复，覆盖八类交互状态、重复恢复和可访问性；与DTC最小闭环交替交付 | DTC先完成最小身份/Connector/同步/持久草稿审批与回读，不等待所有后端完成才做页面 |
| 7 跨仓恢复与完整评测 | 原键恢复、越权、陈旧批准、响应丢失和重启故事协同演练，保留AS-ACC逐项证据；测量约定负载下性能 | Worker/审批/游标/对账由DTC负责；PGlite、真实PG、HTTP、浏览器和AI评测分列 |
| 8 隔离部署与试点材料 | 安装升级、备份恢复、日志/基础监控、操作手册、演示脚本与源码小实验 | 容量、恢复目标、数据保留责任在试点前确认；无实际试用不写效率提升或生产落地 |

### 阶段5c：隔离真实PostgreSQL多连接验证（2026-11-06，阶段范围已验收并推送）

目标：补足PGlite单连接无法证明的锁竞争与提交可见性，使用现有adapter和真实PG多连接，不为测试引入消息队列、锁框架或新服务。由Codex明确测试计划/Review/最终验收，Claude必须以auto权限模式实现与执行必要测试；自动审批不可用时记录阻塞，不能绕过。

开始条件：先核对现有 `scripts/database/concurrency.spec.ts`、`vitest.config.ts`、pool驱动及本机Docker/PG能力。明确专用测试实例/数据库、端口、合成数据标识、迁移和清理范围；无需读取.env或已有服务凭据。使用本机容器或现有独立测试数据库的选择须基于可用性，不把未检查的Docker命令写成已成功。若安装、镜像下载或外部访问需要权限，按工具审批；无隔离条件则记录未运行，继续可独立完成的测试设计，不退用PGlite冒充多连接。

开发范围：优先复用当前外部PG集成测试目录/配置和pool接口；测试自带连接释放、超时和失败清理，仅清理本次专用实例/记录。严禁迁移或清空现有商城/线上数据库。若当前Neon WebSocket驱动不适用于普通本机PG，应先比较仅测试使用的最小连接适配与既有隔离PG入口；涉及新增依赖或更改生产驱动须先交Codex形成明确补充方案，不静默替换生产驱动。

场景与断言：

1. 两个独立连接同时发布：同键同指纹只一诉求，同键异指纹冲突；不同键成功序号连续，回滚不会耗号或阻塞后续高水位。
2. feed与未提交/回滚发布交错：页面与高水位同一快照，不出现未提交项，非空末页游标可续读；提交后新连接可以读取完整记录。
3. 同键、不同键/同诉求并发建单：数据库只有一张工单与一条回复，成功键均可查同回执，同键不同指纹不能覆盖。
4. 新建单与订单变更竞争：明确哪个连接先持有订单锁，通过可控屏障和超时验证合法等待/当前版本校验；不靠无界sleep或时序碰运气，不允许陈旧新写入。
5. 工单插入后、诉求更新前失败：工单/键/回复/诉求状态全部回滚；新连接原键恢复只产生一个结果。
6. 建单已提交但调用方未保存结果：丢弃本次返回值或在测试边界模拟响应丢失，新连接按原键恢复；未提交时查不到不是永久不存在证明。该实验不冒充真实网络断连演练。

记录连接数、超时/隔离级别、PG版本、迁移版本、输入/预期/实际、命令退出码和失败历史；不预填并发量、吞吐或SLA。必要时最小修复发现的真实代码问题并补回归。验收须独立Review及实际多连接结果；未执行外部网络/HTTP/浏览器的场景明确保留到5d/后续窗口。学习材料随任务解释事务、行锁、幂等和提交可见性，并提供可复现实验，不新增独立通用故障注入平台。

阶段5c实施补充（2026-11-06，Codex已确认）：本机Docker已启动，官方postgres:16-alpine镜像已下载；真实技能源位于已有导出目录，通过恢复兄弟源路径链接后agent-doctor已PASS，未修改doctor或伪造技能。环境路径仅记在本机运行记录，仓库指南使用相对路径/可配置来源。

普通本机Postgres使用TCP；当前Neon WebSocket驱动不直接用于该测试连接。批准仅新增开发依赖`pg`及`@types/pg`，测试侧以其Pool满足既有CommercePool接口，生产驱动/adapter均不替换。事务必须在同一client执行BEGIN/COMMIT/ROLLBACK，见[node-postgres事务文档](https://node-postgres.com/features/transactions)。专用runner创建带唯一名称/标签、仅监听127.0.0.1随机端口、随机临时密码的Postgres16容器；不使用.env.local或现有DATABASE_URL，不输出连接串/密码；容器名及合成库有明确所有权，finally只删除本次容器及匿名卷，不做全局docker清理。

允许增加独立runner、专用after-sales多连接spec与Vitest配置、package脚本/开发锁依赖及相关最小安全测试；默认verify不隐式启动Docker，专用命令缺Docker须明确失败，不能skip算通过。runner生成连接参数仅传子进程环境，不提供任意数据库URL入口；测试验证已知专用库/用户和独立session PID，迁移001～003只在该新容器执行。可用受控屏障/pg_locks等待建立竞争，不用应用层串行lease模拟并发；等待均有超时及释放清理。普通verify与专用PG命令分别报告。CI可增加不部署的专用PG测试步骤，但不扩大生产部署触发范围。

源交接补充（2026-11-06）：DTC协作与执行计划已推送不可变提交 `8b00574f038a76c768bb72562a740d68b0f8bbae`，远端回读一致。与旧源 `2dc37231946b24e00f27c09111fba346a5affc90` 对比，`contracts/epig-after-sales/v1/` 无差异，原 sums digest不变。本章交付前由Claude最小更新现有检查器允许源常量及相关负例，然后以现有显式sync从该不可变提交重建source-lock，并逐字节核对51文件、check/freshness和测试；不手改vendor。旧源作为契约内容历史基线保留，新源锁状态需以实际同步结果记录。

### 第一章 / 阶段5c验收记录（2026-11-06，Codex）

结论：本地阶段范围通过，远端CI须待实际运行另记。实现由Claude auto执行，Codex负责方案、独立Review、复跑和最终验收。只增加专用测试与CI非部署job、pg/@types/pg开发依赖及显式源锁交接；生产驱动、业务adapter、数据库Schema/fixtures未改变，不引入通用任务或存储框架。

Codex实际独立命令与结果：

| 命令/证据 | 实际结果及边界 |
|---|---|
| `pnpm test:after-sales:pg` | exit0；PostgreSQL16.15，4文件/16测试，包括六类真实多连接场景、5项安全、3项子树生命周期、2项runner取消回归 |
| PG连接与事务 | read committed，statement_timeout45秒、lock_timeout20秒、connection_timeout5秒；观测PID87/88/89，订单锁持有者89/等待者88；本次专用容器只迁移001～003 |
| 清理 | 命令报告container_removed=true、tracked_volumes=1、removed_volumes=1、remaining_volumes=0；独立按本项目标签查询无遗留容器 |
| `pnpm verify` | exit0；75文件/630测试，契约17/17，docs/typecheck/lint、happy-dog22、harness8与agent-doctor全部通过 |
| 源check/freshness及字节比对 | 51个已提交源文件/vendor/lock逐文件匹配；目录与2dc内容基线无差异，sums自身digest仍b27f002fc639f0e5fee730651fdbf18c515a51a04de41324e6cfdf930f626752；最终锁源以source-lock与Issue交接为准 |

Review与失败历史：首轮安全测试的错误文案断言失败、verify缺AGENTS命令锚点，均最小修复。独立Review发现CI缺镜像准备（已显式pull）、测试只TERM父进程无强制退出（已专用进程组TERM→有限宽限→KILL→等待）、setup期间提前清理导致延迟创建容器遗留（已信号只标记取消，等待在途操作settle后顶层finally唯一清理）。后者同一受控回归先RED（旧代码提前退出，延迟容器遗留）、后GREEN；原审查者逐项复查关闭。首次进程回归误用Vitest不支持的t.after，改为onTestFinished后通过，不删除失败历史。

AI Test Record：六场景验证发布竞争/回滚连续高水位、未提交feed可见性、同键/不同键竞争建单、订单锁与版本、半途失败原子回滚、原键恢复；取消/强制终止采用隔离fake-child/fake-docker，不能冒充真实Docker daemon故障或真实网络断连。AI Review Record：检查事务真实性、runner所有权/环境剥离、清理和CI边界，无本章剩余阻断项；新增模块均为专用测试边界，无生产抽象扩张。

环境复现：使用项目Node24和pnpm10.34.5，先`pnpm install --frozen-lockfile`，确认Docker运行，显式`docker pull postgres:16-alpine`，再执行专用命令；普通verify不启动Docker。技能检查需要真实来源工作区位于安装清单约定的兄弟DTC-skills目录，按其源校验和安装指南恢复，不复制空SKILL或跳过doctor。镜像是浮动16-alpine标签，报告记录实际PG版本，不把未来下载视为同一二进制。

原始本机临时日志不作为长期唯一证据；Git中保留上述命令、合成测试与精简结果，后续可按命令复算。未证明：HTTP运行时接入、真实网络断连/数据库宕机、消费者浏览器旅程、DTC持久审批/Worker/Connector、部署和实际用户收益。下一章5d按已确认计划继续，生产写入和部署仍需对应授权。

本章最终源交接：锁定DTC `edc8443831ad23c4ab6675f9dc1c998221cbd39b`（含已确认计划、环境记录与限定开发分支的非部署CI触发），不是先前中间文档提交d060。源目录与原2dc内容基线无差异，source-lock由显式sync产生；最后元数据更新后check、freshness、17项隔离契约测试及typecheck/lint重新通过，未重复冒称一次新的630全量运行。第一章普通verify的630全量证据对应相同应用/测试代码，最终源元数据另有专项验证。

第一章推送回读（2026-11-06）：E-pig dc80e637b847907700f33b0f9195329951a6c5d8、DTC edc8443831ad23c4ab6675f9dc1c998221cbd39b均已远端回读一致；DTC草稿PR#4仅作审查入口，不合并/部署。远端CI与本地验收分开记录，未查到run时不能称为远端通过。无关README和DTC学习/政策工作区改动继续保留。

远端CI结果（2026-11-06）：[E-pig run42073073664](https://github.com/Lee-NG915/E-pig/actions/runs/42073073664) 对提交 `0ab69905dd3b42a5ee637d5c9e139710d2df7c1d` 实际完成success；after-sales-postgres与quality均success，后者包含生产构建和standalone运行时市场smoke；deploy按非main条件skipped。此证据针对该代码候选，后续本次记录提交仅改文档。DTC当前开发分支截至回读仍无run，不能用E-pig结果代替DTC CI。两仓均未合并、未部署。

## 第二章 / 阶段5d：显式迁移与持久运行时接入（2026-11-06，计划）

目标：让已验证持久adapter能够被真实应用选择，并通过隔离PG上的HTTP验证。Codex方案/Review/验收，Claude auto实现与必要测试。基线0ef1a73，当前source-lock锁源edc8443；不改vendor/wire/fixtures，不合并部署、不用真实商城库或支付。

设计与剃刀选择：保留AFTER_SALES_ADAPTER=mock默认，显式postgres时必须COMMERCE_ADAPTER=postgres且DATABASE_URL可用，缺条件返回安全不可用，绝不自动fallback到mock。runtimeEnv只在现有env入口读取，新字段均server-only。typed registry惰性创建/缓存售后能力与数据库pool，公共catalog读取不连接数据库或因售后缺配置崩溃；通过getter或明确getAfterSales函数实现，不逐方法手写通用代理。

数据库连接复用现有CommercePool/transaction和createCommercePool入口，新增显式DATABASE_DRIVER=neon/tcp（缺省neon保持既有部署）。tcp使用已引入pg，提升pg为runtime dependency；Neon路径保留，不能全局悄悄换驱动。没有driver插件系统，只有两个明确分支；pool要有连接上限/超时、安全idle error处理，不打印URL/凭据，不设置rejectUnauthorized:false。commerce和after-sales在同一进程复用缓存pool，避免每请求创建新连接；订单主数据仍属于同一配置数据库。tcp用于Node本地/隔离环境，Cloudflare原路径继续Neon，未实测平台不能宣称支持。

迁移：沿用scripts/database/migrate.mjs，保留旧默认只001的兼容；新增显式--scope all（001/002/003）与可复跑package命令。固定文件allowlist，禁止任意路径/SQL入口和request-time DDL。缺URL或非法scope/driver安全失败；逐文件事务与中断后重跑边界说明清楚，不承诺三文件跨事务原子。测试只向新建专用容器传临时连接配置，不加载.env.local；不执行已有线上库迁移、删除或回填。

代码落点：src/platform/config/env.ts与schema测试、registry与装配测试、现有pool及测试、migrate.mjs及最小可测试helper/测试、package/锁文件、API composition仅必要调整。.env.example可补占位server-only变量，不读取真实.env。源码/测试由Claude改，操作指南和验收记录由Codex维护；AGENTS命令锚点可最小同步通过docs:check。

测试计划：

1. registry/schema：默认mock，显式pg选择，未知配置拒绝，缺URL/commerce不匹配失败关闭；catalog不接DB；共享pool/adapter稳定复用，Neon默认兼容。pure factory依赖可在测试边界mock，不用mock宣称SQL集成。
2. 迁移：隔离PG空库、只001旧库升级、重复执行及中断后重跑，三张售后表/键约束存在，不创建数据或删除旧订单。错误不泄漏连接串。
3. Route Handler+PG：真实签名Cookie、Bearer、版本/no-store、申请/附件/读回/feed/订单版本/审批审计字段/建单201与重放200/消费者脱敏/按原键恢复；重复和冲突不增业务结果，跨主体/市场/无凭证被拒绝。可以复用5c的专用容器，不用现有DATABASE_URL。
4. 真实HTTP冒烟：在临时、只复制受控源码/必要配置且没有.env的Next测试副本启动Node dev server（可用webpack避免符号链接root约束），使用现有依赖；不改/重命名真实.env。seed仅合成订单，fetch跨真实回环socket完成核心申请→service建单→consumer读回，重启应用后仍可读同结果。端口随机，server进程组有界停止，复制目录/容器finally清理。若临时副本或Next约束需额外实现先最小化，不用自建HTTP路由器冒充Next。
5. 扩展专用PG命令/配置，使CI同样执行新增测试；普通verify不启动Docker。测试侧记录Route Handler、真实HTTP、迁移与重启分别结果。所有loop/wait有超时，不读取/输出.env或已有服务token。默认生产mock告警保持，旧SKU缺失/无物流失败关闭保持。

Claude完成后运行typecheck→lint→相关/全量verify、专用PG命令、生产build（或CI实际结果），返回真实证据与失败。Codex独立Review/复跑后验收提交推送并同步Issue。回退仅切回显式mock/停止新处理，不能删除已存在的持久工单或声称撤销外部效果。


### 第二章 / 5d Review与独立核验进展（2026-11-06）

当前为未提交候选，未最终验收。Claude auto实现显式AFTER_SALES_ADAPTER、DATABASE_DRIVER、共享惰性pool和固定scope迁移；新增RouteHandler/真实Next HTTP/PG迁移与重启验证。`pnpm database:migrate`保留只001默认，`pnpm database:migrate:all`显式运行001～003；配置来自受控环境，不自动加载真实.env。默认mock保持；Node隔离环境可显式tcp，Neon默认不替换，Cloudflare/tcp没有运行验收。

使用顺序：先在专用新库显式迁移，再配置COMMERCE_ADAPTER=postgres与AFTER_SALES_ADAPTER=postgres、对应DATABASE_DRIVER和受控DATABASE_URL；缺条件售后安全503，不能当成mock成功。专用验收仍用`pnpm test:after-sales:pg`自动创建/删除合成容器，不向命令传已有数据库URL。撤回可切回mock或停新处理，不能删除已保存业务结果或声称撤回外部效果。

Review已修复Next detached进程组清理：leader提前退出仍等待整个组，TERM后有界KILL，ready失败/signal/exit兜底；不能确认清理时stop抛错且报告不记成功。独立审查者本机纯生命周期6项通过；Claude最后专项9文件38项通过。Codex独立普通verify exit0，75文件643项、契约17、happy-dog22、harness8与doctor通过，原始日志在本机临时`/tmp/epig-stage5d/codex-final-verify.log`。

Codex随后独立PG复跑发现就绪竞态：pg_isready通过，但目标合成数据库尚未存在，SHOW server_version报不存在；本次测试未进入PG用例，runner仍完整清理容器/匿名卷，clean=true。失败记录为`/tmp/epig-stage5d/codex-final-pg.log`。已下发最小返工，要求最终TCP目标数据库SQL就绪才继续并补回归，不能以再次跑通掩盖竞态。待修复后重新独立复跑，未通过前不提交。

源交接已由Claude显式sync候选更新为DTC `d3cab389429ab27a2f0d5483fb6388afc9e05bed`，对应DTC-2a身份/Connector已验收推送。51契约文件tree/逐字节不变、sums digest仍b27f002fc639f0e5fee730651fdbf18c515a51a04de41324e6cfdf930f626752；17项契约负例/check/freshness与typecheck/lint通过。该新源同时承载产品内部prepared未派遣失效终止语义，未更改线上OpenAPI。源锁仍为本地候选，推送后另记。

源码阅读：先看`src/platform/registry.ts`的getAfterSales/getCommercePool，再看`src/adapters/commerce/postgres/pool.ts`两个明确驱动分支，最后看migrate.mjs固定scope与HTTP测试。连接池是复用有限数据库连接，事务仍要在同一client执行，不能把共用pool当成跨调用自动事务。小实验用registry.spec.ts核验缺配置不访问数据库、PG专用命令核验真正持久性；mock与真实SQL的证据边界分别保留。


## 后续消费者页面窗口：订单内申请与结果（实施前设计）

本窗口在5d验收后开始。订单页已有OrderHistory和真实消费者归属接口，复用happy-dog按钮/表单样式与当前市场格式，不增UI框架；新增`src/modules/order/components/after-sales-panel/`业务组件，app/page只组装。组件的md行为规范由Codex维护，Claude实现tsx/spec/stories及最小客户端请求/恢复helper，不在modules导入adapter或服务registry。只调用现有5个消费者售后操作，绝不发送service Bearer或内部审批字段。

在OrderHistory已成功返回本人订单后才挂载面板，订单读取失败/无权限不挂载也不泄漏已缓存结果。沿用真实Cookie、same-origin凭据、contract major1和private no-store。显示已知诉求编号/更新时间/消费者pending或ticket_created状态；ticket_created后GET真实工单，呈现唯一最终回复和状态，不显示DTC待审批/对账等内部状态或添加聊天输入。

v1没有按订单枚举诉求接口。首期同浏览器续看只保存服务已确认的request_id索引，键绑定market、服务返回的cartId和orderId；索引不是授权，读取仍须服务端校验。索引只含ID/时间，不存回复、描述、地址或凭据。清浏览器存储/换设备的恢复不冒称支持；无索引文案为“此浏览器没有保存的申请记录”，不能声称服务器没有诉求。已知多条记录都能选择查看；默认最新，不能将一诉求唯一工单误写为一订单永远只一个诉求。

新申请提供damaged/wrong_item/return/other、非空描述（5000 Unicode码点）、最多3张JPEG/PNG/WebP、每张5MiB。上传逐个真实POST并保存返回attachment_id，失败明确到文件，不悄悄压缩/截断；客户端检查是体验提示，服务端仍验证真实内容。只读预览经授权下载字节并用受控blob URL，切换/卸载撤销，不加载远端任意URL。已有request状态从服务重新读取，缓存只能标陈旧，不能渲染绿色假成功。

幂等恢复：首次发送申请前固定随机key及规范化body，锁定相关表单；用按market/cart/order隔离的sessionStorage保存本标签页待定key/body/attachment_ids及创建时间，明确这只用于合成/内部演示环境，同origin脚本可读，禁止凭据存储。成功回包后，先将服务request_id可靠写入同一market/cart/order索引并确认成功，再删除待定key/body。索引写失败或提交间崩溃时保留原key/body锁定重放，不能先删pending导致两份恢复依据同时丢失；持久索引只留服务request_id/时间。另在同一主体分区保存不含正文的pending标记（原key、规范化请求SHA-256、创建时间）；只有确认request_id索引写成功才删除。标签页关闭导致sessionStorage正文丢失时，保留“结果未知、需人工恢复”状态并禁止新建/换key，不显示空申请表。可用客服提供的request_id通过现有消费者GET核验归属及order_id后恢复索引，不能由人工输入成功/回复。刷新/超时/429/5xx后只能恢复原key原body；用户未解决未知结果前不能编辑参数或重新上传替换再用同key。无法保存恢复上下文时发送前明确阻止，不能写后丢key。已明确未写入的400/413/415等允许修正并新建上下文；409不同指纹不能换key绕过，显示恢复/人工说明。取消编辑只在尚未发送时允许；网络中断不是外部撤销。

八类状态落实到面板：loading读回、empty浏览器未保存、forbidden清敏感内容和query缓存并停止自动重试，不显示其他身份pending、error说明读/写及可重试性、stale标最后读成功、conflict保留锁定原上下文、retrying保持原key、success只在真实读回。可见label、字数/文件错误关联、role=status/alert、键盘焦点与小屏换行；消费者文案沿用英文和市场金额/日期，不硬编码AU。

验收：组件测试覆盖本订单挂载、market/cart/order缓存分区、索引损坏/存储不可用、上传拒绝、Unicode上限、禁重复提交、超时刷新原key/body重放、401/403不显示缓存、409不换key、pending与唯一最终回复；stories至少八类状态。实际浏览器/隔离Next+PG验证上传→提交→刷新→服务侧建单→读回同一工单回复，以及键盘/窄屏行为；不把jsdom代替浏览器。与DTC工作台联调留跨仓窗口，不声称部署或真实消费者试用。


### 5d最终本地验收（2026-11-06，Codex）

结论：本章本地范围通过，提交推送后核对远端CI构建，未部署。就绪竞态最小修复为最终TCP目标库SELECT1与5秒单次/60秒整体超时，原取消语义保留；两个回归覆盖目标库未创建和探针挂起。独立Review确认无新增阻断，未引入驱动插件/通用工作流。

Codex独立复跑修复后`pnpm test:after-sales:pg` exit0：PostgreSQL16.15，**9文件40项通过**，真实Next loopback提交→service建单→consumer读回→同端口重启后读回一致，durable_rows=1,1，stop_released_port=true、server_stopped=true、copy_removed=true；runner group_exited=true，container_removed=true、removed_volumes=1、remaining_volumes=0、clean=true。日志为本机临时`/tmp/epig-stage5d/codex-readiness-fixed-pg.log`；此前失败历史保留。

常规独立verify的75文件643项及其他门禁见上节，最后变更仅专用runner就绪/回归；该变更由上述40项与typecheck/lint另行覆盖，不冒称新的643全量运行。源check/freshness和17项契约负例由Codex再次通过；允许源d3cab389429ab27a2f0d5483fb6388afc9e05bed、51文件内容和sums digest不变。线上13操作/49fixtures未变。

未证明：消费者浏览器组件、DTC持久审批/Worker及跨仓全故事、Cloudflare TCP、生产部署/真实客户试用与效率收益。下一窗口按上述消费者页面设计实施，DTC-2b独立推进。README无关工作区变更不纳入提交。


5d推送回读：提交`5d6cb6e12cf6fd3161f7a65dbdba52f048067976`已推送，远端SHA、source-lock、实施文档、registry与runner逐字节回读一致。[CI42080423047](https://github.com/Lee-NG915/E-pig/actions/runs/42080423047)的quality实际success，包含生产build与standalone市场smoke；deploy skipped。PG job实际39通过1失败：HTTP测试以全表计数期望1/1，其他spec合法记录使CI顺序下为2/2。此为测试隔离缺口，不删除该失败或写成全部CI通过。

已返工HTTP断言为本次market/request/ticket作用域精确1，同时经真实HTTP创建另一组合法控制业务证明全库至少2笔仍正确；全表数仅观测，不作为唯一性证据。没有加truncate或改业务唯一约束。Claude typecheck/lint、643普通测试及40专用项通过，Codex正独立复跑；待通过后修复提交重触发CI，最终结果另记。此前durable_rows=1,1属于当时全表观察，不能外推每次全库仅一条；本次精确幂等依据改为scoped_rows。


CI隔离修复的独立复跑（2026-11-06，Codex）：`pnpm test:after-sales:pg` exit0，9文件40项；scoped_rows=requests:1,tickets:1,ticket_keys:1，control_rows=requests:1,tickets:1，table_rows=2,2，同端口重启读回正确，group_exited=true、clean=true。日志在本机临时`/tmp/epig-stage5d/codex-ci-isolation-fixed-pg.log`。根已Review两文件diff，确认是精确作用域唯一性而非放宽断言，待修复提交CI回读后闭环。


5d远端闭环（2026-11-06）：修复提交`fe15a992cd62dcae665557ee4be3788f73fcd6f8`的[CI42081613637](https://github.com/Lee-NG915/E-pig/actions/runs/42081613637)已实际success，quality（含生产构建/standalone市场smoke）与after-sales-postgres均success，deploy按非main条件skipped。本章本地/远端范围验收通过，未合并/部署。后续消费者页面按已Review方案实施，UI本身仍未实现/验收；其标签页未知提交使用无正文pending标记与现有授权读取恢复，不新增wire接口。
