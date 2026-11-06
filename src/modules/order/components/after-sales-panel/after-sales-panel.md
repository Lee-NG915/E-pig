# After-sales panel

状态：实施前行为规范；产品正本见DTC售后蓝图，执行设计见本仓`docs/engineering/after-sales-agent-integration.md`的消费者页面窗口。组件服务已由服务器确认归属的订单，只使用现有消费者售后接口。

## 用户故事

消费者在原结账浏览器的订单详情中提交问题与最多三张照片，刷新后继续查看申请；客服处理完成后查看服务器持久保存的唯一回复。组件不声称执行真实退款/取消，不展示内部审批或提供消费者多轮聊天。

## 输入与边界

props仅market身份、服务确认的orderId/cartId；父组件OrderHistory订单读取成功才挂载，并以market/cart/order作为React key。模块不导入adapter/registry，不持有service Bearer。请求使用same-origin Cookie、major1、no-store；资源响应必须匹配当前market/order/request/ticket，服务端仍负责归属校验。身份变化或401/403清视图/query缓存并停止重试。

## 交互与恢复

选择damaged/wrong_item/return/other，描述非空白且最多5000 Unicode码点。附件JPEG/PNG/WebP、每个5MiB、最多3，逐文件说明拒绝原因；上传成功只表示材料已接收。授权内容blob URL在切换和卸载时撤销。

首次发送前生成稳定key，固定规范body，sessionStorage按market/cart/order保存待定原body/key；localStorage仅保存无正文pending标记（key/hash/时间）和已知request ID索引。不能保存恢复上下文时发送前阻止。网络超时/刷新/可重试失败只能原key原body，不改参数后偷换key。成功后先确认ID索引写成功，再清待定原body与标记；索引失败保留原上下文。关闭标签页导致正文丢失时显示未知结果、禁止新建，可输入客服提供request ID并通过现有授权GET核验order后恢复。清全部浏览器存储或跨设备不承诺自动恢复。

只读服务结果决定pending/ticket_created；有ticket后读取真实工单显示状态与不可变回复。不渲染“待审批/对账”消费者假状态。支持选择本浏览器已知多条诉求，无记录文案不能声称服务器无诉求；列表缓存只含ID/时间，不含描述/回复/地址/凭据。刷新失败保留可辨认陈旧状态，权限失败清敏感内容。

## 状态矩阵

| 状态 | 内容与可操作项 |
|---|---|
| loading | 正在读取/上传/提交的文字说明，防重复提交 |
| empty | 本浏览器没有保存的记录，可申请或凭编号恢复 |
| forbidden | 不显示缓存正文，回到安全订单页 |
| error | 区分读失败与写未知，遵守恢复动作 |
| stale | 上次成功读取时间，可重读，不能当最新成功 |
| conflict | 保留原上下文，禁止换key绕过 |
| retrying | 原上下文重试说明，禁止重复点击 |
| success | 只来自服务确认，显示request/ticket与唯一回复 |

可见label、错误关联、role=status/alert、键盘焦点、窄屏换行；文案英文并沿用市场日期/金额。storybook覆盖八类状态，spec覆盖身份分区、存储失败、索引先写、标签关闭未知守卫、上传/Unicode、原键重试、权限清缓存、冲突与真实回复。jsdom不代替后续实际浏览器与PG旅程验收。
