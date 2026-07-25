import { describe, expect, it } from "vitest";

import { parseMarketPrefix, planMarketPath, withMarketPrefix } from "./market-path";

describe("planMarketPath", () => {
  it("首页重定向到本进程市场", () => {
    expect(planMarketPath("/", "au")).toEqual({ kind: "redirect", pathname: "/au" });
    expect(planMarketPath("/", "sg")).toEqual({ kind: "redirect", pathname: "/sg" });
  });

  it("已是本市场前缀则放行", () => {
    expect(planMarketPath("/au", "au")).toEqual({ kind: "next" });
    expect(planMarketPath("/au/collections/sofas", "au")).toEqual({ kind: "next" });
  });

  it("访问其他市场前缀时重写到本进程市场并保留余路径", () => {
    expect(planMarketPath("/sg", "au")).toEqual({ kind: "redirect", pathname: "/au" });
    expect(planMarketPath("/us/collections/sofas-couches", "sg")).toEqual({
      kind: "redirect",
      pathname: "/sg/collections/sofas-couches",
    });
    expect(planMarketPath("/au/products/torquay", "us")).toEqual({
      kind: "redirect",
      pathname: "/us/products/torquay",
    });
  });

  it("裸资源路径补上市场前缀", () => {
    expect(planMarketPath("/collections/sofas", "au")).toEqual({
      kind: "redirect",
      pathname: "/au/collections/sofas",
    });
    expect(planMarketPath("/products/x", "sg")).toEqual({
      kind: "redirect",
      pathname: "/sg/products/x",
    });
  });
});

describe("withMarketPrefix", () => {
  it("为相对路径加前缀；首页变成 /{market}", () => {
    expect(withMarketPrefix("au", "/")).toBe("/au");
    expect(withMarketPrefix("sg", "/collections/sofas")).toBe("/sg/collections/sofas");
  });

  it("纠正错误市场前缀", () => {
    expect(withMarketPrefix("au", "/sg/products/x")).toBe("/au/products/x");
  });

  it("保留正确前缀", () => {
    expect(withMarketPrefix("us", "/us/collections/a")).toBe("/us/collections/a");
  });
});

describe("parseMarketPrefix", () => {
  it("识别登记市场", () => {
    expect(parseMarketPrefix("/au/collections/x")).toBe("au");
    expect(parseMarketPrefix("/collections/x")).toBeNull();
  });
});
