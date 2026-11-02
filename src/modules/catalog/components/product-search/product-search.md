# ProductSearch

## 用户故事

Catalog owns keyword search; content supplies shared header/footer. Server route trims a query to 100 characters, skips empty requests and calls the request-time catalog port. The GET form can be bookmarked and refreshed. Results reuse ProductCard; blank query, no matches, request failure and result count each have explicit readable feedback. No new filters are added.
