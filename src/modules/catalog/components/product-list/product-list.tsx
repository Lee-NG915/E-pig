import Link from "next/link";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";

import { withMarketPrefix } from "@/platform/config/market-path";

import type { ProductListSort } from "@/modules/catalog/lib/plp-query";

import { ProductCard } from "../product-card/product-card";

export type { ProductListSort };

type ProductListProps = {
  products: ProductListItem[];
  collection: { handle: string; title: string };
  marketId: string;
  sort?: ProductListSort;
};

const SORT_OPTIONS: { value: ProductListSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

function sortHref(marketId: string, handle: string, value: ProductListSort): string {
  return `${withMarketPrefix(marketId, `/collections/${handle}`)}?sort=${value}`;
}

function SortLink({
  marketId,
  handle,
  option,
  active,
}: {
  marketId: string;
  handle: string;
  option: (typeof SORT_OPTIONS)[number];
  active: boolean;
}) {
  return (
    <Link
      href={sortHref(marketId, handle, option.value)}
      className={`text-sm transition-colors ${
        active
          ? "font-medium text-foreground underline underline-offset-4"
          : "text-muted-foreground hover:text-foreground"
      }`}
      aria-current={active ? "true" : undefined}
    >
      {option.label}
    </Link>
  );
}

export function ProductList({ products, collection, marketId, sort }: ProductListProps) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
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
        <nav aria-label="Sort products" className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          {SORT_OPTIONS.map((option) => (
            <SortLink
              key={option.value}
              marketId={marketId}
              handle={collection.handle}
              option={option}
              active={sort === option.value}
            />
          ))}
        </nav>
      </div>

      {products.length > 0 ? (
        <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border bg-secondary/30 py-24 text-center">
          <p className="font-display text-2xl tracking-[-0.02em]">This collection is empty</p>
          <p className="mt-2 text-muted-foreground">
            Check back soon or browse the rest of the shop.
          </p>
          <Link
            href={withMarketPrefix(marketId, "/")}
            className="mt-6 inline-block text-sm font-medium underline underline-offset-4 transition-colors hover:text-muted-foreground"
          >
            Back to home
          </Link>
        </div>
      )}
    </div>
  );
}
