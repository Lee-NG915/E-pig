# T04 — Final review fixes

更新日期：2026-11-03

状态：F1–F3 / Proxy / 文案已提交推送并复核；最终集成质量门通过；浏览器 T04 未结束

## 最终集成交付（覆盖下文实施时的待办状态）

- Commits：`419990e` 包含 F1–F3 与 Proxy 修复；`23835a8` 包含 checkout 文案；后续焦点修复 `b0dc3a9` 见 T04-focus.md。三者均已推送里程碑分支，未声明合并主干。
- 最终完整 verify：应用 47 文件 / 213 测试，happy-dog 7 文件 / 22 测试，Harness 8 例与 doctor PASS；证据 `logs/verify-focus-final-20261102.log`。独立最终源码 review 含焦点修复，无未解决 finding。
- Next 与 Netlify adapter 构建 PASS，先前 modules Storybook PASS，同一 AU 构建下 SG/US standalone 检查 PASS。Proxy 修复后的实际 Netlify 打包已通过，不再保留为未验证构建项。
- 主任务已在托管站点完成真实桌面 Stripe 沙箱支付 AUD 3,800，订单 `96a008f6-6e14-495b-9b2e-1d04b6db7512` 回查成功，重复真实 Webhook 仍一订单；真实云端 HTTP 并发同 checkout、锁车 409、取消核验解锁 PASS。以上不证明 idle Pool 实际断线重连或任意故障注入已完成。
- 移动拒付显示错误且数据库仍 open / 0 订单；3DS 后续补验及服务端 authenticated / paid 复核通过。完整人工 UAT 未执行，详细状态由主任务维护 acceptance.md / deployment.md。下文保留每次修复时的 scoped 证据与当时的待验证边界。

## Changes

- **F1 / idle Pool errors:** `createCommercePool` installs a persistent error listener. The existing structured logger emits only `commerce.pool_idle_error`; raw driver errors, connection strings and configuration are omitted. Repeated simulated idle errors no longer escape through EventEmitter. This does not claim real cloud reconnect validation.
- **F2 / private checkout denial:** GET and cancellation 401/403/404 clear shared checkout Query data as well as hiding the current view. Remount cannot display the rejected contact/address/payment link while a new read is unresolved. Cancellation still aborts old reads first, and an aborted GET cannot purge newer data or initiate terminal cart refresh. Only a new authorized read restores shared details. The cancellation error stays visible while its automatic read is pending.
- **F3 / terminal cart refresh:** a successful, non-aborted paid/expired GET immediately starts shared `refreshCart`. Existing revision/checkout-lock protections remain the acceptance boundary. A cart refresh failure leaves the trusted checkout result intact, preserves the existing lock, and is retried by the next trusted status read. Explicit cancellation retains its existing cart refresh.
- Updated the CheckoutStatus companion with denial/remount and cart-refresh behavior. No dependency, deployment, environment or package changes are part of this fix patch; no commit was created by this fix task.

## Regression evidence

- Initial RED: `corepack pnpm test src/adapters/commerce/postgres/pool.spec.ts src/modules/checkout/components/checkout-status/checkout-status-regression.spec.tsx` — **10 failed / 7 passed**. Reproduced the unhandled idle event, cancellation denial remount exposure for 401/403/404, retained private GET cache for 401/403/404, missing paid/expired cart refresh, and missing retry after transient cart refresh failure.
- GREEN: `corepack pnpm test src/adapters/commerce/postgres/pool.spec.ts src/modules/checkout/components/checkout-status/checkout-status.spec.tsx src/modules/checkout/components/checkout-status/checkout-status-regression.spec.tsx` — **22 passed / 3 files**. Includes existing stale-open GET cancellation and same-revision stale-cart lock regressions.
- Final ordered quality checks: `corepack pnpm typecheck` — **PASS**; `corepack pnpm lint` — **PASS**; owned-file `corepack pnpm exec eslint src/adapters/commerce/postgres/pool.ts src/adapters/commerce/postgres/pool.spec.ts src/modules/checkout/components/checkout-status` — **PASS**; scoped test command above rerun — **22 passed / 3 files**.

## AI Test Record

