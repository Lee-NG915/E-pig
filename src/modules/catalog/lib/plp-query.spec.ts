import { describe, expect, it, vi } from "vitest";
import type { ProductListItem } from "@/core/contracts/commerce/catalog";

import {
  findCollectionByHandle,
  parseProductListSort,
  pickHomeCollectionLink,
  parseProductListQuery,
  buildProductListHref,
  collectProductColours,
  loadCollectionListing,
} from "./plp-query";

describe("loadCollectionListing", () => {
  const product: ProductListItem = { id: "sofa", slug: "sofa", name: "Sofa", category: "Sofas", colour: "Winter Cream", image: "/cream.jpg", price: { amount: 2600, currency: "AUD" }, variantPreviews: [{ variantId: "green", colour: "Forest Walk", image: "/green.jpg", gallery: [], price: { amount: 2600, currency: "AUD" } }] };
  const catalog = () => ({ listCollections: vi.fn().mockResolvedValue([{ handle: "sofas", title: "Sofas" }]), listProducts: vi.fn().mockResolvedValueOnce([product]).mockResolvedValueOnce([]) });

  it("retains unfiltered facets when a valid query has zero matches", async () => {
    const port = catalog();
    const result = await loadCollectionListing(port, "sofas", { colour: "forest walk", minPrice: "4000", sort: "name", inStock: "true" });
    expect(result).toMatchObject({ products: [], availableColours: ["Forest Walk", "Winter Cream"], filters: { colours: ["Forest Walk"], minPrice: 4000, inStockOnly: true }, sort: "name", issues: [] });
    expect(port.listProducts.mock.calls).toEqual([[{ collection: "sofas" }], [{ collection: "sofas", colours: ["Forest Walk"], minPrice: 4000, inStockOnly: true, sort: "name" }]]);
  });

  it("does not run a partially valid query when a parameter is invalid", async () => {
    const port = catalog();
    const result = await loadCollectionListing(port, "sofas", { colour: "Purple", minPrice: "-5" });
    expect(result?.products).toEqual([]);
    expect(result?.issues).toHaveLength(2);
    expect(port.listProducts.mock.calls).toEqual([[{ collection: "sofas" }]]);
  });

  it("returns null for an unknown collection, and reuses the base list for an unfiltered one", async () => {
    const port = catalog();
    expect(await loadCollectionListing(port, "missing", {})).toBeNull();
    expect(port.listProducts).not.toHaveBeenCalled();
    expect((await loadCollectionListing(port, "sofas", {}))?.products).toEqual([product]);
    expect(port.listProducts).toHaveBeenCalledTimes(1);
  });
});

describe("product filter URLs", () => {
  it("normalizes repeated colours, parses zero and stock, and preserves filters across sorting", () => {
    const parsed = parseProductListQuery({ colour: [" FOREST WALK ", "winter cream", "Forest Walk"], minPrice: "0", maxPrice: "3550", inStock: "true", sort: "price-desc" }, ["Forest Walk", "Winter Cream"]);
    expect(parsed).toEqual({ filters: { colours: ["Forest Walk", "Winter Cream"], minPrice: 0, maxPrice: 3550, inStockOnly: true }, sort: "price-desc", issues: [], hasFilters: true });
    const href = buildProductListHref("sg", "sofas", { ...parsed.filters, sort: "name" });
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/sg/collections/sofas");
    expect(url.searchParams.getAll("colour")).toEqual(["Forest Walk", "Winter Cream"]);
    expect(url.searchParams.get("minPrice")).toBe("0");
    expect(url.searchParams.get("maxPrice")).toBe("3550");
    expect(url.searchParams.get("sort")).toBe("name");
    expect(url.searchParams.get("inStock")).toBe("true");
    expect(buildProductListHref("au", "sofas", { sort: "price-desc" })).toBe("/au/collections/sofas?sort=price-desc");
  });

  it.each(["-1", "NaN", "Infinity", "1e309", "1000001", "abc", "0x10"])("reports invalid price %s instead of silently accepting it", (minPrice) => {
    expect(parseProductListQuery({ minPrice }).issues).toContain("Minimum price must be a number from 0 to 1,000,000.");
  });

  it("explains unknown colours, reversed ranges and repeated scalar fields", () => {
    const parsed = parseProductListQuery({ colour: "Purple", minPrice: "3000", maxPrice: "2000", sort: ["name", "price-asc"], inStock: "yes" }, ["Forest Walk"]);
    expect(parsed.issues).toEqual(expect.arrayContaining([
      "Colour “Purple” is not available in this collection.",
      "Minimum price must not exceed maximum price.",
      "Choose one sort order.",
      "Availability must be true or false.",
    ]));
    expect(parseProductListQuery({ maxPrice: ["100", "200"] }).issues).toContain("Choose one maximum price.");
    expect(parseProductListQuery({ sort: "popular" }).issues).toContain("Choose a supported sort order.");
  });

  it("treats blank price inputs and false availability as no filters and derives full facets", () => {
    expect(parseProductListQuery({ minPrice: "", maxPrice: "  ", inStock: "false" })).toEqual({ filters: {}, sort: undefined, issues: [], hasFilters: false });
    expect(collectProductColours([{ colour: "Winter Cream", variantPreviews: [{ colour: "Forest Walk" }, { colour: "winter cream" }] }, { colour: "Forest Walk" }])).toEqual(["Forest Walk", "Winter Cream"]);
  });
});

describe("parseProductListSort", () => {
  it("接受合法 sort 值", () => {
    expect(parseProductListSort("price-asc")).toBe("price-asc");
    expect(parseProductListSort("price-desc")).toBe("price-desc");
    expect(parseProductListSort("name")).toBe("name");
  });

  it("拒绝非法值与缺省；数组取首项", () => {
    expect(parseProductListSort(undefined)).toBeUndefined();
    expect(parseProductListSort("popular")).toBeUndefined();
    expect(parseProductListSort(["name", "price-asc"])).toBe("name");
    expect(parseProductListSort(["nope"])).toBeUndefined();
  });
});

describe("findCollectionByHandle", () => {
  const collections = [
    { handle: "sofas", title: "Sofas" },
    { handle: "coming-soon", title: "Coming Soon" },
  ];

  it("命中 handle", () => {
    expect(findCollectionByHandle(collections, "coming-soon")?.title).toBe("Coming Soon");
  });

  it("未命中返回 undefined（路由层应 notFound）", () => {
    expect(findCollectionByHandle(collections, "missing")).toBeUndefined();
  });
});

describe("pickHomeCollectionLink", () => {
  it("指向首个集合的 PLP（带市场前缀）", () => {
    expect(
      pickHomeCollectionLink(
        [
          { handle: "sofas", title: "Sofas" },
          { handle: "tables", title: "Tables" },
        ],
        "au",
      ),
    ).toEqual({ href: "/au/collections/sofas", title: "Sofas" });
  });

  it("无集合时返回 null", () => {
    expect(pickHomeCollectionLink([], "sg")).toBeNull();
  });
});
