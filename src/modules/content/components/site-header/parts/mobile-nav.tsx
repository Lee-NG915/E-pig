"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { withMarketPrefix } from "@/platform/config/market-path";
import { getMarket, isMarketId } from "@/platform/config/markets";
import { mainNav, primaryLinks, promoBanner, utilityLinks, type NavPrimaryItem } from "@/modules/content/lib/main-nav";
import { track } from "@/shared/lib/track";
import { Button } from "@e-pig/happy-dog/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@e-pig/happy-dog/components/sheet";

type MobileNavProps = {
  open: boolean;
  marketId: string;
  drill: NavPrimaryItem | null;
  onClose: () => void;
  onDrill: (item: NavPrimaryItem | null) => void;
};

export function MobileNav({ open, marketId, drill, onClose, onDrill }: MobileNavProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const browsingRef = useRef<HTMLElement | null>(null);
  const drillHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const previousDrillRef = useRef(drill);
  const pathname = usePathname();
  const marketLabel = isMarketId(marketId) ? getMarket(marketId).name : marketId.toUpperCase();
  const linkClass = "block rounded-lg px-3 py-3 text-base hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-muted aria-[current=page]:font-semibold";
  const isCurrent = (href: string) => pathname === withMarketPrefix(marketId, href);

  useEffect(() => {
    const previousDrill = previousDrillRef.current;
    previousDrillRef.current = drill;
    if (!open || previousDrill === drill) return;
    if (drill) {
      drillHeadingRef.current?.focus();
    } else if (previousDrill) {
      browsingRef.current?.querySelector<HTMLButtonElement>(`[data-category="${previousDrill.id}"]`)?.focus();
    }
  }, [open, drill]);

  useEffect(() => {
    if (!open || !window.matchMedia) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) onClose();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [open, onClose]);

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent
        className="left-0 right-auto w-full max-w-sm border-l-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left motion-reduce:animate-none"
        onOpenAutoFocus={() => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="text-foreground/75">Shopping in {marketLabel}</SheetDescription>
          {drill ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 px-2"
              onClick={() => onDrill(null)}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Button>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5">
          {!drill ? (
            <nav ref={browsingRef} aria-label="Browse furniture">
              <h3 className="px-3 pb-2 text-sm font-medium text-foreground/75">Shop furniture</h3>
              <ul className="space-y-1">
              {mainNav.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-category={item.id}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-base font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      track("nav_mobile_open", { id: item.id });
                      onDrill(item);
                    }}
                  >
                    {item.label}
                    <span aria-hidden="true" className="text-muted-foreground">
                      ›
                    </span>
                  </button>
                </li>
              ))}
              </ul>
              <h3 className="mt-6 border-t px-3 pb-2 pt-5 text-sm font-medium text-foreground/75">More to explore</h3>
              <ul>
                {primaryLinks.map((link) => {
                const href = withMarketPrefix(marketId, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={href}
                      prefetch={false}
                      className={linkClass}
                      aria-current={isCurrent(link.href) ? "page" : undefined}
                      onClick={() => {
                        track("nav_primary_click", { id: link.href, href });
                        onClose();
                      }}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
                })}
              </ul>
            </nav>
          ) : (
            <nav className="space-y-6" aria-label={`${drill.label} collections`}>
              <h3 ref={drillHeadingRef} tabIndex={-1} className="px-3 font-display text-2xl outline-none">
                {drill.label}
              </h3>
              <Link
                href={withMarketPrefix(marketId, drill.href)}
                prefetch={false}
                className={`${linkClass} underline underline-offset-4`}
                aria-current={isCurrent(drill.href) ? "page" : undefined}
                onClick={onClose}
              >
                Shop all {drill.label}
              </Link>
              {drill.groups.map((group) => (
                <div key={group.title}>
                  <h4 className="px-3 text-sm font-medium text-foreground/75">
                    {group.title}
                  </h4>
                  <ul className="mt-2 space-y-1">
                    {group.children.map((child) => {
                      const href = withMarketPrefix(marketId, child.href);
                      return (
                        <li key={child.label + href}>
                          <Link
                            href={href}
                            prefetch={false}
                            className={linkClass}
                            aria-current={isCurrent(child.href) ? "page" : undefined}
                            onClick={onClose}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </div>
        <div className="shrink-0 border-t px-6 py-5">
          <nav className="flex flex-wrap gap-x-6 gap-y-3" aria-label="Help and information">
            {utilityLinks.map((link) => (
              <Link
                key={link.href}
                href={withMarketPrefix(marketId, link.href)}
                prefetch={false}
                className="text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-current={isCurrent(link.href) ? "page" : undefined}
                onClick={onClose}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="mt-4 text-xs leading-5 text-foreground/80">{promoBanner.text}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
