## 🤔 what this PR does？

<!-- 一句话或要点列表概括本次改动 -->

## ✔️ how to verify it?

<!-- 只写已实际跑过的命令与结果；没跑的写 NOT RUN + 原因 -->

- `pnpm typecheck` —
- `pnpm lint` —
- `pnpm test` —
- `pnpm test:harness-evals` —
- `pnpm quality:diff` —
- `pnpm build` —
- 手动验证：

## 💻 preview link or screenshot

<!-- 本地 URL / 截图；无 UI 改动写 (n/a) -->

## 🔗 related pr & ticket

- Links: <!-- 关联 PR / issue / 文档，或 (none) -->
- Branch: `<!-- branch name -->`

## 🗒️ Special notes for reviews

<!-- 架构敏感面（env/market/adapter/contract/cache/cart cookie）说明；无可写 (none) -->

## AI Test Record

<!-- 行为变更必填；纯文档/格式豁免时写 Behavior changed: none (docs-only) -->

- Behavior changed:
- Tests added/updated:
- Tests run:
- Result: PASS / FAIL / PARTIAL / NOT RUN
- Failures or gaps:
- Next risk:

## AI Review Record

<!-- Dual-AI 时必填（cart/catalog/checkout/payment 等）；否则写 (n/a — Dual-AI not required) -->

- Review focus:
- Findings:
- Residual risks:

## ☑️ checklist

- [ ] Self-tested; verified locally
- [ ] No new console errors or lint errors
- [ ] Follows AGENTS.md Hard Rules (if touching env/market/adapter/contract/cache)
- [ ] Companion files synced when changing components (`pnpm quality:companions`) or N/A
- [ ] AI Test Record filled (or explicit exemption)
- [ ] done
