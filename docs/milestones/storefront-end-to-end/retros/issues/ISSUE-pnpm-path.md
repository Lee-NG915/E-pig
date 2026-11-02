# pnpm 固定版本与命令入口路径

更新日期：2026-11-02

- 现象：初始 shell 的 pnpm 固定版本解析目录不可写并回退到 12.4.2；通过 Corepack 调用外层命令，不代表嵌套 package script 会自动使用相同入口。
- 首次观察：契约/实施环境核对，见 contracts.md；最终质量门前统一命令路径。
- 根因类：其他（本机工具链路径）；不修改 packageManager 固定版本来掩盖问题。
- 处理：通过 Corepack 安装验证 pnpm 10.34.5，校准 PATH 后运行完整 verify；受控降低 worker 数与部署构建错峰，未修改断言或全局测试超时。没有独立业务代码修复提交；集成交付为 `419990e`，最终焦点质量门对应 `b0dc3a9`。
- 已落地防再发：deployment.md 要求核实 pnpm 10.34.5 与 PATH，再执行完整脚本链；`logs/verify-focus-final-20261102.log` 保留完整 213 + 22 测试、Harness 8 例及 doctor 的通过结果。
- 边界：本记录是环境说明，不改 skills、包管理版本或项目质量规则。
