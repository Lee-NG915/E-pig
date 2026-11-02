import { Suspense } from "react";

import type { Metadata } from "next";
import { connection } from "next/server";

import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { BlogList } from "@/modules/content/components/blog-list/blog-list";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { blogPosts } from "@/modules/content/lib/blog-posts";
import { isMarketId } from "@/platform/config/markets";
import { withMarketPrefix } from "@/platform/config/market-path";
import { getCapabilities } from "@/platform/registry";
import { buildCanonicalUrl, buildPageMetadata, siteName } from "@/platform/seo";

type BlogPageProps = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: BlogPageProps): Promise<Metadata> {
  const { market: marketParam } = await params;
  if (!isMarketId(marketParam)) return buildPageMetadata({ title: siteName, noIndex: true });

  const path = withMarketPrefix(marketParam, "/blog");
  return buildPageMetadata({
    title: `Blog | ${siteName}`,
    description: "Ideas, stories and practical notes for slower days at home.",
    canonicalUrl: buildCanonicalUrl(marketParam, path),
  });
}

async function MarketChrome() {
  await connection();
  const { market } = getCapabilities();
  return <CartSheetMount market={{ id: market.id, currency: market.currency }}><SiteHeader /></CartSheetMount>;
}

function HeaderSkeleton() {
  return <div className="h-[6.25rem] border-b bg-background" aria-hidden="true" />;
}

export default function BlogPage() {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<HeaderSkeleton />}><MarketChrome /></Suspense>
      <main><BlogList posts={blogPosts} /></main>
      <SiteFooter />
    </div>
  );
}
