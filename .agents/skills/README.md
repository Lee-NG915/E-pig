# Agent Skills

本目录存放项目级 Agent Skills。目标只有两个：

1. 让贡献者快速做对：先复用社区 skill，不要重复造轮子。
2. 让维护者长期可维护：内部 skill 保持和 `skills.sh` 生态兼容。

## TL;DR

- 默认先去 [skills.sh](https://skills.sh/) 搜索现成 skill。
- 社区 skill 满足需求时，直接安装并提交生成的文件。
- 只有社区 skill 不满足需求，或需要沉淀团队专属规范时，才创建内部 skill。
- 创建内部 skill 时，优先让 AI 来创建；AI 应调用对应的 `create-skill` 类 skill 完成流程，而不是手动从零搭目录和写 `SKILL.md`。

## 本仓库现有 skills 与质量工作流的关系

E-pig 的 skill 不是孤立的提示词，它们和仓库的质量门（`.claude/settings.json` hooks + `scripts/quality/`）配套工作：

| Skill | 解决什么 | 与本项目的衔接 |
| --- | --- | --- |
| `submit-pr` | 按 E-pig 约定创建/更新 GitHub PR（分支名解析类型、Conventional Commits 标题、六段 body 模板、建后自纠） | body 的 "how to verify" 段必须列**实际跑过**的 `pnpm typecheck / lint / test / build / quality:diff` 结果，没跑写 NOT RUN |
| `harness-guide` | 为某个代码领域（import 边界 / env 卫生 / 缓存规则 / market 配置 / 测试覆盖）搭建 8 组件治理 | 落地件就是本仓库已有的 Spec（AGENTS.md Hard Rules）、Static（ESLint no-restricted-imports）、Gate（diff-check.sh + stop-review.sh） |
| `vercel-react-best-practices` | React 19 / Next.js 16 性能与渲染规则速查（54 条本地筛选规则） | 先应用 E-pig 的 Cache Components、状态管理、CSP 与依赖边界覆盖，再按需读取单条规则；不自动引入示例依赖 |
| `phase-review` | **仅手动触发**：生成 Phase 完成评审（验收标准逐条取证、未实现清单、质量门实测、与参考工程多维度对比、rubric 评分），报告落盘 `docs/phase-reviews/` | 里程碑时机由人决定，AI 不得自动触发；评审本身也是质量门的消费者（实测 typecheck/lint/test/build/diff-check） |

配套的 always-on 规则在 `.agents/rules/`（编辑后质量自检循环、文档日期同步），经 `AGENTS.md` 顶部 `@include` 加载；`CLAUDE.md` 通过 `@AGENTS.md` 委托。评测用例（人工执行清单）在 `.claude/evals/`。

新增内部 skill 前先想清楚：它是否也需要挂进这套质量门（比如自动改代码的 skill 必须实现 bounded remediation loop，见 `harness-guide` 末尾的硬性要求）。

## 决策规则

### 什么时候装社区 skill

满足下面任一条件，就优先走社区 skill：

- 已经能覆盖你的需求
- 只需要少量配置或补充说明
- 需求是通用能力，不是团队专属流程

### 什么时候创建内部 skill

满足下面任一条件，再创建内部 skill：

- 社区 skill 不存在
- 社区 skill 无法表达团队专属规范
- 需要沉淀项目内特有的工作流、术语或约束

### 什么时候修改已有 skill

如果现有内部 skill 只差少量补充或修正，优先直接修改，不要重复新建。

## 常见操作

### 1. 安装社区 skill

先搜索，再安装：

```bash
npx skills find <keyword>
npx skills add <owner/repo@skill-name> -y
npx skills check
npx skills update
```

安装后通常会生成这三样内容，**都要提交**：

1. `.agents/skills/<name>/SKILL.md`
2. `.claude/skills/<name>`（软链）
3. `skills-lock.json`

### 2. 创建内部 skill

不要手动从零创建。直接让 AI 创建，并明确告诉它：

- 这个 skill 要解决什么问题
- 什么时候触发
- 团队有哪些专属规范
- 需要放在项目级 skill 目录
- 需要兼容 `skills.sh` 生态

AI 应调用对应的 `create-skill` 类 skill 来完成创建流程。

创建完成后，确认以下内容已落盘并提交：

```bash
git add .agents/skills/<skill-name> .claude/skills/<skill-name>
git commit -m "feat(skills): add <skill-name>"
```

### 3. 修改已有内部 skill

直接编辑 `.agents/skills/<skill-name>/SKILL.md`。如果只是修改内容，`.claude/skills/<skill-name>` 软链通常不需要改动。

### 4. 删除 skill

```bash
rm -rf .agents/skills/my-skill
rm .claude/skills/my-skill
git add -A
git commit -m "chore(skills): remove my-skill"
```

如果删除的是通过社区安装的 skill，也要同步移除 `skills-lock.json` 中对应的条目。

### 5. 验证是否生效

1. **Cursor**：开一个新对话，确认 skill 出现在 available skills 列表中。
2. **Claude Code**：运行 `ls -la .claude/skills/`，确认软链存在且指向正确。

> Skill 的发现通常发生在会话开始时。修改后需要开新对话才能看到变化。

## 维护者参考

### 为什么内部 skill 要兼容 `skills.sh`

因为这能同时解决三件事：

- 复用社区生态，而不是自建一套封闭格式
- 降低学习成本，团队内外的 skill 结构尽量一致
- 降低迁移和维护成本，避免后续工具切换时重新整理目录和元数据

### 目录结构（双目录约定）

```text
.agents/skills/           ← skill 源文件（git tracked，唯一事实源）
├── README.md             ← 本目录的项目级治理说明，不属于任何单个 skill
└── <skill-name>/
    ├── SKILL.md          ← 必须，主指令文件
    ├── references/       ← 可选，详细参考（SKILL.md 超 500 行时外置到这里）
    └── scripts/          ← 可选，工具脚本

.claude/skills/           ← 软链注册目录（git tracked）
└── <skill-name> -> ../../.agents/skills/<skill-name>

skills-lock.json          ← 外部安装的 skill 版本锁定（git tracked，如存在）
```

### 不同工具如何发现 skills

| 工具            | 读取路径          | 需要软链？               |
| --------------- | ----------------- | ------------------------ |
| **Cursor**      | `.agents/skills/` | 不需要，自动扫描         |
| **Claude Code** | `.claude/skills/` | 需要，通过软链指向源文件 |

> 源文件 + 软链都要提交；软链相对路径必须是 `../../.agents/skills/<name>`。

### `SKILL.md` 最小格式

```markdown
---
name: my-skill
description: 用第三人称描述做什么、什么时候触发。
---

# My Skill

## Instructions

具体指令...
```

### Frontmatter 字段

| 字段          | 要求                       | 说明                                                |
| ------------- | -------------------------- | --------------------------------------------------- |
| `name`        | 小写字母 + 横线，≤ 64 字符 | skill 唯一标识                                      |
| `description` | ≤ 1024 字符                | AI 根据这个判断是否自动触发，写不好就很难被正确触发 |

### `description` 怎么写

`description` 必须同时回答两个问题：

- 这个 skill 做什么
- 这个 skill 什么时候该被用到

```yaml
# ✅ 好：明确说了做什么 + 什么时候用
description: >
  Generate conventional commit messages following team standards.
  Use when the user asks to commit, write a commit message,
  or review staged changes before committing.

# ❌ 差：太笼统，AI 不知道什么时候该用
description: Helps with git stuff.
```

### 编写原则

- `SKILL.md` 控制在 500 行以内，详细内容外置到 `references/` 等辅助文件
- 不要写 AI 已经知道的常识，只写它不知道的领域知识和团队规范
- 术语保持一致，全文统一用同一个词指代同一个概念

## 团队协作流程

1. 开分支。
2. 优先搜索 [skills.sh](https://skills.sh/)。
3. 需要内部 skill 时，让 AI 调用对应的 `create-skill` 类 skill 创建。
4. 提交 `.agents/skills/`、`.claude/skills/` 和 `skills-lock.json` 的相关变更。
5. 提 PR，并像 review 代码一样 review skill 内容。
6. 合并后其他人 pull，开新对话即可生效。
