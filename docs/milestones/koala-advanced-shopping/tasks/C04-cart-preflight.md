# C04 follow-up — Avoid false pending state after a failed cart read

更新日期：2026-11-03

- Scope: cart-store mutation preflight only; no checkout/payment/API or UI changes.
- Commit: `84bf4dd1b1f39ea16d0d49a0475f9b9f58681363`.
- Root cause and recovery: [ISSUE-005](../retros/issues/ISSUE-005-cart-preflight-pending.md).

## AI Test Record

- Behavior changed: A failed preflight GET cannot create a fresh unresolved mutation; genuine prior pending writes remain protected.
- Tests added/updated: Six co-located store regressions, plus existing cart-flow coverage.
- Tests run: Sequential typecheck → lint → full application tests with two workers; direct store/cart-flow run during implementation.
- Result: PASS — 64 files / 411 tests; final quality attempt 2.
- Failures or gaps: New test fixtures initially reused a consumed Response and expected the raw DOMException message instead of the existing fallback; fixtures were corrected without weakening the no-POST/pending/idempotency assertions. User-specific original failure is not known. This narrow client-state change does not alter build/UI/library/hosted payment behavior; those suites were not repeated.
- Next risk: Existing browser recovery records require safe replay, not automatic clearing.

## AI Review Record

- Review focus: GET versus POST ambiguity, persistence timing, Web Lock scope and original key preservation.
- Findings: Independent reviewer found no defect in the final ordering and preservation paths; storage-failure boundary protection was also added.
- Residual risks: No claim that this path caused the user's specific instance. No user cart mutation or pending deletion was performed during diagnosis.