- Behavior changed: Idle database pool errors are handled with sanitized logging; private checkout data is purged on rejected access across remount; trusted terminal checkout reads refresh the shared cart and allow retry after refresh failure.
- Tests added/updated: New `pool.spec.ts` (2 tests); `checkout-status-regression.spec.tsx` adds 9 parameterized cases covering cancellation/GET 401/403/404 with remount and renewed authorization, aborted stale GET, paid/expired cart refresh, transient refresh failure recovery. Existing terminal ordering and cart lock tests retained.
- Tests run: RED regression command, GREEN full checkout-status/pool command, final `typecheck` → full `lint` → owned ESLint → scoped test rerun; commands and counts above.
- Result: PASS — scoped source checks, 22 tests. Initial failures are recorded regression evidence, not remaining failures.
- Failures or gaps: Integrated `pnpm verify`, independent post-fix source review, remote pool reconnect/contention, browser visual checks and hosted Stripe sandbox acceptance are not established by this fix task. Root task coordinates those gates.
- Next risk: Confirm the integrated working tree and deployment independently; no real cloud reconnect or completed payment is claimed here.

## Deployment build addendum — defer proxy environment evaluation

- Concrete failure: `logs/netlify-build-20261102.log:104–132` shows Netlify Edge bundling imports the generated proxy without request-time `MARKET`; top-level `env` evaluation rejects the module before packaging finishes.
- Minimal correction: `src/proxy.ts` is async and dynamically imports the existing validated env module only after `/api` bypass. Importing the proxy bundle needs no request environment; public requests still fail closed when MARKET is missing. No MARKET default, build-time AU freeze, schema relaxation or skipValidation was introduced. API handlers keep their own market/auth checks.
- Regression uses the real environment schema, with production mode and VITEST fallback disabled: missing MARKET allows proxy import and API/webhook bypass but rejects the first public request. AU/SG/US requests each retain 308 normalization, query strings and same-market pass-through.
- RED: `corepack pnpm test src/proxy.spec.ts` — **1 failed / 3 passed**; failure is the original import-time env rejection. GREEN and final rerun — **4 passed / 1 file**.
- Final ordered checks: `corepack pnpm typecheck` — **PASS**; `corepack pnpm lint` — **PASS**; `corepack pnpm exec eslint src/proxy.ts src/proxy.spec.ts` — **PASS**; `corepack pnpm test src/proxy.spec.ts` — **4 passed**. Root owns the fresh Netlify build and deployment evidence; local regression success does not establish packaging or hosted acceptance.

## AI Test Record — proxy addendum

- Behavior changed: Proxy environment evaluation occurs on public requests rather than bundle import; API bypass remains independent of request environment.
- Tests added/updated: `src/proxy.spec.ts`, 4 cases using the real env schema for missing production MARKET and runtime AU/SG/US.
- Tests run: RED → GREEN proxy tests, final typecheck → full lint → owned ESLint → proxy tests.
- Result: PASS — 4 tests and static checks.
- Failures or gaps: Netlify rebuild and hosted runtime validation are not performed by this fix task.
- Next risk: Confirm Netlify packages the deferred import and receives the intended runtime MARKET; no commit was created.

## Browser copy addendum — checkout field errors

- Hosted empty-form validation exposed raw Zod wording on required full name, address line 1 and city/suburb. Added plain-English required-field messages, valid email/state guidance, and field-specific maximum-length messages in `src/core/contracts/commerce/checkout.ts`.
- Copy-only change: all validators, trim behavior, length limits, optional fields, accepted state values and AU postcode rule remain identical. Existing checkout-form tests assert the unchanged postcode message and submission/retry behavior; commerce and HTTP tests cover schema validation and checkout integration. No tests needed to be rewritten and no new render spec was created under the copy-only exemption.
- Checks: `corepack pnpm typecheck` — **PASS**; `corepack pnpm lint` — **PASS**; `corepack pnpm test src/modules/checkout/components/checkout-form/checkout-form.spec.tsx src/adapters/commerce/postgres/commerce.spec.ts src/platform/http/storefront-api.spec.ts src/platform/http/storefront-api.integration.spec.ts` — **27 passed / 4 files**.

## AI Test Record — browser copy addendum

- Behavior changed: Only validation message wording; accepted/rejected inputs and limits are unchanged.
- Tests added/updated: None — pure copy exemption. Existing related component, commerce and HTTP tests reviewed and run.
- Tests run: Typecheck → full lint → checkout-form/Postgres commerce/HTTP unit and integration specs; exact command above.
- Result: PASS — 27 tests and static checks.
- Failures or gaps: Final-copy deployment and browser recheck remain root-owned.
- Next risk: Confirm the deployed form displays the updated messages and the existing owned order survives redeployment. No commit was created.

## AI Review Record — final integration

- Review focus: F1–F3、Proxy 请求期 env 校验、表单文案及后续焦点修复的最终独立源码复核。
- Findings: 无未解决 finding；原缺陷与部署适配修复已在 `419990e`，文案在 `23835a8`，焦点在 `b0dc3a9`，均已推送。
- Residual risks: 3DS 后续补验详见 acceptance.md；完整人工 UAT 及未覆盖的真实故障注入不因 review/verify 通过而自动完成。
