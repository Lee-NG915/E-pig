# ProductDetail

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

Prices and availability are sandbox values, with no physical stock or fulfillment claim. Alternative test options identify themselves as sandbox fixtures. No wishlist, preview or duplicate basket action is shown.
