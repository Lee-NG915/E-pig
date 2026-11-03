import Link from "next/link";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";

import { withMarketPrefix } from "@/platform/config/market-path";

import type { ProductListSort } from "@/modules/catalog/lib/plp-query";

import { PlpBreadcrumb } from "../plp-breadcrumb/plp-breadcrumb";
import { PlpSortNav } from "./plp-sort-nav";
import { ProductListGrid } from "./product-list-grid";

export type RelatedCollectionLink = {
  title: string;
  href: string;
};

export type { ProductListSort };

type ProductListProps = {
  products: ProductListItem[];
  collection: { handle: string; title: string };
  marketId: string;
  sort?: ProductListSort;
  relatedCollections?: RelatedCollectionLink[];
};

export function ProductList({
  products,
  collection,
  marketId,
  sort,
  relatedCollections = [],
}: ProductListProps) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <PlpBreadcrumb marketId={marketId} collectionTitle={collection.title} />

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Collection</p>
          <h1 className="mt-2 font-display text-3xl tracking-[-0.03em] sm:text-4xl">
            {collection.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {products.length} {products.length === 1 ? "piece" : "pieces"}
          </p>
        </div>
        <PlpSortNav marketId={marketId} handle={collection.handle} sort={sort} />
      </div>

      {relatedCollections.length > 0 ? (
        <nav aria-label="Related collections" className="mb-10 flex flex-wrap gap-2">
          {relatedCollections.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.title}
            </Link>
          ))}
        </nav>
      ) : null}

      {products.length > 0 ? (
        <ProductListGrid products={products} />
      ) : (
        <div className="rounded-2xl border bg-secondary/30 py-24 text-center">
          <p className="font-display text-2xl tracking-[-0.02em]">This collection is empty</p>
          <p className="mt-2 text-muted-foreground">
            Check back soon or browse the rest of the shop.
          </p>
          <Link
            href={withMarketPrefix(marketId, "/")}
            prefetch={false}
            className="mt-6 inline-block text-sm font-medium underline underline-offset-4 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Back to home
          </Link>
        </div>
      )}
    </div>
  );
}
