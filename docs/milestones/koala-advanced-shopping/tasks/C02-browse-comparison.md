# C02 follow-up — Collect products while browsing

更新日期：2026-11-03

- Status: done, locally validated
- Agent: Codex with independent Test AI and Review AI
- Branch: `codex/koala-advanced-shopping`
- Commit: recorded in `../evidence/commits.json` after the implementation commit
- Supersedes: C02's URL-driven full-catalog selection flow; historical tests remain historical evidence.

## Product and interaction review

The previous flow interrupted shopping and asked users to choose products from an entire catalog on the comparison page. Replacing its native select was insufficient: the shopping journey itself was wrong.

| Concern | Delivered behavior | Evidence |
| --- | --- | --- |
| Browse first | Homepage, PLP/search cards and PDP add the displayed variant in place; URL, scroll and focus stay put | Component regression and Chrome action observation |
| Success and discovery | Visible live feedback, checked action, floating icon/count; no automatic modal opening | Real store component tests and desktop/mobile browser |
| Review a shortlist | happy-dog Sheet shows images, names, selected options and removal; Continue browsing simply closes it | Keyboard Escape/focus and 320px full drawer |
| Capacity | Three distinct products; same product's new variant replaces its slot even when full; fourth addition explains recovery | Store/action tests and full-list browser attempt |
| Persistence | IDs only, market-isolated, refresh and cross-tab sync; browser storage failures retain the current tab's in-memory selection | Store tests; reload and cross-route browser checks |
| Detailed comparison | Only selected items, aligned rows, current variant Select, no catalog-wide product dropdown or listProducts read | API scope tests, route source, browser columns |
| Visual hierarchy | Compact images; shared brand tokens; desktop option/price visible in first 1000px; mobile fixed feature column and local horizontal scrolling | 320/390/1440 measured layouts |
| Overlay/focus | Bag takes precedence; modal starts at its title; removal and close have deterministic focus; mobile compact icon clears purchase bar | Real store+Sheet tests and browser |
| Failure recovery | Missing products remain removable; load failure offers retry; pending/error never displays stale prices or availability as current | API/hook/UI tests, including success → refresh failure → retry |

Selection is local to this browser and market, not account-synced. Old `item` URL parameters no longer select products or override the stored shortlist. The API still uses bounded reference parameters for fetching selected details. All prices and availability remain explicitly sandbox data.

## Verification

- Final sequential quality gate: `node scripts/quality/remediation-loop.mjs --run-id compare-journey-final-20261103 --attempt 1` with explicit TypeScript, ESLint and Vitest commands; PASS on first attempt, 64 files / 405 tests.
- happy-dog: 7 files / 22 tests; harness evals 8/8; docs sync, agent doctor and component companions PASS.
- Production Next.js build and business Storybook build PASS. Storybook retains its existing large-chunk advisory.
- SG standalone runtime smoke PASS using the AU-built artifact.
- Chrome: local AU browse → add → shortlist → compare, duplicate/full/update/remove, refresh, Escape/focus, 320/390/1440 layouts. Screenshots were inspected inline; no screenshot files are claimed.
- Tooling note: the global pnpm wrapper could not verify its registry identity; checks used the pinned pnpm 10.34.5 JavaScript entrypoint and direct repository scripts. The default all-in-one `pnpm verify` invocation was not used. No timeout, assertion or dependency changes were made to obtain a pass.

## AI Test Record

- Behavior changed: In-place comparison collection, persistent selection, floating shortlist and selected-only detail table.
- Tests added/updated: Co-located store, query/API/hook, add action, dock, product card/PDP and comparison tests; meaningful cart-overlay integration coverage.
- Tests run: Typecheck → lint → 405 application tests; 22 library tests; harness/docs/doctor/companions; production/Storybook builds; SG smoke and Chrome journeys.
- Result: PASS.
- Failures or gaps: No automated browser E2E framework or exhaustive screen-reader matrix; browser checks were performed directly. No hosted payment or production acceptance claim.
- Next risk: Browser-local lists are not shared across devices; real catalog services must retain the selected-reference and request-time pricing contracts.

## AI Review Record

- Review focus: Complete shopping journey, public test seams, async price correctness, overlay coordination, focus and responsive table.
- Findings: Fixed two independent P2 findings: stale facts after background refresh failure, and removal focus waiting for network. Both were reproduced before repair; independent re-review ran 13 comparison tests and found no remaining blocking or medium-risk issues.
- Residual risks: Verification covers the local sandbox and listed viewports; it is not a remote release or business acceptance.
