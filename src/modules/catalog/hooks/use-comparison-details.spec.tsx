// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComparisonData } from "../lib/compare-data";
import type { CompareItem } from "../lib/compare-query";
import { addCompareItem, resetCompareStoreForTests } from "../lib/compare-store";
import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import { comparisonDetailsQueryKey, useComparisonDetails } from "./use-comparison-details";

const items: CompareItem[] = [{ productId: "sofa", variantId: "green" }];
const data = (variantId = "green", amount = 2600): ComparisonData => ({ entries: [{ item: { productId: "sofa", variantId }, variant: { id: variantId, sku: "TEST", label: variantId, image: "/sofa.jpg", availability: "in-stock", maxQuantity: 5, price: { amount, currency: "AUD" } }, usedDefault: false }], issues: [] });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { getStorefrontQueryClient().clear(); localStorage.clear(); resetCompareStoreForTests(); });
afterEach(() => { cleanup(); getStorefrontQueryClient().clear(); resetCompareStoreForTests(); onlineManager.setOnline(true); vi.unstubAllGlobals(); });

describe("useComparisonDetails", () => {
  it("resumes after reconnect without relying on an unrelated provider being mounted", async () => {
    onlineManager.setOnline(false);
    const fetcher = vi.fn().mockResolvedValue(response(data()));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useComparisonDetails("au", items));
    expect(result.current.fetchStatus).toBe("paused");
    expect(fetcher).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requests only selected identifiers without caching HTTP prices or persisting returned facts", async () => {
    addCompareItem("au", items[0]);
    const saved = localStorage.getItem("e-pig:compare:v1:au");
    const fetcher = vi.fn().mockResolvedValue(response(data()));
    vi.stubGlobal("fetch", fetcher);
    const { result, unmount } = renderHook(() => useComparisonDetails("au", items));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/au/compare?item=sofa%3Agreen");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store", credentials: "same-origin" });
    expect(result.current.data?.entries[0].variant?.price.amount).toBe(2600);
    expect(localStorage.getItem("e-pig:compare:v1:au")).toBe(saved);
    unmount();
    await waitFor(() => expect(getStorefrontQueryClient().getQueryData(comparisonDetailsQueryKey("au", items))).toBeUndefined());
    fetcher.mockResolvedValue(response(data("green", 2700)));
    const reopened = renderHook(() => useComparisonDetails("au", items));
    await waitFor(() => expect(reopened.result.current.data?.entries[0].variant?.price.amount).toBe(2700));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("skips empty or disabled selections and uses a different key for another market", async () => {
    const fetcher = vi.fn().mockImplementation(async () => response(data()));
    vi.stubGlobal("fetch", fetcher);
    const view = renderHook(({ market, selected, enabled }) => useComparisonDetails(market, selected, enabled), { initialProps: { market: "au", selected: [] as CompareItem[], enabled: true } });
    expect(fetcher).not.toHaveBeenCalled();
    view.rerender({ market: "au", selected: items, enabled: false });
    expect(fetcher).not.toHaveBeenCalled();
    view.rerender({ market: "sg", selected: items, enabled: true });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(fetcher.mock.calls[0][0]).toBe("/api/sg/compare?item=sofa%3Agreen");
    expect(comparisonDetailsQueryKey("au", items)).not.toEqual(comparisonDetailsQueryKey("sg", items));
  });

  it("exposes an API failure and allows an explicit retry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ error: { message: "Try again later." } }, 503)).mockResolvedValueOnce(response(data()));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useComparisonDetails("au", items));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Try again later.");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.entries[0].item.variantId).toBe("green");
  });

  it("does not show a previous variant's late price as the new selection", async () => {
    let resolveOld!: (value: Response) => void;
    const oldResponse = new Promise<Response>(resolve => { resolveOld = resolve; });
    const fetcher = vi.fn().mockReturnValueOnce(oldResponse).mockResolvedValueOnce(response(data("cream", 3550)));
    vi.stubGlobal("fetch", fetcher);
    const view = renderHook(({ selected }) => useComparisonDetails("au", selected), { initialProps: { selected: items } });
    view.rerender({ selected: [{ productId: "sofa", variantId: "cream" }] });
    expect(view.result.current.data).toBeUndefined();
    await waitFor(() => expect(view.result.current.data?.entries[0].variant?.price.amount).toBe(3550));
    await act(async () => { resolveOld(response(data("green", 2600))); await oldResponse; });
    expect(view.result.current.data?.entries[0].item.variantId).toBe("cream");
    expect(view.result.current.data?.entries[0].variant?.price.amount).toBe(3550);
  });
});
