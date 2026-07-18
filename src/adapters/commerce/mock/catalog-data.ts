import type { MarketId } from "@/platform/config/markets";

/**
 * Mock catalog 数据源。价格按市场给出，模拟真实 commerce API 的按市场定价行为。
 * 这是 adapter 的内部数据，不是 contract 的一部分；module 不得直接 import 本文件。
 */
export type MockProductRecord = {
  id: string;
  name: string;
  category: string;
  badge?: string;
  colour: string;
  image: string;
  description: string;
  materials: string[];
  priceByMarket: Record<MarketId, number>;
  compareAtByMarket?: Partial<Record<MarketId, number>>;
};

export const mockProducts: MockProductRecord[] = [
  {
    id: "alto-modular-sofa",
    name: "Alto Modular Sofa",
    category: "Sofas",
    badge: "Bestseller",
    colour: "Moss weave",
    image:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=85",
    description:
      "A three-piece modular sofa with deep seats, washable covers and a kiln-dried hardwood frame.",
    materials: ["Kiln-dried hardwood", "High-resilience foam", "Recycled polyester weave"],
    priceByMarket: { au: 2890, sg: 2490, us: 1890 },
    compareAtByMarket: { au: 3290, sg: 2890 },
  },
  {
    id: "cove-lounge-chair",
    name: "Cove Lounge Chair",
    category: "Lounge chairs",
    badge: "New",
    colour: "Oat boucle",
    image:
      "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1200&q=85",
    description: "A curved lounge chair in soft boucle with a solid beech base.",
    materials: ["Solid beech", "Boucle upholstery"],
    priceByMarket: { au: 890, sg: 790, us: 590 },
  },
  {
    id: "drift-platform-bed",
    name: "Drift Platform Bed",
    category: "Bedroom",
    colour: "Natural oak",
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",
    description: "A low platform bed in natural oak with rounded edges and silent slats.",
    materials: ["American oak", "Beech slats"],
    priceByMarket: { au: 1690, sg: 1490, us: 1090 },
  },
  {
    id: "nook-coffee-table",
    name: "Nook Coffee Table",
    category: "Tables",
    badge: "Low stock",
    colour: "Smoked ash",
    image:
      "https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=1200&q=85",
    description: "A compact coffee table in smoked ash with a soft-close storage drawer.",
    materials: ["Smoked ash veneer", "Powder-coated steel"],
    priceByMarket: { au: 590, sg: 520, us: 390 },
  },
];
