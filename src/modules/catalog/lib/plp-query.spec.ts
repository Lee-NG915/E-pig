import { describe, expect, it } from "vitest";

import {
  findCollectionByHandle,
  parseProductListSort,
  pickHomeCollectionLink,
} from "./plp-query";

describe("parseProductListSort", () => {
  it("接受合法 sort 值", () => {
    expect(parseProductListSort("price-asc")).toBe("price-asc");
    expect(parseProductListSort("price-desc")).toBe("price-desc");
    expect(parseProductListSort("name")).toBe("name");
  });

  it("拒绝非法值与缺省；数组取首项", () => {
    expect(parseProductListSort(undefined)).toBeUndefined();
    expect(parseProductListSort("popular")).toBeUndefined();
    expect(parseProductListSort(["name", "price-asc"])).toBe("name");
    expect(parseProductListSort(["nope"])).toBeUndefined();
  });
});

describe("findCollectionByHandle", () => {
  const collections = [
    { handle: "sofas", title: "Sofas" },
    { handle: "coming-soon", title: "Coming Soon" },
  ];

  it("命中 handle", () => {
    expect(findCollectionByHandle(collections, "coming-soon")?.title).toBe("Coming Soon");
  });

  it("未命中返回 undefined（路由层应 notFound）", () => {
    expect(findCollectionByHandle(collections, "missing")).toBeUndefined();
  });
});

describe("pickHomeCollectionLink", () => {
  it("指向首个集合的 PLP", () => {
    expect(
      pickHomeCollectionLink([
        { handle: "sofas", title: "Sofas" },
        { handle: "tables", title: "Tables" },
      ]),
    ).toEqual({ href: "/collections/sofas", title: "Sofas" });
  });

  it("无集合时返回 null", () => {
    expect(pickHomeCollectionLink([])).toBeNull();
  });
});
