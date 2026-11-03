"use client";

import { useState } from "react";
import { Columns2, RectangleVertical } from "lucide-react";
import { Button } from "@e-pig/happy-dog/components/button";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";

import { ProductCard } from "../product-card/product-card";

/** Client island for display density; collection and sort remain server composed. */
export function ProductListGrid({ products, linkToDefaultVariant = false }: { products: ProductListItem[]; linkToDefaultVariant?: boolean }) {
  const [columns, setColumns] = useState<1 | 2>(2);

  return (
    <>
      <div role="group" aria-label="Mobile product layout" className="mb-5 flex items-center justify-end gap-2 sm:hidden">
        <span className="mr-1 text-sm text-muted-foreground">View</span>
        <Button
          type="button"
          size="icon"
          variant={columns === 2 ? "secondary" : "ghost"}
          aria-label="Show 2 products per row"
          aria-pressed={columns === 2}
          onClick={() => setColumns(2)}
          className="size-11"
        ><Columns2 aria-hidden="true" /></Button>
        <Button
          type="button"
          size="icon"
          variant={columns === 1 ? "secondary" : "ghost"}
          aria-label="Show 1 product per row"
          aria-pressed={columns === 1}
          onClick={() => setColumns(1)}
          className="size-11"
        ><RectangleVertical aria-hidden="true" /></Button>
      </div>
      <div className={`grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 ${columns === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {products.map((product) => <ProductCard
          key={`${product.id}:${product.defaultVariantId}:${product.variantPreviews?.map(preview => preview.variantId).join(",")}:${linkToDefaultVariant}`}
          product={product} linkToDefaultVariant={linkToDefaultVariant}
        />)}
      </div>
    </>
  );
}
