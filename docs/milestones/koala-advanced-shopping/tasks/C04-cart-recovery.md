# C04 follow-up — 购物袋自动恢复与明确的退出路径

更新日期：2026-11-03

- Milestone: koala-advanced-shopping
- Status: implemented-and-automated-validation-passed; browser-validation-pending
- Branch: codex/koala-advanced-shopping
- Baseline: 4c796e9e985fc676d5e9ce4802eaeaec0bbbd74b

## 行为契约

用户要求：能自动确认和安全重试的自动处理；失败后有明确恢复入口，不能一直被旧提示卡住。

1. 原 POST 失败后先查询当前签名 cookie 所属购物袋的 `mutationKey` 回执。已提交就接收当前购物袋并结束恢复，不再 POST；回执不存在不等于原事务没有执行，只能复用原 payload/key 重放。
2. 新记录在成功前置 GET 后、POST 前保存原输入、UUID、预期购物袋 ID（非凭据）、时间与自动尝试计数。每次恢复请求 8 秒超时；自动恢复共最多 2 轮，计数跨刷新持久化。一轮为一次回执查询及必要时一次同 key POST。立即恢复占第一轮，挂载/重新联网可用剩余轮次，手动 Retry 不生成新 key。
3. 自动重放仅限 10 分钟内有明确身份的新记录。旧格式只有回执查询，无法确认则引导核对并使用当前购物袋；过期匿名记录不得凭旧 key 重领已失去浏览器凭据的购物袋。同一仍持有有效 cookie 的购物袋的旧记录可由用户手动重试。
4. `expectedCartId` 是前置条件，不是授权。服务端只信签名 cookie；身份变化拒绝写入。首加购响应只落 cookie、丢 body 时，仅 `create:key` 记录与当前 cookie 对应才允许重放。失效 cookie 不能配旧创建键重领购物袋；新键仍可开始新购物袋。
5. market Web Lock 串行化；同页面多个 React islands 共用恢复任务/联网和 storage 监听。普通 GET、GET 回执均不创建购物袋、不签发 cookie；恢复确认与明确换用当前购物袋推进请求代数，迟到旧 GET 不覆盖新状态。
6. 持久恢复状态独立于瞬时错误，Refresh bag 不能抹掉。购物袋展示 Checking / Retry saved update / Continue browsing。只对不可读、旧身份未知或会话变化记录提供 Use current bag：先成功读取当前购物袋，再明确退役旧意图，绝不将旧操作重发到另一购物袋。普通结果未知记录不能直接丢弃。
7. PDP/卡片提供打开购物袋的恢复入口，未解决时不接受新加购。套装保存原 request key，恢复按钮只恢复这个 key；错过跨标签完成事件时只读补查原 key，不删除或重放后续请求。后台确认后永久释放旧规格锁，旧按钮不能变成新加购。结账直达也提供 Review saved bag update 入口，未确认前不开始支付。

## 验证计划与证据

- Store：丢响应已提交、未提交同 key、有限预算及刷新、跨消费者/联网、存储故障、身份切换、旧记录、过期 cookie、8 秒超时、迟到 GET、旧 Retry、合法 4xx 与 408/429/5xx。
- HTTP/adapter：cookie 授权、expectedCartId 四类 mutation、首创建回放、receipt 市场隔离、回滚未提交与真实 PGlite 幂等。
- UI：恢复可见、GET 刷新仍保留、手动入口、恢复成功/拒绝解锁、套装旧 key、继续浏览和结账拦截。
- 浏览器：视觉验收 NOT RUN。隔离页新建先遇自动审批服务容量错误 Selected model is at capacity，后续同工具重试成功打开页面并完成 320px 模拟与 fixture reload；读数和截图长时间未返回，没有取得有效视觉证据。另一路隔离页新建因自动审批超时未执行。没有换入口绕过审批，没有操作用户原购物袋。
- 支付：本轮不发起托管支付，不改支付端口或结账事务。

## AI Test Record

- Behavior changed: 自动回执确认、同 key 有限重试、身份保护、持久恢复 UI 与旧套装重试保护。
- Tests added/updated: store、HTTP、两种 cart adapter、CartPanel、商品卡/PDP/套装、真实 store 旅程、CheckoutForm。
- Tests run: 最终 remediation-loop attempt 2 顺序 typecheck → lint → 64 files / 476 tests 全通过；happy-dog 22 tests、doc-sync、harness 8 cases、doctor、diff-check、companions 通过；Next production build 与 modules Storybook build 通过。
- Result: PASS（自动化）；PARTIAL（浏览器视觉验收）
- Failures or gaps: 浏览器真实视口/点击验收因自动审批容量错误未运行。
- Next risk: 真实浏览器视觉验收；不等同线上发布或支付验收。

## AI Review Record

- Review focus: 幂等、跨会话、异步恢复、迟到回包、套装重复加购。
- Findings: Test AI 先挑战恢复契约；独立 Review 找到旧格式手动跨袋重放、回执/换袋后的迟到 GET、过期匿名 cookie、错过跨标签完成结果等分支，均补回归并修复。最终只读评审无遗留 P1/P2；另外修复套装旧锁因后续共享结果变化而复活。
- Residual risks: 浏览器验收限制如上；不能认定用户历史提示的唯一根因。

## 收尾记录

- 第 1 轮全量测试 473/474：PDP 锁释放由 React effect 异步同步，测试过早断言。改为 waitFor 解锁，原冻结期断言不放松；补两项跨标签旧 key 回执回归后，第 2 轮 476/476。
- 构建首次遇 Turbopack 沙箱临时端口权限限制，经自动审批获准后构建通过。Storybook 仅有通用大 chunk 提示。
- 原项目 AGENTS / DESIGN / PRODUCT / README 与研究文档的既存未提交改动保持原样，不夹带提交。本轮不合并、不手动部署、不发起托管支付。
- 证据：[cart-recovery.json](../evidence/cart-recovery.json)，源码提交索引：[commits.json](../evidence/commits.json)。
