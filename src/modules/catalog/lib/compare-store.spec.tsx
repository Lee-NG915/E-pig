// @vitest-environment jsdom
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addCompareItem, clearCompareSelection, removeCompareItem, resetCompareStoreForTests, useCompareSelection } from "./compare-store";

const key = (market = "au") => `e-pig:compare:v1:${market}`;
beforeEach(() => { localStorage.clear(); resetCompareStoreForTests(); });
afterEach(() => { cleanup(); resetCompareStoreForTests(); vi.restoreAllMocks(); });

describe("comparison selection", () => {
  it("initializes from storage before a card action and persists only identifiers", () => {
    localStorage.setItem(key(), JSON.stringify([{ productId: "sofa", variantId: "green" }]));
    const input = { productId: "bed", variantId: "queen", name: "Never persist", price: 123 };
    expect(addCompareItem("au", input)).toBe("added");
    input.variantId = "changed-after-add";
    expect(JSON.parse(localStorage.getItem(key())!)).toEqual([{ productId: "sofa", variantId: "green" }, { productId: "bed", variantId: "queen" }]);
    resetCompareStoreForTests();
    const { result, rerender } = renderHook(() => useCompareSelection("au"));
    expect(result.current).toEqual({ items: [{ productId: "sofa", variantId: "green" }, { productId: "bed", variantId: "queen" }], hydrated: true });
    const snapshot = result.current;
    rerender();
    expect(result.current).toBe(snapshot);
  });

  it("deduplicates by product, updates a variant in place and leaves a full selection untouched", () => {
    expect(addCompareItem("au", { productId: "sofa", variantId: "green" })).toBe("added");
    expect(addCompareItem("au", { productId: "bed" })).toBe("added");
    expect(addCompareItem("au", { productId: "chair", variantId: "small" })).toBe("added");
    const { result } = renderHook(() => useCompareSelection("au"));
    const before = result.current;
    act(() => { expect(addCompareItem("au", { productId: "sofa", variantId: "green" })).toBe("exists"); });
    expect(result.current).toBe(before);
    act(() => { expect(addCompareItem("au", { productId: "ottoman" })).toBe("full"); });
    expect(result.current).toBe(before);
    act(() => { expect(addCompareItem("au", { productId: "sofa", variantId: "cream" })).toBe("updated"); });
    expect(result.current.items).toEqual([{ productId: "sofa", variantId: "cream" }, { productId: "bed" }, { productId: "chair", variantId: "small" }]);
    act(() => removeCompareItem("au", "bed"));
    expect(result.current.items.map(item => item.productId)).toEqual(["sofa", "chair"]);
    act(() => clearCompareSelection("au"));
    expect(result.current.items).toEqual([]);
    expect(JSON.parse(localStorage.getItem(key())!)).toEqual([]);
  });

  it.each(["{", "null", "{}", '[{"productId":""}]', '[{"productId":"sofa","variantId":5}]', '[{"productId":"a"},{"productId":"a"}]', '[{"productId":"a"},{"productId":"b"},{"productId":"c"},{"productId":"d"}]'])("recovers damaged persisted selection %s without crashing", (saved) => {
    localStorage.setItem(key(), saved);
    const { result } = renderHook(() => useCompareSelection("au"));
    expect(result.current).toEqual({ items: [], hydrated: true });
    act(() => addCompareItem("au", { productId: "sofa" }));
    expect(result.current.items).toEqual([{ productId: "sofa" }]);
  });

  it("keeps memory usable when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota"); });
    const { result } = renderHook(() => useCompareSelection("au"));
    act(() => addCompareItem("au", { productId: "sofa" }));
    expect(result.current.items).toEqual([{ productId: "sofa" }]);
    act(() => clearCompareSelection("au"));
    expect(result.current.items).toEqual([]);
  });

  it("isolates markets and synchronizes other-tab edits and removals", () => {
    const au = renderHook(() => useCompareSelection("au"));
    const sg = renderHook(() => useCompareSelection("sg"));
    act(() => addCompareItem("sg", { productId: "bed" }));
    act(() => {
      const value = JSON.stringify([{ productId: "sofa", variantId: "cream" }]);
      localStorage.setItem(key(), value);
      window.dispatchEvent(new StorageEvent("storage", { key: key(), newValue: value, storageArea: localStorage }));
    });
    expect(au.result.current.items).toEqual([{ productId: "sofa", variantId: "cream" }]);
    expect(sg.result.current.items).toEqual([{ productId: "bed" }]);
    act(() => {
      localStorage.removeItem(key());
      window.dispatchEvent(new StorageEvent("storage", { key: key(), newValue: null, storageArea: localStorage }));
    });
    expect(au.result.current.items).toEqual([]);
    expect(sg.result.current.items).toEqual([{ productId: "bed" }]);
  });

  it("uses an empty server snapshot without reading storage during SSR", () => {
    localStorage.setItem(key(), JSON.stringify([{ productId: "sofa" }]));
    const read = vi.spyOn(Storage.prototype, "getItem");
    function ServerView() {
      const state = useCompareSelection("au");
      return createElement("output", null, JSON.stringify(state));
    }
    const html = renderToString(createElement(ServerView));
    expect(html).toContain("&quot;items&quot;:[]");
    expect(html).toContain("&quot;hydrated&quot;:false");
    expect(read).not.toHaveBeenCalled();
  });

  it("reads the latest persisted selection when an older cross-tab event arrives late", () => {
    const { result } = renderHook(() => useCompareSelection("au"));
    act(() => {
      localStorage.setItem(key(), JSON.stringify([{ productId: "bed" }]));
      window.dispatchEvent(new StorageEvent("storage", { key: key(), newValue: JSON.stringify([{ productId: "sofa" }]), storageArea: localStorage }));
    });
    expect(result.current.items).toEqual([{ productId: "bed" }]);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null, storageArea: localStorage })));
    expect(result.current.items).toEqual([{ productId: "bed" }]);
  });
});
