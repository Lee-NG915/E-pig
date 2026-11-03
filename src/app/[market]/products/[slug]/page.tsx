import { Suspense } from "react";

import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { isAppError } from "@/core/errors/errors";
import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { ProductDetail } from "@/modules/catalog/components/product-detail/product-detail";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { isMarketId } from "@/platform/config/markets";
import { withMarketPrefix } from "@/platform/config/market-path";
import { getCapabilities } from "@/platform/registry";
import {
  buildCanonicalUrl,
  buildPageMetadata,
  buildProductJsonLd,
  jsonLdScriptProps,
  siteName,
} from "@/platform/seo";

type ProductPageProps = {
  params: Promise<{ market: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { market: marketParam, slug } = await params;
  if (!isMarketId(marketParam)) {
    return buildPageMetadata({ title: siteName, noIndex: true });
  }

  await connection();
  const { catalog } = getCapabilities();
  try {
    const product = await catalog.getProduct(slug);
    return buildPageMetadata({
      title: `${product.name} | ${siteName}`,
      description: product.description,
      canonicalUrl: buildCanonicalUrl(
        marketParam,
        withMarketPrefix(marketParam, `/products/${product.slug}`),
      ),
    });
  } catch (error) {
    if (isAppError(error) && error.kind === "not_found") {
      return buildPageMetadata({ title: `Product not found | ${siteName}`, noIndex: true });
    }
    throw error;
  }
}

/** request-time 边界：解析当前 market 并挂载站点 header + 单一购物车抽屉。 */
async function MarketChrome() {
  await connection();
  const { market } = getCapabilities();
  return (
    <CartSheetMount
      market={{ id: market.id, currency: market.currency }}
    >
      <SiteHeader />
    </CartSheetMount>
  );
}

/** request-time PDP 数据边界：params 与商品数据在 Suspense 内解析。 */
async function ProductDetailSection({
  params,
  searchParams,
}: ProductPageProps) {
  const { slug } = await params;
  const { variant } = await searchParams;

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

  const jsonLd = isMarketId(market.id)
    ? buildProductJsonLd({
        name: product.name,
        description: product.description,
        imageUrl: product.gallery[0]?.src ?? product.image,
        sku: product.id,
        url: buildCanonicalUrl(
          market.id,
          withMarketPrefix(market.id, `/products/${product.slug}`),
        ),
      })
    : null;

  let bundleCompanion;
  if (product.bundleCompanionId) {
    try { bundleCompanion = await catalog.getProduct(product.bundleCompanionId); }
    catch (error) { if (!isAppError(error) || error.kind !== "not_found") throw error; }
  }

  return (
    <CartMarketProvider market={{ id: market.id, currency: market.currency }}>
      {jsonLd ? <script {...jsonLdScriptProps(jsonLd)} /> : null}
      <ProductDetail key={`${product.id}:${JSON.stringify(variant)}`} product={product} initialVariantId={variant} bundleCompanion={bundleCompanion} />
    </CartMarketProvider>
  );
}

function HeaderSkeleton() {
  return <div className="h-16 border-b bg-background" aria-hidden="true" />;
}

function ProductSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1050px] flex-col gap-8 px-4 py-12 lg:flex-row">
      <div className="h-[394px] w-full animate-pulse rounded-[5px] bg-secondary lg:h-[550px] lg:w-[510px]" />
      <div className="h-[471px] w-full animate-pulse rounded-[5px] bg-secondary lg:w-[510px]" />
    </div>
  );
}

export default function ProductPage({ params, searchParams }: ProductPageProps) {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<HeaderSkeleton />}>
        <MarketChrome />
      </Suspense>
      <main>
        <Suspense fallback={<ProductSkeleton />}>
          <ProductDetailSection params={params} searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
