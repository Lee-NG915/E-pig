"use client";

import Image from "next/image";
import { Minus, Plus, ShoppingBag } from "lucide-react";

import { setCartOpen, setQuantity, useCartStore } from "@/modules/cart/lib/cart-store";
import { useCartMarket } from "../cart-market-context/cart-market-context";
import { formatPrice } from "@/shared/lib/money";
import { Button } from "@e-pig/happy-dog/components/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@e-pig/happy-dog/components/sheet";

export function CartSheet() {
  const market = useCartMarket();
  const cart = useCartStore(market);
  const subtotal = cart.lines.reduce(
    (total, line) => total + line.priceAmount * line.quantity,
    0,
  );

  return (
    <Sheet open={cart.open} onOpenChange={(open) => setCartOpen(market, open)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Your bag</SheetTitle>
          <SheetDescription>
            {cart.lines.length
              ? "Saved locally in this browser for the frontend demo."
              : "Your space is waiting."}
          </SheetDescription>
        </SheetHeader>

        {cart.lines.length ? (
          <>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              {cart.lines.map((line) => (
                <div className="flex gap-4" key={line.productId}>
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-secondary">
                    <Image src={line.image} alt="" fill sizes="96px" className="object-cover" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                    <div>
                      <p className="font-medium">{line.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{line.colour}</p>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div className="flex items-center rounded-full border bg-background">
                        <button
                          className="grid size-8 place-items-center rounded-full hover:bg-muted"
                          onClick={() => setQuantity(market, line.productId, line.quantity - 1)}
                          aria-label={`Decrease ${line.name} quantity`}
                        >
                          <Minus className="size-3.5" aria-hidden="true" />
                        </button>
                        <span className="w-7 text-center text-sm tabular-nums">{line.quantity}</span>
                        <button
                          className="grid size-8 place-items-center rounded-full hover:bg-muted"
                          onClick={() => setQuantity(market, line.productId, line.quantity + 1)}
                          aria-label={`Increase ${line.name} quantity`}
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      <p className="text-sm font-medium">
                        {formatPrice(
                          { amount: line.priceAmount * line.quantity, currency: line.priceCurrency },
                          market.locale,
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t bg-card p-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Subtotal</span>
                <span className="font-medium">
                  {formatPrice(
                    { amount: subtotal, currency: market.currency },
                    market.locale,
                  )}
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Delivery and taxes would be calculated by a future backend.
              </p>
              <Button className="mt-5 h-12 w-full rounded-full" disabled>
                Checkout requires backend
              </Button>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center px-8 text-center">
            <div>
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-secondary">
                <ShoppingBag className="size-6" strokeWidth={1.6} aria-hidden="true" />
              </div>
              <p className="mt-5 font-display text-2xl">Nothing in your bag yet</p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
                Add a piece from the collection to test the local cart interaction.
              </p>
              <Button
                variant="outline"
                className="mt-5 rounded-full"
                onClick={() => setCartOpen(market, false)}
              >
                Keep browsing
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
