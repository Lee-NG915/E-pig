"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@e-pig/happy-dog/components/button";
import type { ProductDetail as ProductDetailData } from "@/core/contracts/commerce/catalog";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import { useCartMarket } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { useCartActions } from "@/modules/cart/lib/cart-store";
import { getVariantOptionGroups, resolveInitialVariant, resolveVariantOption } from "@/modules/catalog/lib/variant-selection";

export function ProductDetail({ product, initialVariantId }: { product: ProductDetailData; initialVariantId?: string | string[] }) {
  const market = useCartMarket();
  const { addItem, pending, error } = useCartActions(market);
  const [selectedId, setSelectedId] = useState(() => resolveInitialVariant(product.variants, initialVariantId).variant?.id);
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const selected = product.variants.find(variant => variant.id === selectedId);
  const invalidSelection = !selected && initialVariantId !== undefined;
  const optionGroups = getVariantOptionGroups(product.variants);
  const busy = pending || submitting;
  const available = selected?.availability === "in-stock" && selected.maxQuantity > 0;
  const sourceGallery = selected?.gallery?.length ? selected.gallery : product.gallery;
  const firstImage = { src: selected?.image ?? product.image, alt: `${product.name}${selected ? ` — ${selected.label}` : ""}` };
  const images = sourceGallery[0]?.src === firstImage.src ? sourceGallery : [firstImage, ...sourceGallery];
  const gallery = images.filter((image, index, all) => all.findIndex(other => other.src === image.src) === index);
  const activeImage = gallery[activeIndex] ?? gallery[0];
  const image = activeIndex === 0 && !selected?.gallery?.length ? firstImage : activeImage;
  function selectVariant(id: string) {
    setSelectedId(id); setActiveIndex(0); setFeedback(""); setFailure("");
    const url = new URL(window.location.href);
    url.searchParams.set("variant", id);
    window.history.replaceState(null, "", url);
  }
  async function add() {
    if (!selected || !available || pending || submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true); setFailure(""); setFeedback("");
    try { await addItem({ productId: product.id, variantId: selected.id, quantity: 1 }); setFeedback(`${selected.label} added to your bag.`); }
    catch (cause) { setFailure(cause instanceof Error ? cause.message : "Could not add this item. Please try again."); }
    finally { submittingRef.current = false; setSubmitting(false); }
  }
  return (
    <section className="bg-background pb-28 lg:pb-0" aria-labelledby="product-detail-title">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-16">
        <div className="min-w-0">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
            <Image src={image.src} alt={image.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" priority />
            {gallery.length > 1 ? <>
              <Button variant="secondary" size="icon" aria-label="Previous product image" className="absolute left-3 top-1/2" onClick={() => setActiveIndex((activeIndex - 1 + gallery.length) % gallery.length)}><ChevronLeft aria-hidden="true" /></Button>
              <Button variant="secondary" size="icon" aria-label="Next product image" className="absolute right-3 top-1/2" onClick={() => setActiveIndex((activeIndex + 1) % gallery.length)}><ChevronRight aria-hidden="true" /></Button>
            </> : null}
          </div>
          {gallery.length > 1 ? <div className="mt-4 flex gap-3 overflow-x-auto">{gallery.map((item, index) => <button type="button" key={item.src} aria-label={`Show product image ${index + 1}`} aria-pressed={index === activeIndex} onClick={() => setActiveIndex(index)} className={`relative aspect-square w-20 shrink-0 overflow-hidden rounded-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${index === activeIndex ? "border-primary" : "border-transparent"}`}><Image src={item.src} alt="" fill sizes="80px" className="object-cover" /></button>)}</div> : null}
        </div>
        <div className="min-w-0 py-2">
          <p className="text-sm text-muted-foreground">{product.category}</p>
          <h1 id="product-detail-title" className="mt-2 font-display text-3xl leading-tight sm:text-4xl">{product.name}</h1>
          {product.rating !== undefined && product.reviewCount !== undefined && product.reviewCount > 0 ? <p className="mt-3 text-sm">{product.rating} out of 5 · {product.reviewCount} reviews</p> : null}
          <p className="mt-6 text-2xl font-medium">{formatMarketPrice(selected?.price ?? product.price, market.id)}</p>
          <p className="mt-2 text-sm text-muted-foreground">{available ? "Available for sandbox checkout" : "Unavailable for sandbox checkout"}</p>
          <p className="mt-6 max-w-prose leading-7 text-muted-foreground">{product.description}</p>
          {optionGroups.length ? <div className="mt-8 space-y-5">{optionGroups.map(group => <fieldset key={group.name} disabled={busy}>
            <legend className="mb-3 font-medium">{group.name}</legend>
            <div className="flex flex-wrap gap-3">{group.values.map(value => {
              const target = resolveVariantOption(product.variants, selected, group.name, value);
              const checked = selected?.options?.some(option => option.name === group.name && option.value === value) ?? false;
              return <label key={value} className={`rounded-md border px-4 py-3 text-sm focus-within:ring-2 focus-within:ring-ring ${checked ? "border-primary bg-primary/10" : "border-border"} ${target ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
                <input type="radio" name={`${product.id}-${group.name}`} className="sr-only" value={value} checked={checked} aria-checked={checked} disabled={!target} onChange={() => { if (target) selectVariant(target.id); }} />{value}
              </label>;
            })}</div>
          </fieldset>)}</div> : <fieldset className="mt-8" disabled={busy}>
            <legend className="mb-3 font-medium">Choose an option</legend>
            <div className="flex flex-wrap gap-3">{product.variants.map(variant => <label key={variant.id} className={`cursor-pointer rounded-md border px-4 py-3 text-sm focus-within:ring-2 focus-within:ring-ring ${selected?.id === variant.id ? "border-primary bg-primary/10" : "border-border"}`}>
              <input type="radio" name={`variant-${product.id}`} className="sr-only" value={variant.id} checked={selected?.id === variant.id} aria-checked={selected?.id === variant.id} onChange={() => selectVariant(variant.id)} />{variant.label}
            </label>)}</div>
          </fieldset>}
          {invalidSelection ? <p role="alert" className="mt-4 text-sm text-destructive">This option is no longer available. Choose an available option before adding to your bag.</p> : null}
          <Button className="mt-6 w-full sm:w-auto" size="lg" disabled={!available || pending || submitting} onClick={() => void add()}>{pending || submitting ? "Adding…" : available ? "Add to bag" : "Unavailable for sandbox checkout"}</Button>
          {failure || error ? <p role="alert" className="mt-3 text-sm text-destructive">{failure || error}</p> : null}
          {feedback ? <p role="status" className="mt-3 text-sm">{feedback}</p> : null}
          <p className="mt-6 text-sm leading-6 text-muted-foreground">Sandbox store. Test options and prices are for checkout testing. No real payment, stock reservation or delivery.</p>
          {selected?.dimensions ? <div className="mt-8 border-t pt-6"><h2 className="font-medium">Dimensions</h2><p className="mt-2 text-sm">{selected.dimensions.width} × {selected.dimensions.depth} × {selected.dimensions.height} {selected.dimensions.unit}</p><p className="mt-1 text-xs text-muted-foreground">Width × depth × height</p></div> : null}
          {product.materials.length ? <div className="mt-8 border-t pt-6"><h2 className="font-medium">Materials in the catalog</h2><p className="mt-2 text-sm text-muted-foreground">{product.materials.join(", ")}</p></div> : null}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-4 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden" aria-label="Selected option">
        <div className="min-w-0 flex-1"><p className="truncate text-xs text-muted-foreground">{selected?.label ?? "Choose an option"}</p><p className="font-medium">{formatMarketPrice(selected?.price ?? product.price, market.id)}</p></div>
        <Button aria-label="Add selected option to bag" disabled={!available || busy} onClick={() => void add()}>{busy ? "Adding…" : available ? "Add to bag" : "Unavailable"}</Button>
      </div>
    </section>
  );
}
