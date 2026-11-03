import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/platform/registry", () => ({ getCapabilities: () => ({ catalog: { listCollections: async () => [{ handle: "sofas", title: "Sofas" }] } }) }));

import { generateMetadata } from "./page";

describe("collection query metadata", () => {
  it.each([{ colour: "Forest Walk" }, { minPrice: "0" }, { inStock: "true" }, { minPrice: "invalid" }, { sort: "unsupported" }])("does not index a filtered or invalid URL: %o", async (searchParams) => {
    const result = await generateMetadata({ params: Promise.resolve({ market: "au", slug: "sofas" }), searchParams: Promise.resolve(searchParams) });
    expect(result.robots).toEqual({ index: false, follow: false });
    expect(result.alternates?.canonical).toBe("https://au.e-pig.local/au/collections/sofas");
  });

  it("keeps the plain collection indexable", async () => {
    const result = await generateMetadata({ params: Promise.resolve({ market: "au", slug: "sofas" }), searchParams: Promise.resolve({}) });
    expect(result.robots).toBeUndefined();
  });
});
