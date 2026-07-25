import { Suspense } from "react";

import { connection } from "next/server";
import { notFound } from "next/navigation";

import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { ProductList } from "@/modules/catalog/components/product-list/product-list";
import {
  findCollectionByHandle,
  parseProductListSort,
} from "@/modules/catalog/lib/plp-query";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { getCapabilities } from "@/platform/registry";

type CollectionPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string | string[] }>;
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

/**
 * request-time 边界：params/searchParams 与列表取数均在 Suspense 内完成。
 * ProductCard 需要 CartMarketProvider；CartSheet 已由 MarketChrome 单挂载，这里只提供 market context。
 */
async function CollectionProductList({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const { slug } = await params;
  const { sort: rawSort } = await searchParams;
  const sort = parseProductListSort(rawSort);

  await connection();
  const { catalog, market } = getCapabilities();

  const collections = await catalog.listCollections();
  const collection = findCollectionByHandle(collections, slug);
  if (!collection) {
    notFound();
  }

  const products = await catalog.listProducts({ collection: slug, sort });

  return (
    <CartMarketProvider
      market={{ id: market.id, currency: market.currency, locale: market.defaultLocale }}
    >
      <ProductList
        products={products}
        collection={collection}
        locale={market.defaultLocale}
        sort={sort}
      />
    </CartMarketProvider>
  );
}

function HeaderSkeleton() {
  return <div className="h-16 border-b bg-background" aria-hidden="true" />;
}

function ProductListSkeleton() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mb-8 h-10 max-w-sm animate-pulse rounded-2xl bg-secondary" />
      <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl bg-secondary" />
        ))}
      </div>
    </div>
  );
}

export default function CollectionPage({ params, searchParams }: CollectionPageProps) {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<HeaderSkeleton />}>
        <MarketChrome />
      </Suspense>
      <main>
        <Suspense fallback={<ProductListSkeleton />}>
          <CollectionProductList params={params} searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
