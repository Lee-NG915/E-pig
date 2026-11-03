import Link from "next/link";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";

import { withMarketPrefix } from "@/platform/config/market-path";
import { getMarket, isMarketId } from "@/platform/config/markets";

import { buildProductListHref, hasProductFilters, type ProductListSort, type ProductListFilters } from "@/modules/catalog/lib/plp-query";

import { PlpBreadcrumb } from "../plp-breadcrumb/plp-breadcrumb";
import { ProductFilters } from "../product-filters/product-filters";
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
  filters?: ProductListFilters;
  availableColours?: string[];
  filterIssues?: string[];
};

export function ProductList({
  products,
  collection,
  marketId,
  sort,
  relatedCollections = [],
  filters = {},
  availableColours = [],
  filterIssues = [],
}: ProductListProps) {
  const filtered = hasProductFilters(filters);
  const invalid = filterIssues.length > 0;
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
        {invalid ? <p className="text-sm text-muted-foreground">Correct filter values before sorting.</p> : <PlpSortNav marketId={marketId} handle={collection.handle} sort={sort} filters={filters} />}
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

      <ProductFilters
        key={JSON.stringify({ filters, sort, filterIssues })}
        marketId={marketId} handle={collection.handle}
        currency={isMarketId(marketId) ? getMarket(marketId).currency : ""}
        availableColours={availableColours} filters={filters} sort={sort} issues={filterIssues}
      />

      {products.length > 0 && !invalid ? (
        <ProductListGrid products={products} linkToDefaultVariant={filtered} />
      ) : (
        <div className="rounded-2xl border bg-secondary/30 px-5 py-24 text-center">
          <p className="font-display text-2xl tracking-[-0.02em]">{invalid ? "Check your filter values" : filtered ? "No products match these filters" : "This collection is empty"}</p>
          <p className="mt-2 text-muted-foreground">
            {invalid ? "Correct the values above, then apply the filters again." : filtered ? "Try another colour or price range, or clear the filters." : "Check back soon or browse the rest of the shop."}
          </p>
          <Link
            href={filtered || invalid ? buildProductListHref(marketId, collection.handle, { sort }) : withMarketPrefix(marketId, "/")}
            prefetch={false}
            className="mt-6 inline-block text-sm font-medium underline underline-offset-4 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {filtered || invalid ? "Clear all filters" : "Back to home"}
          </Link>
        </div>
      )}
    </div>
  );
}
