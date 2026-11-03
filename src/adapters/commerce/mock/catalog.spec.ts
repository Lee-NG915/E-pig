import { describe, expect, it } from "vitest";

import { isAppError } from "@/core/errors/errors";
import { getMarket } from "@/platform/config/markets";

import { createMockCatalogAdapter } from "./catalog";
import { mockProducts } from "./catalog-data";
import fixtureIndex from "./fixtures/koala/index.json";
import tamarama from "./fixtures/showcase/tamarama.json";

const sgCatalog = createMockCatalogAdapter({ market: getMarket("sg") });
const auCatalog = createMockCatalogAdapter({ market: getMarket("au") });

function expectAscending(values: number[]) {
  expect(values).toEqual([...values].sort((a, b) => a - b));
}

function expectDescending(values: number[]) {
  expect(values).toEqual([...values].sort((a, b) => b - a));
}

describe("mock catalog adapter", () => {
  it("Koala fixtures 覆盖可用类目且商品 handle 唯一", () => {
    const populatedCollections = Object.values(fixtureIndex.counts).filter((count) => count > 0);

    expect(populatedCollections.length).toBeGreaterThanOrEqual(4);
    expect(fixtureIndex.counts["coffee-tables-side-tables"]).toBeGreaterThan(0);
    expect(new Set(mockProducts.map((product) => product.id)).size).toBe(mockProducts.length);
    expect(mockProducts.some((product) => product.badge === "New")).toBe(true);
  });

  it("Koala fixtures 只保留展示字段与本地演示价格", () => {
    const allowedKeys = [
      "badge",
      "category",
      "colour",
      "compareAtByMarket",
      "description",
      "id",
      "image",
      "materials",
      "name",
      "priceByMarket",
      "slug",
      "source",
    ];

    for (const product of mockProducts) {
      expect(Object.keys(product).every((key) => allowedKeys.includes(key))).toBe(true);
      expect(product.slug).toBe(product.id);
      expect(product.description.length).toBeLessThanOrEqual(280);
      expect(product.priceByMarket.sg).toBe(Math.round(product.priceByMarket.au * 0.88));
      expect(product.priceByMarket.us).toBe(Math.round(product.priceByMarket.au * 0.72));
      expect(product.source.vendor).toBe("Koala");
    }
  });

  it("按构造时绑定的市场返回 fixture 价格、货币与 slug", async () => {
    const fixture = mockProducts[0];
    const [sgProduct] = await sgCatalog.listProducts({ limit: 1 });
    const [auProduct] = await auCatalog.listProducts({ limit: 1 });
    expect(sgProduct.price).toEqual({ amount: fixture.priceByMarket.sg, currency: "SGD" });
    expect(auProduct.price).toEqual({ amount: fixture.priceByMarket.au, currency: "AUD" });
    expect(sgProduct.slug).toBe(fixture.slug);
    expect(auProduct.slug).toBe(fixture.slug);
  });

  it("listProducts 以 Koala fixtures 为主，并支持 category 过滤与 limit", async () => {
    const products = await sgCatalog.listProducts();
    expect(products).toHaveLength(mockProducts.length);
    expect(products.every((product) => product.image.includes("cdn.shopify.com"))).toBe(true);

    const sofas = await sgCatalog.listProducts({ category: "Sofas" });
    expect(sofas.length).toBeGreaterThanOrEqual(20);
    expect(sofas.every((product) => product.category === "Sofas")).toBe(true);

    const limited = await sgCatalog.listProducts({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it("listProducts 支持 collection（handle → category）过滤", async () => {
    const sofaBeds = await sgCatalog.listProducts({ collection: "sofa-beds" });
    expect(sofaBeds.length).toBe(mockProducts.filter((product) => product.category === "Sofa Beds").length);
    expect(sofaBeds.every((product) => product.category === "Sofa Beds")).toBe(true);

    const tables = await sgCatalog.listProducts({ collection: "tables" });
    expect(tables.length).toBe(mockProducts.filter((product) => product.category === "Tables").length);
    expect(tables.every((product) => product.category === "Tables")).toBe(true);

    const empty = await sgCatalog.listProducts({ collection: "non-existent" });
    expect(empty).toHaveLength(0);
  });

  it("listProducts 支持 sort 排序", async () => {
    const byName = await sgCatalog.listProducts({ sort: "name" });
    expect(byName.map((product) => product.name)).toEqual(
      [...byName].map((product) => product.name).sort((a, b) => a.localeCompare(b)),
    );

    const byPriceAsc = await sgCatalog.listProducts({ sort: "price-asc" });
    expectAscending(byPriceAsc.map((product) => product.price.amount));

    const byPriceDesc = await sgCatalog.listProducts({ sort: "price-desc" });
    expectDescending(byPriceDesc.map((product) => product.price.amount));
  });

  it("getProduct 返回 fixture 详情；未知 id 抛 not_found AppError", async () => {
    const detail = await sgCatalog.getProduct("tamarama-modular-sofa");
    const description = detail.description ?? "";
    expect(detail.name).toBe("Tamarama Modular Sofa");
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(280);
    expect(detail.materials).toContain("Foam");
    expect(detail.gallery.length).toBeGreaterThanOrEqual(1);
    expect(detail.gallery[0]?.src).toBe(detail.image);
    expect(detail.rating).toBeUndefined();
    expect(detail.reviewCount).toBeUndefined();
    expect(detail.availability).toBe("in-stock");
    expect(detail.colourOptions).toHaveLength(0);

    try {
      await sgCatalog.getProduct("does-not-exist");
      expect.unreachable("should throw");
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect((error as { kind: string }).kind).toBe("not_found");
    }
  });

  it("listCollections 从 catalog 派生集合，并保留 /collections/sofas 与空集合", async () => {
    const collections = await sgCatalog.listCollections();
    expect(collections).toContainEqual({ handle: "sofas", title: "Sofas" });
    expect(collections).toContainEqual({ handle: "living-room", title: "Living Room" });
    expect(collections).toContainEqual({ handle: "bedroom", title: "Bedroom" });
    expect(collections.every((collection) => collection.handle.length > 0)).toBe(true);
    expect(collections.some((collection) => collection.handle === "coming-soon")).toBe(true);

    const sofas = await sgCatalog.listProducts({ collection: "sofas" });
    expect(sofas.length).toBeGreaterThanOrEqual(20);

    const sourceCollection = await sgCatalog.listProducts({ collection: "sofas-couches" });
    expect(sourceCollection).toEqual(sofas);

    const empty = await sgCatalog.listProducts({ collection: "coming-soon" });
    expect(empty).toHaveLength(0);
  });

  it("fixtures 保留展示字段且没有重复 id", () => {
    expect(new Set(mockProducts.map((product) => product.id)).size).toBe(mockProducts.length);
    expect(mockProducts.every((product) => product.id === product.slug)).toBe(true);
    expect(mockProducts.every((product) => product.description.length <= 280)).toBe(true);
    expect(mockProducts.every((product) => product.image.startsWith("https://"))).toBe(true);
    expect(mockProducts.every((product) => product.source.vendor === "Koala")).toBe(true);
  });

  it("suggest 按名称/类别模糊匹配；空查询返回空结果", async () => {
    const results = await sgCatalog.suggest("sofa");
    expect(results.some((product) => product.id === "tamarama-modular-sofa")).toBe(true);
    expect(results.every((product) => /sofa/i.test(`${product.name} ${product.category}`))).toBe(true);

    await expect(sgCatalog.suggest("   ")).resolves.toEqual([]);
  });
});


describe("sandbox variant coverage", () => {
  it("provides honest demo review content and a resolvable existing companion", async () => {
    const detail = await auCatalog.getProduct("tamarama-modular-sofa");
    expect(detail.demoReviews).toHaveLength(4);
    expect(detail.demoReviews?.every(review => review.kind === "demo" && review.authorLabel.startsWith("Example"))).toBe(true);
    expect(detail.rating).toBeUndefined();
    expect(detail.reviewCount).toBeUndefined();
    const sofa = await auCatalog.getProduct("bangalow-modular-sofa");
    const companion = await auCatalog.getProduct(sofa.bundleCompanionId!);
    expect(companion.name).toBe("Bangalow Modular Ottoman");
    expect(companion.variants[0].price.amount).toBe(450);
    expect(companion.variants[0].availability).toBe("in-stock");
    expect(companion.demoReviews).toBeUndefined();
  });
  it("does not combine a cheap colour with another variant's price or availability", async () => {
    // Controlled input at the fixture boundary makes the wrong cross-variant AND observable.
    const colourOption = tamarama.variants[0].options[0];
    const originalColour = colourOption.value;
    colourOption.value = "Only cheap colour";
    const unavailable = { ...mockProducts[0], id: "filter-unavailable", slug: "filter-unavailable", colour: "Only cheap colour", availability: "out-of-stock" as const, priceByMarket: { au: 3550, sg: 3124, us: 2556 } };
    mockProducts.push(unavailable);
    try {
      await expect(auCatalog.listProducts({ colours: ["Only cheap colour"], minPrice: 3000, inStockOnly: true })).resolves.toEqual([]);
      expect((await auCatalog.listProducts({ colours: ["Only cheap colour"], minPrice: 3000 })).map(item => item.id)).toEqual(["filter-unavailable"]);
    } finally {
      colourOption.value = originalColour;
      mockProducts.splice(mockProducts.indexOf(unavailable), 1);
    }
  });

  it.each([NaN, Infinity, -1, 1_000_001])("rejects invalid price %s at the port boundary", async (minPrice) => {
    await expect(auCatalog.listProducts({ minPrice })).rejects.toMatchObject({ kind: "validation" });
  });

  it("rejects reversed price ranges, and sorts the matched presentation price before limiting", async () => {
    await expect(auCatalog.listProducts({ minPrice: 3000, maxPrice: 2000 })).rejects.toMatchObject({ kind: "validation" });
    const sorted = await auCatalog.listProducts({ minPrice: 3000, sort: "price-asc" });
    expectAscending(sorted.map(item => item.price.amount));
    expect(sorted.find(item => item.id === "tamarama-modular-sofa")?.price.amount).toBe(3550);
    expect(await auCatalog.listProducts({ minPrice: 3000, sort: "price-asc", limit: 2 })).toEqual(sorted.slice(0, 2));
  });

  it.each(["au", "sg", "us"] as const)("filters and presents a matching variant in %s, then sorts and limits", async (marketId) => {
    const catalog = createMockCatalogAdapter({ market: getMarket(marketId) });
    const price = { au: 3550, sg: 3124, us: 2556 }[marketId];
    const items = await catalog.listProducts({ collection: "sofas", colours: ["  FOREST WALK "], minPrice: price, maxPrice: price, inStockOnly: true, sort: "price-asc", limit: 1 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "tamarama-modular-sofa", colour: "Forest Walk", defaultVariantId: "tamarama-modular-sofa-forest-walk-3-sections", variantCount: 4, price: { amount: price, currency: getMarket(marketId).currency } });
    expect(items[0].image).toContain("TAM_FW_3S_R_01_PRODUCT");
    expect(items[0].gallery?.[0].src).toBe(items[0].image);
    expect(items[0].variantPreviews?.map(preview => preview.variantId)).toEqual(["tamarama-modular-sofa-forest-walk-3-sections"]);
    expect(items[0].compareAt).toBeUndefined();
    await expect(catalog.listProducts({ colours: ["Forest Walk"], maxPrice: price - 1000 })).resolves.toEqual([]);
  });

  it.each([
    ["au", "AUD", 2600], ["sg", "SGD", 2288], ["us", "USD", 1872],
  ] as const)("preserves the existing Tamarama identity and %s test price", async (id, currency, amount) => {
    const catalog = createMockCatalogAdapter({ market: getMarket(id) });
    const detail = await catalog.getProduct("tamarama-modular-sofa");
    expect(detail.variants[0].id).toBe("tamarama-modular-sofa-default");
    expect(detail.variants[0].price).toEqual({ amount, currency });
    expect(detail.price).toEqual({ amount, currency });
    const bangalow = await catalog.getProduct("bangalow-modular-sofa");
    expect(bangalow.variants.map(v => v.id)).toEqual([
      "bangalow-modular-sofa-default", "bangalow-modular-sofa-test-option", "bangalow-modular-sofa-unavailable-test",
    ]);
  });

  it("links colour previews to the same source-backed local variants returned by detail", async () => {
    const detail = await auCatalog.getProduct("tamarama-modular-sofa");
    const listing = (await auCatalog.listProducts()).find(item => item.id === detail.id)!;
    expect(listing.variantPreviews?.map(item => item.colour)).toEqual(["Winter Cream", "Forest Walk"]);
    expect(detail.variants).toHaveLength(4);
    const green = detail.variants.find(item => item.id === "tamarama-modular-sofa-forest-walk-3-sections")!;
    expect(green.options).toEqual([
      { name: "Colour", value: "Forest Walk" }, { name: "Size", value: "3 Sections" }, { name: "Section width", value: "Regular" },
    ]);
    expect(green.dimensions).toEqual({ width: 267, depth: 104, height: 93, unit: "cm" });
    expect(green.price).toEqual({ amount: 3550, currency: "AUD" });
    expect(green.image).toContain("TAM_FW_3S_R_01_PRODUCT");
    expect(detail.image).toContain("TAM_WC_2S_R_01_PRODUCT");
    for (const preview of listing.variantPreviews ?? []) {
      const variant = detail.variants.find(item => item.id === preview.variantId)!;
      expect(preview.image).toBe(variant.image);
      expect(preview.price).toEqual(variant.price);
      expect(preview.gallery).toEqual(variant.gallery);
      expect(variant.options?.find(option => option.name === "Colour")?.value).toBe(preview.colour);
    }
  });

  it("maps every visible product to controlled, market-priced variants without invented reviews", async () => {
    for (const marketId of ["au", "sg", "us"] as const) {
      const catalog = createMockCatalogAdapter({ market: getMarket(marketId) });
      const products = await catalog.listProducts();
      let multi = false;
      const variantIds: string[] = [];
      const skus: string[] = [];
      for (const item of products) {
        const detail = await catalog.getProduct(item.id);
        expect(detail.variants.length).toBeGreaterThan(0);
        expect(detail.variants[0].options?.find(option => option.name === "Colour")?.value ?? detail.variants[0].label).toBe(item.colour);
        expect(item.defaultVariantId).toBe(detail.variants[0].id);
        expect(item.variantCount).toBe(detail.variants.length);
        expect(new Set(detail.variants.map(v => v.id)).size).toBe(detail.variants.length);
        expect(detail.variants.every(v => v.sku.startsWith("SANDBOX-") && v.maxQuantity > 0 && v.price.currency === getMarket(marketId).currency)).toBe(true);
        expect(new Set(detail.gallery.map(image => image.src)).size).toBe(detail.gallery.length);
        expect(detail.rating).toBeUndefined();
        expect(detail.reviewCount).toBeUndefined();
        variantIds.push(...detail.variants.map(variant => variant.id));
        skus.push(...detail.variants.map(variant => variant.sku));
        multi ||= detail.variants.length > 1;
      }
      expect(multi).toBe(true);
      expect(new Set(variantIds).size).toBe(variantIds.length);
      expect(new Set(skus).size).toBe(skus.length);
      await expect(catalog.suggest("   ")).resolves.toEqual([]);
    }
  });
});
