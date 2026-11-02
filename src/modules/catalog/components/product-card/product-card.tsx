"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";

import { withMarketPrefix } from "@/platform/config/market-path";

import { useCartMarket } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { useCartActions } from "@/modules/cart/lib/cart-store";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import { Badge } from "@e-pig/happy-dog/components/badge";
import { Button } from "@e-pig/happy-dog/components/button";

export function ProductCard({ product }: { product: ProductListItem }) {
  const market = useCartMarket();
  const { addItem, pending, error } = useCartActions(market);
  const [failure, setFailure] = useState("");
  const [adding, setAdding] = useState(false);
  const busy = useRef(false);
  async function add() {
    if (!product.defaultVariantId || pending || busy.current) return;
    busy.current = true; setAdding(true); setFailure("");
    try { await addItem({ productId: product.id, variantId: product.defaultVariantId, quantity: 1 }); }
    catch (cause) { setFailure(cause instanceof Error ? cause.message : "Could not add item. Please try again."); }
    finally { busy.current = false; setAdding(false); }
  }
  const productHref = withMarketPrefix(market.id, `/products/${product.slug}`);

  return (
    <article className="group">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-secondary">
        <Link
          href={productHref}
          aria-label={product.name}
          className="relative block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src={product.image}
            alt={product.name}
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
        {product.variantCount === 1 && product.defaultVariantId ? <Button
          size="icon" disabled={pending || adding}
          className="absolute bottom-3 right-3 rounded-full"
          onClick={() => void add()}
          aria-label={pending || adding ? `Adding ${product.name}` : `Add ${product.name} to bag`}
        ><Plus aria-hidden="true" /></Button> : <Button asChild className="absolute bottom-3 right-3" size="sm"><Link href={productHref}>Choose options<span className="sr-only"> for {product.name}</span></Link></Button>}
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{product.category}</p>
          <h3 className="mt-1 font-medium">
            <Link
              href={productHref}
              className="hover:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{product.colour}</p>
        </div>
        <div className="shrink-0 text-right text-sm">
          <p className="font-medium">{formatMarketPrice(product.price, market.id)}</p>
          {product.compareAt ? (
            <p className="mt-1 text-muted-foreground line-through">
              {formatMarketPrice(product.compareAt, market.id)}
            </p>
          ) : null}
        </div>
      </div>
      {failure || error ? <p role="alert" className="mt-2 text-sm text-destructive">{failure || error}</p> : null}
    </article>
  );
}
