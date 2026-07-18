"use client";

import Image from "next/image";
import { Plus } from "lucide-react";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";
import { useCartMarket } from "@/modules/cart/components/cart-market-context";
import { addItem } from "@/modules/cart/lib/cart-store";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { formatPrice } from "@/shared/lib/money";

export function ProductCard({ product, locale }: { product: ProductListItem; locale: string }) {
  const market = useCartMarket();
  return (
    <article className="group">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-secondary">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
        />
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
          <h3 className="mt-1 font-medium">{product.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{product.colour}</p>
        </div>
        <div className="shrink-0 text-right text-sm">
          <p className="font-medium">{formatPrice(product.price, locale)}</p>
          {product.compareAt ? (
            <p className="mt-1 text-muted-foreground line-through">
              {formatPrice(product.compareAt, locale)}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
