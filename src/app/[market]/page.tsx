import { Suspense } from "react";

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { ProductCard } from "@/modules/catalog/components/product-card/product-card";
import { pickHomeCollectionLink } from "@/modules/catalog/lib/plp-query";
import { HomeBenefits } from "@/modules/content/components/home-benefits/home-benefits";
import { HomeCategories } from "@/modules/content/components/home-categories/home-categories";
import { HomeEditorial } from "@/modules/content/components/home-editorial/home-editorial";
import { HomeHero } from "@/modules/content/components/home-hero/home-hero";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { isMarketId } from "@/platform/config/markets";
import { withMarketPrefix } from "@/platform/config/market-path";
import { getCapabilities } from "@/platform/registry";
import {
  buildCanonicalUrl,
  buildPageMetadata,
  buildWebSiteJsonLd,
  jsonLdScriptProps,
  siteName,
} from "@/platform/seo";
import { Badge } from "@e-pig/happy-dog/components/badge";

// Home 页定域（docs/engineering/page-workflow-guide.md §8 Home）：
// 主域 catalog（选品栅格）；协作域 content（站点壳与营销区块）、cart（market context + sheet 挂载）。
// app 只做路由编排：request-time market 边界 + Suspense + 组合 modules 组件。

type HomePageProps = {
  params: Promise<{ market: string }>;
};

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { market: marketParam } = await params;
  if (!isMarketId(marketParam)) {
    return buildPageMetadata({ title: siteName, noIndex: true });
  }
  const path = withMarketPrefix(marketParam, "/");
  return buildPageMetadata({
    title: `${siteName} — Furniture for slower days`,
    description:
      "Modular sofas, calm bedrooms and outdoor pieces made for real living — not showrooms.",
    canonicalUrl: buildCanonicalUrl(marketParam, path),
  });
}

/** request-time 区域：读取当前进程 MARKET，经 registry 取 mock adapter 数据。 */
async function MarketProductGrid() {
  await connection();
  const { catalog, market } = getCapabilities();
  const [productList, collections] = await Promise.all([
    catalog.listProducts(),
    catalog.listCollections(),
  ]);
  const homeCollectionLink = pickHomeCollectionLink(collections, market.id);

  return (
    <CartMarketProvider
      market={{ id: market.id, currency: market.currency }}
    >
      <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            The essentials
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight tracking-[-0.03em] sm:text-5xl">
            Good pieces make everyday life feel lighter.
          </h2>
          {homeCollectionLink ? (
            <Link
              href={homeCollectionLink.href}
              prefetch={false}
              className="mt-4 inline-block text-sm font-medium underline underline-offset-4 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Shop {homeCollectionLink.title}
            </Link>
          ) : null}
        </div>
        <Badge variant="outline" className="w-fit">
          {market.name} · {market.currency}
        </Badge>
      </div>
      <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {productList.map((product) => (
          <ProductCard key={product.id} product={product} />
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
      market={{ id: market.id, currency: market.currency }}
    >
      <SiteHeader />
    </CartSheetMount>
  );
}

async function HomeCategoriesSection() {
  await connection();
  const { market } = getCapabilities();
  return <HomeCategories marketId={market.id} />;
}

async function HomeHeroSection() {
  await connection();
  const { market } = getCapabilities();
  return <HomeHero marketId={market.id} />;
}

async function HomeJsonLd() {
  await connection();
  const { market } = getCapabilities();
  if (!isMarketId(market.id)) return null;
  const url = buildCanonicalUrl(market.id, withMarketPrefix(market.id, "/"));
  const data = buildWebSiteJsonLd({
    name: siteName,
    url,
    description: "Furniture for slower days.",
  });
  return <script {...jsonLdScriptProps(data)} />;
}

function HeaderSkeleton() {
  return <div className="h-[6.25rem] border-b bg-background" aria-hidden="true" />;
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

function HeroSkeleton() {
  return <div className="min-h-[min(88vh,720px)] w-full animate-pulse bg-secondary" aria-hidden="true" />;
}

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden">
      <Suspense fallback={null}>
        <HomeJsonLd />
      </Suspense>
      <Suspense fallback={<HeaderSkeleton />}>
        <MarketChrome />
      </Suspense>
      <main>
        <Suspense fallback={<HeroSkeleton />}>
          <HomeHeroSection />
        </Suspense>
        <Suspense
          fallback={
            <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6 lg:px-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-secondary" />
                ))}
              </div>
            </div>
          }
        >
          <HomeCategoriesSection />
        </Suspense>
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
