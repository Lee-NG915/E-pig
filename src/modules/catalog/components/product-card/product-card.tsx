"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";

import { withMarketPrefix } from "@/platform/config/market-path";

import { useCartMarket } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { addItem } from "@/modules/cart/lib/cart-store";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import { Badge } from "@e-pig/happy-dog/components/badge";
import { Button } from "@e-pig/happy-dog/components/button";

export function ProductCard({ product }: { product: ProductListItem }) {
  const market = useCartMarket();
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
            className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
          />
        </Link>
        {product.badge ? (
          <Badge variant="secondary" className="absolute left-3 top-3 bg-background/90 backdrop-blur">
            {product.badge}
          </Badge>
        ) : null}
        <Button
          size="icon"
          className="absolute bottom-3 right-3 rounded-full shadow-md transition-transform hover:scale-105"
          onClick={() => addItem(market, product)}
          aria-label={`Add ${product.name} to bag`}
        >
          <Plus aria-hidden="true" />
        </Button>
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
    </article>
  );
}
