import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { markets, isMarketId } from "@/platform/config/markets";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { CartPanel } from "@/modules/cart/components/cart-panel/cart-panel";

export const metadata = {
  title: "Your bag — E-pig",
  robots: { index: false, follow: false },
};
type Props = { params: Promise<{ market: string }> };
async function TransactionPage({ params }: Props) {
  await connection();
  const { market: marketId } = await params;
  if (!isMarketId(marketId)) notFound();
  const market = { id: marketId, currency: markets[marketId].currency };
  return (
    <>
      <CartSheetMount market={market}>
        <SiteHeader />
      </CartSheetMount>
      <main className="mx-auto min-h-[60vh] max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="mb-10 font-display text-4xl tracking-tight sm:text-5xl">
          Your bag
        </h1>
        <CartPanel market={market} />
      </main>
      <SiteFooter />
    </>
  );
}
export default function Page(props: Props) {
  return (
    <Suspense
      fallback={
        <main
          className="mx-auto min-h-screen max-w-6xl p-6 py-16"
          role="status"
        >
          Loading your bag…
        </main>
      }
    >
      <TransactionPage {...props} />
    </Suspense>
  );
}
