# AccountMenu

站点头部的账号状态入口。

- **未登录**：显示 `Sign in`，链接到 `/api/auth/github/login`（GitHub OAuth）。
- **已登录**：显示 GitHub 用户名与 `Sign out`（POST `/api/auth/github/logout` 后本地态立即复位）。
- **加载中**：固定宽度占位，避免头部布局抖动。
- **异常降级**：网络或接口失败一律按未登录展示，不阻塞浏览主流程。

数据来源：`GET /api/auth/github/me`（`credentials: "include"` + `cache: "no-store"`）。
