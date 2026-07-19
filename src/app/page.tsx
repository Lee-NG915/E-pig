import { Suspense } from "react";

import Link from "next/link";
import { connection } from "next/server";

import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { ProductCard } from "@/modules/catalog/components/product-card/product-card";
import { HomeBenefits } from "@/modules/content/components/home-benefits/home-benefits";
import { HomeEditorial } from "@/modules/content/components/home-editorial/home-editorial";
import { HomeHero } from "@/modules/content/components/home-hero/home-hero";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { getCapabilities } from "@/platform/registry";
import { Badge } from "@e-pig/happy-dog/components/badge";

// Home 页定域（docs/engineering/page-workflow-guide.md §8 Home）：
// 主域 catalog（选品栅格）；协作域 content（站点壳与营销区块）、cart（market context + sheet 挂载）。
// app 只做路由编排：request-time market 边界 + Suspense + 组合 modules 组件。
//
// Cache Components 渲染模型（docs/codex/research/07 §2）：
// RootLayout 只输出当前 markets 共有的 base language `en`；region-specific
// market/locale/currency 在下面的 request-time Suspense boundaries 中解析。
// 价格/cart 不缓存（AGENTS.md Hard Rules），故取数均在 request-time 边界内。

/** request-time 区域：读取当前进程 MARKET，经 registry 取 mock adapter 数据。 */
async function MarketProductGrid() {
  await connection();
  const { catalog, market } = getCapabilities();
  const [productList, collections] = await Promise.all([
    catalog.listProducts(),
    catalog.listCollections(),
  ]);
  const firstCollection = collections[0];

  return (
    <CartMarketProvider
      market={{ id: market.id, currency: market.currency, locale: market.defaultLocale }}
    >
      <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            The essentials
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight tracking-[-0.03em] sm:text-5xl">
            Good pieces make everyday life feel lighter.
          </h2>
          {firstCollection ? (
            <Link
              href={`/collections/${firstCollection.handle}`}
              className="mt-4 inline-block text-sm font-medium underline underline-offset-4 transition-colors hover:text-muted-foreground"
            >
              Shop {firstCollection.title}
            </Link>
          ) : null}
        </div>
        <Badge variant="outline" className="w-fit">
          {market.name} · {market.currency}
        </Badge>
      </div>
      <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {productList.map((product) => (
          <ProductCard key={product.id} product={product} locale={market.defaultLocale} />
        ))}
      </div>
    </CartMarketProvider>
  );
}

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

function HeaderSkeleton() {
  return <div className="h-16 border-b bg-background" aria-hidden="true" />;
}

function ProductGridSkeleton() {
  return (
    <>
      <div className="mb-10 h-16 max-w-xl animate-pulse rounded-2xl bg-secondary" />
      <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl bg-secondary" />
        ))}
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden">
      <Suspense fallback={<HeaderSkeleton />}>
        <MarketChrome />
      </Suspense>
      <main>
        <HomeHero />
        <section
          className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
          id="collection"
        >
          <Suspense fallback={<ProductGridSkeleton />}>
            <MarketProductGrid />
          </Suspense>
        </section>
        <HomeBenefits />
        <HomeEditorial />
      </main>
      <SiteFooter />
    </div>
  );
}
