---
title: Per-Request Deduplication with React.cache()
impact: MEDIUM
impactDescription: deduplicates within request
tags: server, cache, react-cache, deduplication
---

## Per-Request Deduplication with React.cache()

Use `React.cache()` for server-side request deduplication. Authentication and database queries benefit most.

**Usage:**

```typescript
import { cache } from 'react';

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return await db.user.findUnique({
    where: { id: session.user.id },
  });
});
```

Within a single request, multiple calls to `getCurrentUser()` execute the query only once.

**Avoid inline objects as arguments:**

`React.cache()` uses shallow equality (`Object.is`) to determine cache hits. Inline objects create new references each call, preventing cache hits.

**Incorrect (always cache miss):**

```typescript
const getUser = cache(async (params: { uid: number }) => {
  return await db.user.findUnique({ where: { id: params.uid } });
});

// Each call creates new object, never hits cache
getUser({ uid: 1 });
getUser({ uid: 1 }); // Cache miss, runs query again
```

**Correct (cache hit):**

```typescript
const getUser = cache(async (uid: number) => {
  return await db.user.findUnique({ where: { id: uid } });
});

// Primitive args use value equality
getUser(1);
getUser(1); // Cache hit, returns cached result
```

If you must pass objects, pass the same reference:

```typescript
const params = { uid: 1 };
getUser(params); // Query runs
getUser(params); // Cache hit (same reference)
```

**Next.js 16 / E-pig Note:**

Request memoization and persistent data caching are different concerns. Identical GET-style `fetch` calls may be deduplicated during one server render, but `fetch` is not persistently cached by default in Next.js 16. Use `React.cache()` only for per-request deduplication of non-fetch work such as:

- Database queries (Prisma, Drizzle, etc.)
- Heavy computations
- Authentication checks
- File system operations
- Any non-fetch async work

Use `React.cache()` to deduplicate these operations across one server render. For approved public cross-request data caching, follow E-pig's `'use cache'` + `cacheLife(...)` + `cacheTag(...)` policy instead. Never apply either cache to cart, account, checkout, payment, price, or inventory data.

Reference: [React.cache documentation](https://react.dev/reference/react/cache)
