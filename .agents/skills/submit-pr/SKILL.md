---
name: submit-pr
description: >
  Use when the user requests "submit PR", "create PR", "open a PR",
  "raise a PR for current branch", "提 PR", or similar. Creates or updates a
  GitHub PR following E-pig conventions: parses the type prefix from the branch
  name, generates a Conventional Commits title, fills the six-section PR body
  template, and self-corrects the title format after creation when needed.
---

# Submit PR

按 E-pig 约定创建或更新 GitHub PR：从分支名解析类型前缀 → 生成 Conventional Commits 标题 → 按六段模板填 body → `gh pr create` / `gh pr edit` → 建后格式自纠。

## Conventions

- **分支名类型解析**：从分支名解析类型前缀——
  - 形如 `feat/xxx`、`fix/xxx`、`chore/xxx`、`docs/xxx`、`refactor/xxx`、`test/xxx`、`perf/xxx`、`build/xxx`、`ci/xxx`、`style/xxx`（可带作者前缀，如 `alice/feat/add-cart`）→ 取该前缀为 `type`。
  - 分支名本身以 conventional 类型开头（如 `fix-cart-total`）→ 取该类型。
  - 解析不到 → 默认 `chore`。
- **PR 标题**：遵循 Conventional Commits——`{type}: {summary}`。summary 用一句英文小写开头短句（或中文短句）概括本次改动，不带句号。
- **默认分支**：先跑 `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` 拿 `base_branch`（通常是 `main` 或 `master`）。

## Steps

### 1. 拿当前分支

```bash
git branch --show-current
```

### 2. 解析类型前缀

按上面 Conventions 的规则从 `branch_name` 解析 `type`，解析不到用 `chore`。

### 3. 组装标题与 body

- 标题：`{type}: {summary}`，summary 从 commit 历史（`git log <base>..HEAD --oneline`）或本次任务上下文提炼。
- body：必须完整包含六段，见 **`references/pr-template.md`**：
  1. `## 🤔 what this PR does？` — 本次改动摘要
  2. `## ✔️ how to verify it?` — 列出**已实际跑过**的验证及结果（`pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` / `pnpm quality:diff`），没跑的要写明 NOT RUN 及原因
  3. `## 💻 preview link or screenshot` — 本地 URL（如 `http://localhost:3000/...`）或截图说明
  4. `## 🔗 related pr & ticket` — 关联 PR / issue / 文档链接；没有则写 `(none)`，并附 Branch 行
  5. `## 🗒️ Special notes for reviews` — 评审注意事项（可选）
  6. `## ☑️ checklist` — 自检清单（至少 `- [x] done`）

### 4. 创建或更新 PR

- **创建**：`gh pr create --base <base_branch> --head <current_branch> --title "<title>" --body "<full body>"`
- **已存在则更新**：`gh pr view --json number -q .number` 拿到 PR 号后 `gh pr edit <pr_number> --title "<title>" --body "<full body>"`（只改 body 可省略 `--title`）

### 5. 建后格式校验（强制自纠）

创建/更新后立即校验：

- 标题是否匹配 `^(feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert)(\(.+\))?!?: .+`
- body 是否含全部六段标题

不符合 → 立即 `gh pr edit` 纠正后再返回，不得把格式错误的 PR 留给用户。

## Summary

1. `git branch --show-current` → `branch_name`。
2. 从分支名解析 `type`（feat/fix/chore/... 前缀，解析不到默认 chore）。
3. 标题 `{type}: {summary}`（Conventional Commits）。
4. `gh repo view --json defaultBranchRef` 拿默认分支。
5. `gh pr create` 或 `gh pr edit`，body 按 `references/pr-template.md` 六段填满。
6. 建后校验标题/body 格式，错了立即 `gh pr edit` 自纠。

## References

- **`references/pr-template.md`**：完整 PR body 模板、六段说明与填写示例。填 body 时参考该文件。
