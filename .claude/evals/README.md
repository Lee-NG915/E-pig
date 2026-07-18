# EVAL DEFINITION: E-pig quality hooks

验证 `scripts/quality/diff-check.sh` 与 `scripts/quality/post-edit-check.sh` 的行为是否符合预期。

**已自动化（进 CI）：** `pnpm test:harness-evals` → `scripts/quality/run-post-edit-evals.mjs`  
覆盖 post-edit 的 `silent-on-unrelated-file`、`warns-on-env-file`（stdin → stdout / exit 0）。

其余条目仍为**人工执行清单**；diff-check 类需 git fixture，后续再扩自动化。

---

## diff-check.sh

执行方式：在仓库根构造 fixture（临时文件 + `git add` 或仅工作区改动），跑 `bash scripts/quality/diff-check.sh`，核对 exit code 与输出标记，然后还原 fixture。

```
[CAPABILITY EVAL: no-typescript-changes]
Fixture: 干净 git 状态（或只改 .md / .json 文件，无 .ts/.tsx diff 且无 untracked .ts/.tsx）
Success Criteria:
  - [ ] 输出包含 "[OK] No TypeScript files changed."
  - [ ] exit code = 0
  - [ ] logs/quality-diff-summary.json 的 status = "success"
```

```
[CAPABILITY EVAL: untracked-typescript-scanned]
Fixture: 新建未 `git add` 的 src/modules/cart/tmp-eval-untracked.ts（含一个 ESLint error，如未使用变量）
Success Criteria:
  - [ ] 该文件出现在 "Files scanned" 列表中
  - [ ] exit code = 1
  - [ ] 删除该文件后重跑恢复通过
```

```
[CAPABILITY EVAL: clean-typescript-passes]
Fixture: 新增一个无违规的 src/modules/catalog/foo.ts（纯函数，无 import 违规）
Success Criteria:
  - [ ] 输出包含 "[OK] All quality checks passed."
  - [ ] exit code = 0
  - [ ] summary JSON 的 fallback_triggered = false
```

```
[CAPABILITY EVAL: eslint-error-blocks]
Fixture: 变更文件里制造一个 ESLint error（如未使用变量按 error 级、或显式 @typescript-eslint 违规）
Success Criteria:
  - [ ] 输出含 "[Error/" 行且 Errors 计数 > 0
  - [ ] exit code = 1
  - [ ] 输出含 "Safe retry: pnpm quality:diff" 与 "Stop condition" 行
```

```
[CAPABILITY EVAL: fallback-secret-signature]
Fixture: 变更文件 src/platform/config/foo.ts 含 `NEXT_PUBLIC_STRIPE_SECRET_KEY = '...'`；
         模拟 ESLint 崩溃（如临时把文件改成语法错误使 ESLint 无法产出结构化结果）
Success Criteria:
  - [ ] 输出含 "[ERR][grep-fallback] NEXT_PUBLIC_* variable looks like a secret"
  - [ ] exit code = 1
  - [ ] summary JSON 的 fallback_triggered = true、fallback_confidence = "low"
```

```
[CAPABILITY EVAL: fallback-module-boundary-signature]
Fixture: 变更文件 src/modules/cart/foo.ts 含 `import { x } from '@/adapters/commerce/mock'`；
         同样模拟 ESLint 崩溃
Success Criteria:
  - [ ] 输出含 "[ERR][grep-fallback] src/modules/ importing @/adapters or @/integrations"
  - [ ] exit code = 1
```

```
[CAPABILITY EVAL: fallback-process-env-signature]
Fixture: 变更文件 src/modules/order/foo.ts 含 `process.env.MARKET`；
         同样模拟 ESLint 崩溃
Success Criteria:
  - [ ] 输出含 "[ERR][grep-fallback] process.env read outside src/platform/config/env.ts"
  - [ ] exit code = 1
Negative case: 同样的 process.env 出现在 src/platform/config/env.ts 中不得命中。
```

---

## check-component-companions.mjs

```
[CAPABILITY EVAL: companions-warn-missing-spec]
Fixture: 工作区改动触及 src/modules/catalog/components/product-card/product-card.tsx（或临时 touch），且临时移走同目录 product-card.spec.*
Success Criteria:
  - [ ] `pnpm quality:companions` 输出含 CF-2 / missing spec
  - [ ] 默认 warn：exit code = 0
  - [ ] logs/component-folder-companions.json 存在且 violation_count >= 1
```

