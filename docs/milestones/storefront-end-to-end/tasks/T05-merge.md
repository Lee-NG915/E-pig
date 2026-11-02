# T05 — PR 与主分支合并准备

更新日期：2026-11-03

## 范围与验证

用户明确授权创建 PR 并合并 main。主分支为 `6b29ef3`，当前分支包含此前尚未进 main 的 6 个基线提交与本轮商城提交；独立只读审查没有发现当前残留的高置信运行时或安全阻塞。保留这些先祖提交，PR 采用 merge commit 保留溯源历史。

- 本轮新修改仅部署触发配置与验收文档；应用运行代码仍是已部署的 `b0dc3a9`。
- Cloudflare 仅在 main 上手动 workflow_dispatch 且 quality 成功后运行；PR/main push 的 quality 保持，未自动向 Cloudflare 发布。
- 独立 3DS 补验已有浏览器记录；本轮只读查 Stripe challenge/authenticated/paid 与 Neon paid AUD 750 一致。
- 重新执行完整 verify：213 应用测试、22 happy-dog、Harness 8、docs/typecheck/lint/doctor 全部通过。quality:diff 通过；companions 为既有 warn-only 债务，不作为全仓 companion 齐备证明。
- DTC skills 属于先祖提交的 local-symlink 模式，依赖兄弟目录 `../DTC-skills`。当前工作区 doctor 通过；无该目录的干净克隆不具备同样的 doctor 条件。GitHub quality 不运行 doctor。
- 远端 PR/main CI 和最终合并状态以 GitHub PR 页面为准。

## AI Test Record

- Behavior changed: 普通 PR/main push 只验证；Cloudflare 发布改为 main 上显式手动触发。无新增应用运行时行为。
- Tests added/updated: 无；部署触发配置采用独立条件审查与 GitHub 实际工作流验证，不增加镜像 YAML 的应用单测。
- Tests run: `VITEST_MAX_WORKERS=4 pnpm verify`、`pnpm quality:diff`、`pnpm quality:companions -- --report-all`、`git diff --check`。
- Result: PASS（本地）；GitHub 状态见 PR。
- Failures or gaps: 既有 companions 警告、DTC 本地目录前提、完整人工/实体设备 UAT。
- Next risk: 不将 main 合并当作正式收款或 Cloudflare 交易部署验收。

## AI Review Record

- Review focus: 先祖差异、PR 可合并范围、部署副作用、3DS 证据与文档一致性。
- Findings: 旧 CF 自动发布边界已改为手动；3DS 状态已按服务端证据同步。独立审查无新增代码阻塞。
- Residual risks: DTC 外部目录依赖和既有 companion 债务已披露；完整实体设备 UAT 尚未完成。
