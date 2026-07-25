"use client";

import Link from "next/link";

import { withMarketPrefix } from "@/platform/config/market-path";
import type { NavPrimaryItem } from "@/modules/content/lib/main-nav";
import { track } from "@/shared/lib/track";

export function MegaPanel({
  item,
  marketId,
  onNavigate,
}: {
  item: NavPrimaryItem;
  marketId: string;
  onNavigate: () => void;
}) {
  const shopAll = withMarketPrefix(marketId, item.href);

  return (
    <div
      className="border-b border-t bg-background/95 shadow-lg backdrop-blur-xl"
      role="region"
      aria-label={`${item.label} menu`}
    >
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2">
          {item.groups.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {group.title}
              </p>
              <ul className="mt-3 space-y-2">
                {group.children.map((child) => {
                  const href = withMarketPrefix(marketId, child.href);
                  return (
                    <li key={child.href + child.label}>
                      <Link
                        href={href}
                        prefetch={false}
                        className="text-sm text-foreground transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          track("nav_mega_click", { label: child.label, href });
                          onNavigate();
                        }}
                      >
                        {child.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex min-w-[12rem] flex-col gap-3 border-t pt-6 sm:border-t-0 sm:border-l sm:pl-8 sm:pt-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Featured
          </p>
          <ul className="space-y-2">
            {item.promos.map((promo) => {
              const href = withMarketPrefix(marketId, promo.href);
              return (
                <li key={promo.title}>
                  <Link
                    href={href}
                    prefetch={false}
                    className="text-sm font-medium text-foreground transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      track("nav_mega_click", { label: promo.title, href });
                      onNavigate();
                    }}
                  >
                    {promo.title}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href={shopAll}
            prefetch={false}
            className="mt-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              track("nav_mega_click", { label: "Shop all", href: shopAll });
              onNavigate();
            }}
          >
            Shop all {item.label}
          </Link>
        </div>
      </div>
    </div>
  );
}
