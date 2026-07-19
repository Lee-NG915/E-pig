# Agent Skills 迁移与适配审计

更新日期：2026-07-19

## 目标

本文件记录项目级 Agent Skills 的保留范围与适配结果。它只描述当前仓库可执行的约定，不保存来源工程的绝对路径、工单系统 ID、监控项目 ID、环境分支或失效命令。

## 当前结构

- `.agents/skills/` 是 skill 唯一事实源。
- `.claude/skills/` 与 `.cursor/skills/` 指向上述目录（软链或 skills CLI copy）。
- `~/.cursor/skills/` 对本机 Cursor 再挂一层指向本仓库 skills 的软链（本地开发便利；不作为仓库真源）。
- `.agents/rules/` 保存 always-on 的文档新鲜度和质量自检规则。
- `AGENTS.md` 是架构、命令与质量要求的权威入口（thin router + Hard Rules）。
- `skills-lock.json` 锁定已安装的社区 skill 版本哈希。
- 统筹入口：`e-pig-dev-loop`；项目规则索引：`e-pig`。

## 审计结论

| Skill | 状态 | 当前项目适配 |
| --- | --- | --- |
| `e-pig-dev-loop` | 内部新建 | 调度 grill-me / ponytail / tdd / impeccable / Superpowers 子集；声明 precedence 与冲突矩阵 |
| `e-pig` | 内部新建 | Saleor Paper 式 on-demand rules（architecture / caching / seo / component / markets） |
| `harness-guide` | 保留并改写 | 单 Next.js App、ESLint、CI、`scripts/quality/`、Hard Rules |
| `submit-pr` | 保留并改写 | GitHub CLI + Conventional Commits + 六段 PR 模板 |
| `phase-review` | 保留 | **仅手动触发** |
| `vercel-react-best-practices` | 保留并筛选 | React 19 / Next 16 Cache Components 覆盖 |
| `grill-me` / `grilling` / `tdd` / `implement` / `code-review` | 社区安装（mattpocock/skills） | Align / TDD / review；经 orchestrator 调用 |
| Superpowers 子集 | 社区安装（obra/superpowers） | `using-superpowers` 等已加 `disable-model-invocation` + E-pig override |
| `ponytail*` | 社区安装（DietrichGebert/ponytail） | 默认 lite、opt-in；禁删测试/harness |
| `impeccable` | 社区安装（pbakaus/impeccable） | 配合根目录 `DESIGN.md` / `PRODUCT.md` |

## Saleor Paper 融合（模式，非依赖）

采纳：thin AGENTS router、on-demand rules、cache-manifest、verify/doctor、SEO helpers、page shell/dynamic island 文档口径。  
拒绝：Saleor GraphQL/DTO、locale/channel URL、双 surface checkout、把交易数据放进共享 cache。

## 已删除的迁移耦合

- 来源工程的绝对路径、内部包名和 monorepo 命令。
- 团队专属工单、监控项目、成员与环境分支规则。
- 本仓库不存在的构建器、生成文档与维护脚本说明。
- 会建议安装未采用状态库或缓存库的性能规则。
- 与 Next.js 16 显式缓存模型冲突的旧缓存措辞。

## 维护约束

1. 新增或升级社区 skill 时，先检查 `package.json`、`AGENTS.md` 和实际目录，再决定保留哪些规则；更新 `skills-lock.json` 与本审计表。
2. 示例中的第三方包不等于项目依赖；没有明确需求时不得自动安装。
3. 自动修改代码的 skill 必须遵守 bounded remediation loop，并使用项目现有 typecheck、lint、test 和 diff gate。
4. skill 正文只保存当前可执行流程；历史来源与已弃用团队流程不进入仓库。
5. 修改后校验 SKILL frontmatter、软链接目标、文档同步；跑 `pnpm doctor`。
6. 社区 skill 若与 Hard Rules 冲突，在 skill 副本顶部写 E-pig override，并更新 `e-pig-dev-loop/CONFLICTS.md`。
