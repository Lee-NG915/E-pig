# 全站沙箱交易闭环 — 阶段复盘

更新日期：2026-11-03

状态：沙箱主链路已交付 — 实现、独立 review、质量门与桌面/移动视口付款通过；扩展 UAT 有缺口

## 交付与范围

- `419990e` 集成 T01–T03 与评审/部署适配修复，`23835a8` 优化表单校验文案，`b0dc3a9` 修复抽屉焦点，均已推送。未合并主干，不宣称正式收款上线。
- 完整 verify：213 应用测试 / 47 文件、22 基础测试 / 7 文件、Harness 8 例及 doctor PASS；Next / Netlify build PASS，最终 modules Storybook PASS，同一 AU 构建的 SG/US standalone 检查 PASS。独立最终 review 含焦点修复，无未解决 finding。
- AU 托管桌面 Stripe 沙箱支付 AUD 3,800 并回查订单成功；重复真实 Webhook 后仍一订单。云端 HTTP → Neon/Stripe 指定并发、锁车和取消场景通过。实际部署及验收证据由 acceptance.md / deployment.md 维护。
- 移动拒付后仍 open / 0 订单；未完成的 3DS 会话已核验取消。另一次 375px 普通测试卡支付 AUD 8,350 并刷新回查通过。最终线上 Header/PDP 焦点恢复与四档 PDP 溢出复验通过。3DS 挑战另经协调任务补验并于合并前服务端复核关闭；完整人工矩阵/实体设备保留缺口。未增加库存服务、账号、补偿调度、付费服务或其他范围。

## 问题溯源与已落地防护

| 问题 | 根因与处理 | 仓库证据 |
| --- | --- | --- |
| Proxy 打包时缺少请求环境 | 顶层 env 校验在 Netlify 导入 bundle 时执行；改为非 API 请求内异步加载，运行时仍校验 MARKET | [溯源](issues/ISSUE-proxy-env.md)、4 项真实 env 回归、T04-fixes.md |
| 本机 Neon 网络不可达 | 本机网络路径失败不等于云端数据库不可用；迁移通过连接器执行，实际应用与指定并发从托管 HTTP 验证 | [溯源](issues/ISSUE-neon-network.md)、deployment.md 的显式迁移/环境说明 |
| pnpm 版本/入口路径漂移 | shell 的 pnpm 与嵌套脚本入口可能不同；固定使用 10.34.5，校准 PATH 后再跑完整 verify | [溯源](issues/ISSUE-pnpm-path.md)、deployment.md、最终 verify 日志 |
| 异步加购关闭抽屉焦点落 BODY | pending 禁用按钮时丢失触发元素；请求开始前保存，关闭恢复或回退 Header | [溯源](issues/ISSUE-drawer-focus.md)、4 项 RED→GREEN 组件旅程、`b0dc3a9` |

## 后续继承

继续保留可信支付状态、共享私有数据拒绝清除、cart revision/lock 单调性及同浏览器订单契约。构建、源码复核、托管交易与浏览器行为分别记录；本机连接失败、第三方 iframe 加载失败均不能替代后端结论。尚未覆盖的真实跨标签页、完整浏览器矩阵和第三方挑战恢复保持显式待办。

本轮防再发落在回归测试、task 记录与部署说明；没有修改 skills 或 harness 规则，也未自动触发 phase-review。主链路交付证据已写入 acceptance.md；3DS 有补验与服务端复核证据；扩展 UAT 未冒充通过。

## AI Test Record

- Behavior changed: 无；本次仅整理交付、复盘与状态文档，属于纯文档豁免。
- Tests added/updated: 无；引用已有实现回归与最终质量日志。
- Tests run: 本次未重跑运行时测试；核对 Git 提交、最终 verify 日志并检查文档 diff。
- Result: PASS（文档检查）；运行时结果按各自原始日志引用。
- Failures or gaps: 首次 3DS 失败历史保留，后续 challenge 补验通过；完整人工/实体设备 UAT 未执行。
- Next risk: 及时将后续实际浏览器结果同步至 acceptance.md / deployment.md，避免把阶段快照当最终验收。
