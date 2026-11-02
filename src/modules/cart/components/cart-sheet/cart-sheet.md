# CartSheet

One accessible drawer around the shared server bag panel.

## 用户故事

用户在当前市场查看服务端确认的交易状态，并在失败时安全重试。该组件不导入供应商 SDK，不在客户端保存价格事实。

## 状态矩阵

| State | Trigger | Visible result |
| --- | --- | --- |
| Closed | open=false | no dialog |
| Open | open=true | one dialog, shared CartPanel |
| Close | escape/overlay | UI-only open state updated |
