/**
 * Cache profile manifest — single source of truth for opt-in browse caches.
 *
 * Inspired by Saleor Paper's cache-manifest, adapted to E-pig Hard Rules:
 * price / inventory / cart / checkout / payment MUST NOT appear here.
 *
 * Usage (inside a `"use cache"` server function only):
 *   applyCacheProfile("content", { marketId, slug });
 */

import { cacheLife, cacheTag } from "next/cache";

/**
 * Built-in Next.js cacheLife profile names (safe without custom next.config).
 * Semantic intent is documented on each CACHE_PROFILES entry label.
 */
export type CacheLifeTier = "minutes" | "hours" | "days";

export type CacheTagParams = {
  slug?: string;
  marketId?: string;
  locale?: string;
};

export type CacheProfile = {
  readonly id: string;
  readonly label: string;
  readonly cacheLife: CacheLifeTier;
  /** Tag pattern with `{slug}` / `{marketId}` / `{locale}` placeholders */
  readonly tagPattern: string;
  readonly pathPattern: string | null;
};

const FORBIDDEN_PROFILE_IDS = [
  "price",
  "inventory",
  "cart",
  "checkout",
  "payment",
] as const;

const profiles = {
  content: {
    id: "content",
    label: "Marketing / CMS content blocks (~minutes)",
    cacheLife: "minutes",
    tagPattern: "content:{marketId}:{slug}",
    pathPattern: null,
  },
  navigation: {
    id: "navigation",
    label: "Header / footer navigation chrome (~hours)",
    cacheLife: "hours",
    tagPattern: "navigation:{marketId}",
    pathPattern: null,
  },
  taxonomy: {
    id: "taxonomy",
    label: "Category / collection taxonomy (no price, ~minutes)",
    cacheLife: "minutes",
    tagPattern: "taxonomy:{marketId}:{slug}",
    pathPattern: null,
  },
  /** Stable product presentation only — NEVER include price or inventory fields in the cached payload. */
  productPresentation: {
    id: "product-presentation",
    label: "Product presentation shell (no price/inventory, ~minutes)",
    cacheLife: "minutes",
    tagPattern: "product-presentation:{marketId}:{slug}",
    pathPattern: null,
  },
} as const satisfies Record<string, CacheProfile>;

export const CACHE_PROFILES = profiles;

export type CacheProfileId = keyof typeof CACHE_PROFILES;

export const CACHE_PROFILE_LIST: readonly CacheProfile[] = Object.values(profiles);

export function buildCacheTag(pattern: string, params: CacheTagParams): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key as keyof CacheTagParams];
    if (!value) {
      throw new Error(`cache tag pattern "${pattern}" missing param "${key}"`);
    }
    return value;
  });
}

function applyCacheLifeTier(tier: CacheLifeTier): void {
  // Narrow per overload — Next's cacheLife typings don't accept a string union cleanly.
  switch (tier) {
    case "minutes":
      cacheLife("minutes");
      return;
    case "hours":
      cacheLife("hours");
      return;
    case "days":
      cacheLife("days");
      return;
  }
}

/**
 * Apply cacheLife + cacheTag for an allowlisted browse profile.
 * Call only inside `"use cache"` functions.
 * Only `CACHE_PROFILES` keys are accepted — ad-hoc profile objects are rejected.
 */
export function applyCacheProfile(
  profileId: CacheProfileId,
  params: CacheTagParams = {},
): string {
  assertProfileAllowed(profileId);
  const profile = CACHE_PROFILES[profileId];
  applyCacheLifeTier(profile.cacheLife);
  const tag = buildCacheTag(profile.tagPattern, params);
  cacheTag(tag);
  return tag;
}

/** Exact-id ban list for defensive checks / tests (allowlist is the real gate). */
export function assertProfileAllowed(profileId: string): void {
  if ((FORBIDDEN_PROFILE_IDS as readonly string[]).includes(profileId)) {
    throw new Error(
      `Cache profile "${profileId}" is forbidden (transactional / money path).`,
    );
  }
  if (!Object.hasOwn(CACHE_PROFILES, profileId)) {
    throw new Error(
      `Cache profile "${profileId}" is not in CACHE_PROFILES allowlist.`,
    );
  }
}

export function listForbiddenCacheProfileIds(): readonly string[] {
  return FORBIDDEN_PROFILE_IDS;
}
