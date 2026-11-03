"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Columns2, X } from "lucide-react";
import { Button } from "@e-pig/happy-dog/components/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@e-pig/happy-dog/components/sheet";
import { getMarket, type MarketId } from "@/platform/config/markets";
import { useCartDrawerOpen } from "@/modules/cart/lib/cart-store";
import { useComparisonDetails } from "../../hooks/use-comparison-details";
import { MAX_COMPARE_ITEMS } from "../../lib/compare-query";
import { removeCompareItem, useCompareSelection } from "../../lib/compare-store";
import { dismissComparisonFeedback, useComparisonFeedback } from "./comparison-feedback";

export function ComparisonDock({ marketId }: { marketId: MarketId }) {
  const pathname = usePathname();
  const cartOpen = useCartDrawerOpen(getMarket(marketId));
  const section = pathname?.split("/")[2];
  // Unmounting closes the comparison overlay, including when a delayed add-to-bag succeeds.
  if (cartOpen || ["cart", "checkout", "order", "orders", "compare"].includes(section ?? "")) return null;
  return <ComparisonDockContent key={pathname} marketId={marketId} abovePurchaseBar={section === "products"} />;
}

function ComparisonDockContent({ marketId, abovePurchaseBar }: { marketId: MarketId; abovePurchaseBar: boolean }) {
  const { items, hydrated } = useCompareSelection(marketId);
  const feedback = useComparisonFeedback(marketId);
  const [open, setOpen] = useState(false);
  const [pauseFeedback, setPauseFeedback] = useState(false);
  const details = useComparisonDetails(marketId, items, open && hydrated);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const returnProductId = useRef<string | undefined>(undefined);

  function changeOpen(next: boolean) {
    if (next) returnProductId.current = items[0]?.productId;
    setOpen(next);
  }

  useEffect(() => {
    if (!feedback || pauseFeedback) return;
    const timer = window.setTimeout(() => dismissComparisonFeedback(marketId), 6000);
    return () => window.clearTimeout(timer);
  }, [feedback, marketId, pauseFeedback]);

  function remove(productId: string, index: number) {
    removeCompareItem(marketId, productId);
    // Keep keyboard users in the list when the focused remove button disappears.
    window.setTimeout(() => {
      const buttons = list.current?.querySelectorAll<HTMLButtonElement>("[data-comparison-remove]");
      const next = buttons?.[Math.min(index, buttons.length - 1)] ?? continueButton.current;
      next?.focus();
    }, 0);
  }

  if (!hydrated || (!items.length && !open && !feedback)) return null;
  const browseHref = `/${marketId}`;

  return <Sheet open={open} onOpenChange={changeOpen}>
    <div data-comparison-dock className={`fixed right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:right-6 ${abovePurchaseBar ? "bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-[max(5rem,env(safe-area-inset-bottom))]" : "bottom-[max(5rem,env(safe-area-inset-bottom))]"}`}>
      {feedback && !open ? <div className="w-80 max-w-full rounded-xl border bg-background p-4 shadow-lg"
        onMouseEnter={() => setPauseFeedback(true)} onMouseLeave={() => setPauseFeedback(false)}
        onFocusCapture={() => setPauseFeedback(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPauseFeedback(false); }}>
        <div className="flex items-start gap-2"><p role="status" className="min-w-0 flex-1 text-sm leading-6">{feedback.message}</p>
          <Button type="button" size="icon" variant="ghost" className="-mr-2 -mt-2 shrink-0" aria-label="Dismiss comparison message" onClick={() => dismissComparisonFeedback(marketId)}><X aria-hidden="true" /></Button>
        </div>
        <Button type="button" variant="link" className="-ml-3 mt-1" onClick={() => { dismissComparisonFeedback(marketId); changeOpen(true); }}>View your list<ArrowRight aria-hidden="true" /></Button>
      </div> : null}
      {items.length || open ? <SheetTrigger asChild><Button ref={trigger} type="button" size="lg" className="relative size-12 gap-3 px-0 shadow-lg has-[>svg]:px-0 sm:h-12 sm:w-auto sm:px-4 sm:has-[>svg]:px-4" aria-label={`Open comparison list, ${items.length} ${items.length === 1 ? "product" : "products"}`}>
        <Columns2 aria-hidden="true" /><span className="hidden sm:inline">Compare</span><span aria-hidden="true" className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-primary bg-primary-foreground text-xs text-primary sm:static sm:size-6 sm:border-0">{items.length}</span>
      </Button></SheetTrigger> : null}
    </div>
    <SheetContent onOpenAutoFocus={event => { event.preventDefault(); title.current?.focus(); }} onCloseAutoFocus={event => {
      event.preventDefault();
      // When the bag opens, its focus trap takes over; never steal focus from it.
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
      else if (!items.length && !document.querySelector('[role="dialog"]')) {
        const productButton = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-compare-product]")).find(button => button.dataset.compareProduct === returnProductId.current && button.dataset.compareMarket === marketId);
        if (productButton) productButton.focus({ preventScroll: true });
        else {
          const heading = document.querySelector<HTMLElement>("main h1");
          if (heading) {
            const hadTabIndex = heading.hasAttribute("tabindex");
            if (!hadTabIndex) { heading.tabIndex = -1; heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true }); }
            heading.focus({ preventScroll: true });
          }
        }
      }
    }}>
      <SheetHeader><SheetTitle ref={title} tabIndex={-1} className="outline-none">Your comparison ({items.length})</SheetTitle><SheetDescription>
        {items.length < MAX_COMPARE_ITEMS ? `Keep browsing and add up to ${MAX_COMPARE_ITEMS} products.` : "Your list is full. Remove a product to make room for another."}
      </SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
        {details.isError ? <div role="alert" className="my-4 rounded-lg border p-4 text-sm"><p>We couldn’t load your comparison. Your selected products are still in the list.</p><Button variant="outline" className="mt-3" onClick={() => void details.refetch()}>Try again</Button></div> : null}
        {!items.length ? <div className="py-12 text-center"><Columns2 className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" /><h3 className="font-medium">Your comparison list is empty</h3><p className="mt-2 text-sm text-muted-foreground">Add products as you browse to see them side by side.</p></div> : <ul ref={list} aria-label="Products in your comparison" aria-busy={details.isFetching} className="divide-y">
          {items.map((item, index) => {
            const entry = details.data?.entries.find(candidate => candidate.item.productId === item.productId && (!item.variantId || candidate.item.variantId === item.variantId));
            const name = entry?.product?.name ?? (entry?.error ? "Unavailable product" : `Product ${index + 1}`);
            const product = entry?.product;
            const href = product ? `/${marketId}/products/${product.slug}${item.variantId ? `?variant=${encodeURIComponent(item.variantId)}` : ""}` : undefined;
            return <li key={item.productId} className="flex items-start gap-4 py-5">
              <div className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg bg-secondary">{product ? <Image src={entry?.variant?.image ?? product.image} alt="" fill sizes="80px" className="object-cover" /> : <Columns2 className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden="true" />}</div>
              <div className="min-w-0 flex-1"><h3 className="text-sm font-medium leading-6">{href ? <Link href={href} onClick={() => setOpen(false)} className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{name}</Link> : name}</h3>
                {entry?.variant ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{entry.variant.label}</p> : null}
                {entry?.error ? <p className="mt-1 text-xs leading-5 text-destructive">{entry.error}</p> : !entry && !details.isError ? <p className="mt-1 text-xs text-muted-foreground">Loading product…</p> : null}
              </div>
              <Button type="button" variant="ghost" size="icon" className="-mr-2 shrink-0" data-comparison-remove aria-label={`Remove ${name} from comparison`} onClick={() => remove(item.productId, index)}><X aria-hidden="true" /></Button>
            </li>;
          })}
        </ul>}
      </div>
      <div className="border-t px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {items.length === 1 ? <p className="mb-3 text-sm text-muted-foreground">Add one more product for a side-by-side comparison.</p> : null}
        {items.length ? <Button asChild size="lg" className="w-full"><Link href={`/${marketId}/compare`} onClick={() => { dismissComparisonFeedback(marketId); setOpen(false); }}>Compare {items.length} {items.length === 1 ? "product" : "products"}<ArrowRight aria-hidden="true" /></Link></Button> : <Button asChild size="lg" className="w-full"><Link href={browseHref} onClick={() => setOpen(false)}>Browse products</Link></Button>}
        <Button ref={continueButton} type="button" variant="ghost" className="mt-2 w-full min-h-11" onClick={() => setOpen(false)}>Continue browsing</Button>
      </div>
    </SheetContent>
  </Sheet>;
}
