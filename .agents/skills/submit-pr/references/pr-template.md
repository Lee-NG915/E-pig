# PR Body Template (Submit PR)

**Canonical（GitHub 网页提 PR 共用）：** 仓库根 `.github/PULL_REQUEST_TEMPLATE.md`。  
本文件是 skill 侧说明；创建/更新 PR 时 body 必须与 canonical **同结构**（含 AI Test / Review Record）。

## Full Template

与 `.github/PULL_REQUEST_TEMPLATE.md` 一致，填入实际内容后提交：

```markdown
## 🤔 what this PR does？

<本次改动摘要>

## ✔️ how to verify it?

- `pnpm typecheck` — PASS / NOT RUN（原因）
- `pnpm lint` — …
- `pnpm test` — …
- `pnpm test:harness-evals` — …
- `pnpm quality:diff` — …
- `pnpm build` — …
- 手动验证：…

## 💻 preview link or screenshot

<URL / 截图 / (n/a)>

## 🔗 related pr & ticket

- Links: <… 或 (none)>
- Branch: `<branch_name>`

## 🗒️ Special notes for reviews

<… 或 (none)>

## AI Test Record

- Behavior changed: …
- Tests added/updated: …
- Tests run: …
- Result: PASS / FAIL / PARTIAL / NOT RUN
- Failures or gaps: …
- Next risk: …

## AI Review Record

- Review focus: … 或 (n/a — Dual-AI not required)
- Findings: …
- Residual risks: …

## ☑️ checklist

- [x] Self-tested; verified locally
- [x] No new console errors or lint errors
- [x] Follows AGENTS.md Hard Rules (if touching env/market/adapter/contract/cache)
- [x] Companion files synced when changing components (`pnpm quality:companions`) or N/A
- [x] AI Test Record filled (or explicit exemption)
- [x] done
```

## Section Reference

| Section | Description |
| --- | --- |
| what this PR does | 一句话或要点列表 |
| how to verify it | **已实际执行**的验证；没跑写 NOT RUN + 原因 |
| preview / related / Special notes | 同前 |
| AI Test Record | 行为变更必填；纯文档可写 `Behavior changed: none (docs-only)` |
| AI Review Record | Dual-AI 时必填；否则 `(n/a — Dual-AI not required)` |
| checklist | 自检项，必须勾选 |
