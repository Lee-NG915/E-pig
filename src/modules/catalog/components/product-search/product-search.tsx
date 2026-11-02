import type { ProductListItem } from "@/core/contracts/commerce/catalog";
import { withMarketPrefix } from "@/platform/config/market-path";
import { Button } from "@e-pig/happy-dog/components/button";
import { ProductCard } from "../product-card/product-card";
export function ProductSearch({ marketId, query, products, failed = false }: { marketId: string; query: string; products: ProductListItem[]; failed?: boolean }) {
  return <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
    <h1 className="font-display text-4xl">Search products</h1>
    <form action={withMarketPrefix(marketId, "/search")} method="get" role="search" className="mt-6 flex max-w-xl flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><label htmlFor="product-query" className="mb-2 block text-sm font-medium">Product name or category</label><input id="product-query" name="q" type="search" maxLength={100} defaultValue={query} className="w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div><Button type="submit">Search</Button>
    </form>
    {failed ? <p role="alert" className="mt-8 text-destructive">Search is unavailable right now. Please try again.</p> : !query ? <p className="mt-8 text-muted-foreground">Enter a product name or category to explore the catalog.</p> : <><p role="status" className="mt-8 text-muted-foreground">{products.length ? `${products.length} results for “${query}”` : `No products found for “${query}”. Try another name or category.`}</p><div className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{products.map(product => <ProductCard key={product.id} product={product} />)}</div></>}
  </section>;
}
