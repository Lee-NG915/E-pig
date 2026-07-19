import { describe, expect, it } from "vitest";

import { isAppError } from "@/core/errors/errors";
import { getMarket } from "@/platform/config/markets";

import { createMockCatalogAdapter } from "./catalog";

const sgCatalog = createMockCatalogAdapter({ market: getMarket("sg") });
const auCatalog = createMockCatalogAdapter({ market: getMarket("au") });

describe("mock catalog adapter", () => {
  it("按构造时绑定的市场返回价格与货币，并带 slug", async () => {
    const [sgProduct] = await sgCatalog.listProducts();
    const [auProduct] = await auCatalog.listProducts();
    expect(sgProduct.price.currency).toBe("SGD");
    expect(auProduct.price.currency).toBe("AUD");
    expect(sgProduct.price.amount).not.toBe(auProduct.price.amount);
    expect(sgProduct.slug).toBe(sgProduct.id);
    expect(auProduct.slug).toBe(auProduct.id);
  });

  it("listProducts 支持 category 过滤与 limit", async () => {
    const sofas = await sgCatalog.listProducts({ category: "Sofas" });
    expect(sofas).toHaveLength(1);
    expect(sofas[0].category).toBe("Sofas");

    const limited = await sgCatalog.listProducts({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it("listProducts 支持 collection（handle → category）过滤", async () => {
    const tables = await sgCatalog.listProducts({ collection: "tables" });
    expect(tables).toHaveLength(1);
    expect(tables[0].category).toBe("Tables");

    const empty = await sgCatalog.listProducts({ collection: "non-existent" });
    expect(empty).toHaveLength(0);
  });

  it("listProducts 支持 sort 排序", async () => {
    const byName = await sgCatalog.listProducts({ sort: "name" });
    expect(byName.map((p) => p.name)).toEqual([
      "Alto Modular Sofa",
      "Cove Lounge Chair",
      "Drift Platform Bed",
      "Nook Coffee Table",
    ]);

    const byPriceAsc = await sgCatalog.listProducts({ sort: "price-asc" });
    expect(byPriceAsc.map((p) => p.id)).toEqual([
      "nook-coffee-table",
      "cove-lounge-chair",
      "drift-platform-bed",
      "alto-modular-sofa",
    ]);

    const byPriceDesc = await sgCatalog.listProducts({ sort: "price-desc" });
    expect(byPriceDesc.map((p) => p.id)).toEqual([
      "alto-modular-sofa",
      "drift-platform-bed",
      "cove-lounge-chair",
      "nook-coffee-table",
    ]);
  });

  it("getProduct 返回详情；未知 id 抛 not_found AppError", async () => {
    const detail = await sgCatalog.getProduct("alto-modular-sofa");
    expect(detail.description).toBeTruthy();
    expect(detail.materials?.length).toBeGreaterThan(0);
    expect(detail.compareAt?.currency).toBe("SGD");

    try {
      await sgCatalog.getProduct("does-not-exist");
      expect.unreachable("should throw");
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect((error as { kind: string }).kind).toBe("not_found");
    }
  });

  it("listCollections 从 catalog 派生集合", async () => {
    const collections = await sgCatalog.listCollections();
    expect(collections.map((collection) => collection.title)).toContain("Sofas");
    expect(collections.every((collection) => collection.handle.length > 0)).toBe(true);
  });

  it("suggest 按名称/类别模糊匹配；空查询抛 validation", async () => {
    const results = await sgCatalog.suggest("sofa");
    expect(results.some((product) => product.id === "alto-modular-sofa")).toBe(true);

    try {
      await sgCatalog.suggest("   ");
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as { kind: string }).kind).toBe("validation");
    }
  });
});
