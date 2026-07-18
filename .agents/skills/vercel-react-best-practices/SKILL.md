---
name: vercel-react-best-practices
description: Review or improve React 19 and Next.js 16 code in E-pig using a curated set of Vercel performance rules. Use for React components, App Router pages, Server Components, async data flow, rendering, bundle size, or performance-focused code review; apply E-pig architecture and cache rules before generic guidance.
---

# E-pig React / Next.js Performance Guide

This is a curated local copy of Vercel's React guidance. It contains 54 detailed rules in `rules/`, but E-pig's architecture is authoritative whenever a generic rule conflicts with `AGENTS.md`.

## Project Overrides — Read First

1. Next.js 16 Cache Components are explicit opt-in. Cross-request caching uses `'use cache'`, `cacheLife(...)`, and `cacheTag(...)`; never describe uncached `fetch` as persistent cache or ISR by default.
2. Do not introduce process-local LRU caching. The standalone service can run multiple processes or replicas, and private/transactional data must remain request-time. A new cross-request cache requires an ADR.
3. Do not introduce SWR from an upstream example. Follow the data ownership rules in `AGENTS.md`; the current P0 cart uses its existing external-store pattern, and a future client server-state layer must follow the accepted project decision.
4. Resolve market and request APIs outside cached scopes. `cookies()`, `headers()`, `params`, and `searchParams` are async and must not be read inside `'use cache'`.
5. Keep cart, account, checkout, payment, price, and inventory out of shared caches.
6. Avoid generic inline-script hydration fixes. Prefer server-resolved state, stable server snapshots, or a reviewed nonce/hash-compatible bootstrap for the one preference that truly requires pre-hydration DOM mutation.
7. A performance suggestion cannot override module boundaries, accessibility, CSP, correctness, or test requirements.
8. Do not install a package merely because a rule example uses it. Prefer the platform and dependencies already present in `package.json`.

## How to Use

- Identify the performance problem and load only the relevant rule files.
- Treat CRITICAL/HIGH rules as review priorities, not automatic refactoring permission.
- Confirm the example matches React 19, App Router, Cache Components, and the current dependency set.
- For code changes, add behavior-focused tests and run the quality sequence required by `.agents/rules/quality-self-check.md`.
- Report measurable or observable impact; avoid speculative micro-optimizations.

## Rule Index

### Async and Waterfalls — CRITICAL

- `async-defer-await`
- `async-parallel`
- `async-dependencies` — prefer its native Promise alternative; do not add `better-all` by default
- `async-api-routes`
- `async-suspense-boundaries`

### Bundle Size — CRITICAL

- `bundle-barrel-imports`
- `bundle-dynamic-imports`
- `bundle-defer-third-party`
- `bundle-conditional`
- `bundle-preload`

### Server Performance — HIGH

- `server-auth-actions`
- `server-cache-react` — per-request deduplication only; distinct from Cache Components
- `server-dedup-props`
- `server-hoist-static-io`
- `server-serialization`
- `server-parallel-fetching`
- `server-after-nonblocking`

### Client, Rendering, and Re-renders — MEDIUM

Use the remaining `client-*`, `rendering-*`, and `rerender-*` files selectively. Client storage must keep the existing versioned market schema, and React memoization should follow evidence from render cost or identity stability.

### JavaScript and Advanced Patterns — LOW

Use `js-*` and `advanced-*` only after higher-impact async, bundle, and server issues. Preserve readability unless profiling or a hot path justifies the optimization.

## Excluded Upstream Rules

The local copy intentionally excludes rules that prescribe SWR, process-local cross-request LRU, or a generic inline hydration script because they conflict with this repository's dependency, deployment, cache, or CSP direction.
