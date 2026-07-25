"use client";

import Image from "next/image";
import Link from "next/link";

import { withMarketPrefix } from "@/platform/config/market-path";
import { mainNav } from "@/modules/content/lib/main-nav";
import { track } from "@/shared/lib/track";

export function HomeCategories({ marketId }: { marketId: string }) {
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-labelledby="home-categories-heading">
      <div className="mb-10 max-w-2xl">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Shop by room</p>
        <h2 id="home-categories-heading" className="mt-3 font-display text-3xl tracking-[-0.03em] sm:text-4xl">
          Find your next piece by space.
        </h2>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {mainNav.map((item) => {
          const href = withMarketPrefix(marketId, item.href);
          const promo = item.promos[0];
          return (
            <li key={item.id}>
              <Link
                href={href}
                prefetch={false}
                className="group relative block overflow-hidden rounded-2xl bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => track("home_category_click", { id: item.id, href })}
              >
                <div className="relative aspect-[4/5]">
                  {promo ? (
                    <Image
                      src={promo.image}
                      alt={promo.imageAlt}
                      fill
                      loading="lazy"
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/55 to-transparent" />
                  <p className="absolute inset-x-0 bottom-0 p-5 font-display text-2xl text-white">
                    {item.label}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
