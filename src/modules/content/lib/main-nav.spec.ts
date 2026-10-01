import { describe, expect, it } from "vitest";

import { mainNav, primaryLinks, promoBanner, utilityLinks } from "./main-nav";

describe("mainNav", () => {
  it("一级分类短标签且可进 PLP", () => {
    expect(mainNav.map((item) => item.label)).toEqual(["Living", "Bedroom", "Outdoor", "Sofas"]);
    for (const item of mainNav) {
      expect(item.href.startsWith("/collections/")).toBe(true);
      expect(item.groups.length).toBeGreaterThan(0);
    }
  });

  it("每个 Mega 营销图不超过 2 且带 alt", () => {
    for (const item of mainNav) {
      expect(item.promos.length).toBeLessThanOrEqual(2);
      for (const promo of item.promos) {
        expect(promo.imageAlt.length).toBeGreaterThan(0);
        expect(promo.href.startsWith("/collections/")).toBe(true);
      }
    }
  });

  it("顶栏促销与辅助链存在", () => {
    expect(promoBanner.text.length).toBeGreaterThan(0);
    expect(utilityLinks.length).toBeGreaterThan(0);
  });

  it("主导航叶子链指向 Blog，且不进入分类 Mega", () => {
    expect(primaryLinks).toEqual([{ label: "Blog", href: "/blog" }]);
  });
});
