"use client";

import Link from "next/link";

import { buildProductListHref, type ProductListFilters, type ProductListSort } from "@/modules/catalog/lib/plp-query";
import { track } from "@/shared/lib/track";

const SORT_OPTIONS: { value: ProductListSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

type PlpSortNavProps = {
  marketId: string;
  handle: string;
  sort?: ProductListSort;
  filters?: ProductListFilters;
};

export function PlpSortNav({ marketId, handle, sort, filters = {} }: PlpSortNavProps) {
  return (
    <nav aria-label="Sort products" className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">Sort by:</span>
      {SORT_OPTIONS.map((option) => {
        const href = buildProductListHref(marketId, handle, { ...filters, sort: option.value });
        const active = sort === option.value;
        return (
          <Link
            key={option.value}
            href={href}
            prefetch={false}
            className={`text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "font-medium text-foreground underline underline-offset-4"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-current={active ? "true" : undefined}
            onClick={() => track("plp_sort_change", { sort: option.value, handle })}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
