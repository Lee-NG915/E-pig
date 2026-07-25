import { Suspense } from "react";

import { connection } from "next/server";
import { notFound } from "next/navigation";

import { isAppError } from "@/core/errors/errors";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { getCapabilities } from "@/platform/registry";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

/** request-time 边界：解析当前 market 并挂载站点 header + 单一购物车抽屉。 */
async function MarketChrome() {
  await connection();
  const { market } = getCapabilities();
  return (
    <CartSheetMount
      market={{ id: market.id, currency: market.currency, locale: market.defaultLocale }}
    >
      <SiteHeader />
    </CartSheetMount>
  );
}

/** PDP 占位：params 在 Suspense 内解析。mock 阶段 slug === id。 */
async function ProductDetailStub({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

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

export default function ProductPage({ params }: ProductPageProps) {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<HeaderSkeleton />}>
        <MarketChrome />
      </Suspense>
      <main>
        <Suspense fallback={<ProductSkeleton />}>
          <ProductDetailStub params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
