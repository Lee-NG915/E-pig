import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isMarketId } from "@/platform/config/markets";
import { getCapabilities } from "@/platform/registry";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { ProductComparison } from "@/modules/catalog/components/product-comparison/product-comparison";
import { loadComparison } from "@/modules/catalog/lib/compare-data";
import { parseCompareSearchParams } from "@/modules/catalog/lib/compare-query";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";

export const metadata = {
  title: "Compare your options — E-pig",
  robots: { index: false, follow: false },
};
type Props = {
  params: Promise<{ market: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function ComparisonPage({ params, searchParams }: Props) {
  await connection();
  const [{ market: marketId }, query] = await Promise.all([params, searchParams]);
  if (!isMarketId(marketId)) notFound();
  const { catalog, market } = getCapabilities();
  const [products, comparison] = await Promise.all([
    catalog.listProducts({ sort: "name" }),
    loadComparison(catalog, parseCompareSearchParams(query)),
  ]);
  return (
    <>
      <CartSheetMount market={{ id: market.id, currency: market.currency }}><SiteHeader /></CartSheetMount>
      <main><ProductComparison marketId={market.id} products={products} {...comparison} /></main>
      <SiteFooter />
    </>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<main role="status" className="mx-auto min-h-screen max-w-6xl px-4 py-16">Loading comparison…</main>}><ComparisonPage {...props} /></Suspense>;
}
