# ISSUE-003 — 比较页未复用已有 Select

更新日期：2026-11-03

- 现象：用户截图中 Add a product 与比较卡片选择器展开为系统原生菜单，选中蓝色、菜单尺寸和焦点外观未遵循 happy-dog。
- 首次引入：C02 `89dc42b`；根因类为实现偏移与视觉验收缺口。组件库已有 `packages/happy-dog/src/components/select.tsx`，实现时只给原生 select 加了业务样式。
- 修复：四类选择器统一使用已有 Select/Trigger/Value/Content/Item，触发器与按钮采用库内 md 尺寸；弹层保留库内 token，长列表限高滚动，宽度限制在触发器与视口内。
- 焦点：portal 选项自身不作为路由更新后的焦点目标；明确记录原 trigger id。Enter/Home/End/方向键确认、Escape 取消、导航后焦点恢复均保留。
- 防再发：C02 冻结契约新增“复用已有 Select + 真实展开态验收”；组件 md/stories 同步，增加长列表 story。未改共享组件或全站原生表单。
- 修复提交：见 `../../evidence/commits.json` 的 `selectFollowup`。

## AI Test Record

- Behavior changed: 比较页四类选择器使用统一弹层与焦点恢复。
- Tests added/updated: 11 个真实 Select 交互用例，覆盖键盘/Escape、添加/更换/重复、未知商品与规格、空规格、上限禁用、导航后焦点；仅 mock 路由/图片与 jsdom 缺失的 scrollIntoView/pointer capture。
- Tests run: remediation attempt 1，typecheck → lint → 应用全量 59 files / 359 tests；happy-dog 7 files / 22 tests；harness 8 项；docs/doctor/companions/diff；模块 Storybook 构建。
- Result: PASS。
- Failures or gaps: 原实现先失败于缺少可交互 listbox；替换后补齐 jsdom 缺失 API，未 mock Select。默认全并发 verify 本轮未执行，组成项逐项通过，应用测试使用两个 worker。
- Next risk: 浏览器为 Chrome 视口模拟；未运行额外生产部署或实体设备验收。

## Browser evidence

- 1440px：trigger 为按钮、高 40px；弹层高 288px，viewport 高 262px / 内容高 2792px，内部 overflow auto。End 到末项后 scrollTop=2530；Escape 不改 URL，焦点返回 compare-add-product。
- 320px：document.scrollWidth=320；trigger x=16 / width=288 / height=40；弹层 x=16 / width=288 / height=288，空间不足时向上展开，未溢出。
- 真实 Next 导航：第二列三座 Forest Walk → 两座 Winter Cream，第一列不变，价格 $3,550 → $2,600，PDP link 与 URL 一致，焦点为 compare-variant-1。
- 第一列切换缺货示例：MutationObserver 读到 pending=true 且全部 combobox disabled=true；完成后焦点为 compare-variant-0，缺货文案正确，手机仍无横溢出。
- 截图在工具记录中检查，未声明落盘截图。

## AI Review Record

- Review focus: 标签关联、占位/未知/缺货边界、禁用、URL 与 portal 焦点。
- Findings: 独立评审无阻塞；建议的未知商品/空规格两条补测已补齐并通过全量检查。真实导航冻结与长列表滚动也已由浏览器验证。
- Residual risks: 本轮仅修复截图对应比较页；其它页面未作视觉变更。
