# happyDog Design System — Serializable Source

**Status:** implemented in `@e-pig/happy-dog` (P0 + P1); P2 deferred  
**Updated:** 2026-07-24  
**Figma:** [Test-vibma](https://www.figma.com/design/fsHAaYU2yFhytoqpSXKArW/Test-vibma) (`fsHAaYU2yFhytoqpSXKArW`)  
**Machine-readable:** [`happy-dog.design-system.json`](./happy-dog.design-system.json)  
**Branch:** `feat/happy-dog-design-system`

## What this is

Leader (Cursor) pulled Foundations + published component sets from Figma MCP and froze them here so implementers do **not** treat one-off MCP React dumps as production code.

Figma **page folders ≈ components**. Each component page holds a component set with variants.

## Foundations (summary)

| Area | Key values |
| --- | --- |
| Brand | moss / persimmon / haze scales 50–900 |
| Neutrals | cream (page `#FAF7EF`) + mono (text `#1F1F1F`, never pure black) |
| Primary CTA | moss-700 `#495133` |
| Spacing | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64 · 80 · 96 |
| Radius | none 0 · xs 4 · sm 8 · md 10 · lg 12 · xl 16 · 2xl 24 · full |
| Controls | Sm 32 / Md 40 / Lg 48 |
| Effects | Sm/Md/Lg shadow for elevation only; product cards = no shadow; focus = ring |

## Component backlog

### P0 (must ship this pass)

Button*, Badge*, Input, Checkbox, Radio Group, Switch, Sheet* (`side`: Right \| Bottom)

\* already in package — align to tokens/variants.

### P1

Tabs, Card (+ Interactive), Dialog, Tooltip, Separator, Skeleton, Quantity Stepper, Select

### P2 (next pass if time)

Choice Card, Option & Swatch, Accordion, Pagination, Icon utilities

## Implementation status (2026-07-24)

- **P0 — shipped**: Button (6 styles × Sm/Md/Lg), Badge (+ Sale/Success/Info), Sheet (`side: right | bottom`), Input, Checkbox, Radio Group, Switch.
- **P1 — shipped**: Tabs (Underline/Segmented), Card (+ Interactive), Dialog, Tooltip, Separator, Skeleton, Quantity Stepper, Select.
- **P2 — pending**: Choice Card, Option Swatch, Accordion, Pagination, Icon utilities.
- Runtime tokens: `src/theme/colors.ts` holds primitive hex scales + semantic oklch values (hex mapping in comments); `src/styles/globals.css` mirrors them as CSS vars + control sizes (32/40/48) and radius scale (xs 4 → 2xl 24).

## Storybook

```bash
pnpm --filter @e-pig/happy-dog storybook   # :6006
```

Every public component needs stories covering Figma variants from the JSON manifest.

## Related docs

- Root proposal: [`DESIGN.md`](../../../DESIGN.md)
- Research: `docs/codex/research/08-shadcn-theme-component-library.md`
