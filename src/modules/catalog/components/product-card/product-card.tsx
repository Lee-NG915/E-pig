"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";

import { withMarketPrefix } from "@/platform/config/market-path";

import { useCartMarket } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { setCartOpen, useCartActions } from "@/modules/cart/lib/cart-store";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import { Badge } from "@e-pig/happy-dog/components/badge";
import { Button } from "@e-pig/happy-dog/components/button";
import { AddToComparison } from "../add-to-comparison/add-to-comparison";

export function ProductCard({ product, linkToDefaultVariant = false }: { product: ProductListItem; linkToDefaultVariant?: boolean }) {
  const market = useCartMarket();
  const { addItem, pending, error, recovery } = useCartActions(market);
  const recovering = recovery !== "idle";
  const [adding, setAdding] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string>();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const colourGroupId = useId();
  const previews = product.variantPreviews ?? [];
  const selectedPreview = previews.find((preview) => preview.variantId === selectedVariantId);
  const colour = selectedPreview?.colour ?? product.colour;
  const price = selectedPreview?.price ?? product.price;
  const image = selectedPreview?.image ?? product.image;
  const gallery = [
    { src: image, alt: selectedPreview ? `${product.name} — ${colour}` : product.name },
    ...(selectedPreview?.gallery ?? product.gallery ?? []),
  ].filter((item, index, all) => all.findIndex((other) => other.src === item.src) === index);
  const activeImage = gallery[activeImageIndex] ?? gallery[0];
  const busy = useRef(false);
  async function add() {
    if (!product.defaultVariantId || pending || recovering || busy.current) return;
    busy.current = true; setAdding(true);
    try { await addItem({ productId: product.id, variantId: product.defaultVariantId, quantity: 1 }); }
    catch { /* The cart store owns the current error and saved-update recovery. */ }
    finally { busy.current = false; setAdding(false); }
  }
  const productPath = withMarketPrefix(market.id, `/products/${product.slug}`);
  const linkedVariantId = selectedPreview?.variantId ?? (linkToDefaultVariant ? product.defaultVariantId : undefined);
  const productHref = linkedVariantId
    ? `${productPath}?variant=${encodeURIComponent(linkedVariantId)}`
    : productPath;

  return (
    <article className="group min-w-0">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-secondary">
        <Link
          href={productHref}
          aria-label={product.name}
          className="relative block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src={activeImage.src}
            alt={activeImage.alt}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.025] motion-reduce:transition-none"
          />
        </Link>
        {product.badge ? (
          <Badge variant="secondary" className="absolute left-3 top-3 bg-background/90 backdrop-blur">
            {product.badge}
          </Badge>
        ) : null}
        {gallery.length > 1 ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={`Previous image for ${product.name}`}
              disabled={activeImageIndex === 0}
              onClick={() => setActiveImageIndex((index) => Math.max(0, index - 1))}
              className="absolute left-2 top-1/2 size-11 -translate-y-1/2 rounded-full bg-background/90"
            ><ChevronLeft aria-hidden="true" /></Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={`Next image for ${product.name}`}
              disabled={activeImageIndex >= gallery.length - 1}
              onClick={() => setActiveImageIndex((index) => Math.min(gallery.length - 1, index + 1))}
              className="absolute right-2 top-1/2 size-11 -translate-y-1/2 rounded-full bg-background/90"
            ><ChevronRight aria-hidden="true" /></Button>
            <span role="status" className="sr-only">Image {activeImageIndex + 1} of {gallery.length}</span>
          </>
        ) : null}
        {product.variantCount === 1 && previews.length < 2 && product.defaultVariantId ? <Button
          size="icon" disabled={pending || adding || recovering}
          className="absolute bottom-3 right-3 rounded-full"
          onClick={() => void add()}
          aria-label={pending || adding ? `Adding ${product.name}` : `Add ${product.name} to bag`}
        ><Plus aria-hidden="true" /></Button> : <Button asChild className="absolute bottom-3 right-3" size="sm"><Link href={productHref}>Choose options<span className="sr-only"> for {product.name}</span></Link></Button>}
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{product.category}</p>
          <h3 className="mt-1 font-medium">
            <Link
              href={productHref}
              className="hover:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{colour}</p>
        </div>
        <div className="shrink-0 text-sm sm:text-right">
          <p className="font-medium">{formatMarketPrice(price, market.id)}</p>
          {product.compareAt && !selectedPreview ? (
            <p className="mt-1 text-muted-foreground line-through">
              {formatMarketPrice(product.compareAt, market.id)}
            </p>
          ) : null}
        </div>
      </div>
      {previews.length > 1 ? (
        <fieldset className="mt-3">
          <legend className="sr-only">Colour for {product.name}</legend>
          <div className="flex flex-wrap gap-2">
            {previews.map((preview) => {
              const checked = preview.variantId === (selectedVariantId ?? product.defaultVariantId);
              return (
                <label
                  key={preview.variantId}
                  title={preview.colour}
                  className={`relative block size-11 cursor-pointer overflow-hidden rounded-md border-2 bg-secondary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${checked ? "border-primary" : "border-transparent hover:border-muted-foreground"}`}
                >
                  <input
                    type="radio"
                    name={colourGroupId}
                    value={preview.variantId}
                    checked={checked}
                    onChange={() => {
                      setSelectedVariantId(preview.variantId);
                      setActiveImageIndex(0);
                    }}
                    className="sr-only"
                  />
                  <span className="sr-only">{preview.colour}</span>
                  <Image src={preview.image} alt="" fill sizes="44px" className="object-cover" />
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <AddToComparison marketId={market.id} item={{ productId: product.id, variantId: selectedPreview?.variantId ?? product.defaultVariantId }} productName={product.name} className="mt-3 min-h-11 -ml-3" />
      {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
      {recovering ? <Button variant="outline" className="mt-2 h-auto min-h-11 w-full whitespace-normal" onClick={() => setCartOpen(market, true)}>Open bag to check saved update</Button> : null}
    </article>
  );
}
