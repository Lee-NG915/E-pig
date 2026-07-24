import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import { cacheLife, cacheTag } from "next/cache";

import {
  CACHE_PROFILES,
  applyCacheProfile,
  assertProfileAllowed,
  buildCacheTag,
  listForbiddenCacheProfileIds,
} from "./cache-manifest";

describe("cache-manifest", () => {
  it("builds tags from placeholders", () => {
    expect(
      buildCacheTag(CACHE_PROFILES.content.tagPattern, {
        marketId: "sg",
        slug: "home-hero",
      }),
    ).toBe("content:sg:home-hero");
  });

  it("rejects missing tag params", () => {
    expect(() =>
      buildCacheTag(CACHE_PROFILES.content.tagPattern, { marketId: "sg" }),
    ).toThrow(/missing param "slug"/);
  });

  it("applies allowlisted profile via next/cache", () => {
    const tag = applyCacheProfile("navigation", { marketId: "au" });
    expect(tag).toBe("navigation:au");
    expect(cacheLife).toHaveBeenCalledWith("hours");
    expect(cacheTag).toHaveBeenCalledWith("navigation:au");
  });

  it("forbids transactional profile ids", () => {
    for (const id of listForbiddenCacheProfileIds()) {
      expect(() => assertProfileAllowed(id)).toThrow(/forbidden/);
    }
  });

  it("rejects unknown profiles (no ad-hoc objects)", () => {
    expect(() => assertProfileAllowed("cart-drawer")).toThrow(/allowlist/);
    expect(() => assertProfileAllowed("toString")).toThrow(/allowlist/);
    expect(() =>
      applyCacheProfile("cart" as never, { marketId: "au" }),
    ).toThrow(/forbidden/);
  });

  it("does not register forbidden commerce profiles", () => {
    const ids = Object.keys(CACHE_PROFILES);
    for (const forbidden of listForbiddenCacheProfileIds()) {
      expect(ids).not.toContain(forbidden);
    }
  });
});
