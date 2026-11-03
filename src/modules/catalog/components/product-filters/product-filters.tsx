import Link from "next/link";
import { Button } from "@e-pig/happy-dog/components/button";

import {
  buildProductListHref,
  hasProductFilters,
  MAX_FILTER_PRICE,
  type ProductListFilters,
  type ProductListSort,
} from "@/modules/catalog/lib/plp-query";

type ProductFiltersProps = {
  marketId: string;
  handle: string;
  currency: string;
  availableColours: string[];
  filters?: ProductListFilters;
  sort?: ProductListSort;
  issues?: string[];
};

export function ProductFilters({ marketId, handle, currency, availableColours, filters = {}, sort, issues = [] }: ProductFiltersProps) {
  const selected = new Set(filters.colours?.map(colour => colour.toLowerCase()));
  const unknown = (filters.colours ?? []).filter(colour => !availableColours.some(value => value.toLowerCase() === colour.toLowerCase()));
  const colours = [...availableColours.map(colour => ({ colour, unknown: false })), ...unknown.map(colour => ({ colour, unknown: true }))];
  return (
    <details open={hasProductFilters(filters) || issues.length > 0} className="mb-8 rounded-lg border bg-card">
      <summary className="cursor-pointer px-5 py-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Filter products
      </summary>
      <form action={buildProductListHref(marketId, handle)} method="get" aria-label="Product filters" aria-describedby={issues.length ? "product-filter-errors" : undefined} className="space-y-5 border-t p-5">
        {sort ? <input type="hidden" name="sort" value={sort} /> : null}
        {issues.length ? <div role="alert" id="product-filter-errors" className="rounded-md border border-destructive p-3 text-sm">
          <p className="font-medium">Filters were not applied. Correct these values or clear the filters.</p>
          <ul className="mt-2 list-inside list-disc">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
        </div> : null}
        <div className="grid gap-6 md:grid-cols-2">
          <fieldset className="min-w-0">
            <legend className="mb-3 text-sm font-medium">Colours</legend>
            {colours.length ? <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-2 sm:grid-cols-2">
              {colours.map(({ colour, unknown: unavailable }) => <label key={colour} className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-secondary focus-within:ring-2 focus-within:ring-ring">
                <input type="checkbox" name="colour" value={colour} defaultChecked={selected.has(colour.toLowerCase())} className="size-4 shrink-0 accent-primary" />
                <span className="break-words">{colour}{unavailable ? " (unavailable)" : ""}</span>
              </label>)}
            </div> : <p className="text-sm text-muted-foreground">No colour options in this collection.</p>}
          </fieldset>
          <div className="space-y-5">
            <fieldset className="grid min-w-0 grid-cols-2 gap-3">
              <legend className="mb-3 text-sm font-medium">Price ({currency})</legend>
              {([{ name: "minPrice", label: "Minimum price", value: filters.minPrice }, { name: "maxPrice", label: "Maximum price", value: filters.maxPrice }] as const).map(field => <label key={field.name} className="min-w-0 text-sm">
                <span className="mb-2 block">{field.label} ({currency})</span>
                <input type="number" name={field.name} min={0} max={MAX_FILTER_PRICE} step="any" inputMode="decimal" defaultValue={field.value ?? ""} className="h-11 w-full min-w-0 rounded-md border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>)}
            </fieldset>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="inStock" value="true" defaultChecked={filters.inStockOnly ?? false} className="size-4 accent-primary" />
              Available options only
            </label>
            <p className="text-xs text-muted-foreground">Prices and availability are sandbox examples.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <Button type="submit">Apply filters</Button>
          <Link href={buildProductListHref(marketId, handle, { sort })} prefetch={false} className="text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Clear filters</Link>
        </div>
      </form>
    </details>
  );
}
