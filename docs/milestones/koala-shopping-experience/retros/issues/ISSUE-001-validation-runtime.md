# ISSUE-001 — 验证运行环境

更新日期：2026-11-03

- 现象：默认全并发 Vitest 的既有 env-policy 测试超过 5s；pnpm smoke 首次子进程未启动。
- 首次引入：原测试/启动脚本已存在；本轮未修改它们。没有证据表明此实现改变了 env policy。
- 根因类：环境/工具。并发资源争用为推断；单测 3/3 和完整 --maxWorkers=2 254/254 均通过。smoke 读取 npm_execpath 后用 node 启动；全局 pnpm 是 Mach-O executable，不是 JS。
- 处理：测试采用受限并发，不放宽断言和超时；smoke 使用已安装的固定版本 `/Users/lidonghai/.cache/node/corepack/v1/pnpm/10.34.5/bin/pnpm.cjs`，原脚本通过。
- 防再发：本里程碑验收记录固定准确命令和实际结果，不把默认 verify 写成成功；后续可独立维护测试并发与脚本 pnpm launcher 兼容性，避免混入商品体验 patch。
- 状态：源码功能验证通过；默认全并发可靠性仍是后续工具维护项。
