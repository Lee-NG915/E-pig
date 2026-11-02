# T04 — 窄屏 Header 公告重叠修复

更新日期：2026-11-02

状态：本地实现、定向测试与 ESLint 通过；等待父任务重建后浏览器复验。

父任务在实际 375px 视口确认：沙箱公告与右侧 AU 市场标签发生重叠。原顶栏固定 36px 且强制横排，公告内 inline span 的 truncate 未限制文字溢出。

修复将 1024px 以下顶栏改为自然上下两排：公告完整换行，市场名/币种和辅助链接位于下一排，保留 Learn more 可操作入口；1024px 以上继续使用原固定高度横排。全部沿用 happy-dog 语义 token 与现有间距，不缩小或截断沙箱提示。

## AI Test Record

- Behavior changed: 窄屏公告与市场身份采用独立文档流，公告可换行；新增可访问的沙箱公告 note。
- Tests added/updated: Header 测试保护完整沙箱文案、有效 Learn more 链接、独立市场名称/币种；未用 className 快照冒充几何验收。
- Tests run: `corepack pnpm exec eslint src/modules/content/components/site-header`；`corepack pnpm test src/modules/content/components/site-header/site-header.spec.tsx`。
- Result: PASS — 7 个 Header 测试，定向 ESLint 通过。新增语义断言先 RED 后 GREEN。
- Failures or gaps: jsdom 不执行真实 CSS 排版，本记录不声称已在浏览器证明无重叠。父任务将重建并复验 320 / 375 / 768 / 1440px。
- Next risk: 长市场名称与放大字体仍以实际浏览器排版为验收依据。
