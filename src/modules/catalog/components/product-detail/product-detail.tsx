"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@e-pig/happy-dog/components/button";
import type { ProductDetail as ProductDetailData } from "@/core/contracts/commerce/catalog";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import { useCartMarket } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { useCartActions } from "@/modules/cart/lib/cart-store";

export function ProductDetail({ product }: { product: ProductDetailData }) {
  const market = useCartMarket();
  const { addItem, pending, error } = useCartActions(market);
  const [selectedId, setSelectedId] = useState(product.variants[0]?.id);
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const selected = product.variants.find(variant => variant.id === selectedId) ?? product.variants[0];
  const available = selected?.availability === "in-stock" && selected.maxQuantity > 0;
  const gallery = product.gallery.length ? product.gallery.filter((image, index, all) => all.findIndex(other => other.src === image.src) === index) : [{ src: product.image, alt: product.name }];
  const activeImage = gallery[activeIndex] ?? gallery[0];
  const image = activeIndex === 0 && selected ? { src: selected.image, alt: `${product.name} — ${selected.label}` } : activeImage;
  async function add() {
    if (!selected || !available || pending || submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true); setFailure(""); setFeedback("");
    try { await addItem({ productId: product.id, variantId: selected.id, quantity: 1 }); setFeedback(`${selected.label} added to your bag.`); }
    catch (cause) { setFailure(cause instanceof Error ? cause.message : "Could not add this item. Please try again."); }
    finally { submittingRef.current = false; setSubmitting(false); }
  }
  return (
    <section className="bg-background" aria-labelledby="product-detail-title">
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
          <fieldset className="mt-8" disabled={pending || submitting}>
            <legend className="mb-3 font-medium">Choose an option</legend>
            <div className="flex flex-wrap gap-3">{product.variants.map(variant => <label key={variant.id} className={`cursor-pointer rounded-md border px-4 py-3 text-sm focus-within:ring-2 focus-within:ring-ring ${selected?.id === variant.id ? "border-primary bg-primary/10" : "border-border"}`}>
              <input type="radio" name={`variant-${product.id}`} className="sr-only" value={variant.id} checked={selected?.id === variant.id} aria-checked={selected?.id === variant.id} onChange={() => { setSelectedId(variant.id); setActiveIndex(0); setFeedback(""); setFailure(""); }} />{variant.label}
            </label>)}</div>
          </fieldset>
          <Button className="mt-6 w-full sm:w-auto" size="lg" disabled={!available || pending || submitting} onClick={() => void add()}>{pending || submitting ? "Adding…" : available ? "Add to bag" : "Unavailable for sandbox checkout"}</Button>
          {failure || error ? <p role="alert" className="mt-3 text-sm text-destructive">{failure || error}</p> : null}
          {feedback ? <p role="status" className="mt-3 text-sm">{feedback}</p> : null}
          <p className="mt-6 text-sm leading-6 text-muted-foreground">Sandbox store. Test options and prices are for checkout testing. No real payment, stock reservation or delivery.</p>
          {product.materials.length ? <div className="mt-8 border-t pt-6"><h2 className="font-medium">Materials in the catalog</h2><p className="mt-2 text-sm text-muted-foreground">{product.materials.join(", ")}</p></div> : null}
        </div>
      </div>
    </section>
  );
}
