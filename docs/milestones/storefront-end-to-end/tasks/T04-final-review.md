# T04 — Whole-branch independent review

更新日期：2026-11-02

状态：reviewed-after-fixes — F1–F3 closed by independent source re-review; hosted/browser acceptance remains separately owned

## Scope and evidence boundary

- Baseline: `4f30a6a36058ab565c36cdc512729da18b73ed65`; current HEAD equals this baseline. Reviewed the staged implementation using `git diff --cached 4f30a6a36058ab565c36cdc512729da18b73ed65`, `logs/final-review.patch`, and `logs/final-review-stat.txt` (127 files), then read owning source. This is a working-tree review, not a committed release SHA.
- Requirements: `contracts.md`, `TASKS.md` global constraints and T01–T04, AGENTS.md, e-pig architecture, code-review and requesting-code-review template. Scope is lean AU sandbox commerce plus SG/US compatibility; deferred accounts, inventory reservations, discounts and cross-device recovery are not requested.
- Independent Standards and Spec subreviews were run as required by code-review. This reviewer additionally checked previous UI fixes, registry/HTTP/cookie/webhook composition, cart/query persistence, checkout/order state, catalog purchase paths, schema and migration, and test assertions. Runtime source was not edited.
- Main task reports `pnpm verify` passing (195 app + 22 happy-dog tests), production build and modules Storybook build passing. These are attributed results, not independently repeated here. Focused review reproducers below were run because uncovered transitions remained.

## Strengths

- Database writes lock the cart before changing revision or checkout state. Unique constraints protect creation keys, cart mutation keys, cart revision checkouts, payment session IDs and one order per checkout. Paid order insertion, checkout status and matching cart clear share a transaction; provider network calls stay outside these transactions.
- Prices and availability come from the server catalog, with a confirmed total checked before payment. Controlled SKU variants cover current purchase entries. Unavailable/removed items remain readable and removable while checkout requires valid lines.
- Cookie signatures bind owner identity, market and absolute lifetime. JSON APIs check active market and same-origin writes, and private success/error responses are no-store. Raw webhook bytes are verified and the retrieved provider session must match checkout/cart/market/amount/currency/test mode before state changes.
- Request payload and provider key persist together for ambiguous creates; over-window unknown creates remain frozen, while a trusted webhook can recover the known session. UI no longer treats the return URL as evidence of payment or cancellation.
- Existing tests execute migration and SQL, close/reopen persistent PGlite state, verify rollback after failed order insertion, and now include HTTP → SQL → signed webhook → owned order integration. These protect observable behavior beyond mock-call assertions.
- No speculative OMS, inventory service, generic compensation scheduler or additional runtime architecture was introduced. Current complexity fits the approved sandbox goal.

## Standards

No additional documented hard-rule violation or actionable smell was found. The initial transport robustness finding below is preserved with its post-fix closure:

### F1 · P2 · Closed — Handle idle errors on the long-lived Neon pool

