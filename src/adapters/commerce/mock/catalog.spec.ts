import { describe, expect, it } from "vitest";

import { isAppError } from "@/core/errors/errors";
import { getMarket } from "@/platform/config/markets";

import { createMockCatalogAdapter } from "./catalog";
import { mockProducts } from "./catalog-data";
import fixtureIndex from "./fixtures/koala/index.json";

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

  it("suggest 按名称/类别模糊匹配；空查询抛 validation", async () => {
    const results = await sgCatalog.suggest("sofa");
    expect(results.some((product) => product.id === "tamarama-modular-sofa")).toBe(true);
    expect(results.every((product) => /sofa/i.test(`${product.name} ${product.category}`))).toBe(true);

    try {
      await sgCatalog.suggest("   ");
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as { kind: string }).kind).toBe("validation");
    }
  });
});
