import { Suspense } from "react";

import { connection } from "next/server";
import { notFound } from "next/navigation";

import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { ProductList } from "@/modules/catalog/components/product-list/product-list";
import {
  findCollectionByHandle,
  parseProductListSort,
  type ProductListSort,
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

/** request-time 边界：按 collection handle 取列表并渲染 PLP（价格不进共享 cache）。 */
async function CollectionProductList({ slug, sort }: { slug: string; sort?: ProductListSort }) {
  await connection();
  const { catalog, market } = getCapabilities();

  const collections = await catalog.listCollections();
  const collection = findCollectionByHandle(collections, slug);
  if (!collection) {
    notFound();
  }

  const products = await catalog.listProducts({ collection: slug, sort });

  return (
    <ProductList
      products={products}
      collection={collection}
      locale={market.defaultLocale}
      sort={sort}
    />
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
  const sort = parseProductListSort(rawSort);

  return (
    <div className="min-h-screen">
      <Suspense fallback={<HeaderSkeleton />}>
        <MarketChrome />
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
