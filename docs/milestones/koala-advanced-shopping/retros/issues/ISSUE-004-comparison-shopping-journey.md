# ISSUE-004 — Comparison interrupted browsing and exposed the entire catalog

更新日期：2026-11-03

- First introduced: C02 / `89dc42b`; the later Select correction addressed component appearance but retained the incorrect journey.
- Root cause: requirement / product contract gap. URL-selected columns and a full-catalog picker were treated as the shopping flow. Tests protected those mechanics, without testing a shopper collecting products while browsing.
- User-visible defect: Compare immediately navigated away; no persistent shortlist, success feedback, count, or in-place list. The detail page asked users to choose from the entire catalog.
- Repair: C02 follow-up uses a market-scoped browser shortlist, in-place card/PDP actions, feedback, a floating count and Sheet, then a selected-only comparison table. Same product replaces its option, with at most three distinct products. The existing design-system Select remains only for a selected product's variants.
- Prevention landed: contracts.md now requires a browse → collect → review list → compare journey, in-place navigation assertions, cross-page persistence, no whole-catalog read, and coordinated overlays. Tests and browser evidence belong to the follow-up delivery record.
- Acceptance boundary: local behavior and visual verification; no claim of live production or business acceptance.
