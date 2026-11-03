import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductDetail } from "@/core/contracts/commerce/catalog";
import { AppError } from "@/core/errors/errors";
import { buildComparisonApiHref } from "@/modules/catalog/lib/compare-query";

const ports = vi.hoisted(() => ({ getProduct: vi.fn(), listProducts: vi.fn(), getCapabilities: vi.fn() }));
vi.mock("@/platform/config/env", () => ({ env: { MARKET: "au" } }));
vi.mock("@/platform/registry", () => ({ getCapabilities: ports.getCapabilities }));
import { GET } from "./route";

const product: ProductDetail = {
  id: "sofa", slug: "sofa", name: "Sofa", category: "Sofas", colour: "Green", image: "/green.jpg", price: { amount: 2600, currency: "AUD" },
  description: "Demo", materials: [], gallery: [], colourOptions: [], availability: "in-stock",
  variants: [{ id: "green:wide", sku: "DEMO", label: "Green / Wide", price: { amount: 2600, currency: "AUD" }, image: "/green.jpg", availability: "in-stock", maxQuantity: 5 }],
};
const request = (query = "", market = "au") => new Request(`https://shop.example/api/${market}/compare${query}`);
const context = (market = "au") => ({ params: Promise.resolve({ market }) });
beforeEach(() => {
  vi.clearAllMocks();
  ports.getCapabilities.mockReturnValue({ catalog: ports });
  ports.getProduct.mockImplementation(async (id: string) => ({ ...product, id, slug: id }));
});

describe("selected comparison API", () => {
  it("loads only the selected identifiers and returns authoritative facts with no-store and no cookie", async () => {
    const href = buildComparisonApiHref("au", [{ productId: "sofa:one", variantId: "green:wide" }, { productId: "bed" }]);
    const response = await GET(new Request(`https://shop.example${href}`), context());
    expect(response.status).toBe(200);
    expect(ports.getProduct.mock.calls).toEqual([["sofa:one"], ["bed"]]);
    expect(ports.listProducts).not.toHaveBeenCalled();
    const data = await response.json();
    expect(data.entries.map((entry: { item: unknown }) => entry.item)).toEqual([{ productId: "sofa:one", variantId: "green:wide" }, { productId: "bed", variantId: "green:wide" }]);
    expect(data.entries[0].variant.price).toEqual({ amount: 2600, currency: "AUD" });
    expect(data.issues).toEqual([]);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["?item=%ZZ", "?item=sofa:", "?item=sofa&item=sofa", "?item=sofa:green&item2=sofa:cream", "?item=a&item2=b&item3=c&item4=d", "?item=a&item=b&item=c&item=d"])("rejects the entire invalid selection before catalogue reads: %s", async query => {
    const response = await GET(request(query), context());
    expect(response.status).toBe(400);
    expect((await response.json()).error.kind).toBe("validation");
    expect(ports.getProduct).not.toHaveBeenCalled();
    expect(ports.listProducts).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each(["sg", "us", "unknown"])("rejects inactive market %s without reading catalogue data", async market => {
    const response = await GET(request("?item=sofa", market), context(market));
    expect(response.status).toBe(404);
    expect(ports.getCapabilities).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns an empty result without reading any product", async () => {
    const response = await GET(request(), context());
    expect(await response.json()).toEqual({ entries: [], issues: [] });
    expect(ports.getProduct).not.toHaveBeenCalled();
    expect(ports.listProducts).not.toHaveBeenCalled();
  });

  it("keeps unknown valid IDs repairable and normalizes transient errors for retry", async () => {
    ports.getProduct.mockRejectedValueOnce(new AppError("not_found", "Missing product"));
    const missing = await GET(request("?item=removed"), context());
    expect(missing.status).toBe(200);
    expect((await missing.json()).entries[0]).toMatchObject({ item: { productId: "removed" }, error: expect.stringMatching(/unavailable/), usedDefault: false });
    ports.getProduct.mockRejectedValueOnce(new AppError("upstream", "Network down", { publicMessage: "Try comparison again." }));
    const failure = await GET(request("?item=sofa"), context());
    expect(failure.status).toBe(503);
    expect((await failure.json()).error.message).toBe("Try comparison again.");
    expect(failure.headers.get("cache-control")).toContain("no-store");
  });
});
