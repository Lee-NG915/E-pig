# Agent Skills 迁移与适配审计

更新日期：2026-07-18

## 目标

本文件记录项目级 Agent Skills 的保留范围与适配结果。它只描述当前仓库可执行的约定，不保存来源工程的绝对路径、工单系统 ID、监控项目 ID、环境分支或失效命令。

## 当前结构

- `.agents/skills/` 是 skill 唯一事实源。
- `.claude/skills/` 只保存指向上述目录的相对软链接。
- `.agents/rules/` 保存 always-on 的文档新鲜度和质量自检规则。
- `AGENTS.md` 是架构、命令与质量要求的权威入口。

## 审计结论

| Skill | 状态 | 当前项目适配 |
| --- | --- | --- |
| `harness-guide` | 保留并改写 | 使用单 Next.js App、ESLint flat config、现有 CI、`scripts/quality/` 和项目 Hard Rules；扫描命令统一使用 `rg` |
| `submit-pr` | 保留并改写 | 只依赖 Git 分支、GitHub CLI、Conventional Commits 与六段 PR 模板；不依赖外部工单或监控项目命名 |
| `vercel-react-best-practices` | 保留并筛选 | 以 React 19、Next.js 16 Cache Components、现有依赖和 CSP 方向为覆盖条件；移除 SWR、进程内跨请求 LRU 与通用内联 hydration 脚本规则 |

## 已删除的迁移耦合

- 来源工程的绝对路径、内部包名和 monorepo 命令。
- 团队专属工单、监控项目、成员与环境分支规则。
- 本仓库不存在的构建器、生成文档与维护脚本说明。
- 会建议安装未采用状态库或缓存库的性能规则。
- 与 Next.js 16 显式缓存模型冲突的旧缓存措辞。

## 维护约束

1. 新增或升级社区 skill 时，先检查 `package.json`、`AGENTS.md` 和实际目录，再决定保留哪些规则。
2. 示例中的第三方包不等于项目依赖；没有明确需求时不得自动安装。
3. 自动修改代码的 skill 必须遵守 bounded remediation loop，并使用项目现有 typecheck、lint、test 和 diff gate。
4. skill 正文只保存当前可执行流程；历史来源与已弃用团队流程不进入仓库。
5. 修改后校验 SKILL frontmatter、软链接目标、文档同步和禁用关键词扫描。
