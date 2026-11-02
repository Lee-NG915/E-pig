"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isMarketId } from "@/platform/config/markets";
import { withMarketPrefix } from "@/platform/config/market-path";
const groups = [
  { title: "Shop", links: [["Sofas", "/collections/sofas"], ["Bedroom", "/collections/bedroom"], ["Outdoor", "/collections/outdoor"], ["Search", "/search"]] },
  { title: "Help", links: [["Sandbox payment", "/help/payment"], ["Delivery", "/help/shipping"], ["Returns", "/help/returns"], ["Contact", "/help/contact"]] },
  { title: "About", links: [["Journal", "/blog"], ["Orders", "/orders"], ["Privacy", "/help/privacy"], ["Terms", "/help/terms"]] },
];
function FooterContent() {
  const segment = (usePathname() ?? "/au").split("/")[1];
  const marketId = isMarketId(segment) ? segment : "au";
  return <footer className="mt-4 bg-primary text-primary-foreground" id="about">
    <div className="mx-auto max-w-[1440px] px-6 py-16 lg:px-8 lg:py-20">
      <div className="grid gap-14 lg:grid-cols-[1.3fr_1fr]">
        <div><p className="font-display text-5xl tracking-[-0.03em] sm:text-6xl">E-pig</p><p className="mt-5 max-w-md leading-7">Explore furniture and try a sandbox checkout. Test orders do not charge real money or arrange delivery.</p></div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">{groups.map(group => <div key={group.title}><p className="font-medium">{group.title}</p><ul className="mt-5 space-y-3 text-sm">{group.links.map(([label, href]) => <li key={label}><Link href={withMarketPrefix(marketId, href)} className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}</Link></li>)}</ul></div>)}</div>
      </div><div className="mt-16 border-t border-primary-foreground/30 pt-6 text-xs"><p>© 2026 E-pig sandbox store.</p></div>
    </div>
  </footer>;
}

export function SiteFooter() { return <Suspense fallback={<div className="h-64 bg-primary" aria-hidden="true" />}><FooterContent /></Suspense>; }
