import { describe, expect, it } from "vitest";

import {
  buildCanonicalUrl,
  buildCollectionJsonLd,
  buildHreflangAlternates,
  buildPageMetadata,
  buildProductJsonLd,
  buildWebSiteJsonLd,
  serializeForInlineScript,
  truncateMeta,
} from "./index";

describe("seo helpers", () => {
  it("truncates meta strings with ellipsis", () => {
    expect(truncateMeta("a".repeat(10), 8)).toBe(`${"a".repeat(7)}…`);
  });

  it("builds page metadata with canonical", () => {
    const meta = buildPageMetadata({
      title: "Sofa",
      description: "A comfortable sofa",
      canonicalUrl: "https://sg.e-pig.local/p/sofa",
    });
    expect(meta.title).toBe("Sofa");
    expect(meta.alternates?.canonical).toBe("https://sg.e-pig.local/p/sofa");
  });

  it("escapes script breakers in JSON-LD", () => {
    const html = serializeForInlineScript({ x: "</script><script>alert(1)" });
    expect(html.includes("</script>")).toBe(false);
    expect(html.includes("\\u003c")).toBe(true);
    expect(html.includes("\\u003e")).toBe(true);
  });

  it("supports noIndex metadata", () => {
    const meta = buildPageMetadata({ title: "Private", noIndex: true });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("builds product json-ld", () => {
    const ld = buildProductJsonLd({ name: "Chair", sku: "c-1" });
    expect(ld["@type"]).toBe("Product");
    expect(ld.sku).toBe("c-1");
  });

  it("builds collection and website json-ld", () => {
    expect(buildCollectionJsonLd({ name: "Sofas", url: "https://a/x" })["@type"]).toBe(
      "CollectionPage",
    );
    expect(buildWebSiteJsonLd({ name: "E-pig", url: "https://a/" })["@type"]).toBe("WebSite");
  });

  it("emits hreflang for every registry market host", () => {
    const alts = buildHreflangAlternates("/");
    expect(alts.map((a) => a.marketId).sort()).toEqual(["au", "sg", "us"]);
    expect(buildCanonicalUrl("sg", "/")).toBe("https://sg.e-pig.local/");
  });
});
