# CartSheet

One accessible drawer around the shared server bag panel.

## 用户故事

用户在当前市场查看服务端确认的交易状态，并在失败时安全重试。该组件不导入供应商 SDK，不在客户端保存价格事实。

## 状态矩阵

| State | Trigger | Visible result |
| --- | --- | --- |
| Closed | open=false | no dialog |
| Open | open=true | one dialog, shared CartPanel |
| Close | escape/overlay/close button | UI-only open state updated; focus returns to the original opener |

异步加购在禁用按钮前记录原触发元素；关闭抽屉时通过现有 Radix `onCloseAutoFocus` 恢复，避免焦点落到 BODY。原按钮已移除或不可用时，回退到当前市场页头购物袋按钮。DOM 引用仅保存在浏览器 UI 内存，不进入查询、持久化或服务端数据。
