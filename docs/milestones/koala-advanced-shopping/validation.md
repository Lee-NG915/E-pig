# C 批验证记录

更新日期：2026-11-03

本文件保留原 C 批验收；最新 C02 浏览购物流程见文末 follow-up 和独立交付记录。

## 自动检查

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| TypeScript → ESLint → 应用全量 Vitest | PASS | remediation attempt 1，最新 64 个应用 spec / 405 tests，最多 2 workers；没有跳过测试 |
| happy-dog | PASS | 7 files / 22 tests |
| Harness | PASS | post-edit 2/2、stop-review 3/3、boundary 3/3 |
| docs:check、agent-doctor、companions、quality:diff | PASS | 新组件 companion 齐全，依赖方向通过 |
| Next production build | PASS | 17 路由项静态生成，商业数据保持 request-time |
| Storybook modules build | PASS | 新示例构建成功；large-chunk 为提示 |
| SG 原有 standalone smoke | PASS | 使用固定 pnpm 10.34.5 启动原脚本 |
| SG / US C 批扩展 smoke | PASS | 同一 AU production build 各 7 项：币种/价格、套装、配送不支持、比较、筛选、checkoutDisabled |

执行收敛命令：

```sh
node scripts/quality/remediation-loop.mjs --run-id koala-c-20261103 --attempt 1 \
  --typecheck-cmd 'node node_modules/typescript/bin/tsc --noEmit' \
  --lint-cmd 'node node_modules/eslint/bin/eslint.js .' \
  --test-cmd 'node node_modules/vitest/vitest.mjs run --maxWorkers=2'
```

其余命令通过固定 pnpm 10.34.5 JS 入口或对应脚本执行。**本轮没有重跑默认全并发 `pnpm verify` 一体命令**；全部组成项逐项执行通过。两个 worker 沿上批已记录的 env-policy/ESLint 加载超时证据，未更改断言、全局测试超时或配置。质量摘要在 [evidence/quality.json](evidence/quality.json)。

## 浏览器验收

| 能力 | 已观察行为 | 结果 |
| --- | --- | --- |
| 筛选 | 非法上下限明确报错；提交 Forest Walk + 3000–4000 + in-stock 得到三座规格 $3,550；清除保留排序并恢复 29 件 | PASS |
| 比较（旧实现历史验证） | 三列；旧链接兼容；连续改变前列与中列，URL、规格、图片、价格与 PDP 链接一致；选择后焦点保留 | PASS |
| 配送 | 2000 → 明示 2–4 个工作日；9999 → 无示例、不推断覆盖；Checkout 输入共用规则 | PASS |
| 评价 | 四条明显示例；3 星得到 1 条、展开正文；1 星空态带重置入口 | PASS |
| 套装 | 单次成功 addItems POST，两条正确 product/variant，各 qty 1；小计 $2,350 | PASS |
| 优惠/结算 | DEMO10 折扣 $235、总额 $2,115；无效码保留旧优惠；移除/重新应用；Checkout 读回相同两项和金额 | PASS |
| 响应式 | 比较 320/1440、PLP/PDP/Cart/Checkout 390px 无横溢出；Checkout 桌面双栏 | PASS |
| 清理 | 移除优惠和两件测试商品，读回空购物袋 | PASS |

详细数字：[browser.json](evidence/browser.json)、[compare-browser.json](evidence/compare-browser.json)、[runtime-markets.json](evidence/runtime-markets.json)。截图在工具记录中直观检查，没有声称已落盘截图。

## AI Test Record

- Behavior changed: C01–C06；筛选与比较、示例配送与评价、优惠总额、原子套装与失败恢复。
- Tests added/updated: 就近纯函数、adapter、React、API/store 测试；真实 PGlite 事务；真实 PDP → store 的跨入口重试回归。
- Tests run: 上述顺序质量门、其余 verify 组成项、build/Storybook、浏览器与 SG/US standalone。
- Result: PASS。
- Failures or gaps: 默认全并发 verify 本轮 NOT RUN，替换为相同组成项与两 worker 全量测试；无新托管支付验收。
- Next risk: 接入真实配送/优惠/评价来源时需另定业务规则；新渠道与部署不在本轮范围。

## AI Review Record

- Review focus: 同规格筛选、URL 状态、价格与幂等/锁车、原子回滚、示例数据边界、真实 store 恢复与无障碍。
- Findings: 已修复比较页重复 URL 参数造成的旧规格展示；已修复未发送的跨入口请求误锁；成功提示与实际成功规格绑定。半分舍入增加明确回归。独立复核未发现剩余阻塞项。
- Residual risks: SQL/catalog 为真实本地集成，PaymentPort 边界为 mock；本地测试和浏览器金额读回不等于 Stripe 托管支付、远程部署或业务验收。

## C02 browsing comparison follow-up (2026-11-03)

当前 C02 验收以 [购物旅程交付](tasks/C02-browse-comparison.md)与 [comparison-journey.json](evidence/comparison-journey.json) 为准：64 文件 / 405 应用测试、22 基础组件测试、其余质量组成项、生产/Storybook 构建及 SG smoke 均通过。此前本文件的 URL 比较行为为历史验收，已被 browser shortlist 和 selected-only 表格替代。独立评审发现的后台旧价格和移除焦点两项 P2 均经回归修复、复核通过。
