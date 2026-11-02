"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, Search, ShoppingBag } from "lucide-react";

import { useCartMarket } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { setCartOpen, useCartStore } from "@/modules/cart/lib/cart-store";
import { getMarket, isMarketId } from "@/platform/config/markets";
import { withMarketPrefix } from "@/platform/config/market-path";
import {
  mainNav,
  primaryLinks,
  promoBanner,
  utilityLinks,
  type NavPrimaryItem,
} from "@/modules/content/lib/main-nav";
import { track } from "@/shared/lib/track";
import { Button } from "@e-pig/happy-dog/components/button";

import { MegaPanel } from "./parts/mega-panel";
import { MobileNav } from "./parts/mobile-nav";

function pathIsActive(
  pathname: string,
  href: string,
  marketId: string,
): boolean {
  const prefixed = withMarketPrefix(marketId, href);
  return pathname === prefixed || pathname.startsWith(`${prefixed}/`);
}

export function SiteHeader() {
  const market = useCartMarket();
  const cart = useCartStore(market);
  const count = cart.lines.reduce((total, line) => total + line.quantity, 0);
  const pathname = usePathname() ?? "/";
  const marketMeta = isMarketId(market.id) ? getMarket(market.id) : null;

  const [openMegaId, setOpenMegaId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileDrill, setMobileDrill] = useState<NavPrimaryItem | null>(null);
  const [menuPathname, setMenuPathname] = useState(pathname);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const megaRegionId = useId();

  const homeHref = withMarketPrefix(market.id, "/");

  // 路由变化时在 render 中复位菜单（避免 effect 内同步 setState）
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setOpenMegaId(null);
    setMobileOpen(false);
    setMobileDrill(null);
  }

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpenMegaId(null), 120);
  };

  const openMega = (id: string) => {
    clearCloseTimer();
    setOpenMegaId(id);
  };

  const closeAll = useCallback(() => {
    clearCloseTimer();
    setOpenMegaId(null);
    setMobileOpen(false);
    setMobileDrill(null);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAll();
    };
    const onPointer = (event: MouseEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenMegaId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      clearCloseTimer();
    };
  }, [closeAll]);

  const openItem = mainNav.find((item) => item.id === openMegaId) ?? null;

  return (
    <header ref={headerRef} className="sticky top-0 z-40">
      {/* Utility notice wraps above market controls on small screens; desktop stays one row. */}
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-2 px-4 py-2 text-xs sm:px-6 lg:h-9 lg:flex-row lg:gap-3 lg:px-8 lg:py-0">
          <p className="hidden truncate lg:block lg:max-w-[40%]">
            <span className="text-primary-foreground/80">About</span>
          </p>
          <p
            role="note"
            aria-label="Sandbox shopping notice"
            className="w-full min-w-0 text-center leading-5 lg:w-auto lg:flex-1"
          >
            <span>{promoBanner.text}</span>
            <span className="mx-1.5 text-primary-foreground/50">•</span>
            <a
              href={withMarketPrefix(market.id, promoBanner.href)}
              className="inline-block whitespace-nowrap underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {promoBanner.cta}
            </a>
          </p>
          <div className="flex shrink-0 items-center gap-3">
            {utilityLinks.map((link) => (
              <a
                key={link.label}
                href={withMarketPrefix(market.id, link.href)}
                className="hidden text-primary-foreground/90 hover:text-primary-foreground md:inline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </a>
            ))}
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/25 px-2 py-0.5 font-medium"
              title="Current shopping market"
            >
              <span
                aria-hidden="true"
                className="text-[0.65rem] uppercase tracking-wide"
              >
                {market.id}
              </span>
              <span className="sr-only">Current market</span>
              {marketMeta ? (
                <span>
                  {marketMeta.name} · {marketMeta.currency}
                </span>
              ) : (
                <span>{market.currency}</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Main bar — fixed height; Mega 绝对定位浮层，不推挤页面 */}
      <div
        className="relative border-b bg-background/95 backdrop-blur-xl"
        onMouseLeave={scheduleClose}
      >
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            onClick={() => {
              track("nav_mobile_open", { source: "hamburger" });
              setMobileOpen(true);
            }}
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>

          <Link
            href={homeHref}
            className="font-display text-2xl font-semibold tracking-[-0.03em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            prefetch={false}
          >
            E-pig
          </Link>

          <nav
            className="ml-6 hidden flex-1 items-center gap-1 lg:flex"
            aria-label="Primary"
          >
            {mainNav.map((item) => {
              const href = withMarketPrefix(market.id, item.href);
              const active = pathIsActive(pathname, item.href, market.id);
              const expanded = openMegaId === item.id;
              return (
                <div
                  key={item.id}
                  className="relative"
                  onMouseEnter={() => openMega(item.id)}
                  onFocusCapture={() => openMega(item.id)}
                >
                  <Link
                    href={href}
                    prefetch={false}
                    className={`inline-flex h-10 items-center gap-1 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active || expanded
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-expanded={expanded}
                    aria-controls={megaRegionId}
                    aria-current={active ? "page" : undefined}
                    onClick={() =>
                      track("nav_primary_click", { id: item.id, href })
                    }
                  >
                    {item.label}
                    <ChevronDown className="size-3.5 " aria-hidden="true" />
                  </Link>
                </div>
              );
            })}
            {primaryLinks.map((link) => {
              const href = withMarketPrefix(market.id, link.href);
              const active = pathIsActive(pathname, link.href, market.id);
              return (
                <Link
                  key={link.href}
                  href={href}
                  prefetch={false}
                  className={`inline-flex h-10 items-center rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-current={active ? "page" : undefined}
                  onClick={() =>
                    track("nav_primary_click", { id: link.href, href })
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-0.5">
            <Button asChild variant="ghost" size="icon">
              <Link
                href={withMarketPrefix(market.id, "/search")}
                aria-label="Search products"
              >
                <Search className="size-5" aria-hidden="true" />
              </Link>
            </Button>
            <Link
              href={withMarketPrefix(market.id, "/orders")}
              className="rounded-md px-2 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Orders
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={`Open bag with ${count} items`}
              data-cart-trigger={market.id}
              onClick={(event) => {
                track("cart_icon_click", { count });
                setCartOpen(market, true, event.currentTarget);
              }}
            >
              <ShoppingBag className="size-5" aria-hidden="true" />
              {count ? (
                <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-primary text-[0.6rem] font-semibold text-primary-foreground">
                  {count > 9 ? "9+" : count}
                </span>
              ) : null}
            </Button>
          </div>
        </div>

        {/* 浮层：absolute 不占文档流，页面内容不被推挤且仍可见 */}
        <div
          id={megaRegionId}
          className="pointer-events-none absolute inset-x-0 top-full z-50 hidden lg:block"
          onMouseEnter={clearCloseTimer}
        >
          {openItem ? (
            <div className="pointer-events-auto">
              <MegaPanel
                item={openItem}
                marketId={market.id}
                onNavigate={closeAll}
              />
            </div>
          ) : null}
        </div>
      </div>

      <MobileNav
        open={mobileOpen}
        marketId={market.id}
        drill={mobileDrill}
        onClose={closeAll}
        onDrill={setMobileDrill}
      />
    </header>
  );
}
