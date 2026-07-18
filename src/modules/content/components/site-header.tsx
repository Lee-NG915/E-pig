"use client";

import Link from "next/link";
import { Menu, Search, ShoppingBag } from "lucide-react";

import { setCartOpen, useCartStore } from "@/modules/cart/lib/cart-store";
import { Button } from "@/shared/ui/button";

export function SiteHeader() {
  const cart = useCartStore();
  const count = cart.lines.reduce((total, line) => total + line.quantity, 0);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 lg:hidden">
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu aria-hidden="true" />
          </Button>
        </div>
        <nav className="hidden items-center gap-7 text-sm lg:flex" aria-label="Main navigation">
          <Link href="#collection" className="transition-colors hover:text-muted-foreground">Shop</Link>
          <Link href="#collection" className="transition-colors hover:text-muted-foreground">Rooms</Link>
          <Link href="#about" className="transition-colors hover:text-muted-foreground">Our story</Link>
        </nav>
        <Link href="/" className="absolute left-1/2 -translate-x-1/2 font-display text-2xl font-semibold tracking-[-0.05em]">
          E-pig
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Search demo catalog">
            <Search aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="relative" onClick={() => setCartOpen(true)} aria-label={`Open bag with ${count} items`}>
            <ShoppingBag aria-hidden="true" />
            {count ? (
              <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-primary text-[0.6rem] font-semibold text-primary-foreground">
                {count > 9 ? "9+" : count}
              </span>
            ) : null}
          </Button>
        </div>
      </div>
    </header>
  );
}
