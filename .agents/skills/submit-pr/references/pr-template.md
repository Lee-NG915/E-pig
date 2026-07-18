# PR Body Template (Submit PR)

创建或更新 PR 时，body 必须包含以下六个段落。

## Full Template (with placeholders)

```markdown
## 🤔 what this PR does？

<本次改动摘要，来自 commit 历史或任务上下文；一句话或要点列表>

## ✔️ how to verify it?

<列出已实际跑过的验证及结果，例如：>
- `pnpm typecheck` — PASS
- `pnpm lint` — PASS
- `pnpm test` — PASS（<n> passed）
- `pnpm build` — PASS / NOT RUN（原因）
- 手动验证：<步骤 1. 2. 3. …，含预期结果>

## 💻 preview link or screenshot

<本地 URL（如 http://localhost:3000/cart）或截图说明；无 UI 改动可写 (n/a)>

## 🔗 related pr & ticket

- Links: <关联 PR / issue / 文档链接，或 (none)>
- Branch: `<branch_name>`

## 🗒️ Special notes for reviews

<给评审人的特别提示；无可写 (none)>

## ☑️ checklist

⚠️ Please self-review and check all items. ⚠️

- [x] Self-tested; verified locally
- [x] No new console errors or lint errors
- [x] Follows AGENTS.md conventions (Hard Rules checked if touching env/market/adapter/contract)
- [x] done
```

## Section Reference

| Section                    | Description                                                                 |
| -------------------------- | --------------------------------------------------------------------------- |
| what this PR does          | 一句话或要点列表概括本 PR 做什么                                             |
| how to verify it           | **已实际执行**的验证命令与结果；没跑的显式写 NOT RUN + 原因；加手动验证步骤 |
| preview link or screenshot | 本地 URL 或截图说明；无 UI 改动写 (n/a)                                      |
| related pr & ticket        | 关联链接（或 (none)）+ 当前分支名（反引号包裹）                              |
| Special notes for reviews  | 可选；架构敏感面改动（env/market/adapter/contract）在此说明                  |
| checklist                  | 自检项，必须全部勾选                                                         |
