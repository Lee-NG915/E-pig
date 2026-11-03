"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { withMarketPrefix } from "@/platform/config/market-path";
import { mainNav } from "@/modules/content/lib/main-nav";
import { track } from "@/shared/lib/track";

export function HomeCategories({ marketId }: { marketId: string }) {
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 lg:px-8 lg:py-20" aria-labelledby="home-categories-heading">
      <div className="mb-6 max-w-2xl sm:mb-8">
        <h2 id="home-categories-heading" className="text-balance font-display text-3xl tracking-[-0.03em] sm:text-4xl">
          Find your next piece by space.
        </h2>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6">
        {mainNav.map((item) => {
          const href = withMarketPrefix(marketId, item.href);
          const promo = item.promos[0];
          const headingId = `home-category-${marketId}-${item.id}`;
          return (
            <li key={item.id}>
              <Link
                href={href}
                prefetch={false}
                aria-labelledby={headingId}
                className="group block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                onClick={() => track("home_category_click", { id: item.id, href })}
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-secondary sm:aspect-square lg:aspect-[4/5]">
                  {promo ? (
                    <Image
                      src={promo.image}
                      alt={promo.imageAlt}
                      fill
                      loading="lazy"
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none"
                    />
                  ) : null}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <h3 id={headingId} className="min-w-0 text-base font-medium sm:text-lg">{item.label}</h3>
                  <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-primary" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
