import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getMarket, isMarketId } from "@/platform/config/markets";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { ProductComparison } from "@/modules/catalog/components/product-comparison/product-comparison";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";

export const metadata = {
  title: "Compare your options — E-pig",
  robots: { index: false, follow: false },
};
type Props = {
  params: Promise<{ market: string }>;
};

async function ComparisonPage({ params }: Props) {
  await connection();
  const { market: marketId } = await params;
  if (!isMarketId(marketId)) notFound();
  const market = getMarket(marketId);
  return (
    <>
      <CartSheetMount market={{ id: market.id, currency: market.currency }}><SiteHeader /></CartSheetMount>
      <main><ProductComparison marketId={market.id} /></main>
      <SiteFooter />
    </>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<main role="status" className="mx-auto min-h-screen max-w-6xl px-4 py-16">Loading comparison…</main>}><ComparisonPage {...props} /></Suspense>;
}
