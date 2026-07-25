import { describe, expect, it } from "vitest";

import type { Collection } from "@/core/contracts/commerce/catalog";

import { pickRelatedCollections } from "./related-collections";

const collections: Collection[] = [
  { handle: "sofas", title: "Sofas" },
  { handle: "living-room", title: "Living Room" },
  { handle: "bedroom", title: "Bedroom" },
  { handle: "outdoor", title: "Outdoor" },
  { handle: "tables", title: "Tables" },
];

describe("pickRelatedCollections", () => {
  it("为 living-room 返回同级子集合与其它一级分类", () => {
    const links = pickRelatedCollections(collections, "living-room", "sg");
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => l.href.startsWith("/sg/collections/"))).toBe(true);
    expect(links.some((l) => l.href.includes("/sofas"))).toBe(true);
    expect(links.every((l) => !l.href.endsWith("/living-room"))).toBe(true);
  });
});
