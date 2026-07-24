import type {
  Collection,
  ListProductsQuery,
  CatalogPort,
  ProductDetail,
  ProductListItem,
} from "@/core/contracts/commerce/catalog";
import { AppError } from "@/core/errors/errors";
import type { Market } from "@/platform/config/markets";

import { mockProducts, type MockProductRecord } from "./catalog-data";

/**
 * Mock CatalogAdapter：本地 typed 数据实现 CatalogPort。
 * 与真实 adapter 共用同一套 contract test（04 §9）；替换后端时业务代码零改动。
 * market 在构造时绑定 —— port 方法本身不感知市场。
 */
const CATEGORY_HANDLES: Record<string, string> = {
  Sofas: "sofas",
  Mattresses: "mattresses",
  "Sofa Beds": "sofa-beds",
  Armchairs: "armchairs",
  Tables: "tables",
  Outdoor: "outdoor",
  "Living Room": "living-room",
  Bedroom: "bedroom",
};

/** fixture 文件名 / 别名 → 类目标题（PLP collection 过滤） */
const FIXTURE_HANDLE_CATEGORIES: Record<string, string> = {
  "sofas-couches": "Sofas",
  sofas: "Sofas",
  mattresses: "Mattresses",
  "sofa-beds": "Sofa Beds",
  armchairs: "Armchairs",
  "coffee-tables-side-tables": "Tables",
  tables: "Tables",
  "outdoor-furniture": "Outdoor",
  outdoor: "Outdoor",
  "living-room": "Living Room",
  bedroom: "Bedroom",
};

export function createMockCatalogAdapter({ market }: { market: Market }): CatalogPort {
  function categoryToHandle(category: string): string {
    return CATEGORY_HANDLES[category] ?? category.toLowerCase().replace(/\s+/g, "-");
  }

  function toListItem(record: MockProductRecord): ProductListItem {
    const compareAt = record.compareAtByMarket?.[market.id];
    return {
      id: record.id,
      slug: record.slug,
      name: record.name,
      category: record.category,
      colour: record.colour,
      image: record.image,
      badge: record.badge,
      price: { amount: record.priceByMarket[market.id], currency: market.currency },
      ...(compareAt !== undefined
        ? { compareAt: { amount: compareAt, currency: market.currency } }
        : {}),
    };
  }

  return {
    async listProducts(query?: ListProductsQuery): Promise<ProductListItem[]> {
      let records = mockProducts;
      if (query?.category) {
        records = records.filter((record) => record.category === query.category);
      }
      if (query?.collection) {
        const category = FIXTURE_HANDLE_CATEGORIES[query.collection];
        records = records.filter((record) => {
          if (category && record.category === category) return true;
          return categoryToHandle(record.category) === query.collection;
        });
      }
      if (query?.sort) {
        records = [...records].sort((a, b) => {
          switch (query.sort) {
            case "price-asc":
              return a.priceByMarket[market.id] - b.priceByMarket[market.id];
            case "price-desc":
              return b.priceByMarket[market.id] - a.priceByMarket[market.id];
            case "name":
              return a.name.localeCompare(b.name);
            default:
              return 0;
          }
        });
      }
      if (query?.limit !== undefined) {
        records = records.slice(0, query.limit);
      }
      return records.map(toListItem);
    },

    async getProduct(id: string): Promise<ProductDetail> {
      const record = mockProducts.find((product) => product.id === id || product.slug === id);
      if (!record) {
        throw new AppError("not_found", `Product not found: ${id}`);
      }
      return {
        ...toListItem(record),
        description: record.description,
        materials: record.materials,
      };
    },

    async listCollections(): Promise<Collection[]> {
      const categories = [...new Set(mockProducts.map((product) => product.category))];
      const derived = categories.map((category) => ({
        handle: categoryToHandle(category),
        title: category,
      }));
      // 显式空集合：使 PLP 空态可经合法 URL 到达（非 notFound）
      return [...derived, { handle: "coming-soon", title: "Coming Soon" }];
    },

    async suggest(query: string): Promise<ProductListItem[]> {
      const normalized = query.trim().toLowerCase();
      if (!normalized) {
        throw new AppError("validation", "suggest query must not be empty");
      }
      return mockProducts
        .filter(
          (product) =>
            product.name.toLowerCase().includes(normalized) ||
            product.category.toLowerCase().includes(normalized),
        )
        .map(toListItem);
    },
  };
}
