import { Suspense } from "react";

import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, Leaf, PackageCheck, ShieldCheck } from "lucide-react";

import { CartMarketProvider } from "@/modules/cart/components/cart-market-context";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount";
import { ProductCard } from "@/modules/catalog/components/product-card";
import { SiteFooter } from "@/modules/content/components/site-footer";
import { SiteHeader } from "@/modules/content/components/site-header";
import { getCapabilities } from "@/platform/registry";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

// Cache Components 渲染模型（docs/codex/research/07 §2）：
// RootLayout 只输出当前 markets 共有的 base language `en`；region-specific
// market/locale/currency 在下面的 request-time Suspense boundaries 中解析。

const benefits = [
  {
    icon: PackageCheck,
    title: "Easy delivery",
    copy: "Clear delivery estimates and room-of-choice options.",
  },
  {
    icon: ShieldCheck,
    title: "120-night trial",
    copy: "Live with it first. Returns should never feel mysterious.",
  },
  {
    icon: Leaf,
    title: "Considered materials",
    copy: "Durable finishes and fewer, better components by design.",
  },
];

/** request-time 区域：读取当前进程 MARKET，经 registry 取 mock adapter 数据。 */
async function MarketProductGrid() {
  await connection();
  const { catalog, market } = getCapabilities();
  const productList = await catalog.listProducts();

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
        <section className="mx-auto grid max-w-[1440px] gap-4 px-4 pb-4 pt-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
          <div className="flex min-h-[560px] flex-col justify-between rounded-[2rem] bg-primary p-8 text-primary-foreground sm:p-12 lg:min-h-[680px] lg:p-16">
            <div className="flex items-center justify-between gap-4">
              <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">
                New season · 2026
              </Badge>
              <span className="text-xs uppercase tracking-[0.22em] text-white/60">
                E-pig studio
              </span>
            </div>
            <div className="max-w-xl py-14">
              <p className="mb-5 text-sm uppercase tracking-[0.28em] text-white/65">
                Make room for living
              </p>
              <h1 className="font-display text-6xl leading-[0.94] tracking-[-0.045em] sm:text-7xl lg:text-[6.7rem]">
                Furniture for slower days.
              </h1>
              <p className="mt-7 max-w-lg text-base leading-7 text-white/72 sm:text-lg">
                Soft landings, honest materials and modular pieces designed for the way home
                actually feels.
              </p>
              <Button asChild size="lg" variant="secondary" className="mt-9 rounded-full px-7">
                <Link href="#collection">
                  Shop the collection
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <p className="max-w-sm text-sm leading-6 text-white/55">
              Frontend demo · mock adapter · no backend services connected
            </p>
          </div>

          <div className="group relative min-h-[560px] overflow-hidden rounded-[2rem] bg-secondary lg:min-h-[680px]">
            <Image
              src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1800&q=88"
              alt="A warm green sofa in a quiet living room"
              fill
              priority
              sizes="(min-width: 1024px) 54vw, 100vw"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.015]"
            />
            <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4 rounded-2xl bg-background/90 p-5 shadow-sm backdrop-blur-md sm:inset-x-8 sm:bottom-8 sm:p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  The Alto modular
                </p>
                <p className="mt-1 font-display text-2xl tracking-tight">Made to move with you</p>
              </div>
              <Link
                href="#collection"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
                aria-label="View the collection"
              >
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section
          className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
          id="collection"
        >
          <Suspense fallback={<ProductGridSkeleton />}>
            <MarketProductGrid />
          </Suspense>
        </section>

        <section className="bg-secondary/65">
          <div className="mx-auto grid max-w-[1440px] gap-12 px-6 py-20 md:grid-cols-3 lg:px-8 lg:py-24">
            {benefits.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="max-w-sm">
                <div className="grid size-11 place-items-center rounded-full border bg-background">
                  <Icon className="size-5" strokeWidth={1.7} aria-hidden="true" />
                </div>
                <h3 className="mt-5 font-display text-2xl">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-[1440px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="relative min-h-[480px] overflow-hidden rounded-[2rem] lg:min-h-[620px]">
            <Image
              src="https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1500&q=88"
              alt="A calm bedroom with natural timber furniture"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="flex min-h-[480px] flex-col justify-center rounded-[2rem] bg-accent p-8 sm:p-12 lg:min-h-[620px] lg:p-20">
            <p className="text-xs uppercase tracking-[0.24em] text-accent-foreground/65">
              A quieter kind of comfort
            </p>
            <h2 className="mt-5 max-w-xl font-display text-5xl leading-[1.02] tracking-[-0.04em] sm:text-6xl">
              Designed to be lived in, not looked after.
            </h2>
            <p className="mt-6 max-w-lg leading-7 text-accent-foreground/70">
              Removable covers, forgiving finishes and flexible modules. Beautiful furniture should
              make home easier.
            </p>
            <Button
              variant="outline"
              size="lg"
              className="mt-9 w-fit rounded-full border-foreground/25 bg-transparent"
              asChild
            >
              <Link href="#about">
                Our design approach
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
