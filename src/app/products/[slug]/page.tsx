import { Suspense } from "react";

import { connection } from "next/server";
import { notFound } from "next/navigation";

import { isAppError } from "@/core/errors/errors";
import { CartSheet } from "@/modules/cart/components/cart-sheet/cart-sheet";
import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { getCapabilities } from "@/platform/registry";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

/** request-time 边界：解析当前 market 并挂载站点 header + 购物车抽屉。 */
async function MarketHeader() {
  await connection();
  const { market } = getCapabilities();
  return (
    <CartMarketProvider
      market={{ id: market.id, currency: market.currency, locale: market.defaultLocale }}
    >
      <SiteHeader />
      <CartSheet />
    </CartMarketProvider>
  );
}

/** PDP 占位：展示商品名并标明完整页将在 M2.2 实现。 */
async function ProductDetailStub({ slug }: { slug: string }) {
  await connection();
  const { catalog, market } = getCapabilities();

  let product;
  try {
    product = await catalog.getProduct(slug);
  } catch (error) {
    if (isAppError(error) && error.kind === "not_found") {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 lg:px-8">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Product</p>
      <h1 className="mt-3 font-display text-4xl tracking-[-0.03em] sm:text-5xl">{product.name}</h1>
      <p className="mt-6 max-w-xl text-muted-foreground">
        Full product details, gallery and variant selection are coming in M2.2.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {market.name} · {market.currency}
      </p>
    </div>
  );
}

function HeaderSkeleton() {
  return <div className="h-16 border-b bg-background" aria-hidden="true" />;
}

function ProductSkeleton() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 lg:px-8">
      <div className="h-6 max-w-xs animate-pulse rounded-2xl bg-secondary" />
      <div className="mt-4 h-12 max-w-lg animate-pulse rounded-2xl bg-secondary" />
      <div className="mt-6 h-24 max-w-xl animate-pulse rounded-2xl bg-secondary" />
    </div>
  );
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  return (
    <div className="min-h-screen">
      <Suspense fallback={<HeaderSkeleton />}>
        <MarketHeader />
      </Suspense>
      <main>
        <Suspense fallback={<ProductSkeleton />}>
          <ProductDetailStub slug={slug} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
