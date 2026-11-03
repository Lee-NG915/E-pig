"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@e-pig/happy-dog/components/button";
import type { ProductListItem } from "@/core/contracts/commerce/catalog";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import { withMarketPrefix } from "@/platform/config/market-path";
import type { ComparisonData } from "../../lib/compare-data";
import { buildCompareHref, MAX_COMPARE_ITEMS, type CompareItem } from "../../lib/compare-query";

type Props = ComparisonData & { marketId: string; products: ProductListItem[] };
const selectClass = "mt-2 h-12 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function ProductComparison({ marketId, products, entries, issues }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newProductId, setNewProductId] = useState("");
  const [newVariantId, setNewVariantId] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const returnFocusId = useRef<string | null>(null);
  const current = entries.map((entry) => entry.item);
  const addProduct = products.find((product) => product.id === newProductId);
  const addDetail = entries.find((entry) => entry.product?.id === newProductId)?.product;
  const full = entries.length >= MAX_COMPARE_ITEMS;

  useEffect(() => {
    if (pending || !returnFocusId.current) return;
    const target = document.getElementById(returnFocusId.current) ?? document.getElementById("compare-add-product");
    target?.focus();
    returnFocusId.current = null;
  }, [pending, entries]);

  function navigate(items: CompareItem[]) {
    const keys = items.map((item) => JSON.stringify(item));
    if (new Set(keys).size !== keys.length) {
      setSelectionError("This option is already in your comparison. Choose a different option.");
      return;
    }
    setSelectionError("");
    returnFocusId.current = document.activeElement instanceof HTMLElement && document.activeElement.id
      ? document.activeElement.id : "compare-add-product";
    startTransition(() => router.push(buildCompareHref(marketId, items), { scroll: false }));
  }
  function replace(index: number, item: CompareItem) {
    navigate(current.map((previous, position) => position === index ? item : previous));
  }

  return (
    <section className="mx-auto min-w-0 max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="comparison-heading" aria-busy={pending}>
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-primary">Find the right fit</p>
        <h1 id="comparison-heading" className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Compare your options</h1>
        <p className="mt-4 leading-7 text-foreground/80">Compare up to three products or options. Your selection stays in this page’s URL, so you can return to it or share it.</p>
      </div>
      {issues.length || selectionError ? (
        <div role="alert" className="mt-6 space-y-2 rounded-lg border p-4 text-sm">
          {issues.map((issue, index) => <p key={`${issue}-${index}`}>{issue}</p>)}
          {selectionError ? <p>{selectionError}</p> : null}
        </div>
      ) : null}
      <form className="my-8 flex min-w-0 flex-col gap-4 border-y py-6 sm:flex-row sm:items-end" onSubmit={(event) => {
        event.preventDefault();
        if (!addProduct || full || pending) return;
        navigate([...current, { productId: addProduct.id, variantId: newVariantId || addProduct.defaultVariantId }]);
      }}>
        <div className="min-w-0 flex-1">
          <label htmlFor="compare-add-product" className="text-sm font-medium">Add a product</label>
          <select id="compare-add-product" className={selectClass} value={newProductId} disabled={full || pending} onChange={(event) => {
            setNewProductId(event.target.value);
            const selected = products.find((product) => product.id === event.target.value);
            const detail = entries.find((entry) => entry.product?.id === event.target.value)?.product;
            setNewVariantId(selected?.defaultVariantId ?? detail?.variants[0]?.id ?? "");
          }}>
            <option value="">Choose a product</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </div>
        {addDetail ? (
          <div className="min-w-0 flex-1">
            <label htmlFor="compare-add-option" className="text-sm font-medium">Option to add</label>
            <select id="compare-add-option" className={selectClass} value={newVariantId} disabled={full || pending} onChange={(event) => setNewVariantId(event.target.value)}>
              {addDetail.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}{variant.availability === "out-of-stock" ? " — Out of stock" : ""}</option>)}
            </select>
          </div>
        ) : null}
        <Button type="submit" size="lg" disabled={!addProduct || full || pending}>Add to comparison</Button>
      </form>
      <p role="status" className="mb-6 text-sm text-foreground/80">
        {pending ? "Updating comparison…" : full ? "3 of 3 options selected. Remove one to add another." : `${entries.length} of 3 options selected.`}
      </p>
      {!entries.length ? (
        <div className="border-b py-12 text-center">
          <h2 className="font-display text-2xl">Start with a piece you like.</h2>
          <p className="mt-3 text-foreground/80">Choose a product above, or use Compare on a product card.</p>
          <Link className="mt-5 inline-block rounded-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={withMarketPrefix(marketId, "/collections/sofas")}>Browse sofas</Link>
        </div>
      ) : (
        <div className="grid min-w-0 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry, index) => {
            const { product, variant, item } = entry;
            const headingId = `compare-option-${index}`;
            return (
              <article key={index} aria-labelledby={headingId} className="min-w-0 rounded-lg border bg-card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 id={headingId} className="min-w-0 break-words font-display text-2xl"><span className="sr-only">Option {index + 1}:</span>{" "}{product?.name ?? "Unavailable product"}</h2>
                  <Button variant="ghost" size="sm" disabled={pending} aria-label={`Remove comparison ${index + 1}`} onClick={() => navigate(current.filter((_, position) => position !== index))}>Remove</Button>
                </div>
                <div className="mt-5">
                  <label htmlFor={`compare-product-${index}`} className="text-sm font-medium">Product for comparison {index + 1}</label>
                  <select id={`compare-product-${index}`} className={selectClass} value={product?.id ?? item.productId} disabled={pending} onChange={(event) => {
                    const selected = products.find((candidate) => candidate.id === event.target.value);
                    if (selected) replace(index, { productId: selected.id, variantId: selected.defaultVariantId });
                  }}>
                    {!products.some((candidate) => candidate.id === (product?.id ?? item.productId)) ? <option value={product?.id ?? item.productId}>Unavailable product</option> : null}
                    {products.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                  </select>
                </div>
                {product ? (
                  <div className="mt-4">
                    <label htmlFor={`compare-variant-${index}`} className="text-sm font-medium">Option for comparison {index + 1}</label>
                    <select id={`compare-variant-${index}`} className={selectClass} value={variant?.id ?? ""} disabled={pending || !product.variants.length} onChange={(event) => replace(index, { productId: product.id, variantId: event.target.value })}>
                      {!variant ? <option value="" disabled>Choose an available catalog option</option> : null}
                      {product.variants.map((option) => <option key={option.id} value={option.id}>{option.label}{option.availability === "out-of-stock" ? " — Out of stock" : ""}</option>)}
                    </select>
                  </div>
                ) : null}
                {entry.error ? <p role="alert" className="mt-5 rounded-md border p-3 text-sm">{entry.error}</p> : null}
                {product && variant ? (
                  <>
                    {entry.usedDefault ? <p className="mt-3 text-sm text-foreground/80">Default option selected</p> : null}
                    <div className="relative mt-5 aspect-[4/3] overflow-hidden rounded-md bg-secondary">
                      <Image src={variant.image} alt={`${product.name} — ${variant.label}`} fill sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 90vw" className="object-contain" />
                    </div>
                    <dl className="mt-5 divide-y text-sm">
                      {[
                        ["Price", formatMarketPrice(variant.price, marketId)],
                        ["Availability", variant.availability === "in-stock" ? "In stock" : "Out of stock"],
                        ["Selected option", variant.label],
                        ["Specifications", variant.options?.length ? variant.options.map((option) => `${option.name}: ${option.value}`).join(" · ") : "Not provided"],
                        ["Dimensions", variant.dimensions ? `${variant.dimensions.width} × ${variant.dimensions.depth} × ${variant.dimensions.height} ${variant.dimensions.unit} (W × D × H)` : "Not provided"],
                        ["Materials", product.materials.length ? product.materials.join(", ") : "Not provided"],
                      ].map(([label, value]) => <div key={label} className="py-3"><dt className="font-medium">{label}</dt><dd className="mt-1 break-words text-foreground/80">{value}</dd></div>)}
                    </dl>
                    <Button asChild variant="outline" className="mt-5 w-full"><Link href={`${withMarketPrefix(marketId, `/products/${encodeURIComponent(product.slug)}`)}?variant=${encodeURIComponent(variant.id)}`}>View this option</Link></Button>
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
