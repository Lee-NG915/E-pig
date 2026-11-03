# ISSUE-002 — 比较页重复查询参数导致同页导航展示旧规格

日期：2026-11-03

## 触发与影响

C02 最初生成 `?item=product:variant1&item=product:variant2`。在 AU 比较页已有两列、末项保持不变时，只更换第一列规格，地址栏更新而商品图片、选择器、价格和 PDP 链接仍停在旧规格。单列切换和新增末列正常，所以纯组件测试及首次浏览器检查未覆盖该触发条件。

## 定位证据

- 实测环境：本机 Next 16.2.10 开发服务，Chrome 独立 context `koala-advanced-compare`、page 3。
- 浏览器 fetch 记录 req 251：比较路由 RSC 请求返回 200，`cache-control: no-cache, must-revalidate`；工具输出的原始 body 被截断，完整内容另用相同请求头只读重取核对。
- 用同一 RSC/Next-Router-State-Tree/Next-Url 请求头重新读取响应，长度 66,046 字符；`entries[].item` 是正确目标。客户端 ProductComparison 的已接收 props 与 DOM 仍是旧 Forest Walk 两座及三座，排除 catalog 取数错误。
- 安装源码 `node_modules/next/dist/client/components/router-reducer/ppr-navigations.js`，`createSegmentFromRouteTree`（检查时第 416 行附近）用 `JSON.stringify(Object.fromEntries(new URLSearchParams(renderedSearch)))` 构造页面段键。重复 `item` 只保留末值，前项变化产生相同键。这是根据实际源码与行为作出的根因判断，不是浏览器 HTTP cache 推测。

## 修复与回归范围

新链接用唯一 `item`、`item2`、`item3` 保存各列；解析仍兼容旧重复 `item` 链接，所有后续操作都生成唯一键。没有增加页面 reload、客户端价格缓存或全局状态。

回归覆盖：唯一键往返、旧链接读取、三项上限、早期列改动保留其余列、选择器焦点、未知规格不静默回退。浏览器需在相同末列下连续改变第一列，再改变中列，并检查 URL、图片、价格、规格及 PDP 链接一致。

## 修复后实际验收

- 从旧重复 `item` 的三列链接进入，Tamarama Cream 两座 / Forest 三座 / Bangalow 默认都正确载入。
- 第一列改 Forest 两座：URL 自动转为唯一键；图片/规格/PDP 链接同步，价格分别为 2,600 / 3,550 / 1,900 AUD。
- 末列保持不动，再改第一列为 Cream 三座：显示 3,550 / 3,550 / 1,900，第一列焦点保留。
- 再改中列为 Cream 两座：显示 3,550 / 2,600 / 1,900，URL/图/规格/PDP 链接全部对应；焦点保留在中列。整个序列没有 reload。
- 320 / 390 / 1440 视口检查无全页横向溢出；三项上限、第四项提示、显式未知规格不展示猜测价格通过浏览器检查。
- 4 个定向 spec 共 38 项通过；类型检查及定向 ESLint 通过。完整构建/全仓验证由主集成记录收口，不在此冒充已执行。

结构化记录见 `../../evidence/compare-browser.json`。
