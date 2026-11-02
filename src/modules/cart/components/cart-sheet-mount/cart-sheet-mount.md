# CartSheetMount

Provides market context to chrome and mounts one drawer.

## 用户故事

用户在当前市场查看服务端确认的交易状态，并在失败时安全重试。该组件不导入供应商 SDK，不在客户端保存价格事实。

## 状态矩阵

| State | Trigger | Visible result |
| --- | --- | --- |
| Default | market provided | children rendered |
| Open | cart UI opened | exactly one drawer |
| Multiple islands | same market | browser Query cache shared without private SSR cache |