```
[CAPABILITY EVAL: companions-cf1-unlisted-flat]
Fixture: 新建未登记扁平文件 src/modules/catalog/components/tmp-cf1-flat.tsx（勿写入 legacyFlatFiles）
Success Criteria:
  - [ ] `pnpm quality:companions` 输出含 CF-1
  - [ ] 默认 warn：exit code = 0
  - [ ] 删除该文件后重跑不再报该路径
```

```
[CAPABILITY EVAL: page-placement-signature-warn]
Fixture: 新建 src/app/_components/tmp-dump.tsx（合法 TS，无 ESLint error）
Success Criteria:
  - [ ] `pnpm quality:diff` 输出含 `[WARN][signature-scan]` 与 page-workflow-guide / modules
  - [ ] exit code = 0（warn 不阻断）
  - [ ] 删除该文件后重跑恢复
```

```
[CAPABILITY EVAL: companions-error-blocks]
Fixture: 同上；执行 `pnpm quality:companions -- --level=error`
Success Criteria:
  - [ ] exit code = 1
  - [ ] 输出含 missing companions
```

```
[CAPABILITY EVAL: companions-report-all]
Fixture: 无要求；执行 `pnpm quality:companions -- --report-all`
Success Criteria:
  - [ ] 扫描 happy-dog + allowlist modules
  - [ ] exit code = 0（warn）
  - [ ] 对缺 stories 的 happy-dog 组件报 CF-3（若适用）
```

```
[CAPABILITY EVAL: companions-via-quality-diff]
Fixture: 有任意 .ts/.tsx 变更；执行 `pnpm quality:diff`
Success Criteria:
  - [ ] 输出含 companions 汇总行（`[companions]`）
  - [ ] 默认不因 companions warn 使 quality:diff 失败
```

---

## post-edit-check.sh

执行方式：用管道注入 hook JSON：`echo '{"tool_input":{"file_path":"<path>"}}' | bash scripts/quality/post-edit-check.sh`，核对输出与 exit code（**全部用例 exit code 都必须是 0**——hook 从不阻断）。

```
[CAPABILITY EVAL: warns-on-component-impl]
Fixture: file_path = "src/modules/catalog/components/product-card/product-card.tsx"
Success Criteria:
  - [ ] 输出含 "[WARN] [Companions]"
  - [ ] 输出含 component-workflow-guide.md 或 quality:companions
  - [ ] exit code = 0
```

```
[CAPABILITY EVAL: silent-on-unrelated-file]  ← AUTOMATED (pnpm test:harness-evals)
Fixture: file_path = "src/shared/lib/money.ts"
Success Criteria:
  - [x] 无任何输出
  - [x] exit code = 0
```

```
[CAPABILITY EVAL: warns-on-rules-doc]
Fixture: file_path = ".agents/rules/quality-self-check.md"（或 "AGENTS.md"、"docs/codex/research/04-e-pig-target-architecture.md"）
Success Criteria:
  - [ ] 输出含 "[WARN] 规则/架构文档被修改"
  - [ ] exit code = 0
```

```
[CAPABILITY EVAL: warns-on-env-file]  ← AUTOMATED (pnpm test:harness-evals)
Fixture: file_path = "src/platform/config/env.ts"
Success Criteria:
  - [x] 输出含 "[WARN] [Quality] 该文件涉及架构敏感面"
  - [x] 输出列出 NEXT_PUBLIC_* / process.env / Hard Rules 提示
  - [x] exit code = 0
```

```
[CAPABILITY EVAL: warns-on-adapter-file]
Fixture: file_path = "src/adapters/payment/stripe.ts"（命中 adapter + payment 双关键词）
Success Criteria:
  - [ ] 输出含 "[WARN] [Quality] 该文件涉及架构敏感面"
  - [ ] exit code = 0
```

```
[CAPABILITY EVAL: warns-on-checkout-file]
Fixture: file_path = "src/modules/checkout/checkout-form.tsx"
Success Criteria:
  - [ ] 输出含 "[WARN] [Quality] 该文件涉及架构敏感面"
  - [ ] exit code = 0
```

```
[CAPABILITY EVAL: graceful-on-malformed-input]
Fixture: stdin 注入非法 JSON（`echo 'not json'`）或缺 tool_input 字段的 JSON
Success Criteria:
  - [ ] 无任何输出、不报错
  - [ ] exit code = 0
```

---

## 备注

- fallback 类用例（fallback-*）执行后务必还原语法错误 fixture，避免污染后续验证。
- 已落地：`scripts/quality/run-post-edit-evals.mjs`（CI step `Harness evals (post-edit)`）。
- 后续可扩：companions CF-1 fixture、diff-check 签名用例（需临时文件沙箱）。
