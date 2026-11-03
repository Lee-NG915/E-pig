# ProductDetail

更新日期：2026-11-03

## 用户故事

Renders the selected controlled catalog variant with its price, image, availability and quantity boundary. Native radios support keyboard selection. Add to bag sends product/variant identifiers and quantity only through the market cart action.

| State | Visible behavior |
| --- | --- |
| Available | Selected variant and Add to bag |
| Unavailable | Explicit sandbox availability; addition disabled |
| Pending | Adding label, duplicate submission blocked and selection disabled |
| Failure | Accessible alert, selected option preserved for retry |
| Success | Live status names the added option |
| Missing reviews | Rating and review count omitted |
| Single image | No duplicated image or gallery navigation |
| Explicit query | Restores the exact local `variant` ID from the server route; absent query uses the first variant |
| Invalid or repeated query | Alert and disabled purchase until an explicit option is selected; never silently purchases a default |
| Structured options | Colour / Size / Section width groups preserve other dimensions; nonexistent combinations are disabled |
| Selected media | Variant-specific gallery, price and width/depth/height change together; changing options resets the gallery |
| Mobile | Fixed purchase bar shares the selected variant, add function and duplicate-request guard with the primary CTA |
| Compare | Uses the same selected local product/variant in a market-scoped comparison URL |
| Demo delivery | Test postcode estimates clearly marked as samples, no fee or fulfillment change |
| Demo reviews | Explicit sample data only, rating filters/sort/details; absent data has an honest empty state |
| Two-piece set | Optional curated companion; atomic addItems, parent selection and single-item actions lock until uncertain bundle requests are resolved |

Prices and availability are sandbox values, with no physical stock or fulfillment claim. Alternative test options identify themselves as sandbox fixtures. The route resolves async searchParams inside Suspense; selection uses native history replaceState, preserving other query parameters. The parent keys the component by product/query for navigation resets. No new cache or transaction state is introduced.
