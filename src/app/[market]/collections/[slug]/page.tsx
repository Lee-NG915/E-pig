import { Suspense } from "react";

import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { ProductList } from "@/modules/catalog/components/product-list/product-list";
import {
  findCollectionByHandle,
  loadCollectionListing,
  parseProductListQuery,
  type ProductListSearchParams,
} from "@/modules/catalog/lib/plp-query";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { pickRelatedCollections } from "@/modules/content/lib/related-collections";
import { isMarketId } from "@/platform/config/markets";
import { withMarketPrefix } from "@/platform/config/market-path";
import { getCapabilities } from "@/platform/registry";
import {
  buildCanonicalUrl,
  buildCollectionJsonLd,
  buildPageMetadata,
  jsonLdScriptProps,
  siteName,
} from "@/platform/seo";

type CollectionPageProps = {
  params: Promise<{ market: string; slug: string }>;
  searchParams: Promise<ProductListSearchParams>;
};

export async function generateMetadata({
  params,
  searchParams,
}: CollectionPageProps): Promise<Metadata> {
  const { market: marketParam, slug } = await params;
  const query = parseProductListQuery(await searchParams);

  if (!isMarketId(marketParam)) {
    return buildPageMetadata({ title: siteName, noIndex: true });
  }

  await connection();
  const { catalog } = getCapabilities();
  const collections = await catalog.listCollections();
  const collection = findCollectionByHandle(collections, slug);

  if (!collection) {
    return buildPageMetadata({
      title: `Collection not found | ${siteName}`,
      noIndex: true,
    });
  }

  const path = withMarketPrefix(marketParam, `/collections/${slug}`);
  return buildPageMetadata({
    title: `${collection.title} | ${siteName}`,
    description: `Shop ${collection.title} — furniture for slower days.`,
    canonicalUrl: buildCanonicalUrl(marketParam, path),
    // 筛选、排序和无效查询均指向规范集合页，不单独索引。
    noIndex: Boolean(query.sort || query.hasFilters || query.issues.length),
  });
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

/**
 * request-time 边界：params/searchParams 与列表取数均在 Suspense 内完成。
 * ProductCard 需要 CartMarketProvider；CartSheet 已由 MarketChrome 单挂载，这里只提供 market context。
 */
async function CollectionProductList({
  params,
  searchParams,
}: {
  params: Promise<{ market: string; slug: string }>;
  searchParams: Promise<ProductListSearchParams>;
}) {
  const { slug } = await params;
  const rawQuery = await searchParams;

  await connection();
  const { catalog, market } = getCapabilities();

  const listing = await loadCollectionListing(catalog, slug, rawQuery);
  if (!listing) {
    notFound();
  }
  const { collections, collection, products, sort, filters, availableColours, issues } = listing;
  const relatedCollections = pickRelatedCollections(collections, slug, market.id);
  const canonicalPath = withMarketPrefix(market.id, `/collections/${slug}`);
  const jsonLd =
    isMarketId(market.id) &&
    buildCollectionJsonLd({
      name: collection.title,
      description: `Shop ${collection.title}`,
      url: buildCanonicalUrl(market.id, canonicalPath),
    });

  return (
    <CartMarketProvider
      market={{ id: market.id, currency: market.currency }}
    >
      {jsonLd ? <script {...jsonLdScriptProps(jsonLd)} /> : null}
      <ProductList
        products={products}
        collection={collection}
        marketId={market.id}
        sort={sort}
        filters={filters}
        availableColours={availableColours}
        filterIssues={issues}
        relatedCollections={relatedCollections}
      />
    </CartMarketProvider>
  );
}

function HeaderSkeleton() {
  return <div className="h-[6.25rem] border-b bg-background" aria-hidden="true" />;
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
