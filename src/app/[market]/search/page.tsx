import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { ProductSearch } from "@/modules/catalog/components/product-search/product-search";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { isMarketId } from "@/platform/config/markets";
import { getCapabilities } from "@/platform/registry";
import type { ProductListItem } from "@/core/contracts/commerce/catalog";
type Props = { params: Promise<{ market: string }>; searchParams: Promise<{ q?: string | string[] }> };
async function Chrome() { await connection(); const { market } = getCapabilities(); return <CartSheetMount market={market}><SiteHeader /></CartSheetMount>; }
async function Results({ params, searchParams }: Props) {
  const [{ market: marketId }, values] = await Promise.all([params, searchParams]);
  await connection(); const { market, catalog } = getCapabilities();
  if (!isMarketId(marketId) || marketId !== market.id) notFound();
  const query = (typeof values.q === "string" ? values.q : "").trim().slice(0, 100);
  let products: ProductListItem[] = []; let failed = false;
  if (query) { try { products = await catalog.suggest(query); } catch { failed = true; } }
  return <CartMarketProvider market={market}><ProductSearch marketId={market.id} query={query} products={products} failed={failed} /></CartMarketProvider>;
}
export default function SearchPage(props: Props) { return <div className="min-h-screen"><Suspense fallback={<div className="h-24 border-b" />}><Chrome /></Suspense><main><Suspense fallback={<p className="p-8" role="status">Loading search…</p>}><Results {...props} /></Suspense></main><SiteFooter /></div>; }
