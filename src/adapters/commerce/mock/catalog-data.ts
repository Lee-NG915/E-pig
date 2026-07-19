import type { MarketId } from "@/platform/config/markets";

import armchairs from "./fixtures/koala/armchairs.json";
import bedroom from "./fixtures/koala/bedroom.json";
import tables from "./fixtures/koala/coffee-tables-side-tables.json";
import livingRoom from "./fixtures/koala/living-room.json";
import mattresses from "./fixtures/koala/mattresses.json";
import outdoor from "./fixtures/koala/outdoor-furniture.json";
import sofaBeds from "./fixtures/koala/sofa-beds.json";
import sofas from "./fixtures/koala/sofas-couches.json";

/**
 * Mock catalog 数据源（Koala AU 公开 JSON 精简 fixtures）。
 * 这是 adapter 的内部数据，不是 contract 的一部分；module 不得直接 import 本文件。
 */
export type MockProductRecord = {
  id: string;
  slug: string;
  name: string;
  category: string;
  badge?: string;
  colour: string;
  image: string;
  description: string;
  materials: string[];
  priceByMarket: Record<MarketId, number>;
  compareAtByMarket?: Partial<Record<MarketId, number>>;
  source: {
    vendor: "Koala";
    collection: string;
    scrapedAt: string;
  };
};

const fixtureProducts = [
  ...sofas,
  ...mattresses,
  ...sofaBeds,
  ...armchairs,
  ...tables,
  ...outdoor,
  ...livingRoom,
  ...bedroom,
] as MockProductRecord[];

/** 跨类目可能重复 handle：保留首次出现（优先 Sofas 等主列表）。 */
function dedupeById(products: MockProductRecord[]): MockProductRecord[] {
  const seen = new Set<string>();
  const unique: MockProductRecord[] = [];
  for (const product of products) {
    if (seen.has(product.id)) continue;
    if (product.source.vendor !== "Koala") {
      throw new Error(`Unexpected fixture vendor for ${product.id}: ${product.source.vendor}`);
    }
    seen.add(product.id);
    unique.push({
      ...product,
      source: { ...product.source, vendor: "Koala" },
    });
  }
  return unique;
}

export const mockProducts: MockProductRecord[] = dedupeById(fixtureProducts);
