import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { markets, isMarketId } from "@/platform/config/markets";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { CheckoutStatus } from "@/modules/checkout/components/checkout-status/checkout-status";

export const metadata = {
  title: "Payment status — E-pig",
  robots: { index: false, follow: false },
};
type Props = {
  params: Promise<{ market: string }>;
  searchParams: Promise<{ checkoutId?: string | string[] }>;
};
async function TransactionPage({ params, searchParams }: Props) {
  await connection();
  const { market: marketId } = await params;
  if (!isMarketId(marketId)) notFound();
  const market = { id: marketId, currency: markets[marketId].currency };
  const { checkoutId } = await searchParams;
  return (
    <>
      <CartSheetMount market={market}>
        <SiteHeader />
      </CartSheetMount>
      <main className="mx-auto min-h-[60vh] max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="mb-10 font-display text-4xl tracking-tight sm:text-5xl">
          Payment status
        </h1>
        <CheckoutStatus
          market={market}
          checkoutId={typeof checkoutId === "string" ? checkoutId : undefined}
        />
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
          Loading payment status…
        </main>
      }
    >
      <TransactionPage {...props} />
    </Suspense>
  );
}
