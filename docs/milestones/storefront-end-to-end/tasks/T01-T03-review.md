# T01 / T03 — Independent UI review

更新日期：2026-11-02

状态：reviewed-after-fixes — all three initial UI findings and T04 cancellation-denial remount residual closed by source re-review

## Scope and method

- Reviewed the current uncommitted T01 catalog/content and T03 cart/checkout/order UI patch against `AGENTS.md`, `.agents/skills/code-review/SKILL.md`, the e-pig architecture rule, `DESIGN.md`, `TASKS.md`, `contracts.md`, and `tasks/T01-storefront.md`.
- Included new market search/help/cart/checkout/return/orders routes, controlled catalog variants, product purchase controls, shared client query state, pending mutation persistence, checkout form, status reconciliation, and guest order access presentation.
- Backend persistence/payment and HTTP/cookie enforcement are independently reviewed by the parent/backend reviewer. This report does not claim HTTP ownership, cookie expiration, real Web Locks multi-tab, deployed Stripe, or browser layout acceptance.
- Review axes below remain separate. This reviewer made no implementation changes. Focused temporary regression tests were created, run, and moved out of the source tree; reproduction source is preserved locally at `/private/tmp/storefront-review-repro.spec.tsx`. To run it, copy beside `checkout-status.tsx` because its component import is relative.

## Standards

No additional actionable hard-standard or Fowler-smell finding was identified in this UI review. Module imports respect the port boundary, request parameters are awaited, reviewed transaction data is request-time, product/UI changes use semantic tokens, and high-state components have companion files. Suggested future abstractions or cosmetic refactors are deliberately not requested.

Existing verification is scoped: tests assert server identifiers rather than trusted client prices, variant selection/error/pending behavior, AU postcode validation and retry input identity, legacy storage preservation, and failed cancellation remaining pending. These are meaningful protections but did not cover the three response-order/auth transitions below.

Cross-task test regression discovered during review: the new `CartMarketProvider` query-client mounting effect required mocks to preserve `getStorefrontQueryClient`. The catalog implementer reports reproducing 12 failures, fixing product-card/detail/list and header mocks with `importOriginal`, then passing 18 files / 58 T01 tests. This is resolved per implementer evidence, not an independent rerun by this reviewer.

## Spec

### P2 — Hide cached private checkout after ownership/authentication rejection

- Location: `src/modules/checkout/components/checkout-status/checkout-status.tsx:58` and `:92` (reviewed patch).
- Contract: `contracts.md` D01/D02 requires cookie-owned same-browser recovery and explicitly says clearing credentials cannot promise recovery; T03 requires trusted status queries and authorization error handling.
- Reproduction: first GET returns an open checkout with contact/address and payment URL; the next manual status refresh returns HTTP 401. React Query retains successful `data`, and the component displays the error alongside the entire cached checkout and its payment link. The same branch applies to 403/404.
- Observed test failure: the `Saved checkout details` region remains present after the 401 response. The test expects it to disappear. OrderHistory already suppresses data on a query error; CheckoutStatus does not.
- Required correction: stop rendering private checkout data and payment actions on an authorization/ownership rejection, and prevent the rejected cached value from resurfacing on remount. Cover a successful read followed by rejection, rather than only an initial rejected request.

### P2 — Prevent an old status GET from reverting a verified cancellation

- Location: `src/modules/checkout/components/checkout-status/checkout-status.tsx:61–70` (reviewed patch).
- Contract: T03 says the return page displays trustworthy processing/paid/expired state and cancellation is based on the server's verified state. `contracts.md` says cancel URL visits do not unlock the cart.
- Reproduction: load an open checkout, start a refresh/poll whose response is delayed, then cancel. The POST returns `expired` and `setQueryData` correctly renders “Checkout expired”. Let the earlier GET return its old `open` snapshot: it overwrites the terminal state and restores “Continue test payment” and the frozen-cart message.
- Observed test failure: the “Checkout expired” heading disappears after the delayed old GET completes.
- Required correction: coordinate the cancellation mutation with existing status reads, or apply a monotonic terminal-state rule, so older GET responses cannot overwrite a verified terminal result. Keep the cancel-failure behavior that leaves the bag locked.

### P2 — Preserve a newly acquired checkout lock against older equal-revision cart reads

