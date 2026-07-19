import { Suspense } from "react";

import { connection } from "next/server";
import { notFound } from "next/navigation";

import { CartSheet } from "@/modules/cart/components/cart-sheet/cart-sheet";
import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { ProductList, type ProductListSort } from "@/modules/catalog/components/product-list/product-list";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { getCapabilities } from "@/platform/registry";

const VALID_SORTS: ProductListSort[] = ["price-asc", "price-desc", "name"];

function isValidSort(value: string | undefined): value is ProductListSort {
  return VALID_SORTS.includes(value as ProductListSort);
}

type CollectionPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
};

/** request-time 边界：解析当前 market 并挂载站点 header + 购物车抽屉。 */
async function MarketHeader() {
  await connection();
  const { market } = getCapabilities();
  return (
    <CartMarketProvider market={{ id: market.id, currency: market.currency, locale: market.defaultLocale }}>
      <SiteHeader />
      <CartSheet />
    </CartMarketProvider>
  );
}

/** request-time 边界：按 collection handle 取列表并渲染 PLP。 */
async function CollectionProductList({ slug, sort }: { slug: string; sort?: ProductListSort }) {
  await connection();
  const { catalog, market } = getCapabilities();

  const collections = await catalog.listCollections();
  const collection = collections.find((c) => c.handle === slug);
  if (!collection) {
    notFound();
  }

  const products = await catalog.listProducts({ collection: slug, sort });

  return (
    <CartMarketProvider market={{ id: market.id, currency: market.currency, locale: market.defaultLocale }}>
      <ProductList products={products} collection={collection} locale={market.defaultLocale} sort={sort} />
      <CartSheet />
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

export default async function CollectionPage({ params, searchParams }: CollectionPageProps) {
  const { slug } = await params;
  const { sort: rawSort } = await searchParams;
  const sort = isValidSort(rawSort) ? rawSort : undefined;

  return (
    <div className="min-h-screen">
      <Suspense fallback={<HeaderSkeleton />}>
        <MarketHeader />
      </Suspense>
      <main>
        <Suspense fallback={<ProductListSkeleton />}>
          <CollectionProductList slug={slug} sort={sort} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