- Source: `src/adapters/commerce/postgres/pool.ts:15`; lifetime: `src/platform/registry.ts:74–89`.
- `createCommercePool` returns a Pool without an `error` listener, then the registry reuses it between requests. The installed Neon driver removes a failed idle client and emits the pool error event; an idle WebSocket/backend disconnection therefore reaches Node's unhandled EventEmitter error behavior and can terminate the server process, including unrelated active requests.
- Evidence: Standards reviewer exercised the installed package without credentials; emitting a simulated idle pool error throws without a listener. This establishes event semantics, not real reconnection behavior. The [Pool error contract](https://node-postgres.com/apis/pool#error) documents this requirement.
- Minimal fix: attach a sanitized structured error handler when constructing the pool, without logging database URLs or raw credential-bearing error/configuration. Add a regression that simulates an idle error and verifies it does not escape. No new transport framework is needed.
- Priority: important for deployability; no demonstrated data corruption or actual cloud outage.

## Spec

### F2 · P2 · Closed — Preserve denial across checkout component remounts

- Source: `src/modules/checkout/components/checkout-status/checkout-status.tsx:97–102` (local flag initialized at `:41`, private-data gate at `:79–80`).
- Requirement: cookie-owned same-browser checkout access; T03 authorization/error handling; original UI review explicitly required rejected private cache not to reappear on remount.
- A cancellation POST that returns 401/403/404 sets only component-local `accessDenied`. Successful checkout data remains in the shared Query cache. Navigating away and remounting resets the flag and immediately renders saved contact/address/payment actions while the next GET is unresolved.
- Reproduction: initial GET succeeds, cancel POST returns 403, details disappear, component unmounts/remounts with next GET delayed, details reappear. Independent 1-test regression failed on the final remount assertion. Source preserved at `/private/tmp/final-review-remount.spec.tsx`; temporary source-tree copy removed.
- Minimal fix: record access rejection in shared query state or remove private data so it survives remount and is restored only by a new authorized response. Cover GET and cancellation 401/403/404 paths plus remount; avoid treating an old in-flight response as renewed authorization.

### F3 · P2 · Closed — Refresh shared cart after trusted terminal status reads

- Source: `src/modules/checkout/components/checkout-status/checkout-status.tsx:50–55`; only the explicit cancel path refreshes cart at `:96`.
- Requirement: T03 “统一 Header/Drawer/Cart … 锁定” state and trusted return-page status; confirmed payment atomically clears the corresponding revision server-side.
- On the return page, header/cart GET can complete before the checkout status GET performs reconciliation. The status query correctly displays paid/expired but never invalidates/refetches the shared cart. Header/Drawer retain old items and payment lock until another focus/navigation/refetch, contradicting the confirmed terminal state and preventing immediate editing after expiry.
- Reproduction: fetch locked cart, return trusted paid checkout, assert Payment confirmed visible, then observe the same locked cart/items remain. Spec reviewer ran a focused 1-test regression, FAIL. Preserved at `/private/tmp/checkout-status.spec-axis-repro.spec.tsx`; temporary source-tree copy removed.
- Minimal fix: refresh/invalidate shared cart after trusted paid or expired reconciliation, retaining revision/lock freshness protections. Cover both terminal outcomes and keep transient cart refresh failure recoverable. No additional backend state machine is required.

## Prior findings re-review

| Prior finding | Source recheck | Status at this snapshot |
| --- | --- | --- |
| T02 R1 unreadable/unremovable unavailable items | `commerce.ts:49–75,101–104,198–201` separates tolerant reads/removal from strict checkout | Closed |
| T02 R2 delayed webhook blocked by create window | `commerce.ts:242–251` retrieves event session directly and verifies before transaction application | Closed |
| T02 R3 trailing-slash origin rejects writes | `storefront-api.ts:38,43` normalizes configured origin, strictly compares request origin | Closed |
| T01/T03 private details after rejected GET | `checkout-status.tsx:79–80` hides on query error; permanent regression covers 401/403/404 | Closed; cancellation/remount residual F2 also closed in post-fix review |
| T01/T03 stale GET reverts verified cancellation | `checkout-status.tsx:18–29,48–49,87–95` aborts reads and keeps terminal ordering | Closed by source review; parent reports regression pass |
| T01/T03 equal-revision old cart GET erases checkout lock | `cart-store.ts:77–89`; server unlock increments revision at `commerce.ts:154,158` | Closed by source review; regression checks later revision still unlocks |

`T01-T03-review.md` now includes this re-review status while preserving initial reproduction evidence.

## Remaining validation and deployment gaps

- Fix task reports fresh typecheck/full lint and 22 scoped pool/checkout-status tests passing, after recording 10 initial failures. Independent source review is complete below. Integrated final quality results after all deployment/Header edits still belong to the main task; the initial 195-app-test result predates those edits.
- New native WebSocket/Neon Pool transport is source-reviewed for Node 24 compatibility, but this review did not run cloud migration, multi-connection contention or actual reconnects. `scripts/database/concurrency.spec.ts` is opt-in; PGlite's serial connection lease cannot demonstrate remote row-lock contention.
- Current HTTP integration closes the earlier HTTP→SQL gap, with real cookie and webhook-signature logic, but simulates payment network calls and injects the registry. It does not prove final deployed environment, Neon credentials, Stripe current API or webhook delivery.
- Netlify config exists; migration is explicit and idempotent, rather than request-time DDL. Site provisioning, secrets, production origin, successful cloud build/runtime and migration evidence belong to deployment records, not this code review.
- Browser 320/375/768/1440, keyboard/focus, 200% text, actual Web Locks multi-tab retry, SG/US currency/cart isolation and disabled payment need their own recorded evidence. No screenshot or visual acceptance was executed in this review.
- AU hosted Stripe test-card success, trusted webhook/reconciliation and reopening the owned order remain required before declaring the user's end-to-end outcome complete. No real charge, live-user result or production acceptance is claimed.
- Sandbox data cleanup remains an explicit manual follow-up under contracts.md; no automated retention machinery is requested.

## Post-fix independent source review (2026-11-02)

- **F1 closed:** `src/adapters/commerce/postgres/pool.ts:16–20` installs a persistent Pool error listener before returning it. It emits only the fixed structured event, with no raw driver error/connection configuration. `pool.spec.ts:7–26` exercises the real installed Pool EventEmitter twice, asserts no throw and sanitized output, then ends the pool. This closes the demonstrated unhandled-event defect; it does not prove remote reconnection.
- **F2 closed:** `checkout-status.tsx:47–50,70–72,116–120` purges the actual shared query data on GET or cancel 401/403/404, in addition to hiding the current view. The prior query is cancelled before POST; an aborted read cannot later purge newer data or trigger a terminal cart refresh. Parameterized retained regressions cover both paths, delayed older GET, remount, absence of cached details/actions, and restoration after a new authorized response. The original remount reproduction is now protected by a permanent behavior test.
- **F3 closed:** `checkout-status.tsx:58–69` refreshes the shared cart after a non-aborted trusted paid/expired read. It uses existing `refreshCart` revision/lock ordering, and the status result is not replaced by transient cart refresh failure. Regressions assert cleared paid lines, preserved-but-unlocked expired lines, higher revision, and successful next-read retry after a 503. The explicit cancel refresh remains.
- Fix implementer reports **RED: 10 failed / 7 passed**, **GREEN: 22 passed / 3 files**, fresh **typecheck + full lint PASS**. This reviewer read the implementation and all new assertions rather than repeating those already passing tests. Evidence: `tasks/T04-fixes.md`. No additional actionable P1/P2 emerged from this post-fix source review.
- **Netlify integration:** `netlify.toml:10–11` explicitly registers `@netlify/plugin-nextjs`; `package.json:61` declares `^5.16.5`, and lockfile resolves **5.16.5**. This addresses the recorded local build invocation without an adapter. Code/config inspection establishes the registration and locked dependency only; actual adapter build/deployed Next runtime remains a deployment check currently underway.
- **External database test scope:** `scripts/database/vitest.config.ts:5–8` now replaces the base `test.include` while preserving aliases/options, instead of merge-concatenating the app suite. Root reports `vitest list` selects only the external concurrency case. Opt-in execution and required environment remain unchanged. Local database connectivity currently times out per root; reported schema existence is not evidence that application/runtime transactions or remote contention succeeded.
- **Header integration:** `site-header.tsx:105–127` replaces small-screen fixed-row constraints with normal stacked flow and wrapping notice, retaining the desktop layout and help link. Semantic regression protects the full notice and separate market identity. `tasks/T04-header.md` reports 7 tests/ESLint passing; jsdom does not prove overlap geometry. Parent's rebuild/browser retest at 320/375/768/1440 remains required.
- This review reads the current working tree, including post-stage fixes. Initial finding line references above deliberately describe the reviewed defect snapshot; closure references describe the current fixed source. No release commit SHA or successful deployment is implied.

## Netlify Proxy packaging follow-up (2026-11-02)

- **Source review PASS; no new code finding:** `src/proxy.ts:9–16` is async and imports the same validated `env` module only after the exact `/api` or `/api/` prefix bypass. `planMarketPath` and its static registry import have no environment side effects. Deployment tooling can therefore import the Proxy entry without evaluating request-time environment values; the first public request still must successfully validate `MARKET` before any next/redirect decision.
- Fail-closed behavior is preserved: there is no catch-and-default, no production AU fallback and no `skipValidation`. Existing `env.ts` accepts only registered markets, with fallback limited to test mode. The Proxy still preserves query strings and returns 308 for normalization; it creates no cookie/cart or business data. The API bypass only avoids public market redirects: the storefront composition root still imports validated env and `storefront-api.ts` independently checks active market, credential and same-origin writes. Webhook signature/checkout verification remains in its route boundary.
- `src/proxy.spec.ts:11–37` now imports the real env path after resetting the module cache, sets production/non-Vitest mode, and proves import plus four API paths succeed without MARKET while a public request rejects. AU/SG/US cases assert runtime market redirects and same-market pass-through. Fixer reports old import failure (RED), 4 cases passing (GREEN), typecheck/lint PASS. This source reviewer did not repeat the passing tests.
- `eslint.config.mjs:146` adds only `.netlify/**` to global ignores, and `tsconfig.json:29` adds only generated `.netlify` alongside `node_modules` exclusions. Application source, scripts and authored tests remain in their existing check scope. This appropriately excludes generated adapter/vendor artifacts rather than suppressing application diagnostics.
- Root reports the latest integrated verify before this Proxy correction passed **207 app + 22 happy-dog tests**. That result must not be represented as the post-Proxy integrated result; the current adapter build is still running. The change removes the observed eager-import failure at source level but does not establish that Netlify injects required runtime values, serves requests correctly, or completes payment. Successful adapter build and deployed public/API smoke checks remain separate evidence.

## Assessment

**Ready to merge? Yes from code review, subject to final integrated quality checks.** All three discovered P2 findings are independently source-rechecked and closed. No architecture redesign or new scope is needed. Hosted build/runtime, database connectivity/concurrency, browser layout and actual Stripe sandbox payment/order recovery remain acceptance gates before declaring the milestone complete.

Standards: initial 1 P2 robustness finding, now closed; no additional hard-rule/smell findings. Spec: initial 2 P2 findings, both now closed. Open reviewed code findings: 0.

## AI Test Record

- Behavior changed: None; review/documentation only, exempt from implementation-test requirement.
- Tests added/updated: Temporary independent remount and terminal-cart reproducers preserved under `/private/tmp`; no temporary tests remain in the source tree.
- Tests run: `corepack pnpm test src/modules/checkout/components/checkout-status/final-review-remount.spec.tsx` (this reviewer); `corepack pnpm test src/modules/checkout/components/checkout-status/checkout-status.spec-axis-repro.spec.tsx` (Spec reviewer); credential-free installed Neon Pool error-event check (Standards reviewer).
- Result: PASS for post-fix independent source review; initial review reproducers were FAIL (1/1 each) and Pool error check confirmed the original throw. Fix implementer records 22 scoped tests PASS after RED; this reviewer did not rerun the passing suite.
- Failures or gaps: F1–F3 corrected and source-rechecked; no new test execution during source re-review, no browser/cloud/real Stripe acceptance by this reviewer.
- Next risk: Final integrated quality results after all edits; deployed configuration, remote connectivity/concurrency and end-to-end hosted sandbox completion remain separately unverified.

## AI Review Record

- Review focus: Whole staged branch, Standards / Spec independently, state/concurrency/security/ownership, architecture boundaries, test behavior, lean scope and deployability; post-fix Proxy lazy validated env and generated Netlify check exclusions.
- Findings: Initial F1–F3, all P2, now closed after independent source re-review; no discovered P0/P1. All earlier backend/UI findings also closed. Integration fixes introduce no additional demonstrated blocking code defect.
- Residual risks: Code review does not establish deployment or payment completion. Final integrated checks, actual cloud runtime/database connection, browser geometry and hosted Stripe test-card/order recovery need their own evidence.
