"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@e-pig/happy-dog/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@e-pig/happy-dog/components/select";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import { withMarketPrefix } from "@/platform/config/market-path";
import { useComparisonDetails } from "../../hooks/use-comparison-details";
import type { ComparisonEntry } from "../../lib/compare-data";
import { addCompareItem, removeCompareItem, useCompareSelection } from "../../lib/compare-store";

const cellClass = "border-b px-4 py-5 align-top text-sm sm:px-6";
const labelClass = "sticky left-0 z-10 border-r border-b bg-background px-3 py-5 text-left align-top text-xs font-medium sm:px-5 sm:text-sm";
const menuClass = "w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] max-h-[min(18rem,var(--radix-select-content-available-height))]";

export function ProductComparison({ marketId }: { marketId: string }) {
  const { items, hydrated } = useCompareSelection(marketId);
  const query = useComparisonDetails(marketId, items, hydrated);
  const returnFocus = useRef<{ id: string; waitForDetails: boolean } | null>(null);
  const browseHref = withMarketPrefix(marketId, "/");
  const loading = !hydrated || (items.length > 0 && query.isPending);
  const columns = items.map(item => ({
    item,
    entry: query.data?.entries.find(entry => entry.item.productId === item.productId &&
      (item.variantId === undefined || entry.item.variantId === item.variantId)),
  }));

  useEffect(() => {
    const request = returnFocus.current;
    if (!hydrated || !request || (request.waitForDetails && items.length > 0 && query.isFetching)) return;
    const target = document.getElementById(request.id) ?? document.getElementById("comparison-heading");
    target?.focus();
    returnFocus.current = null;
  }, [hydrated, items, query.data, query.isFetching]);

  function remove(productId: string) {
    returnFocus.current = { id: "comparison-browse", waitForDetails: false };
    removeCompareItem(marketId, productId);
  }

  const optionNames = [...new Set(columns.flatMap(({ entry }) => entry?.variant?.options?.map(option => option.name) ?? []))];
  const rows: { label: string; value: (entry: ComparisonEntry) => ReactNode }[] = [
    { label: "Price", value: entry => entry.variant ? formatMarketPrice(entry.variant.price, marketId) : "Not provided" },
    { label: "Category", value: entry => entry.product?.category ?? "Not provided" },
    { label: "Availability", value: entry => entry.variant ? entry.variant.availability === "in-stock" && entry.variant.maxQuantity > 0 ? "Available for sandbox checkout" : "Unavailable for sandbox checkout" : "Not provided" },
    ...optionNames.map(name => ({ label: name, value: (entry: ComparisonEntry) => entry.variant?.options?.find(option => option.name === name)?.value ?? "Not provided" })),
    ...(optionNames.length ? [] : [{ label: "Specifications", value: () => "Not provided" }]),
    ...(["width", "depth", "height"] as const).map(dimension => ({
      label: dimension.charAt(0).toUpperCase() + dimension.slice(1),
      value: (entry: ComparisonEntry) => entry.variant?.dimensions ? String(entry.variant.dimensions[dimension]) + " " + entry.variant.dimensions.unit : "Not provided",
    })),
    { label: "Materials", value: entry => entry.product?.materials.length ? entry.product.materials.join(", ") : "Not provided" },
  ];

  return (
    <section className="mx-auto min-w-0 max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="comparison-heading" aria-busy={loading || query.isFetching}>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">Find the right fit</p>
          <h1 id="comparison-heading" tabIndex={-1} className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Compare products</h1>
          <p className="mt-4 leading-7 text-foreground/80">See your selected products side by side. Choose an option for each piece to compare its price, size and materials.</p>
          <p className="mt-3 text-sm leading-6 text-foreground/80">Sandbox comparison. Prices and availability are test data; no real stock reservation or delivery.</p>
        </div>
        {hydrated && items.length > 0 ? <Button asChild variant="outline"><Link id="comparison-browse" href={browseHref}>Browse products</Link></Button> : null}
      </div>

      {!hydrated ? <p role="status" className="py-12 text-sm">Loading your comparison…</p> : !items.length ? (
        <div className="mt-10 border-y py-16 text-center">
          <h2 className="font-display text-2xl">Your comparison is empty</h2>
          <p className="mx-auto mt-3 max-w-lg leading-7 text-foreground/80">Add up to three different products as you browse, then return here to compare them.</p>
          <Button asChild className="mt-6"><Link id="comparison-browse" href={browseHref}>Browse products</Link></Button>
        </div>
      ) : (
        <>
          <div className="mb-5 mt-8 space-y-2">
            <p role="status" className="text-sm font-medium">
              {query.isPending ? "Loading selected products…" : query.isFetching ? "Updating product details…" : String(items.length) + " of 3 products selected"}
            </p>
            {items.length === 1 ? <p className="text-sm leading-6 text-foreground/80">Add another product while you browse to compare them side by side.</p> : null}
            <p id="comparison-scroll-hint" className="text-sm leading-6 text-foreground/80">Scroll across to compare products. Product names and feature labels stay visible.</p>
          </div>
          {query.isError ? (
            <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
              <p className="text-sm">We could not load your selected products. Your selected products are still in the list.</p>
              <Button id="comparison-retry" variant="outline" disabled={query.isFetching} onClick={() => { returnFocus.current = { id: "comparison-retry", waitForDetails: true }; void query.refetch(); }}>Retry loading products</Button>
            </div>
          ) : null}
          {query.data?.issues.length ? <div role="alert" className="mb-5 space-y-2 rounded-lg border p-4 text-sm">{query.data.issues.map(issue => <p key={issue}>{issue}</p>)}</div> : null}

          <div role="region" aria-label="Product comparison table" aria-describedby="comparison-scroll-hint" tabIndex={0} className="max-h-[75svh] max-w-full scroll-mt-40 overflow-auto rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:scroll-mt-28">
            <table className="w-full table-fixed border-collapse bg-card" style={items.length > 1 ? { minWidth: 88 + items.length * 192 } : undefined}>
              <caption className="sr-only">Selected products and their specifications</caption>
              <colgroup><col className="w-22 sm:w-40" />{items.map(item => <col key={item.productId} />)}</colgroup>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 top-0 z-30 border-b border-r bg-background p-3 text-left text-sm font-medium sm:p-5">Feature</th>
                  {columns.map(({ item, entry }, index) => {
                    const name = entry?.product?.name ?? (loading ? "Selected product " + (index + 1) : "Unavailable product " + (index + 1));
                    return (
                      <th scope="col" key={item.productId} className="sticky top-0 z-20 border-b bg-card px-4 py-4 text-left align-top sm:px-6">
                        <h2 className="break-words font-display text-xl leading-tight sm:text-2xl">{name}</h2>
                        <Button type="button" variant="ghost" size="sm" className="mt-2 min-h-11 px-0 text-xs underline underline-offset-4" aria-label={"Remove " + (entry?.product?.name ?? "selected product " + (index + 1))} onClick={() => remove(item.productId)}>Remove</Button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className={labelClass}>Product image</th>
                  {columns.map(({ item, entry }) => <td key={item.productId} className={cellClass}>
                    <div className="relative h-36 overflow-hidden rounded-md bg-secondary sm:h-44">
                      {entry?.product && entry.variant ? <Image src={entry.variant.image} alt={entry.product.name + " — " + entry.variant.label} fill sizes="(min-width: 1024px) 28vw, 224px" className="object-contain" /> : <span className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-foreground/80">{loading ? "Loading image…" : "Image unavailable"}</span>}
                    </div>
                  </td>)}
                </tr>
                <tr>
                  <th scope="row" className={labelClass}>Option</th>
                  {columns.map(({ item, entry }) => {
                    const triggerId = "comparison-option-" + encodeURIComponent(item.productId);
                    return <td key={item.productId} className={cellClass}>
                      {entry?.product ? (
                        <Select value={entry.variant?.id ?? ""} disabled={query.isFetching || !entry.product.variants.length} onValueChange={variantId => {
                          returnFocus.current = { id: triggerId, waitForDetails: true };
                          addCompareItem(marketId, { productId: item.productId, variantId });
                        }}>
                          <SelectTrigger id={triggerId} aria-label={"Option for " + entry.product.name} className="h-auto min-h-11 min-w-0 py-2 [&>span]:whitespace-normal [&>span]:text-left"><SelectValue placeholder="Choose an option" /></SelectTrigger>
                          <SelectContent className={menuClass}>{entry.product.variants.map(option => <SelectItem key={option.id} value={option.id}>{option.label}{option.availability !== "in-stock" || option.maxQuantity < 1 ? " — Unavailable" : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : <p className="text-foreground/80">{loading ? "Loading options…" : "Not provided"}</p>}
                      {entry?.usedDefault ? <p className="mt-2 text-xs text-foreground/80">Default option selected</p> : null}
                      {entry?.error ? <p role="alert" className="mt-3 text-sm leading-6">{entry.error}</p> : null}
                    </td>;
                  })}
                </tr>
                {rows.map(row => <tr key={row.label}>
                  <th scope="row" className={labelClass}>{row.label}</th>
                  {columns.map(({ item, entry }) => <td key={item.productId} className={cellClass + " break-words text-foreground/80"}>{loading ? "Loading…" : query.isFetching ? "Updating…" : query.isError ? "Not available" : entry ? row.value(entry) : "Not provided"}</td>)}
                </tr>)}
                <tr>
                  <th scope="row" className={labelClass}>Details</th>
                  {columns.map(({ item, entry }) => <td key={item.productId} className={cellClass}>
                    {entry?.product && entry.variant ? <Button asChild variant="outline" className="w-full"><Link aria-label={"View " + entry.product.name + " details"} href={withMarketPrefix(marketId, "/products/" + encodeURIComponent(entry.product.slug)) + "?variant=" + encodeURIComponent(entry.variant.id)}>View details</Link></Button> : <span className="text-foreground/80">Not available</span>}
                  </td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
