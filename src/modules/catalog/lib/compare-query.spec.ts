import { describe, expect, it } from "vitest";

import { buildCompareHref, buildComparisonApiHref, parseCompareQuery, parseCompareSearchParams } from "./compare-query";

describe("comparison URL", () => {
  it("serializes selected detail requests with the same bounded identifier escaping", () => {
    expect(buildComparisonApiHref("sg", [{ productId: "sofa:one", variantId: "green / wide" }, { productId: "bed" }])).toBe("/api/sg/compare?item=sofa%253Aone%3Agreen%2520%252F%2520wide&item2=bed");
    expect(buildComparisonApiHref("us", [])).toBe("/api/us/compare");
    expect(new URL(buildComparisonApiHref("au", [{ productId: "a" }, { productId: "b" }, { productId: "c" }, { productId: "d" }]), "https://example.test").searchParams.size).toBe(3);
  });
  it("round trips explicit product and variant IDs without changing markets or interpreting separators", () => {
    const href = buildCompareHref("sg", [{ productId: "sofa:one", variantId: "green / wide" }]);
    expect(href).toBe("/sg/compare?item=sofa%253Aone%3Agreen%2520%252F%2520wide");
    const query = new URL(href, "https://example.test").searchParams;
    expect(parseCompareQuery(query.getAll("item"))).toEqual({
      items: [{ productId: "sofa:one", variantId: "green / wide" }], issues: [],
    });
  });

  it("bounds work to the first three references and reports duplicates and extra items", () => {
    const result = parseCompareQuery(["sofa:green", "sofa:green", "bed:wide", "chair:blue"]);
    expect(result.items).toEqual([{ productId: "sofa", variantId: "green" }, { productId: "bed", variantId: "wide" }]);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringMatching(/repeated/), expect.stringMatching(/up to 3/)]));
  });

  it.each(["", "sofa:", ":green", "a:b:c", "%ZZ:green", "x".repeat(1025), "%00:green", " sofa:green"])("rejects malformed reference %s", (value) => {
    const result = parseCompareQuery(value);
    expect(result.items).toEqual([]);
    expect(result.issues).toHaveLength(1);
  });

  it("allows an explicitly absent variant and an empty comparison", () => {
    expect(parseCompareQuery("sofa")).toEqual({ items: [{ productId: "sofa" }], issues: [] });
    expect(parseCompareQuery()).toEqual({ items: [], issues: [] });
    expect(buildCompareHref("us", [])).toBe("/us/compare");
  });

  it("uses unique URL keys so changing an earlier option cannot alias the last option's page state", () => {
    const href = buildCompareHref("au", [{ productId: "sofa", variantId: "cream" }, { productId: "sofa", variantId: "green" }]);
    expect(href).toBe("/au/compare?item=sofa%3Acream&item2=sofa%3Agreen");
    expect(parseCompareSearchParams({ item: "sofa:cream", item2: "sofa:green", item3: "bed:queen" }).items).toEqual([
      { productId: "sofa", variantId: "cream" }, { productId: "sofa", variantId: "green" }, { productId: "bed", variantId: "queen" },
    ]);
    expect(parseCompareSearchParams({ item: ["sofa:cream", "sofa:green"] }).items).toHaveLength(2);
    expect(parseCompareSearchParams({ item: "sofa:cream", item4: "extra:ignored" }).issues[0]).toMatch(/up to 3/);
  });
});