- Location: `src/modules/cart/lib/cart-store.ts:76–106` (reviewed patch); backend context: `src/adapters/commerce/postgres/commerce.ts` acquires `lockedCheckoutId` without incrementing cart revision.
- Contract: T03 requires Header/Drawer/Cart to share locked state; `contracts.md` states that the cart is frozen while payment is pending.
- Reproduction: begin GET A with unlocked revision 2; after checkout creation, GET B returns locked revision 2 and updates the shared cache; then A returns its prior unlocked revision 2. `newestCart` only rejects lower revisions, and `mutationVersions` is only incremented by cart mutations, so A removes `lockedCheckoutId`.
- Observed test failure: `getCartSnapshot(market).lockedCheckoutId` becomes `undefined` after A resolves. The drawer can re-enable quantity controls and checkout navigation during an active payment. The backend still rejects writes, so this is a UI consistency/recovery issue rather than demonstrated transaction corruption.
- Required correction: add read freshness/lock-state ordering that covers checkout-triggered refreshes, with a deferred old GET regression at the same revision. Preserve the existing protections against older revisions and pre-creation null responses.

## Whole-branch re-review (2026-11-02)

- Original P2 #1: successful GET followed by 401/403/404 now hides checkout details/actions through `query.error`; permanent regression covers all three responses. Cancellation POST rejection also hides details locally, but component remount resets `accessDenied` while the successful query cache remains. A new independent remount regression failed; the residual path is tracked in `T04-final-review.md` (F2). That residual was subsequently fixed: GET/cancel access rejection now purges shared Query data, cancellation aborts prior reads, and permanent 401/403/404 remount/renewed-authorization tests protect both paths. Independent post-fix source review confirms F2 closed; see the T04 report addendum and `tasks/T04-fixes.md` (22 scoped tests reported passing).
- Original P2 #2: fixed by aborting/cancelling prior reads before cancellation and applying terminal status ordering in structural sharing. The new delayed old GET regression covers the reported race. Source rechecked; parent reports regression passing.
- Original P2 #3: fixed by retaining equal-revision locked snapshots over incoming unlocked snapshots; server terminal unlocks increment revision. Regression also confirms a later revision can unlock. Source rechecked; parent reports regression passing.
- T04 also closed a newly discovered terminal-status cart refresh gap with paid/expired and transient-failure retry regressions. This addendum supersedes the original open status/count below without erasing original reproduction evidence. All initial and residual UI review findings are closed at the current source snapshot; browser/hosted acceptance remains separate.

## Coverage and remaining acceptance

- T01: catalog maps every purchase entry to a variant, uses market currency, selects server IDs, blocks its unavailable test option, hides absent ratings, deduplicates source gallery images, and provides functional search/help/order navigation. No additional T01 functional defect was found in reviewed source.
- T03: cart authority, legacy storage non-migration, explicit unsupported-Web-Locks behavior, saved retry key/input, form schema, payment host allowlist, bounded polling, server-only cancel, and order privacy messaging are present. Scope does not establish actual concurrent browser behavior or external payment success.
- Stories provide seeded cart/checkout/order states. They do not substitute for HTTP/error/keyboard verification; some interaction/polling can reach the Storybook origin, so use actual app/browser acceptance for those behaviors.
- Remaining T04 evidence: 320/375/768/1440 layouts, 200% text, header utility wrapping, drawer focus return, keyboard journey, real multi-tab creation/retry, global gates/build, SG/US isolation, deployed payment and reopened guest order. These were not executed in this review and are not asserted as failures.

## AI Test Record

- Behavior changed: none; independent review and documentation only.
- Tests added/updated: temporary 3-case review reproduction suite, preserved at `/private/tmp/storefront-review-repro.spec.tsx`; no temporary test remains in the source tree.
- Tests run: `corepack pnpm test src/modules/checkout/components/checkout-status/checkout-status.review-repro.spec.tsx` against the reviewed implementation.
- Result: FAIL — 1 file / 3 tests failed, each reproducing its corresponding P2 above.
- Failures or gaps: no broad test rerun; existing T01 58 / T03 25 passing tests were reported by implementation tasks and did not cover these transitions. No browser, cloud, real Stripe, or live-user acceptance performed here.
- Next risk: fix and retain these regressions in the relevant co-located suites before global gates; re-review the changed response-order and auth behavior.

## AI Review Record

- Review focus: T01/T03 specification, standards, runtime UI correctness, regression protection, minimal scope, and guest-data presentation.
- Findings: Standards — 0 actionable findings. Spec — 3 reproduced P2 findings, all open at report time. The separate cross-task mock regression was resolved by the catalog implementer.
- Residual risks: browser/hosted acceptance and backend/HTTP ownership checks remain separately owned; do not interpret this static and targeted-test review as end-to-end approval.

Standards: 0 findings. Spec: 3 findings; worst severity P2 (cached authorization result and stale asynchronous state).
