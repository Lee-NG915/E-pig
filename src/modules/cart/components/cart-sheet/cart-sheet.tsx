"use client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@e-pig/happy-dog/components/sheet";
import {
  restoreCartFocus,
  setCartOpen,
  useCartStore,
} from "../../lib/cart-store";
import { useCartMarket } from "../cart-market-context/cart-market-context";
import { CartPanel } from "../cart-panel/cart-panel";
export function CartSheet() {
  const market = useCartMarket();
  const cart = useCartStore(market);
  return (
    <Sheet open={cart.open} onOpenChange={(open) => setCartOpen(market, open)}>
      <SheetContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreCartFocus(market);
        }}
      >
        <SheetHeader>
          <SheetTitle>Your bag</SheetTitle>
          <SheetDescription>
            Current prices and options, confirmed by the shopping service.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <CartPanel market={market} compact />
        </div>
      </SheetContent>
    </Sheet>
  );
}
